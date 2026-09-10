/**
 * THE MERGE — Vouch Harbor 16.0 (STEP3-MERGE-SPEC.md, milestone M1).
 *
 * The control plane governs; the execution core executes. This module is
 * the ONLY place the control plane reaches the execution core: the
 * `dispatch_mission` tool plugs into the real mission loop
 * (`runMissionLoopCycle`) here.
 *
 * One mission ID (`mission_xxxx`) is minted at dispatch and rides the job
 * end-to-end: every execution event is projected under it into the unified
 * receipt chain, and the mission outcome is recorded in the unified mission
 * ledger (one state — spec §2).
 *
 * Honesty contract: no fabricated results. Seats without a reachable CLI
 * agent report "blocked" (the execution core's own honest behavior); a missing crew is an
 * honest refusal; an engine error is an honest block. The receipt records
 * exactly what happened.
 */
import {
  runMissionLoopCycle,
  loadCrews,
  loopHostDeps,
} from "../../mission/missionLoop";
import type { TeamRunnerDeps } from "../../mission/teamExecutor";
import type { CliAgentTeam } from "../../mission/agentTeam";
import { VH_VERSION } from "../../version";

/** One event projected from the execution core's stream into the unified chain. */
export interface MissionTraceEvent {
  ts: number;
  phase?: string;
  note?: string;
  message?: { kind?: string; from?: string; to?: string; subject?: string };
}

export interface MissionOutcome {
  missionId: string;
  objective: string;
  /** The execution core's honest cycle status (done / blocked / failed / aborted / …). */
  status: string;
  cycleNo: number;
  verifiedSeats: number;
  seatCount: number;
  gateStatus: string | null;
  /** The execution core's own signed receipt for the cycle — true when Ed25519-signed. */
  receiptOk: boolean;
  /** Execution plane provenance (product identity, e.g. "Vouch Harbor execution core 16.1"). */
  engine: string;
  /** Control plane provenance, e.g. "Vouch 1.1". */
  controlPlane: string;
  teamId: string;
  teamName: string;
  notes: string[];
  trace: MissionTraceEvent[];
  runMs: number;
}

export class MissionNotConfiguredError extends Error {}

/** Mint the one mission ID that rides the job end-to-end (spec §2). */
export function mintMissionId(): string {
  return `mission_${Math.random().toString(36).slice(2, 6)}`;
}

/** The host crew the dispatch will run on (the latest persisted crew). */
export function harborCrews(): Array<{ id: string; name: string }> {
  return loadCrews().map((t) => ({ id: t.id, name: t.name }));
}

export function harborActiveCrew(): { id: string; name: string } | null {
  const crews = loadCrews();
  const team = crews[crews.length - 1];
  return team ? { id: team.id, name: team.name } : null;
}

/**
 * Probe seam (honest, like `setVouchBrain`): tests inject deterministic
 * runner deps so the loop is driven on node without a host CLI layer.
 * Production code never calls this — it runs with the host's real deps.
 */
let bridgeDeps: TeamRunnerDeps | null = null;
export function setBridgeDeps(deps: TeamRunnerDeps | null): void {
  bridgeDeps = deps;
}

/**
 * Options for running a mission outside the default dispatch shape
 * (the drill runs in its own fresh repo with its own crew + deps).
 */
export interface HarborMissionOpts {
  /** Repository the mission runs in (default "."). */
  repoRoot?: string;
  /** Crew to run (default: the latest persisted/prebuilt crew). */
  team?: CliAgentTeam;
  /** Runner deps (default: the probe-injected bridge deps, else the host's real deps). */
  deps?: TeamRunnerDeps;
}

/**
 * Run one REAL mission-loop cycle for the dispatched objective.
 * This is the execution plane: composed seats, harnesses, the inter-agent
 * bus, the gate, the retry loop — the execution core, unmodified.
 * This bridge is the ONLY seam between the Vouch tree and the engine.
 */
export async function runHarborMission(objective: string, missionId: string, opts: HarborMissionOpts = {}): Promise<MissionOutcome> {
  const crews = loadCrews();
  const team: CliAgentTeam | undefined = opts.team ?? crews[crews.length - 1];
  if (!team) {
    throw new MissionNotConfiguredError(
      "No crew is configured, so there is no one to execute with — create a crew in the Loop door and I will run the real mission loop on it. This refusal is honest and the receipt records it.",
    );
  }
  const t0 = Date.now();
  const trace: MissionTraceEvent[] = [];
  const res = await runMissionLoopCycle({
    team,
    objective,
    repoRoot: opts.repoRoot ?? ".",
    baseBranch: "main",
    budgetCapUsd: 5,
    deps: opts.deps ?? bridgeDeps ?? loopHostDeps({}),
    emit: (ev) => {
      trace.push({
        ts: Date.now(),
        phase: ev.phase,
        note: ev.note,
        message: ev.message
          ? {
              kind: (ev.message as { kind?: string }).kind,
              from: (ev.message as { from?: string }).from,
              to: (ev.message as { to?: string }).to,
              subject: (ev.message as { subject?: string }).subject,
            }
          : undefined,
      });
    },
  });
  const notes = trace
    .filter((t) => typeof t.note === "string" && t.note.length > 0)
    .map((t) => t.note as string)
    .slice(0, 20);
  return {
    missionId,
    objective,
    status: res.record.status,
    cycleNo: res.record.cycleNo,
    verifiedSeats: res.record.verifiedSeats,
    seatCount: res.record.seatCount,
    gateStatus: res.record.gate?.status ?? null,
    receiptOk: res.record.receipt?.ok ?? false,
    engine: `Vouch Harbor execution core ${VH_VERSION}`,
    controlPlane: `Vouch Harbor control plane ${VH_VERSION}`,
    teamId: team.id,
    teamName: team.name,
    notes,
    trace,
    runMs: Date.now() - t0,
  };
}
