/**
 * 11.9.9 — Role Board: your harnesses, your roles (suite #50).
 *
 * §1 deterministic auto-assignment from a declared inventory
 * §2 applying the board to a team — who changes, who is skipped, and why
 * §3 findings: unowned assignments, llm writers, self-verification warnings
 * §4 Node-safety of persistence (no localStorage under the probe runner)
 *
 * The requirement under test: MJ ships NOTHING fixed. User 1 with a Claude Code
 * subscription and User 2 with only Grok Build both get a valid, complete board.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_ROLES,
  applyBoardToTeam,
  autoAssignBoard,
  boardFindings,
  boardSummary,
  emptyBoard,
  loadRoleBoard,
  type RoleBoard,
} from "../src/mission/roleBoard";
import type { CliAgentTeam } from "../src/mission/agentTeam";

const team = (seats: Array<{ id: string; role: "planner" | "coder" | "reviewer" | "tester"; harness: string }>): CliAgentTeam => ({
  id: "team.t",
  name: "T",
  description: "",
  seats: seats.map((s) => ({
    id: s.id,
    role: s.role,
    harness: s.harness as never,
    model: null,
    mayWrite: s.role === "coder",
    timeoutSecs: 900,
    maxTurns: null,
    instructions: "",
  })),
});

describe("roleBoard — auto-assignment", () => {
  it("two-vendor inventory: writers on the first, verifiers cross-vendor", () => {
    const b = autoAssignBoard(["claude", "codex"]);
    assert.equal(b.assignments.coder, "claude");
    assert.equal(b.assignments.debugger, "claude");
    assert.equal(b.assignments.reviewer, "codex");
    assert.equal(b.assignments.security, "codex");
    assert.equal(b.assignments.tester, "codex");
    assert.equal(b.assignments.planner, "claude");
    assert.equal(boardFindings(b).filter((f) => f.severity === "error").length, 0);
  });

  it("Grok-only user (the User 2 case) gets a complete, working board", () => {
    const b = autoAssignBoard(["grok"]);
    for (const r of BOARD_ROLES) assert.equal(b.assignments[r], "grok");
    // Honest about the consequence: same harness writes and verifies.
    const f = boardFindings(b);
    assert.ok(f.some((x) => x.code === "self_verification"));
  });

  it("llm is skipped for writer roles when any real CLI is owned", () => {
    const b = autoAssignBoard(["llm", "grok"]);
    assert.equal(b.assignments.coder, "grok");
  });

  it("empty inventory produces an empty assignment map, not a guess", () => {
    const b = autoAssignBoard([]);
    assert.deepEqual(b.assignments, {});
    assert.ok(boardFindings(b).some((x) => x.code === "no_inventory"));
  });

  it("duplicate inventory entries collapse", () => {
    const b = autoAssignBoard(["claude", "claude"]);
    assert.deepEqual(b.owned, ["claude"]);
  });
});

describe("roleBoard — applying to a team", () => {
  it("assigned, owned harnesses replace the seat's harness; everything else is untouched", () => {
    const t = team([
      { id: "impl", role: "coder", harness: "claude" },
      { id: "reviewer", role: "reviewer", harness: "codex" },
    ]);
    const board: RoleBoard = { version: 1, owned: ["grok"], assignments: { coder: "grok", reviewer: "grok" }, updatedAt: "x" };
    const res = applyBoardToTeam(t, board);
    assert.deepEqual(res.changed, ["impl", "reviewer"]);
    assert.equal(res.team.seats[0].harness, "grok");
    assert.equal(res.team.seats[1].harness, "grok");
    // Non-harness seat fields survive the reassignment.
    assert.equal(res.team.seats[0].mayWrite, true);
    assert.equal(res.team.seats[0].timeoutSecs, 900);
    // Original team object is not mutated.
    assert.equal(t.seats[0].harness, "claude");
  });

  it("an assignment to an unowned harness is skipped with the honest reason", () => {
    const t = team([{ id: "impl", role: "coder", harness: "claude" }]);
    const board: RoleBoard = { version: 1, owned: ["claude"], assignments: { coder: "codex" }, updatedAt: "x" };
    const res = applyBoardToTeam(t, board);
    assert.deepEqual(res.changed, []);
    assert.equal(res.skipped.length, 1);
    assert.match(res.skipped[0].reason, /not in your inventory/);
    assert.equal(res.team.seats[0].harness, "claude");
  });

  it("unassigned roles are skipped, not defaulted", () => {
    const t = team([{ id: "impl", role: "coder", harness: "claude" }, { id: "rev", role: "reviewer", harness: "codex" }]);
    const board: RoleBoard = { version: 1, owned: ["grok"], assignments: { coder: "grok" }, updatedAt: "x" };
    const res = applyBoardToTeam(t, board);
    assert.deepEqual(res.changed, ["impl"]);
    assert.equal(res.skipped[0].seatId, "rev");
    assert.match(res.skipped[0].reason, /unassigned/);
  });
});

describe("roleBoard — findings", () => {
  it("assigning a harness you do not own is an error", () => {
    const b: RoleBoard = { version: 1, owned: ["claude"], assignments: { reviewer: "codex" }, updatedAt: "x" };
    const f = boardFindings(b);
    assert.ok(f.some((x) => x.code === "unowned_harness" && x.severity === "error"));
  });

  it("llm cannot be a writer", () => {
    const b: RoleBoard = { version: 1, owned: ["llm"], assignments: { coder: "llm", reviewer: "llm" }, updatedAt: "x" };
    const f = boardFindings(b);
    assert.ok(f.some((x) => x.code === "llm_cannot_write"));
  });

  it("identical writer+verifier harnesses produce the self-verification warning", () => {
    const b: RoleBoard = { version: 1, owned: ["claude"], assignments: { coder: "claude", reviewer: "claude" }, updatedAt: "x" };
    const f = boardFindings(b);
    assert.ok(f.some((x) => x.code === "self_verification" && x.severity === "warning"));
  });

  it("distinct writer and verifier harnesses produce no self-verification warning", () => {
    const b: RoleBoard = { version: 1, owned: ["claude", "codex"], assignments: { coder: "claude", reviewer: "codex" }, updatedAt: "x" };
    assert.ok(!boardFindings(b).some((x) => x.code === "self_verification"));
  });
});

describe("roleBoard — summary + persistence safety", () => {
  it("boardSummary names inventory size and coverage", () => {
    const b = autoAssignBoard(["claude", "codex"]);
    assert.equal(boardSummary(b), "2 harnesses · 8/8 roles assigned");
    assert.equal(boardSummary(emptyBoard()), "0 harnesses · 0/8 roles assigned");
  });

  it("loadRoleBoard is Node-safe and returns the empty board without storage", () => {
    const b = loadRoleBoard();
    assert.equal(b.version, 1);
    assert.deepEqual(b.owned, []);
    assert.deepEqual(b.assignments, {});
  });
});
