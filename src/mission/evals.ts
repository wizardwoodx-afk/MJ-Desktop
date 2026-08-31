/**
 * Harness evaluation suites: how good is each coding CLI *at this project's actual work*?
 *
 * MJ already scores a single mission (`scoreMission`) and verifies a single artifact
 * (`evaluateArtifact`). Neither answers the question that comes next: *"which harness should I put on
 * the coder seat for this repository?"* Answering it from vendor benchmarks is useless — a model that
 * wins a public benchmark may still fail this project's test command. So this module runs a named set
 * of real tasks against real harnesses and reports what happened.
 *
 * Three rules shape it:
 *
 * 1. **An errored case is never counted as a pass.** If a CLI could not be spawned, timed out, or
 *    crashed, that is `errored`, and `hasErrors` stays true. Excluding an error from the denominator is
 *    how a completely broken suite ends up displaying a 100% pass rate.
 * 2. **Cost is reported as unknown when the harness reports none.** Several CLIs report tokens but no
 *    price. Summing those as $0.00 and comparing them to a harness that does report price would rank on
 *    an artefact of who happens to emit a number.
 * 3. **A comparison only compares runs of the same suite.** Pass rates across different suites are not
 *    comparable, and presenting them side by side invites exactly that mistake.
 */

import type { HarnessId } from "../domain/harness";
import { parseReportedUsage, type CapLedger, type ReportedUsage, withDeadline } from "./caps";
import { scoreMission, type ScoreInput } from "./evaluation";
import type { MissionScore } from "./types";

/* ------------------------------------------------------------------ dataset-based evals */

export const SCORE_DIMENSIONS = [
  "goalCompletion",
  "quality",
  "tests",
  "security",
  "costEfficiency",
  "latencyEfficiency",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

export interface EvalDatasetCase {
  id: string;
  title: string;
  expect: Partial<Record<ScoreDimension, number>>;
  input: () => ScoreInput | Promise<ScoreInput>;
}

export interface EvalDataset {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  cases: EvalDatasetCase[];
}

export interface CaseJudgment {
  caseId: string;
  verdict: "pass" | "fail" | "not_measured" | "error";
  score?: MissionScore;
  unmeasuredExpectations: string[];
  failures: Array<{ dimension: string; expected: number; actual: number }>;
  error?: string;
}

export interface SuiteReport {
  datasetId: string;
  datasetName: string;
  version: string;
  totals: {
    runs: number;
    pass: number;
    fail: number;
    notMeasured: number;
    errored: number;
    passRate: number;
    hasErrors: boolean;
  };
  outcomes: CaseJudgment[];
  flaky: Array<{ caseId: string; verdicts: string[] }>;
}

export function judge(c: EvalDatasetCase, score: MissionScore, maxThreshold = 1.0): CaseJudgment {
  const unmeasured: string[] = [];
  const failures: Array<{ dimension: string; expected: number; actual: number }> = [];

  for (const [dim, minVal] of Object.entries(c.expect)) {
    const d = dim as ScoreDimension;
    const expected = minVal as number;
    if (expected > maxThreshold) {
      failures.push({ dimension: d, expected, actual: (score[d] as number) ?? 0 });
      continue;
    }
    const isUnmeasured = score.unmeasured.some((u) => u.toLowerCase().includes(d.toLowerCase()));
    if (isUnmeasured) {
      unmeasured.push(d);
    } else {
      const actual = (score[d] as number) ?? 0;
      if (actual < expected) {
        failures.push({ dimension: d, expected, actual });
      }
    }
  }

  if (unmeasured.length > 0) {
    return {
      caseId: c.id,
      verdict: "not_measured",
      score,
      unmeasuredExpectations: unmeasured,
      failures,
    };
  }

  return {
    caseId: c.id,
    verdict: failures.length === 0 ? "pass" : "fail",
    score,
    unmeasuredExpectations: [],
    failures,
  };
}

export async function runDatasetSuite(
  dataset: EvalDataset,
  runner: (c: EvalDatasetCase) => Promise<ScoreInput>,
  options: { repeats?: number } = {},
): Promise<SuiteReport> {
  const repeats = Math.max(1, options.repeats ?? 1);
  const caseVerdicts = new Map<string, string[]>();
  const outcomes: CaseJudgment[] = [];
  let totalRuns = 0;
  let passCount = 0;
  let failCount = 0;
  let notMeasuredCount = 0;
  let erroredCount = 0;

  for (let r = 0; r < repeats; r++) {
    for (const c of dataset.cases) {
      totalRuns++;
      try {
        const inp = await runner(c);
        const sc = scoreMission(inp);
        const j = judge(c, sc);
        if (r === 0) outcomes.push(j);
        const list = caseVerdicts.get(c.id) ?? [];
        list.push(j.verdict);
        caseVerdicts.set(c.id, list);

        if (j.verdict === "pass") passCount++;
        else if (j.verdict === "fail") failCount++;
        else if (j.verdict === "not_measured") notMeasuredCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const j: CaseJudgment = {
          caseId: c.id,
          verdict: "error",
          unmeasuredExpectations: [],
          failures: [],
          error: msg,
        };
        if (r === 0) outcomes.push(j);
        const list = caseVerdicts.get(c.id) ?? [];
        list.push("error");
        caseVerdicts.set(c.id, list);
        erroredCount++;
      }
    }
  }

  const flaky: Array<{ caseId: string; verdicts: string[] }> = [];
  for (const [caseId, verdicts] of caseVerdicts.entries()) {
    if (new Set(verdicts).size > 1) {
      flaky.push({ caseId, verdicts });
    }
  }

  const denominator = passCount + failCount;
  const passRate = denominator > 0 ? passCount / denominator : 0;

  return {
    datasetId: dataset.id,
    datasetName: dataset.name,
    version: dataset.version,
    totals: {
      runs: totalRuns,
      pass: passCount,
      fail: failCount,
      notMeasured: notMeasuredCount,
      errored: erroredCount,
      passRate,
      hasErrors: erroredCount > 0,
    },
    outcomes,
    flaky,
  };
}

export function compareRuns(before: SuiteReport, after: SuiteReport): {
  newlyPassing: string[];
  newlyFailing: string[];
  passRateBefore: number;
  passRateAfter: number;
  deltas: Array<{ dimension: ScoreDimension; before: number; after: number; delta: number }>;
  regressions: Array<{ dimension: ScoreDimension; before: number; after: number }>;
} {
  const beforePass = new Set(before.outcomes.filter((o) => o.verdict === "pass").map((o) => o.caseId));
  const afterPass = new Set(after.outcomes.filter((o) => o.verdict === "pass").map((o) => o.caseId));
  const afterFail = new Set(after.outcomes.filter((o) => o.verdict === "fail").map((o) => o.caseId));

  const newlyPassing = [...afterPass].filter((id) => !beforePass.has(id));
  const newlyFailing = [...afterFail].filter((id) => beforePass.has(id));

  const deltas: Array<{ dimension: ScoreDimension; before: number; after: number; delta: number }> = [];
  const regressions: Array<{ dimension: ScoreDimension; before: number; after: number }> = [];

  for (const dim of SCORE_DIMENSIONS) {
    const beforeScores = before.outcomes.map((o) => o.score?.[dim] as number | undefined).filter((n): n is number => typeof n === "number");
    const afterScores = after.outcomes.map((o) => o.score?.[dim] as number | undefined).filter((n): n is number => typeof n === "number");

    const beforeAvg = beforeScores.length ? beforeScores.reduce((a, b) => a + b, 0) / beforeScores.length : 0;
    const afterAvg = afterScores.length ? afterScores.reduce((a, b) => a + b, 0) / afterScores.length : 0;
    const delta = afterAvg - beforeAvg;

    deltas.push({ dimension: dim, before: beforeAvg, after: afterAvg, delta });
    if (afterAvg < beforeAvg || newlyFailing.length > 0) {
      if (afterAvg < beforeAvg || dim === "goalCompletion") {
        regressions.push({ dimension: dim, before: beforeAvg, after: afterAvg });
      }
    }
  }

  return {
    newlyPassing,
    newlyFailing,
    passRateBefore: before.totals.passRate,
    passRateAfter: after.totals.passRate,
    deltas,
    regressions: after.totals.passRate < before.totals.passRate || newlyFailing.length > 0 ? regressions : [],
  };
}

export function renderReport(r: SuiteReport): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const lines: string[] = [
    `Evaluation Suite Report: ${r.datasetName} (v${r.version})`,
    `  Total runs: ${r.totals.runs} (pass=${r.totals.pass}, fail=${r.totals.fail}, not-measured=${r.totals.notMeasured}, errored=${r.totals.errored})`,
    `  pass rate: ${pct(r.totals.passRate)} (excludes not-measured from denominator)`,
  ];
  if (r.totals.hasErrors) {
    lines.push("  WARNING: the suite is NOT clean — at least one case encountered an error.");
  }
  if (r.totals.notMeasured > 0) {
    lines.push(`  not measured: ${r.totals.notMeasured} case(s) had unrun checks.`);
  }
  for (const o of r.outcomes) {
    lines.push(`  - [${o.verdict}] ${o.caseId}${o.error ? `: error - ${o.error}` : ""}`);
  }
  return lines.join("\n");
}

export function serializeReport(report: SuiteReport): string {
  return JSON.stringify({ schemaVersion: 1, report }, null, 2);
}

export function parseReport(raw: string): { ok: boolean; report: SuiteReport | null; errors: string[] } {
  try {
    const obj = JSON.parse(raw) as { schemaVersion?: number; report?: SuiteReport };
    if (!obj || typeof obj !== "object") return { ok: false, report: null, errors: ["Invalid JSON"] };
    if (obj.schemaVersion && obj.schemaVersion > 1) {
      return { ok: false, report: null, errors: [`Schema version ${obj.schemaVersion} is not supported.`] };
    }
    if (!obj.report) return { ok: false, report: null, errors: ["Missing report property"] };
    return { ok: true, report: obj.report, errors: [] };
  } catch (e) {
    return { ok: false, report: null, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

export function serializeDataset(dataset: EvalDataset): string {
  return JSON.stringify(
    {
      id: dataset.id,
      name: dataset.name,
      version: dataset.version,
      createdAt: dataset.createdAt,
      cases: dataset.cases.map((c) => ({ id: c.id, title: c.title, expect: c.expect, note: "input thunks are not serializable" })),
    },
    null,
    2,
  );
}

/* ------------------------------------------------------------------ suite shape */

export interface Expectation {
  /** A shell command whose exit code decides the case. Run in the case's working directory. */
  command?: string;
  /** When set, stdout must contain this. Checked case-insensitively unless `caseSensitive`. */
  outputContains?: string;
  caseSensitive?: boolean;
  /** When true, the command is expected to FAIL. Useful for "does it correctly refuse". */
  expectFailure?: boolean;
}

export interface EvalCase {
  id: string;
  /** What the harness is asked to do. Real work, not a trick question. */
  prompt: string;
  expectation: Expectation;
  /** Working directory for the case. Created by the caller; this module does not invent one. */
  cwd: string;
  /** Per-case wall clock. Falls back to the suite default. */
  timeoutMs?: number;
  /** Read-only cases run under the harness's enforced read-only mode where it has one. */
  readOnly?: boolean;
  notes?: string;
}

export interface EvalSuite {
  id: string;
  name: string;
  description: string;
  schemaVersion: 1;
  cases: EvalCase[];
  defaultTimeoutMs: number;
}

/* ------------------------------------------------------------------ results */

export type CaseOutcome = "passed" | "failed" | "errored";

export interface EvalCaseResult {
  caseId: string;
  outcome: CaseOutcome;
  /** What actually decided the outcome. Never empty for an errored case. */
  detail: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Null when the harness reported no cost — see `costKnown`. */
  costUsd: number | null;
  /** Token total. Null means the CLI reported none, which is not the same as zero. */
  tokens: number | null;
  turns: number | null;
  sessionId: string | null;
  /** The argv that was actually run, so a failure can be reproduced. */
  argv: string[];
  /** Tail of stdout/stderr. The most useful bytes when something went wrong. */
  said: string;
}

export interface EvalRun {
  suiteId: string;
  suiteName: string;
  harness: HarnessId;
  startedAt: string;
  finishedAt: string;
  results: EvalCaseResult[];
  passed: number;
  failed: number;
  errored: number;
  /**
   * Passed / (passed + failed + errored). Errors stay in the denominator on purpose.
   */
  passRate: number;
  /** True when any case could not be run. A run with errors is not a clean result. */
  hasErrors: boolean;
  costUsd: number | null;
  costKnown: boolean;
  /** Sum of reported tokens. Null when no case reported any. */
  tokens: number | null;
  durationMs: number;
  /** Why this run cannot be trusted as-is, if it cannot be. */
  caveats: string[];
}

/* ------------------------------------------------------------------ runner */

export interface CaseInvokeResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface CaseInvocation {
  bin: string;
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  timeoutMs: number;
}

export interface SuiteRunnerDeps {
  /** Build the argv for a case. Must apply the harness's enforced read-only mode when asked. */
  compose: (harness: HarnessId, c: EvalCase, readOnly: boolean) => CaseInvocation | null;
  invoke: (inv: CaseInvocation) => Promise<CaseInvokeResult>;
  /** Run the expectation command. Returns null when it could not be run at all. */
  runCheck: (command: string, cwd: string, timeoutMs: number) => Promise<{ exitCode: number | null; stdout: string; stderr: string } | null>;
  ledger?: CapLedger;
  /** Per-case ceiling when the case does not set one. */
  now?: () => number;
}

/**
 * Pull a session id out of a CLI's output.
 *
 * `ReportedUsage` deliberately carries no session id — it is about cost. Vendors also disagree on the
 * spelling (Claude uses `session_id`, OpenCode's NDJSON uses `sessionID`), so both are tried rather
 * than assuming one shape and silently recording null.
 */
function readSessionId(raw: string): string | null {
  const m = raw.match(/"(?:session_id|sessionID)"\s*:\s*"([^"]+)"/);
  return m && m[1] ? m[1] : null;
}

function summarise(s: string, limit = 400): string {
  const t = s.trim();
  if (!t) return "";
  return t.length > limit ? `…${t.slice(-limit)}` : t;
}

/**
 * Run one suite against one harness.
 *
 * A case that cannot even be dispatched (no binary, no argv the harness supports) is recorded as
 * `errored` with the reason, not skipped. Skipping would silently shrink the denominator and flatter
 * the harness — a harness that cannot be run at all would otherwise score a perfect pass rate on the
 * cases it never attempted.
 */
export async function runSuite(suite: EvalSuite, harness: HarnessId, deps: SuiteRunnerDeps): Promise<EvalRun>;
export async function runSuite(
  dataset: EvalDataset,
  runner: (c: EvalDatasetCase) => Promise<ScoreInput>,
  options?: { repeats?: number },
): Promise<SuiteReport>;
export async function runSuite(
  suiteOrDataset: EvalSuite | EvalDataset,
  harnessOrRunner: HarnessId | ((c: EvalDatasetCase) => Promise<ScoreInput>),
  depsOrOptions?: SuiteRunnerDeps | { repeats?: number },
): Promise<EvalRun | SuiteReport> {
  if (typeof harnessOrRunner === "function") {
    return runDatasetSuite(
      suiteOrDataset as EvalDataset,
      harnessOrRunner,
      (depsOrOptions as { repeats?: number }) ?? {},
    );
  }
  return runHarnessSuite(
    suiteOrDataset as EvalSuite,
    harnessOrRunner as HarnessId,
    depsOrOptions as SuiteRunnerDeps,
  );
}

async function runHarnessSuite(suite: EvalSuite, harness: HarnessId, deps: SuiteRunnerDeps): Promise<EvalRun> {
  const startedAt = new Date().toISOString();
  const startedMs = (deps.now ?? Date.now)();
  const results: EvalCaseResult[] = [];

  for (const c of suite.cases) {
    const inv = deps.compose(harness, c, c.readOnly === true);
    if (!inv) {
      results.push({
        caseId: c.id,
        outcome: "errored",
        detail: `${harness} cannot be dispatched for this case — no argv could be composed${c.readOnly ? " (a read-only case, and this harness has no enforced read-only mode)" : ""}.`,
        exitCode: null,
        timedOut: false,
        durationMs: 0,
        costUsd: null,
        tokens: null,
        turns: null,
        sessionId: null,
        argv: [],
        said: "",
      });
      continue;
    }

    const timeoutMs = c.timeoutMs ?? suite.defaultTimeoutMs;
    const t0 = deps.now ? deps.now() : Date.now();
    let r: CaseInvokeResult;
    try {
      // `withDeadline` resolves rather than throwing when the deadline wins, and hands back an
      // EnforcedResult whose `value` is null. Treating that as a normal result would record a
      // fabricated CaseInvokeResult; instead the absence is reported as an errored case.
      const enforced = await withDeadline(() => deps.invoke(inv), timeoutMs, deps.now ?? Date.now);
      if (enforced.timedOut || enforced.value === null) {
        results.push({
          caseId: c.id,
          outcome: "errored",
          detail: `Timed out after ${timeoutMs}ms. ${enforced.detail}`,
          exitCode: null,
          timedOut: true,
          durationMs: enforced.elapsedMs,
          costUsd: null,
          tokens: null,
          turns: null,
          sessionId: null,
          argv: [inv.bin, ...inv.argv],
          said: "",
        });
        continue;
      }
      r = enforced.value;
    } catch (err) {
      results.push({
        caseId: c.id,
        outcome: "errored",
        detail: `The CLI could not be run: ${err instanceof Error ? err.message : String(err)}`,
        exitCode: null,
        timedOut: false,
        durationMs: (deps.now ? deps.now() : Date.now()) - t0,
        costUsd: null,
        tokens: null,
        turns: null,
        sessionId: null,
        argv: [inv.bin, ...inv.argv],
        said: "",
      });
      continue;
    }

    // The expectation is what decides the case — not the harness's own opinion of its work.
    let outcome: CaseOutcome;
    let detail: string;
    if (r.timedOut) {
      outcome = "errored";
      detail = `Timed out after ${timeoutMs}ms. A timeout is not a failure of the code; it is an absence of result.`;
    } else if (c.expectation.command) {
      const chk = await deps.runCheck(c.expectation.command, c.cwd, timeoutMs);
      if (!chk) {
        outcome = "errored";
        detail = `The check command could not be run: ${c.expectation.command}`;
      } else {
        const wantFail = c.expectation.expectFailure === true;
        const okExit = wantFail ? chk.exitCode !== 0 : chk.exitCode === 0;
        const hay = c.expectation.caseSensitive ? chk.stdout : chk.stdout.toLowerCase();
        const needle = c.expectation.caseSensitive
          ? (c.expectation.outputContains ?? "")
          : (c.expectation.outputContains ?? "").toLowerCase();
        const okText = !needle || hay.includes(needle);
        outcome = okExit && okText ? "passed" : "failed";
        detail = okExit && okText
          ? `Check passed: \`${c.expectation.command}\` exited ${chk.exitCode}.`
          : `Check failed: \`${c.expectation.command}\` exited ${chk.exitCode}${wantFail ? " (a non-zero exit was expected)" : ""}${needle && !okText ? ` and its output did not contain "${c.expectation.outputContains}"` : ""}.`;
      }
    } else if (c.expectation.outputContains) {
      const hay = c.expectation.caseSensitive ? r.stdout : r.stdout.toLowerCase();
      const needle = c.expectation.caseSensitive ? c.expectation.outputContains : c.expectation.outputContains.toLowerCase();
      outcome = hay.includes(needle) ? "passed" : "failed";
      detail = outcome === "passed"
        ? `Output contained "${c.expectation.outputContains}".`
        : `Output did not contain "${c.expectation.outputContains}".`;
    } else {
      outcome = "errored";
      detail = "This case declares no expectation, so there is nothing to judge it by. That is a bug in the suite, not a result.";
    }

    const usage: ReportedUsage = parseReportedUsage(harness, r.stdout);
    const sid = readSessionId(r.stdout);
    results.push({
      caseId: c.id,
      outcome,
      detail,
      exitCode: r.exitCode,
      timedOut: r.timedOut,
      durationMs: r.durationMs,
      costUsd: usage.costUsd,
      tokens: usage.tokens,
      turns: usage.turns,
      sessionId: sid,
      argv: [inv.bin, ...inv.argv],
      said: summarise(r.stdout || r.stderr),
    });

    // Charge exactly what the CLI reported, under its own name. `charge` decides whether that is a
    // real dollar figure or only tokens; inventing a price here would make the cost cap meaningless.
    deps.ledger?.charge(usage);
  }

  const passed = results.filter((r) => r.outcome === "passed").length;
  const failed = results.filter((r) => r.outcome === "failed").length;
  const errored = results.filter((r) => r.outcome === "errored").length;
  const denominator = results.length;
  const costs = results.map((r) => r.costUsd);
  const costKnown = costs.every((c) => c !== null) && costs.length > 0;
  const tokenFigures = results.map((r) => r.tokens).filter((t): t is number => t !== null);

  const caveats: string[] = [];
  if (errored > 0) caveats.push(`${errored} case(s) could not be run and are counted against the pass rate, not excluded from it.`);
  if (!costKnown) caveats.push("Cost is unknown: at least one case reported no price. Comparing this run's cost to another harness's would compare a number to an absence.");
  if (denominator === 0) caveats.push("The suite has no cases, so nothing was measured.");

  return {
    suiteId: suite.id,
    suiteName: suite.name,
    harness,
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
    passed,
    failed,
    errored,
    passRate: denominator ? passed / denominator : 0,
    hasErrors: errored > 0,
    costUsd: costKnown ? costs.reduce((a, c) => a + (c ?? 0), 0) : null,
    costKnown,
    tokens: tokenFigures.length ? tokenFigures.reduce((a, t) => a + t, 0) : null,
    durationMs: (deps.now ? deps.now() : Date.now()) - startedMs,
    caveats,
  };
}

/* ------------------------------------------------------------------ comparison */

export interface HarnessComparisonRow {
  harness: HarnessId;
  passed: number;
  failed: number;
  errored: number;
  passRate: number;
  costUsd: number | null;
  costKnown: boolean;
  tokens: number | null;
  durationMs: number;
  hasErrors: boolean;
}

export interface HarnessComparison {
  suiteId: string;
  suiteName: string;
  caseCount: number;
  rows: HarnessComparisonRow[];
  /** The best pass rate, only when at least one run had no errors. */
  leader: HarnessId | null;
  /** Why the comparison should be read carefully. */
  caveats: string[];
}

/**
 * Compare harnesses on one suite.
 *
 * Runs of *different* suites are refused rather than merged: their pass rates are not comparable, and a
 * table that puts them side by side invites a reader to rank across them anyway. A run with errored
 * cases can still appear — the errors are part of the truth about that harness — but it can never be
 * declared the leader, because an absent result is not evidence of quality.
 */
export function compareHarnesses(suite: EvalSuite, runs: EvalRun[]): HarnessComparison {
  const caveats: string[] = [];
  const usable = runs.filter((r) => r.suiteId === suite.id);
  const rejected = runs.length - usable.length;
  if (rejected > 0) {
    caveats.push(`${rejected} run(s) were of a different suite and were excluded — pass rates across different suites are not comparable.`);
  }
  if (!usable.length) caveats.push("No runs of this suite were supplied, so there is nothing to compare.");

  const rows: HarnessComparisonRow[] = usable.map((r) => ({
    harness: r.harness,
    passed: r.passed,
    failed: r.failed,
    errored: r.errored,
    passRate: r.passRate,
    costUsd: r.costUsd,
    costKnown: r.costKnown,
    tokens: r.tokens,
    durationMs: r.durationMs,
    hasErrors: r.hasErrors,
  }));

  const clean = rows.filter((r) => !r.hasErrors);
  if (!clean.length && rows.length) {
    caveats.push("Every run had at least one case that could not be executed, so no harness can be ranked ahead of the others.");
  }
  if (rows.some((r) => !r.costKnown)) {
    caveats.push("At least one harness reported no price. Cost columns are not comparable across these runs.");
  }

  const leader = clean.length
    ? [...clean].sort((a, b) => b.passRate - a.passRate || a.durationMs - b.durationMs)[0]?.harness ?? null
    : null;

  return { suiteId: suite.id, suiteName: suite.name, caseCount: suite.cases.length, rows, leader, caveats };
}

/* ------------------------------------------------------------------ rendering */

const pct = (n: number): string => `${Math.round(n * 100)}%`;

export function renderRun(run: EvalRun): string {
  const lines = [
    `Suite "${run.suiteName}" on ${run.harness}`,
    `  ${run.passed} passed, ${run.failed} failed, ${run.errored} errored  →  pass rate ${pct(run.passRate)}${run.hasErrors ? "  (with errors — not a clean result)" : ""}`,
    `  cost     ${run.costKnown ? `$${(run.costUsd ?? 0).toFixed(4)}` : "unknown — this harness reported no price"}`,
    `  tokens   ${run.tokens === null ? "none reported" : run.tokens.toLocaleString()}`,
    `  wall     ${(run.durationMs / 1000).toFixed(1)}s`,
  ];
  for (const r of run.results) {
    const mark = r.outcome === "passed" ? "ok  " : r.outcome === "failed" ? "FAIL" : "ERR ";
    lines.push(`  ${mark} ${r.caseId}: ${r.detail}`);
    if (r.outcome !== "passed" && r.said) lines.push(`        it said: ${r.said.slice(0, 200)}`);
  }
  for (const c of run.caveats) lines.push(`  note: ${c}`);
  return lines.join("\n");
}

export function renderComparison(cmp: HarnessComparison | ReturnType<typeof compareRuns>): string {
  if ("rows" in cmp) {
    const lines = [`Comparison on suite "${cmp.suiteName}" (${cmp.caseCount} cases)`];
    if (!cmp.rows.length) {
      lines.push("  nothing to compare.");
    } else {
      lines.push("  harness            pass   fail  err   rate   cost        tokens   wall");
      for (const r of [...cmp.rows].sort((a, b) => b.passRate - a.passRate)) {
        lines.push(
          `  ${r.harness.padEnd(18)} ${String(r.passed).padStart(4)} ${String(r.failed).padStart(6)} ${String(r.errored).padStart(4)}  ${pct(r.passRate).padStart(5)}  ${(r.costKnown ? `$${(r.costUsd ?? 0).toFixed(4)}` : "unknown").padStart(10)}  ${(r.tokens === null ? "n/a" : r.tokens.toLocaleString()).padStart(8)}  ${(r.durationMs / 1000).toFixed(1)}s${r.hasErrors ? "  (errors)" : ""}`,
        );
      }
    }
    lines.push("", cmp.leader ? `  best on this suite: ${cmp.leader}` : "  no leader — nothing here is clean enough to rank.");
    for (const c of cmp.caveats) lines.push(`  note: ${c}`);
    return lines.join("\n");
  }

  const lines = [
    `Run Comparison: pass rate ${pct(cmp.passRateBefore)} -> ${pct(cmp.passRateAfter)}`,
    `  Newly passing: ${cmp.newlyPassing.join(", ") || "none"}`,
    `  Newly failing: ${cmp.newlyFailing.join(", ") || "none"}`,
    `  Regressions: ${cmp.regressions.map((r) => `${r.dimension} (${r.before.toFixed(2)} -> ${r.after.toFixed(2)})`).join(", ") || "none"}`,
  ];
  return lines.join("\n");
}

/* ------------------------------------------------------------------ persistence */

/**
 * Shape a run for `ipc.evaluationSave`.
 *
 * The score persisted is the pass rate, and `hasErrors` travels with it in the details. Storing a bare
 * 1.0 without that flag is how a suite that could not run ends up looking perfect in the history list.
 */
export function evaluationRecord(run: EvalRun, executionId: string | null): {
  nodeKey: string;
  executionId: string | null;
  suite: unknown;
  score: number;
  details: Record<string, unknown>;
} {
  return {
    nodeKey: `eval:${run.harness}:${run.suiteId}`,
    executionId,
    suite: { id: run.suiteId, name: run.suiteName, cases: run.results.length },
    score: run.passRate,
    details: {
      harness: run.harness,
      passed: run.passed,
      failed: run.failed,
      errored: run.errored,
      hasErrors: run.hasErrors,
      costUsd: run.costUsd,
      costKnown: run.costKnown,
      tokens: run.tokens,
      durationMs: run.durationMs,
      caveats: run.caveats,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    },
  };
}

/**
 * Turn a stored history row back into the flags the UI needs.
 *
 * Rows come back from SQLite as `unknown`, so every field is checked rather than assumed. A row whose
 * details cannot be parsed yields `hasErrors: true` — the safe reading, because claiming a clean result
 * from an unreadable record is exactly the failure mode this module exists to prevent.
 */
export function readHistoryRow(row: unknown): {
  at: string | null;
  score: number | null;
  hasErrors: boolean;
  harness: string | null;
  costKnown: boolean;
} {
  if (!row || typeof row !== "object") return { at: null, score: null, hasErrors: true, harness: null, costKnown: false };
  const r = row as Record<string, unknown>;
  const details = (r.details && typeof r.details === "object" ? r.details : {}) as Record<string, unknown>;
  const rawDetails = typeof r.details === "string" ? tryParse(r.details) : details;
  const d = (rawDetails && typeof rawDetails === "object" ? rawDetails : {}) as Record<string, unknown>;
  return {
    at: typeof r.evaluatedAt === "string" ? r.evaluatedAt : typeof r.createdAt === "string" ? r.createdAt : null,
    score: typeof r.score === "number" ? r.score : null,
    // Unreadable details are treated as "has errors" rather than "clean".
    hasErrors: typeof d.hasErrors === "boolean" ? d.hasErrors : true,
    harness: typeof d.harness === "string" ? d.harness : null,
    costKnown: typeof d.costKnown === "boolean" ? d.costKnown : false,
  };
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ validation */

/**
 * Check a suite before it is run.
 *
 * A suite with no expectations produces `errored` for every case, which is honest but useless — better
 * to say so before spending a run. Duplicate case ids make results ambiguous when read back.
 */
export function validateSuite(suite: EvalSuite): string[] {
  const problems: string[] = [];
  if (!suite.name.trim()) problems.push("The suite has no name.");
  if (!suite.cases.length) problems.push("The suite has no cases, so running it would measure nothing.");
  if (suite.defaultTimeoutMs <= 0) problems.push(`The default timeout is ${suite.defaultTimeoutMs}ms, which would time every case out immediately.`);

  const seen = new Set<string>();
  for (const c of suite.cases) {
    if (!c.id.trim()) problems.push("A case has no id, so its result could not be matched back to it.");
    else if (seen.has(c.id)) problems.push(`Case id "${c.id}" appears more than once; results would be ambiguous.`);
    else seen.add(c.id);

    if (!c.prompt.trim()) problems.push(`Case "${c.id}" has an empty prompt.`);
    if (!c.cwd.trim()) problems.push(`Case "${c.id}" has no working directory, so its check could not be run.`);
    const e = c.expectation;
    if (!e.command && !e.outputContains) {
      problems.push(`Case "${c.id}" declares no expectation. It would be recorded as errored, not passed.`);
    }
    if (e.command && e.expectFailure && e.outputContains) {
      problems.push(`Case "${c.id}" expects failure AND specific output; if the command fails there may be no stdout to match.`);
    }
  }
  return problems;
}
