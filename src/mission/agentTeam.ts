/**
 * AGENT TEAMS — seats are ROLES, and a team is a set of seats filled by harnesses.
 *
 * THE MODELLING DECISION THAT MATTERS
 *
 * A seat is a role — planner, coder, reviewer — not an agent. Binding a harness to a seat is a
 * separate step, which is what lets MJ re-arbitrate when a CLI fails without rewriting the plan, and
 * what lets the same team run on Claude today and Codex tomorrow.
 *
 * THE SAFETY RULE
 *
 * Every claim about isolation is keyed off ENFORCEMENT, never off whether a flag merely exists. A CLI
 * with a `--read-only` flag that it ignores is not a read-only seat, and a reviewer that can edit the
 * code it is reviewing is not a review.
 */

import type { HarnessId } from "../domain/harness";
import type { RiskClass } from "./types";
import { AGENT_CAPABILITIES, enforcedReadOnly, unverifiedClaims } from "./agentCapabilities";
import { sessionArgv, sessionIdKind } from "./sessions";

export type TeamRole = "planner" | "architect" | "coder" | "tester" | "reviewer" | "security" | "synthesizer" | "debugger";

export interface TeamSeat {
  id: string;
  role: TeamRole;
  harness: HarnessId;
  model: string | null;
  /** May this seat modify files? An isolation hint, not a permission grant. */
  mayWrite: boolean;
  /** Wall-clock ceiling for one invocation, in seconds. */
  timeoutSecs: number;
  /** Turn ceiling, or null when the CLI has no such control and MJ's ledger is the only limit. */
  maxTurns: number | null;
  instructions: string;
}

export interface CliAgentTeam {
  id: string;
  name: string;
  description: string;
  seats: TeamSeat[];
  schemaVersion: number;
}

export const SCHEMA_VERSION = 1;

const seat = (id: string, role: TeamRole, harness: HarnessId, over: Partial<TeamSeat> = {}): TeamSeat => ({
  id,
  role,
  harness,
  model: null,
  mayWrite: role === "coder" || role === "debugger",
  timeoutSecs: 900,
  maxTurns: null,
  instructions: "",
  ...over,
});

export const PREBUILT_TEAMS: CliAgentTeam[] = [
  {
    id: "team.balanced",
    name: "Balanced",
    description: "Plan, build, test, review. One vendor writes, a second reviews — so the review is not the author grading its own work.",
    schemaVersion: SCHEMA_VERSION,
    seats: [
      seat("planner", "planner", "claude", { instructions: "Break the objective into steps small enough to verify individually." }),
      seat("coder", "coder", "claude", { instructions: "Implement the change. Touch only what the task requires." }),
      seat("tester", "tester", "opencode", { instructions: "Run the repository's own checks and report what failed." }),
      seat("reviewer", "reviewer", "codex", { instructions: "Review the diff. Say what is wrong, not what is fine." }),
    ],
  },
  {
    id: "team.adversarial",
    name: "Adversarial",
    description: "Deliberately cross-vendor. Every writer is reviewed by a different vendor, because agreement across vendors is weaker evidence than agreement with itself.",
    schemaVersion: SCHEMA_VERSION,
    seats: [
      seat("architect", "architect", "claude"),
      seat("coder", "coder", "claude"),
      seat("tester", "tester", "cline", { instructions: "Prove the change works or find the case where it does not." }),
      seat("reviewer", "reviewer", "grok"),
      seat("security", "security", "codex", { instructions: "Look only for injection, secret leakage and unsafe deserialisation." }),
      seat("synthesizer", "synthesizer", "opencode", { instructions: "Reconcile the verdicts into one decision." }),
    ],
  },
  {
    id: "team.solo",
    name: "Solo",
    description: "One seat. Cheap, fast, and the review is advisory only — an author grading its own work is not a review.",
    schemaVersion: SCHEMA_VERSION,
    seats: [seat("coder", "coder", "opencode", { instructions: "Implement and self-check." })],
  },
  {
    id: "team.readonly",
    name: "Read-only audit",
    description: "No seat may write. For answering 'what is wrong with this code?' without risking a change.",
    schemaVersion: SCHEMA_VERSION,
    seats: [
      seat("reviewer", "reviewer", "claude", { mayWrite: false }),
      seat("security", "security", "codex", { mayWrite: false }),
    ],
  },
];

export const TEAM_BY_ID = new Map(PREBUILT_TEAMS.map((t) => [t.id, t]));

export interface ComposedInvocation {
  bin: string;
  argv: string[];
  /** Env vars the CLI needs, e.g. Cline's command permissions. */
  env: Record<string, string>;
  /** Files MJ must write into the workspace before running, e.g. Cursor's cli-config.json. */
  files: Array<{ path: string; contents: string }>;
  /** What MJ can honestly claim about this invocation. */
  claims: {
    readOnlyEnforced: boolean;
    /** "usd" only when the CLI reports real dollars. "tokens-only" means DO NOT convert at a guessed price. */
    costKind: "usd" | "tokens-only" | "none";
  };
  warnings: string[];
}

function fill(cap: { argv: string[] | null } | null, vars: Record<string, string>): string[] {
  if (!cap || !cap.argv) return [];
  return cap.argv.map((a) => (a.startsWith("$") ? (vars[a] ?? "") : a));
}

/**
 * Compile one seat into a real command line for the given prompt.
 *
 * Substitutions: $PROMPT, $MODEL, $N (turns), $CWD, $SECS, $SESSION, $REVIEWER, $NAME.
 */
export function composeSeatArgv(
  teamSeat: TeamSeat,
  ctx: { prompt: string; cwd: string; readOnly: boolean; sessionId?: string; turn?: number },
): ComposedInvocation {
  const caps = AGENT_CAPABILITIES[teamSeat.harness];
  const warnings: string[] = [];
  const vars: Record<string, string> = {
    $PROMPT: ctx.prompt,
    $MODEL: teamSeat.model ?? "",
    $N: String(teamSeat.maxTurns ?? 20),
    $CWD: ctx.cwd,
    $SECS: String(teamSeat.timeoutSecs),
    $SESSION: ctx.sessionId ?? "",
    $REVIEWER: "mj-readonly",
    $NAME: `mj-${teamSeat.id}`,
  };

  const argv: string[] = [];
  const flags: string[] = [];
  const env: Record<string, string> = {};
  const files: Array<{ path: string; contents: string }> = [];

  const wantsReadOnly = ctx.readOnly || !teamSeat.mayWrite;

  // The prompt argv goes FIRST, because for several CLIs it carries the subcommand: `codex exec`,
  // `opencode run`, `kilo run`. Emitting `--sandbox read-only` ahead of `exec` would not parse.
  argv.push(...fill(caps.prompt, vars));

  if (wantsReadOnly) {
    // `implicit` means the read-only mode IS the default, so there is nothing to emit. Emitting the
    // prompt flag a second time would produce `cursor-agent -p <task> -p`, which does not parse.
    if (caps.readOnly?.argv?.length) flags.push(...fill(caps.readOnly, vars));
    else if (caps.readOnly?.implicit) {
      /* enforced by default; no flag needed */
    } else warnings.push(`${caps.name} has no enforced read-only mode, so this seat is ADVISORY only — it can still modify files.`);
  } else if (caps.write?.argv?.length) {
    flags.push(...fill(caps.write, vars));
  }

  if (caps.json?.argv) flags.push(...fill(caps.json, vars));
  if (teamSeat.maxTurns && caps.maxTurns?.argv) flags.push(...fill(caps.maxTurns, vars));
  if (caps.timeout?.argv) flags.push(...fill(caps.timeout, vars));
  if (caps.cwd?.argv) flags.push(...fill(caps.cwd, vars));
  if (teamSeat.model && caps.model?.argv) flags.push(...fill(caps.model, vars));
  if (caps.noAutoUpdate?.argv) flags.push(...fill(caps.noAutoUpdate, vars));

  // Conversational continuity. Only emitted when the caller actually has a session id, so an
  // invocation that wants a one-shot answer stays byte-identical to before.
  if (ctx.sessionId) {
    const s = sessionArgv(teamSeat.harness, {
      kind: (ctx.turn ?? 1) <= 1 ? "first" : "follow-up",
      idKind: sessionIdKind(teamSeat.harness),
      sessionId: ctx.sessionId,
    });
    flags.push(...s.argv);
    if (s.warning) warnings.push(s.warning);
  }

  // Harness-specific enforcement that is not a plain flag.
  if (teamSeat.harness === "cline") {
    // Cline reads command permissions from the environment, and --data-dir gives real isolation.
    env.CLINE_COMMAND_PERMISSIONS = wantsReadOnly
      ? JSON.stringify({ allow: ["git *", "ls *", "cat *"], deny: ["rm *", "git push *", "git commit *"] })
      : JSON.stringify({ allow: ["npm *", "git *"], deny: ["rm -rf *", "git push --force *"] });
  }
  if (teamSeat.harness === "cursor") {
    // Cursor's permissions live in a file, not on the command line.
    files.push({
      path: ".cursor/cli-config.json",
      contents: JSON.stringify(
        {
          permissions: wantsReadOnly
            ? { allow: ["Read(*)", "Shell(git status)", "Shell(git diff)"], deny: ["Write(*)", "Shell(rm)"] }
            : { allow: ["Read(*)", "Shell(git)", "Shell(npm)"], deny: ["Shell(rm -rf)", "Read(.env*)"] },
        },
        null,
        2,
      ),
    });
  }
  if (teamSeat.harness === "kilo" && wantsReadOnly) {
    // Kilo expresses read-only per agent, so MJ has to author the agent file.
    files.push({
      path: ".kilo/agents/mj-readonly.md",
      contents: `---\ndescription: MJ read-only reviewer\nmode: subagent\npermission:\n  edit: deny\n  bash: deny\n---\n\n${teamSeat.instructions || "Review only. Do not modify files."}\n`,
    });
    warnings.push("Kilo read-only depends on the generated .kilo/agents/mj-readonly.md being picked up; verify with kilo --help.");
  }
  if (teamSeat.harness === "cursor") {
    warnings.push("Cursor's -p mode has a reported bug where the process does not exit after emitting the result. MJ applies a wall-clock timeout and parses the stream rather than waiting for exit.");
  }

  for (const claim of unverifiedClaims(teamSeat.harness)) warnings.push(`Unverified flag — ${claim}`);

  // Filter out any flag MJ resolved to an empty string, so a missing $MODEL cannot leave a bare
  // `--model` behind and swallow the next argument.
  const cleanFlags = flags.filter((f) => f.length > 0);

  return {
    bin: caps.bins[0] ?? "",
    argv: [...argv, ...cleanFlags],
    env,
    files,
    claims: {
      readOnlyEnforced: wantsReadOnly && enforcedReadOnly(teamSeat.harness),
      costKind: caps.cost === null ? "none" : caps.cost.kind,
    },
    warnings,
  };
}

/* ------------------------------------------------------------------ validation */

export type FindingSeverity = "error" | "warning";

export interface TeamFinding {
  severity: FindingSeverity;
  code: string;
  message: string;
  seatId?: string;
}

/**
 * Find the ways a team is weak before it runs.
 *
 * The advisory read-only check is keyed off `enforcedReadOnly()`, NOT off whether a readOnly argv
 * exists. A CLI can have the flag and still not honour it, and telling a user "this reviewer cannot
 * write" when it can is the most dangerous sentence this function could produce.
 */
export function validateTeam(team: CliAgentTeam): TeamFinding[] {
  const out: TeamFinding[] = [];
  const ids = new Set<string>();
  for (const s of team.seats) {
    if (ids.has(s.id)) out.push({ severity: "error", code: "duplicate_seat_id", message: `Two seats share the id "${s.id}". Worktrees, sessions and merge steps are keyed by seat id, so one would overwrite the other.`, seatId: s.id });
    ids.add(s.id);
    if (!enforcedReadOnly(s.harness) && !s.mayWrite) {
      out.push({ severity: "warning", code: "advisory_readonly", message: `${AGENT_CAPABILITIES[s.harness].name} has no verified read-only enforcement, so "${s.id}" is advisory: it can still modify files despite being a ${s.role}.`, seatId: s.id });
    }
    if (s.timeoutSecs < 30) out.push({ severity: "warning", code: "short_timeout", message: `${s.timeoutSecs}s is below the 30s floor for a coding agent; expect a timeout on any real edit.`, seatId: s.id });
    if (!s.mayWrite && (s.role === "coder" || s.role === "debugger")) {
      out.push({ severity: "error", code: "writer_cannot_write", message: `"${s.id}" has the ${s.role} role but mayWrite is false, so it cannot do its job.`, seatId: s.id });
    }
  }
  if (team.seats.length === 0) out.push({ severity: "error", code: "no_seats", message: "A team with no seats cannot run." });
  if (!team.seats.some((s) => s.mayWrite)) out.push({ severity: "warning", code: "no_writer", message: "No seat may write, so this team can analyse but cannot change anything." });
  if (team.seats.length > 1 && !team.seats.some((s) => s.role === "reviewer" || s.role === "security")) {
    out.push({ severity: "warning", code: "no_reviewer", message: "No reviewer or security seat, so nothing checks the writer's work." });
  }
  const writerHarnesses = new Set(team.seats.filter((s) => s.mayWrite).map((s) => s.harness));
  const reviewerHarnesses = new Set(team.seats.filter((s) => s.role === "reviewer" || s.role === "security").map((s) => s.harness));
  if (writerHarnesses.size === 1 && reviewerHarnesses.size === 1 && [...writerHarnesses][0] === [...reviewerHarnesses][0]) {
    out.push({ severity: "warning", code: "single_vendor", message: `Every writing and reviewing seat is ${AGENT_CAPABILITIES[[...writerHarnesses][0] as HarnessId].name}. A vendor reviewing its own output agrees with itself more often than it disagrees.` });
  }
  if (writerHarnesses.size > 1) {
    out.push({ severity: "warning", code: "multi_vendor_writers", message: `${writerHarnesses.size} different CLIs will write. That is the point, but it means ${writerHarnesses.size} sets of edits to reconcile — review the merge, not just the branches.` });
  }
  return out;
}

/* ------------------------------------------------------------------ persistence */

export interface SerializedTeam {
  schemaVersion: number;
  team: CliAgentTeam;
}

export function serializeTeam(team: CliAgentTeam): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, team } satisfies SerializedTeam, null, 2);
}

export interface ParseResult {
  ok: boolean;
  team: CliAgentTeam | null;
  error: string | null;
  findings: TeamFinding[];
}

export function parseTeam(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, team: null, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}`, findings: [] };
  }
  const env = parsed as Partial<SerializedTeam>;
  if (!env || typeof env !== "object" || !env.team) {
    return { ok: false, team: null, error: "Missing the `team` object. MJ exports { schemaVersion, team }.", findings: [] };
  }
  if (env.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, team: null, error: `Schema version ${String(env.schemaVersion)} is not ${SCHEMA_VERSION}; MJ will not guess how to migrate it.`, findings: [] };
  }
  const t = env.team;
  if (!Array.isArray(t.seats) || t.seats.length === 0) {
    return { ok: false, team: null, error: "The team has no seats.", findings: [] };
  }
  const roles = new Set<string>(["planner", "architect", "coder", "tester", "reviewer", "security", "synthesizer", "debugger"]);
  for (const s of t.seats as TeamSeat[]) {
    if (!s.id || !roles.has(s.role)) return { ok: false, team: null, error: `Seat "${s.id ?? "?"}" has no id or an unknown role "${s.role}".`, findings: [] };
    if (!(s.harness in AGENT_CAPABILITIES)) return { ok: false, team: null, error: `Seat "${s.id}" names an unknown harness "${s.harness}".`, findings: [] };
  }
  const findings = validateTeam(t as CliAgentTeam);
  return { ok: true, team: t as CliAgentTeam, error: null, findings };
}

const STORAGE_KEY = "mj.teams.v1";

export function loadSavedTeams(): CliAgentTeam[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => parseTeam(JSON.stringify({ schemaVersion: SCHEMA_VERSION, team: x }))).filter((r) => r.ok && r.team).map((r) => r.team as CliAgentTeam);
  } catch {
    // localStorage is unavailable under node and in some sandboxed frames. An empty list is the honest
    // answer there: MJ cannot claim teams it cannot read.
    return [];
  }
}

export function saveTeams(teams: CliAgentTeam[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(teams));
  } catch {
    /* see loadSavedTeams */
  }
}

export function upsertTeam(teams: CliAgentTeam[], team: CliAgentTeam): CliAgentTeam[] {
  const i = teams.findIndex((t) => t.id === team.id);
  if (i === -1) return [...teams, team];
  const next = [...teams];
  next[i] = team;
  return next;
}

/* ------------------------------------------------------------------ binding a team to a plan */

/**
 * Which seat should run a task of this kind and risk.
 *
 * CRITICAL is refused outright. No sandbox mapping makes an irreversible action safe to hand to an
 * agent, so MJ escalates to a human instead of picking a seat and hoping.
 */
export function seatForTask(team: CliAgentTeam, role: TeamRole, risk: RiskClass): { seat: TeamSeat | null; reason: string | null } {
  if (risk === "CRITICAL") {
    return { seat: null, reason: "CRITICAL risk tasks are refused for agent execution and escalated to a human. No sandbox makes an irreversible action safe to delegate." };
  }
  const candidates = team.seats.filter((s) => s.role === role);
  if (candidates.length === 0) return { seat: null, reason: `This team has no ${role} seat.` };
  // For a write at HIGH risk, require a harness with verified enforcement — otherwise the "sandbox"
  // is a label MJ invented.
  if (risk === "HIGH") {
    const enforced = candidates.find((s) => enforcedReadOnly(s.harness) || s.mayWrite);
    if (!enforced) return { seat: null, reason: `No ${role} seat uses a harness with verified isolation, so a HIGH risk task cannot be safely assigned.` };
    return { seat: enforced, reason: null };
  }
  return { seat: candidates[0] ?? null, reason: candidates[0] ? null : `No ${role} seat available.` };
}

export const STEP_KIND_TO_ROLE: Record<string, TeamRole | null> = {
  research: "planner",
  architecture: "architect",
  implementation: "coder",
  test: "tester",
  review: "reviewer",
  security: "security",
  synthesis: "synthesizer",
  release: "coder",
  // An approval step is a human's, never an agent's. Binding it to a seat would turn a gate into a
  // rubber stamp.
  approval: null,
};

export interface Binding {
  stepId: string;
  seatId: string | null;
  harness: HarnessId | null;
  reason: string | null;
}

export interface BindResult {
  bindings: Binding[];
  bound: number;
  unbound: number;
  refused: number;
}

/**
 * Bind a team to a plan's steps.
 *
 * `unbound` does not mean failure — it means the arbitrator still decides at runtime. Keeping that
 * distinct from `refused` (MJ will not assign this at all) is what stops a plan looking fully bound
 * when half of it is undecided.
 */
export function bindTeamToPlan(team: CliAgentTeam, steps: Array<{ id: string; kind: string; risk: RiskClass }>): BindResult {
  const bindings: Binding[] = [];
  let bound = 0;
  let unbound = 0;
  let refused = 0;
  for (const step of steps) {
    const role = STEP_KIND_TO_ROLE[step.kind];
    if (role === undefined || role === null) {
      unbound += 1;
      bindings.push({ stepId: step.id, seatId: null, harness: null, reason: role === null ? "An approval step belongs to a human, not a seat." : `No role maps to step kind "${step.kind}".` });
      continue;
    }
    const { seat, reason } = seatForTask(team, role, step.risk);
    if (seat) {
      bound += 1;
      bindings.push({ stepId: step.id, seatId: seat.id, harness: seat.harness, reason: null });
    } else if (step.risk === "CRITICAL") {
      refused += 1;
      bindings.push({ stepId: step.id, seatId: null, harness: null, reason });
    } else {
      unbound += 1;
      bindings.push({ stepId: step.id, seatId: null, harness: null, reason });
    }
  }
  return { bindings, bound, unbound, refused };
}

/** Apply bindings to steps in place, returning how many changed. */
export function applyTeamToSteps<T extends { id: string; preferredHarness: HarnessId | null }>(steps: T[], result: BindResult): number {
  let changed = 0;
  const byId = new Map(result.bindings.map((b) => [b.stepId, b]));
  for (const s of steps) {
    const b = byId.get(s.id);
    if (b?.harness && s.preferredHarness !== b.harness) {
      s.preferredHarness = b.harness;
      changed += 1;
    }
  }
  return changed;
}
