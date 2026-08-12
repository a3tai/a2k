import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import type { A2kManifest } from "@a2k/core";
import { planBootstrap, type BootstrapTarget } from "./index.js";

const manifest = {
  apiVersion: "a2k.a3t.ai/v0alpha1",
  kind: "ProjectBootstrap",
  metadata: {
    id: "https://example.com/a2k/projects/widget",
    name: "widget",
    owners: ["https://example.com/teams/platform"],
    classification: "internal",
  },
  spec: {
    roots: [{ id: "docs", path: "docs", classification: "internal" }],
    profiles: ["core", "mcp"],
    policy: { remoteFetch: "disabled", mutation: "proposal" },
  },
  "x-connectors": {
    mcpServers: {
      linear: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@linear/mcp-server"],
        env: {
          LINEAR_API_KEY: {
            env: "LINEAR_API_KEY",
            op: "op://Shared/LocalEnvironment/MCP/LINEAR_API_KEY",
          },
        },
      },
      context7: {
        transport: "http",
        url: "https://mcp.context7.com/mcp",
        headers: {
          CONTEXT7_API_KEY: {
            env: "CONTEXT7_API_KEY",
            op: "op://Shared/LocalEnvironment/CONTEXT7_API_KEY",
          },
        },
      },
    },
  },
} as A2kManifest;

const targets: BootstrapTarget[] = [
  "claude-code",
  "opencode",
  "pi",
  "codex",
  "vscode",
  "cursor",
];

const targetPaths: Record<BootstrapTarget, string> = {
  "claude-code": ".claude/mcp.json",
  opencode: "opencode.json",
  pi: ".pi/mcp.json",
  codex: ".codex/config.toml",
  vscode: ".vscode/mcp.json",
  cursor: ".cursor/mcp.json",
};

for (const target of targets) {
  test(`${target} writer matches its native config fixture`, async () => {
    const plan = planBootstrap(manifest, { targets: [target] });
    const expected = await readFile(
      join(process.cwd(), "packages", "bootstrap", "test-fixtures", `${target}.${target === "codex" ? "toml" : "json"}`),
      "utf8",
    );

    assert.equal(plan.changes.length, 1);
    assert.equal(plan.changes[0]?.path, targetPaths[target]);
    assert.equal(plan.changes[0]?.content, expected);
  });
}

test("produces a review-only bootstrap plan without applying changes", () => {
  const plan = planBootstrap(manifest, { targets: ["claude-code", "codex"] });

  assert.equal(plan.applied, false);
  assert.equal(plan.requiresApproval, true);
  assert.match(plan.approvalDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    plan.approvalDigest,
    planBootstrap(manifest, { targets: ["claude-code", "codex"] }).approvalDigest,
  );
  assert.ok(plan.changes.length > 0);
  assert.ok(plan.changes.every((change) => change.requiresApproval));

  const changed = structuredClone(manifest);
  const context7 = changed["x-connectors"]!.mcpServers.context7;
  if (context7?.transport !== "http") throw new Error("context7 fixture must use HTTP");
  context7.url = "https://changed.example.com/mcp";
  assert.notEqual(
    plan.approvalDigest,
    planBootstrap(changed, { targets: ["claude-code", "codex"] }).approvalDigest,
  );
});

test("keeps only secret references in the plan", () => {
  const plan = planBootstrap(manifest, { targets });
  const serialized = JSON.stringify(plan);

  assert.match(serialized, /op:\/\/Shared\/LocalEnvironment/);
  assert.doesNotMatch(serialized, /sk-|eyJ|Bearer [A-Za-z0-9]/);
});

test("keeps Pi literal values from becoming command resolvers", () => {
  const withLiterals = structuredClone(manifest);
  const linear = withLiterals["x-connectors"]!.mcpServers.linear;
  if (linear?.transport !== "stdio") throw new Error("linear fixture must use stdio");
  linear.env = { LABEL: "!literal" };

  const plan = planBootstrap(withLiterals, { targets: ["pi"] });
  assert.match(plan.changes[0]?.content ?? "", /"LABEL": "!!literal"/);
  assert.match(plan.changes[0]?.content ?? "", /"approveTools": true/);
});

test("maps bearer bindings to each client's native authentication fields", () => {
  const withBearer = structuredClone(manifest);
  withBearer["x-connectors"]!.mcpServers.exa = {
    transport: "http",
    url: "https://mcp.exa.ai/mcp",
    headers: {
      Authorization: {
        env: "EXA_API_KEY",
        op: "op://KarunaBot/Environment/MCP/EXA_API_KEY",
        scheme: "bearer",
      },
    },
  };

  const plan = planBootstrap(withBearer, {
    targets: ["claude-code", "pi", "codex"],
  });
  assert.match(plan.changes[0]?.content ?? "", /Bearer \$\{EXA_API_KEY\}/);
  assert.match(plan.changes[1]?.content ?? "", /"auth": "bearer"/);
  assert.match(plan.changes[1]?.content ?? "", /"bearerToken": "!op read/);
  assert.doesNotMatch(plan.changes[1]?.content ?? "", /"Authorization"/);
  assert.match(plan.changes[2]?.content ?? "", /bearer_token_env_var = "EXA_API_KEY"/);
});

test("rejects unknown bootstrap targets", () => {
  assert.throws(
    () => planBootstrap(manifest, { targets: ["unknown" as BootstrapTarget] }),
    /Unsupported bootstrap target/,
  );
});

test("rejects manifests without connector declarations", () => {
  const withoutConnectors = structuredClone(manifest) as A2kManifest & { "x-connectors"?: unknown };
  delete withoutConnectors["x-connectors"];

  assert.throws(
    () => planBootstrap(withoutConnectors, { targets: ["claude-code"] }),
    /does not declare x-connectors/,
  );
});
