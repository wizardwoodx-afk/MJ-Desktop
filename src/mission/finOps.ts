/**
 * §AGENT FINOPS — measured, receipt-backed chargeback for agent work (MJ 14.0).
 *
 * WHY THIS EXISTS
 * "AI FinOps is now a real job" (2026): enterprises run showback and chargeback for
 * model spend, and regulated buyers ask for audit-ready AI cost reporting. Every FinOps
 * tool in the market derives cost from provider bills and gateway telemetry — someone
 * else's counters, reconstructed after the fact. MJ sits where the money is actually
 * committed: the dispatch layer. The budget ledger already RESERVES and SETTLES real
 * seat costs with atomic admission (caps.ts BudgetGate); this module turns those
 * measured settlements into chargeback-grade artifacts a finance team can consume.
 *
 * THE HONESTY RULES
 *  - Measured dollars or nothing: a mission whose seats reported tokens but no USD is
 *    `unmeasured` in the chargeback — MJ never invents a price (the 11.13.1 rule,
 *    carried forward). An empty cell in the CSV is spelled `unmeasured`, not `0`,
 *    because finance tools read blank as zero.
 *  - Adherence is measured against the mission's OWN signed budget cap, not a vibe;
 *    uncapped missions report `uncapped`, not 100%.
 *  - Simulated seats are carried as a count and never charged — simulated spend is
 *    not money.
 *  - The issued chargeback is digest-stamped: any later edit to the rows breaks
 *    verifyChargebackDigest, so finance and security argue over the same numbers.
 */

export interface FinOpsMissionInput {
  missionId: string;
  teamId: string;
  teamName?: string;
  finishedAt: string;
  /** Measured USD per seat that actually ran and reported dollars (exit-code-first). */
  measuredSeatUsd: number[];
  /** Seats that reported tokens but no dollars — honest `unmeasured`, never priced. */
  tokensOnlySeats: number;
  /** Seats that ran in the labeled simulation — counted, never charged. */
  simulatedSeats: number;
  /** The mission's signed hard cap (null = uncapped). */
  budgetUsd: number | null;
}

export interface ChargebackRow {
  missionId: string;
  teamId: string;
  teamName: string;
  finishedAt: string;
  /** null when NO seat reported USD: unmeasured, not zero. */
  measuredUsd: number | null;
  tokensOnlySeats: number;
  simulatedSeats: number;
  budgetUsd: number | null;
  /** 1 = within cap; (0,1) = over cap ratio; null = unmeasurable (unmeasured or uncapped). */
  adherence: number | null;
  overrunUsd: number;
  /** Share of ran seats whose spend was actually measured (0 when nothing ran). */
  measuredSeatRatio: number;
}

export interface ChargebackTotals {
  missions: number;
  measuredUsdTotal: number;
  unmeasuredMissions: number;
  overBudgetMissions: number;
  overrunUsdTotal: number;
  tokensOnlySeatsTotal: number;
  simulatedSeatsTotal: number;
}

export interface Chargeback {
  format: "vh-chargeback/1";
  issuedAt: string;
  rows: ChargebackRow[];
  totals: ChargebackTotals;
  /** sha256 over the canonical rows+totals — tamper evidence for the issued artifact. */
  digest: string;
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

export function rowFor(input: FinOpsMissionInput): ChargebackRow {
  const ranSeats = input.measuredSeatUsd.length + input.tokensOnlySeats;
  const hasUsd = input.measuredSeatUsd.length > 0;
  const measuredUsd = hasUsd ? round6(input.measuredSeatUsd.reduce((a, b) => a + b, 0)) : null;
  let adherence: number | null = null;
  let overrunUsd = 0;
  if (measuredUsd !== null && input.budgetUsd !== null) {
    if (measuredUsd <= input.budgetUsd) {
      adherence = 1;
    } else {
      overrunUsd = round6(measuredUsd - input.budgetUsd);
      adherence = input.budgetUsd > 0 ? round6(input.budgetUsd / measuredUsd) : 0;
    }
  }
  return {
    missionId: input.missionId,
    teamId: input.teamId,
    teamName: input.teamName ?? input.teamId,
    finishedAt: input.finishedAt,
    measuredUsd,
    tokensOnlySeats: input.tokensOnlySeats,
    simulatedSeats: input.simulatedSeats,
    budgetUsd: input.budgetUsd,
    adherence,
    overrunUsd,
    measuredSeatRatio: ranSeats > 0 ? round6(input.measuredSeatUsd.length / ranSeats) : 0,
  };
}

export async function computeChargeback(inputs: FinOpsMissionInput[], issuedAt?: string): Promise<Chargeback> {
  const rows = inputs.map(rowFor);
  const totals: ChargebackTotals = {
    missions: rows.length,
    measuredUsdTotal: round6(rows.reduce((a, r) => a + (r.measuredUsd ?? 0), 0)),
    unmeasuredMissions: rows.filter((r) => r.measuredUsd === null).length,
    overBudgetMissions: rows.filter((r) => r.adherence !== null && r.adherence < 1).length,
    overrunUsdTotal: round6(rows.reduce((a, r) => a + r.overrunUsd, 0)),
    tokensOnlySeatsTotal: rows.reduce((a, r) => a + r.tokensOnlySeats, 0),
    simulatedSeatsTotal: rows.reduce((a, r) => a + r.simulatedSeats, 0),
  };
  const digest = await sha256hex(canon({ rows, totals }));
  return { format: "vh-chargeback/1", issuedAt: issuedAt ?? new Date().toISOString(), rows, totals, digest };
}

export async function verifyChargebackDigest(cb: Chargeback): Promise<boolean> {
  const { digest, ...rest } = cb;
  const expect = await sha256hex(canon({ rows: rest.rows, totals: rest.totals }));
  return expect === digest;
}

/** RFC 4180: quote when needed, double the quotes. */
function csvField(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = [
  "missionId", "teamId", "teamName", "finishedAt", "measuredUsd", "tokensOnlySeats",
  "simulatedSeats", "budgetUsd", "adherence", "overrunUsd", "measuredSeatRatio",
] as const;

export function chargebackToCsv(cb: Chargeback): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of cb.rows) {
    lines.push([
      r.missionId,
      r.teamId,
      r.teamName,
      r.finishedAt,
      r.measuredUsd === null ? "unmeasured" : r.measuredUsd,
      r.tokensOnlySeats,
      r.simulatedSeats,
      r.budgetUsd === null ? "uncapped" : r.budgetUsd,
      r.adherence === null ? (r.measuredUsd === null ? "unmeasured" : "uncapped") : r.adherence,
      r.overrunUsd,
      r.measuredSeatRatio,
    ].map((v) => csvField(v as string | number | null)).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
