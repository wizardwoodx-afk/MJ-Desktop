# MJ 11.9 — DESKTOP NATIVE INSTALL

MJ is a Tauri v2 desktop app. The web preview you see in a browser is the same React app with no
native shell — it cannot spawn coding agents, touch the keyring, or write SQLite. Everything below
is about getting the **native** build running on your machine.

You do not need to read this carefully if you are handing it to Claude Code or OpenCode:
§1–§5 are written as an ordered checklist they can execute and verify.

---

## 1. Toolchain

```bash
# Rust (required)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"
rustc --version      # 1.80 or newer; rust-version is pinned in src-tauri/Cargo.toml

# Node 20+ and the Vite/React deps
node --version
cd mj && npm ci
```

Platform extras:

| OS | Install |
|---|---|
| **macOS** | `xcode-select --install` |
| **Windows** | "Desktop development with C++" from Visual Studio Build Tools, plus WebView2 (preinstalled on Win 11) |
| **Linux (Debian/Ubuntu)** | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` |
| **Linux (Fedora)** | `sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel gcc gcc-c++ make` |
| **Linux (Arch)** | `sudo pacman -S webkit2gtk-4.1 base-devel curl wget file libappindicator-gtk3 librsvg openssl` |

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

## 3. The Rust side — **do this first, it is the one unverified part**

There is no Tauri toolchain in the environment this was written in. `cargo check` has never been run
over `src-tauri/`. Run it now:

```bash
cd mj/src-tauri
cargo check 2>&1 | tee /tmp/cargo-check.log
cargo clippy --all-targets 2>&1 | tee /tmp/clippy.log
```

The pure helpers in `src-tauri/src/commands.rs` (`expand_home`, `exists_executable`, `fast_paths`,
`login_shell_paths`, `push_unique`, `which_bin`, `run_timeout`) **have** been compiled with
`rustc 1.98.0` and exercised — see `LOCAL-WORKLIST.md` §"What was actually verified". What has *not*
been compiled is the two `#[tauri::command]` functions that use the Tauri macro
(`cli_invoke`, `cli_env`) and the registration line in `src-tauri/src/lib.rs`.

If `cargo check` fails, fix it in place — do not revert. The V5 behaviour it replaces is broken.

## 4. Run it

```bash
cd mj
npm run tauri dev        # dev window, hot reload  (scripts in package.json: dev, build, preview, tauri, tauri:build, typecheck)
npm run tauri:build      # installers: nsis (Win), dmg (macOS), appimage + deb (Linux)
```

Bundles land in `src-tauri/target/release/bundle/`.

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

A packaged app launched from Finder or the Start menu does **not** inherit your shell's PATH. So
`claude` installed by npm or Homebrew is invisible to MJ even though it works in your terminal.

`which_bin` in `src-tauri/src/commands.rs` now searches, in order:

1. the inherited `PATH`;
2. known install locations — `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, `~/.npm-global/bin`,
   `~/.nvm/versions/node/*/bin` (every installed node version), `~/.volta/bin`, `~/.bun/bin`,
   `~/.deno/bin`, `~/.cargo/bin`, `%APPDATA%\npm`, `C:\Program Files\nodejs`, scoop shims;
3. **the login shell's own PATH** — `zsh -lc 'printf %s "$PATH"'`, then bash, then sh. Cached for the
   process. This is what makes an nvm/asdf/mise setup work without the user editing anything.

If it still misses, the Providers page lists every directory searched.

## 8. Known V5 gaps carried into V6

Documented, not silently fixed:

- `src-tauri/src/commands.rs` — `tool.starts_with("control")` shadows any real MCP server named `control*`.
- `src-tauri/src/control_mcp.rs` — `dispatch` is an echo stub while `mcp.rs` advertises 8 tools.
- `cap.browser` — `browser_navigate` returns canned data, `browser_act` returns false, yet the capability reports success.
- Stubs: `workflow_versions`, `workflow_version_restore`, `skill_touch`, `evaluation_save`, `evaluation_history`, `suite_list`, `suite_save`, `run_request_take`.
- `README.md:1` still says "MJ 4.0".

## 9. What is honest about execution

Until a real CLI is installed, missions run on MJ's labelled `local-test` double. It reports
`simulated: true` in every event, artifact and UI surface, and `MissionRuntime.finish()` will return
`BLOCKED` — never `COMPLETED` — for a mission that used it. That is deliberate: MJ does not claim
verified success it did not earn.
