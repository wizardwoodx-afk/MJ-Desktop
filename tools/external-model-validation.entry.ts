/**
 * VOUCH HARBOR — external-model validation entry (bundled by
 * tools/external-model-validation.mjs).
 *
 * The 16.5.0 review, hardening item 2: "real external-model validation".
 * This is the standing, honest mechanism for it:
 *
 *   node tools/external-model-validation.mjs [--harness <id>] [--out f.json]
 *
 *   1. INVENTORY — every harness in the product's own 25-harness registry
 *      (src/domain/harness.ts — the single source of truth the app uses)
 *      is probed on THIS host's PATH. No private list, no drift.
 *   2. VALIDATION — when a real agent CLI is available (requested via
 *      --harness, or the first found in registry order), the full drill
 *      catalog runs through the REAL mission loop with that CLI as the
 *      seat (runDrill's 16.7 harness seam — the loop spawns the real bin;
 *      the seat is labeled REAL in the report and the receipt). The
 *      verdicts are the model's: the deterministic benchmark
 *      (tools/drill-benchmark.mjs) validates the MACHINERY; this run
 *      validates a REAL model against the same scenarios.
 *   3. HONEST ABSENCE — when no agent CLI is on this host, the report
 *      says exactly that (per-harness inventory, reason, empty scenario
 *      list). It never fakes a real-model run and never falls back to
 *      the deterministic seat under a "real" label.
 *
 * The overallDigest covers the stable fields of every scenario (same
 * discipline as the drill benchmark); on an empty run it pins the honest
 * absence itself.
 */
import * as crypto from "node:crypto";
import { HARNESSES } from "../src/domain/harness";
import { DRILL_SCENARIOS, findHarnessBin, runDrill, type DrillReport } from "../src/vouch/engine/drill";

interface SeatInfo {
  kind: "real-cli" | "none";
  harness: string | null;
  bin: string | null;
}

const argv = process.argv.slice(2);
const harnessFlag = argv.indexOf("--harness");
const requestedHarness: string | null = harnessFlag >= 0 ? (argv[harnessFlag + 1] ?? null) : null;

/* 1. inventory — the product's own registry, probed on this host's PATH */
const inventory = HARNESSES.map((h) => {
  const hit = findHarnessBin(h.id);
  return { id: h.id, name: h.name, bin: hit?.bin ?? null, found: Boolean(hit?.bin) };
});
const found = inventory.filter((h) => h.found);

/* 2. selection — explicit request wins; otherwise the first found */
let seat: SeatInfo = { kind: "none", harness: null, bin: null };
let refusedReason: string | null = null;
if (requestedHarness) {
  const hit = findHarnessBin(requestedHarness);
  if (!hit) {
    refusedReason = `requested harness "${requestedHarness}" is not in the product's harness registry`;
  } else if (!hit.bin) {
    refusedReason = `requested harness "${requestedHarness}" (${hit.name}) is not installed on this host (no bin on PATH)`;
  } else {
    seat = { kind: "real-cli", harness: requestedHarness, bin: hit.bin };
  }
} else if (found.length > 0) {
  seat = { kind: "real-cli", harness: found[0].id, bin: found[0].bin };
}

/* 3. run — real model when available, honest absence when not */
const scenarios: Array<{
  scenarioId: string;
  seat: SeatInfo;
  status: string;
  verifiedSeats: number;
  seatCount: number;
  cycleNo: number;
  engine: string;
  testTail: string;
  receiptId: string | null;
  attestation: string;
}> = [];
if (seat.kind === "real-cli" && seat.harness && seat.bin) {
  const harnessId = seat.harness as (typeof HARNESSES)[number]["id"];
  for (const sc of DRILL_SCENARIOS) {
    const r = await runDrill(sc.id, { harness: harnessId });
    const rep: DrillReport | null = r.report;
    if (!rep) {
      scenarios.push({
        scenarioId: sc.id,
        seat,
        status: "error",
        verifiedSeats: 0,
        seatCount: 0,
        cycleNo: 0,
        engine: r.output,
        testTail: r.output,
        receiptId: null,
        attestation: "none",
      });
      continue;
    }
    scenarios.push({
      scenarioId: rep.scenarioId,
      seat,
      status: rep.status,
      verifiedSeats: rep.verifiedSeats,
      seatCount: rep.seatCount,
      cycleNo: rep.cycleNo,
      engine: rep.engine,
      testTail: rep.testTail,
      receiptId: rep.receiptId,
      attestation: rep.digest,
    });
  }
}

const stableKey = (s: (typeof scenarios)[number]): string =>
  [s.scenarioId, s.seat.kind, s.seat.harness, s.status, s.verifiedSeats, s.seatCount, s.cycleNo, s.engine, s.attestation].join("|");
const overallDigest = crypto
  .createHash("sha256")
  .update(scenarios.length > 0 ? scenarios.map(stableKey).join("\n") : "vouch-harbor:external-model-validation:no-scenarios(no agent CLI on this host)")
  .digest("hex");

const report = {
  suite: "vouch-harbor-external-model-validation",
  scope:
    "External-model validation: the drill catalog through the REAL mission loop, seats run by a REAL agent CLI when one is on this host's PATH (the 16.7 runDrill harness seam — the loop spawns the real bin; the seat is labeled REAL in the report and the vouch receipt). When no agent CLI is present, this report says so — it never fakes a real-model run. The deterministic benchmark (tools/drill-benchmark.mjs) separately validates the machinery; the two are complementary, not interchangeable.",
  requestedHarness,
  harnessInventory: inventory,
  realModelAvailable: seat.kind === "real-cli",
  refusedReason,
  scenarios,
  overallDigest,
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
};

const out = JSON.stringify(report, null, 2);
const flag = argv.indexOf("--out");
if (flag >= 0 && argv[flag + 1]) {
  const fs = await import("node:fs");
  fs.writeFileSync(argv[flag + 1], out + "\n");
}
console.log(out);
if (refusedReason) process.exit(1);
