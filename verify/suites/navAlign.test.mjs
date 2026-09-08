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
var ROOT = ".".length > 0 ? "." : path.resolve(import.meta.dirname ?? ".", "..");
var read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var typesSrc = read("src/domain/types.ts");
var navSrc = read("src/app/nav.ts");
var appSrc = read("src/App.tsx");
var homeSrc = read("src/pages/HomePage.tsx");
var pageKindBlock = /export type PageKind =([\s\S]*?);/.exec(typesSrc)?.[1] ?? "";
var kinds = [...pageKindBlock.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
ok("PageKind declares the expected 14 destinations", kinds.length === 14, `${kinds.length} kinds`);
var navKeys = [...navSrc.matchAll(/key: "([a-z]+)"/g)].map((m) => m[1]);
var dupes = navKeys.filter((k, i) => navKeys.indexOf(k) !== i);
ok("the nav map lists each key once", dupes.length === 0, dupes.join(", "));
var missing = kinds.filter((k) => !navKeys.includes(k));
ok("every PageKind has a navigation entry \u2014 no orphan pages", missing.length === 0, `missing: ${missing.join(", ")}`);
var unknown = navKeys.filter((k) => !kinds.includes(k));
ok("every navigation entry is a real PageKind", unknown.length === 0, `unknown: ${unknown.join(", ")}`);
var groupsSection = navSrc.split("export const NAV_GROUPS")[1] ?? "";
var groups = [...groupsSection.matchAll(/id: "(overview|build|run|verify|learn|system)"/g)].map((m) => m[1]);
ok(
  "the six lifecycle groups appear in canonical order",
  groups.join(",") === "overview,build,run,verify,learn,system",
  groups.join(",")
);
var everyKindGrouped = kinds.every((k) => (groupsSection.match(new RegExp(`"${k}"`, "g")) ?? []).length === 1);
ok("every destination belongs to exactly one lifecycle group", everyKindGrouped);
var EXPECTED_LABELS = {
  home: "Home",
  workflow: "Workflows",
  // was "Canvas"
  teams: "Teams",
  missions: "Missions",
  control: "Mission Control",
  // was "Control"
  executions: "Runs",
  observability: "Observe",
  proof: "Proof",
  audit: "Audit",
  evolution: "Evolve",
  mcp: "Connectors",
  // was "MCP"
  browser: "Browser",
  providers: "Providers",
  settings: "Settings"
};
var LEGACY_LABELS = ["Canvas", "Control", "MCP"];
for (const k of kinds) {
  const m = navSrc.match(new RegExp(`key: "${k}", label: "([^"]+)"`));
  ok(
    `nav labels ${k} with the public name "${EXPECTED_LABELS[k]}"`,
    m?.[1] === EXPECTED_LABELS[k],
    m ? `got "${m[1]}"` : "no label found"
  );
}
ok("no legacy mini-app labels survive in the map", LEGACY_LABELS.every((l) => !new RegExp(`label: "${l}"`).test(navSrc)));
var descriptions = [...navSrc.matchAll(/description: "([^"]{20,}?)"/g)];
ok(
  "every nav entry carries a purpose description",
  descriptions.length >= 14,
  `${descriptions.length} descriptions`
);
ok(
  "descriptions are substantive (>= 24 chars each)",
  [...navSrc.matchAll(/description: "([^"]+)"/g)].every((m) => m[1].length >= 24)
);
ok("App.tsx imports the shared navigation map", /from "\.\/app\/nav"/.test(appSrc) || /from '\.\/app\/nav'/.test(appSrc));
ok("App.tsx no longer defines its own NAV arrays", !/const NAV:/.test(appSrc) && !/const NAV_GROUPS:/.test(appSrc));
ok("the sidebar surfaces the purpose description as its tooltip", appSrc.includes("n.description || n.label"));
ok("the Home hero names verification", /verify|prove|checked/i.test(homeSrc));
ok("the Home hero names learning from feedback", /learn|feedback/i.test(homeSrc));
ok("the Home hero names data staying local", /data[^.]{0,40}(laptop|machine|leave)/i.test(homeSrc));
ok("the Home hero names signed evidence", /signed|receipt|tamper/i.test(homeSrc));
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
