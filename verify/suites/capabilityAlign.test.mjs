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
function capabilityQueryCount(dataset, requester, now) {
  const policy = DEMO_POLICY.dataset === dataset ? DEMO_POLICY : null;
  if (!policy) return 0;
  return loadPrivacyLedger().filter(
    (e) => e.dataset === dataset && e.requester === requester && now - e.countedAt < policy.windowMs
  ).length;
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

// probe/capabilityAlign.test.ts
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
var NOW = 176e10;
var req = (op) => ({
  id: "cap-test",
  requester: "employee:2",
  op,
  dataset: DEMO_COMPANY_DATA.dataset,
  field: "revenue"
});
section("1. authority gates the capability");
{
  const noEnv = await executeCapability({ request: req("sum"), envelope: null, now: NOW });
  ok("no envelope \u2014 the operation is refused in words", noEnv.result === null && noEnv.reason.includes("no authority envelope"));
  const env = await issueRootEnvelope({ principal: "human:data-owner", scope: ["capability:run"], expiresAt: NOW + 1e3, now: NOW });
  const expired = await executeCapability({ request: req("sum"), envelope: env, now: NOW + 2e3 });
  ok("an expired envelope cannot authorize an operation", expired.result === null);
  const revoked = await executeCapability({ request: req("sum"), envelope: revoke(env, "no"), now: NOW + 1 });
  ok("a revoked envelope cannot authorize an operation", revoked.result === null);
  const wrongScope = await issueRootEnvelope({ principal: "human:data-owner", scope: ["egress:share"], expiresAt: NOW + 1e3, now: NOW });
  const scopeless = await executeCapability({ request: req("sum"), envelope: wrongScope, now: NOW + 1 });
  ok("an envelope without capability:run cannot authorize an operation", scopeless.result === null);
}
section("2. the whitelist is the product");
{
  const env = await issueRootEnvelope({ principal: "human:data-owner", scope: ["capability:run"], expiresAt: NOW + 1e3, now: NOW });
  const evil = await executeCapability({ request: { ...req("sum"), op: "dump" }, envelope: env, now: NOW + 1 });
  ok("an operation outside the whitelist is refused", evil.result === null && evil.reason.includes("whitelist"));
  const foreign = await executeCapability({ request: { ...req("sum"), dataset: "hr.salaries" }, envelope: env, now: NOW + 1 });
  ok("a dataset not exposed on this machine is refused", foreign.result === null);
  ok("the whitelist is aggregate-only by construction", CAPABILITY_OPS.every((o) => ["count", "sum", "avg", "max"].includes(o)));
}
section("3. compute at home, answer travels \u2014 raw rows never do");
{
  const env = await issueRootEnvelope({ principal: "human:data-owner", scope: ["capability:run", "egress:share"], expiresAt: NOW + 1e3, now: NOW });
  const run = await executeCapability({ request: req("sum"), envelope: env, now: NOW + 1 });
  ok(
    "an authorized operation computes WHERE THE DATA LIVES and returns one aggregate number",
    !!run.result && typeof run.result.value === "number" && Math.abs(run.result.value - (128.4 + 96.2 + 210.7 + 64.1 + 45.9)) < 1e-6
  );
  ok(
    "the answer is digest-stamped \u2014 the receipt proves WHICH answer left",
    !!run.result && run.result.digest.length === 64
  );
  const before = loadEgressLedger().length;
  const gate = await requestEgress({ envelope: env, item: { kind: "capability-result", name: "sum(revenue)", sha256: run.result.digest }, recipient: "employee:2", now: NOW + 2 });
  ok("the answer leaves ONLY through the Egress Gate, as a receipt", !!gate.record && loadEgressLedger().length === before + 1 && gate.record.item.sha256 === run.result.digest);
  ok(
    "the result carries no raw rows \u2014 the region names never entered the answer",
    !!run.result && !JSON.stringify(run.result).includes("APAC") && !JSON.stringify(run.result).includes("EMEA")
  );
}
section("4. the Privacy Guard \u2014 aggregate-only is made privacy-honest (11.14.2)");
{
  resetCapabilityQueryLedger();
  const env = await issueRootEnvelope({ principal: "human:data-owner", scope: ["capability:run"], expiresAt: NOW + DEMO_POLICY.windowMs + 1e5, now: NOW });
  const rq = (op, field, id) => ({
    id,
    requester: "employee:2",
    op,
    dataset: DEMO_COMPANY_DATA.dataset,
    field
  });
  const narrow = await executeCapability({ request: rq("sum", "bonus", "cap-n"), envelope: env, now: NOW + 1 });
  ok(
    "a narrow cohort is REFUSED \u2014 aggregate over 2 records risks exposing individuals",
    narrow.result === null && narrow.reason.includes("below the minimum"),
    narrow.reason
  );
  const offPolicy = await executeCapability({ request: rq("sum", "salary", "cap-o"), envelope: env, now: NOW + 2 });
  ok("a field outside the dataset policy never computes", offPolicy.result === null && offPolicy.reason.includes("aggregation policy"));
  const okRun = await executeCapability({ request: rq("sum", "revenue", "cap-k"), envelope: env, now: NOW + 3 });
  ok(
    "an aggregate exactly AT the minimum cohort passes and reports its cohort size",
    !!okRun.result && okRun.result.cohortSize === DEMO_POLICY.minCohortSize
  );
  const avgRun = await executeCapability({ request: rq("avg", "revenue", "cap-p"), envelope: env, now: NOW + 4 });
  ok(
    "answers are bounded to the policy's precision \u2014 no extra decimal grain leaves",
    !!avgRun.result && Math.abs(avgRun.result.value - 109.06) > 1e-9 && Math.abs(avgRun.result.value - Math.round(545.3 / 5 / DEMO_POLICY.roundTo) * DEMO_POLICY.roundTo) < 1e-9
  );
  ok(
    "every authorized attempt counts against the privacy budget (refusals included \u2014 probing IS the attack)",
    capabilityQueryCount(DEMO_COMPANY_DATA.dataset, "employee:2", NOW + 5) === 4
  );
  let exhausted = null;
  for (let i = 0; i < DEMO_POLICY.maxQueriesPerWindow; i++) {
    const r = await executeCapability({ request: rq("max", "revenue", `cap-b${i}`), envelope: env, now: NOW + 10 + i });
    if (r.result === null) {
      exhausted = r;
      break;
    }
  }
  ok(
    "the privacy budget is HARD \u2014 once exhausted, even valid queries are refused until the window resets",
    exhausted !== null && exhausted.reason.includes("privacy budget exhausted")
  );
  const ledgerClean = await executeCapability({ request: rq("sum", "revenue", "cap-x"), envelope: env, now: NOW + DEMO_POLICY.windowMs + 20 });
  ok("the window resets honestly \u2014 queries outside the window do not count", !!ledgerClean.result);
}
section("5. durability + filters \u2014 the 11.14.2 review's two named weaknesses, closed (11.14.3)");
{
  resetCapabilityQueryLedger();
  const env = await issueRootEnvelope({ principal: "human:data-owner", scope: ["capability:run"], expiresAt: NOW + DEMO_POLICY.windowMs + 1e5, now: NOW });
  const rq = (id, where) => ({
    id,
    requester: "employee:9",
    op: "sum",
    dataset: DEMO_COMPANY_DATA.dataset,
    field: "revenue",
    where
  });
  const narrowFilter = await executeCapability({ request: rq("cap-f1", { region: "APAC" }), envelope: env, now: NOW + 1 });
  ok(
    "FILTERED cohorts are guarded \u2014 region=APAC is 2 records and is refused even though the whole dataset passes",
    narrowFilter.result === null && narrowFilter.reason.includes("cohort of 2") && narrowFilter.reason.includes("APAC"),
    narrowFilter.reason
  );
  const tinyFilter = await executeCapability({ request: rq("cap-f2", { region: "AMER" }), envelope: env, now: NOW + 2 });
  ok(
    "a one-person filter is refused in words \u2014 'average salary for the 3 people in legal' is exactly this shape",
    tinyFilter.result === null && tinyFilter.reason.includes("cohort of 1"),
    tinyFilter.reason
  );
  ok(
    "filtered attempts still count against the requester's privacy budget",
    capabilityQueryCount(DEMO_COMPANY_DATA.dataset, "employee:9", NOW + 3) === 2
  );
  for (let i = 0; i < DEMO_POLICY.maxQueriesPerWindow; i++) {
    await executeCapability({ request: rq(`cap-d${i}`), envelope: env, now: NOW + 10 + i });
  }
  const exhaustedNow = await executeCapability({ request: rq("cap-dex"), envelope: env, now: NOW + 20 });
  ok("budget exhaustion still hard after the durability upgrade", exhaustedNow.result === null && exhaustedNow.reason.includes("privacy budget exhausted"));
  const ledgerBefore = loadPrivacyLedger().length;
  const afterRestart = await executeCapability({ request: rq("cap-rst"), envelope: env, now: NOW + 21 });
  ok(
    "a process restart does NOT reset the budget \u2014 the ledger is re-read from durable storage on every request",
    afterRestart.result === null && afterRestart.reason.includes("privacy budget exhausted") && loadPrivacyLedger().length === ledgerBefore
  );
  const other = await executeCapability({ request: { ...rq("cap-other"), requester: "employee:10" }, envelope: env, now: NOW + 22 });
  ok(
    "the budget is scoped PER REQUESTER \u2014 colleague 10's first query is unaffected by colleague 9's exhaustion",
    !!other.result && other.result.value === 545.3
  );
  ok("the privacy ledger is digest-chained and verifies", await verifyPrivacyLedger());
  const chain = loadPrivacyLedger();
  const dropped = chain.slice(0, -2);
  globalThis.localStorage.setItem("mj.privacy.ledger", JSON.stringify(dropped));
  const tampered = await executeCapability({ request: { ...rq("cap-tam"), requester: "employee:11" }, envelope: env, now: NOW + 23 });
  ok(
    "truncating the ledger is DETECTED \u2014 a doctored budget history refuses all computation, in words",
    tampered.result === null && tampered.reason.includes("digest chain is broken"),
    tampered.reason
  );
  resetCapabilityQueryLedger();
}
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
