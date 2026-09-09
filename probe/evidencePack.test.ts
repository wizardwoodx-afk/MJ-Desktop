/**
 * 11.10.1 — the Evidence Pack (suite #56).
 *
 * Regulators and enterprise buyers do not ask for features; they ask for a bundle. This
 * suite proves buildEvidencePack assembles ONE exportable document that (a) re-verifies
 * every receipt at export time, (b) carries the signed merge attestations, (c) states the
 * control crosswalk and its own disclaimer:
 *
 * §1 an empty vault produces an honest empty pack (manifest says so; no fake receipts)
 * §2 a vault with issued receipts → pack counts match, every receipt re-verified clean,
 *    attestation included, SIEM bundle + one-pager + issuer doc present
 * §3 a LOCALLY TAMPERED stored receipt is FLAGGED inside the pack, never hidden
 * §4 the control mapping is the stated crosswalk and names its artifacts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ReceiptVault } from "../src/mission/receiptVault";
import { buildProofReceipt } from "../src/mission/receipts";
import { buildEvidencePack, evidencePackToJson, EVIDENCE_CONTROL_MAPPINGS } from "../src/mission/evidencePack";
import { buildMergeAttestation, executeMergePlan, type GitResult } from "../src/mission/mergeExecutor";
import { planMerge } from "../src/mission/mergePlan";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { AutonomyRunSummary } from "../src/mission/autonomyRuntime";

const report: AutonomyRunSummary = {
  status: "pass",
  seats: [{ seatId: "s1", role: "coder", outcome: "done", verified: true, harness: "claude-code" }],
  autonomyArms: [],
  reviewedBySnapshot: true,
  gateStatus: "PASS",
  gateTier: "cross-vendor",
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

describe("evidence pack — assembly and honesty", () => {
  it("an empty vault produces an honest empty pack", async () => {
    const vault = new ReceiptVault();
    const pack = await buildEvidencePack({ vault, mjVersion: "11.10.1", edition: "pro", ownedHarnesses: ["claude-code"] });
    assert.equal(pack.format, "mj-evidence-pack/1");
    assert.equal(pack.manifest.receiptsOnFile, 0);
    assert.equal(pack.receipts.length, 0);
    assert.match(pack.manifest.note, /no receipts/i);
    assert.ok(pack.disclaimer.length > 100, "the disclaimer must be real text, not a token");
    assert.match(pack.disclaimer, /NOT a legal opinion|NOT an audit|NOT a claim/i);
    const json = evidencePackToJson(pack);
    assert.ok(JSON.parse(json).format === "mj-evidence-pack/1", "the pack must serialize as JSON");
  });

  it("a vault with receipts + attestation → complete, re-verified pack", async () => {
    const vault = new ReceiptVault();
    const rc1 = await buildProofReceipt({ mission: "m-1", teamId: "t-1", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    const rc2 = await buildProofReceipt({ mission: "m-2", teamId: "t-1", startedAt: "c", finishedAt: "d", mjVersion: "11.10.1", edition: "pro", report });
    const rec1 = vault.issue({ mission: "m-1", teamId: "t-1", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc1 });
    vault.issue({ mission: "m-2", teamId: "t-1", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc2 });

    // A real gated merge, executed against a real repo, attested and attached.
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjep-"));
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
    const res = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false },
      git: (argv) => Promise.resolve(git(repo, argv)),
      mjVersion: "11.10.1",
    });
    assert.equal(res.executed, true);
    const att = await buildMergeAttestation(res, "11.10.1");
    vault.attachMergeAttestation(rec1.id, att);

    const pack = await buildEvidencePack({ vault, mjVersion: "11.10.1", edition: "pro", ownedHarnesses: ["claude-code"] });
    assert.equal(pack.manifest.receiptsOnFile, 2);
    assert.equal(pack.manifest.receiptsValidAtExport, 2, "both receipts must re-verify at export time");
    assert.equal(pack.manifest.receiptsBrokenAtExport.length, 0);
    assert.equal(pack.receipts.length, 2);
    assert.ok(pack.receipts.every((r) => r.validAtExport === true));
    assert.match(pack.receipts[0].receiptJsonl, /mj-proof-receipt\/2/, "pack receipts are the v2 JSONL verbatim");

    assert.equal(pack.manifest.mergeAttestations, 1);
    assert.equal(pack.mergeAttestations.length, 1);
    const packed = pack.mergeAttestations[0].attestation as { mergeCommitSha: string | null };
    assert.equal(packed.mergeCommitSha, res.mergeCommitSha, "the packed attestation carries the merge-commit sha");

    assert.ok(pack.siemBundle.includes("mj.receipt.event"), "SIEM bundle present");
    assert.match(pack.onePager, /Ed25519/);
    assert.match(pack.onePager, /merge-commit sha/i);
    assert.ok(pack.issuerPublicKeyDocument, "issuer public key document must be included");
    assert.ok(pack.controlMappings.length >= 4, "control crosswalk present");
    assert.ok(pack.controlMappings.some((m) => m.control.includes("EU AI Act")));
    assert.ok(pack.controlMappings.some((m) => m.control.includes("ISO/IEC 42001")));
    assert.ok(pack.controlMappings.some((m) => m.control.includes("SOC 2")));
  });

  it("a locally tampered stored receipt is FLAGGED in the pack, never hidden", async () => {
    const vault = new ReceiptVault();
    const rc = await buildProofReceipt({ mission: "m-t", teamId: "t-t", startedAt: "a", finishedAt: "b", mjVersion: "11.10.1", edition: "pro", report });
    vault.issue({ mission: "m-t", teamId: "t-t", gateStatus: "PASS", gateTier: "cross-vendor", receipt: rc });
    // Tamper with the STORED copy, exactly as a hand-edited localStorage would.
    const stored = vault.list()[0];
    assert.ok(stored);
    stored.receipt.events[0].data = { ...(stored.receipt.events[0].data as object), status: "pass-edited-by-attacker" };

    const pack = await buildEvidencePack({ vault, mjVersion: "11.10.1", edition: "pro", ownedHarnesses: ["claude-code"] });
    assert.equal(pack.manifest.receiptsValidAtExport, 0);
    assert.equal(pack.manifest.receiptsBrokenAtExport.length, 1, "the broken receipt must be named");
    assert.equal(pack.receipts[0].validAtExport, false);
    assert.ok(pack.receipts[0].verifyReason, "the reason must be stated");
    assert.match(pack.manifest.note, /FAILED re-verification/i);
  });

  it("the control crosswalk is the stated one and names concrete artifacts", async () => {
    assert.ok(EVIDENCE_CONTROL_MAPPINGS.length >= 4);
    for (const m of EVIDENCE_CONTROL_MAPPINGS) {
      assert.ok(m.artifact.length > 0, `mapping ${m.control} must name an artifact`);
      assert.ok(m.whatMJProvides.length > 0);
    }
    const art12 = EVIDENCE_CONTROL_MAPPINGS.find((m) => m.control.includes("Art. 12"));
    assert.ok(art12, "EU AI Act Art. 12 mapping must exist");
    assert.match(art12!.artifact, /receipts/);
  });
});
