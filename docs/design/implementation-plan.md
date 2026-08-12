# A3T implementation plan

Build-out sequence for [RFC 0001](../rfcs/0001-product-surface.md) and the [product architecture](product-architecture.md).
Each phase ships as one or more reviewable PRs and ends with an exit criterion that a real user can exercise.
The specification track in [the roadmap](../roadmap.md) proceeds in parallel and is not blocked by this plan.

## Where the code lives

Connect-don't-reinvent (see [ecosystem-context.md](ecosystem-context.md)) puts most Hub work inside existing repos:

```text
a2k/          # the A2K protocol: spec, schemas, fixtures, TS reference SDK, P0 CLI, install.sh
core/         # Hub read path: services/business extended (projects, A2K ingest, a2k:// MCP);
              # defaults registry extracted from services/core/internal/registry; a3t-hub k8s namespace
a3t-sdk/      # bundle manifest + hardened signing (Kingpin port), shared by registry and CLI;
              # later: the extracted OSS service harness
plugins-official/  # bundle sources: plugins, agents, and (new) skills
desktop or new repo  # Wails tray app (P3, consolidation decision pending)
```

## P0 - CLI and shell integration (shipped)

- `@a3t/cli`: `validate`, `context`, `bootstrap` (review-first), `export`, `hook`.
- `install.sh` source install; direnv-style hook exporting `A2K_*` metadata.
- Exit: entering a checkout with `.a2k/manifest.yaml` gives any agent validated project context offline.

## P1 - Hub read path

Workstreams, in dependency order:

1. **Extend business-service**: `projects` table (joining existing `organizations`/`teams`), A2K manifest awareness, and the `a2k://` MCP surface alongside the existing one; copy the `business-api` wiring and `mcpapi` pattern, reuse `pkg/{server,config,auth,authz}`; migrations join the shared `core-migrate` path.
2. **Identity**: seed an `a3t-hub` Hydra client (script pattern from `seed-admin-oauth-client.sh`; DCR is disabled), device-flow for `a3t login`, audience checks; agent principals via client credentials and token exchange.
3. **Authorization**: adopt the declared Keto OPL hierarchy for org/team/project (the first real consumer; closes core ADR 0002's deferral), classification-ceiling check, single authz middleware shared by REST and MCP, deny-by-default tests.
4. **Ingest**: `a3tai/docs` (the live OrganizationHub) as the first source, git polling, validator-gated document storage with provenance, Zikra indexing into per-project namespaces.
5. **MCP read surface**: `search_knowledge`, `get_document`, `list_projects`, and `a2k://` document resources on the business-service MCP server; spec-compliant authorization (RFC 9728 + 8414 + scoped DCR on Hydra) so editor MCP clients authenticate with zero a3t client code.
6. **CLI**: `a3t login`, `a3t use <project>`, `a3t status`; token store under `~/.a3t`.
7. **Deploy**: `a3t-hub` namespace on dev (ambient-mesh label, hand-maintained kustomization list, ExternalSecret whose AWS key is seeded BEFORE merge), Flux delivery, compose entries for local parity.

Exit: on a fresh laptop, `a3t login && a3t use <project>` then an MCP-configured agent searches and reads governed docs it is entitled to, and is denied ones it is not (proven by test and by audit log).

## P2 - setup mode, registry, secrets, facts

1. **Signing hardening in a3t-sdk**: port the current Kingpin tree's `bundle.go`/`trust_policy.go` (canonical file-digest signature, zip defenses, fail-closed policy, re-verify at use) into `a3t-sdk/manifest`, add the trust-key set with key IDs and validity windows, add `runtime.type: skill`; negative fixtures for tampered, unsigned, and wrong-key bundles. Port from `~/prj/kingpinsec/kingpin`, not the stale `a3tai/kingpinsec-*` clones.
2. **Registry extraction**: lift `core/services/core/internal/registry` into the defaults registry service (its README already plans this), verifying signatures at publish, deriving trust from the verifying key, re-checking digests on download; publisher pinning and an org review gate before a version becomes default.
3. **Setup**: `a3t setup` resolving org -> team -> project -> principal defaults into a reviewable bootstrap plan; approval writes agent configs, skills, connectors, and MCP client settings.
4. **Facts**: `facts` document kind schema, ingest validation, `get_facts` MCP tool, `x-facts` profile documented.
5. **Secret broker**: `secret_bindings`, 1Password Connect first (matches current ops), token exchange for short-lived credentials, `a3t secrets list`.
6. **Editors and agents**: bootstrap planner emits `.vscode/mcp.json`, `.mcp.json`, and `.cursor/mcp.json` in the repo plan and the Windsurf user-global merge in the machine plan; agent detection plus config writers for Codex, OpenCode, Gemini CLI, and OpenClaw; `a3t mcp` stdio bridge for clients without HTTP MCP; CLI grows `--json` outputs; thin VS Code extension (status bar, MCP definition provider with fork guards, terminal env injection, command wrappers, walkthrough) dual-published to the Marketplace and Open VSX.
7. **Work loop bindings**: `x-workflow` manifest extension declaring per-project Research/Plan/Work/Review/Publish bindings, served over MCP so any agent can ask what each phase means in this project.
8. **Onboarding pilot**: run a real A3T project and one external tester through install -> login -> use -> setup across terminal plus one editor and two different agents; feeds spec Milestone 4.

Exit: a new machine reaches a fully configured, governed agent environment with exactly `install.sh`, `a3t login`, `a3t use`, `a3t setup`, with every local change reviewed before write.

## P3 - desktop, handoff, distribution

1. **Go CLI**: port the P0 command surface to a Go `a3t` binary (built on `a3t-sdk`); the hook drops interpreter startup; TypeScript packages remain the protocol SDK.
2. **Releases**: goreleaser with cosign-signed artifacts (rapid's release workflow as the template), `install.sh` switches to binary download with checksum verification, Homebrew tap `a3tai/tap/a3t`.
3. **Desktop**: Wails tray app (A3T design system) rendering CLI state: login, project selector, Hub status, settings; resolve consolidation with the existing `a3tai/desktop` app and share its `a3tai://` scheme and keychain slots.
4. **Handoff**: Paperclip adapter, `handoff_links`, `a3t handoff`; Linear/Jira/GitHub read adapters mapping issues into document references.
5. **Discovery surfaces**: Hub MCP server listed in the official MCP registry (DNS-verified `app.a3t/*` namespace, cascading to the GitHub registry and VS Code's gallery); dev container Feature `ghcr.io/a3tai/features/a3t`.

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
