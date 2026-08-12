import type { A2kManifest } from "@a2k/core";

import {
  connectorServers,
  envReference,
  json,
  sortedValues,
} from "./common.js";

export function writeOpenCode(manifest: A2kManifest): string {
  const mcp = Object.fromEntries(
    connectorServers(manifest).map(([name, server]) => {
      if (server.transport === "http") {
        return [name, {
          type: "remote",
          url: server.url,
          headers: sortedValues(server.headers, (value) =>
            envReference(value, (env) => `{env:${env}}`)),
          enabled: true,
        }];
      }
      return [name, {
        type: "local",
        command: [server.command, ...(server.args ?? [])],
        environment: sortedValues(server.env, (value) =>
          envReference(value, (env) => `{env:${env}}`)),
        enabled: true,
      }];
    }),
  );
  return json({ $schema: "https://opencode.ai/config.json", mcp });
}
