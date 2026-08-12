import type {
  A2kCredentialBinding,
  A2kManifest,
  A2kMcpServer,
  A2kMcpValue,
} from "@a2k/core";

export type McpServerEntry = [string, A2kMcpServer];

export function connectorServers(manifest: A2kManifest): McpServerEntry[] {
  const connectors = manifest["x-connectors"];
  if (!connectors) {
    throw new Error(`Manifest ${manifest.metadata.id} does not declare x-connectors`);
  }
  return Object.entries(connectors.mcpServers).sort(([left], [right]) =>
    left.localeCompare(right));
}

export function isCredentialBinding(
  value: A2kMcpValue,
): value is A2kCredentialBinding {
  return typeof value === "object";
}

export function sortedValues<T>(
  values: Record<string, A2kMcpValue> | undefined,
  render: (value: A2kMcpValue, key: string) => T,
): Record<string, T> | undefined {
  if (!values || Object.keys(values).length === 0) return undefined;
  return Object.fromEntries(
    Object.entries(values)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, render(value, key)]),
  );
}

export function envReference(
  value: A2kMcpValue,
  format: (name: string) => string,
): string {
  if (!isCredentialBinding(value)) return value;
  const reference = format(value.env);
  return value.scheme === "bearer" ? `Bearer ${reference}` : reference;
}

export function opCommand(value: A2kCredentialBinding): string {
  const ref = value.op.replaceAll("'", "'\\''");
  if (value.scheme === "bearer") {
    return `!printf 'Bearer %s' "$(op read '${ref}')"`;
  }
  return `!op read '${ref}'`;
}

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
