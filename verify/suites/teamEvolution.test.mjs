import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/app/id.ts
var n = 0;
function uid(prefix) {
  n += 1;
  return `${prefix}-${Date.now().toString(36)}-${n.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// src/mission/teamEvolution.ts
var TEAM_EVO_CONFIG = {
  minRuns: 3,
  minRealRuns: 2,
  minEvidenceWeight: 3,
  maxInstructionsChars: 8e3,
  maxGrowth: 0.2,
  /** A flat append allowance: the growth budget is max(20% of baseline, this many chars), so a
   *  short instruction can still learn a real lesson instead of one 14-char bullet. */
  minAppendChars: 300,
  maxEvidenceBullets: 5,
  praiseSuppressRuns: 3
};
function emptyStats() {
  return {
    runs: 0,
    realRuns: 0,
    okRuns: 0,
    verifiedRuns: 0,
    totalCostUsd: 0,
    totalMs: 0,
    feedbackSum: 0,
    feedbackCount: 0,
    lastAt: null,
    okRate: 0,
    verifiedRate: 0,
    feedbackAvg: null
  };
}
function emptyStore() {
  return { schemaVersion: 1, byTeam: {}, candidates: [], feedback: [] };
}
function foldSignal(prev, s) {
  const next = {
    runs: prev.runs + 1,
    realRuns: prev.realRuns + (s.simulated ? 0 : 1),
    okRuns: prev.okRuns + (s.ok ? 1 : 0),
    verifiedRuns: prev.verifiedRuns + (s.verified ? 1 : 0),
    totalCostUsd: prev.totalCostUsd + (s.costUsd || 0),
    totalMs: prev.totalMs + (s.durationMs || 0),
    feedbackSum: prev.feedbackSum + (s.rating ?? 0),
    feedbackCount: prev.feedbackCount + (s.rating !== null ? 1 : 0),
    lastAt: s.ts,
    okRate: 0,
    verifiedRate: 0,
    feedbackAvg: null
  };
  next.okRate = next.runs > 0 ? next.okRuns / next.runs : 0;
  next.verifiedRate = next.runs > 0 ? next.verifiedRuns / next.runs : 0;
  next.feedbackAvg = next.feedbackCount > 0 ? next.feedbackSum / next.feedbackCount : null;
  return next;
}
function seatScore(stats, instructionsLength) {
  const correctness = stats.runs > 0 ? stats.okRate : 0;
  const procedure = stats.runs > 0 ? stats.verifiedRate : 0;
  const conciseness = stats.feedbackAvg !== null ? Math.min(1, stats.feedbackAvg / 5) : 0.5;
  const raw = 0.5 * correctness + 0.3 * procedure + 0.2 * conciseness;
  const ratio = Math.min(1, instructionsLength / Math.max(1, TEAM_EVO_CONFIG.maxInstructionsChars));
  const penalty = ratio <= 0.9 ? 0 : Math.min(0.3, (ratio - 0.9) * 3);
  return Math.max(0, raw - penalty);
}
function evidenceFrom(s, harnessName) {
  const ev = [];
  if (!s.ok) {
    ev.push({
      kind: "failed-run",
      text: s.simulated ? `Simulated failure (${harnessName}) \u2014 recorded, not evidence.` : `Run failed (${harnessName}, exit ${s.exitCode ?? "?"}).`,
      weight: s.simulated ? 0 : 2
    });
  }
  if (s.ok && !s.verified) {
    ev.push({
      kind: "unverified",
      text: `Task ran but the repo's own verification did not pass (${harnessName}).`,
      weight: 1
    });
  }
  if (s.costUsd > 0 && s.costUsd > 0.5) {
    ev.push({ kind: "cost", text: `High spend on one seat: $${s.costUsd.toFixed(4)}.`, weight: 1 });
  }
  if (s.rating !== null && s.rating <= 2) {
    ev.push({
      kind: "feedback",
      text: s.comment?.trim() ? `Human: ${s.comment.trim()}` : `Human rating ${s.rating}/5.`,
      weight: 2
    });
  }
  return ev;
}
function growthOk(baseline, candidate) {
  const base = Math.max(1, baseline.length);
  const allowed = Math.max(base * TEAM_EVO_CONFIG.maxGrowth, TEAM_EVO_CONFIG.minAppendChars);
  const growth = candidate.length - baseline.length;
  return {
    ok: growth <= allowed && candidate.length <= TEAM_EVO_CONFIG.maxInstructionsChars,
    growth,
    allowed
  };
}
function composeSeatCandidate(seat2, evidence, instructionVersion) {
  const baseline = (seat2.instructions ?? "").trimEnd();
  const bullets = [...evidence].sort((a, b) => b.weight - a.weight).slice(0, TEAM_EVO_CONFIG.maxEvidenceBullets).map((e) => `- ${e.text}`);
  const dropped = evidence.length > bullets.length ? evidence.slice(bullets.length).map((e) => e.text) : [];
  const section = `

## Learned corrections (v${instructionVersion + 1})

${bullets.join("\n")}`;
  let candidate = `${baseline}${section}`;
  const cap = growthOk(baseline, candidate);
  while (!cap.ok && bullets.length > 0) {
    const removed = bullets.pop();
    if (removed) dropped.unshift(removed.replace(/^- /, ""));
    candidate = `${baseline}${bullets.length ? `

## Learned corrections (v${instructionVersion + 1})

${bullets.join("\n")}` : ""}`;
    const again = growthOk(baseline, candidate);
    if (again.ok) break;
  }
  return { candidate: candidate || baseline, dropped, trigger: evidence.some((e) => e.kind === "feedback") ? "human-feedback" : "run-evidence" };
}
function gateTeamCandidate(args) {
  const baseline = (args.seat.instructions ?? "").trimEnd();
  const gates = [];
  gates.push({
    name: "non_empty",
    passed: Boolean(args.candidate.trim()),
    message: args.candidate.trim() ? "Candidate is non-empty" : "Candidate is empty"
  });
  gates.push({
    name: "superset_preserves_baseline",
    passed: args.candidate.startsWith(baseline) || baseline.length === 0,
    message: baseline.length === 0 ? "No baseline; candidate defines the seat from scratch" : "Baseline retained verbatim as prefix"
  });
  const g = growthOk(baseline, args.candidate);
  gates.push({
    name: "growth_limit",
    passed: g.ok,
    message: g.ok ? `Append ${g.growth} chars under the ${g.allowed}-char budget; total ${args.candidate.length}/${TEAM_EVO_CONFIG.maxInstructionsChars}` : `Append ${g.growth} chars exceeds the ${g.allowed}-char budget`
  });
  gates.push({
    name: "meaningful_change",
    passed: args.candidate.trim() !== baseline.trim(),
    message: args.candidate.trim() !== baseline.trim() ? "The candidate changes the seat text" : "No-op: the candidate equals the baseline"
  });
  const weight = args.evidence.reduce((a, e) => a + e.weight, 0);
  gates.push({
    name: "evidence_weight",
    passed: weight >= TEAM_EVO_CONFIG.minEvidenceWeight,
    message: `Evidence weight ${weight} (min ${TEAM_EVO_CONFIG.minEvidenceWeight})`
  });
  return { gates, passed: gates.every((x) => x.passed) };
}
function evolveTeamAfterRun(args) {
  const now = args.nowIso ?? (/* @__PURE__ */ new Date()).toISOString();
  const team2 = args.team;
  const seat2 = team2.seats.find((s) => s.id === args.signal.seatId);
  if (!seat2) return { store: args.store, candidate: null, applied: false };
  const store = {
    schemaVersion: 1,
    byTeam: { ...args.store.byTeam },
    candidates: [...args.store.candidates],
    feedback: [...args.store.feedback]
  };
  const teamEvo = store.byTeam[team2.id] ?? { mode: "SUGGEST", seats: {} };
  const seatEvo = teamEvo.seats[seat2.id] ?? {
    stats: emptyStats(),
    evidence: [],
    instructionVersion: (team2.revision ?? 1) || 1,
    editCount: 0,
    lastEditedAt: null,
    praiseSuppression: 0,
    pendingFeedback: [],
    applied: []
  };
  const folded = foldSignal(seatEvo.stats, args.signal);
  const pendingFeedback = seatEvo.pendingFeedback ?? [];
  const praiseQueued = pendingFeedback.some((f) => f.rating >= 4);
  const fresh = [
    ...evidenceFrom(args.signal, seat2.harness),
    ...pendingFeedback.filter((f) => f.rating <= 2).map((f) => ({
      kind: "feedback",
      text: f.comment.trim() ? `Human: ${f.comment.trim()}` : `Human rating ${f.rating}/5`,
      weight: 2
    }))
  ];
  const evidence = [...seatEvo.evidence ?? [], ...fresh].slice(-8);
  const nextSeat = {
    ...seatEvo,
    stats: folded,
    evidence,
    // V11.4 fix: the queue is consumed BY THIS FOLD — it became accumulated evidence (or armed
    // suppression) above. Before, it survived until a candidate was created, so queued praise
    // re-armed suppression on every subsequent fold (a permanently frozen seat) and queued
    // criticism re-added its weight on every run (ledger double-counting).
    pendingFeedback: [],
    praiseSuppression: Math.max(0, seatEvo.praiseSuppression - 1),
    lastEditedAt: folded.lastAt
  };
  if (args.signal.rating !== null && args.signal.rating >= 4) {
    nextSeat.praiseSuppression = TEAM_EVO_CONFIG.praiseSuppressRuns;
  }
  if (praiseQueued) {
    nextSeat.praiseSuppression = TEAM_EVO_CONFIG.praiseSuppressRuns;
  }
  store.byTeam[team2.id] = { ...teamEvo, seats: { ...teamEvo.seats, [seat2.id]: nextSeat } };
  if (args.signal.rating !== null || args.signal.comment) {
    store.feedback.unshift({
      id: uid("tefb"),
      runId: args.signal.runId,
      teamId: team2.id,
      seatId: seat2.id,
      rating: args.signal.rating ?? 0,
      comment: args.signal.comment ?? "",
      createdAt: now
    });
  }
  const mode = teamEvo.mode;
  if (mode === "OFF") return { store, candidate: null, applied: false };
  const realWeight = evidence.filter((e) => e.kind !== "failed-run" || e.weight > 0).reduce((a, e) => a + e.weight, 0);
  const statsOk = folded.runs >= TEAM_EVO_CONFIG.minRuns && folded.realRuns >= TEAM_EVO_CONFIG.minRealRuns;
  const alreadyPending = store.candidates.some((c) => c.teamId === team2.id && c.seatId === seat2.id && c.status === "PROPOSED");
  const due = statsOk && realWeight >= TEAM_EVO_CONFIG.minEvidenceWeight && !alreadyPending && nextSeat.praiseSuppression === 0;
  if (!due) {
    return { store, candidate: null, applied: false };
  }
  const composed = composeSeatCandidate(seat2, evidence, nextSeat.instructionVersion);
  const baselineScore = seatScore(folded, (seat2.instructions ?? "").length);
  const gate = gateTeamCandidate({
    teamName: team2.name,
    seat: seat2,
    evidence,
    candidate: composed.candidate,
    baselineScore
  });
  const candidate = {
    id: uid("teev"),
    teamId: team2.id,
    teamName: team2.name,
    seatId: seat2.id,
    role: seat2.role,
    harness: seat2.harness,
    baseline: (seat2.instructions ?? "").trimEnd(),
    candidate: composed.candidate,
    trigger: composed.trigger,
    evidence,
    baselineScore,
    candidateScore: null,
    scoreNote: "Not measured: the candidate has not run yet. The next run after application is what measures it.",
    gates: gate.gates,
    passed: gate.passed,
    status: "PROPOSED",
    decision: "PENDING",
    decidedBy: null,
    createdAt: now,
    decidedAt: null
  };
  store.candidates.unshift(candidate);
  nextSeat.pendingFeedback = [];
  nextSeat.evidence = [];
  let applied = false;
  if (mode === "AUTONOMOUS" && candidate.passed) {
    candidate.status = "DECIDED";
    candidate.decision = "ACCEPTED";
    candidate.decidedBy = args.actor;
    candidate.decidedAt = now;
    nextSeat.editCount += 1;
    nextSeat.instructionVersion += 1;
    nextSeat.applied.unshift({ at: now, from: candidate.baseline, to: candidate.candidate, by: args.actor });
    applied = true;
  }
  store.byTeam[team2.id] = { ...teamEvo, seats: { ...teamEvo.seats, [seat2.id]: nextSeat } };
  return { store, candidate, applied };
}
function applyCandidateToTeam(team2, candidate, _actor) {
  const next = {
    ...team2,
    revision: (team2.revision ?? 1) + 1,
    seats: team2.seats.map((s) => s.id === candidate.seatId ? { ...s, instructions: candidate.candidate } : s)
  };
  return next;
}
function applyTeamFeedback(store, args) {
  const now = args.nowIso ?? (/* @__PURE__ */ new Date()).toISOString();
  const teamEvo = store.byTeam[args.teamId] ?? { mode: "SUGGEST", seats: {} };
  const seatEvo = teamEvo.seats[args.seatId] ?? {
    stats: emptyStats(),
    evidence: [],
    instructionVersion: 1,
    editCount: 0,
    lastEditedAt: null,
    praiseSuppression: 0,
    pendingFeedback: [],
    applied: []
  };
  const next = {
    ...store,
    byTeam: {
      ...store.byTeam,
      [args.teamId]: {
        ...teamEvo,
        seats: {
          ...teamEvo.seats,
          [args.seatId]: {
            ...seatEvo,
            pendingFeedback: [...seatEvo.pendingFeedback ?? [], { rating: args.rating, comment: args.comment, at: now }]
          }
        }
      }
    },
    feedback: [
      { id: uid("tefb"), runId: args.runId, teamId: args.teamId, seatId: args.seatId, rating: args.rating, comment: args.comment, createdAt: now },
      ...store.feedback
    ]
  };
  return next;
}
function decideCandidate(store, candidateId, decision, by, nowIso) {
  return {
    ...store,
    candidates: store.candidates.map(
      (c) => c.id === candidateId ? { ...c, status: "DECIDED", decision, decidedBy: by, decidedAt: nowIso ?? (/* @__PURE__ */ new Date()).toISOString() } : c
    )
  };
}
function signalsFromSeatRecords(args) {
  return args.seats.map((s) => ({
    runId: args.runId,
    ts: args.ts,
    teamId: args.teamId,
    seatId: s.seatId,
    role: s.role,
    harness: s.harness,
    ok: s.outcome === "completed",
    verified: Boolean(s.verified),
    exitCode: s.exitCode,
    costUsd: s.chargedUsd || 0,
    durationMs: s.durationMs || 0,
    simulated: Boolean(s.simulated),
    rating: null,
    comment: null
  }));
}

// probe/teamEvolution.test.ts
var pass = 0;
var fail = 0;
var failures = [];
var ok = (cond, m, detail = "") => {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`${m}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${m}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var near = (a, b, m, tol = 1e-3) => ok(Math.abs(a - b) <= tol, m, `expected ${b}, got ${a}`);
var NOW = "2026-09-01T12:00:00.000Z";
function seat(id = "coder", instructions = "Implement the change. Touch only what the task requires.") {
  return { id, role: id === "planner" ? "planner" : "coder", harness: "claude", mayWrite: true, maxRisk: "MEDIUM", timeoutSecs: 300, maxTurns: 10, instructions };
}
function team(instructions) {
  return {
    id: "team.test",
    name: "Test Team",
    description: "probe fixture",
    revision: 1,
    seats: [seat("coder", instructions)]
  };
}
function sig(over) {
  return {
    runId: "r1",
    ts: NOW,
    teamId: "team.test",
    seatId: "coder",
    role: "coder",
    harness: "claude",
    ok: true,
    verified: true,
    exitCode: 0,
    costUsd: 0.1,
    durationMs: 5e3,
    simulated: false,
    rating: null,
    comment: null,
    ...over
  };
}
console.log("\n== 1. foldSignal \u2014 arithmetic over measured facts ==\n");
{
  let s = foldSignal(
    foldSignal(
      foldSignal(emptyStore().byTeam["x"]?.seats["y"]?.stats ?? { runs: 0, realRuns: 0, okRuns: 0, verifiedRuns: 0, totalCostUsd: 0, totalMs: 0, feedbackSum: 0, feedbackCount: 0, lastAt: null, okRate: 0, verifiedRate: 0, feedbackAvg: null }, sig({})),
      sig({ ok: false, exitCode: 1, verified: false })
    ),
    sig({ rating: 5 })
  );
  ok(s.runs === 3, "runs counts every signal", `${s.runs}`);
  ok(s.realRuns === 3, "realRuns counts non-simulated", `${s.realRuns}`);
  ok(s.okRate === 2 / 3, "okRate = ok/runs", `${s.okRate}`);
  ok(s.verifiedRate === 2 / 3, "verifiedRate = verified/runs", `${s.verifiedRate}`);
  ok(s.feedbackAvg === 5, "feedbackAvg from ratings", `${s.feedbackAvg}`);
}
console.log("\n== 2. seatScore \u2014 correctness/procedure/conciseness, never invented ==\n");
{
  const stats = { runs: 4, realRuns: 4, okRuns: 4, verifiedRuns: 3, totalCostUsd: 0, totalMs: 0, feedbackSum: 18, feedbackCount: 4, lastAt: null, okRate: 1, verifiedRate: 0.75, feedbackAvg: 4.5 };
  const short = seatScore(stats, 400);
  near(short, 0.5 * 1 + 0.3 * 0.75 + 0.2 * 0.9, "score mixes measured ok/verified/feedback");
  const long = seatScore(stats, 7800);
  ok(long < short, "length penalty drags the score down as the prompt grows", `${short} vs ${long}`);
  ok(seatScore({ ...stats, runs: 0, okRate: 0, verifiedRate: 0 }, 400) <= 0.5, "no runs \u21D2 no score higher than the conciseness floor");
}
console.log("\n== 3. evidenceFrom \u2014 simulated runs are recorded, never weighted ==\n");
{
  const store = evolveTeamAfterRun({
    store: emptyStore(),
    team: team(),
    signal: sig({ ok: false, exitCode: 1, simulated: true }),
    actor: "probe",
    nowIso: NOW
  }).store;
  ok(store.candidates.length === 0, "a single simulated failure produces nothing", `${store.candidates.length}`);
}
console.log("\n== 4. the loop: evidence threshold, superset edit, no claimed score ==\n");
{
  let store = emptyStore();
  store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  ok(store.candidates.length === 0, "two failing runs alone: runs < minRuns", `${store.candidates.length}`);
  const r3 = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: true, verified: false }), actor: "probe", nowIso: NOW });
  store = r3.store;
  ok(store.candidates.length === 1, "three runs with cumulative weight \u22653 \u21D2 candidate", `${store.candidates.length}`);
  const c = store.candidates[0];
  ok(c.candidate.startsWith(c.baseline), "candidate is a superset (baseline is a prefix)");
  ok(c.candidateScore === null, "candidateScore is null at proposal time", String(c.candidateScore));
  ok(/Not measured/.test(c.scoreNote), "the score note says it is unmeasured");
  ok(c.status === "PROPOSED" && c.decision === "PENDING", "SUGGEST mode proposes, never applies");
  ok(c.gates.some((g) => g.name === "growth_limit" && g.passed), "growth gate ran");
}
console.log("\n== 5. praise suppression: a seat that works is not a seat to change ==\n");
{
  let store = emptyStore();
  for (let i = 1; i <= 9; i++) {
    const signal = i <= 2 ? sig({ ok: false, exitCode: 1, verified: false }) : i <= 6 ? sig({ rating: 5, verified: true }) : sig({ ok: false, exitCode: 1, verified: false });
    store = evolveTeamAfterRun({ store, team: team(), signal, actor: "probe", nowIso: NOW }).store;
    if (i === 6) ok(store.candidates.length === 0, `praise suppresses candidates through run ${i}`, `candidates=${store.candidates.length}`);
  }
  ok(store.candidates.length === 1, "suppression ends \u2014 the next real failures produce the candidate", `${store.candidates.length}`);
}
console.log("\n== 6. AUTONOMOUS: gates gate, and the pre-apply text is preserved ==\n");
{
  let store = emptyStore();
  store = {
    ...store,
    byTeam: { ...store.byTeam, "team.test": { mode: "AUTONOMOUS", seats: {} } }
  };
  store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "team-evolver", nowIso: NOW }).store;
  store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "team-evolver", nowIso: NOW }).store;
  const r3 = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: true, verified: false }), actor: "team-evolver", nowIso: NOW });
  store = r3.store;
  ok(r3.applied === true, "AUTONOMOUS applied the gated candidate");
  ok(store.candidates[0].decision === "ACCEPTED", "application is recorded as a decision");
  ok(store.candidates[0].decidedBy === "team-evolver", "the actor is recorded");
  const seatEvo = store.byTeam["team.test"].seats["coder"];
  ok(seatEvo.editCount === 1, "edit count advanced", `${seatEvo.editCount}`);
  ok(seatEvo.applied[0].from.includes("Implement the change"), "pre-apply text preserved for rollback");
}
console.log("\n== 7. human accept (SUGGEST): applyCandidateToTeam is a real mutation ==\n");
{
  const t = team();
  const store = evolveTeamAfterRun({
    store: emptyStore(),
    team: t,
    signal: sig({ ok: false, exitCode: 1 }),
    actor: "probe",
    nowIso: NOW
  }).store;
  let s2 = emptyStore();
  s2 = evolveTeamAfterRun({ store: s2, team: t, signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  s2 = evolveTeamAfterRun({ store: s2, team: t, signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  s2 = evolveTeamAfterRun({ store: s2, team: t, signal: sig({ ok: true, verified: false }), actor: "probe", nowIso: NOW }).store;
  const c = s2.candidates[0];
  const next = applyCandidateToTeam(t, c, "human:operator");
  ok(next.seats[0].instructions === c.candidate, "accepted candidate becomes the seat instructions");
  ok((next.revision ?? 1) > (t.revision ?? 1), "revision bumps on apply");
  const decided = decideCandidate(s2, c.id, "ACCEPTED", "human:operator", NOW);
  ok(decided.candidates[0].decision === "ACCEPTED" && decided.candidates[0].status === "DECIDED", "decideCandidate records the verdict");
  const rejected = decideCandidate(s2, c.id, "REJECTED", "human:operator", NOW);
  ok(rejected.candidates[0].decision === "REJECTED", "rejection is recorded too");
}
console.log("\n== 8. queued feedback becomes evidence without inflating the run count ==\n");
{
  let store = emptyStore();
  store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  store = applyTeamFeedback(store, { teamId: "team.test", seatId: "coder", runId: "r1", rating: 1, comment: "Stop touching the lock file.", nowIso: NOW });
  ok(store.byTeam["team.test"].seats["coder"].pendingFeedback.length === 1, "feedback is queued on the seat");
  const r3 = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW });
  store = r3.store;
  ok(store.candidates.length === 1, "queued feedback + runs produced a candidate", `${store.candidates.length}`);
  ok(store.candidates[0].evidence.some((e) => e.kind === "feedback" && /lock file/.test(e.text)), "the human comment is quoted into evidence");
  ok(store.byTeam["team.test"].seats["coder"].pendingFeedback.length === 0, "feedback consumed once a candidate exists");
  ok(store.byTeam["team.test"].seats["coder"].stats.runs === 3, "run count was not inflated by feedback", `${store.byTeam["team.test"].seats["coder"].stats.runs}`);
}
console.log("\n== 9. signalsFromSeatRecords maps a real TeamRunReport shape ==\n");
{
  const signals = signalsFromSeatRecords({
    runId: "r9",
    ts: NOW,
    teamId: "team.test",
    seats: [
      { seatId: "coder", role: "coder", harness: "claude", outcome: "completed", exitCode: 0, chargedUsd: 0.12, durationMs: 4200, verified: true },
      { seatId: "reviewer", role: "reviewer", harness: "codex", outcome: "failed", exitCode: 1, chargedUsd: 0.05, durationMs: 900, verified: false }
    ]
  });
  ok(signals.length === 2 && signals[0].ok && !signals[1].ok && signals[1].verified === false, "outcome maps to ok; verified pass-through");
  ok(signals.every((s) => s.rating === null && s.comment === null), "no ratings attached by default");
}
console.log("\n== 10. config sanity ==\n");
{
  ok(TEAM_EVO_CONFIG.minRuns >= 3, "no candidate before \u22653 runs");
  ok(TEAM_EVO_CONFIG.minRealRuns >= 2, "simulated runs alone cannot justify a candidate");
  ok(TEAM_EVO_CONFIG.maxGrowth <= 0.25, "a candidate cannot grow the seat text more than 25%");
}
console.log("\n== 11. V11.4 \u2014 queued praise suppresses, it never becomes failure evidence ==\n");
{
  let store = emptyStore();
  store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  store = applyTeamFeedback(store, { teamId: "team.test", seatId: "coder", runId: "r-praise", rating: 5, comment: "flawless work", nowIso: NOW });
  ok(store.byTeam["team.test"].seats["coder"].pendingFeedback.length === 1, "praise queues like any feedback");
  const r4 = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW });
  store = r4.store;
  const seat2 = store.byTeam["team.test"].seats["coder"];
  ok(store.candidates.length === 0, "praise suppresses the candidate even when evidence is otherwise due", `${store.candidates.length}`);
  ok(seat2.praiseSuppression === TEAM_EVO_CONFIG.praiseSuppressRuns, "suppression armed for N runs", `${seat2.praiseSuppression}`);
  ok(!seat2.evidence.some((e) => /flawless/.test(e.text)), "the praise comment never becomes evidence");
  ok(!seat2.evidence.some((e) => e.kind === "feedback"), "queued praise contributes no evidence weight at all");
  let guard = 0;
  while (store.candidates.length === 0 && guard++ < 12) {
    store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  }
  ok(store.candidates.length === 1, "suppression ends \u2014 real failures still produce the candidate", `${store.candidates.length}`);
  let s3 = emptyStore();
  s3 = evolveTeamAfterRun({ store: s3, team: team(), signal: sig({ ok: true, verified: true }), actor: "probe", nowIso: NOW }).store;
  s3 = applyTeamFeedback(s3, { teamId: "team.test", seatId: "coder", runId: "r-neutral", rating: 3, comment: "fine, nothing to change", nowIso: NOW });
  const nseat = evolveTeamAfterRun({ store: s3, team: team(), signal: sig({ ok: true, verified: true }), actor: "probe", nowIso: NOW }).store.byTeam["team.test"].seats["coder"];
  ok(!nseat.evidence.some((e) => e.kind === "feedback"), "a neutral 3/5 is not weighted as evidence");
  ok(nseat.praiseSuppression === 0, "a neutral 3/5 does not arm suppression", `${nseat.praiseSuppression}`);
}
console.log(`
${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
