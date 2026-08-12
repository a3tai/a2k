import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const DEFAULT_ISSUER = "https://id.a3t.dev/";
const DEFAULT_CLIENT_ID = "a3t-hub";
const STATE_FILENAME = "state.json";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const MAX_RESPONSE_BYTES = 64 * 1024;

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
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} response is too large`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

export async function beginDeviceLogin(options: DeviceLoginOptions = {}): Promise<PendingDeviceLogin> {
  const fetcher = options.fetch ?? fetch;
  const issuer = normalizedHttpsURL(options.issuer ?? process.env.A3T_ISSUER ?? DEFAULT_ISSUER, "issuer");
  if (!issuer.pathname.endsWith("/")) issuer.pathname += "/";
  const clientId = options.clientId ?? process.env.A3T_CLIENT_ID ?? DEFAULT_CLIENT_ID;
  if (!/^[A-Za-z0-9._~-]{1,128}$/.test(clientId)) throw new Error("invalid OAuth client id");

  const discoveryURL = new URL(".well-known/openid-configuration", issuer);
  const discoveryResponse = await fetcher(discoveryURL, { headers: { accept: "application/json" } });
  if (!discoveryResponse.ok) throw new Error(`identity discovery failed (${discoveryResponse.status})`);
  const discovery = await jsonResponse<DiscoveryDocument>(discoveryResponse, "identity discovery");
  const discoveredIssuer = normalizedHttpsURL(discovery.issuer, "discovered issuer");
  if (discoveredIssuer.toString() !== issuer.toString()) throw new Error("identity discovery issuer mismatch");
  const deviceEndpoint = sameOriginEndpoint(discovery.device_authorization_endpoint, issuer, "device authorization endpoint");
  const tokenEndpoint = sameOriginEndpoint(discovery.token_endpoint, issuer, "token endpoint");

  const body = new URLSearchParams({ client_id: clientId, scope: "openid offline" });
  const deviceResponse = await fetcher(deviceEndpoint, {
    method: "POST",
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
  const interval = Math.max(0, Math.min(device.interval ?? 5, 60));
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
  let interval = Math.max(0, Math.min(pending.intervalSeconds, 60));

  while (now() < pending.expiresAt) {
    const body = new URLSearchParams({
      grant_type: DEVICE_GRANT,
      client_id: pending.clientId,
      device_code: pending.deviceCode,
    });
    const response = await fetcher(pending.tokenEndpoint, {
      method: "POST",
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
      const current = await loadState(options.stateDir);
      await writeState({ ...current, auth }, options.stateDir);
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

async function writeState(state: CliState, stateDir = defaultStateDir()): Promise<void> {
  const path = statePath(stateDir);
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    throw new Error("a3t state directory must be a regular directory");
  }
  await chmod(directory, 0o700);
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

export async function saveActiveProject(project: string, stateDir = defaultStateDir()): Promise<void> {
  const id = normalizedHttpsURL(project, "project id").toString();
  const state = await loadState(stateDir);
  await writeState({ ...state, activeProject: id }, stateDir);
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
