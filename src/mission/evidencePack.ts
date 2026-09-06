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
import { loadRetentionPolicy } from "./receiptVault";
import { receiptToJsonl, verifyProofReceipt } from "./receipts";
import { exportIssuerPublicKeyDocument, signingSupported } from "./signing";
import { buildAibom, type Aibom } from "./aibom";
import type { ProvenanceStatement } from "./provenance";

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
  {
    control: "SOC 2 CC8.1 / SOX 404 — AI-code authorship (2026 auditor focus)",
    whatItAsksFor: "For AI-generated changes: who/what initiated the change, whether it was independently validated, and an accountable authorship trail — the assumption behind every change-management attestation.",
    whatMJProvides: "Commit-bound provenance statements: the merge commit as subject; writer seats (harness + identity digest) as materials; the cross-harness gate verdict + review-snapshot sha as the independent approval; executed merge steps as the implementation record.",
    artifact: "provenanceStatements[]",
  },
  {
    control: "NIST SP 800-218A / SLSA v1.2 (AI code provenance gap)",
    whatItAsksFor: "Provenance distinguishing AI-authored from human-authored source, captured in the layer that runs the agent — a category the current standards do not yet define.",
    whatMJProvides: "mj-provenance-statement/1: in-toto-shaped statements with an MJ predicate (builder, materials, verification, merge), signed with the issuer key — plus the AIBOM inventory of every AI component observed in receipts.",
    artifact: "provenanceStatements[], aibom",
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
    /** 11.10.5 — commit-bound provenance statements on file. */
    provenanceStatements: number;
    /** 11.10.5 — the deployer's declared log-retention floor in months (Art. 26(6) asks ≥6). */
    retentionMonths: number;
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
  /** 11.10.5 — commit-bound provenance statements (AI authorship + verification), verbatim. */
  provenanceStatements: Array<{ vaultId: string; statement: ProvenanceStatement }>;
  /** 11.10.5 — the AI Bill of Materials built from the receipts on file. */
  aibom: Aibom;
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
export async function buildEvidencePack(args: { vault: ReceiptVault; mjVersion: string; edition: string; ownedHarnesses: string[] }): Promise<EvidencePack> {
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

  // 11.10.5 — provenance statements + AIBOM join the pack.
  const provenanceStatements = records
    .filter((r) => r.provenance)
    .map((r) => ({ vaultId: r.id, statement: r.provenance as ProvenanceStatement }));
  const aibom = buildAibom({ records, ownedHarnesses: args.ownedHarnesses, mjVersion: args.mjVersion });

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
      provenanceStatements: provenanceStatements.length,
      retentionMonths: loadRetentionPolicy(),
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
    provenanceStatements,
    aibom,
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
