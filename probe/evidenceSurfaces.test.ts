/**
 * MJ 14.0 — EVIDENCE SURFACES probe (suite #80).
 *
 * The 14.0 engines (finOps, assuranceScore, incidentDossier) are pure math, pinned by
 * their own suites. This suite pins the PRODUCT side of the contract: the store-reading
 * layer (src/mission/evidenceSurfaces.ts) that the Audit page renders. It seeds MJ's
 * REAL stores through their REAL APIs — saveMissionLoopState() for the cycle spine the
 * Mission Loop writes (the missionLoop probe proves real gated runs write these exact
 * records) and globalReceiptVault.issue() for the receipt vault — then asserts the
 * surfaces derive honest outputs from them, and refuse honestly when the stores are
 * empty.
 *
 *   §1 empty stores → unevaluated score, empty chargeback, no dossier
 *   §2 real-shaped records → chargeback rows with measured honesty
 *   §3 the assurance score over the seeded ledger (factor-level assertions)
 *   §4 the incident black box over loop ledger + vault, tamper-evident
 *   §5 schema tolerance: pre-14.0 records without the new fields read as 0/null
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { saveMissionLoopState, type LoopCycleRecord, type MissionLoopState } from "../src/mission/missionLoop";
import { chargebackFromLoopState, assuranceFromLoopState, dossierForMission, finOpsInputForCycle } from "../src/mission/evidenceSurfaces";
import { verifyIncidentDossier } from "../src/mission/incidentDossier";
import { globalReceiptVault } from "../src/mission/receiptVault";
import { buildProofReceipt } from "../src/mission/receipts";
import { ensureIssuerIdentity } from "../src/mission/signing";

/* In-memory localStorage so the shared stores persist inside this suite's own process
   (same idiom as the missionLoop probe; the offline runner isolates per suite). */
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

const cycle1: LoopCycleRecord = {
  cycleNo: 1, missionId: "checkout-bugfix", objective: "fix the checkout race", teamId: "t-alpha", teamName: "Alpha",
  startedAt: `${T}1:00.000Z`, finishedAt: `${T}4:00.000Z`, elapsedMs: 180000, status: "completed",
  gate: { status: "PASS", tier: "cross-vendor" }, arena: { gate: "PASS", digest: "aa11" }, arms: ["review:standard"],
  seats: [seat("impl", "writer", "claude", "merged", true), seat("rev", "verifier", "codex", "CORRECT: verified", true), seat("sim", "planner", "claude", "simulated: drafted")],
  verifiedSeats: 2, seatCount: 3, spentUsd: 0.75, messagesOnBus: 4, lessonsAdded: 1, banditTrials: 3,
  receipt: { hash: "aa".repeat(32), ok: true }, candidateIds: [], note: "", tokensOnlySeats: 1, budgetUsd: 1,
};
const cycle2: LoopCycleRecord = {
  cycleNo: 2, missionId: "docs-refresh", objective: "refresh the docs", teamId: "t-alpha", teamName: "Alpha",
  startedAt: `${T}5:00.000Z`, finishedAt: `${T}7:00.000Z`, elapsedMs: 120000, status: "completed",
  gate: { status: "PASS", tier: "same-vendor" }, arena: null, arms: [],
  seats: [seat("w", "writer", "ollama-local", "merged", true), seat("v", "verifier", "ollama-local", "CORRECT: verified", true)],
  verifiedSeats: 2, seatCount: 2, spentUsd: 0, messagesOnBus: 2, lessonsAdded: 0, banditTrials: 2,
  receipt: { hash: "bb".repeat(32), ok: true }, candidateIds: [], note: "", tokensOnlySeats: 0, budgetUsd: null,
};
const cycle3: LoopCycleRecord = {
  cycleNo: 3, missionId: "sim-drill", objective: "labelled simulation drill", teamId: "t-beta", teamName: "Beta",
  startedAt: `${T}8:00.000Z`, finishedAt: `${T}9:00.000Z`, elapsedMs: 60000, status: "completed",
  gate: null, arena: null, arms: [],
  seats: [seat("s1", "writer", "claude", "simulated: drafted"), seat("s2", "verifier", "codex", "simulated: verified")],
  verifiedSeats: 0, seatCount: 2, spentUsd: 0, messagesOnBus: 2, lessonsAdded: 0, banditTrials: 1,
  receipt: null, candidateIds: [], note: "", tokensOnlySeats: 0, budgetUsd: null,
};

function seed(cycles: LoopCycleRecord[], feedback: MissionLoopState["feedbackByCycle"] = {}): void {
  saveMissionLoopState({
    schemaVersion: 1, createdAt: `${T}0:00.000Z`, updatedAt: `${T}9:00.000Z`, running: false,
    currentPhase: "adapt", cycles, feedbackByCycle: feedback, lastError: null,
  });
}

describe("evidenceSurfaces — the store-reading layer behind the Audit page", () => {
  it("§1 empty stores refuse honestly", async () => {
    seed([], {});
    const a = assuranceFromLoopState();
    assert.equal(a.status, "unevaluated");
    assert.match(a.unevaluatedReason ?? "", /refuses/);
    const cb = await chargebackFromLoopState();
    assert.equal(cb.totals.missions, 0);
    assert.equal(cb.totals.measuredUsdTotal, 0);
    assert.equal(await dossierForMission("checkout-bugfix"), null);
  });

  it("§2 the chargeback derives from real cycle records, with measured honesty", async () => {
    seed([cycle1, cycle2, cycle3], { "checkout-bugfix": { rating: 4, comment: "solid", at: `${T}4:30.000Z` } });
    const cb = await chargebackFromLoopState();
    assert.equal(cb.totals.missions, 3);
    assert.equal(cb.totals.measuredUsdTotal, 0.75); // cycle2's $0 is measured-zero (local models), not unknown
    assert.equal(cb.totals.unmeasuredMissions, 1); // the all-simulated drill has no measured dollars — honestly unmeasured
    assert.equal(cb.rows.find((r) => r.missionId === "sim-drill")?.measuredUsd, null);
    assert.equal(cb.totals.simulatedSeatsTotal, 3); // 1 in cycle1 + 2 in the drill — counted, never charged
    assert.equal(cb.totals.tokensOnlySeatsTotal, 1); // cycle1's tokens-only seat stays unmeasured IN WORDS
    const r1 = cb.rows.find((r) => r.missionId === "checkout-bugfix");
    assert.equal(r1?.budgetUsd, 1);
    assert.equal(r1?.adherence, 1); // $0.75 under the $1 signed cap
    const csvCompatible = finOpsInputForCycle(cycle1);
    assert.deepEqual(csvCompatible.measuredSeatUsd, [0.75]);
  });

  it("§3 the assurance score reads the same spine", async () => {
    seed([cycle1, cycle2, cycle3], { "checkout-bugfix": { rating: 4, comment: "solid", at: `${T}4:30.000Z` } });
    const a = assuranceFromLoopState();
    assert.equal(a.status, "evaluated");
    assert.equal(a.evidenceCoverage, 0.67); // 2 measured + 1 simulated dilutes (rounded to the score's precision)
    const f = Object.fromEntries(a.factors.map((x) => [x.name, x]));
    assert.equal(f["verification"].points, 17.5); // 50% cross-vendor (12.5) + same-vendor capped (5)
    assert.equal(f["governance arena"].points, 10); // 1 of 2 measured runs arena-stamped
    assert.equal(f["budget discipline"].points, 10); // only cycle1 is measurable (capped), adherence 1 → 20 × 1 × 0.5
    assert.equal(f["human feedback"].points, 8); // mean rating 4 → ×2
    assert.equal((a.score ?? 0) > 0, true);
  });

  it("§4 the black box assembles loop ledger + vault and is tamper-evident", async () => {
    seed([cycle1], {});
    const receipt = await buildProofReceipt({
      mission: "checkout-bugfix", teamId: "t-alpha",
      startedAt: `${T}1:00.000Z`, finishedAt: `${T}4:00.000Z`, mjVersion: "14.0.0", edition: "personal",
      report: {
        status: "completed", reviewedBySnapshot: true, autonomyArms: ["review:standard"],
        seats: [{ seatId: "impl", role: "writer", outcome: "merged", verified: true, harness: "claude" }],
      },
    });
    globalReceiptVault.issue({ mission: "checkout-bugfix", teamId: "t-alpha", gateStatus: "PASS", gateTier: "cross-vendor", receipt });
    const d = await dossierForMission("checkout-bugfix");
    assert.ok(d);
    assert.equal(d.receipts.length, 1);
    assert.equal(d.receipts[0].verification.ok, true);
    assert.ok(d.timeline.some((e) => e.kind === "cycle.gate" && e.summary.includes("cross-vendor")));
    assert.equal((await verifyIncidentDossier(d)).ok, true);
    const t = structuredClone(d);
    t.timeline[0].summary = "a cleaner story";
    assert.equal((await verifyIncidentDossier(t)).ok, false);
  });

  it("§5 pre-14.0 records (no tokensOnlySeats/budgetUsd) read as 0/null", async () => {
    const legacy = { ...cycle1, tokensOnlySeats: undefined, budgetUsd: undefined } as unknown as LoopCycleRecord;
    seed([legacy], {});
    const cb = await chargebackFromLoopState();
    assert.equal(cb.rows[0].tokensOnlySeats, 0);
    assert.equal(cb.rows[0].budgetUsd, null);
    assert.equal(cb.rows[0].adherence, null); // uncapped, honestly spelled
  });
});
