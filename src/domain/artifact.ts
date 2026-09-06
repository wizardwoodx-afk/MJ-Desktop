/**
 * Artifact Domain Model and Cross-Language Hash Utility.
 *
 * Provides cryptographic/FNV-1a 32-bit stable hashing for artifact state,
 * verified on both sides of the TypeScript <-> Rust boundary.
 */

export interface Artifact {
  id: string;
  missionId: string;
  orgId: string;
  lineageId: string;
  version: number;
  name: string;
  contentType: "TEXT" | "JSON" | "MARKDOWN" | "BINARY" | "CODE";
  content: string;
  contentHash: string;
  createdBy: string;
  modifiedBy: string[];
  inputs: string[];
  parentArtifacts: string[];
  toolsUsed: string[];
  modelsUsed: string[];
  harnessUsed: string;
  costUsd: number;
  latencyMs: number;
  approvalState: "PENDING" | "APPROVED" | "REJECTED";
  riskClass: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  provenance: string;
  createdAt: string;
  tags: string[];
}

/**
 * Computes a stable 32-bit FNV-1a hash formatted as an 8-character lowercase hex string.
 * Operates over UTF-8 encoded bytes for exact parity with Rust `fnv1a`.
 */
export function hashString(str: string): string {
  // If in browser without Node Buffer, encode via TextEncoder
  let bytes: Uint8Array;
  if (typeof Buffer !== "undefined") {
    bytes = Buffer.from(str, "utf8");
  } else {
    bytes = new TextEncoder().encode(str);
  }

  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
