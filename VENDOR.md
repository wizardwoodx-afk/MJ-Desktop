# What MJ vendors

MJ doesn't reimplement everything. A few pieces are vendored so the app works fresh off a clone — they're shipped inside the installer (`src-tauri/tauri.conf.json` → `bundle.resources: ["../vendor"]`).

| Path | Where it comes from | License | What MJ uses it for |
|---|---|---|---|
| `vendor/hermes-agent` | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | MIT | `SKILL.md` contract + hooks (`on_session_start`, `pre_llm_call`, `post_llm_call`, `on_session_end`) and `agent/skill_utils.py` |
| `vendor/hermes-agent-self-evolution` | [NousResearch/hermes-agent-self-evolution](https://github.com/NousResearch/hermes-agent-self-evolution) | MIT (declared) | GEPA evolution — fitness, constraints, no weight updates |
| `vendor/mcp-servers-reference` | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | MIT / Apache-2.0 | Filesystem, Git, Memory, Sequential Thinking, Time (stdio) |
| `vendor/mcp-github` | [github/github-mcp-server](https://github.com/github/github-mcp-server) | MIT | GitHub MCP over stdio |
| `vendor/evolution-service` | **Mine — first-party** | MJ (PolyForm-NC) | Python stdio bridge `mj_evolution.stdio_server` — Tauri spawns it, no HTTP |

I've pruned `hermes-agent` down to what MJ actually needs (`LICENSE`, `README.md`, `agent/` and `skills/`). The full upstream is 258 MB / 11k files — mostly their desktop app and website which MJ doesn't need.

`vendor/evolution-service` lives under `vendor/` just because `src-tauri/src/hermes.rs` looks there (`<vendor>/evolution-service/...`). It's my code.

Licenses are kept verbatim in each vendor dir and summarized in `NOTICE`. `hermes-agent-self-evolution` declares MIT in its `pyproject.toml` but ships no `LICENSE` file — double-check that if you redistribute commercially.
