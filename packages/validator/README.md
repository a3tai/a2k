# @a2k/validator

Local, fail-closed validation for A2K YAML manifests. It rejects duplicate keys, aliases, multiple documents, excessive input, unsupported versions, schema violations, and credential values. Typed `x-connectors` bindings may name environment variables and `op://` references, but never contain resolved secrets. Validation performs no network requests and follows no references.
