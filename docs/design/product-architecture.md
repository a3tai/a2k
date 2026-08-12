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

## Implementation decisions

| Decision | Choice | Rationale |
|---|---|---|
| Hub language | Go, single binary | matches A3T production services, static deploys, one-binary self-host |
| CLI end state | Go, same repo as Hub code, identical command surface to the P0 TypeScript CLI | no interpreter startup in the shell hook; cosign-signed release artifacts |
| TypeScript packages | remain the protocol reference SDK (validator, bootstrap, adapter-sdk) on npm | ecosystem needs an embeddable validator; the spec stays implementation-backed |
| Desktop | Tauri, shells out to the CLI for all state | no daemon and no second implementation of anything |
| System of record | Postgres | boring, fits RDS and docker compose alike |
| Index and memory | Zikra (namespace per project) | governed team memory already built; MIT |
| Code structure knowledge | codebase-memory-mcp per repository | already in daily use |
| AuthN | Kratos (humans), Hydra (OAuth2: device flow for CLI, client credentials for service agents, token exchange for on-behalf-of) | existing a3t-auth stack |
| AuthZ | Keto relation tuples, checked only in Hub middleware | single enforcement point; clients never filter |
| Bundle signing | Sigstore/cosign, content-addressed artifacts | Kingpin model, fail closed |
| Session handoff | Paperclip adapter (MIT) | active upstream; fork only on divergence |

## Hub

### Data model (Postgres)

| Table | Purpose |
|---|---|
| `organizations` | tenant root; billing and policy anchor |
| `teams` | grouping within an org |
| `memberships` | principal-to-org/team with role and classification ceiling |
| `principals` | humans, agents, and service accounts; agents link to an owning human or team and a Hydra client |
| `projects` | maps 1:1 to an A2K ProjectBootstrap manifest id |
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

A bundle is a tar.gz with a `manifest.json` naming each artifact (agent configs, skills, connectors, MCP client settings), its sha256, and its target path semantics.
Bundle versions are content-addressed and cosign-signed; the Hub verifies on publish, the CLI verifies on install, and unsigned or tampered bundles fail closed.
Resolution for `a3t setup` is org defaults, then team, then project, then principal overrides, deep-merged in that order.
The output is a bootstrap plan in the same reviewable shape `@a2k/bootstrap` emits today: the user sees the complete diff before anything is written.

### Secret broker

The Hub stores bindings, not secrets: provider (1Password Connect, Vault, AWS Secrets Manager), item reference, and the scope that may read it.
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

## Deployment

Hosted: `hub.a3t.app` in the `a3t-hub` namespace on the existing EKS clusters (namespace-per-product), RDS Postgres, the shared Ory stack in `a3t-auth`, and a managed Zikra deployment; delivery via Flux like every other A3T service.
Self-hosted: one `docker compose up` with hub, Postgres, and Zikra; Ory images optional when the org brings its own OIDC.
The Hub binary is identical in both.

## Trust boundaries and failure posture

- Manifests, documents, adapter output, bundles, and model output are untrusted data everywhere; validation and signature checks gate each ingress.
- The Hub MCP/REST middleware is the only policy enforcement point; a compromised client holds only what its grant already allowed.
- A compromised registry publisher is bounded by publisher pinning and org review before a version becomes default.
- Hub unavailable: reads degrade to local manifests and caches; nothing queues writes on the client.
- Every authz denial, publish, and setup approval lands in `audit_log`.
