/**
 * 11.10.5 — Verified AI Delivery V1: commit-bound provenance statements (suite #57).
 *
 * The vertical gap: SOC 2 CC8.1 / SOX 404 attestations assume a human authored what they
 * approved; SLSA v1.2 and NIST SP 800-218A have no AI-authorship category. MJ answers from
 * the layer that runs the agents: an in-toto-shaped, issuer-SIGNED statement whose subject
 * IS the merge commit and whose predicate names the AI authorship + the independent
 * verification it passed. Proved here against a REAL git repository:
 *
 * §1 an executed merge yields a statement whose subject digest is the REAL merge-commit sha
 * §2 materials carry harness + the deterministic seat identity digest, gate evidence bound
 * §3 the statement's Ed25519 signature verifies; a tampered predicate does NOT
 * §4 a simulated/refused merge yields NO statement — provenance exists only for what happened
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { planMerge } from "../src/mission/mergePlan";
import { executeMergePlan, type GitResult } from "../src/mission/mergeExecutor";
import { buildProvenanceStatement, verifyProvenanceStatement, MJ_PROVENANCE_PREDICATE_TYPE } from "../src/mission/provenance";
import type { GateVerdict } from "../src/mission/verifyGate";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function git(repo: string, argv: string[]): GitResult {
  try {
    const out = execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: String(err.stdout ?? ""), err: String(err.stderr ?? "") };
  }
}

function makeRepoWithBranch(): { repo: string; base: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjprov-"));
  fs.writeFileSync(path.join(repo, "app.js"), "1\n");
  execFileSync("git", ["init", "-q", "."], { cwd: repo });
  execFileSync("git", ["config", "user.email", "mj@mj.desktop"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "MJ"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: repo });
  const base = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).out.trim();
  git(repo, ["checkout", "-q", "-b", "mj/coder"]);
  fs.writeFileSync(path.join(repo, "feature.js"), "2\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "feature"]);
  git(repo, ["checkout", "-q", base]);
  return { repo, base };
}

const PASS_GATE: GateVerdict = {
  status: "PASS",
  tier: "cross-vendor",
  reasons: [],
  policy: "STRICT",
  crossVerified: true,
  evidence: {
    snapshotBuilt: true,
    snapshotSha: "abc123".padEnd(40, "0"),
    snapshotRef: "mj/review/snapshot",
    writerBranches: ["mj/coder"],
    reviewedBy: [{ seatId: "reviewer", harness: "codex", reviewedSha: "abc123".padEnd(40, "0"), matchesSnapshot: true }],
  },
};

describe("provenance statements — commit-bound AI authorship", () => {
  it("an executed merge yields a statement whose subject IS the real merge-commit sha", async () => {
    const { repo, base } = makeRepoWithBranch();
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo },
    );
    const merge = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false },
      git: (argv) => Promise.resolve(git(repo, argv)),
      mjVersion: "11.10.5",
    });
    assert.equal(merge.executed, true);

    const st = await buildProvenanceStatement({
      mission: "mission-prov",
      teamId: "team-prov",
      mjVersion: "11.10.5",
      candidates: [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      gate: PASS_GATE,
      merge,
      harnessBySeat: { coder: "claude-code", reviewer: "codex" },
    });
    assert.ok(st, "an executed merge must yield a statement");
    assert.equal(st._type, "https://in-toto.io/Statement/v1");
    assert.equal(st.predicateType, MJ_PROVENANCE_PREDICATE_TYPE);
    assert.equal(st.subject.length, 1);
    assert.equal(st.subject[0].digest.gitCommit, merge.mergeCommitSha, "the subject digest must be the REAL merge-commit sha");
    // And that sha must really be HEAD of the base branch in the repo.
    assert.equal(git(repo, ["rev-parse", base]).out.trim(), merge.mergeCommitSha);
    assert.equal(st.predicate.builder.id, "vouch-harbor@11.10.5");
    assert.equal(st.predicate.merge.mergeCommitSha, merge.mergeCommitSha);
    assert.equal(st.predicate.verification.gateTier, "cross-vendor");
    assert.equal(st.predicate.verification.snapshotSha, PASS_GATE.evidence?.snapshotSha);
  });

  it("materials name the AI authorship: harness + deterministic identity digest", async () => {
    const { repo, base } = makeRepoWithBranch();
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo },
    );
    const merge = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false },
      git: (argv) => Promise.resolve(git(repo, argv)),
      mjVersion: "11.10.5",
    });
    const st = await buildProvenanceStatement({
      mission: "m",
      teamId: "t",
      mjVersion: "11.10.5",
      candidates: [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      gate: PASS_GATE,
      merge,
      harnessBySeat: { coder: "claude-code" },
    });
    assert.ok(st);
    assert.equal(st.predicate.materials.length, 1);
    const m = st.predicate.materials[0];
    assert.equal(m.harness, "claude-code");
    assert.equal(m.identity, sha256("coder|coder|claude-code"), "identity must be the exact digest — chain-consistent with receipts");
    assert.equal(m.verified, true);
    assert.equal(st.predicate.verification.reviewers[0].harness, "codex");
    assert.equal(st.predicate.verification.reviewers[0].matchesSnapshot, true);
  });

  it("the statement is Ed25519-signed; a tampered predicate fails verification", async () => {
    const { repo, base } = makeRepoWithBranch();
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo },
    );
    const merge = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false },
      git: (argv) => Promise.resolve(git(repo, argv)),
      mjVersion: "11.10.5",
    });
    const st = await buildProvenanceStatement({
      mission: "m",
      teamId: "t",
      mjVersion: "11.10.5",
      candidates: [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      gate: PASS_GATE,
      merge,
      harnessBySeat: { coder: "claude-code" },
    });
    assert.ok(st);
    assert.match(st.signature ?? "", /^[0-9a-f]{128}$/);
    assert.equal((await verifyProvenanceStatement(st)).ok, true);

    // Attacker swaps the merge-commit sha to launder a different commit's authorship.
    const laundered = { ...st, subject: [{ name: st.subject[0].name, digest: { gitCommit: "deadbeef".repeat(5) } }] };
    const v = await verifyProvenanceStatement(laundered);
    assert.equal(v.ok, false, "a laundered subject must fail signature verification");
  });

  it("a simulated or refused merge yields NO statement — provenance is only for what happened", async () => {
    const { repo, base } = makeRepoWithBranch();
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo },
    );
    const simulated = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false },
      git: (argv) => Promise.resolve(git(repo, argv)),
      simulated: true,
      mjVersion: "11.10.5",
    });
    assert.equal(simulated.executed, false);
    const st = await buildProvenanceStatement({
      mission: "m",
      teamId: "t",
      mjVersion: "11.10.5",
      candidates: [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      gate: PASS_GATE,
      merge: simulated,
      harnessBySeat: { coder: "claude-code" },
    });
    assert.equal(st, null, "no provenance may exist for a merge that did not happen");
  });
});
