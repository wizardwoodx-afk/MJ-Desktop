#!/usr/bin/env node
/**
 * verify-mission-record — standalone, zero-dependency verifier for MJ Mission Records
 * (MJ 14.1.1 — now with an EXTERNAL trust anchor).
 *
 *   node verify-mission-record.mjs <record.json | -> [--issuer-key <hex64 | @path>]
 *
 * THE TRUST MODEL (fixed in 14.1.1 — the reviewer's forgery attack, closed)
 * A record carries its own issuer public key; signature math alone can NEVER prove
 * that key belongs to MJ — a forger can self-sign with their own key. Authenticity
 * therefore requires the issuer key to be PINNED OUT OF BAND: exchange MJ's issuer
 * fingerprint once (the app shows it; this verifier prints it), then pin it at every
 * verification with --issuer-key.
 *
 * Verdicts and exit codes:
 *   0  VALID — digest + signature + embedded evidence hold, AND the record's issuer
 *              key matches the trusted key you supplied (--issuer-key).
 *   1  INVALID — tampered, bad signature, or the issuer key does NOT match the
 *              trusted key.
 *   3  integrity valid, issuer UNVERIFIED — the signature holds but no trusted key
 *              was supplied (or the record is honestly unsigned). Never presented as
 *              issuer-authenticated.
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
  if (raw.startsWith("@")) {
    value = fs.readFileSync(raw.slice(1), "utf8").trim();
  }
  if (!isHex64(value)) return null;
  return value.toLowerCase();
}

function verifyProofReceipt(rc) {
  if (!SEAL_SECRETS[rc.format]) {
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
  if (rc.format === "mj-proof-receipt/2" && rc.signature) {
    if (!rc.issuer?.publicKeyHex) return { ok: false, reason: "receipt is signed but carries no issuer public key" };
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(rc.issuer.publicKeyHex, "hex")]);
    const ok = crypto.verify(null, Buffer.from(prev, "hex"), crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), Buffer.from(rc.signature, "hex"));
    if (!ok) return { ok: false, reason: `issuer signature verification FAILED for chain head ${prev}` };
  }
  return { ok: true, events: rc.events.length };
}

function verifyRecord(r) {
  const reasons = [];
  if (r.format !== "vh-mission-record/1" && r.format !== "mj-mission-record/1") reasons.push(`unknown format ${r.format}`);
  // "mj-mission-record/1" = pre-16.1 legacy record; older records stay verifiable.
  const { digest, issuer, signature, signatureNote, ...rest } = r;
  if (sha256hex(canon(rest)) !== digest) reasons.push("digest mismatch — the record was edited after sealing");
  if (signature) {
    if (!issuer?.publicKeyHex) reasons.push("record is signed but carries no issuer public key");
    else {
      const spki = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(issuer.publicKeyHex, "hex")]);
      const ok = crypto.verify(null, Buffer.from(digest, "hex"), crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), Buffer.from(signature, "hex"));
      if (!ok) reasons.push(`issuer signature verification FAILED for record digest ${digest.slice(0, 16)}…`);
    }
  } else if (!signatureNote) {
    reasons.push("unsigned record carries no signatureNote — an unsigned record must say so");
  }
  (r.evidence ?? []).forEach((entry, i) => {
    const fresh = verifyProofReceipt(entry.receipt);
    if (entry.verification.ok !== fresh.ok) reasons.push(`evidence[${i}]: recorded verdict does not match live verification`);
    else if (!fresh.ok && entry.verification.reason !== fresh.reason) reasons.push(`evidence[${i}]: the recorded break reason was altered`);
  });
  return reasons;
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
      console.log("usage: node verify-mission-record.mjs <record.json | -> [--issuer-key <hex64 | @path>]");
      process.exit(0);
    } else if (fileArg === null) {
      fileArg = args[i];
    } else {
      console.error(`unexpected argument: ${args[i]}`);
      process.exit(2);
    }
  }
  if (!fileArg) {
    console.error("usage: node verify-mission-record.mjs <record.json | -> [--issuer-key <hex64 | @path>]  ('-' reads stdin)");
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
  let r;
  try {
    r = JSON.parse(text);
  } catch (e) {
    console.error(`INVALID: could not parse a mission record (${e.message})`);
    process.exit(2);
  }

  const reasons = verifyRecord(r);
  if (reasons.length > 0) {
    console.log(`INVALID: ${reasons.join("; ")}`);
    process.exit(1);
  }

  const cycles = r.cycles?.length ?? 0;
  const receipts = r.evidence?.length ?? 0;
  const recordedFp = r.issuer?.publicKeyHex ? keyFingerprint(r.issuer.publicKeyHex) : null;

  if (!r.signature) {
    console.log(`VALID DIGEST — mission="${r.mission}" ${cycles} cycle(s), ${receipts} receipt(s). The record is UNSIGNED (honestly noted): integrity holds, no issuer authenticity is claimed.`);
    console.log(recordedFp ? `record issuer fingerprint: ${recordedFp}… (self-reported)` : "the record names no issuer key at all.");
    process.exit(3);
  }

  if (!trusted) {
    console.log(`VALID SIGNATURE — mission="${r.mission}" ${cycles} cycle(s), ${receipts} receipt(s). Issuer UNVERIFIED: the key inside the record is SELF-REPORTED (fingerprint ${recordedFp}…) and a forger could supply their own. Re-run with --issuer-key <hex64|@file> to authenticate the issuer.`);
    process.exit(3);
  }

  const recordedKey = (r.issuer?.publicKeyHex ?? "").toLowerCase();
  if (recordedKey !== trusted) {
    console.log(`INVALID: the record's issuer key does NOT match the trusted issuer.`);
    console.log(`  record key fingerprint:  ${recordedFp ?? "(none)"}…`);
    console.log(`  trusted key fingerprint: ${keyFingerprint(trusted)}…`);
    console.log("Do not trust this record. Exchange fingerprints out-of-band and retry, or obtain the record from a genuine MJ issuer.");
    process.exit(1);
  }

  console.log(`VALID — mission="${r.mission}" ${cycles} cycle(s), ${receipts} receipt(s). Issuer AUTHENTICATED against the trusted key (fingerprint ${recordedFp}…).`);
  process.exit(0);
}

main();
