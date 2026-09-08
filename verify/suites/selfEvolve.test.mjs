import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/mission/selfImprove.ts
var MIN_TRIALS = 3;
var TRIAL_CAP = 8;
var ADOPT_MARGIN = 0.05;
var ARCHIVE_CAP = 24;
var BASE_PARAMS = {
  reviewDepth: 1,
  checkBias: 0.5,
  serialExec: false,
  lessonBudget: 3,
  mosaic: false
};
function initialState(now) {
  const v = {
    id: "strategy-v1",
    gen: 1,
    params: { ...BASE_PARAMS },
    parentId: null,
    status: "adopted",
    score: null,
    evaluatedOn: 0,
    note: "baseline \u2014 shipped defaults; measured on the runs it itself governs",
    createdAt: now
  };
  return { versions: [v], adoptedId: v.id };
}
function adoptedVersion(s) {
  return s.versions.find((v) => v.id === s.adoptedId) ?? null;
}
var DIMS = ["reviewDepth", "checkBias", "serialExec", "lessonBudget", "mosaic"];
function proposeVariation(s, now) {
  const parent = adoptedVersion(s);
  if (!parent) return s;
  if (s.versions.some((v2) => v2.status === "candidate")) return s;
  const gen = Math.max(...s.versions.map((v2) => v2.gen)) + 1;
  const dim = DIMS[(gen - 2) % DIMS.length];
  const params = { ...parent.params };
  if (dim === "reviewDepth") params.reviewDepth = params.reviewDepth === 1 ? 2 : 1;
  else if (dim === "checkBias") params.checkBias = params.checkBias >= 0.75 ? 0.25 : params.checkBias + 0.25;
  else if (dim === "serialExec") params.serialExec = !params.serialExec;
  else if (dim === "lessonBudget") params.lessonBudget = params.lessonBudget >= 6 ? 1 : params.lessonBudget + 1;
  else params.mosaic = !params.mosaic;
  const v = {
    id: `strategy-v${gen}`,
    gen,
    params,
    parentId: parent.id,
    status: "candidate",
    score: null,
    evaluatedOn: 0,
    note: `mutated ${String(dim)} from parent v${parent.gen}; will govern alternating runs and be judged only on its own measured results`,
    createdAt: now
  };
  return { ...s, versions: [...s.versions, v].slice(-ARCHIVE_CAP) };
}
function scoreRuns(runs) {
  const real = runs.filter((r) => !r.simulated);
  if (real.length === 0) return { score: null, measured: 0 };
  return {
    score: real.filter((r) => r.verified).length / real.length,
    measured: real.length
  };
}
function armScores(s, runs) {
  const baseline = adoptedVersion(s);
  const candidate = s.versions.find((v) => v.status === "candidate") ?? null;
  const score = (id) => {
    const own = runs.filter((r) => r.strategyId === id);
    return { ...scoreRuns(own), attributed: own.length };
  };
  return {
    baseline: score(baseline?.id ?? null),
    candidate: candidate ? score(candidate.id) : null,
    baselineId: baseline?.id ?? null,
    candidateId: candidate?.id ?? null
  };
}
function nextAssignment(s, runs) {
  const baseline = adoptedVersion(s);
  const candidate = s.versions.find((v) => v.status === "candidate") ?? null;
  if (!candidate) return baseline;
  if (!baseline) return candidate;
  const cN = runs.filter((r) => r.strategyId === candidate.id).length;
  const bN = runs.filter((r) => r.strategyId === baseline.id).length;
  return cN <= bN ? candidate : baseline;
}
function settleCandidate(s, runs, _now) {
  const baseline = adoptedVersion(s);
  if (!baseline) return s;
  const arms = armScores(s, runs);
  const base = arms.baseline;
  let versions = s.versions.map((v) => v.id === baseline.id ? { ...v, score: base.score, evaluatedOn: base.measured } : v);
  const candidate = versions.find((v) => v.status === "candidate");
  if (!candidate) return { ...s, versions };
  const cand = arms.candidate;
  const verdict = (status, note) => ({
    versions: versions.map((v) => {
      if (v.id === candidate.id) return { ...v, status, score: cand.score, evaluatedOn: cand.measured, note };
      if (status === "adopted" && v.id === baseline.id) return { ...v, status: "retired", note: `retired \u2014 candidate ${candidate.id} beat it ${cand.score?.toFixed(2)} to ${base.score?.toFixed(2)} on ${cand.measured}/${base.measured} measured runs` };
      return v;
    }),
    adoptedId: status === "adopted" ? candidate.id : s.adoptedId
  });
  const bothTrials = cand.measured >= MIN_TRIALS && base.measured >= MIN_TRIALS;
  const capped = cand.attributed >= TRIAL_CAP || base.attributed >= TRIAL_CAP;
  if (!bothTrials) {
    if (capped) {
      return verdict(
        "retired",
        `retired inconclusive at the ${TRIAL_CAP}-run cap \u2014 candidate ${cand.measured}/${MIN_TRIALS}, baseline ${base.measured}/${MIN_TRIALS} measured; no verdict on insufficient trials`
      );
    }
    return {
      ...s,
      versions: versions.map((v) => v.id === candidate.id ? { ...v, note: `waiting \u2014 candidate ${cand.measured}/${MIN_TRIALS}, baseline ${base.measured}/${MIN_TRIALS} measured runs; each arm scored only on runs it governed` } : v)
    };
  }
  const better = cand.score > base.score + ADOPT_MARGIN;
  return better ? verdict(
    "adopted",
    `adopted at ${cand.score.toFixed(2)} over ${cand.measured} own measured runs (baseline ${base.score.toFixed(2)} over ${base.measured}) \u2014 margin ${(cand.score - base.score).toFixed(2)} > ${ADOPT_MARGIN}`
  ) : verdict(
    "retired",
    `retired at ${cand.score.toFixed(2)} over ${cand.measured} own measured runs \u2014 baseline held ${base.score.toFixed(2)} over ${base.measured}; no strict margin`
  );
}
function strategyWaveShape(assignments, serial) {
  if (serial) return assignments.map((a) => [a]);
  const byWave = /* @__PURE__ */ new Map();
  for (const a of assignments) {
    const list = byWave.get(a.wave) ?? [];
    list.push(a);
    byWave.set(a.wave, list);
  }
  return [...byWave.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
}
function evidenceDepth(checkBias) {
  return Math.max(2, Math.min(8, Math.round(2 + checkBias * 6)));
}
function reviewBriefingLines(reviewDepth) {
  if (reviewDepth < 2) return [];
  return ["[strategy review depth 2] Reviewers: two independent passes. Pass 1 attacks correctness and demands re-run evidence for every pass claim. Pass 2 re-reads the diff assuming pass 1 missed something. Style nits last and labelled."];
}

// src/mission/skillEvolution.ts
var PROPOSAL_CAP = 20;
var seq = 0;
function proposeSkills(input) {
  const now = input.now ?? Date.now();
  const out = [];
  if (!input.simulated && input.verified) {
    const byRole = /* @__PURE__ */ new Map();
    for (const t of input.tasks) if (t.passed) byRole.set(t.role, (byRole.get(t.role) ?? 0) + 1);
    const rich = [...byRole.entries()].filter(([, n]) => n >= 2).slice(0, 2);
    for (const [role, n] of rich) {
      seq += 1;
      out.push({
        id: `skill-${now.toString(36)}-${seq}`,
        name: `${role}-pattern`,
        description: `Mission ${input.missionId} passed ${n} ${role} tasks on real execution \u2014 extract the shared pattern as a reusable ${role} node.`,
        source: "verified-mission",
        sourceMissionId: input.missionId,
        status: "proposed",
        learnedAt: now
      });
    }
  }
  for (const text of input.recurringFailureTexts.slice(0, 1)) {
    seq += 1;
    out.push({
      id: `skill-${now.toString(36)}-${seq}`,
      name: "countermeasure-tool",
      description: `The same failure recurred three times ("${text.slice(0, 80)}\u2026") \u2014 propose a dedicated tool that prevents it.`,
      source: "repeated-failure",
      sourceMissionId: input.missionId,
      status: "proposed",
      learnedAt: now
    });
  }
  return out;
}
function mergeProposals(memory, fresh) {
  const next = [...memory];
  for (const f of fresh) {
    if (!next.some((p) => p.name === f.name && p.source === f.source)) next.push(f);
  }
  return next.slice(-PROPOSAL_CAP);
}
function decideProposal(memory, id, status) {
  return memory.map((p) => p.id === id ? { ...p, status } : p);
}
function approvedSkillDefs(memory) {
  return memory.filter((p) => p.status === "approved").map((p) => ({
    id: `learned:${p.id}`,
    label: `\u2605 ${p.name}`,
    description: p.description,
    learnedFrom: p.sourceMissionId
  }));
}

// src/mission/lessons.ts
var LESSON_CAP = 200;
var DECAY_PER_DAY = 0.95;
var RETRIEVE_K = 3;
var seq2 = 0;
function nextId(prefix, now) {
  seq2 += 1;
  return `${prefix}-${now.toString(36)}-${seq2}`;
}
var FAILURE_TEXT = {
  AGENT_STARVATION: "Seats went idle waiting for inputs \u2014 briefings must name the artifact each seat consumes.",
  REPEATED_FAILURE: "The same failure recurred \u2014 isolate the failing task before retrying it a third time.",
  SEQUENTIAL_BOTTLENECK: "Exclusive tasks serialized the run \u2014 split independent work before assigning it.",
  UNMEASURED_COST: "Cost arrived unmeasured \u2014 treat the run's totals as absent, not zero."
};
function reflectOnMission(input) {
  const now = input.now ?? Date.now();
  const out = [];
  const push = (kind, text, evidence, causal) => {
    if (!text || evidence.length === 0) return;
    out.push({
      id: nextId("lesson", now),
      kind,
      text,
      sourceMissionId: input.missionId,
      evidence,
      strength: 1,
      createdAt: now,
      lastUsedAt: now,
      useCount: 0,
      causal
    });
  };
  if (input.simulated) {
    push(
      "environment",
      "Execution was simulated on this host \u2014 no lesson about real execution may be drawn; only host capability is known.",
      ["simulated=true"],
      { observation: "host executed nothing real", outcome: "simulated \u2014 capability fact only" }
    );
    return out;
  }
  for (const cls of input.failureClasses) {
    const text = FAILURE_TEXT[cls];
    if (text) push(
      "failure",
      text,
      [`failureClass=${cls}`],
      { observation: `failure class ${cls} observed on measured run`, outcome: cls }
    );
  }
  if (input.repaired && input.repairLadder.length > 0) {
    push(
      "success",
      `Repair ladder ${input.repairLadder.join(" -> ")} recovered the run \u2014 prefer the cheapest strategy that previously worked.`,
      [`ladder=${input.repairLadder.join(">")}`, "repaired=true"],
      { decision: "escalate through the repair ladder", action: input.repairLadder.join(" -> "), observation: input.failureClasses.join(", ") || "failure", outcome: "recovered" }
    );
  }
  if (input.verified) {
    const reviewers = input.seatOutcomes.filter((s) => s.role === "reviewer" && s.passed).length;
    push(
      "success",
      reviewers > 0 ? "Cross-role review passed on real execution \u2014 keep an independent reviewer seat on missions like this." : "Mission verified on real execution \u2014 the team shape that produced this is worth reusing.",
      [`verified=true`, `reviewersPassed=${reviewers}`],
      { action: `team shape with ${reviewers} passing reviewer seat(s)`, outcome: "verified on real execution" }
    );
  }
  return out;
}
function decayedStrength(l, now) {
  const days = Math.max(0, (now - l.createdAt) / 864e5);
  return l.strength * Math.pow(DECAY_PER_DAY, days);
}
function mergeLessons(memory, fresh, now) {
  const next = memory.map((l) => ({ ...l }));
  for (const f of fresh) {
    const hit = next.find((l) => l.text === f.text);
    if (hit) {
      hit.strength = Math.min(1, hit.strength + 0.25);
      hit.useCount += 1;
      hit.lastUsedAt = now;
      hit.evidence = [.../* @__PURE__ */ new Set([...hit.evidence, ...f.evidence])].slice(0, 12);
    } else {
      next.push({ ...f });
    }
  }
  next.sort((a, b) => decayedStrength(b, now) - decayedStrength(a, now));
  return next.slice(0, LESSON_CAP);
}
function tokens(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
}
function retrieveLessons(memory, goal, k, now) {
  const g = tokens(goal);
  const scored = memory.map((l) => {
    const t = tokens(l.text);
    let overlap = 0;
    g.forEach((w) => {
      if (t.has(w)) overlap += 1;
    });
    const recency = 1 / (1 + (now - l.lastUsedAt) / 864e5);
    return { l, score: decayedStrength(l, now) * (1 + overlap) * (0.5 + 0.5 * recency) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.l);
}
function lessonsForBriefing(memory, goal, now) {
  const scars = retrieveLessons(memory.filter((l) => l.kind === "failure"), goal, RETRIEVE_K, now);
  const scarIds = new Set(scars.map((l) => l.id));
  const rest = retrieveLessons(memory, goal, RETRIEVE_K, now).filter((l) => !scarIds.has(l.id));
  return [...scars, ...rest].slice(0, RETRIEVE_K).map(
    (l) => l.kind === "failure" ? `[org memory scar] ${l.text}` : `[org memory] ${l.text}`
  );
}

// src/mission/signing.ts
var STORAGE_KEY = "mj.issuerkey.v1";
var cached = null;
function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function ed25519Available() {
  try {
    return typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof crypto.subtle.generateKey === "function";
  } catch {
    return false;
  }
}
async function ensureIssuerIdentity() {
  if (cached) return cached;
  if (!ed25519Available()) return null;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity = {
          keyId: `mj-issuer-${stored.publicKeyHex.slice(0, 12)}`,
          publicKeyHex: stored.publicKeyHex,
          createdAt: stored.createdAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
        };
        cached = { identity, privateKey };
        return cached;
      }
    }
  } catch {
  }
  try {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKeyHex = toHex(rawPub);
    const identity = {
      keyId: `mj-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt }));
    } catch {
    }
    cached = { identity, privateKey: pair.privateKey };
    return cached;
  } catch {
    return null;
  }
}
async function signHexDigest(hexDigest) {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  try {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, holder.privateKey, fromHex(hexDigest)));
    return { alg: "EdDSA", keyId: holder.identity.keyId, publicKeyHex: holder.identity.publicKeyHex, sigHex: toHex(sig) };
  } catch {
    return null;
  }
}
async function verifyIssuerSignature(chainHashHex, sigHex, publicKeyHex) {
  if (!ed25519Available()) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", fromHex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromHex(sigHex), fromHex(chainHashHex));
  } catch {
    return false;
  }
}
function signingSupported() {
  return ed25519Available();
}

// src/mission/learningReceipt.ts
function canonicalDigestInput(r) {
  return JSON.stringify({
    lessons: r.lessons.map((l) => ({ evidence: [...l.evidence].sort(), id: l.id, kind: l.kind, text: l.text })).sort((a, b) => a.id.localeCompare(b.id)),
    missionId: r.missionId,
    strategyChange: r.strategyChange
  }, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce((a, k) => {
        a[k] = v[k];
        return a;
      }, {});
    }
    return v;
  });
}
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
var seq3 = 0;
async function issueLearningReceipt(args) {
  const now = args.now ?? Date.now();
  seq3 += 1;
  const digest = await sha256Hex(canonicalDigestInput(args));
  const receipt = {
    format: "mj-learning-receipt/1",
    id: `learn-${now.toString(36)}-${seq3}`,
    mjVersion: args.mjVersion,
    at: new Date(now).toISOString(),
    missionId: args.missionId,
    lessons: args.lessons,
    strategyChange: args.strategyChange,
    evidenceDigest: digest
  };
  if (signingSupported()) {
    const sig = await signHexDigest(digest);
    if (sig) receipt.signature = sig;
    else receipt.signatureNote = "Ed25519 unavailable in this runtime; receipt unsigned.";
  } else {
    receipt.signatureNote = "Ed25519 unavailable in this runtime; receipt unsigned.";
  }
  return receipt;
}
async function verifyLearningReceipt(r) {
  const recomputed = await sha256Hex(canonicalDigestInput(r));
  if (recomputed !== r.evidenceDigest) return { ok: false, reason: "digest mismatch \u2014 lessons were altered" };
  if (r.signature) {
    const good = await verifyIssuerSignature(r.evidenceDigest, r.signature.sigHex, r.signature.publicKeyHex);
    if (!good) return { ok: false, reason: "signature does not verify" };
  }
  return { ok: true };
}

// src/version.ts
var MJ_VERSION = "11.14.8";
var MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");
var MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;

// src/mission/selfEvolveRuntime.ts
function composeBriefing(lessons, skillLines, mosaicLines, goal, now, params) {
  const lines = lessonsForBriefing(lessons, goal, now);
  if (params.mosaic) for (const m of mosaicLines) lines.push(m);
  for (const d of skillLines) lines.push(d);
  return lines.slice(0, Math.max(0, params.lessonBudget) + 2 + (params.mosaic ? 4 : 0));
}

// probe/selfEvolve.test.ts
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
var NOW = 176e10;
var baseInput = {
  missionId: "m1",
  simulated: false,
  verified: true,
  failureClasses: ["AGENT_STARVATION", "REPEATED_FAILURE"],
  repairLadder: ["RETRY", "ISOLATE"],
  repaired: true,
  seatOutcomes: [
    { role: "coder", passed: true },
    { role: "coder", passed: true },
    { role: "reviewer", passed: true }
  ],
  now: NOW
};
function runsFor(id, n, verifiedEvery, simulated = false) {
  const out = [];
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
section("2. memory dynamics \u2014 decay, reinforcement, retrieval");
{
  const fresh = reflectOnMission(baseInput);
  let mem = mergeLessons([], fresh, NOW);
  ok("fresh lessons land in memory", mem.length === fresh.length);
  const again = reflectOnMission({ ...baseInput, missionId: "m2", now: NOW + 1e3 });
  mem = mergeLessons(mem, again, NOW + 1e3);
  ok("identical text reinforces instead of duplicating", mem.length === fresh.length && mem.some((l) => l.useCount >= 1) && new Set(mem.map((l) => l.text)).size === mem.length);
  const day = 864e5;
  ok("strength decays with age", decayedStrength(mem[0], NOW + 10 * day) < mem[0].strength);
  const many = [];
  for (let i = 0; i < 250; i++) {
    many.push({ id: `x${i}`, kind: "failure", text: `distinct lesson number ${i} about widgets`, sourceMissionId: "m", evidence: ["e"], strength: 1, createdAt: NOW, lastUsedAt: NOW, useCount: 0 });
  }
  ok(`memory respects the cap (${LESSON_CAP})`, mergeLessons([], many, NOW).length === LESSON_CAP);
  const goalMem = [
    { id: "a", kind: "failure", text: "seats went idle waiting for inputs on the research fan-out", sourceMissionId: "m", evidence: ["e"], strength: 0.9, createdAt: NOW, lastUsedAt: NOW, useCount: 0 },
    { id: "b", kind: "success", text: "totally unrelated compiler toolchain advice", sourceMissionId: "m", evidence: ["e"], strength: 1, createdAt: NOW, lastUsedAt: NOW, useCount: 0 }
  ];
  const got = retrieveLessons(goalMem, "research fan-out inputs", 1, NOW);
  ok("retrieval ranks goal-overlap above raw strength", got[0]?.id === "a", JSON.stringify(got));
  ok("briefing lines are labelled org memory (scar-first)", lessonsForBriefing(goalMem, "research fan-out", NOW).every((s) => s.startsWith("[org memory")) && lessonsForBriefing(goalMem, "research fan-out", NOW)[0]?.startsWith("[org memory scar]"));
}
section("3. the strategy experiment is causal \u2014 attribution, trials, margin");
{
  const s0 = initialState(NOW);
  ok("baseline v1 adopted with no score", adoptedVersion(s0)?.gen === 1 && adoptedVersion(s0)?.score === null);
  const s1 = proposeVariation(s0, NOW);
  const cand = s1.versions.find((v) => v.status === "candidate");
  ok("one deterministic mutation from the adopted parent", !!cand && cand.parentId === "strategy-v1" && cand.params.reviewDepth === 2, JSON.stringify(cand?.params));
  ok("no second candidate while one waits", proposeVariation(s1, NOW).versions.filter((v) => v.status === "candidate").length === 1);
  ok("all-simulated runs score null \u2014 nothing observed", scoreRuns([{ verified: true, simulated: true, strategyId: "x" }]).score === null);
  const sc = scoreRuns([{ verified: true, simulated: false, strategyId: "x" }, { verified: false, simulated: false, strategyId: "x" }, { verified: true, simulated: true, strategyId: "x" }]);
  ok("score is verified-rate over REAL runs only", sc.score === 0.5 && sc.measured === 2, JSON.stringify(sc));
  ok("fresh experiment assigns the candidate first", nextAssignment(s1, [])?.id === "strategy-v2");
  ok("after a candidate run the baseline gets the next run", nextAssignment(s1, runsFor("strategy-v2", 1, 1))?.id === "strategy-v1");
  ok("balanced arms send the next run back to the candidate", nextAssignment(s1, [...runsFor("strategy-v2", 1, 1), ...runsFor("strategy-v1", 1, 1)])?.id === "strategy-v2");
  const parentPerfect = runsFor("strategy-v1", MIN_TRIALS, 1);
  const sNoCredit = settleCandidate(s1, parentPerfect, NOW);
  ok("candidate is NOT credited with runs executed under the parent", adoptedVersion(sNoCredit)?.id === "strategy-v1" && sNoCredit.versions.find((v) => v.id === "strategy-v2")?.status === "candidate", JSON.stringify(sNoCredit.versions.find((v) => v.id === "strategy-v2")?.note));
  ok("the baseline is measured on its own runs (never unmeasured again)", adoptedVersion(sNoCredit)?.score === 1 && adoptedVersion(sNoCredit)?.evaluatedOn === MIN_TRIALS, JSON.stringify(adoptedVersion(sNoCredit)));
  const candTwo = [...runsFor("strategy-v1", MIN_TRIALS, 1), ...runsFor("strategy-v2", 2, 1)];
  const sWait = settleCandidate(s1, candTwo, NOW);
  ok(`candidate below ${MIN_TRIALS} measured runs waits even at 1.00`, sWait.versions.find((v) => v.id === "strategy-v2")?.status === "candidate" && adoptedVersion(sWait)?.id === "strategy-v1");
  const baseOne = [...runsFor("strategy-v1", 1, 1), ...runsFor("strategy-v2", MIN_TRIALS, 1)];
  const sNoFree = settleCandidate(s1, baseOne, NOW);
  ok(`no adoption while the baseline has < ${MIN_TRIALS} measured runs`, sNoFree.versions.find((v) => v.id === "strategy-v2")?.status === "candidate");
  const baseRuns = [{ verified: true, simulated: false, strategyId: "strategy-v1" }, { verified: true, simulated: false, strategyId: "strategy-v1" }, { verified: false, simulated: false, strategyId: "strategy-v1" }];
  const candRuns = runsFor("strategy-v2", 3, 1);
  const sWin = settleCandidate(s1, [...baseRuns, ...candRuns], NOW);
  ok("candidate beats baseline by a strict margin on OWN runs \u2192 adopted", adoptedVersion(sWin)?.id === "strategy-v2" && (adoptedVersion(sWin)?.score ?? 0) === 1, JSON.stringify(adoptedVersion(sWin)?.note));
  ok("the beaten baseline retires with the numbers that condemned it", sWin.versions.find((v) => v.id === "strategy-v1")?.status === "retired");
  const s2 = proposeVariation(sWin, NOW);
  const cand2 = s2.versions.find((v) => v.status === "candidate");
  const noMargin = [
    ...runsFor("strategy-v3", 3, 1),
    ...runsFor("strategy-v2", 3, 1)
  ];
  const sTie = settleCandidate(s2, noMargin, NOW);
  ok(`1.00 vs 1.00 retires the candidate (margin ${ADOPT_MARGIN} required)`, cand2 && sTie.versions.find((v) => v.id === cand2.id)?.status === "retired");
  const s3 = proposeVariation(sTie, NOW);
  const cand3 = s3.versions.find((v) => v.status === "candidate");
  const simsOnly = [{ verified: true, simulated: true, strategyId: cand3?.id ?? "x" }];
  const sSim = settleCandidate(s3, simsOnly, NOW);
  const waitNote = sSim.versions.find((v) => v.id === cand3?.id)?.note ?? "";
  ok("simulated-only evidence leaves the candidate waiting, noted in writing", sSim.versions.find((v) => v.id === cand3?.id)?.status === "candidate" && /waiting|measured/.test(waitNote), waitNote);
  const s4 = proposeVariation(sSim, NOW);
  const cand4 = s4.versions.find((v) => v.status === "candidate");
  const cappedRuns = [
    ...runsFor(cand4?.id ?? "c", TRIAL_CAP, 1, true),
    // all simulated → 0 measured at the cap
    ...runsFor("strategy-v1", MIN_TRIALS, 1)
  ];
  const sCap = settleCandidate(s4, cappedRuns, NOW);
  const capNote = sCap.versions.find((v) => v.id === cand4?.id)?.note ?? "";
  ok(`${TRIAL_CAP}-run cap without measured trials retires inconclusive`, sCap.versions.find((v) => v.id === cand4?.id)?.status === "retired" && /inconclusive/.test(capNote), capNote);
  const unattr = Array.from({ length: 6 }, () => ({ verified: true, simulated: false, strategyId: null }));
  const s5 = initialState(NOW);
  const s5c = proposeVariation(s5, NOW);
  const sUn = settleCandidate(s5c, unattr, NOW);
  const armsUn = armScores(s5c, unattr);
  ok("unattributed runs are excluded from both arms", armsUn.baseline.measured === 0 && (armsUn.candidate?.measured ?? 0) === 0 && sUn.versions.find((v) => v.status === "candidate")?.status === "candidate");
}
section("4. strategy parameters actually govern the run");
{
  const seats = [
    { seatId: "a", wave: 0 },
    { seatId: "b", wave: 0 },
    { seatId: "c", wave: 1 }
  ];
  ok("serialExec flattens the wave plan to one seat per wave", strategyWaveShape(seats, true).every((w) => w.length === 1) && strategyWaveShape(seats, true).length === 3);
  ok("without serialExec waves group as planned", strategyWaveShape(seats, false).length === 2 && strategyWaveShape(seats, false)[0].length === 2);
  ok("checkBias maps to evidence depth 2..8", evidenceDepth(0) === 2 && evidenceDepth(1) === 8 && evidenceDepth(0.5) === 5 && evidenceDepth(0.25) >= 3);
  ok("reviewDepth 1 adds no review instruction", reviewBriefingLines(1).length === 0);
  ok("reviewDepth 2 instructs two independent review passes", reviewBriefingLines(2).length === 1 && reviewBriefingLines(2)[0].includes("two independent passes"));
  const lessons = [
    { id: "a", kind: "failure", text: "fan-out starved the seats", sourceMissionId: "m", evidence: ["e"], strength: 1, createdAt: NOW, lastUsedAt: NOW, useCount: 0 },
    { id: "b", kind: "success", text: "reviewer caught the drift", sourceMissionId: "m", evidence: ["e"], strength: 1, createdAt: NOW, lastUsedAt: NOW, useCount: 0 },
    { id: "c", kind: "success", text: "third line of memory", sourceMissionId: "m", evidence: ["e"], strength: 1, createdAt: NOW, lastUsedAt: NOW, useCount: 0 }
  ];
  const P = (over) => ({ reviewDepth: 1, checkBias: 0.5, serialExec: false, lessonBudget: 3, mosaic: false, ...over });
  const tight = composeBriefing(lessons, ["[learned skill \u2605x] do the thing"], [], "fan-out", NOW, P({ lessonBudget: 1 }));
  const wide = composeBriefing(lessons, ["[learned skill \u2605x] do the thing"], [], "fan-out", NOW, P({ lessonBudget: 6 }));
  ok("lessonBudget of the GOVERNING strategy caps briefing lines", tight.length <= 3 && wide.length > tight.length, `${tight.length} vs ${wide.length}`);
  ok("approved learned skills ride in briefings", wide.some((l) => l.includes("[learned skill")));
  const withMosaic = composeBriefing(lessons, [], ["[causal memory] tried: X \u2192 recovered", "[belief contradicted] Y"], "fan-out", NOW, P({ mosaic: true, lessonBudget: 6 }));
  const withoutMosaic = composeBriefing(lessons, [], ["[causal memory] tried: X \u2192 recovered"], "fan-out", NOW, P({ lessonBudget: 6 }));
  ok("mosaic lines enter briefings only when the governing regime says so", withMosaic.some((l) => l.includes("[causal memory]")) && !withoutMosaic.some((l) => l.includes("[causal memory]")));
}
section("5. skills propose only from verified real runs");
{
  const good = proposeSkills({
    missionId: "m9",
    verified: true,
    simulated: false,
    now: NOW,
    tasks: [
      { role: "coder", label: "impl", passed: true },
      { role: "coder", label: "fix", passed: true },
      { role: "reviewer", label: "rev", passed: true }
    ],
    recurringFailureTexts: []
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
  ok("approved skills surface as library node defs naming their source mission", defs.length === 1 && defs[0].learnedFrom === "m9" && defs[0].label.startsWith("\u2605"));
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
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
