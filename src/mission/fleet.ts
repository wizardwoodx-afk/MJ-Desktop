/**
 * §FLEET BOARD — Mission Control's measured state (MJ 11.9.9).
 *
 * Mission Control is not a dashboard painted over promises; it is a projection of the same
 * measured facts the receipts chain. Every seat transition the team runner observes becomes
 * a FleetEvent here, and everything the Control page shows — seat status, the cost ledger,
 * stagnation alerts, the approval inbox — is derived from those events by pure selectors.
 *
 * THE COST LEDGER HONESTY RULE (from harnessPolicy.parseUsage, kept intact here):
 * figures are only ever what the CLI itself reported. A harness that reports tokens but not
 * dollars contributes tokens and `costUsd: 0` with an honest "tokens-only" flag at the UI
 * layer — MJ never converts with a guessed price.
 *
 * Node-import-safe: storage guarded; time is a parameter (selectors take `now`), so probes
 * can test stagnation without waiting for real minutes to pass.
 */

export type FleetSeatStatus = "queued" | "running" | "awaiting-approval" | "done" | "failed" | "stagnant";

export interface FleetEvent {
  /** ISO timestamp of the observation. */
  ts: string;
  missionId: string;
  seatId: string;
  role: string;
  harness: string;
  kind: "queued" | "start" | "heartbeat" | "finish" | "approval-request" | "approval-decided";
  /** Set on finish: the seat's measured outcome ("completed", "failed", ...). */
  outcome?: string;
  /** What the CLI itself reported for this seat. null = not reported. */
  costUsd?: number | null;
  tokens?: number | null;
  /** For approval-request / approval-decided. */
  approvalId?: string;
  /** True when the seat ran against a labelled test double, never a real CLI. */
  simulated?: boolean;
}

export interface FleetSeatView {
  key: string;
  missionId: string;
  seatId: string;
  role: string;
  harness: string;
  status: FleetSeatStatus;
  lastTs: string;
  costUsd: number;
  /** True when this seat's harness reported tokens but not dollars (cost shown as 0). */
  tokensOnly: boolean;
  tokens: number;
  outcome: string | null;
  simulated: boolean;
}

export interface FleetApproval {
  approvalId: string;
  missionId: string;
  seatId: string;
  harness: string;
  since: string;
}

export interface CostRow {
  runs: number;
  costUsd: number;
  /** True when at least one run reported tokens without dollars. */
  tokensOnly: boolean;
  tokens: number;
  simulatedRuns: number;
}

export interface FleetTotals {
  missions: number;
  seatRuns: number;
  costUsd: number;
  tokens: number;
  simulatedRuns: number;
}

const EVENTS_CAP = 800;
const STORAGE_KEY = "mj.fleet.v1";
/** A running seat with no event for this long is stagnant, not merely busy. */
export const DEFAULT_STAGNANT_AFTER_MS = 15 * 60 * 1000;

export class FleetBoard {
  private events: FleetEvent[] | null = null;
  private listeners = new Set<() => void>();

  private ensure(): FleetEvent[] {
    if (this.events) return this.events;
    let loaded: FleetEvent[] = [];
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          loaded = parsed.filter((e): e is FleetEvent => Boolean(e && typeof e === "object" && (e as FleetEvent).missionId && (e as FleetEvent).kind));
        }
      }
    } catch {
      loaded = [];
    }
    this.events = loaded;
    return loaded;
  }

  private persist(): void {
    try {
      const ev = this.ensure();
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ev.slice(Math.max(0, ev.length - EVENTS_CAP))));
    } catch {
      /* storage unavailable — live board still works this session */
    }
  }

  ingest(event: FleetEvent): void {
    const ev = this.ensure();
    ev.push(event);
    if (ev.length > EVENTS_CAP) ev.splice(0, ev.length - EVENTS_CAP);
    this.persist();
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        /* a broken subscriber must not break the board */
      }
    }
  }

  /** Record the run's seats as queued+start in one call (runner convenience). */
  missionStarted(missionId: string, seats: Array<{ seatId: string; role: string; harness: string }>, ts: string): void {
    for (const s of seats) {
      this.ingest({ ts, missionId, seatId: s.seatId, role: s.role, harness: s.harness, kind: "start" });
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  eventsAll(): FleetEvent[] {
    return [...this.ensure()];
  }

  clear(): void {
    this.events = [];
    this.persist();
    for (const l of this.listeners) l();
  }

  /** Per-seat projection. `now` is a parameter so stagnation is testable. */
  seatViews(now: number, stagnantAfterMs: number = DEFAULT_STAGNANT_AFTER_MS): FleetSeatView[] {
    const byKey = new Map<string, FleetEvent[]>();
    for (const e of this.ensure()) {
      const key = `${e.missionId}::${e.seatId}`;
      const arr = byKey.get(key);
      if (arr) arr.push(e);
      else byKey.set(key, [e]);
    }
    const views: FleetSeatView[] = [];
    for (const [key, evts] of byKey) {
      evts.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
      const last = evts[evts.length - 1];
      let costUsd = 0;
      let tokens = 0;
      let tokensOnly = false;
      let outcome: string | null = null;
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
      let status: FleetSeatStatus;
      if (last.kind === "approval-request" && !this.approvalDecided(last.approvalId ?? "")) {
        status = "awaiting-approval";
      } else if (last.kind === "finish") {
        status = last.outcome === "completed" ? "done" : "failed";
      } else if (last.kind === "queued") {
        status = "queued";
      } else {
        // start or heartbeat — running, unless silent for too long
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
        simulated,
      });
    }
    views.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return views;
  }

  private approvalDecided(approvalId: string): boolean {
    if (!approvalId) return false;
    return this.ensure().some((e) => e.kind === "approval-decided" && e.approvalId === approvalId);
  }

  /** Cost ledger by harness — measured CLI reports only, never guessed conversions. */
  costByHarness(): Record<string, CostRow> {
    const out: Record<string, CostRow> = {};
    for (const e of this.ensure()) {
      if (e.kind !== "finish") continue;
      const row = (out[e.harness] ??= { runs: 0, costUsd: 0, tokensOnly: false, tokens: 0, simulatedRuns: 0 });
      row.runs += 1;
      row.costUsd += typeof e.costUsd === "number" ? e.costUsd : 0;
      row.tokens += typeof e.tokens === "number" ? e.tokens : 0;
      if (typeof e.costUsd !== "number" && typeof e.tokens === "number") row.tokensOnly = true;
      if (e.simulated === true) row.simulatedRuns += 1;
    }
    return out;
  }

  /** Same ledger grouped by role. */
  costByRole(): Record<string, CostRow> {
    const out: Record<string, CostRow> = {};
    for (const e of this.ensure()) {
      if (e.kind !== "finish") continue;
      const row = (out[e.role] ??= { runs: 0, costUsd: 0, tokensOnly: false, tokens: 0, simulatedRuns: 0 });
      row.runs += 1;
      row.costUsd += typeof e.costUsd === "number" ? e.costUsd : 0;
      row.tokens += typeof e.tokens === "number" ? e.tokens : 0;
      if (typeof e.costUsd !== "number" && typeof e.tokens === "number") row.tokensOnly = true;
      if (e.simulated === true) row.simulatedRuns += 1;
    }
    return out;
  }

  totals(): FleetTotals {
    const missions = new Set<string>();
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

  stagnant(now: number, stagnantAfterMs: number = DEFAULT_STAGNANT_AFTER_MS): FleetSeatView[] {
    return this.seatViews(now, stagnantAfterMs).filter((v) => v.status === "stagnant");
  }

  /** Open approval requests — the unified inbox Mission Control shows. */
  approvalInbox(): FleetApproval[] {
    const out: FleetApproval[] = [];
    for (const e of this.ensure()) {
      if (e.kind !== "approval-request" || !e.approvalId) continue;
      if (this.approvalDecided(e.approvalId)) continue;
      out.push({ approvalId: e.approvalId, missionId: e.missionId, seatId: e.seatId, harness: e.harness, since: e.ts });
    }
    return out;
  }

  /** Decide an approval from the inbox. The decision is itself a fleet event. */
  decideApproval(approvalId: string, decision: "approved" | "rejected"): void {
    const req = this.ensure().find((e) => e.kind === "approval-request" && e.approvalId === approvalId);
    if (!req) return;
    this.ingest({
      ts: new Date().toISOString(),
      missionId: req.missionId,
      seatId: req.seatId,
      role: req.role,
      harness: req.harness,
      kind: "approval-decided",
      approvalId,
      outcome: decision,
    });
  }
}

export const globalFleet = new FleetBoard();
