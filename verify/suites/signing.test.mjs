import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/signing.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
async function exportIssuerPublicKeyDocument(mjVersion) {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  return [
    "MJ \u2014 Issuer Public Key (Ed25519)",
    "================================",
    "",
    `MJ version : ${mjVersion}`,
    `Key id     : ${holder.identity.keyId}`,
    `Public key : ${holder.identity.publicKeyHex}`,
    `Created    : ${holder.identity.createdAt}`,
    "",
    "What this key verifies",
    "----------------------",
    "Every mj-proof-receipt/2 issued by this MJ install carries `issuer` + `signature`:",
    "an Ed25519 signature over the receipt's FINAL CHAIN HASH (the `hash` of the last",
    "chained event). To verify a receipt without MJ:",
    "",
    "  1. Re-canonicalize each event body (recursive key sort) and re-hash the chain",
    "     from the 64-zero genesis to recover the final chain hash.",
    "  2. Verify the Ed25519 signature over that hash with the public key above.",
    "  3. Re-check the HMAC seal as before (it still applies).",
    "",
    "The private key never leaves the machine that issued the receipts; MJ has no server",
    "it could leave through. Treat this document like a code-signing certificate: anyone",
    "holding it can verify MJ's receipts; nobody holding it can forge them.",
    ""
  ].join("\n");
}
function signingSupported() {
  return ed25519Available();
}

// src/mission/licensing.ts
var VERIFY_SECRET = "mj-commercial-v1-offline";

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

// probe/signing.test.ts
import { createHash } from "node:crypto";
var sha256 = (s) => createHash("sha256").update(s).digest("hex");
var report = {
  status: "pass",
  seats: [
    { seatId: "s1", role: "coder", outcome: "done", verified: true, harness: "claude-code" },
    { seatId: "s2", role: "reviewer", outcome: "done", verified: true, harness: "codex" }
  ],
  autonomyArms: [],
  reviewedBySnapshot: true,
  gateStatus: "PASS",
  gateTier: "cross-vendor"
};
describe("issuer signing \u2014 Ed25519 identity", () => {
  it("generates a stable issuer identity with a key id and a 64-hex public key", async () => {
    assert.equal(signingSupported(), true, "Node's WebCrypto must offer Ed25519 for this suite");
    const a = await ensureIssuerIdentity();
    assert.ok(a, "issuer identity must be generated");
    assert.match(a.identity.keyId, /^mj-issuer-[0-9a-f]{12}$/);
    assert.match(a.identity.publicKeyHex, /^[0-9a-f]{64}$/);
    const b = await ensureIssuerIdentity();
    assert.equal(b?.identity.keyId, a.identity.keyId, "the identity must be stable across calls");
  });
  it("signs a digest and verifies it; wrong message or wrong key must fail", async () => {
    const digest = sha256("merge-commit-evidence");
    const sig = await signChainHash(digest);
    assert.ok(sig, "must sign when Ed25519 is available");
    assert.match(sig.sigHex, /^[0-9a-f]{128}$/, "Ed25519 signatures are 64 bytes = 128 hex chars");
    assert.equal(await verifyIssuerSignature(digest, sig.sigHex, sig.publicKeyHex), true);
    assert.equal(await verifyIssuerSignature(sha256("tampered"), sig.sigHex, sig.publicKeyHex), false, "wrong message must not verify");
    const other = sha256("attacker-public-key-material-should-not-verify");
    assert.equal(await verifyIssuerSignature(digest, sig.sigHex, other.slice(0, 64)), false, "wrong public key must not verify");
  });
});
describe("issuer signing \u2014 receipts become v2 and issuer-authentic", () => {
  it("buildProofReceipt issues mj-proof-receipt/2 with issuer + signature that verify", async () => {
    const rc = await buildProofReceipt({ mission: "m-11101", teamId: "t-11101", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    assert.equal(rc.format, "mj-proof-receipt/2");
    assert.ok(rc.issuer, "v2 receipts carry the issuer identity");
    assert.match(rc.issuer?.keyId ?? "", /^mj-issuer-/);
    assert.match(rc.signature ?? "", /^[0-9a-f]{128}$/);
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, true);
  });
  it("a tampered signature is rejected; a swapped public key is rejected", async () => {
    const rc = await buildProofReceipt({ mission: "m-x", teamId: "t-x", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    const forged = { ...rc, signature: rc.signature?.slice(0, -4) + "beef" };
    const v1 = await verifyProofReceipt(forged);
    assert.equal(v1.ok, false, "signature tampering must be detected");
    if (!v1.ok) assert.match(v1.reason, /issuer signature/i);
    const other = await buildProofReceipt({ mission: "m-y", teamId: "t-y", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    const swapped = { ...rc, issuer: { keyId: other.issuer?.keyId ?? "mj-issuer-deadbeef", publicKeyHex: sha256("not-a-key").slice(0, 64) } };
    const v2 = await verifyProofReceipt(swapped);
    assert.equal(v2.ok, false, "a forged issuer public key must not verify");
  });
  it("seat identity digests are deterministic sha256(seatId|role|harness), in-chain", async () => {
    const rc = await buildProofReceipt({ mission: "m-id", teamId: "t-id", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    const s1 = rc.events.find((e) => e.kind === "seat.outcome" && e.seatId === "s1");
    assert.ok(s1, "seat event must exist");
    assert.equal(s1.data.harness, "claude-code");
    assert.equal(s1.data.identity, sha256("s1|coder|claude-code"), "identity must be the exact digest, not opaque randomness");
    const s2 = rc.events.find((e) => e.kind === "seat.outcome" && e.seatId === "s2");
    assert.equal(s2?.data.identity, sha256("s2|reviewer|codex"));
  });
  it("v1 receipts (pre-11.10.1) still verify \u2014 backward compatibility", async () => {
    const rc = await buildProofReceipt({ mission: "m-v1", teamId: "t-v1", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    const v1 = { ...rc, format: "mj-proof-receipt/1", issuer: void 0, signature: void 0, signatureNote: void 0 };
    const v = await verifyProofReceipt(v1);
    assert.equal(v.ok, true, "the chain+seal check must still pass for v1 receipts");
  });
  it("JSONL export preserves the issuer signature and still verifies after import", async () => {
    const rc = await buildProofReceipt({ mission: "m-jsonl", teamId: "t-jsonl", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    const back = receiptFromJsonl(receiptToJsonl(rc));
    assert.ok(back);
    assert.equal(back.format, "mj-proof-receipt/2");
    assert.equal(back.signature, rc.signature, "signature must survive the JSONL roundtrip");
    assert.equal(back.issuer?.publicKeyHex, rc.issuer?.publicKeyHex);
    const v = await verifyProofReceipt(back);
    assert.equal(v.ok, true);
  });
  it("exports a public-key document an auditor can verify with", async () => {
    const doc = await exportIssuerPublicKeyDocument("11.10.1");
    assert.ok(doc, "document must exist when signing is available");
    const holder = await ensureIssuerIdentity();
    assert.ok(doc.includes(holder.identity.publicKeyHex), "the public key itself must be in the document");
    assert.match(doc, /Ed25519/);
    assert.match(doc, /never leaves the machine/i);
  });
});
