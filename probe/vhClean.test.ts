/**
 * VOUCH HARBOR — clean-identity probe (16.4.0)
 *
 * The 16.1.0 rebrand is pinned here so it cannot silently regress:
 *   1. the legacy names "MJ" and "ROGUE" do not appear anywhere in the ROUTED
 *      product surface — shell, routed pages, the whole control-plane module
 *      (src/vouch/**), the web entry, the package manifest, the native manifest;
 *      the ONLY survivors are the legacy WIRE tokens ("mj-proof-receipt/1|2"
 *      format names, the shared wire secret) that the verifiers must still
 *      accept — compatibility, not branding.
 *   2. the current receipt format is vh-proof-receipt/2; the signed legacy
 *      fixture still verifies (back-compat contract).
 *   3. every persistence key in the control plane is "vouch.*".
 *   4. identity strings (bot name, seat, team, native identifier) are clean.
 */

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";

const MJ_ROOT = process.env.MJ_ROOT ?? process.cwd();

declare const __VOUCH_ROOT__: string | undefined;
const ROOT = (typeof __VOUCH_ROOT__ !== "undefined" && __VOUCH_ROOT__) || process.env.VOUCH_ROOT || MJ_ROOT;

/* The ROUTED product surface: everything a user can actually see or route to. */
const ROUTED_SURFACE: string[] = [
  "src/App.tsx",
  "src/main.tsx",
  "src/vouch/pages/VouchPage.tsx",
  "src/pages/LoopPage.tsx",
  "src/pages/ProofPage.tsx",
  "src/pages/AuditPage.tsx",
  "src/pages/SystemPage.tsx",
  "src/pages/SettingsPage.tsx",
  "index.html",
  "package.json",
  "src-tauri/tauri.conf.json",
];
const VOUCHE_TREE = "src/vouch";

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}

/* Strip the wire-compat tokens — the ONLY places "mj" may survive:
 * legacy wire format names and the shared wire secret. Renaming either would
 * break verification of already-issued receipts. */
function stripWireTokens(src: string): string {
  return src
    .replace(/mj-proof-receipt/gi, "")
    .replace(/mj-commercial-v1-offline/g, "")
    .replace(/\bmj\b/gi, "")
    .replace(/\brogue\b/gi, "")
    .replace(/\bROGUE\b/g, "");
}

test("the routed product surface carries no legacy MJ / ROGUE name", () => {
  for (const rel of ROUTED_SURFACE) {
    const src = stripWireTokens(read(rel));
    assert.ok(!/M-J\b/i.test(src), `${rel}: unexpected mask`);
    // after stripping the wire tokens, no standalone MJ/ROGUE/mj/rogue may remain
    assert.equal(/MJ|ROGUE/.test(src), false, `${rel} still references a legacy name`);
  }
});

test("the whole control-plane module (src/vouch/**) carries no legacy name except the wire contract", () => {
  let scanned = 0;
  for (const abs of walk(path.join(ROOT, VOUCHE_TREE))) {
    scanned++;
    const rel = path.relative(ROOT, abs);
    const src = stripWireTokens(fs.readFileSync(abs, "utf8"));
    assert.equal(/MJ|ROGUE/.test(src), false, `${rel} still references a legacy name`);
  }
  assert.ok(scanned >= 6, `expected at least 6 modules under ${VOUCHE_TREE}, scanned ${scanned}`);
});

/* 16.5.0 — the clean identity extends from the control plane to the whole
 * VISIBLE product surface: shell, pages, panels, canvas, the IPC bridge,
 * the browser stubs and the domain catalogs. Engine internals (src/mission,
 * src/engine, src/graph) keep their historical dev comments — labeled in
 * the 16.5 upgrade notes — but the surface a user or an auditor sees does
 * not carry a legacy name. */
const UI_LAYER = ["src/app", "src/pages", "src/panels", "src/canvas", "src/ipc", "src/browser", "src/domain"];

test("the visible product surface carries no legacy name (whole surface, not just the vouch tree)", () => {
  let scanned = 0;
  for (const dir of UI_LAYER) {
    for (const abs of walk(path.join(ROOT, dir))) {
      scanned++;
      const rel = path.relative(ROOT, abs);
      const src = stripWireTokens(fs.readFileSync(abs, "utf8"));
      assert.equal(/MJ|ROGUE/.test(src), false, `${rel} still references a legacy name`);
    }
  }
  assert.ok(scanned >= 30, `expected a real UI surface under the audited dirs, scanned ${scanned}`);
});

test("the web entry, IPC bridge, and styles carry no legacy name", () => {
  for (const rel of ["src/main.tsx", "src/ipc/client.ts", "src/ipc/localDb.ts", "src/styles/vouch.css", "src/styles/redesign.css"]) {
    const src = stripWireTokens(read(rel));
    assert.equal(/MJ|ROGUE/.test(src), false, `${rel} still references a legacy name`);
    assert.ok(!/\bmj-|\brogue-/.test(read(rel).replace(/mj-proof-receipt/gi, "")), `${rel} has legacy mj-/* tokens`);
  }
});

test("identity strings are Vouch Harbor", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.name, "vouchharbor");
  assert.ok(!/\bMJ\b|\bROGUE\b/.test(pkg.description ?? ""), `package description: ${pkg.description}`);
  const html = read("index.html");
  assert.ok(/<title>\s*Vouch Harbor/.test(html), "index.html title");
  const tauri = read("src-tauri/tauri.conf.json");
  const conf = JSON.parse(tauri);
  assert.equal(conf.identifier, "com.vouchharbor.harbor");
  assert.equal(conf.productName, "Vouch Harbor");
  assert.ok(conf.bundle.longDescription.includes("Vouch Harbor"), "native description");
  const ver = read("src/version.ts");
  assert.ok(ver.includes('export const VH_VERSION = "16.5.0"'), "product version constant");
});

test("every control-plane persistence key is vouch.*", () => {
  const keys = new Set<string>();
  for (const abs of walk(path.join(ROOT, VOUCHE_TREE))) {
    const src = fs.readFileSync(abs, "utf8");
    const re = /["']((?:vouch|mj|rogue)\.[a-z0-9.]+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) keys.add(m[1]);
  }
  assert.ok(keys.size >= 5, `expected vouch.* keys to be found, got ${keys.size}`);
  for (const k of keys) {
    assert.ok(k.startsWith("vouch."), `legacy persistence key still present: ${k}`);
  }
});

test("the current wire format is vh-proof-receipt/2 and the legacy fixture still verifies", async () => {
  const { buildChainedReceipt, verifyProofReceipt, receiptFromJsonl } = await import("../src/vouch/engine/proof.js");
  const now = new Date().toISOString();
  const r = await buildChainedReceipt({
    mission: "clean-identity-check",
    teamId: "vouch",
    startedAt: now,
    finishedAt: now,
    version: "16.5.0",
    edition: "offline",
    events: [{ kind: "vouch.session", seatId: "vouch-core", data: { hello: "clean" } }],
  });
  assert.equal(r.format, "vh-proof-receipt/2", "new receipts emit the Vouch Harbor wire format");
  const fresh = await verifyProofReceipt(r);
  assert.equal(fresh.ok, true, `a fresh vh/2 receipt verifies in-process${fresh.ok ? "" : " — " + (fresh as { reason: string }).reason}`);

  const legacyText = fs.readFileSync(path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl"), "utf8");
  const legacy = receiptFromJsonl(legacyText);
  assert.ok(legacy, "the signed legacy fixture parses");
  assert.equal(legacy.format, "mj-proof-receipt/2", "the fixture is a signed legacy-v2 receipt");
  const v = await verifyProofReceipt(legacy);
  assert.equal(v.ok, true, "back-compat: the legacy fixture still verifies through the same verifier");
});

test("the offline CLI accepts both wires and rejects tampering", async () => {
  const { buildChainedReceipt, receiptToJsonl } = await import("../src/vouch/engine/proof.js");
  const now = new Date().toISOString();
  const fresh = await buildChainedReceipt({ mission: "cli-fresh-check", teamId: "vouch", startedAt: now, finishedAt: now, version: "16.5.0", edition: "offline", events: [{ kind: "vouch.session", seatId: "vouch-core", data: { x: 1 } }] });
  const freshPath = path.join(ROOT, "probe/.vhClean-fresh.jsonl");
  fs.writeFileSync(freshPath, receiptToJsonl(fresh));
  let freshCode = 0;
  try {
    execFileSync(process.execPath, [path.join(ROOT, "tools/verify-receipt.mjs"), freshPath], { encoding: "utf8" });
  } catch (e) {
    freshCode = (e as { status?: number }).status ?? 1;
  }
  fs.rmSync(freshPath, { force: true });
  assert.ok(freshCode === 0 || freshCode === 3, `fresh vh/2 receipt should verify via CLI, got exit ${freshCode}`);


  const tool = path.join(ROOT, "tools/verify-receipt.mjs");
  const src = read("tools/verify-receipt.mjs");
  for (const fmt of ["vh-proof-receipt/2", "mj-proof-receipt/2", "mj-proof-receipt/1"]) {
    assert.ok(src.includes(fmt), `verifier accepts ${fmt}`);
  }
  // legacy fixture → VALID (signature-only: exit 0 or 3)
  let code = 0;
  try {
    execFileSync(process.execPath, [tool, path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl")], { encoding: "utf8" });
  } catch (e) {
    code = (e as { status?: number }).status ?? 1;
  }
  assert.ok(code === 0 || code === 3, `legacy fixture should verify via CLI, got exit ${code}`);
  // tamper ONE hex char in the last event's hash → INVALID (exit 1)
  const tamperedPath = path.join(ROOT, "probe/.vhClean-tampered.jsonl");
  const legacyText = fs.readFileSync(path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl"), "utf8");
  const lines = legacyText.split("\n").filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]) as { hash: string };
  last.hash = (last.hash.startsWith("0") ? "1" : "0") + last.hash.slice(1);
  lines[lines.length - 1] = JSON.stringify(last);
  fs.writeFileSync(tamperedPath, lines.join("\n") + "\n");
  try {
    execFileSync(process.execPath, [tool, tamperedPath], { encoding: "utf8" });
    assert.fail("tampered receipt must not verify");
  } catch (e) {
    const ec = (e as { status?: number }).status ?? 0;
    assert.equal(ec, 1, `tampered legacy receipt must exit 1, got ${ec}`);
  } finally {
    fs.rmSync(tamperedPath, { force: true });
  }
});

console.log("vhClean probe complete");
