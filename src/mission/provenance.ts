/**
 * §PROVENANCE STATEMENTS — commit-bound AI authorship evidence (MJ 11.10.5, Verified AI Delivery V1).
 *
 * THE VERTICAL GAP THIS CLOSES
 * SOC 2 CC8.1 / SOX 404 change-management attestations assume the approver authored (or
 * fully understood) the code. AI-written code breaks that assumption, and the standards
 * are behind: SLSA v1.2 has no AI-authorship category; NIST SP 800-218A does not
 * distinguish human-written from AI-generated source. Expert guidance says provenance
 * must be captured "in the layer that runs the agent, before the commit exists" — and
 * that layer is exactly MJ. So 11.10.5 emits an in-toto-shaped STATEMENT per executed
 * merge: the merge commit is the subject, and the predicate names who wrote it (seat,
 * role, harness, identity digest), what verification it passed (gate tier + snapshot
 * sha + cross-harness reviewers), and how it landed (merge steps, override if any).
 *
 * THE HONESTY RULES
 *  - Statements are only ever built from EXECUTED merges (result.executed === true with a
 *    real mergeCommitSha). A simulated or refused merge produces no provenance — there is
 *    nothing true to say about it.
 *  - Fields MJ cannot measure are absent, not invented: model versions, for example, are
 *    not claimed because CLIs do not report them to MJ.
 *  - The signature is Ed25519 over the canonicalized statement body, verified with the
 *    same issuer public key as receipts and attestations — one key, one audit path.
 */
import { signHexDigest } from "./signing";
import type { MergeExecutionResult } from "./mergeExecutor";
import type { GateVerdict } from "./verifyGate";
import type { MergeCandidate } from "./mergePlan";

export const MJ_PROVENANCE_PREDICATE_TYPE = "https://mj.desktop/provenance/v1";

export interface ProvenanceMaterial {
  seatId: string;
  role: string;
  harness: string;
  branch: string;
  /** Deterministic seat identity digest — the same sha256(seatId|role|harness) the receipt carries. */
  identity: string;
  verified: boolean;
  additions: number;
  deletions: number;
}

export interface ProvenanceStatement {
  _type: "https://in-toto.io/Statement/v1";
  format: "mj-provenance-statement/1";
  /** The thing this statement is ABOUT: the merged base branch at the merge commit. */
  subject: Array<{ name: string; digest: { gitCommit: string } }>;
  predicateType: string;
  predicate: {
    builder: { id: string };
    buildType: "mj.verified-team-run/v1";
    metadata: { mission: string; teamId: string; mjVersion: string; issuedAt: string };
    materials: ProvenanceMaterial[];
    verification: {
      gateStatus: string;
      gateTier: string;
      crossVerified: boolean;
      snapshotSha: string | null;
      reviewers: Array<{ seatId: string; harness: string; matchesSnapshot: boolean }>;
    };
    merge: {
      baseBranch: string;
      baseShaBefore: string | null;
      mergeCommitSha: string;
      stepsMerged: number;
      overrideRecorded: boolean;
      postMergeCheckOk: boolean | null;
    };
  };
  issuer: { keyId: string; publicKeyHex: string } | null;
  signature: string | null;
  signatureNote?: string;
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The signed-over body: everything except the signature fields themselves. */
export function provenanceBody(st: ProvenanceStatement): Record<string, unknown> {
  const { issuer: _i, signature: _s, signatureNote: _n, ...body } = st;
  return sortDeep(body) as Record<string, unknown>;
}

export async function buildProvenanceStatement(args: {
  mission: string;
  teamId: string;
  mjVersion: string;
  candidates: MergeCandidate[];
  gate: GateVerdict;
  merge: MergeExecutionResult;
  /** seatId → harness, straight from the run's measured SeatRecords. */
  harnessBySeat: Record<string, string>;
}): Promise<ProvenanceStatement | null> {
  // HONESTY RULE 1 — provenance exists only for merges that actually happened.
  if (!args.merge.executed || !args.merge.mergeCommitSha) return null;

  const materials: ProvenanceMaterial[] = [];
  for (const c of args.candidates.filter((c) => c.verified)) {
    const step = args.merge.steps.find((s) => s.branch === c.branch && s.ok);
    if (!step) continue; // a branch that did not land is not material of this commit
    materials.push({
      seatId: c.seatId,
      role: c.role,
      harness: harnessForSeat(c.seatId, args),
      branch: c.branch,
      identity: await sha256hex(`${c.seatId}|${c.role}|${harnessForSeat(c.seatId, args)}`),
      verified: true,
      additions: c.additions,
      deletions: c.deletions,
    });
  }

  const st: ProvenanceStatement = {
    _type: "https://in-toto.io/Statement/v1",
    format: "mj-provenance-statement/1",
    subject: [{ name: args.merge.baseBranch, digest: { gitCommit: args.merge.mergeCommitSha } }],
    predicateType: MJ_PROVENANCE_PREDICATE_TYPE,
    predicate: {
      builder: { id: `mj-desktop@${args.mjVersion}` },
      buildType: "mj.verified-team-run/v1",
      metadata: { mission: args.mission, teamId: args.teamId, mjVersion: args.mjVersion, issuedAt: new Date().toISOString() },
      materials,
      verification: {
        gateStatus: args.gate.status,
        gateTier: args.gate.tier,
        crossVerified: args.gate.crossVerified,
        snapshotSha: args.gate.evidence?.snapshotSha ?? null,
        reviewers: (args.gate.evidence?.reviewedBy ?? []).map((r) => ({ seatId: r.seatId, harness: r.harness, matchesSnapshot: r.matchesSnapshot })),
      },
      merge: {
        baseBranch: args.merge.baseBranch,
        baseShaBefore: args.merge.baseShaBefore,
        mergeCommitSha: args.merge.mergeCommitSha,
        stepsMerged: args.merge.steps.filter((s) => s.ok).length,
        overrideRecorded: args.merge.gate.overrideRecorded,
        postMergeCheckOk: args.merge.postMergeCheck.ran ? args.merge.postMergeCheck.ok : null,
      },
    },
    issuer: null,
    signature: null,
  };

  const digest = await sha256hex(JSON.stringify(provenanceBody(st)));
  const sig = await signHexDigest(digest);
  if (sig) {
    st.issuer = { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex };
    st.signature = sig.sigHex;
  } else {
    st.signatureNote = "Runtime has no Ed25519 — statement is unsigned (its contents are still fully recorded).";
  }
  return st;
}

/** Auditors: re-canonicalize, re-hash, verify Ed25519 with the embedded public key. */
export async function verifyProvenanceStatement(st: ProvenanceStatement): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (st.format !== "mj-provenance-statement/1") return { ok: false, reason: `unknown statement format: ${String(st.format)}` };
  if (!st.signature) return { ok: false, reason: st.signatureNote ?? "statement is unsigned" };
  if (!st.issuer?.publicKeyHex) return { ok: false, reason: "statement is signed but carries no issuer public key" };
  const digest = await sha256hex(JSON.stringify(provenanceBody(st)));
  const key = await crypto.subtle.importKey("raw", hexToBytes(st.issuer.publicKeyHex), { name: "Ed25519" }, false, ["verify"]).catch(() => null);
  if (!key) return { ok: false, reason: "issuer public key is not a valid Ed25519 key" };
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, hexToBytes(st.signature), hexToBytes(digest)).catch(() => false);
  return ok ? { ok: true } : { ok: false, reason: "signature verification FAILED against the embedded public key" };
}

/* Resolve a seat's harness: the run's measured record first (the caller passes it), then
   the gate evidence (verifier seats appear there), then "unknown" — an absent fact,
   never an invented one. */
function harnessForSeat(seatId: string, args: { candidates: MergeCandidate[]; gate: GateVerdict; harnessBySeat: Record<string, string> }): string {
  const measured = args.harnessBySeat[seatId];
  if (measured) return measured;
  const ev = args.gate.evidence;
  const hit = ev?.reviewedBy.find((r) => r.seatId === seatId);
  return hit?.harness ?? "unknown";
}
