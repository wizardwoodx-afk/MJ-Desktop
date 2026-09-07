/**
 * 11.10 — the gate owns the merge path (suite #53).
 *
 * 11.9.9 shipped the adversarial gate as a post-run authority; the 9.8/10 review named the
 * two gaps: it was not tied to the merge path, and it did not carry the reviewed-snapshot
 * evidence. This suite runs a REAL executeTeam() over a real git repository with stubbed
 * CLIs and proves both gaps are closed:
 *
 * §1 STRICT + cross-harness review → gate PASS, evidence bound to the snapshot sha, merge ALLOWED
 * §2 STRICT + same-harness "review" → gate BLOCKED, merge BLOCKED, override required
 * §3 ADVISORY + same-harness "review" → gate FAILs, but merge stays allowed (with the reason)
 * §4 the verdict's evidence names the snapshot and who provably reviewed it
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { executeTeam, type TeamRunRequest, type TeamRunnerDeps } from "../src/mission/teamExecutor";
import type { CliAgentTeam, TeamSeat } from "../src/mission/agentTeam";
import { CapLedger } from "../src/mission/caps";

function sh(args: string[], cwd: string): { code: number | null; out: string } {
  try {
    const out = execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function makeRepo(): { repo: string; branch: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjgate-"));
  fs.writeFileSync(path.join(repo, "app.js"), "module.exports = { v: 1 };\n");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "gate-fixture", version: "1.0.0" }, null, 2));
  sh(["git", "init", "-q", "."], repo);
  sh(["git", "config", "user.email", "mj@mj.desktop"], repo);
  sh(["git", "config", "user.name", "MJ"], repo);
  sh(["git", "add", "-A"], repo);
  sh(["git", "commit", "-qm", "initial"], repo);
  const branch = sh(["git", "symbolic-ref", "--short", "HEAD"], repo).out.trim() || "master";
  return { repo, branch };
}

const seat = (id: string, role: "coder" | "reviewer", harness: TeamSeat["harness"]): TeamSeat => ({
  id,
  role,
  harness,
  model: null,
  mayWrite: role === "coder",
  maxRisk: role === "coder" ? "MEDIUM" : "LOW",
  timeoutSecs: 120,
  maxTurns: 2,
  instructions: role === "coder" ? "Implement the change." : "Review the diff against the snapshot.",
});

function request(repo: string, branch: string, team: CliAgentTeam, over: Partial<TeamRunRequest> = {}): TeamRunRequest {
  return {
    team,
    assignments: team.seats.map((s) => ({
      seat: s,
      prompt: `Objective for ${s.role}.`,
      wave: s.role === "coder" ? 1 : 2,
      readOnly: s.role !== "coder",
    })),
    repoRoot: repo,
    baseBranch: branch,
    missionSlug: `gate-${Math.random().toString(36).slice(2, 8)}`,
    objective: "Gate enforcement fixture.",
    ledger: new CapLedger({ maxCostUsd: 5, maxTurns: 10, timeoutMs: 60_000 }, Date.now()),
    testCommand: ["node", "-e", "process.exit(0)"],
    ...over,
  };
}

/** Stubbed CLIs: the writer actually edits its worktree; the reviewer approves. */
function deps(): TeamRunnerDeps {
  return {
    resolveBin: async (bin) => `/usr/local/bin/${bin}`,
    cliInvoke: async (req) => {
      const isWriter = req.argv.includes("acceptEdits") || req.argv.includes("workspace-write") || req.argv.includes("--yes");
      if (isWriter) {
        fs.writeFileSync(path.join(req.cwd, "feature.js"), "module.exports = { feature: true };\n");
        fs.writeFileSync(path.join(req.cwd, "app.js"), "module.exports = { v: 2 };\n");
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({ type: "result", is_error: false, result: isWriter ? "Implemented." : "CORRECT: reviewed against snapshot.", total_cost_usd: 0.01, usage: { input_tokens: 100, output_tokens: 40 } }),
        stderr: "",
        durationMs: 5,
        timedOut: false,
      };
    },
    git: async (args, cwd) => {
      const r = sh(["git", ...args], cwd);
      return { ok: r.code === 0, stdout: r.out, stderr: "", exitCode: r.code, reason: null };
    },
    writeFile: async (p, contents) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, contents);
    },
    verify: async (cwd) => {
      const r = sh(["node", "-e", "process.exit(0)"], cwd);
      return { exitCode: r.code ?? 0, stdout: r.out, stderr: "", durationMs: 3, timedOut: false };
    },
  };
}

const crossTeam = (reviewHarness: TeamSeat["harness"]): CliAgentTeam => ({
  id: `t.gate.${String(reviewHarness)}`,
  name: "Gate fixture",
  description: "writer + reviewer",
  schemaVersion: 1,
  seats: [seat("impl", "coder", "claude"), seat("reviewer", "reviewer", reviewHarness)],
});

describe("merge gate — STRICT enforcement inside the runtime", () => {
  it("cross-harness review PASSES, binds evidence to the snapshot sha, and allows the merge", async () => {
    const { repo, branch } = makeRepo();
    const report = await executeTeam(request(repo, branch, crossTeam("codex"), { gatePolicy: "STRICT" }), deps());
    assert.equal(report.status, "completed");
    assert.equal(report.gate.status, "PASS");
    assert.equal(report.gate.tier, "cross-vendor");
    // Evidence: the verdict stands on a real snapshot sha, and the reviewer provably saw it.
    assert.ok(report.gate.evidence, "verdict carries evidence");
    assert.ok(report.gate.evidence?.snapshotBuilt);
    assert.ok(report.gate.evidence?.snapshotSha);
    const rev = report.gate.evidence?.reviewedBy.find((r) => r.seatId === "reviewer");
    assert.ok(rev, "reviewer appears in the evidence");
    assert.equal(rev?.matchesSnapshot, true);
    assert.equal(rev?.reviewedSha, report.snapshot.sha);
    // The merge path consults the gate: PASS → allowed.
    assert.equal(report.merge.gate.allowed, true);
    assert.equal(report.merge.gate.overrideRequired, false);
    assert.ok(report.merge.candidates.length >= 1, "writer produced a merge candidate");
  });

  it("same-harness 'review' is BLOCKED and the merge with it (STRICT)", async () => {
    const { repo, branch } = makeRepo();
    const report = await executeTeam(request(repo, branch, crossTeam("claude"), { gatePolicy: "STRICT" }), deps());
    assert.equal(report.gate.status, "BLOCKED");
    assert.equal(report.gate.tier, "self-verification");
    assert.equal(report.gate.crossVerified, false);
    assert.equal(report.merge.gate.allowed, false, "the gate blocks the merge path");
    assert.equal(report.merge.gate.overrideRequired, true, "only a recorded human override can unlock it");
    assert.match(report.merge.gate.reason, /STRICT/);
  });

  it("ADVISORY keeps the merge open but records the failure in the merge reason", async () => {
    const { repo, branch } = makeRepo();
    const report = await executeTeam(request(repo, branch, crossTeam("claude"), { gatePolicy: "ADVISORY" }), deps());
    assert.equal(report.gate.status, "FAIL", "self-verification is still a failure, never silent");
    assert.equal(report.merge.gate.allowed, true);
    assert.equal(report.merge.gate.overrideRequired, false);
    assert.match(report.merge.gate.reason, /ADVISORY/);
  });

  it("a rejecting verifier fails the gate and blocks the merge even cross-harness", async () => {
    const { repo, branch } = makeRepo();
    let calls = 0;
    const d: TeamRunnerDeps = {
      ...deps(),
      cliInvoke: async (req) => {
        calls += 1;
        const isWriter = req.argv.includes("acceptEdits") || req.argv.includes("workspace-write") || req.argv.includes("--yes");
        if (isWriter) fs.writeFileSync(path.join(req.cwd, "feature.js"), "module.exports = { feature: true };\n");
        // The reviewer (second wave) fails its run → measured rejection.
        return { exitCode: isWriter ? 0 : 1, stdout: "", stderr: isWriter ? "" : "review failed", durationMs: 4, timedOut: false };
      },
    };
    const report = await executeTeam(request(repo, branch, crossTeam("codex"), { gatePolicy: "STRICT" }), d);
    assert.ok(calls >= 2);
    assert.equal(report.gate.status, "FAIL");
    assert.equal(report.merge.gate.allowed, false);
    assert.match(report.gate.reasons.join("\n"), /rejected/);
  });
});
