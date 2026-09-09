/**
 * MJ 14.0 — the standalone receipt verifier (suite #79).
 *
 * "Verifiable with zero MJ state" must be a PRODUCT, not a sentence. This suite drives
 * tools/verify-receipt.mjs — a node:-builtins-only file with no MJ imports — against
 * receipts produced by src/mission/receipts.ts:
 *   §1 a fresh signed receipt verifies (exit 0, VALID)
 *   §2 a tampered event fails (exit 1, INVALID, reason named)
 *   §3 a v1 (seal-only) receipt still verifies — the format promise holds
 *   §4 the stdin path works for pipe-driven auditors
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
declare const MJ_ROOT: string | undefined;

import { buildProofReceipt, receiptToJsonl, type ProofReceipt } from "../src/mission/receipts";
import { ensureIssuerIdentity } from "../src/mission/signing";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}\n`);
}

const root = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();
const verifier = path.join(root, "tools", "verify-receipt.mjs");

ok("the standalone verifier exists and imports only node: builtins", fs.existsSync(verifier) &&
  [...fs.readFileSync(verifier, "utf8").matchAll(/from\s+"([^"]+)"/g)].every((m) => m[1].startsWith("node:")));

await ensureIssuerIdentity();

const receipt = async (): Promise<ProofReceipt> =>
  buildProofReceipt({
    mission: "audit-demo",
    teamId: "t1",
    startedAt: "2026-09-09T00:00:00.000Z",
    finishedAt: "2026-09-09T00:05:00.000Z",
    mjVersion: "14.0.0",
    edition: "personal",
    report: {
      status: "completed",
      reviewedBySnapshot: true,
      autonomyArms: ["verify:strict"],
      seats: [
        { seatId: "impl", role: "writer", outcome: "merged", verified: true, harness: "claude" },
        { seatId: "rev", role: "verifier", outcome: "approve", verified: true, harness: "codex" },
      ],
    },
  });

function runVerifier(input: { file?: string; stdin?: string; args?: string[] }): { code: number; out: string } {
  try {
    const out = execFileSync(
      process.execPath,
      [verifier, ...(input.args ?? []), input.file ?? "-"],
      { encoding: "utf8", input: input.stdin, stdio: input.stdin !== undefined ? ["pipe", "pipe", "pipe"] : undefined },
    );
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mj-verifier-"));

/* ── 1. fresh signed receipt — the trust model ── */
section("1. a signed receipt verifies, and the issuer key must be PINNED to authenticate");
{
  const rc = await receipt();
  const file = path.join(dir, "valid.jsonl");
  fs.writeFileSync(file, receiptToJsonl(rc));
  const r = runVerifier({ file });
  ok("without a pinned key: integrity holds, issuer honestly UNVERIFIED (exit 3)", r.code === 3, r.out);
  ok("says VALID SIGNATURE and names the self-reported key", r.out.includes("VALID SIGNATURE") && r.out.includes("UNVERIFIED"), r.out.trim());
  const auth = runVerifier({ file, args: ["--issuer-key", rc.issuer?.publicKeyHex ?? ""] });
  ok("with the matching trusted key: exit 0, issuer AUTHENTICATED", auth.code === 0 && auth.out.includes("AUTHENTICATED"), auth.out.trim());
  const wrong = runVerifier({ file, args: ["--issuer-key", "9".repeat(64)] });
  ok("with a wrong trusted key: INVALID (exit 1)", wrong.code === 1 && wrong.out.includes("does NOT match"), wrong.out.trim());
}

/* ── 2. tampered receipt ── */
section("2. a tampered receipt fails loudly");
{
  const rc = await receipt();
  rc.events[1].data.outcome = "rejected";
  const file = path.join(dir, "tampered.jsonl");
  fs.writeFileSync(file, receiptToJsonl(rc));
  const r = runVerifier({ file });
  ok("nonzero exit", r.code === 1, String(r.code));
  ok("says INVALID with the seq", r.out.includes("INVALID") && r.out.includes("seq 1"), r.out.trim());
}

/* ── 3. v1 seal-only receipts ── */
section("3. v1 (seal-only) receipts still verify — the format promise");
{
  const full = await receipt();
  const v1: Partial<ProofReceipt> & { format: "mj-proof-receipt/1"; header: ProofReceipt["header"]; events: ProofReceipt["events"]; seal: string } = {
    format: "mj-proof-receipt/1",
    header: full.header,
    events: full.events,
    seal: full.seal,
  };
  const file = path.join(dir, "v1.json");
  fs.writeFileSync(file, JSON.stringify(v1));
  const r = runVerifier({ file });
  ok("v1 exit 0", r.code === 0, r.out);
  ok("says seal-only", r.out.includes("seal-only"), r.out.trim());
}

/* ── 4. stdin path ── */
section("4. auditors can pipe receipts in");
{
  const jsonl = receiptToJsonl(await receipt());
  const r = runVerifier({ stdin: jsonl, args: ["--issuer-key", (await receipt()).issuer?.publicKeyHex ?? ""] });
  ok("piped receipt verifies with the pinned issuer key", r.code === 0 && r.out.includes("AUTHENTICATED"), r.out.trim());
  const bad = runVerifier({ stdin: jsonl.replace("\"outcome\":\"merged\"", "\"outcome\":\"stolen\"") });
  ok("piped tamper fails", bad.code === 1 && bad.out.includes("INVALID"), bad.out.trim());
}

fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
