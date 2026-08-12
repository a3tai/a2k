import type { A2kManifest } from "@a2k/core";

export type BootstrapTarget = "claude-code" | "codex";

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
  changes: BootstrapChange[];
}

const targetPaths: Record<BootstrapTarget, string> = {
  "claude-code": ".a2k/generated/claude-code.mcp.json",
  codex: ".a2k/generated/codex.mcp.json",
};

export function planBootstrap(
  manifest: A2kManifest,
  options: { targets: BootstrapTarget[] },
): BootstrapPlan {
  const changes = options.targets.map((target): BootstrapChange => {
    const path = targetPaths[target];
    if (!path) {
      throw new Error(`Unsupported bootstrap target: ${String(target)}`);
    }

    return {
      target,
      operation: "propose-create",
      path,
      content: `${JSON.stringify(
        {
          generatedBy: "a2k-bootstrap",
          manifest: manifest.metadata.id,
          server: {
            command: "a2k-mcp",
            args: ["--stdio"],
          },
        },
        null,
        2,
      )}\n`,
      requiresApproval: true,
    };
  });

  return {
    manifestId: manifest.metadata.id,
    applied: false,
    requiresApproval: true,
    changes,
  };
}
