/**
 * §40 TEAM SELF-EVOLUTION & FEEDBACK LOOP probe (V11.2).
 *
 * Exercises the pure loop: signal → fold → evidence → superset candidate → gates → propose or
 * apply. The honesty rules are asserted directly, not admired:
 *
 *   1. no candidate exists while evidence is thin (minRuns / minRealRuns / minEvidenceWeight);
 *   2. a candidate is a SUPERSET edit — the baseline is always a prefix;
 *   3. candidateScore is null at proposal time (never claimed before a run measured it);
 *   4. simulated runs never alone justify a candidate;
 *   5. praise (rating ≥4) suppresses candidates for N runs;
 *   6. queued feedback becomes evidence without inflating the run count;
 *   7. AUTONOMOUS applies only what passes every gate, and records the pre-apply text.
 */

import {
  TEAM_EVO_CONFIG,
  applyCandidateToTeam,
  applyTeamFeedback,
  decideCandidate,
  emptyStore,
  evolveTeamAfterRun,
  foldSignal,
  gateTeamCandidate,
  seatScore,
  signalsFromSeatRecords,
  type TeamSeatRunSignal,
} from "../src/mission/teamEvolution";
import type { CliAgentTeam } from "../src/mission/agentTeam";

let pass = 0;
let fail = 0;
const failures: string[] = [];
const ok = (cond: boolean, m: string, detail = "") => {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`${m}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${m}${detail ? ` — ${detail}` : ""}`);
  }
};
const near = (a: number, b: number, m: string, tol = 0.001) => ok(Math.abs(a - b) <= tol, m, `expected ${b}, got ${a}`);

const NOW = "2026-09-01T12:00:00.000Z";

function seat(id = "coder", instructions = "Implement the change. Touch only what the task requires.") {
  return { id, role: id === "planner" ? "planner" : "coder", harness: "claude", mayWrite: true, maxRisk: "MEDIUM", timeoutSecs: 300, maxTurns: 10, instructions } as unknown as CliAgentTeam["seats"][number];
}

function team(instructions?: string): CliAgentTeam {
  return {
    id: "team.test",
    name: "Test Team",
    description: "probe fixture",
    revision: 1,
    seats: [seat("coder", instructions)],
  } as unknown as CliAgentTeam;
}

function sig(over: Partial<TeamSeatRunSignal>): TeamSeatRunSignal {
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
    durationMs: 5000,
    simulated: false,
    rating: null,
    comment: null,
    ...over,
  };
}

console.log("\n== 1. foldSignal — arithmetic over measured facts ==\n");
{
  let s = foldSignal(
    foldSignal(foldSignal(emptyStore().byTeam["x"]?.seats["y"]?.stats ?? { runs: 0, realRuns: 0, okRuns: 0, verifiedRuns: 0, totalCostUsd: 0, totalMs: 0, feedbackSum: 0, feedbackCount: 0, lastAt: null, okRate: 0, verifiedRate: 0, feedbackAvg: null }, sig({})),
      sig({ ok: false, exitCode: 1, verified: false })),
    sig({ rating: 5 }),
  );
  ok(s.runs === 3, "runs counts every signal", `${s.runs}`);
  ok(s.realRuns === 3, "realRuns counts non-simulated", `${s.realRuns}`);
  ok(s.okRate === 2 / 3, "okRate = ok/runs", `${s.okRate}`);
  ok(s.verifiedRate === 2 / 3, "verifiedRate = verified/runs", `${s.verifiedRate}`);
  ok(s.feedbackAvg === 5, "feedbackAvg from ratings", `${s.feedbackAvg}`);
}

console.log("\n== 2. seatScore — correctness/procedure/conciseness, never invented ==\n");
{
  const stats = { runs: 4, realRuns: 4, okRuns: 4, verifiedRuns: 3, totalCostUsd: 0, totalMs: 0, feedbackSum: 18, feedbackCount: 4, lastAt: null, okRate: 1, verifiedRate: 0.75, feedbackAvg: 4.5 };
  const short = seatScore(stats, 400);
  near(short, 0.5 * 1 + 0.3 * 0.75 + 0.2 * 0.9, "score mixes measured ok/verified/feedback");
  const long = seatScore(stats, 7800);
  ok(long < short, "length penalty drags the score down as the prompt grows", `${short} vs ${long}`);
  ok(seatScore({ ...stats, runs: 0, okRate: 0, verifiedRate: 0 }, 400) <= 0.5, "no runs ⇒ no score higher than the conciseness floor");
}

console.log("\n== 3. evidenceFrom — simulated runs are recorded, never weighted ==\n");
{
  // A single simulated failure must not be evidence: it is a fixture, not a fact.
  const store = evolveTeamAfterRun({
    store: emptyStore(),
    team: team(),
    signal: sig({ ok: false, exitCode: 1, simulated: true }),
    actor: "probe",
    nowIso: NOW,
  }).store;
  ok(store.candidates.length === 0, "a single simulated failure produces nothing", `${store.candidates.length}`);
}

console.log("\n== 4. the loop: evidence threshold, superset edit, no claimed score ==\n");
{
  // Three real runs, two failures with real weight 2 each → weight 4 ≥ 3.
  let store = emptyStore();
  store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  store = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: false, exitCode: 1 }), actor: "probe", nowIso: NOW }).store;
  ok(store.candidates.length === 0, "two failing runs alone: runs < minRuns", `${store.candidates.length}`);
  const r3 = evolveTeamAfterRun({ store, team: team(), signal: sig({ ok: true, verified: false }), actor: "probe", nowIso: NOW });
  store = r3.store;
  ok(store.candidates.length === 1, "three runs with cumulative weight ≥3 ⇒ candidate", `${store.candidates.length}`);
  const c = store.candidates[0];
  ok(c.candidate.startsWith(c.baseline), "candidate is a superset (baseline is a prefix)");
  ok(c.candidateScore === null, "candidateScore is null at proposal time", String(c.candidateScore));
  ok(/Not measured/.test(c.scoreNote), "the score note says it is unmeasured");
  ok(c.status === "PROPOSED" && c.decision === "PENDING", "SUGGEST mode proposes, never applies");
  ok(c.gates.some((g) => g.name === "growth_limit" && g.passed), "growth gate ran");
}

console.log("\n== 5. praise suppression: a seat that works is not a seat to change ==\n");
{
  // Two failures build evidence (weight 4, but runs=2 < minRuns). From run 3 the evidence is
  // sufficient — yet the human keeps rating 5, and the seat is praised through run 6: no
  // candidate may appear while suppression is active. The 7th run (a failure) still would be
  // due — this is the assertion that suppression only *delays*, it does not silence forever.
  let store = emptyStore();
  for (let i = 1; i <= 9; i++) {
    const signal = i <= 2
      ? sig({ ok: false, exitCode: 1, verified: false })
      : i <= 6
        ? sig({ rating: 5, verified: true })
        : sig({ ok: false, exitCode: 1, verified: false });
    store = evolveTeamAfterRun({ store, team: team(), signal, actor: "probe", nowIso: NOW }).store;
    if (i === 6) ok(store.candidates.length === 0, `praise suppresses candidates through run ${i}`, `candidates=${store.candidates.length}`);
  }
  ok(store.candidates.length === 1, "suppression ends — the next real failures produce the candidate", `${store.candidates.length}`);
}

console.log("\n== 6. AUTONOMOUS: gates gate, and the pre-apply text is preserved ==\n");
{
  let store = emptyStore();
  store = {
    ...store,
    byTeam: { ...store.byTeam, "team.test": { mode: "AUTONOMOUS", seats: {} } },
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
    nowIso: NOW,
  }).store;
  // feed two more runs through a fresh store to reach a candidate deterministically
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
      { seatId: "reviewer", role: "reviewer", harness: "codex", outcome: "failed", exitCode: 1, chargedUsd: 0.05, durationMs: 900, verified: false },
    ],
  });
  ok(signals.length === 2 && signals[0].ok && !signals[1].ok && signals[1].verified === false, "outcome maps to ok; verified pass-through");
  ok(signals.every((s) => s.rating === null && s.comment === null), "no ratings attached by default");
}

console.log("\n== 10. config sanity ==\n");
{
  ok(TEAM_EVO_CONFIG.minRuns >= 3, "no candidate before ≥3 runs");
  ok(TEAM_EVO_CONFIG.minRealRuns >= 2, "simulated runs alone cannot justify a candidate");
  ok(TEAM_EVO_CONFIG.maxGrowth <= 0.25, "a candidate cannot grow the seat text more than 25%");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
