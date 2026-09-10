/**
 * §Commercial licensing probe (MJ 11.9.4-Commercial, suite added with the gate).
 *
 * Pins the licensing contract: keys are HMAC-signed and tamper-evident,
 * expiry is enforced, the trial clock is pure and probe-friendly, and the
 * Pro gate is NARROW (declared free-tier surface stays free).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  TRIAL_DAYS,
  VERIFY_SECRET,
  computeEdition,
  issueLicenseKey,
  verifyLicenseKey,
  type LicensePayload,
 LEGACY_SEAL_SECRET,} from "../src/mission/licensing";

let pass = 0;
let fail = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (s: string) => console.log(`\n== ${s}`);

declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();
function declareRootCheck(): void {
  if (!fs.existsSync(path.join(ROOT, "package.json"))) {
    console.error("licensing: project root not found; rebuild with --define:MJ_ROOT");
    process.exit(2);
  }
}

const NOW = Date.parse("2026-09-05T12:00:00Z");
const payload: LicensePayload = { edition: "pro", org: "Acme", issued: new Date(NOW - 86_400_000).toISOString(), expires: new Date(NOW + 364 * 86_400_000).toISOString(), maxSeats: 25 };

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
  const expired = await issueLicenseKey({ ...payload, expires: new Date(NOW - 1000).toISOString() });
  const ev = await verifyLicenseKey(expired, NOW);
  ok("an expired key is rejected with the date named", ev.ok === false && /expired/.test(ev.ok ? "" : ev.reason), JSON.stringify(ev));
  const wrongSecret = await issueLicenseKey(payload, "some-other-secret");
  const wv = await verifyLicenseKey(wrongSecret, NOW);
  ok("a key from another secret does not verify", wv.ok === false, JSON.stringify(wv));
  ok("the embedded verification secret is the published one", VERIFY_SECRET === "vh-commercial-v1-offline", VERIFY_SECRET);
  ok("the legacy wire secret is preserved for pre-16.1 receipts", LEGACY_SEAL_SECRET === "mj-commercial-v1-offline", LEGACY_SEAL_SECRET);

  section("3. the edition clock is pure and honest");
  ok("valid pro license -> pro", computeEdition(NOW, payload, null) === "pro", "");
  ok("no license + fresh trial -> trial", computeEdition(NOW, null, new Date(NOW - 3 * 86_400_000).toISOString()) === "trial", "");
  ok(`trial ends after ${TRIAL_DAYS} days`, computeEdition(NOW + TRIAL_DAYS * 86_400_000, null, new Date(NOW).toISOString()) === "personal", "");
  ok("trial day 13 is still trial", computeEdition(NOW + 13 * 86_400_000, null, new Date(NOW).toISOString()) === "trial", "");
  ok("expired pro + dead trial -> personal (free tier, never locked out)", computeEdition(NOW, { ...payload, expires: new Date(NOW - 1).toISOString() }, new Date(NOW - 99 * 86_400_000).toISOString()) === "personal", "");

  section("4. the gate stays narrow (declared in licensing.ts)");
  declareRootCheck();
  const src = fs.readFileSync(path.join(ROOT, "src", "mission", "licensing.ts"), "utf8");
  ok("the honesty rule names the soft gate", /SOFT gate by design/.test(src), "");
  ok("free surface declared: canvas/harnesses/verification stay free", /free forever/.test(src), "");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})();
