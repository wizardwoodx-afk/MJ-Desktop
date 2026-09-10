#!/usr/bin/env node
/**
 * VOUCH HARBOR — reproducible drill benchmark (16.6.0).
 *
 * Customer-facing evidence: a machine-readable report of the full drill
 * catalog run through the REAL Mission Loop, with a single stable
 * overallDigest. The same discipline as the offline pack and the MCP
 * engine bundle: build with the project's own esbuild (JS API — no shell,
 * no .bin resolution, cross-platform), run the bundle, done.
 *
 *   node tools/drill-benchmark.mjs              → JSON on stdout
 *   node tools/drill-benchmark.mjs --out f.json → also writes f.json
 *
 * probe/drill.test.ts pins the CLI: it must run, emit the report schema,
 * carry the honest verdicts (guard passed / maths passed / impossible
 * failed), and its per-scenario attestations must match the in-process
 * drill attestations (cross-process reproducibility).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "tools", "drill-benchmark.entry.ts");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vh-drill-bench-"));
const out = path.join(tmp, "drill-benchmark.mjs");
try {
  buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    outfile: out,
    logLevel: "error",
  });
  const passArgs = process.argv.slice(2);
  const stdout = execFileSync(process.execPath, [out, ...passArgs], { cwd: root, encoding: "utf8" });
  process.stdout.write(stdout);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
