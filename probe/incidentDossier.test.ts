/**
 * MJ 14.0 — Incident Black Box (suite #78).
 *
 * §1 build → verify: digest holds, receipts carry LIVE verdicts, timeline is canonical
 * §2 tamper evidence: any edit to the sealed dossier fails verification
 * §3 honesty under bad evidence: a broken receipt is marked, and flipping the mark fails
 * §4 SIEM projection: head + one line per event + one per receipt
 */
import { buildIncidentDossier, verifyIncidentDossier, toSiemJsonl, type IncidentDossier } from "../src/mission/incidentDossier";
import { buildProofReceipt, type ProofReceipt } from "../src/mission/receipts";
import { ensureIssuerIdentity } from "../src/mission/signing";

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

await ensureIssuerIdentity();

const receipt = async (mission: string, outcome: string): Promise<ProofReceipt> =>
  buildProofReceipt({
    mission,
    teamId: "team-alpha",
    startedAt: "2026-09-09T00:00:00.000Z",
    finishedAt: "2026-09-09T00:05:00.000Z",
    mjVersion: "14.0.0",
    edition: "personal",
    report: {
      status: "completed",
      reviewedBySnapshot: true,
      autonomyArms: ["review:standard"],
      seats: [{ seatId: "impl", role: "writer", outcome, verified: outcome === "merged", harness: "claude" }],
    },
  });

const timeline = [
  { at: "2026-09-09T00:02:00.000Z", kind: "seat.dispatch", seatId: "impl", summary: "writer dispatched with briefing v2" },
  { at: "2026-09-09T00:01:00.000Z", kind: "arena.gate", seatId: null, summary: "arena PASS digest aa11" },
  { at: "2026-09-09T00:04:00.000Z", kind: "gate.verdict", seatId: null, summary: "verifier rejected the diff" },
];

/* ── 1. build → verify ── */
section("1. build → verify");
{
  const d = await buildIncidentDossier({
    incidentId: "inc-1",
    mission: "checkout-bugfix",
    teamId: "team-alpha",
    openedAt: "2026-09-09T00:00:00.000Z",
    note: "reviewer flagged an unreviewed merge path",
    envelopeId: "env-77",
    timeline,
    receipts: [await receipt("checkout-bugfix", "merged")],
  });
  ok("format is mj-incident-dossier/1", d.format === "mj-incident-dossier/1");
  ok("the dossier verifies fresh", (await verifyIncidentDossier(d)).ok === true);
  ok("receipt carries a live ok verdict", d.receipts[0].verification.ok === true);
  ok("timeline came back chronologically sorted", d.timeline[0].kind === "arena.gate" && d.timeline[2].kind === "gate.verdict");
  ok("authority envelope id is sealed in", d.envelopeId === "env-77");
}

/* ── 2. tamper evidence ── */
section("2. any edit after sealing fails");
{
  const d = await buildIncidentDossier({
    incidentId: "inc-2",
    mission: "m",
    teamId: "t",
    openedAt: "2026-09-09T00:00:00.000Z",
    timeline,
    receipts: [await receipt("m", "merged")],
  });
  const t1 = structuredClone(d) as IncidentDossier;
  t1.timeline[0].summary = "a cleaner story";
  ok("edited timeline → digest mismatch", (await verifyIncidentDossier(t1)).ok === false);

  const t2 = structuredClone(d) as IncidentDossier;
  t2.receipts[0].verification.ok = false; // someone inflates the damage
  ok("flipped receipt verdict → refused", (await verifyIncidentDossier(t2)).ok === false);

  const t3 = structuredClone(d) as IncidentDossier;
  t3.timeline.reverse();
  ok("re-timed timeline → not canonical", (await verifyIncidentDossier(t3)).ok === false);
}

/* ── 3. honesty under bad evidence ── */
section("3. broken evidence is marked, never laundered");
{
  const broken = await receipt("m-broken", "merged");
  broken.events[1].data.outcome = "doctored"; // break the chain inside the receipt
  const d = await buildIncidentDossier({
    incidentId: "inc-3",
    mission: "m-broken",
    teamId: "t",
    openedAt: "2026-09-09T00:00:00.000Z",
    timeline: [timeline[0]],
    receipts: [broken],
  });
  ok("the broken receipt is INCLUDED but marked", d.receipts[0].verification.ok === false);
  ok("the mark names the break", (d.receipts[0].verification.reason ?? "").includes("hash mismatch"));
  ok("the dossier still verifies — an honest export of bad evidence", (await verifyIncidentDossier(d)).ok === true);

  const siem = toSiemJsonl(d);
  const lines = siem.trim().split("\n").map((l) => JSON.parse(l) as { kind: string; receiptsBroken?: number; verification?: { ok: boolean } });
  ok("SIEM head counts the broken receipt", lines[0].receiptsBroken === 1);
  ok("the SIEM projection carries the broken verdict too", lines.some((l) => l.kind === "dossier.receipt" && l.verification?.ok === false));
}

/* ── 4. SIEM projection ── */
section("4. SIEM projection shape");
{
  const d = await buildIncidentDossier({
    incidentId: "inc-4",
    mission: "m",
    teamId: "t",
    openedAt: "2026-09-09T00:00:00.000Z",
    timeline,
    receipts: [await receipt("m", "merged"), await receipt("m2", "merged")],
  });
  const lines = toSiemJsonl(d).trim().split("\n");
  ok("one head + one line per event + one per receipt", lines.length === 1 + 3 + 2, String(lines.length));
  const head = JSON.parse(lines[0]) as { kind: string; digest: string; events: number };
  ok("head names the digest and the event count", head.kind === "dossier.head" && head.events === 3 && head.digest === d.digest);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
