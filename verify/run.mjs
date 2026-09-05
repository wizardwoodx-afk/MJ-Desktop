#!/usr/bin/env node
/**
 * V11.7.1 — offline verification runner. Requires ONLY Node.js: no npm install, no
 * network, no node_modules. Run from the extracted release tree:
 *
 *     node verify/run.mjs
 *
 * It executes every self-contained bundle in verify/suites/ (built by
 * tools/build-offline-verify.mjs from the same suite list `npm test` uses) with cwd set
 * to the tree root, and prints the same PASS/FAIL summary as the dev gate. This exists
 * because the 11.7.0 review environment could not `npm ci` offline — a shipped gate
 * should be reproducible by anyone with Node, anywhere, with zero install.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suitesDir = path.join(root, "verify", "suites");
const suites = fs.readdirSync(suitesDir).filter((f) => f.endsWith(".mjs")).sort();

let pass = 0;
let fail = 0;
const failures = [];
for (const s of suites) {
  try {
    // QA fix (audit C1): `stdio: "inherit"` deadlocked on Windows whenever this runner's own
    // output was redirected (npm logs, CI) — the git child processes inside gitTs stalled on
    // the inherited handles and the whole gate died silently. Piping + a per-suite timeout
    // turns any hang into a visible, attributable FAIL.
    const stdout = execFileSync(process.execPath, [path.join(suitesDir, s)], {
      cwd: root,
      timeout: 120_000,
      killSignal: "SIGKILL",
      maxBuffer: 256 * 1024 * 1024,
      encoding: "utf8",
    });
    process.stdout.write(stdout);
    console.log(`PASS: ${s}\n`);
    pass++;
  } catch (err) {
    console.log(`FAIL: ${s}\n`);
    if (err && typeof err === "object" && "stdout" in err && typeof err.stdout === "string") {
      process.stdout.write(err.stdout);
    }
    failures.push(s);
    fail++;
  }
}

console.log("========================================");
console.log(`OFFLINE VERIFY SUMMARY: ${pass} passed, ${fail} failed. (node ${process.version})`);
console.log("========================================");
if (failures.length > 0) {
  console.error("Failed suites:", failures);
  process.exit(1);
}
