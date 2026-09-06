/**
 * 11.9.9 — Fleet Board: Mission Control's measured state (suite #52).
 *
 * §1 seat lifecycle: start → running → finish → done/failed, stagnation by clock
 * §2 the cost ledger: measured figures only, tokens-only honesty, per-harness/per-role
 * §3 the approval inbox: request → decide → gone
 * §4 determinism and subscription
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STAGNANT_AFTER_MS, FleetBoard } from "../src/mission/fleet";

const T0 = Date.parse("2026-09-06T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function startedFleet(): FleetBoard {
  const f = new FleetBoard();
  f.missionStarted("mission-a", [
    { seatId: "impl", role: "coder", harness: "claude" },
    { seatId: "reviewer", role: "reviewer", harness: "codex" },
  ], iso(T0));
  return f;
}

describe("fleet — seat lifecycle", () => {
  it("started seats are running until they finish", () => {
    const f = startedFleet();
    let views = f.seatViews(T0 + 1000);
    assert.equal(views.length, 2);
    assert.ok(views.every((v) => v.status === "running"));

    f.ingest({ ts: iso(T0 + 5000), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "finish", outcome: "completed", costUsd: 0.04, tokens: 1650 });
    f.ingest({ ts: iso(T0 + 6000), missionId: "mission-a", seatId: "reviewer", role: "reviewer", harness: "codex", kind: "finish", outcome: "failed", costUsd: 0.01, tokens: 400 });
    views = f.seatViews(T0 + 7000);
    const impl = views.find((v) => v.seatId === "impl");
    const rev = views.find((v) => v.seatId === "reviewer");
    assert.equal(impl?.status, "done");
    assert.equal(rev?.status, "failed");
    assert.equal(impl?.costUsd, 0.04);
    assert.equal(impl?.tokens, 1650);
  });

  it("a seat silent past the threshold is STAGNANT, not merely running", () => {
    const f = startedFleet();
    const before = f.seatViews(T0 + DEFAULT_STAGNANT_AFTER_MS - 1000);
    assert.ok(before.every((v) => v.status === "running"));
    const after = f.seatViews(T0 + DEFAULT_STAGNANT_AFTER_MS + 1000);
    assert.ok(after.every((v) => v.status === "stagnant"));
    assert.equal(f.stagnant(T0 + DEFAULT_STAGNANT_AFTER_MS + 1000).length, 2);
  });

  it("a finish after stagnation wins: the seat ends, it does not stagnate", () => {
    const f = startedFleet();
    f.ingest({ ts: iso(T0 + DEFAULT_STAGNANT_AFTER_MS + 5000), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "finish", outcome: "completed" });
    const views = f.seatViews(T0 + DEFAULT_STAGNANT_AFTER_MS + 6000);
    assert.equal(views.find((v) => v.seatId === "impl")?.status, "done");
  });
});

describe("fleet — cost ledger honesty", () => {
  it("tokens without dollars are tokens-only, never a guessed conversion", () => {
    const f = startedFleet();
    // Codex reports tokens, not dollars — the ledger must say so.
    f.ingest({ ts: iso(T0 + 1), missionId: "mission-a", seatId: "reviewer", role: "reviewer", harness: "codex", kind: "finish", outcome: "completed", tokens: 900 });
    const byHarness = f.costByHarness();
    assert.equal(byHarness.codex.runs, 1);
    assert.equal(byHarness.codex.costUsd, 0);
    assert.equal(byHarness.codex.tokens, 900);
    assert.equal(byHarness.codex.tokensOnly, true);
    const view = f.seatViews(T0 + 2).find((v) => v.seatId === "reviewer");
    assert.equal(view?.tokensOnly, true);
  });

  it("per-harness and per-role ledgers aggregate measured spend", () => {
    const f = startedFleet();
    f.ingest({ ts: iso(T0 + 1), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "finish", outcome: "completed", costUsd: 0.05, tokens: 2000 });
    f.ingest({ ts: iso(T0 + 2), missionId: "mission-a", seatId: "reviewer", role: "reviewer", harness: "codex", kind: "finish", outcome: "completed", costUsd: 0.02, tokens: 500 });
    const h = f.costByHarness();
    assert.equal(h.claude.costUsd, 0.05);
    assert.equal(h.codex.tokens, 500);
    const r = f.costByRole();
    assert.equal(r.coder.costUsd, 0.05);
    assert.equal(r.reviewer.runs, 1);
    const t = f.totals();
    assert.equal(t.missions, 1);
    assert.equal(t.seatRuns, 2);
    assert.ok(Math.abs(t.costUsd - 0.07) < 1e-9);
    assert.equal(t.tokens, 2500);
  });

  it("simulated runs are counted AND flagged, never laundered", () => {
    const f = startedFleet();
    f.ingest({ ts: iso(T0 + 1), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "finish", outcome: "completed", costUsd: 0.04, simulated: true });
    assert.equal(f.totals().simulatedRuns, 1);
    assert.equal(f.costByHarness().claude.simulatedRuns, 1);
    assert.equal(f.seatViews(T0 + 2).find((v) => v.seatId === "impl")?.simulated, true);
  });
});

describe("fleet — approval inbox", () => {
  it("a request opens the inbox; deciding closes it, and the seat waits meanwhile", () => {
    const f = startedFleet();
    f.ingest({ ts: iso(T0 + 1), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "approval-request", approvalId: "apr-1" });
    assert.equal(f.approvalInbox().length, 1);
    assert.equal(f.seatViews(T0 + 2).find((v) => v.seatId === "impl")?.status, "awaiting-approval");

    f.decideApproval("apr-1", "approved");
    assert.equal(f.approvalInbox().length, 0);
    // The decision is recorded as a real event on the board.
    const decided = f.eventsAll().find((e) => e.kind === "approval-decided" && e.approvalId === "apr-1");
    assert.ok(decided);
    assert.equal(decided?.outcome, "approved");
  });

  it("deciding an unknown approval is a no-op", () => {
    const f = startedFleet();
    const before = f.eventsAll().length;
    f.decideApproval("ghost", "rejected");
    assert.equal(f.eventsAll().length, before);
  });
});

describe("fleet — determinism and subscription", () => {
  it("seatViews are deterministically ordered by key", () => {
    const f = startedFleet();
    f.missionStarted("mission-b", [{ seatId: "aaa", role: "planner", harness: "grok" }], iso(T0));
    const keys = f.seatViews(T0).map((v) => v.key);
    const sorted = [...keys].sort();
    assert.deepEqual(keys, sorted);
  });

  it("subscribers fire on ingest; unsubscribe stops them", () => {
    const f = startedFleet();
    let fired = 0;
    const unsub = f.subscribe(() => (fired += 1));
    f.ingest({ ts: iso(T0 + 1), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "heartbeat" });
    assert.equal(fired, 1);
    unsub();
    f.ingest({ ts: iso(T0 + 2), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "heartbeat" });
    assert.equal(fired, 1);
  });

  it("clear empties the board", () => {
    const f = startedFleet();
    f.clear();
    assert.deepEqual(f.seatViews(T0), []);
    assert.equal(f.totals().missions, 0);
  });
});
