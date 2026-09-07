/**
 * 11.10.5 — Verified AI Delivery V1: deployer retention + the upgraded pack (suite #59).
 *
 * EU AI Act Art. 26(6): deployers keep automated logs for AT LEAST six months. MJ's
 * localStorage vault cannot guarantee storage, so it does the honest thing: a declared
 * retention floor that records and exports honor and NAME. Proven here:
 *
 * §1 the floor defaults to 6 months and only accepts declared options
 * §2 retentionStatus computes the floor honestly (satisfied only when time has passed)
 * §3 the evidence pack carries the floor, the AIBOM and the provenance statements
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  loadRetentionPolicy,
  saveRetentionPolicy,
  retentionStatus,
  RETENTION_DEFAULT_MONTHS,
} from "../src/mission/receiptVault";
import { buildEvidencePack } from "../src/mission/evidencePack";
import { ReceiptVault } from "../src/mission/receiptVault";
import { buildProofReceipt } from "../src/mission/receipts";
import { buildMergeAttestation, executeMergePlan, type GitResult } from "../src/mission/mergeExecutor";
import { buildProvenanceStatement } from "../src/mission/provenance";
import { planMerge } from "../src/mission/mergePlan";
import type { GateVerdict } from "../src/mission/verifyGate";
import type { AutonomyRunSummary } from "../src/mission/autonomyRuntime";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const report: AutonomyRunSummary = {
  status: "pass",
  seats: [{ seatId: "coder", role: "coder", outcome: "done", verified: true, harness: "claude-code" }],
  autonomyArms: [],
  reviewedBySnapshot: true,
  gateStatus: "PASS",
  gateTier: "cross-vendor",
};

const PASS_GATE: GateVerdict = {
  status: "PASS",
  tier: "cross-vendor",
  reasons: [],
  policy: "STRICT",
  crossVerified: true,
  evidence: null,
};

function git(repo: string, argv: string[]): GitResult {
  try {
    const out = execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: String(err.stdout ?? ""), err: String(err.stderr ?? "") };
  }
}

describe("retention policy — the honest floor", () => {
  // localStorage does not exist under node — install it for this suite (same recipe as
  // agentTeam.test.ts). Hooks, not module top level: under the test runner the callback
  // realm is what matters.
  const store = new Map<string, string>();
  before(() => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
    };
  });
  after(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });
  it("defaults to 6 months and round-trips only declared options", async () => {
    assert.equal(RETENTION_DEFAULT_MONTHS, 6);
    assert.equal(loadRetentionPolicy(), 6, "with nothing stored the floor is the Art. 26 minimum");
    saveRetentionPolicy(12);
    assert.equal(loadRetentionPolicy(), 12);
    saveRetentionPolicy(7); // not a declared option — must be ignored
    assert.equal(loadRetentionPolicy(), 12);
    saveRetentionPolicy(6); // restore
  });

  it("retentionStatus is honest: a fresh record is required, an old one is satisfied", async () => {
    const now = new Date();
    const fresh = retentionStatus(now.toISOString(), 6);
    assert.equal(fresh.satisfied, false, "a record issued now cannot already satisfy a 6-month floor");
    const old = new Date(now);
    old.setUTCMonth(old.getUTCMonth() - 7);
    const aged = retentionStatus(old.toISOString(), 6);
    assert.equal(aged.satisfied, true);
    assert.ok(aged.until > old.toISOString(), "the 'until' date must sit after issue time");
  });
});

describe("evidence pack — the deployer bundle grows up", () => {
  it("carries the retention floor, the AIBOM and the provenance statements", async () => {
    const vault = new ReceiptVault();
    const rc = await buildProofReceipt({ mission: "m-r", teamId: "t-r", startedAt: "a", finishedAt: "b", mjVersion: "11.10.5", edition: "pro", report });
    const rec = vault.issue({ mission: "m-r", teamId: "t-r", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc });

    // A real gated merge → attestation + provenance, attached to the record.
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjret-"));
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
    vault.attachMergeAttestation(rec.id, await buildMergeAttestation(merge, "11.10.5"));
    const prov = await buildProvenanceStatement({
      mission: "m-r",
      teamId: "t-r",
      mjVersion: "11.10.5",
      candidates: [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      gate: PASS_GATE,
      merge,
      harnessBySeat: { coder: "claude-code" },
    });
    assert.ok(prov);
    vault.attachProvenance(rec.id, prov);

    const pack = await buildEvidencePack({ vault, mjVersion: "11.10.5", edition: "pro", ownedHarnesses: ["claude-code"] });
    assert.equal(pack.manifest.retentionMonths, loadRetentionPolicy(), "the pack must NAME the declared floor");
    assert.ok(pack.manifest.retentionMonths >= 6, "the floor cannot be below the Art. 26 minimum");
    assert.equal(pack.manifest.provenanceStatements, 1);
    assert.equal(pack.provenanceStatements.length, 1);
    assert.equal(pack.provenanceStatements[0].statement.subject[0].digest.gitCommit, merge.mergeCommitSha);
    assert.equal(pack.aibom.entries.length, 1);
    assert.equal(pack.aibom.entries[0].component, "claude-code");
    assert.equal(pack.aibom.entries[0].approvalStatus, "approved");
    // The new control mappings name the AI-authorship gap explicitly.
    assert.ok(pack.controlMappings.some((m) => m.control.includes("SOX 404")));
    assert.ok(pack.controlMappings.some((m) => m.control.includes("NIST SP 800-218A")));
    assert.ok(pack.controlMappings.length >= 6);
  });
});

