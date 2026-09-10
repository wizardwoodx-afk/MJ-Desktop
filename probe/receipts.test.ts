/**
 * 11.9.4-Redesign — Proof Receipts.
 *
 * §1 build → verify roundtrip
 * §2 tamper with any event → chain broken (exact seq reported)
 * §3 tamper with the seal → rejected
 * §4 JSONL roundtrip (export/re-import preserves verdict)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProofReceipt, receiptFromJsonl, receiptToJsonl, verifyProofReceipt } from "../src/mission/receipts";
import { signingSupported } from "../src/mission/signing";
import type { AutonomyRunSummary } from "../src/mission/autonomyRuntime";
import { createHmac } from "node:crypto";
import { LEGACY_SEAL_SECRET } from "../src/mission/licensing";

const report: AutonomyRunSummary = {
  status: "pass",
  seats: [
    { seatId: "s1", role: "builder", outcome: "done", verified: true },
    { seatId: "s2", role: "reviewer", outcome: "done", verified: true },
  ],
  autonomyArms: ["pro"],
  reviewedBySnapshot: true,
};

describe("receipts — build and verify", () => {
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

/**
 * 11.10.1 — receipts are now issuer-signed (vh-proof-receipt/2 since 16.1.0). These assertions run
 * against whichever branch the runtime honestly takes: Ed25519 available → the receipt is
 * signed and the signature is checked; Ed25519 unavailable → the receipt says so in
 * signatureNote and still verifies via chain + seal. Faking is never an option either way.
 */
describe("receipts — issuer signature (11.10.1)", () => {
  it("every new receipt is v2, and is either signed or honestly explains why not", async () => {
    const rc = await buildProofReceipt({ mission: "mission-sig", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    assert.equal(rc.format, "vh-proof-receipt/2");
    if (signingSupported() && rc.signature) {
      assert.match(rc.signature, /^[0-9a-f]{128}$/, "Ed25519 signature is 64 bytes of hex");
      assert.ok(rc.issuer && rc.issuer.publicKeyHex.length === 64, "the verifying public key rides with the receipt");
      assert.equal(rc.signatureNote, undefined, "a signed receipt must not carry an excuse");
    } else {
      assert.equal(rc.signature, null);
      assert.ok(rc.signatureNote && rc.signatureNote.length > 10, "an unsigned receipt must say why, in writing");
    }
    const v = await verifyProofReceipt(rc);
    assert.equal(v.ok, true);
  });

  it("a genuine legacy-wire (mj/1, legacy-sealed) receipt strips issuer fields and verifies", async () => {
    const rc = await buildProofReceipt({ mission: "mission-compat", teamId: "team-x", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    // The legacy wire is sealed with the LEGACY published secret. Event hashes never
    // include the format, so a pre-16.1 receipt = same events, legacy seal, v1 label.
    const lastHash = rc.events[rc.events.length - 1].hash;
    const legacySeal = createHmac("sha256", LEGACY_SEAL_SECRET).update(lastHash, "utf8").digest("hex");
    const legacy = { ...rc, format: "mj-proof-receipt/1" as const, seal: legacySeal, issuer: undefined, signature: undefined, signatureNote: undefined };
    const v = await verifyProofReceipt(legacy);
    assert.equal(v.ok, true, "11.9.x-era receipts must keep verifying after the 16.1.0 upgrade");
  });
});
