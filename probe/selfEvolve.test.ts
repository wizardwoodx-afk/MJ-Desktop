/**
 * MJ 11.11.1 SELF-EVOLVING — probe suite.
 *
 * Pins the self-evolution spine: reflection is deterministic and measured-only,
 * memory decays/reinforces/retrieves, the strategy loop is a CAUSAL online
 * experiment (a strategy is scored only on runs executed under its own
 * parameters, verdicts need minimum measured trials on both arms, adoption
 * needs a strict margin), skills propose ONLY from verified real runs and are
 * described as procedural knowledge, and learning receipts verify from zero
 * MJ state and catch tampering.
 */
import {
  reflectOnMission, mergeLessons, retrieveLessons, lessonsForBriefing, decayedStrength,
  LESSON_CAP, type Lesson, type ReflectInput,
} from "../src/mission/lessons";
import {
  initialState, proposeVariation, settleCandidate, scoreRuns, adoptedVersion,
  nextAssignment, armScores, strategyWaveShape, evidenceDepth, reviewBriefingLines,
  ADOPT_MARGIN, MIN_TRIALS, TRIAL_CAP, type RunOutcome,
} from "../src/mission/selfImprove";
import { composeBriefing } from "../src/mission/selfEvolveRuntime";
import { proposeSkills, mergeProposals, decideProposal, approvedSkillDefs } from "../src/mission/skillEvolution";
import { issueLearningReceipt, verifyLearningReceipt, canonicalDigestInput, sha256Hex } from "../src/mission/learningReceipt";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

const NOW = 1_760_000_000_000;

const baseInput: ReflectInput = {
  missionId: "m1",
  simulated: false,
  verified: true,
  failureClasses: ["AGENT_STARVATION", "REPEATED_FAILURE"],
  repairLadder: ["RETRY", "ISOLATE"],
  repaired: true,
  seatOutcomes: [
    { role: "coder", passed: true },
    { role: "coder", passed: true },
    { role: "reviewer", passed: true },
  ],
  now: NOW,
};

/** n attributed runs, `verifiedEvery` of them verified, for strategy id. */
function runsFor(id: string, n: number, verifiedEvery: number, simulated = false): RunOutcome[] {
  const out: RunOutcome[] = [];
  for (let i = 1; i <= n; i++) out.push({ verified: i % verifiedEvery === 0 || verifiedEvery === 1, simulated, strategyId: id });
  return out;
}

section("1. reflection is deterministic and measured-only");
{
  const a = reflectOnMission(baseInput);
  const b = reflectOnMission(baseInput);
  ok("same measured facts reflect to the same lesson texts", JSON.stringify(a.map((l) => l.text)) === JSON.stringify(b.map((l) => l.text)));
  ok("every lesson carries the evidence that produced it", a.every((l) => l.evidence.length > 0));
  ok("failure classes map to plain-language failure lessons", a.some((l) => l.kind === "failure" && l.text.includes("idle waiting")) && a.some((l) => l.text.includes("isolate the failing task")));
  ok("a working repair ladder becomes a success lesson", a.some((l) => l.kind === "success" && l.text.includes("RETRY -> ISOLATE")));
  ok("verified real execution yields a reuse lesson naming the reviewer seat", a.some((l) => l.text.includes("independent reviewer")));

  const sim = reflectOnMission({ ...baseInput, simulated: true, now: NOW });
  ok("a simulated run yields exactly one environment lesson", sim.length === 1 && sim[0].kind === "environment", JSON.stringify(sim));
  ok("a simulated run teaches nothing about real execution", sim.every((l) => !l.text.includes("repair") && !l.text.includes("verified")));

  const unverified = reflectOnMission({ ...baseInput, verified: false, now: NOW });
  ok("no verified-lesson without verification", !unverified.some((l) => l.text.includes("worth reusing") || l.text.includes("reviewer seat")));
}

section("2. memory dynamics — decay, reinforcement, retrieval");
{
  const fresh = reflectOnMission(baseInput);
  let mem = mergeLessons([], fresh, NOW);
  ok("fresh lessons land in memory", mem.length === fresh.length);
  const again = reflectOnMission({ ...baseInput, missionId: "m2", now: NOW + 1000 });
  mem = mergeLessons(mem, again, NOW + 1000);
  ok("identical text reinforces instead of duplicating", mem.length === fresh.length && mem.some((l) => l.useCount >= 1) && new Set(mem.map((l) => l.text)).size === mem.length);

  const day = 86_400_000;
  ok("strength decays with age", decayedStrength(mem[0], NOW + 10 * day) < mem[0].strength);

  const many: Lesson[] = [];
  for (let i = 0; i < 250; i++) {
    many.push({ id: `x${i}`, kind: "failure", text: `distinct lesson number ${i} about widgets`, sourceMissionId: "m", evidence: ["e"], strength: 1, createdAt: NOW, lastUsedAt: NOW, useCount: 0 });
  }
  ok(`memory respects the cap (${LESSON_CAP})`, mergeLessons([], many, NOW).length === LESSON_CAP);

  const goalMem: Lesson[] = [
    { id: "a", kind: "failure", text: "seats went idle waiting for inputs on the research fan-out", sourceMissionId: "m", evidence: ["e"], strength: 0.9, createdAt: NOW, lastUsedAt: NOW, useCount: 0 },
    { id: "b", kind: "success", text: "totally unrelated compiler toolchain advice", sourceMissionId: "m", evidence: ["e"], strength: 1, createdAt: NOW, lastUsedAt: NOW, useCount: 0 },
  ];
  const got = retrieveLessons(goalMem, "research fan-out inputs", 1, NOW);
  ok("retrieval ranks goal-overlap above raw strength", got[0]?.id === "a", JSON.stringify(got));
  ok("briefing lines are labelled org memory", lessonsForBriefing(goalMem, "research fan-out", NOW).every((s) => s.startsWith("[org memory] ")));
}

section("3. the strategy experiment is causal — attribution, trials, margin");
{
  const s0 = initialState(NOW);
  ok("baseline v1 adopted with no score", adoptedVersion(s0)?.gen === 1 && adoptedVersion(s0)?.score === null);

  const s1 = proposeVariation(s0, NOW);
  const cand = s1.versions.find((v) => v.status === "candidate");
  ok("one deterministic mutation from the adopted parent", !!cand && cand.parentId === "strategy-v1" && cand.params.reviewDepth === 2, JSON.stringify(cand?.params));
  ok("no second candidate while one waits", proposeVariation(s1, NOW).versions.filter((v) => v.status === "candidate").length === 1);

  ok("all-simulated runs score null — nothing observed", scoreRuns([{ verified: true, simulated: true, strategyId: "x" }]).score === null);
  const sc = scoreRuns([{ verified: true, simulated: false, strategyId: "x" }, { verified: false, simulated: false, strategyId: "x" }, { verified: true, simulated: true, strategyId: "x" }]);
  ok("score is verified-rate over REAL runs only", sc.score === 0.5 && sc.measured === 2, JSON.stringify(sc));

  // assignment interleaves the arms; ties go to the candidate so experiments gather data
  ok("fresh experiment assigns the candidate first", nextAssignment(s1, [])?.id === "strategy-v2");
  ok("after a candidate run the baseline gets the next run", nextAssignment(s1, runsFor("strategy-v2", 1, 1))?.id === "strategy-v1");
  ok("balanced arms send the next run back to the candidate", nextAssignment(s1, [...runsFor("strategy-v2", 1, 1), ...runsFor("strategy-v1", 1, 1)])?.id === "strategy-v2");

  // THE regression the 11.11.0 review caught: parent-governed runs must not credit the candidate.
  const parentPerfect = runsFor("strategy-v1", MIN_TRIALS, 1);
  const sNoCredit = settleCandidate(s1, parentPerfect, NOW);
  ok("candidate is NOT credited with runs executed under the parent", adoptedVersion(sNoCredit)?.id === "strategy-v1" && sNoCredit.versions.find((v) => v.id === "strategy-v2")?.status === "candidate", JSON.stringify(sNoCredit.versions.find((v) => v.id === "strategy-v2")?.note));
  ok("the baseline is measured on its own runs (never unmeasured again)", adoptedVersion(sNoCredit)?.score === 1 && adoptedVersion(sNoCredit)?.evaluatedOn === MIN_TRIALS, JSON.stringify(adoptedVersion(sNoCredit)));

  // below MIN_TRIALS on the candidate arm: even a perfect score waits
  const candTwo = [...runsFor("strategy-v1", MIN_TRIALS, 1), ...runsFor("strategy-v2", 2, 1)];
  const sWait = settleCandidate(s1, candTwo, NOW);
  ok(`candidate below ${MIN_TRIALS} measured runs waits even at 1.00`, sWait.versions.find((v) => v.id === "strategy-v2")?.status === "candidate" && adoptedVersion(sWait)?.id === "strategy-v1");

  // below MIN_TRIALS on the BASELINE arm: no free win over a weak baseline
  const baseOne = [...runsFor("strategy-v1", 1, 1), ...runsFor("strategy-v2", MIN_TRIALS, 1)];
  const sNoFree = settleCandidate(s1, baseOne, NOW);
  ok(`no adoption while the baseline has < ${MIN_TRIALS} measured runs`, sNoFree.versions.find((v) => v.id === "strategy-v2")?.status === "candidate");

  // both arms measured, strict margin: adopted
  const baseRuns = [{ verified: true, simulated: false, strategyId: "strategy-v1" }, { verified: true, simulated: false, strategyId: "strategy-v1" }, { verified: false, simulated: false, strategyId: "strategy-v1" }];
  const candRuns = runsFor("strategy-v2", 3, 1);
  const sWin = settleCandidate(s1, [...baseRuns, ...candRuns], NOW);
  ok("candidate beats baseline by a strict margin on OWN runs → adopted", adoptedVersion(sWin)?.id === "strategy-v2" && (adoptedVersion(sWin)?.score ?? 0) === 1, JSON.stringify(adoptedVersion(sWin)?.note));
  ok("the beaten baseline retires with the numbers that condemned it", sWin.versions.find((v) => v.id === "strategy-v1")?.status === "retired");

  // both arms measured, no margin: retired
  const s2 = proposeVariation(sWin, NOW);
  const cand2 = s2.versions.find((v) => v.status === "candidate");
  const noMargin = [
    ...runsFor("strategy-v3", 3, 1),
    ...runsFor("strategy-v2", 3, 1),
  ];
  const sTie = settleCandidate(s2, noMargin, NOW);
  ok(`1.00 vs 1.00 retires the candidate (margin ${ADOPT_MARGIN} required)`, cand2 && sTie.versions.find((v) => v.id === cand2.id)?.status === "retired");

  // simulated-only evidence: candidate waits, noted in writing
  const s3 = proposeVariation(sTie, NOW);
  const cand3 = s3.versions.find((v) => v.status === "candidate");
  const simsOnly: RunOutcome[] = [{ verified: true, simulated: true, strategyId: cand3?.id ?? "x" }];
  const sSim = settleCandidate(s3, simsOnly, NOW);
  const waitNote = sSim.versions.find((v) => v.id === cand3?.id)?.note ?? "";
  ok("simulated-only evidence leaves the candidate waiting, noted in writing", sSim.versions.find((v) => v.id === cand3?.id)?.status === "candidate" && /waiting|measured/.test(waitNote), waitNote);

  // trial cap: an experiment that cannot gather measured trials retires inconclusive
  const s4 = proposeVariation(sSim, NOW);
  const cand4 = s4.versions.find((v) => v.status === "candidate");
  const cappedRuns = [
    ...runsFor(cand4?.id ?? "c", TRIAL_CAP, 1, true), // all simulated → 0 measured at the cap
    ...runsFor("strategy-v1", MIN_TRIALS, 1),
  ];
  const sCap = settleCandidate(s4, cappedRuns, NOW);
  const capNote = sCap.versions.find((v) => v.id === cand4?.id)?.note ?? "";
  ok(`${TRIAL_CAP}-run cap without measured trials retires inconclusive`, sCap.versions.find((v) => v.id === cand4?.id)?.status === "retired" && /inconclusive/.test(capNote), capNote);

  // unattributed (pre-11.11.1) runs score for no arm
  const unattr: RunOutcome[] = Array.from({ length: 6 }, () => ({ verified: true, simulated: false, strategyId: null }));
  const s5 = initialState(NOW);
  const s5c = proposeVariation(s5, NOW);
  const sUn = settleCandidate(s5c, unattr, NOW);
  const armsUn = armScores(s5c, unattr);
  ok("unattributed runs are excluded from both arms", armsUn.baseline.measured === 0 && (armsUn.candidate?.measured ?? 0) === 0 && sUn.versions.find((v) => v.status === "candidate")?.status === "candidate");
}

section("4. strategy parameters actually govern the run");
{
  const seats = [
    { seatId: "a", wave: 0 }, { seatId: "b", wave: 0 }, { seatId: "c", wave: 1 },
  ];
  ok("serialExec flattens the wave plan to one seat per wave", strategyWaveShape(seats, true).every((w) => w.length === 1) && strategyWaveShape(seats, true).length === 3);
  ok("without serialExec waves group as planned", strategyWaveShape(seats, false).length === 2 && strategyWaveShape(seats, false)[0].length === 2);

  ok("checkBias maps to evidence depth 2..8", evidenceDepth(0) === 2 && evidenceDepth(1) === 8 && evidenceDepth(0.5) === 5 && evidenceDepth(0.25) >= 3);
  ok("reviewDepth 1 adds no review instruction", reviewBriefingLines(1).length === 0);
  ok("reviewDepth 2 instructs two independent review passes", reviewBriefingLines(2).length === 1 && reviewBriefingLines(2)[0].includes("two independent passes"));

  const lessons: Lesson[] = [
    { id: "a", kind: "failure", text: "fan-out starved the seats", sourceMissionId: "m", evidence: ["e"], strength: 1, createdAt: NOW, lastUsedAt: NOW, useCount: 0 },
    { id: "b", kind: "success", text: "reviewer caught the drift", sourceMissionId: "m", evidence: ["e"], strength: 1, createdAt: NOW, lastUsedAt: NOW, useCount: 0 },
    { id: "c", kind: "success", text: "third line of memory", sourceMissionId: "m", evidence: ["e"], strength: 1, createdAt: NOW, lastUsedAt: NOW, useCount: 0 },
  ];
  const P = (over: Partial<import("../src/mission/selfImprove").StrategyParams>) => ({ reviewDepth: 1, checkBias: 0.5, serialExec: false, lessonBudget: 3, mosaic: false, ...over });
  const tight = composeBriefing(lessons, ["[learned skill ★x] do the thing"], [], "fan-out", NOW, P({ lessonBudget: 1 }));
  const wide = composeBriefing(lessons, ["[learned skill ★x] do the thing"], [], "fan-out", NOW, P({ lessonBudget: 6 }));
  ok("lessonBudget of the GOVERNING strategy caps briefing lines", tight.length <= 3 && wide.length > tight.length, `${tight.length} vs ${wide.length}`);
  ok("approved learned skills ride in briefings", wide.some((l) => l.includes("[learned skill")));
  const withMosaic = composeBriefing(lessons, [], ["[causal memory] tried: X → recovered", "[belief contradicted] Y"], "fan-out", NOW, P({ mosaic: true, lessonBudget: 6 }));
  const withoutMosaic = composeBriefing(lessons, [], ["[causal memory] tried: X → recovered"], "fan-out", NOW, P({ lessonBudget: 6 }));
  ok("mosaic lines enter briefings only when the governing regime says so", withMosaic.some((l) => l.includes("[causal memory]")) && !withoutMosaic.some((l) => l.includes("[causal memory]")));
}

section("5. skills propose only from verified real runs");
{
  const good = proposeSkills({
    missionId: "m9", verified: true, simulated: false, now: NOW,
    tasks: [
      { role: "coder", label: "impl", passed: true },
      { role: "coder", label: "fix", passed: true },
      { role: "reviewer", label: "rev", passed: true },
    ],
    recurringFailureTexts: [],
  });
  ok("two passed coder tasks propose a coder pattern", good.some((p) => p.name === "coder-pattern" && p.status === "proposed"), JSON.stringify(good));

  const sim = proposeSkills({ missionId: "m9", verified: true, simulated: true, now: NOW, tasks: [{ role: "coder", label: "x", passed: true }, { role: "coder", label: "y", passed: true }], recurringFailureTexts: [] });
  ok("simulated runs propose nothing", sim.filter((p) => p.source === "verified-mission").length === 0);
  const unv = proposeSkills({ missionId: "m9", verified: false, simulated: false, now: NOW, tasks: [{ role: "coder", label: "x", passed: true }, { role: "coder", label: "y", passed: true }], recurringFailureTexts: [] });
  ok("unverified runs propose nothing", unv.filter((p) => p.source === "verified-mission").length === 0);

  const rec = proposeSkills({ missionId: "m9", verified: false, simulated: false, now: NOW, tasks: [], recurringFailureTexts: ["the same failure recurred over and over again"] });
  ok("three recurrences of one failure propose a countermeasure tool", rec.some((p) => p.source === "repeated-failure"));

  const approved = decideProposal(good, good[0].id, "approved");
  const defs = approvedSkillDefs(approved);
  ok("approved skills surface as library node defs naming their source mission", defs.length === 1 && defs[0].learnedFrom === "m9" && defs[0].label.startsWith("★"));
  ok("approved skills are procedural knowledge (node def + briefing line), not new tools", defs.every((d) => typeof d.description === "string" && d.description.length > 0));
  ok("merge never duplicates a proposal", mergeProposals(good, good).length === good.length);
}

section("6. learning receipts verify from zero state and catch tampering");
{
  const lessons = reflectOnMission(baseInput).map((l) => ({ id: l.id, kind: l.kind, text: l.text, evidence: l.evidence }));
  const r = await issueLearningReceipt({ mjVersion: "11.11.1", missionId: "m1", lessons, strategyChange: "strategy-v1 -> strategy-v2", now: NOW });
  ok("receipt digests lessons canonically", r.evidenceDigest.length === 64);
  const v = await verifyLearningReceipt(r);
  ok("an issued receipt verifies with zero MJ state", v.ok === true, v.reason);
  ok("runtime signs with Ed25519 when available", !!r.signature || !!r.signatureNote);
  const tampered = { ...r, lessons: [{ ...lessons[0], text: "altered lesson" }] };
  const tv = await verifyLearningReceipt(tampered);
  ok("tampered lessons fail verification", tv.ok === false && (tv.reason ?? "").includes("digest"));
  const d1 = await sha256Hex(canonicalDigestInput({ missionId: "m", lessons, strategyChange: null }));
  const shuffled = [...lessons].reverse();
  const d2 = await sha256Hex(canonicalDigestInput({ missionId: "m", lessons: shuffled, strategyChange: null }));
  ok("canonicalization is lesson-order stable", d1 === d2);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
