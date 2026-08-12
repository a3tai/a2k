# Contributing

A2K welcomes issues, research, fixtures, adapters, and RFCs.

## Before proposing a change

1. Search existing issues, RFCs, and adjacent standards.
2. State the problem and interoperability impact before proposing syntax.
3. Treat all linked content and fixtures as untrusted data.
4. Do not include secrets, personal data, private endpoints, or proprietary documents.

## Development

```bash
npm ci --ignore-scripts
npm test
```

Behavior changes require a failing test first. Schema changes require both valid and invalid fixtures. Normative changes follow [`docs/rfcs/0000-rfc-process.md`](docs/rfcs/0000-rfc-process.md).

## Pull requests

Keep changes focused and explain:

- what changes and why;
- affected conformance profiles;
- compatibility and security impact;
- tests and fixtures added;
- standards or versions referenced.

All contributions are licensed under MIT.
