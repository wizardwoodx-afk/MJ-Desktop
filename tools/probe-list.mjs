#!/usr/bin/env node
/**
 * The single source of truth for "what are the probe suites" — shared by the dev runner
 * (tools/run-all-probes.mjs, `npm test`) and the offline-verification pack builder
 * (tools/build-offline-verify.mjs), so the shipped offline pack can never cover a
 * different set of suites than the dev gate runs. V11.7.1.
 */
import fs from "node:fs";

export function listProbeSuites(probeDir) {
  return fs
    .readdirSync(probeDir)
    .filter((f) => (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) && !f.startsWith("."))
    .sort();
}
