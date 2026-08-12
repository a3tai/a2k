# A2K Specification v0.1 — Draft

## 1. Status

This document is a pre-release specification. The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described by BCP 14 when shown in capitals.

## 2. Purpose

A2K defines a governed bootstrap and interoperability fabric through which authorized humans and agents can discover organizational knowledge, obtain bounded context, and submit reviewable contributions. It defines control-plane semantics and profiles; it does not replace storage systems, Git review, identity providers, or runtime protocols.

## 3. Core principles

1. **Humans remain accountable.** Agent identity and automation do not replace organizational ownership or approval.
2. **Discovery is not authority.** Listing a document, service, agent, or skill does not make it trusted or executable.
3. **Authority is scoped.** Every normative record has a stable ID, owner, classification, lifecycle, and declared authority scope.
4. **Proposals precede mutation.** Consumers are read-only by default. Mutation is a separately authorized operation.
5. **Conflicts are explicit.** Contradictions and same-ID collisions are surfaced rather than silently overwritten.
6. **Implementations compose standards.** Profiles reference existing formats and protocols instead of copying them.

## 4. Bootstrap

A repository participates by placing exactly one YAML 1.2 document at:

```text
.a2k/manifest.yaml
```

A consumer MUST reject duplicate mapping keys, aliases, unsupported `apiVersion` values, unknown unprefixed fields, unsafe custom tags, and input beyond its documented limits. The current draft version is `a2k.a3t.ai/v0alpha1`.

The manifest kinds are:

- `OrganizationHub` — organization-level roots and catalogs;
- `PrivateOverlay` — restricted augmentation and tightened controls;
- `ProjectBootstrap` — project-specific roots and references.

The schema at `schemas/v0.1/manifest.schema.json` is normative for structural validation. Prose governs semantics where schemas cannot express them. Draft extensions use namespaced `x-*` keys and are limited to bounded scalar values; structured extension contracts require a future reviewed profile.

## 5. Authority layers

1. Reviewed Git content is authoritative for documentation in its declared scope.
2. Organization policy constrains projects only where its scope explicitly applies.
3. Project records are authoritative for project implementation facts within those constraints.
4. Private overlays augment authorized views and may tighten policy.
5. Durable memory is historical evidence and MUST NOT silently override reviewed Git.
6. Code indexes and generated views are derived evidence; exact source files and tests remain authoritative for implementation.

Consumers MUST report unresolved contradictions. Recency alone MUST NOT choose a winner.

## 6. Overlays

A `PrivateOverlay` MUST identify its base by stable ID and SHA-256 digest. An implementation MUST validate public and private inputs separately before composition.

An overlay MAY add restricted facts or tighten classification, denial, approval, retention, and mutation controls. It MUST NOT downgrade or remove those controls. Composed private output MUST NOT be written into a public checkout or publication artifact.

## 7. Knowledge lifecycle

A2K distinguishes record kind, lifecycle state, information classification, and reader intent.

Common lifecycle states are:

```text
draft → review → approved/active → deprecated/invalidated/archived
                         ↘ superseded
```

A rejection records that a proposal was not accepted; invalidation records that previously usable knowledge must no longer guide current work; archival changes default discovery without erasing history. Supersession MUST link both predecessor and successor.

Accepted decisions and concluded experiments are historical records and SHOULD be superseded rather than rewritten materially.

## 8. Contribution workflow

A contribution is a proposal containing actor identity, target stable ID, base revision or digest, requested operation, rationale, evidence references, classification, and intended reviewers.

Operations include create, amend, supersede, invalidate, archive, restore, and link. A proposal does not grant its author authority over the target. Approval or rejection MUST be attributable to an authorized reviewer and retained with the resulting Git change or external-system receipt.

Agents MAY research, draft, classify, compare, and propose. Whether an agent may approve is organization policy; A2K defaults to human approval for publication and any consequential mutation.

## 9. References and adapters

A reference identifies an external artifact but does not import its trust. Consumers MUST preserve source identity, classification, revision/digest when available, and adapter provenance. Remote fetching is disabled unless consumer policy explicitly permits it.

Adapters translate between A2K and another system. They MUST NOT claim that a lossy mapping is complete. They MUST identify preserved, synthesized, omitted, and conflicting fields.

## 10. Local bootstrap

A bootstrap implementation MAY generate proposed local configuration for supported agent clients. It MUST display the affected paths and complete diff before applying changes. It MUST NOT embed credentials or bypass the client’s own approval and sandbox controls.

## 11. Profiles

Profiles are modular conformance surfaces described under [`profiles/`](profiles/). Implementations claim conformance by role, A2K version, and profile; an unqualified “A2K compliant” claim is invalid.
