import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

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

// src/mission/custody.ts
var HUMAN_PRINCIPAL_RE = /^human:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function isHumanPrincipal(p) {
  return HUMAN_PRINCIPAL_RE.test(p);
}
function canonicalEnvelopeInput(e) {
  return JSON.stringify([e.format, e.id, e.principal, e.delegationChain, e.scope, e.issuedAt, e.expiresAt, e.budgetUsd, e.revoked, e.parentId]);
}
var seq = 0;
async function seal(base) {
  const digest = await sha256Hex(canonicalEnvelopeInput(base));
  const env = { ...base, digest };
  if (signingSupported()) {
    const sig = await signHexDigest(digest);
    if (sig) env.signature = sig;
    else env.signatureNote = "Ed25519 unavailable in this runtime; envelope unsigned.";
  } else {
    env.signatureNote = "Ed25519 unavailable in this runtime; envelope unsigned.";
  }
  return env;
}
async function issueRootEnvelope(args) {
  if (!isHumanPrincipal(args.principal)) {
    throw new Error(`custody: root principal "${args.principal}" is not a human principal \u2014 the root of every delegation chain must match human:<id>. Refused; nothing was signed.`);
  }
  const now = args.now ?? Date.now();
  const budget = args.budgetUsd ?? null;
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
    throw new Error(`custody: budget cap must be a finite non-negative USD amount \u2014 refused ${String(budget)}`);
  }
  seq += 1;
  return seal({
    format: "mj-envelope/1",
    id: `env-${now.toString(36)}-${seq}`,
    principal: args.principal,
    delegationChain: [args.principal],
    scope: args.scope,
    issuedAt: now,
    expiresAt: args.expiresAt,
    budgetUsd: budget,
    revoked: null,
    parentId: null
  });
}
async function attenuate(parent, agentId, subScope, opts) {
  if (!isHumanPrincipal(parent.principal)) {
    return { envelope: null, reason: `custody: parent envelope principal "${parent.principal}" is not human-format \u2014 attenuation is refused rather than delegated from an illegitimate root` };
  }
  const now = opts?.now ?? Date.now();
  const notInParent = subScope.filter((s) => !parent.scope.includes(s));
  if (notInParent.length > 0) {
    return { envelope: null, reason: `attenuation refused: scope would GROW by [${notInParent.join(", ")}] \u2014 a sub-agent never exceeds its parent` };
  }
  const expiry = opts?.expiresAt ?? parent.expiresAt;
  if (parent.expiresAt !== null && (expiry === null || expiry > parent.expiresAt)) {
    return { envelope: null, reason: "attenuation refused: child expiry outlives the parent envelope" };
  }
  const requestedBudget = opts?.budgetUsd ?? null;
  const budget = requestedBudget === null ? parent.budgetUsd : parent.budgetUsd !== null && requestedBudget > parent.budgetUsd ? null : requestedBudget;
  if (requestedBudget !== null && parent.budgetUsd !== null && requestedBudget > parent.budgetUsd) {
    return { envelope: null, reason: `attenuation refused: child budget $${requestedBudget} exceeds the parent's $${parent.budgetUsd} cap \u2014 spend authority never grows` };
  }
  seq += 1;
  const envelope = await seal({
    budgetUsd: budget,
    format: "mj-envelope/1",
    id: `env-${now.toString(36)}-${seq}`,
    principal: parent.principal,
    delegationChain: [...parent.delegationChain, agentId],
    scope: subScope,
    issuedAt: now,
    expiresAt: expiry,
    revoked: null,
    parentId: parent.id
  });
  return { envelope, reason: `attenuated from ${parent.id}; chain ${envelope.delegationChain.join(" -> ")}` };
}
function revoke(e, reason) {
  return { ...e, revoked: reason };
}
function checkEnvelope(e, action, now) {
  if (!e) return { ok: false, reason: "no authority envelope \u2014 nothing executes without traced authority" };
  if (e.revoked) return { ok: false, reason: `envelope ${e.id} revoked: ${e.revoked}` };
  if (e.expiresAt !== null && now > e.expiresAt) return { ok: false, reason: `envelope ${e.id} expired \u2014 authority is void` };
  if (!e.scope.includes(action)) return { ok: false, reason: `action "${action}" outside envelope scope [${e.scope.join(", ")}]` };
  return { ok: true, reason: `envelope ${e.id} permits "${action}" (principal ${e.principal})` };
}
async function verifyEnvelope(e) {
  if (!isHumanPrincipal(e.principal)) {
    return { ok: false, reason: `principal "${e.principal}" is not human-format \u2014 every chain must root in a human` };
  }
  const { digest, signature, signatureNote, ...rest } = e;
  void signatureNote;
  const recomputed = await sha256Hex(canonicalEnvelopeInput(rest));
  if (recomputed !== digest) return { ok: false, reason: "digest mismatch \u2014 envelope was altered" };
  if (e.signature) {
    const good = await verifyIssuerSignature(digest, e.signature.sigHex, e.signature.publicKeyHex);
    if (!good) return { ok: false, reason: "signature does not verify" };
  }
  return { ok: true };
}

// src/mission/lessons.ts
var LS_KEY = "mj.lessons.v1";
function saveLessons(memory, writer = "agent") {
  for (const l of memory) enforceWrite(l.kind === "failure" ? "SCAR" : "PRECEDENT", writer);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(memory));
  } catch {
  }
}

// src/mission/skillEvolution.ts
var LS_KEY2 = "mj.skills.v1";
function saveSkills(memory, writer = "human") {
  for (const m of memory) if (m.status === "approved") enforceWrite("RECOURSE", writer);
  try {
    localStorage.setItem(LS_KEY2, JSON.stringify(memory));
  } catch {
  }
}

// src/mission/ledger.ts
function canWrite(type, writer) {
  switch (type) {
    case "STANCE":
      return writer === "agent" || writer === "human" ? { ok: true, reason: "STANCE is live turn state; the runtime writes it" } : { ok: false, reason: "the experiment writes no live state" };
    case "PRECEDENT":
    case "SCAR":
      return writer === "agent" || writer === "human" ? { ok: true, reason: `${type} is written from MEASURED run facts only (reflection enforces this)` } : { ok: false, reason: "the experiment settles strategies, not episodes" };
    case "DOCTRINE":
      return writer === "human" ? { ok: true, reason: "house rules are human-written" } : { ok: false, reason: `DOCTRINE is human-only; ${writer} may propose, never write` };
    case "RECOURSE":
      return writer === "experiment" || writer === "human" ? { ok: true, reason: "RECOURSE changes only via measured adoption or human approval" } : { ok: false, reason: "an agent run cannot install strategies or skills on its own" };
  }
}
function enforceWrite(type, writer) {
  const v = canWrite(type, writer);
  if (!v.ok) throw new Error(`ledger: refused \u2014 ${writer} may not write ${type} (${v.reason})`);
}

// src/mission/belief.ts
var LS_KEY3 = "mj.beliefs.v1";
function saveBeliefs(memory, writer = "agent") {
  for (const _ of memory) enforceWrite("STANCE", writer);
  try {
    localStorage.setItem(LS_KEY3, JSON.stringify(memory));
  } catch {
  }
}

// probe/governanceAlign.test.ts
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => void 0,
    removeItem: () => void 0
  };
}
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
section("1. authority envelopes \u2014 principal, attenuation, expiry, scope");
{
  const root = await issueRootEnvelope({
    principal: "human:runner",
    scope: ["run:team-mission", "spend:capped-by-ledger", "write:worktrees", "read:review-snapshot", "role:any"],
    expiresAt: NOW + 1e3 * 60 * 30,
    now: NOW
  });
  ok("root envelope traces to a human principal with a one-link chain", root.principal === "human:runner" && root.delegationChain.length === 1);
  ok("root envelope verifies", (await verifyEnvelope(root)).ok === true);
  const att = await attenuate(root, "seat:coder", ["role:any", "write:worktrees", "spend:capped-by-ledger"], { now: NOW + 1 });
  ok("attenuation to a subset succeeds and extends the delegation chain", !!att.envelope && att.envelope.delegationChain.join(",") === "human:runner,seat:coder");
  ok("a child cannot outlive its parent", att.envelope !== null && (att.envelope.expiresAt ?? Infinity) <= (root.expiresAt ?? Infinity));
  const grow = await attenuate(root, "seat:evil", ["role:any", "delete:production"], { now: NOW + 1 });
  ok("attenuation that would GROW scope is refused, with the offending scope named", grow.envelope === null && grow.reason.includes("delete:production"), grow.reason);
  const outlive = await attenuate(root, "seat:late", ["role:any"], { expiresAt: NOW + 1e3 * 60 * 90, now: NOW + 1 });
  ok("a child expiry beyond the parent is refused", outlive.envelope === null);
  ok("in-scope action inside the window executes", checkEnvelope(root, "run:team-mission", NOW + 10).ok === true);
  ok("out-of-scope action is architecturally unable", checkEnvelope(root, "write:production-db", NOW + 10).ok === false);
  ok("an expired envelope refuses everything", checkEnvelope(root, "run:team-mission", NOW + 1e3 * 60 * 31).ok === false);
  ok("a revoked envelope refuses everything", checkEnvelope(revoke(root, "principal cancelled the mission"), "run:team-mission", NOW + 10).ok === false);
  ok("no envelope \u2192 no execution without traced authority", checkEnvelope(null, "run:team-mission", NOW).ok === false);
  const tampered = { ...root, scope: [...root.scope, "write:production-db"] };
  ok("tampering with a signed envelope fails verification", (await verifyEnvelope(tampered)).ok === false);
}
section("2. the ledger write-permission matrix");
{
  ok("agents may NOT write DOCTRINE (propose only)", canWrite("DOCTRINE", "agent").ok === false);
  ok("humans write DOCTRINE", canWrite("DOCTRINE", "human").ok === true);
  ok("agents may NOT install strategies or skills (RECOURSE)", canWrite("RECOURSE", "agent").ok === false);
  ok("the measured experiment writes RECOURSE", canWrite("RECOURSE", "experiment").ok === true);
  ok("measured runs write SCAR", canWrite("SCAR", "agent").ok === true);
  ok("the experiment writes no episodes", canWrite("PRECEDENT", "experiment").ok === false);
}
section("3. the human-principal invariant is mechanical (11.12.3)");
{
  ok("human-format principals pass", isHumanPrincipal("human:runner") && isHumanPrincipal("human:a.b-c_9"));
  ok("agent/empty/ill-formed principals fail the format", !isHumanPrincipal("agent:foo") && !isHumanPrincipal("") && !isHumanPrincipal("human:") && !isHumanPrincipal("Human:runner") && !isHumanPrincipal("human:a b"));
  let threw = false;
  try {
    await issueRootEnvelope({ principal: "agent:foo", scope: ["run:team-mission"], expiresAt: NOW + 1e3, now: NOW });
  } catch (e) {
    threw = String(e).includes("not a human principal");
  }
  ok("issueRootEnvelope REFUSES to sign for a non-human root principal", threw);
  const root = await issueRootEnvelope({ principal: "human:runner", scope: ["run:team-mission", "role:any"], expiresAt: NOW + 1e3 * 60 * 30, now: NOW });
  const forged = { ...root, principal: "agent:foo", delegationChain: ["agent:foo"] };
  const att = await attenuate(forged, "seat:coder", ["role:any"], { now: NOW + 1 });
  ok("attenuation refuses to delegate from a non-human root", att.envelope === null && att.reason.includes("not human-format"), att.reason);
  ok("verification flags a hand-rolled envelope with a non-human principal", (await verifyEnvelope(forged)).ok === false);
}
section("4. governed writes pass through the matrix at the store boundary (11.12.3)");
{
  let doctrineThrow = false;
  try {
    enforceWrite("DOCTRINE", "agent");
  } catch {
    doctrineThrow = true;
  }
  ok("enforceWrite blocks an agent DOCTRINE write", doctrineThrow);
  let recourseThrow = false;
  try {
    enforceWrite("RECOURSE", "agent");
  } catch {
    recourseThrow = true;
  }
  ok("enforceWrite blocks an agent RECOURSE install", recourseThrow);
  let allowed = true;
  try {
    enforceWrite("DOCTRINE", "human");
    enforceWrite("RECOURSE", "experiment");
    enforceWrite("SCAR", "agent");
  } catch {
    allowed = false;
  }
  ok("permitted writers still pass", allowed);
  const approvedSkill = [{ id: "s1", name: "x", description: "", status: "approved", sourceMissionId: "m1", createdAt: NOW }];
  let agentInstallThrow = false;
  try {
    saveSkills(approvedSkill, "agent");
  } catch {
    agentInstallThrow = true;
  }
  ok("saveSkills refuses an agent installing an approved skill", agentInstallThrow);
  let humanInstall = true;
  try {
    saveSkills(approvedSkill, "human");
  } catch {
    humanInstall = false;
  }
  ok("saveSkills allows a human approval to persist", humanInstall);
  let proposalFree = true;
  try {
    saveSkills([{ ...approvedSkill[0], status: "proposed" }], "agent");
  } catch {
    proposalFree = false;
  }
  ok("proposals stay free evidence \u2014 agents may propose, never install", proposalFree);
  const scar = [{ id: "l1", kind: "failure", text: "tsc before commit", evidence: [], createdAt: NOW, useCount: 0 }];
  let agentScar = true;
  try {
    saveLessons(scar, "agent");
  } catch {
    agentScar = false;
  }
  let experimentEpisodeThrow = false;
  try {
    saveLessons(scar, "experiment");
  } catch {
    experimentEpisodeThrow = true;
  }
  ok("measured runs write SCAR; the experiment writes no episodes", agentScar && experimentEpisodeThrow);
  let stanceOk = true;
  try {
    saveBeliefs([], "agent");
  } catch {
    stanceOk = false;
  }
  ok("the runtime persists STANCE", stanceOk);
}
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
