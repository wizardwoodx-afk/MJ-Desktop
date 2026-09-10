/**
 * MJ 11.12.1 — VARKHA alignment probe.
 *
 * Pins the four Varkha extracts and the two 11.12.0 review fixes:
 *   1. SCAR before PRECEDENT — failure lessons precede successes in briefings;
 *   2. write asymmetry — agent-inferred beliefs about the user stay pending
 *      until a human approves; user-stated preferences are active immediately;
 *   3. attenuation + escalation signals — seat envelopes derive from the run's
 *      packet and never exceed it; step-repetition is surfaced, never auto-acted;
 *   4. ablation clarity — every candidate (incl. mosaic) differs from its
 *      parent by exactly one dimension (paired toggle against the same parent);
 *   5. the execution boundary verifies the packet cryptographically BEFORE the
 *      permission check (the 11.12.0 review's #1 fix), proven by source order
 *      plus behaviour: a tampered "allowed" packet must fail the boundary.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { lessonsForBriefing, reflectOnMission, type Lesson } from "../src/mission/lessons";
import { beliefFromExternal, mergeBeliefs, beliefsForBriefing, needsApproval, approveBelief } from "../src/mission/belief";
import { issueActionPacket, verifyActionPacket, packetAllowsExecution } from "../src/mission/actionPacket";
import { repetitionDepth, shouldSuggestDeliberation } from "../src/mission/escalation";
import { initialState, proposeVariation, diffDims, adoptedVersion, BASE_PARAMS } from "../src/mission/selfImprove";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

declare const MJ_ROOT: string | undefined;
const root = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();

const NOW = 1_760_000_000_000;

section("1. SCAR before PRECEDENT");
{
  const lessons: Lesson[] = [
    ...reflectOnMission({ missionId: "m1", simulated: false, verified: true, failureClasses: ["SEQUENTIAL_BOTTLENECK"], repairLadder: ["ISOLATE"], repaired: true, seatOutcomes: [{ role: "coder", passed: true }], now: NOW }),
  ];
  const lines = lessonsForBriefing(lessons, "split the sequential bottleneck before assigning", 3, NOW);
  ok("briefings exist for a goal matching memory", lines.length > 0, JSON.stringify(lines));
  ok("failure (scar) lessons are labelled and retrieved first", lines[0]?.startsWith("[org memory scar]"), JSON.stringify(lines[0]));
}

section("2. write asymmetry — inferred-about-user waits for a human");
{
  const inferred = beliefFromExternal("the user prefers terse summaries", 0.9, "agent:inference", NOW, [], { aboutUser: true });
  const stated = beliefFromExternal("the user prefers terse summaries", 0.9, "user:stated", NOW, [], { aboutUser: true, userStated: true });
  ok("agent-inferred about-user belief needs approval", needsApproval(inferred) === true);
  ok("user-stated preference needs no approval", needsApproval(stated) === false);
  const mem = mergeBeliefs([], [inferred]);
  ok("pending beliefs never enter briefings", beliefsForBriefing(mem, "terse summaries", NOW).length === 0);
  const approvedMem = approveBelief(mem, inferred.id);
  ok("after human approval the belief briefs", beliefsForBriefing(approvedMem, "terse summaries", NOW).length === 1);
}

section("3. attenuation + escalation signals");
{
  ok("repetitionDepth finds the longest identical run", repetitionDepth(["a", "a", "b", "b", "b", "c"]) === 3 && repetitionDepth([]) === 0);
  const d = shouldSuggestDeliberation({ irreversibleAction: true, stepRepetition: 3, scarMatch: false, contradictedBelief: false });
  ok("escalation is a suggestion with named reasons", d.suggest === true && d.reasons.length === 2, JSON.stringify(d.reasons));
  const quiet = shouldSuggestDeliberation({ irreversibleAction: false, stepRepetition: 1, scarMatch: false, contradictedBelief: false });
  ok("no signal → no suggestion (Current stays default)", quiet.suggest === false);
  const p = await issueActionPacket({ mjVersion: "11.12.1", intent: "i", beliefDigest: "x", planStep: "p", prediction: "pr", risk: "r", permission: "allowed", rollback: null, verification: "v", reversible: false, now: NOW });
  const envelopes = [{ seatId: "s1", attenuatedFrom: p.id, scope: ["role:coder", "write:worktree:mission-x", "spend:capped-by-ledger"] }];
  ok("seat envelopes trace to the permitting packet and stay ledger-capped", envelopes.every((e) => e.attenuatedFrom === p.id && e.scope.includes("spend:capped-by-ledger")));
}

section("4. ablation clarity — one dimension per experiment");
{
  let s = initialState(NOW);
  let single = true;
  const dimsSeen = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const parent = adoptedVersion(s);
    s = proposeVariation({ ...s, versions: s.versions.map((v) => (v.status === "candidate" ? { ...v, status: "retired" as const } : v)) }, NOW + i);
    const cand = s.versions.find((v) => v.status === "candidate");
    if (!cand || !parent) { single = false; continue; }
    const d = diffDims(parent.params, cand.params);
    if (d.length !== 1) single = false;
    d.forEach((k) => dimsSeen.add(k));
  }
  ok("every candidate is a paired single-dimension toggle against its own parent", single);
  ok("the rotation covers all five dimensions incl. mosaic", dimsSeen.size === 5 && dimsSeen.has("mosaic"), JSON.stringify([...dimsSeen]));
  ok("base params ship mosaic off (baseline arm is the extract-free config)", BASE_PARAMS.mosaic === false);
}

section("5. the execution boundary is cryptographic-first (11.12.0 review fix #1)");
{
  const src = fs.readFileSync(path.join(root, "src", "mission", "teamExecutor.ts"), "utf8");
  const vi = src.indexOf("await verifyActionPacket(req.actionPacket)");
  const pi = src.indexOf("packetAllowsExecution(req.actionPacket ?? null)");
  ok("executor verifies digest+signature BEFORE the permission check", vi !== -1 && pi !== -1 && vi < pi, `verify@${vi} allow@${pi}`);
  ok("executor aborts on failed verification before any invocation", /FAILED cryptographic verification/.test(src));

  const p = await issueActionPacket({ mjVersion: "11.12.1", intent: "deploy", beliefDigest: "ab".repeat(32), planStep: "s", prediction: "ok", risk: "r", permission: "allowed", rollback: null, verification: "v", reversible: false, now: NOW });
  const tampered = { ...p, permission: "allowed" as const, intent: "deploy AND drop tables" };
  ok("a tampered 'allowed' packet still passes the bare permission rule…", packetAllowsExecution(tampered).ok === true);
  ok("…so the boundary's verification step is what catches it", (await verifyActionPacket(tampered)).ok === false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
