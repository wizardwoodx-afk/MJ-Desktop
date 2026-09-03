import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/versionDrift.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/version.ts
var MJ_VERSION = "11.8.1";
var MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");
var MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;

// probe/versionDrift.test.ts
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
function section(name) {
  console.log(`
== ${name}`);
}
var root = ".".length > 0 ? "." : path.resolve(process.cwd(), "package.json").startsWith("/home/user/mj") || fs.existsSync(path.join(process.cwd(), "package.json")) ? process.cwd() : path.resolve(__dirname ?? process.cwd(), "..");
if (!fs.existsSync(path.join(root, "package.json"))) {
  console.error(`versionDrift: cannot find the project root (looked in ${root}). Rebuild with --define:MJ_ROOT='"'$(pwd)'"'.`);
  process.exit(2);
}
console.log(`project root: ${root}`);
var read = (p) => fs.readFileSync(path.join(root, p), "utf8");
var json = (p) => JSON.parse(read(p));
section("0. the single source of truth is well formed");
ok("MJ_VERSION looks like a semver release", /^\d+\.\d+\.\d+$/.test(MJ_VERSION), MJ_VERSION);
ok("MJ_VERSION_SHORT is the major.minor of MJ_VERSION", MJ_VERSION_SHORT === MJ_VERSION.split(".").slice(0, 2).join("."), `${MJ_VERSION} -> ${MJ_VERSION_SHORT}`);
ok("MJ_TITLE names the short version", MJ_TITLE === `MJ ${MJ_VERSION_SHORT}`, MJ_TITLE);
section("1. every manifest states the same version");
var pkg = json("package.json");
var lock = json("package-lock.json");
var cargo = read("src-tauri/Cargo.toml");
var tauriConf = json("src-tauri/tauri.conf.json");
ok(`package.json is ${MJ_VERSION}`, pkg.version === MJ_VERSION, pkg.version);
ok(`package-lock.json top-level is ${MJ_VERSION}`, lock.version === MJ_VERSION, lock.version);
ok(`package-lock.json packages[""] is ${MJ_VERSION}`, lock.packages[""]?.version === MJ_VERSION, lock.packages[""]?.version ?? "missing");
ok("the lock file describes the same package as package.json", lock.packages[""]?.name === pkg.name, `${lock.packages[""]?.name} vs ${pkg.name}`);
ok(`Cargo.toml is ${MJ_VERSION}`, new RegExp(`^version\\s*=\\s*"${MJ_VERSION.replace(/\./g, "\\.")}"`, "m").test(cargo), (cargo.match(/^version\s*=\s*"[^"]+"/m) ?? ["none"])[0]);
ok(`tauri.conf.json is ${MJ_VERSION}`, tauriConf.version === MJ_VERSION, tauriConf.version);
section("2. the app imports the version instead of hardcoding it");
var ipcClient = read("src/ipc/client.ts");
var settings = read("src/pages/SettingsPage.tsx");
ok("ipc/client.ts imports MJ_VERSION", /from "\.\.\/version"/.test(ipcClient) && /MJ_VERSION/.test(ipcClient), "no import found");
ok("SettingsPage imports MJ_VERSION", /from "\.\.\/version"/.test(settings) && /MJ_VERSION/.test(settings), "no import found");
ok("no hardcoded release string survives in ipc/client.ts", !/version:\s*"\d+\.\d+\.\d+"/.test(ipcClient), (ipcClient.match(/version:\s*"\d+\.\d+\.\d+"/) ?? [""])[0]);
ok("no hardcoded release string survives in SettingsPage", !/MJ \d+\.\d+/.test(settings), (settings.match(/MJ \d+\.\d+/) ?? [""])[0]);
section("3. the shipped documents name the current release");
var docs = ["README.md", "DESKTOP-NATIVE.md", "INSTALL-ON-LAPTOP.md", "LOCAL-WORKLIST.md"];
for (const doc of docs) {
  const firstLine = read(doc).split("\n")[0] ?? "";
  const stale = firstLine.match(/MJ (\d+\.\d+)/);
  ok(`${doc} title does not name a stale release`, stale === null || stale[1] === MJ_VERSION_SHORT, firstLine.slice(0, 70));
}
section("4. the archive name the user is given matches the release");
var upgradeDoc = `MJ-${MJ_VERSION_SHORT}-UPGRADE.md`;
ok(`${upgradeDoc} exists`, fs.existsSync(path.join(root, upgradeDoc)), "missing \u2014 the release notes for this version were never written");
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
