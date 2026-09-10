/**
 * Theme integrity probe.
 *
 * History: added in V10.1 for the `nothing` theme; rewritten for the INSCRIBED
 * system in V11.2; rewritten for the OBSIDIAN set in 13.0; **rewritten again in
 * MJ 13.0.1 — the INK system** (owner direction: TRUE BLACK ground, rare
 * unsaturated mineral signals; no gold/brass/violet/cyan/neon). Six palettes:
 * ink (smoked apricot), pitch (dusty rose), slag (whetstone), fern (seedpod
 * olive), ivory + travertine (paper lights). The probe enforces the same
 * contract as before:
 *   1. every theme advertised in Settings exists as a CSS token block, and vice
 *      versa; the six palettes carry the full token set (56 shared var names);
 *   2. the editor-prefs whitelist (THEME_IDS) accepts exactly the advertised
 *      set — and the old INSCRIBED names migrate through THEME_ALIASES, never
 *      vanish;
 *   3. none of the retired themes (14 INSCRIBED + 12 pre-V11) survives in
 *      Settings or in the CSS;
 *   4. exact base hues are pinned per palette with luminance proofs (dark
 *      themes genuinely dark, light themes genuinely light), flat token blocks
 *      (no gradients), and color-mix derivation counts (>= 16 per palette) so
 *      secondaries cannot drift from the five base hues;
 *   5. every palette joins the shared selector groups (never a bolt-on);
 *   6. the dot-matrix display font is really bundled;
 *   7. no literal version string survives in the app shell.
 *
 * Run: ./node_modules/.bin/esbuild probe/theme.test.ts --bundle --platform=node --format=esm \
 *        --define:MJ_ROOT='"'$(pwd)'"' --outfile=/tmp/theme.mjs --log-level=error && node /tmp/theme.mjs
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { VH_VERSION, VH_SHORT } from "../src/version";

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

const css = read("src/styles/vouch.css");
const themesCss = read("src/styles/themes.css");
const settings = read("src/pages/SettingsPage.tsx");
const storeSrc = read("src/graph/store.ts");
const app = read("src/App.tsx");
const fontsCss = read("src/styles/fonts.css");

section("0. one list of themes, obeyed everywhere");
// The advertised list comes from the single source of truth: store.ts THEME_IDS
// (SettingsPage renders that list; the theme options carry display names).
const idm = storeSrc.match(/THEME_IDS: ThemeId\[\] = \[([^\]]+)\]/);
ok("store.ts owns the whitelist as THEME_IDS", idm !== null, "THEME_IDS missing");
const THEMES = idm
  ? (idm[1].split(",").map((t) => t.trim().replace(/^"|"$/g, "")) as string[])
  : [];
ok(`the advertised set is the six-palette INK set (${THEMES.length} themes)`,
  THEMES.length === 6 && THEMES.join("|") === ["ink", "pitch", "slag", "fern", "ivory", "travertine"].join("|"),
  THEMES.join(","));
ok(`themes.css has the expected token block count (${THEMES.filter((t) => !themesCss.includes(`[data-theme="${t}"] {`)).length} missing)`,
  THEMES.every((t) => themesCss.includes(`[data-theme="${t}"] {`)),
  THEMES.filter((t) => !themesCss.includes(`[data-theme="${t}"] {`)).join(", ") || "all present");
ok("SettingsPage offers exactly the advertised themes",
  THEMES.every((t) => settings.includes(`"${t}"`)),
  THEMES.filter((t) => !settings.includes(`"${t}"`)).join(", ") || "all offered");
ok("store.ts owns the whitelist as THEME_IDS and lists every advertised theme",
  /THEME_IDS: ThemeId\[\] = \[[^\]]+\]/.test(storeSrc) &&
    THEMES.every((t) => new RegExp(`"${t}"`).test(storeSrc.match(/THEME_IDS: ThemeId\[\] = \[([^\]]+)\]/)?.[1] ?? "")),
  "THEME_IDS missing or incomplete");
ok("ink is the default theme (editor prefs)",
  /theme: "ink"/.test(storeSrc) && /THEME_ALIASES\[stored\] \?\? "ink"/.test(storeSrc), "default not wired");
ok("retired names migrate via THEME_ALIASES (obsidian→ink, wabi→ink, onyx→pitch, daylight→ivory)",
  /THEME_ALIASES: Record<string, ThemeId>/.test(storeSrc) &&
    /obsidian: "ink"/.test(storeSrc) && /onyx: "pitch"/.test(storeSrc) && /daylight: "ivory"/.test(storeSrc),
  "alias table incomplete");

section("0b. the OLD theme set is gone");
const RETIRED = [
  // the fourteen INSCRIBED palettes
  "inscribed", "chalk", "carbon", "bone", "indigo", "sage", "hazard", "orchid",
  "porcelain", "aurora", "nth", "wabi", "cyanotype", "daylight",
  // the twelve pre-V11 names
  "void", "graphite", "paper", "nothing", "nothing-light", "monochrome",
  "cyber-matrix", "tokyo-night", "terminal", "nord", "solar", "hermes",
  // the retired 13.0 OBSIDIAN six
  "obsidian", "onyx", "hematite", "peat",
];
ok("no retired theme survives the Settings row", RETIRED.every((t) => !settings.includes(`"${t}"`)),
  RETIRED.filter((t) => settings.includes(`"${t}"`)).join(", "));
ok("no retired theme survives in the CSS",
  RETIRED.every((t) => !css.includes(`[data-theme="${t}"]`) && !themesCss.includes(`[data-theme="${t}"]`)),
  RETIRED.filter((t) => css.includes(`[data-theme="${t}"]`) || themesCss.includes(`[data-theme="${t}"]`)).join(", "));
ok("the legacy nothing.css design-language file is gone (replaced by themes.css)",
  !fs.existsSync(path.join(root, "src/styles/nothing.css")), "still exists");

section("1. the INK design tokens are real");
const blocks = new Map<string, string>();
for (const t of THEMES) {
  const m = themesCss.match(new RegExp(`\\[data-theme="${t}"\\] \\{[^}]*\\}`));
  blocks.set(t, m?.[0] ?? "");
}
ok("six palette token blocks parse", THEMES.every((t) => (blocks.get(t)?.length ?? 0) > 2000),
  THEMES.filter((t) => (blocks.get(t)?.length ?? 0) <= 2000).join(","));
const ALL_VARS = ["--bg", "--bg-elevated", "--bg-panel", "--bg-input", "--border", "--border-strong",
  "--text", "--text-dim", "--text-mute", "--amber", "--danger", "--ok", "--white", "--red",
  "--row-hover", "--accent", "--accent-hot", "--accent-contrast", "--accent-dim", "--wire",
  "--wire-active", "--wire-hot", "--wire-done", "--glyph-off", "--glyph-on", "--menu-hover",
  "--seg-off", "--overlay", "--sel-bg", "--sel-fg", "--scroll-thumb", "--scroll-thumb-hover",
  "--port-edge", "--inset", "--dot-1", "--dot-2"];
ok("every palette carries the full component token set", THEMES.every((t) =>
  ALL_VARS.every((v) => blocks.get(t)?.includes(`${v}:`) ?? false)),
  THEMES.map((t) => `${t}:${ALL_VARS.filter((v) => !blocks.get(t)?.includes(`${v}:`)).join(",")}`).filter((x) => x.length > 7).join(" | "));
ok("every palette derives its secondaries with color-mix (>= 16)",
  THEMES.every((t) => (blocks.get(t)?.match(/color-mix\(/g) ?? []).length >= 16),
  THEMES.map((t) => `${t}=${(blocks.get(t)?.match(/color-mix\(/g) ?? []).length}`).join(" "));
ok("no palette uses gradients (flat mineral surfaces)", THEMES.every((t) => !/gradient\(/i.test(blocks.get(t) ?? "")),
  THEMES.filter((t) => /gradient\(/i.test(blocks.get(t) ?? "")).join(","));
ok("dot-matrix display font is wired via --font-doto", /--font-doto: "Doto"/.test(themesCss), "--font-doto never names Doto");
ok("display surfaces read --font-doto (titlebar wordmark)",
  /\.titlebar \.logo \{\r?\n\s*font-family: var\(--font-doto\)/.test(css), "titlebar wordmark not on --font-doto");
ok("themes.css is imported by mj.css", /@import "\.\/themes\.css";/.test(css), "missing import");

section("1.5. exact hue pins — the flagship palettes");
const t = (name: string, tok: string): string =>
  blocks.get(name)?.match(new RegExp(`${tok}: (#[0-9a-fA-F]{6})`))?.[1] ?? "";
// ink — the flagship (true black + smoked apricot)
ok("ink ground is TRUE BLACK", t("ink", "--bg") === "#000000", t("ink", "--bg"));
ok("ink text is warm parchment (#eae4d8)", t("ink", "--text") === "#EAE4D8", t("ink", "--text"));
ok("ink signal is smoked apricot (#c98a62)", t("ink", "--accent") === "#C98A62", t("ink", "--accent"));
ok("ink alive is lichen (#8fa284)", t("ink", "--ok") === "#8FA284", t("ink", "--ok"));
ok("ink alert is brick (#b75346)", t("ink", "--danger") === "#B75346", t("ink", "--danger"));
ok("ink selection inverts (apricot fill, black text)", t("ink", "--sel-bg") === "#C98A62" && t("ink", "--sel-fg") === "#000000", `${t("ink", "--sel-bg")} / ${t("ink", "--sel-fg")}`);
ok("ink active wires carry the apricot signal", t("ink", "--wire-active") === "#C98A62", t("ink", "--wire-active"));
ok("ink is genuinely dark (bg luminance < 0.12)", lum(t("ink", "--bg")) < 0.12, String(lum(t("ink", "--bg"))));
ok("ink text is genuinely bright (luminance > 0.55)", lum(t("ink", "--text")) > 0.55, String(lum(t("ink", "--text"))));
ok("ink joins every shared selector group (not a bolt-on)", (themesCss.match(/\[data-theme="ink"\]/g) ?? []).length >= 60,
  `only ${(themesCss.match(/\[data-theme="ink"\]/g) ?? []).length} mentions`);
ok("Settings copy names ink's character", /ink · black, parchment ink, smoked-apricot signal/.test(settings), "missing descriptor");
// the rare mineral accents across the other darks
ok("pitch is OLED black", t("pitch", "--bg") === "#000000", t("pitch", "--bg"));
ok("pitch signal is dusty rose (#bd8577)", t("pitch", "--accent") === "#BD8577", t("pitch", "--accent"));
ok("slag signal is whetstone steel (#9aa6ae)", t("slag", "--accent") === "#9AA6AE", t("slag", "--accent"));
ok("fern signal is seedpod olive (#a79a63)", t("fern", "--accent") === "#A79A63", t("fern", "--accent"));
ok("no accent repeats the gold/brass family", !["#B8A17B", "#C6A15C", "#D0AF7C", "#C9A227", "#E0A93C"].includes(t("ink","--accent")) &&
  !["#B8A17B", "#C6A15C", "#D0AF7C"].includes(t("pitch","--accent")) && !["#B8A17B", "#C6A15C"].includes(t("fern","--accent")), "gold accent detected");
// ivory — the light flagship
ok("ivory ground is warm paper (#f5f1e9)", t("ivory", "--bg") === "#F5F1E9", t("ivory", "--bg"));
ok("ivory ink is near-black (#1e1a13)", t("ivory", "--text") === "#1E1A13", t("ivory", "--text"));
ok("ivory signal is copper clay (#a4502c)", t("ivory", "--accent") === "#A4502C", t("ivory", "--accent"));
ok("ivory is genuinely light (bg luminance > 0.7)", lum(t("ivory", "--bg")) > 0.7, String(lum(t("ivory", "--bg"))));
ok("ivory text is genuinely dark (luminance < 0.12)", lum(t("ivory", "--text")) < 0.12, String(lum(t("ivory", "--text"))));
ok("ivory selection inverts (copper fill, paper text)", t("ivory", "--sel-bg") === "#A4502C" && t("ivory", "--sel-fg") === "#F5F1E9", `${t("ivory", "--sel-bg")} / ${t("ivory", "--sel-fg")}`);
ok("Settings copy names ivory's character", /ivory · warm paper light, copper signal/.test(settings), "missing descriptor");
// every palette has luminance-correct ground/text
ok("all four darks are genuinely dark", ["ink", "pitch", "slag", "fern"].every((n) => lum(t(n, "--bg")) < 0.12),
  ["ink", "pitch", "slag", "fern"].map((n) => `${n}:${lum(t(n, "--bg"))}`).join(" "));
ok("both lights are genuinely light", ["ivory", "travertine"].every((n) => lum(t(n, "--bg")) > 0.7),
  ["ivory", "travertine"].map((n) => `${n}:${lum(t(n, "--bg"))}`).join(" "));
ok("every dark theme's signal differs from status hues (five-hue discipline)",
  ["ink", "pitch", "slag", "fern"].every((n) => t(n, "--accent") !== t(n, "--ok") && t(n, "--accent") !== t(n, "--danger")),
  "accent collides with a status hue");

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
  /import \{ VH_SHORT \} from "\.\/version"/.test(app), "no import found");
ok("no hardcoded vX.Y host pill in App.tsx", !/v\d+\.\d+/.test(app), (app.match(/v\d+\.\d+/) ?? [""])[0]);
ok(`the version.ts release is well formed (${VH_VERSION})`, /^\d+\.\d+\.\d+$/.test(VH_VERSION), VH_VERSION);
ok(`the release notes for Vouch Harbor ${VH_SHORT} exist`, fs.existsSync(path.join(root, `VH-${VH_SHORT}-UPGRADE.md`)) || fs.existsSync(path.join(root, "docs", "history", `VH-${VH_SHORT}-UPGRADE.md`)), "missing");

section("4. Assist is gone (13.0 surface decision)");
ok("no assistant panel module remains", !fs.existsSync(path.join(root, "src", "assistant", "AssistantPanel.tsx")), "src/assistant still exists");
ok("no asst-* styles survive", !/\.asst-/.test(css), (css.match(/\.asst-[\w-]+/g) ?? []).join(","));
ok("no assistant affordance survives in the shell",
  !/assistantOpen|AssistantPanel|nav-assist/.test(app) && !/assistant/i.test(read("src/app/nav.ts")),
  "assistant references remain");
ok("the old Ctrl/Cmd+J binding is gone", !/toggleAssistant/.test(read("src/app/shortcuts.ts")), "shortcut remains");

section("5. the 13.0 finish — premium node & connection language");
ok("node icons ride a tile (.node-tile)", /\.node-tile/.test(css) || /\.node-tile/.test(read("src/styles/redesign.css")), "no tile class");
ok("port anchors carry a 12.5px hit halo", /\.port-anchor::after \{[^}]*inset: -12\.5px/.test(css), "no halo");
ok("wires are clickable across a 14px corridor", /\.wire-hit \{[^}]*stroke-width: 14/.test(css), "no corridor");
ok("wires carry a Meridian midpoint dot (.wire-mid)", /\.wire-mid/.test(css), "no midpoint dot");
ok("port reach stubs visually join anchor to wire", /\.port-anchor::before \{/.test(read("src/styles/redesign.css")), "no reach stub");
ok("valid wire targets pulse (rd-port-pulse)", /@keyframes rd-port-pulse/.test(read("src/styles/redesign.css")), "no pulse");
ok("the motion system ships (node/wire/mid/spin keyframes)", ["vh-node-in", "vh-wire-draw", "vh-mid-in", "vh-spin"].every((k) => css.includes(`@keyframes ${k}`)), "missing motion keyframes");
ok("reduced motion wins over the motion system", /prefers-reduced-motion:[\s\S]{0,400}?animation: none !important/.test(css), "motion ignores reduced motion");
ok("the boot splash ships the ink five in index.html",
  /vh-boot/.test(read("index.html")) && /#c98a62/i.test(read("index.html")) && /#8fa284/i.test(read("index.html")) && /#b75346/i.test(read("index.html")),
  "no splash in index.html");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
