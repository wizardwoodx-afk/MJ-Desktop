/**
 * MJ 11.14.10 — the navigation alignment probe (the consolidation, pinned).
 *
 * 11.14.10 turned the app's destinations from two drift-prone ad-hoc arrays
 * in App.tsx into ONE source of truth (src/app/nav.ts) shaped as the product
 * spine — Overview → Build → Run → Verify → Learn → System. This suite makes
 * the consolidation mechanical, in MJ's guardrailAlign idiom:
 *
 *   1. Every PageKind the app can navigate to is in the map EXACTLY once —
 *      an orphan page is a product decision nobody made.
 *   2. The nav map contains nothing but PageKinds.
 *   3. The groups are the canonical lifecycle, in order, with no stragglers.
 *   4. Every destination carries the public vocabulary label (the mature
 *      product name, not the internal codename) and a purpose description.
 *   5. App.tsx renders ONLY from the shared map — a second local nav would
 *      fail here, so the single spine cannot silently fork again.
 *   6. The Home hero speaks the same pillar language the spine is built on.
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

const typesSrc = read("src/domain/types.ts");
const navSrc = read("src/app/nav.ts");
const appSrc = read("src/App.tsx");
const homeSrc = read("src/pages/HomePage.tsx");

/* ── 0. every navigable PageKind is in the map exactly once ─────────────── */
// Parse ONLY the PageKind union block (types.ts has many other unions).
const pageKindBlock = /export type PageKind =([\s\S]*?);/.exec(typesSrc)?.[1] ?? "";
const kinds = [...pageKindBlock.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
ok("PageKind declares the expected 14 destinations", kinds.length === 14, `${kinds.length} kinds`);

const navKeys = [...navSrc.matchAll(/key: "([a-z]+)"/g)].map((m) => m[1]);
const dupes = navKeys.filter((k, i) => navKeys.indexOf(k) !== i);
ok("the nav map lists each key once", dupes.length === 0, dupes.join(", "));

const missing = kinds.filter((k) => !navKeys.includes(k));
ok("every PageKind has a navigation entry — no orphan pages", missing.length === 0, `missing: ${missing.join(", ")}`);
const unknown = navKeys.filter((k) => !kinds.includes(k));
ok("every navigation entry is a real PageKind", unknown.length === 0, `unknown: ${unknown.join(", ")}`);

/* ── 1. the groups are the canonical lifecycle, in order, fully covering ── */
// Parse ONLY the NAV_GROUPS const (the interface above it also names the ids).
const groupsSection = navSrc.split("export const NAV_GROUPS")[1] ?? "";
const groups = [...groupsSection.matchAll(/id: "(overview|build|run|verify|learn|system)"/g)].map((m) => m[1]);
ok("the six lifecycle groups appear in canonical order",
  groups.join(",") === "overview,build,run,verify,learn,system", groups.join(","));

const everyKindGrouped = kinds.every((k) => (groupsSection.match(new RegExp(`"${k}"`, "g")) ?? []).length === 1);
ok("every destination belongs to exactly one lifecycle group", everyKindGrouped);

/* ── 2. the public vocabulary: mature labels + purpose descriptions ──────── */
const EXPECTED_LABELS: Record<string, string> = {
  home: "Home",
  workflow: "Workflows", // was "Canvas"
  teams: "Teams",
  missions: "Missions",
  control: "Mission Control", // was "Control"
  executions: "Runs",
  observability: "Observe",
  proof: "Proof",
  audit: "Audit",
  evolution: "Evolve",
  mcp: "Connectors", // was "MCP"
  browser: "Browser",
  providers: "Providers",
  settings: "Settings",
};
const LEGACY_LABELS = ["Canvas", "Control", "MCP"];
for (const k of kinds) {
  const m = navSrc.match(new RegExp(`key: "${k}", label: "([^"]+)"`));
  ok(`nav labels ${k} with the public name "${EXPECTED_LABELS[k]}"`,
    m?.[1] === EXPECTED_LABELS[k], m ? `got "${m[1]}"` : "no label found");
}
ok("no legacy mini-app labels survive in the map", LEGACY_LABELS.every((l) => !new RegExp(`label: "${l}"`).test(navSrc)));

const descriptions = [...navSrc.matchAll(/description: "([^"]{20,}?)"/g)];
ok("every nav entry carries a purpose description", descriptions.length >= 14,
  `${descriptions.length} descriptions`);
ok("descriptions are substantive (>= 24 chars each)",
  [...navSrc.matchAll(/description: "([^"]+)"/g)].every((m) => m[1].length >= 24));

/* ── 3. App renders ONLY from the shared map (no forked spine) ──────────── */
ok("App.tsx imports the shared navigation map", /from "\.\/app\/nav"/.test(appSrc) || /from '\.\/app\/nav'/.test(appSrc));
ok("App.tsx no longer defines its own NAV arrays", !/const NAV:/.test(appSrc) && !/const NAV_GROUPS:/.test(appSrc));
ok("the sidebar surfaces the purpose description as its tooltip", appSrc.includes("n.description || n.label"));

/* ── 4. the Home hero speaks the same pillar language ───────────────────── */
ok("the Home hero names verification", /verify|prove|checked/i.test(homeSrc));
ok("the Home hero names learning from feedback", /learn|feedback/i.test(homeSrc));
ok("the Home hero names data staying local", /data[^.]{0,40}(laptop|machine|leave)/i.test(homeSrc));
ok("the Home hero names signed evidence", /signed|receipt|tamper/i.test(homeSrc));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
