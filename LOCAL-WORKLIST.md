# MJ 11.3 — LOCAL WORKLIST

Read this top to bottom. Items are ordered by priority. Everything here is either already verified
(it says so, with the command that verified it) or needs your machine because it needs a Tauri
toolchain, a coding-agent CLI, or provider keys.

Companion docs: **`DESKTOP-NATIVE.md`** — the full native install, per-OS dependencies, and the
risk → sandbox mapping MJ uses for each CLI. **`MJ-7.0-UPGRADE.md`** — what V7 changed, with the
measured output behind every claim.

---

## 0. What was actually verified, and how

| Check | Command | Result |
|---|---|---|
| TypeScript | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| §39 acceptance (26 criteria) | esbuild-bundle `probe/acceptance.test.ts`, run with node | **all passed** |
| Harness policy + usage parsing | `probe/harnessPolicy.test.ts` | **all passed** |
| V5 engine regression | `probe/engine.test.ts` | **all passed** |
| V5 wire survival | `probe/wiring.test.ts` | **all template + framework wires kept, 0 dropped** |
| Frontend bundle | `./node_modules/.bin/vite build` | exit 0 |
| New Rust helpers | extracted to `/tmp/rshelper.rs`, `rustc 1.98.0 --edition 2021`, then executed | **all assertions passed** |
| Pipe-deadlock fix | same harness, 2 MB of stdout then `echo DONE` | captured full output, exit 0 |
| **V7** check runner | `probe/checkRunner.test.ts` | **all passed** |
| **V7** real execution, no fakes | `probe/realExecution.test.ts` — real repos on disk, real `pytest`, real `cargo check` | **all passed** |
| **V7** Rust graph validator | `cargo test` on `control_mcp.rs` + `mcp.rs` against real `serde_json` | **all passed** |

Not verified anywhere: `#[tauri::command] fn cli_invoke` and `fn cli_env` (they need the Tauri macro
expansion) and the `generate_handler!` registration in `lib.rs`. That is item 1.

## 1. Run `cargo check` — the only uncompiled code in the package

```bash
cd mj/src-tauri
cargo check 2>&1 | tee /tmp/cargo-check.log
cargo clippy --all-targets 2>&1 | tee /tmp/clippy.log
```

Three changes are waiting for this:

| File | Change | Status |
|---|---|---|
| `commands.rs` — `run_timeout` | Drains stdout/stderr on threads instead of reading after exit. **V5 defect: any coding agent printing >64 KiB filled the pipe buffer, blocked, and was killed at the timeout.** | helpers compiled + behaviour-proven with rustc |
| `commands.rs` — `which_bin` / `fast_paths` / `login_shell_paths` | Finds CLIs when the app is double-clicked and has no shell PATH: known install dirs + nvm version dirs + `zsh -lc 'printf %s "$PATH"'` fallback | compiled + proven with rustc |
| `commands.rs` — `cli_invoke(provider_id, prompt, cwd, timeout_secs, argv)` | Accepts an explicit argv so the risk→sandbox mapping lives only in TypeScript; refuses any binary not in `ALLOWED_CLI_BINS` | **needs `cargo check`** |
| `commands.rs` — `cli_env()` | Diagnostics: resolved path, `--version`, every directory searched | **needs `cargo check`** |
| `commands.rs` — `ollama_*` | V5 defect: request body was `{"0": {...}}` and the transcript was dropped | **needs `cargo check`** |
| `hermes.rs` | Points at `mj_evolution/stdio_server.py` instead of the nonexistent `vendor/mj-bridge/bridge.py` | **needs `cargo check`** |
| `lib.rs:162` | Registers `commands::cli_env` | **needs `cargo check`** |

If `cargo check` fails, fix it in place. Do not revert — the V5 behaviour each change replaces is
broken.

### 1b. V7 added more uncompiled Rust — check these too

`cargo check` covers all of them, but they are listed because they changed signatures and their
callers changed with them:

| File | Change | Why a caller might break |
|---|---|---|
| `commands.rs` — 8 stub commands | `workflow_versions`, `workflow_version_restore`, `evaluation_save`, `evaluation_history`, `suite_list`, `suite_save`, `run_request_take`, `skill_touch` | Six changed `Value` → `Result<Value, String>` and one `Result<(), String>` → `Result<Value, String>`. `invoke()` now **rejects** where it used to resolve. No UI calls them today, so nothing should break — but confirm that is still true. |
| `commands.rs` — `secret_set` / `secret_exists` | Return the real storage location instead of a bare boolean | `ProvidersPage.tsx` was updated to match. If you add another caller, read `SecretStatus` in `src/ipc/client.ts`. |
| `commands.rs` — `browser_*` (5 commands) | Now return `ok: false, notAttached: true` | Three consumers were updated: `hermesRuntime.ts`, `scheduler.ts`, `BrowserPage.tsx`. |
| `commands.rs` — `mcp_call` | No longer matches `tool.starts_with("control")` | Strictly a fix: real MCP tools named `control*` are no longer hijacked. |
| `control_mcp.rs` | Rewritten; `dispatch` still returns `Value` | Already compiled and unit-tested here — this one is the safest. |
| `mcp.rs` | Added `use crate::control_mcp;` | Compiled here against real `serde_json`. |
| `secrets.rs` | `set` now returns `Result<SecretLocation, String>` | `commands.rs::secret_set` is the only caller and was updated. |

Run the Rust unit tests that already exist:

```bash
# control_mcp.rs has 6 #[cfg(test)] tests and depends only on serde_json.
mkdir -p /tmp/ctltest/src && cd /tmp/ctltest
printf '[package]\nname="ctltest"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nserde_json="1"\n' > Cargo.toml
cp $OLDPWD/mj/src-tauri/src/control_mcp.rs src/lib.rs
cargo test
# expect: 6 passed; 0 failed
```

## 2. Install a coding agent (required for real execution)

```bash
npm i -g @anthropic-ai/claude-code && claude        # or
npm i -g @openai/codex && codex login               # or
npm i -g opencode-ai && opencode auth login
```

Then in MJ: **Providers → Re-scan PATH**. You should see an absolute path and a version for the
harness. If it says "not found", click **"Show where MJ looked"** and compare against `which claude`
in your terminal.

**OpenCode-specific gotcha** (confirmed in their issue tracker): `opencode run` starts every session
with `question: deny` and `plan_enter/plan_exit: deny`, so a run that needs to *write* can silently
cancel. If OpenCode completes without editing anything, add to `opencode.json` in the workspace:

```json
{ "permission": { "*": "allow" } }
```

MJ asks for `--agent plan` on read-only work and `--agent build` on write work, but it cannot fix
that preset from outside.

## 3. Provider keys

`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and Ollama on `127.0.0.1:11434` for the `llm` harness.
Stored in the OS keyring; if the keyring is unavailable MJ keeps them in memory and says so.

## 4. Evolution service (optional)

```bash
cd mj/evolution-service
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt     # dspy==2.5.43, dspy-gepa==0.1.4, pydantic==2.9.2, httpx==0.27.2
python -m mj_evolution.stdio_server
```

Without `dspy`, the stdio server starts and reports `available: false`. That is the honest state —
MJ will not pretend evolution ran.

## 5. Known V5 gaps still present

- `commands.rs` — `tool.starts_with("control")` shadows any real MCP server named `control*`.
- `control_mcp.rs` — `dispatch` is an echo stub while `mcp.rs` advertises 8 tools.
- `cap.browser` — `browser_navigate` canned, `browser_act` returns false, capability reports success.
- V11 (W6) closed the stub ledger: `workflow_versions` / `workflow_version_restore` were made
  real in V7, and `skill_touch`, `evaluation_save`, `evaluation_history`, `suite_list`,
  `suite_save`, `run_request_take` are implemented against the SQLite store in V11
  (`probe/stubLedger.test.ts` pins it). Remaining known gaps, stated plainly: the ACP/Tauri
  bridge commands and the new db-backed control tools were written for V11 but are compiled
  only where the GTK/WebKit toolchain exists — run `cargo check` on your machine (see
  MJ-11.0-UPGRADE.md).
- `README.md:1` still says "MJ 4.0".

## 6. V5 defects fixed in this package

| # | Defect | Fix |
|---|---|---|
| A | `WorkflowContext` incompatibility silently dropped wires (`graph/store.ts:284`) | `COMPAT.WorkflowContext` now includes Text/Markdown/JSON/URL. 41/52 → **52/52**, 164/205 → **205/205** |
| B | Ollama request malformed, transcript dropped | `commands.rs` rewritten (needs `cargo check`) |
| C | `evolutionServicePropose` sent a flat payload vs `args: Value` | `ipc/client.ts` sends `{ args }` |
| D | Python evolution service orphaned; Rust wanted a nonexistent `bridge.py` | Added `mj_evolution/stdio_server.py`; `hermes.rs` points at it |
| E | Evolution gate compared `text` to itself, so AUTONOMOUS could never accept | SUGGEST records UNMEASURED; AUTONOMOUS does a bounded measured re-run |
| F | `scheduler.ts` `skip` set written but never read | Now enforced |
| **G** | **`run_timeout` read stdout only after exit — any agent printing >64 KiB deadlocked and was killed at the timeout** | **Pipes drained on threads; proven with a 2 MB workload** |
| **H** | **A double-clicked app cannot see npm/Homebrew CLIs (no shell PATH)** | **`which_bin` searches known install dirs + login shell PATH** |
| **I** | **Coding-agent cost was `chars/4` — a fabricated number** | **Real `total_cost_usd` / token counts parsed from `--output-format json`, `--json`, `--format json`** |

---

## Layout

```
mj/
  DESKTOP-NATIVE.md      native install, per-OS deps, risk->sandbox table
  LOCAL-WORKLIST.md      this file
  src/mission/           20 files — the V6 subsystem
    missionRuntime.ts      §36 orchestrator
    harnessPolicy.ts       §6/§10/§33 risk -> real CLI sandbox flags, and real usage parsing
    organization.ts        §3/§24 OrganizationRuntime
    missionPlanner.ts      §2 planner, inspectable before execution
    supervisor.ts          §5 supervisor + §17 self-healing graph
    arbitration.ts         §6/§7 evidence-scored harness selection
    harnessAdapters.ts     §6 nine CLIs + the labelled local-test double
    failureDetection.ts    §15 eleven named failure conditions
    evaluation.ts          §18/§19 independent checks + six-dimension score
    artifactStore.ts       §12/§13 append-only versioned artifacts + lineage
    flightRecorder.ts      §14 append-only trace with a sequence scrubber
    approvals.ts           §11 the human gate
    checkpoints.ts         §23/§25/§26 resources, resume validation, rollback
    graphMutator.ts        §4/§17 mutation policy gates
    securityBoundary.ts    §33 mission-scoped permissions
    memory.ts              §20/§21/§22 scoped memory + reputation
    negotiation.ts         §8 recorded agent-to-agent negotiation
    riskPolicy.ts          §10 risk classes and threshold
    templates.ts           §27/§28 mission + organization templates
    types.ts               Mission, 10-state lifecycle, 39 event kinds
  src/pages/MissionPage.tsx  §29 Mission UI
  probe/
    acceptance.test.ts     §39 — 26 criteria
    harnessPolicy.test.ts  §6/§10/§33 at the execution boundary — 62 assertions
    engine.test.ts         V5 regression — 41 assertions
    wiring.test.ts         V5 regression — declared wires vs wires that survive
  src-tauri/               Rust, 1,751 lines — item 1
  evolution-service/       Python — item 4
```

---

## V11.3 addendum — logged, not hidden

- **Rust `unwrap()` density in `control_mcp.rs`** (13 sites): every one is a panic path
  in principle. V11.3 did not touch them — the machine that produced V11.3 has no
  cargo/GTK toolchain, and editing Rust without a compiler violates the honesty rules.
  First laptop/CI session with cargo available: convert to `map_err`-style errors and
  add the case to `probe/controlPlane.test.ts` if it is reachable from the frontend.
- **Visual pass in the three real webviews** (WebView2 / WKWebView / WebKitGTK): the
  V11.3 dot system (mechanical checkboxes, range thumbs, pill dots) is CSS-verified and
  build-verified only. Open Settings → Appearance on each platform once and confirm the
  toggle travel and dot rendering.
