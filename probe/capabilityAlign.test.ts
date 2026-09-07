/**
 * MJ 11.14.1 — capability channel probe (the enterprise thesis, working).
 *
 * Pins "expose a capability without exposing the data": approved operations
 * only, human authority required, computation happens at the owner's machine,
 * only the aggregate answer may leave — through the Egress Gate — and no path
 * returns raw rows.
 */
import { issueRootEnvelope, revoke } from "../src/mission/custody";
import { executeCapability, CAPABILITY_OPS, DEMO_COMPANY_DATA, DEMO_POLICY, resetCapabilityQueryLedger, capabilityQueryCount, type CapabilityRequest } from "../src/mission/capability";
import { requestEgress, loadEgressLedger } from "../src/mission/egress";

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
const req = (op: CapabilityRequest["op"]): CapabilityRequest => ({
  id: "cap-test", requester: "employee:2", op, dataset: DEMO_COMPANY_DATA.dataset, field: "revenue",
});

section("1. authority gates the capability");
{
  const noEnv = await executeCapability({ request: req("sum"), envelope: null, now: NOW });
  ok("no envelope — the operation is refused in words", noEnv.result === null && noEnv.reason.includes("no authority envelope"));
  const env = await issueRootEnvelope({ principal: "human:data-owner", scope: ["capability:run"], expiresAt: NOW + 1000, now: NOW });
  const expired = await executeCapability({ request: req("sum"), envelope: env, now: NOW + 2000 });
  ok("an expired envelope cannot authorize an operation", expired.result === null);
  const revoked = await executeCapability({ request: req("sum"), envelope: revoke(env, "no"), now: NOW + 1 });
  ok("a revoked envelope cannot authorize an operation", revoked.result === null);
  const wrongScope = await issueRootEnvelope({ principal: "human:data-owner", scope: ["egress:share"], expiresAt: NOW + 1000, now: NOW });
  const scopeless = await executeCapability({ request: req("sum"), envelope: wrongScope, now: NOW + 1 });
  ok("an envelope without capability:run cannot authorize an operation", scopeless.result === null);
}

section("2. the whitelist is the product");
{
  const env = await issueRootEnvelope({ principal: "human:data-owner", scope: ["capability:run"], expiresAt: NOW + 1000, now: NOW });
  const evil = await executeCapability({ request: { ...req("sum"), op: "dump" as never }, envelope: env, now: NOW + 1 });
  ok("an operation outside the whitelist is refused", evil.result === null && evil.reason.includes("whitelist"));
  const foreign = await executeCapability({ request: { ...req("sum"), dataset: "hr.salaries" }, envelope: env, now: NOW + 1 });
  ok("a dataset not exposed on this machine is refused", foreign.result === null);
  ok("the whitelist is aggregate-only by construction", CAPABILITY_OPS.every((o) => ["count", "sum", "avg", "max"].includes(o)));
}

section("3. compute at home, answer travels — raw rows never do");
{
  const env = await issueRootEnvelope({ principal: "human:data-owner", scope: ["capability:run", "egress:share"], expiresAt: NOW + 1000, now: NOW });
  const run = await executeCapability({ request: req("sum"), envelope: env, now: NOW + 1 });
  ok("an authorized operation computes WHERE THE DATA LIVES and returns one aggregate number",
    !!run.result && typeof run.result.value === "number" && Math.abs(run.result.value - (128.4 + 96.2 + 210.7 + 64.1 + 45.9)) < 1e-6);
  ok("the answer is digest-stamped — the receipt proves WHICH answer left",
    !!run.result && run.result.digest.length === 64);
  const before = loadEgressLedger().length;
  const gate = await requestEgress({ envelope: env, item: { kind: "capability-result", name: "sum(revenue)", sha256: run.result!.digest }, recipient: "employee:2", now: NOW + 2 });
  ok("the answer leaves ONLY through the Egress Gate, as a receipt", !!gate.record && loadEgressLedger().length === before + 1 && gate.record!.item.sha256 === run.result!.digest);
  ok("the result carries no raw rows — the region names never entered the answer",
    !!run.result && !JSON.stringify(run.result).includes("APAC") && !JSON.stringify(run.result).includes("EMEA"));
}

section("4. the Privacy Guard — aggregate-only is made privacy-honest (11.14.2)");
{
  resetCapabilityQueryLedger();
  // envelope outlives the whole section, including the post-window reset test
  const env = await issueRootEnvelope({ principal: "human:data-owner", scope: ["capability:run"], expiresAt: NOW + DEMO_POLICY.windowMs + 100000, now: NOW });
  const rq = (op: CapabilityRequest["op"], field: string, id: string): CapabilityRequest => ({
    id, requester: "employee:2", op, dataset: DEMO_COMPANY_DATA.dataset, field,
  });

  const narrow = await executeCapability({ request: rq("sum", "bonus", "cap-n"), envelope: env, now: NOW + 1 });
  ok("a narrow cohort is REFUSED — aggregate over 2 records risks exposing individuals",
    narrow.result === null && narrow.reason.includes("below the minimum"), narrow.reason);
  const offPolicy = await executeCapability({ request: rq("sum", "salary", "cap-o"), envelope: env, now: NOW + 2 });
  ok("a field outside the dataset policy never computes", offPolicy.result === null && offPolicy.reason.includes("aggregation policy"));

  const okRun = await executeCapability({ request: rq("sum", "revenue", "cap-k"), envelope: env, now: NOW + 3 });
  ok("an aggregate exactly AT the minimum cohort passes and reports its cohort size",
    !!okRun.result && okRun.result.cohortSize === DEMO_POLICY.minCohortSize);
  const avgRun = await executeCapability({ request: rq("avg", "revenue", "cap-p"), envelope: env, now: NOW + 4 });
  ok("answers are bounded to the policy's precision — no extra decimal grain leaves",
    !!avgRun.result && Math.abs(avgRun.result.value - 109.06) > 1e-9 && Math.abs(avgRun.result.value - Math.round((545.3 / 5) / DEMO_POLICY.roundTo) * DEMO_POLICY.roundTo) < 1e-9);

  ok("every authorized attempt counts against the privacy budget (refusals included — probing IS the attack)",
    capabilityQueryCount(DEMO_COMPANY_DATA.dataset, NOW + 5) === 4);
  let exhausted: { result: null | { value: number }; reason: string } | null = null;
  for (let i = 0; i < DEMO_POLICY.maxQueriesPerWindow; i++) {
    const r = await executeCapability({ request: rq("max", "revenue", `cap-b${i}`), envelope: env, now: NOW + 10 + i });
    if (r.result === null) { exhausted = r as never; break; }
  }
  ok("the privacy budget is HARD — once exhausted, even valid queries are refused until the window resets",
    exhausted !== null && (exhausted as { reason: string }).reason.includes("privacy budget exhausted"));

  const ledgerClean = await executeCapability({ request: rq("sum", "revenue", "cap-x"), envelope: env, now: NOW + DEMO_POLICY.windowMs + 20 });
  ok("the window resets honestly — queries outside the window do not count", !!ledgerClean.result);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
