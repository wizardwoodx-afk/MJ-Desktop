#!/usr/bin/env node
/**
 * Build mj-core.js — MJ's proof core, bundled for the browser.
 *
 * Why this script exists: the entry module must sit inside the MJ tree for its
 * relative imports (`./src/mission/custody`) to resolve, but MJ's tree must stay
 * clean. So this writes the entry there, bundles, and removes it — MJ is dirty
 * for the length of one esbuild call and nothing else.
 *
 *   node tools/build-mj-core.mjs --mj ../MJ-14.1.3
 *   node tools/build-mj-core.mjs --mj /path/to/MJ-Desktop
 *
 * Requires esbuild, resolved from the MJ tree's own node_modules (MJ already
 * depends on it), so this adds no new dependency to either project.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

const i = process.argv.indexOf("--mj");
const mjRoot = path.resolve(i > 0 ? process.argv[i + 1] : path.join(appRoot, "..", "MJ-14.1.3"));

if (!fs.existsSync(path.join(mjRoot, "src", "mission", "custody.ts"))) {
  console.error(`build-mj-core: not an MJ tree: ${mjRoot}\n  pass --mj <path-to-MJ>`);
  process.exit(2);
}

const MODULES = ["custody", "receipts", "signing", "egress", "riskPolicy"];
// The executor is a SEPARATE, node-only bundle: checkRunner reaches for
// node:child_process, which has no business in a browser build. Splitting them
// keeps the browser artifact honest about what the browser can actually do.
const EXEC_MODULES = ["checkRunner"];
const missing = MODULES.filter((m) => !fs.existsSync(path.join(mjRoot, "src", "mission", `${m}.ts`)));
if (missing.length) {
  console.error(`build-mj-core: MJ tree is missing modules: ${missing.join(", ")}`);
  process.exit(2);
}

const esbuild = path.join(mjRoot, "node_modules", ".bin", "esbuild");
if (!fs.existsSync(esbuild)) {
  console.error(`build-mj-core: no esbuild at ${esbuild}\n  run \`npm ci\` inside the MJ tree first`);
  process.exit(2);
}

const entry = path.join(mjRoot, "mjcore-entry.ts");
const out = path.join(appRoot, "mj-core.js");
const execEntry = path.join(mjRoot, "mjexec-entry.ts");
const execOut = path.join(appRoot, "mj-exec.mjs");

function bundle(mods, entryFile, outFile, extraArgs) {
  fs.writeFileSync(entryFile, mods.map((m) => `export * from "./src/mission/${m}";`).join("\n") + "\n");
  try {
    execFileSync(esbuild, [
      entryFile, "--bundle", ...(extraArgs ?? ["--format=iife", "--global-name=MJ", "--platform=browser"]),
      `--outfile=${outFile}`, "--log-level=warning",
    ], { stdio: "inherit" });
  } finally {
    fs.rmSync(entryFile, { force: true }); // MJ stays clean even if esbuild throws
  }
  return fs.statSync(outFile).size;
}

const bytes = bundle(MODULES, entry, out);
const execBytes = bundle(EXEC_MODULES, execEntry, execOut, ["--format=esm", "--platform=node"]);

console.log(`build-mj-core: ${out} (${bytes} bytes) from ${mjRoot}`);
console.log(`  browser modules: ${MODULES.join(", ")}`);
console.log(`build-mj-core: ${execOut} (${execBytes} bytes)`);
console.log(`  node-only modules: ${EXEC_MODULES.join(", ")} (real command execution — never bundled for the browser)`);
