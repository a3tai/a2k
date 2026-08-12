import assert from "node:assert/strict";
import test from "node:test";

import type { A2kManifest } from "@a2k/core";
import { planBootstrap } from "./index.js";

const manifest: A2kManifest = {
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
};

test("produces a review-only bootstrap plan without applying changes", () => {
  const plan = planBootstrap(manifest, { targets: ["claude-code", "codex"] });

  assert.equal(plan.applied, false);
  assert.equal(plan.requiresApproval, true);
  assert.ok(plan.changes.length > 0);
  assert.ok(plan.changes.every((change) => change.requiresApproval));
});

test("does not place credentials or tokens in generated configuration", () => {
  const plan = planBootstrap(manifest, { targets: ["claude-code"] });
  const serialized = JSON.stringify(plan).toLowerCase();

  assert.doesNotMatch(serialized, /access_token|client_secret|authorization:/);
});

test("rejects unknown bootstrap targets", () => {
  assert.throws(
    () => planBootstrap(manifest, { targets: ["unknown" as "codex"] }),
    /Unsupported bootstrap target/,
  );
});
