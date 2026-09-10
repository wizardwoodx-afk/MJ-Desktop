/**
 * §MERGE EXECUTOR — the gate becomes a merge (MJ 11.10.1).
 *
 * WHY THIS EXISTS
 * Through 11.10, MJ's merge story ended at the gate: enforceMergeGate said whether a merge
 * was PERMITTED, and the Merge Plan said HOW — but no component actually ran the merge.
 * The 11.10.1 Merge Executor closes that loop: it takes the gated plan, executes the real
 * git commands step by step, and records the resulting merge-commit sha — the fact that
 * turns "the gate controls whether a merge is permitted" into "MJ merged, and here is the
 * commit that proves it."
 *
 * THE HONESTY RULES (carried from mergePlan.ts, unchanged)
 *  - Never execute unless the merge gate allowed it OR the user recorded an explicit,
 *    named override. A blocked gate is a hard stop, not a warning.
 *  - A plan with problems, or with zero steps, is refused — refusal is the result, not
 *    an exception.
 *  - On a host without git (the browser/dev preview), the executor does not pretend:
 *    it returns simulated=true with executed=false and says exactly why. A receipt that
 *    says "simulated" can never be mistaken for a merge that happened.
 *  - Post-merge check failures do not roll git back — they are RECORDED. The user sees
 *    "merged to <sha>, but the combined suite failed", which is the truthful state a
 *    human must decide on.
 */
import type { MergePlan } from "./mergePlan";
import { interpretMergeTree } from "./mergePlan";
import { signHexDigest } from "./signing";

export interface GitResult {
  code: number;
  out: string;
  err: string;
}

/** Injected command runner: git for merge steps, repo commands for the post-merge check. */
export type CommandFn = (argv: string[]) => Promise<GitResult>;

export interface MergeExecutorInput {
  plan: MergePlan;
  baseBranch: string;
  /** The merge-gate result for this run (verifyGate.enforceMergeGate). */
  gate: { status: string; tier: string; allowed: boolean; reason: string; overrideRequired: boolean };
  /** Present ONLY when a user explicitly overrode a blocked gate. Recorded into the attestation. */
  overrideRecorded?: { by: string; at: string; note: string } | null;
  git: CommandFn;
  /** Repo command runner for postMergeCheck; when absent, the check is reported as not-runnable. */
  runRepoCommand?: CommandFn;
  /** True when this host cannot reach real git; the executor then refuses to claim a merge. */
  simulated?: boolean;
  mjVersion: string;
}

export interface MergeStepResult {
  order: number;
  branch: string;
  seatId: string;
  ok: boolean;
  /** One line per executed argv, in order — the audit trail of the merge itself. */
  commands: Array<{ argv: string[]; code: number; detail: string }>;
}

export interface MergeExecutionResult {
  executed: boolean;
  /** Present exactly when executed=false: the refusal or failure reason. */
  refusedReason?: string;
  startedAt: string;
  finishedAt: string;
  baseBranch: string;
  simulated: boolean;
  /** sha of HEAD on the base branch BEFORE the first merge step. */
  baseShaBefore: string | null;
  /** sha of HEAD on the base branch AFTER the last merge step — the merge-commit sha. */
  mergeCommitSha: string | null;
  preflight: Array<{ a: string; b: string; clean: boolean; conflicted: string[]; detail: string }>;
  steps: MergeStepResult[];
  postMergeCheck: { ran: boolean; ok: boolean | null; detail: string };
  cleanup: Array<{ argv: string[]; ok: boolean }>;
  gate: { status: string; tier: string; allowed: boolean; overrideRecorded: boolean };
}

async function revParse(git: CommandFn, ref: string): Promise<string | null> {
  const r = await git(["rev-parse", ref]);
  if (r.code !== 0) return null;
  const sha = r.out.trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/**
 * Execute the gated merge plan. Returns a result object in every case — refusals,
 * conflicts and failures are RESULTS here, never exceptions, so the caller can record
 * them into the receipt vault verbatim.
 */
export async function executeMergePlan(input: MergeExecutorInput): Promise<MergeExecutionResult> {
  const startedAt = new Date().toISOString();
  const base = (msg: string, extra?: Partial<MergeExecutionResult>): MergeExecutionResult => ({
    executed: false,
    refusedReason: msg,
    startedAt,
    finishedAt: new Date().toISOString(),
    baseBranch: input.baseBranch,
    simulated: input.simulated === true,
    baseShaBefore: null,
    mergeCommitSha: null,
    preflight: [],
    steps: [],
    postMergeCheck: { ran: false, ok: null, detail: "not run" },
    cleanup: [],
    gate: { status: input.gate.status, tier: input.gate.tier, allowed: input.gate.allowed, overrideRecorded: Boolean(input.overrideRecorded) },
    ...extra,
  });

  // RULE 1 — the gate is the gate. No override record, no execution.
  if (!input.gate.allowed && !input.overrideRecorded) {
    return base(`Merge REFUSED by the verification gate (${input.gate.status}, tier ${input.gate.tier}): ${input.gate.reason}. Nothing was merged. Record an explicit override to proceed anyway — MJ will name it in the attestation.`);
  }

  // RULE 2 — a plan is either clean or it is a refusal.
  if (input.plan.problems.length > 0) {
    return base(`Merge REFUSED: the plan itself reports problems: ${input.plan.problems.join(" ")}`);
  }
  if (input.plan.steps.length === 0) {
    return base("Merge REFUSED: the plan has no steps. Nothing was verified, changed, or mergeable — there is nothing to execute.");
  }

  // RULE 3 — honesty about the host. Simulated hosts plan but never claim to merge.
  if (input.simulated) {
    return base("This host has no git access (browser/dev preview), so the merge was planned but NOT executed. Re-run from the desktop app to merge for real.");
  }

  const preflight: MergeExecutionResult["preflight"] = [];
  const steps: MergeStepResult[] = [];
  const cleanup: MergeExecutionResult["cleanup"] = [];

  // Pre-flight: three-way merge in memory for every unordered pair. A conflict here stops
  // everything BEFORE any branch is touched.
  for (const p of input.plan.preflight) {
    const r = await input.git(p.argv);
    const interp = interpretMergeTree(r.code, r.out);
    preflight.push({
      a: p.a,
      b: p.b,
      clean: interp.clean,
      conflicted: interp.conflicted,
      detail: interp.error ?? (interp.clean ? "clean" : `conflict in: ${interp.conflicted.join(", ") || "(no paths listed)"}`),
    });
    if (interp.error || !interp.clean) {
      return base(
        `Merge REFUSED at pre-flight: ${p.a} vs ${p.b} — ${interp.error ?? `conflicting paths: ${interp.conflicted.join(", ") || "(see git output)"}`}. No branch was merged.`,
        { preflight },
      );
    }
  }

  // Where the base branch points before anything lands.
  const baseShaBefore = await revParse(input.git, input.baseBranch);

  // RULE 4 — serialize. Steps run in plan order; a failing step stops the run and leaves
  // the repository exactly where git left it (no invented rollback, no silent continue).
  let failed: { step: MergeStepResult; code: number; argv: string[]; err: string } | null = null;
  for (const step of [...input.plan.steps].sort((a, b) => a.order - b.order)) {
    const rec: MergeStepResult = { order: step.order, branch: step.branch, seatId: step.seatId, ok: false, commands: [] };
    steps.push(rec);
    for (const argv of step.argv) {
      const r = await input.git(argv);
      const detail = r.code === 0 ? "ok" : (r.err.trim() || r.out.trim() || `exit ${r.code}`).split("\n")[0] ?? `exit ${r.code}`;
      rec.commands.push({ argv, code: r.code, detail });
      if (r.code !== 0) {
        failed = { step: rec, code: r.code, argv, err: detail };
        break;
      }
    }
    if (!failed) rec.ok = true;
    if (failed) break;
  }

  if (failed) {
    return base(
      `Merge FAILED at step ${failed.step.order} (${failed.step.branch}): git ${failed.argv.join(" ")} exited ${failed.code} — ${failed.err}. Steps after it were NOT attempted; the repository is left exactly where git left it.`,
      { preflight, steps, baseShaBefore },
    );
  }

  // RULE 5 — the combined state on the base branch is the only truth. Run the repo's own
  // check when one was planned; report honestly when it could not run.
  const pmc: MergeExecutionResult["postMergeCheck"] = { ran: false, ok: null, detail: "not run" };
  if (input.plan.postMergeCheck.length > 0) {
    if (input.runRepoCommand) {
      const r = await input.runRepoCommand(input.plan.postMergeCheck);
      pmc.ran = true;
      pmc.ok = r.code === 0;
      pmc.detail = r.code === 0 ? `exit 0: ${input.plan.postMergeCheck.join(" ")}` : `exit ${r.code}: ${(r.err.trim() || r.out.trim()).split("\n")[0] ?? ""}`;
    } else {
      pmc.detail = `planned (${input.plan.postMergeCheck.join(" ")}) but this host has no repo-command runner — the combined suite was NOT executed. Do not treat the merge as validated.`;
    }
  } else {
    pmc.detail = "no post-merge check was planned for this team";
  }

  // RULE 6 — clean up only after a full success, and never let cleanup hide the result.
  for (const argv of input.plan.cleanup) {
    const r = await input.git(argv);
    cleanup.push({ argv, ok: r.code === 0 });
  }

  const mergeCommitSha = await revParse(input.git, "HEAD");

  return {
    executed: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    baseBranch: input.baseBranch,
    simulated: false,
    baseShaBefore,
    mergeCommitSha,
    preflight,
    steps,
    postMergeCheck: pmc,
    cleanup,
    gate: { status: input.gate.status, tier: input.gate.tier, allowed: input.gate.allowed, overrideRecorded: Boolean(input.overrideRecorded) },
  };
}

/* ------------------------------------------------------------------ */
/* SIGNED MERGE ATTESTATION                                            */
/* ------------------------------------------------------------------ */

export interface MergeAttestation {
  format: "vh-merge-attestation/1";
  issuedAt: string;
  mjVersion: string;
  baseBranch: string;
  executed: boolean;
  simulated: boolean;
  refusedReason?: string;
  gate: MergeExecutionResult["gate"];
  stepsMerged: Array<{ order: number; branch: string; seatId: string }>;
  baseShaBefore: string | null;
  /** THE fact the 11.10.1 release exists to produce. */
  mergeCommitSha: string | null;
  postMergeCheck: MergeExecutionResult["postMergeCheck"];
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

/** Canonical payload = the attestation minus its own signature fields. */
export function mergeAttestationPayload(a: MergeAttestation): Record<string, unknown> {
  const { issuer: _i, signature: _s, signatureNote: _n, ...payload } = a;
  return sortDeep(payload) as Record<string, unknown>;
}

/**
 * Turn a merge execution result into a signed attestation. The signature covers the
 * canonicalized payload, so any auditor holding the issuer public key can verify MJ's
 * claim — including the merge-commit sha — offline.
 */
export async function buildMergeAttestation(result: MergeExecutionResult, mjVersion: string): Promise<MergeAttestation> {
  const att: MergeAttestation = {
    format: "vh-merge-attestation/1",
    issuedAt: new Date().toISOString(),
    mjVersion,
    baseBranch: result.baseBranch,
    executed: result.executed,
    simulated: result.simulated,
    ...(result.refusedReason !== undefined ? { refusedReason: result.refusedReason } : {}),
    gate: result.gate,
    stepsMerged: result.steps.filter((s) => s.ok).map((s) => ({ order: s.order, branch: s.branch, seatId: s.seatId })),
    baseShaBefore: result.baseShaBefore,
    mergeCommitSha: result.mergeCommitSha,
    postMergeCheck: result.postMergeCheck,
    issuer: null,
    signature: null,
  };
  const payload = mergeAttestationPayload(att);
  const digest = await sha256hex(JSON.stringify(payload));
  const sig = await signHexDigest(digest);
  if (sig) {
    att.issuer = { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex };
    att.signature = sig.sigHex;
  } else {
    att.signatureNote = "Runtime has no Ed25519 — attestation is unsigned (payload is still fully recorded).";
  }
  return att;
}

/** Auditor path: re-canonicalize, re-hash, verify Ed25519 with the embedded public key. */
export async function verifyMergeAttestation(att: MergeAttestation): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (att.format !== "vh-merge-attestation/1" && att.format !== "mj-merge-attestation/1") return { ok: false, reason: `unknown attestation format: ${String(att.format)}` };
  // "mj-merge-attestation/1" = pre-16.1 legacy attestation; older ones stay verifiable.
  if (!att.signature) return { ok: false, reason: att.signatureNote ?? "attestation is unsigned" };
  if (!att.issuer?.publicKeyHex) return { ok: false, reason: "attestation is signed but carries no issuer public key" };
  const digest = await sha256hex(JSON.stringify(mergeAttestationPayload(att)));
  const key = await crypto.subtle.importKey("raw", hexToBytes(att.issuer.publicKeyHex), { name: "Ed25519" }, false, ["verify"]).catch(() => null);
  if (!key) return { ok: false, reason: "issuer public key is not a valid Ed25519 key" };
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, hexToBytes(att.signature), hexToBytes(digest)).catch(() => false);
  return ok ? { ok: true } : { ok: false, reason: "signature verification FAILED against the embedded public key" };
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
