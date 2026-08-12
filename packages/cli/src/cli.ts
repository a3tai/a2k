#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { planBootstrap, type BootstrapTarget } from "@a2k/bootstrap";
import { A2K_MANIFEST_PATH } from "@a2k/core";
import {
  ManifestFileTooLargeError,
  publicValidationResult,
  readManifestFile,
  validateManifestText,
} from "@a2k/validator";

import {
  hookScript,
  loadContext,
  shellExports,
  type ContextResult,
  type HookShell,
} from "./index.js";

const USAGE = `Usage: a2k <command>

Commands:
  validate [path]                    Validate a manifest (default: ${A2K_MANIFEST_PATH})
  context [--json]                   Show the manifest context for the current directory
  bootstrap [--target <t>] [--write] Plan client configuration (targets: claude-code, codex)
  export                             Emit shell exports for the current context
  hook <zsh|bash>                    Emit the shell hook (add 'eval "$(a2k hook zsh)"' to your rc file)
`;

async function cmdValidate(args: string[]): Promise<number> {
  const path = args[0] ?? A2K_MANIFEST_PATH;
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

function reportMissingContext(result: ContextResult & { ok: false }): void {
  if (result.dir === null) {
    console.error(`No ${A2K_MANIFEST_PATH} found in this directory or any parent.`);
    return;
  }
  console.error(`Invalid manifest in ${result.dir}:`);
  for (const error of result.errors) {
    console.error(`  [${error.code}] ${error.path}: ${error.message}`);
  }
}

async function cmdContext(args: string[]): Promise<number> {
  const result = await loadContext(process.cwd());
  if (args.includes("--json")) {
    if (result.ok) {
      const { manifest } = result.context;
      process.stdout.write(`${JSON.stringify({
        found: true,
        dir: result.context.dir,
        manifest: result.context.manifestPath,
        project: {
          id: manifest.metadata.id,
          name: manifest.metadata.name,
          kind: manifest.kind,
          classification: manifest.metadata.classification,
          profiles: manifest.spec.profiles,
        },
      }, null, 2)}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify({ found: false, dir: result.dir, errors: result.errors }, null, 2)}\n`);
    return 1;
  }

  if (!result.ok) {
    reportMissingContext(result);
    return 1;
  }
  const { manifest, dir } = result.context;
  console.log(`project:        ${manifest.metadata.id}`);
  console.log(`name:           ${manifest.metadata.name}`);
  console.log(`kind:           ${manifest.kind}`);
  console.log(`classification: ${manifest.metadata.classification}`);
  console.log(`dir:            ${dir}`);
  console.log(`roots:          ${manifest.spec.roots.map((root) => root.path).join(", ")}`);
  console.log(`profiles:       ${manifest.spec.profiles.join(", ")}`);
  return 0;
}

const BOOTSTRAP_TARGETS: readonly BootstrapTarget[] = ["claude-code", "codex"];

async function cmdBootstrap(args: string[]): Promise<number> {
  const targets: BootstrapTarget[] = [];
  let write = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") {
      write = true;
    } else if (arg === "--target") {
      const value = args[index + 1];
      index += 1;
      if (!value || !BOOTSTRAP_TARGETS.includes(value as BootstrapTarget)) {
        console.error(`--target must be one of: ${BOOTSTRAP_TARGETS.join(", ")}`);
        return 2;
      }
      targets.push(value as BootstrapTarget);
    } else {
      console.error(`Unknown argument: ${arg}`);
      return 2;
    }
  }
  if (targets.length === 0) targets.push("claude-code");

  const result = await loadContext(process.cwd());
  if (!result.ok) {
    reportMissingContext(result);
    return 1;
  }

  const plan = planBootstrap(result.context.manifest, { targets });
  if (!write) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    console.error("Plan only. Re-run with --write to write proposed files under .a2k/generated/.");
    return 0;
  }

  for (const change of plan.changes) {
    const destination = join(result.context.dir, change.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, change.content, "utf8");
    console.log(`wrote ${destination}`);
  }
  console.log("Proposed configuration written. Nothing is activated until you wire it into your client.");
  return 0;
}

async function cmdExport(): Promise<number> {
  const result = await loadContext(process.cwd());
  if (result.ok) {
    process.stdout.write(shellExports(result.context));
    return 0;
  }
  process.stdout.write(shellExports(null));
  if (result.dir !== null) {
    console.error(`a2k: invalid manifest in ${result.dir}; context cleared`);
  }
  return 0;
}

function cmdHook(args: string[]): number {
  const shell = args[0];
  if (shell !== "zsh" && shell !== "bash") {
    console.error("Usage: a2k hook <zsh|bash>");
    return 2;
  }
  process.stdout.write(hookScript(shell satisfies HookShell));
  return 0;
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "validate":
      return cmdValidate(args);
    case "context":
      return cmdContext(args);
    case "bootstrap":
      return cmdBootstrap(args);
    case "export":
      return cmdExport();
    case "hook":
      return cmdHook(args);
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(USAGE);
      return command === undefined ? 2 : 0;
    default:
      console.error(`Unknown command: ${command}\n`);
      process.stderr.write(USAGE);
      return 2;
  }
}

process.exitCode = await main();
