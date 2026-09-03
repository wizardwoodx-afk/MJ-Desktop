# MJ 6.0 — AGENT ORGANIZATION RUNTIME

## The change in one sentence

V5 asked *"what should this workflow do next?"*. V6 asks *"what outcome do you want, and what
organization should exist to produce it?"* — then keeps that organization honest while it runs.

A **Mission** is an outcome-oriented objective that owns a dynamically managed organization of
agents. Everything below exists to serve that, and nothing was added that does not.

---

## What V6 adds

### The Mission itself (§1, §2)

A `Mission` has 20 fields and a 10-state lifecycle: `DRAFT → PLANNING → READY → RUNNING → PAUSED →
BLOCKED → REPAIRING → VERIFYING → COMPLETED | FAILED`. Transitions are validated by
`canTransition` — `COMPLETED` is terminal, and nothing can skip a state.

The planner produces steps with a rationale, a risk class, a dependency list and a cost estimate.
**The plan is inspectable before anything executes.** Planning creates no tasks and runs no agent;
`READY` means "here is the proposal, read it".

### An organization, not a roster (§3, §5, §24)

`OrganizationRuntime` can spawn, remove, replace, pause, resume, delegate, reassign, split, merge,
reframe and escalate — while the mission is running. Tasks are classified `PARALLEL_SAFE`,
`SEQUENTIAL`, `DEPENDENCY_BOUND`, `EXCLUSIVE` or `APPROVAL_GATED` and dispatched in waves against
the concurrency budget.

`OrganizationSupervisor` sits above the agents. It observes, forms recommendations, and executes
only what mission policy allows. It never mutates the graph directly.

### Graph evolution that is never silent (§4, §17)

Every mutation is gated: **policy → evaluation → regression**. A mutation that would discard
completed work is refused and told to roll back instead. Refused mutations are recorded with the
reason — the user sees the decision not to act, not just the acts.

### Real harness arbitration (§6, §7)

Harness choice is scored, never hardcoded. Evidence from previous runs informs it, and
**no-history is neutral (0.5), not a penalty** — a new harness is not punished for being new.
Self-reported success counts 0.6×; independently verified counts 1.0×.

### Risk becomes a real sandbox, not a label (§10, §33 — new in this pass)

This is the part that changed most. Previously the risk class appeared in the UI and the harness ran
with whatever its defaults were. Now `src/mission/harnessPolicy.ts` translates the risk class and
the mission boundary into the flags each CLI actually enforces:

| Risk | Claude Code | Codex | OpenCode |
|---|---|---|---|
| LOW / review / boundary denies writes | `--permission-mode plan --tools ""` | `--sandbox read-only` | `--agent plan` |
| MEDIUM with writes | `--permission-mode acceptEdits --max-turns N` | `--sandbox workspace-write` | `--agent build` |
| HIGH | as MEDIUM, **after** the human gate | same | same |
| CRITICAL | **refused** — escalated to a human | same | same |

A boundary that denies `filesystemWrite` produces read-only even at HIGH risk. Harnesses with no
enforced sandbox (Cursor, Grok, Cline, Kilo) say so in the recorded grant instead of claiming a
control that does not exist.

### Real cost instead of a plausible number (new in this pass)

V5 computed cost as `chars/4`. That was fiction. All three major CLIs are now invoked with their
machine-readable output format and the real figures are parsed:

- Claude Code `--output-format json` → `total_cost_usd`, `usage.input_tokens + output_tokens`
- Codex `--json` → NDJSON `turn.completed` usage (tokens; Codex does not report dollars, so MJ
  records `null` rather than converting at a guessed price)
- OpenCode `--format json` → `step_finish` cost and tokens including reasoning tokens

Where nothing is reported, usage is `null` and the flight recorder says which format it looked for.

### Independent evaluation (§18, §19)

An agent is never the sole authority on its own work. A lone `AGENT_SELF_REPORT` can never satisfy a
required check. The independent reviewer examines the **artifact**, not the producer's claim — it
fails work that is empty, trivial, or self-declares failure. An unaddressed success criterion is an
*unmet criterion* reported by the score, not a failed review.

An unrun check is `measured: false`. `fullyMeasured: false` surfaces in the UI. And
**"not verified" is not treated as "failed"**: if nothing measured a failure, the task completes
honestly and the shortfall is carried into the mission's completion instead of burning the repair
budget on a non-problem.

`scoreMission` returns **six dimensions plus what could not be measured**. There is deliberately no
single mission score.

### Failure detection and self-healing (§15, §16)

Eleven named failure conditions, each carrying `evidence[]`. Detectors refuse to fire without
evidence. Named repair strategies run as a ladder with a rationale and a recorded outcome.

**The ladder is bounded.** A repair budget per task and per mission, plus an in-flight lock so the
supervisor and the task path cannot both start a repair in the same cycle. When the budget is
exhausted the mission escalates to a human instead of looping.

### Memory, reputation, checkpoints (§20–§26)

Six memory scopes with scoped retrieval; organization reputation as evidence-not-truth; a resource
manager consulted *before* dispatch as a hard stop; checkpoints that `structuredClone` the graph and
drop everything after a rollback; pause/resume that validates restored state and fails loudly rather
than resuming half-restored.

---

## Defects fixed

| # | Defect | Consequence before the fix |
|---|---|---|
| A | `WorkflowContext` incompatibility dropped wires | 11 of 52 template wires and 41 of 205 framework wires silently vanished |
| B | Ollama handler sent `{"0": {...}}` and dropped the transcript | Local model calls could not work |
| C | `evolutionServicePropose` payload shape mismatch | Evolution proposals never reached the Python service |
| D | Rust spawned a nonexistent `vendor/mj-bridge/bridge.py` while the real Python service sat unused | Evolution was dead |
| E | Evolution gate compared `text` to itself | AUTONOMOUS could never accept anything |
| F | `scheduler.ts` wrote a `skip` set it never read | Skip was decorative |
| **G** | **`run_timeout` read stdout only after exit** | **Any coding agent printing >64 KiB filled the pipe buffer, blocked, and was killed at the timeout. Proven: the old code returns `timeout after 10s` on 2 MB of output; the new code captures 2,000,005 bytes.** |
| **H** | **A double-clicked app has no shell PATH** | **`claude` installed by npm or Homebrew was invisible, so MJ reported "not installed" on every machine** |
| **I** | **Cost was `chars/4`** | **Every spend figure in the product was invented** |
| J | Unbounded repair ladder | A failing task generated thousands of phantom `REPAIR_COMPLETED` events and never terminated |
| K | The "independent" reviewer copied the producer's `ok` flag | Independent evaluation was a second copy of the self-report |
| L | Approval-gated tasks were excluded from dispatch | The human gate was unreachable — a mission could never ask for approval |
| M | The approval gate re-classified risk from the action *string* | A task called "Release gate" scored MEDIUM and was waved through autonomously |
| N | `graphFromSteps` wired ports by position | MJ produced graphs its own validator rejected |
| O | `reorganize` recycled step ids after a rollback | The same step produced duplicate tasks |
| P | A restored mission lost its flight-recorder history | Time-travel debugging did not survive a reload |

---

## Honesty rules

1. **No fake success.** A mission that used the labelled `local-test` double returns `BLOCKED`, never
   `COMPLETED`, and states why.
2. **No fake metrics.** Cost and tokens come from the harness or are recorded as unmeasured.
3. **No self-certification.** No agent is the sole authority on its own work.
4. **No silent mutation.** Refused mutations are recorded.
5. **No single success number.** Six dimensions plus `unmeasured[]`.
6. **No UI implying unimplemented capability.** Where a control is advisory rather than enforced, the
   grant says so.

## Verification

`tsc --noEmit` exit 0 · acceptance all passing · harnessPolicy all passing · engine all passing ·
wiring all passing · `vite build` exit 0 · new Rust helpers compiled and executed with
`rustc 1.98.0`.

The one thing not compiled anywhere: the two `#[tauri::command]` functions and their registration.
See `LOCAL-WORKLIST.md` item 1.
