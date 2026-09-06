/**
 * §EVIDENCE PACK — one exportable bundle for auditors, compliance and diligence (MJ 11.10.1).
 *
 * WHY THIS EXISTS
 * 11.9.9 built the evidence (receipts + vault), 11.10 built enforcement (the merge gate),
 * and 11.10.1 closes the loop with signature and execution. But enterprises and auditors do
 * not ask for features — they ask for a bundle. The Evidence Pack assembles everything MJ
 * has on file into ONE JSON document with an explicit control mapping, so "show me the
 * evidence for your agent runs" has a single answer: this file.
 *
 * THE HONESTY RULE
 * The mapping to EU AI Act / ISO 42001 / SOC 2 is a CONVENIENCE CROSSWALK. It says which
 * controls MJ's artifacts are relevant to; it does not say MJ satisfies them — that is a
 * judgment the customer's own compliance process must make. The pack says so, in writing,
 * inside itself.
 */

import type { ReceiptVault } from "./receiptVault";
import { receiptToJsonl, verifyProofReceipt } from "./receipts";
import { exportIssuerPublicKeyDocument, signingSupported } from "./signing";

export interface ControlMapping {
  control: string;
  whatItAsksFor: string;
  whatMJProvides: string;
  artifact: string;
}

/** The crosswalk, stated exactly as MJ stands behind it — relevant artifacts, not claims. */
export const EVIDENCE_CONTROL_MAPPINGS: ControlMapping[] = [
  {
    control: "EU AI Act — Art. 12 (record-keeping & logging)",
    whatItAsksFor: "Automatic recording of events over the system's lifetime, in a tamper-evident form, to enable traceability.",
    whatMJProvides: "Hash-chained, issuer-signed proof receipts recording measured run events (status, seat outcomes, gate verdict, snapshot shas), exportable as JSONL.",
    artifact: "receipts[].receiptJsonl",
  },
  {
    control: "EU AI Act — Art. 13 (transparency to deployers)",
    whatItAsksFor: "Instructions and capability information so deployers can interpret outputs.",
    whatMJProvides: "The one-pager and this pack's manifest: what MJ records, how it is verified externally, and what MJ does not claim.",
    artifact: "onePager, manifest",
  },
  {
    control: "ISO/IEC 42001 — Clause 8 (AI risk & impact assessment, documented operations)",
    whatItAsksFor: "Documented, verifiable records of AI system operation and the decisions made over them.",
    whatMJProvides: "Gate verdicts in-chain plus merge attestations naming the gate decision, any recorded override, and the merge-commit sha that landed.",
    artifact: "receipts[].gateStatus, mergeAttestations[]",
  },
  {
    control: "SOC 2 — CC7.2 / CC7.3 (monitor & evaluate security events)",
    whatItAsksFor: "Monitoring of system activity and evaluation of detected events.",
    whatMJProvides: "SIEM-ingestible JSONL (one object per line, tagged per run) for ingestion into the customer's existing monitoring pipeline.",
    artifact: "siemBundle",
  },
  {
    control: "SOC 2 — CC8.1 (change management: authorized, tested, approved changes)",
    whatItAsksFor: "Changes are authorized, tested, approved and implemented with an audit trail.",
    whatMJProvides: "The merge gate as authorization control, the repo's own check as the test, the recorded override/approval decision, and the merge-commit sha as the implementation record.",
    artifact: "mergeAttestations[]",
  },
];

export interface EvidencePack {
  format: "mj-evidence-pack/1";
  generatedAt: string;
  mjVersion: string;
  manifest: {
    receiptsOnFile: number;
    receiptsValidAtExport: number;
    receiptsBrokenAtExport: Array<{ id: string; reason: string }>;
    mergeAttestations: number;
    issuerSigningAvailable: boolean;
    note: string;
  };
  /** Every stored receipt, re-verified at export time, as JSONL verbatim (chain-preserving). */
  receipts: Array<{
    vaultId: string;
    mission: string;
    teamId: string;
    issuedAt: string;
    gateStatus: string;
    gateTier: string;
    validAtExport: boolean;
    verifyReason: string | null;
    receiptJsonl: string;
  }>;
  /** Signed merge attestations attached to vault records (11.10.1), verbatim. */
  mergeAttestations: Array<{ vaultId: string; attestation: unknown }>;
  siemBundle: string;
  onePager: string;
  issuerPublicKeyDocument: string | null;
  controlMappings: ControlMapping[];
  disclaimer: string;
}

/**
 * Assemble the pack from the vault's CURRENT contents. Every receipt is re-verified during
 * assembly — a locally tampered receipt is flagged inside the pack, not hidden by it.
 */
export async function buildEvidencePack(args: { vault: ReceiptVault; mjVersion: string; edition: string }): Promise<EvidencePack> {
  const records = args.vault.list();
  const receipts: EvidencePack["receipts"] = [];
  let validCount = 0;
  const broken: Array<{ id: string; reason: string }> = [];

  for (const rec of records) {
    const v = await verifyProofReceipt(rec.receipt);
    if (v.ok) validCount += 1;
    else broken.push({ id: rec.id, reason: v.reason });
    receipts.push({
      vaultId: rec.id,
      mission: rec.mission,
      teamId: rec.teamId,
      issuedAt: rec.issuedAt,
      gateStatus: rec.gateStatus,
      gateTier: rec.gateTier,
      validAtExport: v.ok,
      verifyReason: v.ok ? null : v.reason,
      receiptJsonl: receiptToJsonl(rec.receipt),
    });
  }

  const mergeAttestations = records
    .filter((r) => r.mergeAttestation)
    .map((r) => ({ vaultId: r.id, attestation: r.mergeAttestation as unknown }));

  const issuerDoc = await exportIssuerPublicKeyDocument(args.mjVersion);

  return {
    format: "mj-evidence-pack/1",
    generatedAt: new Date().toISOString(),
    mjVersion: args.mjVersion,
    manifest: {
      receiptsOnFile: records.length,
      receiptsValidAtExport: validCount,
      receiptsBrokenAtExport: broken,
      mergeAttestations: mergeAttestations.length,
      issuerSigningAvailable: signingSupported(),
      note:
        receipts.length === 0
          ? "No receipts are on file yet. Evidence is produced when team missions run and issue proof receipts."
          : broken.length === 0
            ? "All receipts on file re-verified clean at export time."
            : `${broken.length} receipt(s) FAILED re-verification at export time — see manifest.receiptsBrokenAtExport. They are included as-is so the breakage is visible, not hidden.`,
    },
    receipts,
    mergeAttestations,
    siemBundle: args.vault.siemBundle(),
    onePager: args.vault.onePager({ mjVersion: args.mjVersion, edition: args.edition }),
    issuerPublicKeyDocument: issuerDoc,
    controlMappings: EVIDENCE_CONTROL_MAPPINGS,
    disclaimer:
      "This pack is machine-verifiable evidence produced by MJ on the user's own machine. The control mappings are a convenience crosswalk prepared by the MJ project to help reviewers locate relevant artifacts; they are NOT a legal opinion, NOT an audit, and NOT a claim that MJ or its outputs satisfy any regulation or standard. Verification of the enclosed receipts requires no MJ software — see the one-pager's external-verification steps.",
  };
}

/** Pretty-printed JSON, stable key order by construction (objects built in fixed shape). */
export function evidencePackToJson(pack: EvidencePack): string {
  return JSON.stringify(pack, null, 2) + "\n";
}
