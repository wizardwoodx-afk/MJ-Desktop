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

export interface VaultRecord {
  id: string;
  issuedAt: string;
  mission: string;
  teamId: string;
  /** The adversarial-gate verdict recorded at issue time ("n/a" pre-11.9.9 receipts). */
  gateStatus: "PASS" | "FAIL" | "BLOCKED" | "n/a";
  gateTier: string;
  receipt: ProofReceipt;
}

export const VAULT_CAP = 50;
const STORAGE_KEY = "mj.receiptvault.v1";

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
      `Every team mission can issue a **Proof Receipt** (\`mj-proof-receipt/1\`): a SHA-256`,
      `hash-chained event log of the facts MJ actually measured — mission status, each seat's`,
      `role/outcome/verification, and the adversarial-gate verdict — sealed with HMAC-SHA-256.`,
      `Events are linked (\`prev\` → \`hash\`), so any edit, insertion or deletion breaks the chain.`,
      ``,
      `## The adversarial verification gate (11.9.9)`,
      `Since 11.9.9, MJ enforces that a run's output is verified by a **different harness than`,
      `the one that wrote it**. Self-verified runs are blocked (STRICT) or marked unverified`,
      `(ADVISORY), and the gate verdict is itself an event in the receipt chain.`,
      ``,
      `## Control mapping`,
      `- EU AI Act Art. 12 (transparency / record-keeping, tamper-evident logging): receipts are`,
      `  append-evident, hash-chained, and exportable as JSONL for SIEM ingestion.`,
      `- Audit trail: each receipt names the team, mission, seat outcomes and MJ version, with no`,
      `  inferred data — exit codes, snapshot shas and parsed CLI usage only.`,
      `- Export formats: per-receipt JSONL (receiptToJsonl) and flat SIEM bundle (vault.siemBundle).`,
      ``,
      `## External verification (no MJ required)`,
      `1. Take the receipt JSONL. 2. Re-canonicalize each event body (recursive key sort),`,
      `3. re-hash the chain from the 64-zero genesis, 4. re-compute the HMAC seal with the`,
      `published verification secret. MJ ships this exact algorithm (verifyProofReceipt) and any`,
      `auditor can re-implement it from the format alone.`,
      ``,
      `## What MJ does NOT claim`,
      `MJ produces tamper-evident evidence; it is not a certification body. The HMAC seal is a`,
      `published-secret seal (externally re-computable); hardware/Ed25519 signing is on the`,
      `enterprise roadmap and the schema reserves room for it. This is not legal advice.`,
      ``,
    ].join("\n");
  }
}

export const globalReceiptVault = new ReceiptVault();
