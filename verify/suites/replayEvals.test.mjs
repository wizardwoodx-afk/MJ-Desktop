import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/mission/replay.ts
var DECISION_LABELS = {
  HARNESS_SELECTED: "harness selected",
  HARNESS_SWITCHED: "harness switched",
  AGENT_ASSIGNED: "task assigned",
  AGENT_REPLACED: "agent replaced",
  TASK_DELEGATED: "task delegated",
  TASK_REASSIGNED: "task reassigned",
  TASK_SPLIT: "task split",
  TASK_MERGED: "tasks merged",
  GRAPH_MUTATED: "plan restructured",
  REPAIR_STARTED: "repair strategy chosen",
  RECOMMENDATION_EXECUTED: "recommendation executed",
  NEGOTIATION_RESOLVED: "negotiation resolved",
  MISSION_ROLLED_BACK: "mission rolled back",
  APPROVAL_GRANTED: "approval granted",
  APPROVAL_REJECTED: "approval rejected"
};
function str(v, fallback = "") {
  return typeof v === "string" && v.length ? v : fallback;
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function readUsage(data) {
  const usage = data.usage && typeof data.usage === "object" ? data.usage : {};
  const usdCandidates = [data.costUsd, data.totalCostUsd, data.cost, usage.cost, usage.totalCostUsd];
  let usd = null;
  for (const c of usdCandidates) {
    if (typeof c === "number" && Number.isFinite(c)) {
      usd = c;
      break;
    }
  }
  return {
    usd,
    input: num(data.inputTokens ?? usage.inputTokens ?? usage.input_tokens),
    output: num(data.outputTokens ?? usage.outputTokens ?? usage.output_tokens),
    turns: num(data.turns ?? data.numTurns ?? data.num_turns)
  };
}
function project(events2, missionId = "") {
  const p2 = {
    missionId,
    uptoSeq: 0,
    eventCount: events2.length,
    status: null,
    statusHistory: [],
    agents: {},
    artifacts: {},
    spendUsd: 0,
    spendKnown: false,
    inputTokens: 0,
    outputTokens: 0,
    turns: 0,
    humanInterventions: 0,
    approvalsOutstanding: 0,
    approvalsDecided: 0,
    approvalsRejected: 0,
    repairsAttempted: 0,
    repairsCompleted: 0,
    failuresDetected: 0,
    resourceLimitsHit: 0,
    policyDenials: 0,
    rollbacks: 0,
    checkpoints: 0,
    decisions: [],
    kindCounts: {}
  };
  const ordered = [...events2].sort((a, b) => a.seq - b.seq);
  for (const e of ordered) {
    const d = e.data ?? {};
    p2.uptoSeq = Math.max(p2.uptoSeq, e.seq);
    p2.kindCounts[e.kind] = (p2.kindCounts[e.kind] ?? 0) + 1;
    if (!p2.missionId) p2.missionId = e.missionId;
    const usage = readUsage(d);
    if (usage.usd !== null) {
      p2.spendUsd += usage.usd;
      p2.spendKnown = true;
    }
    p2.inputTokens += usage.input;
    p2.outputTokens += usage.output;
    p2.turns += usage.turns;
    const label = DECISION_LABELS[e.kind];
    if (label) {
      p2.decisions.push({
        seq: e.seq,
        label,
        kind: e.kind,
        actor: e.actor,
        authority: e.authority,
        reason: e.reason,
        evidence: e.evidence ?? [],
        byHuman: e.authority === "human" || e.authority.startsWith("human:"),
        ts: e.ts
      });
    }
    switch (e.kind) {
      case "MISSION_CREATED":
      case "MISSION_PLANNED":
      case "MISSION_STATUS": {
        const to = str(d.to ?? d.status);
        if (to) {
          p2.statusHistory.push({ seq: e.seq, from: typeof d.from === "string" ? d.from : null, to, ts: e.ts });
          p2.status = to;
        }
        break;
      }
      case "MISSION_COMPLETED":
        p2.status = "COMPLETED";
        break;
      case "MISSION_FAILED":
        p2.status = "FAILED";
        break;
      case "MISSION_CHECKPOINTED":
        p2.checkpoints += 1;
        break;
      case "MISSION_ROLLED_BACK":
        p2.rollbacks += 1;
        break;
      case "AGENT_SPAWNED":
      case "AGENT_ASSIGNED": {
        const id = str(d.agentId ?? e.subjectId, e.subjectId ?? "");
        if (!id) break;
        const a = p2.agents[id] ??= {
          id,
          name: str(d.name ?? d.role, id),
          role: str(d.role, "unspecified"),
          harness: typeof d.harness === "string" ? d.harness : null,
          retired: false,
          tasksAssigned: 0,
          tasksCompleted: 0,
          firstSeq: e.seq,
          lastSeq: e.seq
        };
        a.lastSeq = e.seq;
        if (typeof d.harness === "string") a.harness = d.harness;
        if (typeof d.role === "string") a.role = d.role;
        if (e.kind === "AGENT_ASSIGNED") a.tasksAssigned += 1;
        break;
      }
      case "AGENT_REPLACED": {
        const id = str(d.agentId ?? e.subjectId);
        if (id && p2.agents[id]) {
          p2.agents[id].retired = true;
          p2.agents[id].lastSeq = e.seq;
        }
        const next = str(d.replacementId ?? d.newAgentId);
        if (next) {
          p2.agents[next] ??= {
            id: next,
            name: str(d.replacementName, next),
            role: str(d.role, "unspecified"),
            harness: typeof d.harness === "string" ? d.harness : null,
            retired: false,
            tasksAssigned: 0,
            tasksCompleted: 0,
            firstSeq: e.seq,
            lastSeq: e.seq
          };
        }
        break;
      }
      case "AGENT_FAILED": {
        const id = str(d.agentId ?? e.subjectId);
        if (id && p2.agents[id]) p2.agents[id].lastSeq = e.seq;
        break;
      }
      case "AGENT_RECOVERED": {
        const id = str(d.agentId ?? e.subjectId);
        if (id && p2.agents[id]) {
          p2.agents[id].retired = false;
          p2.agents[id].lastSeq = e.seq;
        }
        break;
      }
      case "HARNESS_SELECTED":
      case "HARNESS_SWITCHED": {
        const id = str(d.agentId ?? e.subjectId);
        const harness = str(d.harness ?? d.to);
        if (id && harness && p2.agents[id]) {
          p2.agents[id].harness = harness;
          p2.agents[id].lastSeq = e.seq;
        }
        break;
      }
      case "TASK_COMPLETED": {
        const id = str(d.agentId ?? e.subjectId);
        if (id && p2.agents[id]) {
          p2.agents[id].tasksCompleted += 1;
          p2.agents[id].lastSeq = e.seq;
        }
        break;
      }
      case "ARTIFACT_CREATED": {
        const id = str(d.artifactId ?? e.subjectId, e.subjectId ?? "");
        if (!id) break;
        p2.artifacts[id] = {
          id,
          title: str(d.title ?? d.name, id),
          versions: 1,
          evaluated: false,
          passed: null,
          lastSeq: e.seq
        };
        break;
      }
      case "ARTIFACT_VERSIONED": {
        const id = str(d.artifactId ?? e.subjectId);
        if (id && p2.artifacts[id]) {
          p2.artifacts[id].versions += 1;
          p2.artifacts[id].lastSeq = e.seq;
        }
        break;
      }
      case "EVALUATION_PASSED":
      case "EVALUATION_FAILED": {
        const id = str(d.artifactId ?? e.subjectId);
        if (id && p2.artifacts[id]) {
          p2.artifacts[id].evaluated = true;
          p2.artifacts[id].passed = e.kind === "EVALUATION_PASSED";
          p2.artifacts[id].lastSeq = e.seq;
        }
        break;
      }
      case "APPROVAL_REQUIRED":
        p2.approvalsOutstanding += 1;
        p2.humanInterventions += 1;
        break;
      case "APPROVAL_GRANTED":
        p2.approvalsOutstanding = Math.max(0, p2.approvalsOutstanding - 1);
        p2.approvalsDecided += 1;
        break;
      case "APPROVAL_REJECTED":
        p2.approvalsOutstanding = Math.max(0, p2.approvalsOutstanding - 1);
        p2.approvalsDecided += 1;
        p2.approvalsRejected += 1;
        break;
      case "REPAIR_STARTED":
        p2.repairsAttempted += 1;
        break;
      case "REPAIR_COMPLETED":
        p2.repairsCompleted += 1;
        break;
      case "FAILURE_DETECTED":
        p2.failuresDetected += 1;
        break;
      case "RESOURCE_LIMIT":
        p2.resourceLimitsHit += 1;
        break;
      case "POLICY_DENIED":
        p2.policyDenials += 1;
        break;
      default:
        break;
    }
  }
  return p2;
}
var fmt = (v) => {
  if (v === null || v === void 0) return "\u2014";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return String(v);
};
function diffProjections(a, b) {
  const changes = [];
  const scalars = [
    "status",
    "spendUsd",
    "spendKnown",
    "inputTokens",
    "outputTokens",
    "turns",
    "humanInterventions",
    "approvalsOutstanding",
    "approvalsDecided",
    "approvalsRejected",
    "repairsAttempted",
    "repairsCompleted",
    "failuresDetected",
    "resourceLimitsHit",
    "policyDenials",
    "rollbacks",
    "checkpoints",
    "eventCount"
  ];
  for (const k of scalars) {
    const av = a[k];
    const bv = b[k];
    if (av !== bv) changes.push({ seq: b.uptoSeq, field: k, from: fmt(av), to: fmt(bv) });
  }
  const aAgents = new Set(Object.keys(a.agents));
  const bAgents = new Set(Object.keys(b.agents));
  const agentsAdded = [...bAgents].filter((id) => !aAgents.has(id));
  const agentsRetired = [...bAgents].filter((id) => a.agents[id] && !a.agents[id].retired && b.agents[id]?.retired);
  for (const id of [...aAgents].filter((x) => bAgents.has(x))) {
    const aa = a.agents[id];
    const bb = b.agents[id];
    if (!aa || !bb) continue;
    if (aa.harness !== bb.harness) changes.push({ seq: bb.lastSeq, field: `agent ${id} harness`, from: fmt(aa.harness), to: fmt(bb.harness) });
    if (aa.tasksCompleted !== bb.tasksCompleted) changes.push({ seq: bb.lastSeq, field: `agent ${id} tasks completed`, from: fmt(aa.tasksCompleted), to: fmt(bb.tasksCompleted) });
    if (aa.retired !== bb.retired) changes.push({ seq: bb.lastSeq, field: `agent ${id} active`, from: fmt(!aa.retired), to: fmt(!bb.retired) });
  }
  const artifactsAdded = Object.keys(b.artifacts).filter((id) => !a.artifacts[id]);
  for (const id of Object.keys(a.artifacts).filter((x) => b.artifacts[x])) {
    const av = a.artifacts[id];
    const bv = b.artifacts[id];
    if (!av || !bv) continue;
    if (av.versions !== bv.versions) changes.push({ seq: bv.lastSeq, field: `artifact ${id} versions`, from: fmt(av.versions), to: fmt(bv.versions) });
    if (av.passed !== bv.passed) changes.push({ seq: bv.lastSeq, field: `artifact ${id} evaluation`, from: fmt(av.passed), to: fmt(bv.passed) });
  }
  const decisionsBetween = b.decisions.filter((d) => d.seq > a.uptoSeq && d.seq <= b.uptoSeq);
  return {
    fromSeq: a.uptoSeq,
    toSeq: b.uptoSeq,
    changes,
    agentsAdded,
    agentsRetired,
    artifactsAdded,
    decisionsBetween,
    identical: changes.length === 0 && !agentsAdded.length && !artifactsAdded.length
  };
}
function decisionAt(events2, seq) {
  const p2 = project(events2.filter((e) => e.seq <= seq));
  const decision = [...p2.decisions].reverse().find((d) => d.seq <= seq) ?? null;
  if (!decision) return null;
  const before = project(events2.filter((e) => e.seq < decision.seq));
  const after = project(events2.filter((e) => e.seq <= decision.seq));
  return { decision, before, after, diff: diffProjections(before, after) };
}
function counterfactualHarness(events2, seq, alternative) {
  const p2 = project(events2.filter((e) => e.seq <= seq));
  const actual = p2.decisions.filter((d) => d.kind === "HARNESS_SELECTED" || d.kind === "HARNESS_SWITCHED").pop();
  const harnessEvent = [...events2].reverse().find((e) => (e.kind === "HARNESS_SELECTED" || e.kind === "HARNESS_SWITCHED") && e.seq <= seq);
  const usedHarness = harnessEvent ? str(harnessEvent.data?.harness ?? harnessEvent.data?.to, "unknown") : "unknown";
  return {
    atSeq: seq,
    question: `What if ${alternative} had run this instead of ${usedHarness}?`,
    hypothesis: `Replace harness ${usedHarness} with ${alternative} at seq ${seq}${actual ? ` (the ${actual.label} decision)` : ""}.`,
    outcome: "unknown \u2014 this was not re-run",
    wouldRequire: [
      `re-running the task with ${alternative} against the same inputs`,
      "the same verification commands, so the two runs are comparable",
      "a recorded result from that run \u2014 a projection cannot produce one"
    ]
  };
}
function renderProjection(p2) {
  const lines = [
    `Mission ${p2.missionId || "(unknown)"} at seq ${p2.uptoSeq} \u2014 ${p2.eventCount} events`,
    `  status            ${p2.status ?? "\u2014"}`,
    `  agents            ${Object.keys(p2.agents).length} (${Object.values(p2.agents).filter((a) => a.retired).length} retired)`,
    `  artifacts         ${Object.keys(p2.artifacts).length}`,
    `  spend             ${p2.spendKnown ? `$${p2.spendUsd.toFixed(4)}` : "unknown \u2014 no harness reported a cost"}`,
    `  tokens            ${p2.inputTokens.toLocaleString()} in / ${p2.outputTokens.toLocaleString()} out`,
    `  turns             ${p2.turns}`,
    `  approvals         ${p2.approvalsOutstanding} outstanding, ${p2.approvalsDecided} decided (${p2.approvalsRejected} rejected)`,
    `  repairs           ${p2.repairsCompleted}/${p2.repairsAttempted} completed`,
    `  failures          ${p2.failuresDetected} detected`,
    `  limits / denials  ${p2.resourceLimitsHit} resource limits, ${p2.policyDenials} policy denials`,
    `  checkpoints       ${p2.checkpoints} taken, ${p2.rollbacks} rollbacks`
  ];
  const agentRows = Object.values(p2.agents);
  if (agentRows.length) {
    lines.push("", "  agents:");
    for (const a of agentRows) {
      lines.push(`    ${a.id.padEnd(18)} ${a.role.padEnd(14)} harness=${a.harness ?? "\u2014"}  ${a.tasksCompleted}/${a.tasksAssigned} tasks${a.retired ? "  (retired)" : ""}`);
    }
  }
  if (p2.decisions.length) {
    lines.push("", "  decisions:");
    for (const d of p2.decisions.slice(-12)) {
      lines.push(`    [${d.seq}] ${d.label} by ${d.actor} (${d.authority})${d.evidence.length ? ` \u2014 ${d.evidence.length} evidence` : " \u2014 no evidence recorded"}`);
    }
    if (p2.decisions.length > 12) lines.push(`    \u2026 ${p2.decisions.length - 12} earlier`);
  }
  return lines.join("\n");
}
function timelineTicks(events2, maxTicks = 40) {
  const p2 = project(events2);
  const decisionSeqs = p2.decisions.map((d) => d.seq);
  const interesting = /* @__PURE__ */ new Set([...decisionSeqs]);
  for (const e of events2) {
    if (e.kind === "MISSION_STATUS" || e.kind === "RESOURCE_LIMIT" || e.kind === "FAILURE_DETECTED" || e.kind === "APPROVAL_REQUIRED") {
      interesting.add(e.seq);
    }
  }
  const sorted = [...interesting].sort((a, b) => a - b);
  if (sorted.length <= maxTicks) return sorted;
  const step = sorted.length / maxTicks;
  const out = [];
  for (let i = 0; i < maxTicks; i++) out.push(sorted[Math.floor(i * step)]);
  if (out[out.length - 1] !== sorted[sorted.length - 1]) out.push(sorted[sorted.length - 1]);
  return out;
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
function parseReportedUsage(harness, raw) {
  const empty2 = { costUsd: null, tokens: null, turns: null, source: harness };
  if (!raw.trim()) return empty2;
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
    const rec2 = o;
    for (const k of ["usage", "tokens"]) {
      const v = rec2[k];
      if (v && typeof v === "object" && !Array.isArray(v)) blocks.push(v);
    }
    for (const v of Object.values(rec2)) collect(v, depth + 1);
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
function scoreMission(input) {
  const unmeasured = [];
  const goalCompletion = input.successCriteria.length ? input.criteriaMet.length / input.successCriteria.length : (unmeasured.push("goal completion (no success criteria were declared)"), 0);
  const measuredChecks = input.checks.filter((c) => c.measured);
  if (!measuredChecks.length) unmeasured.push("quality (no measured checks)");
  const quality = measuredChecks.length ? compositeOfChecks(measuredChecks) : 0;
  const measuredTests = input.testChecks.filter((c) => c.measured);
  if (!measuredTests.length) unmeasured.push("tests (none were run)");
  const tests = measuredTests.length ? measuredTests.filter((c) => c.passed).length / measuredTests.length : 0;
  const measuredSec = input.securityChecks.filter((c) => c.measured);
  if (!measuredSec.length) unmeasured.push("security (no security checks were run)");
  const security = measuredSec.length ? measuredSec.filter((c) => c.passed).length / measuredSec.length : 0;
  const costEfficiency = input.budgetUsd > 0 ? clamp01(1 - input.spentUsd / input.budgetUsd) : (unmeasured.push("cost (no budget was set)"), 0);
  let latencyEfficiency = 0;
  if (input.deadlineMs && input.deadlineMs > 0) {
    latencyEfficiency = clamp01(1 - input.elapsedMs / input.deadlineMs);
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
    humanInterventions: input.humanInterventions,
    regressionCount: input.regressionCount,
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
function judge(c, score, maxThreshold = 1) {
  const unmeasured = [];
  const failures2 = [];
  for (const [dim, minVal] of Object.entries(c.expect)) {
    const d = dim;
    const expected = minVal;
    if (expected > maxThreshold) {
      failures2.push({ dimension: d, expected, actual: score[d] ?? 0 });
      continue;
    }
    const isUnmeasured = score.unmeasured.some((u) => u.toLowerCase().includes(d.toLowerCase()));
    if (isUnmeasured) {
      unmeasured.push(d);
    } else {
      const actual = score[d] ?? 0;
      if (actual < expected) {
        failures2.push({ dimension: d, expected, actual });
      }
    }
  }
  if (unmeasured.length > 0) {
    return {
      caseId: c.id,
      verdict: "not_measured",
      score,
      unmeasuredExpectations: unmeasured,
      failures: failures2
    };
  }
  return {
    caseId: c.id,
    verdict: failures2.length === 0 ? "pass" : "fail",
    score,
    unmeasuredExpectations: [],
    failures: failures2
  };
}
async function runDatasetSuite(dataset, runner, options = {}) {
  const repeats = Math.max(1, options.repeats ?? 1);
  const caseVerdicts = /* @__PURE__ */ new Map();
  const outcomes = [];
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
      hasErrors: erroredCount > 0
    },
    outcomes,
    flaky
  };
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
async function runHarnessSuite(suite2, harness, deps) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const startedMs = (deps.now ?? Date.now)();
  const results = [];
  for (const c of suite2.cases) {
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
    const timeoutMs = c.timeoutMs ?? suite2.defaultTimeoutMs;
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
  const passed2 = results.filter((r) => r.outcome === "passed").length;
  const failed2 = results.filter((r) => r.outcome === "failed").length;
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
    suiteId: suite2.id,
    suiteName: suite2.name,
    harness,
    startedAt,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    results,
    passed: passed2,
    failed: failed2,
    errored,
    passRate: denominator ? passed2 / denominator : 0,
    hasErrors: errored > 0,
    costUsd: costKnown ? costs.reduce((a, c) => a + (c ?? 0), 0) : null,
    costKnown,
    tokens: tokenFigures.length ? tokenFigures.reduce((a, t) => a + t, 0) : null,
    durationMs: (deps.now ? deps.now() : Date.now()) - startedMs,
    caveats
  };
}
function compareHarnesses(suite2, runs) {
  const caveats = [];
  const usable = runs.filter((r) => r.suiteId === suite2.id);
  const rejected = runs.length - usable.length;
  if (rejected > 0) {
    caveats.push(`${rejected} run(s) were of a different suite and were excluded \u2014 pass rates across different suites are not comparable.`);
  }
  if (!usable.length) caveats.push("No runs of this suite were supplied, so there is nothing to compare.");
  const rows = usable.map((r) => ({
    harness: r.harness,
    passed: r.passed,
    failed: r.failed,
    errored: r.errored,
    passRate: r.passRate,
    costUsd: r.costUsd,
    costKnown: r.costKnown,
    tokens: r.tokens,
    durationMs: r.durationMs,
    hasErrors: r.hasErrors
  }));
  const clean = rows.filter((r) => !r.hasErrors);
  if (!clean.length && rows.length) {
    caveats.push("Every run had at least one case that could not be executed, so no harness can be ranked ahead of the others.");
  }
  if (rows.some((r) => !r.costKnown)) {
    caveats.push("At least one harness reported no price. Cost columns are not comparable across these runs.");
  }
  const leader = clean.length ? [...clean].sort((a, b) => b.passRate - a.passRate || a.durationMs - b.durationMs)[0]?.harness ?? null : null;
  return { suiteId: suite2.id, suiteName: suite2.name, caseCount: suite2.cases.length, rows, leader, caveats };
}
var pct = (n) => `${Math.round(n * 100)}%`;
function renderRun(run) {
  const lines = [
    `Suite "${run.suiteName}" on ${run.harness}`,
    `  ${run.passed} passed, ${run.failed} failed, ${run.errored} errored  \u2192  pass rate ${pct(run.passRate)}${run.hasErrors ? "  (with errors \u2014 not a clean result)" : ""}`,
    `  cost     ${run.costKnown ? `$${(run.costUsd ?? 0).toFixed(4)}` : "unknown \u2014 this harness reported no price"}`,
    `  tokens   ${run.tokens === null ? "none reported" : run.tokens.toLocaleString()}`,
    `  wall     ${(run.durationMs / 1e3).toFixed(1)}s`
  ];
  for (const r of run.results) {
    const mark = r.outcome === "passed" ? "ok  " : r.outcome === "failed" ? "FAIL" : "ERR ";
    lines.push(`  ${mark} ${r.caseId}: ${r.detail}`);
    if (r.outcome !== "passed" && r.said) lines.push(`        it said: ${r.said.slice(0, 200)}`);
  }
  for (const c of run.caveats) lines.push(`  note: ${c}`);
  return lines.join("\n");
}
function renderComparison(cmp2) {
  if ("rows" in cmp2) {
    const lines2 = [`Comparison on suite "${cmp2.suiteName}" (${cmp2.caseCount} cases)`];
    if (!cmp2.rows.length) {
      lines2.push("  nothing to compare.");
    } else {
      lines2.push("  harness            pass   fail  err   rate   cost        tokens   wall");
      for (const r of [...cmp2.rows].sort((a, b) => b.passRate - a.passRate)) {
        lines2.push(
          `  ${r.harness.padEnd(18)} ${String(r.passed).padStart(4)} ${String(r.failed).padStart(6)} ${String(r.errored).padStart(4)}  ${pct(r.passRate).padStart(5)}  ${(r.costKnown ? `$${(r.costUsd ?? 0).toFixed(4)}` : "unknown").padStart(10)}  ${(r.tokens === null ? "n/a" : r.tokens.toLocaleString()).padStart(8)}  ${(r.durationMs / 1e3).toFixed(1)}s${r.hasErrors ? "  (errors)" : ""}`
        );
      }
    }
    lines2.push("", cmp2.leader ? `  best on this suite: ${cmp2.leader}` : "  no leader \u2014 nothing here is clean enough to rank.");
    for (const c of cmp2.caveats) lines2.push(`  note: ${c}`);
    return lines2.join("\n");
  }
  const lines = [
    `Run Comparison: pass rate ${pct(cmp2.passRateBefore)} -> ${pct(cmp2.passRateAfter)}`,
    `  Newly passing: ${cmp2.newlyPassing.join(", ") || "none"}`,
    `  Newly failing: ${cmp2.newlyFailing.join(", ") || "none"}`,
    `  Regressions: ${cmp2.regressions.map((r) => `${r.dimension} (${r.before.toFixed(2)} -> ${r.after.toFixed(2)})`).join(", ") || "none"}`
  ];
  return lines.join("\n");
}
function evaluationRecord(run, executionId) {
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
      finishedAt: run.finishedAt
    }
  };
}
function readHistoryRow(row) {
  if (!row || typeof row !== "object") return { at: null, score: null, hasErrors: true, harness: null, costKnown: false };
  const r = row;
  const details = r.details && typeof r.details === "object" ? r.details : {};
  const rawDetails = typeof r.details === "string" ? tryParse(r.details) : details;
  const d = rawDetails && typeof rawDetails === "object" ? rawDetails : {};
  return {
    at: typeof r.evaluatedAt === "string" ? r.evaluatedAt : typeof r.createdAt === "string" ? r.createdAt : null,
    score: typeof r.score === "number" ? r.score : null,
    // Unreadable details are treated as "has errors" rather than "clean".
    hasErrors: typeof d.hasErrors === "boolean" ? d.hasErrors : true,
    harness: typeof d.harness === "string" ? d.harness : null,
    costKnown: typeof d.costKnown === "boolean" ? d.costKnown : false
  };
}
function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function validateSuite(suite2) {
  const problems = [];
  if (!suite2.name.trim()) problems.push("The suite has no name.");
  if (!suite2.cases.length) problems.push("The suite has no cases, so running it would measure nothing.");
  if (suite2.defaultTimeoutMs <= 0) problems.push(`The default timeout is ${suite2.defaultTimeoutMs}ms, which would time every case out immediately.`);
  const seen = /* @__PURE__ */ new Set();
  for (const c of suite2.cases) {
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

// src/mission/flightRecorder.ts
var listeners = /* @__PURE__ */ new Set();
var FlightRecorder = class {
  events = [];
  nextSeq = 1;
  missionId;
  constructor(missionId, seed = []) {
    this.missionId = missionId;
    this.events = [...seed];
    this.nextSeq = seed.length ? Math.max(...seed.map((e) => e.seq)) + 1 : 1;
  }
  /**
   * §25 Merge persisted history back in on resume. Existing sequence numbers are kept so a
   * restored mission's trace stays contiguous, and events already present are not duplicated.
   */
  seedHistory(events2) {
    if (!events2.length) return 0;
    const seen = new Set(this.events.map((e) => e.seq));
    let added = 0;
    for (const e of events2) {
      if (seen.has(e.seq)) continue;
      this.events.push(e);
      seen.add(e.seq);
      added += 1;
    }
    this.events.sort((a, b) => a.seq - b.seq);
    this.nextSeq = this.events.length ? this.events[this.events.length - 1].seq + 1 : 1;
    return added;
  }
  record(input) {
    if (!input.actor) throw new Error("governance: every event needs an actor");
    if (!input.authority) throw new Error("governance: every event needs an authority");
    if (!input.reason) throw new Error("governance: every event needs a reason");
    const event = {
      seq: this.nextSeq++,
      missionId: input.missionId ?? this.missionId,
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      kind: input.kind,
      actor: input.actor,
      authority: input.authority,
      policy: input.policy || "none-required",
      reason: input.reason,
      evidence: input.evidence ?? [],
      subjectId: input.subjectId ?? null,
      data: input.data ?? {}
    };
    this.events.push(event);
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
      }
    }
    return event;
  }
  all() {
    return [...this.events];
  }
  ofKind(...kinds) {
    const set = new Set(kinds);
    return this.events.filter((e) => set.has(e.kind));
  }
  forSubject(subjectId) {
    return this.events.filter((e) => e.subjectId === subjectId);
  }
  last(kind) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].kind === kind) return this.events[i];
    }
    return null;
  }
  count(kind) {
    return this.events.filter((e) => e.kind === kind).length;
  }
  /**
   * §14 Replay. Returns the recorder state as it was after `uptoSeq` events.
   * Used by the flight-recorder UI to scrub the mission timeline.
   */
  replay(uptoSeq) {
    return this.events.filter((e) => e.seq <= uptoSeq);
  }
  /** Distinct sequence numbers, for the scrubber. */
  seqRange() {
    if (!this.events.length) return { min: 0, max: 0 };
    return { min: this.events[0].seq, max: this.events[this.events.length - 1].seq };
  }
  snapshot() {
    return { events: this.all(), nextSeq: this.nextSeq };
  }
  /**
   * Truncate everything after `uptoSeq` — used when rolling a mission back to a checkpoint
   * so the trace does not claim things that are no longer true. The truncation is itself
   * recorded first, so the rollback is visible.
   */
  truncateAfter(uptoSeq, reason) {
    const removed = this.events.filter((e) => e.seq > uptoSeq).length;
    this.events = this.events.filter((e) => e.seq <= uptoSeq);
    this.nextSeq = uptoSeq + 1;
    if (removed > 0) {
      this.record({
        kind: "MISSION_ROLLED_BACK",
        actor: "flight-recorder",
        authority: "runtime",
        policy: "checkpoint.rollback",
        reason,
        data: { removedEvents: removed, uptoSeq }
      });
    }
    return removed;
  }
  get length() {
    return this.events.length;
  }
};

// probe/replayEvals.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
function trace() {
  const r = new FlightRecorder("mission.demo");
  r.record({ kind: "MISSION_CREATED", actor: "human", authority: "human", policy: "none-required", reason: "Mission opened." });
  r.record({ kind: "MISSION_STATUS", actor: "runtime", authority: "policy:lifecycle", policy: "lifecycle", reason: "Planning.", data: { from: null, to: "PLANNING" } });
  r.record({ kind: "MISSION_PLANNED", actor: "planner", authority: "policy:plan", policy: "plan", reason: "3 steps.", evidence: ["plan.json"] });
  r.record({ kind: "AGENT_SPAWNED", actor: "runtime", authority: "policy:org", policy: "org", reason: "Coder needed.", subjectId: "a.coder", data: { agentId: "a.coder", role: "coder", name: "Coder" } });
  r.record({ kind: "AGENT_ASSIGNED", actor: "runtime", authority: "policy:org", policy: "org", reason: "Task 1 to coder.", subjectId: "a.coder", data: { agentId: "a.coder" } });
  r.record({
    kind: "HARNESS_SELECTED",
    actor: "runtime",
    authority: "policy:risk-MEDIUM",
    policy: "risk",
    reason: 'claude will run "fix sub" with: claude -p',
    subjectId: "a.coder",
    data: { agentId: "a.coder", harness: "claude", argv: ["claude", "-p"], readOnly: false, canWrite: true, refused: false }
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
var events = trace();
var p = project(events);
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
var empty = project([]);
ok("an empty trace has no status", empty.status === null, String(empty.status));
ok("an empty trace reports spend as UNKNOWN, not $0", empty.spendKnown === false, `spendKnown=${empty.spendKnown}`);
ok("the render says spend is unknown", /unknown — no harness reported a cost/.test(renderProjection(empty)), renderProjection(empty).slice(0, 120));
section("2. replay: diffing two moments");
var mid = project(events.filter((e) => e.seq <= 8));
var diff = diffProjections(mid, p);
ok("the diff is not identical", diff.identical === false, "identical");
ok("spend shows as a change", diff.changes.some((c) => c.field === "spendUsd" && c.to === "0.420"), JSON.stringify(diff.changes.filter((c) => c.field === "spendUsd")));
ok("the harness change is reported", diff.changes.some((c) => c.field.includes("harness")), JSON.stringify(diff.changes.map((c) => c.field)));
ok("decisions between the two points are listed", diff.decisionsBetween.length > 0 && diff.decisionsBetween.every((d) => d.seq > mid.uptoSeq), `${diff.decisionsBetween.length}`);
ok("diffing a projection with itself is identical", diffProjections(p, p).identical === true, "not identical");
section("3. replay: finding the decision that changed things");
var switchEvent = events.find((e) => e.kind === "HARNESS_SWITCHED");
ok("the trace contains a harness switch", switchEvent !== void 0, "missing");
if (switchEvent) {
  const at = decisionAt(events, switchEvent.seq);
  ok("decisionAt finds a decision", at !== null, "null");
  ok("the decision is the harness switch", at?.decision.label === "harness switched", String(at?.decision.label));
  ok("before/after projections bracket the decision", at !== null && at.before.uptoSeq < switchEvent.seq && at.after.uptoSeq === switchEvent.seq, `${at?.before.uptoSeq} -> ${at?.after.uptoSeq}`);
  ok("the diff across that decision shows the harness change", at !== null && at.diff.changes.some((c) => c.field.includes("harness")), JSON.stringify(at?.diff.changes.map((c) => c.field)));
}
ok("decisionAt on an empty trace is null, not a crash", decisionAt([], 5) === null, "not null");
section("4. replay: a counterfactual refuses to invent an outcome");
var cf = counterfactualHarness(events, 14, "codex");
ok("the question names both harnesses", /codex/.test(cf.question) && /opencode|claude|unknown/.test(cf.question), cf.question);
ok("the outcome is explicitly unknown", cf.outcome === "unknown \u2014 this was not re-run", cf.outcome);
ok("it states what a real test would require", cf.wouldRequire.length >= 3, `${cf.wouldRequire.length}`);
ok("no numeric result was fabricated", !/\d+\.\d+/.test(JSON.stringify(cf.outcome)), cf.outcome);
section("5. replay: the scrubber");
var ticks = timelineTicks(events);
ok("ticks are increasing", ticks.every((t, i, a) => i === 0 || a[i - 1] < t), JSON.stringify(ticks));
ok("ticks land on real sequence numbers", ticks.every((t) => events.some((e) => e.seq === t)), JSON.stringify(ticks));
ok("an empty trace yields no ticks", timelineTicks([]).length === 0, "non-empty");
var suite = {
  id: "suite.calc",
  name: "Calculator regression",
  description: "Three small tasks with real checks.",
  schemaVersion: 1,
  defaultTimeoutMs: 3e4,
  cases: [
    { id: "fix-sub", prompt: "Make sub() subtract.", expectation: { command: "node test.js" }, cwd: "/tmp/evals-a", readOnly: false },
    { id: "explain", prompt: "Explain add().", expectation: { outputContains: "adds" }, cwd: "/tmp/evals-a", readOnly: true },
    // `git diff --exit-code` exits 0 on a clean tree and 1 on a dirty one, so expecting success here
    // means "the agent must not have written anything". expectFailure would mean the opposite.
    { id: "no-write", prompt: "Do not modify anything.", expectation: { command: "git diff --exit-code" }, cwd: "/tmp/evals-a", readOnly: true }
  ]
};
function stubDeps(behaviour) {
  return {
    compose: (harness, c, readOnly) => ({
      bin: `/usr/bin/${harness}`,
      argv: ["run", c.prompt, ...readOnly ? ["--agent", "plan"] : []],
      env: {},
      cwd: c.cwd,
      timeoutMs: c.timeoutMs ?? suite.defaultTimeoutMs
    }),
    invoke: async (inv) => {
      const caseId = suite.cases.find((c) => inv.argv.includes(c.prompt))?.id ?? "";
      const b = behaviour[caseId] ?? {};
      if (b.throw) throw new Error(`spawn ${inv.bin} ENOENT`);
      if (b.hang) await new Promise((r) => setTimeout(r, 5e3));
      return { exitCode: b.exit ?? 0, stdout: b.stdout ?? "", stderr: "", durationMs: 12, timedOut: false };
    },
    runCheck: async (command) => {
      if (command === "node test.js") return { exitCode: 0, stdout: "all good", stderr: "" };
      if (command === "git diff --exit-code") return { exitCode: 0, stdout: "", stderr: "" };
      return null;
    },
    ledger: new CapLedger({ maxCostUsd: 5, maxTurns: 40, timeoutMs: 6e4 }, Date.now())
  };
}
section("6. evals: a clean run");
var cleanRun = await runSuite(suite, "opencode", stubDeps({
  "fix-sub": { stdout: '{"session_id":"ses_1","total_cost_usd":0.01,"num_turns":2}\nFixed sub().' },
  explain: { stdout: '{"session_id":"ses_2","total_cost_usd":0.02}\nIt adds two numbers.' },
  "no-write": { stdout: '{"session_id":"ses_3","total_cost_usd":0.03}\nunchanged' }
}));
ok("all three cases passed", cleanRun.passed === 3 && cleanRun.failed === 0 && cleanRun.errored === 0, `${cleanRun.passed}/${cleanRun.failed}/${cleanRun.errored}`);
ok("pass rate is 1 and there are no errors", cleanRun.passRate === 1 && cleanRun.hasErrors === false, `${cleanRun.passRate} hasErrors=${cleanRun.hasErrors}`);
ok("the session id was extracted from the CLI's own output", cleanRun.results[0]?.sessionId === "ses_1", String(cleanRun.results[0]?.sessionId));
ok("cost was read from the CLI and summed across cases", cleanRun.costKnown === true && Math.abs((cleanRun.costUsd ?? 0) - 0.06) < 1e-9, `$${cleanRun.costUsd} known=${cleanRun.costKnown}`);
ok("the summed cost is per-case, not a single figure", cleanRun.results.every((r) => r.costUsd !== null), JSON.stringify(cleanRun.results.map((r) => r.costUsd)));
ok("a read-only case composed the read-only argv", (cleanRun.results[1]?.argv ?? []).includes("plan"), JSON.stringify(cleanRun.results[1]?.argv));
ok("the argv is recorded so a failure is reproducible", (cleanRun.results[0]?.argv ?? []).length >= 2, JSON.stringify(cleanRun.results[0]?.argv));
section("7. evals: a failing check is a failure, not a pass");
var failRun = await runSuite(suite, "claude", stubDeps({
  "fix-sub": { stdout: "done" },
  explain: { stdout: "It multiplies." },
  "no-write": { stdout: "unchanged" }
}));
ok("the wrong explanation failed", failRun.results[1]?.outcome === "failed", String(failRun.results[1]?.outcome));
ok("the detail says what was missing", /did not contain/.test(failRun.results[1]?.detail ?? ""), String(failRun.results[1]?.detail));
ok("the clean-tree case passed on the check's exit code", failRun.results[2]?.outcome === "passed", String(failRun.results[2]?.outcome));
ok("and its detail cites the check, not the agent's opinion", /Check passed/.test(failRun.results[2]?.detail ?? ""), String(failRun.results[2]?.detail));
section("8. evals: a harness that cannot run is ERRORED, and stays in the denominator");
var errRun = await runSuite(suite, "kilo", stubDeps({
  "fix-sub": { throw: true },
  explain: { stdout: "It adds." },
  "no-write": { stdout: "unchanged" }
}));
ok("the unspawnable case is errored", errRun.results[0]?.outcome === "errored", String(errRun.results[0]?.outcome));
ok("the reason names the real cause", /ENOENT/.test(errRun.results[0]?.detail ?? ""), String(errRun.results[0]?.detail));
ok("hasErrors is true", errRun.hasErrors === true, `${errRun.hasErrors}`);
ok("THE KEY RULE: the error is in the denominator, so the rate is 2/3 not 2/2", Math.abs(errRun.passRate - 2 / 3) < 1e-9, String(errRun.passRate));
ok("a caveat says the errors were counted, not excluded", errRun.caveats.some((c) => /counted against the pass rate/.test(c)), JSON.stringify(errRun.caveats));
section("9. evals: a read-only case on a harness with no enforced read-only mode");
var noRoDeps = {
  ...stubDeps({}),
  compose: (_h, c, readOnly) => readOnly ? null : { bin: "/usr/bin/kilo", argv: ["run", c.prompt], env: {}, cwd: c.cwd, timeoutMs: 1e3 }
};
var roRun = await runSuite(suite, "kilo", noRoDeps);
ok("read-only cases that cannot be dispatched are errored", roRun.results.filter((r) => r.outcome === "errored").length === 2, `${roRun.results.filter((r) => r.outcome === "errored").length}`);
ok("the reason explains why, rather than silently skipping", /no enforced read-only mode/.test(roRun.results[1]?.detail ?? ""), String(roRun.results[1]?.detail));
ok("and the pass rate reflects it", Math.abs(roRun.passRate - 1 / 3) < 1e-9, String(roRun.passRate));
section("10. evals: cost is unknown when the CLI reports none");
var noCostRun = await runSuite(suite, "codex", stubDeps({
  "fix-sub": { stdout: '{"tokens":900}' },
  explain: { stdout: "It adds." },
  "no-write": { stdout: "unchanged" }
}));
ok("costKnown is false", noCostRun.costKnown === false, `${noCostRun.costKnown}`);
ok("costUsd is null, not 0", noCostRun.costUsd === null, String(noCostRun.costUsd));
ok("the render says cost is unknown", /unknown — this harness reported no price/.test(renderRun(noCostRun)), renderRun(noCostRun).split("\n")[2] ?? "");
ok("tokens were still captured", noCostRun.tokens !== null && noCostRun.tokens >= 900, String(noCostRun.tokens));
section("11. evals: comparison refuses to rank across suites");
var cmp = compareHarnesses(suite, [cleanRun, errRun, { ...noCostRun, suiteId: "suite.other", suiteName: "Other" }]);
ok("the other suite's run was excluded", cmp.rows.length === 2, `${cmp.rows.length}`);
ok("a caveat explains the exclusion", cmp.caveats.some((c) => /not comparable/.test(c)), JSON.stringify(cmp.caveats));
ok("the leader is the clean run, not the errored one", cmp.leader === "opencode", String(cmp.leader));
ok("the render refuses to name a leader when nothing is clean", /no leader/.test(renderComparison(compareHarnesses(suite, [errRun]))), renderComparison(compareHarnesses(suite, [errRun])).split("\n").slice(-3).join(" "));
section("12. evals: persistence carries hasErrors with the score");
var rec = evaluationRecord(errRun, null);
ok("the node key identifies harness and suite", rec.nodeKey === "eval:kilo:suite.calc", rec.nodeKey);
ok("the score is the pass rate", Math.abs(rec.score - errRun.passRate) < 1e-9 && errRun.passRate === 2 / 3, `${rec.score} vs ${errRun.passRate}`);
ok("hasErrors travels in the details", rec.details.hasErrors === true, JSON.stringify(rec.details));
ok("a bare score with no details reads back as hasErrors=true (the safe reading)", readHistoryRow({ score: 1 }).hasErrors === true, JSON.stringify(readHistoryRow({ score: 1 })));
ok("a full row reads back correctly", (() => {
  const h = readHistoryRow({ score: 0.5, evaluatedAt: "2026-01-01", details: JSON.stringify({ hasErrors: false, harness: "claude", costKnown: true }) });
  return h.hasErrors === false && h.harness === "claude" && h.costKnown === true;
})(), JSON.stringify(readHistoryRow({ details: JSON.stringify({ hasErrors: false, harness: "claude", costKnown: true }) })));
ok("garbage reads back as hasErrors=true rather than throwing", readHistoryRow("not an object").hasErrors === true && readHistoryRow(null).hasErrors === true, "threw or returned clean");
section("13. evals: a suite is validated before it is spent on");
ok("the good suite has no problems", validateSuite(suite).length === 0, JSON.stringify(validateSuite(suite)));
var badSuite = {
  id: "suite.bad",
  name: "",
  description: "",
  schemaVersion: 1,
  defaultTimeoutMs: 0,
  cases: [
    { id: "", prompt: "", expectation: {}, cwd: "" },
    { id: "dup", prompt: "x", expectation: { command: "true" }, cwd: "/tmp" },
    { id: "dup", prompt: "y", expectation: { outputContains: "z" }, cwd: "/tmp" }
  ]
};
var probs = validateSuite(badSuite);
ok("a nameless suite is flagged", probs.some((p2) => /no name/.test(p2)), JSON.stringify(probs));
ok("a zero timeout is flagged", probs.some((p2) => /timeout/.test(p2)), JSON.stringify(probs));
ok("an id-less case is flagged", probs.some((p2) => /no id/.test(p2)), JSON.stringify(probs));
ok("a duplicate id is flagged", probs.some((p2) => /more than once/.test(p2)), JSON.stringify(probs));
ok("an expectation-less case is flagged", probs.some((p2) => /no expectation/.test(p2)), JSON.stringify(probs));
ok("an empty prompt is flagged", probs.some((p2) => /empty prompt/.test(p2)), JSON.stringify(probs));
ok("a case with no cwd is flagged", probs.some((p2) => /working directory/.test(p2)), JSON.stringify(probs));
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
