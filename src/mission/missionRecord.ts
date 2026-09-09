/**
 * §THE MISSION RECORD — one signed file per mission (MJ 14.1).
 *
 * WHY THIS EXISTS
 * MJ's evidence was complete but distributed: the authority story lived in the arena
 * stamps, execution in the loop ledger, verification in the gate tiers, cost in the
 * budget ledger, proof in the receipt vault, the finance view in the chargeback, the
 * risk view in the assurance score, the incident view in the black box. Each was real;
 * together they read like sub-features. The Mission Record is the container that makes
 * them ONE product: for any mission, ONE canonical, hash-digested, Ed25519-signed file
 * that a finance team, an auditor, a risk committee, and an incident responder each
 * read their own way — and anyone can verify with zero MJ state.
 *
 *   One mission. One record. Zero MJ state required — the issuer public key is the
 *   trust anchor: exchange its fingerprint out-of-band once, pin it at verify time.
 *
 * THE HONESTY RULES
 *  - Assembled only from the stores the Mission Loop actually wrote (via
 *    evidenceSurfaces) — never from caller-supplied numbers.
 *  - The assurance figure is FLEET-level context, labeled as such: a single mission
 *    does not get its own assurance score, because the score is an evidence summary
 *    over measured history, not a per-run safety grade.
 *  - The economics row is the same derivation the chargeback export uses — the CSV
 *    and the record can never disagree.
 *  - Receipts are re-verified at seal time and at verify time; a broken receipt is
 *    carried WITH its mark. The record cannot look healthier than its evidence.
 *  - Ed25519 signature over the record digest via MJ's issuer key. When the runtime
 *    cannot sign, signature stays null with signatureNote — the digest still
 *    attests integrity, and the record says so.
 */
import { loadMissionLoopState, type LoopCycleRecord } from "./missionLoop";
import { globalReceiptVault } from "./receiptVault";
import { dossierForMission, finOpsInputForCycle } from "./evidenceSurfaces";
import { rowFor, type ChargebackRow } from "./finOps";
import { scoreAssurance } from "./assuranceScore";
import { verifyProofReceipt, type ProofReceipt } from "./receipts";
import { signChainHash, verifyIssuerSignature } from "./signing";

export interface MissionRecordCycle {
  cycleNo: number;
  status: string;
  startedAt: string;
  finishedAt: string;
  gate: { status: string; tier: string } | null;
  arena: { gate: string; digest: string } | null;
  seats: LoopCycleRecord["seats"];
  verifiedSeats: number;
  spentUsd: number;
}

export interface MissionRecordEvidence {
  receipt: ProofReceipt;
  verification: { ok: boolean; events: number; reason?: string };
}

export interface MissionEconomicsTotals {
  cycles: number;
  measuredUsd: number;
  unmeasuredCycles: number;
  overBudgetCycles: number;
  overrunUsd: number;
  tokensOnlySeats: number;
  simulatedSeats: number;
  /** The mission cap when every cycle ran under the SAME signed cap; null when mixed or uncapped. */
  missionBudgetUsd: number | null;
  /** Measured mission spend vs the shared cap — the same math as a chargeback row; null when unmeasurable. */
  missionAdherence: number | null;
}

export interface MissionEconomics {
  /** One chargeback row PER CYCLE — the finance view spans the whole mission. */
  perCycle: ChargebackRow[];
  totals: MissionEconomicsTotals;
}

export interface MissionRecord {
  format: "mj-mission-record/1";
  mission: string;
  teamId: string;
  teamName: string;
  sealedAt: string;
  mjVersion: string;
  cycles: MissionRecordCycle[];
  /** The chargeback view of this mission — per-cycle rows (the exact CSV derivation) + mission totals. */
  economics: MissionEconomics | null;
  /** Fleet-level assurance context, labeled as such (not a per-mission safety grade). */
  assuranceContext: { scope: "fleet"; score: number | null; band: string | null; evidenceCoverage: number | null } | null;
  timeline: Array<{ at: string; kind: string; seatId: string | null; summary: string }>;
  evidence: MissionRecordEvidence[];
  /** sha256 over the canonical record body (everything except digest/issuer/signature). */
  digest: string;
  issuer?: { keyId: string; publicKeyHex: string } | null;
  /** Ed25519 signature over the digest; null when the runtime cannot sign (never faked). */
  signature?: string | null;
  signatureNote?: string;
}

const enc = new TextEncoder();

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}
const canon = (o: unknown): string => JSON.stringify(sortDeep(o));

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Mission-complete economics: every cycle's row plus mission totals (the 14.1.1 fix —
 *  a mission record can no longer show only its last cycle's spend). */
export function missionEconomicsFor(rows: ChargebackRow[]): MissionEconomics {
  const measuredUsd = round6(rows.reduce((a, r) => a + (r.measuredUsd ?? 0), 0));
  const anyMeasured = rows.some((r) => r.measuredUsd !== null);
  const caps = [...new Set(rows.map((r) => r.budgetUsd))];
  const missionBudgetUsd = caps.length === 1 ? caps[0] : null;
  let missionAdherence: number | null = null;
  let overrunUsd = 0;
  if (anyMeasured && missionBudgetUsd !== null) {
    if (measuredUsd <= missionBudgetUsd) {
      missionAdherence = 1;
    } else {
      overrunUsd = round6(measuredUsd - missionBudgetUsd);
      missionAdherence = missionBudgetUsd > 0 ? round6(missionBudgetUsd / measuredUsd) : 0;
    }
  }
  return {
    perCycle: rows,
    totals: {
      cycles: rows.length,
      measuredUsd,
      unmeasuredCycles: rows.filter((r) => r.measuredUsd === null).length,
      overBudgetCycles: rows.filter((r) => r.adherence !== null && r.adherence < 1).length,
      overrunUsd,
      tokensOnlySeats: rows.reduce((a, r) => a + r.tokensOnlySeats, 0),
      simulatedSeats: rows.reduce((a, r) => a + r.simulatedSeats, 0),
      missionBudgetUsd,
      missionAdherence,
    },
  };
}

export async function buildMissionRecord(mission: string, opts?: { sealedAt?: string }): Promise<MissionRecord | null> {
  const state = loadMissionLoopState();
  const cycles = state.cycles.filter((c) => c.missionId === mission);
  const vault = globalReceiptVault.list().filter((v) => v.mission === mission);
  if (cycles.length === 0 && vault.length === 0) return null;

  const recordCycles: MissionRecordCycle[] = cycles.map((c) => ({
    cycleNo: c.cycleNo,
    status: c.status,
    startedAt: c.startedAt,
    finishedAt: c.finishedAt,
    gate: c.gate ? { ...c.gate } : null,
    arena: c.arena ? { ...c.arena } : null,
    seats: c.seats,
    verifiedSeats: c.verifiedSeats,
    spentUsd: c.spentUsd,
  }));

  const economics = cycles.length > 0 ? missionEconomicsFor(cycles.map((c) => rowFor(finOpsInputForCycle(c)))) : null;

  const a = scoreAssurance({
    measuredRuns: state.cycles.filter((c) => c.seats.some((x) => !x.outcome.startsWith("simulated"))).length,
    simulatedRuns: state.cycles.filter((c) => c.seats.length > 0 && c.seats.every((x) => x.outcome.startsWith("simulated"))).length,
    crossVendorVerifiedRuns: state.cycles.filter((c) => c.gate?.tier === "cross-vendor").length,
    sameVendorVerifiedRuns: state.cycles.filter((c) => c.gate !== null && c.gate.tier !== "cross-vendor" && c.verifiedSeats > 0).length,
    arenaPassRuns: state.cycles.filter((c) => c.arena?.gate === "PASS").length,
    budgetAdherences: state.cycles.filter((c) => c.seats.some((x) => !x.outcome.startsWith("simulated"))).map((c) => rowFor(finOpsInputForCycle(c)).adherence),
    egressViolations: 0,
    feedbackRatings: Object.values(state.feedbackByCycle).map((f) => f.rating),
  });

  const evidence: MissionRecordEvidence[] = [];
  for (const v of vault) {
    const verdict = await verifyProofReceipt(v.receipt);
    evidence.push(
      verdict.ok
        ? { receipt: v.receipt, verification: { ok: true, events: verdict.events } }
        : { receipt: v.receipt, verification: { ok: false, events: v.receipt.events?.length ?? 0, reason: verdict.reason } },
    );
  }

  const dossier = await dossierForMission(mission);

  const body = {
    format: "mj-mission-record/1" as const,
    mission,
    teamId: cycles[0]?.teamId ?? vault[0]?.teamId ?? "unknown",
    teamName: cycles[0]?.teamName ?? vault[0]?.teamId ?? "unknown",
    sealedAt: opts?.sealedAt ?? new Date().toISOString(),
    mjVersion: "14.1.0",
    cycles: recordCycles,
    economics,
    assuranceContext: a.status === "evaluated" && a.score !== null
      ? { scope: "fleet" as const, score: a.score, band: a.band, evidenceCoverage: a.evidenceCoverage }
      : null,
    timeline: dossier?.timeline ?? [],
    evidence,
  };
  const digest = await sha256hex(canon(body));
  const sig = await signChainHash(digest);
  if (sig) {
    return { ...body, digest, issuer: { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex }, signature: sig.sigHex };
  }
  return {
    ...body,
    digest,
    issuer: null,
    signature: null,
    signatureNote: "This runtime has no Ed25519 (WebCrypto refused or is absent). The record is digest-stamped but NOT issuer-signed.",
  };
}

export async function verifyMissionRecord(
  r: MissionRecord,
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const reasons: string[] = [];
  if (r.format !== "mj-mission-record/1") reasons.push(`unknown format ${r.format}`);
  const { digest, issuer, signature, signatureNote, ...rest } = r;
  if ((await sha256hex(canon(rest))) !== digest) reasons.push("digest mismatch — the record was edited after sealing");
  if (signature) {
    if (!issuer?.publicKeyHex) reasons.push("record is signed but carries no issuer public key");
    else if (!(await verifyIssuerSignature(digest, signature, issuer.publicKeyHex))) {
      reasons.push(`issuer signature verification FAILED for record digest ${digest.slice(0, 16)}…`);
    }
  } else if (!signatureNote) {
    reasons.push("unsigned record carries no signatureNote — an unsigned record must say so");
  }
  for (let i = 0; i < r.evidence.length; i++) {
    const entry = r.evidence[i];
    const fresh = await verifyProofReceipt(entry.receipt);
    if (entry.verification.ok !== fresh.ok) {
      reasons.push(`evidence[${i}]: recorded verdict does not match live verification`);
    } else if (!fresh.ok && entry.verification.reason !== (fresh as { reason: string }).reason) {
      reasons.push(`evidence[${i}]: the recorded break reason was altered`);
    }
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
