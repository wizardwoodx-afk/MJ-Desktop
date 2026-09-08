/**
 * 11.10.1 — the Merge Executor (suite #55).
 *
 * 11.10's reviewer said it exactly: MJ had a merge AUTHORITY, not a merge engine — "the
 * gate controls whether a merge is permitted" was the honest wording, because nothing ran
 * the plan. This suite proves the loop is closed against a REAL git repository:
 *
 * §1 gate allowed → the plan executes, and the merge-commit sha is recorded and real
 * §2 gate blocked, no override → REFUSED, nothing merged, repo untouched
 * §3 gate blocked + recorded override → executes, and the override is named in the gate record
 * §4 a real conflict is caught at PRE-FLIGHT (merge-tree), before any branch is touched
 * §5 simulated host → planned but never claimed as merged
 * §6 the signed attestation: sha in the payload, signature verifies, tampering detected
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { planMerge } from "../src/mission/mergePlan";
import { executeMergePlan, buildMergeAttestation, verifyMergeAttestation, type GitResult } from "../src/mission/mergeExecutor";

function git(repo: string, argv: string[]): GitResult {
  try {
    const out = execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: String(err.stdout ?? ""), err: String(err.stderr ?? "") };
  }
}

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjmrgx-"));
  fs.writeFileSync(path.join(repo, "app.js"), "module.exports = { v: 1 };\n");
  execFileSync("git", ["init", "-q", "."], { cwd: repo });
  execFileSync("git", ["config", "user.email", "mj@mj.desktop"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "MJ"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: repo });
  return repo;
}

function baseBranch(repo: string): string {
  const r = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return r.out.trim();
}

function branchWithFile(repo: string, base: string, branch: string, file: string, content: string): void {
  git(repo, ["checkout", "-q", base]);
  git(repo, ["checkout", "-q", "-b", branch]);
  fs.writeFileSync(path.join(repo, file), content);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", `${branch} work`]);
}

const PASS_GATE = { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false };
const BLOCK_GATE = { status: "BLOCKED", tier: "unverified", allowed: false, reason: "no cross-harness verification", overrideRequired: true };

describe("merge executor — real git", () => {
  it("gate allowed → executes the plan and records a real merge-commit sha", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    branchWithFile(repo, base, "mj/coder", "feature-a.js", "exports.a = 1;\n");
    branchWithFile(repo, base, "mj/tester", "feature-b.js", "exports.b = 2;\n");
    git(repo, ["checkout", "-q", base]);
    const before = git(repo, ["rev-parse", "HEAD"]).out.trim();

    const plan = planMerge(
      [
        { seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt-a", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 },
        { seatId: "tester", branch: "mj/tester", worktreePath: "/tmp/wt-b", role: "tester", dependsOn: [], verified: true, additions: 1, deletions: 0 },
      ],
      { baseBranch: base, repoRoot: repo, testCommand: ["node", "-e", "process.exit(0)"] },
    );

    const result = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: PASS_GATE,
      git: (argv) => Promise.resolve(git(repo, argv)),
      runRepoCommand: (argv) => Promise.resolve((() => {
        try {
          return { code: 0, out: execFileSync(argv[0], argv.slice(1), { cwd: repo, encoding: "utf8" }), err: "" };
        } catch {
          return { code: 1, out: "", err: "check failed" };
        }
      })()),
      mjVersion: "11.10.1",
    });

    assert.equal(result.executed, true);
    assert.ok(result.mergeCommitSha, "the merge-commit sha must be recorded");
    assert.match(result.mergeCommitSha!, /^[0-9a-f]{40}$/);
    assert.notEqual(result.mergeCommitSha, before, "HEAD must have moved — a merge actually landed");
    assert.equal(result.baseShaBefore, before);
    assert.equal(result.steps.length, 2);
    assert.ok(result.steps.every((s) => s.ok), "every step must report ok");
    assert.equal(result.postMergeCheck.ran, true);
    assert.equal(result.postMergeCheck.ok, true, "the repo's own check ran and passed");
    // The merged files exist on the base branch — the merge was real, not reported.
    assert.ok(fs.existsSync(path.join(repo, "feature-a.js")));
    assert.ok(fs.existsSync(path.join(repo, "feature-b.js")));
    // git log on base contains both merges (no-ff ⇒ merge commits exist).
    const log = git(repo, ["log", "--oneline"]).out;
    assert.match(log, /mj\/coder/);
    assert.match(log, /mj\/tester/);
  });

  it("gate blocked, no override → REFUSED and the repository is untouched", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    branchWithFile(repo, base, "mj/coder", "feature-a.js", "exports.a = 1;\n");
    git(repo, ["checkout", "-q", base]);
    const before = git(repo, ["rev-parse", "HEAD"]).out.trim();

    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo },
    );
    const result = await executeMergePlan({ plan, baseBranch: base, gate: BLOCK_GATE, git: (argv) => Promise.resolve(git(repo, argv)), mjVersion: "11.10.1" });

    assert.equal(result.executed, false);
    assert.match(result.refusedReason ?? "", /REFUSED by the verification gate/);
    assert.equal(result.mergeCommitSha, null);
    assert.equal(git(repo, ["rev-parse", "HEAD"]).out.trim(), before, "HEAD must not move on a refusal");
    assert.equal(fs.existsSync(path.join(repo, "feature-a.js")), false, "nothing from the branch may be on the base");
  });

  it("gate blocked + recorded override → executes, override named in the gate record", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    branchWithFile(repo, base, "mj/coder", "feature-a.js", "exports.a = 1;\n");
    git(repo, ["checkout", "-q", base]);

    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo },
    );
    const result = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: BLOCK_GATE,
      overrideRecorded: { by: "owner", at: new Date().toISOString(), note: "shipping hotfix; gate re-run tomorrow" },
      git: (argv) => Promise.resolve(git(repo, argv)),
      mjVersion: "11.10.1",
    });

    assert.equal(result.executed, true, "a recorded override must allow the merge");
    assert.ok(result.mergeCommitSha);
    assert.equal(result.gate.overrideRecorded, true);
  });

  it("a real conflict is caught at PRE-FLIGHT before any branch is merged", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    // Two branches edit the SAME line ⇒ genuine conflict.
    git(repo, ["checkout", "-q", "-b", "mj/a"]);
    fs.writeFileSync(path.join(repo, "app.js"), "module.exports = { v: 100 };\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "a edits app.js"]);
    git(repo, ["checkout", "-q", base]);
    git(repo, ["checkout", "-q", "-b", "mj/b"]);
    fs.writeFileSync(path.join(repo, "app.js"), "module.exports = { v: 200 };\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "b edits app.js"]);
    git(repo, ["checkout", "-q", base]);
    const before = git(repo, ["rev-parse", "HEAD"]).out.trim();

    const plan = planMerge(
      [
        { seatId: "a", branch: "mj/a", worktreePath: "/tmp/wt-a", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 1 },
        { seatId: "b", branch: "mj/b", worktreePath: "/tmp/wt-b", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 1 },
      ],
      { baseBranch: base, repoRoot: repo },
    );
    assert.ok(plan.preflight.length >= 1, "unordered pairs must be pre-flighted");

    const result = await executeMergePlan({ plan, baseBranch: base, gate: PASS_GATE, git: (argv) => Promise.resolve(git(repo, argv)), mjVersion: "11.10.1" });

    assert.equal(result.executed, false);
    assert.match(result.refusedReason ?? "", /pre-flight/i);
    assert.equal(result.mergeCommitSha, null);
    assert.equal(git(repo, ["rev-parse", "HEAD"]).out.trim(), before, "no merge may have happened after a pre-flight stop");
  });

  it("simulated host → planned but NEVER claimed as merged", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo },
    );
    const result = await executeMergePlan({ plan, baseBranch: base, gate: PASS_GATE, git: (argv) => Promise.resolve(git(repo, argv)), simulated: true, mjVersion: "11.10.1" });
    assert.equal(result.executed, false);
    assert.equal(result.simulated, true);
    assert.match(result.refusedReason ?? "", /no git access/i);
    assert.equal(result.mergeCommitSha, null);
  });
});

describe("merge executor — signed attestation", () => {
  it("attestation carries the merge-commit sha; signature verifies; tampering fails", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    branchWithFile(repo, base, "mj/coder", "feature-a.js", "exports.a = 1;\n");
    git(repo, ["checkout", "-q", base]);

    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo },
    );
    const result = await executeMergePlan({ plan, baseBranch: base, gate: PASS_GATE, git: (argv) => Promise.resolve(git(repo, argv)), mjVersion: "11.10.1" });
    assert.equal(result.executed, true);

    const att = await buildMergeAttestation(result, "11.10.1");
    assert.equal(att.format, "mj-merge-attestation/1");
    assert.equal(att.mergeCommitSha, result.mergeCommitSha, "the attestation must carry the exact sha the executor recorded");
    assert.equal(att.executed, true);
    assert.ok(att.signature, "attestation must be signed on this runtime");
    assert.equal((await verifyMergeAttestation(att)).ok, true);

    const tampered = { ...att, mergeCommitSha: "deadbeef".repeat(5) };
    const v = await verifyMergeAttestation(tampered);
    assert.equal(v.ok, false, "a swapped merge-commit sha must fail signature verification");
  });
});
