import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const probeDir = path.resolve("probe");
const files = fs
  .readdirSync(probeDir)
  .filter((f) => (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) && !f.startsWith("."));

let totalPass = 0;
let totalFail = 0;
const failures = [];

for (const file of files) {
  const fullPath = path.join(probeDir, file);
  const outPath = path.join(probeDir, `.${file}.mjs`);
  try {
    const defineValue = JSON.stringify(process.cwd()).replace(/"/g, '\\"');
    const args = [
      "node",
      "node_modules/esbuild/bin/esbuild",
      fullPath,
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--packages=external",
      `--define:MJ_ROOT=${defineValue}`,
      `--outfile=${outPath}`,
      "--log-level=error",
    ];
    execSync(args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" "), {
      stdio: "pipe",
      shell: true,
    });
    execSync(`node ${outPath}`, { stdio: "inherit" });
    console.log(`PASS: ${file}\n`);
    totalPass++;
  } catch (err) {
    console.log(`FAIL: ${file}`);
    if (err && err.stderr) {
      const stderr = err.stderr.toString();
      if (stderr) console.log(`  STDERR: ${stderr.split('\n').slice(0, 3).join(' | ')}`);
    }
    if (err && err.stdout) {
      const stdout = err.stdout.toString();
      if (stdout) console.log(`  STDOUT: ${stdout.split('\n').slice(0, 3).join(' | ')}`);
    }
    if (err && err.message) console.log(`  MSG: ${err.message.split('\n')[0]}`);
    console.log();
    failures.push(file);
    totalFail++;
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch {
      /* ignore */
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
