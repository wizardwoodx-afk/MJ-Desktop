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
import { MJ_VERSION, MJ_VERSION_SHORT, MJ_TITLE } from "../src/version";

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
ok("MJ_VERSION looks like a semver release", /^\d+\.\d+\.\d+$/.test(MJ_VERSION), MJ_VERSION);
ok("MJ_VERSION_SHORT is the major.minor of MJ_VERSION", MJ_VERSION_SHORT === MJ_VERSION.split(".").slice(0, 2).join("."), `${MJ_VERSION} -> ${MJ_VERSION_SHORT}`);
ok("MJ_TITLE names the short version", MJ_TITLE === `MJ ${MJ_VERSION_SHORT}`, MJ_TITLE);

section("1. every manifest states the same version");
const pkg = json<{ name: string; version: string }>("package.json");
const lock = json<{ version: string; name?: string; packages: Record<string, { version?: string; name?: string }> }>("package-lock.json");
const cargo = read("src-tauri/Cargo.toml");
const tauriConf = json<{ version: string; productName: string; identifier: string }>("src-tauri/tauri.conf.json");

ok(`package.json is ${MJ_VERSION}`, pkg.version === MJ_VERSION, pkg.version);
ok(`package-lock.json top-level is ${MJ_VERSION}`, lock.version === MJ_VERSION, lock.version);
ok(`package-lock.json packages[""] is ${MJ_VERSION}`, lock.packages[""]?.version === MJ_VERSION, lock.packages[""]?.version ?? "missing");
ok("the lock file describes the same package as package.json", lock.packages[""]?.name === pkg.name, `${lock.packages[""]?.name} vs ${pkg.name}`);
ok(`Cargo.toml is ${MJ_VERSION}`, new RegExp(`^version\\s*=\\s*"${MJ_VERSION.replace(/\./g, "\\.")}"`, "m").test(cargo), (cargo.match(/^version\s*=\s*"[^"]+"/m) ?? ["none"])[0]);
ok(`tauri.conf.json is ${MJ_VERSION}`, tauriConf.version === MJ_VERSION, tauriConf.version);

section("2. the app imports the version instead of hardcoding it");
const ipcClient = read("src/ipc/client.ts");
const settings = read("src/pages/SettingsPage.tsx");
ok("ipc/client.ts imports MJ_VERSION", /from "\.\.\/version"/.test(ipcClient) && /MJ_VERSION/.test(ipcClient), "no import found");
ok("SettingsPage imports MJ_VERSION", /from "\.\.\/version"/.test(settings) && /MJ_VERSION/.test(settings), "no import found");
ok("no hardcoded release string survives in ipc/client.ts", !/version:\s*"\d+\.\d+\.\d+"/.test(ipcClient), (ipcClient.match(/version:\s*"\d+\.\d+\.\d+"/) ?? [""])[0]);
ok("no hardcoded release string survives in SettingsPage", !/MJ \d+\.\d+/.test(settings), (settings.match(/MJ \d+\.\d+/) ?? [""])[0]);

section("3. the shipped documents name the current release");
const docs = ["README.md", "DESKTOP-NATIVE.md", "INSTALL-ON-LAPTOP.md", "LOCAL-WORKLIST.md"];
for (const doc of docs) {
  const firstLine = read(doc).split("\n")[0] ?? "";
  // The title must not name a release older than this one. A historical "what changed vs 4.0" file is
  // allowed to mention old numbers in its body, so only the title line is checked.
  const stale = firstLine.match(/MJ (\d+\.\d+)/);
  ok(`${doc} title does not name a stale release`, stale === null || stale[1] === MJ_VERSION_SHORT, firstLine.slice(0, 70));
}

section("4. the archive name the user is given matches the release");
const upgradeDoc = `MJ-${MJ_VERSION_SHORT}-UPGRADE.md`;
ok(`${upgradeDoc} exists`, fs.existsSync(path.join(root, upgradeDoc)), "missing — the release notes for this version were never written");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
