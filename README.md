# A2K — Agent-to-Knowledge

> The governed knowledge fabric for organizations and their agents.

A2K is an early, implementation-backed specification for discovering, accessing, reviewing, and contributing to organizational knowledge. It is stewarded by [A3T](https://a3t.ai) and developed in public.

**Status:** `v0alpha1` draft. A2K is not yet a stable or independently standardized protocol.

## What A2K defines

- a repository bootstrap at `.a2k/manifest.yaml`;
- authority, classification, provenance, lifecycle, and contribution semantics;
- monotonic public/private overlays;
- reviewable local-agent bootstrap plans;
- profiles for MCP, OAuth/OIDC, knowledge adapters, A2A, ACP, and Agent Skills;
- schemas, negative fixtures, and role-specific conformance claims.

A2K composes existing standards rather than replacing them. Git remains the reviewed documentation authority. MCP supplies runtime tool/resource access; OAuth/OIDC supplies identity and delegated authorization; A2A and ACP supply agent communication in their respective domains.

## Safety model

Discovery is not trust, authorization, installation, or execution. A2K consumers must treat manifests, documents, remote references, adapter output, and model output as untrusted data. The reference implementation is read-only by default and produces proposed configuration changes for review rather than applying them.

## The a3t CLI

A2K names the protocol; `a3t` is the tool that speaks it.
Install from source (Node.js >= 24 and git required):

```bash
curl -fsSL https://a3t.app/install.sh | bash
```

The `a3t` CLI validates manifests, shows the directory-aware project context, plans reviewable client bootstrap configuration, provides a direnv-style shell hook, and supports Hub identity state:

```bash
a3t context          # nearest validated .a2k/manifest.yaml, walking up from $PWD
a3t validate         # validate a manifest
a3t bootstrap --target claude-code --target pi  # review native files and note approvalDigest
a3t bootstrap --target claude-code --target pi --write sha256:<reviewed-digest>
a3t login            # OAuth device flow against id.a3t.dev
a3t use https://a3t.ai/a2k/projects/example
a3t status --json    # never emits access or refresh tokens
eval "$(a3t hook zsh)"   # in ~/.zshrc: exports A2K_* metadata on directory change
```

The hook exports metadata only (project id, name, kind, classification, paths); the variables are named `A2K_*` because they carry protocol context.
It never executes manifest content and never emits secrets. Hub tokens and the default project are stored in a private `~/.a3t/state.json`; set `A3T_HOME` only when an isolated state directory is required.
For a complete collaborator setup, including the shell hook, manifest verification, review-first agent configuration, and safe verification, follow [`ONBOARDING.md`](ONBOARDING.md).

The broader product surface (central Hub, setup mode, signed defaults registry, desktop app) is defined in [RFC 0001](docs/rfcs/0001-product-surface.md), with the full design in [`docs/design/product-architecture.md`](docs/design/product-architecture.md) and the build-out sequence in [`docs/design/implementation-plan.md`](docs/design/implementation-plan.md).

## Repository map

- [`spec/v0.1/`](spec/v0.1/) — draft normative specification
- [`schemas/v0.1/`](schemas/v0.1/) — JSON Schema Draft 2020-12 schemas
- [`fixtures/`](fixtures/) — conformance fixtures
- [`examples/`](examples/) — non-normative examples
- [`packages/`](packages/) — TypeScript reference components
- [`docs/design/architecture.md`](docs/design/architecture.md) — architecture overview
- [`docs/design/product-architecture.md`](docs/design/product-architecture.md) — a3t product system design
- [`docs/design/implementation-plan.md`](docs/design/implementation-plan.md) — phased build-out plan
- [`docs/design/ecosystem-context.md`](docs/design/ecosystem-context.md) — what the estate already provides and what a3t reuses
- [`docs/landscape.md`](docs/landscape.md) — standards and adapter landscape
- [`docs/roadmap.md`](docs/roadmap.md) — staged implementation roadmap
- [`SECURITY.md`](SECURITY.md) — security policy and threat boundaries
- [`GOVERNANCE.md`](GOVERNANCE.md) — maintainer-led RFC governance

## Development

Requirements: Node.js 24 and npm 11.9.0.

```bash
npm ci --ignore-scripts
npm test
node packages/validator/dist/cli.js examples/project-bootstrap/.a2k/manifest.yaml
```

Dependency scripts are disabled during bootstrap. Review any proposed exception before allowing it.

## Naming note

“A2K” also has established uses, including “Access to Knowledge,” and adjacent commercial uses. This repository uses **Agent-to-Knowledge**. That selection is not a trademark opinion.

## License

MIT. See [`LICENSE`](LICENSE).
