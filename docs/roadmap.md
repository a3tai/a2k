# Draft roadmap

Two tracks proceed in parallel.
The specification track hardens the normative core.
The product track, defined in [RFC 0001](rfcs/0001-product-surface.md), ships the running system.

## Specification track

### Milestone 0 — repository scaffold

- governance, security policy, architecture, and RFC process;
- core manifest plus profile schemas;
- valid/invalid fixtures;
- TypeScript validator, review-only bootstrap planner, adapter interfaces, and read-only MCP contracts.

### Milestone 1 — normative core

- authority and conflict-resolution algorithms;
- document metadata and lifecycle schemas;
- monotonic overlay evaluator and negative tests;
- schema compatibility policy and generated reference docs.

### Milestone 2 — contribution and identity

- proposal/decision/receipt semantics;
- OAuth/OIDC profile pinned to reviewed RFCs;
- read/propose/review/approve scope matrix;
- separation-of-duties and delegation tests.

### Milestone 3 — adapters and MCP

- stable v1 MCP stdio server with read-only resources;
- OKF, KCP, Backstage, OpenAPI, A2A, ACP, and Agent Skills mapping fixtures;
- remote MCP/OAuth work only after separate threat-model approval.

### Milestone 4 — onboarding pilot

- previewable client-specific configuration writers;
- two project pilots and an organization hub/private overlay pair;
- independent consumer or conformance implementation.

### Milestone 5 — v0.1 release candidate

- compatibility, security, privacy, naming, and interoperability review;
- complete release diff and conformance report;
- known limitations and migration plan.

## Product track

### P0 - CLI and shell integration

- `a3t` CLI: validate, context, bootstrap planning, shell hook, metadata exports;
- `install.sh` source install;
- review-first local mutation only.

### P1 - Hub read path

- Hub service with organizations, teams, projects, and principals;
- OIDC login and OAuth device flow for the CLI;
- read-only remote MCP context server with Keto-enforced grants at the MCP boundary;
- Zikra indexing of Hub documents into per-project namespaces.

### P2 - setup mode and signed registry

- `a3t login`, `a3t use`, and `a3t setup` with reviewable defaults bundles;
- Sigstore/cosign bundle signing, publisher pinning, fail-closed verification;
- brokered short-lived secrets, never in manifests or shell history.

### P3 - desktop and handoff

- Tauri tray app: login state, project selector, settings;
- Paperclip adapter for session handoff;
- project management adapters (Linear, Jira, GitHub);
- Homebrew tap and prebuilt binaries.
