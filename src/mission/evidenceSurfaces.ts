/**
 * §EVIDENCE SURFACES — the store-reading layer that turns MJ's measured records into
 * the 14.0 evidence products (MJ 14.0).
 *
 * WHY THIS EXISTS
 * 14.0's engines (finOps, assuranceScore, incidentDossier) are PURE: they take explicit
 * inputs so probes can pin their math. This module is the PRODUCT side of that contract:
 * it reads the stores the Mission Loop actually writes (mj.missionLoop.v1 cycle records,
 * the receipt vault, the human-feedback store) and feeds the engines from REAL measured
 * data. No page and no probe may hand synthetic numbers to the engines through this
 * layer — the numbers come from the cycle spine or not at all.
 *
 * THE HONESTY RULES
 *  - Derivation only: every input is computed from fields on the cycle record the loop
 *    wrote at run time (spentUsd, gate.tier, arena.gate, seat outcomes, tokens-only
 *    counts, the signed budget cap) — never re-estimated here.
 *  - Simulation is read from the record itself: a seat whose outcome starts with
 *    "simulated" ran in the labelled simulation (the loop's own definition,
 *    anySeatSimulated()) and is counted as simulated, never measured.
 *  - Egress violations are reported as 0 with a documented reason: MJ's egress ledger is
 *    append-on-authorized — a refused departure never writes a record and never leaves.
 *    The refusal IS the gate working; there is no violation store to read.
 *  - Old cycle records written before 14.0 lack tokensOnlySeats/budgetUsd; the adapter
 *    treats them as 0/null (schema tolerance), which is the honest reading of a record
 *    that did not track them.
 */
import {
  loadMissionLoopState,
  type LoopCycleRecord,
  type MissionLoopState,
} from "./missionLoop";
import { rowFor, computeChargeback, type Chargeback, type FinOpsMissionInput } from "./finOps";
import { scoreAssurance, type AssuranceInput, type AssuranceScore } from "./assuranceScore";
import { buildIncidentDossier, type IncidentDossier, type IncidentEvent } from "./incidentDossier";
import { globalReceiptVault } from "./receiptVault";

const SIMULATED_PREFIX = "simulated";

function isSimulatedSeat(c: LoopSeatOutcomeLike): boolean {
  return c.outcome.startsWith(SIMULATED_PREFIX);
}
interface LoopSeatOutcomeLike {
  outcome: string;
  verified: boolean;
  harness: string;
  role: string;
  seatId: string;
}

function measuredSeatUsdFor(c: LoopCycleRecord): number[] {
  const simulated = c.seats.filter(isSimulatedSeat).length;
  const realSeats = c.seats.length - simulated;
  const tokensOnly = c.tokensOnlySeats ?? 0;
  // Measured dollars exist when the settlement reported spend, or when real seats ran
  // whose spend WAS measurable (a $0.00 settlement from free/local models is measured
  // zero, not unknown). Tokens-only seats make the mission's dollar spend unknown.
  if (c.spentUsd > 0) return [c.spentUsd];
  if (realSeats > 0 && tokensOnly === 0) return [0];
  return [];
}

function tokensOnlyFor(c: LoopCycleRecord): number {
  const simulated = c.seats.filter(isSimulatedSeat).length;
  const realSeats = c.seats.length - simulated;
  if (c.spentUsd > 0) return c.tokensOnlySeats ?? 0;
  if (realSeats > 0 && (c.tokensOnlySeats ?? 0) >= realSeats) return realSeats;
  return c.tokensOnlySeats ?? 0;
}

/** Every completed cycle record → one FinOps mission input, derived only from the record. */
export function finOpsInputForCycle(c: LoopCycleRecord): FinOpsMissionInput {
  return {
    missionId: c.missionId,
    teamId: c.teamId,
    teamName: c.teamName,
    finishedAt: c.finishedAt,
    measuredSeatUsd: measuredSeatUsdFor(c),
    tokensOnlySeats: tokensOnlyFor(c),
    simulatedSeats: c.seats.filter(isSimulatedSeat).length,
    budgetUsd: c.budgetUsd ?? null,
  };
}

/** The chargeback over the loop ledger — the real cycle spine, not caller-supplied rows. */
export async function chargebackFromLoopState(state?: MissionLoopState, issuedAt?: string): Promise<Chargeback> {
  const cycles = (state ?? loadMissionLoopState()).cycles;
  return computeChargeback(cycles.map(finOpsInputForCycle), issuedAt);
}

/**
 * The assurance score over the loop ledger: verification mix from the gate tiers the
 * loop recorded, arena passes from the stamped digests, budget discipline from the same
 * derivation the FinOps rows use, human feedback from the loop's own feedback store.
 */
export function assuranceFromLoopState(state?: MissionLoopState): AssuranceScore {
  const s = state ?? loadMissionLoopState();
  const measured = s.cycles.filter((c) => c.seats.some((x) => !isSimulatedSeat(x)));
  const simulated = s.cycles.filter((c) => c.seats.length > 0 && c.seats.every(isSimulatedSeat));
  const crossVendor = measured.filter((c) => c.gate?.tier === "cross-vendor").length;
  const sameVendor = measured.filter((c) => c.gate !== null && c.gate.tier !== "cross-vendor" && c.verifiedSeats > 0).length;
  const arenaPass = measured.filter((c) => c.arena?.gate === "PASS").length;
  const input: AssuranceInput = {
    measuredRuns: measured.length,
    simulatedRuns: simulated.length,
    crossVendorVerifiedRuns: crossVendor,
    sameVendorVerifiedRuns: sameVendor,
    arenaPassRuns: arenaPass,
    budgetAdherences: measured.map((c) => rowFor(finOpsInputForCycle(c)).adherence),
    // Refused departures never write a record (the gate refuses pre-write), so the
    // authorized-only ledger implies zero violations on record — stated, not guessed.
    egressViolations: 0,
    feedbackRatings: Object.values(s.feedbackByCycle).map((f) => f.rating),
  };
  return scoreAssurance(input);
}

/**
 * The incident black box for one mission, assembled from the loop ledger (timeline) and
 * the receipt vault (evidence). Receipts are re-verified inside buildIncidentDossier.
 */
export async function dossierForMission(
  missionId: string,
  opts?: { note?: string; envelopeId?: string | null; sealedAt?: string },
): Promise<IncidentDossier | null> {
  const s = loadMissionLoopState();
  const cycles = s.cycles.filter((c) => c.missionId === missionId);
  const vault = globalReceiptVault.list().filter((v) => v.mission === missionId);
  if (cycles.length === 0 && vault.length === 0) return null;

  const timeline: IncidentEvent[] = [];
  for (const c of cycles) {
    timeline.push({ at: c.startedAt, kind: "cycle.started", seatId: null, summary: `cycle ${c.cycleNo} · team ${c.teamName} · objective: ${c.objective}` });
    if (c.arena) timeline.push({ at: c.startedAt, kind: "cycle.arena", seatId: null, summary: `governance arena ${c.arena.gate} · digest ${c.arena.digest.slice(0, 12)}…` });
    if (c.gate) timeline.push({ at: c.finishedAt, kind: "cycle.gate", seatId: null, summary: `verify gate ${c.gate.status} (tier ${c.gate.tier}) · ${c.verifiedSeats}/${c.seatCount} seats verified` });
    timeline.push({
      at: c.finishedAt,
      kind: "cycle.finished",
      seatId: null,
      summary: `${c.status} · ${c.seatCount} seat(s) · measured $${c.spentUsd.toFixed(2)} · ${c.messagesOnBus} bus message(s)${c.receipt ? ` · receipt ${c.receipt.ok ? "verified" : "BROKEN"} ${c.receipt.hash.slice(0, 12)}…` : ""}`,
    });
  }
  return buildIncidentDossier({
    incidentId: `inc-${missionId}`,
    mission: missionId,
    teamId: cycles[0]?.teamId ?? vault[0]?.teamId ?? "unknown",
    openedAt: cycles.map((c) => c.startedAt).sort()[0] ?? vault[0]?.issuedAt ?? new Date(0).toISOString(),
    sealedAt: opts?.sealedAt,
    note: opts?.note,
    envelopeId: opts?.envelopeId ?? null,
    timeline,
    receipts: vault.map((v) => v.receipt),
  });
}
