# Standards and project landscape

A2K is an integration and governance layer. Before adding a core field, contributors should determine whether an existing standard already owns the concept.

| Standard/project | Owns | A2K relationship |
|---|---|---|
| [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) | portable Markdown knowledge bundles | knowledge-package adapter |
| [Knowledge Context Protocol](https://github.com/Cantara/knowledge-context-protocol) | knowledge manifests, topology, freshness, and trust metadata | manifest mapping and compatibility evaluation |
| [ContextNest](https://github.com/PromptOwl/context-nest) | versioned context-vault governance and MCP access | governed-vault adapter; avoid duplicating selectors/checkpoints |
| [Cambium](https://github.com/KimGLee/Cambium) | agent-maintained corpus governance | workflow and evidence precedent |
| [KOI-net](https://github.com/BlockScience/koi-net) | federated knowledge-node coordination | future network adapter; no A2K federation transport |
| [Agent Skills](https://agentskills.io/specification) | procedural capability packages | catalog references to `SKILL.md` |
| [AGENTS.md](https://agents.md/) | repository-local agent instructions | coexistence; instructions do not become trusted through A2K |
| [Backstage](https://backstage.io/docs/features/software-catalog/descriptor-format/) | software catalog entities and ownership | service/catalog adapter |
| [OpenAPI](https://spec.openapis.org/oas/latest.html) | HTTP API contracts | linked API descriptors |
| [AsyncAPI](https://www.asyncapi.com/docs/reference/specification/latest) | event API contracts | linked event descriptors |
| [MCP](https://modelcontextprotocol.io/) | agent-to-tool/resource runtime interaction | A2K runtime access profile |
| [A2A](https://a2a-protocol.org/) | remote agent discovery and collaboration | Agent Card reference profile; no transport reimplementation |
| [Agent Client Protocol](https://agentclientprotocol.com/) | editor/client-to-coding-agent sessions | stable v1 compatibility profile |
| [OAuth](https://oauth.net/2/) and [OpenID Connect](https://openid.net/developers/how-connect-works/) | delegated authorization and identity | identity/access profile; no credential format invention |
| [JSON Schema](https://json-schema.org/specification) | structural instance validation | Draft 2020-12 schema language |
| [SPDX](https://spdx.dev/) and [CycloneDX](https://cyclonedx.org/) | software/component identity and provenance | license and supply-chain references |

Adjacent projects change rapidly. Every A2K release must pin tested versions and distinguish upstream facts from A2K mappings.
