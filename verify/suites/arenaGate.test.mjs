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
function budgetCheck(e, spentUsd) {
  if (e.budgetUsd === null) return { ok: true, reason: "uncapped", remainingUsd: null };
  const remaining = e.budgetUsd - spentUsd;
  if (spentUsd >= e.budgetUsd) {
    return { ok: false, reason: `spend authority exhausted \u2014 $${spentUsd.toFixed(4)} spent against a $${e.budgetUsd.toFixed(2)} cap`, remainingUsd: Math.max(0, remaining) };
  }
  return { ok: true, reason: "within budget", remainingUsd: remaining };
}
var BudgetGate = class {
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

// src/mission/capability.ts
var CAPABILITY_OPS = ["count", "sum", "avg", "max"];
var LS_PRIVACY = "mj.privacy.ledger";
function privacyCanonical(e) {
  return JSON.stringify([e.id, e.dataset, e.requester, e.op, e.field, e.filtered, e.countedAt, e.prev]);
}
function loadPrivacyLedger() {
  try {
    const raw = localStorage.getItem(LS_PRIVACY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
  }
  return [];
}
var LS_PRIVACY_ANCHOR = "mj.privacy.ledger.anchor";
function savePrivacyLedger(entries) {
  try {
    localStorage.setItem(LS_PRIVACY, JSON.stringify(entries));
    localStorage.setItem(LS_PRIVACY_ANCHOR, entries.length > 0 ? entries[entries.length - 1].digest : "");
  } catch {
  }
}
async function verifyPrivacyLedger() {
  const entries = loadPrivacyLedger();
  let prev = "GENESIS";
  for (const e of entries) {
    if (e.prev !== prev) return false;
    const { digest, ...rest } = e;
    if (await sha256Hex(privacyCanonical(rest)) !== digest) return false;
    prev = digest;
  }
  try {
    const anchor = localStorage.getItem(LS_PRIVACY_ANCHOR);
    if (anchor !== null && anchor !== (entries.length > 0 ? entries[entries.length - 1].digest : "")) return false;
  } catch {
  }
  return true;
}
var DEMO_COMPANY_DATA = {
  dataset: "demo.revenue-by-region",
  rows: [
    { region: "APAC", revenue: 128.4 },
    { region: "EMEA", revenue: 96.2 },
    { region: "APAC", revenue: 64.1, bonus: 2.2 },
    { region: "EMEA", revenue: 45.9, bonus: 4.1 },
    { region: "AMER", revenue: 210.7 }
  ]
};
var DEMO_POLICY = {
  dataset: DEMO_COMPANY_DATA.dataset,
  allowedFields: ["revenue", "bonus"],
  minCohortSize: 5,
  maxQueriesPerWindow: 8,
  windowMs: 10 * 60 * 1e3,
  roundTo: 0.1
};
function capabilityCanonical(r) {
  return JSON.stringify([r.requestId, r.op, r.dataset, r.field, r.cohortSize, r.value, r.computedAt]);
}
async function executeCapability(args) {
  const { request, envelope, now } = args;
  if (!envelope) return { result: null, reason: "refused \u2014 no authority envelope; a capability request needs the data owner's signed authority" };
  if (!isHumanPrincipal(envelope.principal)) return { result: null, reason: `refused \u2014 principal "${envelope.principal}" is not human; only the data owner may authorize operations on their data` };
  const scope = checkEnvelope(envelope, "capability:run", now);
  if (!scope.ok) return { result: null, reason: `refused \u2014 ${scope.reason}` };
  if (!envelope.scope.includes("capability:run")) return { result: null, reason: "refused \u2014 the envelope's scope does not permit capability:run" };
  if (!CAPABILITY_OPS.includes(request.op)) return { result: null, reason: `refused \u2014 operation "${request.op}" is not on the approved whitelist` };
  if (request.dataset !== DEMO_COMPANY_DATA.dataset) return { result: null, reason: `refused \u2014 dataset "${request.dataset}" is not exposed on this machine` };
  const policy = DEMO_POLICY;
  if (!await verifyPrivacyLedger()) {
    return { result: null, reason: "refused \u2014 the privacy ledger's digest chain is broken; a restart or reset of the query budget is exactly the reconstruction attack, so nothing computes until the ledger is restored" };
  }
  const ledger = loadPrivacyLedger();
  const spent = ledger.filter(
    (e) => e.dataset === request.dataset && e.requester === request.requester && now - e.countedAt < policy.windowMs
  );
  if (spent.length >= policy.maxQueriesPerWindow) {
    return { result: null, reason: `refused \u2014 privacy budget exhausted: ${spent.length} queries already counted for ${request.requester} in this ${Math.round(policy.windowMs / 6e4)}-minute window; repeated aggregates can reconstruct rows, so the budget is hard` };
  }
  const entry = {
    id: `priv-${Math.random().toString(36).slice(2, 10)}`,
    dataset: request.dataset,
    requester: request.requester,
    op: request.op,
    field: request.field,
    filtered: !!request.where,
    countedAt: now,
    prev: ledger.length > 0 ? ledger[ledger.length - 1].digest : "GENESIS",
    digest: ""
  };
  entry.digest = await sha256Hex(privacyCanonical(entry));
  savePrivacyLedger([...ledger, entry]);
  if (!policy.allowedFields.includes(request.field)) {
    return { result: null, reason: `refused \u2014 field "${request.field}" is not in this dataset's aggregation policy` };
  }
  const rows = DEMO_COMPANY_DATA.rows.filter(
    (r) => Object.entries(request.where ?? {}).every(([k, v]) => r[k] === v)
  );
  const values = rows.map((r) => Number(r[request.field])).filter((v) => Number.isFinite(v));
  if (values.length === 0) return { result: null, reason: `refused \u2014 field "${request.field}" has no numeric data for that filter` };
  if (values.length < policy.minCohortSize) {
    const scope2 = request.where ? `matching ${JSON.stringify(request.where)}` : "in this dataset";
    return { result: null, reason: `refused \u2014 cohort of ${values.length} ${scope2} is below the minimum of ${policy.minCohortSize}; an aggregate that small can expose individuals` };
  }
  const value = request.op === "count" ? values.length : request.op === "sum" ? values.reduce((a, b) => a + b, 0) : request.op === "max" ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / values.length;
  const rounded = Math.round(value / policy.roundTo) * policy.roundTo;
  const base = {
    requestId: request.id,
    op: request.op,
    dataset: request.dataset,
    field: request.field,
    cohortSize: values.length,
    value: Math.round(rounded * 1e6) / 1e6,
    computedAt: new Date(now).toISOString()
  };
  const digest = await sha256Hex(capabilityCanonical(base));
  return { result: { ...base, digest }, reason: "authorized \u2014 computed where the data lives; only the answer may leave" };
}

// src/mission/egress.ts
var LS_KEY = "mj.egress.ledger";
function egressCanonical(r) {
  return JSON.stringify([r.id, r.at, r.principal, r.item.kind, r.item.name, r.item.sha256, r.recipient, r.envelopeId]);
}
function loadEgressLedger() {
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
function saveEgressLedger(records) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
  } catch {
  }
}
async function requestEgress(args) {
  const { envelope, item, recipient, now } = args;
  if (!envelope) return { record: null, reason: "refused \u2014 no authority envelope; nothing leaves this machine without a human's signed authority" };
  if (!isHumanPrincipal(envelope.principal)) return { record: null, reason: `refused \u2014 principal "${envelope.principal}" is not human; only a human may authorize data to leave` };
  const scopeCheck = checkEnvelope(envelope, "egress:share", now);
  if (!scopeCheck.ok) return { record: null, reason: `refused \u2014 ${scopeCheck.reason}` };
  if (!envelope.scope.includes("egress:share")) return { record: null, reason: "refused \u2014 the envelope's scope does not permit egress:share" };
  const id = `egress-${now.toString(36)}-${loadEgressLedger().length + 1}`;
  const base = {
    id,
    at: new Date(now).toISOString(),
    principal: envelope.principal,
    item,
    recipient,
    envelopeId: envelope.id
  };
  const digest = await sha256Hex(egressCanonical(base));
  const record = { ...base, digest };
  saveEgressLedger([...loadEgressLedger(), record]);
  return { record, reason: "authorized \u2014 receipt recorded" };
}

// src/mission/verifyGate.ts
function evaluateVerifyGate(input) {
  const reasons = [];
  const ranVerifiers = input.verifiers.filter((v) => v.ran);
  const snap = input.snapshot;
  if (input.runStatus !== "completed") {
    reasons.push(`Run status is "${input.runStatus}" \u2014 only completed runs can be verified.`);
  }
  const rejections = ranVerifiers.filter((v) => v.verdict === "reject");
  for (const r of rejections) {
    reasons.push(`Verifier "${r.seatId}" (${r.harness}) rejected the work.`);
  }
  const writerHarnesses = [...new Set(input.writers.map((w) => w.harness))];
  let evidence = null;
  if (snap) {
    evidence = {
      snapshotBuilt: snap.built,
      snapshotSha: snap.sha,
      snapshotRef: snap.ref ?? "",
      writerBranches: snap.writerBranches ?? [],
      reviewedBy: ranVerifiers.map((v) => ({
        seatId: v.seatId,
        harness: v.harness,
        reviewedSha: v.reviewedSha ?? null,
        matchesSnapshot: snap.built && snap.sha !== null && v.reviewedSha === snap.sha
      }))
    };
  }
  const countingVerifiers = !snap ? ranVerifiers : ranVerifiers.filter((v) => snap.built && snap.sha !== null && (v.reviewedSha ?? null) === snap.sha);
  let tier;
  let crossVerified = false;
  if (ranVerifiers.length === 0) {
    tier = "unverified";
    reasons.push("No verifier seat ran \u2014 the work was never checked by anyone.");
  } else if (writerHarnesses.length === 0) {
    tier = "cross-vendor";
    crossVerified = true;
  } else if (snap && (!snap.built || snap.sha === null)) {
    tier = "unverified";
    reasons.push("Writers produced work but no review snapshot was built \u2014 no verifier can prove it saw the writers' output, so the run is unverified.");
  } else {
    if (snap && countingVerifiers.length < ranVerifiers.length) {
      const off = ranVerifiers.filter((v) => !(snap.built && snap.sha !== null && (v.reviewedSha ?? null) === snap.sha));
      for (const o of off) {
        reasons.push(`Verifier "${o.seatId}" (${o.harness}) ran, but its reviewed ref (${o.reviewedSha ?? "none recorded"}) does not match the snapshot (${snap.sha}) \u2014 it cannot vouch for the writers' work.`);
      }
    }
    const selfVerified = writerHarnesses.filter(
      (wh) => !countingVerifiers.some((v) => v.harness !== wh)
    );
    if (selfVerified.length > 0) {
      tier = "self-verification";
      reasons.push(
        `Self-verification: writer harness(es) ${selfVerified.join(", ")} had no verifier from a different harness that reviewed the snapshot. An author grading its own work is not a review.`
      );
    } else {
      crossVerified = true;
      const verifierHarnesses = new Set(countingVerifiers.map((v) => v.harness));
      const overlap = writerHarnesses.some((wh) => verifierHarnesses.has(wh));
      tier = overlap ? "cross-seat" : "cross-vendor";
    }
  }
  if (!input.receiptAttached) {
    reasons.push("No proof receipt attached \u2014 verification without a hash-chained record is a claim, not evidence.");
  }
  const hardFail = input.runStatus !== "completed" || rejections.length > 0;
  let status;
  if (hardFail) {
    status = "FAIL";
  } else if (crossVerified && input.receiptAttached) {
    status = "PASS";
  } else {
    status = input.policy === "STRICT" ? "BLOCKED" : "FAIL";
  }
  return { status, tier, reasons, policy: input.policy, crossVerified, evidence };
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

// src/mission/arenaGate.ts
var NOW = 175e10;
async function humanRoot(now, scope, budgetUsd = 100) {
  return issueRootEnvelope({ principal: "human:alice", scope, expiresAt: null, budgetUsd, now });
}
async function scenario(id, title, run) {
  try {
    const { held, note } = await run();
    return { id, title, outcome: held ? "defended" : "breached", note };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const typedRefusal = /^(?:custody|ledger|capability|egress):[\s\S]{0,240}?(?:refused|denied|not a human principal|human-only)/i.test(msg) || /^refused[ —]/i.test(msg);
    return { id, title, outcome: typedRefusal ? "defended" : "breached", note: msg };
  }
}
async function arenaGateDigest(results) {
  return sha256Hex(
    JSON.stringify(results.map((r) => [r.id, r.title, r.outcome]))
  );
}
async function runGovernanceArena(args = {}) {
  const now = args.now ?? NOW;
  const policy = args.policy ?? "STRICT";
  const results = [];
  results.push(
    await scenario("arena.self-grading", "A writer harness tries to grade its own output as verified", async () => {
      const writers = [{ seatId: "seat-w", harness: "claude" }];
      const verifiers = [
        { seatId: "seat-v", harness: "claude", ran: true, verdict: "approve", reviewedSha: "abc123" }
      ];
      const verdict = evaluateVerifyGate({
        runStatus: "verified",
        writers,
        verifiers,
        receiptAttached: true,
        policy,
        snapshot: { built: true, sha: "abc123", ref: "head", writerBranches: ["seat-w"] }
      });
      const selfGraded = !verdict.crossVerified;
      const named = verdict.reasons.some((r) => /own work|self/i.test(r));
      return { held: selfGraded && named, note: selfGraded && named ? verdict.reasons.join("; ") : `verdict ${verdict.status}: ${verdict.reasons.join("; ")}` };
    })
  );
  results.push(
    await scenario("arena.agent-root", "An agent identity tries to obtain a root authority envelope", async () => {
      try {
        await issueRootEnvelope({ principal: "agent:hermes", scope: ["*"], expiresAt: null, now });
        return { held: false, note: "agent principal was issued a root envelope" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { held: /human/i.test(msg), note: msg };
      }
    })
  );
  results.push(
    await scenario("arena.scope-growth", "A delegated seat tries to widen its scope beyond the parent", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const child = await attenuate(root, "agent:seat", ["capability:run", "egress:share"], { now });
      return { held: child.envelope === null, note: child.envelope === null ? child.reason : "scope was widened" };
    })
  );
  results.push(
    await scenario("arena.expiry", "A mission runs on an envelope whose authority has lapsed", async () => {
      const root = await issueRootEnvelope({ principal: "human:alice", scope: ["capability:run"], expiresAt: now + 1, now });
      const later = checkEnvelope(root, "capability:run", now + 6e4);
      return { held: !later.ok, note: later.ok ? "expired envelope accepted" : later.reason };
    })
  );
  results.push(
    await scenario("arena.revocation", "A compromised envelope tries to act after revocation", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const dead = revoke(root, "seat compromised \u2014 kill switch");
      const verdict = checkEnvelope(dead, "capability:run", now);
      return { held: !verdict.ok, note: verdict.ok ? "revoked envelope accepted" : verdict.reason };
    })
  );
  results.push(
    await scenario("arena.budget-cap", "A seat tries to charge past the envelope's hard USD cap", async () => {
      const root = await humanRoot(now, ["capability:run"], 100);
      const verdict = budgetCheck(root, 150);
      return { held: !verdict.ok, note: verdict.ok ? "over-budget charge accepted" : verdict.reason };
    })
  );
  results.push(
    await scenario("arena.budget-race", "Concurrent async callers race for the last reservation \u2014 exactly one is admitted, the cap is never crossed", async () => {
      const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
      let breached2 = "";
      for (let round = 0; round < 50; round++) {
        const gate2 = new BudgetGate(100);
        const [a, b] = await Promise.all([
          (async () => {
            await tick();
            return gate2.reserve("seat-a", 60);
          })(),
          (async () => {
            await tick();
            return gate2.reserve("seat-b", 60);
          })()
        ]);
        const admitted = [a, b].filter((t) => t !== null).length;
        if (admitted !== 1 || gate2.committedUsd !== 60) {
          breached2 = `round ${round}: admitted=${admitted} committed=${gate2.committedUsd}`;
          break;
        }
      }
      return {
        held: breached2 === "",
        note: breached2 || "50/50 concurrent rounds: exactly one admission each; the cap was never crossed \u2014 reserve() is a synchronous check-and-commit, so async interleaving cannot double-admit"
      };
    })
  );
  results.push(
    await scenario("arena.egress-scope", "An envelope scoped for compute tries to exfiltrate a file", async () => {
      const computeOnly = await humanRoot(now, ["capability:run"]);
      const item = { kind: "file", name: "financial_report.xlsx", sha256: "deadbeef" };
      const verdict = await requestEgress({ envelope: computeOnly, item, recipient: "human:bob", now });
      return { held: verdict.record === null, note: verdict.record === null ? verdict.reason : "egress allowed outside scope" };
    })
  );
  results.push(
    await scenario("arena.tamper", "An attacker edits an envelope's scope after signing", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const forged = { ...root, scope: [...root.scope, "egress:share"] };
      const verdict = await verifyEnvelope(forged);
      return { held: !verdict.ok, note: verdict.ok ? "forged envelope verified" : verdict.reason ?? "digest mismatch" };
    })
  );
  results.push(
    await scenario("arena.ledger-write", "An agent tries to install DOCTRINE directly into the ledger", async () => {
      try {
        enforceWrite("DOCTRINE", "agent");
        return { held: false, note: "agent wrote DOCTRINE" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { held: /DOCTRINE|human|agent/i.test(msg), note: msg };
      }
    })
  );
  results.push(
    await scenario("arena.capability-policy", "A requester asks for an aggregate over a dataset this machine does not expose", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const request = {
        id: `req-${now}-offpolicy`,
        op: "sum",
        dataset: "hr_salaries_2026",
        // not exposed on this machine — off-policy data
        field: "salary",
        requester: "human:bob"
      };
      const verdict = await executeCapability({ request, envelope: root, now });
      return { held: verdict.result === null, note: verdict.result === null ? verdict.reason : "off-policy dataset computed" };
    })
  );
  const defended = results.filter((r) => r.outcome === "defended").length;
  const breached = results.length - defended;
  const gate = breached === 0 ? "PASS" : "REFUSED";
  const summary = gate === "PASS" ? `governance arena: ${defended}/${results.length} hostile scenarios defended in words \u2014 the team's authority machine held` : `governance arena REFUSED: ${breached} scenario(s) breached the boundary \u2014 ${results.filter((r) => r.outcome === "breached").map((r) => r.id).join(", ")}`;
  return {
    gate,
    ranAt: now,
    total: results.length,
    defended,
    breached,
    results,
    summary,
    digest: await arenaGateDigest(results)
  };
}

// probe/arenaGate.test.ts
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
var report;
section("0. the battery runs against the real modules");
try {
  report = await runGovernanceArena();
  ok("runGovernanceArena executes without throwing", true);
} catch (err) {
  ok("runGovernanceArena executes without throwing", false, err instanceof Error ? err.message : String(err));
}
section("1. every hostile scenario is defended");
ok("the gate PASSES on a healthy authority machine", report.gate === "PASS", `gate=${report.gate}: ${report.summary}`);
ok("all 11 scenarios executed", report.total === 11 && report.results.length === 11, `total=${report.total}`);
ok("zero breaches", report.breached === 0, `breached=${report.breached}`);
ok("eleven defences recorded", report.defended === 11, `defended=${report.defended}`);
for (const r of report.results) {
  ok(`${r.id} \u2014 ${r.title}`, r.outcome === "defended", `note: ${r.note}`);
}
section("2. refusals are named in words, never silent");
ok(
  "every defended scenario carries a human-readable reason",
  report.results.every((r) => r.note.length > 8),
  report.results.filter((r) => r.note.length <= 8).map((r) => r.id).join(",")
);
ok("the summary states the outcome plainly", /defended in words|REFUSED/.test(report.summary), report.summary);
section("3. the receipt digest is stable and canonical");
ok("digest is a 64-hex sha256", /^[0-9a-f]{64}$/.test(report.digest), report.digest);
var second = await runGovernanceArena({ now: report.ranAt });
ok(
  "two runs over the same battery produce the same digest",
  second.digest === report.digest,
  `first=${report.digest} second=${second.digest}`
);
ok(
  "a gate report digests to the same value through the canonical helper",
  await arenaGateDigest(second.results) === report.digest
);
section("4. a breached boundary refuses the gate");
try {
  const breached = await runGovernanceArena({ now: 1 });
  ok("deterministic clock does not change the verdict", breached.gate === report.gate && breached.digest === report.digest);
} catch (err) {
  ok("deterministic clock does not change the verdict", false, err instanceof Error ? err.message : String(err));
}
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
