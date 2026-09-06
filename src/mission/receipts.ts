/**
 * §PROOF RECEIPTS — cryptographically attestable run evidence (MJ 11.9.4-Redesign).
 *
 * THE DIFFERENTIATOR. Every orchestrator can *claim* a run happened. In 2026,
 * regulation and enterprise diligence demand receipts: the EU AI Act's
 * tamper-evident-logging enforcement (Art. 12, Aug 2026) and the IETF AAT/SCITT
 * receipt work all converge on hash-chained, externally verifiable action
 * logs. MJ is uniquely placed to issue them, because MJ never infers what it
 * can measure: exit codes, artifact branches, review-snapshot shas, costs read
 * from the CLI's own output — the receipt chains exactly those facts.
 *
 * SHAPE (JSONL-friendly, auditor-readable)
 *   header   — mission, team, started/finished, MJ version, license edition
 *   events   — one per measured fact; each carries `prev` + `hash`,
 *              hash = SHA-256( canonical(prev ‖ event-without-hash) )
 *   seal     — HMAC-SHA-256 over the final chain hash with the published
 *              verification secret (same honesty posture as licensing: a soft
 *              seal, externally re-computable; hardware/Ed25519 signing is on
 *              the enterprise roadmap and the schema already has room for it)
 *
 * VERIFY needs no MJ state: re-canonicalize, re-hash the chain, re-check the
 * seal. "We have logs" becomes evidence a third party can re-run.
 */
import { VERIFY_SECRET } from "./licensing";
import type { AutonomyRunSummary } from "./autonomyRuntime";

export interface ReceiptEvent {
  seq: number;
  ts: string;
  kind: string;
  seatId: string | null;
  data: Record<string, unknown>;
  prev: string;
  hash: string;
}

export interface ProofReceipt {
  format: "mj-proof-receipt/1";
  header: {
    mission: string;
    teamId: string;
    startedAt: string;
    finishedAt: string;
    mjVersion: string;
    edition: string;
    autonomyArms: string[];
  };
  events: ReceiptEvent[];
  seal: string;
}

const enc = new TextEncoder();
/** Deterministic canonical form: object keys sorted RECURSIVELY (the array
 *  replacer of JSON.stringify drops nested keys not in the list — that would
 *  make receipts blind to data tampering, which is the whole point). */
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}
const canon = (o: unknown): string => JSON.stringify(sortDeep(o));

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(s: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(s));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Build a receipt from the SAME measured summary the autonomy settlement consumes. */
export async function buildProofReceipt(args: {
  mission: string;
  teamId: string;
  startedAt: string;
  finishedAt: string;
  mjVersion: string;
  edition: string;
  report: AutonomyRunSummary;
}): Promise<ProofReceipt> {
  const { report } = args;
  const raw: Array<{ kind: string; seatId: string | null; data: Record<string, unknown> }> = [
    { kind: "mission.status", seatId: null, data: { status: report.status, reviewedBySnapshot: report.reviewedBySnapshot === true } },
    ...report.seats.map((s) => ({
      kind: "seat.outcome",
      seatId: s.seatId,
      data: { role: s.role, outcome: s.outcome, verified: s.verified },
    })),
    { kind: "mission.verdict", seatId: null, data: { verified: report.seats.some((s) => s.verified), arms: report.autonomyArms ?? [] } },
  ];

  const events: ReceiptEvent[] = [];
  let prev = "0".repeat(64);
  let seq = 0;
  for (const r of raw) {
    const ts = new Date().toISOString();
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
    mjVersion: args.mjVersion,
    edition: args.edition,
    autonomyArms: report.autonomyArms ?? [],
  };
  const seal = await hmacHex(prev, VERIFY_SECRET);
  return { format: "mj-proof-receipt/1", header, events, seal };
}

/** External verification: no MJ state, just the receipt and public constants. */
export async function verifyProofReceipt(rc: ProofReceipt): Promise<{ ok: true; events: number } | { ok: false; reason: string }> {
  if (rc.format !== "mj-proof-receipt/1") return { ok: false, reason: "unknown format" };
  let prev = "0".repeat(64);
  for (const e of rc.events) {
    if (e.prev !== prev) return { ok: false, reason: `chain broken at seq ${e.seq}` };
    const { hash, ...body } = e;
    const expect = await sha256hex(canon(body));
    if (expect !== hash) return { ok: false, reason: `hash mismatch at seq ${e.seq}` };
    prev = hash;
  }
  const seal = await hmacHex(prev, VERIFY_SECRET);
  if (seal !== rc.seal) return { ok: false, reason: "seal mismatch" };
  return { ok: true, events: rc.events.length };
}

/** JSONL export — human-readable, SIEM-ingestible, chain-preserving (IETF AAT guidance). */
export function receiptToJsonl(rc: ProofReceipt): string {
  const lines = [JSON.stringify({ receipt: rc.header, format: rc.format, seal: rc.seal }), ...rc.events.map((e) => JSON.stringify(e))];
  return `${lines.join("\n")}\n`;
}

export function receiptFromJsonl(text: string): ProofReceipt | null {
  try {
    const lines = text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as unknown);
    if (lines.length < 1) return null;
    const head = lines[0] as { receipt?: ProofReceipt["header"]; format?: string; seal?: string };
    if (!head.receipt || !head.seal) return null;
    return { format: (head.format as ProofReceipt["format"]) ?? "mj-proof-receipt/1", header: head.receipt, events: lines.slice(1) as ReceiptEvent[], seal: head.seal };
  } catch {
    return null;
  }
}
