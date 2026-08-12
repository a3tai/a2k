# A2K schemas

Schemas use JSON Schema Draft 2020-12. `v0.1/manifest.schema.json` is the first normative structural schema.

Unknown unprefixed properties are rejected. Extensions use `x-<namespace>` names. Unsupported `apiVersion` values fail closed. Semantic rules that cannot be represented safely in JSON Schema remain normative prose and conformance tests.
