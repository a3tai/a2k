# MCP profile — Draft

The MCP profile exposes governed knowledge through standard MCP resources and narrowly scoped tools.

The initial reference binding is local stdio and read-only. Proposed baseline operations are manifest validation, profile description, catalog discovery, bounded search, record retrieval, and contribution proposal creation. Proposal creation is a mutation and is not part of the initial read-only tool set.

MCP tool annotations are advisory metadata; runtime authorization remains mandatory. Read tools MUST NOT follow undeclared references or expand the caller's classification ceiling. Mutation tools require distinct scopes and approval behavior.

Remote Streamable HTTP deployments act as OAuth resource servers. They MUST publish appropriate protected-resource metadata and validate tokens independently. A2K does not define a replacement MCP transport or authentication flow.
