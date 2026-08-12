# Knowledge adapter profile — Draft

Adapters connect A2K to Git repositories, documentation sites, catalogs, wikis, memory systems, research stores, APIs, and knowledge-package formats.

Each adapter declares its external standard and version, supported operations, source authority, classification behavior, identity mapping, provenance mapping, freshness model, and known information loss.

Initial adapter targets include OKF, KCP, Backstage descriptors, OpenAPI, AsyncAPI, C4/architecture documents, BSpec, Zikra metadata, and derived code indexes. A2K references these systems rather than replacing their data models.

An adapter MUST label generated or inferred fields and MUST preserve contradictions. External write-back is disabled unless an authorized proposal is accepted by the target system's own control plane.
