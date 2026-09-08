/**
 * MJ 11.14.0 — egress gate probe (the enterprise seed).
 *
 * Company data stays on the laptop; the cloud is a switchboard, never a
 * warehouse. Pins: nothing leaves without a human-signed envelope; expired /
 * revoked / wrong-scope / non-human envelopes are refused in words; every
 * authorized departure lands as a digest-chained receipt; any edit to the
 * ledger is detectable.
 */
import { issueRootEnvelope, revoke } from "../src/mission/custody";
import { requestEgress, verifyEgressLedger, loadEgressLedger } from "../src/mission/egress";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

if (typeof (globalThis as Record<string, unknown>).localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
}

const NOW = 1_760_000_000_000;
const item = { kind: "dossier" as const, name: "test.json", sha256: "ab".repeat(32) };

section("1. refusal is the default, named in words");
{
  const noEnv = await requestEgress({ envelope: null, item, recipient: "r", now: NOW });
  ok("no envelope — refused, nothing recorded", noEnv.record === null && noEnv.reason.includes("no authority envelope"));
  const env = await issueRootEnvelope({ principal: "human:runner", scope: ["egress:share"], expiresAt: NOW + 1000 * 60 * 5, now: NOW });
  const expired = await requestEgress({ envelope: env, item, recipient: "r", now: NOW + 1000 * 60 * 6 });
  ok("an expired envelope cannot authorize a departure", expired.record === null);
  const revoked = await requestEgress({ envelope: revoke(env, "cancelled"), item, recipient: "r", now: NOW + 1 });
  ok("a revoked envelope cannot authorize a departure", revoked.record === null);
  const wrongScope = await issueRootEnvelope({ principal: "human:runner", scope: ["run:team-mission"], expiresAt: NOW + 1000, now: NOW });
  const scopeless = await requestEgress({ envelope: wrongScope, item, recipient: "r", now: NOW + 1 });
  ok("an envelope without egress:share cannot authorize a departure", scopeless.record === null);
}

section("2. authorized departures land as receipts");
{
  const before = loadEgressLedger().length;
  const env = await issueRootEnvelope({ principal: "human:runner", scope: ["egress:share"], expiresAt: NOW + 1000 * 60 * 5, now: NOW });
  const res = await requestEgress({ envelope: env, item, recipient: "channel:#ops", now: NOW + 2 });
  ok("a valid human envelope authorizes exactly one recorded departure", !!res.record && loadEgressLedger().length === before + 1);
  ok("the receipt names principal, recipient, item sha256 and envelope",
    !!res.record && res.record.principal === "human:runner" && res.record.recipient === "channel:#ops" && res.record.item.sha256 === item.sha256 && res.record.envelopeId === env.id);
  const verify = await verifyEgressLedger(loadEgressLedger());
  ok("the untouched ledger verifies — every receipt recomputes", verify.ok === true && verify.bad.length === 0);
  const tampered = loadEgressLedger().map((r, i) => (i === 0 ? { ...r, recipient: "attacker" } : r));
  const caught = await verifyEgressLedger(tampered);
  ok("editing what-left-the-machine is detectable and named", caught.ok === false && caught.bad.length === 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
