import type { A2kManifest } from "@a2k/core";

import {
  connectorServers,
  envReference,
  json,
  sortedValues,
} from "./common.js";

const environment = (name: string): string => "${" + name + "}";

export function writeClaudeCode(manifest: A2kManifest): string {
  const mcpServers = Object.fromEntries(
    connectorServers(manifest).map(([name, server]) => {
      if (server.transport === "http") {
        return [name, {
          type: "http",
          url: server.url,
          headers: sortedValues(server.headers, (value) =>
            envReference(value, environment)),
        }];
      }
      return [name, {
        command: server.command,
        args: server.args,
        env: sortedValues(server.env, (value) =>
          envReference(value, environment)),
      }];
    }),
  );
  return json({ mcpServers });
}
