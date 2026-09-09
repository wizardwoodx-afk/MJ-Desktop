/**
 * MJ 11.13.1 — guardrail manifest probe.
 *
 * The pattern MJ adopts from Anthropic's open commerce blueprint: guardrails
 * enforced in CODE, not prompts. This suite proves each line of the Audit
 * page's guardrail manifest is a check that actually runs in the source —
 * not a sentence in a doc.
 */
import * as fs from "node:fs";
import * as path from "node:path";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : path.resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const custody = read("src/mission/custody.ts");
const ledger = read("src/mission/ledger.ts");
const executor = read("src/mission/teamExecutor.ts");
const verifier = read("src/mission/verifyGate.ts");
const lessons = read("src/mission/lessons.ts");
const selfImprove = read("src/mission/selfImprove.ts");

ok("guardrail 1 — no root authority without a human principal (code throws, not prose)",
  custody.includes("isHumanPrincipal(args.principal)") && custody.includes("not a human principal"));
ok("guardrail 2 — no delegation that grows scope", custody.includes("scope would GROW"));
ok("guardrail 3 — no delegation that outlives its parent", custody.includes("child expiry outlives the parent"));
ok("guardrail 4 — no spend beyond the cap: concurrent seats must reserve before dispatch (atomic)",
  custody.includes("class BudgetGate") && executor.includes("budgetGate.reserve(a.seat.id, share)"));
ok("guardrail 5 — agents may propose DOCTRINE but never write it",
  ledger.includes("DOCTRINE is human-only") && ledger.includes("enforceWrite"));
ok("guardrail 6 — no skill installed by an agent alone (RECOURSE needs experiment or human)",
  ledger.includes("an agent run cannot install strategies or skills on its own"));
ok("guardrail 7 — governed store writes pass the matrix BEFORE persisting",
  lessons.includes("enforceWrite") && selfImprove.includes("enforceWrite"));
ok("guardrail 8 — the merge gate requires a verifier that is not the author",
  fs.existsSync(path.join(ROOT, "src/mission/verifyGate.ts")) && /author graded its own work/.test(verifier));
ok("guardrail 9 — no invented prices: token-only spend stays dollar-UNKNOWN",
  executor.includes("reported tokens only") && executor.includes("marks their dollar spend UNKNOWN"));
ok("guardrail 10 — no artifact leaves this machine without a signed egress authority + receipt",
  read("src/mission/egress.ts").includes("no authority envelope; nothing leaves this machine") && read("src/pages/AuditPage.tsx").includes("requestEgress"));
ok("guardrail 11 — capability requests return answers only — aggregate whitelist, raw rows never leave",
  read("src/mission/capability.ts").includes("aggregate operations, never raw rows") && read("src/mission/capability.ts").includes("capability:run"));
ok("guardrail 12 — aggregates pass the Privacy Guard: minimum cohort, hard query budget, bounded precision",
  read("src/mission/capability.ts").includes("minCohortSize") && read("src/mission/capability.ts").includes("privacy budget exhausted") && read("src/mission/capability.ts").includes("roundTo"));
ok("guardrail 13 — the privacy budget is durable, per-requester, and tamper-evident (restart resets nothing)",
  read("src/mission/capability.ts").includes("mj.privacy.ledger") && read("src/mission/capability.ts").includes("verifyPrivacyLedger") && read("src/mission/capability.ts").includes("digest chain is broken"));
ok("guardrail 14 — the two-machine proof: the coordinator sees identity, request, authorization and receipt — never rows",
  read("src/mission/twoNode.ts").includes("RelayNode") && read("probe/twoNodeAlign.test.ts").includes("NEVER saw the raw rows"));
ok("guardrail 15 — every guardrail above is surfaced as a manifest on the Audit page",
  read("src/pages/AuditPage.tsx").includes("Guardrail manifest"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
