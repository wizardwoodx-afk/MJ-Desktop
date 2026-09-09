/**
 * MJ 11.14.3 — the two-machine proof probe.
 *
 * The 11.14.2 review's final judgment, executed: Employee A owns the data,
 * Employee B requests a capability, the relay coordinates, A computes
 * locally, only the permitted result crosses, the privacy budget and policy
 * apply, and the egress receipt proves what crossed. This probe inspects
 * the relay's own log to prove what the coordinator learned — and that it
 * never learned the data.
 *
 * Run like every suite:
 *   npx tsx probe/twoNodeAlign.test.ts
 */
import { issueRootEnvelope } from "../src/mission/custody";
import { DEMO_COMPANY_DATA, DEMO_POLICY, resetCapabilityQueryLedger, loadPrivacyLedger } from "../src/mission/capability";
import { RelayNode, ownerComputes, requesterVerifies, type WireRequest } from "../src/mission/twoNode";
import { verifyEgressLedger, loadEgressLedger } from "../src/mission/egress";

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

const NOW = Date.now();
const relay = new RelayNode();

/** B's one and only action: put a request on the wire. */
function bRequests(args: { id: string; op?: WireRequest["op"]; field?: string; where?: Record<string, string | number> }, envelopeId: string, envelopeDigest: string): WireRequest {
  const wire: WireRequest = {
    kind: "capability-request",
    requestId: args.id,
    from: "employee:B",
    to: "employee:A",
    op: args.op ?? "sum",
    dataset: DEMO_COMPANY_DATA.dataset,
    field: args.field ?? "revenue",
    where: args.where,
    envelopeId,
    envelopeDigest,
  };
  relay.send(wire);
  return wire;
}

section("1. the happy path — capability, not data, crosses");
{
  resetCapabilityQueryLedger();
  const env = await issueRootEnvelope({
    principal: "human:data-owner", scope: ["capability:run", "egress:share"],
    expiresAt: NOW + DEMO_POLICY.windowMs + 100000, now: NOW,
  });
  const wire = bRequests({ id: "2n-1" }, env.id, env.digest);
  const verdict = await ownerComputes({ wire, envelope: env, now: NOW + 1 });
  relay.send(verdict);
  const check = await requesterVerifies(verdict);

  ok("B asked through the relay; A computed locally; the bounded answer came back",
    verdict.authorized && verdict.result?.value === 545.3 && verdict.result.cohortSize === 5, verdict.reason);
  ok("B can verify the answer it received against its digest and the egress chain", check.ok, check.detail);
  ok("the egress receipt exists — what crossed is provable",
    typeof verdict.receiptDigest === "string" && verdict.receiptDigest.length > 0 && (await verifyEgressLedger(loadEgressLedger())));

  const seen = JSON.stringify(relay.log);
  ok("the relay saw identities, the request, authorization evidence, and the receipt",
    seen.includes("employee:B") && seen.includes("employee:A") && seen.includes("capability-request") &&
    seen.includes(env.digest) && seen.includes("receiptDigest"));
  const rawValues = ["128.4", "96.2", "64.1", "45.9", "2.2", "4.1"];
  // 13.5.1-windows-fix: boundary-aware match. Bare `seen.includes(v)` let an
  // ISO `computedAt` timestamp false-fire the check whenever wall-clock
  // seconds ended in the value's leading digit and millis started with its
  // trailing digit (e.g. `...24.185Z` contains `4.1`) — ~1% of runs. A real
  // leak carries the full value delimited by JSON punctuation, never glued
  // inside a longer number, so boundaries make the check strictly stronger.
  const esc = (v: string): string => v.replace(".", "\\.");
  const leaked = rawValues.filter((v) => new RegExp(`(?<![0-9.])${esc(v)}(?![0-9])`).test(seen));
  ok("the relay NEVER saw the raw rows — no individual record value appears anywhere it looked",
    leaked.length === 0, leaked.length > 0 ? `false-positive candidates: ${leaked.join(",")}` : "");
}

section("2. policy travels with the computation — refusals cross too, in words");
{
  const env = await issueRootEnvelope({
    principal: "human:data-owner", scope: ["capability:run", "egress:share"],
    expiresAt: NOW + DEMO_POLICY.windowMs + 100000, now: NOW,
  });
  const badOp = bRequests({ id: "2n-median", op: "median" as WireRequest["op"] }, env.id, env.digest);
  const v1 = await ownerComputes({ wire: badOp, envelope: env, now: NOW + 2 });
  relay.send(v1);
  ok("an off-whitelist operation is refused at A, and only the refusal crosses",
    !v1.authorized && v1.result === undefined && v1.reason.includes("whitelist"), v1.reason);

  const badField = bRequests({ id: "2n-salary", field: "salary" }, env.id, env.digest);
  const v2 = await ownerComputes({ wire: badField, envelope: env, now: NOW + 3 });
  relay.send(v2);
  ok("an off-policy field is refused at A", !v2.authorized && v2.reason.includes("aggregation policy"), v2.reason);

  const narrow = bRequests({ id: "2n-apac", where: { region: "APAC" } }, env.id, env.digest);
  const v3 = await ownerComputes({ wire: narrow, envelope: env, now: NOW + 4 });
  relay.send(v3);
  ok("a narrow filtered cohort is refused at A — even though the whole dataset would pass",
    !v3.authorized && v3.reason.includes("cohort of 2"), v3.reason);
}

section("3. the privacy budget holds across the wire — and across A's restarts");
{
  resetCapabilityQueryLedger();
  const env = await issueRootEnvelope({
    principal: "human:data-owner", scope: ["capability:run", "egress:share"],
    expiresAt: NOW + DEMO_POLICY.windowMs * 2 + 100000, now: NOW,
  });
  let refusedAt = -1;
  for (let i = 0; i < DEMO_POLICY.maxQueriesPerWindow + 2; i++) {
    const wire = bRequests({ id: `2n-b${i}` }, env.id, env.digest);
    const v = await ownerComputes({ wire, envelope: env, now: NOW + 10 + i });
    relay.send(v);
    if (!v.authorized && v.reason.includes("privacy budget exhausted")) { refusedAt = i; break; }
  }
  ok("repeated requests through the relay exhaust B's budget, and the hard stop is enforced at A",
    refusedAt >= 0 && refusedAt < DEMO_POLICY.maxQueriesPerWindow + 2);

  const persisted = loadPrivacyLedger().length;
  // A's process restarts: nothing in memory survives; the durable ledger does.
  const wireAfterRestart = bRequests({ id: "2n-restart" }, env.id, env.digest);
  const vRestart = await ownerComputes({ wire: wireAfterRestart, envelope: env, now: NOW + 40 });
  relay.send(vRestart);
  ok("the reviewer's attack fails: A restarted, budget still enforced from durable storage",
    !vRestart.authorized && vRestart.reason.includes("privacy budget exhausted") && loadPrivacyLedger().length === persisted);

  const wireLater = bRequests({ id: "2n-later" }, env.id, env.digest);
  const vLater = await ownerComputes({ wire: wireLater, envelope: env, now: NOW + DEMO_POLICY.windowMs + 50 });
  relay.send(vLater);
  ok("the window resets honestly — after it passes, B may ask again",
    vLater.authorized && vLater.result?.value === 545.3);
}

section("4. tampering with what crossed is detectable at B");
{
  resetCapabilityQueryLedger();
  const env = await issueRootEnvelope({
    principal: "human:data-owner", scope: ["capability:run", "egress:share"],
    expiresAt: NOW + DEMO_POLICY.windowMs + 100000, now: NOW,
  });
  const wire = bRequests({ id: "2n-tamper" }, env.id, env.digest);
  const verdict = await ownerComputes({ wire, envelope: env, now: NOW + 60 });
  relay.send(verdict);
  const honest = await requesterVerifies(verdict);
  ok("the unmodified crossing verifies end to end", honest.ok, honest.detail);

  const doctored = { ...verdict, result: verdict.result ? { ...verdict.result, value: 999999 } : undefined };
  const caught = await requesterVerifies(doctored);
  ok("a relay that doctors the answer is caught at B — digest mismatch, in words",
    !caught.ok && caught.detail.includes("tampered"), caught.detail);
}

if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
