# Ecosystem context

What already exists across the A3T and Kingpin estate, and what the a3t product reuses from it.
Surveyed 2026-08-11; paths are local checkouts on Steve's machine, repos live under github.com/a3tai and github.com/kingpinsec.
This document exists so the Hub build integrates the estate instead of reinventing it; the decisions it feeds live in [product-architecture.md](product-architecture.md).

## Reuse map

| Need | Already exists | Where |
|---|---|---|
| Service harness | chi + zerolog + pgx/sqlc + OTEL + auth middleware + health, env-only config | `core/pkg/{server,config,auth,authz,db,crypto,contentvault}` |
| Hub service shape | tenant-scoped knowledge service: immutable record revisions, content hashes, visibility levels, outbox projection, REST + MCP in one boundary | `core/services/business` (copy `cmd/business-api/main.go` and `internal/api/mcpapi/` wholesale) |
| MCP server | official Go SDK, streamable HTTP, stateless, auth-group mounted, tenant only from credentials | `core/services/business/internal/api/mcpapi` |
| Orgs and teams | Postgres tables plus Keto OPL hierarchy (declared, unused on token path) | `core/migrations/005_organizations.sql`, `core/ory/keto/namespaces.a3t.ts` |
| Identity | Kratos + Hydra + consent-server minting tenant/roles/permissions claims; JWKS validation; device-flow-capable; DCR disabled so clients are seeded by script | `core/services/consent-server`, `core/pkg/auth`, `core/infra/scripts/seed-admin-oauth-client.sh` |
| Bundle format and signing | `.kpkg` zip + `a3t.plugin.yaml` (`a3t.dev/v1`), Ed25519, trust tiers 0-3 | `a3tai/a3t-sdk` (`manifest/`), extracted from Kingpin |
| Bundle hardening | canonical file-digest bundle signature, zip-bomb and Zip-Slip defenses, fail-closed trust policy, re-verify at every execution, sandbox probing | `~/prj/kingpinsec/kingpin` at `services/pkg/domain/plugin/{bundle,trust_policy,verify}.go` (current tree; the `a3tai/kingpinsec-*` clones are ~172 commits stale and still fail-open) |
| Artifact registry | catalog + versions (immutable), S3 bundle store, approve/disable lifecycle with audit, publish CI, per-tenant installs, RLS | `core/services/core/internal/registry` (+ `migrations/014`, `020`), `a3tai/plugins-official` workflows; registry README already plans extraction into its own service |
| Plugin/agent runtime | subprocess pluginhost (verify, confined unzip, Landlock/seccomp, egress proxy, 60s tenant-scoped tokens), event outbox dispatcher, Temporal | `core/services/core/internal/{pluginhost,events,worker/dispatcher}` |
| Secrets pattern | `vault-credential:<uuid>` refs in config, sanitize-before-read, envelope encryption | Kingpin `secret_refs.go`; `core/pkg/{crypto,contentvault}` |
| First A2K consumer | `a3tai/docs` is a live `OrganizationHub` manifest with governance CI, estate audit, and content-addressed archive manifests | `docs/.a2k/manifest.yaml`, `scripts/governance.py` |
| Release pipeline for a CLI | tag-driven build with cosign-signed artifacts | `a3tai/rapid/.github/workflows/release.yml` |
| Prior art, same author | BSpec: shipped spec + schemas + hosted MCP (mcp.bspec.dev) + Go CLI | `a3tai/bspec`; A2K already lists BSpec as an adapter target |

## Corrections this survey forced

- **Signing is Ed25519, not Sigstore.** Nothing in the estate uses cosign for bundles; the working system is raw Ed25519 over a canonical bundle digest. The product keeps that line and hardens it (trust-key set, publish-time verification) instead of introducing a second scheme; cosign remains only for released CLI binaries.
- **The a3t-sdk signature gap**: `a3t-sdk` signs only the manifest, and its manifest carries no file digests, so bundle contents are unsigned. Kingpin's current tree already fixed this with a detached signature over a canonical file-digest list; port that back before any defaults bundle ships.
- **Registry trust anti-patterns to avoid** (present in Kingpin today): trust from `author` string equality instead of the verifying key; publish path that never verifies signatures; stored `bundle_sha256` never re-checked on download; trust tiers advertised with no verifier; capability declarations with no enforcement. Each gets the opposite behavior in the Hub registry.
- **Auto-install vs review-first**: Core auto-installs `is_core` plugins into its own server-side runtime; that stays. Anything `a3t setup` does to a developer machine is proposal-plus-approval, always. The two trust domains never share an install path.
- **`a3tai/one` is archived** by ADR 0001 in `a3tai/docs`; its designs (notification policy, ADR 0015 agent isolation levels) re-enter only as new evidence through new ADRs.

## Desktop lineage

Three prior in-house desktop apps exist, all Wails: `a3tai/desktop` (Wails v2 + Svelte, the "A3T" OpenClaw operator console, owns the `a3tai://` URL scheme, keychain, bbolt, ClawHub registry client), `a3tai/source` (Wails v3 + React agent dashboard with sandbox runtime), and `a3tai/source-old` (Wails v3 + Svelte, archived).
There is also an established A3T design system and Wails skill set (`core/.claude/skills`: wails-desktop, frontend, design).
Consequence: the tray app is Wails (Go + Svelte 5), not Tauri, reusing that design system; whether it merges into `a3tai/desktop` or ships standalone is an open product decision, and the `a3tai://` scheme plus keychain slots must be shared, not duplicated.

## Skills reality

`a3tai/skills` holds 5 unversioned, unsigned SKILL.md dirs targeting OpenClaw; the estate audit in `a3tai/docs` counts 113 SKILL.md files across repos with heavy duplication (baseline, git-commit, linear-workflow, researcher recur per repo).
That duplication is the concrete case for the defaults registry: skills become signed `.kpkg` artifacts (`runtime.type: skill` added to `a3t.dev/v1`) referenced by A2K catalog records with digests, replacing per-repo copies.

## Naming and collision notes

- `a3tai/docs` maps a root named `registry` (repository governance); the artifact registry is therefore always called the **defaults registry** in product docs.
- The `a3tai/desktop` app is already named "A3T" on machines; the CLI `a3t` and any new tray app must not fight it for the scheme or keychain entries.
- `rapid` (`@a3t/rapid`, bins `rapid`/`rapidd`) and `infra` (bin `infra`) and `bspec` (bin `bspec`) are prior CLIs; no binary-name collision with `a3t`, but `rapid`'s daemon and command UX are the closest prior art for the shell-hook boundary.
- Kingpin work happens in `~/prj/kingpinsec/*` (live) while `a3tai/kingpinsec-*` are stale clones; always harvest from the live tree.
