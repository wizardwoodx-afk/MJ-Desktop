import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/roleBoard.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// src/mission/roleBoard.ts
var BOARD_ROLES = [
  "planner",
  "architect",
  "coder",
  "debugger",
  "tester",
  "reviewer",
  "security",
  "synthesizer"
];
var WRITER_ROLES = /* @__PURE__ */ new Set(["coder", "debugger"]);
var VERIFIER_ROLES = /* @__PURE__ */ new Set(["reviewer", "security", "tester"]);
function emptyBoard() {
  return { version: 1, owned: [], assignments: {}, updatedAt: (/* @__PURE__ */ new Date(0)).toISOString() };
}
var STORAGE_KEY = "mj.roleboard.v1";
function loadRoleBoard() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return emptyBoard();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.owned)) return emptyBoard();
    return {
      version: 1,
      owned: parsed.owned.filter((x) => typeof x === "string"),
      assignments: parsed.assignments ?? {},
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : (/* @__PURE__ */ new Date(0)).toISOString()
    };
  } catch {
    return emptyBoard();
  }
}
function isOwned(board, harness) {
  return board.owned.includes(harness);
}
function autoAssignBoard(owned) {
  const clean = [...new Set(owned.filter((o) => typeof o === "string" && o.length > 0))];
  const assignments = {};
  if (clean.length === 0) return { version: 1, owned: [], assignments, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  const writer = clean.find((h) => h !== "llm") ?? clean[0];
  const verifier = clean.find((h) => h !== writer && h !== "llm") ?? clean.find((h) => h !== writer) ?? writer;
  const any = clean[0];
  for (const role of BOARD_ROLES) {
    if (WRITER_ROLES.has(role)) assignments[role] = writer;
    else if (VERIFIER_ROLES.has(role)) assignments[role] = verifier;
    else assignments[role] = any;
  }
  return { version: 1, owned: clean, assignments, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
function applyBoardToTeam(team2, board) {
  const changed = [];
  const skipped = [];
  const seats = team2.seats.map((seat) => {
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
    return { ...seat, harness: assigned };
  });
  return { team: { ...team2, seats }, changed, skipped };
}
function boardFindings(board) {
  const out = [];
  if (board.owned.length === 0) {
    out.push({ severity: "warning", code: "no_inventory", message: "No harnesses declared. Mark the CLIs you actually have \u2014 auto-assign and team application both work from that inventory." });
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
  const writerHarnesses = new Set([...WRITER_ROLES].map((r) => board.assignments[r]).filter((x) => Boolean(x)));
  const verifierHarnesses = new Set([...VERIFIER_ROLES].map((r) => board.assignments[r]).filter((x) => Boolean(x)));
  if (writerHarnesses.size > 0 && verifierHarnesses.size > 0 && [...verifierHarnesses].every((v) => writerHarnesses.has(v))) {
    out.push({
      severity: "warning",
      code: "self_verification",
      message: `Writers and verifiers are the same harness(es): ${[...verifierHarnesses].join(", ")}. The Adversarial Verification Gate blocks self-verified runs in STRICT mode \u2014 add a second harness to your inventory if you can.`
    });
  }
  return out;
}
function boardSummary(board) {
  const assigned = BOARD_ROLES.filter((r) => Boolean(board.assignments[r])).length;
  return `${board.owned.length} harness${board.owned.length === 1 ? "" : "es"} \xB7 ${assigned}/${BOARD_ROLES.length} roles assigned`;
}

// probe/roleBoard.test.ts
var team = (seats) => ({
  id: "team.t",
  name: "T",
  description: "",
  seats: seats.map((s) => ({
    id: s.id,
    role: s.role,
    harness: s.harness,
    model: null,
    mayWrite: s.role === "coder",
    timeoutSecs: 900,
    maxTurns: null,
    instructions: ""
  }))
});
describe("roleBoard \u2014 auto-assignment", () => {
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
describe("roleBoard \u2014 applying to a team", () => {
  it("assigned, owned harnesses replace the seat's harness; everything else is untouched", () => {
    const t = team([
      { id: "impl", role: "coder", harness: "claude" },
      { id: "reviewer", role: "reviewer", harness: "codex" }
    ]);
    const board = { version: 1, owned: ["grok"], assignments: { coder: "grok", reviewer: "grok" }, updatedAt: "x" };
    const res = applyBoardToTeam(t, board);
    assert.deepEqual(res.changed, ["impl", "reviewer"]);
    assert.equal(res.team.seats[0].harness, "grok");
    assert.equal(res.team.seats[1].harness, "grok");
    assert.equal(res.team.seats[0].mayWrite, true);
    assert.equal(res.team.seats[0].timeoutSecs, 900);
    assert.equal(t.seats[0].harness, "claude");
  });
  it("an assignment to an unowned harness is skipped with the honest reason", () => {
    const t = team([{ id: "impl", role: "coder", harness: "claude" }]);
    const board = { version: 1, owned: ["claude"], assignments: { coder: "codex" }, updatedAt: "x" };
    const res = applyBoardToTeam(t, board);
    assert.deepEqual(res.changed, []);
    assert.equal(res.skipped.length, 1);
    assert.match(res.skipped[0].reason, /not in your inventory/);
    assert.equal(res.team.seats[0].harness, "claude");
  });
  it("unassigned roles are skipped, not defaulted", () => {
    const t = team([{ id: "impl", role: "coder", harness: "claude" }, { id: "rev", role: "reviewer", harness: "codex" }]);
    const board = { version: 1, owned: ["grok"], assignments: { coder: "grok" }, updatedAt: "x" };
    const res = applyBoardToTeam(t, board);
    assert.deepEqual(res.changed, ["impl"]);
    assert.equal(res.skipped[0].seatId, "rev");
    assert.match(res.skipped[0].reason, /unassigned/);
  });
});
describe("roleBoard \u2014 findings", () => {
  it("assigning a harness you do not own is an error", () => {
    const b = { version: 1, owned: ["claude"], assignments: { reviewer: "codex" }, updatedAt: "x" };
    const f = boardFindings(b);
    assert.ok(f.some((x) => x.code === "unowned_harness" && x.severity === "error"));
  });
  it("llm cannot be a writer", () => {
    const b = { version: 1, owned: ["llm"], assignments: { coder: "llm", reviewer: "llm" }, updatedAt: "x" };
    const f = boardFindings(b);
    assert.ok(f.some((x) => x.code === "llm_cannot_write"));
  });
  it("identical writer+verifier harnesses produce the self-verification warning", () => {
    const b = { version: 1, owned: ["claude"], assignments: { coder: "claude", reviewer: "claude" }, updatedAt: "x" };
    const f = boardFindings(b);
    assert.ok(f.some((x) => x.code === "self_verification" && x.severity === "warning"));
  });
  it("distinct writer and verifier harnesses produce no self-verification warning", () => {
    const b = { version: 1, owned: ["claude", "codex"], assignments: { coder: "claude", reviewer: "codex" }, updatedAt: "x" };
    assert.ok(!boardFindings(b).some((x) => x.code === "self_verification"));
  });
});
describe("roleBoard \u2014 summary + persistence safety", () => {
  it("boardSummary names inventory size and coverage", () => {
    const b = autoAssignBoard(["claude", "codex"]);
    assert.equal(boardSummary(b), "2 harnesses \xB7 8/8 roles assigned");
    assert.equal(boardSummary(emptyBoard()), "0 harnesses \xB7 0/8 roles assigned");
  });
  it("loadRoleBoard is Node-safe and returns the empty board without storage", () => {
    const b = loadRoleBoard();
    assert.equal(b.version, 1);
    assert.deepEqual(b.owned, []);
    assert.deepEqual(b.assignments, {});
  });
});
