/**
 * §ROLE BOARD — your harnesses, your roles (MJ 11.9.9).
 *
 * THE REQUIREMENT THIS EXISTS FOR
 * MJ used to ship teams with fixed vendor assignments: Claude plans, Codex reviews, Grok
 * synthesizes. That is a demo configuration, not a product — User 1 has a Claude Code
 * subscription and no Codex; User 2 has Grok Build and nothing else. Both are right. So the
 * role board flips the model: the USER declares which harnesses they actually have
 * (their subscriptions, their installed CLIs, their custom binaries) and the USER decides
 * which harness plays which role. MJ never picks a vendor for them; it only warns when a
 * choice weakens the adversarial posture (see verifyGate.ts).
 *
 * HONESTY RULES
 *  - Assigning a harness the user has not declared as owned is an error, never a silent
 *    fallback — a team that runs a CLI the user does not have is a broken promise.
 *  - Assigning the SAME harness to write and to verify is allowed (it may be the only one
 *    the user owns) but is flagged: the Adversarial Verification Gate will then block runs
 *    in STRICT mode, because an author grading its own work is not a review.
 *  - "llm" (direct provider call) can never be a writer — it has no filesystem hands.
 *
 * Node-import-safe: localStorage is touched only behind guards, exactly like agentTeam.ts.
 */

import type { HarnessId } from "../domain/harness";
import type { CliAgentTeam, TeamRole } from "./agentTeam";

/** Every seat role a board can assign. Same set agentTeam.parseTeam validates. */
export const BOARD_ROLES: TeamRole[] = [
  "planner",
  "architect",
  "coder",
  "debugger",
  "tester",
  "reviewer",
  "security",
  "synthesizer",
];

/** Roles that modify files — the "writers" the adversarial gate watches. */
export const WRITER_ROLES: ReadonlySet<TeamRole> = new Set(["coder", "debugger"]);

/** Roles whose job is to check the writers' work — the gate's verifier pool. */
export const VERIFIER_ROLES: ReadonlySet<TeamRole> = new Set(["reviewer", "security", "tester"]);

export interface RoleBoard {
  version: 1;
  /** Harness ids the user declares they have (registry ids or `custom:<slug>`). */
  owned: string[];
  /** The user's decision: which harness plays which role. Missing key = unassigned. */
  assignments: Partial<Record<TeamRole, string>>;
  updatedAt: string;
}

export interface BoardFinding {
  severity: "error" | "warning";
  code: string;
  message: string;
  role?: TeamRole;
}

export function emptyBoard(): RoleBoard {
  return { version: 1, owned: [], assignments: {}, updatedAt: new Date(0).toISOString() };
}

const STORAGE_KEY = "mj.roleboard.v1";

export function loadRoleBoard(): RoleBoard {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return emptyBoard();
    const parsed = JSON.parse(raw) as Partial<RoleBoard>;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.owned)) return emptyBoard();
    return {
      version: 1,
      owned: parsed.owned.filter((x): x is string => typeof x === "string"),
      assignments: (parsed.assignments ?? {}) as RoleBoard["assignments"],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return emptyBoard();
  }
}

export function saveRoleBoard(board: RoleBoard): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ ...board, updatedAt: new Date().toISOString() }));
  } catch {
    /* storage unavailable (Node probe, private mode) — the in-memory board still works */
  }
}

export function isOwned(board: RoleBoard, harness: string): boolean {
  return board.owned.includes(harness);
}

/**
 * Deterministic auto-assignment from an inventory. The user can always override it —
 * this is a starting point, not a verdict. Rules:
 *   - writers (coder/debugger) get the first owned harness that can write (not "llm")
 *   - verifiers (reviewer/security/tester) get the first owned harness DIFFERENT from the
 *     writer's, when one exists — cross-vendor by default when the inventory allows it
 *   - planner/architect/synthesizer get the first owned harness of any kind
 * An empty inventory produces an empty assignment map (findings will say so).
 */
export function autoAssignBoard(owned: string[]): RoleBoard {
  const clean = [...new Set(owned.filter((o) => typeof o === "string" && o.length > 0))];
  const assignments: RoleBoard["assignments"] = {};
  if (clean.length === 0) return { version: 1, owned: [], assignments, updatedAt: new Date().toISOString() };

  const writer = clean.find((h) => h !== "llm") ?? clean[0];
  const verifier = clean.find((h) => h !== writer && h !== "llm") ?? clean.find((h) => h !== writer) ?? writer;
  const any = clean[0];

  for (const role of BOARD_ROLES) {
    if (WRITER_ROLES.has(role)) assignments[role] = writer;
    else if (VERIFIER_ROLES.has(role)) assignments[role] = verifier;
    else assignments[role] = any;
  }
  return { version: 1, owned: clean, assignments, updatedAt: new Date().toISOString() };
}

export interface BoardApplication {
  team: CliAgentTeam;
  /** Seat ids whose harness changed. */
  changed: string[];
  /** Seats left untouched, with the honest reason. */
  skipped: Array<{ seatId: string; reason: string }>;
}

/**
 * Apply the user's board to a team: every seat whose role has an assigned, owned harness
 * takes that harness. Everything else about the seat (policy, timeouts, instructions) is
 * untouched — the board decides WHO, the seat decides HOW.
 */
export function applyBoardToTeam(team: CliAgentTeam, board: RoleBoard): BoardApplication {
  const changed: string[] = [];
  const skipped: BoardApplication["skipped"] = [];
  const seats = team.seats.map((seat) => {
    const assigned = board.assignments[seat.role];
    if (!assigned) {
      skipped.push({ seatId: seat.id, reason: `role "${seat.role}" is unassigned on the board` });
      return seat;
    }
    if (!isOwned(board, assigned)) {
      skipped.push({ seatId: seat.id, reason: `"${assigned}" is assigned to ${seat.role} but not in your inventory` });
      return seat;
    }
    if (assigned === seat.harness) return seat;
    changed.push(seat.id);
    return { ...seat, harness: assigned as HarnessId };
  });
  return { team: { ...team, seats }, changed, skipped };
}

/**
 * What the board itself gets wrong, before any team is touched.
 * Errors block applying; warnings inform the adversarial-gate consequence.
 */
export function boardFindings(board: RoleBoard): BoardFinding[] {
  const out: BoardFinding[] = [];
  if (board.owned.length === 0) {
    out.push({ severity: "warning", code: "no_inventory", message: "No harnesses declared. Mark the CLIs you actually have — auto-assign and team application both work from that inventory." });
  }
  for (const role of BOARD_ROLES) {
    const assigned = board.assignments[role];
    if (!assigned) continue;
    if (!isOwned(board, assigned)) {
      out.push({ severity: "error", code: "unowned_harness", role, message: `Role "${role}" is assigned to "${assigned}", which is not in your inventory. A seat cannot run a CLI you do not have.` });
    }
    if (assigned === "llm" && WRITER_ROLES.has(role)) {
      out.push({ severity: "error", code: "llm_cannot_write", role, message: `Role "${role}" writes files, but the direct-LLM harness has no filesystem hands. Pick a coding CLI.` });
    }
  }
  const writerHarnesses = new Set([...WRITER_ROLES].map((r) => board.assignments[r]).filter((x): x is string => Boolean(x)));
  const verifierHarnesses = new Set([...VERIFIER_ROLES].map((r) => board.assignments[r]).filter((x): x is string => Boolean(x)));
  if (writerHarnesses.size > 0 && verifierHarnesses.size > 0 && [...verifierHarnesses].every((v) => writerHarnesses.has(v))) {
    out.push({
      severity: "warning",
      code: "self_verification",
      message: `Writers and verifiers are the same harness(es): ${[...verifierHarnesses].join(", ")}. The Adversarial Verification Gate blocks self-verified runs in STRICT mode — add a second harness to your inventory if you can.`,
    });
  }
  return out;
}

/** Human-readable one-liner for the UI header: "4 harnesses · 8/8 roles assigned". */
export function boardSummary(board: RoleBoard): string {
  const assigned = BOARD_ROLES.filter((r) => Boolean(board.assignments[r])).length;
  return `${board.owned.length} harness${board.owned.length === 1 ? "" : "es"} · ${assigned}/${BOARD_ROLES.length} roles assigned`;
}
