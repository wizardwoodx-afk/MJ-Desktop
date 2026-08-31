# Vendored engines

MJ wraps these trees. It does not reimplement them.

| Path | Upstream | Role |
|---|---|---|
| `vendor/hermes-agent` | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | Skill contract (`SKILL.md` + YAML), plugin hooks (`on_session_start`, `pre_llm_call`, `post_llm_call`, `on_session_end`), skill_utils frontmatter parser |
| `vendor/hermes-agent-self-evolution` | [NousResearch/hermes-agent-self-evolution](https://github.com/NousResearch/hermes-agent-self-evolution) | Fitness (`0.5 correctness + 0.3 procedure + 0.2 conciseness − length penalty`), constraints (size, growth, non-empty, skill structure), GEPA skill evolution. **No weight updates.** |
| `vendor/mcp-servers-reference` | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | Official Filesystem, Git, Memory, Sequential Thinking, Time |
| `vendor/mcp-github` | [github/github-mcp-server](https://github.com/github/github-mcp-server) | Official GitHub MCP (stdio) |
| `vendor/mj-bridge/bridge.py` | MJ | JSON-lines **stdio** bridge. Tauri owns the child. No HTTP. No `127.0.0.1` bind. |

## Skill file
