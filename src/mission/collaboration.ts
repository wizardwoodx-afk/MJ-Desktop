/**
 * COLLABORATION — worktrees, briefings, claim sequencing and the review snapshot.
 *
 * THE BUG THIS FILE WAS REWRITTEN TO FIX
 *
 * An earlier version said: "read-only seats share the base checkout — giving a reviewer its own
 * worktree would mean it reviews a tree nobody is writing to."
 *
 * That reasoning was backwards, and the consequence was a correctness bug. The writer works in a
 * PRIVATE worktree and commits to a PRIVATE branch. Nothing merges it before the reviewer runs. So a
 * reviewer pointed at the base checkout reviewed the tree as it was BEFORE the work happened — it
 * could not see the change it was asked to review, and would have approved or rejected the wrong code.
 *
 * THE CORRECTED TOPOLOGY
 *
 *              BASE (untouched, pristine)
 *                │
 *                ├─ writer  ── private worktree ── commits to its own branch
 *                │
 *                └─ review snapshot: base + every writer branch merged
 *                        │
 *                        ├─ reviewer   (read-only worktree, detached)
 *                        ├─ security   (read-only worktree, detached)
 *                        └─ tester     (read-only worktree, detached)
 *
 * Three properties fall out of this, and each one is the reason for a design choice below:
 *
 *   1. A reviewer sees exactly the merged state of everything written before its wave — not the base,
 *      and not one writer's branch in isolation.
 *   2. The base branch stays pristine until a human decides to merge, so nothing unreviewed lands.
 *   3. The review snapshot is a real commit, so the review is reproducible: you can check out the same
 *      SHA later and see precisely what was approved.
 *
 * The snapshot cannot be built until the writers have committed, so read-only worktrees are DEFERRED
 * and created just-in-time when their wave runs. That is what `deferred` means below.
 */

import type { HarnessId } from "../domain/harness";
import type { CliAgentTeam, TeamSeat } from "./agentTeam";

/* ------------------------------------------------------------------ 1. worktrees */

export interface WorktreePlan {
  seatId: string;
  /** The branch this seat's work lands on. Empty for a deferred read-only seat until its target resolves. */
  branch: string;
  path: string;
  /** Git argv to create it. Empty for deferred seats, which the executor fills in at wave time. */
  createArgv: string[][];
  removeArgv: string[][];
  /**
   * True only when this seat genuinely runs in the base checkout — which now happens solely for a
   * read-only team with no writers at all, where there is nothing to snapshot.
   */
  shared: boolean;
  /**
   * True for read-only seats whose worktree cannot be created yet, because the review snapshot does
   * not exist until the writers have committed.
   */
  deferred: boolean;
  reason: string;
}

/**
 * Sanitise a seat id into something safe as a branch name and a directory suffix.
 *
 * Seat ids come from user input, so this is a real boundary. A character filter alone is NOT enough:
 * it keeps `.`, so an id like `impl/../etc` would produce a branch containing `..`. Git rejects some
 * such refs, but this string is also used as a directory suffix, so collapse dot-runs and strip
 * leading dots rather than relying on git to object.
 */
function branchSafe(s: string): string {
  return (
    s
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/\.{2,}/g, ".")
      .replace(/\.+/, "")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "seat"
  );
}

/**
 * Plan the isolation for every seat.
 *
 * Writers get a private branch and a sibling directory. Read-only seats get a DEFERRED plan: their
 * worktree is created at wave time on the review snapshot, which does not exist yet.
 */
export function planWorktrees(team: CliAgentTeam, opts: { repoRoot: string; baseBranch: string; missionSlug: string }): WorktreePlan[] {
  const plans: WorktreePlan[] = [];
  const hasWriter = team.seats.some((s) => s.mayWrite);
  const root = opts.repoRoot.replace(/\/+$/, "");

  for (const seat of team.seats) {
    if (!seat.mayWrite) {
      if (!hasWriter) {
        // No writers means there is nothing to snapshot, so the base checkout is the correct and only
        // tree to look at. This is the ONE case where sharing is right.
        plans.push({
          seatId: seat.id,
          branch: opts.baseBranch,
          path: root,
          createArgv: [],
          removeArgv: [],
          shared: true,
          deferred: false,
          reason: `${seat.role} is read-only and no seat writes, so the base checkout is the correct tree to inspect.`,
        });
        continue;
      }
      // Deferred: the review snapshot is built from the writers' branches, which do not exist yet.
      const path = `${root}-mj-review-${branchSafe(seat.id)}`;
      plans.push({
        seatId: seat.id,
        branch: "",
        path,
        createArgv: [],
        removeArgv: [["worktree", "remove", "--force", path]],
        shared: false,
        deferred: true,
        reason: `${seat.role} is read-only, so it gets its own worktree on the REVIEW SNAPSHOT — the base plus every writer branch merged. Pointing it at the base checkout would have it review the tree as it was before the work happened, which is the bug this replaces.`,
      });
      continue;
    }

    const branch = `mj/${opts.missionSlug}/${branchSafe(seat.id)}`;
    // A sibling directory, never inside the repo: a worktree inside the repo shows up in its own
    // status output and the agent then tries to commit it.
    const path = `${root}-mj-${branchSafe(seat.id)}`;
    plans.push({
      seatId: seat.id,
      branch,
      path,
      createArgv: [["worktree", "add", "-b", branch, path, opts.baseBranch]],
      removeArgv: [["worktree", "remove", "--force", path]],
      shared: false,
      deferred: false,
      reason: `${seat.role} writes, so it gets its own worktree on ${branch}. Two agents in one working tree overwrite each other.`,
    });
  }
  return plans;
}

/** The name of the branch that holds the merged state the reviewers look at. */
export function reviewSnapshotBranch(missionSlug: string): string {
  return `mj/${missionSlug}/review`;
}

/**
 * Git argv that builds the review snapshot from the writers' branches.
 *
 * Returned as argv rather than executed, so the same plan can be shown to a human before it runs and
 * so the native layer stays the only thing that touches the repository.
 *
 * `--no-ff` on every merge, so each writer's contribution stays visible in the history. A fast-forward
 * would collapse the snapshot into whichever branch happened to be ahead, and you would lose the
 * ability to tell which seat contributed what.
 */
export function reviewSnapshotArgv(opts: {
  repoRoot: string;
  baseBranch: string;
  missionSlug: string;
  writerBranches: string[];
}): { argv: string[][]; snapshotBranch: string; problem: string | null } {
  const snapshotBranch = reviewSnapshotBranch(opts.missionSlug);
  if (opts.writerBranches.length === 0) {
    return { argv: [], snapshotBranch, problem: "No writer produced a branch, so there is nothing to snapshot." };
  }
  const argv: string[][] = [
    // -B rather than -b: a second run of the same mission must reset the snapshot, not fail because
    // the branch already exists.
    ["checkout", "-B", snapshotBranch, opts.baseBranch],
  ];
  for (const b of opts.writerBranches) argv.push(["merge", "--no-ff", "--no-edit", b]);
  return { argv, snapshotBranch, problem: null };
}

/** argv to create a read-only seat's detached worktree on the snapshot. */
export function reviewWorktreeArgv(snapshotBranch: string, path: string): string[][] {
  // --detach, not -b: a read-only seat must not create a branch it could commit to, and a detached
  // worktree makes the exact reviewed SHA explicit in the record.
  return [["worktree", "add", "--detach", path, snapshotBranch]];
}

/**
 * Pre-flight the snapshot merge without touching anything.
 *
 * `git merge-tree` performs the three-way merge in memory. Finding a conflict here means the writers
 * disagreed, which is a finding worth reporting BEFORE a reviewer spends a turn on a tree that cannot
 * be built.
 *
 * It takes TWO branches — the merge base is derived from their history. Passing a third argument is a
 * usage error (exit 129), which is easy to mistake for "these branches conflict" if you only check for
 * a non-zero exit.
 */
export function snapshotPreflightArgv(baseBranch: string, writerBranches: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < writerBranches.length; i += 1) {
    for (let j = i + 1; j < writerBranches.length; j += 1) {
      const a = writerBranches[i];
      const b = writerBranches[j];
      if (a && b) out.push(["merge-tree", "--write-tree", "--name-only", a, b]);
    }
  }
  void baseBranch;
  return out;
}

/* ------------------------------------------------------------------ 2. the briefing */

export interface ContextFile {
  /** Path relative to the seat's own working directory. */
  path: string;
  contents: string;
  /** Which harness reads it. */
  forHarness: HarnessId;
}

/**
 * The one file each CLI actually reads for standing instructions.
 *
 * Writing CLAUDE.md for a Codex seat does nothing, and vice versa. So the same briefing is written
 * under every name in use, and MJ says which harness each copy is for.
 */
const CONTEXT_PATHS: Array<{ harness: HarnessId; path: string }> = [
  { harness: "claude", path: "CLAUDE.md" },
  { harness: "codex", path: "AGENTS.md" },
  { harness: "opencode", path: "AGENTS.md" },
  { harness: "grok", path: "AGENTS.md" },
  { harness: "cursor", path: ".cursor/rules/mj.mdc" },
  { harness: "cline", path: ".clinerules" },
  { harness: "kilo", path: ".kilo/rules.md" },
];

/**
 * Compose the mission briefing.
 *
 * The briefing states the evidence standard, not just the task. An agent that does not know it will
 * be checked by the repository's own test suite optimises for sounding finished; one that does know
 * tends to run the tests itself.
 */
export function briefingContents(opts: {
  objective: string;
  constraints: string[];
  doNotTouch: string[];
  testCommand?: string[];
  seat?: TeamSeat | null;
  readOnly?: boolean;
}): string {
  const lines: string[] = [];
  lines.push("# MJ mission briefing", "");
  lines.push("## Objective", opts.objective, "");
  if (opts.seat) {
    lines.push("## Your role", `${opts.seat.role}. ${opts.seat.instructions || ""}`.trim(), "");
  }
  if (opts.readOnly !== undefined) {
    lines.push(
      "## Writes",
      opts.readOnly
        ? "You are READ-ONLY. Do not modify, create or delete any file. Your output is a verdict, not a patch."
        : "You may modify files, but only what the objective requires.",
      "",
    );
  }
  if (opts.constraints.length) {
    lines.push("## Constraints");
    for (const c of opts.constraints) lines.push(`- ${c}`);
    lines.push("");
  }
  if (opts.doNotTouch.length) {
    lines.push("## Do not touch");
    for (const d of opts.doNotTouch) lines.push(`- ${d}`);
    lines.push("");
  }
  if (opts.testCommand?.length) {
    lines.push("## How your work will be judged", `MJ runs \`${opts.testCommand.join(" ")}\` in your working directory. If it fails, your work is recorded as UNVERIFIED regardless of what you report. Run it yourself before you finish.`, "");
  }
  lines.push("## Evidence standard", "Say what you measured, not what you believe. \"The tests pass\" without the command you ran is a claim; \"node test.js exited 0\" is evidence.", "");
  return lines.join("\n");
}

/** The briefing files to write, one per harness present on the team. */
export function writeContextFiles(
  team: CliAgentTeam,
  briefing: { objective: string; constraints: string[]; doNotTouch: string[]; testCommand?: string[] },
): ContextFile[] {
  const harnesses = new Set<HarnessId>(team.seats.map((s) => s.harness));
  const out: ContextFile[] = [];
  const seen = new Set<string>();
  for (const { harness, path } of CONTEXT_PATHS) {
    if (!harnesses.has(harness)) continue;
    // Several harnesses share AGENTS.md; write it once, not once per harness.
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, contents: briefingContents({ ...briefing }), forHarness: harness });
  }
  return out;
}

/* ------------------------------------------------------------------ 3. claim sequencing */

export interface Claim {
  seatId: string;
  /** File paths this seat intends to touch. */
  paths: string[];
  /** Symbols (functions, types) it intends to change. Finer-grained than paths. */
  symbols: string[];
}

export interface ClaimConflict {
  a: string;
  b: string;
  severity: "path" | "symbol";
  overlap: string[];
  detail: string;
}

/**
 * Find claims that collide.
 *
 * Symbol-level locking beats file-level locking: two agents editing different functions in one file
 * can run in parallel safely, and serialising them would halve throughput for no benefit. But a
 * symbol collision inside otherwise-disjoint files is still a collision, which path-only checks miss
 * entirely.
 */
export function findClaimConflicts(claims: Claim[]): ClaimConflict[] {
  const out: ClaimConflict[] = [];
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const a = claims[i];
      const b = claims[j];
      if (!a || !b) continue;
      const symbols = a.symbols.filter((s) => b.symbols.includes(s));
      if (symbols.length) {
        out.push({
          a: a.seatId,
          b: b.seatId,
          severity: "symbol",
          overlap: symbols,
          detail: `Both claim ${symbols.join(", ")}. Merging two edits to one symbol produces something that compiles and means neither — the worst outcome, because it looks clean.`,
        });
        continue;
      }
      const paths = a.paths.filter((p) => b.paths.includes(p));
      if (paths.length) {
        out.push({
          a: a.seatId,
          b: b.seatId,
          severity: "path",
          overlap: paths,
          detail: `Both claim ${paths.join(", ")}. They can run in parallel only if their edits are in different regions; otherwise serialise them.`,
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ 4. verification pairs */

export interface VerificationPair {
  writerSeatId: string;
  verifierSeatId: string | null;
  /** True when the verifier is a different vendor from the writer. */
  independent: boolean;
  detail: string;
}

/**
 * Pair each writer with something that checks it.
 *
 * Independence is the whole point: a vendor reviewing its own output agrees with itself far more often
 * than it disagrees. When no independent verifier exists, the pair says so rather than implying the
 * review means more than it does.
 */
export function planVerification(team: CliAgentTeam): VerificationPair[] {
  const verifiers = team.seats.filter((s) => s.role === "reviewer" || s.role === "security" || s.role === "tester");
  const out: VerificationPair[] = [];
  for (const w of team.seats.filter((s) => s.mayWrite)) {
    const independent = verifiers.find((v) => v.harness !== w.harness);
    const any = verifiers[0] ?? null;
    const chosen = independent ?? any;
    out.push({
      writerSeatId: w.id,
      verifierSeatId: chosen?.id ?? null,
      independent: chosen !== null && chosen.harness !== w.harness,
      detail: chosen
        ? independent
          ? `${chosen.id} (${chosen.harness}) verifies ${w.id} (${w.harness}) — a different vendor, so the verdict is independent.`
          : `${chosen.id} verifies ${w.id}, but both are ${w.harness}. A vendor reviewing its own output is ADVISORY, not verification.`
        : `${w.id} has no verifier on this team. Nothing checks its work.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ 5. the plan */

export interface CollaborationPlan {
  teamId: string;
  missionSlug: string;
  worktrees: WorktreePlan[];
  contextFiles: ContextFile[];
  conflicts: ClaimConflict[];
  verification: VerificationPair[];
  /** Ordered execution waves. Seats in the same wave may run in parallel. */
  waves: Array<{ seats: string[]; why: string }>;
  problems: string[];
}

/**
 * Build the full collaboration plan.
 *
 * Waves are derived from roles, not guessed: nothing writes before something plans, and nothing is
 * verified before it exists. Seats inside a wave are independent by construction, which is what makes
 * parallel execution safe rather than merely fast.
 */
export function planCollaboration(
  team: CliAgentTeam,
  opts: { repoRoot: string; baseBranch: string; missionSlug: string; objective: string; constraints?: string[]; doNotTouch?: string[]; claims?: Claim[]; testCommand?: string[] },
): CollaborationPlan {
  const worktrees = planWorktrees(team, opts);
  const contextFiles = writeContextFiles(team, {
    objective: opts.objective,
    constraints: opts.constraints ?? [],
    doNotTouch: opts.doNotTouch ?? [],
    testCommand: opts.testCommand,
  });
  const conflicts = findClaimConflicts(opts.claims ?? []);
  const verification = planVerification(team);

  const byRole = (r: string) => team.seats.filter((s) => s.role === r).map((s) => s.id);
  const waves: CollaborationPlan["waves"] = [];
  const scheduled = new Set<string>();
  const push = (seats: string[], why: string) => {
    // Filter BEFORE creating the wave. Passing the full list and letting the caller's `why` describe
    // it produces a wave whose reason does not match its contents.
    const fresh = seats.filter((s) => !scheduled.has(s));
    if (!fresh.length) return;
    for (const s of fresh) scheduled.add(s);
    waves.push({ seats: fresh, why });
  };

  push(byRole("planner"), "Planning first: nothing should write before the approach exists.");
  push(byRole("architect"), "Architecture next, still read-only, so the writers inherit a design.");

  // Writing seats are scheduled by ROLE, in canonical order. Grouping by `mayWrite` instead puts a
  // tester that edits test files into the coding wave, so it could run before the code it tests existed.
  const conflicted = new Set(conflicts.flatMap((c) => [c.a, c.b]));
  const writingRoles: Array<[string, string]> = [
    ["coder", "Implementation. Separate worktrees, so parallel writers cannot overwrite each other."],
    ["debugger", "Debugging, after the implementation exists."],
    ["tester", "Testing, against the merged result — so it must follow the writers, never join them."],
  ];
  for (const [role, why] of writingRoles) {
    const ids = team.seats.filter((s) => s.role === role && s.mayWrite).map((s) => s.id);
    if (!ids.length) continue;
    const parallel = ids.filter((w) => !conflicted.has(w));
    if (parallel.length > 1) push(parallel, `${why} These claims do not overlap, so they run at once.`);
    else if (parallel.length === 1) push(parallel, why);
    for (const s of ids.filter((w) => conflicted.has(w))) {
      push([s], `Sequenced alone: its claim overlaps another seat's, so running them together would produce a merge that looks clean and is semantically wrong.`);
    }
  }
  for (const s of team.seats.filter((x) => x.mayWrite && !scheduled.has(x.id))) {
    push([s.id], `${s.role} writes, but has no canonical position in the sequence, so it runs alone rather than being silently skipped.`);
  }

  // Read-only verification runs AFTER the writers, against the review snapshot. That ordering is the
  // fix for the visibility bug: the snapshot only exists once the writers have committed.
  push([...byRole("tester"), ...byRole("reviewer"), ...byRole("security")], "Verification against the REVIEW SNAPSHOT — the base plus every writer branch merged — so the reviewers see the work, not the tree that predates it.");
  push(byRole("synthesizer"), "Synthesis once the verdicts are in.");

  const problems: string[] = [];
  if (conflicts.some((c) => c.severity === "symbol")) {
    problems.push(`${conflicts.filter((c) => c.severity === "symbol").length} symbol-level claim conflict(s). Resolve these before starting, not at merge time.`);
  }
  if (verification.some((v) => !v.independent)) {
    problems.push(`${verification.filter((v) => !v.independent).length} writing seat(s) have no independent verifier. Add a reviewer from a second vendor, or accept that the review is advisory.`);
  }
  const writerHarnesses = new Set(team.seats.filter((s) => s.mayWrite).map((s) => s.harness));
  if (writerHarnesses.size > 1) {
    problems.push(`${writerHarnesses.size} different CLIs will write in parallel. That is the point, but it means ${writerHarnesses.size} sets of edits to reconcile — review the merge, not just the branches.`);
  }

  return { teamId: team.id, missionSlug: opts.missionSlug, worktrees, contextFiles, conflicts, verification, waves, problems };
}

/** The argv the native layer must run, in order, to stand up the WRITERS' worktrees. */
export function setupArgv(plan: CollaborationPlan): string[][] {
  const out: string[][] = [];
  for (const w of plan.worktrees) {
    if (w.shared || w.deferred) continue;
    for (const argv of w.createArgv) out.push(["git", ...argv]);
  }
  return out;
}

/** And to tear it down. Worktrees left behind accumulate and confuse the next mission. */
export function teardownArgv(plan: CollaborationPlan): string[][] {
  const out: string[][] = [];
  for (const w of plan.worktrees) {
    if (w.shared) continue;
    for (const argv of w.removeArgv) out.push(["git", ...argv]);
  }
  out.push(["git", "worktree", "prune"]);
  return out;
}

/** Render the plan for the UI, so a user can see what MJ intends to do before it does it. */
export function renderPlan(plan: CollaborationPlan): string {
  const lines: string[] = [];
  lines.push(`TEAM ${plan.teamId} — mission "${plan.missionSlug}"`);
  lines.push("");
  lines.push("execution order:");
  plan.waves.forEach((w, i) => {
    lines.push(`  wave ${i + 1}: ${w.seats.join(", ")}`);
    lines.push(`    ${w.why}`);
  });
  lines.push("");
  lines.push("isolation:");
  for (const w of plan.worktrees) {
    const kind = w.shared ? "shared base" : w.deferred ? "review snapshot (deferred)" : "private worktree";
    lines.push(`  ${w.seatId.padEnd(12)} ${kind.padEnd(26)} ${w.branch || "(resolved at wave time)"}`);
    lines.push(`    ${w.path}`);
  }
  lines.push("");
  lines.push("briefings:");
  for (const f of plan.contextFiles) lines.push(`  ${f.path}  (read by ${f.forHarness})`);
  if (plan.verification.length) {
    lines.push("");
    lines.push("verification:");
    for (const v of plan.verification) lines.push(`  ${v.detail}`);
  }
  if (plan.problems.length) {
    lines.push("");
    lines.push("before you start:");
    for (const p of plan.problems) lines.push(`  ! ${p}`);
  }
  return lines.join("\n");
}
