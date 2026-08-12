# RFC 0001: A2K product surface

- **Status:** draft
- **Audience:** Contributors, maintainers, and A3T product

## Summary

This RFC defines the product surface built on the A2K specification: a command-line tool with directory-aware shell integration, a central multi-tenant service called the A2K Hub, a desktop tray application, and a signed defaults registry.
The goal is that a new person at a company can install one tool, sign in once, select a project, and have their agents connected to governed organizational knowledge with correct access controls.
The specification, schemas, CLI, server, and desktop application are open source under MIT.
A3T operates a paid hosted Hub at `a2k.a3t.ai`; self-hosting is a first-class supported path.

## Motivation

Organizations accumulate knowledge that agents need: docs, ADRs, RFCs, runbooks, and operational facts such as auth providers, cloud accounts, SaaS inventory, VPN and Tailscale topology, URLs, and domains.
Today each person hand-wires MCP servers, agent configs, skills, and secrets per machine, and nothing enforces who may see what.
A2K already specifies the governed knowledge model (manifests, overlays, classification, review-first bootstrap).
This RFC specifies the running system that makes the specification usable end to end.

## Scope and non-goals

In scope: the `a2k` CLI, shell integration, the Hub service and its identity/authorization model, the defaults registry, the desktop application, session handoff, and distribution channels.

Non-goals:

- Replacing project management tools; the Hub connects to them and to a session-handoff service, it does not reimplement them.
- Secret storage in manifests or repositories; the validator already rejects credential-like content and this stays normative.
- A proprietary protocol; every Hub capability is exposed through the profiles the spec already names (MCP, OAuth/OIDC, knowledge adapters, Agent Skills).

## Detailed design

### Components

| Component | Repo location | Role |
|---|---|---|
| `a2k` CLI | `packages/cli` | validate, inspect context, plan bootstrap, shell hook, auth, project selection |
| Shell integration | emitted by `a2k hook` | direnv-style directory-aware environment for agents |
| A2K Hub | `packages/hub` (future) | multi-tenant knowledge control plane |
| Desktop app | `apps/desktop` (future) | tray icon, settings, project selector |
| Defaults registry | Hub subsystem | signed bundles of shared agents, skills, and connectors |

### CLI and shell integration

The CLI is the only local mutation path and it stays review-first.
`a2k context` finds the nearest `.a2k/manifest.yaml` by walking up from the working directory, validates it, and reports the resolved project context.
`a2k bootstrap` wraps the existing `@a2k/bootstrap` planner and writes proposed client configurations under `.a2k/generated/` only when asked; nothing is activated without the user wiring it in.
`a2k hook zsh|bash` emits a shell snippet, analogous to `direnv hook`, that re-exports `A2K_*` metadata variables when the working directory crosses a manifest boundary.
Version 0 exports metadata only: project id, name, kind, classification, and manifest path.
The hook never executes manifest content and never emits secrets; secret material arrives only later, brokered by the Hub as short-lived credentials, and never lands in the manifest or shell history.

### Hub

The Hub is the central service users connect to.
Its data model is organizations, teams, projects, and principals (humans and agents), matching how companies already structure access.

Identity and authorization compose the existing A3T stack: OIDC login and OAuth device flow for the CLI via Hydra/Kratos, and relationship-based access control via Keto for RBAC with attribute conditions (classification, team, project) supplying the ABAC dimension.
Every knowledge object carries the spec's classification level, and the policy check is enforced at the MCP boundary, not in the client.

The Hub exposes:

- a remote MCP context server serving governed documents, ADRs, RFCs, and operational facts as read-only resources scoped by the caller's grants;
- Zikra as the shared memory and index layer, with all Hub documents indexed into per-project Zikra namespaces, and codebase-memory-mcp for structural code knowledge;
- a setup service that resolves which defaults (agents, skills, connectors, MCP settings) apply to a principal in a project;
- adapters to existing project management (Linear, Jira, GitHub) per the knowledge-adapters profile;
- session handoff by connecting to a Paperclip deployment (MIT licensed), starting as an adapter with a fork only if upstream direction diverges.

### Setup mode and progressive discovery

`a2k setup` runs after login and project selection.
It fetches the resolved defaults bundle for the principal, verifies signatures, and produces a bootstrap plan (the same reviewable shape `@a2k/bootstrap` emits today) covering agent configs, skills, connectors, and MCP client settings.
The user reviews the complete diff and approves; approval writes local configuration.
Progressive discovery means a new machine needs exactly: install, `a2k login`, `a2k use <project>`, `a2k setup`.
After that, entering any checkout of a project repository gives agents the right context automatically via the shell hook and generated client configs.

### Signed defaults registry

Shared agents, skills, and connectors are distributed as content-addressed bundles signed with Sigstore/cosign, following the Kingpin plugin model.
The Hub verifies signatures on publish; the CLI verifies again on install.
Unsigned or tampered bundles fail closed.
Organizations can pin trusted publishers and require review before a bundle version becomes the org default.

### Desktop application

A small Tauri app (MIT/Apache dependencies only) providing a tray icon, login state, a project selector that switches the active context, and settings.
It is a thin client over the same local CLI state and Hub APIs; it owns no logic of its own.

### Distribution

- `curl -fsSL https://a2k.a3t.ai/install.sh | bash`: the script in this repository, which installs from source today and switches to prebuilt binaries once releases exist.
- Homebrew tap `a3tai/tap/a2k`.
- npm `@a2k/cli` for Node users.
- Single static binary is the target for v0.2 so the shell hook has no interpreter startup cost.

### Open-core boundary

Open source (MIT): specification, schemas, fixtures, CLI, Hub server, desktop app, adapters, and the registry tooling.
Paid (A3T hosted): the multi-tenant `a2k.a3t.ai` Hub with managed identity, managed Zikra, uptime, and support.
Nothing in the hosted product depends on closed protocol extensions; a self-hosted Hub is functionally equivalent.

## Security and privacy impact

- Discovery remains distinct from trust; all Hub responses, bundles, and adapter output stay untrusted data until verified and reviewed.
- The MCP boundary is the single policy enforcement point; clients never receive documents above their grant, so a compromised client cannot leak what it never held.
- Manifests remain credential-free; the existing validator checks become a conformance requirement for the Hub's publish path too.
- Bundle signing plus publisher pinning bounds the blast radius of a compromised registry account.
- The shell hook only exports metadata derived from a validated manifest and is safe against hostile repositories by construction.

## Compatibility

No changes to the v0alpha1 manifest schema.
The `a2k` bin moves from `@a2k/validator` to `@a2k/cli`; the validator remains a library plus `a2k validate`.

## Alternatives considered

- Electron for the desktop app: heavier, no capability gain over Tauri for a tray-and-settings app.
- Building session handoff in-house: Paperclip is MIT, active, and adapter-friendly; forking preemptively duplicates maintenance.
- Env-file secrets in the shell hook (direnv style): rejected; secrets stay brokered and short-lived.
- Closed-source Hub: rejected; the spec only matters if the reference service is inspectable and self-hostable.

## Conformance changes

Accepting this RFC adds Hub and CLI conformance roles in a later spec revision: enforcement at the MCP boundary, credential-free publish validation, signed-bundle verification, and review-first local mutation.

## Implementation plan

Tracked as the product track in `docs/roadmap.md`: CLI and shell hook first, then read-only Hub MCP with OAuth, then setup mode and registry, then desktop and handoff.

## Unresolved questions

- Exact Keto namespace design for classification-conditioned grants.
- Whether Zikra namespaces map 1:1 to projects or to project-plus-classification pairs.
- Binary packaging (Node SEA vs Bun compile vs Go rewrite of the CLI hot path).
- Paperclip adapter surface once its plugin API stabilizes.
