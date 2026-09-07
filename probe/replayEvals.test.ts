/**
 * Probe for the V9/V10 modules: replay, evals.
 *
 * These are pure modules — no CLI, no git, no network — so they can be exercised exhaustively with
 * stubs. The stubs are deliberately dumb: if a module needs a real harness to be correct, that belongs
 * in `reviewVisibility.test.ts`, not here.
 *
 * Run: ./node_modules/.bin/esbuild probe/replayEvals.test.ts --bundle --platform=node --format=esm \
 *        --outfile=/tmp/re.mjs --log-level=error && node /tmp/re.mjs
 */
import {
  counterfactualHarness,
  decisionAt,
  diffProjections,
  project,
  renderProjection,
  timelineTicks,
} from "../src/mission/replay";
import {
  compareHarnesses,
  evaluationRecord,
  readHistoryRow,
  renderComparison,
  renderRun,
  runSuite,
  validateSuite,
  type EvalSuite,
  type SuiteRunnerDeps,
} from "../src/mission/evals";
import { FlightRecorder } from "../src/mission/flightRecorder";
import { CapLedger } from "../src/mission/caps";
import type { FlightEvent } from "../src/mission/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}`);
}

/* ------------------------------------------------------------------ fixtures */

/** A realistic trace, built through the real FlightRecorder so event shapes are the real ones. */
function trace(): FlightEvent[] {
  const r = new FlightRecorder("mission.demo");
  r.record({ kind: "MISSION_CREATED", actor: "human", authority: "human", policy: "none-required", reason: "Mission opened." });
  r.record({ kind: "MISSION_STATUS", actor: "runtime", authority: "policy:lifecycle", policy: "lifecycle", reason: "Planning.", data: { from: null, to: "PLANNING" } });
  r.record({ kind: "MISSION_PLANNED", actor: "planner", authority: "policy:plan", policy: "plan", reason: "3 steps.", evidence: ["plan.json"] });
  r.record({ kind: "AGENT_SPAWNED", actor: "runtime", authority: "policy:org", policy: "org", reason: "Coder needed.", subjectId: "a.coder", data: { agentId: "a.coder", role: "coder", name: "Coder" } });
  r.record({ kind: "AGENT_ASSIGNED", actor: "runtime", authority: "policy:org", policy: "org", reason: "Task 1 to coder.", subjectId: "a.coder", data: { agentId: "a.coder" } });
  r.record({
    kind: "HARNESS_SELECTED", actor: "runtime", authority: "policy:risk-MEDIUM", policy: "risk",
    reason: "claude will run \"fix sub\" with: claude -p", subjectId: "a.coder",
    data: { agentId: "a.coder", harness: "claude", argv: ["claude", "-p"], readOnly: false, canWrite: true, refused: false },
  });
  r.record({ kind: "APPROVAL_REQUIRED", actor: "runtime", authority: "policy:risk-MEDIUM", policy: "risk", reason: "Write access needs approval.", subjectId: "a.coder" });
  r.record({ kind: "APPROVAL_GRANTED", actor: "human", authority: "human", policy: "risk", reason: "Approved by the user.", subjectId: "a.coder" });
  r.record({ kind: "ARTIFACT_CREATED", actor: "a.coder", authority: "policy:artifact", policy: "artifact", reason: "Patch written.", subjectId: "art.patch", data: { artifactId: "art.patch", title: "calc patch" } });
  r.record({ kind: "EVALUATION_PASSED", actor: "checker", authority: "policy:eval", policy: "eval", reason: "Tests passed.", subjectId: "art.patch", data: { artifactId: "art.patch" } });
  r.record({ kind: "TASK_COMPLETED", actor: "a.coder", authority: "policy:task", policy: "task", reason: "Done.", subjectId: "a.coder", data: { agentId: "a.coder", costUsd: 0.42, tokens: 1200, turns: 3 } });
  r.record({ kind: "FAILURE_DETECTED", actor: "supervisor", authority: "policy:repair-budget", policy: "repair", reason: "Review failed.", data: { failureKind: "QUALITY", severity: "MEDIUM" } });
  r.record({ kind: "REPAIR_STARTED", actor: "supervisor", authority: "supervisor", policy: "repair", reason: "Switch harness.", data: { strategy: "SWITCH_HARNESS", taskId: "t1", attempt: 1 } });
  r.record({ kind: "HARNESS_SWITCHED", actor: "supervisor", authority: "supervisor", policy: "repair", reason: "claude -> opencode.", subjectId: "a.coder", data: { agentId: "a.coder", harness: "opencode" } });
  r.record({ kind: "REPAIR_COMPLETED", actor: "supervisor", authority: "supervisor", policy: "repair", reason: "Review passed on retry." });
  r.record({ kind: "RESOURCE_LIMIT", actor: "resource-manager", authority: "policy:budget", policy: "budget", reason: "cost ceiling reached.", data: { limit: "cost", value: 4.9, ceiling: 5 } });
  r.record({ kind: "MISSION_STATUS", actor: "runtime", authority: "policy:lifecycle", policy: "lifecycle", reason: "Finished.", data: { from: "RUNNING", to: "COMPLETED" } });
  return r.all();
}

section("0. replay: folding the real trace into state");
const events = trace();
const p = project(events);
ok("every event was folded", p.eventCount === events.length && p.uptoSeq === events.length, `${p.eventCount}/${events.length} upto=${p.uptoSeq}`);
ok("mission id came from the events", p.missionId === "mission.demo", p.missionId);
ok("final status is COMPLETED", p.status === "COMPLETED", String(p.status));
ok("status history kept both transitions", p.statusHistory.length === 2, `${p.statusHistory.length}`);
ok("the coder agent exists with its role", p.agents["a.coder"]?.role === "coder", JSON.stringify(p.agents["a.coder"]));
ok("the harness switch is reflected", p.agents["a.coder"]?.harness === "opencode", String(p.agents["a.coder"]?.harness));
ok("task assignment and completion were counted", p.agents["a.coder"]?.tasksAssigned === 1 && p.agents["a.coder"]?.tasksCompleted === 1, `${p.agents["a.coder"]?.tasksAssigned}/${p.agents["a.coder"]?.tasksCompleted}`);
ok("the artifact and its evaluation are tracked", p.artifacts["art.patch"]?.evaluated === true && p.artifacts["art.patch"]?.passed === true, JSON.stringify(p.artifacts["art.patch"]));
ok("spend is known and correct", p.spendKnown === true && Math.abs(p.spendUsd - 0.42) < 1e-9, `$${p.spendUsd} known=${p.spendKnown}`);
ok("tokens and turns were read", p.inputTokens + p.outputTokens >= 0 && p.turns === 3, `turns=${p.turns}`);
ok("approvals reconciled: granted, none outstanding", p.approvalsOutstanding === 0 && p.approvalsDecided === 1 && p.approvalsRejected === 0, `${p.approvalsOutstanding}/${p.approvalsDecided}/${p.approvalsRejected}`);
ok("the human approval counted as an intervention", p.humanInterventions === 1, `${p.humanInterventions}`);
ok("repairs, failures, limits counted", p.repairsAttempted === 1 && p.repairsCompleted === 1 && p.failuresDetected === 1 && p.resourceLimitsHit === 1, `${p.repairsAttempted}/${p.repairsCompleted}/${p.failuresDetected}/${p.resourceLimitsHit}`);
ok("decisions were extracted in order", p.decisions.length >= 5 && p.decisions.every((d, i, a) => i === 0 || a[i - 1].seq <= d.seq), `${p.decisions.length} decisions`);
ok("the human decision is flagged as human", p.decisions.some((d) => d.byHuman && d.kind === "APPROVAL_GRANTED"), "no human decision flagged");

section("1. replay: a projection of nothing is honest, not zero-shaped");
const empty = project([]);
ok("an empty trace has no status", empty.status === null, String(empty.status));
ok("an empty trace reports spend as UNKNOWN, not $0", empty.spendKnown === false, `spendKnown=${empty.spendKnown}`);
ok("the render says spend is unknown", /unknown — no harness reported a cost/.test(renderProjection(empty)), renderProjection(empty).slice(0, 120));

section("2. replay: diffing two moments");
const mid = project(events.filter((e) => e.seq <= 8));
const diff = diffProjections(mid, p);
ok("the diff is not identical", diff.identical === false, "identical");
ok("spend shows as a change", diff.changes.some((c) => c.field === "spendUsd" && c.to === "0.420"), JSON.stringify(diff.changes.filter((c) => c.field === "spendUsd")));
ok("the harness change is reported", diff.changes.some((c) => c.field.includes("harness")), JSON.stringify(diff.changes.map((c) => c.field)));
ok("decisions between the two points are listed", diff.decisionsBetween.length > 0 && diff.decisionsBetween.every((d) => d.seq > mid.uptoSeq), `${diff.decisionsBetween.length}`);
ok("diffing a projection with itself is identical", diffProjections(p, p).identical === true, "not identical");

section("3. replay: finding the decision that changed things");
const switchEvent = events.find((e) => e.kind === "HARNESS_SWITCHED");
ok("the trace contains a harness switch", switchEvent !== undefined, "missing");
if (switchEvent) {
  const at = decisionAt(events, switchEvent.seq);
  ok("decisionAt finds a decision", at !== null, "null");
  ok("the decision is the harness switch", at?.decision.label === "harness switched", String(at?.decision.label));
  ok("before/after projections bracket the decision", at !== null && at.before.uptoSeq < switchEvent.seq && at.after.uptoSeq === switchEvent.seq, `${at?.before.uptoSeq} -> ${at?.after.uptoSeq}`);
  ok("the diff across that decision shows the harness change", at !== null && at.diff.changes.some((c) => c.field.includes("harness")), JSON.stringify(at?.diff.changes.map((c) => c.field)));
}
ok("decisionAt on an empty trace is null, not a crash", decisionAt([], 5) === null, "not null");

section("4. replay: a counterfactual refuses to invent an outcome");
const cf = counterfactualHarness(events, 14, "codex");
ok("the question names both harnesses", /codex/.test(cf.question) && /opencode|claude|unknown/.test(cf.question), cf.question);
ok("the outcome is explicitly unknown", cf.outcome === "unknown — this was not re-run", cf.outcome);
ok("it states what a real test would require", cf.wouldRequire.length >= 3, `${cf.wouldRequire.length}`);
ok("no numeric result was fabricated", !/\d+\.\d+/.test(JSON.stringify(cf.outcome)), cf.outcome);

section("5. replay: the scrubber");
const ticks = timelineTicks(events);
ok("ticks are increasing", ticks.every((t, i, a) => i === 0 || a[i - 1] < t), JSON.stringify(ticks));
ok("ticks land on real sequence numbers", ticks.every((t) => events.some((e) => e.seq === t)), JSON.stringify(ticks));
ok("an empty trace yields no ticks", timelineTicks([]).length === 0, "non-empty");

/* ------------------------------------------------------------------ evals */

const suite: EvalSuite = {
  id: "suite.calc",
  name: "Calculator regression",
  description: "Three small tasks with real checks.",
  schemaVersion: 1,
  defaultTimeoutMs: 30000,
  cases: [
    { id: "fix-sub", prompt: "Make sub() subtract.", expectation: { command: "node test.js" }, cwd: "/tmp/evals-a", readOnly: false },
    { id: "explain", prompt: "Explain add().", expectation: { outputContains: "adds" }, cwd: "/tmp/evals-a", readOnly: true },
    // `git diff --exit-code` exits 0 on a clean tree and 1 on a dirty one, so expecting success here
    // means "the agent must not have written anything". expectFailure would mean the opposite.
    { id: "no-write", prompt: "Do not modify anything.", expectation: { command: "git diff --exit-code" }, cwd: "/tmp/evals-a", readOnly: true },
  ],
};

/** A stub harness that behaves differently per case, so pass/fail/error are all exercised. */
function stubDeps(behaviour: Record<string, { stdout?: string; exit?: number | null; throw?: boolean; hang?: boolean }>): SuiteRunnerDeps {
  return {
    compose: (harness, c, readOnly) => ({
      bin: `/usr/bin/${harness}`,
      argv: ["run", c.prompt, ...(readOnly ? ["--agent", "plan"] : [])],
      env: {},
      cwd: c.cwd,
      timeoutMs: c.timeoutMs ?? suite.defaultTimeoutMs,
    }),
    invoke: async (inv) => {
      const caseId = suite.cases.find((c) => inv.argv.includes(c.prompt))?.id ?? "";
      const b = behaviour[caseId] ?? {};
      if (b.throw) throw new Error(`spawn ${inv.bin} ENOENT`);
      if (b.hang) await new Promise((r) => setTimeout(r, 5000));
      return { exitCode: b.exit ?? 0, stdout: b.stdout ?? "", stderr: "", durationMs: 12, timedOut: false };
    },
    runCheck: async (command) => {
      // The check command's own result: "node test.js" passes, "git diff" reports a dirty tree.
      if (command === "node test.js") return { exitCode: 0, stdout: "all good", stderr: "" };
      if (command === "git diff --exit-code") return { exitCode: 0, stdout: "", stderr: "" };
      return null;
    },
    ledger: new CapLedger({ maxCostUsd: 5, maxTurns: 40, timeoutMs: 60000 }, Date.now()),
  };
}

section("6. evals: a clean run");
const cleanRun = await runSuite(suite, "opencode", stubDeps({
  "fix-sub": { stdout: '{"session_id":"ses_1","total_cost_usd":0.01,"num_turns":2}\nFixed sub().' },
  explain: { stdout: '{"session_id":"ses_2","total_cost_usd":0.02}\nIt adds two numbers.' },
  "no-write": { stdout: '{"session_id":"ses_3","total_cost_usd":0.03}\nunchanged' },
}));
ok("all three cases passed", cleanRun.passed === 3 && cleanRun.failed === 0 && cleanRun.errored === 0, `${cleanRun.passed}/${cleanRun.failed}/${cleanRun.errored}`);
ok("pass rate is 1 and there are no errors", cleanRun.passRate === 1 && cleanRun.hasErrors === false, `${cleanRun.passRate} hasErrors=${cleanRun.hasErrors}`);
ok("the session id was extracted from the CLI's own output", cleanRun.results[0]?.sessionId === "ses_1", String(cleanRun.results[0]?.sessionId));
ok("cost was read from the CLI and summed across cases", cleanRun.costKnown === true && Math.abs((cleanRun.costUsd ?? 0) - 0.06) < 1e-9, `$${cleanRun.costUsd} known=${cleanRun.costKnown}`);
ok("the summed cost is per-case, not a single figure", cleanRun.results.every((r) => r.costUsd !== null), JSON.stringify(cleanRun.results.map((r) => r.costUsd)));
ok("a read-only case composed the read-only argv", (cleanRun.results[1]?.argv ?? []).includes("plan"), JSON.stringify(cleanRun.results[1]?.argv));
ok("the argv is recorded so a failure is reproducible", (cleanRun.results[0]?.argv ?? []).length >= 2, JSON.stringify(cleanRun.results[0]?.argv));

section("7. evals: a failing check is a failure, not a pass");
const failRun = await runSuite(suite, "claude", stubDeps({
  "fix-sub": { stdout: "done" },
  explain: { stdout: "It multiplies." },
  "no-write": { stdout: "unchanged" },
}));
ok("the wrong explanation failed", failRun.results[1]?.outcome === "failed", String(failRun.results[1]?.outcome));
ok("the detail says what was missing", /did not contain/.test(failRun.results[1]?.detail ?? ""), String(failRun.results[1]?.detail));
// With a clean tree stubbed, "did not modify anything" is satisfied — the point of this case is that
// the decision came from the check's exit code, not from the agent's own claim.
ok("the clean-tree case passed on the check's exit code", failRun.results[2]?.outcome === "passed", String(failRun.results[2]?.outcome));
ok("and its detail cites the check, not the agent's opinion", /Check passed/.test(failRun.results[2]?.detail ?? ""), String(failRun.results[2]?.detail));

section("8. evals: a harness that cannot run is ERRORED, and stays in the denominator");
const errRun = await runSuite(suite, "kilo", stubDeps({
  "fix-sub": { throw: true },
  explain: { stdout: "It adds." },
  "no-write": { stdout: "unchanged" },
}));
ok("the unspawnable case is errored", errRun.results[0]?.outcome === "errored", String(errRun.results[0]?.outcome));
ok("the reason names the real cause", /ENOENT/.test(errRun.results[0]?.detail ?? ""), String(errRun.results[0]?.detail));
ok("hasErrors is true", errRun.hasErrors === true, `${errRun.hasErrors}`);
ok("THE KEY RULE: the error is in the denominator, so the rate is 2/3 not 2/2", Math.abs(errRun.passRate - 2 / 3) < 1e-9, String(errRun.passRate));
ok("a caveat says the errors were counted, not excluded", errRun.caveats.some((c) => /counted against the pass rate/.test(c)), JSON.stringify(errRun.caveats));

section("9. evals: a read-only case on a harness with no enforced read-only mode");
const noRoDeps: SuiteRunnerDeps = {
  ...stubDeps({}),
  compose: (_h, c, readOnly) => (readOnly ? null : { bin: "/usr/bin/kilo", argv: ["run", c.prompt], env: {}, cwd: c.cwd, timeoutMs: 1000 }),
};
const roRun = await runSuite(suite, "kilo", noRoDeps);
ok("read-only cases that cannot be dispatched are errored", roRun.results.filter((r) => r.outcome === "errored").length === 2, `${roRun.results.filter((r) => r.outcome === "errored").length}`);
ok("the reason explains why, rather than silently skipping", /no enforced read-only mode/.test(roRun.results[1]?.detail ?? ""), String(roRun.results[1]?.detail));
ok("and the pass rate reflects it", Math.abs(roRun.passRate - 1 / 3) < 1e-9, String(roRun.passRate));

section("10. evals: cost is unknown when the CLI reports none");
const noCostRun = await runSuite(suite, "codex", stubDeps({
  "fix-sub": { stdout: '{"tokens":900}' },
  explain: { stdout: "It adds." },
  "no-write": { stdout: "unchanged" },
}));
ok("costKnown is false", noCostRun.costKnown === false, `${noCostRun.costKnown}`);
ok("costUsd is null, not 0", noCostRun.costUsd === null, String(noCostRun.costUsd));
ok("the render says cost is unknown", /unknown — this harness reported no price/.test(renderRun(noCostRun)), renderRun(noCostRun).split("\n")[2] ?? "");
ok("tokens were still captured", noCostRun.tokens !== null && noCostRun.tokens >= 900, String(noCostRun.tokens));

section("11. evals: comparison refuses to rank across suites");
const cmp = compareHarnesses(suite, [cleanRun, errRun, { ...noCostRun, suiteId: "suite.other", suiteName: "Other" }]);
ok("the other suite's run was excluded", cmp.rows.length === 2, `${cmp.rows.length}`);
ok("a caveat explains the exclusion", cmp.caveats.some((c) => /not comparable/.test(c)), JSON.stringify(cmp.caveats));
ok("the leader is the clean run, not the errored one", cmp.leader === "opencode", String(cmp.leader));
ok("the render refuses to name a leader when nothing is clean", /no leader/.test(renderComparison(compareHarnesses(suite, [errRun]))), renderComparison(compareHarnesses(suite, [errRun])).split("\n").slice(-3).join(" "));

section("12. evals: persistence carries hasErrors with the score");
const rec = evaluationRecord(errRun, null);
ok("the node key identifies harness and suite", rec.nodeKey === "eval:kilo:suite.calc", rec.nodeKey);
ok("the score is the pass rate", Math.abs(rec.score - errRun.passRate) < 1e-9 && errRun.passRate === 2 / 3, `${rec.score} vs ${errRun.passRate}`);
ok("hasErrors travels in the details", (rec.details as Record<string, unknown>).hasErrors === true, JSON.stringify(rec.details));
ok("a bare score with no details reads back as hasErrors=true (the safe reading)", readHistoryRow({ score: 1 }).hasErrors === true, JSON.stringify(readHistoryRow({ score: 1 })));
ok("a full row reads back correctly", (() => { const h = readHistoryRow({ score: 0.5, evaluatedAt: "2026-01-01", details: JSON.stringify({ hasErrors: false, harness: "claude", costKnown: true }) }); return h.hasErrors === false && h.harness === "claude" && h.costKnown === true; })(), JSON.stringify(readHistoryRow({ details: JSON.stringify({ hasErrors: false, harness: "claude", costKnown: true }) })));
ok("garbage reads back as hasErrors=true rather than throwing", readHistoryRow("not an object").hasErrors === true && readHistoryRow(null).hasErrors === true, "threw or returned clean");

section("13. evals: a suite is validated before it is spent on");
ok("the good suite has no problems", validateSuite(suite).length === 0, JSON.stringify(validateSuite(suite)));
const badSuite: EvalSuite = {
  id: "suite.bad", name: "", description: "", schemaVersion: 1, defaultTimeoutMs: 0,
  cases: [
    { id: "", prompt: "", expectation: {}, cwd: "" },
    { id: "dup", prompt: "x", expectation: { command: "true" }, cwd: "/tmp" },
    { id: "dup", prompt: "y", expectation: { outputContains: "z" }, cwd: "/tmp" },
  ],
};
const probs = validateSuite(badSuite);
ok("a nameless suite is flagged", probs.some((p) => /no name/.test(p)), JSON.stringify(probs));
ok("a zero timeout is flagged", probs.some((p) => /timeout/.test(p)), JSON.stringify(probs));
ok("an id-less case is flagged", probs.some((p) => /no id/.test(p)), JSON.stringify(probs));
ok("a duplicate id is flagged", probs.some((p) => /more than once/.test(p)), JSON.stringify(probs));
ok("an expectation-less case is flagged", probs.some((p) => /no expectation/.test(p)), JSON.stringify(probs));
ok("an empty prompt is flagged", probs.some((p) => /empty prompt/.test(p)), JSON.stringify(probs));
ok("a case with no cwd is flagged", probs.some((p) => /working directory/.test(p)), JSON.stringify(probs));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
