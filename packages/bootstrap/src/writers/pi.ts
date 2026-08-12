import type { A2kManifest, A2kMcpValue } from "@a2k/core";

import {
  connectorServers,
  isCredentialBinding,
  json,
  opCommand,
  sortedValues,
} from "./common.js";

function piValue(value: A2kMcpValue): string {
  if (isCredentialBinding(value)) return opCommand(value);
  return value.startsWith("!") ? `!${value}` : value;
}

export function writePi(manifest: A2kManifest): string {
  const mcpServers = Object.fromEntries(
    connectorServers(manifest).map(([name, server]) => {
      if (server.transport === "stdio") {
        return [name, {
          command: server.command,
          args: server.args,
          env: sortedValues(server.env, piValue),
          approveTools: true,
        }];
      }

      const headers = { ...(server.headers ?? {}) };
      const authorizationKey = Object.keys(headers).find((key) =>
        key.toLowerCase() === "authorization");
      const authorization = authorizationKey ? headers[authorizationKey] : undefined;
      const bearer = authorization && isCredentialBinding(authorization) &&
        authorization.scheme === "bearer" ? authorization : undefined;
      if (bearer && authorizationKey) delete headers[authorizationKey];

      return [name, {
        url: server.url,
        auth: bearer ? "bearer" : server.auth,
        bearerToken: bearer
          ? opCommand({ env: bearer.env, op: bearer.op })
          : undefined,
        headers: sortedValues(headers, piValue),
        approveTools: true,
      }];
    }),
  );
  return json({ mcpServers });
}
