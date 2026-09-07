import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/fleet.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// src/mission/fleet.ts
var EVENTS_CAP = 800;
var STORAGE_KEY = "mj.fleet.v1";
var DEFAULT_STAGNANT_AFTER_MS = 15 * 60 * 1e3;
var FleetBoard = class {
  events = null;
  listeners = /* @__PURE__ */ new Set();
  ensure() {
    if (this.events) return this.events;
    let loaded = [];
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          loaded = parsed.filter((e) => Boolean(e && typeof e === "object" && e.missionId && e.kind));
        }
      }
    } catch {
      loaded = [];
    }
    this.events = loaded;
    return loaded;
  }
  persist() {
    try {
      const ev = this.ensure();
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ev.slice(Math.max(0, ev.length - EVENTS_CAP))));
    } catch {
    }
  }
  ingest(event) {
    const ev = this.ensure();
    ev.push(event);
    if (ev.length > EVENTS_CAP) ev.splice(0, ev.length - EVENTS_CAP);
    this.persist();
    for (const l of this.listeners) {
      try {
        l();
      } catch {
      }
    }
  }
  /** Record the run's seats as queued+start in one call (runner convenience). */
  missionStarted(missionId, seats, ts) {
    for (const s of seats) {
      this.ingest({ ts, missionId, seatId: s.seatId, role: s.role, harness: s.harness, kind: "start" });
    }
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  eventsAll() {
    return [...this.ensure()];
  }
  clear() {
    this.events = [];
    this.persist();
    for (const l of this.listeners) l();
  }
  /** Per-seat projection. `now` is a parameter so stagnation is testable. */
  seatViews(now, stagnantAfterMs = DEFAULT_STAGNANT_AFTER_MS) {
    const byKey = /* @__PURE__ */ new Map();
    for (const e of this.ensure()) {
      const key = `${e.missionId}::${e.seatId}`;
      const arr = byKey.get(key);
      if (arr) arr.push(e);
      else byKey.set(key, [e]);
    }
    const views = [];
    for (const [key, evts] of byKey) {
      evts.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
      const last = evts[evts.length - 1];
      let costUsd = 0;
      let tokens = 0;
      let tokensOnly = false;
      let outcome = null;
      let simulated = false;
      for (const e of evts) {
        if (e.kind === "finish") {
          costUsd += typeof e.costUsd === "number" ? e.costUsd : 0;
          tokens += typeof e.tokens === "number" ? e.tokens : 0;
          if (typeof e.costUsd !== "number" && typeof e.tokens === "number") tokensOnly = true;
          outcome = e.outcome ?? outcome;
          simulated = simulated || e.simulated === true;
        }
        if (e.simulated === true) simulated = true;
      }
      let status;
      if (last.kind === "approval-request" && !this.approvalDecided(last.approvalId ?? "")) {
        status = "awaiting-approval";
      } else if (last.kind === "finish") {
        status = last.outcome === "completed" ? "done" : "failed";
      } else if (last.kind === "queued") {
        status = "queued";
      } else {
        const age = now - Date.parse(last.ts);
        status = Number.isFinite(age) && age > stagnantAfterMs ? "stagnant" : "running";
      }
      views.push({
        key,
        missionId: last.missionId,
        seatId: last.seatId,
        role: last.role,
        harness: last.harness,
        status,
        lastTs: last.ts,
        costUsd,
        tokensOnly,
        tokens,
        outcome,
        simulated
      });
    }
    views.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    return views;
  }
  /** 11.10 — public so enforcement points (the merge gate's break-glass) can check it. */
  isDecided(approvalId) {
    return this.approvalDecided(approvalId);
  }
  approvalDecided(approvalId) {
    if (!approvalId) return false;
    return this.ensure().some((e) => e.kind === "approval-decided" && e.approvalId === approvalId);
  }
  /** Cost ledger by harness — measured CLI reports only, never guessed conversions. */
  costByHarness() {
    const out = {};
    for (const e of this.ensure()) {
      if (e.kind !== "finish") continue;
      const row = out[e.harness] ??= { runs: 0, costUsd: 0, tokensOnly: false, tokens: 0, simulatedRuns: 0 };
      row.runs += 1;
      row.costUsd += typeof e.costUsd === "number" ? e.costUsd : 0;
      row.tokens += typeof e.tokens === "number" ? e.tokens : 0;
      if (typeof e.costUsd !== "number" && typeof e.tokens === "number") row.tokensOnly = true;
      if (e.simulated === true) row.simulatedRuns += 1;
    }
    return out;
  }
  /** Same ledger grouped by role. */
  costByRole() {
    const out = {};
    for (const e of this.ensure()) {
      if (e.kind !== "finish") continue;
      const row = out[e.role] ??= { runs: 0, costUsd: 0, tokensOnly: false, tokens: 0, simulatedRuns: 0 };
      row.runs += 1;
      row.costUsd += typeof e.costUsd === "number" ? e.costUsd : 0;
      row.tokens += typeof e.tokens === "number" ? e.tokens : 0;
      if (typeof e.costUsd !== "number" && typeof e.tokens === "number") row.tokensOnly = true;
      if (e.simulated === true) row.simulatedRuns += 1;
    }
    return out;
  }
  totals() {
    const missions = /* @__PURE__ */ new Set();
    let seatRuns = 0;
    let costUsd = 0;
    let tokens = 0;
    let simulatedRuns = 0;
    for (const e of this.ensure()) {
      missions.add(e.missionId);
      if (e.kind === "finish") {
        seatRuns += 1;
        costUsd += typeof e.costUsd === "number" ? e.costUsd : 0;
        tokens += typeof e.tokens === "number" ? e.tokens : 0;
        if (e.simulated === true) simulatedRuns += 1;
      }
    }
    return { missions: missions.size, seatRuns, costUsd, tokens, simulatedRuns };
  }
  stagnant(now, stagnantAfterMs = DEFAULT_STAGNANT_AFTER_MS) {
    return this.seatViews(now, stagnantAfterMs).filter((v) => v.status === "stagnant");
  }
  /** Open approval requests — the unified inbox Mission Control shows. */
  approvalInbox() {
    const out = [];
    for (const e of this.ensure()) {
      if (e.kind !== "approval-request" || !e.approvalId) continue;
      if (this.approvalDecided(e.approvalId)) continue;
      out.push({ approvalId: e.approvalId, missionId: e.missionId, seatId: e.seatId, harness: e.harness, since: e.ts });
    }
    return out;
  }
  /** Decide an approval from the inbox. The decision is itself a fleet event. */
  decideApproval(approvalId, decision) {
    const req = this.ensure().find((e) => e.kind === "approval-request" && e.approvalId === approvalId);
    if (!req) return;
    this.ingest({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      missionId: req.missionId,
      seatId: req.seatId,
      role: req.role,
      harness: req.harness,
      kind: "approval-decided",
      approvalId,
      outcome: decision
    });
  }
};
var globalFleet = new FleetBoard();

// probe/fleet.test.ts
var T0 = Date.parse("2026-09-06T10:00:00Z");
var iso = (ms) => new Date(ms).toISOString();
function startedFleet() {
  const f = new FleetBoard();
  f.missionStarted("mission-a", [
    { seatId: "impl", role: "coder", harness: "claude" },
    { seatId: "reviewer", role: "reviewer", harness: "codex" }
  ], iso(T0));
  return f;
}
describe("fleet \u2014 seat lifecycle", () => {
  it("started seats are running until they finish", () => {
    const f = startedFleet();
    let views = f.seatViews(T0 + 1e3);
    assert.equal(views.length, 2);
    assert.ok(views.every((v) => v.status === "running"));
    f.ingest({ ts: iso(T0 + 5e3), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "finish", outcome: "completed", costUsd: 0.04, tokens: 1650 });
    f.ingest({ ts: iso(T0 + 6e3), missionId: "mission-a", seatId: "reviewer", role: "reviewer", harness: "codex", kind: "finish", outcome: "failed", costUsd: 0.01, tokens: 400 });
    views = f.seatViews(T0 + 7e3);
    const impl = views.find((v) => v.seatId === "impl");
    const rev = views.find((v) => v.seatId === "reviewer");
    assert.equal(impl?.status, "done");
    assert.equal(rev?.status, "failed");
    assert.equal(impl?.costUsd, 0.04);
    assert.equal(impl?.tokens, 1650);
  });
  it("a seat silent past the threshold is STAGNANT, not merely running", () => {
    const f = startedFleet();
    const before = f.seatViews(T0 + DEFAULT_STAGNANT_AFTER_MS - 1e3);
    assert.ok(before.every((v) => v.status === "running"));
    const after = f.seatViews(T0 + DEFAULT_STAGNANT_AFTER_MS + 1e3);
    assert.ok(after.every((v) => v.status === "stagnant"));
    assert.equal(f.stagnant(T0 + DEFAULT_STAGNANT_AFTER_MS + 1e3).length, 2);
  });
  it("a finish after stagnation wins: the seat ends, it does not stagnate", () => {
    const f = startedFleet();
    f.ingest({ ts: iso(T0 + DEFAULT_STAGNANT_AFTER_MS + 5e3), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "finish", outcome: "completed" });
    const views = f.seatViews(T0 + DEFAULT_STAGNANT_AFTER_MS + 6e3);
    assert.equal(views.find((v) => v.seatId === "impl")?.status, "done");
  });
});
describe("fleet \u2014 cost ledger honesty", () => {
  it("tokens without dollars are tokens-only, never a guessed conversion", () => {
    const f = startedFleet();
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
    f.ingest({ ts: iso(T0 + 1), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "finish", outcome: "completed", costUsd: 0.05, tokens: 2e3 });
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
describe("fleet \u2014 approval inbox", () => {
  it("a request opens the inbox; deciding closes it, and the seat waits meanwhile", () => {
    const f = startedFleet();
    f.ingest({ ts: iso(T0 + 1), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "approval-request", approvalId: "apr-1" });
    assert.equal(f.approvalInbox().length, 1);
    assert.equal(f.seatViews(T0 + 2).find((v) => v.seatId === "impl")?.status, "awaiting-approval");
    f.decideApproval("apr-1", "approved");
    assert.equal(f.approvalInbox().length, 0);
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
  it("isDecided exposes the decision for enforcement points (merge break-glass)", () => {
    const f = startedFleet();
    f.ingest({ ts: iso(T0 + 1), missionId: "mission-a", seatId: "impl", role: "coder", harness: "claude", kind: "approval-request", approvalId: "merge-run1" });
    assert.equal(f.isDecided("merge-run1"), false);
    f.decideApproval("merge-run1", "approved");
    assert.equal(f.isDecided("merge-run1"), true);
    assert.equal(f.isDecided(""), false);
  });
});
describe("fleet \u2014 determinism and subscription", () => {
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
    const unsub = f.subscribe(() => fired += 1);
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
