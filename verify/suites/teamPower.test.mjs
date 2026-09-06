import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/mission/elasticSeats.ts
var DEFAULT_ELASTIC_POLICY = {
  enabled: false,
  minSeats: 2,
  maxSeats: 9,
  unreviewedRatio: 1,
  failStreak: 2,
  scaleInIdleRuns: 3
};
function planElasticScale(s, p = DEFAULT_ELASTIC_POLICY) {
  if (!p.enabled) return { kind: "hold", reason: "elastic seats disabled" };
  if (s.currentSeats >= p.maxSeats) {
    return { kind: "hold", reason: `at maxSeats (${p.maxSeats}) \u2014 cap is hard` };
  }
  const failWindow = s.failedSeats.slice(-p.failStreak);
  if (failWindow.length >= p.failStreak) {
    if (s.debuggerSeats === 0) {
      return {
        kind: "add-debugger",
        reason: `${failWindow.length} consecutive failed seats (${failWindow.join(", ")}) with no debugger on the team`
      };
    }
  }
  const reviewPressure = s.unreviewedArtifacts >= Math.max(1, s.writerSeats) * p.unreviewedRatio;
  if (reviewPressure && s.unreviewedArtifacts > 0) {
    return {
      kind: "add-reviewer",
      reason: `${s.unreviewedArtifacts} unreviewed artifact(s) against ${s.writerSeats} writer seat(s) \u2014 reviewers are the bottleneck`
    };
  }
  if (s.pendingTasks === 0 && s.unreviewedArtifacts === 0 && s.idleRuns >= p.scaleInIdleRuns) {
    if (s.currentSeats > p.minSeats) {
      const spare = s.currentSeats - p.minSeats;
      return {
        kind: "scale-in",
        reason: `${s.idleRuns} idle run(s) and nothing queued \u2014 release ${Math.min(1, spare)} seat(s), keep \u2265 minSeats (${p.minSeats}), praised seats untouched`
      };
    }
    return { kind: "hold", reason: "idle but already at minSeats" };
  }
  return { kind: "hold", reason: "signals within band \u2014 no scaling needed" };
}
function scaleEvent(action, teamId) {
  return { kind: "SEAT_SCALED", teamId, action, ts: (/* @__PURE__ */ new Date()).toISOString() };
}

// src/mission/evolutionBandit.ts
var DIMENSIONS = {
  review: ["review:shallow", "review:standard", "review:deep"],
  exec: ["exec:serial", "exec:wave"],
  check: ["check:lenient", "check:strict"]
};
var JUMP_ARM = "jump:structural";
var JUMP_STREAK = 3;
function emptyBandit() {
  const arms = {};
  for (const list of Object.values(DIMENSIONS)) for (const id of list) arms[id] = { alpha: 1, beta: 1, pulls: 0 };
  arms[JUMP_ARM] = { alpha: 1, beta: 1, pulls: 0 };
  return { arms, totalPulls: 0, stagnationStreak: 0, bestVerifiedShare: null, history: [] };
}
var mean = (a) => a.alpha / (a.alpha + a.beta);
function ucbScore(s, id) {
  const a = s.arms[id];
  if (a.pulls === 0) return Number.POSITIVE_INFINITY;
  return mean(a) + Math.sqrt(2 * Math.log(Math.max(2, s.totalPulls)) / a.pulls);
}
function selectArms(s) {
  const picked = [];
  for (const list of Object.values(DIMENSIONS)) {
    let best = list[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const id of list) {
      const sc = ucbScore(s, id);
      if (sc > bestScore) {
        bestScore = sc;
        best = id;
      }
    }
    picked.push(best);
  }
  if (s.stagnationStreak >= JUMP_STREAK) picked.push(JUMP_ARM);
  return picked;
}
function recordOutcome(s, arms, verified, simulated) {
  const entry = { ts: (/* @__PURE__ */ new Date()).toISOString(), arms, verified, simulated };
  const history = [...s.history.slice(-49), entry];
  if (simulated) {
    return { ...s, history };
  }
  const armsNext = { ...s.arms };
  for (const id of arms) {
    const a = armsNext[id];
    armsNext[id] = { alpha: a.alpha + (verified ? 1 : 0), beta: a.beta + (verified ? 0 : 1), pulls: a.pulls + 1 };
  }
  const totalPulls = s.totalPulls + 1;
  const share = arms.length > 0 ? verified ? 1 : 0 : 0;
  return {
    arms: armsNext,
    totalPulls,
    stagnationStreak: verified ? 0 : s.stagnationStreak + 1,
    bestVerifiedShare: s.bestVerifiedShare === null ? share : Math.max(s.bestVerifiedShare, share),
    history
  };
}
function seedFromSeatStats(s, stats) {
  const armsNext = { ...s.arms };
  let real = 0;
  let ver = 0;
  for (const st of stats) {
    const realHere = Math.max(0, st.runs - st.simulatedRuns);
    real += realHere;
    ver += Math.min(st.verifiedRuns, realHere);
  }
  const mass = Math.min(4, Math.floor(real / 2));
  const vMass = mass > 0 ? Math.round(mass * (ver / Math.max(1, real))) : 0;
  if (mass > 0) {
    for (const list of Object.values(DIMENSIONS)) {
      for (const id of list) {
        const a = armsNext[id];
        armsNext[id] = { alpha: a.alpha + vMass, beta: a.beta + (mass - vMass), pulls: a.pulls };
      }
    }
  }
  return { ...s, arms: armsNext };
}
function skillDigest(s) {
  const lines = [];
  lines.push(`incumbent best verified run: ${s.bestVerifiedShare === null ? "none measured yet" : s.bestVerifiedShare === 1 ? "yes" : "no"}; ${s.totalPulls} measured pull(s)`);
  for (const [dim, list] of Object.entries(DIMENSIONS)) {
    const ranked = [...list].sort((a, b2) => mean(s.arms[b2]) - mean(s.arms[a]));
    const top = ranked[0];
    lines.push(`${dim}: lead ${top} (mean ${mean(s.arms[top]).toFixed(2)}, ${s.arms[top].pulls} pulls)`);
    for (const id of ranked.slice(1)) {
      const a = s.arms[id];
      if (a.pulls >= 3 && mean(a) < 0.4) lines.push(`  rejected direction: ${id} (mean ${mean(a).toFixed(2)} over ${a.pulls} pulls)`);
    }
  }
  lines.push(
    s.stagnationStreak >= JUMP_STREAK ? `stagnation ${s.stagnationStreak} run(s) \u2014 structural-jump arm ARMED` : `stagnation ${s.stagnationStreak}/${JUMP_STREAK} \u2014 jump arm disarmed`
  );
  const sim = s.history.filter((h) => h.simulated).length;
  if (sim > 0) lines.push(`note: ${sim} simulated run(s) logged as experience, excluded from posteriors`);
  return lines.join("\n");
}

// src/app/id.ts
var n = 0;
function uid(prefix) {
  n += 1;
  return `${prefix}-${Date.now().toString(36)}-${n.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// src/mission/autonomyStore.ts
var KEY = "mj.autonomy.v1";
var memory = null;
function loadAutonomy() {
  if (memory) return memory;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    memory = {
      bandit: raw?.bandit && raw.bandit.arms ? raw.bandit : emptyBandit(),
      elastic: { ...DEFAULT_ELASTIC_POLICY, ...raw?.elastic ?? {} },
      log: Array.isArray(raw?.log) ? raw.log.slice(-20) : [],
      idleRuns: typeof raw?.idleRuns === "number" ? raw.idleRuns : 0,
      recentFailed: Array.isArray(raw?.recentFailed) ? raw.recentFailed.slice(-4) : []
    };
    return memory;
  } catch {
    memory = { bandit: emptyBandit(), elastic: { ...DEFAULT_ELASTIC_POLICY }, log: [], idleRuns: 0, recentFailed: [] };
    return memory;
  }
}
function saveAutonomy(next) {
  memory = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
  }
}

// src/mission/autonomyRuntime.ts
var REVIEW_ROLES = /* @__PURE__ */ new Set(["reviewer", "tester", "security"]);
var FAILED_OUTCOMES = /* @__PURE__ */ new Set(["failed", "timeout"]);
function newSeat(role, reason) {
  return {
    id: uid("seat"),
    role,
    harness: "hermes",
    model: null,
    mayWrite: false,
    timeoutSecs: 600,
    maxTurns: null,
    instructions: role === "reviewer" ? `Added by elastic seats: ${reason}. Diff-only review \u2014 block on correctness, nits last and labelled.` : `Added by elastic seats: ${reason}. Reproduce, isolate, fix, and prove with a re-run of the failing case.`
  };
}
function settleAutonomyAfterRun(args) {
  const { team, report, mode, simulated } = args;
  const state = loadAutonomy();
  const arms = report.autonomyArms ?? [];
  const verified = report.status === "completed" && report.seats.some((s) => s.verified);
  const bandit = arms.length > 0 ? recordOutcome(state.bandit, arms, verified, simulated) : state.bandit;
  const writers = report.seats.filter((s) => !REVIEW_ROLES.has(s.role));
  const reviewers = report.seats.filter((s) => REVIEW_ROLES.has(s.role));
  const failed = report.seats.filter((s) => FAILED_OUTCOMES.has(s.outcome)).map((s) => s.seatId);
  const committedWriters = writers.filter((s) => s.outcome === "completed").length;
  const unreviewedArtifacts = report.reviewedBySnapshot ? 0 : reviewers.length === 0 ? committedWriters : 0;
  const idle = report.seats.every((s) => s.outcome.startsWith("skipped") || s.outcome.startsWith("blocked"));
  const idleRuns = idle ? state.idleRuns + 1 : 0;
  const recentFailed = failed.length > 0 ? [...state.recentFailed, ...failed].slice(-4) : verified ? [] : state.recentFailed;
  const teamSeats = team.seats;
  const signal = {
    currentSeats: teamSeats.length,
    writerSeats: Math.max(1, teamSeats.filter((s) => s.mayWrite).length),
    reviewerSeats: teamSeats.filter((s) => REVIEW_ROLES.has(s.role)).length,
    debuggerSeats: teamSeats.filter((s) => s.role === "debugger").length,
    pendingTasks: 0,
    unreviewedArtifacts,
    failedSeats: recentFailed,
    praisedSeats: [],
    idleRuns
  };
  const action = planElasticScale(signal, state.elastic);
  let applied = false;
  let suggestion = null;
  let updatedTeam = null;
  if (action.kind === "add-reviewer" || action.kind === "add-debugger") {
    const seat = newSeat(action.kind === "add-reviewer" ? "reviewer" : "debugger", action.reason);
    if (mode === "AUTONOMOUS") {
      updatedTeam = { ...team, seats: [...team.seats, seat], updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      applied = true;
    } else if (mode === "SUGGEST") {
      suggestion = `${action.kind}: ${action.reason}`;
    }
  } else if (action.kind === "scale-in" && mode === "AUTONOMOUS") {
    suggestion = `scale-in: ${action.reason}`;
  }
  const entry = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    teamId: team.id,
    arms,
    verified,
    simulated,
    action,
    applied
  };
  saveAutonomy({ bandit, elastic: state.elastic, log: [...state.log.slice(-19), entry], idleRuns, recentFailed });
  return { arms, verified, simulated, action, applied, suggestion, updatedTeam, bandit, elastic: state.elastic };
}

// probe/teamPower.test.ts
var pass = 0;
var fail = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (s) => console.log(`
== ${s}`);
var neutral = {
  currentSeats: 4,
  writerSeats: 3,
  reviewerSeats: 1,
  debuggerSeats: 0,
  pendingTasks: 0,
  unreviewedArtifacts: 0,
  failedSeats: [],
  praisedSeats: [],
  idleRuns: 0
};
section("1. elastic seats decide from measured signals only");
ok("disabled policy holds", planElasticScale({ ...neutral }, { ...DEFAULT_ELASTIC_POLICY, enabled: false }).kind === "hold", "");
var on = { ...DEFAULT_ELASTIC_POLICY, enabled: true };
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
var b = emptyBandit();
var first = selectArms(b);
ok("first pick: one arm per dimension, no jump", first.length === 3 && !first.includes(JUMP_ARM), JSON.stringify(first));
ok("untried arms score infinite (try everything once)", Number.isFinite(ucbScore(b, "review:deep")) === false, "");
var simBefore = JSON.stringify(b.arms);
b = recordOutcome(b, first, true, true);
ok("a simulated run moves NO posterior", JSON.stringify(b.arms) === simBefore, "");
ok("but it IS logged as experience", b.history.length === 1 && b.history[0].simulated === true, "");
ok("simulated run does not arm stagnation tricks", b.stagnationStreak === 0, String(b.stagnationStreak));
b = recordOutcome(b, first, true, false);
ok("a measured verified run updates pulls+alpha", first.every((id) => b.arms[id].pulls === 1 && b.arms[id].alpha === 2), JSON.stringify(b.arms[first[0]]));
var stagnated = b;
for (let i = 0; i < JUMP_STREAK; i++) stagnated = recordOutcome(stagnated, first, false, false);
ok("stagnation arms the jump arm", selectArms(stagnated).includes(JUMP_ARM), JSON.stringify(selectArms(stagnated)));
ok("a fresh best disarms it", !selectArms(recordOutcome(stagnated, first, true, false)).includes(JUMP_ARM), "");
var lopsided = emptyBandit();
for (let i = 0; i < 4; i++) lopsided = recordOutcome(lopsided, ["review:shallow", "exec:serial", "check:lenient"], false, false);
for (let i = 0; i < 4; i++) lopsided = recordOutcome(lopsided, ["review:deep", "exec:wave", "check:strict"], true, false);
var digest = skillDigest(lopsided);
ok("digest names the lead arm", /lead review:deep/.test(digest), digest);
ok("digest names rejected directions", /rejected direction: review:shallow/.test(digest), digest);
ok("digest reports the simulated-run exclusion when present", /excluded from posteriors/.test(skillDigest(recordOutcome(lopsided, first, true, true))), "");
section("3. seeding informs the prior WITHOUT pretending pulls");
var seeded = seedFromSeatStats(emptyBandit(), [{ runs: 10, verifiedRuns: 6, simulatedRuns: 4 }]);
var pulls = Object.values(seeded.arms).reduce((n2, a) => n2 + a.pulls, 0);
ok("historical runs move NO pull counter (attribution honesty)", pulls === 0, String(pulls));
ok("but the prior mass shifts toward the measured verified share (jump arm stays neutral)", Object.entries(seeded.arms).filter(([id]) => id !== JUMP_ARM).every(([, a]) => a.alpha > 1 && a.alpha / (a.alpha + a.beta) > 0.5) && seeded.arms[JUMP_ARM].alpha === 1, JSON.stringify(seeded.arms["review:deep"]));
ok("prior mass is capped at 4 pseudo-observations per arm", Object.values(seeded.arms).every((a) => a.alpha - 1 + (a.beta - 1) <= 4), JSON.stringify(seeded.arms["review:deep"]));
var seededSimOnly = seedFromSeatStats(emptyBandit(), [{ runs: 9, verifiedRuns: 9, simulatedRuns: 9 }]);
ok("simulated-only history informs nothing", Object.values(seededSimOnly.arms).every((a) => a.alpha === 1 && a.beta === 1), "");
section("4. the autonomy settlement is wired and mode-gated");
var mkTeam = () => ({
  id: "t1",
  name: "T",
  description: "",
  seats: [{ id: "w1", role: "coder", harness: "hermes", model: null, mayWrite: true, timeoutSecs: 600, maxTurns: null, instructions: "x" }]
});
saveAutonomy({ bandit: emptyBandit(), elastic: { ...DEFAULT_ELASTIC_POLICY, enabled: true, failStreak: 1 }, log: [], idleRuns: 0, recentFailed: [] });
var failingRun = {
  status: "completed",
  seats: [{ seatId: "w1", role: "coder", outcome: "failed", verified: false }],
  autonomyArms: ["review:deep", "exec:serial", "check:strict"],
  reviewedBySnapshot: false
};
var settledAuto = settleAutonomyAfterRun({ team: mkTeam(), report: failingRun, mode: "AUTONOMOUS", simulated: false });
ok("settle records the run's arms on the shared bandit", settledAuto.bandit.arms["review:deep"].pulls === 1 && settledAuto.bandit.arms["review:deep"].beta === 2, JSON.stringify(settledAuto.bandit.arms["review:deep"]));
ok("a failing measured run applies a debugger seat in AUTONOMOUS", settledAuto.applied === true && settledAuto.updatedTeam !== null && settledAuto.updatedTeam.seats.length === 2 && settledAuto.updatedTeam.seats[1].role === "debugger", JSON.stringify(settledAuto.action));
ok("the settlement lands in the shared store log", loadAutonomy().log.length === 1 && loadAutonomy().log[0].arms.length === 3, String(loadAutonomy().log.length));
ok("the failure streak persists for the next signal", loadAutonomy().recentFailed.includes("w1"), JSON.stringify(loadAutonomy().recentFailed));
saveAutonomy({ bandit: emptyBandit(), elastic: { ...DEFAULT_ELASTIC_POLICY, enabled: true, failStreak: 1 }, log: [], idleRuns: 0, recentFailed: [] });
var settledSuggest = settleAutonomyAfterRun({ team: mkTeam(), report: failingRun, mode: "SUGGEST", simulated: false });
ok("SUGGEST mode records a suggestion, never mutates the team", settledSuggest.applied === false && settledSuggest.updatedTeam === null && settledSuggest.suggestion !== null, JSON.stringify(settledSuggest.action));
saveAutonomy({ bandit: emptyBandit(), elastic: { ...DEFAULT_ELASTIC_POLICY, enabled: true }, log: [], idleRuns: 0, recentFailed: [] });
var settledSim = settleAutonomyAfterRun({ team: mkTeam(), report: { ...failingRun }, mode: "AUTONOMOUS", simulated: true });
ok("simulated settlements update NO posterior", settledSim.bandit.arms["review:deep"].pulls === 0, JSON.stringify(settledSim.bandit.arms["review:deep"]));
ok("simulated settlements are still logged as experience", loadAutonomy().log[0].simulated === true, "");
console.log(`
${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
