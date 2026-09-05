#!/usr/bin/env node
/**
 * MJ probe runner — `npm test`.
 *
 * V11.4.1 rewrite. The V11.2 runner shelled out:
 *
 *     execSync(`./node_modules/.bin/esbuild ${fullPath} ... --define:MJ_ROOT="\\"${cwd}\\""`)
 *
 * which breaks three ways, all observed in the wild:
 *   • Windows: `./node_modules/.bin/esbuild` is `esbuild.cmd` — an extensionless path with
 *     forward slashes that cmd.exe will not execute, so 0/37 suites even start.
 *   • Some installs: the `.bin` entry resolves to `node_modules/esbuild/bin/esbuild`, which
 *     after postinstall IS the native ELF/Mach-O binary — anything that prefixes `node`
 *     tries to parse a native executable as JavaScript and dies on byte one.
 *   • Shell quoting: the --define escaping breaks on any checkout path containing a space.
 *
 * The fix is to not spawn esbuild at all. Each probe is bundled with esbuild's JavaScript
 * API (buildSync — same package, same flags as the README loop) and the produced .mjs is
 * run with execFileSync(process.execPath, ...): no shell, no bin resolution, no quoting,
 * identical behaviour on linux / macOS / windows. `packages: "external"` is preserved so
 * runtime imports (react for the v10 page probe) resolve from the project's node_modules,
 * which is why the output is written inside probe/ and removed afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
// V11.7.1: the suite list is shared with the offline-verification pack builder, so the
// dev gate and the shipped pack can never cover different sets of suites.
import { listProbeSuites } from "./probe-list.mjs";

// Per-suite watchdog. Some probes drive real `git` child processes; without a timeout one
// environmental hang would previously kill the whole run silently (see the audit C1 note below).
function suiteTimeoutMs() {
  const n = Number(process.env.MJ_PROBE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probeDir = path.join(root, "probe");
const files = listProbeSuites(probeDir);

let totalPass = 0;
let totalFail = 0;
const failures = [];

for (const file of files) {
  const fullPath = path.join(probeDir, file);
  const outPath = path.join(probeDir, `.${file}.mjs`);
  try {
    buildSync({
      entryPoints: [fullPath],
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      banner: {
        js: 'import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);',
      },
      define: { MJ_ROOT: JSON.stringify(root) },
      outfile: outPath,
      logLevel: "error",
    });
    // QA fix (audit C1): this used to be `stdio: "inherit"`. On Windows, when the runner's own
    // output is redirected (npm logs, CI, any non-tty), the inherited handles deadlock the git
    // child processes inside gitTs — and the whole runner died silently at suite 19 of 40: no
    // FAIL line, no summary, and the .mjs bundle left behind because `finally` never ran.
    // Piping the child's stdio avoids the handle-inheritance deadlock, and the per-suite
    // timeout turns any future hang into a visible, attributable failure instead of a
    // silently truncated run.
    const stdout = execFileSync(process.execPath, [outPath], {
      cwd: root,
      timeout: suiteTimeoutMs(),
      killSignal: "SIGKILL",
      maxBuffer: 256 * 1024 * 1024,
      encoding: "utf8",
    });
    process.stdout.write(stdout);
    console.log(`PASS: ${file}\n`);
    totalPass++;
  } catch (err) {
    console.log(`FAIL: ${file}`);
    const message = err && typeof err.message === "string" ? err.message : String(err);
    // A timeout kill must be impossible to miss: the suite never printed a verdict.
    if (message.includes("ETIMEDOUT")) {
      console.log(`TIMED OUT after ${suiteTimeoutMs() / 1000}s (killed; see output below)`);
    }
    if (err && typeof err === "object" && "stdout" in err && typeof err.stdout === "string") {
      process.stdout.write(err.stdout);
    }
    console.log(message.split("\n").slice(0, 8).join("\n"));
    console.log("");
    failures.push(file);
    totalFail++;
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch {
      /* never written */
    }
  }
}

console.log(`\n========================================`);
console.log(`ALL PROBES SUMMARY: ${totalPass} passed, ${totalFail} failed.`);
console.log(`========================================\n`);

if (failures.length > 0) {
  console.error("Failed test suites:", failures);
  process.exit(1);
}
