# ACP profile — Draft

This profile refers to Zed's Agent Client Protocol for editor/client-to-coding-agent interoperability. The initial target is stable ACP wire version `1`; draft v2 features are excluded unless explicitly feature-gated.

An A2K record may reference reviewed ACP Registry metadata, distribution provenance, license, version, digest, and organizational approval. The ACP registry remains authoritative for its manifest format and installation metadata.

A2K does not implement ACP sessions, JSON-RPC methods, permissions, authentication, or client UX. Discovery does not authorize installation or execution.

IBM/BeeAI Agent Communication Protocol is a legacy migration source whose successor is A2A; it is not an A2K implementation target.
