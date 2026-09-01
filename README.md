# MJ 11.1 — agent organization runtime

Product name **MJ**. A **Tauri v2** desktop app.

**Thesis: a Mission is an outcome-oriented objective that owns a dynamically managed organization
of agents.** MJ is not a workflow builder with AI nodes bolted on. You state an outcome; MJ plans
it, forms an organization to deliver it, arbitrates which coding agent runs each task, detects and
repairs failures while running, restructures the organization when the plan turns out to be wrong,
and keeps an immutable record of every decision so you can answer *why does this artifact exist*.

The graph is still the source of truth for a workflow. For a mission, the plan is. Secrets stay in
the OS keychain. Hermes skills are `SKILL.md`. Official MCP servers run over **stdio**.

## Start here

| Document | What it covers |
|---|---|
| **`DESKTOP-NATIVE.md`** | Native install per OS, toolchain, and the risk → sandbox mapping for each coding CLI |
| **`LOCAL-WORKLIST.md`** | Ordered checklist for a local Claude Code / OpenCode session: what to run, what is verified, what needs your machine |
| **`MJ-10.1-UPGRADE.md`** | What V10.1 adds: the `nothing` theme (Nothing OS design language), the eleven-defect debugging pass, and the theme probe |
| `MJ-10.0-UPGRADE.md` | What V10 adds: replay, evals, the git layer, and the Proof page — plus exactly what is and is not proven |
| `MJ-9.0-UPGRADE.md` | What V9 fixes: version metadata, and the reviewer-visibility bug proven against a real CLI |
| `MJ-7.0-UPGRADE.md` | What V7 adds over V6: real verification, and the debugging pass |
| `MJ-6.0-UPGRADE.md` | What V6 adds over V5, section by section |
| `WHAT-CHANGED.md`, `UPGRADE.md`, `VENDOR.md` | V5 heritage |

## Verify

```bash
cd mj && npm ci
./node_modules/.bin/tsc --noEmit                    # exit 0

for f in versionDrift acceptance harnessPolicy checkRunner realExecution engine replayEvals reviewVisibility theme; do
  ./node_modules/.bin/esbuild probe/$f.test.ts --bundle --platform=node --format=esm \
    --define:MJ_ROOT='"'$(pwd)'"' --outfile=/tmp/$f.mjs --log-level=error && node /tmp/$f.mjs
done

# The Proof page, rendered to a string in node. react-dom/server needs to stay external (it does a
# dynamic require of "stream"), and the output must sit inside the project so those resolve:
./node_modules/.bin/esbuild probe/v10Page.test.tsx --bundle --platform=node --format=esm \
  --define:MJ_ROOT='"'$(pwd)'"' --external:react --external:react-dom --external:react-dom/server \
  --outfile=probe/.v10.mjs --log-level=error && node probe/.v10.mjs

./node_modules/.bin/esbuild probe/wiring.test.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/w.mjs && node /tmp/w.mjs           # report: wires kept vs dropped
./node_modules/.bin/vite build                      # exit 0
```

**Last run against this tree (V11):** `tsc --noEmit` exit 0; `vite build` exit 0; all probe suites passing.

The Rust side is tested too, because the parsers are plain `std` and `include!`d into the Tauri file —
so the code that ships is the code that was compiled:

```bash
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
cd /tmp/gitship2   && cargo test   # git_core.rs
cd /tmp/gitcompile && cargo test   # the shipped git.rs
```

`cargo check` on the full Tauri crate compiles clean on Windows with MSVC. See
`MJ-10.0-UPGRADE.md` for the full build history.

## This is not a localhost product

- Production loads `frontendDist` inside the WebView. No Vite preview as the app.
- Hermes, MCP and coding agents are child processes over stdin/stdout. No HTTP sidecar.
- Ollama at `127.0.0.1:11434` is **your** local model, not an MJ service.

## Honesty rules MJ holds itself to

- **No fake success.** A mission that used the labelled `local-test` double returns `BLOCKED`, never
  `COMPLETED`, and says why.
- **No fake metrics.** Cost and token counts come from what the harness actually reported
  (`total_cost_usd`, NDJSON usage events) or are recorded as unmeasured. Never `chars/4`.
- **No self-certification.** An agent is never the sole authority on its own work; an unrun check is
  `measured: false` and drags the score down.
- **No silent mutation.** Every graph change is gated by policy → evaluation → regression, and
  refused mutations are recorded too.
- **No single success number.** `scoreMission` returns six dimensions plus what could not be measured.

## Build

```bash
npm run tauri dev        # dev window
npm run tauri:build      # nsis / dmg / appimage / deb
```
