import type { A2kManifest } from "@a2k/core";

import {
  connectorServers,
  envReference,
  json,
  sortedValues,
} from "./common.js";

const environment = (name: string): string => "${env:" + name + "}";

export function writeVsCode(manifest: A2kManifest): string {
  const servers = Object.fromEntries(
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
        type: "stdio",
        command: server.command,
        args: server.args,
        env: sortedValues(server.env, (value) =>
          envReference(value, environment)),
      }];
    }),
  );
  return json({ servers });
}
