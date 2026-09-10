import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/finOps.test.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// src/mission/finOps.ts
var enc = new TextEncoder();
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
var canon = (o) => JSON.stringify(sortDeep(o));
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
var round6 = (n) => Math.round(n * 1e6) / 1e6;
function rowFor(input) {
  const ranSeats = input.measuredSeatUsd.length + input.tokensOnlySeats;
  const hasUsd = input.measuredSeatUsd.length > 0;
  const measuredUsd = hasUsd ? round6(input.measuredSeatUsd.reduce((a, b) => a + b, 0)) : null;
  let adherence = null;
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
    measuredSeatRatio: ranSeats > 0 ? round6(input.measuredSeatUsd.length / ranSeats) : 0
  };
}
async function computeChargeback(inputs, issuedAt) {
  const rows = inputs.map(rowFor);
  const totals = {
    missions: rows.length,
    measuredUsdTotal: round6(rows.reduce((a, r) => a + (r.measuredUsd ?? 0), 0)),
    unmeasuredMissions: rows.filter((r) => r.measuredUsd === null).length,
    overBudgetMissions: rows.filter((r) => r.adherence !== null && r.adherence < 1).length,
    overrunUsdTotal: round6(rows.reduce((a, r) => a + r.overrunUsd, 0)),
    tokensOnlySeatsTotal: rows.reduce((a, r) => a + r.tokensOnlySeats, 0),
    simulatedSeatsTotal: rows.reduce((a, r) => a + r.simulatedSeats, 0)
  };
  const digest = await sha256hex(canon({ rows, totals }));
  return { format: "vh-chargeback/1", issuedAt: issuedAt ?? (/* @__PURE__ */ new Date()).toISOString(), rows, totals, digest };
}
async function verifyChargebackDigest(cb) {
  const { digest, ...rest } = cb;
  const expect = await sha256hex(canon({ rows: rest.rows, totals: rest.totals }));
  return expect === digest;
}
function csvField(v) {
  if (v === null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
var CSV_COLUMNS = [
  "missionId",
  "teamId",
  "teamName",
  "finishedAt",
  "measuredUsd",
  "tokensOnlySeats",
  "simulatedSeats",
  "budgetUsd",
  "adherence",
  "overrunUsd",
  "measuredSeatRatio"
];
function chargebackToCsv(cb) {
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
      r.adherence === null ? r.measuredUsd === null ? "unmeasured" : "uncapped" : r.adherence,
      r.overrunUsd,
      r.measuredSeatRatio
    ].map((v) => csvField(v)).join(","));
  }
  return `${lines.join("\r\n")}\r
`;
}

// probe/finOps.test.ts
var pass = 0;
var fail = 0;
function ok(label, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}
`);
}
var base = {
  missionId: "m-1",
  teamId: "team-alpha",
  teamName: 'Alpha, Crews "A"',
  finishedAt: "2026-09-09T00:00:00.000Z",
  measuredSeatUsd: [0.4, 0.35],
  tokensOnlySeats: 1,
  simulatedSeats: 0,
  budgetUsd: 1
};
section("1. measured math");
{
  const r = rowFor(base);
  ok("within cap \u2192 adherence 1", r.adherence === 1, String(r.adherence));
  ok("overrun 0 when within cap", r.overrunUsd === 0);
  ok("measured USD sums the seats", r.measuredUsd === 0.75, String(r.measuredUsd));
  ok("measured-seat ratio counts ran seats", Math.abs(r.measuredSeatRatio - 2 / 3) < 1e-6, String(r.measuredSeatRatio));
  const over = rowFor({ ...base, measuredSeatUsd: [1.5], budgetUsd: 1 });
  ok("over cap \u2192 adherence is the cap/actual ratio", Math.abs((over.adherence ?? 0) - 2 / 3) < 1e-6, String(over.adherence));
  ok("over cap \u2192 overrun measured in dollars", over.overrunUsd === 0.5, String(over.overrunUsd));
  const zero = rowFor({ ...base, measuredSeatUsd: [0.2], budgetUsd: 0 });
  ok("zero cap with spend \u2192 adherence 0", zero.adherence === 0);
}
section("2. honesty \u2014 tokens-only stays unmeasured, never priced");
{
  const r = rowFor({ ...base, measuredSeatUsd: [], tokensOnlySeats: 3, budgetUsd: 1 });
  ok("no USD seat \u2192 measuredUsd null (not 0)", r.measuredUsd === null);
  ok("adherence null when spend is unmeasurable", r.adherence === null);
  ok("overrun stays 0 \u2014 no invented dollars", r.overrunUsd === 0);
  const capped = rowFor({ ...base, measuredSeatUsd: [0.2], budgetUsd: null });
  ok("uncapped mission \u2192 adherence null, spelled uncapped in CSV", capped.adherence === null);
}
section("3. simulated seats are counted, never charged");
{
  const cb = await computeChargeback([{ ...base, simulatedSeats: 2 }]);
  ok("simulated seats carried on the row", cb.rows[0].simulatedSeats === 2);
  ok("simulated seats add nothing to the measured total", cb.totals.measuredUsdTotal === 0.75);
  ok("totals carry the simulation count", cb.totals.simulatedSeatsTotal === 2);
}
section("4. CSV export \u2014 fixed columns, RFC 4180, honest cells");
{
  const cb = await computeChargeback([base, { ...base, missionId: "m-2", measuredSeatUsd: [], tokensOnlySeats: 2 }]);
  const csv = chargebackToCsv(cb);
  const lines = csv.split("\r\n").filter(Boolean);
  ok("header is the fixed column order", lines[0] === "missionId,teamId,teamName,finishedAt,measuredUsd,tokensOnlySeats,simulatedSeats,budgetUsd,adherence,overrunUsd,measuredSeatRatio", lines[0]);
  ok("comma+quote teamName is RFC-4180 escaped", lines[1].includes('"Alpha, Crews ""A"""'), lines[1].split(",").slice(0, 3).join(","));
  ok("unmeasured mission spells `unmeasured`, never 0", lines[2].includes(",unmeasured,"), lines[2]);
  ok("capped column spelled `uncapped` when no cap", chargebackToCsv(await computeChargeback([{ ...base, budgetUsd: null }])).split("\r\n")[1].includes(",uncapped,uncapped,"));
}
section("5. the issued chargeback is digest-stamped");
{
  const cb = await computeChargeback([base, { ...base, missionId: "m-2", measuredSeatUsd: [0.1], budgetUsd: 0.05 }]);
  ok("fresh chargeback verifies", await verifyChargebackDigest(cb));
  const t = structuredClone(cb);
  t.rows[0].measuredUsd = 0.01;
  ok("an edited row breaks the digest", !await verifyChargebackDigest(t));
  ok("totals catch both missions", cb.totals.missions === 2 && cb.totals.overBudgetMissions === 1, JSON.stringify(cb.totals));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mj-finops-"));
  const file = path.join(dir, "chargeback.json");
  fs.writeFileSync(file, JSON.stringify(cb));
  const loaded = JSON.parse(fs.readFileSync(file, "utf8"));
  ok("chargeback survives a file round-trip verifiably", await verifyChargebackDigest(loaded));
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`
${pass} passed, ${fail} failed
`);
if (fail > 0) process.exit(1);
