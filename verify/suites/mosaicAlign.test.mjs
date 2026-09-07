import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/mission/belief.ts
var BELIEF_CAP = 100;
var seq = 0;
function nextId(now) {
  seq += 1;
  return `belief-${now.toString(36)}-${seq}`;
}
function classForExternal(confidence) {
  if (confidence >= 0.8) return "probably";
  if (confidence >= 0.5) return "uncertain";
  return "unknown";
}
function classForMeasured(verified, confidence) {
  if (!verified) return "uncertain";
  return confidence >= 0.8 ? "known" : "probably";
}
function beliefFromExternal(claim, confidence, source, now, deps = []) {
  return { id: nextId(now), claim, klass: classForExternal(confidence), confidence, source, ts: now, deps, evidence: [`${source}: ${claim}`], isPrediction: false };
}
function beliefFromMeasured(claim, verified, confidence, source, now, deps = []) {
  return { id: nextId(now), claim, klass: classForMeasured(verified, confidence), confidence, source, ts: now, deps, evidence: [`${source}: ${claim}`], isPrediction: false };
}
function predictionBelief(claim, source, now) {
  return { id: nextId(now), claim, klass: "uncertain", confidence: 0.5, source, ts: now, deps: [], evidence: [], isPrediction: true };
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
    const low = b.claim.toLowerCase();
    return b.klass === "contradicted" || b.isPrediction || goalWords.some((w) => low.includes(w));
  };
  const lines = [];
  for (const b of memory.filter(relevant)) {
    if (b.isPrediction) lines.push(`[prediction \u2014 NOT evidence] ${b.claim}`);
    else if (b.klass === "contradicted") lines.push(`[belief contradicted] ${b.claim} \u2014 sources disagree; verify before acting on it`);
    else if (b.klass === "uncertain" || b.klass === "unknown") lines.push(`[belief ${b.klass}] ${b.claim} (${b.source})`);
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
var seq2 = 0;
async function issueActionPacket(args) {
  const now = args.now ?? Date.now();
  seq2 += 1;
  const base = {
    format: "mj-action-packet/1",
    id: `packet-${now.toString(36)}-${seq2}`,
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

// src/mission/lessons.ts
var DECAY_PER_DAY = 0.95;
var seq3 = 0;
function nextId2(prefix, now) {
  seq3 += 1;
  return `${prefix}-${now.toString(36)}-${seq3}`;
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
      id: nextId2("lesson", now),
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
function retrieveCausal(memory, condition, k, now) {
  const c = tokens(condition);
  const causalText = (l) => l.causal ? [l.causal.decision, l.causal.action, l.causal.observation, l.causal.outcome].filter(Boolean).join(" ") : "";
  const scored = memory.filter((l) => l.causal).map((l) => {
    const t = tokens(causalText(l));
    let overlap = 0;
    c.forEach((w) => {
      if (t.has(w)) overlap += 1;
    });
    return { l, score: overlap === 0 ? 0 : decayedStrength(l, now) * overlap };
  }).filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.l);
}

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

// probe/mosaicAlign.test.ts
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
section("1. R1 \u2014 predictions are not evidence");
{
  ok("external confidence 0.99 still caps at 'probably'", classForExternal(0.99) === "probably");
  ok("external confidence 0.5 is 'uncertain', 0.1 'unknown'", classForExternal(0.5) === "uncertain" && classForExternal(0.1) === "unknown");
  ok("measured+verified may be 'known'; measured+unverified stays 'uncertain'", classForMeasured(true, 0.9) === "known" && classForMeasured(false, 1) === "uncertain");
  const mem = mergeBeliefs([], [
    beliefFromExternal("library X supports protocol Y", 0.9, "web:docs", NOW),
    predictionBelief("running the team will verify", "simulator", NOW)
  ]);
  const lines = beliefsForBriefing(mem, "library X protocol Y", NOW);
  ok("predictions surface in briefings labelled as NOT evidence", lines.some((l) => l.startsWith("[prediction \u2014 NOT evidence]")), JSON.stringify(lines));
  ok("external claims never briefed as known", !lines.some((l) => l.includes("[belief known]")));
  const contradicted = mergeBeliefs(
    [beliefFromMeasured("the gate policy is STRICT", true, 1, "run:m1", NOW)],
    [beliefFromExternal("the gate policy is lenient", 0.9, "web:rumor", NOW)]
  );
  ok("conflicting sources mark the belief contradicted", contradicted.some((b) => b.klass === "contradicted"), JSON.stringify(contradicted.map((b) => b.klass)));
  ok("contradictions surface with a verify-before-acting warning", beliefsForBriefing(contradicted, "gate policy", NOW).some((l) => l.includes("[belief contradicted]")));
  const baseInput = {
    missionId: "m1",
    simulated: false,
    verified: true,
    failureClasses: ["REPEATED_FAILURE"],
    repairLadder: ["RETRY"],
    repaired: true,
    seatOutcomes: [{ role: "reviewer", passed: true }],
    now: NOW
  };
  const lessons = reflectOnMission(baseInput);
  ok("lessons carry only measured evidence \u2014 no prediction text leaks in", lessons.every((l) => l.evidence.every((e) => !e.includes("prediction"))));
}
section("2. R2 \u2014 proof-carrying actions");
{
  const p = await issueActionPacket({
    mjVersion: "11.12.0",
    intent: "run the team",
    beliefDigest: "ab".repeat(32),
    planStep: "mission-1",
    prediction: "gate verifies",
    risk: "ledger capped",
    permission: "allowed",
    rollback: "worktrees isolated",
    verification: "gate verdict",
    reversible: false,
    now: NOW
  });
  ok("an issued packet verifies with zero MJ state", (await verifyActionPacket(p)).ok === true);
  const tampered = { ...p, prediction: "something will surely go right" };
  const tv = await verifyActionPacket(tampered);
  ok("altering a prediction after signing fails verification", tv.ok === false && (tv.reason ?? "").includes("digest"), tv.reason);
  ok("no packet \u2192 run proceeds under gate policy alone (pre-11.12 callers)", packetAllowsExecution(null).ok === true);
  ok("refused packet blocks execution", packetAllowsExecution({ ...p, permission: "refused" }).ok === false);
  ok("irreversible + requires-human blocks execution", packetAllowsExecution({ ...p, permission: "requires-human" }).ok === false);
  ok("irreversible + allowed executes", packetAllowsExecution(p).ok === true);
  ok("reversible + requires-human executes (undoable actions may proceed)", packetAllowsExecution({ ...p, reversible: true, permission: "requires-human" }).ok === true);
}
section("3. causal memory \u2014 tried-X-under-conditions retrieval");
{
  const lessons = reflectOnMission({
    missionId: "m2",
    simulated: false,
    verified: true,
    failureClasses: ["SEQUENTIAL_BOTTLENECK"],
    repairLadder: ["ISOLATE", "RETRY"],
    repaired: true,
    seatOutcomes: [{ role: "coder", passed: true }, { role: "reviewer", passed: true }],
    now: NOW
  });
  ok("reflected lessons carry causal edges", lessons.every((l) => !!l.causal), JSON.stringify(lessons.map((l) => l.causal)));
  const hit = retrieveCausal(lessons, "isolate the bottleneck then retry", 3, NOW);
  ok("causal retrieval answers 'what happened when we tried X'", hit.length > 0 && (hit[0].causal?.action ?? "").includes("ISOLATE"), JSON.stringify(hit.map((h) => h.causal)));
  ok("unrelated conditions retrieve nothing (no similarity bleed)", retrieveCausal(lessons, "kubernetes ingress tuning", 3, NOW).length === 0);
}
section("4. the mosaic regime dimension rotates through the experiment");
{
  const strip = (s2) => ({
    ...s2,
    versions: s2.versions.map((v) => v.status === "candidate" ? { ...v, status: "retired" } : v)
  });
  let s = initialState(NOW);
  const mutated = [];
  for (let i = 0; i < 5; i++) {
    const before = s.versions.find((v) => v.status === "adopted")?.params ?? BASE_PARAMS;
    s = proposeVariation(strip(s), NOW + i);
    const cand = s.versions.find((v) => v.status === "candidate");
    if (!cand) {
      mutated.push("reviewDepth");
      continue;
    }
    for (const k of Object.keys(BASE_PARAMS)) {
      if (JSON.stringify(cand.params[k]) !== JSON.stringify(before[k])) mutated.push(k);
    }
  }
  ok("five generations rotate five dimensions incl. mosaic", new Set(mutated).size === 5 && mutated.includes("mosaic"), JSON.stringify(mutated));
  ok("mosaic flips from the shipped default", (s.versions.find((v) => v.gen === 6)?.params.mosaic ?? false) === true);
}
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
