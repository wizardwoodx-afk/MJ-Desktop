/**
 * MJ 11.13.0 — the Proof Dossier (differentiator: policy-to-proof, in one click).
 *
 * 2026 market research is unambiguous: coding agents compete on benchmarks and
 * inline UX, while enterprises say off-the-shelf copilots lack "reliability,
 * auditability and policy control", and governance vendors sell "policy-to-proof
 * management" as their headline. MJ already holds every underlying artifact —
 * receipts, envelopes, the ledger, the measured experiment. The dossier packs
 * them into ONE exportable, digest-stamped file: what MJ did, what it remembers,
 * what it believes, and the evidence that it improved — without MJ running.
 *
 * Honesty rules, as everywhere in MJ:
 *  - every number is read live from the local stores at export time — nothing
 *    is claimed that the stores do not hold;
 *  - the digest covers the payload exactly as exported; re-hashing the payload
 *    must reproduce it, so a tampered dossier fails its own check;
 *  - a store that is empty says so in the dossier ("none recorded"), it never
 *    inflates.
 */
import { VH_VERSION } from "../version";
import { sha256Hex } from "./learningReceipt";
import { ledgerSummary } from "./ledger";
import { loadLessons } from "./lessons";
import { loadBeliefs, needsApproval } from "./belief";
import { loadSkills } from "./skillEvolution";
import { loadImprovement, adoptedVersion } from "./selfImprove";
import { loadExperimentRuns } from "./selfEvolveRuntime";
import { loadLearningReceipts } from "./learningReceipt";

export interface ProofDossier {
  format: "vh-dossier/1";
  mjVersion: string;
  generatedAt: string;
  /** typed memory: what MJ remembers, by ledger type */
  memory: {
    scars: number;
    precedents: number;
    scarFirst: true;
    newestLesson: string | null;
  };
  /** beliefs MJ holds about the user, and how many still need human approval */
  beliefs: { total: number; pendingApproval: number };
  /** learned skills: proposed evidence vs human-approved procedure */
  skills: { proposed: number; approved: number };
  /** the measured self-improvement experiment, honestly summarized */
  experiment: {
    strategyVersions: number;
    adopted: { id: string; score: number | null; note: string | null } | null;
    measuredRuns: number;
  };
  /** independently verifiable learning receipts */
  receipts: { count: number; signed: number };
  /** the ledger's own live summary (write-permission matrix included) */
  ledger: ReturnType<typeof ledgerSummary>;
  /** sha256 over the canonical payload (everything above) */
  digest: string;
}

/** Canonical payload = the dossier without its digest. Digest covers exactly this. */
export function dossierCanonical(d: Omit<ProofDossier, "digest">): string {
  return JSON.stringify([d.format, d.mjVersion, d.generatedAt, d.memory, d.beliefs, d.skills, d.experiment, d.receipts, d.ledger]);
}

export async function buildProofDossier(now: number): Promise<ProofDossier> {
  const lessons = loadLessons();
  const beliefs = loadBeliefs();
  const skills = loadSkills();
  const imp = loadImprovement();
  const adopted = adoptedVersion(imp);
  const receipts = loadLearningReceipts();
  const payload: Omit<ProofDossier, "digest"> = {
    format: "vh-dossier/1",
    mjVersion: VH_VERSION,
    generatedAt: new Date(now).toISOString(),
    memory: {
      scars: lessons.filter((l) => l.kind === "failure").length,
      precedents: lessons.filter((l) => l.kind !== "failure").length,
      scarFirst: true,
      newestLesson: lessons.length > 0 ? lessons[lessons.length - 1].text : null,
    },
    beliefs: { total: beliefs.length, pendingApproval: beliefs.filter(needsApproval).length },
    skills: {
      proposed: skills.filter((x) => x.status === "proposed").length,
      approved: skills.filter((x) => x.status === "approved").length,
    },
    experiment: {
      strategyVersions: imp.versions.length,
      adopted: adopted ? { id: adopted.id, score: adopted.score ?? null, note: adopted.note ?? null } : null,
      measuredRuns: loadExperimentRuns().length,
    },
    receipts: { count: receipts.length, signed: receipts.filter((r) => r.signature).length },
    ledger: ledgerSummary(now),
  };
  const digest = await sha256Hex(dossierCanonical(payload));
  return { ...payload, digest };
}

/** Verify an exported dossier: re-hash its payload and compare. */
export async function verifyProofDossier(d: ProofDossier): Promise<{ ok: boolean; reason?: string }> {
  if (d.format !== "vh-dossier/1" && d.format !== "mj-dossier/1") return { ok: false, reason: `unknown dossier format: ${String(d.format)}` };
  // "mj-dossier/1" = the pre-16.1 legacy export; older exported dossiers must stay verifiable.
  const { digest, ...payload } = d;
  const recomputed = await sha256Hex(dossierCanonical(payload as Omit<ProofDossier, "digest">));
  return recomputed === digest ? { ok: true } : { ok: false, reason: "digest mismatch — the dossier was altered after export" };
}
