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
    execSync(
      `./node_modules/.bin/esbuild ${fullPath} --bundle --platform=node --format=esm --packages=external --define:MJ_ROOT="\\"${process.cwd()}\\"" --outfile=${outPath} --log-level=error`,
      { stdio: "pipe" },
    );
    execSync(`node ${outPath}`, { stdio: "inherit" });
    console.log(`PASS: ${file}\n`);
    totalPass++;
  } catch (err) {
    console.log(`FAIL: ${file}\n`);
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
