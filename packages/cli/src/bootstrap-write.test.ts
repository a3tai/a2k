import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { BootstrapPlan } from "@a2k/bootstrap";
import { writeBootstrapPlan } from "./bootstrap-write.js";

const plan: BootstrapPlan = {
  manifestId: "https://example.com/a2k/projects/widget",
  applied: false,
  requiresApproval: true,
  approvalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  changes: [
    {
      target: "claude-code",
      operation: "propose-create",
      path: ".claude/mcp.json",
      content: "new\n",
      requiresApproval: true,
    },
    {
      target: "pi",
      operation: "propose-create",
      path: ".pi/mcp.json",
      content: "pi\n",
      requiresApproval: true,
    },
  ],
};

test("writes every exactly approved bootstrap file", async () => {
  const root = await mkdtemp(join(tmpdir(), "a2k-bootstrap-write-"));
  try {
    const paths = await writeBootstrapPlan(root, plan, plan.approvalDigest);
    const canonicalRoot = await realpath(root);
    assert.deepEqual(paths, [
      join(canonicalRoot, ".claude/mcp.json"),
      join(canonicalRoot, ".pi/mcp.json"),
    ]);
    assert.equal(await readFile(join(root, ".pi/mcp.json"), "utf8"), "pi\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects approval for a different plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "a2k-bootstrap-write-"));
  try {
    await assert.rejects(
      writeBootstrapPlan(
        root,
        plan,
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
      /does not match the reviewed plan/,
    );
    await assert.rejects(readFile(join(root, ".claude/mcp.json"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses the whole plan when a destination already exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "a2k-bootstrap-write-"));
  try {
    await mkdir(join(root, ".claude"));
    await writeFile(join(root, ".claude/mcp.json"), "existing\n", "utf8");
    await assert.rejects(
      writeBootstrapPlan(root, plan, plan.approvalDigest),
      /already exists.*\.claude.*mcp\.json/,
    );
    await assert.rejects(readFile(join(root, ".pi/mcp.json"), "utf8"));
    assert.equal(
      await readFile(join(root, ".claude/mcp.json"), "utf8"),
      "existing\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses destination parents that are symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "a2k-bootstrap-write-"));
  const outside = await mkdtemp(join(tmpdir(), "a2k-bootstrap-outside-"));
  try {
    await symlink(outside, join(root, ".pi"));
    await assert.rejects(
      writeBootstrapPlan(root, plan, plan.approvalDigest),
      /symlink.*\.pi/,
    );
    await assert.rejects(readFile(join(outside, "mcp.json"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
