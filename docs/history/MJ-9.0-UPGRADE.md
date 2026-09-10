# MJ 9.0 — what changed

Four gaps closed, a real agent team, and a strictness pass over the whole codebase.

**Verification for this release:** `tsc --noEmit` 0 errors under four newly enabled strict flags ·
`vite build` 2.73s · 13 TypeScript probe suites, **770 assertions, 0 failures** · 13 Rust tests, 0 failures
(6 on the shipped `git.rs`, 7 on the standalone proof crate).

**Verified against a real binary.** Claude Code **2.1.197** was installed from npm and MJ's composed
argv was executed by it inside a real git repository. That run found and fixed a wrong claim — see
"Corrections from the real binary" below. `probe/realCli.test.ts` (38 assertions) covers it and skips
cleanly when the binary is absent.

---

## 1. The four gaps

### (a) Time-travel replay — `src/mission/replay.ts`

MJ already stored every governance event. It could not answer "what did MJ believe at step 40?"

`replayTo(events, seq)` folds the event list into a `ReplaySnapshot` at any point: mission status,
per-task state, agents with their **granted and denied** permissions, artifacts with lineage and
evaluation results, checkpoints, repairs, budget breaches, approvals, harness selections.

- `diffSnapshots(a, b)` — what changed between two points.
- `replayIndex(events)` — chapter marks for a scrubber, so you are not stepping through 400 log lines.
- `validateTrace(events)` — **refuses** a trace with a gap or duplicate in its sequence numbers,
  because folding over a hole produces a state MJ never held.

**Honesty:** spend is tracked in `ResourceUsage`, not in the event stream, so the snapshot has no
measured-cost field at all. It reports `declaredBudgetTotalUsd` (the sum of per-agent declarations
from spawn events) and labels it as declared.

### (b) Evals harness — `src/mission/evals.ts`

`scoreMission()` scored one mission across eight dimensions. Nothing ran a set of them twice.

`runSuite(dataset, run)` runs a dataset with N repeats and produces a `SuiteReport`:
per-case verdict, per-dimension means with **how many runs actually measured them**, and flakiness
detection (verdict differed between repeats). `compareRuns(before, after)` is the actual deliverable —
not "the score is 0.8" but "security dropped 0.9 → 0.6 when we switched harness".

**The rule:** a dimension `scoreMission` could not measure is **never** averaged away. A case that
asserts on an unrun security check is reported `not_measured`, excluded from *both* sides of the pass
rate, and listed. An errored case sets `hasErrors` and the renderer prints `the suite is NOT clean` —
a suite where every case errored cannot report a perfect rate.

### (c) Cost / turn / wall-clock caps — `src/mission/caps.ts`

`ResourceManager.maySpend()` is a pre-dispatch gate. An agent that starts inside budget can then loop
for forty minutes and nothing notices.

- `CapLedger` — a live ledger charged as the run goes, with `admissionError()` between invocations.
- `withDeadline()` — a hard wall-clock deadline. It returns `timedOut: true` and **tells the caller to
  kill the child**, because JS cannot assume a process it does not own has stopped. A "timeout" that
  leaves the agent running and billing would be a fake success.
- `mayRunTurn()` — MJ counts turns itself. Cline's `--retries` is a consecutive-mistake limit, not a
  turn cap, so trusting it would leave one harness unbounded.
- `parseReportedUsage()` — **Codex's cost is forced to `null`** even if a `total_cost_usd` field
  appears. Charging a guessed price for a token count would fabricate a number the user budgets on.
  `costKind` is `"usd" | "tokens-only" | "unknown"` and the reason string says why.

### (d) Git diff — `src/mission/git.ts` + `src-tauri/src/git.rs`

MJ writes code but could not show the result. A reviewer that says APPROVED without the diff in front
of it is giving an opinion.

- **Rust** (`git.rs`, 6 commands registered in `lib.rs`): `git_is_repo`, `git_status`, `git_diff`,
  `git_diffstat`, `git_head`, `git_branch`. Pipes are drained on threads — the same fix as V5
  defect G; proven by a test that diffs **40,000 changed lines** (~330 KB) without deadlocking.
  Failures live in the payload as `{ ok, reason }`, not in `Result::Err`, because "no git binary",
  "not a repo" and "nothing changed" are three different facts.
- **TypeScript**: a real unified-diff parser (new/deleted/renamed/binary/no-trailing-newline),
  `summariseDiff`, `renderDiffSummary`, and `truncateDiffForPrompt` which **announces the truncation
  inside the text the agent receives** and forbids it from claiming a full review.
- A browser build returns `NO_FS_GIT` — an explicit failure, never an empty diff that would look like
  "the agents changed nothing".

---

## 2. The team — `src/mission/agentTeam.ts`, `agentCapabilities.ts`, `collaboration.ts`

Nine CLIs, one lineup, saved and reused.

- **Roles, not agents.** Seats are `planner / architect / coder / tester / reviewer / security /
  synthesizer / debugger`. `bindTeamToPlan()` maps plan steps to roles and sets `preferredHarness`;
  `MissionRuntime` records one `HARNESS_SELECTED` event with the per-step table. Proven end to end by
  `probe/teamBinding.test.ts` (34 assertions) against a real `MissionRuntime`.
- **Reusable and savable.** `serializeTeam` / `parseTeam` / `saveTeams` / `loadSavedTeams` /
  `upsertTeam` (bumps a `revision`, so a stale copy is detectable). Export as JSON. Four presets ship.
  The Teams page has a **Coding agent crew** section: pick the CLI per seat, see the composed command.
- **Unseated steps go to arbitration**, never to a forced seat. CRITICAL is never seated at all.

### How they actually work together (`collaboration.ts`)

The research is unambiguous: AWS CAO, Orca, Agent Orchestrator, Claude Squad, Omnigent, fractal,
Echorb and Crystal all converge on the same four mechanisms. MJ now plans all four:

1. **Worktree isolation** — each *writing* seat gets `git worktree` on `mj/<mission>/<seat>`, as a
   **sibling** of the repo (a worktree inside the repo shows up in its own status). Read-only seats
   share the base checkout, because a reviewer with a private worktree reviews a tree nobody writes to.
2. **Config bridge** — one briefing written into `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/mj.mdc`,
   `.clinerules`, `.kilo/rules.md`. Written once per path even where several harnesses share it.
3. **Claims** — seats declare paths and symbols. Conflicts are caught **before** the work; a
   symbol-level clash sequences the two seats into separate waves, because a merge can be textually
   clean and semantically broken.
4. **Cross-vendor verification** — each writer is paired with a reviewer from a **different** vendor.
   When no second vendor exists, MJ says `advisory, not as verification` instead of quietly pairing a
   seat with itself.

`planCollaboration()` returns isolation, context files, conflicts, verification pairs and ordered
waves; `setupArgv` / `teardownArgv` give the native layer the exact git commands (teardown prunes).

---

## 3. Bugs found and fixed while building

| # | Bug | Effect |
|---|---|---|
| AA | `ENFORCED_SANDBOX` hand-maintained in `harnessPolicy.ts` | Wrongly said cursor/grok/cline had **no** sandbox. Cursor's writes are `--force`-gated, Grok has `--sandbox read-only`, Cline has `-p/--plan`. Now derived from `agentCapabilities.ts`. Kilo stays `false` on purpose — its read-only is a per-agent file. |
| AB | `--sandbox read-only` emitted before `exec` | `codex --sandbox read-only exec …` does not parse. Subcommands now lead the argv. |
| AC | Cursor emitted `-p` twice | Its read-only mode **is** the prompt flag. Added an `implicit` capability. A regression test now fails on any repeated flag. |
| AD | `git log` output not trimmed | `subject` carried a trailing `\n`, so every equality check failed. Fixed in TS **and** Rust. |
| AE | No `-M` on `git diff` | Renames were invisible — a moved file looked like a delete plus an unexplained new file. |
| AF | `push()` used the caller's reason text after filtering | Produced a wave whose stated reason did not match its contents. |
| AG | Wave planner grouped by `mayWrite`, not role | A tester that edits test files was scheduled **in the coding wave**, before the code it tests existed. |
| AH | `..` survived the branch sanitizer | A seat id like `impl/../etc` reached a branch name and a directory suffix. Dot-runs now collapse. |
| AI | `rank[s.maxRisk]` with no default | An unknown risk string made it `undefined`; `undefined >= undefined` is `false`, so **every seat was filtered out** and MJ would refuse work it could do, silently. Now fails closed but visibly. |
| AJ | 4 ipc commands silently no-op'd in a browser build | `nodeStateSave`, `skillDeactivate`, `evolutionRollback`, `fsMkdir`/`fsRemove`, `browserSessionClose` returned `undefined` — a mutation that did not happen, looking like success. They now throw with the reason. |
| AK | Redundant ternary in `failureDetection.ts` | `prev.checks.length ? sorted[i-1].version : sorted[i-1].version` — both branches identical. |
| AL | `unverifiedClaims()` flagged absent capabilities | Claude and Codex looked unreliable when every flag they *do* have comes from vendor docs. Now only real claims are flagged. |
| AM | `single_vendor` fired on one writer | A team with a single writer has nothing to diversify. |

---

## 4. Code quality

Four strictness flags enabled in `tsconfig.json`, and the codebase brought to zero errors under them:

| Flag | Errors found | Now |
|---|---|---|
| `noUncheckedIndexedAccess` | 107 | 0 |
| `noImplicitReturns` | 14 | 0 |
| `noImplicitOverride` | 2 | 0 |
| `noUncheckedSideEffectImports` | 0 | 0 |

`noUncheckedIndexedAccess` is the one that mattered — it is what surfaced bugs AI, AL and AK, and 14
"not all code paths return a value" sites in `ipc/client.ts`, four of which were genuine silent no-ops.

---

## 4b. Corrections from the real binary

Installing the actual CLI was worth more than any amount of doc-reading. It produced one correction
and several confirmations:

| Claim | Verdict |
|---|---|
| `--max-turns` for Claude | **WRONG.** Zero matches in `claude --help` for 2.1.197. MJ was emitting a flag the binary does not accept. Now `null`, with a comment saying why; the turn bound comes from MJ's own `CapLedger`. |
| `-p`, `--output-format json`, `--permission-mode plan` / `acceptEdits`, `-w`, `--model`, `--resume` | Confirmed present in `--help`. |
| `total_cost_usd`, `num_turns`, `session_id` in the JSON result | Confirmed — 12, 10 and present respectively in the shipped executable, and all three arrived in a live run. |
| `parseReportedUsage` field names | Confirmed correct against real output: `cost=0 tokens=null turns=1`. |
| `--tools ""` disables all tools | Confirmed verbatim in `--help`. |

The live run stopped at `"Not logged in · Please run /login"` with `is_error: true`. **That is the
evidence, not a failure:** an unrecognised flag produces an argument error, whereas this produced a
well-formed result object carrying a session id — which proves MJ's argv parsed.

## 4c. Now wired into the UI

`src/pages/V9Page.tsx` is the 11th page (`PageKind` includes `"v9"`, nav entry "V9"). Five tabs, each
calling the same modules the runtime uses — no second implementation:

- **Replay** — paste a trace, `validateTrace` refuses a broken one, then scrub with a slider and
  chapter marks; diff against any earlier point; timeline with notable events highlighted.
- **Evals** — a real dataset with four cases exercising pass / fail / not_measured, run with N
  repeats, plus BEFORE vs AFTER comparison and copyable JSON.
- **Caps** — paste a harness's real JSON, see exactly what is charged and why; per-seat caps with
  their warnings; admission refusal shown when a ceiling is crossed.
- **Git evidence** — HEAD / status / diff / diffstat through the native commands; a browser build
  shows the refusal verbatim.
- **Team plan** — the collaboration plan for any preset crew, with worktrees, context files and
  cross-vendor verification.

## 5. Honest limits — read this before trusting anything above

- **No mission has completed against a real coding CLI.** `realCli` proves the real binary accepts
  MJ's argv and that MJ parses its real output, but the run stops at authentication: there is no
  `ANTHROPIC_API_KEY` or OAuth session here. So the chain
  `MJ → real CLI → real repo → real code → real tests → real repair` is still **not** demonstrated
  end to end.   `acceptance` all passing and `realExecution` all passing still use the labelled `local-test` worker.
- **Nothing in `agentCapabilities.ts` has been executed against a live CLI.** Flags come from vendor
  docs, each with `confidence: docs | community | unverified` and a source. Cursor's are
  community-sourced and the UI says so.
- `gitTs.test.ts` (59) **does** run real `git` 2.47.3 against real repositories, and the 6 Rust tests
  run real git. That part is genuinely verified.
- **`cargo check` has never run on the full Tauri crate** (webkit2gtk-4.1 absent, no root). `git.rs`
  was compiled and tested by stripping only its `#[tauri::command]` attribute lines — every function
  body and test is the shipped code — but the *registration* in `lib.rs` is unverified until you build.
- **No installer has ever been produced.** `BUILD-NATIVE.md` §2 is your job.
- The replay, evals and caps modules are now wired into the V9 page, but **that page has not been
  exercised in a real browser layout** — jsdom has no layout engine, so the assertions are about the
  logic, not the rendering.
- A2A (agent-to-agent protocol) was researched and **rejected**: deployment-grade stability is
  expected H2 2026 and Anthropic and Microsoft are not committed. Revisit in ~6 months.

## 6. Suites

```
acceptance 26 · harnessPolicy 71 · checkRunner 34 · realExecution 16 · engine 41
canvasGeometry 49 · firstrun 23 · agentTeam 186 · teamBinding 34 · gaps 117
gitTs 59 · collaboration 76 · realCli 38 · wiring all kept
Rust: git.rs 6 · mjgit proof crate 7
```

`realCli` skips cleanly when the Claude binary or git is absent, so the suite is safe to run on any
machine. To run it with a real CLI:

```bash
npm i @anthropic-ai/claude-code          # no API key needed for the flag check
export MJ_CLAUDE_BIN=$PWD/node_modules/.bin/claude
npx esbuild probe/realCli.test.ts --bundle --platform=node --format=esm --outfile=/tmp/rc.mjs && node /tmp/rc.mjs
```
