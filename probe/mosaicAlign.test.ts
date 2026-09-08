/**
 * MJ 11.12 MOSAIC-Ω alignment — probe suite.
 *
 * Pins the two audit rules and the new mechanisms:
 *   R1 predictions are not evidence — external claims cap at "probably",
 *      predictions are labelled in briefings, and no belief ever enters a
 *      lesson's evidence or a receipt's measured facts;
 *   R2 proof-carrying actions — packets verify, tampering fails, and the
 *      mechanical execution rule blocks refused or irreversible-without-
 *      allowed actions before anything runs;
 * plus causal memory edges and the mosaic regime dimension rotating through
 * the strategy experiment (so the extract measures itself).
 */
import {
  beliefFromExternal, beliefFromMeasured, predictionBelief, mergeBeliefs,
  beliefsForBriefing, classForExternal, classForMeasured,
} from "../src/mission/belief";
import { issueActionPacket, verifyActionPacket, packetAllowsExecution } from "../src/mission/actionPacket";
import { reflectOnMission, retrieveCausal, type ReflectInput } from "../src/mission/lessons";
import { initialState, proposeVariation, BASE_PARAMS, type ImprovementState } from "../src/mission/selfImprove";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

const NOW = 1_760_000_000_000;

section("1. R1 — predictions are not evidence");
{
  ok("external confidence 0.99 still caps at 'probably'", classForExternal(0.99) === "probably");
  ok("external confidence 0.5 is 'uncertain', 0.1 'unknown'", classForExternal(0.5) === "uncertain" && classForExternal(0.1) === "unknown");
  ok("measured+verified may be 'known'; measured+unverified stays 'uncertain'", classForMeasured(true, 0.9) === "known" && classForMeasured(false, 1) === "uncertain");

  const mem = mergeBeliefs([], [
    beliefFromExternal("library X supports protocol Y", 0.9, "web:docs", NOW),
    predictionBelief("running the team will verify", "simulator", NOW),
  ]);
  const lines = beliefsForBriefing(mem, "library X protocol Y", NOW);
  ok("predictions surface in briefings labelled as NOT evidence", lines.some((l) => l.startsWith("[prediction — NOT evidence]")), JSON.stringify(lines));
  ok("external claims never briefed as known", !lines.some((l) => l.includes("[belief known]")));

  const contradicted = mergeBeliefs(
    [beliefFromMeasured("the gate policy is STRICT", true, 1, "run:m1", NOW)],
    [beliefFromExternal("the gate policy is lenient", 0.9, "web:rumor", NOW)],
  );
  ok("conflicting sources mark the belief contradicted", contradicted.some((b) => b.klass === "contradicted"), JSON.stringify(contradicted.map((b) => b.klass)));
  ok("contradictions surface with a verify-before-acting warning", beliefsForBriefing(contradicted, "gate policy", NOW).some((l) => l.includes("[belief contradicted]")));

  const baseInput: ReflectInput = {
    missionId: "m1", simulated: false, verified: true,
    failureClasses: ["REPEATED_FAILURE"], repairLadder: ["RETRY"], repaired: true,
    seatOutcomes: [{ role: "reviewer", passed: true }], now: NOW,
  };
  const lessons = reflectOnMission(baseInput);
  ok("lessons carry only measured evidence — no prediction text leaks in", lessons.every((l) => l.evidence.every((e) => !e.includes("prediction"))));
}

section("2. R2 — proof-carrying actions");
{
  const p = await issueActionPacket({
    mjVersion: "11.12.0", intent: "run the team", beliefDigest: "ab".repeat(32),
    planStep: "mission-1", prediction: "gate verifies", risk: "ledger capped",
    permission: "allowed", rollback: "worktrees isolated", verification: "gate verdict",
    reversible: false, now: NOW,
  });
  ok("an issued packet verifies with zero MJ state", (await verifyActionPacket(p)).ok === true);
  const tampered = { ...p, prediction: "something will surely go right" };
  const tv = await verifyActionPacket(tampered);
  ok("altering a prediction after signing fails verification", tv.ok === false && (tv.reason ?? "").includes("digest"), tv.reason);

  ok("no packet → run proceeds under gate policy alone (pre-11.12 callers)", packetAllowsExecution(null).ok === true);
  ok("refused packet blocks execution", packetAllowsExecution({ ...p, permission: "refused" }).ok === false);
  ok("irreversible + requires-human blocks execution", packetAllowsExecution({ ...p, permission: "requires-human" }).ok === false);
  ok("irreversible + allowed executes", packetAllowsExecution(p).ok === true);
  ok("reversible + requires-human executes (undoable actions may proceed)", packetAllowsExecution({ ...p, reversible: true, permission: "requires-human" }).ok === true);
}

section("3. causal memory — tried-X-under-conditions retrieval");
{
  const lessons = reflectOnMission({
    missionId: "m2", simulated: false, verified: true,
    failureClasses: ["SEQUENTIAL_BOTTLENECK"], repairLadder: ["ISOLATE", "RETRY"], repaired: true,
    seatOutcomes: [{ role: "coder", passed: true }, { role: "reviewer", passed: true }], now: NOW,
  });
  ok("reflected lessons carry causal edges", lessons.every((l) => !!l.causal), JSON.stringify(lessons.map((l) => l.causal)));
  const hit = retrieveCausal(lessons, "isolate the bottleneck then retry", 3, NOW);
  ok("causal retrieval answers 'what happened when we tried X'", hit.length > 0 && (hit[0].causal?.action ?? "").includes("ISOLATE"), JSON.stringify(hit.map((h) => h.causal)));
  ok("unrelated conditions retrieve nothing (no similarity bleed)", retrieveCausal(lessons, "kubernetes ingress tuning", 3, NOW).length === 0);
}

section("4. the mosaic regime dimension rotates through the experiment");
{
  const strip = (s: ImprovementState): ImprovementState => ({
    ...s,
    versions: s.versions.map((v) => (v.status === "candidate" ? { ...v, status: "retired" as const } : v)),
  });
  let s = initialState(NOW);
  const mutated: Array<keyof typeof BASE_PARAMS> = [];
  for (let i = 0; i < 5; i++) {
    const before = s.versions.find((v) => v.status === "adopted")?.params ?? BASE_PARAMS;
    s = proposeVariation(strip(s), NOW + i);
    const cand = s.versions.find((v) => v.status === "candidate");
    if (!cand) { mutated.push("reviewDepth"); continue; }
    for (const k of Object.keys(BASE_PARAMS) as Array<keyof typeof BASE_PARAMS>) {
      if (JSON.stringify(cand.params[k]) !== JSON.stringify(before[k])) mutated.push(k);
    }
  }
  ok("five generations rotate five dimensions incl. mosaic", new Set(mutated).size === 5 && mutated.includes("mosaic"), JSON.stringify(mutated));
  ok("mosaic flips from the shipped default", (s.versions.find((v) => v.gen === 6)?.params.mosaic ?? false) === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
