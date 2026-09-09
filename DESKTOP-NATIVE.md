# MJ 14.1.1 — Desktop native install (Windows 11)

MJ is a Tauri v2 desktop app for Windows 11. The web preview you see in a browser is the same React app with no
native shell — it cannot spawn coding agents, touch the keyring, or write SQLite. Everything below
is about getting the **native** build running on your machine. macOS/Linux are not supported by this
tree (CI is Windows-only; bundle target is nsis only).

You do not need to read this carefully if you are handing it to Claude Code or OpenCode:
§1–§5 are written as an ordered checklist they can execute and verify.

---

## 1. Toolchain (Windows 11)

```powershell
# Rust (required)
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools   # "Desktop development with C++"
rustc --version      # 1.80 or newer; rust-version is pinned in src-tauri/Cargo.toml

# Node 20+ and the Vite/React deps
node --version
cd mj; npm ci
```

Platform extras: **Windows** needs "Desktop development with C++" from Visual Studio Build Tools,
plus WebView2 (preinstalled on Win 11). That is the whole list — no other OS is supported.

## 2. Verify before building

```bash
cd mj
./node_modules/.bin/tsc --noEmit                      # must exit 0
./node_modules/.bin/esbuild probe/acceptance.test.ts --bundle --platform=node --format=esm --outfile=/tmp/a.mjs && node /tmp/a.mjs
./node_modules/.bin/esbuild probe/harnessPolicy.test.ts --bundle --platform=node --format=esm --outfile=/tmp/h.mjs && node /tmp/h.mjs
./node_modules/.bin/esbuild probe/engine.test.ts --bundle --platform=node --format=esm --outfile=/tmp/e.mjs && node /tmp/e.mjs
./node_modules/.bin/esbuild probe/wiring.test.ts --bundle --platform=node --format=esm --outfile=/tmp/w.mjs && node /tmp/w.mjs
./node_modules/.bin/vite build                        # must exit 0
```

Expected: all probe suites passing, `vite build` exit 0.

## 3. The Rust side — verified on Windows 11

`cargo test` over `src-tauri/` passes against real dependencies: **29 unit + 11 store-integration,
0 failed.** Run it yourself:

```powershell
cd mj\src-tauri
cargo test
```

If anything fails here, that failure is real and specific — fix or report it; do not skip this step.

## 4. Run it

```powershell
cd mj
npm run tauri dev        # dev window, hot reload
npm run tauri:build      # installer: nsis (Win x64)
```

The bundle lands in `src-tauri\target\release\bundle\nsis\MJ_14.1.1_x64-setup.exe`.

## 5. Install a coding agent

MJ orchestrates real CLIs. Install at least one and log in:

```bash
npm i -g @anthropic-ai/claude-code && claude            # Claude Code
npm i -g @openai/codex && codex login                   # Codex
npm i -g opencode-ai && opencode auth login             # OpenCode
```

Then in MJ: **Providers → Re-scan PATH**. Each harness shows the resolved absolute path and its
`--version` output. If a CLI works in your terminal but MJ says "not found", click **"Show where MJ
looked"** — the missing directory tells you exactly what to fix (see §7).

### What MJ passes to each CLI

`src/mission/harnessPolicy.ts` is the single source of truth. It maps the mission's risk class
(§10) and security boundary (§33) onto real harness sandbox flags:

| Risk | Claude Code | Codex | OpenCode |
|---|---|---|---|
| LOW / review / no write permission | `--permission-mode plan --tools ""` | `--sandbox read-only` | `--agent plan` |
| MEDIUM (writes allowed) | `--permission-mode acceptEdits --max-turns N` | `--sandbox workspace-write` | `--agent build` |
| HIGH | as MEDIUM, **after** a human approves at the gate | same | same |
| CRITICAL | **refused** — escalated to a human, no harness runs it | same | same |

MJ never passes `--dangerously-skip-permissions`, `--yolo`, or `--sandbox danger-full-access`.

All three are invoked with their machine-readable output format (`--output-format json`, `--json`,
`--format json`) so MJ can record **real** cost and token counts instead of estimating them.

## 6. Provider keys and Ollama

Set locally, never committed: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. For the local `llm` harness run
Ollama on `127.0.0.1:11434`. Secrets go to the OS keyring (`src-tauri/src/secrets.rs`); if the
keyring is unavailable MJ falls back to an in-memory map and says so.

## 7. PATH: the #1 native failure, and what was done about it

A packaged app launched from the Start menu does **not** inherit your shell's PATH. So
`claude` installed by npm is invisible to MJ even though it works in your terminal.

`which_bin` in `src-tauri/src/commands.rs` now searches, in order:

1. the inherited `PATH`;
2. known install locations — `%APPDATA%\npm`, `C:\Program Files\nodejs`, scoop shims,
   `~/.npm-global/bin`, `~/.nvm/versions/node/*/bin` (every installed node version),
   `~/.volta/bin`, `~/.bun/bin`, `~/.deno/bin`, `~/.cargo/bin`;
3. the login shell's own PATH on unix (`zsh`/`bash`/`sh` — skipped on Windows, where
   step 2 plus the inherited registry PATH covers the standard install locations).

If it still misses, the Providers page lists every directory searched.

## 8. Execution semantics

Until a real CLI is installed, missions run on MJ's labelled `local-test` double. It reports
`simulated: true` in every event, artifact and UI surface, and `MissionRuntime.finish()` will return
`BLOCKED` — never `COMPLETED` — for a mission that used it. That is deliberate: MJ does not claim
verified success it did not earn.
