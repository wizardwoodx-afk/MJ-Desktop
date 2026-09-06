/**
 * 11.9.9 — Adversarial Verification Gate (suite #49).
 *
 * §1 PASS path: cross-vendor verification with receipt
 * §2 the adversarial core: same-harness verification is blocked (STRICT) / failed (ADVISORY)
 * §3 rejections and unfinished runs fail regardless of vendor mix
 * §4 verdicts and tier derivation from team-run reports (gateForTeamReport)
 * §5 configuration-time prediction (gateFindingsForTeam) + policy default
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateVerifyGate,
  gateFindingsForTeam,
  gateForTeamReport,
  loadGatePolicy,
  type GateInput,
} from "../src/mission/verifyGate";

const base = (over: Partial<GateInput>): GateInput => ({
  runStatus: "completed",
  writers: [{ seatId: "impl", harness: "claude" }],
  verifiers: [{ seatId: "reviewer", harness: "codex", ran: true, verdict: "approve" }],
  receiptAttached: true,
  policy: "STRICT",
  ...over,
});

describe("verifyGate — the adversarial core", () => {
  it("cross-vendor verification with receipt PASSES in STRICT", () => {
    const v = evaluateVerifyGate(base({}));
    assert.equal(v.status, "PASS");
    assert.equal(v.tier, "cross-vendor");
    assert.equal(v.crossVerified, true);
    assert.equal(v.reasons.length, 0);
  });

  it("same-harness verification is BLOCKED in STRICT (self-verification)", () => {
    const v = evaluateVerifyGate(base({ verifiers: [{ seatId: "reviewer", harness: "claude", ran: true, verdict: "approve" }] }));
    assert.equal(v.status, "BLOCKED");
    assert.equal(v.tier, "self-verification");
    assert.equal(v.crossVerified, false);
    assert.match(v.reasons.join("\n"), /own work/);
  });

  it("same-harness verification is FAILED, not BLOCKED, in ADVISORY", () => {
    const v = evaluateVerifyGate(base({ policy: "ADVISORY", verifiers: [{ seatId: "reviewer", harness: "claude", ran: true, verdict: "approve" }] }));
    assert.equal(v.status, "FAIL");
    assert.equal(v.tier, "self-verification");
  });

  it("overlap elsewhere in the team stays adversarial where it matters (cross-seat)", () => {
    const v = evaluateVerifyGate(
      base({
        writers: [
          { seatId: "impl", harness: "claude" },
          { seatId: "debug", harness: "grok" },
        ],
        verifiers: [
          { seatId: "reviewer", harness: "grok", ran: true, verdict: "approve" },
          { seatId: "security", harness: "claude", ran: true, verdict: "approve" },
        ],
      }),
    );
    assert.equal(v.status, "PASS");
    assert.equal(v.tier, "cross-seat");
  });

  it("no verifier ran → unverified; BLOCKED in STRICT, FAILED in ADVISORY", () => {
    const strict = evaluateVerifyGate(base({ verifiers: [] }));
    assert.equal(strict.status, "BLOCKED");
    assert.equal(strict.tier, "unverified");
    const advisory = evaluateVerifyGate(base({ verifiers: [], policy: "ADVISORY" }));
    assert.equal(advisory.status, "FAIL");
    assert.equal(advisory.tier, "unverified");
  });

  it("a verifier that did not run cannot satisfy the gate", () => {
    const v = evaluateVerifyGate(base({ verifiers: [{ seatId: "reviewer", harness: "codex", ran: false, verdict: "none" }] }));
    assert.equal(v.status, "BLOCKED");
    assert.equal(v.tier, "unverified");
  });
});

describe("verifyGate — hard failures and receipts", () => {
  it("a rejecting verifier fails the gate even cross-vendor", () => {
    const v = evaluateVerifyGate(base({ verifiers: [{ seatId: "reviewer", harness: "codex", ran: true, verdict: "reject" }] }));
    assert.equal(v.status, "FAIL");
    assert.match(v.reasons.join("\n"), /rejected/);
  });

  it("an unfinished run cannot be verified", () => {
    const v = evaluateVerifyGate(base({ runStatus: "partial" }));
    assert.equal(v.status, "FAIL");
    assert.match(v.reasons.join("\n"), /partial/);
  });

  it("missing receipt blocks in STRICT, fails in ADVISORY", () => {
    const strict = evaluateVerifyGate(base({ receiptAttached: false }));
    assert.equal(strict.status, "BLOCKED");
    const advisory = evaluateVerifyGate(base({ receiptAttached: false, policy: "ADVISORY" }));
    assert.equal(advisory.status, "FAIL");
    assert.match(advisory.reasons.join("\n"), /receipt/);
  });

  it("a read-only mission (no writers) passes with a verifier and receipt", () => {
    const v = evaluateVerifyGate(base({ writers: [] }));
    assert.equal(v.status, "PASS");
    assert.equal(v.tier, "cross-vendor");
  });
});

describe("verifyGate — team-run report derivation", () => {
  const seats = [
    { seatId: "impl", role: "coder", harness: "claude", outcome: "completed", verified: true },
    { seatId: "reviewer", role: "reviewer", harness: "codex", outcome: "completed", verified: true },
    { seatId: "test", role: "tester", harness: "opencode", outcome: "completed", verified: false },
    { seatId: "sec", role: "security", harness: "grok", outcome: "failed", verified: false },
  ];

  it("completed verifier approves, failed verifier rejects → gate FAILs", () => {
    const v = gateForTeamReport({ status: "completed", seats }, "STRICT", true);
    assert.equal(v.status, "FAIL");
    assert.match(v.reasons.join("\n"), /sec/);
  });

  it("notRun seats never count toward verification", () => {
    const v = gateForTeamReport(
      { status: "completed", seats: [seats[0], seats[1]], notRun: ["reviewer"] },
      "STRICT",
      true,
    );
    assert.equal(v.status, "BLOCKED");
    assert.equal(v.tier, "unverified");
  });

  it("a clean cross-vendor report PASSes with receipt", () => {
    const v = gateForTeamReport({ status: "completed", seats: [seats[0], seats[1], seats[2]] }, "STRICT", true);
    assert.equal(v.status, "PASS");
    assert.equal(v.tier, "cross-vendor");
  });
});

describe("verifyGate — configuration-time findings + policy", () => {
  it("team whose verifiers all share writer harnesses is flagged (error in STRICT)", () => {
    const team = {
      seats: [
        { role: "coder", harness: "claude", mayWrite: true },
        { role: "reviewer", harness: "claude", mayWrite: false },
      ],
    };
    const strict = gateFindingsForTeam(team, "STRICT");
    assert.equal(strict.length, 1);
    assert.equal(strict[0].severity, "error");
    assert.equal(strict[0].code, "self_verification_locked_in");
    const advisory = gateFindingsForTeam(team, "ADVISORY");
    assert.equal(advisory[0].severity, "warning");
  });

  it("team with writers but no verifier seat is flagged", () => {
    const team = { seats: [{ role: "coder", harness: "claude", mayWrite: true }] };
    const f = gateFindingsForTeam(team, "STRICT");
    assert.equal(f.length, 1);
    assert.equal(f[0].code, "no_verifier_seat");
  });

  it("a properly mixed team produces no findings", () => {
    const team = {
      seats: [
        { role: "coder", harness: "claude", mayWrite: true },
        { role: "reviewer", harness: "codex", mayWrite: false },
      ],
    };
    assert.deepEqual(gateFindingsForTeam(team, "STRICT"), []);
  });

  it("read-only teams produce no findings", () => {
    assert.deepEqual(gateFindingsForTeam({ seats: [{ role: "reviewer", harness: "claude", mayWrite: false }] }, "STRICT"), []);
  });

  it("default policy is STRICT (no storage in Node)", () => {
    assert.equal(loadGatePolicy(), "STRICT");
  });
});
