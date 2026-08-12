# Governance profile — Draft

This profile defines governed knowledge change without replacing Git hosting or external workflow systems.

A governed record declares stable ID, kind, owner, classification, status, authority scope, source/provenance, review state, and supersession links where applicable.

A proposal declares one operation: `create`, `amend`, `supersede`, `invalidate`, `archive`, `restore`, or `link`. It identifies the target and expected base revision/digest to prevent stale writes. Decisions are `approved`, `rejected`, or `changes-requested` and identify the authorized decision-maker and evidence.

`invalidated` means current consumers must not use the record as active guidance. `archived` means retained history excluded from ordinary discovery. `superseded` means replaced by an explicitly linked successor. These states are not interchangeable.

Implementations MUST retain rejected proposals and decision rationale according to organization retention policy. They MUST NOT infer approval from an agent assertion, branch name, or mergeable schema.
