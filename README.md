# MJ — Agent Organization Runtime

> A Tauri v2 desktop app that turns an outcome into a managed organization of agents.

I built MJ to explore one idea: **a Mission is an outcome that owns its organization**. You state the outcome, MJ plans it, forms the team, picks the right coding agent per task, repairs failures while running, and keeps a trace so you can answer *why does this artifact exist*.

![MJ — Canvas](docs/images/canvas.png)

*Canvas — 25-harness registry, Teams arbitration, local-first verified runs. Also: [Mission](docs/images/mission.png) · [Workflows](docs/images/hero.png).*

---

## Features

- **Mission-first, not workflow-builder** — the plan is the source of truth.
- **25-harness registry** — 23 CLIs + hermes + llm, each with researched install + argv, grades `binary / docs / community`.
- **Teams & arbitration** — per-task harness choice, review snapshots, merge planning.
- **Measured, not inferred** — cost/tokens from real NDJSON, sandbox canaries that must fail, exit-code verdicts.
- **Local-first** — SQLite + OS keychain + stdio child processes. No HTTP sidecar. Ollama at `127.0.0.1:11434` is yours, not MJ's.
- **Hermes skills** (`SKILL.md`) and MCP over stdio, plus MJ's own Python evolution service (DSPy/GEPA).

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop | Tauri v2 (Rust 1.80), SQLite (rusqlite), keyring |
| Frontend | React 18, Vite 6, TypeScript 5.6, Zustand, vanilla CSS |
| Agents / MCP | CLI harnesses over stdio, MCP servers over stdio, ACP |
| Python | `vendor/evolution-service` — `mj_evolution.stdio_server` |

## Quick Start

```bash
# prerequisites: Node 22, Rust stable, WebKit/GTK on Linux
npm ci
npm run typecheck   # tsc --noEmit
npm test            # 40 probe suites
npm run build       # vite production build

# dev / release
npm run tauri dev
npm run tauri:build

# zero-install check (no node_modules, ~25s)
node verify/run.mjs
```

## Project Structure

```
src/                # React app — pages, canvas, mission runtime, domain
src-tauri/          # Tauri commands, SQLite, keyring, MCP/Hermes/ACP bridges, git parsers
probe/              # 40 probe suites (40/40 on Linux)
verify/             # offline pack — 39 bundles + runner (see verify/MANIFEST.json)
vendor/             # hermes-agent, hermes-agent-self-evolution, mcp-servers-reference, mcp-github, evolution-service
docs/               # extra docs, history, and verification details
```

## Testing

- `npm test` — 40 suites, 270 harness assertions, sandbox/checkRunner/theme/meridian/canvasGeometry coverage. Typed command registry (`MjCommands`) guarantees Rust↔TS parity at compile time.
- `node verify/run.mjs` — offline gate for reviewers, byte-pinned by `verify/MANIFEST.json`.

More in [docs/VERIFICATION.md](docs/VERIFICATION.md) and [verify/BUILD-INFO.txt](verify/BUILD-INFO.txt).

## History

MJ evolved from 5.0 → 11.8.5. Each release fixed real bugs found by probing — vacuous gate, turn-limit drift, wrapper classification, exit-code verdicts, browser aliases, vendor bundling, and a deep type-safety pass that removed every `as never` in `src/`.

See [CHANGELOG.md](CHANGELOG.md) for a short timeline and [docs/history/](docs/history/) for the full per-release notes.

## Docs

- [Desktop setup & sandbox mapping](DESKTOP-NATIVE.md)
- [Build from source](BUILD-NATIVE.md) · [Install on laptop](INSTALL-ON-LAPTOP.md)
- [What MJ wraps](VENDOR.md) · [Third-party notices](NOTICE)

## License

Source-available under **PolyForm Noncommercial 1.0.0** — free for personal, research, and noncommercial use. Commercial use (in a product, service, or internal tool) and AI/ML training require a separate license.

See [LICENSE](LICENSE) and [NOTICE](NOTICE). For commercial licensing, open an issue at https://github.com/wizardwoodx-afk/MJ-Desktop.

---

Built by **Sree Harshen** — portfolio project, open for review and noncommercial use.
