/**
 * 11.10.1 — Ed25519 issuer signatures on proof receipts (suite #54).
 *
 * 11.10 shipped enforcement; 11.10.1 completes the evidence spine: receipts become
 * issuer-authentic. This suite proves the cryptography against the REAL runtime crypto
 * (Node ≥18 WebCrypto Ed25519), not a mock:
 *
 * §1 the issuer identity is generated, stable, and shaped like a key id + 64-hex public key
 * §2 sign → verify roundtrip; a wrong message or a wrong key must NOT verify
 * §3 buildProofReceipt issues vh-proof-receipt/2 with a signature verifyProofReceipt accepts
 * §4 a tampered signature / swapped public key is rejected — the chain alone is not enough
 * §5 seat identity digests: sha256(seatId|role|harness) lands in-chain, deterministically
 * §6 v1 receipts (pre-11.10.1) still verify — the format upgrade is backward-compatible
 * §7 the exported public-key document carries the key an auditor needs
 */
import { LEGACY_SEAL_SECRET } from "../src/mission/licensing";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ensureIssuerIdentity, signChainHash, verifyIssuerSignature, exportIssuerPublicKeyDocument, signingSupported } from "../src/mission/signing";
import { buildProofReceipt, verifyProofReceipt, receiptToJsonl, receiptFromJsonl } from "../src/mission/receipts";
import type { AutonomyRunSummary } from "../src/mission/autonomyRuntime";
import { createHash } from "node:crypto";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const report: AutonomyRunSummary = {
  status: "pass",
  seats: [
    { seatId: "s1", role: "coder", outcome: "done", verified: true, harness: "claude-code" },
    { seatId: "s2", role: "reviewer", outcome: "done", verified: true, harness: "codex" },
  ],
  autonomyArms: [],
  reviewedBySnapshot: true,
  gateStatus: "PASS",
  gateTier: "cross-vendor",
};

describe("issuer signing — Ed25519 identity", () => {
  it("generates a stable issuer identity with a key id and a 64-hex public key", async () => {
    assert.equal(signingSupported(), true, "Node's WebCrypto must offer Ed25519 for this suite");
    const a = await ensureIssuerIdentity();
    assert.ok(a, "issuer identity must be generated");
    assert.match(a.identity.keyId, /^vh-issuer-[0-9a-f]{12}$/);
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

describe("issuer signing — receipts become v2 and issuer-authentic", () => {
  it("buildProofReceipt issues vh-proof-receipt/2 with issuer + signature that verify", async () => {
    const rc = await buildProofReceipt({ mission: "m-11101", teamId: "t-11101", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    assert.equal(rc.format, "vh-proof-receipt/2");
    assert.ok(rc.issuer, "v2 receipts carry the issuer identity");
    assert.match(rc.issuer?.keyId ?? "", /^vh-issuer-/);
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
    // Same machine = same issuer key here, so swap in a DIFFERENT public key explicitly.
    const swapped = { ...rc, issuer: { keyId: other.issuer?.keyId ?? "vh-issuer-deadbeef", publicKeyHex: sha256("not-a-key").slice(0, 64) } };
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

  it("v1 receipts (pre-11.10.1) still verify — backward compatibility", async () => {
    const rc = await buildProofReceipt({ mission: "m-v1", teamId: "t-v1", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    // A genuine pre-16.1 archived receipt is sealed with the LEGACY published secret.
    // Event hashes never include the format, so re-seal the same chain the legacy way.
    const lastHash = rc.events[rc.events.length - 1].hash;
    const legacySeal = createHmac("sha256", LEGACY_SEAL_SECRET).update(lastHash, "utf8").digest("hex");
    const v1 = { ...rc, format: "mj-proof-receipt/1" as const, seal: legacySeal, issuer: undefined, signature: undefined, signatureNote: undefined };
    const v = await verifyProofReceipt(v1);
    assert.equal(v.ok, true, "the chain+seal check must still pass for v1 receipts");
  });

  it("JSONL export preserves the issuer signature and still verifies after import", async () => {
    const rc = await buildProofReceipt({ mission: "m-jsonl", teamId: "t-jsonl", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    const back = receiptFromJsonl(receiptToJsonl(rc));
    assert.ok(back);
    assert.equal(back.format, "vh-proof-receipt/2");
    assert.equal(back.signature, rc.signature, "signature must survive the JSONL roundtrip");
    assert.equal(back.issuer?.publicKeyHex, rc.issuer?.publicKeyHex);
    const v = await verifyProofReceipt(back);
    assert.equal(v.ok, true);
  });

  it("exports a public-key document an auditor can verify with", async () => {
    const doc = await exportIssuerPublicKeyDocument("11.10.1");
    assert.ok(doc, "document must exist when signing is available");
    const holder = await ensureIssuerIdentity();
    assert.ok(doc.includes(holder!.identity.publicKeyHex), "the public key itself must be in the document");
    assert.match(doc, /Ed25519/);
    assert.match(doc, /never leaves the machine/i);
  });
});
