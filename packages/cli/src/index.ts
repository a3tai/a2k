import { lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { A2K_MANIFEST_PATH, type A2kManifest } from "@a2k/core";
import {
  readManifestFile,
  validateManifestText,
  type ValidationError,
} from "@a2k/validator";

export interface A2kContext {
  dir: string;
  manifestPath: string;
  manifest: A2kManifest;
}

export interface ContextError {
  code: string;
  path: string;
  message: string;
}

export type ContextResult =
  | { ok: true; context: A2kContext }
  | { ok: false; dir: string | null; errors: ContextError[] };

export async function findManifestDir(startDir: string): Promise<string | null> {
  let dir = resolve(startDir);
  for (;;) {
    try {
      const stat = await lstat(join(dir, A2K_MANIFEST_PATH));
      if (stat.isFile()) return dir;
    } catch {
      // No manifest at this level; keep walking up.
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function loadContext(startDir: string): Promise<ContextResult> {
  const dir = await findManifestDir(startDir);
  if (dir === null) return { ok: false, dir: null, errors: [] };

  const manifestPath = join(dir, A2K_MANIFEST_PATH);
  let content: string;
  try {
    content = await readManifestFile(manifestPath, undefined, dir);
  } catch (error) {
    return {
      ok: false,
      dir,
      errors: [{
        code: "file-unreadable",
        path: manifestPath,
        message: error instanceof Error ? error.message : "Manifest could not be read",
      }],
    };
  }

  const result = validateManifestText(content);
  if (!result.valid) {
    return {
      ok: false,
      dir,
      errors: result.errors.map((error: ValidationError) => ({ ...error })),
    };
  }

  return { ok: true, context: { dir, manifestPath, manifest: result.manifest } };
}

export const EXPORTED_VARIABLES = [
  "A2K_DIR",
  "A2K_MANIFEST",
  "A2K_PROJECT",
  "A2K_PROJECT_NAME",
  "A2K_KIND",
  "A2K_CLASSIFICATION",
] as const;

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// Metadata only, from a validated manifest. Never secrets, never manifest-supplied code.
export function shellExports(context: A2kContext | null): string {
  if (context === null) {
    return `${EXPORTED_VARIABLES.map((name) => `unset ${name}`).join("\n")}\n`;
  }
  const values: Record<(typeof EXPORTED_VARIABLES)[number], string> = {
    A2K_DIR: context.dir,
    A2K_MANIFEST: context.manifestPath,
    A2K_PROJECT: context.manifest.metadata.id,
    A2K_PROJECT_NAME: context.manifest.metadata.name,
    A2K_KIND: context.manifest.kind,
    A2K_CLASSIFICATION: context.manifest.metadata.classification,
  };
  return `${EXPORTED_VARIABLES
    .map((name) => `export ${name}=${shellQuote(values[name])}`)
    .join("\n")}\n`;
}

export type HookShell = "zsh" | "bash";

// The tool is a3t; the A2K_* variables carry A2K protocol context.
export function hookScript(shell: HookShell): string {
  if (shell === "zsh") {
    return [
      `_a3t_hook() {`,
      `  eval "$(a3t export 2>/dev/null)"`,
      `}`,
      `typeset -ag chpwd_functions`,
      `if [[ -z "\${chpwd_functions[(r)_a3t_hook]}" ]]; then`,
      `  chpwd_functions+=(_a3t_hook)`,
      `fi`,
      `_a3t_hook`,
      ``,
    ].join("\n");
  }
  return [
    `_a3t_hook() {`,
    `  if [ "\${_A3T_LAST_PWD:-}" != "$PWD" ]; then`,
    `    _A3T_LAST_PWD="$PWD"`,
    `    eval "$(a3t export 2>/dev/null)"`,
    `  fi`,
    `}`,
    `case "\${PROMPT_COMMAND:-}" in`,
    `  *_a3t_hook*) ;;`,
    `  *) PROMPT_COMMAND="_a3t_hook\${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;`,
    `esac`,
    `_a3t_hook`,
    ``,
  ].join("\n");
}
