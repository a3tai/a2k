# Identity profile — Draft

The identity profile connects A2K roles and operations to OAuth/OIDC infrastructure.

Declarations may identify:

- an HTTPS OIDC issuer;
- resource/audience identifiers;
- logical scopes for discovery, read, propose, review, approve, administer, and audit;
- human, workload, and agent principal classes;
- delegation and maximum-scope rules;
- required assurance and reauthentication policy.

Manifests MUST NOT contain client secrets, access or refresh tokens, private keys, authorization headers, or resolved secret-manager values.

Authentication proves a principal claim; authorization decides whether that principal may perform a specific operation on a specific resource. A2K implementations MUST keep those decisions separate. Delegated agent authority MUST be no broader than the intersection of user authority, agent policy, current task scope, and resource policy.

Provider-specific configuration is an adapter concern. The final v0.1 profile will pin the applicable OAuth/OIDC RFCs after interoperability review.
