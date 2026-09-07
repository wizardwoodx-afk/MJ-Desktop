import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/licensing.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/mission/licensing.ts
var VERIFY_SECRET = "mj-commercial-v1-offline";
var TRIAL_DAYS = 14;
var b64u = (bytes) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
var b64uStr = (s) => b64u(new TextEncoder().encode(s));
var unb64u = (s) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "===".slice((pad.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};
async function hmacB64u(data, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64u(new Uint8Array(sig));
}
async function issueLicenseKey(payload2, secret = VERIFY_SECRET) {
  const body = b64uStr(JSON.stringify(payload2));
  return `${body}.${await hmacB64u(body, secret)}`;
}
async function verifyLicenseKey(key, nowMs = Date.now(), secret = VERIFY_SECRET) {
  const [body, sig] = key.split(".");
  if (!body || !sig) return { ok: false, reason: "malformed key" };
  let payload2;
  try {
    payload2 = JSON.parse(unb64u(body));
  } catch {
    return { ok: false, reason: "payload not readable" };
  }
  const expect = await hmacB64u(body, secret);
  if (expect !== sig) return { ok: false, reason: "signature mismatch" };
  if (payload2.edition !== "pro") return { ok: false, reason: "not a pro payload" };
  if (payload2.expires && Date.parse(payload2.expires) < nowMs) return { ok: false, reason: `expired ${payload2.expires}` };
  return { ok: true, payload: payload2 };
}
function computeEdition(nowMs, license, trialStartedAt) {
  if (license && (!license.expires || Date.parse(license.expires) >= nowMs)) return "pro";
  if (trialStartedAt) {
    const days = (nowMs - Date.parse(trialStartedAt)) / 864e5;
    if (days >= 0 && days < TRIAL_DAYS) return "trial";
  }
  return "personal";
}

// probe/licensing.test.ts
var pass = 0;
var fail = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (s) => console.log(`
== ${s}`);
var ROOT = ".".length > 0 ? "." : process.cwd();
function declareRootCheck() {
  if (!fs.existsSync(path.join(ROOT, "package.json"))) {
    console.error("licensing: project root not found; rebuild with --define:MJ_ROOT");
    process.exit(2);
  }
}
var NOW = Date.parse("2026-09-05T12:00:00Z");
var payload = { edition: "pro", org: "Acme", issued: new Date(NOW - 864e5).toISOString(), expires: new Date(NOW + 364 * 864e5).toISOString(), maxSeats: 25 };
void (async () => {
  section("1. issuance + verification round-trip");
  const key = await issueLicenseKey(payload);
  const v = await verifyLicenseKey(key, NOW);
  ok("a freshly issued key verifies", v.ok === true, JSON.stringify(v));
  ok("the payload round-trips intact", v.ok && v.payload.org === "Acme" && v.payload.maxSeats === 25, v.ok ? JSON.stringify(v.payload) : "");
  section("2. tamper-evident, expiry-enforced");
  const [body, sig] = key.split(".");
  const badSig = await verifyLicenseKey(`${body}.${sig.slice(0, 4)}${sig[4] === "A" ? "B" : "A"}${sig.slice(5)}`, NOW);
  ok("a forged signature is rejected (signature mismatch)", badSig.ok === false && /signature/.test(badSig.ok ? "" : badSig.reason), JSON.stringify(badSig));
  const corrupted = await verifyLicenseKey(`${body.slice(0, 8)}@@@@${body.slice(12)}.${sig}`, NOW);
  ok("a corrupted body is rejected outright", corrupted.ok === false, JSON.stringify(corrupted));
  const expired = await issueLicenseKey({ ...payload, expires: new Date(NOW - 1e3).toISOString() });
  const ev = await verifyLicenseKey(expired, NOW);
  ok("an expired key is rejected with the date named", ev.ok === false && /expired/.test(ev.ok ? "" : ev.reason), JSON.stringify(ev));
  const wrongSecret = await issueLicenseKey(payload, "some-other-secret");
  const wv = await verifyLicenseKey(wrongSecret, NOW);
  ok("a key from another secret does not verify", wv.ok === false, JSON.stringify(wv));
  ok("the embedded verification secret is the published one", VERIFY_SECRET === "mj-commercial-v1-offline", VERIFY_SECRET);
  section("3. the edition clock is pure and honest");
  ok("valid pro license -> pro", computeEdition(NOW, payload, null) === "pro", "");
  ok("no license + fresh trial -> trial", computeEdition(NOW, null, new Date(NOW - 3 * 864e5).toISOString()) === "trial", "");
  ok(`trial ends after ${TRIAL_DAYS} days`, computeEdition(NOW + TRIAL_DAYS * 864e5, null, new Date(NOW).toISOString()) === "personal", "");
  ok("trial day 13 is still trial", computeEdition(NOW + 13 * 864e5, null, new Date(NOW).toISOString()) === "trial", "");
  ok("expired pro + dead trial -> personal (free tier, never locked out)", computeEdition(NOW, { ...payload, expires: new Date(NOW - 1).toISOString() }, new Date(NOW - 99 * 864e5).toISOString()) === "personal", "");
  section("4. the gate stays narrow (declared in licensing.ts)");
  declareRootCheck();
  const src = fs.readFileSync(path.join(ROOT, "src", "mission", "licensing.ts"), "utf8");
  ok("the honesty rule names the soft gate", /SOFT gate by design/.test(src), "");
  ok("free surface declared: canvas/harnesses/verification stay free", /free forever/.test(src), "");
  console.log(`
${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})();
