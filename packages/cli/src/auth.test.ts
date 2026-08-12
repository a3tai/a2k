import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  beginDeviceLogin,
  loadState,
  pollDeviceLogin,
  saveActiveProject,
  statusFromState,
  type FetchLike,
} from "./auth.js";

async function withStateDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "a3t-auth-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("device login discovers endpoints and stores refreshed credentials privately", async () => {
  await withStateDir(async (stateDir) => {
    const requests: Array<{ url: string; body: URLSearchParams }> = [];
    const fetch: FetchLike = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/.well-known/openid-configuration")) {
        return response(200, {
          issuer: "https://id.a3t.dev/",
          device_authorization_endpoint: "https://id.a3t.dev/oauth2/device/auth",
          token_endpoint: "https://id.a3t.dev/oauth2/token",
        });
      }
      const body = new URLSearchParams(String(init?.body ?? ""));
      requests.push({ url, body });
      if (url.endsWith("/oauth2/device/auth")) {
        return response(200, {
          device_code: "device-secret",
          user_code: "ABCD-EFGH",
          verification_uri: "https://id.a3t.dev/oauth2/device/verify",
          verification_uri_complete: "https://id.a3t.dev/oauth2/device/verify?user_code=ABCD-EFGH",
          expires_in: 600,
          interval: 0,
        });
      }
      return response(200, {
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        token_type: "bearer",
        expires_in: 3600,
        scope: "openid offline",
      });
    };

    const pending = await beginDeviceLogin({ issuer: "https://id.a3t.dev", fetch });
    assert.equal(pending.userCode, "ABCD-EFGH");
    assert.equal(pending.verificationUriComplete, "https://id.a3t.dev/oauth2/device/verify?user_code=ABCD-EFGH");

    await pollDeviceLogin(pending, { stateDir, fetch, sleep: async () => undefined });
    const state = await loadState(stateDir);
    assert.equal(state.auth?.issuer, "https://id.a3t.dev/");
    assert.equal(state.auth?.accessToken, "access-secret");
    assert.equal(state.auth?.refreshToken, "refresh-secret");
    assert.equal(requests[0]?.body.get("client_id"), "a3t-hub");
    assert.equal(requests[1]?.body.get("grant_type"), "urn:ietf:params:oauth:grant-type:device_code");
    assert.equal(requests[1]?.body.get("device_code"), "device-secret");

    const mode = (await stat(join(stateDir, "state.json"))).mode & 0o777;
    assert.equal(mode, 0o600);
    const persisted = await readFile(join(stateDir, "state.json"), "utf8");
    assert.doesNotMatch(persisted, /device-secret/);
  });
});

test("device polling handles pending and slow_down without leaking token errors", async () => {
  await withStateDir(async (stateDir) => {
    const waits: number[] = [];
    let attempt = 0;
    const fetch: FetchLike = async () => {
      attempt += 1;
      if (attempt === 1) return response(400, { error: "authorization_pending" });
      if (attempt === 2) return response(400, { error: "slow_down", error_description: "do not print this" });
      return response(200, { access_token: "access", token_type: "bearer", expires_in: 30 });
    };
    const pending = {
      issuer: "https://id.a3t.dev/",
      clientId: "a3t-hub",
      tokenEndpoint: "https://id.a3t.dev/oauth2/token",
      deviceCode: "device-secret",
      userCode: "CODE",
      verificationUri: "https://id.a3t.dev/oauth2/device/verify",
      expiresAt: Date.now() + 60_000,
      intervalSeconds: 1,
    };
    await pollDeviceLogin(pending, {
      stateDir,
      fetch,
      sleep: async (milliseconds) => { waits.push(milliseconds); },
    });
    assert.deepEqual(waits, [1_000, 6_000]);
  });
});

test("state writes reject a symlink destination", async () => {
  await withStateDir(async (stateDir) => {
    const target = join(stateDir, "target.json");
    await writeFile(target, "do not replace", "utf8");
    await symlink(target, join(stateDir, "state.json"));
    await assert.rejects(
      saveActiveProject("https://a3t.ai/a2k/projects/docs", stateDir),
      /regular file/,
    );
    assert.equal(await readFile(target, "utf8"), "do not replace");
  });
});

test("project selection and status keep tokens out of public output", async () => {
  await withStateDir(async (stateDir) => {
    await saveActiveProject("https://a3t.ai/a2k/projects/docs", stateDir);
    const state = await loadState(stateDir);
    const status = statusFromState({
      ...state,
      auth: {
        issuer: "https://id.a3t.dev/",
        clientId: "a3t-hub",
        accessToken: "must-not-print",
        tokenType: "bearer",
        expiresAt: Date.now() + 60_000,
        scope: "openid offline",
      },
    });
    assert.deepEqual(status, {
      authenticated: true,
      issuer: "https://id.a3t.dev/",
      expiresAt: status.expiresAt,
      project: "https://a3t.ai/a2k/projects/docs",
    });
    assert.doesNotMatch(JSON.stringify(status), /must-not-print/);
  });
});
