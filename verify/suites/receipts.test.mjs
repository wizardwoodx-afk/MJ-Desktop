import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/receipts.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// src/mission/licensing.ts
var VERIFY_SECRET = "mj-commercial-v1-offline";

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
async function signChainHash(chainHashHex) {
  return signHexDigest(chainHashHex);
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

// src/mission/receipts.ts
var enc = new TextEncoder();
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
var canon = (o) => JSON.stringify(sortDeep(o));
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(s, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(s));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function buildProofReceipt(args) {
  const { report: report2 } = args;
  const seatEvents = [];
  for (const s of report2.seats) {
    const data = { role: s.role, outcome: s.outcome, verified: s.verified };
    if (s.harness) {
      data.harness = s.harness;
      data.identity = await sha256hex(`${s.seatId}|${s.role}|${s.harness}`);
    }
    seatEvents.push({ kind: "seat.outcome", seatId: s.seatId, data });
  }
  const raw = [
    { kind: "mission.status", seatId: null, data: { status: report2.status, reviewedBySnapshot: report2.reviewedBySnapshot === true } },
    ...seatEvents,
    { kind: "mission.verdict", seatId: null, data: { verified: report2.seats.some((s) => s.verified), arms: report2.autonomyArms ?? [] } }
  ];
  if (report2.gateStatus !== void 0) {
    raw.push({
      kind: "gate.verdict",
      seatId: null,
      data: {
        status: report2.gateStatus,
        tier: report2.gateTier ?? "n/a",
        // 11.10 — the writer→snapshot→verifier evidence link, in the chain itself.
        snapshotSha: report2.gateSnapshotSha ?? null
      }
    });
  }
  const events = [];
  let prev = "0".repeat(64);
  let seq = 0;
  for (const r of raw) {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const body = { seq, ts, kind: r.kind, seatId: r.seatId, data: r.data, prev };
    const hash = await sha256hex(canon(body));
    events.push({ ...body, hash });
    prev = hash;
    seq += 1;
  }
  const header = {
    mission: args.mission,
    teamId: args.teamId,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    mjVersion: args.mjVersion,
    edition: args.edition,
    autonomyArms: report2.autonomyArms ?? []
  };
  const seal = await hmacHex(prev, VERIFY_SECRET);
  const sig = await signChainHash(prev);
  if (sig) {
    return {
      format: "mj-proof-receipt/2",
      header,
      events,
      seal,
      issuer: { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex },
      signature: sig.sigHex
    };
  }
  return {
    format: "mj-proof-receipt/2",
    header,
    events,
    seal,
    issuer: null,
    signature: null,
    signatureNote: "This runtime has no Ed25519 (WebCrypto refused or is absent). The receipt is tamper-evident via its HMAC seal but NOT issuer-signed."
  };
}
async function verifyProofReceipt(rc) {
  if (rc.format !== "mj-proof-receipt/1" && rc.format !== "mj-proof-receipt/2") return { ok: false, reason: "unknown format" };
  let prev = "0".repeat(64);
  for (const e of rc.events) {
    if (e.prev !== prev) return { ok: false, reason: `chain broken at seq ${e.seq}` };
    const { hash, ...body } = e;
    const expect = await sha256hex(canon(body));
    if (expect !== hash) return { ok: false, reason: `hash mismatch at seq ${e.seq}` };
    prev = hash;
  }
  const seal = await hmacHex(prev, VERIFY_SECRET);
  if (seal !== rc.seal) return { ok: false, reason: "seal mismatch" };
  if (rc.format === "mj-proof-receipt/2" && rc.signature) {
    if (!rc.issuer?.publicKeyHex) return { ok: false, reason: "receipt is signed but carries no issuer public key" };
    const ok = await verifyIssuerSignature(prev, rc.signature, rc.issuer.publicKeyHex);
    if (!ok) return { ok: false, reason: `issuer signature verification FAILED for chain head ${prev}` };
  }
  return { ok: true, events: rc.events.length };
}
function receiptToJsonl(rc) {
  const head = { receipt: rc.header, format: rc.format, seal: rc.seal };
  if (rc.issuer !== void 0) head.issuer = rc.issuer;
  if (rc.signature !== void 0) head.signature = rc.signature;
  if (rc.signatureNote !== void 0) head.signatureNote = rc.signatureNote;
  const lines = [JSON.stringify(head), ...rc.events.map((e) => JSON.stringify(e))];
  return `${lines.join("\n")}
`;
}
function receiptFromJsonl(text) {
  try {
    const lines = text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (lines.length < 1) return null;
    const head = lines[0];
    if (!head.receipt || !head.seal) return null;
    const out = {
      format: head.format ?? "mj-proof-receipt/1",
      header: head.receipt,
      events: lines.slice(1),
      seal: head.seal
    };
    if (head.issuer !== void 0) out.issuer = head.issuer;
    if (head.signature !== void 0) out.signature = head.signature;
    if (head.signatureNote !== void 0) out.signatureNote = head.signatureNote;
    return out;
  } catch {
    return null;
  }
}

// probe/receipts.test.ts
var report = {
  status: "pass",
  seats: [
    { seatId: "s1", role: "builder", outcome: "done", verified: true },
    { seatId: "s2", role: "reviewer", outcome: "done", verified: true }
  ],
  autonomyArms: ["pro"],
  reviewedBySnapshot: true
};
describe("receipts \u2014 build and verify", () => {
  it("a fresh receipt verifies; chain links every event", async () => {
    const rc = await buildProofReceipt({ mission: "mission-x", teamId: "team-x", startedAt: "2026-09-06T12:00:00Z", finishedAt: "2026-09-06T12:09:00Z", mjVersion: "11.9.4-Redesign", edition: "pro", report });
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, true);
    assert.equal(rc.events.length, 4);
    assert.equal(rc.events[0].prev, "0".repeat(64));
    for (let i = 1; i < rc.events.length; i++) assert.equal(rc.events[i].prev, rc.events[i - 1].hash);
  });
  it("tampering with an event breaks the chain at that event", async () => {
    const rc = await buildProofReceipt({ mission: "mission-x", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.9.4-Redesign", edition: "personal", report });
    rc.events[2] = { ...rc.events[2], data: { ...rc.events[2].data, verified: false } };
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.reason, /seq 2/);
  });
  it("tampering with the seal is rejected", async () => {
    const rc = await buildProofReceipt({ mission: "mission-x", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.9.4-Redesign", edition: "personal", report });
    rc.seal = rc.seal.slice(0, -4) + "beef";
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, false);
    if (!v.ok) assert.match(v.reason, /seal/);
  });
  it("jsonl export roundtrips through import + verify", async () => {
    const rc = await buildProofReceipt({ mission: "mission-x", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.9.4-Redesign", edition: "business", report });
    const back = receiptFromJsonl(receiptToJsonl(rc));
    assert.ok(back);
    const v = await verifyProofReceipt(back);
    assert.equal(v.ok, true);
    assert.equal(receiptFromJsonl("not json at all"), null);
  });
});
describe("receipts \u2014 issuer signature (11.10.1)", () => {
  it("every new receipt is v2, and is either signed or honestly explains why not", async () => {
    const rc = await buildProofReceipt({ mission: "mission-sig", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    assert.equal(rc.format, "mj-proof-receipt/2");
    if (signingSupported() && rc.signature) {
      assert.match(rc.signature, /^[0-9a-f]{128}$/, "Ed25519 signature is 64 bytes of hex");
      assert.ok(rc.issuer && rc.issuer.publicKeyHex.length === 64, "the verifying public key rides with the receipt");
      assert.equal(rc.signatureNote, void 0, "a signed receipt must not carry an excuse");
    } else {
      assert.equal(rc.signature, null);
      assert.ok(rc.signatureNote && rc.signatureNote.length > 10, "an unsigned receipt must say why, in writing");
    }
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, true);
  });
  it("stripping issuer fields yields a receipt that verifies exactly like v1", async () => {
    const rc = await buildProofReceipt({ mission: "mission-compat", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    const legacy = { ...rc, format: "mj-proof-receipt/1", issuer: void 0, signature: void 0, signatureNote: void 0 };
    const v = await verifyProofReceipt(legacy);
    assert.equal(v.ok, true, "11.9.x-era receipts must keep verifying after the 11.10.1 upgrade");
  });
});
