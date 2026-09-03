/**
 * MJ probe suite #40 — the offline verification pack (V11.7.1).
 *
 * The 11.7.0 review's one open caveat: "I am not independently certifying the claimed
 * 39/39 runtime test result" — the zip ships no node_modules and its environment could
 * not `npm ci` offline. V11.7.1 closes that with verify/: every probe suite (except this
 * one) pre-bundled into a self-contained .mjs, plus a zero-dependency runner
 * (verify/run.mjs), so anyone with Node reproduces the full gate with zero install.
 *
 * This suite is the pack's FRESHNESS GATE. It runs only under `npm test` (it needs the
 * dev toolchain — esbuild — which is exactly why it is not packed) and proves:
 *   1. COVERAGE — the pack contains exactly the other probe suites, nothing more or
 *      less, decided by the same shared module both runners use (tools/probe-list.mjs).
 *   2. FRESHNESS / ANTI-FABRICATION — a fresh rebuild of every bundle is BYTE-IDENTICAL
 *      to the committed verify/suites/*.mjs, and verify/MANIFEST.json's sha256s match
 *      the files on disk. A stale or hand-edited pack fails here, loudly.
 *   3. EXECUTABILITY — `node verify/run.mjs` actually runs, offline-style, and reports
 *      N/N passed.
 *
 * Run like every suite (see the command at the top of probe/harnesses.test.ts):
 *   esbuild probe/offlinePack.test.ts --bundle --platform=node --format=esm \
 *     --define:MJ_ROOT='"$(pwd)"' --outfile=/tmp/op.mjs --log-level=error && node /tmp/op.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildOfflinePack } from "../tools/build-offline-verify.mjs";
import { listProbeSuites } from "../tools/probe-list.mjs";

declare const MJ_ROOT: string | undefined;
const root = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}\n`);
}

/* ── 1. the pack exists and the runner is dependency-free ─────────────────────── */
section("1. the offline runner exists and needs nothing but Node");

const packDir = path.join(root, "verify", "suites");
const runnerPath = path.join(root, "verify", "run.mjs");
ok("verify/run.mjs exists", fs.existsSync(runnerPath), runnerPath);
const runnerSrc = fs.readFileSync(runnerPath, "utf8");
const runnerImports = [...runnerSrc.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
ok("the runner imports ONLY node: builtins (zero npm dependencies)",
  runnerImports.length > 0 && runnerImports.every((s) => s.startsWith("node:")),
  runnerImports.join(", "));
ok("the runner prints the OFFLINE VERIFY SUMMARY line the docs promise",
  runnerSrc.includes("OFFLINE VERIFY SUMMARY:"),
  "the summary format drifted from VERIFICATION.md");

/* ── 2. coverage — the pack is exactly the other probe suites ─────────────────── */
section("2. coverage — the pack is exactly the other probe suites");

const probeDir = path.join(root, "probe");
const expected = listProbeSuites(probeDir)
  .filter((f) => f !== "offlinePack.test.ts")
  .map((f) => f.replace(/\.(ts|tsx)$/, ".mjs"))
  .sort();
const packed = fs.readdirSync(packDir).filter((f) => f.endsWith(".mjs")).sort();
// Snapshot the pack BEFORE anything else runs: the pack is INPUT to this verification,
// never output. (The first version of this suite had a CLI guard that fired inside the
// bundle and rebuilt the pack mid-run — the comparison then checked a fresh build
// against itself. The mutation test caught it; this makes any in-run mutation of the
// pack a loud failure regardless of cause.)
const packHashBefore = new Map(packed.map((f) => [f, crypto.createHash("sha256").update(fs.readFileSync(path.join(packDir, f))).digest("hex")]));
ok(`the pack holds exactly the ${expected.length} non-self probe suites`,
  JSON.stringify(packed) === JSON.stringify(expected),
  `missing: ${expected.filter((e) => !packed.includes(e)).join(", ") || "none"}; extra: ${packed.filter((p) => !expected.includes(p)).join(", ") || "none"}`);
const devRunnerSrc = fs.readFileSync(path.join(root, "tools", "run-all-probes.mjs"), "utf8");
ok("the dev runner consumes the SAME shared suite list (no two truths)",
  devRunnerSrc.includes("listProbeSuites("),
  "run-all-probes.mjs does not use tools/probe-list.mjs");
const buildSrc = fs.readFileSync(path.join(root, "tools", "build-offline-verify.mjs"), "utf8");
ok("the pack builder consumes the SAME shared suite list",
  buildSrc.includes("listProbeSuites("),
  "build-offline-verify.mjs does not use tools/probe-list.mjs");

/* ── 3. freshness — a rebuild is byte-identical to the shipped pack ───────────── */
section("3. freshness — a rebuild is byte-identical to the shipped pack (anti-fabrication)");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mj-pack-"));
let rebuildError = "";
try {
  buildOfflinePack({ root, outDir: tmp });
} catch (e) {
  rebuildError = e instanceof Error ? e.message : String(e);
}
ok("a full rebuild of the pack succeeds in a temp dir", rebuildError === "", rebuildError.slice(0, 200));
const mismatches: string[] = [];
for (const name of packed) {
  const fresh = path.join(tmp, name);
  if (!fs.existsSync(fresh)) {
    mismatches.push(`${name} (not rebuilt)`);
    continue;
  }
  if (!fs.readFileSync(fresh).equals(fs.readFileSync(path.join(packDir, name)))) mismatches.push(name);
}
ok(`every shipped bundle is BYTE-IDENTICAL to a fresh rebuild (${packed.length} bundles)`,
  mismatches.length === 0,
  `drifted: ${mismatches.join(", ")}`);
const manifestPath = path.join(root, "verify", "MANIFEST.json");
ok("verify/MANIFEST.json exists", fs.existsSync(manifestPath));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
  mjVersion: string;
  esbuild: string;
  suiteCount: number;
  suites: Record<string, string>;
};
const hashMismatches = Object.entries(manifest.suites ?? {}).filter(([name, hash]) => {
  const file = path.join(packDir, name);
  if (!fs.existsSync(file)) return true;
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== hash;
});
ok("every MANIFEST sha256 matches the bundle on disk", hashMismatches.length === 0, hashMismatches.map(([n]) => n).join(", "));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };
ok(`the manifest names this release and the exact esbuild that built it (MJ ${pkg.version})`,
  manifest.mjVersion === pkg.version && typeof manifest.esbuild === "string" && manifest.esbuild.length > 0 && manifest.suiteCount === packed.length,
  `manifest: MJ ${manifest.mjVersion}, esbuild ${manifest.esbuild}, ${manifest.suiteCount} suites`);
fs.rmSync(tmp, { recursive: true, force: true });

/* ── 4. executability — the offline runner reproduces the gate ────────────────── */
section("4. executability — the offline runner reproduces the gate with zero install");

let runOut = "";
let runCode: number | null = 0;
try {
  runOut = execFileSync(process.execPath, [runnerPath], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  const err = e as { status?: number | null; stdout?: string; stderr?: string };
  runCode = err.status ?? null;
  runOut = `${err.stdout ?? ""}${err.stderr ?? ""}`;
}
const summaryMatch = runOut.match(/OFFLINE VERIFY SUMMARY: (\d+) passed, (\d+) failed\./);
ok(
  `node verify/run.mjs runs the whole pack (${summaryMatch ? `${summaryMatch[1]} passed, ${summaryMatch[2]} failed` : "no summary line"})`,
  Boolean(summaryMatch) && summaryMatch[1] === String(packed.length) && summaryMatch[2] === "0",
  summaryMatch?.[0] ?? runOut.slice(-200),
);
ok("the offline runner exits 0", runCode === 0, `exit ${runCode}`);
const verificationDoc = fs.readFileSync(path.join(root, "VERIFICATION.md"), "utf8");
ok("VERIFICATION.md names the tier-1 command (node verify/run.mjs)",
  verificationDoc.includes("node verify/run.mjs"),
  "the doc does not name the offline command");
{
  const packHashAfter = new Map(packed.map((f) => [f, crypto.createHash("sha256").update(fs.readFileSync(path.join(packDir, f))).digest("hex")]));
  const mutated = packed.filter((f) => packHashBefore.get(f) !== packHashAfter.get(f));
  ok("the pack was NOT modified during this verification (input, never output)",
    mutated.length === 0,
    `mutated mid-run: ${mutated.join(", ")}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
