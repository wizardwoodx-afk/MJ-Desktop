/**
 * §Team power probe (MJ 11.9.4-Major) — elastic seats + bandit router.
 *
 * Pins the two autonomy engines to their honesty rules:
 *   elastic: pure decisions from measured signals, hard caps, debugger before
 *            reviewer, scale-in only above minSeats, disabled means hold.
 *   bandit : one arm per dimension, untried-first exploration, simulated runs
 *            are experience-only (posteriors unmoved), the jump arm arms only
 *            on stagnation, the digest names rejected directions, seeding
 *            counts measured runs only.
 */
import {
  DEFAULT_ELASTIC_POLICY,
  planElasticScale,
  scaleEvent,
  type ScaleSignal,
} from "../src/mission/elasticSeats";
import {
  JUMP_ARM,
  JUMP_STREAK,
  emptyBandit,
  recordOutcome,
  selectArms,
  seedFromSeatStats,
  skillDigest,
  ucbScore,
  type ArmId,
} from "../src/mission/evolutionBandit";
import { settleAutonomyAfterRun } from "../src/mission/autonomyRuntime";
import { loadAutonomy, saveAutonomy } from "../src/mission/autonomyStore";
import { issueLicenseKey, rememberLicense, verifyLicenseKey } from "../src/mission/licensing";
import type { CliAgentTeam } from "../src/mission/agentTeam";

let pass = 0;
let fail = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (s: string) => console.log(`\n== ${s}`);

const neutral: ScaleSignal = {
  currentSeats: 4,
  writerSeats: 3,
  reviewerSeats: 1,
  debuggerSeats: 0,
  pendingTasks: 0,
  unreviewedArtifacts: 0,
  failedSeats: [],
  praisedSeats: [],
  idleRuns: 0,
};

section("1. elastic seats decide from measured signals only");
ok("disabled policy holds", planElasticScale({ ...neutral }, { ...DEFAULT_ELASTIC_POLICY, enabled: false }).kind === "hold", "");
const on = { ...DEFAULT_ELASTIC_POLICY, enabled: true };
ok("neutral signals hold", planElasticScale(neutral, on).kind === "hold", planElasticScale(neutral, on).kind);
ok("cap is hard", planElasticScale({ ...neutral, currentSeats: on.maxSeats, unreviewedArtifacts: 9 }, on).kind === "hold", "");
ok("failure streak summons a debugger", planElasticScale({ ...neutral, failedSeats: ["w1", "w2"] }, on).kind === "add-debugger", "");
ok("failure streak WITH a debugger falls through to review pressure", planElasticScale({ ...neutral, debuggerSeats: 1, failedSeats: ["w1", "w2"], unreviewedArtifacts: 4 }, on).kind === "add-reviewer", "");
ok("unreviewed artifacts against writers add a reviewer", planElasticScale({ ...neutral, unreviewedArtifacts: 3 }, on).kind === "add-reviewer", "");
ok("idle above min scales in", planElasticScale({ ...neutral, idleRuns: on.scaleInIdleRuns }, on).kind === "scale-in", "");
ok("idle AT min holds", planElasticScale({ ...neutral, currentSeats: on.minSeats, idleRuns: 9 }, on).kind === "hold", "");
ok("decisions are deterministic", JSON.stringify(planElasticScale({ ...neutral, unreviewedArtifacts: 3 }, on)) === JSON.stringify(planElasticScale({ ...neutral, unreviewedArtifacts: 3 }, on)), "");
ok("scale events carry team + timestamp", scaleEvent(planElasticScale({ ...neutral, unreviewedArtifacts: 3 }, on), "t1").kind === "SEAT_SCALED" && scaleEvent(planElasticScale(neutral, on), "t1").ts.length > 0, "");

section("2. the bandit router explores, exploits, and stays honest");
let b = emptyBandit();
const first = selectArms(b);
ok("first pick: one arm per dimension, no jump", first.length === 3 && !first.includes(JUMP_ARM), JSON.stringify(first));
ok("untried arms score infinite (try everything once)", Number.isFinite(ucbScore(b, "review:deep")) === false, "");

const simBefore = JSON.stringify(b.arms);
b = recordOutcome(b, first, true, true);
ok("a simulated run moves NO posterior", JSON.stringify(b.arms) === simBefore, "");
ok("but it IS logged as experience", b.history.length === 1 && b.history[0].simulated === true, "");
ok("simulated run does not arm stagnation tricks", b.stagnationStreak === 0, String(b.stagnationStreak));

b = recordOutcome(b, first, true, false);
ok("a measured verified run updates pulls+alpha", first.every((id) => b.arms[id].pulls === 1 && b.arms[id].alpha === 2), JSON.stringify(b.arms[first[0]]));

let stagnated = b;
for (let i = 0; i < JUMP_STREAK; i++) stagnated = recordOutcome(stagnated, first, false, false);
ok("stagnation arms the jump arm", selectArms(stagnated).includes(JUMP_ARM), JSON.stringify(selectArms(stagnated)));
ok("a fresh best disarms it", !selectArms(recordOutcome(stagnated, first, true, false)).includes(JUMP_ARM), "");

let lopsided = emptyBandit();
for (let i = 0; i < 4; i++) lopsided = recordOutcome(lopsided, ["review:shallow", "exec:serial", "check:lenient"], false, false);
for (let i = 0; i < 4; i++) lopsided = recordOutcome(lopsided, ["review:deep", "exec:wave", "check:strict"], true, false);
const digest = skillDigest(lopsided);
ok("digest names the lead arm", /lead review:deep/.test(digest), digest);
ok("digest names rejected directions", /rejected direction: review:shallow/.test(digest), digest);
ok("digest reports the simulated-run exclusion when present", /excluded from posteriors/.test(skillDigest(recordOutcome(lopsided, first, true, true))), "");

section("3. seeding informs the prior WITHOUT pretending pulls");
const seeded = seedFromSeatStats(emptyBandit(), [{ runs: 10, verifiedRuns: 6, simulatedRuns: 4 }]);
const pulls = Object.values(seeded.arms).reduce((n, a) => n + a.pulls, 0);
ok("historical runs move NO pull counter (attribution honesty)", pulls === 0, String(pulls));
ok("but the prior mass shifts toward the measured verified share (jump arm stays neutral)", Object.entries(seeded.arms).filter(([id]) => id !== JUMP_ARM).every(([, a]) => a.alpha > 1 && a.alpha / (a.alpha + a.beta) > 0.5) && seeded.arms[JUMP_ARM].alpha === 1, JSON.stringify(seeded.arms["review:deep"]));
ok("prior mass is capped at 4 pseudo-observations per arm", Object.values(seeded.arms).every((a) => (a.alpha - 1) + (a.beta - 1) <= 4), JSON.stringify(seeded.arms["review:deep"]));
const seededSimOnly = seedFromSeatStats(emptyBandit(), [{ runs: 9, verifiedRuns: 9, simulatedRuns: 9 }]);
ok("simulated-only history informs nothing", Object.values(seededSimOnly.arms).every((a) => a.alpha === 1 && a.beta === 1), "");

section("4. the autonomy settlement is wired and mode-gated");
void (async () => {
// The Commercial gate is real: AUTONOMOUS needs Pro. Issue + remember a key first.
const proKey = await issueLicenseKey({ edition: "pro", org: "probe", issued: new Date().toISOString(), expires: null, maxSeats: 25 });
const proCheck = await verifyLicenseKey(proKey);
if (proCheck.ok) rememberLicense(proCheck.payload);
const mkTeam = (): CliAgentTeam => ({
  id: "t1",
  name: "T",
  description: "",
  seats: [{ id: "w1", role: "coder", harness: "hermes", model: null, mayWrite: true, timeoutSecs: 600, maxTurns: null, instructions: "x" }],
});
saveAutonomy({ bandit: emptyBandit(), elastic: { ...DEFAULT_ELASTIC_POLICY, enabled: true, failStreak: 1 }, log: [], idleRuns: 0, recentFailed: [] });
const failingRun = {
  status: "completed",
  seats: [{ seatId: "w1", role: "coder", outcome: "failed", verified: false }],
  autonomyArms: ["review:deep", "exec:serial", "check:strict"] as ArmId[],
  reviewedBySnapshot: false,
};
const settledAuto = settleAutonomyAfterRun({ team: mkTeam(), report: failingRun, mode: "AUTONOMOUS", simulated: false });
ok("settle records the run's arms on the shared bandit", settledAuto.bandit.arms["review:deep"].pulls === 1 && settledAuto.bandit.arms["review:deep"].beta === 2, JSON.stringify(settledAuto.bandit.arms["review:deep"]));
ok("a failing measured run applies a debugger seat in AUTONOMOUS", settledAuto.applied === true && settledAuto.updatedTeam !== null && settledAuto.updatedTeam.seats.length === 2 && settledAuto.updatedTeam.seats[1].role === "debugger", JSON.stringify(settledAuto.action));
ok("elastic seats inherit the team's harness — never a vendor default (11.9.4-Redesign fix)", settledAuto.updatedTeam !== null && settledAuto.updatedTeam.seats[1].harness === "hermes", JSON.stringify(settledAuto.updatedTeam?.seats[1].harness));
ok("the settlement lands in the shared store log", loadAutonomy().log.length === 1 && loadAutonomy().log[0].arms.length === 3, String(loadAutonomy().log.length));
ok("the failure streak persists for the next signal", loadAutonomy().recentFailed.includes("w1"), JSON.stringify(loadAutonomy().recentFailed));

saveAutonomy({ bandit: emptyBandit(), elastic: { ...DEFAULT_ELASTIC_POLICY, enabled: true, failStreak: 1 }, log: [], idleRuns: 0, recentFailed: [] });
const settledSuggest = settleAutonomyAfterRun({ team: mkTeam(), report: failingRun, mode: "SUGGEST", simulated: false });
ok("SUGGEST mode records a suggestion, never mutates the team", settledSuggest.applied === false && settledSuggest.updatedTeam === null && settledSuggest.suggestion !== null, JSON.stringify(settledSuggest.action));

saveAutonomy({ bandit: emptyBandit(), elastic: { ...DEFAULT_ELASTIC_POLICY, enabled: true }, log: [], idleRuns: 0, recentFailed: [] });
const settledSim = settleAutonomyAfterRun({ team: mkTeam(), report: { ...failingRun }, mode: "AUTONOMOUS", simulated: true });
ok("simulated settlements update NO posterior", settledSim.bandit.arms["review:deep"].pulls === 0, JSON.stringify(settledSim.bandit.arms["review:deep"]));
ok("simulated settlements are still logged as experience", loadAutonomy().log[0].simulated === true, "");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
})();
