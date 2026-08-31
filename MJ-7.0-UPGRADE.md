# MJ 7.0 — THE VERIFICATION RELEASE

**Thesis of this release:** *a mission may only be called complete when something other than the
agent that did the work says so.*

V6 built the Mission subsystem: objectives, organizations, risk classes, repair ladders, lineage,
approvals. It was honest about one thing and wrong about everything downstream of it. It could not
actually measure whether work was correct. `TEST_RUN` and `STATIC_CHECK` were either a real harness
whose prose output was parsed with a regex, or a labelled simulation that produced
`measured: false`. Which meant a mission could never truthfully reach `COMPLETED` — the score always
carried an unmeasured dimension.

V7 makes verification real, then hunts down every remaining place where MJ says something happened
that did not happen.

---

## 1. Real verification (`src/mission/checkRunner.ts`)

MJ now runs **the target repository's own commands** and turns the exit code into a measured check.
It does not invent test commands and it does not parse an agent's prose to decide whether tests
passed.

Discovery reads the repo's manifests — it never guesses:

| Manifest | Discovered check | Source |
|---|---|---|
| `package.json` `scripts.test` | the project's own test command | `TEST_RUN` |
| `package.json` `scripts.typecheck` / `lint` / `build` | those exact scripts | `STATIC_CHECK` |
| `Cargo.toml` | `cargo test`, `cargo check` | both |
| `pyproject.toml` / `pytest.ini` | `python -m pytest` | `TEST_RUN` |

Two rules keep it honest:

1. **A check that could not run is not a failed check.** If `node_modules` is missing, MJ refuses to
   run `npm test` — because it would exit non-zero with a misleading message, and that would be
   recorded as a test failure that never happened. The result is `didRun: false, exitCode: null`
   with the reason stated.
2. **Only an exit code counts as measurement.** Prose, self-report and simulation all produce
   `measured: false`.

This needed **no new Rust**. `ipc.shellExec` already existed and already routed to `shell_exec`,
which uses the deadlock-free `run_timeout` fixed in V6.

### Wiring into evaluation

`MissionRuntime.evaluate` now consults real checks first. The repository's suite is run **once per
mission** (not per artifact, which would be wasteful and would make the score depend on when an
artifact happened to be produced), cached, and recorded in the flight recorder as
`EVALUATION_STARTED` with policy `evaluation.repository-own-commands`. Precedence:

```
real measured check  >  real harness output  >  labelled simulation (measured:false)
```

`finish()` still refuses `COMPLETED` when any execution was simulated. Real verification does not
launder simulated work — both have to be real.

---

## 2. What was actually run, and what it returned

Not claims. Output.

```
probe/checkRunner.test.ts      34 passed, 0 failed
probe/realExecution.test.ts    16 passed, 0 failed, 0 skipped
probe/acceptance.test.ts       26 passed, 0 failed
probe/harnessPolicy.test.ts    62 passed, 0 failed
probe/engine.test.ts           41 passed, 0 failed
probe/wiring.test.ts           all template and framework wires kept, dropped=0
tsc --noEmit                   0 errors
vite build                     built in 2.58s
cargo test (control_mcp)       6 passed, 0 failed   ← first Rust in this project ever compiled
```

`probe/realExecution.test.ts` is the one that matters, because **it injects no fakes**. It creates
real repositories on disk and drives them through the real runtime:

```
green repo: exit=0, 97 bytes of real pytest output
red repo:   exit=1, failure text captured: true
rust repo:  cargo check exit=0
Ran the repository's own verification: pytest=exit 0
TEST_RUN checks: 3, measured: 3, passed: 3
mission status: BLOCKED (simulated worker, real verification)
```

That last line is the release in one line: verification was real, execution was a simulation, so the
mission correctly refused to claim completion.

Three bugs were found by writing those tests rather than by reading the code:

- **Directory existence.** The first `exists()` was implemented with `fsRead`. A directory cannot be
  read as text, so `node_modules` read as absent and *every* npm-based check was silently refused.
  Caught only because the suite asserts both directions — "must refuse when absent" *and* "must run
  when present".
- **Native paths were dead outside Tauri.** `readNative`/`runNative` unconditionally went through
  `ipc`, which throws anywhere but the desktop shell. The headline feature would have been dead on
  arrival in every other context. It is now environment-aware (Tauri IPC / node fs / honest refusal
  in a browser).
- **The Rust validator did not compile.** `colour` was passed by value where `&mut` was required, and
  `from` was used after being moved. Both found by `cargo test`, both fixed.

---

## 3. The debugging pass — 7 defect classes, 24 sites

Every one of these reported success while doing nothing. They are listed with what they actually did.

### Q — a prefix match hijacked real MCP tools
`commands.rs:380` read `if server_id == "mcp.control" || tool.starts_with("control")`. Any real MCP
server exposing a tool named `control*` — `controlnet_generate`, `kubernetes_control_plane_status` —
was silently answered by MJ's stub instead of being called. Now matches only `server_id == "mcp.control"`.

### R — eight commands that claimed success
| Command | What it did | Now |
|---|---|---|
| `workflow_versions` | returned `[]` — reads as "no versions yet" | **really implemented** (the `versions` table existed all along) |
| `workflow_version_restore` | `Ok(())` for *any* id | **really implemented**, errors on an unknown id |
| `workflow_version_create` | hardcoded `version = 1`; returned the literal id `"ver"` | increments from `MAX(version)+1`, returns the real id |
| `evaluation_save` | fabricated `{id, score}`, stored nothing | errors, says nothing was persisted |
| `evaluation_history`, `suite_list` | `[]`, indistinguishable from "never ran" | errors, says the list is not meaningful |
| `suite_save` | fabricated an id for a suite never written | errors |
| `run_request_take` | `vec![]` unconditionally, so queued work was never taken | **really implemented** against the real `run_queue` schema, drains destructively like the browser side |
| `skill_touch` | `Ok(())`, usage never recorded | errors |

The same lies existed as **browser fallbacks in `src/ipc/client.ts`** — the bug was on both sides of
the wire, so both were fixed. None of these eight has a UI caller today; they were reachable only
from Rust, which is its own finding.

### S — version numbers that never advanced
`workflow_version_create` inserted `version = 1` every time and returned the constant string `"ver"`
as the new row's id. The fifth save was still "version 1", and no caller could ever reference the row
it had just created.

### T — the frontend's own fabrications
`client.ts` returned `{ id: "eval-<timestamp>", score }` for a save that stored nothing, and `[]` for
histories that were never persisted. An empty list and a missing feature look identical in a UI.

### U — the Control MCP was a pure echo server
`control_mcp.rs` was 23 lines. It returned `ok: true` with the arguments echoed back for
`connect_ports`, `disconnect_ports`, `run_workflow`, `pause_execution`, `resume_execution`,
`cancel_execution` and `list_nodes` — **while doing nothing at all** — and `validate_graph` returned
a canned pass without looking at the graph. `mcp.rs` advertised `toolCount: 8` and listed all eight
names, so a caller had no way to know.

Rewritten. `validate_graph` now performs real structural validation with named finding codes:
`missing_node_id`, `empty_node_id`, `duplicate_node_id`, `missing_node_type`, `bad_nodes`,
`bad_wires`, `incomplete_wire`, `wire_from_unknown_node`, `wire_to_unknown_node`, `self_loop`,
`cycle` (real DFS colouring, reports the actual cycle path), `no_graph`, `empty_graph`. It reports
`checked: true/false` so "I validated nothing" can never be mistaken for "it passed". The seven
unimplemented tools return `ok: false, notImplemented: true`. `mcp.rs` now advertises
`toolCount: 1`, plus `advertisedToolCount` and `notImplementedTools` so the gap is explicit.
Six Rust unit tests cover it.

### V — a browser that was never launched
The most convincing lie in the codebase:

```rust
pub fn browser_session_create() -> Value {
    json!({ "sessionId": format!("sess-{}", Uuid::new_v4().simple()), "engine": "native" })
}
pub fn browser_navigate(_session_id: String, url: String, ..) -> Value {
    json!({ "url": url, "title": "Native browser session", "engine": "native" })
}
```

A real UUID for a browser that was never started, then **an invented page title**. An agent reading
that response believed it had seen the page. `browser_screenshot` returned `{"path": ""}`,
`browser_console` returned empty lists — indistinguishable from "the page was clean".

All five now return `ok: false, notAttached: true` with one shared honest reason, on both the Rust
and browser sides. And the three consumers were fixed too, because an honest backend behind a lying
caller is still a lie:

- `hermesRuntime.ts` `browser_navigate` tool — fails closed instead of serialising the refusal as if
  it were a result.
- `scheduler.ts` `cap.browser` — **threw nothing and reported a successful node output**; now throws.
- `pages/BrowserPage.tsx` — toasted `"Navigated"` unconditionally; now toasts the real reason with
  `"err"` styling.

### W — secrets that were not where the user was told
`SecretStore::set` tried the OS keychain and, on failure, put the value in an in-process `HashMap`
and **still returned `Ok(())`**. The UI toasted "Saved". The key was gone at the next restart.

`set` now returns a `SecretLocation` (`Keychain` / `MemoryOnly` / `Absent`), the store tracks which
refs are degraded, and `secret_exists` reports `{ exists, location, survivesRestart, warning }`
instead of a bare boolean. `ProvidersPage` shows "configured" / "in memory only" / "browser storage",
prints the warning, and toasts the truth on save. The browser fallback reports
`browser-localStorage` — which does survive a reload, but is not a keychain and is readable by
anything in that origin.

---

## 4. Two claims I made earlier that were wrong

Recorded here because they were stated confidently and are not true.

1. **"capabilities/desktop.json is missing `shell:*`/`fs:*`/`store:*` permissions."** It is not, in
   any way that matters. `shell_exec` and `fs_*` are custom `#[tauri::command]`s — there are zero
   references to `tauri_plugin_shell` or `tauri_plugin_fs` anywhere in `src-tauri/src/`. `core:default`
   covers custom commands. No change was needed and none was made.
2. **"`hermesRuntime.ts` is at `src/mission/`."** It is at `src/engine/hermesRuntime.ts`. The browser
   bug described against it was real; the path was not.

---

## 5. What is still not true

Unchanged, and worth repeating because it is the largest gap in the project:

- **No mission has ever run against a real coding CLI.** All 26 acceptance criteria and the 16
  real-execution assertions ran against the `local-test` double for the *worker* role. The
  verification half is now genuinely real — pytest and cargo really ran — but no Claude Code, Codex
  or OpenCode process has ever been started by this code. The adapters are written against
  documented flags; none of them has been exercised against a live CLI.
- **The 62 harnessPolicy fixtures are shaped from documentation, not captured runs.** If a flag has
  changed upstream, the fixtures will not tell you.
- **`cargo check` has still never run on the full Tauri crate.** `webkit2gtk-4.1`, `gtk+-3.0` and
  `libsoup-3.0` are absent from this sandbox and cannot be installed without root. What *was*
  compiled and tested here: `control_mcp.rs` + `mcp.rs` against real `serde_json` (6 tests passing),
  and the dependency-free PATH/timeout helpers. Everything else is parse-checked only.
  **Run `cargo check` locally — it is item 1 of LOCAL-WORKLIST.md.**
- **The evolution service's Python pins are not importable here**, so it reports `available: false`
  rather than pretending.

---

## 6. Files changed in this release

```
new   src/mission/checkRunner.ts        discovery + execution + the two no-lying rules
new   probe/checkRunner.test.ts         34 assertions
new   probe/realExecution.test.ts       16 assertions, no fakes injected
mod   src/mission/missionRuntime.ts     realCheckResults(), evaluate() prefers measured checks
mod   src-tauri/src/control_mcp.rs      rewritten: real validator + 6 Rust tests
mod   src-tauri/src/mcp.rs              honest toolCount
mod   src-tauri/src/commands.rs         Q, R, S, V, W
mod   src-tauri/src/secrets.rs          SecretLocation, degraded tracking
mod   src/ipc/client.ts                 T, V, W + SecretStatus type
mod   src/ipc/localDb.ts                SecretStatus shape
mod   src/engine/hermesRuntime.ts       browser tool fails closed
mod   src/engine/scheduler.ts           cap.browser throws instead of reporting success
mod   src/pages/BrowserPage.tsx         toast follows the result
mod   src/pages/ProvidersPage.tsx       says where the key actually is
mod   package.json                      + @types/node (devDependency, for the node fs path)
```
