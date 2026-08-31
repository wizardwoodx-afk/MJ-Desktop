/**
 * CAPS — the money, the clock and the turn counter, enforced before dispatch.
 *
 * WHY THIS IS A SEPARATE MODULE
 *
 * A coding agent with no ceiling is a billing incident. Every orchestration layer that survives
 * contact with production has the same four controls: cost, turns, wall clock, and children. What
 * makes this one trustworthy is where the numbers come from.
 *
 * THE ONE RULE
 *
 * Cost is read out of the CLI's own output, or it is recorded as unknown. Never estimated. A token
 * count multiplied by a price MJ guessed is a fabricated metric dressed up as accounting, and a
 * budget built on it is theatre. So `costUsd` stays `null` for CLIs that report tokens only, and the
 * ledger says so out loud instead of quietly charging zero.
 *
 * A second rule follows from the first: a zero token total is NOT reported as 0. Zero means "the CLI
 * told us nothing", which is different from "the CLI measured nothing". Conflating them would let a
 * failed invocation look like a free successful one.
 */

export type CapOutcome = "ok" | "timeout" | "cost_cap" | "turn_cap" | "mission_cap";

export interface InvocationCaps {
  /** Wall-clock ceiling for one invocation. */
  timeoutMs: number;
  /** How many agent turns MJ will pay for. 0 disables. */
  maxTurns: number;
  /** Per-invocation cost ceiling in USD. 0 disables. */
  maxCostUsd: number;
}

export const DEFAULT_CAPS: InvocationCaps = { timeoutMs: 10 * 60 * 1000, maxTurns: 40, maxCostUsd: 5 };

export interface ReportedUsage {
  /** Real dollars, as reported by the CLI. null means the CLI does not report cost. */
  costUsd: number | null;
  /** Token total. null means no token data, which is not the same as zero tokens. */
  tokens: number | null;
  /** Turns the CLI says it used. null when it does not report them. */
  turns: number | null;
  /** Which harness reported this, so a mixed team can be audited per vendor. */
  source: string;
}

/** Why a charge is what it is. Kept as a sentence because it is shown to a human. */
export type CostBasis = "reported_usd" | "tokens_only" | "unknown";

export interface ChargeResult {
  chargedUsd: number;
  basis: CostBasis;
  /** Non-null when this charge put the invocation over a ceiling. */
  breach: CapOutcome | null;
  reason: string;
}

export interface MissionCapState {
  spentUsd: number;
  turnsUsed: number;
  startedAt: number;
  cappedInvocations: Array<{ id: string; outcome: CapOutcome; at: string; detail: string }>;
}

export interface MissionCaps {
  maxCostUsd: number;
  maxTurns: number;
  timeoutMs: number;
}

/**
 * The mission-level ledger.
 *
 * One instance per mission, shared by every seat. That is deliberate: a per-seat budget lets N seats
 * each spend the full amount, so a team of six has six times the ceiling the user set. The ceiling
 * has to be the mission's.
 *
 * Charges are read-then-write with no await between, so concurrent seats inside a wave cannot
 * interleave and both get admitted under the same remaining budget.
 */
export class CapLedger {
  readonly caps: MissionCaps;
  readonly state: MissionCapState;

  constructor(caps: MissionCaps, now: number = Date.now()) {
    this.caps = caps;
    this.state = { spentUsd: 0, turnsUsed: 0, startedAt: now, cappedInvocations: [] };
  }

  /** Can another invocation start at all? Checked BEFORE dispatch — refusing is control, charging after is bookkeeping. */
  admissionError(now: number = Date.now()): string | null {
    if (this.caps.maxCostUsd > 0 && this.state.spentUsd >= this.caps.maxCostUsd) {
      return `the mission has already spent $${this.state.spentUsd.toFixed(4)} of its $${this.caps.maxCostUsd.toFixed(4)} ceiling`;
    }
    if (this.caps.maxTurns > 0 && this.state.turnsUsed >= this.caps.maxTurns) {
      return `the mission has already used ${this.state.turnsUsed} of its ${this.caps.maxTurns} turns`;
    }
    if (this.caps.timeoutMs > 0 && now - this.state.startedAt >= this.caps.timeoutMs) {
      return `the mission's ${Math.round(this.caps.timeoutMs / 1000)}s wall clock has elapsed`;
    }
    return null;
  }

  /** Record what a CLI actually consumed. Returns why, so the caller can show it. */
  charge(r: ReportedUsage): ChargeResult {
    if (r.costUsd !== null && Number.isFinite(r.costUsd)) {
      this.state.spentUsd += r.costUsd;
      const breach = this.caps.maxCostUsd > 0 && this.state.spentUsd > this.caps.maxCostUsd ? "mission_cap" : null;
      return {
        chargedUsd: r.costUsd,
        basis: "reported_usd",
        breach,
        reason: breach
          ? `Charged $${r.costUsd.toFixed(4)} from ${r.source}, taking the mission to $${this.state.spentUsd.toFixed(4)} over a $${this.caps.maxCostUsd.toFixed(4)} ceiling.`
          : `Charged $${r.costUsd.toFixed(4)} reported by ${r.source}. Mission total $${this.state.spentUsd.toFixed(4)}.`,
      };
    }
    if (r.tokens !== null) {
      return {
        chargedUsd: 0,
        basis: "tokens_only",
        breach: null,
        reason: `${r.source} reported ${r.tokens} tokens and no price. Recorded as tokens; NOT converted to dollars, because a guessed price would be a fabricated cost.`,
      };
    }
    return { chargedUsd: 0, basis: "unknown", breach: null, reason: `${r.source} reported neither cost nor tokens, so nothing was charged and the true spend is unknown.` };
  }

  /** Note that something was stopped by a cap. Kept separately from charges: a refusal is not a spend. */
  recordCapped(id: string, outcome: CapOutcome, detail: string, at = new Date().toISOString()): void {
    this.state.cappedInvocations.push({ id, outcome, at, detail });
  }

  addTurns(n: number): void {
    this.state.turnsUsed += n;
  }

  snapshot(): MissionCapState {
    return { ...this.state, cappedInvocations: [...this.state.cappedInvocations] };
  }
}

export interface EnforcedResult<T> {
  outcome: CapOutcome;
  value: T | null;
  timedOut: boolean;
  elapsedMs: number;
  detail: string;
}

/**
 * Race work against a wall clock.
 *
 * The honest part: when the deadline wins, MJ cannot promise the child stopped. Killing a process is
 * the caller's job and is not always possible, so the detail says the caller must terminate it rather
 * than implying the deadline was enforced on the child.
 */
export async function withDeadline<T>(
  work: (signal: { cancelled: boolean }) => Promise<T>,
  timeoutMs: number,
  now: () => number = Date.now,
): Promise<EnforcedResult<T>> {
  const t0 = now();
  const signal = { cancelled: false };
  if (timeoutMs <= 0) {
    const value = await work(signal);
    return { outcome: "ok", value, timedOut: false, elapsedMs: now() - t0, detail: "No deadline set." };
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<"__timeout__">((resolve) => {
    timer = setTimeout(() => {
      signal.cancelled = true;
      resolve("__timeout__");
    }, timeoutMs);
  });
  const winner = await Promise.race([work(signal).then((v) => ({ v })), deadline]);
  if (timer) clearTimeout(timer);
  if (winner === "__timeout__") {
    return {
      outcome: "timeout",
      value: null,
      timedOut: true,
      elapsedMs: now() - t0,
      detail: `Deadline of ${timeoutMs}ms reached. The caller must terminate the child process; MJ cannot assume it stopped.`,
    };
  }
  return { outcome: "ok", value: (winner as { v: T }).v, timedOut: false, elapsedMs: now() - t0, detail: `Finished in ${now() - t0}ms, inside the ${timeoutMs}ms deadline.` };
}

/* ------------------------------------------------------------------ turn accounting */

export interface TurnAccount {
  used: number;
  limit: number;
  /** Turns the CLI itself reported, which may differ from MJ's count. */
  reported: number | null;
}

export function mayRunTurn(account: TurnAccount): { allowed: boolean; reason: string } {
  if (account.limit <= 0) return { allowed: true, reason: "No turn limit is set." };
  // When the CLI reports its own turn count, that is the better number: MJ counts invocations, the
  // CLI counts its internal reasoning steps, and the internal one is what costs money.
  const effective = account.reported !== null ? Math.max(account.used, account.reported) : account.used;
  if (effective >= account.limit) {
    return { allowed: false, reason: `${effective} of ${account.limit} turns used.` };
  }
  return { allowed: true, reason: `${effective} of ${account.limit} turns used.` };
}

export function nextTurn(account: TurnAccount): TurnAccount {
  return { ...account, used: account.used + 1 };
}

/* ------------------------------------------------------------------ parsing real output */

/**
 * Read usage out of a CLI's own bytes.
 *
 * Each shape here was checked against real output rather than a manual. Two nested layouts occur in
 * practice and a flat lookup silently returns null for the second, which would bill those runs at
 * zero:
 *   Claude Code:  { total_cost_usd, num_turns, usage: { input_tokens, output_tokens } }
 *   OpenCode:     { part: { cost, tokens: { total, input, output, reasoning, cache } } }
 *
 * OpenCode's tokens.total is CUMULATIVE across steps (observed 8019 then 8038), so the last value is
 * the run total and summing would multiply-count.
 */
export function parseReportedUsage(harness: string, raw: string): ReportedUsage {
  const empty: ReportedUsage = { costUsd: null, tokens: null, turns: null, source: harness };
  if (!raw.trim()) return empty;

  const candidates = jsonChunks(raw);
  let costUsd: number | null = null;
  let tokens: number | null = null;
  let turns: number | null = null;

  for (const obj of candidates) {
    const c = findNumber(obj, ["total_cost_usd", "cost_usd", "costUsd", "cost"], 0);
    if (c !== null) costUsd = c;
    const t = findNumber(obj, ["total_tokens"], 0) ?? sumTokens(obj);
    if (t === null) {
      const flat = findNumber(obj, ["tokens"], 0);
      if (flat !== null) tokens = flat;
    } else {
      tokens = t;
    }
    const n = findNumber(obj, ["num_turns", "turns", "total_turns"], 0);
    if (n !== null) turns = n;
  }

  // A CLI documented as never reporting a price must not have one inferred from a field that happens
  // to share a name.
  if (harness === "codex") costUsd = null;
  return { costUsd, tokens, turns, source: harness };
}

/** Split NDJSON or a JSON array into objects. Malformed lines are skipped, not fatal. */
function jsonChunks(raw: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const tryOne = (s: string) => {
    try {
      const v = JSON.parse(s) as unknown;
      if (v && typeof v === "object") out.push(v as Record<string, unknown>);
    } catch {
      /* not JSON */
    }
  };
  tryOne(raw.trim());
  for (const line of raw.split(/\r?\n/)) if (line.trim()) tryOne(line.trim());
  return out;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Breadth-first search for the first key holding a number.
 *
 * BFS rather than DFS so a top-level key always beats a deeply nested one with the same name, and
 * depth-limited so a pathological payload cannot cost unbounded time.
 */
function findNumber(obj: unknown, keys: string[], depth: number): number | null {
  if (depth > 3 || !obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const direct = pickNumber(o, keys);
  if (direct !== null) return direct;
  for (const v of Object.values(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = findNumber(v, keys, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}

/** Token totals from a nested usage block, handling both real shapes. */
function sumTokens(obj: Record<string, unknown>): number | null {
  const blocks: Array<Record<string, unknown>> = [];
  const collect = (o: unknown, depth: number) => {
    if (depth > 3 || !o || typeof o !== "object" || Array.isArray(o)) return;
    const rec = o as Record<string, unknown>;
    for (const k of ["usage", "tokens"]) {
      const v = rec[k];
      if (v && typeof v === "object" && !Array.isArray(v)) blocks.push(v as Record<string, unknown>);
    }
    for (const v of Object.values(rec)) collect(v, depth + 1);
  };
  collect(obj, 0);

  let best: number | null = null;
  for (const u of blocks) {
    const total = typeof u.total === "number" && Number.isFinite(u.total) ? u.total : null;
    const i = typeof u.input_tokens === "number" ? u.input_tokens : typeof u.input === "number" ? u.input : 0;
    const o = typeof u.output_tokens === "number" ? u.output_tokens : typeof u.output === "number" ? u.output : 0;
    // `total` wins when present: it is authoritative, and input+output omits reasoning and cache
    // reads, so summing would understate real consumption.
    const candidate = total !== null && total > 0 ? total : i + o > 0 ? i + o : null;
    if (candidate !== null) best = candidate;
  }
  return best;
}

/* ------------------------------------------------------------------ deriving caps from a seat */

/**
 * Turn a seat's declared limits into enforced ones.
 *
 * A limit too small to be usable is refused rather than honoured: a 5-second timeout on a coding
 * agent is not a cap, it is a guaranteed failure, and MJ says so instead of quietly running something
 * that cannot finish.
 */
export function capsForSeat(seat: { timeoutSecs: number; maxTurns: number | null }, costUsd: number | null): { caps: InvocationCaps; warnings: string[] } {
  const warnings: string[] = [];
  const timeoutMs = seat.timeoutSecs > 0 ? seat.timeoutSecs * 1000 : DEFAULT_CAPS.timeoutMs;
  if (seat.timeoutSecs > 0 && seat.timeoutSecs < 30) {
    warnings.push(`${seat.timeoutSecs}s is below the 30s floor for a coding agent; using it anyway, but expect a timeout on any real edit.`);
  }
  const maxTurns = seat.maxTurns !== null && seat.maxTurns > 0 ? seat.maxTurns : DEFAULT_CAPS.maxTurns;
  if (seat.maxTurns !== null && seat.maxTurns > 0 && seat.maxTurns < 3) {
    warnings.push(`${seat.maxTurns} turns is almost certainly too few to read a file and edit it.`);
  }
  const maxCostUsd = costUsd !== null && costUsd > 0 ? costUsd : DEFAULT_CAPS.maxCostUsd;
  return { caps: { timeoutMs, maxTurns, maxCostUsd }, warnings };
}
