#!/usr/bin/env node
/**
 * verify-receipt — the standalone, zero-dependency verifier for MJ proof receipts
 * (MJ 14.1.1 — now with an EXTERNAL trust anchor).
 *
 *   node verify-receipt.mjs <receipt.jsonl | receipt.json | -> [--issuer-key <hex64 | @path>]
 *
 * THE TRUST MODEL (fixed in 14.1.1)
 * A signed receipt carries its own issuer public key; signature math alone can never
 * prove that key belongs to MJ — a forger can self-sign. Authenticity requires the
 * issuer key pinned OUT OF BAND: exchange MJ's issuer fingerprint once, then pin it
 * at every verification with --issuer-key. A v1 (seal-only) receipt makes no issuer
 * claim at all — it is tamper-EVIDENT by the published-constant seal, and says so.
 *
 * Verdicts and exit codes:
 *   0  VALID — chain + seal hold, and either the receipt is issuer-AUTHENTICATED
 *              against the trusted key you supplied, or it is a v1 seal-only receipt
 *              (no issuer claim exists to authenticate).
 *   1  INVALID — tampered, bad signature, or issuer key does NOT match the trusted key.
 *   3  integrity valid, issuer UNVERIFIED — a signed receipt verified mathematically
 *              but no trusted key was supplied. Never presented as authenticated.
 *   2  could not parse / bad usage.
 */
import fs from "node:fs";
import crypto from "node:crypto";

/* Each wire format is sealed with the constant published when that wire shipped (see licensing.ts).
   mj-proof-receipt/1|2 = pre-16.1 legacy wire — never renamed, old receipts stay verifiable. */
const SEAL_SECRETS = {
  "vh-proof-receipt/2": "vh-commercial-v1-offline",
  "mj-proof-receipt/2": "mj-commercial-v1-offline",
  "mj-proof-receipt/1": "mj-commercial-v1-offline",
};
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
const canon = (o) => JSON.stringify(sortDeep(o));
const sha256hex = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const hmacHex = (s, format) => crypto.createHmac("sha256", SEAL_SECRETS[format]).update(s, "utf8").digest("hex");
const keyFingerprint = (pubHex) => sha256hex(Buffer.from(pubHex, "hex").toString("latin1")).slice(0, 16);
const isHex64 = (s) => /^[0-9a-fA-F]{64}$/.test(s);

function trustedKeyFromArg(raw) {
  let value = raw;
  if (raw.startsWith("@")) value = fs.readFileSync(raw.slice(1), "utf8").trim();
  return isHex64(value) ? value.toLowerCase() : null;
}

function parseReceipt(text) {
  const trimmed = text.trim();
  // Single JSON object first; multi-line JSONL ALSO starts with "{", so a whole-text
  // parse only counts when it actually yields a receipt shape — otherwise fall
  // through to head-line + event-lines parsing.
  try {
    const whole = JSON.parse(trimmed);
    if (whole && Array.isArray(whole.events) && whole.seal) return whole;
  } catch {
    /* not a single JSON document — JSONL below */
  }
  const lines = trimmed.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  if (lines.length < 1 || !lines[0].receipt || !lines[0].seal) throw new Error("JSONL input does not start with a receipt head");
  const head = lines[0];
  return {
    format: head.format ?? "mj-proof-receipt/1",
    header: head.receipt,
    events: lines.slice(1),
    seal: head.seal,
    ...(head.issuer !== undefined ? { issuer: head.issuer } : {}),
    ...(head.signature !== undefined ? { signature: head.signature } : {}),
    ...(head.signatureNote !== undefined ? { signatureNote: head.signatureNote } : {}),
  };
}

function verify(rc) {
  if (rc.format !== "vh-proof-receipt/2" && rc.format !== "mj-proof-receipt/2" && rc.format !== "mj-proof-receipt/1") {
    return { ok: false, reason: `unknown format ${rc.format}` };
  }
  let prev = "0".repeat(64);
  for (const e of rc.events) {
    if (e.prev !== prev) return { ok: false, reason: `chain broken at seq ${e.seq}` };
    const { hash, ...body } = e;
    if (sha256hex(canon(body)) !== hash) return { ok: false, reason: `hash mismatch at seq ${e.seq}` };
    prev = hash;
  }
  if (hmacHex(prev, rc.format) !== rc.seal) return { ok: false, reason: "seal mismatch" };
  if ((rc.format === "vh-proof-receipt/2" || rc.format === "mj-proof-receipt/2") && rc.signature) {
    if (!rc.issuer?.publicKeyHex) return { ok: false, reason: "receipt is signed but carries no issuer public key" };
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(rc.issuer.publicKeyHex, "hex")]);
    const ok = crypto.verify(
      null,
      Buffer.from(prev, "hex"),
      crypto.createPublicKey({ key: spki, format: "der", type: "spki" }),
      Buffer.from(rc.signature, "hex"),
    );
    if (!ok) return { ok: false, reason: `issuer signature verification FAILED for chain head ${prev}` };
  }
  return { ok: true, events: rc.events.length, signed: Boolean(rc.signature) };
}

function main() {
  const args = process.argv.slice(2);
  let fileArg = null;
  let trustedRaw = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--issuer-key") {
      trustedRaw = args[i + 1];
      if (!trustedRaw) { console.error("usage: --issuer-key <hex64 | @path-to-key-file>"); process.exit(2); }
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log("usage: node verify-receipt.mjs <receipt.jsonl | receipt.json | -> [--issuer-key <hex64 | @path>]");
      process.exit(0);
    } else if (fileArg === null) {
      fileArg = args[i];
    } else {
      console.error(`unexpected argument: ${args[i]}`);
      process.exit(2);
    }
  }
  if (!fileArg) {
    console.error("usage: node verify-receipt.mjs <receipt.jsonl | receipt.json | -> [--issuer-key <hex64|@file>]  ('-' reads stdin)");
    process.exit(2);
  }
  let trusted = null;
  if (trustedRaw !== null) {
    trusted = trustedKeyFromArg(trustedRaw);
    if (!trusted) { console.error("INVALID ARGUMENT: --issuer-key must be 64 hex chars (an Ed25519 public key) or @path to a file holding one"); process.exit(2); }
  }

  let text;
  try {
    text = fileArg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(fileArg, "utf8");
  } catch (e) {
    console.error(`could not read input: ${e.message}`);
    process.exit(2);
  }
  let rc;
  try {
    rc = parseReceipt(text);
  } catch (e) {
    console.error(`INVALID: could not parse a receipt (${e.message})`);
    process.exit(2);
  }
  const v = verify(rc);
  if (!v.ok) {
    console.log(`INVALID: ${v.reason}`);
    process.exit(1);
  }

  const mission = rc.header?.mission ? ` mission="${rc.header.mission}"` : "";
  const recordedFp = rc.issuer?.publicKeyHex ? keyFingerprint(rc.issuer.publicKeyHex) : null;

  if (!v.signed) {
    console.log(`VALID (seal-only): ${rc.format}, ${v.events} event(s), tamper-EVIDENT via the published-constant seal${mission}. No issuer authenticity is claimed by this format.`);
    process.exit(0);
  }
  if (!trusted) {
    console.log(`VALID SIGNATURE: ${rc.format}, ${v.events} event(s)${mission}. Issuer UNVERIFIED: the key inside the receipt is SELF-REPORTED (fingerprint ${recordedFp}…) and a forger could supply their own. Re-run with --issuer-key <hex64|@file> to authenticate the issuer.`);
    process.exit(3);
  }
  const recordedKey = (rc.issuer?.publicKeyHex ?? "").toLowerCase();
  if (recordedKey !== trusted) {
    console.log(`INVALID: the receipt's issuer key does NOT match the trusted issuer.`);
    console.log(`  record key fingerprint:  ${recordedFp ?? "(none)"}…`);
    console.log(`  trusted key fingerprint: ${keyFingerprint(trusted)}…`);
    process.exit(1);
  }
  console.log(`VALID: ${rc.format}, ${v.events} event(s)${mission}. Issuer AUTHENTICATED against the trusted key (fingerprint ${recordedFp}…).`);
  process.exit(0);
}

main();
