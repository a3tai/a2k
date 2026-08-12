# A2K v0.1 security model — Draft

## Trust boundaries

Untrusted inputs include YAML, documents, Git history from untrusted publishers, remote references, adapter responses, MCP results, agent/model output, and generated configuration. A system prompt is not an enforcement boundary.

Protected assets include credentials, personal and restricted data, authority records, approval state, public/private separation, local agent configuration, and mutation capability.

## Required controls

- Parse YAML 1.2 safely; reject duplicate keys, aliases, custom tags, excessive size/depth, and multiple documents.
- Confine relative paths to the checkout after real-path and symlink resolution.
- Disable remote fetch by default. Allowed fetches require HTTPS, host policy, redirect limits, response limits, timeouts, and private/reserved-address protection including DNS-rebinding defenses.
- Never place credentials, resolved secret references, authorization headers, URL userinfo, or raw tokens in manifests, logs, examples, or generated output.
- Treat integrity digests separately from publisher authenticity and local authorization.
- Require explicit approval for mutation, execution, publication, durable-memory promotion, installation, and local configuration writes.
- Bound recursion, reference count, file count, and context size.

## STRIDE summary

| Threat | Minimum response |
|---|---|
| Spoofed publisher or agent | Consumer trust policy, stable identities, optional signatures, independently validated OAuth/OIDC identity |
| Tampered content | Immutable revision or digest; fail on mismatch |
| Repudiated contribution | Attributable proposal, decision, Git review, and receipt |
| Public/private disclosure | Separate repositories and CI; classification checks; no merged public output |
| Resource exhaustion | Byte, document, alias, reference, recursion, and timeout limits |
| Privilege escalation | Least privilege; read-only default; scope attenuation; runtime enforcement independent of manifests |

## OAuth/OIDC boundary

A2K declares logical identity providers, audiences, scopes, and authorization requirements. It does not issue tokens, define login UI, or replace OAuth/OIDC specifications. Remote MCP implementations act as OAuth resource servers and MUST validate issuer, audience, expiry, signature, and scopes using maintained libraries. Local stdio operation does not become trusted merely because it is local.

## Agent contribution boundary

Agent output is evidence or a proposal until accepted through the governing workflow. An agent MUST NOT approve its own consequential contribution unless organization policy explicitly permits that role and separation-of-duties requirements remain satisfied.
