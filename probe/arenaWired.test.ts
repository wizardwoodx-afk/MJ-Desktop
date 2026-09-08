/**
 * MJ 11.14.8 — the Arena Gate WIRED probe.
 *
 * 11.14.7 proved the battery runs against the real governance modules; this
 * suite proves the battery is MECHANICALLY INVOKED on the mission path:
 *   1. executeTeam runs the governance arena before any seat is invoked, and
 *      the run report carries the PASS stamp + canonical digest.
 *   2. When the arena REFUSES, the mission is aborted before dispatch —
 *      nothing executed, nothing spent — in words.
 *   3. The arena digest rides the actual mission proof receipt as an
 *      `arena.gate` event in the sealed chain (and older summaries without
 *      the stamp keep the pre-11.14.8 receipt shape).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { executeTeam, type TeamRunnerDeps, type TeamRunRequest } from "../src/mission/teamExecutor";
import { runGovernanceArena, type ArenaGateReport } from "../src/mission/arenaGate";
import { PREBUILT_TEAMS } from "../src/mission/agentTeam";
import { CapLedger } from "../src/mission/caps";
import { buildProofReceipt, verifyProofReceipt, type ProofReceipt } from "../src/mission/receipts";
import { MJ_VERSION } from "../src/version";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

function minimalRequest(repoRoot: string): TeamRunRequest {
  const team = PREBUILT_TEAMS.find((t) => t.id === "team.balanced");
  if (!team) throw new Error("team.balanced missing");
  return {
    team,
    assignments: [],
    repoRoot,
    baseBranch: "main",
    missionSlug: "arena-wired",
    objective: "Prove the governance arena gates the mission path.",
    ledger: new CapLedger({ maxCostUsd: 5, maxTurns: 60, timeoutMs: 60_000 }, Date.now()),
  };
}

function stubDeps(): TeamRunnerDeps {
  return {
    cliInvoke: async () => ({ exitCode: 0, stdout: "ok", stderr: "", durationMs: 1, timedOut: false }),
    resolveBin: async () => null,
    writeFile: async () => undefined,
  };
}

const refusedReport: ArenaGateReport = {
  gate: "REFUSED",
  ranAt: 1,
  total: 11,
  defended: 10,
  breached: 1,
  results: [
    {
      id: "arena.tamper",
      title: "forced breach for the wiring test",
      outcome: "breached",
      note: "a boundary fell (injected)",
    },
  ],
  summary: "governance arena REFUSED: 1 scenario(s) breached the boundary — arena.tamper",
  digest: "f".repeat(64),
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mj-arena-wired-"));

section("0. executeTeam invokes the arena before any seat runs (PASS path)");
// Fixed clock: envelope ids embed the epoch, so digest equality is asserted
// at one deterministic instant — the same way the battery's own probe does.
const FIXED_NOW = 1_750_000_000_000;
let report;
try {
  report = await executeTeam(minimalRequest(tmp), { ...stubDeps(), now: () => FIXED_NOW });
  ok("executeTeam returns without throwing", true);
} catch (err) {
  ok("executeTeam returns without throwing", false, err instanceof Error ? err.message : String(err));
}
ok("the run report carries the arena preflight stamp", report?.arena != null, report?.arena ? JSON.stringify(report.arena).slice(0, 140) : "arena=null");
ok("the stamp says PASS on a healthy machine", report?.arena?.gate === "PASS", String(report?.arena?.gate));
ok("the stamp carries a 64-hex canonical digest", typeof report?.arena?.digest === "string" && /^[0-9a-f]{64}$/.test(report.arena.digest), String(report.arena?.digest));
const standalone = await runGovernanceArena({ now: FIXED_NOW });
ok("the mission-path digest equals the standalone battery digest at the same clock",
  report?.arena?.digest === standalone.digest, `mission=${report?.arena?.digest} standalone=${standalone.digest}`);
ok("the stamp records 11 scenarios, all defended", report?.arena?.total === 11 && report.arena.defended === 11 && report.arena.breached === 0,
  report?.arena ? `total=${report.arena.total} defended=${report.arena.defended} breached=${report.arena.breached}` : "no stamp");

section("1. a REFUSED arena aborts the mission before dispatch");
const refused = await executeTeam(minimalRequest(tmp), { ...stubDeps(), arenaRunner: async () => refusedReport });
ok("the mission is aborted", refused.status === "aborted", `status=${refused.status}`);
ok("the refusal names the governance arena in words", /governance arena/.test(refused.summary), refused.summary);
ok("nothing executed, nothing spent", refused.seats.length === 0 && refused.spentUsd === 0, `seats=${refused.seats.length} spent=${refused.spentUsd}`);
ok("the report still records the REFUSED stamp and digest", refused.arena?.gate === "REFUSED" && refused.arena?.digest === "f".repeat(64),
  refused.arena ? `gate=${refused.arena.gate}` : "arena=null");

section("2. the arena digest rides the mission proof receipt");
const rc = await buildProofReceipt({
  mission: "mission-arena-wired",
  teamId: "team.balanced",
  startedAt: report.startedAt,
  finishedAt: report.finishedAt,
  mjVersion: MJ_VERSION,
  edition: "personal",
  report: {
    status: report.status,
    seats: report.seats.map((s) => ({ seatId: s.seatId, role: s.role, outcome: s.outcome, verified: s.verified, harness: s.harness })),
    autonomyArms: report.autonomyArms,
    reviewedBySnapshot: report.snapshot.built,
    gateStatus: report.gate.status,
    gateTier: report.gate.tier,
    gateSnapshotSha: report.gate.evidence?.snapshotSha ?? null,
    arenaGate: report.arena,
  },
});
ok("the receipt verifies end to end", (await verifyProofReceipt(rc)).ok === true);
const event = (rc as unknown as { events?: Array<{ kind: string; data: Record<string, unknown> }> }).events?.find((e) => e.kind === "arena.gate");
ok("the sealed chain carries an arena.gate event", !!event, "no arena.gate event found");
ok("the event carries the PASS gate and the mission digest", event?.data?.gate === "PASS" && event?.data?.digest === report.arena?.digest,
  event ? JSON.stringify(event.data).slice(0, 160) : "no event data");
ok("the event carries the defended/total evidence", event?.data?.defended === 11 && event?.data?.total === 11,
  event ? JSON.stringify({ defended: event.data.defended, total: event.data.total }) : "no event data");

section("3. summaries without the stamp keep the pre-11.14.8 receipt shape");
const legacy = await buildProofReceipt({
  mission: "mission-legacy",
  teamId: "team.balanced",
  startedAt: report.startedAt,
  finishedAt: report.finishedAt,
  mjVersion: MJ_VERSION,
  edition: "personal",
  report: {
    status: report.status,
    seats: [],
    autonomyArms: report.autonomyArms,
    reviewedBySnapshot: report.snapshot.built,
    gateStatus: report.gate.status,
    gateTier: report.gate.tier,
  },
});
const events = (legacy as unknown as { events?: Array<{ kind: string }> }).events ?? [];
ok("no arena.gate event appears without the stamp", !events.some((e) => e.kind === "arena.gate"),
  events.map((e) => e.kind).join(","));

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
