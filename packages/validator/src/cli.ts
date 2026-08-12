#!/usr/bin/env node

import { A2K_MANIFEST_PATH } from "@a2k/core";
import { ManifestFileTooLargeError, readManifestFile } from "./file.js";
import { publicValidationResult, validateManifestText } from "./index.js";

async function main(): Promise<number> {
  const path = process.argv[2] ?? A2K_MANIFEST_PATH;
  let content: string;

  try {
    content = await readManifestFile(path);
  } catch (error) {
    const tooLarge = error instanceof ManifestFileTooLargeError;
    console.error(JSON.stringify({
      valid: false,
      errors: [{
        code: tooLarge ? "input-too-large" : "file-unreadable",
        path,
        message: tooLarge ? error.message : "Manifest could not be read",
      }],
    }));
    return 2;
  }

  const result = validateManifestText(content);
  const stream = result.valid ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(publicValidationResult(result), null, 2)}\n`);
  return result.valid ? 0 : 1;
}

process.exitCode = await main();
