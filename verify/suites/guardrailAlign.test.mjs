import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/guardrailAlign.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var ROOT = ".".length > 0 ? "." : path.resolve(import.meta.dirname ?? ".", "..");
var read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var custody = read("src/mission/custody.ts");
var ledger = read("src/mission/ledger.ts");
var executor = read("src/mission/teamExecutor.ts");
var verifier = read("src/mission/verifyGate.ts");
var lessons = read("src/mission/lessons.ts");
var selfImprove = read("src/mission/selfImprove.ts");
ok(
  "guardrail 1 \u2014 no root authority without a human principal (code throws, not prose)",
  custody.includes("isHumanPrincipal(args.principal)") && custody.includes("not a human principal")
);
ok("guardrail 2 \u2014 no delegation that grows scope", custody.includes("scope would GROW"));
ok("guardrail 3 \u2014 no delegation that outlives its parent", custody.includes("child expiry outlives the parent"));
ok(
  "guardrail 4 \u2014 no spend beyond the cap: concurrent seats must reserve before dispatch (atomic)",
  custody.includes("class BudgetGate") && executor.includes("budgetGate.reserve(a.seat.id, share)")
);
ok(
  "guardrail 5 \u2014 agents may propose DOCTRINE but never write it",
  ledger.includes("DOCTRINE is human-only") && ledger.includes("enforceWrite")
);
ok(
  "guardrail 6 \u2014 no skill installed by an agent alone (RECOURSE needs experiment or human)",
  ledger.includes("an agent run cannot install strategies or skills on its own")
);
ok(
  "guardrail 7 \u2014 governed store writes pass the matrix BEFORE persisting",
  lessons.includes("enforceWrite") && selfImprove.includes("enforceWrite")
);
ok(
  "guardrail 8 \u2014 the merge gate requires a verifier that is not the author",
  fs.existsSync(path.join(ROOT, "src/mission/verifyGate.ts")) && /author graded its own work/.test(verifier)
);
ok(
  "guardrail 9 \u2014 no invented prices: token-only spend stays dollar-UNKNOWN",
  executor.includes("reported tokens only") && executor.includes("marks their dollar spend UNKNOWN")
);
ok(
  "guardrail 10 \u2014 no artifact leaves this machine without a signed egress authority + receipt",
  read("src/mission/egress.ts").includes("no authority envelope; nothing leaves this machine") && read("src/pages/AuditPage.tsx").includes("requestEgress")
);
ok(
  "guardrail 11 \u2014 capability requests return answers only \u2014 aggregate whitelist, raw rows never leave",
  read("src/mission/capability.ts").includes("aggregate operations, never raw rows") && read("src/mission/capability.ts").includes("capability:run")
);
ok(
  "guardrail 12 \u2014 aggregates pass the Privacy Guard: minimum cohort, hard query budget, bounded precision",
  read("src/mission/capability.ts").includes("minCohortSize") && read("src/mission/capability.ts").includes("privacy budget exhausted") && read("src/mission/capability.ts").includes("roundTo")
);
ok(
  "guardrail 13 \u2014 every guardrail above is surfaced as a manifest on the Audit page",
  read("src/pages/AuditPage.tsx").includes("Guardrail manifest")
);
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
