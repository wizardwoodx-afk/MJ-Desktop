/**
 * EU AI Act Art. 50 & C2PA-Shaped Machine-Readable Provenance Manifest Generator.
 */

import { hashString, type Artifact } from "../domain/artifact";

export const PROVENANCE_MANIFEST_VERSION = "1.0.0";

export interface DerivedIngredient {
  artifactId: string;
  contentHash: string;
}

export interface ProvenanceClaim {
  artifactId: string;
  name: string;
  contentHash: string;
  synthetic: boolean;
  derivedFrom: DerivedIngredient[];
  toolsUsed: string[];
  modelsUsed: string[];
  harnessUsed: string;
  riskClass: string;
}

export interface ProvenanceLedgerMeta {
  head: string;
  entries: number;
  verified: boolean;
  brokenAt?: number;
}

export interface ProvenanceManifest {
  manifestVersion: string;
  missionId: string;
  orgId?: string;
  syntheticContent: boolean;
  generatedAt: string;
  generator: {
    name: string;
    version: string;
    harnesses: string[];
  };
  ledger: ProvenanceLedgerMeta;
  claims: ProvenanceClaim[];
  manifestHash: string;
}

export interface ManifestVerificationResult {
  ok: boolean;
  claims: number;
  problems: string[];
}

function computeManifestBodyHash(manifest: Omit<ProvenanceManifest, "manifestHash">): string {
  const normalized = JSON.stringify({
    manifestVersion: manifest.manifestVersion,
    missionId: manifest.missionId,
    orgId: manifest.orgId,
    syntheticContent: manifest.syntheticContent,
    generatedAt: manifest.generatedAt,
    generator: manifest.generator,
    ledger: manifest.ledger,
    claims: manifest.claims,
  });
  return hashString(normalized);
}

export function buildProvenanceManifest(
  artifacts: Artifact[],
  byId: Record<string, Artifact>,
  meta: {
    missionId: string;
    orgId?: string;
    generator: { name: string; version: string; harnesses: string[] };
    ledger: ProvenanceLedgerMeta;
    generatedAt: string;
  },
): ProvenanceManifest {
  const claims: ProvenanceClaim[] = artifacts.map((a) => {
    const derivedFrom: DerivedIngredient[] = (a.parentArtifacts || []).map((parentId) => {
      const parent = byId[parentId];
      return {
        artifactId: parentId,
        contentHash: parent ? parent.contentHash : "unknown",
      };
    });

    return {
      artifactId: a.id,
      name: a.name,
      contentHash: a.contentHash,
      synthetic: true,
      derivedFrom,
      toolsUsed: a.toolsUsed || [],
      modelsUsed: a.modelsUsed || [],
      harnessUsed: a.harnessUsed || "",
      riskClass: a.riskClass || "LOW",
    };
  });

  const partial = {
    manifestVersion: PROVENANCE_MANIFEST_VERSION,
    missionId: meta.missionId,
    orgId: meta.orgId,
    syntheticContent: true,
    generatedAt: meta.generatedAt,
    generator: meta.generator,
    ledger: meta.ledger,
    claims,
  };

  const manifestHash = computeManifestBodyHash(partial);

  return {
    ...partial,
    manifestHash,
  };
}

export function renderManifest(manifest: ProvenanceManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function verifyManifest(
  manifest: ProvenanceManifest,
  liveArtifactsById?: Record<string, Artifact>,
): ManifestVerificationResult {
  const problems: string[] = [];

  // 1. Verify manifest body hash
  const { manifestHash, ...body } = manifest;
  const expectedHash = computeManifestBodyHash(body);
  if (manifestHash !== expectedHash) {
    problems.push(`Manifest hash mismatch: expected ${expectedHash}, got ${manifestHash}`);
  }

  // 2. Verify ledger integrity
  if (!manifest.ledger.verified) {
    problems.push(`Underlying mission flight ledger integrity check failed (broken at entry ${manifest.ledger.brokenAt ?? "unknown"})`);
  }

  // 3. Verify against live artifacts (detect drift)
  if (liveArtifactsById) {
    for (const claim of manifest.claims) {
      const live = liveArtifactsById[claim.artifactId];
      if (live && live.contentHash !== claim.contentHash) {
        problems.push(`Artifact ${claim.artifactId} (${claim.name}) content changed since manifest was signed (drift detected)`);
      }
    }
  }

  return {
    ok: problems.length === 0,
    claims: manifest.claims.length,
    problems,
  };
}
