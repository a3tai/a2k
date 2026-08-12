import { createHash } from "node:crypto";

import type { A2kManifest } from "@a2k/core";

import { writeClaudeCode } from "./writers/claude-code.js";
import { writeCodex } from "./writers/codex.js";
import { writeCursor } from "./writers/cursor.js";
import { writeOpenCode } from "./writers/opencode.js";
import { writePi } from "./writers/pi.js";
import { writeVsCode } from "./writers/vscode.js";

export type BootstrapTarget =
  | "claude-code"
  | "opencode"
  | "pi"
  | "codex"
  | "vscode"
  | "cursor";

export interface BootstrapChange {
  target: BootstrapTarget;
  operation: "propose-create";
  path: string;
  content: string;
  requiresApproval: true;
}

export interface BootstrapPlan {
  manifestId: string;
  applied: false;
  requiresApproval: true;
  approvalDigest: `sha256:${string}`;
  changes: BootstrapChange[];
}

interface Writer {
  path: string;
  write: (manifest: A2kManifest) => string;
}

const writers: Record<BootstrapTarget, Writer> = {
  "claude-code": { path: ".claude/mcp.json", write: writeClaudeCode },
  opencode: { path: "opencode.json", write: writeOpenCode },
  pi: { path: ".pi/mcp.json", write: writePi },
  codex: { path: ".codex/config.toml", write: writeCodex },
  vscode: { path: ".vscode/mcp.json", write: writeVsCode },
  cursor: { path: ".cursor/mcp.json", write: writeCursor },
};

export function planBootstrap(
  manifest: A2kManifest,
  options: { targets: BootstrapTarget[] },
): BootstrapPlan {
  const changes = options.targets.map((target): BootstrapChange => {
    const writer = writers[target];
    if (!writer) {
      throw new Error(`Unsupported bootstrap target: ${String(target)}`);
    }

    return {
      target,
      operation: "propose-create",
      path: writer.path,
      content: writer.write(manifest),
      requiresApproval: true,
    };
  });

  const digestInput = JSON.stringify({
    manifestId: manifest.metadata.id,
    changes,
  });
  const approvalDigest = `sha256:${createHash("sha256")
    .update(digestInput, "utf8")
    .digest("hex")}` as const;

  return {
    manifestId: manifest.metadata.id,
    applied: false,
    requiresApproval: true,
    approvalDigest,
    changes,
  };
}
