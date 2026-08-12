import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const DEFAULT_ISSUER = "https://id.a3t.dev/";
const DEFAULT_CLIENT_ID = "a3t-hub";
const STATE_FILENAME = "state.json";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const STATE_LOCK_TIMEOUT_MS = 10_000;
const STATE_LOCK_RETRY_MS = 25;
const STATE_LOCK_STALE_MS = 60_000;
const execFileAsync = promisify(execFile);

export type FetchLike = typeof fetch;

interface DiscoveryDocument {
  issuer: string;
  device_authorization_endpoint: string;
  token_endpoint: string;
}

interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface PendingDeviceLogin {
  issuer: string;
  clientId: string;
  tokenEndpoint: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresAt: number;
  intervalSeconds: number;
}

export interface StoredAuth {
  issuer: string;
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;
  scope: string;
}

export interface CliState {
  version: 1;
  auth?: StoredAuth;
  activeProject?: string;
}

export interface PublicStatus {
  authenticated: boolean;
  issuer: string | null;
  expiresAt: string | null;
  project: string | null;
}

export interface DeviceLoginOptions {
  issuer?: string;
  clientId?: string;
  fetch?: FetchLike;
}

export interface PollOptions {
  stateDir?: string;
  fetch?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

export function defaultStateDir(): string {
  const configured = process.env.A3T_HOME;
  return configured ? resolve(configured) : join(homedir(), ".a3t");
}

function normalizedHttpsURL(value: string, label: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  parsed.hash = "";
  return parsed;
}

function discoveryURLForIssuer(issuer: URL): URL {
  const issuerPath = issuer.pathname.replace(/^\/+|\/+$/g, "");
  const discoveryPath = issuerPath
    ? `/.well-known/openid-configuration/${issuerPath}`
    : "/.well-known/openid-configuration";
  return new URL(discoveryPath, issuer.origin);
}

function normalizedInterval(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("device authorization returned an invalid polling interval");
  }
  return Math.max(1, Math.min(value, 60));
}

function sameOriginEndpoint(value: string, issuer: URL, label: string): string {
  const endpoint = normalizedHttpsURL(value, label);
  if (endpoint.origin !== issuer.origin) {
    throw new Error(`${label} must use the issuer origin`);
  }
  return endpoint.toString();
}

async function jsonResponse<T>(response: Response, label: string): Promise<T> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES) throw new Error(`${label} response is too large`);
  if (response.body === null) throw new Error(`${label} returned an empty body`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(`${label} response is too large`);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

function requestSignal(deadline = Date.now() + REQUEST_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(Math.max(1, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now())));
}

export async function beginDeviceLogin(options: DeviceLoginOptions = {}): Promise<PendingDeviceLogin> {
  const fetcher = options.fetch ?? fetch;
  const issuer = normalizedHttpsURL(options.issuer ?? process.env.A3T_ISSUER ?? DEFAULT_ISSUER, "issuer");
  const discoveryURL = discoveryURLForIssuer(issuer);
  if (!issuer.pathname.endsWith("/")) issuer.pathname += "/";
  const clientId = options.clientId ?? process.env.A3T_CLIENT_ID ?? DEFAULT_CLIENT_ID;
  if (!/^[A-Za-z0-9._~-]{1,128}$/.test(clientId)) throw new Error("invalid OAuth client id");
  const discoveryResponse = await fetcher(discoveryURL, {
    redirect: "error",
    signal: requestSignal(),
    headers: { accept: "application/json" },
  });
  if (!discoveryResponse.ok) throw new Error(`identity discovery failed (${discoveryResponse.status})`);
  const discovery = await jsonResponse<DiscoveryDocument>(discoveryResponse, "identity discovery");
  const discoveredIssuer = normalizedHttpsURL(discovery.issuer, "discovered issuer");
  if (!discoveredIssuer.pathname.endsWith("/")) discoveredIssuer.pathname += "/";
  if (discoveredIssuer.toString() !== issuer.toString()) throw new Error("identity discovery issuer mismatch");
  const deviceEndpoint = sameOriginEndpoint(discovery.device_authorization_endpoint, issuer, "device authorization endpoint");
  const tokenEndpoint = sameOriginEndpoint(discovery.token_endpoint, issuer, "token endpoint");

  const body = new URLSearchParams({ client_id: clientId, scope: "openid offline" });
  const deviceResponse = await fetcher(deviceEndpoint, {
    method: "POST",
    redirect: "error",
    signal: requestSignal(),
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!deviceResponse.ok) throw new Error(`device authorization failed (${deviceResponse.status})`);
  const device = await jsonResponse<DeviceAuthorizationResponse>(deviceResponse, "device authorization");
  if (!device.device_code || !device.user_code || !device.verification_uri || !Number.isFinite(device.expires_in)) {
    throw new Error("device authorization returned an incomplete response");
  }
  const verificationUri = sameOriginEndpoint(device.verification_uri, issuer, "verification URI");
  const verificationUriComplete = device.verification_uri_complete === undefined
    ? undefined
    : sameOriginEndpoint(device.verification_uri_complete, issuer, "complete verification URI");
  const expiresIn = Math.max(1, Math.min(device.expires_in, 3600));
  const interval = normalizedInterval(device.interval ?? 5);
  return {
    issuer: issuer.toString(),
    clientId,
    tokenEndpoint,
    deviceCode: device.device_code,
    userCode: device.user_code,
    verificationUri,
    ...(verificationUriComplete === undefined ? {} : { verificationUriComplete }),
    expiresAt: Date.now() + expiresIn * 1000,
    intervalSeconds: interval,
  };
}

export async function pollDeviceLogin(pending: PendingDeviceLogin, options: PollOptions = {}): Promise<StoredAuth> {
  const fetcher = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds)));
  const now = options.now ?? Date.now;
  let interval = normalizedInterval(pending.intervalSeconds);

  while (now() < pending.expiresAt) {
    const body = new URLSearchParams({
      grant_type: DEVICE_GRANT,
      client_id: pending.clientId,
      device_code: pending.deviceCode,
    });
    const response = await fetcher(pending.tokenEndpoint, {
      method: "POST",
      redirect: "error",
      signal: requestSignal(pending.expiresAt),
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await jsonResponse<TokenResponse | { error?: string }>(response, "token endpoint");
    if (response.ok) {
      const token = payload as TokenResponse;
      if (!token.access_token || !token.token_type || !Number.isFinite(token.expires_in)) {
        throw new Error("token endpoint returned an incomplete response");
      }
      const auth: StoredAuth = {
        issuer: pending.issuer,
        clientId: pending.clientId,
        accessToken: token.access_token,
        ...(token.refresh_token === undefined ? {} : { refreshToken: token.refresh_token }),
        tokenType: token.token_type,
        expiresAt: now() + Math.max(1, token.expires_in) * 1000,
        scope: token.scope ?? "",
      };
      await updateState(options.stateDir, (current) => ({ ...current, auth }));
      return auth;
    }
    const error = "error" in payload ? payload.error : undefined;
    if (error === "authorization_pending") {
      await sleep(interval * 1000);
      continue;
    }
    if (error === "slow_down") {
      interval = Math.min(interval + 5, 60);
      await sleep(interval * 1000);
      continue;
    }
    if (error === "access_denied") throw new Error("login was denied");
    if (error === "expired_token") throw new Error("login code expired");
    throw new Error(`token exchange failed (${response.status})`);
  }
  throw new Error("login code expired");
}

function statePath(stateDir = defaultStateDir()): string {
  return join(resolve(stateDir), STATE_FILENAME);
}

function emptyState(): CliState {
  return { version: 1 };
}

export async function loadState(stateDir = defaultStateDir()): Promise<CliState> {
  try {
    const path = statePath(stateDir);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("a3t state must be a regular file");
    if ((info.mode & 0o077) !== 0) throw new Error("a3t state file permissions must be 0600");
    if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
      throw new Error("a3t state file must be owned by the current user");
    }
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<CliState>;
    if (parsed.version !== 1) throw new Error("unsupported state version");
    return parsed as CliState;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyState();
    if (error instanceof SyntaxError) throw new Error("a3t state is invalid JSON");
    throw error;
  }
}

async function ensureStateDirectory(stateDir: string): Promise<string> {
  const path = statePath(stateDir);
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw new Error("a3t state directory must be a regular directory");
  }
  await chmod(directory, 0o700);
  return path;
}

async function writeState(state: CliState, stateDir = defaultStateDir()): Promise<void> {
  const path = await ensureStateDirectory(stateDir);
  const directory = dirname(path);
  try {
    const existing = await lstat(path);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("a3t state must be a regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
    await chmod(path, 0o600);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function processInstanceIdentity(pid: number): Promise<string | undefined> {
  if (process.platform === "linux") {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/);
      return fields[19];
    } catch {
      return undefined;
    }
  }
  if (process.platform === "darwin") {
    try {
      const result = await execFileAsync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" });
      const identity = result.stdout.trim();
      return identity || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function lockIsStale(lockPath: string): Promise<boolean> {
  let info;
  try {
    info = await lstat(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("a3t state lock must be a regular directory");
  }

  let createdAt = info.mtimeMs;
  let pid: number | undefined;
  let instanceIdentity: string | undefined;
  try {
    const parsed: unknown = JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8"));
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const owner = parsed as { pid?: unknown; createdAt?: unknown; instanceIdentity?: unknown };
      if (typeof owner.createdAt === "number" && Number.isFinite(owner.createdAt)) createdAt = owner.createdAt;
      if (typeof owner.pid === "number" && Number.isInteger(owner.pid) && owner.pid > 0) pid = owner.pid;
      if (typeof owner.instanceIdentity === "string" && owner.instanceIdentity !== "") {
        instanceIdentity = owner.instanceIdentity;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  if (Date.now() - createdAt < STATE_LOCK_STALE_MS) return false;
  if (pid !== undefined) {
    const liveIdentity = await processInstanceIdentity(pid);
    if (liveIdentity !== undefined && instanceIdentity !== undefined) {
      if (liveIdentity === instanceIdentity) return false;
    } else if (processIsAlive(pid)) {
      return false;
    }
  }
  return true;
}

async function reclaimStaleLock(lockPath: string): Promise<boolean> {
  const recoveryPath = `${lockPath}.recovery`;
  try {
    await mkdir(recoveryPath, { mode: 0o700 });
    try {
      const instanceIdentity = await processInstanceIdentity(process.pid);
      await writeFile(join(recoveryPath, "owner.json"), JSON.stringify({
        pid: process.pid,
        createdAt: Date.now(),
        ...(instanceIdentity === undefined ? {} : { instanceIdentity }),
      }), { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      await rm(recoveryPath, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await lockIsStale(recoveryPath)) {
      const quarantine = `${recoveryPath}.stale-${process.pid}-${Date.now()}`;
      try {
        await rename(recoveryPath, quarantine);
        await rm(quarantine, { recursive: true, force: true });
      } catch (recoveryError) {
        if ((recoveryError as NodeJS.ErrnoException).code !== "ENOENT") throw recoveryError;
      }
    }
    return false;
  }

  try {
    // The recovery lease serializes the stale check and quarantine rename.
    if (!(await lockIsStale(lockPath))) return false;
    const quarantine = `${lockPath}.stale-${process.pid}-${Date.now()}`;
    try {
      await rename(lockPath, quarantine);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT";
    }
    await rm(quarantine, { recursive: true, force: true });
    return true;
  } finally {
    await rm(recoveryPath, { recursive: true, force: true });
  }
}

async function updateState(
  stateDir = defaultStateDir(),
  update: (state: CliState) => CliState | Promise<CliState>,
): Promise<CliState> {
  const path = await ensureStateDirectory(stateDir);
  const lockPath = `${path}.lock`;
  const deadline = Date.now() + STATE_LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      try {
        const instanceIdentity = await processInstanceIdentity(process.pid);
        await writeFile(join(lockPath, "owner.json"), JSON.stringify({
          pid: process.pid,
          createdAt: Date.now(),
          ...(instanceIdentity === undefined ? {} : { instanceIdentity }),
        }), {
          encoding: "utf8",
          mode: 0o600,
        });
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw error;
      await reclaimStaleLock(lockPath);
      await new Promise<void>((done) => setTimeout(done, STATE_LOCK_RETRY_MS));
    }
  }
  try {
    const current = await loadState(stateDir);
    const next = await update(current);
    await writeState(next, stateDir);
    return next;
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

export async function saveActiveProject(project: string, stateDir = defaultStateDir()): Promise<void> {
  const id = normalizedHttpsURL(project, "project id").toString();
  await updateState(stateDir, (state) => ({ ...state, activeProject: id }));
}

export function statusFromState(state: CliState, now = Date.now()): PublicStatus {
  const authenticated = state.auth !== undefined && state.auth.expiresAt > now;
  return {
    authenticated,
    issuer: state.auth?.issuer ?? null,
    expiresAt: state.auth === undefined ? null : new Date(state.auth.expiresAt).toISOString(),
    project: state.activeProject ?? null,
  };
}
