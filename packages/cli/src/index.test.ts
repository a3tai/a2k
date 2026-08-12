import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  findManifestDir,
  hookScript,
  loadContext,
  shellExports,
  shellQuote,
} from "./index.js";

const VALID_MANIFEST = `apiVersion: a2k.a3t.ai/v0alpha1
kind: ProjectBootstrap
metadata:
  id: https://example.com/a2k/projects/widget
  name: widget
  owners:
    - https://example.com/teams/platform
  classification: internal
spec:
  roots:
    - id: docs
      path: docs
      classification: internal
  profiles: [core, bootstrap]
  policy:
    remoteFetch: disabled
    mutation: proposal
`;

async function withProject(
  manifest: string | null,
  run: (root: string, nested: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "a2k-cli-"));
  try {
    const nested = join(root, "a", "b");
    await mkdir(nested, { recursive: true });
    if (manifest !== null) {
      await mkdir(join(root, ".a2k"), { recursive: true });
      await writeFile(join(root, ".a2k", "manifest.yaml"), manifest, "utf8");
    }
    await run(root, nested);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("findManifestDir walks up to the manifest root", async () => {
  await withProject(VALID_MANIFEST, async (root, nested) => {
    assert.equal(await findManifestDir(nested), root);
    assert.equal(await findManifestDir(root), root);
  });
});

test("findManifestDir returns null without a manifest", async () => {
  await withProject(null, async (_root, nested) => {
    assert.equal(await findManifestDir(nested), null);
  });
});

test("loadContext returns a validated manifest", async () => {
  await withProject(VALID_MANIFEST, async (root, nested) => {
    const result = await loadContext(nested);
    assert.ok(result.ok);
    assert.equal(result.context.dir, root);
    assert.equal(result.context.manifest.metadata.name, "widget");
  });
});

test("loadContext reports validation errors", async () => {
  await withProject("kind: Nope\n", async (root, nested) => {
    const result = await loadContext(nested);
    assert.ok(!result.ok);
    assert.equal(result.dir, root);
    assert.ok(result.errors.length > 0);
  });
});

test("shellQuote survives single quotes", () => {
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
});

test("shellExports emits quoted metadata and unsets on null", async () => {
  await withProject(VALID_MANIFEST, async (root, nested) => {
    const result = await loadContext(nested);
    assert.ok(result.ok);
    const exports = shellExports(result.context);
    assert.match(exports, /export A2K_PROJECT_NAME='widget'/);
    assert.match(exports, /export A2K_CLASSIFICATION='internal'/);
    assert.match(exports, new RegExp(`export A2K_DIR='${root}'`));
  });
  const cleared = shellExports(null);
  assert.match(cleared, /unset A2K_PROJECT/);
  assert.doesNotMatch(cleared, /export /);
});

test("hook scripts register exactly once per shell", () => {
  const zsh = hookScript("zsh");
  assert.match(zsh, /chpwd_functions/);
  assert.match(zsh, /a3t export/);
  const bash = hookScript("bash");
  assert.match(bash, /PROMPT_COMMAND/);
  assert.match(bash, /_a3t_hook\*\)/);
});
