/**
 * §THE MISSION LOOP — MJ 12.0: ONE engine — one canonical orchestrator over
 * MJ's shared engines of record. (12.0.1 states the model precisely: this
 * module does NOT fuse the specialized stores underneath into one physical
 * store; it orchestrates them — one runtime owns the cycle, one ledger
 * (mj.missionLoop.v1) is the cycle spine, one API is the product surface.)
 *
 * MJ 12.0 is the answer to a review that said it best: 11.14.10 organized the
 * product's shelves, but the features on them were still separate productions
 * — TEAMS, team self-evolution, the feedback loop, adaptive learning and
 * agent communication each had its own store, its own page(s), its own
 * vocabulary. This module is the product's spine made executable:
 *
 *   COMPOSE   →  DISPATCH   →  COMMUNICATE   →  EXECUTE   →  GATE   →  ADAPT
 *
 * ONE `runMissionLoopCycle()` drives a real team run through that whole arc
 * and folds the measured outcome back through the SAME engines a human used
 * to drive by hand across four pages:
 *
 *   The engines of record stay engines of record: team evolution, the
 *   autonomy/bandit store, lesson memory, the receipt engine, the inter-agent
 *   bus and crew persistence. What changed in 12.0 is that ONE runtime
 *   orchestrates them and ONE surface talks to that runtime — never to the
 *   fragments underneath.
 *
 *   • COMMUNICATE — every seat gets its dispatch on the inter-agent bus and
 *     the executor's real seat events land on the same channels (global bus).
 *   • EXECUTE     — `executeTeam` with the governance-arena preflight, the
 *     autonomy arms the bandit router picked, a signed budget ledger.
 *   • GATE        — the run's own gate verdict + arena stamp are the
 *     feedback; nothing is "graded" by this loop, it consumes the run's
 *     measured verdicts.
 *   • HUMAN FEEDBACK — (12.0.1) the operator rates any completed cycle
 *     1–5 with a comment through submitHumanFeedback(); the rating queues on
 *     every seat that ran and joins the seat's evidence at the next fold
 *     (1–2 criticism = weight-2 human evidence, 4–5 arms praise suppression,
 *     3 neutral) — the same pipeline the old Teams page drove by hand.
 *   • ADAPT       — the measured report feeds, in one place:
 *       – seat signals → team evolution store (candidates, human-gated),
 *       – bandit + elastic settlement → the autonomy store,
 *       – reflection → lesson memory (what this cycle proved),
 *       – one proof receipt per cycle (signed, verifiable, archived).
 *
 * The product surface (Loop page) talks to THIS module only — never to the
 * engines underneath, including the crew store, the bus and host-deps
 * adapters (12.0.1 rule: those are engine API, not page imports). The
 * engines stay as internal libraries the loop calls; the loop is the only
 * orchestrator. A page that imports
 * autonomyStore/lessons/teamEvolution directly is a fork of the engine, and
 * fork = the pre-12.0 disease this module exists to end.
 *
 * Honesty rules (same as the engines it calls):
 *   - Execution is `executeTeam` with real CLI deps in the app and injected
 *     deps in probes. There is no fallback that fakes a seat run.
 *   - Simulated harness runs stay experience-only for the bandit (the
 *     settlement rule), and signals always carry the seat's real flag.
 *   - Seat/team changes are proposed as CANDIDATES; a human approves them
 *     (SUGGEST) or the team's stored mode says AUTONOMOUS. The run-level mode
 *     passed to a cycle governs settlement; OFF also disables the evolution
 *     fold. Nothing the loop "learns" edits a team silently in SUGGEST.
 */
import { uid } from "../app/id";
import {
  PREBUILT_TEAMS,
  loadSavedTeams,
  saveTeams,
  upsertTeam,
  type CliAgentTeam,
  type TeamSeat,
} from "./agentTeam";
import {
  loadTeamEvoStore,
  saveTeamEvoStore,
  applyTeamFeedback,
  signalsFromSeatRecords,
  evolveTeamAfterRun,
  decideCandidate,
  applyCandidateToTeam,
  type TeamEvolutionCandidate,
  type TeamEvolveMode,
} from "./teamEvolution";
import { loadAutonomy, type AutonomyState } from "./autonomyStore";
import {
  prepareAutonomy,
  settleAutonomyAfterRun,
  type SettleResult,
} from "./autonomyRuntime";
import {
  executeTeam,
  type SeatAssignment,
  type TeamRunReport,
  type TeamRunnerDeps,
  type TeamRunRequest,
} from "./teamExecutor";
import { CapLedger } from "./caps";
import { globalAgentBus, type InterAgentMessage } from "./interAgentChannel";
import { hostRunnerDeps } from "./hostDeps";
import { buildProofReceipt, verifyProofReceipt, type ProofReceipt } from "./receipts";
import { loadLessons, saveLessons, reflectOnMission, mergeLessons } from "./lessons";
import { getHarness } from "./harnessAdapters";
import { MJ_VERSION } from "../version";
import { currentEdition } from "./licensing";

/* ─────────────────────────────────────────────────────────────── state ─── */

export type LoopPhase =
  | "idle"
  | "compose"
  | "dispatch"
  | "communicate"
  | "execute"
  | "gate"
  | "adapt";

export interface LoopSeatOutcome {
  seatId: string;
  role: string;
  harness: string;
  outcome: string;
  verified: boolean;
}

export interface LoopCycleRecord {
  cycleNo: number;
  missionId: string;
  objective: string;
  teamId: string;
  teamName: string;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  status: string;
  gate: { status: string; tier: string } | null;
  arena: { gate: string; digest: string } | null;
  arms: string[];
  seats: LoopSeatOutcome[];
  verifiedSeats: number;
  seatCount: number;
  spentUsd: number;
  messagesOnBus: number;
  lessonsAdded: number;
  banditTrials: number;
  receipt: { hash: string; ok: boolean } | null;
  candidateIds: string[];
  note: string;
}

export interface MissionLoopState {
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  running: boolean;
  currentPhase: LoopPhase;
  cycles: LoopCycleRecord[];
  feedbackByCycle: Record<string, CycleHumanFeedback>;
  lastError: string | null;
}

export interface CycleHumanFeedback {
  rating: number;
  comment: string;
  at: string;
}

const LS_KEY = "mj.missionLoop.v1";

function emptyLoopState(): MissionLoopState {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    running: false,
    currentPhase: "idle",
    cycles: [],
    feedbackByCycle: {},
    lastError: null,
  };
}

export function loadMissionLoopState(): MissionLoopState {
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY);
    if (!raw) return emptyLoopState();
    const parsed = JSON.parse(raw) as Partial<MissionLoopState>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.cycles)) return emptyLoopState();
    return {
      schemaVersion: 1,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      running: parsed.running ?? false,
      currentPhase: parsed.currentPhase ?? "idle",
      cycles: parsed.cycles as LoopCycleRecord[],
      feedbackByCycle: (parsed as { feedbackByCycle?: Record<string, CycleHumanFeedback> }).feedbackByCycle ?? {},
      lastError: parsed.lastError ?? null,
    };
  } catch {
    return emptyLoopState();
  }
}

export function saveMissionLoopState(next: MissionLoopState): void {
  next.updatedAt = new Date().toISOString();
  try {
    globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* memory-only when storage is unavailable */
  }
}

export function subscribeMissionLoop(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY) cb();
  };
  globalThis.addEventListener?.("storage", onStorage);
  return () => globalThis.removeEventListener?.("storage", onStorage);
}

/* ──────────────────────────────────────────────────────────── the cycle ─── */

export interface MissionLoopEmit {
  (ev: { phase?: LoopPhase; note?: string; message?: InterAgentMessage }): void;
}

export interface MissionLoopRunArgs {
  team: CliAgentTeam;
  objective: string;
  /** The deps the loop executes with. The Loop page passes the host's real
   *  CLI deps; probes inject deterministic ones. When omitted the loop uses
   *  `noHostDeps()`, which reports every seat blocked — never faked. */
  deps?: TeamRunnerDeps;
  repoRoot?: string;
  /** The repository's own verification command, e.g. ["node", "test.js"]. */
  testCommand?: string[];
  /** The repository's base branch (default "main" — probes pass the real one). */
  baseBranch?: string;
  budgetCapUsd?: number;
  /** SUGGEST keeps humans in the loop (default when the team has no stored
   *  mode); AUTONOMOUS applies passing candidates immediately (Pro-gated by
   *  the settlement engine itself); OFF disables team evolution entirely. */
  mode?: TeamEvolveMode;
  emit?: MissionLoopEmit;
  now?: number;
}

export interface MissionLoopRunResult {
  record: LoopCycleRecord;
  report: TeamRunReport;
  updatedTeam: CliAgentTeam | null;
  settled: SettleResult | null;
  candidates: TeamEvolutionCandidate[];
  receipt: ProofReceipt | null;
}

/** Deps for a host with no reachable CLI layer: honest "blocked", never fake. */
export function noHostDeps(): TeamRunnerDeps {
  return {
    cliInvoke: async () => ({ exitCode: null, stdout: "", stderr: "no host CLI layer", durationMs: 0, timedOut: true }),
    resolveBin: async () => null,
    writeFile: async () => undefined,
  };
}

/** The TeamsPage assignment recipe, owned by the loop now: one assignment per
 *  seat, waves by role, read-only for non-writers, prompt = instructions +
 *  objective. Every seat's dispatch is ALSO published to the inter-agent bus
 *  (COMMUNICATE phase) so the run's communication is visible and live. */
export function composeAssignments(team: CliAgentTeam, objective: string): SeatAssignment[] {
  return team.seats.map((s, idx) => ({
    seat: s,
    prompt: `${s.instructions ? `${s.instructions}\n\n` : ""}Objective: ${objective}\nScope: Touch only authorized files.`,
    wave: s.role === "planner" || s.role === "architect" ? 1 : s.mayWrite ? 2 : 3,
    readOnly: !s.mayWrite,
    turnNumber: idx + 1,
  }));
}

function dispatchChannel(role: string): string {
  if (role === "planner" || role === "architect") return "#architecture";
  if (role === "coder" || role === "debugger") return "#implementation-sync";
  if (role === "tester" || role === "security" || role === "reviewer") return "#qa-review";
  return "#general";
}

function anySeatSimulated(team: CliAgentTeam, report: TeamRunReport): boolean {
  return team.seats.some((s) => getHarness(s.harness)?.simulated ?? false) || report.seats.some((r) => r.outcome.startsWith("simulated"));
}

/**
 * ONE cycle of the Mission Loop. Runs the arc end to end against the real
 * engines and folds the measured outcome into the shared stores:
 *
 *   compose → dispatch → communicate → execute (arena-gated) → gate → adapt
 *
 * Returns everything the UI needs: the cycle record for the loop ledger, the
 * raw run report, the settlement, and any candidates the team's own evolution
 * engine proposed from THIS cycle's measured evidence.
 */
export async function runMissionLoopCycle(args: MissionLoopRunArgs): Promise<MissionLoopRunResult> {
  const { team, objective } = args;
  const now = args.now ?? Date.now();
  const startedAt = new Date(now).toISOString();
  const deps = args.deps ?? noHostDeps();
  const loopState = loadMissionLoopState();
  loopState.running = true;
  loopState.currentPhase = "compose";
  loopState.lastError = null;
  saveMissionLoopState(loopState);
  const emit: MissionLoopEmit = args.emit ?? (() => undefined);

  const cycleNo = loopState.cycles.length + 1;
  const missionId = `loop-${cycleNo}-${uid("cyc").slice(0, 8)}`;
  const fail = (note: string): LoopCycleRecord => {
    const record: LoopCycleRecord = {
      cycleNo,
      missionId,
      objective,
      teamId: team.id,
      teamName: team.name,
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs: Date.now() - now,
      status: "aborted",
      gate: null,
      arena: null,
      arms: [],
      seats: [],
      verifiedSeats: 0,
      seatCount: team.seats.length,
      spentUsd: 0,
      messagesOnBus: globalAgentBus.getMessages().length,
      lessonsAdded: 0,
      banditTrials: 0,
      receipt: null,
      candidateIds: [],
      note,
    };
    const next = loadMissionLoopState();
    next.running = false;
    next.currentPhase = "idle";
    next.lastError = note;
    next.cycles = [...next.cycles, record];
    saveMissionLoopState(next);
    return record;
  };

  try {
    emit({ phase: "compose", note: `composing ${team.seats.length} seats for cycle ${cycleNo}` });
    const assignments = composeAssignments(team, objective);
    const autonomy = prepareAutonomy();

    emit({ phase: "dispatch", note: `bandit router armed this cycle: ${autonomy.arms.join(", ")}` });
    for (const a of assignments) {
      globalAgentBus.publish({
        channel: dispatchChannel(a.seat.role),
        sender: { seatId: "loop.orchestrator", name: "Mission Loop", role: "planner", harness: "llm" },
        mentions: [`@${a.seat.id}`],
        intent: "handoff",
        content: `[dispatch] ${a.seat.role} "${a.seat.id}" — ${objective}`,
        data: { wave: a.wave, readOnly: a.readOnly, cycleNo },
      });
    }

    emit({ phase: "communicate", note: `dispatch notices on the bus; seats run their briefings` });
    const ledger = new CapLedger(
      { maxCostUsd: args.budgetCapUsd ?? team.budgetUsd ?? 5, maxTurns: 120, timeoutMs: 30 * 60_000 },
      now,
    );
    const req: TeamRunRequest = {
      team,
      assignments,
      repoRoot: args.repoRoot ?? ".",
      baseBranch: args.baseBranch ?? "main",
      missionSlug: missionId,
      objective,
      ...(args.testCommand ? { testCommand: args.testCommand } : {}),
      ledger,
      autonomy,
    };

    emit({ phase: "execute", note: `executeTeam under the governance arena + budget ledger` });
    const report = await executeTeam(req, deps);
    const tFinished = Date.now();
    const finishedAt = new Date(tFinished).toISOString();
    const gateStatus = report.gate?.status ?? null;
    const gateTier = report.gate?.tier ?? null;
    const arena = report.arena ? { gate: report.arena.gate, digest: report.arena.digest } : null;

    emit({ phase: "gate", note: `gate ${gateStatus ?? "n/a"} (${gateTier ?? "unverified"}) · arena ${arena?.gate ?? "n/a"}` });

    /* ── ADAPT: fold the ONE measured report through the engines ─────────── */
    emit({ phase: "adapt", note: "folding seat signals, bandit, lessons and receipts" });
    const evoStore0 = loadTeamEvoStore();
    const mode: TeamEvolveMode = args.mode ?? evoStore0.byTeam[team.id]?.mode ?? "SUGGEST";
    const signals = signalsFromSeatRecords({
      runId: missionId,
      ts: finishedAt,
      teamId: team.id,
      seats: report.seats.map((s) => ({
        seatId: s.seatId,
        role: s.role,
        harness: s.harness,
        outcome: s.outcome,
        exitCode: s.exitCode,
        chargedUsd: s.chargedUsd,
        durationMs: s.durationMs,
        verified: s.verified,
        simulated: s.outcome.startsWith("simulated") || (getHarness(s.harness)?.simulated ?? false),
      })),
    });
    let evoStore = evoStore0;
    const candidateIds: string[] = [];
    for (const sig of signals) {
      const folded = evolveTeamAfterRun({ store: evoStore, team, signal: sig, actor: "mission-loop" });
      evoStore = folded.store;
      // In OFF mode the evolution engine records telemetry but never proposes.
      if (folded.candidate) candidateIds.push(folded.candidate.id);
    }
    saveTeamEvoStore(evoStore);

    const simulated = anySeatSimulated(team, report);
    const settled = settleAutonomyAfterRun({
      team,
      report: {
        status: report.status,
        seats: report.seats.map((s) => ({ seatId: s.seatId, role: s.role, outcome: s.outcome, verified: s.verified, harness: s.harness })),
        autonomyArms: report.autonomyArms ?? autonomy.arms,
        reviewedBySnapshot: report.snapshot?.built ?? false,
        ...(gateStatus ? { gateStatus, gateTier: gateTier ?? "unverified" } : {}),
      },
      mode,
      simulated,
    });

    // Reflection: what did this measured cycle prove? Deterministic — same
    // facts in, same lessons out (lessons.ts), merged into org memory.
    const failedSeats = report.seats.filter((s) => s.outcome === "failed" || s.outcome === "timeout");
    const freshLessons = reflectOnMission({
      missionId,
      simulated,
      verified: report.status === "completed" && report.seats.some((s) => s.verified),
      failureClasses: failedSeats.length > 0 ? ["seat-failed"] : [],
      repairLadder: [],
      repaired: false,
      seatOutcomes: report.seats.map((s) => ({ role: s.role, passed: s.verified })),
      now: tFinished,
    });
    const memory = loadLessons();
    const merged = mergeLessons(memory, freshLessons, tFinished);
    saveLessons(merged, "agent");

    // One signed, verifiable proof receipt per cycle — the loop's audit trail.
    const receipt = await buildProofReceipt({
      mission: missionId,
      teamId: team.id,
      startedAt,
      finishedAt,
      mjVersion: MJ_VERSION,
      edition: currentEdition(),
      report: {
        status: report.status,
        seats: report.seats.map((s) => ({ seatId: s.seatId, role: s.role, outcome: s.outcome, verified: s.verified, harness: s.harness })),
        autonomyArms: report.autonomyArms ?? autonomy.arms,
        reviewedBySnapshot: report.snapshot?.built ?? false,
        ...(gateStatus ? { gateStatus, gateTier: gateTier ?? "unverified" } : {}),
        ...(arena ? { arenaGate: { gate: arena.gate as "PASS" | "REFUSED", digest: arena.digest, summary: report.arena?.summary ?? "", total: report.arena?.total ?? 0, defended: report.arena?.defended ?? 0, breached: report.arena?.breached ?? 0 } } : {}),
      },
    });
    const verifiedReceipt = (await verifyProofReceipt(receipt)).ok;

    const autonomyNow = loadAutonomy();
    const record: LoopCycleRecord = {
      cycleNo,
      missionId,
      objective,
      teamId: team.id,
      teamName: team.name,
      startedAt,
      finishedAt,
      elapsedMs: tFinished - now,
      status: report.status,
      gate: gateStatus ? { status: gateStatus, tier: gateTier ?? "unverified" } : null,
      arena,
      arms: report.autonomyArms ?? autonomy.arms,
      seats: report.seats.map((s) => ({ seatId: s.seatId, role: s.role, harness: s.harness, outcome: s.outcome, verified: s.verified })),
      verifiedSeats: report.seats.filter((s) => s.verified).length,
      seatCount: report.seats.length,
      spentUsd: report.spentUsd ?? 0,
      messagesOnBus: globalAgentBus.getMessages().length,
      lessonsAdded: freshLessons.length,
      banditTrials: Object.values(autonomyNow.bandit.arms).reduce((a, b) => a + b.pulls, 0),
      receipt: { hash: receipt.seal, ok: verifiedReceipt },
      candidateIds,
      note: report.summary ?? "",
    };

    const next = loadMissionLoopState();
    next.running = false;
    next.currentPhase = "idle";
    next.cycles = [...next.cycles, record];
    saveMissionLoopState(next);
    emit({ note: `cycle ${cycleNo} recorded (${record.status}, ${record.verifiedSeats}/${record.seatCount} verified)` });

    const pending = evoStore.candidates.filter((c) => candidateIds.includes(c.id) && c.status === "PROPOSED");
    return { record, report, updatedTeam: settled.applied ? settled.updatedTeam : null, settled, candidates: pending, receipt };
  } catch (err) {
    const note = err instanceof Error ? err.message : String(err);
    const record = fail(note);
    emit({ note: `cycle failed: ${note}` });
    return { record, report: null as unknown as TeamRunReport, updatedTeam: null, settled: null, candidates: [], receipt: null };
  }
}

/* ─────────────────────────────────────────────── the human gate (SUGGEST) ─── */

export interface LoopDecision {
  updatedStore: ReturnType<typeof loadTeamEvoStore>;
  decided: TeamEvolutionCandidate | null;
  updatedTeam: CliAgentTeam | null;
}

/**
 * A human decision on a candidate the loop's adaptation proposed. ACCEPTED
 * applies the candidate to the team (instructions revised) and marks the
 * store; REJECTED records the refusal. The decision lands in the SAME store
 * the next cycle reads — that is how a human correction becomes the next
 * cycle's instruction, with no separate bookkeeping.
 */
export function decideLoopCandidate(args: {
  team: CliAgentTeam;
  candidateId: string;
  decision: "ACCEPTED" | "REJECTED";
  by: string;
}): LoopDecision {
  const store = loadTeamEvoStore();
  const decided = decideCandidate(store, args.candidateId, args.decision, args.by);
  saveTeamEvoStore(decided);
  const candidate = decided.candidates.find((c) => c.id === args.candidateId);
  let updatedTeam: CliAgentTeam | null = null;
  if (candidate && candidate.status === "DECIDED" && candidate.decision === "ACCEPTED") {
    updatedTeam = applyCandidateToTeam(args.team, candidate, args.by);
  }
  return { updatedStore: decided, decided: candidate ?? null, updatedTeam };
}

/* ─────────────────────────────────── 12.0.1: the surface's crew/bus/feedback API ─── */
/* The Loop page imports THIS module only (navAlign pins it). These are the
 * adapters the page used to reach for directly (agentTeam, hostDeps,
 * interAgentChannel) — now they are engine API. */

/** Crew persistence, owned by the engine: saved crews, else the prebuilts. */
export function loadCrews(): CliAgentTeam[] {
  const saved = loadSavedTeams();
  return saved.length ? saved : PREBUILT_TEAMS;
}

/** Upsert + persist one crew; returns the next list for the surface's state. */
export function persistCrew(current: CliAgentTeam[], team: CliAgentTeam): CliAgentTeam[] {
  const next = upsertTeam(current, team);
  saveTeams(next);
  return next;
}

/** The host's real CLI deps (native shell on desktop; honest simulation on
 *  browser hosts). Probes inject deterministic deps instead — never this. */
export function loopHostDeps(opts?: { testCommand?: string }): TeamRunnerDeps {
  return hostRunnerDeps(opts);
}

/** The inter-agent bus, projected through the engine. The page subscribes
 *  here; it never imports the channel module itself. */
export interface LoopBusProjection {
  messages: InterAgentMessage[];
  subscribe(listener: (msg: InterAgentMessage) => void): () => void;
}
export function loopBusFeed(): LoopBusProjection {
  return { messages: globalAgentBus.getMessages(), subscribe: globalAgentBus.subscribe };
}

export interface HumanFeedbackResult {
  ok: boolean;
  error?: string;
}

/**
 * The explicit human feedback API (12.0.1): rate a completed cycle 1-5 with a
 * comment. The rating is attached to every seat that ran that cycle through
 * the SAME applyTeamFeedback pipeline the pre-12.0 Teams page drove by hand,
 * so it lands in the shared team-evolution store and is folded at the next
 * ADAPT: 1-2 becomes weight-2 human evidence, 4-5 arms praise suppression,
 * 3 is neutral. The loop state keeps one current entry per cycle. Returns
 * { ok: false, error } without touching any store when the rating or the
 * cycle is invalid.
 *
 * 12.0.2 integrity rules: (a) the submitted teamId MUST equal the team that
 * actually ran the cycle — mismatched-team feedback is refused before any
 * store is touched; (b) re-rating the same cycle before the fold supersedes
 * the unconsumed queued entry (one current human input per run), it does not
 * accumulate — the verbatim submission history still records every rating.
 *
 * 12.0.3 rating-scope rule: only cycles that produced measured seat outcomes
 * can be rated. An ABORTED cycle (nothing executed) is refused with an
 * explicit error; a gate-FAIL/blocked cycle whose seats ran stays ratable.
 */
export function submitHumanFeedback(args: {
  cycleId: string;
  teamId: string;
  rating: number;
  comment: string;
  nowIso?: string;
}): HumanFeedbackResult {
  if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
    return { ok: false, error: "rating must be an integer 1..5" };
  }
  const state = loadMissionLoopState();
  const cycle =
    state.cycles.find((c) => c.missionId === args.cycleId) ??
    state.cycles.find((c) => String(c.cycleNo) === args.cycleId);
  if (!cycle) return { ok: false, error: `no recorded cycle matches ${args.cycleId}` };
  // 12.0.2 — team binding: a rating may only attach to the team that actually ran the cycle.
  // Without this, a caller could file feedback for Team A's cycle under Team B's id and the
  // rating would land on Team B's seat records.
  if (cycle.teamId !== args.teamId) {
    return { ok: false, error: `cycle ${cycle.missionId} ran team ${cycle.teamId}, not ${args.teamId}` };
  }
  // 12.0.3 — only cycles that RAN can be rated. An aborted cycle executed
  // nothing (no seats, no verdict), so feedback on it would be pretend.
  // Gate-FAIL / blocked cycles DID run their seats and stay ratable: humans
  // rate exactly the runs that went wrong.
  if (cycle.status === "aborted") {
    return { ok: false, error: `cycle ${cycle.missionId} aborted before any seat ran — nothing to rate` };
  }
  if (cycle.seats.length === 0) return { ok: false, error: "the cycle has no seat records to attach feedback to" };
  const now = args.nowIso ?? new Date().toISOString();
  let store = loadTeamEvoStore();
  for (const seat of cycle.seats) {
    store = applyTeamFeedback(store, {
      teamId: args.teamId,
      seatId: seat.seatId,
      runId: cycle.missionId,
      rating: args.rating,
      comment: args.comment,
      nowIso: now,
    });
  }
  saveTeamEvoStore(store);
  state.feedbackByCycle = {
    ...state.feedbackByCycle,
    [cycle.missionId]: { rating: args.rating, comment: args.comment, at: now },
  };
  saveMissionLoopState(state);
  return { ok: true };
}

/** The cycle's current human rating entry, or null. Pure read for the surface. */
export function humanFeedbackFor(state: MissionLoopState, cycleId: string): CycleHumanFeedback | null {
  return state.feedbackByCycle[cycleId] ?? null;
}

/* ─────────────────────────────────────────────── multi-cycle loop runner ─── */

export interface MissionLoopBatchArgs extends MissionLoopRunArgs {
  cycles: number;
  /** One workspace (repo + base branch) per mission. The executor keeps each
   *  seat's worktree on disk as evidence (probes read it after the run), so
   *  every mission needs its own checkout. Optional: falls back to repoRoot. */
  workspaces?: Array<{ repoRoot: string; baseBranch: string }>;
  /** Between cycles: after a human approved a candidate, the batch uses the
   *  UPDATED team so improvement is actually carried into the next run. */
  applyApproved?: (candidate: TeamEvolutionCandidate, team: CliAgentTeam) => CliAgentTeam;
  onCycle?: (result: MissionLoopRunResult, index: number) => void;
}

export async function runMissionLoopBatch(args: MissionLoopBatchArgs): Promise<MissionLoopRunResult[]> {
  const out: MissionLoopRunResult[] = [];
  let team = args.team;
  const ws = args.workspaces ?? [];
  for (let i = 0; i < args.cycles; i++) {
    const w = ws[i % ws.length];

    const result = await runMissionLoopCycle({
      ...args,
      team,
      ...(w ? { repoRoot: w.repoRoot, baseBranch: w.baseBranch } : {}),
    });
    out.push(result);
    if (args.onCycle) args.onCycle(result, i);
    // Autonomous mode may have grown the team (elastic seats): carry it forward.
    if (result.updatedTeam) team = result.updatedTeam;
    // SUGGEST: if the caller approved candidates between cycles, carry the
    // updated team forward too.
    if (args.applyApproved) {
      const store = loadTeamEvoStore();
      const pending = store.candidates.filter((c) => c.teamId === team.id && c.status === "PROPOSED");
      for (const c of pending) {
        const decision = decideLoopCandidate({ team, candidateId: c.id, decision: "ACCEPTED", by: "mission-loop-batch" });
        if (decision.updatedTeam) team = decision.updatedTeam;
      }
    }
  }
  return out;
}

/** Convenience: full loop state with the candidates the human gate still owes
 *  a decision on, for the current team. */
export function pendingCandidates(teamId: string): TeamEvolutionCandidate[] {
  return loadTeamEvoStore().candidates.filter((c) => c.teamId === teamId && c.status === "PROPOSED");
}

export function autonomySnapshot(): AutonomyState {
  return loadAutonomy();
}

export interface LessonDigestEntry {
  id: string;
  kind: string;
  text: string;
  createdAt: number;
}

/** Recent lesson memory, newest first — the engine's view of what cycles
 *  taught. The page reads THIS, never the lessons store directly. */
export function lessonDigest(count = 4): LessonDigestEntry[] {
  return loadLessons()
    .slice(-count)
    .reverse()
    .map((l) => ({ id: l.id, kind: l.kind, text: l.text, createdAt: l.createdAt }));
}

/* 12.1.0 — KNOWLEDGE FORGE: books → human-approved skills (engine API). The
 * Loop page imports this module only (navAlign pins it), so the forge's
 * functions are engine API. */
export {
  proposeKnowledgeSkill,
  decideKnowledgeProposal,
  loadKnowledgeProposals,
  extractStructure,
  type KnowledgeProposal,
  type KnowledgeProvenance,
  type Distiller,
  type ForgeDeps,
} from "./knowledgeSkills";

/* keep types referenced for tsc consumers */
export type {
  TeamEvolutionCandidate,
  TeamEvolveMode,
  InterAgentMessage,
  CliAgentTeam,
  TeamSeat,
};
