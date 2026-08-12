import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { publicValidationResult, validateManifestText } from "./index.js";

const validManifest = `
apiVersion: a2k.a3t.ai/v0alpha1
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
  profiles:
    - core
  policy:
    remoteFetch: disabled
    mutation: proposal
`;

test("accepts a minimal project bootstrap manifest", () => {
  const result = validateManifestText(validManifest);

  assert.equal(result.valid, true);
  assert.equal(result.manifest?.kind, "ProjectBootstrap");
  assert.deepEqual(result.errors, []);
});

test("rejects duplicate YAML keys", () => {
  const result = validateManifestText(`${validManifest}\nkind: OrganizationHub\n`);

  assert.equal(result.valid, false);
  assert.equal(result.errors[0]?.code, "yaml-invalid");
});

test("rejects YAML aliases", () => {
  const result = validateManifestText(`
apiVersion: a2k.a3t.ai/v0alpha1
kind: ProjectBootstrap
metadata: &metadata
  id: https://example.com/a2k/projects/widget
  name: widget
  owners: [https://example.com/teams/platform]
  classification: internal
spec:
  roots: []
  profiles: [core]
  policy: *metadata
`);

  assert.equal(result.valid, false);
  assert.equal(result.errors[0]?.code, "yaml-invalid");
});

test("rejects custom YAML tags", () => {
  const result = validateManifestText(`${validManifest}\nx-example.note: !unsafe value\n`);

  assert.equal(result.valid, false);
  assert.equal(result.errors[0]?.code, "yaml-invalid");
});

test("rejects multiple YAML documents", () => {
  const result = validateManifestText(`${validManifest}\n---\nkind: ProjectBootstrap\n`);

  assert.equal(result.valid, false);
  assert.equal(result.errors[0]?.code, "yaml-document-count");
});

test("rejects unsupported API versions", () => {
  const result = validateManifestText(
    validManifest.replace("a2k.a3t.ai/v0alpha1", "a2k.a3t.ai/v9"),
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "schema-invalid"));
});

test("rejects undeclared credential fields", () => {
  const result = validateManifestText(`${validManifest}\n  credentials: secret\n`);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "schema-invalid"));
});

test("rejects credential-bearing extension names", () => {
  const result = validateManifestText(`${validManifest}\nx-example.client-secret: sentinel-value\n`);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "unsafe-content"));
});

test("rejects URI userinfo", () => {
  const result = validateManifestText(
    validManifest.replace(
      "https://example.com/teams/platform",
      "https://user:pass@example.com/teams/platform",
    ),
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "unsafe-content"));
});

test("rejects credential-bearing URI query and fragment parameters", () => {
  for (const unsafeOwner of [
    "https://example.com/teams/platform?access_token=dummy",
    "https://example.com/teams/platform#client%5Fsecret=dummy",
  ]) {
    const result = validateManifestText(
      validManifest.replace("https://example.com/teams/platform", unsafeOwner),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "unsafe-content"));
  }
});

test("rejects standalone token-shaped extension values", () => {
  const tokenShape = ["eyJdummy", "payload", "signature"].join(".");
  for (const value of [tokenShape, `  ${tokenShape}  `]) {
    const result = validateManifestText(
      `${validManifest}\nx-example.note: "${value}"\n`,
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "unsafe-content"));
  }
});

test("rejects token-shaped URI parameter values and bracketed credential names", () => {
  const tokenShape = ["eyJdummy", "payload", "signature"].join(".");
  for (const unsafeOwner of [
    `https://example.com/teams/platform?state=${tokenShape}`,
    "https://example.com/teams/platform?access_token%5B%5D=dummy",
    `https://example.com/teams/platform#route?state=${tokenShape}`,
  ]) {
    const result = validateManifestText(
      validManifest.replace("https://example.com/teams/platform", unsafeOwner),
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "unsafe-content"));
  }
});

test("sanitizes YAML diagnostics so source content is not repeated", () => {
  const result = validateManifestText(`${validManifest}\n: private-sentinel\n`);
  const output = JSON.stringify(publicValidationResult(result));

  assert.equal(result.valid, false);
  assert.doesNotMatch(output, /private-sentinel/);
});

test("accepts bounded non-sensitive extensions", () => {
  const result = validateManifestText(`${validManifest}\nx-example.note: interoperability-pilot\n`);

  assert.equal(result.valid, true);
});

test("public validation output does not echo manifest content", () => {
  const result = validateManifestText(`${validManifest}\nx-example.note: sentinel-value\n`);
  const output = JSON.stringify(publicValidationResult(result));

  assert.doesNotMatch(output, /sentinel-value/);
});

test("rejects input larger than the configured byte limit", () => {
  const result = validateManifestText(validManifest, { maxBytes: 8 });

  assert.equal(result.valid, false);
  assert.equal(result.errors[0]?.code, "input-too-large");
});

test("accepts every valid conformance fixture", async () => {
  const directory = join(process.cwd(), "fixtures", "valid");
  for (const filename of await readdir(directory)) {
    const result = validateManifestText(
      await readFile(join(directory, filename), "utf8"),
    );
    assert.equal(result.valid, true, `${filename} should be valid`);
  }
});

test("rejects every invalid conformance fixture", async () => {
  const directory = join(process.cwd(), "fixtures", "invalid");
  for (const filename of await readdir(directory)) {
    const result = validateManifestText(
      await readFile(join(directory, filename), "utf8"),
    );
    assert.equal(result.valid, false, `${filename} should be invalid`);
  }
});
