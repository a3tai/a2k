# Collaborator quickstart

This guide configures a repository-aware `a3t` CLI and one or more supported agents. It does not require Hub access. The CLI reviews every proposed file before writing it.

## Prerequisites

- Git
- Node.js 24 or newer
- npm
- access to the repository you will work in
- 1Password CLI signed in if the repository manifest declares `op://` connector credentials

## 1. Install `a3t`

The P0 installer builds the current source tree; signed release artifacts are not available yet. Download and inspect the script before running it rather than piping remote content directly to a shell:

```bash
curl -fsSLo /tmp/a3t-install.sh https://a3t.app/install.sh
less /tmp/a3t-install.sh
sh /tmp/a3t-install.sh
rm /tmp/a3t-install.sh
```

This reduces accidental execution but does not authenticate an immutable release. If your organization requires signed or checksum-pinned installers, stop and wait for the release installer.

The source installer places its checkout under `~/.a3t` and writes the `a3t` launcher to `~/.local/bin`. If the installer reports that directory is not on `PATH`, add it before continuing:

```bash
export PATH="$HOME/.local/bin:$PATH"
a3t --help
```

## 2. Enable directory-aware context

Add the line for your shell to its startup file, then start a new shell:

```bash
# ~/.zshrc
eval "$(a3t hook zsh)"

# ~/.bashrc
eval "$(a3t hook bash)"
```

The hook walks up from the current directory to the nearest `.a2k/manifest.yaml`. It exports validated `A2K_*` metadata only. It does not execute manifest content or export secrets.

## 3. Verify the repository manifest

Enter the repository and inspect its context:

```bash
cd path/to/repository
a3t validate
a3t context
```

Expected result: validation succeeds and `a3t context` reports the repository's project ID, name, classification, and manifest path. If no manifest is found, ask the repository owner to add `.a2k/manifest.yaml`; do not invent project identity locally.

## 4. Review agent configuration

Choose one or more targets. Claude Code, OpenCode, and Pi are the priority integrations; Codex, VS Code, and Cursor are also supported.

```bash
a3t bootstrap \
  --target claude-code \
  --target opencode \
  --target pi
```

The command prints the proposed native configuration files and an `approvalDigest`. Review:

- every destination path;
- every MCP server URL and command;
- every credential reference;
- that credentials are `op://` references, never literal values.

Do not continue if the plan is unexpected. The review command does not write files.

## 5. Apply the reviewed plan

Run the same targets with the exact digest printed by the review:

```bash
a3t bootstrap \
  --target claude-code \
  --target opencode \
  --target pi \
  --write sha256:<reviewed-digest>
```

`a3t` refuses stale digests and existing destination files. It does not overwrite agent configuration. If a destination exists, reconcile it manually and rerun review rather than deleting it blindly.

## 6. Verify the agent

Restart the selected agent in the repository. Confirm that it:

1. lists each configured MCP server;
2. connects without exposing credential values;
3. can call a non-destructive MCP tool or read a known resource;
4. sees the same project reported by `a3t context`.

Never paste resolved tokens into chat, logs, issues, or configuration files.

## Troubleshooting

- **`a3t: command not found`** - add `~/.local/bin` to `PATH` and restart the shell.
- **No project context** - run from inside a repository containing `.a2k/manifest.yaml` or one of its subdirectories.
- **Manifest validation fails** - fix the repository manifest in a reviewed change; do not bypass validation.
- **Digest mismatch** - rerun the review command and inspect the new plan before using its new digest.
- **Destination already exists** - compare and reconcile the existing native agent file manually. `a3t` intentionally will not overwrite it.
- **1Password lookup fails** - sign in with `op signin` and confirm you have access to the referenced item. Do not replace the reference with a literal secret.
- **MCP server unavailable** - keep the reviewed local config, report the server failure to its owner, and avoid weakening transport or credential checks.

## Maintainer verification

Before declaring collaborator onboarding complete, a non-maintainer should follow this guide on their own machine and report only:

- operating system and shell;
- selected agent targets;
- whether install, context, review, write, server listing, and one safe call succeeded;
- sanitized error messages for any failure.

Do not collect their tokens, resolved `op://` values, or machine configuration files.
