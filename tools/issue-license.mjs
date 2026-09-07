#!/usr/bin/env node
/**
 * Founder-side Pro key issuance (MJ 11.9.4-Commercial).
 *
 *   node tools/issue-license.mjs --org "Acme" [--days 365|--perpetual] [--max-seats 25]
 *
 * Emits a key the app's Settings → License card verifies offline. The secret
 * here MUST match src/mission/licensing.ts VERIFY_SECRET for the commercial
 * build; rotate both together per release train.
 */
import crypto from "node:crypto";

const VERIFY_SECRET = "mj-commercial-v1-offline";
const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const org = get("--org") ?? "unnamed";
const days = get("--days");
const perpetual = args.includes("--perpetual");
const maxSeats = Number(get("--max-seats") ?? 10);

const payload = {
  edition: "pro",
  org,
  issued: new Date().toISOString(),
  expires: perpetual ? null : new Date(Date.now() + (Number(days) || 365) * 86_400_000).toISOString(),
  maxSeats,
};
const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = crypto.createHmac("sha256", VERIFY_SECRET).update(body).digest("base64url");
console.log(`${body}.${sig}`);
