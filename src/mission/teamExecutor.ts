/**
 * TEAM EXECUTOR — the part that actually runs.
 *
 * Everything else is planning: which seat does what, which flags to pass, which worktree to work in,
 * what the budget is. This module is where a real child process is spawned, real bytes come back, real
 * dollars are charged and real evidence is collected.
 *
 * THE THREE RULES THIS MODULE IS BUILT AROUND
 *
 * 1. NOTHING IS INFERRED THAT COULD BE MEASURED.
 *    Did the agent succeed? Run the repository's own check and look at the exit code. Did it change
 *    anything? Ask git. How much did it cost? Read the number out of the CLI's own output. When a
 *    measurement is not available, MJ says "not measured" — it never substitutes an assumption.
 *
 * 2. CONTINUITY IS REAL OR IT IS DECLARED ABSENT.
 *    Each seat keeps a session. Turn 1 creates it, later turns resume it, and the id is captured from
 *    the CLI's own output rather than assumed.
 *
 * 3. A SEAT THAT COULD NOT RUN IS NOT A SEAT THAT PASSED.
 *    Missing binary, refused by the budget, killed by the deadline, nothing to review, or a check that
 *    never ran — each is a distinct outcome with its own reason, and each propagates into the merge
 *    plan. An unverified branch does not merge.
 *
 * THE REVIEW-VISIBILITY INVARIANT
 *
 * A read-only seat never runs against the base checkout while writers have uncommitted or unmerged
 * work. Before any read-only seat runs, MJ builds a REVIEW SNAPSHOT — the base plus every writer
 * branch merged — and points the read-only worktrees at that. So a reviewer sees the work it was asked
 * to review, and the base branch stays pristine until a human decides to merge.
 */

import * as path from "node:path";

import type { HarnessId } from "../domain/harness";
import { AGENT_CAPABILITIES } from "./agentCapabilities";
import { composeSeatArgv, type CliAgentTeam, type TeamSeat } from "./agentTeam";
import { gitApi, type GitRunner } from "./git";
import { parseReportedUsage, type CapLedger, type ReportedUsage, withDeadline } from "./caps";
import {
  briefingContents,
  planWorktrees,
  reviewSnapshotArgv,
  reviewWorktreeArgv,
  snapshotPreflightArgv,
  writeContextFiles,
  type ContextFile,
  type WorktreePlan,
} from "./collaboration";
import { planMerge, type MergeCandidate } from "./mergePlan";
import { detectResumeFailure, followUpPrompt, parseSessionId, SessionStore, type SessionKey } from "./sessions";

/* ------------------------------------------------------------------ injected capabilities */

export interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Wall-clock ms the child actually ran, as measured by whoever spawned it. */
  durationMs: number;
  /** True when the runner killed the child for exceeding its timeout. */
  timedOut: boolean;
}

export interface TeamRunnerDeps {
  /**
   * Spawn the coding CLI. The only path to real execution; there is no fallback that fakes it.
   *
   * `bin` is the resolved absolute path when one was found, otherwise the harness's canonical name.
   */
  cliInvoke: (req: { bin: string; argv: string[]; env?: Record<string, string>; cwd: string; timeoutSecs: number }) => Promise<CliResult>;
  /**
   * Resolve a harness's bin name to an absolute executable path, or null when it is not installed.
   *
   * Used for pre-flight so MJ can say up front which seats cannot run, instead of spending three
   * invocations to discover that the reviewer's CLI does not exist.
   */
  resolveBin: (bin: string) => Promise<string | null>;
  /** Run git. Optional: without it MJ reports that it could not inspect the repository. */
  git?: GitRunner;
  /** Write a file. Optional: without it MJ reports the briefing it could not write. */
  writeFile?: (absPath: string, contents: string) => Promise<void>;
  /** The repository's own verification command, run in the seat's working directory. */
  verify?: (cwd: string) => Promise<CliResult>;
  /** Per-turn callback, for live UI updates. */
  onTurn?: (rec: SeatRecord) => void;
  now?: () => number;
}

/* ------------------------------------------------------------------ the plan the executor runs */

export interface SeatAssignment {
  seat: TeamSeat;
  prompt: string;
  /** Which wave this seat runs in. Lower runs first. */
  wave: number;
  readOnly: boolean;
  /** Branches this seat's work depends on; drives merge order. */
  dependsOn?: string[];
  /** A follow-up turn to run after the first, e.g. a repair pass. */
  followUp?: string;
}

export interface TeamRunRequest {
  team: CliAgentTeam;
  assignments: SeatAssignment[];
  repoRoot: string;
  baseBranch: string;
  missionSlug: string;
  objective: string;
  constraints?: string[];
  doNotTouch?: string[];
  /** The repository's own test command, e.g. ["npm","test"]. */
  testCommand?: string[];
  ledger: CapLedger;
  /** Refuse to start at all if this many seats cannot run. Prevents a half-empty team looking like a result. */
  minimumRunnableSeats?: number;
}

/* ------------------------------------------------------------------ records */

export type SeatOutcome =
  | "completed"
  | "failed"
  | "blocked_missing_binary"
  | "blocked_budget"
  | "timeout"
  | "skipped_wave_failed"
  | "skipped_nothing_to_review"
  | "review_snapshot_failed"
  | "resume_failed";

export interface GitEvidence {
  /** False when git could not be run at all — which is not the same as "no changes". */
  measured: boolean;
  detail: string;
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface SeatRecord {
  seatId: string;
  role: string;
  harness: HarnessId;
  harnessName: string;
  bin: string;
  argv: string[];
  cwd: string;
  branch: string;
  worktreePath: string;
  /**
   * What this seat actually looked at. For a read-only seat this is the review snapshot, which is the
   * whole point: it says, in the record, that the reviewer saw the writers' work and not the base.
   */
  reviewedRef: string;
  /** The snapshot commit, so a review can be reproduced exactly later. */
  reviewedSha: string | null;
  wave: number;
  turnsRun: number;
  sessionId: string | null;
  continuity: "session" | "none";
  outcome: SeatOutcome;
  /** Plain-language reason. Never empty when the outcome is not "completed". */
  reason: string;
  exitCode: number | null;
  durationMs: number;
  usage: ReportedUsage;
  chargedUsd: number;
  /** True only when the repo's own check ran AND exited 0. */
  verified: boolean;
  /** Why verification is what it is. "not measured" is a real value here. */
  verificationDetail: string;
  git: GitEvidence;
  /** What MJ did with the seat's work on its branch. */
  commit: string;
  warnings: string[];
  /** Claims the agent made about itself, kept separate from measured facts. */
  selfReport: string | null;
  /** Truncated tail of the CLI's own output, so a human can see what actually happened. */
  outputTail: string;
}

export type RunStatus = "completed" | "partial" | "blocked" | "aborted";

export interface SetupRecord {
  seatId: string;
  path: string;
  ok: boolean;
  detail: string;
}

export interface BriefingRecord {
  path: string;
  writtenTo: string[];
  excludedFromGit: boolean;
  detail: string;
}

export interface ReviewSnapshotRecord {
  /** False when no snapshot was built, with the reason in `detail`. */
  built: boolean;
  branch: string;
  sha: string | null;
  writerBranches: string[];
  /** Conflicts found by the in-memory pre-flight, before anything was merged. */
  conflicts: string[];
  detail: string;
}

export interface TeamRunReport {
  seats: SeatRecord[];
  status: RunStatus;
  /** The single most important sentence about this run. */
  summary: string;
  spentUsd: number;
  notRun: Array<{ seatId: string; reason: string }>;
  setup: SetupRecord[];
  briefings: BriefingRecord[];
  snapshot: ReviewSnapshotRecord;
  merge: { candidates: MergeCandidate[]; plan: ReturnType<typeof planMerge> };
  startedAt: string;
  finishedAt: string;
  wallClockMs: number;
}

/* ------------------------------------------------------------------ execution */

const OUTPUT_TAIL_CHARS = 4000;
/** Briefings live here, inside the worktree only, and are excluded from git. */
const BRIEF_DIR = ".mj-brief";

export function waveGroups(assignments: SeatAssignment[]): SeatAssignment[][] {
  const byWave = new Map<number, SeatAssignment[]>();
  for (const a of assignments) {
    const list = byWave.get(a.wave) ?? [];
    list.push(a);
    byWave.set(a.wave, list);
  }
  return [...byWave.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
}

/** Run one git argv, returning a uniform shape the executor can reason about. */
async function git(deps: TeamRunnerDeps, args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number | null }> {
  if (!deps.git) return { ok: false, stdout: "", stderr: "", exitCode: null };
  const r = await deps.git(args, cwd);
  return { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
}

/**
 * Run a team for real.
 *
 * Waves run in order; seats inside a wave run concurrently, because they are working in separate
 * worktrees and cannot overwrite each other.
 */
export async function executeTeam(req: TeamRunRequest, deps: TeamRunnerDeps, sessions = new SessionStore()): Promise<TeamRunReport> {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  const startedAt = new Date(t0).toISOString();
  const seats: SeatRecord[] = [];
  const notRun: TeamRunReport["notRun"] = [];
  const setup: SetupRecord[] = [];
  const emptySnapshot: ReviewSnapshotRecord = { built: false, branch: "", sha: null, writerBranches: [], conflicts: [], detail: "Not attempted." };

  const finish = (status: RunStatus, summary: string, spentUsd: number, snapshot: ReviewSnapshotRecord, briefings: BriefingRecord[]): TeamRunReport => ({
    seats,
    status,
    summary,
    spentUsd,
    notRun,
    setup,
    briefings,
    snapshot,
    merge: { candidates: [], plan: planMerge([], { baseBranch: req.baseBranch, repoRoot: req.repoRoot, testCommand: req.testCommand }) },
    startedAt,
    finishedAt: new Date(now()).toISOString(),
    wallClockMs: now() - t0,
  });

  const worktrees = planWorktrees(req.team, { repoRoot: req.repoRoot, baseBranch: req.baseBranch, missionSlug: req.missionSlug, deferReview: true });
  const wtBySeat = new Map(worktrees.map((w) => [w.seatId, w]));
  const briefingsByHarness = writeContextFiles(req.team, {
    objective: req.objective,
    constraints: req.constraints ?? [],
    doNotTouch: req.doNotTouch ?? [],
    testCommand: req.testCommand,
  });

  // Writers' worktrees are created now. Read-only seats are DEFERRED: their worktree must sit on the
  // review snapshot, which cannot exist until the writers have committed.
  const setupFailed = new Set<string>();
  for (const w of worktrees) {
    if (w.deferred) {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: "Deferred: created on the review snapshot when this seat's wave runs." });
      continue;
    }
    if (w.shared) {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: "Runs in the base checkout — no writer exists on this team, so there is nothing to snapshot." });
      continue;
    }
    if (!deps.git) {
      setup.push({ seatId: w.seatId, path: w.path, ok: false, detail: "MJ has no git runner here, so the worktree was NOT created. This seat would have written into the base checkout, which defeats isolation, so it is blocked instead." });
      setupFailed.add(w.seatId);
      continue;
    }
    let failed: string | null = null;
    for (const argv of w.createArgv) {
      const r = await git(deps, argv, req.repoRoot);
      if (!r.ok) {
        failed = r.exitCode === null ? `git ${argv.join(" ")} could not run.` : `git ${argv.join(" ")} exited ${r.exitCode}: ${(r.stderr || r.stdout).trim().slice(0, 200)}`;
        break;
      }
    }
    if (failed) {
      setup.push({ seatId: w.seatId, path: w.path, ok: false, detail: failed });
      setupFailed.add(w.seatId);
    } else {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: `Created ${w.branch} at ${w.path}.` });
    }
  }

  // Briefings go into worktrees only — never into the base checkout. Polluting the base would mean the
  // "pristine" tree that gets merged into is dirty before any agent runs, and the briefing files would
  // ride along into the commit.
  const briefings: BriefingRecord[] = [];
  const writerWorktrees = worktrees.filter((w) => !w.shared && !w.deferred && !setupFailed.has(w.seatId));
  for (const f of briefingsByHarness) {
    const writtenTo: string[] = [];
    for (const w of writerWorktrees) {
      const target = `${w.path}/${BRIEF_DIR}/${f.path}`;
      if (deps.writeFile) {
        try {
          await deps.writeFile(target, f.contents);
          writtenTo.push(w.path);
        } catch {
          /* recorded below via writtenTo length */
        }
      }
    }
    briefings.push({
      path: `${BRIEF_DIR}/${f.path}`,
      writtenTo,
      excludedFromGit: false,
      detail: writtenTo.length
        ? `Written into ${writtenTo.length} worktree(s), under ${BRIEF_DIR}/, which MJ adds to .git/info/exclude so it can never be committed.`
        : deps.writeFile
          ? "No writable worktree existed for this briefing."
          : "MJ has no file writer here, so the briefing was composed but NOT written. The agents will not see it.",
    });
  }
  // Exclude the briefing directory so a `git add -A` cannot pick it up. The result is recorded per
  // worktree: if exclusion failed, the briefings WOULD be committed into the agent's work, and saying
  // otherwise would be the exact kind of false claim this module exists to avoid.
  let excludedEverywhere = true;
  for (const w of writerWorktrees) {
    const okExcl = await excludeBriefDir(deps, w.path);
    if (!okExcl) excludedEverywhere = false;
  }
  for (const b of briefings) {
    b.excludedFromGit = excludedEverywhere && b.writtenTo.length > 0;
    if (b.writtenTo.length > 0 && !excludedEverywhere) {
      b.detail = `Written into ${b.writtenTo.length} worktree(s), but MJ could NOT exclude ${BRIEF_DIR}/ from git. Those files will appear as untracked and WILL be picked up by a commit — treat this seat's diff as containing the briefing.`;
    }
  }

  // Pre-flight: find out which binaries exist BEFORE spending anything.
  const waves = waveGroups(req.assignments);
  const runnable = new Map<string, boolean>();
  const binPaths = new Map<HarnessId, string>();
  for (const w of waves) {
    for (const a of w) {
      if (runnable.has(a.seat.id)) continue;
      const caps = AGENT_CAPABILITIES[a.seat.harness];
      let resolved: string | null = null;
      for (const b of caps.bins) {
        const r = await deps.resolveBin(b);
        if (r) {
          resolved = r;
          break;
        }
      }
      if (resolved) binPaths.set(a.seat.harness, resolved);
      const ok = resolved !== null;
      runnable.set(a.seat.id, ok);
      if (!ok) notRun.push({ seatId: a.seat.id, reason: `None of ${caps.name}'s binaries (${caps.bins.join(", ")}) are installed or executable. Install: ${caps.install}` });
    }
  }

  const minSeats = req.minimumRunnableSeats ?? 1;
  const runnableCount = [...runnable.values()].filter(Boolean).length;
  if (runnableCount < minSeats) {
    return finish(
      "aborted",
      `Aborted before any invocation: only ${runnableCount} of ${req.assignments.length} seats can run, and ${minSeats} is the minimum. Nothing was executed and nothing was charged.`,
      0,
      emptySnapshot,
      briefings,
    );
  }

  let waveFailed = false;
  let snapshot: ReviewSnapshotRecord = emptySnapshot;
  /** Branches that actually hold committed work, in the order they landed. */
  const committedBranches: string[] = [];

  for (const wave of waves) {
    if (waveFailed) {
      for (const a of wave) {
        notRun.push({ seatId: a.seat.id, reason: "An earlier wave did not complete, so this seat was skipped rather than asked to review work that does not exist." });
        seats.push(unrunRecord(a, wtBySeat.get(a.seat.id) ?? null, "skipped_wave_failed", "Skipped: an earlier wave did not complete."));
      }
      continue;
    }

    const hasReadOnly = wave.some((a) => a.readOnly || !a.seat.mayWrite);
    const skippedIds = new Set<string>();
    if (hasReadOnly && worktrees.some((w) => w.deferred)) {
      // THE FIX. Build the review snapshot from everything the writers committed, then point the
      // read-only worktrees at it. Without this step a reviewer runs against the base checkout and
      // reviews the tree as it was BEFORE the work happened.
      snapshot = await buildReviewSnapshot(req, deps, worktrees, committedBranches, setupFailed);
      if (!snapshot.built) {
        for (const a of wave.filter((x) => x.readOnly || !x.seat.mayWrite)) {
          const wt = wtBySeat.get(a.seat.id);
          if (!wt?.deferred) continue;
          skippedIds.add(a.seat.id);
          const outcome: SeatOutcome = committedBranches.length === 0 ? "skipped_nothing_to_review" : "review_snapshot_failed";
          seats.push(
            unrunRecord(
              a,
              wt,
              outcome,
              committedBranches.length === 0
                ? "Nothing was committed by any writer, so there was no work to review. Reviewing the untouched base would have produced a verdict about code nobody wrote."
                : `The review snapshot could not be built: ${snapshot.detail}`,
            ),
          );
          notRun.push({ seatId: a.seat.id, reason: committedBranches.length === 0 ? "No writer committed anything, so there was nothing to review." : snapshot.detail });
        }
      }
    }

    const runnableWave = wave.filter((a) => !skippedIds.has(a.seat.id));
    const results = await Promise.all(
      runnableWave.map((a) =>
        runSeat(
          req,
          deps,
          a,
          sessions,
          wtBySeat.get(a.seat.id) ?? null,
          runnable.get(a.seat.id) ?? false,
          binPaths.get(a.seat.harness) ?? null,
          setupFailed,
          snapshot,
          briefingsByHarness,
          now,
        ),
      ),
    );
    seats.push(...results);

    for (const r of results) {
      if (r.outcome === "completed" && r.branch && r.branch !== req.baseBranch && !committedBranches.includes(r.branch)) {
        if (/Committed on/.test(r.commit)) committedBranches.push(r.branch);
      }
    }
    if (results.every((r) => r.outcome !== "completed")) waveFailed = true;
  }

  const spentUsd = seats.reduce((s, r) => s + r.chargedUsd, 0);
  const candidates: MergeCandidate[] = seats
    .filter((r) => r.branch && r.branch !== req.baseBranch && !r.branch.startsWith(`mj/${req.missionSlug}/review`))
    .map((r) => ({
      seatId: r.seatId,
      branch: r.branch,
      worktreePath: r.worktreePath,
      role: r.role,
      dependsOn: req.assignments.find((a) => a.seat.id === r.seatId)?.dependsOn ?? [],
      verified: r.verified,
      additions: r.git.measured ? r.git.additions : 0,
      deletions: r.git.measured ? r.git.deletions : 0,
    }));
  const plan = planMerge(candidates, { baseBranch: req.baseBranch, repoRoot: req.repoRoot, testCommand: req.testCommand });

  const completed = seats.filter((r) => r.outcome === "completed").length;
  const verifiedCount = seats.filter((r) => r.verified).length;
  const status: RunStatus = seats.length === 0 ? "blocked" : completed === seats.length && completed > 0 ? "completed" : completed > 0 ? "partial" : "blocked";

  return {
    seats,
    status,
    summary: buildSummary({ status, seats, verifiedCount, spentUsd, notRun, briefings, snapshot }),
    spentUsd,
    notRun,
    setup,
    briefings,
    snapshot,
    merge: { candidates, plan },
    startedAt,
    finishedAt: new Date(now()).toISOString(),
    wallClockMs: now() - t0,
  };
}

/* ------------------------------------------------------------------ the review snapshot */

/**
 * Build the tree the reviewers look at, and create their worktrees on it.
 *
 * Order matters: pre-flight the pairwise merges in memory first, so a conflict between two writers is
 * reported as a finding rather than discovered halfway through building the snapshot.
 */
async function buildReviewSnapshot(
  req: TeamRunRequest,
  deps: TeamRunnerDeps,
  worktrees: WorktreePlan[],
  committedBranches: string[],
  setupFailed: Set<string>,
): Promise<ReviewSnapshotRecord> {
  const plan = reviewSnapshotArgv({ repoRoot: req.repoRoot, baseBranch: req.baseBranch, missionSlug: req.missionSlug, writerBranches: committedBranches });
  if (plan.problem || !deps.git) {
    return { built: false, branch: plan.snapshotBranch, sha: null, writerBranches: committedBranches, conflicts: [], detail: plan.problem ?? "MJ has no git runner, so the snapshot could not be built." };
  }

  // Pre-flight in memory. merge-tree takes TWO branches; the base is derived from their history.
  const conflicts: string[] = [];
  for (const argv of snapshotPreflightArgv(req.baseBranch, committedBranches)) {
    const r = await git(deps, argv, req.repoRoot);
    if (r.exitCode === 1) {
      const paths = r.stdout.split(/\r?\n/).slice(1).filter((l) => l.trim()).join(", ");
      conflicts.push(`Writers disagree: ${paths || "conflicting changes"}`);
    }
  }

  let failed: string | null = null;
  for (const argv of plan.argv) {
    const r = await git(deps, argv, req.repoRoot);
    if (!r.ok) {
      failed = `git ${argv.join(" ")} exited ${r.exitCode ?? "null"}: ${(r.stderr || r.stdout).trim().slice(0, 240)}`;
      break;
    }
  }
  if (failed) {
    return { built: false, branch: plan.snapshotBranch, sha: null, writerBranches: committedBranches, conflicts, detail: failed };
  }

  const head = await git(deps, ["rev-parse", "HEAD"], req.repoRoot);
  const sha = head.ok ? head.stdout.trim() || null : null;

  // Now the read-only worktrees, detached so they cannot commit.
  for (const w of worktrees) {
    if (!w.deferred || setupFailed.has(w.seatId)) continue;
    for (const argv of reviewWorktreeArgv(plan.snapshotBranch, w.path)) {
      const r = await git(deps, argv, req.repoRoot);
      if (!r.ok) {
        setupFailed.add(w.seatId);
        await git(deps, ["checkout", "-q", req.baseBranch], req.repoRoot);
        return { built: false, branch: plan.snapshotBranch, sha, writerBranches: committedBranches, conflicts, detail: `git ${argv.join(" ")} exited ${r.exitCode ?? "null"}: ${(r.stderr || r.stdout).trim().slice(0, 240)}` };
      }
    }
    await excludeBriefDir(deps, w.path);
  }

  // Put the base checkout back on the base branch.
  //
  // Building the snapshot required `git checkout -B` in the base checkout, which switches it to the
  // snapshot branch. Leaving it there would mean the user's own working copy silently ended the run on
  // a branch they never asked for, showing the merged state as if it were their branch. The snapshot
  // still exists as a ref and as the reviewers' worktrees, so nothing is lost by switching back.
  await git(deps, ["checkout", "-q", req.baseBranch], req.repoRoot);

  return {
    built: true,
    branch: plan.snapshotBranch,
    sha,
    writerBranches: committedBranches,
    conflicts,
    detail: `Built ${plan.snapshotBranch} from ${committedBranches.join(" + ")} on top of ${req.baseBranch}.`,
  };
}

/**
 * Keep the briefing directory out of git, in the COMMON exclude file.
 *
 * `.git/info/exclude` is the local, uncommitted ignore file — unlike `.gitignore` it is not itself a
 * tracked change, so excluding the briefings does not dirty the tree it is meant to protect.
 *
 * It has to be the COMMON one. A linked worktree has its own git dir at
 * `.git/worktrees/<name>/`, and git does NOT read `info/exclude` from there — verified by experiment:
 * writing `.mj-brief/` into the worktree's own exclude file left it showing as `?? .mj-brief/`, and the
 * subsequent `git add -A` committed the briefing into the agent's code commit. Only
 * `--git-common-dir` reaches the file git actually consults, and it applies to every worktree at once.
 */
async function excludeBriefDir(deps: TeamRunnerDeps, worktreePath: string): Promise<boolean> {
  if (!deps.git || !deps.writeFile) return false;
  const r = await git(deps, ["rev-parse", "--git-common-dir"], worktreePath);
  if (!r.ok) return false;
  let gitDir = r.stdout.trim();
  if (!gitDir) return false;
  // --git-common-dir can be relative to the worktree (".git" when run in the main checkout).
  if (!gitDir.startsWith("/")) gitDir = path.posix.join(worktreePath.replace(/\\/g, "/"), gitDir);
  try {
    await deps.writeFile(`${gitDir}/info/exclude`, `${BRIEF_DIR}/\n`);
    // Prove it worked rather than assuming: if the briefings are still visible to git, the caller has
    // to know, because the alternative is committing them silently.
    const check = await git(deps, ["status", "--porcelain"], worktreePath);
    return check.ok && !check.stdout.includes(BRIEF_DIR);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ one seat */

async function runSeat(
  req: TeamRunRequest,
  deps: TeamRunnerDeps,
  a: SeatAssignment,
  sessions: SessionStore,
  wt: WorktreePlan | null,
  binaryExists: boolean,
  resolvedBin: string | null,
  setupFailedSeats: Set<string>,
  snapshot: ReviewSnapshotRecord,
  briefings: ContextFile[],
  now: () => number,
): Promise<SeatRecord> {
  const caps = AGENT_CAPABILITIES[a.seat.harness];
  const readOnly = a.readOnly || !a.seat.mayWrite;
  const cwd = wt?.path ?? req.repoRoot;
  // A deferred read-only seat reviews the snapshot; anything else works on its own branch.
  const branch = wt?.deferred ? snapshot.branch : (wt?.branch ?? req.baseBranch);
  const reviewedRef = wt?.deferred ? (snapshot.sha ?? snapshot.branch) : branch;

  const base: Omit<SeatRecord, "outcome" | "reason"> = {
    seatId: a.seat.id,
    role: a.seat.role,
    harness: a.seat.harness,
    harnessName: caps.name,
    bin: resolvedBin ?? caps.bins[0] ?? "",
    argv: [],
    cwd,
    branch,
    worktreePath: cwd,
    reviewedRef,
    reviewedSha: wt?.deferred ? snapshot.sha : null,
    wave: a.wave,
    turnsRun: 0,
    sessionId: null,
    continuity: "none",
    exitCode: null,
    durationMs: 0,
    usage: { costUsd: null, tokens: null, turns: null, source: a.seat.harness },
    chargedUsd: 0,
    verified: false,
    verificationDetail: "Not run.",
    git: { measured: false, detail: "Not measured.", additions: 0, deletions: 0, filesChanged: 0 },
    commit: "Never ran, so nothing was committed.",
    warnings: [],
    selfReport: null,
    outputTail: "",
  };

  if (!binaryExists) {
    return { ...base, outcome: "blocked_missing_binary", reason: `${caps.name} is not installed, so this seat never ran. Install: ${caps.install}` };
  }
  if (setupFailedSeats.has(a.seat.id)) {
    return {
      ...base,
      outcome: wt?.deferred ? "review_snapshot_failed" : "failed",
      reason: wt?.deferred
        ? "This seat's review worktree could not be created, so it never ran. Running it in the base checkout instead would have it review the tree from before the work happened — the exact mistake the review snapshot exists to prevent."
        : "This seat's worktree could not be created, so it never ran. Running it anyway would have pointed it at the base checkout and let it overwrite another seat's work.",
    };
  }

  // A read-only seat on a snapshot that was never built has nothing to look at.
  if (wt?.deferred && !snapshot.built) {
    return { ...base, outcome: "skipped_nothing_to_review", reason: "No review snapshot exists, so there was no work to review." };
  }

  // Write this seat's briefing into its own directory now that the directory exists.
  if (deps.writeFile && cwd !== req.repoRoot) {
    for (const f of briefings) {
      try {
        await deps.writeFile(`${cwd}/${BRIEF_DIR}/${f.path}`, f.contents);
      } catch {
        /* the briefing record already reports what could not be written */
      }
    }
  }

  const sessionKey: SessionKey = { seatId: a.seat.id, harness: a.seat.harness, model: a.seat.model, cwd };
  const session = sessions.obtain(sessionKey);

  const turns: Array<{ prompt: string; turn: number }> = [{ prompt: a.prompt, turn: 1 }];
  if (a.followUp) turns.push({ prompt: a.followUp, turn: 2 });

  let last: CliResult | null = null;
  let continuity: "session" | "none" = "none";
  let chargedTotal = 0;
  let usage: ReportedUsage = base.usage;
  const warnings: string[] = [];
  let lastArgv: string[] = [];
  let lastSummary = "";

  for (const t of turns) {
    // Budget check BEFORE dispatch. Charging afterwards is bookkeeping; refusing beforehand is control.
    const admission = req.ledger.admissionError(now());
    if (admission) {
      return { ...base, argv: lastArgv, sessionId: session.sessionId, continuity, turnsRun: t.turn - 1, chargedUsd: chargedTotal, usage, warnings, outcome: "blocked_budget", reason: `Turn ${t.turn} was never started: ${admission}` };
    }

    const composed = composeSeatArgv(a.seat, {
      prompt: t.turn === 1 ? t.prompt : followUpPrompt({ continuity, harnessName: caps.name, previousSummary: lastSummary, instruction: t.prompt }),
      cwd,
      readOnly,
      sessionId: session.sessionId,
      turn: t.turn,
    });
    lastArgv = composed.argv;
    warnings.push(...composed.warnings.filter((w) => !warnings.includes(w)));

    const timeoutSecs = a.seat.timeoutSecs > 0 ? a.seat.timeoutSecs : 600;
    const enforced = await withDeadline(
      () => deps.cliInvoke({ bin: resolvedBin ?? composed.bin, argv: composed.argv, env: composed.env, cwd, timeoutSecs }),
      timeoutSecs * 1000,
      now,
    );

    const res = enforced.value;
    const durationMs = res ? res.durationMs : enforced.elapsedMs;

    if (enforced.outcome === "timeout" || res?.timedOut) {
      req.ledger.recordCapped(a.seat.id, "timeout", `${caps.name} exceeded its ${timeoutSecs}s deadline on turn ${t.turn}. The child had to be killed; MJ cannot assume it stopped cleanly.`);
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity,
        turnsRun: t.turn - 1,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        outputTail: tail(res?.stdout ?? ""),
        outcome: "timeout",
        reason: `Turn ${t.turn} ran past its ${timeoutSecs}s deadline and was killed. Partial work may be left in the worktree.`,
      };
    }
    if (!res) {
      return { ...base, argv: composed.argv, sessionId: session.sessionId, continuity, turnsRun: t.turn - 1, chargedUsd: chargedTotal, usage, warnings, outcome: "failed", reason: `Turn ${t.turn} produced no result: ${enforced.detail}` };
    }
    last = res;

    // Read the session id back from the CLI's own output. MJ may have chosen it, but the CLI owns the
    // conversation — and a mismatch means the session did not start the way MJ assumed.
    const reportedId = parseSessionId(a.seat.harness, res.stdout);
    if (reportedId) continuity = "session";
    sessions.recordTurn(sessionKey, reportedId, t.prompt);

    const resumeProblem = detectResumeFailure(res.stdout + "\n" + res.stderr);
    if (resumeProblem && t.turn > 1) {
      sessions.markResumeFailed(sessionKey);
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity: "none",
        turnsRun: t.turn - 1,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        exitCode: res.exitCode,
        outputTail: tail(res.stdout || res.stderr),
        outcome: "resume_failed",
        reason: `Turn ${t.turn} could not resume the session: ${resumeProblem}. The follow-up never ran, so the repair was not applied.`,
      };
    }

    // Money and turns come out of the CLI's own output. Not estimated, not modelled.
    const parsed = parseReportedUsage(a.seat.harness, res.stdout);
    usage = parsed;
    const charge = req.ledger.charge(parsed);
    chargedTotal += charge.chargedUsd;
    if (charge.reason && !charge.reason.startsWith("Charged $0.0000")) warnings.push(charge.reason);
    if (charge.breach) req.ledger.recordCapped(a.seat.id, charge.breach === "mission_cap" ? "mission_cap" : "cost_cap", charge.reason);

    lastSummary = summariseOutput(res.stdout);
    if (deps.onTurn) {
      deps.onTurn({ ...base, argv: composed.argv, turnsRun: t.turn, sessionId: session.sessionId, continuity, outcome: "completed", reason: "", exitCode: res.exitCode, durationMs, usage, chargedUsd: chargedTotal, outputTail: tail(res.stdout), commit: "", warnings, selfReport: lastSummary });
    }

    // A non-zero exit is a real failure. Some CLIs exit 0 while reporting is_error:true, so the payload
    // is checked too — an agent that says it failed did not succeed.
    if (res.exitCode !== 0 || reportsError(res.stdout)) {
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity,
        turnsRun: t.turn,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        exitCode: res.exitCode,
        selfReport: lastSummary,
        // stdout when there is any, stderr when that is all the CLI produced. Throwing stderr away is
        // what once hid `Error: Session not found`.
        outputTail: tail(res.stdout || res.stderr),
        outcome: "failed",
        reason:
          res.exitCode !== 0
            ? `${caps.name} exited ${res.exitCode} on turn ${t.turn}. ${res.stderr.trim() ? `It said: ${tail(res.stderr, 500)}` : "It wrote nothing to stderr."}`
            : `${caps.name} exited 0 but reported an error in its own output, so MJ treats it as a failure rather than a success.`,
      };
    }
  }

  // Verification: the repository's own check, in this seat's directory. This is the only thing that
  // makes "verified" true — the agent saying it worked never does.
  let verified = false;
  let verificationDetail = "No verification command is configured for this mission, so nothing was checked. This seat's work is UNVERIFIED.";
  if (deps.verify) {
    const v = await deps.verify(cwd);
    if (v.exitCode === 0) {
      verified = true;
      verificationDetail = `The repository's own check ran in ${cwd} and exited 0.`;
    } else if (v.exitCode === null) {
      verificationDetail = "The verification command did not run at all, so this is NOT a failed check — it is an unmeasured one. The seat is unverified either way.";
    } else {
      verificationDetail = `The repository's own check ran and FAILED (exit ${v.exitCode}). ${tail(v.stdout || v.stderr, 600)}`;
    }
  }

  // Evidence, measured while this seat's work is still the only thing in its tree.
  const gitEv = await collectGitEvidence(deps.git, cwd);

  // Commit a writer's work on its own branch. Read-only seats never commit — a reviewer that commits
  // is not a reviewer.
  let commitDetail = readOnly ? "Read-only seat; nothing to commit." : "No git runner, so the work could not be committed.";
  if (deps.git && !readOnly) {
    await git(deps, ["add", "-A"], cwd);
    const commit = await git(deps, ["-c", "user.email=mj@mj.desktop", "-c", "user.name=MJ", "commit", "-q", "-m", `mj(${a.seat.id}): ${req.missionSlug}`], cwd);
    commitDetail = commit.ok
      ? `Committed on ${branch}.`
      : commit.exitCode === null
        ? "Could not run git commit."
        : /nothing to commit|no changes added/i.test(commit.stderr + commit.stdout)
          ? "Nothing to commit — this seat changed no files."
          : `git commit exited ${commit.exitCode}: ${(commit.stderr || commit.stdout).trim().slice(0, 200)}`;
  }

  return {
    ...base,
    argv: lastArgv,
    sessionId: session.sessionId,
    continuity,
    turnsRun: turns.length,
    chargedUsd: chargedTotal,
    usage,
    warnings,
    durationMs: last?.durationMs ?? 0,
    exitCode: last?.exitCode ?? null,
    verified,
    verificationDetail,
    git: gitEv,
    commit: commitDetail,
    selfReport: lastSummary,
    outputTail: tail(last?.stdout ?? ""),
    outcome: "completed",
    reason: verified ? "Completed and verified by the repository's own check." : "Completed, but not verified — see verificationDetail.",
  };
}

/* ------------------------------------------------------------------ evidence */

/**
 * Ask git what actually changed.
 *
 * `measured:false` is deliberately distinct from "no changes": if git could not run, MJ does not know,
 * and an unknown must not be reported as a clean tree.
 */
export async function collectGitEvidence(gitRunner: GitRunner | undefined, cwd: string): Promise<GitEvidence> {
  if (!gitRunner) return { measured: false, detail: "No git runner is available, so MJ cannot say what changed. This is not a clean tree — it is an unmeasured one.", additions: 0, deletions: 0, filesChanged: 0 };
  const api = gitApi(gitRunner);
  const status = await api.status(cwd);
  if (!status.ok) return { measured: false, detail: `git status failed: ${status.reason ?? "unknown reason"}`, additions: 0, deletions: 0, filesChanged: 0 };
  const diff = await api.diff(cwd);
  if (!diff.ok || !diff.summary) return { measured: false, detail: `git diff failed: ${diff.reason ?? "unknown reason"}`, additions: 0, deletions: 0, filesChanged: 0 };
  const files = diff.summary.files;
  return {
    measured: true,
    detail: files.length === 0 ? "git reports no changes in this worktree." : `${files.length} file(s) changed: ${files.map((f) => f.path).slice(0, 8).join(", ")}${files.length > 8 ? ", …" : ""}`,
    additions: diff.summary.totalAdditions,
    deletions: diff.summary.totalDeletions,
    filesChanged: files.length,
  };
}

/** Some CLIs exit 0 and put the failure in the payload. Both mean the same thing. */
export function reportsError(raw: string): boolean {
  for (const line of raw.split(/\r?\n/).reverse()) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      if (typeof o.is_error === "boolean") return o.is_error;
    } catch {
      /* not JSON */
    }
    break;
  }
  return /"is_error"\s*:\s*true/.test(raw);
}

/** The agent's own account of what it did — labelled as self-report, never as evidence. */
export function summariseOutput(raw: string): string {
  const texts: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      if (typeof o.result === "string") texts.push(o.result);
      else if (o.part && typeof o.part === "object") {
        const p = o.part as Record<string, unknown>;
        if (p.type === "text" && typeof p.text === "string") texts.push(p.text);
      }
    } catch {
      /* not JSON */
    }
  }
  if (texts.length === 0) return raw.trim().slice(-800);
  return texts.join("\n").trim().slice(-800);
}

function tail(s: string, n = OUTPUT_TAIL_CHARS): string {
  const t = s.trimEnd();
  return t.length > n ? `…(truncated ${t.length - n} chars)…\n${t.slice(-n)}` : t;
}

function unrunRecord(a: SeatAssignment, wt: WorktreePlan | null, outcome: SeatOutcome, reason: string): SeatRecord {
  const caps = AGENT_CAPABILITIES[a.seat.harness];
  return {
    seatId: a.seat.id,
    role: a.seat.role,
    harness: a.seat.harness,
    harnessName: caps.name,
    bin: caps.bins[0] ?? "",
    argv: [],
    cwd: wt?.path ?? "",
    branch: wt?.branch ?? "",
    worktreePath: wt?.path ?? "",
    reviewedRef: "",
    reviewedSha: null,
    wave: a.wave,
    turnsRun: 0,
    sessionId: null,
    continuity: "none",
    outcome,
    reason,
    exitCode: null,
    durationMs: 0,
    usage: { costUsd: null, tokens: null, turns: null, source: a.seat.harness },
    chargedUsd: 0,
    verified: false,
    verificationDetail: "Never ran, so nothing was verified.",
    git: { measured: false, detail: "Never ran, so nothing was measured.", additions: 0, deletions: 0, filesChanged: 0 },
    commit: "Never ran, so nothing was committed.",
    warnings: [],
    selfReport: null,
    outputTail: "",
  };
}

/**
 * The one-sentence truth about a run.
 *
 * Written to survive being read by someone who did not watch it happen. It never says "success"
 * without saying what was verified, and it never hides a seat that could not run.
 */
export function buildSummary(o: {
  status: RunStatus;
  seats: SeatRecord[];
  verifiedCount: number;
  spentUsd: number;
  notRun: Array<{ seatId: string; reason: string }>;
  briefings: BriefingRecord[];
  snapshot: ReviewSnapshotRecord;
}): string {
  const ran = o.seats.filter((s) => s.turnsRun > 0).length;
  const parts: string[] = [];
  parts.push(`${ran} of ${o.seats.length} seats ran real CLI invocations; ${o.verifiedCount} were verified by the repository's own check.`);
  if (o.snapshot.built) parts.push(`Reviewers ran against snapshot ${o.snapshot.sha ? o.snapshot.sha.slice(0, 8) : o.snapshot.branch}.`);
  else if (o.snapshot.writerBranches.length === 0) parts.push("No review snapshot was built because no writer committed anything.");
  if (o.spentUsd > 0) parts.push(`Reported spend $${o.spentUsd.toFixed(4)}.`);
  else parts.push("No cost was reported by any CLI, so the true spend is unknown rather than zero.");
  if (o.notRun.length) parts.push(`${o.notRun.length} seat(s) never ran: ${o.notRun.map((n) => n.seatId).join(", ")}.`);
  if (o.briefings.some((f) => f.writtenTo.length === 0)) parts.push("At least one briefing could not be written, so some agents ran without the mission brief.");
  if (o.status === "blocked") parts.push("Nothing completed — this run produced no usable work.");
  return parts.join(" ");
}

/** Flatten a report into the lines a human reads in the UI. */
export function renderRun(report: TeamRunReport): string {
  const lines: string[] = [];
  lines.push(`TEAM RUN — ${report.status.toUpperCase()}`);
  lines.push(report.summary);
  if (report.snapshot.built) {
    lines.push("");
    lines.push(`review snapshot: ${report.snapshot.branch} @ ${report.snapshot.sha ?? "?"}`);
    lines.push(`  merged: ${report.snapshot.writerBranches.join(" + ")}`);
    for (const c of report.snapshot.conflicts) lines.push(`  ! ${c}`);
  }
  lines.push("");
  for (const s of report.seats) {
    lines.push(`[${s.wave}] ${s.seatId} (${s.role} · ${s.harnessName}) — ${s.outcome}`);
    lines.push(`    turns=${s.turnsRun} continuity=${s.continuity} exit=${s.exitCode ?? "n/a"} ${(s.durationMs / 1000).toFixed(1)}s charged=$${s.chargedUsd.toFixed(4)}`);
    lines.push(`    ${s.reason}`);
    lines.push(`    looked at: ${s.reviewedRef || "(nothing)"}`);
    lines.push(`    verification: ${s.verificationDetail}`);
    lines.push(`    git: ${s.git.detail}`);
    lines.push(`    commit: ${s.commit}`);
    if (s.sessionId) lines.push(`    session: ${s.sessionId}`);
    for (const w of s.warnings.slice(0, 4)) lines.push(`    ! ${w}`);
  }
  if (report.notRun.length) {
    lines.push("");
    lines.push("never ran:");
    for (const n of report.notRun) lines.push(`  ${n.seatId} — ${n.reason}`);
  }
  return lines.join("\n");
}

/** The briefing text for one seat, exposed so the UI can show exactly what an agent was told. */
export function seatBriefing(seat: TeamSeat, req: { objective: string; constraints?: string[]; doNotTouch?: string[]; testCommand?: string[]; readOnly?: boolean }): string {
  return briefingContents({
    objective: req.objective,
    constraints: req.constraints ?? [],
    doNotTouch: req.doNotTouch ?? [],
    testCommand: req.testCommand,
    seat,
    readOnly: req.readOnly,
  });
}
