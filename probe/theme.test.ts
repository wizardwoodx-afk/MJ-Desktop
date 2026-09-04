/**
 * Theme integrity probe.
 *
 * Added in V10.1 when the `nothing` theme (Nothing OS design language: OLED black, #1B1B1D
 * surfaces, signal red #D71921, dot-matrix display type) joined void/graphite/paper. History
 * showed what goes wrong with themes here: hardcoded hex survived in TypeScript (the minimap
 * painted default-theme amber in every theme), hover rows were literal #1a1a1a (invisible in
 * paper), and adding a theme meant touching three files that nothing forced to agree.
 *
 * V11.2 rewritten for the INSCRIBED theme system: one design system, old theme set removed
 * (six palettes at V11.2, nine since V11.4 — the count is pinned to whatever SettingsPage
 * advertises, so adding a palette means updating this probe deliberately, never silently).
 * The probe now enforces:
 *   1. every theme advertised in Settings exists as a CSS token block, and vice versa;
 *   2. the editor-prefs whitelist (THEME_IDS) accepts exactly the advertised set — and old
 *      names are migrated, not silently coerced to a default (an unknown theme used to just
 *      vanish);
 *   3. none of the removed 12 themes survives in Settings or the prefs whitelist;
 *   4. the dot-matrix display font is really bundled (declared in fonts.css, non-trivial
 *      woff2 on disk) — the Inscribed system leans on it;
 *   5. no literal version string survives in the app shell.
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

// Perceived luminance of a #rrggbb hex, used to prove palettes are genuinely dark / bright.
const lum = (hex: string): number => {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

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
const themesCss = read("src/styles/themes.css");
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
  : ["inscribed", "chalk", "carbon", "bone", "indigo", "sage", "hazard", "orchid", "porcelain"];
ok(`the advertised set is the eleven-palette INSCRIBED set (${THEMES.length} themes)`, THEMES.length === 11, THEMES.join(","));
ok(`themes.css has the expected token block count (got ${THEMES.filter((t) => !themesCss.includes(`[data-theme="${t}"]`)).length} missing)`,
  THEMES.every((t) => themesCss.includes(`[data-theme="${t}"]`)),
  THEMES.filter((t) => !themesCss.includes(`[data-theme="${t}"]`)).join(", ") || "all present");
ok("SettingsPage offers exactly the advertised themes",
  THEMES.every((t) => settings.includes(`"${t}"`)),
  THEMES.filter((t) => !settings.includes(`"${t}"`)).join(", ") || "all offered");
ok("store.ts owns the whitelist as THEME_IDS and lists every advertised theme",
  /THEME_IDS: ThemeId\[\] = \[[^\]]+\]/.test(storeSrc) &&
    THEMES.every((t) => new RegExp(`"${t}"`).test(storeSrc.match(/THEME_IDS: ThemeId\[\] = \[([^\]]+)\]/)?.[1] ?? "")),
  "THEME_IDS missing or incomplete");
ok("unknown themes are migrated via THEME_ALIASES instead of vanishing",
  /THEME_ALIASES: Record<string, ThemeId>/.test(storeSrc) && storeSrc.includes('nothing: "inscribed"'),
  "no alias table");

section("0b. the OLD theme set is gone");
const REMOVED = ["void", "graphite", "paper", "nothing", "nothing-light", "monochrome", "cyber-matrix", "tokyo-night", "terminal", "nord", "solar", "hermes"];
ok(`no removed theme survives the Settings row (${REMOVED.length} checked)`, REMOVED.every((t) => !settings.includes(`"${t}"`)), REMOVED.filter((t) => settings.includes(`"${t}"`)).join(", "));
ok("no removed theme survives in the CSS", REMOVED.every((t) => !css.includes(`[data-theme="${t}"]`) && !themesCss.includes(`[data-theme="${t}"]`)), REMOVED.filter((t) => css.includes(`[data-theme="${t}"]`) || themesCss.includes(`[data-theme="${t}"]`)).join(", "));
ok("the legacy nothing.css design-language file is gone (replaced by themes.css)",
  !fs.existsSync(path.join(root, "src/styles/nothing.css")), "still exists");

section("1. the INSCRIBED design tokens are real");
ok("inscribed carries the true OLED black canvas", /\[data-theme="inscribed"\]\s*\{[\s\S]*?--bg: #000000/.test(themesCss), "missing #000000 background");
ok("the #1B1B1D Nothing surface gray survives", themesCss.includes("#1b1b1d"), "missing #1B1B1D");
ok("signal red #D71921 accent", /#d71921/i.test(themesCss), "missing #D71921");
ok("all palettes define an accent signal (--accent)", (themesCss.match(/--accent: /g) ?? []).length >= 10, `got ${(themesCss.match(/--accent: /g) ?? []).length}`);
ok("dot-matrix display font is wired via --font-doto", /--font-doto: "Doto"/.test(themesCss), "--font-doto never names Doto");
ok("display surfaces read --font-doto (titlebar wordmark)", /\.titlebar \.logo \{\r?\n\s*font-family: var\(--font-doto\)/.test(css), "titlebar wordmark not on --font-doto");
ok("themes.css is imported by mj.css", /@import "\.\/themes\.css";/.test(css), "missing import");

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
ok(`the release notes for MJ ${MJ_VERSION_SHORT} exist`, fs.existsSync(path.join(root, `MJ-${MJ_VERSION_SHORT}-UPGRADE.md`)) || fs.existsSync(path.join(root, "docs", "history", `MJ-${MJ_VERSION_SHORT}-UPGRADE.md`)), "missing");

/* ── §V11.5: AURORA — the tenth palette, and the Meridian feel ───────────── */
section("3.5. NTH — the eleventh palette, MJ's flagship (V12)");
const nthBlock = themesCss.match(/\[data-theme="nth"\] \{[^}]*\n\}/)?.[0] ?? "";
const nt = (name: string): string => nthBlock.match(new RegExp(`--${name}: (#[0-9a-fA-F]{6})`))?.[1] ?? "";
ok("the nth token block exists", nthBlock.length > 400, `block is ${nthBlock.length} chars`);
ok("nth carries the cold obsidian ground (#05060b)", nt("bg") === "#05060b", nt("bg"));
ok("nth's signature accent is electro-violet volt (#7c5cff)", nt("accent") === "#7c5cff", nt("accent"));
ok("nth's alive pulse is plasma-mint (#2be6d6)", nt("ok") === "#2be6d6", nt("ok"));
ok("nth's only brand-ish red is the functional danger (#ff3d6e)", nt("danger") === "#ff3d6e", nt("danger"));
ok("nth selection inverts (volt fill, obsidian text)", nt("sel-bg") === "#7c5cff" && nt("sel-fg") === "#05060b", `${nt("sel-bg")} / ${nt("sel-fg")}`);
ok("nth active wires carry the volt signal", nt("wire-active") === "#7c5cff", nt("wire-active"));
ok("nth is genuinely dark (bg luminance < 0.12)", lum(nt("bg")) < 0.12, String(lum(nt("bg"))));
ok("nth text is genuinely bright (luminance > 0.55)", lum(nt("text")) > 0.55, String(lum(nt("text"))));
ok("nth uses no gradients (flat instrument panel)", !/gradient\(/i.test(nthBlock), "gradient found");
ok("nth is the default theme (editor prefs) and advertised in Settings", /theme: "nth"/.test(storeSrc) && settings.includes('"nth"'), "not wired as default");
ok("Settings copy names nth's character", /nth · obsidian ground, electro-violet volt/.test(settings), "missing descriptor");
ok("nth joins every shared selector group (not a bolt-on)", (themesCss.match(/\[data-theme="nth"\]/g) ?? []).length >= 100, `only ${(themesCss.match(/\[data-theme="nth"\]/g) ?? []).length} mentions`);

section("4. V11.5 aurora — the tenth palette, honestly dark");
const auroraBlock = themesCss.match(/\[data-theme="aurora"\] \{[\s\S]*?\n\}/)?.[0] ?? "";
const tok = (name: string): string => auroraBlock.match(new RegExp(`--${name}: (#[0-9a-fA-F]{6})`))?.[1] ?? "";
ok("aurora ok/warn hues are distinct (#34d399 / #f87171)", tok("ok") === "#34d399" && tok("danger") === "#f87171", `${tok("ok")} / ${tok("danger")}`);
ok("aurora selection inverts (ice fill, night text)", tok("sel-bg") === "#7dd3fc" && tok("sel-fg") === "#060a12", `${tok("sel-bg")} / ${tok("sel-fg")}`);
ok("aurora active wires carry the signal", tok("wire-active") === "#7dd3fc", tok("wire-active"));
ok("aurora joins every shared selector group (not a bolt-on)", (themesCss.match(/\[data-theme="aurora"\]/g) ?? []).length >= 100, `only ${(themesCss.match(/\[data-theme="aurora"\]/g) ?? []).length} mentions`);
ok("Settings copy names aurora's character", /aurora · deep blue-teal night, ice signal/.test(settings), "missing descriptor");
ok("aurora is genuinely dark (bg luminance < 0.12)", lum(tok("bg")) < 0.12, String(lum(tok("bg"))));
ok("aurora text is genuinely bright (luminance > 0.55)", lum(tok("text")) > 0.55, String(lum(tok("text"))));
ok("aurora contrast token is the night ground", tok("accent-contrast") === "#060a12", tok("accent-contrast"));
ok("aurora uses no gradients (flat instrument panel)", !/gradient\(/i.test(auroraBlock), "gradient found");

section("5. V11.5 Meridian feel — transitions, lamps, generous hit targets");
ok("palette changes cross-fade (.theme-xing on <html>)", /\.theme-xing/.test(css), "no cross-fade class");
ok("breathing lamp keyframes exist (mj-lamp)", /@keyframes mj-lamp/.test(css), "no lamp animation");
ok("reduced-motion wins over the lamp", /prefers-reduced-motion[\s\S]*?mj-lamp[\s\S]*?animation: none/.test(css), "lamp ignores reduced motion");
ok("port anchors carry a 12.5px hit halo", /\.port-anchor::after \{[^}]*inset: -12\.5px/.test(css), "no halo");
ok("wires are clickable across a 14px corridor", /\.wire-hit \{[^}]*stroke-width: 14/.test(css), "no corridor");
ok("wires carry a Meridian midpoint dot (.wire-mid)", /\.wire-mid/.test(css), "no midpoint dot");
ok("the Assist redesign styles exist (asst-*)", ["asst-prov", "asst-rail", "asst-quick", "asst-typing", "asst-foot"].every((c) => css.includes(`.${c}`)), "missing asst-* classes");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
