# A2A profile — Draft

The A2A profile maps an A2K logical agent record to an A2A Agent Card. The initial compatibility target is A2A wire version `1.0`; the exact upstream release is pinned before an A2K release.

A2K records owner, organizational approval state, classification, expected compatibility, and an optional immutable card reference/digest. The Agent Card remains authoritative for A2A interfaces, skills, and security declarations.

A2K does not implement A2A messages, tasks, artifacts, streaming, bindings, or authentication. Credentials are never copied into A2K. Authenticated extended cards are fetched only after normal authorization. No A2A extension will be proposed until implementation evidence demonstrates a missing interoperable field.
