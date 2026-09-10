/**
 * MJ 14.1 — THE MISSION RECORD (suite #81).
 *
 * The crown artifact: one signed, verifiable file per mission assembled from the REAL
 * stores (loop ledger, receipt vault). §1 seal→verify; §2 tamper evidence (economics
 * edit, forged signature, flipped evidence mark); §3 the empty-store refusal; §4 the
 * standalone CLI (tools/verify-mission-record.mjs) verifies with zero MJ state.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMissionRecord, verifyMissionRecord, type MissionRecord } from "../src/mission/missionRecord";
import { saveMissionLoopState, type LoopCycleRecord } from "../src/mission/missionLoop";
import { globalReceiptVault } from "../src/mission/receiptVault";
import { buildProofReceipt } from "../src/mission/receipts";
import { ensureIssuerIdentity } from "../src/mission/signing";
import { VH_VERSION } from "../src/version";

const memStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => void memStore.set(k, String(v)),
  removeItem: (k: string) => void memStore.delete(k),
  clear: () => memStore.clear(),
  key: (i: number) => [...memStore.keys()][i] ?? null,
  get length() {
    return memStore.size;
  },
} as Storage;

await ensureIssuerIdentity();

const seat = (seatId: string, role: string, harness: string, outcome: string, verified = false) => ({ seatId, role, harness, outcome, verified });
const T = "2026-09-09T00:0";
const cycle: LoopCycleRecord = {
  cycleNo: 1, missionId: "checkout-bugfix", objective: "fix the checkout race", teamId: "t-alpha", teamName: "Alpha",
  startedAt: `${T}1:00.000Z`, finishedAt: `${T}4:00.000Z`, elapsedMs: 180000, status: "completed",
  gate: { status: "PASS", tier: "cross-vendor" }, arena: { gate: "PASS", digest: "aa11" }, arms: ["review:standard"],
  seats: [seat("impl", "writer", "claude", "merged", true), seat("rev", "verifier", "codex", "CORRECT: verified", true)],
  verifiedSeats: 2, seatCount: 2, spentUsd: 0.75, messagesOnBus: 4, lessonsAdded: 1, banditTrials: 3,
  receipt: { hash: "aa".repeat(32), ok: true }, candidateIds: [], note: "", tokensOnlySeats: 0, budgetUsd: 1,
};

const receipt = async (): Promise<ReturnType<typeof buildProofReceipt>> =>
  buildProofReceipt({
    mission: "checkout-bugfix", teamId: "t-alpha",
    startedAt: `${T}1:00.000Z`, finishedAt: `${T}4:00.000Z`, mjVersion: "14.1.0", edition: "personal",
    report: {
      status: "completed", reviewedBySnapshot: true, autonomyArms: ["review:standard"],
      seats: [{ seatId: "impl", role: "writer", outcome: "merged", verified: true, harness: "claude" }],
    },
  });

const root = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();
const cli = path.join(root, "tools", "verify-mission-record.mjs");

function runCli(file: string, extra: string[] = []): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync(process.execPath, [cli, ...extra, file], { encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("missionRecord — one signed file per mission", () => {
  it("§1 seals from real stores and verifies — economics identical to the chargeback row", async () => {
    saveMissionLoopState({
      schemaVersion: 1, createdAt: `${T}0:00.000Z`, updatedAt: `${T}9:00.000Z`, running: false,
      currentPhase: "adapt", cycles: [cycle], feedbackByCycle: { "checkout-bugfix": { rating: 5, comment: "clean", at: `${T}4:30.000Z` } }, lastError: null,
    });
    globalReceiptVault.clear();
    globalReceiptVault.issue({ mission: "checkout-bugfix", teamId: "t-alpha", gateStatus: "PASS", gateTier: "cross-vendor", receipt: await receipt() });

    const r = await buildMissionRecord("checkout-bugfix");
    assert.ok(r);
    assert.equal(r.format, "vh-mission-record/1");
    // 16.4.1 — a mission artifact must report the CURRENT execution version,
    // never a stale hardcoded literal (reviewer provenance finding)
    assert.equal(r.mjVersion, VH_VERSION, `record claims execution core ${VH_VERSION}, not a stale literal`);
    assert.equal(r.cycles.length, 1);
    assert.equal(r.economics?.perCycle.length, 1);
    assert.equal(r.economics?.perCycle[0]?.measuredUsd, 0.75);
    assert.equal(r.economics?.totals.measuredUsd, 0.75);
    assert.equal(r.economics?.totals.missionAdherence, 1); // $0.75 under the shared $1 cap
    assert.equal(r.assuranceContext?.scope, "fleet"); // labeled fleet-level, never a per-run safety grade
    assert.equal(r.evidence[0].verification.ok, true);
    assert.ok(r.signature);
    assert.equal((await verifyMissionRecord(r)).ok, true);
  });

  it("§1b economics spans every cycle — never last-cycle-only (the 14.1.1 fix)", async () => {
    const cycle2: LoopCycleRecord = { ...cycle, cycleNo: 2, spentUsd: 0.5, budgetUsd: 1, status: "completed" };
    saveMissionLoopState({
      schemaVersion: 1, createdAt: `${T}0:00.000Z`, updatedAt: `${T}9:00.000Z`, running: false,
      currentPhase: "adapt", cycles: [cycle, cycle2], feedbackByCycle: {}, lastError: null,
    });
    const r = await buildMissionRecord("checkout-bugfix");
    assert.ok(r?.economics);
    assert.equal(r.economics.perCycle.length, 2); // BOTH cycles, not just the last
    assert.equal(r.economics.perCycle[0]?.measuredUsd, 0.75);
    assert.equal(r.economics.perCycle[1]?.measuredUsd, 0.5);
    assert.equal(r.economics.totals.measuredUsd, 1.25);
    assert.equal(r.economics.totals.missionBudgetUsd, 1); // shared signed cap
    assert.equal(r.economics.totals.missionAdherence, 0.8); // 1 / 1.25
    assert.equal(r.economics.totals.overrunUsd, 0.25);
  });

  it("§2 any tampering fails — economics, signature, or evidence marks", async () => {
    const r = (await buildMissionRecord("checkout-bugfix")) as MissionRecord;
    const t1 = structuredClone(r);
    t1.economics!.totals.measuredUsd = 0.01; // someone "adjusts" the bill
    assert.equal((await verifyMissionRecord(t1)).ok, false);

    const t2 = structuredClone(r);
    t2.signature = "0".repeat(128);
    assert.equal((await verifyMissionRecord(t2)).ok, false);

    const t3 = structuredClone(r);
    t3.evidence[0].verification.ok = false; // someone inflates the damage
    assert.equal((await verifyMissionRecord(t3)).ok, false);

    const t4 = structuredClone(r);
    delete t4.signature;
    delete t4.signatureNote; // unsigned WITHOUT the honest note
    assert.equal((await verifyMissionRecord(t4)).ok, false);
  });

  it("§3 empty stores → null, honestly", async () => {
    saveMissionLoopState({
      schemaVersion: 1, createdAt: `${T}0:00.000Z`, updatedAt: `${T}9:00.000Z`, running: false,
      currentPhase: "adapt", cycles: [], feedbackByCycle: {}, lastError: null,
    });
    assert.equal(await buildMissionRecord("never-ran"), null);
  });

  it("§4 the standalone CLI verifies with zero MJ state", async () => {
    saveMissionLoopState({
      schemaVersion: 1, createdAt: `${T}0:00.000Z`, updatedAt: `${T}9:00.000Z`, running: false,
      currentPhase: "adapt", cycles: [cycle], feedbackByCycle: {}, lastError: null,
    });
    const r = (await buildMissionRecord("checkout-bugfix")) as MissionRecord;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mj-record-"));
    const file = path.join(dir, "record.json");
    fs.writeFileSync(file, JSON.stringify(r, null, 2));
    const okRun = runCli(file);
    assert.equal(okRun.code, 3, okRun.out); // signed but NO trusted key pinned: honestly UNVERIFIED
    assert.match(okRun.out, /VALID SIGNATURE/);
    assert.match(okRun.out, /UNVERIFIED/);

    const authRun = runCli(file, ["--issuer-key", r.issuer?.publicKeyHex ?? ""]);
    assert.equal(authRun.code, 0, authRun.out);
    assert.match(authRun.out, /VALID/);
    assert.match(authRun.out, /AUTHENTICATED/);

    const wrongRun = runCli(file, ["--issuer-key", "9".repeat(64)]);
    assert.equal(wrongRun.code, 1, wrongRun.out);
    assert.match(wrongRun.out, /does NOT match/);

    const bad = structuredClone(r);
    bad.cycles[0].spentUsd = 999;
    const badFile = path.join(dir, "bad.json");
    fs.writeFileSync(badFile, JSON.stringify(bad));
    const badRun = runCli(badFile);
    assert.equal(badRun.code, 1);
    assert.match(badRun.out, /INVALID/);
    assert.match(badRun.out, /digest mismatch/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
