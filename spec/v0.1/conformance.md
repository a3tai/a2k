# A2K v0.1 conformance — Draft

A conformance claim names the version, actor role, and profiles.

## Roles

- **Producer:** writes manifests or governed records.
- **Consumer:** discovers, validates, resolves, and presents knowledge.
- **Adapter:** maps an external system to or from A2K semantics.
- **Bootstrapper:** proposes local agent configuration.
- **Service:** exposes A2K capabilities through a runtime binding such as MCP.

## Core requirements

A core consumer MUST:

1. discover only `.a2k/manifest.yaml` at the repository root;
2. enforce YAML and size restrictions;
3. reject unsupported versions and invalid schemas;
4. keep discovery separate from trust and authorization;
5. reject ambiguous same-ID records;
6. surface contradictions and unresolved references;
7. avoid remote fetch and mutation unless explicitly enabled by local policy.

## Profile claims

Examples:

- `A2K v0.1 Core Consumer`
- `A2K v0.1 Private Overlay Producer`
- `A2K v0.1 MCP Service`
- `A2K v0.1 A2A Adapter`

A profile claim includes all core requirements unless the profile explicitly states otherwise.

## Fixtures

`fixtures/valid/` contains documents every conforming validator must accept. `fixtures/invalid/` contains documents every conforming validator must reject. Each invalid fixture SHOULD identify one principal failure condition.

Schema validity alone does not prove semantic, authorization, security, or interoperability conformance.
