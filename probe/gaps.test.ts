/**
 * V9 — the three gaps that are pure TypeScript: replay, caps and evals.
 *
 * Git lives in gitTs.test.ts because it needs a real repository to be meaningful.
 */

import {
  diffSnapshots,
  emptySnapshot,
  reduceEvent,
  replayAll,
  replayIndex,
  replayTo,
  timeline,
  validateTrace,
} from "../src/mission/replay";
import {
  CapLedger,
  DEFAULT_CAPS,
  capsForSeat,
  mayRunTurn,
  nextTurn,
  parseReportedUsage,
  withDeadline,
} from "../src/mission/caps";
import {
  SCORE_DIMENSIONS,
  compareRuns,
  judge,
  parseReport,
  renderComparison,
  renderReport,
  runSuite,
  serializeDataset,
  serializeReport,
  type EvalCase,
  type EvalDataset,
} from "../src/mission/evals";
import type { FlightEvent } from "../src/mission/types";
import type { ScoreInput } from "../src/mission/evaluation";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};

/* ------------------------------------------------------------------ fixtures */

let seq = 0;
function ev(kind: FlightEvent["kind"], over: Partial<FlightEvent> = {}): FlightEvent {
  seq += 1;
  return {
    seq,
    missionId: "m1",
    ts: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(),
    kind,
    actor: "runtime",
    authority: "policy:test",
    policy: "test",
    reason: `${kind} happened`,
    evidence: [],
    subjectId: null,
    data: {},
    ...over,
  };
}

/** A trace that looks like a real mission which hit trouble and recovered. */
function realTrace(): FlightEvent[] {
  seq = 0;
  return [
    ev("MISSION_STATUS", { data: { from: null, to: "PLANNING" } }),
    ev("MISSION_STATUS", { data: { from: "PLANNING", to: "RUNNING" }, subjectId: "m1" }),
    ev("AGENT_SPAWNED", { actor: "planner", subjectId: "agent.coder", data: { definitionId: "agent.coder", title: "Coder", harness: "claude", permissions: ["filesystem.write"], denied: ["credentials"], budgetUsd: 2, timeoutMs: 600000 } }),
    ev("HARNESS_SELECTED", { actor: "team", authority: "team:team.balanced", subjectId: "step.impl", policy: "mission.team-bound" }),
    ev("TASK_DELEGATED", { subjectId: "task.1", data: {} }),
    ev("MISSION_CHECKPOINTED", { subjectId: "cp.1" }),
    ev("ARTIFACT_CREATED", { subjectId: "art.1", data: { taskId: "task.1" } }),
    ev("EVALUATION_FAILED", { subjectId: "art.1", data: { fullyMeasured: false, checks: [{ name: "tests", source: "checkRunner", passed: false, measured: true }] } }),
    ev("AGENT_FAILED", { actor: "agent.coder", subjectId: "task.1", data: { attempts: 1, harness: "claude" } }),
    ev("REPAIR_STARTED", { subjectId: "task.1", reason: "RETRY" }),
    ev("ARTIFACT_VERSIONED", { subjectId: "art.2", data: { taskId: "task.1", versionOf: "art.1" } }),
    ev("EVALUATION_PASSED", { subjectId: "art.2", data: { fullyMeasured: true, checks: [{ name: "tests", source: "checkRunner", passed: true, measured: true }] } }),
    ev("TASK_COMPLETED", { subjectId: "task.1" }),
    ev("RESOURCE_LIMIT", { subjectId: "m1", data: { limit: "maxCostUsd", value: 5, ceiling: 5 } }),
    ev("MISSION_STATUS", { data: { from: "RUNNING", to: "BLOCKED" } }),
  ];
}

console.log("\n== GAP (a): time-travel replay ==\n");

{
  const trace = realTrace();
  const end = replayAll(trace);
  ok(end.eventCount === trace.length, `all ${trace.length} events folded, got ${end.eventCount}`);
  ok(end.missionStatus === "BLOCKED", `final status is BLOCKED, got ${end.missionStatus}`);
  ok(end.statusHistory.length === 3, `three status transitions, got ${end.statusHistory.length}`);
  ok(end.agents["agent.coder"]?.harness === "claude", "the spawned agent's harness is recovered");
  ok(end.agents["agent.coder"]?.denied.includes("credentials"), "and what it was DENIED is recovered, not just what it was granted");
  ok(end.declaredBudgetTotalUsd === 2, `declared budget totalled from spawn events = $2, got ${end.declaredBudgetTotalUsd}`);
  ok(end.artifacts["art.2"]?.evaluation?.passed === true, "the passing evaluation is attached to the artifact");
  ok(end.artifacts["art.1"]?.evaluation?.passed === false, "and the failing one too");
  ok(end.artifacts["art.2"]?.versionOf === "art.1", "artifact lineage survives the fold");
  ok(end.subjects["task.1"]?.state === "COMPLETED", `task.1 ends COMPLETED, got ${end.subjects["task.1"]?.state}`);
  ok(end.subjects["task.1"]?.attempts === 1, `and its attempt count is 1, got ${end.subjects["task.1"]?.attempts}`);
  ok(end.checkpoints.length === 1 && end.repairs.length === 1, "checkpoint and repair both recorded");
  ok(end.resourceLimits[0]?.limit === "maxCostUsd", "the budget breach is in the snapshot");
  ok(end.harnessSelections[0]?.actor === "team", "the team binding is visible in replay");
}

{
  // The actual point of the feature: scrub to a moment in the middle.
  const trace = realTrace();
  const atFailure = trace.find((e) => e.kind === "AGENT_FAILED")!;
  const mid = replayTo(trace, atFailure.seq);
  ok(mid.missionStatus === "RUNNING", `at the failure the mission was still RUNNING, got ${mid.missionStatus}`);
  ok(mid.subjects["task.1"]?.state === "FAILED", `and task.1 was FAILED, got ${mid.subjects["task.1"]?.state}`);
  ok(mid.repairs.length === 0, "the repair had not started yet");
  ok(mid.artifacts["art.2"] === undefined, "the fixed artifact did not exist yet");
  ok(mid.eventCount === atFailure.seq, `folded exactly ${atFailure.seq} events, got ${mid.eventCount}`);

  const d = diffSnapshots(mid, replayAll(trace));
  ok(d.statusChanged.includes("BLOCKED"), "the diff shows the mission later went BLOCKED");
  ok(d.subjectsChangedState.some((c) => c.id === "task.1" && c.from === "FAILED" && c.to === "COMPLETED"), "and that task.1 went FAILED -> COMPLETED");
  ok(d.newRepairs === 1, "one repair happened after the scrub point");
  ok(d.artifactsAdded.includes("art.2"), "art.2 appeared after the scrub point");
  ok(d.subjectsVanished.length === 0, "no subject vanished — replay is monotonic");
}

{
  // Replay must not invent a cost.
  const end = replayAll(realTrace());
  ok(!("costUsd" in end), "the snapshot carries NO measured cost field: spend is in ResourceUsage, not the event stream");
  ok(end.declaredBudgetTotalUsd === 2, "only the DECLARED budget is present, and it is labelled as declared");
}

{
  const trace = realTrace();
  const idx = replayIndex(trace);
  ok(idx.marks.length >= 6, `the scrubber gets ${idx.marks.length} chapter marks, not ${trace.length} raw lines`);
  ok(idx.marks.some((m) => m.label.includes("BLOCKED")), "a status mark exists");
  ok(idx.marks.some((m) => m.label.includes("human") || m.label.includes("repair")), "and a repair mark");
  ok(idx.firstSeq === 1 && idx.lastSeq === trace.length, "first/last seq are right");
  const tl = timeline(trace);
  ok(tl.length === trace.length, "the timeline covers every event");
  ok(tl.filter((t) => t.notable).length < trace.length, "and marks only some of them notable, so it is skimmable");
}

{
  ok(validateTrace(realTrace()).ok, "a well-formed trace validates");
  const trace = realTrace();
  const holed = trace.filter((e) => e.seq !== 7);
  const v = validateTrace(holed);
  ok(!v.ok, "a trace with a hole is rejected");
  ok(v.problems.some((p) => /Missing sequence/.test(p)), `and it says so: ${v.problems[0]}`);
  ok(!validateTrace([]).ok, "an empty trace is not silently replayable");
  const duped = [...trace, { ...trace[2], seq: trace[2].seq }];
  ok(validateTrace(duped).problems.some((p) => /Duplicate/.test(p)), "duplicate seqs are caught");
}

{
  // reduceEvent is pure w.r.t. the snapshot it is handed.
  const snap = emptySnapshot();
  reduceEvent(snap, ev("AGENT_SPAWNED", { subjectId: "a", data: { harness: "codex", budgetUsd: 1 } }));
  ok(snap.agents.a.harness === "codex", "reduceEvent mutates the snapshot it is given");
  ok(snap.eventCount === 1, "and counts it");
}

console.log("\n== GAP (c): cost / turn / wall-clock caps ==\n");

{
  const ledger = new CapLedger({ maxCostUsd: 1, maxWallClockMs: 1000, maxInvocations: 2 }, 0);
  ok(ledger.admissionError(0) === null, "a fresh ledger admits work");
  ok(ledger.admissionError(5000) !== null, "and refuses once the wall clock is spent");
  ok(/wall clock/i.test(ledger.admissionError(5000) ?? ""), `with a reason a user can act on: ${ledger.admissionError(5000)}`);

  ledger.beginInvocation();
  const r = ledger.charge({ costUsd: 0.4, tokens: 1000, turns: 3, source: "claude" });
  ok(r.basis === "reported_usd", "a real price is charged as USD");
  ok(r.chargedUsd === 0.4 && r.breach === null, "$0.40 of a $1 ceiling is not a breach");

  const over = ledger.charge({ costUsd: 0.9, tokens: 100, turns: null, source: "claude" });
  ok(over.breach === "mission_cap", `crossing the ceiling is flagged, got ${over.breach}`);
  ok(/over a \$1\.0000 ceiling/.test(over.reason), `and the reason states both numbers: ${over.reason}`);
  ok(ledger.admissionError(0) !== null, "so the next invocation is refused");
}

{
  // THE key honesty case: Codex reports tokens and no price.
  const ledger = new CapLedger({ maxCostUsd: 1, maxWallClockMs: 0, maxInvocations: 100 });
  const r = ledger.charge({ costUsd: null, tokens: 50000, turns: null, source: "codex" });
  ok(r.basis === "tokens_only", `codex spend is recorded as tokens only, got ${r.basis}`);
  ok(r.chargedUsd === 0, "and ZERO dollars are charged, because a guessed price would be a fabricated cost");
  ok(/NOT converted to dollars/.test(r.reason), `the reason says so explicitly: ${r.reason}`);
  ok(ledger.snapshot().spentTokens === 50000, "but the tokens ARE recorded, so the run is not invisible");
  ok(ledger.snapshot().spentUsd === 0, "and the dollar total stays honestly at zero");

  const none = ledger.charge({ costUsd: null, tokens: null, turns: null, source: "mystery" });
  ok(none.basis === "unknown", "a harness that reports nothing is recorded as unknown, not zero-cost");
  ok(/true spend is unknown/.test(none.reason), `and it says the spend is unknown: ${none.reason}`);
}

{
  const r = await withDeadline(async () => "done", 1000);
  ok(r.outcome === "ok" && r.value === "done", "work inside the deadline returns normally");
  ok(!r.timedOut, "and is not marked timed out");

  const slow = await withDeadline(async () => new Promise<string>((res) => setTimeout(() => res("late"), 500)), 50);
  ok(slow.outcome === "timeout" && slow.value === null, "work past the deadline is reported as a timeout");
  ok(slow.timedOut, "and the caller is TOLD to kill the child");
  ok(/must terminate the child/.test(slow.detail), `because MJ cannot assume it stopped: ${slow.detail.slice(0, 60)}...`);

  const cancelling = await withDeadline(async (signal) => {
    await new Promise((res) => setTimeout(res, 60));
    return signal.cancelled;
  }, 20);
  ok(cancelling.outcome === "timeout", "the deadline still wins");

  const unbounded = await withDeadline(async () => 1, 0);
  ok(unbounded.outcome === "ok" && /No deadline/.test(unbounded.detail), "a zero deadline means none, and says so");
}

{
  ok(mayRunTurn({ used: 0, cap: 5 }).allowed, "turn 1 of 5 may run");
  ok(mayRunTurn({ used: 5, cap: 5 }).allowed === false, "turn 6 of 5 may not");
  ok(/Turn cap reached/.test(mayRunTurn({ used: 5, cap: 5 }).reason), "and the refusal is explained");
  let acct = { used: 0, cap: 3 };
  acct = nextTurn(acct);
  acct = nextTurn(acct);
  ok(acct.used === 2 && acct.cap === 3, "turns count up against the cap");
  ok(mayRunTurn({ used: 0, cap: 0 }).allowed, "cap 0 means no cap, and that is stated rather than guessed");
}

{
  const u = parseReportedUsage("claude", JSON.stringify({ total_cost_usd: 0.0123, usage: { input_tokens: 100, output_tokens: 50 }, num_turns: 4 }));
  ok(u.costUsd === 0.0123, `claude's cost is parsed, got ${u.costUsd}`);
  ok(u.tokens === 150, `claude's nested usage tokens are summed, got ${u.tokens}`);
  ok(u.turns === 4, "and its turn count is parsed");

  const ndjson = ['{"type":"x"}', '{"total_cost_usd":0.5}', "not json at all"].join("\n");
  ok(parseReportedUsage("cline", ndjson).costUsd === 0.5, "NDJSON is parsed line by line and malformed lines are skipped");

  const codex = parseReportedUsage("codex", JSON.stringify({ total_cost_usd: 9.99, total_tokens: 1000 }));
  ok(codex.costUsd === null, "codex's cost is forced to null even if a field by that name appears");
  ok(codex.tokens === 1000, "but its tokens are still recorded");

  const none = parseReportedUsage("hermes", "");
  ok(none.costUsd === null && none.tokens === null, "empty output yields nothing, not zero");
  ok(parseReportedUsage("x", "total_cost_usd: 5").costUsd === null, "prose that mentions a field name is not parsed as data");
}

{
  const c = capsForSeat({ timeoutSecs: 600, maxTurns: 30 }, 2);
  ok(c.caps.timeoutMs === 600000 && c.caps.maxTurns === 30 && c.caps.maxCostUsd === 2, "a fully specified seat is used as-is");
  ok(c.warnings.length === 0, "and warns about nothing");

  const bad = capsForSeat({ timeoutSecs: 5, maxTurns: null }, null);
  ok(bad.warnings.some((w) => /below the 30s floor/.test(w)), "a 5s timeout is called out as unusable, not silently accepted");
  ok(bad.warnings.some((w) => /No turn cap/.test(w)), "and a missing turn cap gets the default, with a warning");
  ok(bad.caps.maxTurns === DEFAULT_CAPS.maxTurns, "so a loop still cannot run forever");

  const zero = capsForSeat({ timeoutSecs: 0, maxTurns: 0 }, null);
  ok(zero.caps.timeoutMs === DEFAULT_CAPS.timeoutMs, "a zero timeout falls back to the default rather than running unbounded");
}

console.log("\n== GAP (b): evals harness ==\n");

function input(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    successCriteria: ["builds", "tests pass"],
    criteriaMet: ["builds", "tests pass"],
    // Full EvaluationCheck shape — the earlier version of this fixture used `as never` to skip the
    // required id/score/detail fields, which meant it never proved the real shape typechecks.
    checks: [{ id: "c.lint", name: "lint", source: "STATIC_CHECK", passed: true, measured: true, score: 1, detail: "no findings", evidence: [] }],
    testChecks: [{ id: "c.unit", name: "unit", source: "TEST_RUN", passed: true, measured: true, score: 1, detail: "all passed", evidence: [] }],
    securityChecks: [],
    spentUsd: 0.5,
    budgetUsd: 5,
    elapsedMs: 1000,
    deadlineMs: 10000,
    humanInterventions: 0,
    regressionCount: 0,
    ...over,
  };
}

const dataset: EvalDataset = {
  id: "ds.1",
  name: "Regression set",
  version: "1.0.0",
  createdAt: new Date().toISOString(),
  cases: [
    { id: "happy", title: "Everything passes", expect: { goalCompletion: 1, tests: 1 }, input: () => input() },
    { id: "goal", title: "Only half the criteria met", expect: { goalCompletion: 1 }, input: () => input({ criteriaMet: ["builds"] }) },
    { id: "sec", title: "Asserts on security, which was never run", expect: { security: 0.8 }, input: () => input() },
  ],
};

{
  const report = await runSuite(dataset, async (c) => c.input());
  ok(report.totals.runs === 3, `three cases ran, got ${report.totals.runs}`);
  ok(report.totals.pass === 1, `one passed, got ${report.totals.pass}`);
  ok(report.totals.fail === 1, `one failed, got ${report.totals.fail}`);
  ok(report.totals.notMeasured === 1, `one was NOT MEASURED, got ${report.totals.notMeasured}`);
  ok(report.totals.passRate === 0.5, `pass rate is 1/2 = 0.5, got ${report.totals.passRate}`);
  ok(report.totals.passRate !== 1 / 3, "and not-measured is excluded from the denominator, not counted as a pass");

  const sec = report.outcomes.find((o) => o.caseId === "sec")!;
  ok(sec.verdict === "not_measured", `the security case is not_measured, got ${sec.verdict}`);
  ok(sec.unmeasuredExpectations.includes("security"), "and it names the dimension that was never run");
  ok(sec.failures.length === 0, "an unrun check is NOT a failure");

  const goal = report.outcomes.find((o) => o.caseId === "goal")!;
  ok(goal.verdict === "fail", "a case below its floor fails");
  ok(goal.failures[0]?.dimension === "goalCompletion" && goal.failures[0]?.actual === 0.5, "and the report shows the actual value");
}

{
  // judge() directly: the rule that keeps unmeasured out of the pass rate.
  const score = (await runSuite(dataset, async (c) => c.input())).outcomes[0].score!;
  ok(judge({ ...dataset.cases[0], expect: { tests: 0.5 } }, score, 10).verdict === "pass", "a measured dimension above its floor passes");
  ok(judge({ ...dataset.cases[0], expect: { tests: 1.5 } }, score, 10).verdict === "fail", "above 1.0 is unreachable and fails");
  ok(SCORE_DIMENSIONS.length === 6, `six dimensions can be asserted on, got ${SCORE_DIMENSIONS.length}`);
}

{
  // Flakiness: the same case giving different verdicts across repeats.
  let n = 0;
  const flaky: EvalDataset = {
    id: "ds.f",
    name: "Flaky",
    version: "1",
    createdAt: new Date().toISOString(),
    cases: [{ id: "coin", title: "Coin flip", expect: { goalCompletion: 1 }, input: () => input({ criteriaMet: (n += 1) % 2 ? ["builds", "tests pass"] : ["builds"] }) }],
  };
  const r = await runSuite(flaky, async (c) => c.input(), { repeats: 4 });
  ok(r.totals.runs === 4, "four repeats ran");
  ok(r.flaky.length === 1, `the case is reported as flaky, got ${r.flaky.length}`);
  ok(new Set(r.flaky[0].verdicts).size === 2, "because its verdict differed between repeats");
}

{
  const before = await runSuite(dataset, async (c) => c.input());
  const after = await runSuite({ ...dataset, version: "2.0.0" }, async (c) => (c.id === "goal" ? input() : c.input()));
  const cmp = compareRuns(before, after);
  ok(cmp.newlyPassing.includes("goal"), `fixing the goal case shows up as newly passing: ${cmp.newlyPassing.join(",")}`);
  ok(cmp.passRateAfter > cmp.passRateBefore, "and the pass rate rose");
  ok(cmp.deltas.length === SCORE_DIMENSIONS.length, "every dimension is compared");
  ok(cmp.regressions.length === 0, "no regressions in an improvement");
  ok(renderComparison(cmp).includes("pass rate"), "the comparison renders");

  // A regression must be caught.
  const worse = await runSuite({ ...dataset, version: "0.9.0" }, async (c) => (c.id === "happy" ? input({ criteriaMet: [] }) : c.input()));
  const cmp2 = compareRuns(before, worse);
  ok(cmp2.newlyFailing.includes("happy"), `breaking the happy case shows up as newly failing: ${cmp2.newlyFailing.join(",")}`);
  ok(cmp2.regressions.some((d) => d.dimension === "goalCompletion"), "and goalCompletion is flagged as a regression");
}

{
  const report = await runSuite(dataset, async (c) => c.input());
  const text = renderReport(report);
  ok(/pass rate/.test(text) && /excludes not-measured/.test(text), "the rendered report explains its own denominator");
  ok(/not measured/.test(text), "and lists what could not be measured");
  ok(!/\bscore: 0\.\d+\b/.test(text), "there is no single headline score, per §19");
  const round = parseReport(serializeReport(report));
  ok(round.errors.length === 0 && round.report?.totals.pass === report.totals.pass, "a report round-trips");
  ok(parseReport("garbage").report === null, "a corrupt report is refused");
  ok(parseReport('{"schemaVersion":99}').errors[0].includes("Schema version"), "a future schema is refused with a message");
  ok(/not serializable/.test(serializeDataset(dataset)), "the dataset format STATES that input thunks are dropped, rather than losing them silently");
}

{
  // An erroring runner must not take the suite down.
  const r = await runSuite(dataset, async (c) => {
    if (c.id === "goal") throw new Error("harness exploded");
    return c.input();
  });
  ok(r.totals.errored === 1, "one case errored");
  ok(r.outcomes.find((o) => o.caseId === "goal")?.error === "harness exploded", "and the error message is preserved");
  ok(r.totals.pass === 1, "the rest of the suite still ran");
  // An errored case is excluded from the rate, which leaves 1 pass / 0 fail = 1.0. That is correct
  // arithmetic but it must never LOOK clean, so hasErrors is reported alongside and the renderer
  // shouts about it.
  ok(r.totals.passRate === 1, `the rate covers only what ran: 1/1 = 1, got ${r.totals.passRate}`);
  ok(r.totals.hasErrors === true, "and hasErrors is set, so a broken suite cannot pass as clean");
  ok(/NOT clean/.test(renderReport(r)), "and the rendered report says so out loud");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
