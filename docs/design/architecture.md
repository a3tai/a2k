# A2K architecture

A2K is a governed knowledge control plane spanning repositories, knowledge services, humans, and agents.

## Planes

| Plane | Responsibility |
|---|---|
| Authority | owners, classification, lifecycle, policy, approvals, and source precedence |
| Knowledge | Git documents and linked external systems of record |
| Interoperability | versioned adapters for existing formats and protocols |
| Access | MCP resources/tools and bounded context assembly |
| Identity | OAuth/OIDC principals, audiences, scopes, delegation, and policy enforcement |
| Evidence | provenance, revisions/digests, proposals, decisions, and receipts |

## Bootstrap flow

```text
trusted checkout
  → validate .a2k/manifest.yaml locally
  → resolve authorized organization/project layers
  → propose client-specific configuration
  → human reviews complete diff
  → approved client config connects to read-only MCP surface
  → stronger scopes enable contribution proposals
```

## Knowledge change flow

```text
research or operational evidence
  → typed proposal
  → validation and impact analysis
  → authorized review
  → approve / reject / request changes
  → source-system commit or receipt
  → indexes and caches rebuild as derived evidence
```

Agents may draft and propose. The governing source system decides whether a change becomes authoritative. A2K does not let an adapter silently bypass that system.

## Deployment boundaries

The repository core works offline. A conforming organization may add an MCP service, identity provider, policy engine, search/index layer, and external adapters. Public descriptors contain logical identity and safe references; environment bindings and secret-provider configuration remain private or local.
