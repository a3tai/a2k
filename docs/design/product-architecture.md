# A3T product architecture

This document is the complete system design for the product surface defined in [RFC 0001](../rfcs/0001-product-surface.md).
Naming: **A2K** is the knowledge protocol (manifests, classification, profiles, `.a2k/` paths, `A2K_*` variables).
**a3t** is the product and CLI that speaks it.
The [spec-level architecture](architecture.md) defines the planes; this document defines the running system.

## System overview

```text
 Developer machine                          A3T Hub (hub.a3t.app or self-hosted)
+---------------------------+              +--------------------------------------+
| a3t CLI  <- shell hook    |   OAuth2/    |  API + MCP server (single Go binary) |
| desktop app (tray)        |   OIDC       |   - authn: Hydra/Kratos              |
| agents (Claude Code, ...) | <==========> |   - authz: Keto @ MCP boundary       |
|   \- MCP client configs   |   MCP +      |   - registry: signed bundles         |
| .a2k/manifest.yaml (git)  |   REST       |   - secret broker (references only)  |
+---------------------------+              +-----+----------+----------+---------+
                                                 |          |          |
                                            Postgres      Zikra    Adapters
                                            (system     (index +   (git, Linear,
                                             of record)  memory)    Jira, GitHub,
                                                                    Paperclip)
```

Git repositories remain the reviewed documentation authority.
The Hub is a control plane and access plane over them, never a second source of truth.

## Guiding stance: connect, don't reinvent

The estate survey in [ecosystem-context.md](ecosystem-context.md) found most of the Hub already running inside the core platform.
The Hub is therefore a composition layer: it gives existing services one identity, one authorization model, one MCP surface, and one setup flow, and only writes new code where nothing exists (the `projects` entity, A2K manifest awareness, defaults resolution).
Every decision below prefers extending a running service over starting a sibling.

## Implementation decisions

| Decision | Choice | Rationale |
|---|---|---|
| Hub construction | compose existing core services: extend `services/business` with projects + A2K ingestion + the `a2k://` MCP surface; extract `core/internal/registry` into the defaults registry service its README already plans; front both at `hub.a3t.app` | business-service is ~80% of the Hub (immutable revisions, visibility, outbox, MCP); a fresh Hub would be reinvention |
| Hub language | Go, reusing `core/pkg/{server,config,auth,authz}` | house harness; three-way authn and Keto checks come free |
| Open-core path | spec, schemas, TS SDK, and CLI are open now; the self-host reference Hub is extracted from the settled core services later, with `a3t-sdk` as the extraction vehicle | extraction after the shape settles beats maintaining a parallel OSS twin from day one |
| CLI end state | Go, identical command surface to the P0 TypeScript CLI | no interpreter startup in the shell hook; release artifacts cosign-signed (rapid's pipeline as the template) |
| TypeScript packages | remain the protocol reference SDK (validator, bootstrap, adapter-sdk) on npm | ecosystem needs an embeddable validator; the spec stays implementation-backed |
| Desktop | Wails (Go + Svelte 5), reusing the A3T design system and Wails skills; shells out to the CLI for all state | three prior in-house Wails apps and an existing design system; Tauri would be a fourth stack. Consolidation with the existing `a3tai/desktop` app (which owns the `a3tai://` scheme) is an open product decision |
| System of record | Postgres, shared core migrations path | boring; business-service already took this route |
| Index and memory | Zikra (namespace per project) | governed team memory already built; MIT |
| Code structure knowledge | codebase-memory-mcp per repository | already in daily use |
| AuthN | Kratos (humans), Hydra (OAuth2: device flow for CLI, client credentials for service agents, token exchange for on-behalf-of); clients seeded by script since DCR is disabled | existing a3t-auth stack, consent-server already mints tenant/roles claims |
| AuthZ | Keto via `core/pkg/authz`, checked only in Hub middleware; the project entity becomes the first real consumer of the declared OPL hierarchy | single enforcement point; ADR 0002 in core explicitly deferred this reconciliation |
| Bundle signing | Ed25519 `.kpkg` (the `a3t-sdk`/Kingpin line), hardened per the current Kingpin tree: canonical file-digest bundle signature, fail-closed trust policy, re-verify at execution, trust-key set with key IDs and validity windows, publish-time verification | this is the signing system that actually exists and runs; a Sigstore migration can layer a transparency log later without changing the artifact |
| Session handoff | Paperclip adapter (MIT), plus read adapters to the PM tools already in use | active upstream; fork only on divergence |

## Hub

### Data model (Postgres)

`organizations`, `teams`, and `team_memberships` already exist in core (`migrations/005_organizations.sql`) and are reused, not duplicated; the rows below marked new are the Hub's additions.

| Table | Purpose |
|---|---|
| `organizations` | tenant root; billing and policy anchor (existing) |
| `teams` | grouping within an org (existing) |
| `memberships` | principal-to-org/team with role and classification ceiling |
| `principals` | humans, agents, and service accounts; agents link to an owning human or team and a Hydra client |
| `projects` | maps 1:1 to an A2K ProjectBootstrap manifest id (new; the one genuinely new entity) |
| `sources` | git repos and adapter endpoints feeding a project |
| `documents` | metadata + provenance for each knowledge object: source ref, revision, digest, kind (adr, rfc, runbook, facts, doc), classification |
| `bundles` / `bundle_versions` | defaults registry: content-addressed, signed versions with publisher identity |
| `secret_bindings` | references to org secret-provider entries (provider, item ref, scope); never values |
| `handoff_links` | project to Paperclip workspace/ticket mappings |
| `audit_log` | append-only record of authz decisions, publishes, setup approvals |

Grants live in Keto; Postgres rows carry the attributes (classification, kind, project) that Keto checks against.

### Identity

- Humans sign in with OIDC (Kratos + Hydra), CLI uses the OAuth device flow, desktop reuses the CLI token store.
- Agents are principals with their own Hydra client; interactive agents act on behalf of a human via token exchange, so the effective grant is the intersection of agent and human.
- Tokens carry org, principal, and audience claims; the Hub rejects tokens minted for other audiences.

### Authorization

Keto namespaces: `org`, `team`, `project`, `doc`.
Roles per org/team/project: `viewer`, `member`, `maintainer`, `owner`, mirroring a normal company.
The ABAC dimension is the classification ceiling on `memberships`: a document is visible when the principal has a project relation AND `document.classification <= membership.ceiling`.
Both checks run in one Hub middleware for REST and MCP alike; nothing downstream re-filters.
Deny is the default; an unknown kind or missing classification is treated as `restricted`.

### Knowledge plane

```text
git push / adapter poll
  -> ingest: fetch changed files from source
  -> validate: a2k validator (manifests) + kind schema (facts, adr, ...)
  -> store: documents row with provenance (source, revision, sha256)
  -> index: Zikra namespace <project-id>, classification as metadata
```

Zikra gets one namespace per project; classification filtering happens in the Hub before results leave, which resolves RFC 0001's open question (no namespace-per-classification explosion).
Operational facts (auth providers, cloud accounts, SaaS inventory, VPN/Tailscale topology, URLs, domains) are typed YAML documents of kind `facts` in the project repo, validated on ingest, initially under an `x-facts` profile until the spec adopts it.
Search and retrieval always go through the Hub; Zikra credentials never reach clients.

### MCP surface

| Kind | Name | Behavior |
|---|---|---|
| resource | `a2k://<project>/doc/<id>` | document content at the caller's grant |
| tool | `search_knowledge` | Zikra-backed search within granted projects and ceiling |
| tool | `get_document` | fetch by id with provenance |
| tool | `list_projects` | projects the principal can see |
| tool | `get_facts` | typed operational facts, filtered by classification |
| tool | `propose_change` | opens a typed proposal (spec contribution semantics); never writes directly |

Transport is streamable HTTP with OAuth; the stdio `packages/mcp-server` remains the offline/local reference.

### Defaults registry and setup

The defaults registry is the extraction of `core/services/core/internal/registry` (catalog, immutable versions, S3 bundle store, approve/disable lifecycle, per-tenant installs) that its own README already plans.
Artifacts stay `.kpkg` bundles per `a3t-sdk` (`a3t.plugin.yaml`, `a3t.dev/v1`), extended with `runtime.type: skill` so shared skills ride the same signed pipeline that plugins and agents do; A2K catalog records are the descriptors, pointing at bundles via `spec.artifact{uri, digest}`.
Signing is Ed25519 with the hardening the current Kingpin tree proved out, closing the known gaps:

- the signature covers a canonical file-digest list, not just the manifest (fixes the `a3t-sdk` content-integrity gap);
- the registry verifies signatures at publish and derives trust from the verifying key, never from a self-declared author field;
- stored bundle digests are re-checked on download and at execution, not write-and-display;
- the trust store is a set of keys with IDs and validity windows, not one env-var root;
- unknown trust values and missing verifiers reject; declared capabilities either map to an enforced control or are removed.

Resolution for `a3t setup` is org defaults, then team, then project, then principal overrides, deep-merged in that order.
The output is a bootstrap plan in the same reviewable shape `@a2k/bootstrap` emits today: the user sees the complete diff before anything is written.
Server-side Core may auto-install `is_core` plugins into its own sandboxed runtime; developer machines are a different trust domain and `a3t setup` never auto-installs anything there.

### Secret broker

The Hub stores bindings, not secrets: provider (1Password Connect, Vault, AWS Secrets Manager), item reference, and the scope that may read it, following Kingpin's `vault-credential:<uuid>` reference pattern with sanitize-before-read.
A granted client exchanges its access token for a short-lived provider credential at use time.
Secrets never appear in manifests (validator-enforced), bundles, shell exports, or Hub storage.

### Session handoff

`a3t handoff` packages session context (task, thread, relevant document refs) and posts it to the org's Paperclip deployment through `handoff_links`; agents resume by pulling the ticket.
Existing project management stays connected read-only through the Linear/Jira/GitHub adapters, which map issues into `documents` references.

## Local surface

- The CLI owns all local state under `~/.a3t` (token store, active project, cached bundle verification keys).
- The shell hook exports validated `A2K_*` metadata only and works fully offline; Hub outage degrades to local-manifest behavior, never to a broken shell.
- `a3t bootstrap` and `a3t setup` write only reviewable output under `.a2k/generated/` or user-approved config paths.
- The desktop tray app renders CLI state and Hub status; every action it offers is a CLI command.

## Any-agent surface

The product promise is agent-agnostic: install a3t, and whatever coder the user runs (Claude Code, Codex, OpenCode, Gemini CLI, OpenClaw, Paperclip agents, the next one) just works.
a3t owns no agent runtime; it treats every agent as a client to configure through three universal channels, in order of preference:

1. **MCP**: the Hub endpoint serves any MCP-capable client; for clients that only speak stdio, `a3t mcp` is a local bridge to the same surface.
2. **Generated config**: the bootstrap planner detects installed agents and emits each one's native config from one internal model, exactly as it does for editors. Every writer is an adapter (`claude-code`, `codex`, `opencode`, `gemini`, `openclaw`, ...); adding an agent is adding a writer, never a protocol change.
3. **Environment**: the `A2K_*` variables from the shell hook are the floor; an agent that reads nothing else still knows the project, classification, and manifest path.

Knowledge connection is declarative: a source named in the manifest (git repo, docs hub, PM tool, chat archive) is ingested, indexed, and vectorized by the Hub pipeline into Zikra automatically; "connect it" is the only user verb, and search is one MCP tool regardless of where the knowledge lives.

## The work loop

Work moves through five phases: **Research, Plan, Work, Review, Publish**.
The loop is understood generically by the protocol and specifically by each project:

| Phase | Generic (protocol) | Specific (per-project binding) |
|---|---|---|
| Research | read surface: `search_knowledge`, `get_document`, `get_facts` | which sources and indexes are in scope |
| Plan | draft a typed proposal (RFC/ADR/design shapes from the spec's contribution semantics) | the project's templates and where plans live |
| Work | an agent session with full context: manifest, exports, MCP, handoff links | repo conventions, worktree rules, task tracker |
| Review | typed proposal review: approve, reject, request changes; complete-diff review for anything touching a machine | who reviews, required gates (CI, code review) |
| Publish | source-system commit or receipt; indexes rebuild as derived evidence | merge target, deploy pipeline, announcement channel |

Generic semantics are already the spec's knowledge-change flow; the specific bindings are declared per project in the manifest (an `x-workflow` extension until the spec adopts a workflow profile) so any agent can ask "what does Review mean here?" and get an answer from the same MCP surface it uses for everything else.
Session handoff (Paperclip) carries the current phase with the context, so work resumes mid-loop on another machine or agent.

## Editor integration

The same connect-don't-reinvent stance: editors get the Hub through their native MCP clients, and the a3t extension is a thin adapter over the CLI, never a second implementation.
(Survey of the Aug 2026 editor landscape: VS Code MCP has been GA since 1.102 with a stable `McpServerDefinitionProvider` API; VS Code, Cursor, Claude Code, and Windsurf all speak streamable HTTP with spec OAuth.)

The load-bearing decision: the Hub MCP endpoint implements the MCP authorization spec fully - RFC 9728 protected-resource metadata, RFC 8414 auth-server metadata, and RFC 7591 dynamic client registration on Hydra.
Then every editor authenticates with its built-in OAuth flow and zero a3t client code, and per-user grants land at the Keto-checked middleware exactly as designed.
Hydra currently runs with DCR disabled platform-wide; enabling it is a deliberate, scoped change for MCP client registration only, with anonymous DCR clients constrained to the Hub audience.
The CLI's device flow remains for terminal and REST use.

One internal server model, four config carriers, emitted by the bootstrap planner:

| Editor | File | Envelope | Plan |
|---|---|---|---|
| VS Code | `.vscode/mcp.json` | `servers`, `"type": "http"` | repo plan |
| Claude Code | `.mcp.json` | `mcpServers`, `"type": "http"` | repo plan |
| Cursor | `.cursor/mcp.json` | `mcpServers`, `url` | repo plan |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers`, `serverUrl` | machine plan (`a3t setup`), merge by server name |

All four point at the same Hub URL with the project carried in a static header; static values only (env-expansion syntax diverges across editors), and never a secret in any file.

The VS Code extension (also running unmodified in Cursor and Windsurf via Open VSX) does exactly: status bar showing project id, classification, and login state from `a3t status --json`; an `McpServerDefinitionProvider` registering the Hub (feature-detected so forks fall back to the emitted file); terminal env injection of `A2K_*` via `EnvironmentVariableCollection` (the direnv-extension pattern, composing with the shell hook); command wrappers for login, setup (plan shown as a diff first), and validate; a getting-started walkthrough; workspace-trust gating for anything that executes.
The CLI grows `--json` output modes and stays the owner of tokens, validation, verification, and setup; the extension stores nothing and does not bundle the CLI (detect and offer install instead).

Publishing: the extension dual-publishes to the VS Code Marketplace and Open VSX under the same ID with a3t.app publisher verification; the Hub MCP server is listed in the official MCP registry under a DNS-verified `app.a3t/*` namespace, which cascades to the GitHub MCP registry and VS Code's in-product gallery; a dev container Feature (`ghcr.io/a3tai/features/a3t`) installs the cosign-verified CLI and seeds the extension for devcontainer/Codespaces onboarding; self-hosted orgs point VS Code and Windsurf enterprise registry settings at their own Hub.
Skipped deliberately: Copilot chat participants and LM tools (VS Code plus Copilot only; MCP is the cross-editor surface), extension-side token brokering, and bundling the CLI in the VSIX.

## Deployment

Hosted: `hub.a3t.app` routes to the composed core services (extended business service and the extracted defaults registry) in the `a3t-hub` namespace on the existing EKS clusters (namespace-per-product), RDS Postgres, the shared Ory stack in `a3t-auth`, and a managed Zikra deployment; delivery via Flux like every other A3T service, ingress via the existing Cloudflare Tunnel.
The first ingested knowledge source is `a3tai/docs`, the estate's live A2K OrganizationHub.
Self-hosted: one `docker compose up` with the hub services, Postgres, and Zikra; Ory images optional when the org brings its own OIDC (core's compose stack is the template).

## Trust boundaries and failure posture

- Manifests, documents, adapter output, bundles, and model output are untrusted data everywhere; validation and signature checks gate each ingress.
- The Hub MCP/REST middleware is the only policy enforcement point; a compromised client holds only what its grant already allowed.
- A compromised registry publisher is bounded by publisher pinning and org review before a version becomes default.
- Hub unavailable: reads degrade to local manifests and caches; nothing queues writes on the client.
- Every authz denial, publish, and setup approval lands in `audit_log`.
