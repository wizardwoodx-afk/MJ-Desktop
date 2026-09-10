/**
 * 11.9.9 — Receipt Vault & Compliance Center backend (suite #51).
 *
 * §1 issue → list → cap; records carry the gate verdict
 * §2 the self-audit re-verifies every chain and names a tampered record
 * §3 SIEM bundle shape: flat JSONL, header + events, chain preserved
 * §4 the one-pager's claims are present AND honestly bounded
 * §5 receipts gain a gate event exactly when a run was gated (back-compat shape pin)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ReceiptVault, VAULT_CAP } from "../src/mission/receiptVault";
import { buildProofReceipt, type ProofReceipt } from "../src/mission/receipts";
import type { AutonomyRunSummary } from "../src/mission/autonomyRuntime";

const cleanReport = (over: Partial<AutonomyRunSummary> = {}): AutonomyRunSummary => ({
  status: "completed",
  seats: [
    { seatId: "impl", role: "coder", outcome: "completed", verified: true },
    { seatId: "reviewer", role: "reviewer", outcome: "completed", verified: true },
  ],
  autonomyArms: [],
  reviewedBySnapshot: true,
  ...over,
});

async function receipt(over: Partial<AutonomyRunSummary> = {}): Promise<ProofReceipt> {
  return buildProofReceipt({
    mission: "mission-vault",
    teamId: "team-vault",
    startedAt: "2026-09-06T10:00:00Z",
    finishedAt: "2026-09-06T10:05:00Z",
    mjVersion: "11.9.9",
    edition: "desktop",
    report: cleanReport(over),
  });
}

describe("receiptVault — issue, list, cap", () => {
  it("issued receipts are listed newest-first with their gate verdict", async () => {
    const vault = new ReceiptVault();
    const r1 = await receipt();
    const r2 = await receipt({ gateStatus: "PASS", gateTier: "cross-vendor" });
    vault.issue({ mission: "m1", teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: r1 });
    vault.issue({ mission: "m2", teamId: "t", gateStatus: "PASS", gateTier: "cross-vendor", receipt: r2 });
    const list = vault.list();
    assert.equal(list.length, 2);
    assert.equal(list[0].mission, "m2");
    assert.equal(list[0].gateStatus, "PASS");
    assert.equal(list[1].gateStatus, "n/a");
    assert.ok(vault.get(list[0].id));
    assert.equal(vault.get("nope"), null);
  });

  it("the vault trims to VAULT_CAP oldest-first", async () => {
    const vault = new ReceiptVault();
    const rc = await receipt();
    for (let i = 0; i < VAULT_CAP + 3; i++) {
      vault.issue({ mission: `m${i}`, teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: rc });
    }
    assert.equal(vault.list().length, VAULT_CAP);
    assert.equal(vault.list()[0].mission, `m${VAULT_CAP + 2}`);
  });
});

describe("receiptVault — self-audit", () => {
  it("a clean vault audits 100% valid", async () => {
    const vault = new ReceiptVault();
    vault.issue({ mission: "m1", teamId: "t", gateStatus: "PASS", gateTier: "cross-vendor", receipt: await receipt({ gateStatus: "PASS", gateTier: "cross-vendor" }) });
    vault.issue({ mission: "m2", teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: await receipt() });
    const a = await vault.audit();
    assert.equal(a.total, 2);
    assert.equal(a.valid, 2);
    assert.deepEqual(a.broken, []);
  });

  it("a tampered stored receipt is detected and named by id", async () => {
    const vault = new ReceiptVault();
    const good = await receipt();
    const bad = await receipt();
    bad.events[1] = { ...bad.events[1], data: { ...bad.events[1].data, verified: false } };
    const g = vault.issue({ mission: "good", teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: good });
    const b = vault.issue({ mission: "bad", teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: bad });
    const a = await vault.audit();
    assert.equal(a.valid, 1);
    assert.equal(a.broken.length, 1);
    assert.equal(a.broken[0].id, b.id);
    assert.notEqual(a.broken[0].id, g.id);
    assert.match(a.broken[0].reason, /hash|chain/);
  });
});

describe("receiptVault — SIEM export", () => {
  it("bundle is flat JSONL: one header line and N event lines per receipt, hashes intact", async () => {
    const vault = new ReceiptVault();
    const r1 = await receipt();
    const r2 = await receipt({ gateStatus: "PASS", gateTier: "cross-vendor" });
    vault.issue({ mission: "m1", teamId: "t", gateStatus: "n/a", gateTier: "n/a", receipt: r1 });
    vault.issue({ mission: "m2", teamId: "t", gateStatus: "PASS", gateTier: "cross-vendor", receipt: r2 });
    const lines = vault.siemBundle().trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const headers = lines.filter((l) => l.type === "mj.receipt.header");
    const events = lines.filter((l) => l.type === "mj.receipt.event");
    assert.equal(headers.length, 2);
    assert.equal(events.length, r1.events.length + r2.events.length);
    // Chain preservation: the emitted event bodies are byte-identical to the receipt's.
    const firstEvent = events[0] as { vaultId: string; event: { hash: string } };
    const rec = vault.get(firstEvent.vaultId);
    assert.ok(rec);
    assert.equal(firstEvent.event.hash, rec.receipt.events[0].hash);
    // Gate verdict travels in the SIEM header line.
    const gated = headers.find((h) => (h.header as { mission: string }).mission === "mission-vault" && h.gateStatus === "PASS");
    assert.ok(gated);
  });
});

describe("receiptVault — the one-pager", () => {
  it("states the control mapping AND the honest non-claims", () => {
    const vault = new ReceiptVault();
    const page = vault.onePager({ mjVersion: "11.9.9", edition: "desktop" });
    assert.match(page, /EU AI Act Art\. 12/);
    assert.match(page, /different harness/);
    assert.match(page, /verifyProofReceipt/);
    assert.match(page, /not a certification body/);
    assert.match(page, /not legal advice/);
  });
});

describe("receipts — gate event back-compat", () => {
  it("an ungated report keeps the exact pre-11.9.9 event shape (4 events, no gate event)", async () => {
    const rc = await receipt();
    assert.equal(rc.events.length, 4);
    assert.ok(!rc.events.some((e) => e.kind === "gate.verdict"));
  });

  it("a gated report appends exactly one gate.verdict event, in-chain", async () => {
    const rc = await receipt({ gateStatus: "PASS", gateTier: "cross-vendor" });
    assert.equal(rc.events.length, 5);
    const gate = rc.events.find((e) => e.kind === "gate.verdict");
    assert.ok(gate);
    assert.equal((gate.data as { status: string }).status, "PASS");
    assert.equal((gate.data as { tier: string }).tier, "cross-vendor");
    // The gate event is chained to the verdict event before it.
    const i = rc.events.indexOf(gate);
    assert.equal(gate.prev, rc.events[i - 1].hash);
  });
});
