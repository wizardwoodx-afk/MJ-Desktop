/**
 * VOUCH HARBOR — drill benchmark entry (bundled by tools/drill-benchmark.mjs).
 *
 * Runs the full drill catalog — guard, maths, impossible — through the REAL
 * Mission Loop (a fresh real git repo per scenario, the repo's OWN test
 * command, the real governance arena, real receipts), and emits a
 * machine-readable benchmark report:
 *
 *   node tools/drill-benchmark.mjs [--out report.json]
 *
 * The per-scenario attestation digest is stable across runs (it is computed
 * over stable fields, never wall-clock); the overallDigest is a sha256 over
 * the stable fields of every scenario, in catalog order — a single number
 * that pins the whole benchmark run.
 *
 * HONEST SCOPE (kept explicit in the report, per the 16.5.0 review): the
 * drill's built-in seats are deterministic and labeled as such. The benchmark
 * validates the runtime/governance/verification MACHINERY — not
 * frontier-model intelligence.
 */
import * as crypto from "node:crypto";
import { DRILL_SCENARIOS, runDrill, type DrillReport } from "../src/vouch/engine/drill";

interface BenchmarkScenario {
  scenarioId: string;
  status: string;
  verifiedSeats: number;
  seatCount: number;
  cycleNo: number;
  runMs: number; // informational — NOT part of the attestation
  engine: string;
  missionReceiptOk: boolean;
  receiptId: string | null;
  testTail: string;
  attestation: string; // the drill's own canonical attestation digest
}

function stableKey(s: BenchmarkScenario): string {
  return [s.scenarioId, s.status, s.verifiedSeats, s.seatCount, s.cycleNo, s.engine, s.missionReceiptOk, s.testTail].join("|");
}

const scenarios: BenchmarkScenario[] = [];
for (const sc of DRILL_SCENARIOS) {
  const r = await runDrill(sc.id);
  const rep: DrillReport | null = r.report;
  if (!rep) {
    scenarios.push({
      scenarioId: sc.id,
      status: "error",
      verifiedSeats: 0,
      seatCount: 0,
      cycleNo: 0,
      runMs: 0,
      engine: "none",
      missionReceiptOk: false,
      receiptId: null,
      testTail: r.output,
      attestation: "none",
    });
    continue;
  }
  scenarios.push({
    scenarioId: rep.scenarioId,
    status: rep.status,
    verifiedSeats: rep.verifiedSeats,
    seatCount: rep.seatCount,
    cycleNo: rep.cycleNo,
    runMs: rep.runMs,
    engine: rep.engine,
    missionReceiptOk: rep.missionReceiptOk,
    receiptId: rep.receiptId,
    testTail: rep.testTail,
    attestation: rep.digest,
  });
}

const overallDigest = crypto
  .createHash("sha256")
  .update(scenarios.map(stableKey).join("\n"))
  .digest("hex");

const report = {
  suite: "vouch-harbor-drill-benchmark",
  scope:
    "Real Mission Loop, real git repos, the repos' own test commands, the real governance arena and receipts. The drill's built-in seats are DETERMINISTIC and labeled as such: this validates the runtime/governance/verification machinery — not frontier-model intelligence.",
  scenarios,
  overallDigest,
  generatedAt: new Date().toISOString(),
};

const out = JSON.stringify(report, null, 2);
const flag = process.argv.indexOf("--out");
if (flag >= 0 && process.argv[flag + 1]) {
  const fs = await import("node:fs");
  fs.writeFileSync(process.argv[flag + 1], out + "\n");
}
console.log(out);
