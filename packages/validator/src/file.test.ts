import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ManifestFileTooLargeError, readManifestFile } from "./file.js";

test("bounded file reader accepts a file exactly at the limit", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "a2k-validator-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "manifest.yaml");
  await writeFile(path, "12345678");

  assert.equal(await readManifestFile(path, 8, directory), "12345678");
});

test("bounded file reader rejects one byte above the limit", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "a2k-validator-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "manifest.yaml");
  await writeFile(path, "123456789");

  await assert.rejects(
    () => readManifestFile(path, 8, directory),
    ManifestFileTooLargeError,
  );
});

test("bounded file reader rejects symlinks that escape the checkout", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "a2k-validator-"));
  const outside = await mkdtemp(join(tmpdir(), "a2k-outside-"));
  context.after(() => Promise.all([
    rm(directory, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]));
  const target = join(outside, "private.yaml");
  const path = join(directory, "manifest.yaml");
  await writeFile(target, "private-value");
  await symlink(target, path);

  await assert.rejects(() => readManifestFile(path, 1024, directory));
});

test("bounded file reader rejects non-regular files", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "a2k-validator-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "manifest.yaml");
  await mkdir(path);

  await assert.rejects(() => readManifestFile(path, 1024, directory));
});
