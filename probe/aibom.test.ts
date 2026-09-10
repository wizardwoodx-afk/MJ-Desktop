/**
 * 11.10.5 — Verified AI Delivery V1: the AI Bill of Materials (suite #58).
 *
 * Auditors now ask: which AI components touched the codebase, where, and are they
 * approved? MJ MEASURES this in its receipts, so the AIBOM is measurement, not
 * self-report. Proven here:
 *
 * §1 components observed in receipts become entries with roles, missions, identity digests
 * §2 approval status comes from the user's OWN Role Board declaration — owned = approved,
 *    observed-but-undeclared = not-declared (MJ never invents an approval policy)
 * §3 the honesty rules: version is "not measured", empty vault = empty inventory,
 *    markdown export renders
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ReceiptVault } from "../src/mission/receiptVault";
import { buildProofReceipt } from "../src/mission/receipts";
import { buildAibom, aibomToMarkdown } from "../src/mission/aibom";
import type { AutonomyRunSummary } from "../src/mission/autonomyRuntime";

function reportWith(harnesses: Array<{ seatId: string; role: string; harness: string }>): AutonomyRunSummary {
  return {
    status: "pass",
    seats: harnesses.map((h) => ({ seatId: h.seatId, role: h.role, outcome: "done", verified: true, harness: h.harness })),
    autonomyArms: [],
    reviewedBySnapshot: true,
    gateStatus: "PASS",
    gateTier: "cross-vendor",
  };
}

describe("AIBOM — the inventory auditors ask for", () => {
  it("observed components become entries with roles, mission counts and identity digests", async () => {
    const vault = new ReceiptVault();
    const r1 = await buildProofReceipt({
      mission: "m-1",
      teamId: "t-1",
      startedAt: "a",
      finishedAt: "b",
      mjVersion: "11.10.5",
      edition: "pro",
      report: reportWith([
        { seatId: "coder", role: "coder", harness: "claude-code" },
        { seatId: "reviewer", role: "reviewer", harness: "codex" },
      ]),
    });
    const r2 = await buildProofReceipt({
      mission: "m-2",
      teamId: "t-1",
      startedAt: "c",
      finishedAt: "d",
      mjVersion: "11.10.5",
      edition: "pro",
      report: reportWith([{ seatId: "coder", role: "coder", harness: "claude-code" }]),
    });
    vault.issue({ mission: "m-1", teamId: "t-1", gateStatus: "PASS", gateTier: "cross-vendor", receipt: r1 });
    vault.issue({ mission: "m-2", teamId: "t-1", gateStatus: "PASS", gateTier: "cross-vendor", receipt: r2 });

    const bom = buildAibom({ records: vault.list(), ownedHarnesses: ["claude-code"], mjVersion: "11.10.5" });
    assert.equal(bom.format, "vh-aibom/1");
    assert.equal(bom.receiptsScanned, 2);
    assert.equal(bom.entries.length, 2);

    const cc = bom.entries.find((e) => e.component === "claude-code");
    const cx = bom.entries.find((e) => e.component === "codex");
    assert.ok(cc && cx);
    assert.equal(cc.missions, 2, "claude-code appeared in both missions");
    assert.equal(cx.missions, 1);
    assert.deepEqual(cc.roles.sort(), ["coder"]);
    assert.deepEqual(cx.roles.sort(), ["reviewer"]);
    assert.ok(cc.seatIdentities.length >= 1, "seat identity digests must ride with the entry");
    assert.match(cc.seatIdentities[0], /^[0-9a-f]{64}$/);
  });

  it("approval status is the user's OWN declaration: owned = approved, else not-declared", async () => {
    const vault = new ReceiptVault();
    const rc = await buildProofReceipt({
      mission: "m-a",
      teamId: "t-a",
      startedAt: "a",
      finishedAt: "b",
      mjVersion: "11.10.5",
      edition: "pro",
      report: reportWith([
        { seatId: "coder", role: "coder", harness: "claude-code" },
        { seatId: "reviewer", role: "reviewer", harness: "grok-build" },
      ]),
    });
    vault.issue({ mission: "m-a", teamId: "t-a", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc });

    const bom = buildAibom({ records: vault.list(), ownedHarnesses: ["claude-code"], mjVersion: "11.10.5" });
    const cc = bom.entries.find((e) => e.component === "claude-code");
    const gb = bom.entries.find((e) => e.component === "grok-build");
    assert.equal(cc?.approvalStatus, "approved");
    assert.equal(gb?.approvalStatus, "not-declared", "an undeclared harness must be marked, never auto-approved");
    assert.match(bom.declarationSource, /Role Board/);
  });

  it("honesty: versions are never invented; an empty vault yields an empty inventory", async () => {
    const vault = new ReceiptVault();
    const rc = await buildProofReceipt({
      mission: "m-v",
      teamId: "t-v",
      startedAt: "a",
      finishedAt: "b",
      mjVersion: "11.10.5",
      edition: "pro",
      report: reportWith([{ seatId: "coder", role: "coder", harness: "opencode" }]),
    });
    vault.issue({ mission: "m-v", teamId: "t-v", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc });
    const bom = buildAibom({ records: vault.list(), ownedHarnesses: [], mjVersion: "11.10.5" });
    assert.match(bom.entries[0].version, /not measured/i, "MJ must not invent a model version it cannot measure");
    assert.match(bom.disclaimer, /not claimed/i);

    const empty = buildAibom({ records: [], ownedHarnesses: ["claude-code"], mjVersion: "11.10.5" });
    assert.equal(empty.entries.length, 0, "no receipts → no components; never speculative");
    const md = aibomToMarkdown(empty);
    assert.match(md, /No AI components observed/);
  });

  it("markdown rendering is a paste-ready audit table", async () => {
    const vault = new ReceiptVault();
    const rc = await buildProofReceipt({
      mission: "m-md",
      teamId: "t-md",
      startedAt: "a",
      finishedAt: "b",
      mjVersion: "11.10.5",
      edition: "pro",
      report: reportWith([{ seatId: "coder", role: "coder", harness: "claude-code" }]),
    });
    vault.issue({ mission: "m-md", teamId: "t-md", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc });
    const md = aibomToMarkdown(buildAibom({ records: vault.list(), ownedHarnesses: ["claude-code"], mjVersion: "11.10.5" }));
    assert.match(md, /\| Component \| Roles \| Missions \| Approval \| Version \|/);
    assert.match(md, /claude-code/);
    assert.match(md, /approved/);
  });
});
