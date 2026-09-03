import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/mission/replay.ts
function str(v, fallback = "") {
  return typeof v === "string" && v.length ? v : fallback;
}
function emptySnapshot() {
  return {
    eventCount: 0,
    missionStatus: null,
    statusHistory: [],
    agents: {},
    declaredBudgetTotalUsd: 0,
    artifacts: {},
    subjects: {},
    checkpoints: [],
    repairs: [],
    resourceLimits: [],
    harnessSelections: []
  };
}
function reduceEvent(snap, e) {
  snap.eventCount += 1;
  const d = e.data ?? {};
  switch (e.kind) {
    case "MISSION_STATUS": {
      const to = str(d.to ?? d.status);
      if (to) {
        snap.statusHistory.push({ seq: e.seq, from: typeof d.from === "string" ? d.from : null, to, ts: e.ts });
        snap.missionStatus = to;
      }
      break;
    }
    case "AGENT_SPAWNED": {
      const id = str(e.subjectId ?? d.agentId ?? d.definitionId);
      if (id) {
        const budget = typeof d.budgetUsd === "number" ? d.budgetUsd : 0;
        snap.agents[id] = {
          id,
          harness: typeof d.harness === "string" ? d.harness : null,
          permissions: Array.isArray(d.permissions) ? d.permissions : [],
          denied: Array.isArray(d.denied) ? d.denied : [],
          budgetUsd: budget
        };
        snap.declaredBudgetTotalUsd += budget;
      }
      break;
    }
    case "HARNESS_SELECTED": {
      snap.harnessSelections.push({
        seq: e.seq,
        actor: e.actor,
        authority: e.authority,
        policy: e.policy,
        subjectId: e.subjectId,
        data: d
      });
      break;
    }
    case "TASK_DELEGATED": {
      const id = str(e.subjectId);
      if (id) {
        snap.subjects[id] = snap.subjects[id] ?? { id, state: "RUNNING", attempts: 0 };
        snap.subjects[id].state = "RUNNING";
      }
      break;
    }
    case "TASK_COMPLETED": {
      const id = str(e.subjectId);
      if (id) {
        snap.subjects[id] = snap.subjects[id] ?? { id, state: "COMPLETED", attempts: 0 };
        snap.subjects[id].state = "COMPLETED";
      }
      break;
    }
    case "AGENT_FAILED": {
      const id = str(e.subjectId);
      if (id) {
        snap.subjects[id] = snap.subjects[id] ?? { id, state: "FAILED", attempts: 0 };
        snap.subjects[id].state = "FAILED";
        snap.subjects[id].attempts = typeof d.attempts === "number" ? d.attempts : snap.subjects[id].attempts + 1;
      }
      break;
    }
    case "MISSION_CHECKPOINTED": {
      snap.checkpoints.push({ seq: e.seq, subjectId: e.subjectId });
      break;
    }
    case "REPAIR_STARTED": {
      snap.repairs.push({ seq: e.seq, subjectId: e.subjectId, reason: e.reason });
      break;
    }
    case "RESOURCE_LIMIT": {
      snap.resourceLimits.push({
        seq: e.seq,
        subjectId: e.subjectId,
        limit: typeof d.limit === "string" ? d.limit : void 0,
        value: typeof d.value === "number" ? d.value : void 0,
        ceiling: typeof d.ceiling === "number" ? d.ceiling : void 0
      });
      break;
    }
    case "ARTIFACT_CREATED":
    case "ARTIFACT_VERSIONED": {
      const id = str(e.subjectId);
      if (id) {
        snap.artifacts[id] = {
          id,
          taskId: typeof d.taskId === "string" ? d.taskId : void 0,
          versionOf: typeof d.versionOf === "string" ? d.versionOf : void 0,
          evaluation: snap.artifacts[id]?.evaluation
        };
      }
      break;
    }
    case "EVALUATION_PASSED":
    case "EVALUATION_FAILED": {
      const id = str(e.subjectId);
      if (id) {
        snap.artifacts[id] = snap.artifacts[id] ?? { id };
        snap.artifacts[id].evaluation = {
          passed: e.kind === "EVALUATION_PASSED",
          fullyMeasured: typeof d.fullyMeasured === "boolean" ? d.fullyMeasured : void 0,
          checks: Array.isArray(d.checks) ? d.checks : void 0
        };
      }
      break;
    }
  }
}
function replayTo(events, seq2) {
  const snap = emptySnapshot();
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  for (const e of sorted) {
    if (e.seq <= seq2) {
      reduceEvent(snap, e);
    }
  }
  return snap;
}
function replayAll(events) {
  return replayTo(events, Infinity);
}
function diffSnapshots(a, b) {
  const statusChanged = [];
  if (a.missionStatus !== b.missionStatus && b.missionStatus) {
    statusChanged.push(b.missionStatus);
  }
  const subjectsChangedState = [];
  for (const id of Object.keys(b.subjects)) {
    const aSub = a.subjects[id];
    const bSub = b.subjects[id];
    if (aSub && bSub && aSub.state !== bSub.state) {
      subjectsChangedState.push({ id, from: aSub.state, to: bSub.state });
    }
  }
  const artifactsAdded = Object.keys(b.artifacts).filter((id) => !a.artifacts[id]);
  const subjectsVanished = Object.keys(a.subjects).filter((id) => !b.subjects[id]);
  return {
    statusChanged,
    subjectsChangedState,
    newRepairs: Math.max(0, b.repairs.length - a.repairs.length),
    artifactsAdded,
    subjectsVanished
  };
}
function replayIndex(events) {
  if (!events.length) return { marks: [], firstSeq: 0, lastSeq: 0 };
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const marks = [];
  for (const e of sorted) {
    if (e.kind === "MISSION_STATUS") marks.push({ seq: e.seq, label: `Status: ${String(e.data?.to ?? e.kind)}` });
    else if (e.kind === "REPAIR_STARTED") marks.push({ seq: e.seq, label: `repair: ${e.reason}` });
    else if (e.kind === "APPROVAL_REQUIRED" || e.kind === "APPROVAL_GRANTED") marks.push({ seq: e.seq, label: "human approval" });
    else if (e.kind === "AGENT_FAILED") marks.push({ seq: e.seq, label: "Agent failure" });
    else if (e.kind === "RESOURCE_LIMIT") marks.push({ seq: e.seq, label: "Resource limit" });
    else if (e.kind === "MISSION_CHECKPOINTED") marks.push({ seq: e.seq, label: "Checkpoint" });
  }
  return {
    marks,
    firstSeq: sorted[0].seq,
    lastSeq: sorted[sorted.length - 1].seq
  };
}
function timeline(events) {
  const notableKinds = /* @__PURE__ */ new Set([
    "MISSION_STATUS",
    "AGENT_SPAWNED",
    "AGENT_FAILED",
    "REPAIR_STARTED",
    "RESOURCE_LIMIT",
    "APPROVAL_REQUIRED",
    "APPROVAL_GRANTED",
    "APPROVAL_REJECTED",
    "MISSION_CHECKPOINTED",
    "MISSION_ROLLED_BACK"
  ]);
  return events.map((e) => ({
    ...e,
    notable: notableKinds.has(e.kind)
  }));
}
function validateTrace(events) {
  const problems = [];
  if (!events.length) {
    return { ok: false, problems: ["Empty trace cannot be replayed."] };
  }
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const seenSeqs = /* @__PURE__ */ new Set();
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (seenSeqs.has(e.seq)) {
      problems.push(`Duplicate sequence number: ${e.seq}`);
    }
    seenSeqs.add(e.seq);
    if (i > 0 && e.seq !== sorted[i - 1].seq + 1) {
      problems.push(`Missing sequence number: expected ${sorted[i - 1].seq + 1}, got ${e.seq}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// src/mission/caps.ts
var DEFAULT_CAPS = { timeoutMs: 10 * 60 * 1e3, maxTurns: 40, maxCostUsd: 5 };
var CapLedger = class {
  caps;
  state;
  constructor(caps, now = Date.now()) {
    this.caps = caps;
    this.state = { spentUsd: 0, spentTokens: 0, turnsUsed: 0, invocationsUsed: 0, startedAt: now, cappedInvocations: [] };
  }
  beginInvocation() {
    this.state.invocationsUsed += 1;
  }
  /** Can another invocation start at all? Checked BEFORE dispatch — refusing is control, charging after is bookkeeping. */
  admissionError(now = Date.now()) {
    const maxCost = this.caps.maxCostUsd ?? 0;
    if (maxCost > 0 && this.state.spentUsd >= maxCost) {
      return `the mission has already spent $${this.state.spentUsd.toFixed(4)} of its $${maxCost.toFixed(4)} ceiling`;
    }
    const maxTurns = this.caps.maxTurns ?? 0;
    if (maxTurns > 0 && this.state.turnsUsed >= maxTurns) {
      return `the mission has already used ${this.state.turnsUsed} of its ${maxTurns} turns`;
    }
    const maxInvocations = this.caps.maxInvocations ?? 0;
    if (maxInvocations > 0 && this.state.invocationsUsed >= maxInvocations) {
      return `the mission has used all ${maxInvocations} permitted invocations`;
    }
    const maxWall = this.caps.maxWallClockMs ?? this.caps.timeoutMs ?? 0;
    if (maxWall > 0 && now - this.state.startedAt >= maxWall) {
      return `the mission's ${Math.round(maxWall / 1e3)}s wall clock has elapsed`;
    }
    return null;
  }
  /** Record what a CLI actually consumed. Returns why, so the caller can show it. */
  charge(r) {
    if (r.tokens !== null && Number.isFinite(r.tokens)) {
      this.state.spentTokens += r.tokens;
    }
    if (r.costUsd !== null && Number.isFinite(r.costUsd)) {
      this.state.spentUsd += r.costUsd;
      const maxCost = this.caps.maxCostUsd ?? 0;
      const breach = maxCost > 0 && this.state.spentUsd > maxCost ? "mission_cap" : null;
      return {
        chargedUsd: r.costUsd,
        basis: "reported_usd",
        breach,
        reason: breach ? `Charged $${r.costUsd.toFixed(4)} from ${r.source}, taking the mission to $${this.state.spentUsd.toFixed(4)} over a $${maxCost.toFixed(4)} ceiling.` : `Charged $${r.costUsd.toFixed(4)} reported by ${r.source}. Mission total $${this.state.spentUsd.toFixed(4)}.`
      };
    }
    if (r.tokens !== null) {
      return {
        chargedUsd: 0,
        basis: "tokens_only",
        breach: null,
        reason: `${r.source} reported ${r.tokens} tokens and no price. Recorded as tokens; NOT converted to dollars, because a guessed price would be a fabricated cost.`
      };
    }
    return { chargedUsd: 0, basis: "unknown", breach: null, reason: `${r.source} reported neither cost nor tokens, so nothing was charged and the true spend is unknown.` };
  }
  /** Note that something was stopped by a cap. Kept separately from charges: a refusal is not a spend. */
  recordCapped(id, outcome, detail, at = (/* @__PURE__ */ new Date()).toISOString()) {
    this.state.cappedInvocations.push({ id, outcome, at, detail });
  }
  addTurns(n) {
    this.state.turnsUsed += n;
  }
  snapshot() {
    return { ...this.state, cappedInvocations: [...this.state.cappedInvocations] };
  }
};
async function withDeadline(work, timeoutMs, now = Date.now) {
  const t0 = now();
  const signal = { cancelled: false };
  if (timeoutMs <= 0) {
    const value = await work(signal);
    return { outcome: "ok", value, timedOut: false, elapsedMs: now() - t0, detail: "No deadline set." };
  }
  let timer = null;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      signal.cancelled = true;
      resolve("__timeout__");
    }, timeoutMs);
  });
  const winner = await Promise.race([work(signal).then((v) => ({ v })), deadline]);
  if (timer) clearTimeout(timer);
  if (winner === "__timeout__") {
    return {
      outcome: "timeout",
      value: null,
      timedOut: true,
      elapsedMs: now() - t0,
      detail: `Deadline of ${timeoutMs}ms reached. The caller must terminate the child process; MJ cannot assume it stopped.`
    };
  }
  return { outcome: "ok", value: winner.v, timedOut: false, elapsedMs: now() - t0, detail: `Finished in ${now() - t0}ms, inside the ${timeoutMs}ms deadline.` };
}
function mayRunTurn(account) {
  const cap = account.cap ?? account.limit ?? 0;
  if (cap <= 0) return { allowed: true, reason: "No turn limit is set (cap 0 means no cap)." };
  const effective = account.reported !== null && account.reported !== void 0 ? Math.max(account.used, account.reported) : account.used;
  if (effective >= cap) {
    return { allowed: false, reason: `Turn cap reached: ${effective} of ${cap} turns used.` };
  }
  return { allowed: true, reason: `${effective} of ${cap} turns used.` };
}
function nextTurn(account) {
  return { ...account, used: account.used + 1 };
}
function parseReportedUsage(harness, raw) {
  const empty = { costUsd: null, tokens: null, turns: null, source: harness };
  if (!raw.trim()) return empty;
  const candidates = jsonChunks(raw);
  let costUsd = null;
  let tokens = null;
  let turns = null;
  for (const obj of candidates) {
    const c = findNumber(obj, ["total_cost_usd", "cost_usd", "costUsd", "cost"], 0);
    if (c !== null) costUsd = c;
    const t = findNumber(obj, ["total_tokens"], 0) ?? sumTokens(obj);
    if (t === null) {
      const flat = findNumber(obj, ["tokens"], 0);
      if (flat !== null) tokens = flat;
    } else {
      tokens = t;
    }
    const n = findNumber(obj, ["num_turns", "turns", "total_turns"], 0);
    if (n !== null) turns = n;
  }
  if (harness === "codex") costUsd = null;
  return { costUsd, tokens, turns, source: harness };
}
function jsonChunks(raw) {
  const out = [];
  const tryOne = (s) => {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === "object") out.push(v);
    } catch {
    }
  };
  tryOne(raw.trim());
  for (const line of raw.split(/\r?\n/)) if (line.trim()) tryOne(line.trim());
  return out;
}
function pickNumber(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
function findNumber(obj, keys, depth) {
  if (depth > 3 || !obj || typeof obj !== "object") return null;
  const o = obj;
  const direct = pickNumber(o, keys);
  if (direct !== null) return direct;
  for (const v of Object.values(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = findNumber(v, keys, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}
function sumTokens(obj) {
  const blocks = [];
  const collect = (o, depth) => {
    if (depth > 3 || !o || typeof o !== "object" || Array.isArray(o)) return;
    const rec = o;
    for (const k of ["usage", "tokens"]) {
      const v = rec[k];
      if (v && typeof v === "object" && !Array.isArray(v)) blocks.push(v);
    }
    for (const v of Object.values(rec)) collect(v, depth + 1);
  };
  collect(obj, 0);
  let best = null;
  for (const u of blocks) {
    const total = typeof u.total === "number" && Number.isFinite(u.total) ? u.total : null;
    const i = typeof u.input_tokens === "number" ? u.input_tokens : typeof u.input === "number" ? u.input : 0;
    const o = typeof u.output_tokens === "number" ? u.output_tokens : typeof u.output === "number" ? u.output : 0;
    const candidate = total !== null && total > 0 ? total : i + o > 0 ? i + o : null;
    if (candidate !== null) best = candidate;
  }
  return best;
}
function capsForSeat(seat, costUsd) {
  const warnings = [];
  const timeoutMs = seat.timeoutSecs > 0 ? seat.timeoutSecs * 1e3 : DEFAULT_CAPS.timeoutMs;
  if (seat.timeoutSecs > 0 && seat.timeoutSecs < 30) {
    warnings.push(`${seat.timeoutSecs}s is below the 30s floor for a coding agent; using it anyway, but expect a timeout on any real edit.`);
  }
  if (seat.maxTurns === null || seat.maxTurns === void 0) {
    warnings.push("No turn cap was specified for this seat; using default.");
  }
  const maxTurns = seat.maxTurns !== null && seat.maxTurns !== void 0 && seat.maxTurns > 0 ? seat.maxTurns : DEFAULT_CAPS.maxTurns;
  if (seat.maxTurns !== null && seat.maxTurns !== void 0 && seat.maxTurns > 0 && seat.maxTurns < 3) {
    warnings.push(`${seat.maxTurns} turns is almost certainly too few to read a file and edit it.`);
  }
  const maxCostUsd = costUsd !== null && costUsd > 0 ? costUsd : DEFAULT_CAPS.maxCostUsd;
  return { caps: { timeoutMs, maxTurns, maxCostUsd }, warnings };
}

// src/mission/evaluation.ts
function compositeOfChecks(checks) {
  if (!checks.length) return 0;
  const weights = {
    AGENT_SELF_REPORT: 0.1,
    TEST_RUN: 1,
    STATIC_CHECK: 0.8,
    SECURITY_CHECK: 1,
    INDEPENDENT_REVIEW: 1,
    REGRESSION_SUITE: 1,
    HUMAN: 1.2
  };
  let sum = 0;
  let weight = 0;
  for (const c of checks) {
    const w = weights[c.source] ?? 0.5;
    weight += w;
    if (!c.measured) continue;
    sum += w * (c.score ?? (c.passed ? 1 : 0));
  }
  return weight ? sum / weight : 0;
}
function scoreMission(input2) {
  const unmeasured = [];
  const goalCompletion = input2.successCriteria.length ? input2.criteriaMet.length / input2.successCriteria.length : (unmeasured.push("goal completion (no success criteria were declared)"), 0);
  const measuredChecks = input2.checks.filter((c) => c.measured);
  if (!measuredChecks.length) unmeasured.push("quality (no measured checks)");
  const quality = measuredChecks.length ? compositeOfChecks(measuredChecks) : 0;
  const measuredTests = input2.testChecks.filter((c) => c.measured);
  if (!measuredTests.length) unmeasured.push("tests (none were run)");
  const tests = measuredTests.length ? measuredTests.filter((c) => c.passed).length / measuredTests.length : 0;
  const measuredSec = input2.securityChecks.filter((c) => c.measured);
  if (!measuredSec.length) unmeasured.push("security (no security checks were run)");
  const security = measuredSec.length ? measuredSec.filter((c) => c.passed).length / measuredSec.length : 0;
  const costEfficiency = input2.budgetUsd > 0 ? clamp01(1 - input2.spentUsd / input2.budgetUsd) : (unmeasured.push("cost (no budget was set)"), 0);
  let latencyEfficiency = 0;
  if (input2.deadlineMs && input2.deadlineMs > 0) {
    latencyEfficiency = clamp01(1 - input2.elapsedMs / input2.deadlineMs);
  } else {
    unmeasured.push("latency (no deadline was set)");
  }
  return {
    goalCompletion: round(goalCompletion),
    quality: round(quality),
    tests: round(tests),
    security: round(security),
    costEfficiency: round(costEfficiency),
    latencyEfficiency: round(latencyEfficiency),
    humanInterventions: input2.humanInterventions,
    regressionCount: input2.regressionCount,
    unmeasured
  };
}
function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}
function round(n) {
  return Math.round(n * 1e3) / 1e3;
}

// src/mission/evals.ts
var SCORE_DIMENSIONS = [
  "goalCompletion",
  "quality",
  "tests",
  "security",
  "costEfficiency",
  "latencyEfficiency"
];
function judge(c, score, maxThreshold = 1) {
  const unmeasured = [];
  const failures = [];
  for (const [dim, minVal] of Object.entries(c.expect)) {
    const d = dim;
    const expected = minVal;
    if (expected > maxThreshold) {
      failures.push({ dimension: d, expected, actual: score[d] ?? 0 });
      continue;
    }
    const isUnmeasured = score.unmeasured.some((u) => u.toLowerCase().includes(d.toLowerCase()));
    if (isUnmeasured) {
      unmeasured.push(d);
    } else {
      const actual = score[d] ?? 0;
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
      failures
    };
  }
  return {
    caseId: c.id,
    verdict: failures.length === 0 ? "pass" : "fail",
    score,
    unmeasuredExpectations: [],
    failures
  };
}
async function runDatasetSuite(dataset2, runner, options = {}) {
  const repeats = Math.max(1, options.repeats ?? 1);
  const caseVerdicts = /* @__PURE__ */ new Map();
  const outcomes = [];
  let totalRuns = 0;
  let passCount = 0;
  let failCount = 0;
  let notMeasuredCount = 0;
  let erroredCount = 0;
  for (let r = 0; r < repeats; r++) {
    for (const c of dataset2.cases) {
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
        const j = {
          caseId: c.id,
          verdict: "error",
          unmeasuredExpectations: [],
          failures: [],
          error: msg
        };
        if (r === 0) outcomes.push(j);
        const list = caseVerdicts.get(c.id) ?? [];
        list.push("error");
        caseVerdicts.set(c.id, list);
        erroredCount++;
      }
    }
  }
  const flaky = [];
  for (const [caseId, verdicts] of caseVerdicts.entries()) {
    if (new Set(verdicts).size > 1) {
      flaky.push({ caseId, verdicts });
    }
  }
  const denominator = passCount + failCount;
  const passRate = denominator > 0 ? passCount / denominator : 0;
  return {
    datasetId: dataset2.id,
    datasetName: dataset2.name,
    version: dataset2.version,
    totals: {
      runs: totalRuns,
      pass: passCount,
      fail: failCount,
      notMeasured: notMeasuredCount,
      errored: erroredCount,
      passRate,
      hasErrors: erroredCount > 0
    },
    outcomes,
    flaky
  };
}
function compareRuns(before, after) {
  const beforePass = new Set(before.outcomes.filter((o) => o.verdict === "pass").map((o) => o.caseId));
  const afterPass = new Set(after.outcomes.filter((o) => o.verdict === "pass").map((o) => o.caseId));
  const afterFail = new Set(after.outcomes.filter((o) => o.verdict === "fail").map((o) => o.caseId));
  const newlyPassing = [...afterPass].filter((id) => !beforePass.has(id));
  const newlyFailing = [...afterFail].filter((id) => beforePass.has(id));
  const deltas = [];
  const regressions = [];
  for (const dim of SCORE_DIMENSIONS) {
    const beforeScores = before.outcomes.map((o) => o.score?.[dim]).filter((n) => typeof n === "number");
    const afterScores = after.outcomes.map((o) => o.score?.[dim]).filter((n) => typeof n === "number");
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
    regressions: after.totals.passRate < before.totals.passRate || newlyFailing.length > 0 ? regressions : []
  };
}
function renderReport(r) {
  const pct2 = (n) => `${Math.round(n * 100)}%`;
  const lines = [
    `Evaluation Suite Report: ${r.datasetName} (v${r.version})`,
    `  Total runs: ${r.totals.runs} (pass=${r.totals.pass}, fail=${r.totals.fail}, not-measured=${r.totals.notMeasured}, errored=${r.totals.errored})`,
    `  pass rate: ${pct2(r.totals.passRate)} (excludes not-measured from denominator)`
  ];
  if (r.totals.hasErrors) {
    lines.push("  WARNING: the suite is NOT clean \u2014 at least one case encountered an error.");
  }
  if (r.totals.notMeasured > 0) {
    lines.push(`  not measured: ${r.totals.notMeasured} case(s) had unrun checks.`);
  }
  for (const o of r.outcomes) {
    lines.push(`  - [${o.verdict}] ${o.caseId}${o.error ? `: error - ${o.error}` : ""}`);
  }
  return lines.join("\n");
}
function serializeReport(report) {
  return JSON.stringify({ schemaVersion: 1, report }, null, 2);
}
function parseReport(raw) {
  try {
    const obj = JSON.parse(raw);
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
function serializeDataset(dataset2) {
  return JSON.stringify(
    {
      id: dataset2.id,
      name: dataset2.name,
      version: dataset2.version,
      createdAt: dataset2.createdAt,
      cases: dataset2.cases.map((c) => ({ id: c.id, title: c.title, expect: c.expect, note: "input thunks are not serializable" }))
    },
    null,
    2
  );
}
function readSessionId(raw) {
  const m = raw.match(/"(?:session_id|sessionID)"\s*:\s*"([^"]+)"/);
  return m && m[1] ? m[1] : null;
}
function summarise(s, limit = 400) {
  const t = s.trim();
  if (!t) return "";
  return t.length > limit ? `\u2026${t.slice(-limit)}` : t;
}
async function runSuite(suiteOrDataset, harnessOrRunner, depsOrOptions) {
  if (typeof harnessOrRunner === "function") {
    return runDatasetSuite(
      suiteOrDataset,
      harnessOrRunner,
      depsOrOptions ?? {}
    );
  }
  return runHarnessSuite(
    suiteOrDataset,
    harnessOrRunner,
    depsOrOptions
  );
}
async function runHarnessSuite(suite, harness, deps) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const startedMs = (deps.now ?? Date.now)();
  const results = [];
  for (const c of suite.cases) {
    const inv = deps.compose(harness, c, c.readOnly === true);
    if (!inv) {
      results.push({
        caseId: c.id,
        outcome: "errored",
        detail: `${harness} cannot be dispatched for this case \u2014 no argv could be composed${c.readOnly ? " (a read-only case, and this harness has no enforced read-only mode)" : ""}.`,
        exitCode: null,
        timedOut: false,
        durationMs: 0,
        costUsd: null,
        tokens: null,
        turns: null,
        sessionId: null,
        argv: [],
        said: ""
      });
      continue;
    }
    const timeoutMs = c.timeoutMs ?? suite.defaultTimeoutMs;
    const t0 = deps.now ? deps.now() : Date.now();
    let r;
    try {
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
          said: ""
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
        said: ""
      });
      continue;
    }
    let outcome;
    let detail;
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
        const needle = c.expectation.caseSensitive ? c.expectation.outputContains ?? "" : (c.expectation.outputContains ?? "").toLowerCase();
        const okText = !needle || hay.includes(needle);
        outcome = okExit && okText ? "passed" : "failed";
        detail = okExit && okText ? `Check passed: \`${c.expectation.command}\` exited ${chk.exitCode}.` : `Check failed: \`${c.expectation.command}\` exited ${chk.exitCode}${wantFail ? " (a non-zero exit was expected)" : ""}${needle && !okText ? ` and its output did not contain "${c.expectation.outputContains}"` : ""}.`;
      }
    } else if (c.expectation.outputContains) {
      const hay = c.expectation.caseSensitive ? r.stdout : r.stdout.toLowerCase();
      const needle = c.expectation.caseSensitive ? c.expectation.outputContains : c.expectation.outputContains.toLowerCase();
      outcome = hay.includes(needle) ? "passed" : "failed";
      detail = outcome === "passed" ? `Output contained "${c.expectation.outputContains}".` : `Output did not contain "${c.expectation.outputContains}".`;
    } else {
      outcome = "errored";
      detail = "This case declares no expectation, so there is nothing to judge it by. That is a bug in the suite, not a result.";
    }
    const usage = parseReportedUsage(harness, r.stdout);
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
      said: summarise(r.stdout || r.stderr)
    });
    deps.ledger?.charge(usage);
  }
  const passed = results.filter((r) => r.outcome === "passed").length;
  const failed = results.filter((r) => r.outcome === "failed").length;
  const errored = results.filter((r) => r.outcome === "errored").length;
  const denominator = results.length;
  const costs = results.map((r) => r.costUsd);
  const costKnown = costs.every((c) => c !== null) && costs.length > 0;
  const tokenFigures = results.map((r) => r.tokens).filter((t) => t !== null);
  const caveats = [];
  if (errored > 0) caveats.push(`${errored} case(s) could not be run and are counted against the pass rate, not excluded from it.`);
  if (!costKnown) caveats.push("Cost is unknown: at least one case reported no price. Comparing this run's cost to another harness's would compare a number to an absence.");
  if (denominator === 0) caveats.push("The suite has no cases, so nothing was measured.");
  return {
    suiteId: suite.id,
    suiteName: suite.name,
    harness,
    startedAt,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
    caveats
  };
}
var pct = (n) => `${Math.round(n * 100)}%`;
function renderComparison(cmp) {
  if ("rows" in cmp) {
    const lines2 = [`Comparison on suite "${cmp.suiteName}" (${cmp.caseCount} cases)`];
    if (!cmp.rows.length) {
      lines2.push("  nothing to compare.");
    } else {
      lines2.push("  harness            pass   fail  err   rate   cost        tokens   wall");
      for (const r of [...cmp.rows].sort((a, b) => b.passRate - a.passRate)) {
        lines2.push(
          `  ${r.harness.padEnd(18)} ${String(r.passed).padStart(4)} ${String(r.failed).padStart(6)} ${String(r.errored).padStart(4)}  ${pct(r.passRate).padStart(5)}  ${(r.costKnown ? `$${(r.costUsd ?? 0).toFixed(4)}` : "unknown").padStart(10)}  ${(r.tokens === null ? "n/a" : r.tokens.toLocaleString()).padStart(8)}  ${(r.durationMs / 1e3).toFixed(1)}s${r.hasErrors ? "  (errors)" : ""}`
        );
      }
    }
    lines2.push("", cmp.leader ? `  best on this suite: ${cmp.leader}` : "  no leader \u2014 nothing here is clean enough to rank.");
    for (const c of cmp.caveats) lines2.push(`  note: ${c}`);
    return lines2.join("\n");
  }
  const lines = [
    `Run Comparison: pass rate ${pct(cmp.passRateBefore)} -> ${pct(cmp.passRateAfter)}`,
    `  Newly passing: ${cmp.newlyPassing.join(", ") || "none"}`,
    `  Newly failing: ${cmp.newlyFailing.join(", ") || "none"}`,
    `  Regressions: ${cmp.regressions.map((r) => `${r.dimension} (${r.before.toFixed(2)} -> ${r.after.toFixed(2)})`).join(", ") || "none"}`
  ];
  return lines.join("\n");
}

// probe/gaps.test.ts
var pass = 0;
var fail = 0;
var ok = (c, m) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};
var seq = 0;
function ev(kind, over = {}) {
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
    ...over
  };
}
function realTrace() {
  seq = 0;
  return [
    ev("MISSION_STATUS", { data: { from: null, to: "PLANNING" } }),
    ev("MISSION_STATUS", { data: { from: "PLANNING", to: "RUNNING" }, subjectId: "m1" }),
    ev("AGENT_SPAWNED", { actor: "planner", subjectId: "agent.coder", data: { definitionId: "agent.coder", title: "Coder", harness: "claude", permissions: ["filesystem.write"], denied: ["credentials"], budgetUsd: 2, timeoutMs: 6e5 } }),
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
    ev("MISSION_STATUS", { data: { from: "RUNNING", to: "BLOCKED" } })
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
  const trace = realTrace();
  const atFailure = trace.find((e) => e.kind === "AGENT_FAILED");
  const mid = replayTo(trace, atFailure.seq);
  ok(mid.missionStatus === "RUNNING", `at the failure the mission was still RUNNING, got ${mid.missionStatus}`);
  ok(mid.subjects["task.1"]?.state === "FAILED", `and task.1 was FAILED, got ${mid.subjects["task.1"]?.state}`);
  ok(mid.repairs.length === 0, "the repair had not started yet");
  ok(mid.artifacts["art.2"] === void 0, "the fixed artifact did not exist yet");
  ok(mid.eventCount === atFailure.seq, `folded exactly ${atFailure.seq} events, got ${mid.eventCount}`);
  const d = diffSnapshots(mid, replayAll(trace));
  ok(d.statusChanged.includes("BLOCKED"), "the diff shows the mission later went BLOCKED");
  ok(d.subjectsChangedState.some((c) => c.id === "task.1" && c.from === "FAILED" && c.to === "COMPLETED"), "and that task.1 went FAILED -> COMPLETED");
  ok(d.newRepairs === 1, "one repair happened after the scrub point");
  ok(d.artifactsAdded.includes("art.2"), "art.2 appeared after the scrub point");
  ok(d.subjectsVanished.length === 0, "no subject vanished \u2014 replay is monotonic");
}
{
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
  const snap = emptySnapshot();
  reduceEvent(snap, ev("AGENT_SPAWNED", { subjectId: "a", data: { harness: "codex", budgetUsd: 1 } }));
  ok(snap.agents.a.harness === "codex", "reduceEvent mutates the snapshot it is given");
  ok(snap.eventCount === 1, "and counts it");
}
console.log("\n== GAP (c): cost / turn / wall-clock caps ==\n");
{
  const ledger = new CapLedger({ maxCostUsd: 1, maxWallClockMs: 1e3, maxInvocations: 2 }, 0);
  ok(ledger.admissionError(0) === null, "a fresh ledger admits work");
  ok(ledger.admissionError(5e3) !== null, "and refuses once the wall clock is spent");
  ok(/wall clock/i.test(ledger.admissionError(5e3) ?? ""), `with a reason a user can act on: ${ledger.admissionError(5e3)}`);
  ledger.beginInvocation();
  const r = ledger.charge({ costUsd: 0.4, tokens: 1e3, turns: 3, source: "claude" });
  ok(r.basis === "reported_usd", "a real price is charged as USD");
  ok(r.chargedUsd === 0.4 && r.breach === null, "$0.40 of a $1 ceiling is not a breach");
  const over = ledger.charge({ costUsd: 0.9, tokens: 100, turns: null, source: "claude" });
  ok(over.breach === "mission_cap", `crossing the ceiling is flagged, got ${over.breach}`);
  ok(/over a \$1\.0000 ceiling/.test(over.reason), `and the reason states both numbers: ${over.reason}`);
  ok(ledger.admissionError(0) !== null, "so the next invocation is refused");
}
{
  const ledger = new CapLedger({ maxCostUsd: 1, maxWallClockMs: 0, maxInvocations: 100 });
  const r = ledger.charge({ costUsd: null, tokens: 5e4, turns: null, source: "codex" });
  ok(r.basis === "tokens_only", `codex spend is recorded as tokens only, got ${r.basis}`);
  ok(r.chargedUsd === 0, "and ZERO dollars are charged, because a guessed price would be a fabricated cost");
  ok(/NOT converted to dollars/.test(r.reason), `the reason says so explicitly: ${r.reason}`);
  ok(ledger.snapshot().spentTokens === 5e4, "but the tokens ARE recorded, so the run is not invisible");
  ok(ledger.snapshot().spentUsd === 0, "and the dollar total stays honestly at zero");
  const none = ledger.charge({ costUsd: null, tokens: null, turns: null, source: "mystery" });
  ok(none.basis === "unknown", "a harness that reports nothing is recorded as unknown, not zero-cost");
  ok(/true spend is unknown/.test(none.reason), `and it says the spend is unknown: ${none.reason}`);
}
{
  const r = await withDeadline(async () => "done", 1e3);
  ok(r.outcome === "ok" && r.value === "done", "work inside the deadline returns normally");
  ok(!r.timedOut, "and is not marked timed out");
  const slow = await withDeadline(async () => new Promise((res) => setTimeout(() => res("late"), 500)), 50);
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
  const codex = parseReportedUsage("codex", JSON.stringify({ total_cost_usd: 9.99, total_tokens: 1e3 }));
  ok(codex.costUsd === null, "codex's cost is forced to null even if a field by that name appears");
  ok(codex.tokens === 1e3, "but its tokens are still recorded");
  const none = parseReportedUsage("hermes", "");
  ok(none.costUsd === null && none.tokens === null, "empty output yields nothing, not zero");
  ok(parseReportedUsage("x", "total_cost_usd: 5").costUsd === null, "prose that mentions a field name is not parsed as data");
}
{
  const c = capsForSeat({ timeoutSecs: 600, maxTurns: 30 }, 2);
  ok(c.caps.timeoutMs === 6e5 && c.caps.maxTurns === 30 && c.caps.maxCostUsd === 2, "a fully specified seat is used as-is");
  ok(c.warnings.length === 0, "and warns about nothing");
  const bad = capsForSeat({ timeoutSecs: 5, maxTurns: null }, null);
  ok(bad.warnings.some((w) => /below the 30s floor/.test(w)), "a 5s timeout is called out as unusable, not silently accepted");
  ok(bad.warnings.some((w) => /No turn cap/.test(w)), "and a missing turn cap gets the default, with a warning");
  ok(bad.caps.maxTurns === DEFAULT_CAPS.maxTurns, "so a loop still cannot run forever");
  const zero = capsForSeat({ timeoutSecs: 0, maxTurns: 0 }, null);
  ok(zero.caps.timeoutMs === DEFAULT_CAPS.timeoutMs, "a zero timeout falls back to the default rather than running unbounded");
}
console.log("\n== GAP (b): evals harness ==\n");
function input(over = {}) {
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
    elapsedMs: 1e3,
    deadlineMs: 1e4,
    humanInterventions: 0,
    regressionCount: 0,
    ...over
  };
}
var dataset = {
  id: "ds.1",
  name: "Regression set",
  version: "1.0.0",
  createdAt: (/* @__PURE__ */ new Date()).toISOString(),
  cases: [
    { id: "happy", title: "Everything passes", expect: { goalCompletion: 1, tests: 1 }, input: () => input() },
    { id: "goal", title: "Only half the criteria met", expect: { goalCompletion: 1 }, input: () => input({ criteriaMet: ["builds"] }) },
    { id: "sec", title: "Asserts on security, which was never run", expect: { security: 0.8 }, input: () => input() }
  ]
};
{
  const report = await runSuite(dataset, async (c) => c.input());
  ok(report.totals.runs === 3, `three cases ran, got ${report.totals.runs}`);
  ok(report.totals.pass === 1, `one passed, got ${report.totals.pass}`);
  ok(report.totals.fail === 1, `one failed, got ${report.totals.fail}`);
  ok(report.totals.notMeasured === 1, `one was NOT MEASURED, got ${report.totals.notMeasured}`);
  ok(report.totals.passRate === 0.5, `pass rate is 1/2 = 0.5, got ${report.totals.passRate}`);
  ok(report.totals.passRate !== 1 / 3, "and not-measured is excluded from the denominator, not counted as a pass");
  const sec = report.outcomes.find((o) => o.caseId === "sec");
  ok(sec.verdict === "not_measured", `the security case is not_measured, got ${sec.verdict}`);
  ok(sec.unmeasuredExpectations.includes("security"), "and it names the dimension that was never run");
  ok(sec.failures.length === 0, "an unrun check is NOT a failure");
  const goal = report.outcomes.find((o) => o.caseId === "goal");
  ok(goal.verdict === "fail", "a case below its floor fails");
  ok(goal.failures[0]?.dimension === "goalCompletion" && goal.failures[0]?.actual === 0.5, "and the report shows the actual value");
}
{
  const score = (await runSuite(dataset, async (c) => c.input())).outcomes[0].score;
  ok(judge({ ...dataset.cases[0], expect: { tests: 0.5 } }, score, 10).verdict === "pass", "a measured dimension above its floor passes");
  ok(judge({ ...dataset.cases[0], expect: { tests: 1.5 } }, score, 10).verdict === "fail", "above 1.0 is unreachable and fails");
  ok(SCORE_DIMENSIONS.length === 6, `six dimensions can be asserted on, got ${SCORE_DIMENSIONS.length}`);
}
{
  let n = 0;
  const flaky = {
    id: "ds.f",
    name: "Flaky",
    version: "1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    cases: [{ id: "coin", title: "Coin flip", expect: { goalCompletion: 1 }, input: () => input({ criteriaMet: (n += 1) % 2 ? ["builds", "tests pass"] : ["builds"] }) }]
  };
  const r = await runSuite(flaky, async (c) => c.input(), { repeats: 4 });
  ok(r.totals.runs === 4, "four repeats ran");
  ok(r.flaky.length === 1, `the case is reported as flaky, got ${r.flaky.length}`);
  ok(new Set(r.flaky[0].verdicts).size === 2, "because its verdict differed between repeats");
}
{
  const before = await runSuite(dataset, async (c) => c.input());
  const after = await runSuite({ ...dataset, version: "2.0.0" }, async (c) => c.id === "goal" ? input() : c.input());
  const cmp = compareRuns(before, after);
  ok(cmp.newlyPassing.includes("goal"), `fixing the goal case shows up as newly passing: ${cmp.newlyPassing.join(",")}`);
  ok(cmp.passRateAfter > cmp.passRateBefore, "and the pass rate rose");
  ok(cmp.deltas.length === SCORE_DIMENSIONS.length, "every dimension is compared");
  ok(cmp.regressions.length === 0, "no regressions in an improvement");
  ok(renderComparison(cmp).includes("pass rate"), "the comparison renders");
  const worse = await runSuite({ ...dataset, version: "0.9.0" }, async (c) => c.id === "happy" ? input({ criteriaMet: [] }) : c.input());
  const cmp2 = compareRuns(before, worse);
  ok(cmp2.newlyFailing.includes("happy"), `breaking the happy case shows up as newly failing: ${cmp2.newlyFailing.join(",")}`);
  ok(cmp2.regressions.some((d) => d.dimension === "goalCompletion"), "and goalCompletion is flagged as a regression");
}
{
  const report = await runSuite(dataset, async (c) => c.input());
  const text = renderReport(report);
  ok(/pass rate/.test(text) && /excludes not-measured/.test(text), "the rendered report explains its own denominator");
  ok(/not measured/.test(text), "and lists what could not be measured");
  ok(!/\bscore: 0\.\d+\b/.test(text), "there is no single headline score, per \xA719");
  const round2 = parseReport(serializeReport(report));
  ok(round2.errors.length === 0 && round2.report?.totals.pass === report.totals.pass, "a report round-trips");
  ok(parseReport("garbage").report === null, "a corrupt report is refused");
  ok(parseReport('{"schemaVersion":99}').errors[0].includes("Schema version"), "a future schema is refused with a message");
  ok(/not serializable/.test(serializeDataset(dataset)), "the dataset format STATES that input thunks are dropped, rather than losing them silently");
}
{
  const r = await runSuite(dataset, async (c) => {
    if (c.id === "goal") throw new Error("harness exploded");
    return c.input();
  });
  ok(r.totals.errored === 1, "one case errored");
  ok(r.outcomes.find((o) => o.caseId === "goal")?.error === "harness exploded", "and the error message is preserved");
  ok(r.totals.pass === 1, "the rest of the suite still ran");
  ok(r.totals.passRate === 1, `the rate covers only what ran: 1/1 = 1, got ${r.totals.passRate}`);
  ok(r.totals.hasErrors === true, "and hasErrors is set, so a broken suite cannot pass as clean");
  ok(/NOT clean/.test(renderReport(r)), "and the rendered report says so out loud");
}
console.log(`
${pass} passed, ${fail} failed
`);
process.exit(fail ? 1 : 0);
