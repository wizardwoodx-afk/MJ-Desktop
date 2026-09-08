import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/verifyGate.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// src/mission/verifyGate.ts
var GATE_VERIFIER_ROLES = /* @__PURE__ */ new Set(["reviewer", "security", "tester"]);
var GATE_WRITER_ROLES = /* @__PURE__ */ new Set(["coder", "debugger"]);
var POLICY_KEY = "mj.gatepolicy.v1";
function loadGatePolicy() {
  try {
    const raw = globalThis.localStorage?.getItem(POLICY_KEY);
    return raw === "ADVISORY" ? "ADVISORY" : "STRICT";
  } catch {
    return "STRICT";
  }
}
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
function gateForTeamReport(report, policy, receiptAttached) {
  const notRun = new Set(report.notRun ?? []);
  const seats = report.seats.filter((s) => !notRun.has(s.seatId));
  const failedOutcomes = /* @__PURE__ */ new Set(["failed", "timeout", "blocked_budget"]);
  const writers = seats.filter((s) => GATE_WRITER_ROLES.has(s.role)).map((s) => ({ seatId: s.seatId, harness: s.harness }));
  const verifiers = seats.filter((s) => GATE_VERIFIER_ROLES.has(s.role)).map((s) => ({
    seatId: s.seatId,
    harness: s.harness,
    ran: s.outcome !== "not_run" && s.outcome !== "skipped",
    verdict: s.outcome === "completed" ? "approve" : failedOutcomes.has(s.outcome) ? "reject" : "none",
    reviewedSha: s.reviewedSha ?? null
  }));
  return evaluateVerifyGate({ runStatus: report.status, writers, verifiers, receiptAttached, policy, snapshot: report.snapshot });
}
function enforceMergeGate(verdict) {
  if (verdict.status === "PASS") {
    return { allowed: true, reason: "", overrideRequired: false, verdict };
  }
  if (verdict.policy === "ADVISORY") {
    return {
      allowed: true,
      reason: `Merged under ADVISORY policy despite gate verdict ${verdict.status} (${verdict.tier}): ${verdict.reasons.join(" ")}`,
      overrideRequired: false,
      verdict
    };
  }
  return {
    allowed: false,
    reason: `STRICT gate: merge blocked \u2014 ${verdict.reasons[0] ?? `verdict ${verdict.status} (${verdict.tier})`}`,
    overrideRequired: true,
    verdict
  };
}
function gateFindingsForTeam(team, policy) {
  const out = [];
  const writerHarnesses = new Set(team.seats.filter((s) => s.mayWrite).map((s) => s.harness));
  const verifierSeats = team.seats.filter((s) => GATE_VERIFIER_ROLES.has(s.role));
  if (writerHarnesses.size === 0) return out;
  if (verifierSeats.length === 0) {
    out.push({
      severity: policy === "STRICT" ? "error" : "warning",
      code: "no_verifier_seat",
      message: "No reviewer/security/tester seat \u2014 the Adversarial Verification Gate will block this team's runs in STRICT mode because nothing checks the writers' work."
    });
    return out;
  }
  const verifierHarnesses = new Set(verifierSeats.map((s) => s.harness));
  const covered = [...writerHarnesses].every((wh) => [...verifierHarnesses].some((vh) => vh !== wh));
  if (!covered) {
    out.push({
      severity: policy === "STRICT" ? "error" : "warning",
      code: "self_verification_locked_in",
      message: `Every verifier shares a harness with a writer (${[...verifierHarnesses].join(", ")}). The gate treats that as self-verification and will block runs in STRICT mode \u2014 assign a different harness to a verifier seat.`
    });
  }
  return out;
}

// probe/verifyGate.test.ts
var base = (over) => ({
  runStatus: "completed",
  writers: [{ seatId: "impl", harness: "claude" }],
  verifiers: [{ seatId: "reviewer", harness: "codex", ran: true, verdict: "approve" }],
  receiptAttached: true,
  policy: "STRICT",
  ...over
});
describe("verifyGate \u2014 the adversarial core", () => {
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
          { seatId: "debug", harness: "grok" }
        ],
        verifiers: [
          { seatId: "reviewer", harness: "grok", ran: true, verdict: "approve" },
          { seatId: "security", harness: "claude", ran: true, verdict: "approve" }
        ]
      })
    );
    assert.equal(v.status, "PASS");
    assert.equal(v.tier, "cross-seat");
  });
  it("no verifier ran \u2192 unverified; BLOCKED in STRICT, FAILED in ADVISORY", () => {
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
describe("verifyGate \u2014 hard failures and receipts", () => {
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
describe("verifyGate \u2014 team-run report derivation", () => {
  const seats = [
    { seatId: "impl", role: "coder", harness: "claude", outcome: "completed", verified: true },
    { seatId: "reviewer", role: "reviewer", harness: "codex", outcome: "completed", verified: true },
    { seatId: "test", role: "tester", harness: "opencode", outcome: "completed", verified: false },
    { seatId: "sec", role: "security", harness: "grok", outcome: "failed", verified: false }
  ];
  it("completed verifier approves, failed verifier rejects \u2192 gate FAILs", () => {
    const v = gateForTeamReport({ status: "completed", seats }, "STRICT", true);
    assert.equal(v.status, "FAIL");
    assert.match(v.reasons.join("\n"), /sec/);
  });
  it("notRun seats never count toward verification", () => {
    const v = gateForTeamReport(
      { status: "completed", seats: [seats[0], seats[1]], notRun: ["reviewer"] },
      "STRICT",
      true
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
describe("verifyGate \u2014 configuration-time findings + policy", () => {
  it("team whose verifiers all share writer harnesses is flagged (error in STRICT)", () => {
    const team = {
      seats: [
        { role: "coder", harness: "claude", mayWrite: true },
        { role: "reviewer", harness: "claude", mayWrite: false }
      ]
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
        { role: "reviewer", harness: "codex", mayWrite: false }
      ]
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
describe("verifyGate \u2014 snapshot evidence binding (11.10)", () => {
  const snap = { built: true, sha: "abc123", ref: "mj/x/review", writerBranches: ["mj/x/impl"] };
  it("a verifier whose reviewedSha matches the snapshot counts (cross-vendor PASS)", () => {
    const v = evaluateVerifyGate(
      base({
        snapshot: snap,
        verifiers: [{ seatId: "reviewer", harness: "codex", ran: true, verdict: "approve", reviewedSha: "abc123" }]
      })
    );
    assert.equal(v.status, "PASS");
    assert.equal(v.tier, "cross-vendor");
    assert.ok(v.evidence);
    assert.equal(v.evidence?.snapshotSha, "abc123");
    assert.equal(v.evidence?.reviewedBy[0].matchesSnapshot, true);
  });
  it("a verifier that ran but reviewed a DIFFERENT ref cannot vouch \u2192 BLOCKED", () => {
    const v = evaluateVerifyGate(
      base({
        snapshot: snap,
        verifiers: [{ seatId: "reviewer", harness: "codex", ran: true, verdict: "approve", reviewedSha: "base-sha" }]
      })
    );
    assert.equal(v.status, "BLOCKED");
    assert.equal(v.tier, "self-verification");
    assert.equal(v.evidence?.reviewedBy[0].matchesSnapshot, false);
    assert.match(v.reasons.join("\n"), /does not match the snapshot/);
  });
  it("a verifier with no recorded ref cannot vouch either", () => {
    const v = evaluateVerifyGate(
      base({
        snapshot: snap,
        verifiers: [{ seatId: "reviewer", harness: "codex", ran: true, verdict: "approve" }]
      })
    );
    assert.equal(v.status, "BLOCKED");
  });
  it("writers present but NO snapshot built \u2192 unverified, BLOCKED in STRICT", () => {
    const v = evaluateVerifyGate(
      base({
        snapshot: { built: false, sha: null },
        verifiers: [{ seatId: "reviewer", harness: "codex", ran: true, verdict: "approve", reviewedSha: null }]
      })
    );
    assert.equal(v.status, "BLOCKED");
    assert.equal(v.tier, "unverified");
    assert.match(v.reasons.join("\n"), /no review snapshot/);
  });
  it("read-only missions still pass with snapshot evidence untouched", () => {
    const v = evaluateVerifyGate(base({ writers: [], snapshot: snap }));
    assert.equal(v.status, "PASS");
  });
});
describe("verifyGate \u2014 merge enforcement (11.10)", () => {
  const pass = evaluateVerifyGate(base({}));
  const blocked = evaluateVerifyGate(base({ verifiers: [{ seatId: "r", harness: "claude", ran: true, verdict: "approve" }] }));
  const advisoryBlocked = evaluateVerifyGate(base({ policy: "ADVISORY", verifiers: [{ seatId: "r", harness: "claude", ran: true, verdict: "approve" }] }));
  it("PASS \u2192 merge allowed, no override", () => {
    const m = enforceMergeGate(pass);
    assert.equal(m.allowed, true);
    assert.equal(m.overrideRequired, false);
    assert.equal(m.reason, "");
    assert.equal(m.verdict, pass);
  });
  it("STRICT non-PASS \u2192 merge blocked, override required", () => {
    const m = enforceMergeGate(blocked);
    assert.equal(m.allowed, false);
    assert.equal(m.overrideRequired, true);
    assert.match(m.reason, /STRICT/);
  });
  it("ADVISORY non-PASS \u2192 merge allowed, failure recorded in the reason", () => {
    const m = enforceMergeGate(advisoryBlocked);
    assert.equal(m.allowed, true);
    assert.equal(m.overrideRequired, false);
    assert.match(m.reason, /ADVISORY/);
  });
});
