/**
 * MJ 11.11 SELF-EVOLVING — probe suite.
 *
 * Pins the self-evolution spine: reflection is deterministic and measured-only,
 * memory decays/reinforces/retrieves, the strategy loop adopts ONLY on measured
 * margin, skills propose ONLY from verified real runs, and learning receipts
 * verify from zero MJ state and catch tampering.
 */
import {
  reflectOnMission, mergeLessons, retrieveLessons, lessonsForBriefing, decayedStrength,
  LESSON_CAP, type Lesson, type ReflectInput,
} from "../src/mission/lessons";
import {
  initialState, proposeVariation, settleCandidate, scoreRuns, adoptedVersion,
  ADOPT_MARGIN, type RunOutcome,
} from "../src/mission/selfImprove";
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

section("3. the strategy loop adopts only on measured margin");
{
  const s0 = initialState(NOW);
  ok("baseline v1 adopted with no score", adoptedVersion(s0)?.gen === 1 && adoptedVersion(s0)?.score === null);

  const s1 = proposeVariation(s0, NOW);
  const cand = s1.versions.find((v) => v.status === "candidate");
  ok("one deterministic mutation from the adopted parent", !!cand && cand.parentId === "strategy-v1" && cand.params.reviewDepth === 2, JSON.stringify(cand?.params));
  const s1b = proposeVariation(s1, NOW);
  ok("no second candidate while one waits", s1b.versions.filter((v) => v.status === "candidate").length === 1);

  ok("all-simulated runs score null — nothing observed", scoreRuns([{ verified: true, simulated: true }]).score === null);
  const sc = scoreRuns([{ verified: true, simulated: false }, { verified: false, simulated: false }, { verified: true, simulated: true }]);
  ok("score is verified-rate over REAL runs only", sc.score === 0.5 && sc.measured === 2, JSON.stringify(sc));

  const realWins: RunOutcome[] = [{ verified: true, simulated: false }, { verified: true, simulated: false }];
  const s2 = settleCandidate(s1, realWins, NOW);
  ok("a measured 1.00 beats an unmeasured baseline and is adopted", adoptedVersion(s2)?.id === cand?.id && adoptedVersion(s2)?.score === 1, JSON.stringify(adoptedVersion(s2)?.note));
  ok("the beaten baseline retires", s2.versions.find((v) => v.id === "strategy-v1")?.status === "retired");

  const s3 = proposeVariation(s2, NOW);
  const cand2 = s3.versions.find((v) => v.status === "candidate");
  const close: RunOutcome[] = [{ verified: true, simulated: false }]; // 1.00 vs 1.00: no margin
  const s4 = settleCandidate(s3, close, NOW);
  ok(`adoption requires a strict ${ADOPT_MARGIN} margin`, cand2 && s4.versions.find((v) => v.id === cand2.id)?.status === "retired");

  const s5 = proposeVariation(s4, NOW);
  const simsOnly: RunOutcome[] = [{ verified: true, simulated: true }];
  const s6 = settleCandidate(s5, simsOnly, NOW);
  const wait = s6.versions.find((v) => v.status === "candidate");
  ok("simulated-only evidence leaves the candidate waiting, noted in writing", !!wait && (wait.note.includes("simulated")), wait?.note);
}

section("4. skills propose only from verified real runs");
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
  ok("merge never duplicates a proposal", mergeProposals(good, good).length === good.length);
}

section("5. learning receipts verify from zero state and catch tampering");
{
  const lessons = reflectOnMission(baseInput).map((l) => ({ id: l.id, kind: l.kind, text: l.text, evidence: l.evidence }));
  const r = await issueLearningReceipt({ mjVersion: "11.11.0", missionId: "m1", lessons, strategyChange: "strategy-v1 -> strategy-v2", now: NOW });
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
