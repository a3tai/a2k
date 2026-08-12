# ADR 0001: Compose existing standards behind a governed knowledge control plane

- **Status:** Accepted
- **Date:** 2026-08-11

## Context and problem statement

A2K must let humans and agents discover, access, review, and contribute to organizational knowledge. Existing standards already define knowledge packages, service catalogs, APIs, tool access, identity, and agent communication. Reimplementing them would increase security and compatibility risk.

## Decision drivers

- preserve Git-reviewed documentation authority;
- integrate heterogeneous knowledge systems;
- support one-checkout onboarding;
- enforce human-governed contribution and lifecycle controls;
- avoid another competing transport or universal knowledge representation.

## Considered options

1. Define a complete A2K wire protocol, identity system, and knowledge format.
2. Adopt one existing knowledge format as the entire solution.
3. Define a narrow governed control plane with versioned interoperability profiles.

## Decision outcome

Choose option 3.

A2K defines bootstrap, authority, classification, lifecycle, contribution, overlay, and adapter semantics. It references MCP for tool/resource access, OAuth/OIDC for identity and delegated authorization, A2A and ACP for agent communication, Agent Skills for procedural packages, and established documentation/catalog/API formats for their domains.

The core remains usable without a network service. Runtime bindings are profiles. Discovery never grants trust, authorization, installation, execution, or mutation.

## Consequences

### Positive

- Smaller normative core and reduced protocol duplication.
- Adapters can evolve independently.
- Organizations retain existing systems of record.
- Security boundaries are explicit.

### Negative

- Interoperability depends on careful version pinning and mapping tests.
- Some mappings are necessarily lossy.
- A full deployment combines multiple standards and operational components.

### Neutral

- A2K is a specification and governance fabric, not a single product.

## Security and operational considerations

Remote references remain untrusted. Authentication and authorization are enforced by identity providers and resource servers, not by manifest assertions. Bootstrap writes and knowledge mutations require separate approval.

## References

- [`spec/v0.1/README.md`](../../spec/v0.1/README.md)
- [`docs/design/architecture.md`](../design/architecture.md)
- [`spec/v0.1/security.md`](../../spec/v0.1/security.md)
