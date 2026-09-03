#!/usr/bin/env node
/**
 * V11.7.1 — the offline verification pack.
 *
 * The 11.7. review could not certify the runtime test result from the shipped zip: it has
 * no node_modules, its environment could not `npm ci` offline, and bare `tsc --noEmit`
 * dies on missing React types before it produces a usable exit code. This tool answers
 * that caveat at the pack level: it pre-bundles EVERY probe suite (except its own
 * verifier, suite #40) into one self-contained .mjs per suite — no npm packages needed
 * at runtime, only Node — and writes verify/suites/ plus verify/MANIFEST.json (a sha256
 * per bundle). Anyone can then reproduce the full gate from the extracted zip:
 *
 *     node verify/run.mjs
 *
 * Design notes:
 *  - The suite list comes from tools/probe-list.mjs, the SAME module `npm test` uses —
 *    the pack and the dev gate cannot drift apart.
 *  - MJ_ROOT is defined as "." and verify/run.mjs runs each bundle with cwd = the tree
 *    root, so the pack works from any extraction path (the dev runner instead bakes the
 *    absolute checkout path at build time).
 *  - Packages are bundled IN (the dev runner keeps them external for react); the one
 *    wrinkle is react-dom/server, a CommonJS package that require()s node builtins —
 *    the banner gives ESM output a real require (the well-known esbuild recipe; without
 *    it the v10Page suite dies on "Dynamic require of 'stream' is not supported").
 *  - probe/offlinePack.test.ts (suite #40) is deliberately NOT packed: it is the
 *    freshness gate for this pack itself (it rebuilds every bundle and byte-compares
 *    against the shipped ones), which only means something where the dev toolchain
 *    exists. Under `npm test` it runs; packed, it would only re-run the other suites.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";
import { listProbeSuites } from "./probe-list.mjs";

const require = createRequire(import.meta.url);
const esbuildPkg = require("esbuild/package.json");

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK_SELF_VERIFIER = "offlinePack.test.ts";

/** The esbuild options every offline bundle is built with (shared with suite #40). */
export function offlineBundleOptions(entryPath, outfile) {
  return {
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    define: { MJ_ROOT: '"."' },
    banner: {
      js: 'import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);',
    },
    outfile,
    logLevel: "error",
  };
}

/**
 * Build the pack. `root` is the release tree (passed explicitly because suite #40 calls
 * this from a bundle whose own location says nothing about the tree). `outDir` defaults
 * to <root>/verify/suites; a temp outDir is how suite #40 rebuilds for byte-comparison.
 * Returns the manifest it wrote (or would write).
 */
export function buildOfflinePack({ root, outDir }) {
  const probeDir = path.join(root, "probe");
  const dest = outDir ?? path.join(root, "verify", "suites");
  fs.mkdirSync(dest, { recursive: true });
  const mjVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const files = listProbeSuites(probeDir).filter((f) => f !== PACK_SELF_VERIFIER);
  const suites = {};
  for (const f of files) {
    const outfile = path.join(dest, f.replace(/\.(ts|tsx)$/, ".mjs"));
    buildSync(offlineBundleOptions(path.join(probeDir, f), outfile));
    suites[path.basename(outfile)] = crypto.createHash("sha256").update(fs.readFileSync(outfile)).digest("hex");
  }
  const manifest = {
    mjVersion,
    esbuild: esbuildPkg.version,
    suiteCount: files.length,
    note: "Self-contained bundles of every probe suite except offlinePack.test.ts (the pack's own freshness gate). Run with: node verify/run.mjs from the tree root. Built by tools/build-offline-verify.mjs.",
    suites,
  };
  if (!outDir) {
    fs.writeFileSync(path.join(root, "verify", "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  }
  return { manifest, dest, files };
}

// CLI mode: build the real pack in place.
//
// The guard CANNOT be `process.argv[1] === fileURLToPath(import.meta.url)` — the obvious
// form — because this module is ALSO imported by probe/offlinePack.test.ts, and once
// esbuild bundles it, import.meta.url IS the bundle's path, so argv[1] === import.meta.url
// holds there too. The first version of suite #40 shipped exactly that guard, and its own
// mutation test caught the consequence: the suite was silently REBUILDING the pack in
// place before comparing it to itself — a vacuous freshness check (the 11.7.0 lesson,
// repeated). Matching the module's own filename only fires when this file is run
// directly, never when it is bundled into something else.
const isCli = Boolean(process.argv[1] && path.resolve(process.argv[1]).endsWith("build-offline-verify.mjs"));
if (isCli) {
  const { manifest } = buildOfflinePack({ root: MODULE_ROOT });
  console.log(`offline pack: ${manifest.suiteCount} suites -> verify/suites (MJ ${manifest.mjVersion}, esbuild ${manifest.esbuild})`);
  console.log("run it with:  node verify/run.mjs");
}
