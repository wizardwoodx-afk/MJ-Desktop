# MOSAIC-Ω × MJ 11.11.1 — compatibility audit

Verdict up front: **yes, it works — and more of it already exists in MJ than the
design implies.** Nine of the fifteen stages have real, measured counterparts in
the current codebase; four are partial upgrades of existing subsystems; three are
genuinely new (a belief store, LATS-as-escalation, and the unified Action Packet
with mid-run regime jumps). Nothing in MOSAIC-Ω collides with MJ's proof
architecture, provided two rules are kept (below). The three-clocks idea is not
an addition to MJ — MJ already runs exactly those three clocks.

Audit basis: MJ-DESKTOP @ 7279569 (11.11.1), gates green (tsc 0 · 60/60 live ·
59/59 offline · vite clean, Node v22.23.2).

## Stage-by-stage map

| # | MOSAIC stage | Status in MJ 11.11.1 | Where | Gap |
|---|--------------|----------------------|-------|-----|
| 1 | INTENT | **Present** | `TeamRunRequest` (objective, constraints, doNotTouch, testCommand, minimumRunnableSeats, gatePolicy); Mission Control inbox | "what constitutes failure" is defined pre-run by `GatePolicy` STRICT + adversarial gate; preferences/risk/deadline are free-text constraints, not structured fields |
| 2 | BELIEF | **Partial** | web-evidence triples carry `(confidence, kind, source)` (`toTriples` in teamExecutor); lessons carry strength/evidence/decay | no world-belief store with Known / Probably / Uncertain / Contradicted / Unknown classes, no dependency tracking, no belief-vs-policy separation (Agent-BRACE). New module, same evidence discipline |
| 3 | GRAPH (GoT) | **Partial** | MJ is born a graph editor: canvas + node library can host thought graphs | no generation/transform/revisit operations over reasoning graphs as first-class artifacts |
| 4 | DIVERGE | **Present (structural)** | multi-harness seats execute independently; `evaluateConsensus` already votes | consensus is used for merge decisions only, not hypothesis-level self-consistency voting |
| 5 | SELECT | **Present** | `evolutionEngine.gateCandidate` (constraints + fitness), `evolutionBandit` UCB1, strategy adoption margin | nothing material |
| 6 | PLAN | **Present** | `planWorktrees` waves = macro plan with ordering; `planMerge` | dependency DAG is wave-level, not a full phase graph |
| 7 | SIMULATE | **Careful** | MJ's `simulated` means "did not execute" and is quarantined by the honesty rule | MOSAIC's world-model *prediction* is new and compatible ONLY if typed `prediction`, never counted as measured evidence, never merged into lessons or arm scores |
| 8 | ReAct | **Present by delegation** | each harness CLI runs its own ReAct; MJ ingests live turns via `onTurn` → fleet board | MJ deliberately has no internal ReAct (harness-agnostic orchestration) — keep it that way |
| 9 | EXECUTE | **Present, strong** | Tauri shell/git sandbox, isolated worktrees, `CapLedger` spend refusal, binary resolution, measured cost (`unmeasured` never estimated) | nothing material |
| 10 | VERIFY | **Present, strong** | exit-code-first verdicts, review-snapshot binding (`reviewedSha`), adversarial gate | per-SEAT granularity; dense per-STEP process verification is the real gap |
| 11 | ADVERSARIAL REVIEW | **Present** | adversarial gate (a DIFFERENT harness must verify), `review:deep` arm, reviewer seats on the snapshot | nothing material |
| 12 | REFLECT | **Present** | `reflectOnMission` → lessons; VERIFY ≠ REFLECT already honored (gate verdict vs. lesson memory are separate objects) | nothing material |
| 13 | SEARCH (LATS) | **Missing** | escalation exists only as elastic seats + bandit arms | LATS-as-escalation is new; the meta-router gives it a natural home |
| 14 | CONSOLIDATE (causal memory) | **Partial** | lessons chain mission → failure class → repair ladder → outcome, with evidence; `retrieveLessons` ranks by goal overlap | retrieval is similarity-plus-strength, not causal; "what happened when we tried X under similar conditions" needs decision/action/observation edges |
| 15 | EVOLVE | **Present** | 11.11.1 online experiment (attribution, MIN_TRIALS, margin), skill evolution, evolve engine | evolves strategy PARAMS; "which planner/verifier/regime is better" = meta-router learning, an extension of the same experiment machinery |

## The distinctive pieces, checked against MJ

**Meta-router (adaptive depth).** Partial present: the bandit picks arms and the
11.11.1 experiment assigns a strategy version per run — that IS a per-run regime
choice, just with narrow dimensions (reviewDepth / checkBias / serialExec /
lessonBudget). Extending the dimension set with a regime level
(shallow / normal / extreme) slots directly into `proposeVariation` +
`nextRunStrategy`, and stays honest because the governed regime is already
recorded in the run report (`report.strategy`).

**Action Packet.** Scattered present: permission = `CapLedger` + gate policy;
rollback = worktree isolation + merge gate; verification = gate + receipts;
intent = objective/constraints. Missing: ONE signed object carrying intent +
belief + prediction + risk + permission + rollback + verification BEFORE the
action. This is the most natural addition in the whole design: extend the
Ed25519 receipt pipeline to pre-action packets — proof-carrying actions instead
of proof-carrying outcomes.

**Three clocks.** Already true in MJ: fast loop = seat ReAct execution;
strategic loop = per-mission settlement (autonomy, evolve, self-evolve settle on
the same measured report); evolution loop = cross-mission lesson decay and the
strategy experiment. Strongest alignment in the audit.

**Architecture changes mid-task.** Partial: `onTurn` heartbeats exist, but all
settlement is post-run. Mid-run regime jumps are new — and they carry one
obligation: every jump must be recorded as a regime segment in the report, or
the strategy experiment loses attribution (a run governed by two regimes cannot
credit either cleanly).

## Two rules that keep the proof architecture intact

1. **Predictions are not evidence.** SIMULATE output and any world-model claim
   is typed `prediction`; probes must pin that predictions never enter lesson
   memory, arm scores, or receipts' measured facts. This is the honesty rule
   extended from "simulated runs teach nothing" to "predictions prove nothing".
2. **Attribution survives routing.** The run report records the full regime
   trajectory (which strategy/regime governed which segment). Settlement scores
   arms only on runs with a stable, recorded regime; mixed-regime runs are
   logged as experience but score for no arm — exactly how pre-11.11.1
   unattributed runs are treated today.

## What breaks if done carelessly

- Meta-router "extreme" regimes spend more → regime choice must pass the
  `CapLedger` like any other permission, or the router can bankrupt a mission.
- More strategy dimensions → larger experiment space → MIN_TRIALS per arm means
  slower adoption; that is correct behaviour, not a bug. Do not lower trials to
  make the demo move.
- LATS as default mode would torch tokens; keep it escalation-only and make the
  escalation trigger measurable (uncertainty/risk signals already settle into
  the autonomy store).

## Suggested 11.12 slice (if we build it)

1. `src/mission/belief.ts` — belief store (claim, confidence class, source,
   timestamp, dependencies), fed by web triples + run observations; briefing
   surfaces contradictions.
2. `src/mission/actionPacket.ts` — signed pre-action packet; executor refuses
   irreversible actions without one; receipts embed the packet digest.
3. Meta-router dimensions — regime level added to strategy params; regime
   trajectory recorded in `TeamRunReport`; settlement attribution rule extended.
4. Causal edges on lessons — decision/action/observation links + a
   "tried-X-under-conditions" retrieval mode.
5. Probe suite `mosaicAlign.test.ts` pinning the two rules above.

Nothing in this slice weakens 11.11.1's causal experiment; it reuses it.
