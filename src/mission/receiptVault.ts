/**
 * §RECEIPT VAULT — the Receipt & Compliance Center's ledger (MJ 11.9.9).
 *
 * receipts.ts can ISSUE a proof receipt and VERIFY one with no MJ state. The vault is the
 * layer between: the running record of every receipt MJ has issued, kept locally, so the
 * Compliance Center can answer the enterprise question — "show me the evidence for the
 * last N agent runs, and prove it has not been touched" — without leaving the machine.
 *
 * What this is, precisely:
 *   - a local ledger (localStorage-backed, capped) of issued ProofReceipts + gate verdict
 *   - an auditor: audit() re-runs verifyProofReceipt over EVERY stored receipt, so a
 *     tampered local copy is detected by MJ itself, not just by an external party
 *   - exporters: flat SIEM-ingestible JSONL, per-receipt JSONL (receiptToJsonl), and a
 *     compliance one-pager that states what MJ does and — with equal care — what it does
 *     not claim (MJ produces tamper-evident evidence; MJ is not a certification body)
 *
 * Node-import-safe: storage is guarded, exactly like agentTeam.ts and receipts.ts.
 */

import type { ProofReceipt } from "./receipts";
import { verifyProofReceipt } from "./receipts";
import type { MergeAttestation } from "./mergeExecutor";
import type { ProvenanceStatement } from "./provenance";

export interface VaultRecord {
  id: string;
  issuedAt: string;
  mission: string;
  teamId: string;
  /** The adversarial-gate verdict recorded at issue time ("n/a" pre-11.9.9 receipts). */
  gateStatus: "PASS" | "FAIL" | "BLOCKED" | "n/a";
  gateTier: string;
  receipt: ProofReceipt;
  /**
   * 11.10.1 — when the run's gated merge was EXECUTED, the signed attestation (with the
   * merge-commit sha) is attached here. The receipt chain itself is never modified: the
   * attestation rides alongside it as its own signed document.
   */
  mergeAttestation?: MergeAttestation;
  /**
   * 11.10.5 — the commit-bound provenance statement (in-toto-shaped): AI authorship +
   * independent verification, bound to the merge-commit sha. Rides beside the
   * attestation; the receipt chain is never re-written.
   */
  provenance?: ProvenanceStatement;
}

export const VAULT_CAP = 50;
const STORAGE_KEY = "mj.receiptvault.v1";

/* ------------------------------------------------------------------ */
/* RETENTION POLICY (11.10.5 — Verified AI Delivery V1)                */
/* ------------------------------------------------------------------
 * EU AI Act Art. 26(6): deployers of high-risk systems keep automated logs for AT LEAST
 * six months. MJ's vault is count-capped by necessity (localStorage), so the policy is
 * expressed honestly: a declared retention floor that records + exports honor and name,
 * not a guarantee browser storage cannot physically exceed. Default: 6 months.
 */
const RETENTION_KEY = "mj.retention.v1";
export const RETENTION_DEFAULT_MONTHS = 6;
export const RETENTION_OPTIONS = [6, 12, 24] as const;

export function loadRetentionPolicy(): number {
  try {
    const raw = globalThis.localStorage?.getItem(RETENTION_KEY);
    const n = raw === null ? NaN : Number(raw);
    return RETENTION_OPTIONS.includes(n as (typeof RETENTION_OPTIONS)[number]) ? n : RETENTION_DEFAULT_MONTHS;
  } catch {
    return RETENTION_DEFAULT_MONTHS;
  }
}

export function saveRetentionPolicy(months: number): void {
  try {
    if (RETENTION_OPTIONS.includes(months as (typeof RETENTION_OPTIONS)[number])) {
      globalThis.localStorage?.setItem(RETENTION_KEY, String(months));
    }
  } catch {
    /* in-memory only */
  }
}

/** Whether a record's declared retention floor is satisfied (export-and-clear is fine after). */
export function retentionStatus(issuedAt: string, months: number): { until: string; satisfied: boolean } {
  const t = new Date(issuedAt);
  t.setUTCMonth(t.getUTCMonth() + months);
  return { until: t.toISOString(), satisfied: Date.now() >= t.getTime() };
}

let seq = 0;

export class ReceiptVault {
  private records: VaultRecord[] | null = null;

  private ensure(): VaultRecord[] {
    if (this.records) return this.records;
    let loaded: VaultRecord[] = [];
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          loaded = parsed.filter(
            (r): r is VaultRecord =>
              Boolean(r && typeof r === "object" && (r as VaultRecord).receipt && Array.isArray((r as VaultRecord).receipt.events)),
          );
        }
      }
    } catch {
      loaded = [];
    }
    this.records = loaded;
    return loaded;
  }

  private persist(): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.ensure()));
    } catch {
      /* quota/unavailable — the in-memory ledger still serves this session */
    }
  }

  /** Store an issued receipt. Oldest records fall off at VAULT_CAP. */
  issue(input: { mission: string; teamId: string; gateStatus: VaultRecord["gateStatus"]; gateTier: string; receipt: ProofReceipt }): VaultRecord {
    const rec: VaultRecord = {
      id: `rcp_${Date.now().toString(36)}_${(seq++).toString(36)}`,
      issuedAt: new Date().toISOString(),
      mission: input.mission,
      teamId: input.teamId,
      gateStatus: input.gateStatus,
      gateTier: input.gateTier,
      receipt: input.receipt,
    };
    const list = this.ensure();
    list.unshift(rec);
    if (list.length > VAULT_CAP) list.length = VAULT_CAP;
    this.persist();
    return rec;
  }

  list(): VaultRecord[] {
    return [...this.ensure()];
  }

  get(id: string): VaultRecord | null {
    return this.ensure().find((r) => r.id === id) ?? null;
  }

  /**
   * 11.10.1 — attach the merge attestation to an EXISTING record (the receipt chain is
   * closed at issuance and is never re-written; the attestation is metadata beside it).
   */
  attachMergeAttestation(id: string, att: MergeAttestation): VaultRecord | null {
    const rec = this.ensure().find((r) => r.id === id);
    if (!rec) return null;
    rec.mergeAttestation = att;
    this.persist();
    return rec;
  }

  /** 11.10.5 — attach the commit-bound provenance statement beside the attestation. */
  attachProvenance(id: string, st: ProvenanceStatement): VaultRecord | null {
    const rec = this.ensure().find((r) => r.id === id);
    if (!rec) return null;
    rec.provenance = st;
    this.persist();
    return rec;
  }

  clear(): void {
    this.records = [];
    this.persist();
  }

  /**
   * Re-verify EVERY stored receipt's chain and seal. This is the vault's reason to exist:
   * tamper with a stored receipt and MJ itself names the broken record.
   */
  async audit(): Promise<{ total: number; valid: number; broken: Array<{ id: string; reason: string }> }> {
    const broken: Array<{ id: string; reason: string }> = [];
    const list = this.ensure();
    for (const rec of list) {
      const v = await verifyProofReceipt(rec.receipt);
      if (!v.ok) broken.push({ id: rec.id, reason: v.reason });
    }
    return { total: list.length, valid: list.length - broken.length, broken };
  }

  /**
   * Flat JSONL for SIEM ingestion: one object per line, receipt headers and events both
   * tagged with the vault record id, so a Splunk-style pipeline can group by run.
   * Chain-preserving because every event line is the event verbatim (hash included).
   */
  siemBundle(): string {
    const lines: string[] = [];
    for (const rec of this.ensure()) {
      lines.push(JSON.stringify({ type: "mj.receipt.header", vaultId: rec.id, gateStatus: rec.gateStatus, gateTier: rec.gateTier, format: rec.receipt.format, header: rec.receipt.header, seal: rec.receipt.seal }));
      for (const e of rec.receipt.events) {
        lines.push(JSON.stringify({ type: "mj.receipt.event", vaultId: rec.id, event: e }));
      }
    }
    return `${lines.join("\n")}\n`;
  }

  /**
   * The one-pager: what the evidence layer is, which control it serves, how an auditor
   * re-verifies it WITHOUT MJ, and — stated just as plainly — what MJ does not claim.
   */
  onePager(args: { mjVersion: string; edition: string }): string {
    const count = this.ensure().length;
    return [
      `# MJ — Agent Run Evidence & Compliance One-Pager`,
      ``,
      `MJ ${args.mjVersion} · edition: ${args.edition} · generated ${new Date().toISOString()} · receipts on file: ${count}`,
      ``,
      `## What MJ records`,
      `Every team mission can issue a **Proof Receipt** (\`mj-proof-receipt/2\`): a SHA-256`,
      `hash-chained event log of the facts MJ actually measured — mission status, each seat's`,
      `role/outcome/verification (with a deterministic seat identity digest when the harness is`,
      `known), and the adversarial-gate verdict — sealed with HMAC-SHA-256 AND, since 11.10.1,`,
      `signed with the local issuer's Ed25519 key over the final chain hash. Events are linked`,
      `(\`prev\` → \`hash\`), so any edit, insertion or deletion breaks the chain.`,
      ``,
      `## The adversarial verification gate (11.9.9) and merge authority (11.10 → 11.10.1)`,
      `MJ enforces that a run's output is verified by a **different harness than the one that`,
      `wrote it**. Self-verified runs are blocked (STRICT) or marked unverified (ADVISORY), and`,
      `the gate verdict is itself an event in the receipt chain. Since 11.10 the gate decides`,
      `whether a merge is **permitted**; since 11.10.1 the Merge Executor actually runs the gated`,
      `merge plan and records the merge-commit sha in a signed merge attestation.`,
      ``,
      `## Control mapping`,
      `- EU AI Act Art. 12 (transparency / record-keeping, tamper-evident logging): receipts are`,
      `  append-evident, hash-chained, issuer-signed, and exportable as JSONL for SIEM ingestion.`,
      `- ISO/IEC 42001 (AI management system): receipts + attestations form the documented,`,
      `  verifiable record of agent execution and human-gated merge decisions.`,
      `- SOC 2 (CC7/CC8 change management & monitoring): merge attestations name the gate verdict,`,
      `  any recorded override, and the exact commit that landed.`,
      ``,
      `## External verification (no MJ required)`,
      `1. Take the receipt JSONL. 2. Re-canonicalize each event body (recursive key sort),`,
      `3. re-hash the chain from the 64-zero genesis, 4. re-compute the HMAC seal with the`,
      `published verification secret, 5. verify the Ed25519 signature over the final chain hash`,
      `with the exported issuer public key. MJ ships this exact algorithm (verifyProofReceipt)`,
      `and any auditor can re-implement it from the format alone.`,
      ``,
      `## What MJ does NOT claim`,
      `MJ produces tamper-evident, issuer-signed evidence; it is not a certification body.`,
      `Control mappings above are a convenience crosswalk, not legal advice and not an audit`,
      `opinion. The issuer private key never leaves the machine that issued the receipts.`,
      ``,
    ].join("\n");
  }
}

export const globalReceiptVault = new ReceiptVault();
