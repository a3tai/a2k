# @a2k/bootstrap

Produces deterministic, review-only plans for Claude Code, OpenCode, Pi, Codex, VS Code, and Cursor from one `x-connectors` MCP server model. The library never writes files. The `a3t` CLI prints the complete plan and its content digest first, then creates those exact native client files only with `--write <digest>`; existing files are never overwritten.
