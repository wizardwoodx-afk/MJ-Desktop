/**
 * MJ 11.13.0 — differentiator probe.
 *
 * Pins the features behind MJ's defensible claim (research: coding agents
 * compete on benchmarks and inline UX; MJ COMBINES agent-team authority,
 * verification, learning evidence and proof export in one local system):
 *   1. Budget authority — hard USD caps carried by authority envelopes,
 *      enforced by the executor, attenuating like every other power.
 *   2. Proof dossier — one exportable file whose digest fails on any edit.
 *   3. Proof-of-learning — the measured experiment inside that dossier.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { issueRootEnvelope, attenuate, budgetCheck, verifyEnvelope } from "../src/mission/custody";
import { buildProofDossier, verifyProofDossier } from "../src/mission/dossier";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

// localStorage shim — the dossier reads the stores live.
if (typeof (globalThis as Record<string, unknown>).localStorage === "undefined") {
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

const NOW = 1_760_000_000_000;
// Same resolution discipline as palette/versionDrift: packed bundles get MJ_ROOT
// injected by esbuild (the runner's cwd = tree root); live runs derive it.
declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : path.resolve(import.meta.dirname ?? ".", "..");

section("1. budget authority — spend caps are carried by the envelope and enforced");
{
  const root = await issueRootEnvelope({
    principal: "human:runner",
    scope: ["run:team-mission"],
    expiresAt: NOW + 1000 * 60 * 30,
    budgetUsd: 2.5,
    now: NOW,
  });
  ok("a root envelope carries the human's budget cap and verifies", root.budgetUsd === 2.5 && (await verifyEnvelope(root)).ok === true);

  let negThrow = false;
  try { await issueRootEnvelope({ principal: "human:runner", scope: [], expiresAt: null, budgetUsd: -1, now: NOW }); } catch { negThrow = true; }
  ok("a negative budget is refused before signing", negThrow);

  const tampered = { ...root, budgetUsd: 250 };
  ok("raising the budget cap after signing fails verification", (await verifyEnvelope(tampered)).ok === false);

  const att = await attenuate(root, "seat:coder", ["run:team-mission"], { now: NOW + 1 });
  ok("attenuation inherits the parent's spend cap", att.envelope !== null && att.envelope.budgetUsd === 2.5);

  const grow = await attenuate(root, "seat:evil", ["run:team-mission"], { budgetUsd: 99, now: NOW + 1 });
  ok("a child cannot loosen the spend cap", grow.envelope === null && grow.reason.includes("spend authority never grows"), grow.reason);

  const tight = await attenuate(root, "seat:cheap", ["run:team-mission"], { budgetUsd: 1, now: NOW + 1 });
  ok("a child may tighten the spend cap", tight.envelope !== null && tight.envelope.budgetUsd === 1);

  ok("spend within the cap is allowed, with the remainder reported", budgetCheck(root, 1.25).ok === true && budgetCheck(root, 1.25).remainingUsd === 1.25);
  ok("spend at or beyond the cap is refused", budgetCheck(root, 2.5).ok === false && budgetCheck(root, 3).ok === false);
  const uncapped = await issueRootEnvelope({ principal: "human:runner", scope: [], expiresAt: NOW + 1000, now: NOW });
  ok("no cap means uncapped — honestly reported", uncapped.budgetUsd === null && budgetCheck(uncapped, 1000).ok === true);

  const execSrc = fs.readFileSync(path.join(ROOT, "src/mission/teamExecutor.ts"), "utf8");
  ok("the executor wires budgetCheck: pre-flight refusal AND a per-wave stop",
    /budgetCheck\(req\.rootEnvelope, 0\)/.test(execSrc) && /budgetStop = bc\.reason/.test(execSrc));
  const teamsSrc = fs.readFileSync(path.join(ROOT, "src/pages/TeamsPage.tsx"), "utf8");
  ok("the runner UI exposes the budget cap and feeds it into the root envelope",
    teamsSrc.includes("budgetUsd: budgetCap.trim()") && teamsSrc.includes("Budget Cap"));
}

section("2. proof dossier — policy-to-proof in one digest-stamped file");
{
  const d = await buildProofDossier(NOW);
  ok("the dossier names its format, MJ version, and carries a digest", d.format === "mj-dossier/1" && d.mjVersion.length > 0 && d.digest.length === 64);
  ok("the untouched dossier verifies against its own digest", (await verifyProofDossier(d)).ok === true);
  const forged = { ...d, memory: { ...d.memory, scars: d.memory.scars + 99 } };
  ok("editing one number breaks the dossier's digest", (await verifyProofDossier(forged)).ok === false);
  ok("memory counts are derived, not invented (scars + precedents == lessons held)",
    d.memory.scars + d.memory.precedents === (d.ledger.precedent.count + d.ledger.scar.count));
  ok("proof-of-learning rides in the dossier: the measured experiment, honestly",
    typeof d.experiment.strategyVersions === "number" && typeof d.experiment.measuredRuns === "number" && (d.experiment.adopted === null || typeof d.experiment.adopted.id === "string"));
}

section("3. atomic budget admission — concurrent seats cannot overshoot (11.13.1)");
{
  const { BudgetGate } = await import("../src/mission/custody");
  const gate = new BudgetGate(2.0);
  const t1 = gate.reserve("seat:a", 2.0 / 3);
  const t2 = gate.reserve("seat:b", 2.0 / 3);
  const t3 = gate.reserve("seat:c", 2.0 / 3);
  ok("three concurrent seats each reserve a THIRD of the cap — and only a third", !!t1 && !!t2 && !!t3 && gate.remaining < 1e-9);
  const t4 = gate.reserve("seat:d", 0.01);
  ok("a fourth concurrent seat is REFUSED — the cap cannot be crossed at dispatch time", t4 === null);
  const s1 = gate.settle(t1!, 1.0);
  ok("settling swaps the reservation for the REAL charge and names the overrun", Math.abs(s1.overrunUsd - (1.0 - 2.0 / 3)) < 1e-9 && gate.committedUsd > 1.99);
  const fresh = new BudgetGate(1.0);
  const kept = fresh.reserve("x", 0.4); fresh.release(kept!);
  ok("a released reservation gives its share back to the pool", fresh.remaining === 1.0);

  const execSrc = fs.readFileSync(path.join(ROOT, "src/mission/teamExecutor.ts"), "utf8");
  ok("the executor admits seats ONLY through reservation before the concurrent dispatch",
    /budgetGate\.reserve\(a\.seat\.id, share\)/.test(execSrc) && execSrc.indexOf("budgetGate.reserve") < execSrc.indexOf("await Promise.all"));
  ok("the run report states token-only seats as dollar-UNKNOWN instead of inventing prices",
    execSrc.includes("reported tokens only") && execSrc.includes("tokensOnlySeats"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
