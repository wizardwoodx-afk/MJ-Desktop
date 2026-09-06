# MJ 6.0 — AGENT ORGANIZATION RUNTIME

The operative specification this build implements. Forty sections, condensed to the
binding requirements each one imposes on the code.

---

## §0 — Thesis

MJ 6.0 is a **mission-driven autonomous organization runtime** that dynamically forms,
coordinates, evaluates, repairs and reorganizes heterogeneous agents while maintaining
permissions, provenance, checkpoints, evidence, human approval and rollback.

It is explicitly **not**:

- an AI workflow builder,
- another multi-agent framework,
- an AI IDE with many coding agents.

The unit of work is a **Mission**, not a graph. The graph is how a phase executes; it
is not what the user is asked to author.

---

## §1 — Mission is a new top-level primitive

A `Mission` is not a workflow. It carries objective, constraints, success criteria,
budget, deadline, risk policy, charter reference, permissions, allowed harnesses and
artifact ids.

Eleven-state lifecycle:

```
DRAFT → PLANNING → READY → RUNNING → PAUSED → BLOCKED → REPAIRING → VERIFYING
                                                   ↓
                                            COMPLETED / FAILED
```

Implemented in `src/domain/mission.ts` (`assertTransition`, `isTerminal`, `MISSION_STATUS_COLOR`).

## §2 — The planner proposes before anything runs

The planner produces agents, teams, framework, execution graph, harness assignments,
tools, MCP servers, browser policy, workspace, verification strategy and approval
checkpoints. **The plan is inspectable before execution** and can be rejected or
edited. `src/engine/missionPlanner.ts` + `renderPlan()`.

## §3 — The organization mutates while running

`OrganizationRuntime` may spawn, remove, replace, pause and resume agents; delegate,
reassign, split and merge tasks; change the execution framework; and escalate. All of
it happens mid-run, not between runs. `src/engine/orgRuntime.ts`.

## §4 — Graph evolution is recorded, never silent

Every change records: previous version, new version, reason, triggering evidence,
requesting agent, decision authority, timestamp, evaluation result, rollback target.
An agent is never silently mutated. `src/engine/graphEvolution.ts` (`GraphMutation`).

## §5 — Supervisor

Detects: stalls, repeated failures, conflicting results, resource exhaustion,
duplicate work, dependency deadlocks, missing capabilities.
`src/engine/supervisor.ts` + `src/engine/failureClassifier.ts`.

## §6 / §7 — Coding agents as workers, history as evidence

One `CodingAgentHarness` interface over Claude Code, Codex, OpenCode, Kilo, Cursor,
Cline, Grok. **Agent history is evidence, never truth** — a harness reporting success
is a claim to be verified, not a result. `src/domain/harness.ts`,
`src/engine/harnessRunner.ts`.

## §8 — Negotiation is persisted

Agents may propose, accept, counter and reject. Every move is a structured event in
the trace, not a private conversation. `src/engine/negotiation.ts`,
`src/domain/negotiation.ts`.

## §9 — Agent contracts

Eleven explicit fields per agent. **No implicit permissions** — an agent inherits only
what the contract grants, intersected with the charter ceiling.
`src/domain/organization.ts` (`AgentContract`), `applyPermissionCeiling`.

## §10 / §11 — Risk tiers and approval as first-class state

Four risk classes: `LOW | MEDIUM | HIGH | CRITICAL`.
Three handlings: `AUTONOMOUS | SUPERVISED | HUMAN_ONLY`.

Approval is a **first-class execution state**, never a log line. It carries:

| Field | Meaning |
|---|---|
| what | the action |
| why required | the policy that demands it |
| who requested | the actor |
| what changes | the consequence of approving |
| risk | risk class |
| evidence | observable evidence ids |
| expected outcome | what should happen if approved |

`src/domain/risk.ts`, `src/engine/governor.ts`, `ApprovalPayload` in `orgRuntime.ts`,
`src/pages/GovernancePage.tsx`.

## §12 / §13 — Immutable artifacts with lineage

Fourteen fields per artifact. Every edit is a **new version**; nothing overwrites the
last known good state. An `Explain lineage` view answers *why this artifact exists*
with real parent links, not a narrative guess.
`src/domain/artifact.ts` (`buildLineage`), Artifacts tab in `src/pages/MissionPage.tsx`.

## §14 — Flight recorder

Time-travel debugging and replay from a checkpoint. Every state transition is an
event; the recorder is the source for both the UI and the supervisor.
`src/engine/flightRecorder.ts`, `src/domain/events.ts`.

## §15 — Twelve explicit failure conditions

Each is a structured event, not an exception string: repeated failure, timeout loop,
tool failure loop, same-task duplication, contradictory outputs, agent starvation,
dependency deadlock, budget exhaustion, permission denial, invalid artifact state,
regression, harness unavailable. `FAILURE_CLASSES` in
`src/engine/failureClassifier.ts`.

## §16 / §17 — Repair ladder

```
RETRY_WITH_CONTEXT → MODIFY_CONTEXT → SWITCH_HARNESS → SPAWN_SPECIALIST → ESCALATE_HUMAN
```

Every attempt records: strategy, why this strategy, what changed, expected
improvement, actual result. A self-healing graph change must pass **policy check +
independent evaluation + regression check** before activation.
`src/engine/repair.ts`, `maybeReorganize` in `orgRuntime.ts`.

## §18 / §19 — Independent multi-stage evaluation

An agent is **never the sole authority on its own success**. Judges are drawn from a
different model family than the producer. Reasoning is written before the score. Each
dimension is scored separately on a 0–5 anchored scale. Judges that disagree beyond
the threshold adopt the **stricter** score, not the average.

The mission score is always shown as **separate dimensions**: goal completion,
quality, tests, security, cost, latency, autonomy, regression-freedom.
`src/domain/rubrics.ts`, `src/engine/evaluator.ts`, `src/domain/scorecard.ts`.

## §20 / §21 — Scoped memory

Memory is scoped: mission, team, agent, artifact, decision, failure. Retrieval is
**always scoped, never dump-all**. `src/domain/memoryScopes.ts`.

## §22 — Reputation as routing evidence

Reputation informs routing. It is **evidence, not truth**, and is never used as a
gate on its own. `src/domain/reputation.ts`.

## §23 — Resource manager

Tokens, API budget, agent slots, concurrency, workspace, browser, MCP, CPU and memory
are all tracked and enforced. `src/engine/resourceManager.ts`.

## §24 — Parallelism classes

`parallel-safe | sequential | dependency-bound | exclusive | approval-gated`. Execution
order is derived from dependencies, not from canvas position.
`src/engine/topology.ts`.

## §25 / §26 — Pause, resume, checkpoint, rollback

Pause and resume persist full state. After a restart, **completed work is never
duplicated**. Checkpoints are automatic at planning, per phase, before mutation, after
repair and before approval. Rollback restores a checkpoint exactly.
`src/engine/checkpoint.ts` (`CheckpointStore`, `runnableTasks`, `deadlockedTasks`).

## §27 / §28 — Templates

Mission templates and organization templates are **starting structures, not immutable
workflows**. `src/domain/missionTemplates.ts`.

## §29 — Mission UI

Header shows status, cost, elapsed time and completion. Below it: a roster strip, a
live execution panel, and a risks-and-blockers panel. The graph editor remains
available at a lower abstraction. `src/pages/MissionPage.tsx`.

## §30 — Graph ↔ organization sync

One authoritative execution state. Graph edits and organization state reconcile
through a single sync path. `src/engine/orgGraphSync.ts`.

## §31 — Structured events

Roughly fifty structured event kinds, defined once and used by the recorder, the
supervisor, the audit ledger and the UI. `src/domain/events.ts`.

## §32 — Every autonomous action is traceable

Actor, authority, policy, reason, evidence, timestamp. The audit ledger is
**append-only and hash-chained**: each entry commits to the previous one, so editing
or removing a record invalidates every hash after it. `src/engine/audit.ts`,
`src-tauri/src/organization.rs` (`audit_ledger`).

## §33 — Mission-level security boundaries

Permissions, workspaces, network and browser policy are scoped per mission and
intersected with the charter ceiling.

## §34 — V5 architecture is preserved

Hermes, role packs, teams, frameworks, the harness layer, skills, memory, feedback,
evolution, MCP, local CLIs, Tauri, Rust, SQLite and the scheduler all remain. **V6 is
a layer on top, not a rewrite.**

## §35 — Not a feature dump

Every capability must be reachable from the Mission view and verifiable in the
acceptance run. Nothing ships as a setting that does nothing.

## §36 — The one demo

> "Build a production-ready SaaS for X"

Plan → research → architecture → coding (Claude Code) → review (Codex) → **tests
fail** → diagnose → change strategy → retry → pass → security review → lineage →
**human approval** → verified completion. All of it visible.

This is `mtpl.software-development` and is exactly what `npm run accept` executes.

## §37 — (reserved)

## §38 — No fake success

No simulated execution, no fabricated metrics, no UI that implies an unimplemented
capability. A missing capability **fails loud**.

## §39 — The twenty-step acceptance test

1. Create a Mission
2. Mission gets planned
3. Organization gets created
4. Multiple heterogeneous agents execute
5. **At least two different coding-agent harnesses participate**
6. Agents exchange artifacts
7. One task fails
8. The failure gets classified
9. MJ selects a repair strategy
10. The strategy executes
11. **Evaluation independently verifies**
12. The organization changes if necessary
13. All decisions appear in the flight recorder
14. Artifact lineage is preserved
15. **Human approval is requested for a high-risk action**
16. The mission resumes after approval
17. The mission completes
18. The user can inspect why the final artifact exists
19. **The user can roll back to a previous checkpoint**
20. Mission history becomes reusable organizational memory

Implemented as a real executable run: `npm run accept` (`tools/acceptance.ts`).

## §40 — The ladder

| Version | Adds |
|---|---|
| V4 | Nodes |
| V5 | Runtime (Hermes, frameworks, teams, harnesses) |
| V6 | Missions, organizations, coordination, arbitration, evaluation, self-healing, reorganization, verified outcome |
