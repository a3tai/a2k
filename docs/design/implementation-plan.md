# A3T implementation plan

Build-out sequence for [RFC 0001](../rfcs/0001-product-surface.md) and the [product architecture](product-architecture.md).
Each phase ships as one or more reviewable PRs and ends with an exit criterion that a real user can exercise.
The specification track in [the roadmap](../roadmap.md) proceeds in parallel and is not blocked by this plan.

## Repo layout target

```text
a2k/
  spec/ schemas/ fixtures/ examples/     # the A2K protocol (unchanged)
  packages/                              # TypeScript protocol reference SDK + P0 CLI
  hub/                                   # Go module: hub server + a3t CLI (P1+)
  apps/desktop/                          # Tauri tray app (P3)
  install.sh
```

## P0 - CLI and shell integration (shipped)

- `@a3t/cli`: `validate`, `context`, `bootstrap` (review-first), `export`, `hook`.
- `install.sh` source install; direnv-style hook exporting `A2K_*` metadata.
- Exit: entering a checkout with `.a2k/manifest.yaml` gives any agent validated project context offline.

## P1 - Hub read path

Workstreams, in dependency order:

1. **Service skeleton**: `hub/` Go module, Postgres migrations for the data-model tables, config, health, structured audit log.
2. **Identity**: Hydra device-flow for `a3t login`, Kratos session bridge, token validation middleware with audience checks, agent principals via client credentials and token exchange.
3. **Authorization**: Keto namespaces and role relations, classification-ceiling check, single authz middleware shared by REST and MCP, deny-by-default tests.
4. **Ingest**: git source polling, validator-gated document storage with provenance, Zikra indexing into per-project namespaces.
5. **MCP read surface**: streamable HTTP server exposing `search_knowledge`, `get_document`, `list_projects`, and document resources.
6. **CLI**: `a3t login`, `a3t use <project>`, `a3t status`; token store under `~/.a3t`.
7. **Deploy**: `a3t-hub` namespace on dev, Flux delivery, RDS database, docker compose for self-host parity.

Exit: on a fresh laptop, `a3t login && a3t use <project>` then an MCP-configured agent searches and reads governed docs it is entitled to, and is denied ones it is not (proven by test and by audit log).

## P2 - setup mode, registry, secrets, facts

1. **Bundle format**: content-addressed tar.gz with `manifest.json`, cosign signing and verification libraries, negative fixtures for tampered and unsigned bundles.
2. **Registry**: publish/list/pin APIs, publisher pinning, org review gate before a version becomes default.
3. **Setup**: `a3t setup` resolving org -> team -> project -> principal defaults into a reviewable bootstrap plan; approval writes agent configs, skills, connectors, and MCP client settings.
4. **Facts**: `facts` document kind schema, ingest validation, `get_facts` MCP tool, `x-facts` profile documented.
5. **Secret broker**: `secret_bindings`, 1Password Connect first (matches current ops), token exchange for short-lived credentials, `a3t secrets list`.
6. **Onboarding pilot**: run a real A3T project and one external tester through install -> login -> use -> setup; feeds spec Milestone 4.

Exit: a new machine reaches a fully configured, governed agent environment with exactly `install.sh`, `a3t login`, `a3t use`, `a3t setup`, with every local change reviewed before write.

## P3 - desktop, handoff, distribution

1. **Go CLI**: port the P0 command surface into the `hub/` module as the `a3t` binary; the hook drops interpreter startup; TypeScript packages remain the protocol SDK.
2. **Releases**: goreleaser with cosign-signed artifacts, `install.sh` switches to binary download with checksum verification, Homebrew tap `a3tai/tap/a3t`.
3. **Desktop**: Tauri tray app rendering CLI state: login, project selector, Hub status, settings.
4. **Handoff**: Paperclip adapter, `handoff_links`, `a3t handoff`; Linear/Jira/GitHub read adapters mapping issues into document references.

Exit: `brew install a3tai/tap/a3t`, tray shows the active project, and a session handed off from one machine resumes on another through Paperclip.

## P4 - hosted GA

1. Multi-tenant hardening: per-org isolation review, rate limits, quotas, backup and restore drills.
2. Billing on the existing A3T payments stack; free self-host forever, paid hosted tiers.
3. Operational maturity: SLOs, on-call runbooks, incident process, penetration test of the authz boundary.
4. Community: contribution guide for adapters and bundles, public conformance suite for third-party Hubs.

Exit: `hub.a3t.app` accepts paying organizations with support and an availability commitment.

## Standing rules

- Every phase keeps the primary invariants: review-first local mutation, single authz enforcement point, secrets never at rest in Hub or manifests, signatures fail closed.
- Anything normative discovered while building (facts kind, bundle format, handoff semantics) goes back into the spec as an RFC before it is called stable.
