import type { A2kManifest, A2kMcpValue } from "@a2k/core";

import { connectorServers, isCredentialBinding } from "./common.js";

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value);
}

function inlineTable(values: Record<string, string>): string {
  return `{ ${Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${tomlKey(key)} = ${tomlString(value)}`)
    .join(", ")} }`;
}

function splitValues(values: Record<string, A2kMcpValue> | undefined): {
  literals: Record<string, string>;
  bindings: Record<string, string>;
} {
  const literals: Record<string, string> = {};
  const bindings: Record<string, string> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (isCredentialBinding(value)) bindings[key] = value.env;
    else literals[key] = value;
  }
  return { literals, bindings };
}

export function writeCodex(manifest: A2kManifest): string {
  const sections = connectorServers(manifest).map(([name, server]) => {
    const lines = [`[mcp_servers.${tomlKey(name)}]`];
    if (server.transport === "stdio") {
      lines.push(`command = ${tomlString(server.command)}`);
      if (server.args?.length) {
        lines.push(`args = [${server.args.map(tomlString).join(", ")}]`);
      }
      const { literals, bindings } = splitValues(server.env);
      if (Object.keys(literals).length) lines.push(`env = ${inlineTable(literals)}`);
      const envVars = [...new Set(Object.values(bindings))].sort();
      if (envVars.length) {
        lines.push(`env_vars = [${envVars.map(tomlString).join(", ")}]`);
      }
      return lines.join("\n");
    }

    lines.push(`url = ${tomlString(server.url)}`);
    const headers = { ...(server.headers ?? {}) };
    const authorizationKey = Object.keys(headers).find((key) =>
      key.toLowerCase() === "authorization");
    const authorization = authorizationKey ? headers[authorizationKey] : undefined;
    if (
      authorizationKey &&
      authorization &&
      isCredentialBinding(authorization) &&
      authorization.scheme === "bearer"
    ) {
      lines.push(`bearer_token_env_var = ${tomlString(authorization.env)}`);
      delete headers[authorizationKey];
    }
    const { literals, bindings } = splitValues(headers);
    if (Object.keys(literals).length) {
      lines.push(`http_headers = ${inlineTable(literals)}`);
    }
    if (Object.keys(bindings).length) {
      lines.push(`env_http_headers = ${inlineTable(bindings)}`);
    }
    return lines.join("\n");
  });
  return `${sections.join("\n\n")}\n`;
}
