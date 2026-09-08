import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/varkhaAlign.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/mission/selfImprove.ts
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
function diffDims(a, b) {
  return Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

// src/mission/lessons.ts
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

// src/mission/belief.ts
var BELIEF_CAP = 100;
var seq2 = 0;
function nextId2(now) {
  seq2 += 1;
  return `belief-${now.toString(36)}-${seq2}`;
}
function classForExternal(confidence) {
  if (confidence >= 0.8) return "probably";
  if (confidence >= 0.5) return "uncertain";
  return "unknown";
}
function beliefFromExternal(claim, confidence, source, now, deps = [], opts) {
  return {
    id: nextId2(now),
    claim,
    klass: classForExternal(confidence),
    confidence,
    source,
    ts: now,
    deps,
    evidence: [`${source}: ${claim}`],
    isPrediction: false,
    provenance: opts?.userStated ? "user-stated" : "agent-inferred",
    aboutUser: opts?.aboutUser ?? false,
    approved: false
  };
}
function needsApproval(b) {
  return b.provenance === "agent-inferred" && b.aboutUser && !b.approved;
}
function approveBelief(memory, id) {
  return memory.map((b) => b.id === id ? { ...b, approved: true } : b);
}
function subjectTokens(s) {
  return new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
}
function subjectOverlap(a, b) {
  const ta = subjectTokens(a);
  const tb = subjectTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((w) => {
    if (tb.has(w)) inter += 1;
  });
  return inter / Math.min(ta.size, tb.size);
}
function mergeBeliefs(memory, incoming) {
  let out = [...memory];
  for (const b of incoming) {
    const idx = out.findIndex((m2) => m2.claim === b.claim || !b.isPrediction && !m2.isPrediction && subjectOverlap(m2.claim, b.claim) >= 0.7);
    if (idx === -1) {
      out.push(b);
      continue;
    }
    const m = out[idx];
    const sameAssertion = m.claim === b.claim;
    const conflicts = !sameAssertion && m.source !== b.source;
    out[idx] = conflicts ? { ...m, klass: "contradicted", confidence: Math.min(m.confidence, b.confidence), evidence: [...m.evidence, ...b.evidence].slice(0, 8), deps: [.../* @__PURE__ */ new Set([...m.deps, ...b.deps])] } : { ...m, confidence: Math.max(m.confidence, b.confidence), ts: Math.max(m.ts, b.ts), evidence: [...m.evidence, ...b.evidence].slice(0, 8) };
  }
  return out.slice(-BELIEF_CAP);
}
function beliefsForBriefing(memory, goal, now) {
  void now;
  const goalWords = goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const relevant = (b) => {
    if (needsApproval(b)) return false;
    const low = b.claim.toLowerCase();
    return b.klass === "contradicted" || b.isPrediction || goalWords.some((w) => low.includes(w));
  };
  const lines = [];
  for (const b of memory.filter(relevant)) {
    if (b.isPrediction) lines.push(`[prediction \u2014 NOT evidence] ${b.claim}`);
    else if (b.klass === "contradicted") lines.push(`[belief contradicted] ${b.claim} \u2014 sources disagree; verify before acting on it`);
    else lines.push(`[belief ${b.klass}] ${b.claim} (${b.source})`);
  }
  return lines.slice(0, 6);
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
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/mission/actionPacket.ts
function canonicalPacketInput(p) {
  return JSON.stringify([
    p.format,
    p.id,
    p.mjVersion,
    p.issuedAt,
    p.intent,
    p.beliefDigest,
    p.planStep,
    p.prediction,
    p.risk,
    p.permission,
    p.rollback,
    p.verification,
    p.reversible
  ]);
}
var seq3 = 0;
async function issueActionPacket(args) {
  const now = args.now ?? Date.now();
  seq3 += 1;
  const base = {
    format: "mj-action-packet/1",
    id: `packet-${now.toString(36)}-${seq3}`,
    mjVersion: args.mjVersion,
    issuedAt: new Date(now).toISOString(),
    intent: args.intent,
    beliefDigest: args.beliefDigest,
    planStep: args.planStep,
    prediction: args.prediction,
    risk: args.risk,
    permission: args.permission,
    rollback: args.rollback,
    verification: args.verification,
    reversible: args.reversible
  };
  const digest = await sha256Hex(canonicalPacketInput(base));
  const packet = { ...base, digest };
  if (signingSupported()) {
    const sig = await signHexDigest(digest);
    if (sig) packet.signature = sig;
    else packet.signatureNote = "Ed25519 unavailable in this runtime; packet unsigned.";
  } else {
    packet.signatureNote = "Ed25519 unavailable in this runtime; packet unsigned.";
  }
  return packet;
}
async function verifyActionPacket(p) {
  const { digest, signature, signatureNote, ...rest } = p;
  void signatureNote;
  const recomputed = await sha256Hex(canonicalPacketInput(rest));
  if (recomputed !== digest) return { ok: false, reason: "digest mismatch \u2014 packet was altered" };
  if (p.signature) {
    const good = await verifyIssuerSignature(digest, p.signature.sigHex, p.signature.publicKeyHex);
    if (!good) return { ok: false, reason: "signature does not verify" };
  }
  return { ok: true };
}
function packetAllowsExecution(p) {
  if (!p) return { ok: true, reason: "no packet \u2014 run proceeds under gate policy alone (pre-11.12 caller)" };
  if (p.permission === "refused") return { ok: false, reason: `action packet ${p.id} is refused: ${p.risk}` };
  if (!p.reversible && p.permission !== "allowed") {
    return { ok: false, reason: `irreversible action requires explicit "allowed" permission; packet ${p.id} says "${p.permission}"` };
  }
  return { ok: true, reason: `packet ${p.id} permits execution (${p.permission}${p.reversible ? ", reversible" : ", irreversible+allowed"})` };
}

// src/mission/escalation.ts
function repetitionDepth(signatures) {
  let max = 0;
  let run = 0;
  let last = null;
  for (const s of signatures) {
    run = s === last ? run + 1 : 1;
    last = s;
    max = Math.max(max, run);
  }
  return max;
}
function shouldSuggestDeliberation(sig) {
  const reasons = [];
  if (sig.irreversibleAction) reasons.push("irreversible action in scope");
  if (sig.stepRepetition >= 3) reasons.push(`step repetition x${sig.stepRepetition}`);
  if (sig.scarMatch) reasons.push("SCAR: this task shape failed under Current alone");
  if (sig.contradictedBelief) reasons.push("contradicted belief on the action path");
  return { suggest: reasons.length > 0, reasons };
}

// probe/varkhaAlign.test.ts
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
var root = ".".length > 0 ? "." : process.cwd();
var NOW = 176e10;
section("1. SCAR before PRECEDENT");
{
  const lessons = [
    ...reflectOnMission({ missionId: "m1", simulated: false, verified: true, failureClasses: ["SEQUENTIAL_BOTTLENECK"], repairLadder: ["ISOLATE"], repaired: true, seatOutcomes: [{ role: "coder", passed: true }], now: NOW })
  ];
  const lines = lessonsForBriefing(lessons, "split the sequential bottleneck before assigning", 3, NOW);
  ok("briefings exist for a goal matching memory", lines.length > 0, JSON.stringify(lines));
  ok("failure (scar) lessons are labelled and retrieved first", lines[0]?.startsWith("[org memory scar]"), JSON.stringify(lines[0]));
}
section("2. write asymmetry \u2014 inferred-about-user waits for a human");
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
  ok("no signal \u2192 no suggestion (Current stays default)", quiet.suggest === false);
  const p = await issueActionPacket({ mjVersion: "11.12.1", intent: "i", beliefDigest: "x", planStep: "p", prediction: "pr", risk: "r", permission: "allowed", rollback: null, verification: "v", reversible: false, now: NOW });
  const envelopes = [{ seatId: "s1", attenuatedFrom: p.id, scope: ["role:coder", "write:worktree:mission-x", "spend:capped-by-ledger"] }];
  ok("seat envelopes trace to the permitting packet and stay ledger-capped", envelopes.every((e) => e.attenuatedFrom === p.id && e.scope.includes("spend:capped-by-ledger")));
}
section("4. ablation clarity \u2014 one dimension per experiment");
{
  let s = initialState(NOW);
  let single = true;
  const dimsSeen = /* @__PURE__ */ new Set();
  for (let i = 0; i < 5; i++) {
    const parent = adoptedVersion(s);
    s = proposeVariation({ ...s, versions: s.versions.map((v) => v.status === "candidate" ? { ...v, status: "retired" } : v) }, NOW + i);
    const cand = s.versions.find((v) => v.status === "candidate");
    if (!cand || !parent) {
      single = false;
      continue;
    }
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
  const tampered = { ...p, permission: "allowed", intent: "deploy AND drop tables" };
  ok("a tampered 'allowed' packet still passes the bare permission rule\u2026", packetAllowsExecution(tampered).ok === true);
  ok("\u2026so the boundary's verification step is what catches it", (await verifyActionPacket(tampered)).ok === false);
}
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
