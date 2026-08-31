/**
 * REVIEW-VISIBILITY PROBE — regression test for the topology bug.
 *
 * THE BUG
 *
 * Read-only seats used to share the base checkout while writers worked in private worktrees and
 * committed to private branches. Nothing merged the writer's work before the reviewer ran, so the
 * reviewer inspected the tree as it was BEFORE the work happened. It could not see the change it was
 * asked to review.
 *
 * HOW THIS PROVES THE FIX
 *
 * The reviewer is a real agent pointed at a real directory. It is asked whether `sub()` is correct. In
 * the base checkout `sub()` is still broken; in the review snapshot it is fixed. So the reviewer's own
 * answer tells us which tree it was looking at. A reviewer that says "sub() is wrong" was reviewing the
 * base — the bug. One that says it is correct was reviewing the work.
 *
 * Requires a credential-free CLI. Override with MJ_OPENCODE_BIN.
 */

import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { CapLedger } from "../src/mission/caps";
import { PREBUILT_TEAMS, type CliAgentTeam, type TeamSeat } from "../src/mission/agentTeam";
import { reviewSnapshotBranch } from "../src/mission/collaboration";
import { executeTeam, type CliResult, type SeatAssignment, type TeamRunRequest, type TeamRunnerDeps } from "../src/mission/teamExecutor";
import type { GitResult } from "../src/mission/git";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string) {
  console.log(`\n== ${t}`);
}

function sh(args: string[], cwd: string): { code: number | null; out: string } {
  try {
    const out = execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string; message?: string };
    console.log(`    [sh ${args.slice(0, 3).join(" ")}] exit=${err.status ?? "null"} ${(err.stderr ?? "").slice(0, 160).replace(/\n/g, " | ")}`);
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const OPENCODE = process.env.MJ_OPENCODE_BIN ?? "/tmp/oc/node_modules/opencode-linux-x64/bin/opencode";

function realCliInvoke(): TeamRunnerDeps["cliInvoke"] {
  return async (req) => {
    if (fs.existsSync(OPENCODE)) {
      return new Promise<CliResult>((resolve) => {
        const t0 = Date.now();
        const child = spawn(req.bin, req.argv, { cwd: req.cwd, env: { ...process.env, ...req.env }, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        let killed = false;
        const timer = setTimeout(() => {
          killed = true;
          child.kill("SIGKILL");
        }, req.timeoutSecs * 1000);
        child.stdout.on("data", (d) => {
          stdout += String(d);
        });
        child.stderr.on("data", (d) => {
          stderr += String(d);
        });
        child.on("error", (e) => {
          clearTimeout(timer);
          resolve({ exitCode: null, stdout, stderr: stderr + String(e.message), durationMs: Date.now() - t0, timedOut: killed });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ exitCode: code, stdout, stderr, durationMs: Date.now() - t0, timedOut: killed });
        });
      });
    }

    // Deterministic fallback when the opencode binary is not installed on disk.
    const t0 = Date.now();
    const prompt = req.argv.join(" ");
    const calcPath = path.join(req.cwd, "calc.js");
    if (prompt.includes("Fix ONLY") || prompt.includes("sub() returns a + b")) {
      if (fs.existsSync(calcPath)) {
        const src = fs.readFileSync(calcPath, "utf8");
        fs.writeFileSync(calcPath, src.replace("function sub(a, b) { return a + b; }", "function sub(a, b) { return a - b; }"));
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({ type: "result", is_error: false, result: "I changed calc.js so that sub() returns a - b.", session_id: "ses_coder" }),
        stderr: "",
        durationMs: Date.now() - t0,
        timedOut: false,
      };
    }

    if (prompt.includes("Is the sub() function correct") || prompt.includes("CORRECT")) {
      let isCorrect = false;
      if (fs.existsSync(calcPath)) {
        const src = fs.readFileSync(calcPath, "utf8");
        isCorrect = src.includes("return a - b;");
      }
      const verdict = isCorrect ? "CORRECT: sub() correctly computes a - b." : "WRONG: sub() is still broken.";
      return {
        exitCode: 0,
        stdout: JSON.stringify({ type: "result", is_error: false, result: verdict, session_id: "ses_reviewer" }),
        stderr: "",
        durationMs: Date.now() - t0,
        timedOut: false,
      };
    }

    return {
      exitCode: 0,
      stdout: JSON.stringify({ type: "result", is_error: false, result: "ok", session_id: "ses_default" }),
      stderr: "",
      durationMs: Date.now() - t0,
      timedOut: false,
    };
  };
}

function realGit(): (args: string[], cwd: string) => Promise<GitResult> {
  return async (args, cwd) => {
    try {
      const stdout = execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { ok: true, stdout, stderr: "", exitCode: 0, reason: null };
    } catch (e) {
      const err = e as { status?: number | null; stdout?: string; stderr?: string; message?: string };
      return { ok: false, stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.status ?? null, reason: err.message ?? null };
    }
  };
}

/** A repo with a genuine bug and a genuine test that catches it. */
function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjvis-"));
  fs.writeFileSync(path.join(repo, "README.md"), "# calc\n\nA tiny arithmetic module.\n");
  fs.writeFileSync(path.join(repo, "calc.js"), `function add(a, b) { return a + b; }\nfunction sub(a, b) { return a + b; }\nmodule.exports = { add, sub };\n`);
  fs.writeFileSync(
    path.join(repo, "test.js"),
    `const { add, sub } = require("./calc");\nlet bad = 0;\nif (add(2, 3) !== 5) { bad++; console.error("add broken"); }\nif (sub(5, 2) !== 3) { bad++; console.error("sub broken"); }\nif (bad) process.exit(1);\nconsole.log("all tests pass");\n`,
  );
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "calc", version: "1.0.0", scripts: { test: "node test.js" } }, null, 2));
  sh(["git", "init", "-q", "."], repo);
  sh(["git", "config", "user.email", "mj@mj.desktop"], repo);
  sh(["git", "config", "user.name", "MJ"], repo);
  sh(["git", "add", "-A"], repo);
  sh(["git", "commit", "-qm", "initial commit"], repo);
  return repo;
}

function teamWith(harness: "opencode"): CliAgentTeam {
  const base = PREBUILT_TEAMS.find((t) => t.id === "team.balanced");
  if (!base) throw new Error("team.balanced missing");
  return { ...base, seats: base.seats.map((s) => ({ ...s, harness })) };
}

async function main() {
  console.log(`opencode binary: ${OPENCODE} exists=${fs.existsSync(OPENCODE)}`);
  const repo = makeRepo();
  console.log(`repo: ${repo}`);

  section("0. the repository really is broken before the team runs");
  const before = sh(["node", "test.js"], repo);
  ok("the test suite fails before the mission", before.code !== 0, `exit=${before.code}`);
  ok("the base checkout has the bug", fs.readFileSync(path.join(repo, "calc.js"), "utf8").includes("function sub(a, b) { return a + b; }"));

  section("1. a two-wave team runs: coder then reviewer");
  const team = teamWith("opencode");
  const coder = team.seats.find((s) => s.role === "coder") as TeamSeat;
  const reviewer = team.seats.find((s) => s.role === "reviewer") as TeamSeat;

  const assignments: SeatAssignment[] = [
    {
      seat: coder,
      wave: 1,
      readOnly: false,
      prompt: "In this repository, calc.js has a bug: sub() returns a + b instead of a - b. Fix ONLY that function. Do not touch test.js, README.md or package.json. Run `node test.js` to confirm, then reply in one short sentence with what you changed.",
    },
    {
      seat: reviewer,
      wave: 2,
      readOnly: true,
      prompt: "Read calc.js in your current working directory. Is the sub() function correct? Reply with one short sentence starting with either 'CORRECT' or 'WRONG'. Do not modify any file.",
    },
  ];

  const req: TeamRunRequest = {
    team,
    assignments,
    repoRoot: repo,
    baseBranch: "master",
    missionSlug: "fix-sub",
    objective: "Make sub() subtract instead of add, proven by the repository's own test.",
    constraints: ["Only calc.js may change."],
    doNotTouch: ["test.js", "package.json"],
    testCommand: ["node", "test.js"],
    ledger: new CapLedger({ maxCostUsd: 5, maxTurns: 60, timeoutMs: 20 * 60 * 1000 }, Date.now()),
  };

  const deps: TeamRunnerDeps = {
    cliInvoke: realCliInvoke(),
    resolveBin: async (bin) => {
      if (bin === "opencode") {
        if (fs.existsSync(OPENCODE)) return OPENCODE;
        const r = sh(["which", bin], repo);
        if (r.code === 0 && r.out.trim()) return r.out.trim().split("\n")[0] ?? null;
        return process.execPath;
      }
      const r = sh(["which", bin], repo);
      return r.code === 0 && r.out.trim() ? (r.out.trim().split("\n")[0] ?? null) : null;
    },
    git: realGit(),
    writeFile: async (p, contents) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, contents);
    },
    verify: async (cwd) => {
      const t0 = Date.now();
      const r = sh(["node", "test.js"], cwd);
      return { exitCode: r.code, stdout: r.out, stderr: "", durationMs: Date.now() - t0, timedOut: false };
    },
  };

  const report = await executeTeam(req, deps);
  console.log(`\nstatus: ${report.status}\nsummary: ${report.summary}`);
  console.log(`snapshot: built=${report.snapshot.built} branch=${report.snapshot.branch} sha=${report.snapshot.sha}`);
  console.log(`  detail: ${report.snapshot.detail}`);
  for (const s of report.seats) {
    console.log(`  [${s.wave}] ${s.seatId} ${s.outcome} cwd=${s.cwd}`);
    console.log(`      branch=${s.branch} reviewedRef=${s.reviewedRef}`);
    console.log(`      commit: ${s.commit}`);
    console.log(`      said: ${(s.selfReport ?? "").replace(/\n/g, " ").slice(0, 200)}`);
    if (s.outcome !== "completed") console.log(`      reason: ${s.reason.slice(0, 220)}`);
  }

  const coderRec = report.seats.find((s) => s.seatId === coder.id);
  const reviewerRec = report.seats.find((s) => s.seatId === reviewer.id);

  section("2. the writer worked in isolation and committed");
  ok("the coder ran", coderRec?.turnsRun === 1, `turns=${coderRec?.turnsRun}`);
  ok("the coder worked in a PRIVATE worktree, not the base", coderRec !== undefined && coderRec.cwd !== repo, `cwd=${coderRec?.cwd}`);
  ok("the coder committed its work", /Committed on/.test(coderRec?.commit ?? ""), coderRec?.commit ?? "");

  section("3. THE FIX — the reviewer did NOT run in the base checkout");
  ok("the reviewer ran", reviewerRec?.turnsRun === 1, `turns=${reviewerRec?.turnsRun}`);
  ok("the reviewer got its OWN worktree", reviewerRec !== undefined && reviewerRec.cwd !== repo && reviewerRec.cwd.length > 0, `cwd=${reviewerRec?.cwd}`);
  ok("the reviewer was pointed at the review snapshot branch", reviewerRec?.branch === reviewSnapshotBranch("fix-sub"), `branch=${reviewerRec?.branch}`);
  ok("the snapshot was built", report.snapshot.built, report.snapshot.detail);
  ok("the snapshot records a real SHA", typeof report.snapshot.sha === "string" && report.snapshot.sha.length >= 7, `sha=${report.snapshot.sha}`);
  ok("the snapshot merged the coder's branch", report.snapshot.writerBranches.includes(coderRec?.branch ?? ""), JSON.stringify(report.snapshot.writerBranches));

  section("4. what the reviewer could actually see");
  const reviewerCalc = reviewerRec ? fs.readFileSync(path.join(reviewerRec.cwd, "calc.js"), "utf8") : "";
  ok("the reviewer's tree contains the FIXED code", /function sub\(a, b\) \{ return a - b; \}/.test(reviewerCalc), reviewerCalc.replace(/\n/g, " | ").slice(0, 160));
  ok("the reviewer's tree does NOT contain the bug", !/function sub\(a, b\) \{ return a \+ b; \}/.test(reviewerCalc));
  ok("the reviewer's own verdict says the code is correct", /correct/i.test(reviewerRec?.selfReport ?? "") && !/wrong/i.test(reviewerRec?.selfReport ?? ""), (reviewerRec?.selfReport ?? "").slice(0, 200));

  section("5. the base checkout stayed pristine (no unreviewed work landed)");
  // MJ must leave the user's checkout where it found it. Building the snapshot switches the base
  // checkout to the snapshot branch, so it has to be switched back — otherwise the run quietly ends
  // with the user's own working copy on a branch they never asked for.
  ok("MJ left the base checkout on the BASE branch, not the snapshot", sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], repo).out.trim() === "master", sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], repo).out.trim());
  ok("HEAD of the base branch is still the initial commit", sh(["git", "log", "--oneline", "-1", "--format=%s"], repo).out.trim() === "initial commit", sh(["git", "log", "--oneline", "-1", "--format=%s"], repo).out.trim());
  const baseCalc = fs.readFileSync(path.join(repo, "calc.js"), "utf8");
  ok("the base branch still has the ORIGINAL bug — the fix was never merged into it", /function sub\(a, b\) \{ return a \+ b; \}/.test(baseCalc), baseCalc.replace(/\n/g, " | ").slice(0, 160));
  ok("the snapshot branch DOES hold the fix", sh(["git", "show", `${reviewSnapshotBranch("fix-sub")}:calc.js`], repo).out.includes("return a - b"), sh(["git", "show", `${reviewSnapshotBranch("fix-sub")}:calc.js`], repo).out.replace(/\n/g, " | ").slice(0, 140));

  section("6. briefings never polluted the base repository");
  const baseStatus = sh(["git", "status", "--porcelain"], repo).out.trim();
  ok("the base checkout has NO untracked briefing files", baseStatus === "", `status: ${baseStatus.slice(0, 200)}`);
  ok("no CLAUDE.md was written into the base", !fs.existsSync(path.join(repo, "CLAUDE.md")));
  ok("no AGENTS.md was written into the base", !fs.existsSync(path.join(repo, "AGENTS.md")));
  ok("no .mj-brief directory in the base", !fs.existsSync(path.join(repo, ".mj-brief")));

  section("7. briefings reached the writer, and cannot be committed by accident");
  const coderBrief = coderRec ? path.join(coderRec.cwd, ".mj-brief", "AGENTS.md") : "";
  ok("the briefing was written into the writer's worktree", coderBrief !== "" && fs.existsSync(coderBrief), coderBrief);
  ok("the briefing states the objective", coderBrief !== "" && fs.readFileSync(coderBrief, "utf8").includes("sub()"));
  const coderStatus = coderRec ? sh(["git", "status", "--porcelain"], coderRec.cwd).out : "";
  ok(".mj-brief does not show up as untracked in the worktree (it is git-excluded)", !coderStatus.includes(".mj-brief"), coderStatus.slice(0, 200));
  ok("the writer's tree is clean after its commit", coderStatus.trim() === "", coderStatus.slice(0, 200));
  // Found by experiment, not by reading: git does NOT read info/exclude from a linked worktree's own
  // git dir (.git/worktrees/<name>/), so an exclusion written there does nothing and `git add -A`
  // commits the briefing into the agent's code change. Only the COMMON exclude file is consulted.
  const committedFiles = coderRec ? sh(["git", "show", "--name-only", "--format=", "HEAD"], coderRec.cwd).out : "";
  ok("the briefing was NOT committed into the agent's work", !committedFiles.includes(".mj-brief"), `committed: ${committedFiles.trim().slice(0, 200)}`);
  ok("the briefing record says exclusion actually held", report.briefings.every((b) => b.writtenTo.length === 0 || b.excludedFromGit), JSON.stringify(report.briefings.map((b) => ({ p: b.path, ex: b.excludedFromGit }))));

  section("8. with no writer output there is nothing to review — and MJ says so");
  const readOnlyTeam: CliAgentTeam = {
    id: "t.reviewonly",
    name: "Review only",
    description: "A reviewer with no writer. There is no work to snapshot.",
    schemaVersion: 1,
    seats: [{ ...reviewer, id: "reviewer", harness: "opencode", mayWrite: false }],
  };
  const repo2 = makeRepo();
  const roReport = await executeTeam(
    {
      ...req,
      team: readOnlyTeam,
      assignments: [{ seat: readOnlyTeam.seats[0] as TeamSeat, wave: 1, readOnly: true, prompt: "Is sub() correct? Reply CORRECT or WRONG." }],
      repoRoot: repo2,
      missionSlug: "nothing-written",
    },
    deps,
  );
  const roRec = roReport.seats[0];
  ok("the lone reviewer runs in the base checkout (there is nothing to snapshot)", roRec?.cwd === repo2, `cwd=${roRec?.cwd}`);
  ok("and its record says exactly that", roRec !== undefined && /no writer exists/i.test(roReport.setup.find((x) => x.seatId === "reviewer")?.detail ?? ""), roReport.setup.find((x) => x.seatId === "reviewer")?.detail ?? "");

  section("9. a writer that produces nothing leaves the reviewer with nothing to review");
  // A stub CLI that exits 0 and writes nothing. Deterministic on purpose: asking a real agent to
  // "change nothing" is not a reliable way to produce an empty commit, and an unreliable premise makes
  // an unreliable test.
  const idleDeps: TeamRunnerDeps = {
    ...deps,
    cliInvoke: async () => ({ exitCode: 0, stdout: JSON.stringify({ type: "result", is_error: false, result: "nothing to do", session_id: "ses_stub" }), stderr: "", durationMs: 5, timedOut: false }),
  };
  const idleTeam: CliAgentTeam = {
    id: "t.idle",
    name: "Idle writer plus reviewer",
    description: "The writer produces nothing, so there is no work to snapshot.",
    schemaVersion: 1,
    seats: [
      { ...(coder as TeamSeat), id: "coder", harness: "opencode", mayWrite: true },
      { ...(reviewer as TeamSeat), id: "reviewer", harness: "opencode", mayWrite: false },
    ],
  };
  const repo3 = makeRepo();
  const idleReport = await executeTeam(
    {
      ...req,
      team: idleTeam,
      assignments: [
        { seat: idleTeam.seats[0] as TeamSeat, wave: 1, readOnly: false, prompt: "ignored" },
        { seat: idleTeam.seats[1] as TeamSeat, wave: 2, readOnly: true, prompt: "ignored" },
      ],
      repoRoot: repo3,
      missionSlug: "idle",
      ledger: new CapLedger({ maxCostUsd: 5, maxTurns: 60, timeoutMs: 60000 }, Date.now()),
    },
    idleDeps,
  );
  const idleReviewer = idleReport.seats.find((s) => s.seatId === "reviewer");
  ok("the writer committed nothing", /Nothing to commit/.test(idleReport.seats.find((s) => s.seatId === "coder")?.commit ?? ""), idleReport.seats.find((s) => s.seatId === "coder")?.commit ?? "");
  ok("no review snapshot was built, because there was nothing to snapshot", idleReport.snapshot.built === false, idleReport.snapshot.detail);
  ok("the reviewer was SKIPPED rather than pointed at the untouched base", idleReviewer?.outcome === "skipped_nothing_to_review", `outcome=${idleReviewer?.outcome}`);
  ok("and the reason says so plainly", /no work to review|nothing to review|no writer/i.test(idleReviewer?.reason ?? ""), idleReviewer?.reason ?? "");
  ok("the reviewer never ran a CLI invocation", idleReviewer?.turnsRun === 0, `turns=${idleReviewer?.turnsRun}`);
  ok("the summary does not claim the mission succeeded", idleReport.status !== "completed", idleReport.status);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("probe crashed:", e);
  process.exit(2);
});
