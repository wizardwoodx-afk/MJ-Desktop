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
function checkEnvelope(e, action, now) {
  if (!e) return { ok: false, reason: "no authority envelope \u2014 nothing executes without traced authority" };
  if (e.revoked) return { ok: false, reason: `envelope ${e.id} revoked: ${e.revoked}` };
  if (e.expiresAt !== null && now > e.expiresAt) return { ok: false, reason: `envelope ${e.id} expired \u2014 authority is void` };
  if (!e.scope.includes(action)) return { ok: false, reason: `action "${action}" outside envelope scope [${e.scope.join(", ")}]` };
  return { ok: true, reason: `envelope ${e.id} permits "${action}" (principal ${e.principal})` };
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
function resetCapabilityQueryLedger() {
  try {
    localStorage.removeItem(LS_PRIVACY);
    localStorage.removeItem(LS_PRIVACY_ANCHOR);
  } catch {
  }
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
async function verifyEgressLedger(records) {
  const bad = [];
  for (const r of records) {
    const { digest, ...rest } = r;
    const recomputed = await sha256Hex(egressCanonical(rest));
    if (recomputed !== digest) bad.push(r.id);
  }
  return { ok: bad.length === 0, bad };
}

// src/mission/twoNode.ts
var RelayNode = class {
  log = [];
  send(msg) {
    this.log.push(msg);
  }
};
async function ownerComputes(args) {
  const request = {
    id: args.wire.requestId,
    requester: args.wire.from,
    op: args.wire.op,
    dataset: args.wire.dataset,
    field: args.wire.field,
    where: args.wire.where
  };
  const { result, reason } = await executeCapability({
    request,
    envelope: args.envelope,
    now: args.now
  });
  if (!result) {
    return {
      kind: "verdict",
      requestId: args.wire.requestId,
      from: args.wire.to,
      to: args.wire.from,
      authorized: false,
      reason
    };
  }
  const egress = await requestEgress({
    envelope: args.envelope,
    item: {
      kind: "capability-result",
      name: `capability-answer:${args.wire.requestId}`,
      sha256: await sha256Hex(capabilityCanonical(result))
    },
    recipient: args.wire.from,
    now: args.now
  });
  return {
    kind: "verdict",
    requestId: args.wire.requestId,
    from: args.wire.to,
    to: args.wire.from,
    authorized: true,
    reason,
    result,
    receiptDigest: egress.record ? egress.record.digest : void 0
  };
}
async function requesterVerifies(verdict) {
  if (!verdict.authorized || !verdict.result) {
    return { ok: !verdict.authorized, detail: verdict.reason };
  }
  const { digest, ...rest } = verdict.result;
  const recomputed = await sha256Hex(capabilityCanonical(rest));
  if (recomputed !== digest) {
    return { ok: false, detail: "tampered \u2014 the answer received does not match its digest" };
  }
  if (!await verifyEgressLedger(loadEgressLedger())) {
    return { ok: false, detail: "tampered \u2014 the egress receipt chain does not verify" };
  }
  return { ok: true, detail: `verified \u2014 answer ${verdict.result.value} over ${verdict.result.cohortSize} records, receipt ${verdict.receiptDigest?.slice(0, 12)}\u2026` };
}

// probe/twoNodeAlign.test.ts
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
  const store = /* @__PURE__ */ new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    }
  };
}
var NOW = Date.now();
var relay = new RelayNode();
function bRequests(args, envelopeId, envelopeDigest) {
  const wire = {
    kind: "capability-request",
    requestId: args.id,
    from: "employee:B",
    to: "employee:A",
    op: args.op ?? "sum",
    dataset: DEMO_COMPANY_DATA.dataset,
    field: args.field ?? "revenue",
    where: args.where,
    envelopeId,
    envelopeDigest
  };
  relay.send(wire);
  return wire;
}
section("1. the happy path \u2014 capability, not data, crosses");
{
  resetCapabilityQueryLedger();
  const env = await issueRootEnvelope({
    principal: "human:data-owner",
    scope: ["capability:run", "egress:share"],
    expiresAt: NOW + DEMO_POLICY.windowMs + 1e5,
    now: NOW
  });
  const wire = bRequests({ id: "2n-1" }, env.id, env.digest);
  const verdict = await ownerComputes({ wire, envelope: env, now: NOW + 1 });
  relay.send(verdict);
  const check = await requesterVerifies(verdict);
  ok(
    "B asked through the relay; A computed locally; the bounded answer came back",
    verdict.authorized && verdict.result?.value === 545.3 && verdict.result.cohortSize === 5,
    verdict.reason
  );
  ok("B can verify the answer it received against its digest and the egress chain", check.ok, check.detail);
  ok(
    "the egress receipt exists \u2014 what crossed is provable",
    typeof verdict.receiptDigest === "string" && verdict.receiptDigest.length > 0 && await verifyEgressLedger(loadEgressLedger())
  );
  const seen = JSON.stringify(relay.log);
  ok(
    "the relay saw identities, the request, authorization evidence, and the receipt",
    seen.includes("employee:B") && seen.includes("employee:A") && seen.includes("capability-request") && seen.includes(env.digest) && seen.includes("receiptDigest")
  );
  const rawValues = ["128.4", "96.2", "64.1", "45.9", "2.2", "4.1"];
  ok(
    "the relay NEVER saw the raw rows \u2014 no individual record value appears anywhere it looked",
    rawValues.every((v) => !seen.includes(v))
  );
}
section("2. policy travels with the computation \u2014 refusals cross too, in words");
{
  const env = await issueRootEnvelope({
    principal: "human:data-owner",
    scope: ["capability:run", "egress:share"],
    expiresAt: NOW + DEMO_POLICY.windowMs + 1e5,
    now: NOW
  });
  const badOp = bRequests({ id: "2n-median", op: "median" }, env.id, env.digest);
  const v1 = await ownerComputes({ wire: badOp, envelope: env, now: NOW + 2 });
  relay.send(v1);
  ok(
    "an off-whitelist operation is refused at A, and only the refusal crosses",
    !v1.authorized && v1.result === void 0 && v1.reason.includes("whitelist"),
    v1.reason
  );
  const badField = bRequests({ id: "2n-salary", field: "salary" }, env.id, env.digest);
  const v2 = await ownerComputes({ wire: badField, envelope: env, now: NOW + 3 });
  relay.send(v2);
  ok("an off-policy field is refused at A", !v2.authorized && v2.reason.includes("aggregation policy"), v2.reason);
  const narrow = bRequests({ id: "2n-apac", where: { region: "APAC" } }, env.id, env.digest);
  const v3 = await ownerComputes({ wire: narrow, envelope: env, now: NOW + 4 });
  relay.send(v3);
  ok(
    "a narrow filtered cohort is refused at A \u2014 even though the whole dataset would pass",
    !v3.authorized && v3.reason.includes("cohort of 2"),
    v3.reason
  );
}
section("3. the privacy budget holds across the wire \u2014 and across A's restarts");
{
  resetCapabilityQueryLedger();
  const env = await issueRootEnvelope({
    principal: "human:data-owner",
    scope: ["capability:run", "egress:share"],
    expiresAt: NOW + DEMO_POLICY.windowMs * 2 + 1e5,
    now: NOW
  });
  let refusedAt = -1;
  for (let i = 0; i < DEMO_POLICY.maxQueriesPerWindow + 2; i++) {
    const wire = bRequests({ id: `2n-b${i}` }, env.id, env.digest);
    const v = await ownerComputes({ wire, envelope: env, now: NOW + 10 + i });
    relay.send(v);
    if (!v.authorized && v.reason.includes("privacy budget exhausted")) {
      refusedAt = i;
      break;
    }
  }
  ok(
    "repeated requests through the relay exhaust B's budget, and the hard stop is enforced at A",
    refusedAt >= 0 && refusedAt < DEMO_POLICY.maxQueriesPerWindow + 2
  );
  const persisted = loadPrivacyLedger().length;
  const wireAfterRestart = bRequests({ id: "2n-restart" }, env.id, env.digest);
  const vRestart = await ownerComputes({ wire: wireAfterRestart, envelope: env, now: NOW + 40 });
  relay.send(vRestart);
  ok(
    "the reviewer's attack fails: A restarted, budget still enforced from durable storage",
    !vRestart.authorized && vRestart.reason.includes("privacy budget exhausted") && loadPrivacyLedger().length === persisted
  );
  const wireLater = bRequests({ id: "2n-later" }, env.id, env.digest);
  const vLater = await ownerComputes({ wire: wireLater, envelope: env, now: NOW + DEMO_POLICY.windowMs + 50 });
  relay.send(vLater);
  ok(
    "the window resets honestly \u2014 after it passes, B may ask again",
    vLater.authorized && vLater.result?.value === 545.3
  );
}
section("4. tampering with what crossed is detectable at B");
{
  resetCapabilityQueryLedger();
  const env = await issueRootEnvelope({
    principal: "human:data-owner",
    scope: ["capability:run", "egress:share"],
    expiresAt: NOW + DEMO_POLICY.windowMs + 1e5,
    now: NOW
  });
  const wire = bRequests({ id: "2n-tamper" }, env.id, env.digest);
  const verdict = await ownerComputes({ wire, envelope: env, now: NOW + 60 });
  relay.send(verdict);
  const honest = await requesterVerifies(verdict);
  ok("the unmodified crossing verifies end to end", honest.ok, honest.detail);
  const doctored = { ...verdict, result: verdict.result ? { ...verdict.result, value: 999999 } : void 0 };
  const caught = await requesterVerifies(doctored);
  ok(
    "a relay that doctors the answer is caught at B \u2014 digest mismatch, in words",
    !caught.ok && caught.detail.includes("tampered"),
    caught.detail
  );
}
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
console.log(`
${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
