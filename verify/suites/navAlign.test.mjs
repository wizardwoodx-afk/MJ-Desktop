import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/navAlign.test.ts
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
var ROOT = ".".length > 0 ? "." : process.cwd();
var read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var typesSrc = read("src/domain/types.ts");
var navSrc = read("src/app/nav.ts");
var appSrc = read("src/App.tsx");
var loopSrc = read("src/pages/LoopPage.tsx");
var engineSrc = read("src/mission/missionLoop.ts");
var EXPECTED_DOORS = ["loop", "workflow", "proof", "audit", "settings"];
var pkg = JSON.parse(read("package.json"));
ok("root resolves to the MJ repo (package.json visible)", typeof pkg.name === "string" && /mj/i.test(pkg.name), `name=${String(pkg.name)}`);
var pageKindBlock = /export type PageKind =([\s\S]*?);/.exec(typesSrc)?.[1] ?? "";
var kinds = [...pageKindBlock.matchAll(/\"([a-z]+)\"/g)].map((m) => m[1]);
ok("PageKind declares exactly the 12.0 doors (5)", kinds.length === 5 && kinds.join(",") === EXPECTED_DOORS.join(","), kinds.join(","));
var navKeys = [...navSrc.matchAll(/key: \"([a-z]+)\"/g)].map((m) => m[1]);
ok("the nav map lists each key exactly once", new Set(navKeys).size === 5 && navKeys.length === 5, navKeys.join(","));
ok("every PageKind has a navigation entry \u2014 no orphan doors", EXPECTED_DOORS.every((k) => navKeys.includes(k)));
ok("every navigation entry is a real PageKind", navKeys.every((k) => EXPECTED_DOORS.includes(k)));
ok("the legacy 14-door PageKind is gone (home/teams/evolution are not doors)", !kinds.includes("home") && !kinds.includes("teams") && !kinds.includes("evolution"));
var groupsSection = navSrc.split("export const NAV_GROUPS")[1] ?? "";
var groups = [...groupsSection.matchAll(/id: \"(engine|verify|system)\"/g)].map((m) => m[1]);
ok("the three 12.0 groups appear in canonical order", groups.join(",") === "engine,verify,system", groups.join(","));
ok("Engine leads with the Mission Loop door", navKeys[0] === "loop" && navSrc.indexOf('key: "loop"') < navSrc.indexOf('key: "workflow"'), navKeys[0]);
var everyKindGrouped = EXPECTED_DOORS.every((k) => (groupsSection.match(new RegExp(`"${k}"`, "g")) ?? []).length >= 1);
ok("every door belongs to exactly one 12.0 group", everyKindGrouped);
ok(
  "engine holds loop+workflow, verify holds proof+audit, system holds settings",
  groupsSection.includes('n.key === "loop" || n.key === "workflow"') && groupsSection.includes('n.key === "proof" || n.key === "audit"') && groupsSection.includes('n.key === "settings"')
);
ok("group ids/labels are the public model (Engine/Verify/System)", /label: "Engine"/.test(groupsSection) && /label: "Verify"/.test(groupsSection) && /label: "System"/.test(groupsSection));
var EXPECTED_LABELS = {
  loop: "Mission Loop",
  workflow: "Workflows",
  proof: "Proof",
  audit: "Audit",
  settings: "System"
  // was "Settings" — one configuration door for the engine
};
for (const k of EXPECTED_DOORS) {
  const m = navSrc.match(new RegExp(`key: "${k}", label: "([^"]+)"`));
  ok(`nav labels ${k} with the public name "${EXPECTED_LABELS[k]}"`, m?.[1] === EXPECTED_LABELS[k], m ? `got "${m[1]}"` : "no label found");
}
ok(
  "no mini-app vocabulary survives (Canvas/Teams/Evolve/MCP are not nav labels)",
  !/label: "(Canvas|Teams|Evolve|Connectors|Observe|Runs|Missions|Mission Control)"/.test(navSrc)
);
var navBody = navSrc.split("export const NAV_GROUPS")[0] ?? "";
var descriptions = [...navBody.matchAll(/description: "([^"]+)"/g)];
ok("every nav entry carries a purpose description (5)", descriptions.length === 5, `${descriptions.length} descriptions`);
ok("descriptions are substantive (>= 24 chars each)", descriptions.every((m) => m[1].length >= 24));
ok("App.tsx imports the shared navigation map", /from "\.\/app\/nav"/.test(appSrc));
ok("App.tsx no longer defines its own NAV arrays", !/const NAV:/.test(appSrc) && !/const NAV_GROUPS:/.test(appSrc));
ok("the sidebar surfaces the purpose description as its tooltip", appSrc.includes("n.description || n.label"));
var routed = [...appSrc.matchAll(/\{page === "([a-z]+)" &&/g)].map((m) => m[1]);
ok("the routes App can render are EXACTLY the five doors", routed.sort().join(",") === [...EXPECTED_DOORS].sort().join(","), routed.join(","));
ok("legacy pages are no longer routed (no orphan render paths)", ["home", "teams", "missions", "evolution", "executions", "observability", "mcp", "browser", "providers", "control"].every((k) => !routed.includes(k)));
ok("App opens on the engine door", /useState<PageKind>\("loop"\)/.test(appSrc));
var loopImports = loopSrc.split("\n").filter((l) => l.includes('from "../mission/')).join("\n");
ok("the Loop page imports the engine module", loopImports.includes("mission/missionLoop"));
var FORBIDDEN_STORES = ["autonomyStore", "lessons", "teamEvolution", "belief", "selfImprove", "skillEvolution", "patterns", "learningReceipt", "selfEvolveRuntime", "evolutionBandit", "evolutionEngine"];
ok(
  "the Loop page imports no fragment store directly (one engine, one API)",
  FORBIDDEN_STORES.every((m) => !new RegExp(`mission/${m}`).test(loopImports)),
  FORBIDDEN_STORES.filter((m) => new RegExp(`mission/${m}`).test(loopImports)).join(",")
);
ok(
  "the Loop page imports none of the engine's internals either (crew store, host deps, bus \u2014 12.0.1; knowledge forge \u2014 12.1.0)",
  ["agentTeam", "hostDeps", "interAgentChannel", "knowledgeSkills"].every((m) => !new RegExp(`mission/${m}`).test(loopImports)),
  ["agentTeam", "hostDeps", "interAgentChannel", "knowledgeSkills"].filter((m) => new RegExp(`mission/${m}`).test(loopImports)).join(",")
);
var forgeSrc = read("src/mission/knowledgeSkills.ts");
var missionModules = [...new Set(loopImports.match(/from "\.\.\/mission\/[a-zA-Z]+/g) ?? [])];
ok(
  "the engine module re-exports the knowledge-forge API (books \u2192 human-approved skills)",
  /from "\.\/knowledgeSkills"/.test(engineSrc) && /export (async )?function proposeKnowledgeSkill/.test(forgeSrc) && /export function decideKnowledgeProposal/.test(forgeSrc)
);
ok(
  "the Loop page reaches the forge through the engine only (ONE mission module imported)",
  missionModules.length === 1 && missionModules[0] === 'from "../mission/missionLoop' && loopSrc.includes("proposeKnowledgeSkill") && loopSrc.includes("decideKnowledgeProposal")
);
ok(
  "the Loop page renders the Knowledge forge surface",
  loopSrc.includes("Knowledge forge") && loopSrc.includes("Convert to proposal") && loopSrc.includes("never claim measured effect")
);
ok(
  "the engine owns the crew surface (loadCrews / persistCrew exist in the engine)",
  /export function loadCrews/.test(engineSrc) && /export function persistCrew/.test(engineSrc)
);
ok(
  "the engine owns the host-deps adapter (loopHostDeps)",
  /export function loopHostDeps/.test(engineSrc) && !/mission\/hostDeps/.test(loopImports)
);
ok(
  "the engine projects the inter-agent bus (loopBusFeed) and the page subscribes through it",
  /export function loopBusFeed/.test(engineSrc) && /loopBusFeed\(\)\.subscribe/.test(loopSrc)
);
ok(
  "the engine exposes the explicit human rating API and the page calls it",
  /export function submitHumanFeedback/.test(engineSrc) && loopSrc.includes("submitHumanFeedback({")
);
ok(
  "the loop page renders the explicit 1\u20135 + comment feedback surface",
  /\[1,\s*2,\s*3,\s*4,\s*5\]/.test(loopSrc) && loopSrc.includes("Submit rating")
);
ok(
  "the engine's own header claims orchestration, not literal one-store fusion",
  /orchestrat/.test(engineSrc.slice(0, 1600)) && !/ONE store|one store/.test(engineSrc)
);
function PHASES_RAIL(src) {
  const m = /const PHASES: LoopPhase\[\] = \[([\s\S]*?)\];/.exec(src);
  if (!m) return [];
  return [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
}
var rail = PHASES_RAIL(loopSrc);
var enginePhases = ["compose", "dispatch", "communicate", "execute", "gate", "adapt"];
ok("the phase rail matches the engine's own arc exactly", rail.join(",") === enginePhases.join(","), rail.join(","));
ok("the engine module's header names all five fused mechanisms", /COMPOSE|DISPATCH|COMMUNICATE|EXECUTE|GATE|ADAPT/.test(engineSrc));
ok("the engine docstring states the fusion of the five features", /TEAMS.*self-evolution|ONE engine/i.test(engineSrc));
ok("the nav docstring names the 12.0 consolidation (one product, five doors)", /ONE product|one product/i.test(navSrc));
ok("the nav docstring says the lifecycle now runs inside the engine", /phase rail|inside the engine|phase rail/i.test(navSrc + loopSrc));
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
