/**
 * MJ 12.0.0 — the navigation alignment probe (the ONE-ENGINE map, pinned).
 *
 * 12.0 is the answer to the reviews 11.14.x earned: the app used to be a lab
 * bench of fourteen destinations and dozens of tabs, each release bolting on
 * another "production". 12.0 consolidates the product to ONE engine — the
 * Mission Loop — and five doors onto it. This suite makes that mechanical:
 *
 *   1. PageKind == the five doors, EXACTLY, and the nav map carries each once
 *      — an orphan page is a product decision nobody made.
 *   2. The groups are the canonical 12.0 model — Engine / Verify / System —
 *      in order, no stragglers, every door in exactly one group.
 *   3. Every destination carries the public vocabulary label and a purpose
 *      description; no legacy mini-app labels survive.
 *   4. App.tsx renders ONLY from the shared map — no forked spine, and the
 *      routes App can render are exactly the five doors (legacy pages stay in
 *      the source tree only where probes exercise them; they are not doors).
 *   5. THE ENGINE RULE: the Mission Loop page imports the engine module and
 *      never reaches into the fragment stores (autonomyStore, lessons,
 *      teamEvolution, belief, selfImprove, skillEvolution, patterns,
 *      learningReceipt) OR the engine's internals (agentTeam, hostDeps,
 *      interAgentChannel — 12.0.1 moved crew persistence, host deps and the
 *      bus projection behind engine API: loadCrews/persistCrew,
 *      loopHostDeps, loopBusFeed) — a page that does is a fork of the engine.
 *   6. The loop page's phase rail is the engine's real phase set — the
 *      lifecycle MJ used to narrate on six nav groups is now executed inside
 *      one screen, so the rail and the engine cannot drift apart.
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
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const typesSrc = read("src/domain/types.ts");
const navSrc = read("src/app/nav.ts");
const appSrc = read("src/App.tsx");
const loopSrc = read("src/pages/LoopPage.tsx");
const engineSrc = read("src/mission/missionLoop.ts");

const EXPECTED_DOORS = ["loop", "workflow", "proof", "audit", "settings"];

/* ── 0. root sanity (same idiom as versionDrift: never trust a broken root) ── */
const pkg = JSON.parse(read("package.json")) as { name?: string; version?: string };
ok("root resolves to the MJ repo (package.json visible)", typeof pkg.name === "string" && /mj/i.test(pkg.name), `name=${String(pkg.name)}`);

/* ── 0. PageKind == the five doors; nav lists each exactly once ─────────── */
const pageKindBlock = /export type PageKind =([\s\S]*?);/.exec(typesSrc)?.[1] ?? "";
const kinds = [...pageKindBlock.matchAll(/\"([a-z]+)\"/g)].map((m) => m[1]);
ok("PageKind declares exactly the 12.0 doors (5)", kinds.length === 5 && kinds.join(",") === EXPECTED_DOORS.join(","), kinds.join(","));
const navKeys = [...navSrc.matchAll(/key: \"([a-z]+)\"/g)].map((m) => m[1]);
ok("the nav map lists each key exactly once", new Set(navKeys).size === 5 && navKeys.length === 5, navKeys.join(","));
ok("every PageKind has a navigation entry — no orphan doors", EXPECTED_DOORS.every((k) => navKeys.includes(k)));
ok("every navigation entry is a real PageKind", navKeys.every((k) => EXPECTED_DOORS.includes(k)));
ok("the legacy 14-door PageKind is gone (home/teams/evolution are not doors)", !kinds.includes("home") && !kinds.includes("teams") && !kinds.includes("evolution"));

/* ── 1. groups: the 12.0 model — Engine / Verify / System ──────────────── */
const groupsSection = navSrc.split("export const NAV_GROUPS")[1] ?? "";
const groups = [...groupsSection.matchAll(/id: \"(engine|verify|system)\"/g)].map((m) => m[1]);
ok("the three 12.0 groups appear in canonical order", groups.join(",") === "engine,verify,system", groups.join(","));
ok("Engine leads with the Mission Loop door", navKeys[0] === "loop" && navSrc.indexOf('key: "loop"') < navSrc.indexOf('key: "workflow"'), navKeys[0]);
const perGroup = (id: string): number => (groupsSection.match(new RegExp(`items: NAV.filter\\(\\(n\\) => .{0,60}${id}`)) ? 1 : 0) + (groupsSection.split(`id: "${id}"`)[1]?.match(/key: "/g) ?? []).length;
const everyKindGrouped = EXPECTED_DOORS.every((k) => (groupsSection.match(new RegExp(`"${k}"`, "g")) ?? []).length >= 1);
ok("every door belongs to exactly one 12.0 group", everyKindGrouped);
ok("engine holds loop+workflow, verify holds proof+audit, system holds settings",
  groupsSection.includes('n.key === "loop" || n.key === "workflow"') &&
  groupsSection.includes('n.key === "proof" || n.key === "audit"') &&
  groupsSection.includes('n.key === "settings"'));
ok("group ids/labels are the public model (Engine/Verify/System)", /label: "Engine"/.test(groupsSection) && /label: "Verify"/.test(groupsSection) && /label: "System"/.test(groupsSection));

/* ── 2. public vocabulary: mature labels + purpose descriptions ─────────── */
const EXPECTED_LABELS: Record<string, string> = {
  loop: "Mission Loop",
  workflow: "Workflows",
  proof: "Proof",
  audit: "Audit",
  settings: "System", // was "Settings" — one configuration door for the engine
};
for (const k of EXPECTED_DOORS) {
  const m = navSrc.match(new RegExp(`key: "${k}", label: "([^"]+)"`));
  ok(`nav labels ${k} with the public name "${EXPECTED_LABELS[k]}"`, m?.[1] === EXPECTED_LABELS[k], m ? `got "${m[1]}"` : "no label found");
}
ok("no mini-app vocabulary survives (Canvas/Teams/Evolve/MCP are not nav labels)",
  !/label: "(Canvas|Teams|Evolve|Connectors|Observe|Runs|Missions|Mission Control)"/.test(navSrc));
const navBody = navSrc.split("export const NAV_GROUPS")[0] ?? "";
const descriptions = [...navBody.matchAll(/description: "([^"]+)"/g)];
ok("every nav entry carries a purpose description (5)", descriptions.length === 5, `${descriptions.length} descriptions`);
ok("descriptions are substantive (>= 24 chars each)", descriptions.every((m) => m[1].length >= 24));

/* ── 3. App renders ONLY from the shared map ────────────────────────────── */
ok("App.tsx imports the shared navigation map", /from "\.\/app\/nav"/.test(appSrc));
ok("App.tsx no longer defines its own NAV arrays", !/const NAV:/.test(appSrc) && !/const NAV_GROUPS:/.test(appSrc));
ok("the sidebar surfaces the purpose description as its tooltip", appSrc.includes("n.description || n.label"));
const routed = [...appSrc.matchAll(/\{page === "([a-z]+)" &&/g)].map((m) => m[1]);
ok("the routes App can render are EXACTLY the five doors", routed.sort().join(",") === [...EXPECTED_DOORS].sort().join(","), routed.join(","));
ok("legacy pages are no longer routed (no orphan render paths)", ["home", "teams", "missions", "evolution", "executions", "observability", "mcp", "browser", "providers", "control"].every((k) => !routed.includes(k)));
ok("App opens on the engine door", /useState<PageKind>\("loop"\)/.test(appSrc));

/* ── 4. THE ENGINE RULE: the Loop page talks to the engine, not fragments ── */
const loopImports = loopSrc.split("\n").filter((l) => l.includes("from \"../mission/")).join("\n");
ok("the Loop page imports the engine module", loopImports.includes("mission/missionLoop"));
const FORBIDDEN_STORES = ["autonomyStore", "lessons", "teamEvolution", "belief", "selfImprove", "skillEvolution", "patterns", "learningReceipt", "selfEvolveRuntime", "evolutionBandit", "evolutionEngine"];
ok("the Loop page imports no fragment store directly (one engine, one API)",
  FORBIDDEN_STORES.every((m) => !new RegExp(`mission/${m}`).test(loopImports)),
  FORBIDDEN_STORES.filter((m) => new RegExp(`mission/${m}`).test(loopImports)).join(","));
ok("the Loop page imports none of the engine's internals either (crew store, host deps, bus — 12.0.1)",
  ["agentTeam", "hostDeps", "interAgentChannel"].every((m) => !new RegExp(`mission/${m}`).test(loopImports)),
  ["agentTeam", "hostDeps", "interAgentChannel"].filter((m) => new RegExp(`mission/${m}`).test(loopImports)).join(","));
ok("the engine owns the crew surface (loadCrews / persistCrew exist in the engine)",
  /export function loadCrews/.test(engineSrc) && /export function persistCrew/.test(engineSrc));
ok("the engine owns the host-deps adapter (loopHostDeps)",
  /export function loopHostDeps/.test(engineSrc) && !/mission\/hostDeps/.test(loopImports));
ok("the engine projects the inter-agent bus (loopBusFeed) and the page subscribes through it",
  /export function loopBusFeed/.test(engineSrc) && /loopBusFeed\(\)\.subscribe/.test(loopSrc));
ok("the engine exposes the explicit human rating API and the page calls it",
  /export function submitHumanFeedback/.test(engineSrc) && loopSrc.includes("submitHumanFeedback({"));
ok("the loop page renders the explicit 1–5 + comment feedback surface",
  /\[1,\s*2,\s*3,\s*4,\s*5\]/.test(loopSrc) && loopSrc.includes("Submit rating"));
ok("the engine's own header claims orchestration, not literal one-store fusion",
  /orchestrat/.test(engineSrc.slice(0, 1600)) && !/ONE store|one store/.test(engineSrc));

/* ── 5. the loop page's rail == the engine's real phases ────────────────── */
function PHASES_RAIL(src: string): string[] {
  const m = /const PHASES: LoopPhase\[\] = \[([\s\S]*?)\];/.exec(src);
  if (!m) return [];
  return [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
}
const rail = PHASES_RAIL(loopSrc);
const enginePhases = ["compose", "dispatch", "communicate", "execute", "gate", "adapt"];
ok("the phase rail matches the engine's own arc exactly", rail.join(",") === enginePhases.join(","), rail.join(","));
ok("the engine module's header names all five fused mechanisms", /COMPOSE|DISPATCH|COMMUNICATE|EXECUTE|GATE|ADAPT/.test(engineSrc));
/* ── 6. the one-product statement is in the public files ────────────────── */
ok("the engine docstring states the fusion of the five features", /TEAMS.*self-evolution|ONE engine/i.test(engineSrc));
ok("the nav docstring names the 12.0 consolidation (one product, five doors)", /ONE product|one product/i.test(navSrc));
ok("the nav docstring says the lifecycle now runs inside the engine", /phase rail|inside the engine|phase rail/i.test(navSrc + loopSrc));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
