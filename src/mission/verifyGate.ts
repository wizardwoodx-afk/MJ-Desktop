/**
 * §ADVERSARIAL VERIFICATION GATE (MJ 11.9.9) — the heart of the verified agent factory.
 *
 * THE RESEARCH, IN ONE SENTENCE
 * Every 2026 orchestrator — Zapier's agent mode, n8n's LangChain nodes, VectorShift, the
 * whole fleet-orchestrator wave (Orca, Bernstein, Vibe Kanban) — solves COORDINATION.
 * Their own shared, admitted weakness is that nowhere in the stack does anyone solve
 * PROOF: the writer grades itself, and "it ran" is the only evidence on offer.
 *
 * This gate is MJ's answer, enforced rather than encouraged:
 *   - a run is not "verified" unless a seat whose job is verification actually RAN
 *   - verification by the SAME harness that wrote the work is self-grading — in STRICT
 *     mode the run is BLOCKED, in ADVISORY mode it is marked FAIL with the reason attached
 *   - a verdict that rejects the work fails the gate regardless of who signed it
 *   - in STRICT mode the proof receipt must be attached, so the verification itself is
 *     part of the hash-chained evidence an auditor re-verifies
 *
 * Tiers, best first:
 *   cross-vendor     no verifier shares a harness with any writer — the strongest evidence
 *   cross-seat       every writer has a different-harness verifier, but harnesses overlap
 *                    elsewhere in the team (still adversarial where it matters)
 *   self-verification  at least one writer harness has no different-harness verifier
 *   unverified       no verifier seat ran at all
 *
 * Node-import-safe, deterministic, and probed by probe/verifyGate.test.ts.
 */

export type GatePolicy = "STRICT" | "ADVISORY";

export type GateTier = "cross-vendor" | "cross-seat" | "self-verification" | "unverified";

export type GateStatus = "PASS" | "FAIL" | "BLOCKED";

export interface GateWriter {
  seatId: string;
  harness: string;
}

export interface GateVerifier {
  seatId: string;
  harness: string;
  ran: boolean;
  verdict: "approve" | "reject" | "none";
}

export interface GateInput {
  /** The run's terminal status (TeamRunReport.status). */
  runStatus: string;
  writers: GateWriter[];
  verifiers: GateVerifier[];
  /** True when a proof receipt is attached to (or will be issued with) this run. */
  receiptAttached: boolean;
  policy: GatePolicy;
}

export interface GateVerdict {
  status: GateStatus;
  tier: GateTier;
  reasons: string[];
  policy: GatePolicy;
  /** True when no writer harness graded its own work (tiers cross-vendor / cross-seat). */
  crossVerified: boolean;
}

/** Roles MJ treats as verifiers for gate purposes (matches fleet.ts / receipts). */
export const GATE_VERIFIER_ROLES: ReadonlySet<string> = new Set(["reviewer", "security", "tester"]);

/** Roles MJ treats as writers for gate purposes. */
export const GATE_WRITER_ROLES: ReadonlySet<string> = new Set(["coder", "debugger"]);

const POLICY_KEY = "mj.gatepolicy.v1";

export function loadGatePolicy(): GatePolicy {
  try {
    const raw = globalThis.localStorage?.getItem(POLICY_KEY);
    return raw === "ADVISORY" ? "ADVISORY" : "STRICT";
  } catch {
    return "STRICT";
  }
}

export function saveGatePolicy(policy: GatePolicy): void {
  try {
    globalThis.localStorage?.setItem(POLICY_KEY, policy);
  } catch {
    /* storage unavailable — the in-memory default still governs this session */
  }
}

/**
 * The gate itself. Deterministic: same input, same verdict, every time.
 *
 * BLOCKED is only ever produced in STRICT mode. ADVISORY mode downgrades every block to a
 * FAIL with the reasons attached — the run is visible, named, and exportable, but it can
 * never claim to be verified.
 */
export function evaluateVerifyGate(input: GateInput): GateVerdict {
  const reasons: string[] = [];
  const ranVerifiers = input.verifiers.filter((v) => v.ran);

  if (input.runStatus !== "completed") {
    reasons.push(`Run status is "${input.runStatus}" — only completed runs can be verified.`);
  }

  const rejections = ranVerifiers.filter((v) => v.verdict === "reject");
  for (const r of rejections) {
    reasons.push(`Verifier "${r.seatId}" (${r.harness}) rejected the work.`);
  }

  const writerHarnesses = [...new Set(input.writers.map((w) => w.harness))];
  let tier: GateTier;
  let crossVerified = false;

  if (ranVerifiers.length === 0) {
    tier = "unverified";
    reasons.push("No verifier seat ran — the work was never checked by anyone.");
  } else if (writerHarnesses.length === 0) {
    // A read-only mission has nothing to adversarially gate; verification still needs a
    // verifier that ran and (in STRICT) a receipt.
    tier = "cross-vendor";
    crossVerified = true;
  } else {
    // The adversarial core: for EVERY writer harness, some verifier with a different
    // harness must have run. Anything less means an author graded its own work.
    const selfVerified = writerHarnesses.filter(
      (wh) => !ranVerifiers.some((v) => v.harness !== wh),
    );
    if (selfVerified.length > 0) {
      tier = "self-verification";
      reasons.push(
        `Self-verification: writer harness(es) ${selfVerified.join(", ")} had no verifier from a different harness. An author grading its own work is not a review.`,
      );
    } else {
      crossVerified = true;
      const verifierHarnesses = new Set(ranVerifiers.map((v) => v.harness));
      const overlap = writerHarnesses.some((wh) => verifierHarnesses.has(wh));
      tier = overlap ? "cross-seat" : "cross-vendor";
    }
  }

  if (!input.receiptAttached) {
    reasons.push("No proof receipt attached — verification without a hash-chained record is a claim, not evidence.");
  }

  const hardFail = input.runStatus !== "completed" || rejections.length > 0;
  let status: GateStatus;
  if (hardFail) {
    status = "FAIL";
  } else if (crossVerified && input.receiptAttached) {
    status = "PASS";
  } else {
    status = input.policy === "STRICT" ? "BLOCKED" : "FAIL";
  }

  return { status, tier, reasons, policy: input.policy, crossVerified };
}

/** Seat-shaped input, matching TeamRunReport / AutonomyRunSummary seat records. */
export interface GateSeatRecord {
  seatId: string;
  role: string;
  harness: string;
  outcome: string;
  verified: boolean;
}

/**
 * Derive gate inputs from a finished team run and evaluate.
 *
 * Verifier verdicts come from measured outcomes, never from self-reports: a verifier that
 * completed its run approves; one that failed or timed out rejects; anything else has no
 * verdict. Seats listed in `notRun` did not run and cannot count.
 */
export function gateForTeamReport(
  report: { status: string; seats: GateSeatRecord[]; notRun?: string[] },
  policy: GatePolicy,
  receiptAttached: boolean,
): GateVerdict {
  const notRun = new Set(report.notRun ?? []);
  const seats = report.seats.filter((s) => !notRun.has(s.seatId));
  const failedOutcomes = new Set(["failed", "timeout", "blocked_budget"]);
  const writers: GateWriter[] = seats
    .filter((s) => GATE_WRITER_ROLES.has(s.role))
    .map((s) => ({ seatId: s.seatId, harness: s.harness }));
  const verifiers: GateVerifier[] = seats
    .filter((s) => GATE_VERIFIER_ROLES.has(s.role))
    .map((s) => ({
      seatId: s.seatId,
      harness: s.harness,
      ran: s.outcome !== "not_run" && s.outcome !== "skipped",
      verdict: s.outcome === "completed" ? "approve" : failedOutcomes.has(s.outcome) ? "reject" : "none",
    }));
  return evaluateVerifyGate({ runStatus: report.status, writers, verifiers, receiptAttached, policy });
}

/** Team-shaped findings, for display next to validateTeam's (same shape, same honesty). */
export interface GateTeamFinding {
  severity: "error" | "warning";
  code: string;
  message: string;
}

/**
 * Predict the gate's behaviour for a team BEFORE it runs: if every verifier harness is
 * also a writer harness, the gate will block every run in STRICT mode. Cheaper to say so
 * at configuration time than at run time.
 */
export function gateFindingsForTeam(
  team: { seats: Array<{ role: string; harness: string; mayWrite: boolean }> },
  policy: GatePolicy,
): GateTeamFinding[] {
  const out: GateTeamFinding[] = [];
  const writerHarnesses = new Set(team.seats.filter((s) => s.mayWrite).map((s) => s.harness));
  const verifierSeats = team.seats.filter((s) => GATE_VERIFIER_ROLES.has(s.role));
  if (writerHarnesses.size === 0) return out;
  if (verifierSeats.length === 0) {
    out.push({
      severity: policy === "STRICT" ? "error" : "warning",
      code: "no_verifier_seat",
      message: "No reviewer/security/tester seat — the Adversarial Verification Gate will block this team's runs in STRICT mode because nothing checks the writers' work.",
    });
    return out;
  }
  const verifierHarnesses = new Set(verifierSeats.map((s) => s.harness));
  const covered = [...writerHarnesses].every((wh) => [...verifierHarnesses].some((vh) => vh !== wh));
  if (!covered) {
    out.push({
      severity: policy === "STRICT" ? "error" : "warning",
      code: "self_verification_locked_in",
      message: `Every verifier shares a harness with a writer (${[...verifierHarnesses].join(", ")}). The gate treats that as self-verification and will block runs in STRICT mode — assign a different harness to a verifier seat.`,
    });
  }
  return out;
}
