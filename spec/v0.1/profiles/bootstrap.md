# Bootstrap profile — Draft

The bootstrap profile turns one trusted checkout into a reviewable plan for connecting supported local agent clients to organizational knowledge.

A bootstrapper:

1. validates the local manifest without network access;
2. identifies supported client adapters;
3. computes proposed files and settings;
4. displays all paths and complete diffs;
5. requests explicit approval;
6. applies only the approved subset;
7. verifies resulting client configuration without displaying credentials.

The default mode is plan-only. Generated files SHOULD live under `.a2k/generated/` until a client adapter translates them to a client-owned location. A bootstrapper MUST preserve unrelated user configuration and MUST NOT weaken client sandbox, approval, or trust settings.

Authentication is initiated through the selected client or approved identity adapter. Tokens and resolved secrets never enter generated files.
