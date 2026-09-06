/**
 * Unit tests for the pure decision engine logic & provenance export.
 */
import assert from "node:assert/strict";
import { hashString } from "../src/domain/artifact";
import {
  classifyError,
  detectFailures,
  FAILURE_CLASSES,
  FAILURE_CLASS_LABEL,
  type SupervisorInput,
} from "../src/engine/failureClassifier";
import { fullLadder } from "../src/engine/repair";
import { emptyScorecard, emptyOrgMetrics } from "../src/domain/organization";
import type { AgentSlot, MissionTask, Organization, TaskStatus } from "../src/domain/organization";
import type { PermissionSet } from "../src/domain/types";
import {
  buildProvenanceManifest,
  renderManifest,
  verifyManifest,
  PROVENANCE_MANIFEST_VERSION,
} from "../src/engine/provenanceExport";
import type { Artifact } from "../src/domain/artifact";

console.log("\n== 1. Hashing Parity ==");
assert.equal(hashString(""), "811c9dc5");
assert.equal(hashString("abc"), "1a47e90b");
assert.equal(hashString("hello world"), "d58b3fa7");
assert.equal(hashString("genesis|{seq:1}"), "054da6b1");
assert.equal(hashString("café — naïve ✓ 日本語"), "0f93cefc");
console.log("  ok   hashString matches UTF-8 FNV-1a vectors pinned in Rust");

console.log("\n== 2. MAST Error Classification ==");
assert.equal(classifyError("claude: command not found", 3), "HARNESS_UNAVAILABLE");
assert.equal(classifyError("401 unauthorized", 1), "HARNESS_UNAVAILABLE");
assert.equal(classifyError("permission denied", 1), "PERMISSION_DENIAL");
assert.equal(classifyError("request timed out", 1), "UNKNOWN");
assert.equal(classifyError("request timed out", 2), "TIMEOUT_LOOP");
assert.equal(classifyError("tool failed: write_file", 2), "TOOL_FAILURE_LOOP");
assert.equal(classifyError("budget ceiling exhausted", 4), "BUDGET_EXHAUSTION");
assert.equal(classifyError("something odd", 5), "REPEATED_FAILURE");
console.log("  ok   classifyError correctly tags failure loops and harness unavailability");

console.log("\n== 3. MAST Step Repetition & Premature Termination ==");
const repeatedTask: MissionTask = {
  id: "task-1",
  orgId: "org-test",
  missionId: "mis-test",
  phaseId: "phase-1",
  title: "Task 1",
  instruction: "test",
  assigneeId: "slot-1",
  assigneeHistory: ["slot-1"],
  status: "RUNNING",
  parallelism: "SEQUENTIAL",
  dependsOn: [],
  inputs: [],
  outputs: [],
  riskClass: "MEDIUM",
  attempts: 2,
  maxAttempts: 3,
  attemptHashes: [hashString("first"), hashString("same"), hashString("same")],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const testOrg: Organization = {
  id: "org-test",
  missionId: "mis-test",
  charterId: "c-1",
  frameworkId: "f-1",
  topology: "hierarchical",
  candidatePool: [],
  active: [],
  teams: [],
  phases: [],
  tasks: [repeatedTask],
  blackboardKey: "bb",
  constitutionId: "con",
  generation: 0,
  metrics: emptyOrgMetrics(),
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sigs = detectFailures({
  org: testOrg,
  busySlotIds: [],
  lastOutputAgoMs: {},
  toolErrors: {},
  invalidArtifactIds: [],
  regressions: [],
  conflictingTopics: [],
  budgetUtilization: 0.1,
  deadlockedTaskIds: [],
});

assert(sigs.some((s) => s.class === "STEP_REPETITION"), "STEP_REPETITION detected on repeated hash");
console.log("  ok   detects MAST step repetition on consecutive identical output hashes");

console.log("\n== 4. Repair Ladder Invariants ==");
for (const c of FAILURE_CLASSES) {
  const ladder = fullLadder(c);
  assert(ladder.length > 0, `${c} ladder is non-empty`);
  assert(ladder[0] !== "RETRY_SAME", `${c} does not lead with blind retry`);
  assert.equal(ladder[ladder.length - 1], "ESCALATE_HUMAN", `${c} terminates at human escalation`);
}
console.log("  ok   all repair ladders enforce non-blind progression and human escalation termination");

console.log("\n== 5. Machine-Readable Provenance Manifest (EU AI Act Art. 50) ==");
const art1: Artifact = {
  id: "art-1",
  missionId: "mis-test",
  orgId: "org-test",
  lineageId: "lin-1",
  version: 1,
  name: "Art 1",
  contentType: "TEXT",
  content: "hello world",
  contentHash: hashString("hello world"),
  createdBy: "slot-1",
  modifiedBy: ["slot-1"],
  inputs: [],
  parentArtifacts: [],
  toolsUsed: ["write_file"],
  modelsUsed: ["claude-3-7-sonnet"],
  harnessUsed: "claude",
  costUsd: 0.01,
  latencyMs: 100,
  approvalState: "APPROVED",
  riskClass: "MEDIUM",
  provenance: "test",
  createdAt: "2026-01-01T00:00:00.000Z",
  tags: [],
};

const manifest = buildProvenanceManifest([art1], { "art-1": art1 }, {
  missionId: "mis-test",
  generator: { name: "MJ Desktop", version: "11.1.0", harnesses: ["claude"] },
  ledger: { head: "abc123", entries: 1, verified: true },
  generatedAt: "2026-08-31T00:00:00.000Z",
});

assert.equal(manifest.syntheticContent, true);
assert.equal(manifest.manifestVersion, PROVENANCE_MANIFEST_VERSION);
const verifyRes = verifyManifest(manifest);
assert.equal(verifyRes.ok, true, "manifest verifies clean");
console.log("  ok   provenance manifest verifies clean and declares synthetic content under Art. 50");
