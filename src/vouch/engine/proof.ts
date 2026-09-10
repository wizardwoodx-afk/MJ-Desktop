/**
 * §PROOF — cryptographically attestable work evidence (Vouch 1.0).
 *
 * THE DIFFERENTIATOR. Every agent can *claim* a job happened. Vouch issues
 * receipts instead: tamper-evident, signed, independently verifiable.
 * "Every job vouched" — the claim is checkable by anyone, with zero Vouch
 * state: re-canonicalize, re-hash the chain, re-check the seal.
 *
 * PROTOCOL — `vh-proof-receipt/2`, the Vouch Harbor proof standard (16.1.0):
 * the legacy wire ("mj-proof-receipt/1|2") still verifies — one open verifier covers all receipts):
 *   format   — "vh-proof-receipt/2" (legacy "mj-proof-receipt/1|2" receipts still verify)
 *   header   — mission, team, started/finished, version (issuing product),
 *              edition, autonomyArms (empty for standalone Vouch)
 *   events   — one per measured fact; each carries `prev` + `hash`,
 *              hash = SHA-256( canonical(prev ‖ event-without-hash) )
 *   seal     — HMAC-SHA-256 over the final chain hash with the shared
 *              verification secret (soft seal, externally re-computable)
 *   issuer   — Ed25519 signature over the final chain hash where the runtime
 *              can sign; null + an honest note when it cannot.
 *
 * VERIFICATION — `node tools/verify-receipt.mjs receipt.jsonl` (zero
 * dependencies). The header's `version` field carries the ISSUING product's
 * version (the Vouch Harbor product line stamps here) — the
 * verifier treats the header as opaque, so both products verify identically.
 */
import { signChainHash, verifyIssuerSignature } from "./signing";

/**
 * Shared verification secret — IDENTICAL across the product (src/mission/licensing.ts
 * is the same constant the execution core uses). One secret by design: the seal is a
 * soft, re-computable tamper-evidence layer, and one secret is what lets the
 * same zero-dependency verifier check receipts from either product.
 */
export const VERIFY_SECRET = "vh-commercial-v1-offline";
/* Legacy wire secret — receipts sealed before 16.1.0 (formats mj-proof-receipt/1|2).
   NEVER rename: already-issued receipts must stay verifiable forever. */
export const LEGACY_SEAL_SECRET = "mj-commercial-v1-offline";
/* Each wire format is sealed with the constant published when that wire shipped. */
const SEAL_SECRET_BY_FORMAT = {
  "vh-proof-receipt/2": VERIFY_SECRET,
  "mj-proof-receipt/2": LEGACY_SEAL_SECRET,
  "mj-proof-receipt/1": LEGACY_SEAL_SECRET,
} as const;

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
  /**
   * vh-proof-receipt/2: chain + seal, plus `issuer`/`signature` — an
   * Ed25519 signature over the final chain hash, verifiable with the exported
   * public key alone. verifyProofReceipt accepts BOTH formats: v1 receipts
   * stay verifiable forever.
   */
  format: "vh-proof-receipt/2" | "mj-proof-receipt/2" | "mj-proof-receipt/1";
  header: {
    mission: string;
    teamId: string;
    startedAt: string;
    finishedAt: string;
    /** Issuing product's version (Vouch 1.x standalone; the Vouch Harbor product line, 16.x, after the merge). */
    version: string;
    edition: string;
    autonomyArms: string[];
  };
  events: ReceiptEvent[];
  seal: string;
  /** Issuer identity; null when the runtime could not sign (see signatureNote). */
  issuer?: { keyId: string; publicKeyHex: string } | null;
  /** Hex Ed25519 signature over the final chain hash; null when unsigned. */
  signature?: string | null;
  /** Present exactly when signature is null: what happened, honestly. */
  signatureNote?: string;
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

/**
 * The chained-receipt builder: an explicit event list → chain → seal →
 * issuer signature (or an honest null). Same shape as the execution core's minter.
 */
export async function buildChainedReceipt(args: {
  mission: string;
  teamId: string;
  startedAt: string;
  finishedAt: string;
  version: string;
  edition: string;
  events: Array<{ kind: string; seatId: string | null; data: Record<string, unknown> }>;
}): Promise<ProofReceipt> {
  const events: ReceiptEvent[] = [];
  let prev = "0".repeat(64);
  let seq = 0;
  for (const r of args.events) {
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
    version: args.version,
    edition: args.edition,
    autonomyArms: [] as string[],
  };
  const seal = await hmacHex(prev, VERIFY_SECRET);
  // A null signature says so, plainly — tamper-evidence never claims signing
  // it cannot prove.
  const sig = await signChainHash(prev);
  if (sig) {
    return {
      format: "vh-proof-receipt/2",
      header,
      events,
      seal,
      issuer: { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex },
      signature: sig.sigHex,
    };
  }
  return {
    format: "vh-proof-receipt/2",
    header,
    events,
    seal,
    issuer: null,
    signature: null,
    signatureNote: "This runtime has no Ed25519 (WebCrypto refused or is absent). The receipt is tamper-evident via its HMAC seal but NOT issuer-signed.",
  };
}

/**
 * External verification: no Vouch state, just the receipt and public
 * constants. Accepts BOTH mj-proof-receipt/1 and /2 — v1 receipts verify
 * exactly as before (chain + seal), v2 additionally checks the issuer
 * signature against the embedded public key.
 */
export async function verifyProofReceipt(rc: ProofReceipt): Promise<{ ok: true; events: number } | { ok: false; reason: string }> {
  const sealSecret = SEAL_SECRET_BY_FORMAT[rc.format as keyof typeof SEAL_SECRET_BY_FORMAT];
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

/** JSONL export — human-readable, SIEM-ingestible, chain-preserving (IETF AAT guidance). */
export function receiptToJsonl(rc: ProofReceipt): string {
  const head: Record<string, unknown> = { receipt: rc.header, format: rc.format, seal: rc.seal };
  if (rc.issuer !== undefined) head.issuer = rc.issuer;
  if (rc.signature !== undefined) head.signature = rc.signature;
  if (rc.signatureNote !== undefined) head.signatureNote = rc.signatureNote;
  const lines = [JSON.stringify(head), ...rc.events.map((e) => JSON.stringify(e))];
  return `${lines.join("\n")}\n`;
}

export function receiptFromJsonl(text: string): ProofReceipt | null {
  try {
    const lines = text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as unknown);
    if (lines.length < 1) return null;
    const head = lines[0] as {
      receipt?: ProofReceipt["header"];
      format?: string;
      seal?: string;
      issuer?: ProofReceipt["issuer"];
      signature?: ProofReceipt["signature"];
      signatureNote?: ProofReceipt["signatureNote"];
    };
    if (!head.receipt || !head.seal) return null;
    const out: ProofReceipt = {
      format: (head.format as ProofReceipt["format"]) ?? "mj-proof-receipt/1",
      header: head.receipt,
      events: lines.slice(1) as ReceiptEvent[],
      seal: head.seal,
    };
    if (head.issuer !== undefined) out.issuer = head.issuer;
    if (head.signature !== undefined) out.signature = head.signature;
    if (head.signatureNote !== undefined) out.signatureNote = head.signatureNote;
    return out;
  } catch {
    return null;
  }
}
