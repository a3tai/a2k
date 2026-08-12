# Security policy

## Draft status

A2K is pre-release software and must not be treated as an authorization or trust boundary without independent enforcement.

## Reporting

Report vulnerabilities through GitHub private vulnerability reporting for `a3tai/a2k`. Do not include credentials, personal data, private infrastructure details, or production documents in a public issue.

## Security invariants

- Discovery never grants trust, installation, execution, or mutation authority.
- Credentials and resolved secret values never belong in A2K manifests.
- Public and private repositories are validated independently; merged private output is never written to a public tree.
- Private overlays may tighten controls but may not weaken classification, denial, approval, retention, or mutation requirements.
- Remote fetching is disabled by default and requires consumer-controlled allowlists and network protections.
- Model and adapter output is untrusted input.
- Configuration changes are proposed for review; they are not silently applied.

The detailed threat model is in [`spec/v0.1/security.md`](spec/v0.1/security.md).
