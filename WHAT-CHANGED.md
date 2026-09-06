# MJ 5.0 — what changed vs 4.0

## The idea

Do **not** paste Hermes Python into 200 node files. That would be n8n with extra steps.

**One Hermes-class runtime × many identities × reusable teams × agent frameworks.**

Each `agent.*` node **is** a Hermes session: identity, purpose, permission-gated tools, memory, skills, bounded tool loop. Coding CLIs (Claude Code / Codex / OpenCode / …) remain first-class workers when you set the harness.

## Files added

| Path | Why |
|---|---|
| `src/domain/rolePacks.ts` | 256 enterprise + common Hermes identities |
| `src/domain/frameworks.ts` | 35 agent-native frameworks (not Slack/HTTP) |
| `src/domain/teams.ts` | Reusable team workspace |
| `src/engine/hermesRuntime.ts` | In-process Hermes tool loop |
| `src/engine/controlRuntime.ts` | Real Condition / Switch / Merge / Parallel / Loop |
| `src/pages/TeamsPage.tsx` | Save a framework as a team, apply to a new task |

## Files you must replace on the laptop tree

`scheduler.ts`, `factory.ts`, `harness.ts`, `nodeLibrary.ts`, `App.tsx`, `Inspector.tsx`, `LibraryDrawer.tsx`, `HomePage.tsx`, `commands.rs`, `mcp.rs`, `types.ts`, version `5.0.0`.

## Still honest

- Browser Chromium is **not** fully wired. Browser nodes fail closed.
- Evolution fitness is still heuristic unless the Python bridge scores it.
- No Windows `.exe` from this Linux sandbox. Build on the laptop: `npm run tauri:build`.
