/**
 * MJ 14.0 — Agent FinOps chargeback (suite #76).
 *
 * §1 measured math — adherence within/over cap, overrun, measured-seat ratio
 * §2 honesty — tokens-only missions are `unmeasured`, never priced; uncapped is `uncapped`
 * §3 simulated seats are counted, never charged
 * §4 CSV export — fixed column order, RFC 4180 escaping, explicit `unmeasured` cells
 * §5 digest — the issued chargeback is tamper-evident
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  computeChargeback,
  verifyChargebackDigest,
  chargebackToCsv,
  rowFor,
  type FinOpsMissionInput,
} from "../src/mission/finOps";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}\n`);
}

const base: FinOpsMissionInput = {
  missionId: "m-1",
  teamId: "team-alpha",
  teamName: "Alpha, Crews \"A\"",
  finishedAt: "2026-09-09T00:00:00.000Z",
  measuredSeatUsd: [0.4, 0.35],
  tokensOnlySeats: 1,
  simulatedSeats: 0,
  budgetUsd: 1,
};

/* ── 1. measured math ── */
section("1. measured math");
{
  const r = rowFor(base);
  ok("within cap → adherence 1", r.adherence === 1, String(r.adherence));
  ok("overrun 0 when within cap", r.overrunUsd === 0);
  ok("measured USD sums the seats", r.measuredUsd === 0.75, String(r.measuredUsd));
  ok("measured-seat ratio counts ran seats", Math.abs(r.measuredSeatRatio - 2 / 3) < 1e-6, String(r.measuredSeatRatio));

  const over = rowFor({ ...base, measuredSeatUsd: [1.5], budgetUsd: 1 });
  ok("over cap → adherence is the cap/actual ratio", Math.abs((over.adherence ?? 0) - 2 / 3) < 1e-6, String(over.adherence));
  ok("over cap → overrun measured in dollars", over.overrunUsd === 0.5, String(over.overrunUsd));

  const zero = rowFor({ ...base, measuredSeatUsd: [0.2], budgetUsd: 0 });
  ok("zero cap with spend → adherence 0", zero.adherence === 0);
}

/* ── 2. honesty: unmeasured is not zero ── */
section("2. honesty — tokens-only stays unmeasured, never priced");
{
  const r = rowFor({ ...base, measuredSeatUsd: [], tokensOnlySeats: 3, budgetUsd: 1 });
  ok("no USD seat → measuredUsd null (not 0)", r.measuredUsd === null);
  ok("adherence null when spend is unmeasurable", r.adherence === null);
  ok("overrun stays 0 — no invented dollars", r.overrunUsd === 0);
  const capped = rowFor({ ...base, measuredSeatUsd: [0.2], budgetUsd: null });
  ok("uncapped mission → adherence null, spelled uncapped in CSV", capped.adherence === null);
}

/* ── 3. simulated seats ── */
section("3. simulated seats are counted, never charged");
{
  const cb = await computeChargeback([{ ...base, simulatedSeats: 2 }]);
  ok("simulated seats carried on the row", cb.rows[0].simulatedSeats === 2);
  ok("simulated seats add nothing to the measured total", cb.totals.measuredUsdTotal === 0.75);
  ok("totals carry the simulation count", cb.totals.simulatedSeatsTotal === 2);
}

/* ── 4. CSV export ── */
section("4. CSV export — fixed columns, RFC 4180, honest cells");
{
  const cb = await computeChargeback([base, { ...base, missionId: "m-2", measuredSeatUsd: [], tokensOnlySeats: 2 }]);
  const csv = chargebackToCsv(cb);
  const lines = csv.split("\r\n").filter(Boolean);
  ok("header is the fixed column order", lines[0] === "missionId,teamId,teamName,finishedAt,measuredUsd,tokensOnlySeats,simulatedSeats,budgetUsd,adherence,overrunUsd,measuredSeatRatio", lines[0]);
  ok("comma+quote teamName is RFC-4180 escaped", lines[1].includes('"Alpha, Crews ""A"""'), lines[1].split(",").slice(0, 3).join(","));
  ok("unmeasured mission spells `unmeasured`, never 0", lines[2].includes(",unmeasured,"), lines[2]);
  ok("capped column spelled `uncapped` when no cap", chargebackToCsv(await computeChargeback([{ ...base, budgetUsd: null }])).split("\r\n")[1].includes(",uncapped,uncapped,"));
}

/* ── 5. tamper-evident issue ── */
section("5. the issued chargeback is digest-stamped");
{
  const cb = await computeChargeback([base, { ...base, missionId: "m-2", measuredSeatUsd: [0.1], budgetUsd: 0.05 }]);
  ok("fresh chargeback verifies", await verifyChargebackDigest(cb));
  const t = structuredClone(cb);
  t.rows[0].measuredUsd = 0.01; // someone "adjusts" the bill
  ok("an edited row breaks the digest", !(await verifyChargebackDigest(t)));
  ok("totals catch both missions", cb.totals.missions === 2 && cb.totals.overBudgetMissions === 1, JSON.stringify(cb.totals));

  // Round-trip through disk like a finance hand-off would.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mj-finops-"));
  const file = path.join(dir, "chargeback.json");
  fs.writeFileSync(file, JSON.stringify(cb));
  const loaded = JSON.parse(fs.readFileSync(file, "utf8"));
  ok("chargeback survives a file round-trip verifiably", await verifyChargebackDigest(loaded));
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
