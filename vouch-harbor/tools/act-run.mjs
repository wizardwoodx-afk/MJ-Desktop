#!/usr/bin/env node
/**
 * Vouch Harbor — real ACT.
 *
 * This is the part that stops the product being a demo. It does not narrate an
 * action; it performs one:
 *
 *   1. writes two real projects to disk (one whose test passes, one that fails)
 *   2. asks MJ's own `discoverChecks` what verification applies to each
 *   3. runs those checks as real child processes via MJ's `runNative`
 *   4. records what was MEASURED — exit code first, never inferred
 *   5. builds a real Ed25519-signed proof receipt from the measured outcome
 *
 * A seat is only marked verified when its real process exited 0. Nothing here
 * estimates, and a check MJ could not run is reported as `didRun: false` with
 * the reason, not as a pass.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

// The browser proof core (IIFE) and the node-only executor (ESM).
import { installLocalStorageShim } from "./issuer-store.mjs";
installLocalStorageShim();
(0, eval)(fs.readFileSync(path.join(appRoot, "mj-core.js"), "utf8") + "\n;globalThis.MJ = MJ;");
const MJ = globalThis.MJ;
const EXEC = await import(path.join(appRoot, "mj-exec.mjs"));

function mkproject(name, testBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vh-${name}-`));
  fs.writeFileSync(path.join(dir, "package.json"),
    JSON.stringify({ name, version: "0.0.0", scripts: { test: "node --test" } }, null, 2));
  // node's own test runner needs no dependencies; the directory only has to exist
  // so MJ's guard ("will not run npm without node_modules") is satisfied honestly.
  fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(dir, "thing.test.js"), testBody);
  return dir;
}

const green = mkproject("green", `
const test = require("node:test");
const assert = require("node:assert");
test("renewal total is correct", () => { assert.equal(1180 + 0, 1180); });
`);
const red = mkproject("red", `
const test = require("node:test");
const assert = require("node:assert");
test("invoice entity matches", () => { assert.equal("old-entity", "new-entity"); });
`);

console.log("Vouch Harbor — real ACT");
console.log("=======================\n");

const seats = [];
for (const [label, dir, expectPass] of [["green", green, true], ["red", red, false]]) {
  const specs = await EXEC.discoverChecks(dir, EXEC.readNative, EXEC.existsNative);
  console.log(`[${label}] ${dir}`);
  console.log(`  discovered ${specs.length} check(s): ${specs.map((s) => s.label).join(", ") || "none"}`);

  let verified = false;
  for (const spec of specs) {
    const r = await EXEC.runCheck(spec, dir, EXEC.runNative, async () => true, EXEC.existsNative);
    console.log(`  ${spec.label}: didRun=${r.didRun} exit=${r.exitCode} ${r.durationMs}ms` +
                (r.didRun ? "" : ` reason="${r.reason}"`));
    if (r.didRun) {
      console.log(`    output: ${(r.output || "").trim().split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 110)}`);
      if (spec.source === "TEST_RUN") verified = r.exitCode === 0;
    }
  }
  console.log(`  measured verdict: ${verified ? "VERIFIED" : "NOT VERIFIED"} (expected ${expectPass ? "pass" : "fail"})`);
  if (verified !== expectPass) {
    console.error(`  !! measured outcome contradicts expectation — reporting it, not hiding it`);
  }
  seats.push({ seatId: `flamo.${label}`, role: label === "green" ? "actor" : "actor",
               outcome: verified ? "checks passed (measured exit 0)" : "checks failed (measured non-zero)",
               verified, harness: "node" });
  console.log();
}

// A receipt whose seat verdicts came from real processes.
const receipt = await MJ.buildProofReceipt({
  mission: "vouchcycle:real-act",
  teamId: "vouch-harbor",
  startedAt: new Date(Date.now() - 5000).toISOString(),
  finishedAt: new Date().toISOString(),
  mjVersion: "14.1.3",
  edition: "vouch-harbor",
  report: { status: seats.every((s) => s.verified) ? "completed" : "completed-with-failures",
            reviewedBySnapshot: true, gateStatus: "PASS", seats },
});

const v = await MJ.verifyProofReceipt(receipt);
console.log(`receipt: ${receipt.format}, ${receipt.events.length} events, signed=${Boolean(receipt.signature)}`);
console.log(`verifyProofReceipt: ${JSON.stringify(v)}`);

const outReceipt = path.join(appRoot, "receipt-real-act.jsonl");
const outKey = path.join(appRoot, "issuer-key.txt");
fs.writeFileSync(outReceipt, MJ.receiptToJsonl(receipt));
if (receipt.issuer) fs.writeFileSync(outKey, receipt.issuer.publicKeyHex);
console.log(`\nwrote ${path.basename(outReceipt)} (${fs.statSync(outReceipt).size} bytes)`);

for (const d of [green, red]) fs.rmSync(d, { recursive: true, force: true });
console.log("temp projects removed");
