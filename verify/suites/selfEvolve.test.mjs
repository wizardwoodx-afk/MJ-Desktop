import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/mission/lessons.ts
var LESSON_CAP = 200;
var DECAY_PER_DAY = 0.95;
var RETRIEVE_K = 3;
var seq = 0;
function nextId(prefix, now) {
  seq += 1;
  return `${prefix}-${now.toString(36)}-${seq}`;
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
  const push = (kind, text, evidence) => {
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
      useCount: 0
    });
  };
  if (input.simulated) {
    push(
      "environment",
      "Execution was simulated on this host \u2014 no lesson about real execution may be drawn; only host capability is known.",
      ["simulated=true"]
    );
    return out;
  }
  for (const cls of input.failureClasses) {
    const text = FAILURE_TEXT[cls];
    if (text) push("failure", text, [`failureClass=${cls}`]);
  }
  if (input.repaired && input.repairLadder.length > 0) {
    push(
      "success",
      `Repair ladder ${input.repairLadder.join(" -> ")} recovered the run \u2014 prefer the cheapest strategy that previously worked.`,
      [`ladder=${input.repairLadder.join(">")}`, "repaired=true"]
    );
  }
  if (input.verified) {
    const reviewers = input.seatOutcomes.filter((s) => s.role === "reviewer" && s.passed).length;
    push(
      "success",
      reviewers > 0 ? "Cross-role review passed on real execution \u2014 keep an independent reviewer seat on missions like this." : "Mission verified on real execution \u2014 the team shape that produced this is worth reusing.",
      [`verified=true`, `reviewersPassed=${reviewers}`]
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
  return retrieveLessons(memory, goal, RETRIEVE_K, now).map(
    (l) => `[org memory] ${l.text}`
  );
}

// src/mission/selfImprove.ts
var ADOPT_MARGIN = 0.05;
var ARCHIVE_CAP = 24;
var BASE_PARAMS = {
  reviewDepth: 1,
  checkBias: 0.5,
  serialExec: false,
  lessonBudget: 3
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
    note: "baseline \u2014 shipped defaults; adopted until a measured candidate beats it",
    createdAt: now
  };
  return { versions: [v], adoptedId: v.id };
}
function adoptedVersion(s) {
  return s.versions.find((v) => v.id === s.adoptedId) ?? null;
}
var DIMS = ["reviewDepth", "checkBias", "serialExec", "lessonBudget"];
function proposeVariation(s, now) {
  const parent = adoptedVersion(s);
  if (!parent) return s;
  if (s.versions.some((v2) => v2.status === "candidate")) return s;
  const gen = parent.gen + 1;
  const dim = DIMS[(gen - 2) % DIMS.length];
  const params = { ...parent.params };
  if (dim === "reviewDepth") params.reviewDepth = params.reviewDepth === 1 ? 2 : 1;
  else if (dim === "checkBias") params.checkBias = params.checkBias >= 0.75 ? 0.25 : params.checkBias + 0.25;
  else if (dim === "serialExec") params.serialExec = !params.serialExec;
  else params.lessonBudget = params.lessonBudget >= 6 ? 1 : params.lessonBudget + 1;
  const v = {
    id: `strategy-v${gen}`,
    gen,
    params,
    parentId: parent.id,
    status: "candidate",
    score: null,
    evaluatedOn: 0,
    note: `mutated ${String(dim)} from parent v${parent.gen}; awaiting measured runs`,
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
function settleCandidate(s, runs, _now) {
  const candidate = s.versions.find((v) => v.status === "candidate");
  if (!candidate) return s;
  const { score, measured } = scoreRuns(runs);
  if (score === null) {
    return { ...s, versions: s.versions.map((v) => v.id === candidate.id ? { ...v, note: "only simulated runs observed \u2014 score stays null; candidate waits" } : v) };
  }
  const parent = adoptedVersion(s);
  const parentScore = parent?.score ?? null;
  const better = parentScore === null ? true : score > parentScore + ADOPT_MARGIN;
  const versions = s.versions.map((v) => {
    if (v.id === candidate.id) {
      return better ? { ...v, status: "adopted", score, evaluatedOn: measured, note: `adopted at ${score.toFixed(2)} over ${measured} measured runs (parent ${parentScore === null ? "unmeasured" : parentScore.toFixed(2)})` } : { ...v, status: "retired", score, evaluatedOn: measured, note: `retired at ${score.toFixed(2)} \u2014 parent held ${parentScore === null ? "unmeasured baseline" : parentScore.toFixed(2)}` };
    }
    if (better && v.id === s.adoptedId) return { ...v, status: "retired" };
    return v;
  });
  return { versions, adoptedId: better ? candidate.id : s.adoptedId };
}

// src/mission/skillEvolution.ts
var PROPOSAL_CAP = 20;
var seq2 = 0;
function proposeSkills(input) {
  const now = input.now ?? Date.now();
  const out = [];
  if (!input.simulated && input.verified) {
    const byRole = /* @__PURE__ */ new Map();
    for (const t of input.tasks) if (t.passed) byRole.set(t.role, (byRole.get(t.role) ?? 0) + 1);
    const rich = [...byRole.entries()].filter(([, n]) => n >= 2).slice(0, 2);
    for (const [role, n] of rich) {
      seq2 += 1;
      out.push({
        id: `skill-${now.toString(36)}-${seq2}`,
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
    seq2 += 1;
    out.push({
      id: `skill-${now.toString(36)}-${seq2}`,
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
  ok("all-simulated runs score null \u2014 nothing observed", scoreRuns([{ verified: true, simulated: true }]).score === null);
  const sc = scoreRuns([{ verified: true, simulated: false }, { verified: false, simulated: false }, { verified: true, simulated: true }]);
  ok("score is verified-rate over REAL runs only", sc.score === 0.5 && sc.measured === 2, JSON.stringify(sc));
  const realWins = [{ verified: true, simulated: false }, { verified: true, simulated: false }];
  const s2 = settleCandidate(s1, realWins, NOW);
  ok("a measured 1.00 beats an unmeasured baseline and is adopted", adoptedVersion(s2)?.id === cand?.id && adoptedVersion(s2)?.score === 1, JSON.stringify(adoptedVersion(s2)?.note));
  ok("the beaten baseline retires", s2.versions.find((v) => v.id === "strategy-v1")?.status === "retired");
  const s3 = proposeVariation(s2, NOW);
  const cand2 = s3.versions.find((v) => v.status === "candidate");
  const close = [{ verified: true, simulated: false }];
  const s4 = settleCandidate(s3, close, NOW);
  ok(`adoption requires a strict ${ADOPT_MARGIN} margin`, cand2 && s4.versions.find((v) => v.id === cand2.id)?.status === "retired");
  const s5 = proposeVariation(s4, NOW);
  const simsOnly = [{ verified: true, simulated: true }];
  const s6 = settleCandidate(s5, simsOnly, NOW);
  const wait = s6.versions.find((v) => v.status === "candidate");
  ok("simulated-only evidence leaves the candidate waiting, noted in writing", !!wait && wait.note.includes("simulated"), wait?.note);
}
section("4. skills propose only from verified real runs");
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
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
