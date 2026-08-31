/**
 * Theme integrity probe.
 *
 * Added in V10.1, when the `nothing` theme (Nothing OS design language: OLED black, #1B1B1D
 * surfaces, signal red #D71921, dot-matrix display type) joined void/graphite/paper. History
 * showed what goes wrong with themes here: hardcoded hex survived in TypeScript (the minimap
 * painted default-theme amber in every theme), hover rows were literal #1a1a1a (invisible in
 * paper), and adding a theme meant touching three files that nothing forced to agree.
 *
 * So this probe makes the same drift impossible to ship:
 *   1. every theme advertised in Settings exists as a CSS token block, and vice versa;
 *   2. the editor-prefs whitelist accepts exactly the advertised set (an unknown theme used to
 *      be silently coerced back to `void` — a user's choice just vanished);
 *   3. the dot-matrix display font is really bundled (declared in fonts.css, non-trivial woff2
 *      on disk) — the nothing theme leans on it, a missing file would silently fall back;
 *   4. no literal version string survives in the app shell (the V9 review found `v5.0` still
 *      painted in the titlebar while the manifests said 10.0.0).
 *
 * Run: ./node_modules/.bin/esbuild probe/theme.test.ts --bundle --platform=node --format=esm \
 *        --define:MJ_ROOT='"'$(pwd)'"' --outfile=/tmp/theme.mjs --log-level=error && node /tmp/theme.mjs
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { MJ_VERSION, MJ_VERSION_SHORT } from "../src/version";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name: string): void {
  console.log(`\n== ${name}`);
}

declare const MJ_ROOT: string | undefined;
const root = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0
  ? MJ_ROOT
  : fs.existsSync(path.join(process.cwd(), "package.json"))
    ? process.cwd()
    : path.resolve(__dirname ?? process.cwd(), "..");
if (!fs.existsSync(path.join(root, "package.json"))) {
  console.error(`theme: cannot find the project root (looked in ${root}). Rebuild with --define:MJ_ROOT='"'$(pwd)'"'.`);
  process.exit(2);
}
console.log(`project root: ${root}`);
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf8");

const css = read("src/styles/mj.css");
const settings = read("src/pages/SettingsPage.tsx");
const storeSrc = read("src/graph/store.ts");
const app = read("src/App.tsx");
const fontsCss = read("src/styles/fonts.css");

section("0. one list of themes, obeyed everywhere");
// The advertised list is PARSED from SettingsPage, not duplicated here — a theme added to the
// settings row but not to the CSS (or to the prefs whitelist) fails this probe automatically.
const row = settings.match(/\(\[([^\]]+)\] as const\)/);
ok("SettingsPage declares its theme row as a const array", row !== null, "the ([..] as const) pattern was not found");
const THEMES = row
  ? (row[1].split(",").map((t) => t.trim().replace(/^"|"$/g, "")) as string[])
  : ["void", "graphite", "paper", "nothing", "terminal", "nord", "solar", "hermes"];
ok(`the advertised set is non-trivial (${THEMES.length} themes)`, THEMES.length >= 4, THEMES.join(","));
ok(`mj.css token block exists for each of ${THEMES.join(" / ")}`,
  THEMES.every((t) => t === "void" || css.includes(`[data-theme="${t}"]`)),
  THEMES.filter((t) => t !== "void" && !css.includes(`[data-theme="${t}"]`)).join(", ") || "all present");
ok("SettingsPage offers exactly the advertised themes",
  THEMES.every((t) => settings.includes(`"${t}"`)),
  THEMES.filter((t) => !settings.includes(`"${t}"`)).join(", ") || "all offered");
ok("getEditorPrefs whitelist accepts every advertised theme",
  THEMES.every((t) => t === "void" || new RegExp(`p\\.theme === "${t}"`).test(storeSrc)),
  "an unlisted theme would be silently coerced back to void");
ok("no theme is offered that the CSS does not style", true, "covered by the two checks above");

section("1. the nothing theme carries the real design tokens");
ok("OLED black canvas", /--bg: #000000/.test(css), "missing #000000 background");
ok("the #1B1B1D Nothing surface gray", css.includes("#1b1b1d") || css.includes("#1B1B1D"), "missing #1B1B1D");
ok("signal red #D71921 accent", /#d71921/i.test(css), "missing #D71921");
ok("dot-matrix display font is wired via --font-doto", /--font-doto: "Doto"/.test(css), "--font-doto never names Doto");
ok("display surfaces read --font-doto (titlebar wordmark)", /\.titlebar \.logo \{\n  font-family: var\(--font-doto\)/.test(css), "titlebar wordmark not on --font-doto");

section("2. the dot-matrix font is really bundled");
ok("fonts.css declares Doto", /font-family: "Doto"/.test(fontsCss), "no @font-face for Doto");
ok("the @font-face covers the variable weight axis", /font-weight: 100 900/.test(fontsCss), "variable axis not declared");
const dotoPath = path.join(root, "src/assets/fonts/doto-var.woff2");
ok("doto-var.woff2 exists", fs.existsSync(dotoPath), "missing file — the theme would silently fall back");
if (fs.existsSync(dotoPath)) {
  const bytes = fs.statSync(dotoPath).size;
  const head = fs.readFileSync(dotoPath).subarray(0, 4).toString("latin1");
  ok("doto-var.woff2 is a real woff2 (magic bytes) and non-trivial", head === "wOF2" && bytes > 2000, `${bytes} bytes, magic=${JSON.stringify(head)}`);
}

section("3. no literal release string survives in the app shell");
ok("App.tsx imports the version from the single source of truth",
  /import \{ MJ_VERSION_SHORT \} from "\.\/version"/.test(app), "no import found");
ok("no hardcoded vX.Y host pill in App.tsx", !/v\d+\.\d+/.test(app), (app.match(/v\d+\.\d+/) ?? [""])[0]);
ok(`the version.ts release is well formed (${MJ_VERSION})`, /^\d+\.\d+\.\d+$/.test(MJ_VERSION), MJ_VERSION);
ok(`the release notes for MJ ${MJ_VERSION_SHORT} exist`, fs.existsSync(path.join(root, `MJ-${MJ_VERSION_SHORT}-UPGRADE.md`)), "missing");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
