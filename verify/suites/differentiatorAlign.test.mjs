import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/mission/signing.ts
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
var STORAGE_KEY, cached;
var init_signing = __esm({
  "src/mission/signing.ts"() {
    "use strict";
    STORAGE_KEY = "mj.issuerkey.v1";
    cached = null;
  }
});

// src/mission/learningReceipt.ts
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function loadLearningReceipts() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
}
var LS_KEY;
var init_learningReceipt = __esm({
  "src/mission/learningReceipt.ts"() {
    "use strict";
    init_signing();
    LS_KEY = "mj.learningReceipts.v1";
  }
});

// src/mission/custody.ts
var custody_exports = {};
__export(custody_exports, {
  BudgetGate: () => BudgetGate,
  HUMAN_PRINCIPAL_RE: () => HUMAN_PRINCIPAL_RE,
  attenuate: () => attenuate,
  budgetCheck: () => budgetCheck,
  canonicalEnvelopeInput: () => canonicalEnvelopeInput,
  checkEnvelope: () => checkEnvelope,
  isHumanPrincipal: () => isHumanPrincipal,
  issueRootEnvelope: () => issueRootEnvelope,
  revoke: () => revoke,
  verifyEnvelope: () => verifyEnvelope
});
function isHumanPrincipal(p) {
  return HUMAN_PRINCIPAL_RE.test(p);
}
function canonicalEnvelopeInput(e) {
  return JSON.stringify([e.format, e.id, e.principal, e.delegationChain, e.scope, e.issuedAt, e.expiresAt, e.budgetUsd, e.revoked, e.parentId]);
}
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
function budgetCheck(e, spentUsd) {
  if (e.budgetUsd === null) return { ok: true, reason: "uncapped", remainingUsd: null };
  const remaining = e.budgetUsd - spentUsd;
  if (spentUsd >= e.budgetUsd) {
    return { ok: false, reason: `spend authority exhausted \u2014 $${spentUsd.toFixed(4)} spent against a $${e.budgetUsd.toFixed(2)} cap`, remainingUsd: Math.max(0, remaining) };
  }
  return { ok: true, reason: "within budget", remainingUsd: remaining };
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
var HUMAN_PRINCIPAL_RE, seq, BudgetGate;
var init_custody = __esm({
  "src/mission/custody.ts"() {
    "use strict";
    init_learningReceipt();
    init_signing();
    HUMAN_PRINCIPAL_RE = /^human:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
    seq = 0;
    BudgetGate = class {
      constructor(capUsd) {
        this.capUsd = capUsd;
      }
      committed = 0;
      /** Budget not yet committed to running seats. */
      get remaining() {
        return Math.max(0, this.capUsd - this.committed);
      }
      get committedUsd() {
        return this.committed;
      }
      /** ATOMIC: check-and-commit with no await in between. Null when the cap cannot admit this seat. */
      reserve(seatId, amount) {
        if (!Number.isFinite(amount) || amount <= 0) return null;
        if (this.committed + amount > this.capUsd + 1e-9) return null;
        this.committed += amount;
        return { seatId, reservedUsd: amount, settled: false };
      }
      /** Swap the reservation for the REAL charge; reports any per-seat overrun honestly. */
      settle(ticket, actualUsd) {
        if (ticket.settled) return { overrunUsd: 0 };
        this.committed -= ticket.reservedUsd;
        const actual = Math.max(0, Number.isFinite(actualUsd) ? actualUsd : 0);
        this.committed += actual;
        ticket.settled = true;
        return { overrunUsd: Math.max(0, actual - ticket.reservedUsd) };
      }
      /** Give the reservation back (a seat skipped or aborted before charging). */
      release(ticket) {
        if (!ticket.settled) {
          this.committed -= ticket.reservedUsd;
          ticket.settled = true;
        }
      }
    };
  }
});

// probe/differentiatorAlign.test.ts
init_custody();
import * as fs from "node:fs";
import * as path from "node:path";

// src/version.ts
var MJ_VERSION = "11.14.11";
var MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");
var MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;

// src/mission/dossier.ts
init_learningReceipt();

// src/mission/lessons.ts
var LS_KEY2 = "mj.lessons.v1";
function loadLessons() {
  try {
    const raw = localStorage.getItem(LS_KEY2);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.filter((l) => l && typeof l.text === "string");
    }
  } catch {
  }
  return [];
}

// src/mission/selfImprove.ts
var LS_KEY3 = "mj.selfimprove.v1";
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
function loadImprovement() {
  try {
    const raw = localStorage.getItem(LS_KEY3);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.versions) && p.versions.length > 0) return p;
    }
  } catch {
  }
  return initialState(Date.now());
}
function adoptedVersion(s) {
  return s.versions.find((v) => v.id === s.adoptedId) ?? null;
}

// src/mission/skillEvolution.ts
var LS_KEY4 = "mj.skills.v1";
function loadSkills() {
  try {
    const raw = localStorage.getItem(LS_KEY4);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
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
function ledgerSummary(_now) {
  const lessons = loadLessons();
  const scars = lessons.filter((l) => l.kind === "failure");
  const precedent = lessons.filter((l) => l.kind !== "failure");
  const imp = loadImprovement();
  const adopted = imp.versions.find((v) => v.id === imp.adoptedId) ?? null;
  const skills = loadSkills().filter((s) => s.status === "approved").length;
  return {
    stance: "live turn state (session store + heartbeats) \u2014 loaded, never retrieved",
    precedent: { count: precedent.length, newest: precedent[0]?.text ?? null },
    scar: { count: scars.length, scarFirst: true },
    doctrine: {
      items: ["adversarial gate policy (STRICT default)", "learned invariants (human-approved)", "honesty rule: simulated runs teach nothing"],
      writeRule: canWrite("DOCTRINE", "agent").reason
    },
    recourse: { strategyGen: adopted?.gen ?? 1, adoptedNote: adopted?.note ?? null, approvedSkills: skills }
  };
}

// src/mission/belief.ts
var LS_KEY5 = "mj.beliefs.v1";
function needsApproval(b) {
  return b.provenance === "agent-inferred" && b.aboutUser && !b.approved;
}
function loadBeliefs() {
  try {
    const raw = localStorage.getItem(LS_KEY5);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
}

// src/mission/selfEvolveRuntime.ts
init_learningReceipt();
var RUNS_KEY = "mj.selfimprove.runs.v2";
var RUNS_KEY_V1 = "mj.selfimprove.runs.v1";
function loadExperimentRuns() {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
    const old = localStorage.getItem(RUNS_KEY_V1);
    if (old) {
      const p = JSON.parse(old);
      if (Array.isArray(p)) {
        const migrated = p.map((r) => ({ verified: r.verified, simulated: r.simulated, strategyId: null }));
        localStorage.setItem(RUNS_KEY, JSON.stringify(migrated.slice(-100)));
        localStorage.removeItem(RUNS_KEY_V1);
        return migrated;
      }
    }
  } catch {
  }
  return [];
}

// src/mission/dossier.ts
init_learningReceipt();
function dossierCanonical(d) {
  return JSON.stringify([d.format, d.mjVersion, d.generatedAt, d.memory, d.beliefs, d.skills, d.experiment, d.receipts, d.ledger]);
}
async function buildProofDossier(now) {
  const lessons = loadLessons();
  const beliefs = loadBeliefs();
  const skills = loadSkills();
  const imp = loadImprovement();
  const adopted = adoptedVersion(imp);
  const receipts = loadLearningReceipts();
  const payload = {
    format: "mj-dossier/1",
    mjVersion: MJ_VERSION,
    generatedAt: new Date(now).toISOString(),
    memory: {
      scars: lessons.filter((l) => l.kind === "failure").length,
      precedents: lessons.filter((l) => l.kind !== "failure").length,
      scarFirst: true,
      newestLesson: lessons.length > 0 ? lessons[lessons.length - 1].text : null
    },
    beliefs: { total: beliefs.length, pendingApproval: beliefs.filter(needsApproval).length },
    skills: {
      proposed: skills.filter((x) => x.status === "proposed").length,
      approved: skills.filter((x) => x.status === "approved").length
    },
    experiment: {
      strategyVersions: imp.versions.length,
      adopted: adopted ? { id: adopted.id, score: adopted.score ?? null, note: adopted.note ?? null } : null,
      measuredRuns: loadExperimentRuns().length
    },
    receipts: { count: receipts.length, signed: receipts.filter((r) => r.signature).length },
    ledger: ledgerSummary(now)
  };
  const digest = await sha256Hex(dossierCanonical(payload));
  return { ...payload, digest };
}
async function verifyProofDossier(d) {
  if (d.format !== "mj-dossier/1") return { ok: false, reason: `unknown dossier format: ${String(d.format)}` };
  const { digest, ...payload } = d;
  const recomputed = await sha256Hex(dossierCanonical(payload));
  return recomputed === digest ? { ok: true } : { ok: false, reason: "digest mismatch \u2014 the dossier was altered after export" };
}

// probe/differentiatorAlign.test.ts
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
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => void 0,
    removeItem: () => void 0
  };
}
var NOW = 176e10;
var ROOT = ".".length > 0 ? "." : path.resolve(import.meta.dirname ?? ".", "..");
section("1. budget authority \u2014 spend caps are carried by the envelope and enforced");
{
  const root = await issueRootEnvelope({
    principal: "human:runner",
    scope: ["run:team-mission"],
    expiresAt: NOW + 1e3 * 60 * 30,
    budgetUsd: 2.5,
    now: NOW
  });
  ok("a root envelope carries the human's budget cap and verifies", root.budgetUsd === 2.5 && (await verifyEnvelope(root)).ok === true);
  let negThrow = false;
  try {
    await issueRootEnvelope({ principal: "human:runner", scope: [], expiresAt: null, budgetUsd: -1, now: NOW });
  } catch {
    negThrow = true;
  }
  ok("a negative budget is refused before signing", negThrow);
  const tampered = { ...root, budgetUsd: 250 };
  ok("raising the budget cap after signing fails verification", (await verifyEnvelope(tampered)).ok === false);
  const att = await attenuate(root, "seat:coder", ["run:team-mission"], { now: NOW + 1 });
  ok("attenuation inherits the parent's spend cap", att.envelope !== null && att.envelope.budgetUsd === 2.5);
  const grow = await attenuate(root, "seat:evil", ["run:team-mission"], { budgetUsd: 99, now: NOW + 1 });
  ok("a child cannot loosen the spend cap", grow.envelope === null && grow.reason.includes("spend authority never grows"), grow.reason);
  const tight = await attenuate(root, "seat:cheap", ["run:team-mission"], { budgetUsd: 1, now: NOW + 1 });
  ok("a child may tighten the spend cap", tight.envelope !== null && tight.envelope.budgetUsd === 1);
  ok("spend within the cap is allowed, with the remainder reported", budgetCheck(root, 1.25).ok === true && budgetCheck(root, 1.25).remainingUsd === 1.25);
  ok("spend at or beyond the cap is refused", budgetCheck(root, 2.5).ok === false && budgetCheck(root, 3).ok === false);
  const uncapped = await issueRootEnvelope({ principal: "human:runner", scope: [], expiresAt: NOW + 1e3, now: NOW });
  ok("no cap means uncapped \u2014 honestly reported", uncapped.budgetUsd === null && budgetCheck(uncapped, 1e3).ok === true);
  const execSrc = fs.readFileSync(path.join(ROOT, "src/mission/teamExecutor.ts"), "utf8");
  ok(
    "the executor wires budgetCheck: pre-flight refusal AND a per-wave stop",
    /budgetCheck\(req\.rootEnvelope, 0\)/.test(execSrc) && /budgetStop = bc\.reason/.test(execSrc)
  );
  const teamsSrc = fs.readFileSync(path.join(ROOT, "src/pages/TeamsPage.tsx"), "utf8");
  ok(
    "the runner UI exposes the budget cap and feeds it into the root envelope",
    teamsSrc.includes("budgetUsd: budgetCap.trim()") && teamsSrc.includes("Budget Cap")
  );
}
section("2. proof dossier \u2014 policy-to-proof in one digest-stamped file");
{
  const d = await buildProofDossier(NOW);
  ok("the dossier names its format, MJ version, and carries a digest", d.format === "mj-dossier/1" && d.mjVersion.length > 0 && d.digest.length === 64);
  ok("the untouched dossier verifies against its own digest", (await verifyProofDossier(d)).ok === true);
  const forged = { ...d, memory: { ...d.memory, scars: d.memory.scars + 99 } };
  ok("editing one number breaks the dossier's digest", (await verifyProofDossier(forged)).ok === false);
  ok(
    "memory counts are derived, not invented (scars + precedents == lessons held)",
    d.memory.scars + d.memory.precedents === d.ledger.precedent.count + d.ledger.scar.count
  );
  ok(
    "proof-of-learning rides in the dossier: the measured experiment, honestly",
    typeof d.experiment.strategyVersions === "number" && typeof d.experiment.measuredRuns === "number" && (d.experiment.adopted === null || typeof d.experiment.adopted.id === "string")
  );
}
section("3. atomic budget admission \u2014 concurrent seats cannot overshoot (11.13.1)");
{
  const { BudgetGate: BudgetGate2 } = await Promise.resolve().then(() => (init_custody(), custody_exports));
  const gate = new BudgetGate2(2);
  const t1 = gate.reserve("seat:a", 2 / 3);
  const t2 = gate.reserve("seat:b", 2 / 3);
  const t3 = gate.reserve("seat:c", 2 / 3);
  ok("three concurrent seats each reserve a THIRD of the cap \u2014 and only a third", !!t1 && !!t2 && !!t3 && gate.remaining < 1e-9);
  const t4 = gate.reserve("seat:d", 0.01);
  ok("a fourth concurrent seat is REFUSED \u2014 the cap cannot be crossed at dispatch time", t4 === null);
  const s1 = gate.settle(t1, 1);
  ok("settling swaps the reservation for the REAL charge and names the overrun", Math.abs(s1.overrunUsd - (1 - 2 / 3)) < 1e-9 && gate.committedUsd > 1.99);
  const fresh = new BudgetGate2(1);
  const kept = fresh.reserve("x", 0.4);
  fresh.release(kept);
  ok("a released reservation gives its share back to the pool", fresh.remaining === 1);
  const execSrc = fs.readFileSync(path.join(ROOT, "src/mission/teamExecutor.ts"), "utf8");
  ok(
    "the executor admits seats ONLY through reservation before the concurrent dispatch",
    /budgetGate\.reserve\(a\.seat\.id, share\)/.test(execSrc) && execSrc.indexOf("budgetGate.reserve") < execSrc.indexOf("await Promise.all")
  );
  ok(
    "the run report states token-only seats as dollar-UNKNOWN instead of inventing prices",
    execSrc.includes("reported tokens only") && execSrc.includes("tokensOnlySeats")
  );
}
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
