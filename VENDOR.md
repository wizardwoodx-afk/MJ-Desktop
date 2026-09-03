# Vendored engines

MJ wraps these trees. It does not reimplement them.

Every directory below exists in this repository and is shipped with the app
(`src-tauri/tauri.conf.json` → `bundle.resources: ["../vendor"]`). Licences are
reproduced verbatim in each directory and summarised in [`NOTICE`](NOTICE).

| Path | Upstream | Licence | Role |
|---|---|---|---|
| `vendor/hermes-agent` | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | MIT | Skill contract (`SKILL.md` + YAML), plugin hooks (`on_session_start`, `pre_llm_call`, `post_llm_call`, `on_session_end`), `agent/skill_utils.py` frontmatter parser |
| `vendor/hermes-agent-self-evolution` | [NousResearch/hermes-agent-self-evolution](https://github.com/NousResearch/hermes-agent-self-evolution) | MIT (declared) | Fitness (`0.5 correctness + 0.3 procedure + 0.2 conciseness − length penalty`), constraints (size, growth, non-empty, skill structure), GEPA skill evolution. **No weight updates.** |
| `vendor/mcp-servers-reference` | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | MIT / Apache-2.0 | Official Filesystem, Git, Memory, Sequential Thinking, Time |
| `vendor/mcp-github` | [github/github-mcp-server](https://github.com/github/github-mcp-server) | MIT | Official GitHub MCP (stdio) |
| `vendor/evolution-service` | **MJ (first-party)** | MJ proprietary | JSON-lines **stdio** bridge and DSPy/GEPA optimiser. Tauri owns the child. No HTTP. No `127.0.0.1` bind. |

## Layout note

`src-tauri/src/hermes.rs` resolves the bridge as `<vendor>/evolution-service/mj_evolution/stdio_server.py`.
`vendor/evolution-service` is MJ's own code and sits under `vendor/` only because that is the path
the runtime resolves — the same convention the original design used for `vendor/mj-bridge/bridge.py`.
It is first-party and covered by the MJ `LICENSE`, not by `NOTICE`.

## Pruning

`vendor/hermes-agent` is shipped **pruned** to what MJ actually consumes: `LICENSE`, `README.md`,
`agent/` (skill utils and the hook lifecycle) and `skills/` (the `SKILL.md` contract). The upstream
tree is 258 MB across ~11,300 files, most of it the desktop app, website, tests and CLI extras.
MJ does not wrap those, so it does not ship them. Re-run the upstream clone and take the same
subset if you need another part.

## Licence diligence

- `hermes-agent-self-evolution` **declares** MIT in `pyproject.toml` but ships no `LICENSE` file.
  That declaration is the only grant available — confirm it before commercial redistribution.
- `mcp-servers-reference` is mid-transition MIT → Apache-2.0; its own `LICENSE` file governs.
- MJ itself is proprietary. Nothing here grants rights to MJ; it records the rights MJ relies on.
