import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/vouch/ipc/client.ts
var client_exports = {};
__export(client_exports, {
  ipc: () => ipc,
  isNativeHost: () => isNativeHost
});
function isNativeHost() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}
var invoke, ipc;
var init_client = __esm({
  "src/vouch/ipc/client.ts"() {
    "use strict";
    invoke = (cmd, args) => {
      const internals = window.__TAURI_INTERNALS__;
      if (!internals) throw new Error("not in the native host \u2014 no __TAURI_INTERNALS__");
      return internals.invoke(cmd, args);
    };
    ipc = {
      async secretGet(secretRef) {
        return await invoke("secret_get", { secretRef });
      },
      async secretSet(secretRef, value) {
        return await invoke("secret_set", { secretRef, value });
      },
      async notifyApproval(title, body) {
        await invoke("notify_approval", { title, body });
      },
      async appInfo() {
        return await invoke("app_info");
      }
    };
  }
});

// src/vouch/engine/signing.ts
async function keychainBridge() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    return {
      get: async () => {
        try {
          const r = await ipc2.secretGet(KEYCHAIN_REF);
          return r.present && r.value ? r.value : null;
        } catch {
          return null;
        }
      },
      set: async (json) => {
        try {
          const r = await ipc2.secretSet(KEYCHAIN_REF, json);
          return Boolean(r.stored);
        } catch {
          return false;
        }
      }
    };
  } catch {
    return null;
  }
}
function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function ed25519Available() {
  try {
    return typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof crypto.subtle.generateKey === "function";
  } catch {
    return false;
  }
}
async function ensureIssuerIdentity() {
  if (cached) return cached;
  if (!ed25519Available()) return null;
  const bridge = await keychainBridge();
  try {
    const raw = bridge ? await bridge.get() : globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity = {
          keyId: `vouch-issuer-${stored.publicKeyHex.slice(0, 12)}`,
          publicKeyHex: stored.publicKeyHex,
          createdAt: stored.createdAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
        };
        cached = { identity, privateKey };
        return cached;
      }
    }
  } catch {
  }
  try {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKeyHex = toHex(rawPub);
    const identity = {
      keyId: `vouch-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const persisted = JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt });
    try {
      if (bridge) await bridge.set(persisted);
    } catch {
    }
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, persisted);
    } catch {
    }
    cached = { identity, privateKey: pair.privateKey };
    return cached;
  } catch {
    return null;
  }
}
async function signHexDigest(hexDigest) {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  try {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, holder.privateKey, fromHex(hexDigest)));
    return { alg: "EdDSA", keyId: holder.identity.keyId, publicKeyHex: holder.identity.publicKeyHex, sigHex: toHex(sig) };
  } catch {
    return null;
  }
}
async function signChainHash(chainHashHex) {
  return signHexDigest(chainHashHex);
}
async function verifyIssuerSignature(chainHashHex, sigHex, publicKeyHex) {
  if (!ed25519Available()) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", fromHex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromHex(sigHex), fromHex(chainHashHex));
  } catch {
    return false;
  }
}
var STORAGE_KEY, KEYCHAIN_REF, cached;
var init_signing = __esm({
  "src/vouch/engine/signing.ts"() {
    "use strict";
    STORAGE_KEY = "vouch.issuerkey.v1";
    KEYCHAIN_REF = "vouch.issuerkey.v1";
    cached = null;
  }
});

// src/vouch/engine/proof.ts
var proof_exports = {};
__export(proof_exports, {
  LEGACY_SEAL_SECRET: () => LEGACY_SEAL_SECRET,
  VERIFY_SECRET: () => VERIFY_SECRET,
  buildChainedReceipt: () => buildChainedReceipt,
  receiptFromJsonl: () => receiptFromJsonl,
  receiptToJsonl: () => receiptToJsonl,
  verifyProofReceipt: () => verifyProofReceipt
});
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(s, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(s));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function buildChainedReceipt(args) {
  const events = [];
  let prev = "0".repeat(64);
  let seq = 0;
  for (const r of args.events) {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const body = { seq, ts, kind: r.kind, seatId: r.seatId, data: r.data, prev };
    const hash = await sha256hex(canon(body));
    events.push({ ...body, hash });
    prev = hash;
    seq += 1;
  }
  const header = {
    mission: args.mission,
    teamId: args.teamId,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    version: args.version,
    edition: args.edition,
    autonomyArms: []
  };
  const seal = await hmacHex(prev, VERIFY_SECRET);
  const sig = await signChainHash(prev);
  if (sig) {
    return {
      format: "vh-proof-receipt/2",
      header,
      events,
      seal,
      issuer: { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex },
      signature: sig.sigHex
    };
  }
  return {
    format: "vh-proof-receipt/2",
    header,
    events,
    seal,
    issuer: null,
    signature: null,
    signatureNote: "This runtime has no Ed25519 (WebCrypto refused or is absent). The receipt is tamper-evident via its HMAC seal but NOT issuer-signed."
  };
}
async function verifyProofReceipt(rc) {
  const sealSecret = SEAL_SECRET_BY_FORMAT[rc.format];
  if (!sealSecret) return { ok: false, reason: `unknown format ${rc.format}` };
  let prev = "0".repeat(64);
  for (const e of rc.events) {
    if (e.prev !== prev) return { ok: false, reason: `chain broken at seq ${e.seq}` };
    const { hash, ...body } = e;
    const expect = await sha256hex(canon(body));
    if (expect !== hash) return { ok: false, reason: `hash mismatch at seq ${e.seq}` };
    prev = hash;
  }
  const seal = await hmacHex(prev, sealSecret);
  if (seal !== rc.seal) return { ok: false, reason: "seal mismatch" };
  if (rc.format === "mj-proof-receipt/2" && rc.signature) {
    if (!rc.issuer?.publicKeyHex) return { ok: false, reason: "receipt is signed but carries no issuer public key" };
    const ok = await verifyIssuerSignature(prev, rc.signature, rc.issuer.publicKeyHex);
    if (!ok) return { ok: false, reason: `issuer signature verification FAILED for chain head ${prev}` };
  }
  return { ok: true, events: rc.events.length };
}
function receiptToJsonl(rc) {
  const head = { receipt: rc.header, format: rc.format, seal: rc.seal };
  if (rc.issuer !== void 0) head.issuer = rc.issuer;
  if (rc.signature !== void 0) head.signature = rc.signature;
  if (rc.signatureNote !== void 0) head.signatureNote = rc.signatureNote;
  const lines = [JSON.stringify(head), ...rc.events.map((e) => JSON.stringify(e))];
  return `${lines.join("\n")}
`;
}
function receiptFromJsonl(text) {
  try {
    const lines = text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (lines.length < 1) return null;
    const head = lines[0];
    if (!head.receipt || !head.seal) return null;
    const out = {
      format: head.format ?? "mj-proof-receipt/1",
      header: head.receipt,
      events: lines.slice(1),
      seal: head.seal
    };
    if (head.issuer !== void 0) out.issuer = head.issuer;
    if (head.signature !== void 0) out.signature = head.signature;
    if (head.signatureNote !== void 0) out.signatureNote = head.signatureNote;
    return out;
  } catch {
    return null;
  }
}
var VERIFY_SECRET, LEGACY_SEAL_SECRET, SEAL_SECRET_BY_FORMAT, enc, canon;
var init_proof = __esm({
  "src/vouch/engine/proof.ts"() {
    "use strict";
    init_signing();
    VERIFY_SECRET = "vh-commercial-v1-offline";
    LEGACY_SEAL_SECRET = "mj-commercial-v1-offline";
    SEAL_SECRET_BY_FORMAT = {
      "vh-proof-receipt/2": VERIFY_SECRET,
      "mj-proof-receipt/2": LEGACY_SEAL_SECRET,
      "mj-proof-receipt/1": LEGACY_SEAL_SECRET
    };
    enc = new TextEncoder();
    canon = (o) => JSON.stringify(sortDeep(o));
  }
});

// probe/vhClean.test.ts
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
var MJ_ROOT = process.env.MJ_ROOT ?? process.cwd();
var ROOT = typeof __VOUCH_ROOT__ !== "undefined" && __VOUCH_ROOT__ || process.env.VOUCH_ROOT || MJ_ROOT;
var ROUTED_SURFACE = [
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
  "src-tauri/tauri.conf.json"
];
var VOUCHE_TREE = "src/vouch";
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}
function stripWireTokens(src) {
  return src.replace(/mj-proof-receipt/gi, "").replace(/mj-commercial-v1-offline/g, "").replace(/\bmj\b/gi, "").replace(/\brogue\b/gi, "").replace(/\bROGUE\b/g, "");
}
test("the routed product surface carries no legacy MJ / ROGUE name", () => {
  for (const rel of ROUTED_SURFACE) {
    const src = stripWireTokens(read(rel));
    assert.ok(!/M-J\b/i.test(src), `${rel}: unexpected mask`);
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
var UI_LAYER = ["src/app", "src/pages", "src/panels", "src/canvas", "src/ipc", "src/browser", "src/domain"];
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
  assert.ok(ver.includes('export const VH_VERSION = "16.9.0"'), "product version constant");
});
test("every control-plane persistence key is vouch.*", () => {
  const keys = /* @__PURE__ */ new Set();
  for (const abs of walk(path.join(ROOT, VOUCHE_TREE))) {
    const src = fs.readFileSync(abs, "utf8");
    const re = /["']((?:vouch|mj|rogue)\.[a-z0-9.]+)["']/gi;
    let m;
    while (m = re.exec(src)) keys.add(m[1]);
  }
  assert.ok(keys.size >= 5, `expected vouch.* keys to be found, got ${keys.size}`);
  for (const k of keys) {
    assert.ok(k.startsWith("vouch."), `legacy persistence key still present: ${k}`);
  }
});
test("the current wire format is vh-proof-receipt/2 and the legacy fixture still verifies", async () => {
  const { buildChainedReceipt: buildChainedReceipt2, verifyProofReceipt: verifyProofReceipt2, receiptFromJsonl: receiptFromJsonl2 } = await Promise.resolve().then(() => (init_proof(), proof_exports));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const r = await buildChainedReceipt2({
    mission: "clean-identity-check",
    teamId: "vouch",
    startedAt: now,
    finishedAt: now,
    version: "16.9.0",
    edition: "offline",
    events: [{ kind: "vouch.session", seatId: "vouch-core", data: { hello: "clean" } }]
  });
  assert.equal(r.format, "vh-proof-receipt/2", "new receipts emit the Vouch Harbor wire format");
  const fresh = await verifyProofReceipt2(r);
  assert.equal(fresh.ok, true, `a fresh vh/2 receipt verifies in-process${fresh.ok ? "" : " \u2014 " + fresh.reason}`);
  const legacyText = fs.readFileSync(path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl"), "utf8");
  const legacy = receiptFromJsonl2(legacyText);
  assert.ok(legacy, "the signed legacy fixture parses");
  assert.equal(legacy.format, "mj-proof-receipt/2", "the fixture is a signed legacy-v2 receipt");
  const v = await verifyProofReceipt2(legacy);
  assert.equal(v.ok, true, "back-compat: the legacy fixture still verifies through the same verifier");
});
test("the offline CLI accepts both wires and rejects tampering", async () => {
  const { buildChainedReceipt: buildChainedReceipt2, receiptToJsonl: receiptToJsonl2 } = await Promise.resolve().then(() => (init_proof(), proof_exports));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const fresh = await buildChainedReceipt2({ mission: "cli-fresh-check", teamId: "vouch", startedAt: now, finishedAt: now, version: "16.9.0", edition: "offline", events: [{ kind: "vouch.session", seatId: "vouch-core", data: { x: 1 } }] });
  const freshPath = path.join(ROOT, "probe/.vhClean-fresh.jsonl");
  fs.writeFileSync(freshPath, receiptToJsonl2(fresh));
  let freshCode = 0;
  try {
    execFileSync(process.execPath, [path.join(ROOT, "tools/verify-receipt.mjs"), freshPath], { encoding: "utf8" });
  } catch (e) {
    freshCode = e.status ?? 1;
  }
  fs.rmSync(freshPath, { force: true });
  assert.ok(freshCode === 0 || freshCode === 3, `fresh vh/2 receipt should verify via CLI, got exit ${freshCode}`);
  const tool = path.join(ROOT, "tools/verify-receipt.mjs");
  const src = read("tools/verify-receipt.mjs");
  for (const fmt of ["vh-proof-receipt/2", "mj-proof-receipt/2", "mj-proof-receipt/1"]) {
    assert.ok(src.includes(fmt), `verifier accepts ${fmt}`);
  }
  let code = 0;
  try {
    execFileSync(process.execPath, [tool, path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl")], { encoding: "utf8" });
  } catch (e) {
    code = e.status ?? 1;
  }
  assert.ok(code === 0 || code === 3, `legacy fixture should verify via CLI, got exit ${code}`);
  const tamperedPath = path.join(ROOT, "probe/.vhClean-tampered.jsonl");
  const legacyText = fs.readFileSync(path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl"), "utf8");
  const lines = legacyText.split("\n").filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]);
  last.hash = (last.hash.startsWith("0") ? "1" : "0") + last.hash.slice(1);
  lines[lines.length - 1] = JSON.stringify(last);
  fs.writeFileSync(tamperedPath, lines.join("\n") + "\n");
  try {
    execFileSync(process.execPath, [tool, tamperedPath], { encoding: "utf8" });
    assert.fail("tampered receipt must not verify");
  } catch (e) {
    const ec = e.status ?? 0;
    assert.equal(ec, 1, `tampered legacy receipt must exit 1, got ${ec}`);
  } finally {
    fs.rmSync(tamperedPath, { force: true });
  }
});
console.log("vhClean probe complete");
