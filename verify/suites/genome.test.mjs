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

// src/vouch/ipc/client.ts
var client_exports = {};
__export(client_exports, {
  ipc: () => ipc,
  isNativeHost: () => isNativeHost
});
function isNativeHost() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}
var invoke, ipc;
var init_client = __esm({
  "src/vouch/ipc/client.ts"() {
    "use strict";
    invoke = (cmd, args) => {
      const internals = window.__TAURI_INTERNALS__;
      if (!internals) throw new Error("not in the native host \u2014 no __TAURI_INTERNALS__");
      return internals.invoke(cmd, args);
    };
    ipc = {
      async secretGet(secretRef) {
        return await invoke("secret_get", { secretRef });
      },
      async secretSet(secretRef, value) {
        return await invoke("secret_set", { secretRef, value });
      },
      async notifyApproval(title, body) {
        await invoke("notify_approval", { title, body });
      },
      async appInfo() {
        return await invoke("app_info");
      }
    };
  }
});

// src/vouch/engine/signing.ts
var STORAGE_KEY = "vouch.issuerkey.v1";
var KEYCHAIN_REF = "vouch.issuerkey.v1";
async function keychainBridge() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    return {
      get: async () => {
        try {
          const r = await ipc2.secretGet(KEYCHAIN_REF);
          return r.present && r.value ? r.value : null;
        } catch {
          return null;
        }
      },
      set: async (json) => {
        try {
          const r = await ipc2.secretSet(KEYCHAIN_REF, json);
          return Boolean(r.stored);
        } catch {
          return false;
        }
      }
    };
  } catch {
    return null;
  }
}
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
  const bridge = await keychainBridge();
  try {
    const raw = bridge ? await bridge.get() : globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity = {
          keyId: `vouch-issuer-${stored.publicKeyHex.slice(0, 12)}`,
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
      keyId: `vouch-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const persisted = JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt });
    try {
      if (bridge) await bridge.set(persisted);
    } catch {
    }
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, persisted);
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

// src/vouch/engine/genome.ts
var DEFAULT_HOST_POLICY = {
  permittedClasses: ["read-local", "write-local"]
};
var GENOME_TRANSITIONS = {
  OBSERVED: ["CANDIDATE", "BLOCKED", "QUARANTINED"],
  CANDIDATE: ["UNDER_EVALUATION", "REJECTED", "BLOCKED", "QUARANTINED"],
  UNDER_EVALUATION: ["SHADOW", "REJECTED", "QUARANTINED"],
  SHADOW: ["CANARY", "REJECTED", "QUARANTINED"],
  CANARY: ["ACTIVE", "ROLLED_BACK", "QUARANTINED"],
  ACTIVE: ["DEPRECATED", "ROLLED_BACK", "QUARANTINED"],
  // terminal — no outgoing transitions (quarantine re-review is the exception)
  REJECTED: [],
  BLOCKED: [],
  ROLLED_BACK: [],
  DEPRECATED: [],
  QUARANTINED: ["UNDER_EVALUATION"]
};
var FORWARD_STEP = {
  OBSERVED: "CANDIDATE",
  CANDIDATE: "UNDER_EVALUATION",
  UNDER_EVALUATION: "SHADOW",
  SHADOW: "CANARY",
  CANARY: "ACTIVE"
};
function createGenomeRegistry() {
  return { genomes: /* @__PURE__ */ new Map() };
}
function keyOf(id, version) {
  return `${id}@${version}`;
}
function latestVersion(reg, id) {
  let best = null;
  for (const g of reg.genomes.values()) {
    if (g.id !== id) continue;
    if (TERMINAL_STATES.has(g.status) && g.status !== "QUARANTINED") continue;
    if (!best || g.version > best.version) best = g;
  }
  return best;
}
var TERMINAL_STATES = /* @__PURE__ */ new Set([
  "REJECTED",
  "BLOCKED",
  "ROLLED_BACK",
  "DEPRECATED"
]);
function newGenome(spec, now2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const version = spec.version ?? 1;
  return {
    ...spec,
    version,
    status: "OBSERVED",
    createdAt: now2,
    updatedAt: now2,
    history: [{ ts: now2, from: null, to: "OBSERVED", by: "engine", reason: "observed" }]
  };
}
function registerGenome(reg, genome) {
  const k = keyOf(genome.id, genome.version);
  if (reg.genomes.has(k)) return { ok: false, reason: `${k} already exists` };
  reg.genomes.set(k, genome);
  return { ok: true };
}
function runHardGates(genome, evidence, reg, hostPolicy = DEFAULT_HOST_POLICY, governorGrant = void 0) {
  const verdicts = [];
  const permitted = hostPolicy.permittedClasses.includes(genome.safety.permissionClass);
  const granted = !!governorGrant && governorGrant.by.trim().length > 0 && governorGrant.grantedClass === genome.safety.permissionClass;
  if (permitted) {
    verdicts.push({ gate: "G1-safety", pass: true, reason: `class "${genome.safety.permissionClass}" permitted by host policy` });
  } else if (granted) {
    verdicts.push({ gate: "G1-safety", pass: true, reason: `governor grant by "${governorGrant.by}" for class "${genome.safety.permissionClass}"` });
  } else {
    verdicts.push({
      gate: "G1-safety",
      pass: false,
      reason: genome.safety.externalSideEffects ? `class "${genome.safety.permissionClass}" declares external side effects and no governor grant was presented` : `class "${genome.safety.permissionClass}" is not permitted by this host and no governor grant was presented`
    });
  }
  if (genome.provenance.originType === "distilled") {
    const has = typeof genome.provenance.originReceiptId === "string" && genome.provenance.originReceiptId.trim().length > 0;
    verdicts.push(
      has ? { gate: "G2-provenance", pass: true, reason: `receipt ${genome.provenance.originReceiptId}` } : { gate: "G2-provenance", pass: false, reason: "distilled capability carries no origin receipt" }
    );
  } else if (genome.provenance.originType === "derived") {
    const parent = genome.provenance.lineage;
    const exists = !!parent && reg.genomes.has(keyOf(parent.parent, parent.parentVersion));
    verdicts.push(
      exists ? { gate: "G2-provenance", pass: true, reason: `lineage ${parent.parent}@${parent.parentVersion}` } : { gate: "G2-provenance", pass: false, reason: "derived capability's lineage parent is missing from the registry" }
    );
  } else {
    verdicts.push({ gate: "G2-provenance", pass: true, reason: "observed \u2014 no origin receipt required" });
  }
  const dangling = genome.dependencies.filter((d) => !reg.genomes.has(keyOf(d, 1)) && !hasAnyVersion(reg, d));
  verdicts.push(
    dangling.length === 0 ? { gate: "G3-dependencies", pass: true, reason: "all dependencies resolvable" } : { gate: "G3-dependencies", pass: false, reason: `dangling dependencies: ${dangling.join(", ")}` }
  );
  if (evidence.regressions > 0) {
    verdicts.push({ gate: "G4-regression", pass: false, reason: `${evidence.regressions} regression(s) in the evidence` });
  } else if (genome.evaluation.required && (evidence.passed < 1 || evidence.failed > 0)) {
    verdicts.push({ gate: "G4-regression", pass: false, reason: `evaluation required but evidence is ${evidence.passed} passed / ${evidence.failed} failed` });
  } else {
    verdicts.push({ gate: "G4-regression", pass: true, reason: "no regressions" });
  }
  return verdicts;
}
function hasAnyVersion(reg, id) {
  for (const g of reg.genomes.values()) if (g.id === id) return true;
  return false;
}
function promote(reg, id, evidence, opts = {}) {
  const now2 = opts.now ?? (/* @__PURE__ */ new Date()).toISOString();
  const genome = latestVersion(reg, id);
  if (!genome) return { ok: false, quarantined: false, reason: `no live genome for "${id}"` };
  if (genome.status === "QUARANTINED") {
    return { ok: false, quarantined: true, reason: "quarantined \u2014 only a named governorReopen() may re-enter the chain" };
  }
  const verdicts = runHardGates(genome, evidence, reg, opts.hostPolicy ?? DEFAULT_HOST_POLICY, opts.governorGrant);
  const failed2 = verdicts.find((v) => !v.pass);
  if (failed2) {
    const from2 = genome.status;
    genome.status = "QUARANTINED";
    genome.updatedAt = now2;
    genome.history.push({ ts: now2, from: from2, to: "QUARANTINED", by: "engine", reason: `${failed2.gate}: ${failed2.reason}` });
    return { ok: false, quarantined: true, from: from2, to: "QUARANTINED", failedGate: failed2.gate, reason: failed2.reason };
  }
  const forward = FORWARD_STEP[genome.status];
  if (!forward) {
    return { ok: false, quarantined: false, reason: `state ${genome.status} has no forward promotion \u2014 the line ends at ACTIVE; evolution is a child (deriveChild), not a re-promotion` };
  }
  const from = genome.status;
  genome.status = forward;
  genome.lastEvidence = evidence;
  genome.updatedAt = now2;
  genome.history.push({ ts: now2, from, to: forward, by: "engine", reason: "all hard gates passed" });
  if (forward === "ACTIVE") {
    const t2 = trustGrade(reg, id);
    return { ok: true, quarantined: false, from, to: forward, reason: "promoted to ACTIVE", grade: t2.grade };
  }
  return { ok: true, quarantined: false, from, to: forward, reason: `promoted to ${forward}` };
}
function governorReopen(reg, id, by, now2 = (/* @__PURE__ */ new Date()).toISOString()) {
  if (by.trim().length === 0) return { ok: false, quarantined: false, reason: "a reopen needs the governor's identity" };
  const genome = latestVersion(reg, id);
  if (!genome) return { ok: false, quarantined: false, reason: `no genome for "${id}"` };
  if (genome.status !== "QUARANTINED") return { ok: false, quarantined: false, reason: `genome is ${genome.status}, not QUARANTINED` };
  const from = genome.status;
  genome.status = "UNDER_EVALUATION";
  genome.updatedAt = now2;
  genome.history.push({ ts: now2, from, to: "UNDER_EVALUATION", by: `governor:${by}`, reason: "quarantine re-review: full re-evaluation required" });
  return { ok: true, quarantined: false, from, to: "UNDER_EVALUATION", reason: "reopened by governor into UNDER_EVALUATION" };
}
function receiptChain(reg, g, seen = /* @__PURE__ */ new Set()) {
  const k = keyOf(g.id, g.version);
  if (seen.has(k)) return false;
  seen.add(k);
  if (g.provenance.originType === "distilled") return !!g.provenance.originReceiptId;
  if (g.provenance.originType === "derived") {
    const l = g.provenance.lineage;
    if (!l) return false;
    const parent = reg.genomes.get(keyOf(l.parent, l.parentVersion));
    return parent ? receiptChain(reg, parent, seen) : false;
  }
  return false;
}
function trustGrade(reg, id) {
  const g = latestVersion(reg, id);
  return g ? trustGradeOf(reg, g) : { grade: "C0", basis: "unknown capability" };
}
function trustGradeOf(reg, g) {
  if (!receiptChain(reg, g)) {
    if (g.lastEvidence?.replayed) return { grade: "C2", basis: "observed + replayed, no receipt chain" };
    return { grade: "C1", basis: "observed locally" };
  }
  if (!g.lastEvidence?.replayed) return { grade: "C2", basis: "receipt chain held, not yet replayed" };
  const seats = Math.max(g.provenance.verifiedSeats ?? 0, g.lastEvidence?.crossVerifiedSeats ?? 0);
  if (seats < 2) return { grade: "C3", basis: "receipt chain + replay, single seat" };
  if (g.status === "ACTIVE" && g.provenance.lineage) {
    const parent = reg.genomes.get(keyOf(g.provenance.lineage.parent, g.provenance.lineage.parentVersion));
    if (parent && parent.status === "ACTIVE") {
      const p = trustGradeOf(reg, parent);
      if (p.grade === "C3" || p.grade === "C4" || p.grade === "C5") {
        return { grade: "C5", basis: `ACTIVE child of ACTIVE ${p.grade} parent ${parent.id}` };
      }
    }
  }
  return { grade: "C4", basis: "receipt chain + replay + multi-seat verification" };
}
function monitor(reg, id, evidence, now2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const g = latestVersion(reg, id);
  if (!g || g.status !== "ACTIVE") return { rolledBack: false, reason: "not ACTIVE \u2014 nothing to monitor" };
  if (evidence.regressions > 0) {
    const r = rollbackActive(reg, id, `monitoring detected ${evidence.regressions} regression(s)`, now2);
    return { rolledBack: r.ok, reason: r.reason };
  }
  return { rolledBack: false, reason: "no regressions \u2014 stays ACTIVE" };
}
function rollbackActive(reg, id, reason, now2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const g = latestVersion(reg, id);
  if (!g) return { ok: false, reason: `no genome for "${id}"` };
  if (g.status !== "ACTIVE") return { ok: false, reason: `genome is ${g.status}, not ACTIVE` };
  g.status = "ROLLED_BACK";
  g.updatedAt = now2;
  g.history.push({ ts: now2, from: "ACTIVE", to: "ROLLED_BACK", by: "engine", reason });
  return { ok: true, reason: `rolled back: ${reason}` };
}
function currentFor(reg, id) {
  let best = null;
  for (const g of reg.genomes.values()) {
    if (g.id !== id || g.status !== "ACTIVE") continue;
    if (!best || g.version > best.version) best = g;
  }
  return best;
}
function deriveChild(reg, id, changes, now2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const parent = latestVersion(reg, id);
  if (!parent) return { ok: false, reason: `no live genome for "${id}"` };
  const child = {
    ...parent,
    ...changes,
    version: parent.version + 1,
    status: "CANDIDATE",
    lastEvidence: void 0,
    provenance: {
      ...parent.provenance,
      originType: "derived",
      lineage: { parent: parent.id, parentVersion: parent.version }
    },
    createdAt: now2,
    updatedAt: now2,
    history: [{ ts: now2, from: null, to: "CANDIDATE", by: "engine", reason: `evolved from ${parent.id}@${parent.version}` }]
  };
  const r = registerGenome(reg, child);
  if (!r.ok) return r;
  return { ok: true, genome: child };
}
function canonicalJson(value) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) {
        out[k] = walk(v[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}
async function sha256hex(s) {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function buildCapabilityPackage(genome, now2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const digest = await sha256hex(canonicalJson(genome));
  const signature = await signHexDigest(digest);
  return { format: "vh-capability-package/1", genome, digest, signature, issuedAt: now2 };
}
async function verifyCapabilityPackage(pkg) {
  const reasons = [];
  if (pkg.format !== "vh-capability-package/1") reasons.push(`unknown format "${pkg.format}"`);
  const recomputed = await sha256hex(canonicalJson(pkg.genome));
  if (recomputed !== pkg.digest) reasons.push("digest mismatch \u2014 the genome was modified after sealing");
  let signed = false;
  if (pkg.signature) {
    signed = true;
    const ok2 = await verifyIssuerSignature(pkg.digest, pkg.signature.sigHex, pkg.signature.publicKeyHex);
    if (!ok2) reasons.push("issuer signature does not verify");
  }
  return { ok: reasons.length === 0, reasons, signed };
}
async function importPackage(reg, pkg, now2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const v = await verifyCapabilityPackage(pkg);
  if (!v.ok) return { ok: false, reason: v.reasons.join("; ") };
  const incoming = pkg.genome;
  let version = incoming.version;
  while (reg.genomes.has(keyOf(incoming.id, version))) version += 1;
  const genome = {
    ...incoming,
    version,
    status: "UNDER_EVALUATION",
    createdAt: now2,
    updatedAt: now2,
    history: [
      ...incoming.history,
      { ts: now2, from: incoming.status, to: "UNDER_EVALUATION", by: `package:${pkg.signature?.keyId ?? "unsigned"}`, reason: "imported \u2014 trust is earned per host; full re-evaluation required" }
    ]
  };
  const r = registerGenome(reg, genome);
  if (!r.ok) return r;
  return { ok: true, genome };
}
function exportGenomeLedger(reg, now2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const snapshot = {
    format: "vh-genome-ledger/1",
    exportedAt: now2,
    genomes: Array.from(reg.genomes.values()).sort((a, b) => a.id === b.id ? a.version - b.version : a.id < b.id ? -1 : 1)
  };
  return JSON.stringify(snapshot, null, 2);
}
function importGenomeLedger(text) {
  const reg = createGenomeRegistry();
  const parsed = JSON.parse(text);
  if (parsed?.format !== "vh-genome-ledger/1") throw new Error("not a vh-genome-ledger/1 document");
  for (const g of parsed.genomes ?? []) reg.genomes.set(keyOf(g.id, g.version), g);
  return reg;
}
function genomeFromVouchSkill(skill, now2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const failureModes = [`failure in the wrapped tool "${skill.tool}"`];
  if (skill.flagged) failureModes.push("flagged for review by feedback before genome conversion (avg score <= 2 or an unsafe report)");
  return newGenome(
    {
      id: `cap.skill.${skill.id}`,
      objective: {
        current: skill.when,
        improve: "execute the verified procedure without re-planning every run"
      },
      trigger: skill.when,
      procedure: [...skill.steps],
      inputs: [],
      outputs: [],
      dependencies: [],
      resourceLimits: { maxSteps: skill.steps.length * 4 },
      failureModes,
      evaluation: { required: true, gate: "hard" },
      safety: {
        permissionClass: skill.tool === "dispatch_mission" ? "write-local" : "read-local",
        externalSideEffects: false
      },
      provenance: {
        originType: "distilled",
        originReceiptId: skill.bornReceiptId,
        verifiedSeats: skill.mission?.verifiedSeats ?? 0
      }
    },
    now2
  );
}

// probe/genome.test.ts
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
var T0 = "2026-09-10T00:00:00.000Z";
var t = 0;
var now = () => new Date(Date.parse(T0) + ++t * 1e3).toISOString();
var goodEvidence = () => ({
  evaluated: 4,
  passed: 4,
  failed: 0,
  regressions: 0,
  avgScore: 4.5,
  replayed: true,
  crossVerifiedSeats: 1
});
var makeGenome = (over = {}) => newGenome(
  {
    id: "cap.demo",
    objective: { current: "re-plan every run", improve: "skip the re-plan when the trigger matches" },
    trigger: "when the request matches the verified pattern",
    procedure: ["match the trigger", "run the verified steps", "verify the output"],
    inputs: ["request"],
    outputs: ["result"],
    dependencies: [],
    resourceLimits: { maxSteps: 12 },
    failureModes: ["tool errors", "trigger drift"],
    evaluation: { required: true, gate: "hard" },
    safety: { permissionClass: "read-local", externalSideEffects: false },
    provenance: { originType: "observed" },
    ...over
  },
  now()
);
async function main() {
  section("canonical JSON is byte-stable (key order never leaks into the digest)");
  const a = { z: 1, b: [{ d: 2, c: 3 }], a: "x" };
  const b = { a: "x", b: [{ c: 3, d: 2 }], z: 1 };
  ok("shuffled keys serialize identically", canonicalJson(a) === canonicalJson(b), canonicalJson(a));
  ok("and it is compact + sorted", canonicalJson(a) === '{"a":"x","b":[{"c":3,"d":2}],"z":1}', canonicalJson(a));
  section("the \xA731 state machine is exactly the spec's table");
  const pin = {
    OBSERVED: ["CANDIDATE", "BLOCKED", "QUARANTINED"],
    CANDIDATE: ["UNDER_EVALUATION", "REJECTED", "BLOCKED", "QUARANTINED"],
    UNDER_EVALUATION: ["SHADOW", "REJECTED", "QUARANTINED"],
    SHADOW: ["CANARY", "REJECTED", "QUARANTINED"],
    CANARY: ["ACTIVE", "ROLLED_BACK", "QUARANTINED"],
    ACTIVE: ["DEPRECATED", "ROLLED_BACK", "QUARANTINED"],
    REJECTED: [],
    BLOCKED: [],
    ROLLED_BACK: [],
    DEPRECATED: [],
    QUARANTINED: ["UNDER_EVALUATION"]
  };
  let tableOk = Object.keys(pin).length === Object.keys(GENOME_TRANSITIONS).length;
  for (const [s, tos] of Object.entries(pin)) {
    const got = GENOME_TRANSITIONS[s];
    if (!got || got.length !== tos.length || tos.some((x) => !got.includes(x))) tableOk = false;
  }
  ok("all 11 states, exact outgoing sets (incl. the five negative states)", tableOk, JSON.stringify(GENOME_TRANSITIONS));
  ok(
    "every negative state is terminal except QUARANTINED's governance reopen",
    ["REJECTED", "BLOCKED", "ROLLED_BACK", "DEPRECATED"].every((s) => GENOME_TRANSITIONS[s].length === 0) && GENOME_TRANSITIONS.QUARANTINED.length === 1
  );
  section("a clean capability climbs OBSERVED -> ACTIVE through all five gates");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ provenance: { originType: "observed" } }));
    const chain = [];
    for (let i = 0; i < 5; i++) {
      const r = promote(reg, "cap.demo", goodEvidence(), { now: now() });
      ok(`step ${i + 1}: ${r.from} -> ${r.to}`, r.ok && !r.quarantined && r.to !== void 0, r.reason);
      if (r.to) chain.push(r.to);
    }
    ok(
      "landed exactly OBSERVED,CANDIDATE,UNDER_EVALUATION,SHADOW,CANARY,ACTIVE",
      chain.join(",") === "CANDIDATE,UNDER_EVALUATION,SHADOW,CANARY,ACTIVE",
      chain.join(",")
    );
    const g = latestVersion(reg, "cap.demo");
    ok(
      "history is append-only and complete (6 entries, first is the birth)",
      !!g && g.history.length === 6 && g.history[0].from === null && g.history[0].to === "OBSERVED",
      g ? String(g.history.length) : "missing"
    );
  }
  section("\xA732-33 \u2014 a capability may not control its own safety authority");
  {
    const reg = createGenomeRegistry();
    const g = makeGenome({ id: "cap.netcall", safety: { permissionClass: "external", externalSideEffects: true } });
    registerGenome(reg, g);
    const r1 = promote(reg, "cap.netcall", goodEvidence(), { now: now() });
    ok(
      "external side effects with no governor grant -> QUARANTINED at G1",
      !r1.ok && r1.quarantined && r1.failedGate === "G1-safety" && latestVersion(reg, "cap.netcall")?.status === "QUARANTINED",
      r1.reason
    );
    const forged = makeGenome({
      id: "cap.forged",
      safety: { permissionClass: "external", externalSideEffects: true },
      provenance: { originType: "observed", originReceiptId: "rcpt-look-so-official" }
    });
    forged.governorGrant = {
      by: "the-capability-itself",
      grantedClass: "external",
      scope: "i grant myself",
      ts: now()
    };
    registerGenome(reg, forged);
    const verdicts = runHardGates(forged, goodEvidence(), reg);
    ok(
      "a grant embedded in the genome's own fields is INVISIBLE to G1",
      verdicts.find((v) => v.gate === "G1-safety")?.pass === false,
      JSON.stringify(verdicts.find((v) => v.gate === "G1-safety"))
    );
    const r2 = promote(reg, "cap.forged", goodEvidence(), { now: now() });
    ok("...so the forged genome quarantines, not activates", r2.quarantined && r2.failedGate === "G1-safety", r2.reason);
    const legit = makeGenome({ id: "cap.granted", safety: { permissionClass: "external", externalSideEffects: true } });
    registerGenome(reg, legit);
    const grant = { by: "governor:hq", grantedClass: "external", scope: "release traffic shaping", ts: now() };
    let to;
    for (let i = 0; i < 5; i++) to = promote(reg, "cap.granted", goodEvidence(), { governorGrant: grant, now: now() }).to;
    ok("the SAME genome with a real separate-authority grant climbs to ACTIVE", to === "ACTIVE");
    const later = makeGenome({ id: "cap.expire", safety: { permissionClass: "external", externalSideEffects: true } });
    registerGenome(reg, later);
    promote(reg, "cap.expire", goodEvidence(), { governorGrant: grant, now: now() });
    const r3 = promote(reg, "cap.expire", goodEvidence(), { now: now() });
    ok("withhold the grant on the next step and it quarantines again", r3.quarantined && r3.failedGate === "G1-safety", r3.reason);
  }
  section("G2 provenance \u2014 no orphan capabilities");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.orphan", provenance: { originType: "distilled" } }));
    const r = promote(reg, "cap.orphan", goodEvidence(), { now: now() });
    ok("distilled without an origin receipt quarantines at G2", r.quarantined && r.failedGate === "G2-provenance", r.reason);
    registerGenome(reg, makeGenome({ id: "cap.dangling", provenance: { originType: "derived", lineage: { parent: "cap.nobody", parentVersion: 1 } } }));
    const r2 = promote(reg, "cap.dangling", goodEvidence(), { now: now() });
    ok("derived with a missing parent quarantines at G2", r2.quarantined && r2.failedGate === "G2-provenance", r2.reason);
  }
  section("G3 dependencies \u2014 a capability cannot lean on a capability that isn't there");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.dep", dependencies: ["cap.ghost"] }));
    const r = promote(reg, "cap.dep", goodEvidence(), { now: now() });
    ok("dangling dependency quarantines at G3", r.quarantined && r.failedGate === "G3-dependencies", r.reason);
  }
  section("G4 regression \u2014 zero regressions, always");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.regr" }));
    const r = promote(reg, "cap.regr", { ...goodEvidence(), regressions: 2 }, { now: now() });
    ok("two regressions in the evidence -> quarantined", r.quarantined && r.failedGate === "G4-regression", r.reason);
    const reg2 = createGenomeRegistry();
    registerGenome(reg2, makeGenome({ id: "cap.never", evaluation: { required: true, gate: "hard" } }));
    const r2 = promote(reg2, "cap.never", { ...goodEvidence(), evaluated: 3, passed: 0, failed: 3 }, { now: now() });
    ok("evaluation required but 0 passed -> quarantined", r2.quarantined && r2.failedGate === "G4-regression", r2.reason);
  }
  section("\xA770 trust grades C0-C5 come from the provenance chain, never from claims");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.t1", provenance: { originType: "observed" } }));
    ok("observed, nothing else -> C1", trustGrade(reg, "cap.t1").grade === "C1", trustGrade(reg, "cap.t1").basis);
    promote(reg, "cap.t1", { ...goodEvidence(), replayed: true, crossVerifiedSeats: 1 }, { now: now() });
    ok("+ replayed -> C2", trustGrade(reg, "cap.t1").grade === "C2", trustGrade(reg, "cap.t1").basis);
    const reg2 = createGenomeRegistry();
    registerGenome(reg2, makeGenome({ id: "cap.t2", provenance: { originType: "distilled", originReceiptId: "rcpt-1" } }));
    ok("distilled + receipt but not replayed -> C2 (receipt held)", trustGrade(reg2, "cap.t2").grade === "C2", trustGrade(reg2, "cap.t2").basis);
    for (let i = 0; i < 5; i++) promote(reg2, "cap.t2", goodEvidence(), { now: now() });
    ok(
      "...climbed to ACTIVE on one seat -> C3",
      latestVersion(reg2, "cap.t2")?.status === "ACTIVE" && trustGrade(reg2, "cap.t2").grade === "C3",
      trustGrade(reg2, "cap.t2").basis
    );
    const reg3 = createGenomeRegistry();
    registerGenome(reg3, makeGenome({ id: "cap.t3", provenance: { originType: "distilled", originReceiptId: "rcpt-3", verifiedSeats: 2 } }));
    for (let i = 0; i < 5; i++) promote(reg3, "cap.t3", { ...goodEvidence(), crossVerifiedSeats: 2 }, { now: now() });
    ok("receipt + replay + two seats -> C4", trustGrade(reg3, "cap.t3").grade === "C4", trustGrade(reg3, "cap.t3").basis);
    const child = deriveChild(reg3, "cap.t3", { procedure: ["tighter steps"] }, now());
    ok(
      "evolution makes a CHILD (version+1, CANDIDATE, derived lineage) \u2014 the parent is untouched",
      child.ok && child.genome?.version === 2 && child.genome?.status === "CANDIDATE" && child.genome?.provenance.originType === "derived" && child.genome?.provenance.lineage?.parentVersion === 1 && latestVersion(reg3, "cap.t3")?.version === 2,
      child.reason ?? ""
    );
    for (let i = 0; i < 4; i++) promote(reg3, "cap.t3", { ...goodEvidence(), crossVerifiedSeats: 2 }, { now: now() });
    ok(
      "child climbed to ACTIVE over an ACTIVE C3+ parent -> C5",
      latestVersion(reg3, "cap.t3")?.status === "ACTIVE" && trustGrade(reg3, "cap.t3").grade === "C5",
      trustGrade(reg3, "cap.t3").basis
    );
  }
  section("\xA745 auto-rollback \u2014 regressions in production roll back without a human");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.live" }));
    for (let i = 0; i < 5; i++) promote(reg, "cap.live", goodEvidence(), { now: now() });
    ok("v1 is ACTIVE and is the current capability", currentFor(reg, "cap.live")?.version === 1);
    const child = deriveChild(reg, "cap.live", { procedure: ["new risky steps"] }, now());
    for (let i = 0; i < 4; i++) promote(reg, "cap.live", goodEvidence(), { now: now() });
    ok("v2 evolved and promoted to ACTIVE", currentFor(reg, "cap.live")?.version === 2);
    const m = monitor(reg, "cap.live", { ...goodEvidence(), regressions: 1 }, now());
    ok(
      "one regression in monitoring -> v2 rolled back automatically",
      m.rolledBack && reg.genomes.get("cap.live@2")?.status === "ROLLED_BACK",
      m.reason
    );
    ok(
      "the host FALLS BACK to v1 instead of failing (roll back, don't fail)",
      currentFor(reg, "cap.live")?.version === 1,
      `current=${currentFor(reg, "cap.live")?.version ?? "null"}`
    );
    const explicit = rollbackActive(reg, "cap.live", "governor pulled it", now());
    ok(
      "an explicit governor rollback also works and lands in ROLLED_BACK (terminal for that version)",
      explicit.ok && reg.genomes.get("cap.live@1")?.status === "ROLLED_BACK"
    );
    ok("after v1 rolls back, nothing is current \u2014 the host says 'off', not 'old'", currentFor(reg, "cap.live") === null);
  }
  section("only a named governor reopens a quarantine \u2014 and it re-climbs from UNDER_EVALUATION");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.q", provenance: { originType: "distilled" } }));
    promote(reg, "cap.q", goodEvidence(), { now: now() });
    const sneaky = promote(reg, "cap.q", goodEvidence(), { now: now() });
    ok("the promotion path itself refuses to lift a quarantine", !sneaky.ok && sneaky.quarantined && sneaky.reason.includes("governorReopen"), sneaky.reason);
    const anon = governorReopen(reg, "cap.q", "  ");
    ok("an anonymous reopen is refused", !anon.ok, anon.reason);
    const reopen = governorReopen(reg, "cap.q", "governor:hq", now());
    ok(
      "a named governor reopens into UNDER_EVALUATION (not into CANARY)",
      reopen.ok && reopen.to === "UNDER_EVALUATION",
      reopen.reason
    );
    const g = latestVersion(reg, "cap.q");
    ok(
      "...and it still fails G2 on the next step, because the receipt is still missing",
      promote(reg, "cap.q", goodEvidence(), { now: now() }).failedGate === "G2-provenance" && g?.status === "QUARANTINED"
    );
  }
  section("\xA740 signed capability package \u2014 digest-sealed, issuer-signed, tamper-evident");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.pkg", provenance: { originType: "distilled", originReceiptId: "rcpt-pkg" } }));
    for (let i = 0; i < 5; i++) promote(reg, "cap.pkg", goodEvidence(), { now: now() });
    const genome = latestVersion(reg, "cap.pkg");
    const pkg = await buildCapabilityPackage(genome, now());
    ok("package is digest-sealed over the canonical genome", /^[0-9a-f]{64}$/.test(pkg.digest) && pkg.format === "vh-capability-package/1");
    const v = await verifyCapabilityPackage(pkg);
    ok("a sealed package verifies" + (v.signed ? " WITH the issuer signature" : " (unsigned: signing unsupported here)"), v.ok, v.reasons.join("; "));
    if (signingSupported()) {
      ok(
        "on this host the package carries a real Ed25519 signature from the receipt keychain",
        v.signed && !!pkg.signature && pkg.signature.alg === "EdDSA" && pkg.signature.keyId.startsWith("vouch-issuer-")
      );
    }
    const tampered = { ...pkg, genome: { ...pkg.genome, procedure: [...pkg.genome.procedure, "steal the budget"] } };
    const vt = await verifyCapabilityPackage(tampered);
    ok(
      "one extra procedure step after sealing -> digest mismatch, verification FAILS",
      !vt.ok && vt.reasons.some((r) => r.includes("digest mismatch")),
      vt.reasons.join("; ")
    );
  }
  section("an import re-earns its trust on THIS host \u2014 it lands in UNDER_EVALUATION");
  {
    const donor = createGenomeRegistry();
    registerGenome(donor, makeGenome({ id: "cap.imported", provenance: { originType: "distilled", originReceiptId: "rcpt-i" } }));
    for (let i = 0; i < 5; i++) promote(donor, "cap.imported", goodEvidence(), { now: now() });
    const pkg = await buildCapabilityPackage(latestVersion(donor, "cap.imported"), now());
    const mine = createGenomeRegistry();
    const r = await importPackage(mine, pkg, now());
    ok("a verified ACTIVE package imports cleanly", r.ok, r.reason ?? "");
    ok(
      "...but it lands in UNDER_EVALUATION, not ACTIVE (trust is earned per host)",
      r.genome?.status === "UNDER_EVALUATION",
      r.genome?.status
    );
    ok("nothing is current for the host until it re-climbs the chain", currentFor(mine, "cap.imported") === null);
    const bogus = { ...pkg, digest: "0".repeat(64) };
    const rb = await importPackage(mine, bogus, now());
    ok("a corrupted package is refused at import", !rb.ok && (rb.reason ?? "").includes("digest mismatch"), rb.reason ?? "");
  }
  section("M4 bridge \u2014 a VouchSkill is a genome, with its lineage intact");
  {
    const skill = {
      id: "s42",
      name: "kitchen sink",
      version: 3,
      when: "dispatching a mission like: repaint the hallway",
      steps: ["verify the seats", "dispatch the team", "check the receipts"],
      tool: "dispatch_mission",
      bornReceiptId: "rcpt-m4-42",
      runs: 7,
      wins: 6,
      avgScore: 4.3,
      flagged: false,
      updatedAt: T0,
      mission: { missionId: "m9", team: "t1", verifiedSeats: 2, seatCount: 3, cycleNo: 4 }
    };
    const g = genomeFromVouchSkill(skill, now());
    ok("trigger/steps/tool map to the genome shape", g.trigger === skill.when && g.procedure.length === 3 && g.safety.permissionClass === "write-local");
    ok(
      "bornReceiptId becomes the origin receipt (provenance is NOT lost in the bridge)",
      g.provenance.originType === "distilled" && g.provenance.originReceiptId === "rcpt-m4-42"
    );
    ok("mission seats become verified seats (trust input survives)", g.provenance.verifiedSeats === 2);
    ok(
      "an M4-distilled skill with a receipt climbs to ACTIVE at C4 \u2014 its 2 verified seats survive the bridge",
      (() => {
        const reg = createGenomeRegistry();
        registerGenome(reg, g);
        for (let i = 0; i < 5; i++) promote(reg, g.id, goodEvidence(), { now: now() });
        return latestVersion(reg, g.id)?.status === "ACTIVE" && trustGrade(reg, g.id).grade === "C4";
      })()
    );
    const flagged = genomeFromVouchSkill({ ...skill, id: "s43", flagged: true }, now());
    ok(
      "a flagged skill arrives with the flag in its declared failure modes \u2014 it cannot quietly arrive clean",
      flagged.failureModes.some((f) => f.includes("flagged for review"))
    );
  }
  section("the registry survives a file round-trip byte-for-byte (canonical)");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.led" }));
    for (let i = 0; i < 2; i++) promote(reg, "cap.led", goodEvidence(), { now: now() });
    const text = exportGenomeLedger(reg, now());
    const back = importGenomeLedger(text);
    const same = canonicalJson(Array.from(back.genomes.values()).sort((x, y) => x.id.localeCompare(y.id))) === canonicalJson(Array.from(reg.genomes.values()).sort((x, y) => x.id.localeCompare(y.id)));
    ok("export -> import -> identical canonical state (history included)", same);
    let threw = false;
    try {
      importGenomeLedger(JSON.stringify({ format: "something-else" }));
    } catch {
      threw = true;
    }
    ok("a foreign document is refused, not guessed", threw);
  }
  section("ACTIVE has no arrow out of the promotion path \u2014 evolution is a child, not a re-promotion");
  {
    const reg = createGenomeRegistry();
    registerGenome(reg, makeGenome({ id: "cap.term" }));
    for (let i = 0; i < 5; i++) promote(reg, "cap.term", goodEvidence(), { now: now() });
    ok("v1 is ACTIVE", latestVersion(reg, "cap.term")?.status === "ACTIVE");
    const r = promote(reg, "cap.term", goodEvidence(), { now: now() });
    ok(
      "a second promote on the same version is refused \u2014 the chain ends at ACTIVE",
      !r.ok && r.reason.includes("no forward promotion"),
      r.reason
    );
    ok("...and the registry still has exactly one version", reg.genomes.size === 1, String(reg.genomes.size));
  }
}
main().then(() => {
  console.log(`
${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}).catch((e) => {
  console.error("probe crashed:", e);
  process.exit(1);
});
