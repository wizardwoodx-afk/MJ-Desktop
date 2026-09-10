/**
 * Version drift probe.
 *
 * The V9 review found `package.json` at 9.0.0 while `package-lock.json` still said 6.0.0 and the app's
 * own settings page said "MJ 4.0". Nothing broke, so nothing caught it. This probe makes the same
 * mistake impossible to ship: every manifest and every in-app version string must agree with
 * `src/version.ts`, and any leftover literal release number in the UI layer is a failure.
 *
 * Run: ./node_modules/.bin/esbuild probe/versionDrift.test.ts --bundle --platform=node --format=esm \
 *        --define:MJ_ROOT='"'$(pwd)'"' --outfile=/tmp/vd.mjs --log-level=error && node /tmp/vd.mjs
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { VH_VERSION, VH_SHORT, VH_TITLE } from "../src/version";

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

/**
 * The project root.
 *
 * This cannot be derived from `import.meta.dirname`: esbuild does not define it in the bundle, so it
 * is `undefined` and `path.resolve(undefined ?? ".", "..")` silently resolves to `/` — the probe then
 * crashes trying to read `/package.json`, which looks like a missing file rather than a broken probe.
 * esbuild injects `MJ_ROOT` at build time instead (see the command at the top of this file), with a
 * cwd-based fallback for anyone running it unbundled, and the result is verified below rather than
 * trusted.
 */
declare const MJ_ROOT: string | undefined;
const root = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0
  ? MJ_ROOT
  : path.resolve(process.cwd(), "package.json").startsWith("/home/user/mj") || fs.existsSync(path.join(process.cwd(), "package.json"))
    ? process.cwd()
    : path.resolve(__dirname ?? process.cwd(), "..");
if (!fs.existsSync(path.join(root, "package.json"))) {
  console.error(`versionDrift: cannot find the project root (looked in ${root}). Rebuild with --define:MJ_ROOT='"'$(pwd)'"'.`);
  process.exit(2);
}
console.log(`project root: ${root}`);
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf8");
const json = <T,>(p: string): T => JSON.parse(read(p)) as T;

section("0. the single source of truth is well formed");
ok("VH_VERSION looks like a semver release", /^\d+\.\d+\.\d+$/.test(VH_VERSION), VH_VERSION);
ok("VH_SHORT is the major.minor of VH_VERSION", VH_SHORT === VH_VERSION.split(".").slice(0, 2).join("."), `${VH_VERSION} -> ${VH_SHORT}`);
ok("VH_TITLE names the short version", VH_TITLE === `Vouch Harbor ${VH_SHORT}`, VH_TITLE);

section("1. every manifest states the same version");
const pkg = json<{ name: string; version: string }>("package.json");
const lock = json<{ version: string; name?: string; packages: Record<string, { version?: string; name?: string }> }>("package-lock.json");
const cargo = read("src-tauri/Cargo.toml");
const tauriConf = json<{ version: string; productName: string; identifier: string }>("src-tauri/tauri.conf.json");

ok(`package.json is ${VH_VERSION}`, pkg.version === VH_VERSION, pkg.version);
ok(`package-lock.json top-level is ${VH_VERSION}`, lock.version === VH_VERSION, lock.version);
ok(`package-lock.json packages[""] is ${VH_VERSION}`, lock.packages[""]?.version === VH_VERSION, lock.packages[""]?.version ?? "missing");
ok("the lock file describes the same package as package.json", lock.packages[""]?.name === pkg.name, `${lock.packages[""]?.name} vs ${pkg.name}`);
ok(`Cargo.toml is ${VH_VERSION}`, new RegExp(`^version\\s*=\\s*"${VH_VERSION.replace(/\./g, "\\.")}"`, "m").test(cargo), (cargo.match(/^version\s*=\s*"[^"]+"/m) ?? ["none"])[0]);
ok(`tauri.conf.json is ${VH_VERSION}`, tauriConf.version === VH_VERSION, tauriConf.version);

section("2. the app imports the version instead of hardcoding it");
const ipcClient = read("src/ipc/client.ts");
const settings = read("src/pages/SettingsPage.tsx");
ok("ipc/client.ts imports VH_VERSION", /from "\.\.\/version"/.test(ipcClient) && /VH_VERSION/.test(ipcClient), "no import found");
ok("SettingsPage imports VH_VERSION", /from "\.\.\/version"/.test(settings) && /VH_VERSION/.test(settings), "no import found");
ok("no hardcoded release string survives in ipc/client.ts", !/version:\s*"\d+\.\d+\.\d+"/.test(ipcClient), (ipcClient.match(/version:\s*"\d+\.\d+\.\d+"/) ?? [""])[0]);
ok("no hardcoded release string survives in SettingsPage", !/MJ \d+\.\d+/.test(settings), (settings.match(/MJ \d+\.\d+/) ?? [""])[0]);

section("3. the shipped documents name the current release");
const OPERATIONAL_DOCS = ["README.md", "BUILD-NATIVE.md", "DESKTOP-NATIVE.md", "INSTALL-ON-LAPTOP.md", "DEPLOY-VERCEL.md", "docs/PLATFORM-LIMITS.md"];
const docs = [...OPERATIONAL_DOCS];
for (const doc of docs) {
  const firstLine = read(doc).split("\n")[0] ?? "";
  // 11.14.11 — the title check is now PATCH-aware. It used to compare only the MJ X.Y short
  // form, so "MJ 11.14.1" passed while the release was 11.14.11: DESKTOP-NATIVE.md and
  // INSTALL-ON-LAPTOP.md shipped titles three releases old with versionDrift still green.
  const stale = firstLine.match(/MJ (\d+\.\d+)/);
  const staleFull = firstLine.match(/MJ (\d+\.\d+\.\d+)/);
  ok(`${doc} title does not name a stale release`, stale === null || stale[1] === VH_SHORT, firstLine.slice(0, 70));
  ok(`${doc} title carries the exact release patch (${VH_VERSION})`,
    staleFull === null || staleFull[1] === VH_VERSION,
    staleFull ? `title says ${staleFull[1]}` : "title names no full version");
}

// 11.14.11 — the BODY scan. The title check alone let old installer names through
// (BUILD-NATIVE.md named MJ_8.0.0 artifacts; INSTALL-ON-LAPTOP.md named MJ_11.0.0). Operational
// docs are the files a user follows to BUILD and INSTALL the current release — they must not
// name any other release, except as pointers to history files where old numbers are facts.
for (const doc of OPERATIONAL_DOCS) {
  let body = read(doc)
    // mask pointers to history/upgrade files: their filenames legitimately carry old versions
    .replace(/docs\/history\/MJ-[0-9.]+[-A-Za-z0-9_]*\.md/g, "")
    .replace(/\bMJ-[0-9]+\.[0-9]+\.[0-9]+-[A-Za-z0-9-]*\.md\b/g, "");
  const staleTokens = [...new Set(
    [...body.matchAll(/MJ[ _-]?(\d+\.\d+\.\d+)/g)].map((m) => m[1]).filter((v) => v !== VH_VERSION),
  )];
  ok(`${doc} names no release other than ${VH_VERSION} in its body`,
    staleTokens.length === 0, `stale: ${staleTokens.join(", ")}`);
}

section("4. the archive name the user is given matches the release");
const upgradeDoc = `VH-${VH_SHORT}-UPGRADE.md`;
ok(`${upgradeDoc} exists`, fs.existsSync(path.join(root, upgradeDoc)) || fs.existsSync(path.join(root, "docs", "history", upgradeDoc)), "missing — the release notes for this version were never written");

/* ── 5. CI can still allocate a runner (MJ 11.8.5) ────────────────────────────
 *
 * A workflow that cannot allocate a runner verifies nothing, and a CI badge nobody can
 * reproduce is decoration. Runner images retire on a published schedule and nothing else in
 * this suite would notice: version strings would still agree, bundles would still be
 * byte-identical, and every probe would still pass — on a pipeline GitHub refuses to start.
 *
 * Retirement status at the time of writing (2026-09-03):
 *   macos-12       support ended 2024-12-03
 *   macos-13       support ended 2025-12-04   <- was in release.yml until 11.8.5
 *   macos-14       deprecated, brownouts 2026-10-29..31, unsupported 2026-11-02
 *   ubuntu-20.04   support ended 2025-04-15
 *   ubuntu-22.04   active support ends 2026-09-17
 */
section("5. CI targets runners that still exist");

const wfDir = path.join(root, ".github", "workflows");
const workflowFiles = fs.existsSync(wfDir)
  ? fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).sort()
  : [];
ok(`workflows exist (${workflowFiles.length} file(s))`, workflowFiles.length > 0, ".github/workflows is empty or missing");

const RETIRED_RUNNERS = ["macos-12", "macos-13", "macos-14", "ubuntu-20.04", "ubuntu-22.04"];
const retiredHits: string[] = [];
for (const wf of workflowFiles) {
  const src = read(path.join(".github", "workflows", wf));
  // A comment may NAME a retired label to explain why it is banned — only executable lines count.
  const executable = src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const labels: string[] = [];
  for (const m of executable.matchAll(/runs-on:\s*(\S+)/g)) labels.push(m[1]);
  for (const m of executable.matchAll(/^[\t ]*-[\t ]*os:[\t ]*(\S+)/gm)) labels.push(m[1]);
  for (const raw of labels) {
    const label = raw.replace(/["']/g, "");
    if (RETIRED_RUNNERS.some((r) => label === r || label.startsWith(`${r}-`))) {
      retiredHits.push(`${wf} -> ${label}`);
    }
  }
}
ok(
  `no workflow targets a retired runner (${RETIRED_RUNNERS.length} banned labels)`,
  retiredHits.length === 0,
  retiredHits.join(" | ") || "all labels current",
);

const releaseWf = read(".github/workflows/release.yml");
ok(`releaseBody names ${upgradeDoc}`, releaseWf.includes(upgradeDoc), "the release notes link to the wrong version");
ok(
  "the release gate runs the SAME suite CI runs (npm test, not a subset)",
  /npm test/.test(releaseWf) && !/for f in versionDrift/.test(releaseWf),
  "release.yml still gates on a hand-picked subset",
);

/* ── 6. README counts match the code (MJ 11.9.4-fix) ─────────────────────────
 *
 * The 11.9.4 audit found the README layout comment naming "92 Tauri commands"
 * while src-tauri/ actually shipped 94 `#[tauri::command]`s. Nothing broke, so
 * nothing caught it — the same disease as the V9 version drift, one layer up:
 * prose counts rot exactly like version strings rot. Suite counts, harness
 * counts and bundle counts are already held by probe-list.mjs, the harnesses
 * probe and the offlinePack manifest; the Tauri command count had no holder.
 * Now the README's number is asserted against the Rust source, so a renamed,
 * added or removed command fails the gate until the doc is updated with it.
 */
section("6. README counts match the code");

const rustFiles = fs.readdirSync(path.join(root, "src-tauri", "src")).filter((f) => f.endsWith(".rs")).sort();
let commandCount = 0;
for (const f of rustFiles) {
  for (const line of read(path.join("src-tauri", "src", f)).split("\n")) {
    // Only attribute lines count; a comment that quotes the attribute must not.
    if (line.trim().startsWith("#[tauri::command]")) commandCount += 1;
  }
}
const readmeLayout = read("README.md");
const readmeCount = readmeLayout.match(/#\s*(\d+)\s+Tauri commands/);
ok(
  `README layout names the real Tauri command count (${commandCount} across ${rustFiles.length} rust files)`,
  readmeCount === null || Number(readmeCount[1]) === commandCount,
  readmeCount === null ? "README no longer names a count" : `README says ${readmeCount[1]}, code has ${commandCount}`,
);

// 11.9.4(Major): the suite/bundle counts rot the same way. probe/ is enumerated
// exactly as tools/probe-list.mjs does (same filter, same sort), and the offline
// pack by construction bundles every suite except offlinePack itself.
const suiteFiles = fs
  .readdirSync(path.join(root, "probe"))
  .filter((f) => (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) && !f.startsWith("."))
  .sort();
const readmeSuites = readmeLayout.match(/#\s*(\d+)\s+suites\s*$/m);
ok(
  `README run-it comment names the real probe suite count (${suiteFiles.length})`,
  readmeSuites === null || Number(readmeSuites[1]) === suiteFiles.length,
  readmeSuites === null ? "README no longer names a suite count" : `README says ${readmeSuites[1]}, probe/ has ${suiteFiles.length}`,
);
const manifest = json<{ suiteCount: number }>("verify/MANIFEST.json");
ok(
  `the offline pack holds every suite except itself (${suiteFiles.length - 1} bundles)`,
  manifest.suiteCount === suiteFiles.length - 1,
  `manifest ${manifest.suiteCount} vs probe/ ${suiteFiles.length}`,
);
const readmeBundles = readmeLayout.match(/(\d+)\s+bundles/);
ok(
  `README layout names the real bundle count (${manifest.suiteCount})`,
  readmeBundles === null || Number(readmeBundles[1]) === manifest.suiteCount,
  readmeBundles === null ? "README no longer names a bundle count" : `README says ${readmeBundles[1]}, pack has ${manifest.suiteCount}`,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
