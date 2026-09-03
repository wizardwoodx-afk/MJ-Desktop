import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/unit.test.ts
import assert from "node:assert/strict";

// src/domain/artifact.ts
function hashString(str) {
  let bytes;
  if (typeof Buffer !== "undefined") {
    bytes = Buffer.from(str, "utf8");
  } else {
    bytes = new TextEncoder().encode(str);
  }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// src/engine/failureClassifier.ts
var FAILURE_CLASSES = [
  "HARNESS_UNAVAILABLE",
  "PERMISSION_DENIAL",
  "TIMEOUT_LOOP",
  "TOOL_FAILURE_LOOP",
  "BUDGET_EXHAUSTION",
  "REPEATED_FAILURE",
  "STEP_REPETITION",
  "PREMATURE_TERMINATION",
  "AGENT_STARVATION",
  "REGRESSION",
  "DEADLOCK",
  "SCHEMA_VIOLATION",
  "UNKNOWN"
];
function classifyError(errorMsg, attempts = 1) {
  const lower = (errorMsg || "").toLowerCase();
  if (lower.includes("command not found") || lower.includes("401 unauthorized") || lower.includes("not installed")) {
    return "HARNESS_UNAVAILABLE";
  }
  if (lower.includes("permission denied") || lower.includes("eacces") || lower.includes("unauthorized access")) {
    return "PERMISSION_DENIAL";
  }
  if (lower.includes("budget ceiling exhausted") || lower.includes("budget limit")) {
    return "BUDGET_EXHAUSTION";
  }
  if (lower.includes("tool failed")) {
    return attempts >= 2 ? "TOOL_FAILURE_LOOP" : "UNKNOWN";
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return attempts >= 2 ? "TIMEOUT_LOOP" : "UNKNOWN";
  }
  if (attempts >= 5) {
    return "REPEATED_FAILURE";
  }
  return "UNKNOWN";
}
function detectFailures(input) {
  const signals = [];
  for (const task of input.org.tasks) {
    if (task.attemptHashes && task.attemptHashes.length >= 2) {
      const len = task.attemptHashes.length;
      if (task.attemptHashes[len - 1] === task.attemptHashes[len - 2]) {
        signals.push({
          id: `sig-${Date.now()}-${signals.length}`,
          class: "STEP_REPETITION",
          severity: "ERROR",
          subjectId: task.id,
          message: `Task ${task.id} repeated its exact output across consecutive attempts.`
        });
      }
    }
    if (task.status === "COMPLETED" && (!task.outputs || task.outputs.length === 0)) {
      signals.push({
        id: `sig-${Date.now()}-${signals.length}`,
        class: "PREMATURE_TERMINATION",
        severity: "WARN",
        subjectId: task.id,
        message: `Task ${task.id} terminated with COMPLETED status without generating any output artifacts.`
      });
    }
  }
  return signals;
}

// src/engine/repair.ts
function fullLadder(failureClass) {
  switch (failureClass) {
    case "STEP_REPETITION":
      return ["MODIFY_CONTEXT", "REASSIGN_AGENT", "SPLIT_TASK", "ESCALATE_HUMAN"];
    case "PREMATURE_TERMINATION":
      return ["ADD_VERIFIER", "MODIFY_CONTEXT", "REASSIGN_AGENT", "ESCALATE_HUMAN"];
    case "HARNESS_UNAVAILABLE":
      return ["SWITCH_HARNESS", "REASSIGN_AGENT", "ESCALATE_HUMAN"];
    case "PERMISSION_DENIAL":
      return ["MODIFY_CONTEXT", "ESCALATE_HUMAN"];
    case "TIMEOUT_LOOP":
      return ["MODIFY_CONTEXT", "SPLIT_TASK", "SWITCH_HARNESS", "ESCALATE_HUMAN"];
    case "TOOL_FAILURE_LOOP":
      return ["MODIFY_CONTEXT", "REASSIGN_AGENT", "ESCALATE_HUMAN"];
    case "BUDGET_EXHAUSTION":
      return ["INCREASE_BUDGET", "ESCALATE_HUMAN"];
    case "REPEATED_FAILURE":
      return ["MODIFY_CONTEXT", "REASSIGN_AGENT", "SPLIT_TASK", "ESCALATE_HUMAN"];
    case "AGENT_STARVATION":
      return ["REASSIGN_AGENT", "MODIFY_CONTEXT", "ESCALATE_HUMAN"];
    case "REGRESSION":
      return ["ADD_VERIFIER", "MODIFY_CONTEXT", "REASSIGN_AGENT", "ESCALATE_HUMAN"];
    case "DEADLOCK":
      return ["SPLIT_TASK", "MODIFY_CONTEXT", "ESCALATE_HUMAN"];
    case "SCHEMA_VIOLATION":
      return ["MODIFY_CONTEXT", "ADD_VERIFIER", "ESCALATE_HUMAN"];
    case "UNKNOWN":
    default:
      return ["MODIFY_CONTEXT", "REASSIGN_AGENT", "ESCALATE_HUMAN"];
  }
}

// src/domain/organization.ts
function emptyOrgMetrics() {
  return {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    totalCostUsd: 0,
    wallClockMs: 0
  };
}

// src/engine/provenanceExport.ts
var PROVENANCE_MANIFEST_VERSION = "1.0.0";
function computeManifestBodyHash(manifest2) {
  const normalized = JSON.stringify({
    manifestVersion: manifest2.manifestVersion,
    missionId: manifest2.missionId,
    orgId: manifest2.orgId,
    syntheticContent: manifest2.syntheticContent,
    generatedAt: manifest2.generatedAt,
    generator: manifest2.generator,
    ledger: manifest2.ledger,
    claims: manifest2.claims
  });
  return hashString(normalized);
}
function buildProvenanceManifest(artifacts, byId, meta) {
  const claims = artifacts.map((a) => {
    const derivedFrom = (a.parentArtifacts || []).map((parentId) => {
      const parent = byId[parentId];
      return {
        artifactId: parentId,
        contentHash: parent ? parent.contentHash : "unknown"
      };
    });
    return {
      artifactId: a.id,
      name: a.name,
      contentHash: a.contentHash,
      synthetic: true,
      derivedFrom,
      toolsUsed: a.toolsUsed || [],
      modelsUsed: a.modelsUsed || [],
      harnessUsed: a.harnessUsed || "",
      riskClass: a.riskClass || "LOW"
    };
  });
  const partial = {
    manifestVersion: PROVENANCE_MANIFEST_VERSION,
    missionId: meta.missionId,
    orgId: meta.orgId,
    syntheticContent: true,
    generatedAt: meta.generatedAt,
    generator: meta.generator,
    ledger: meta.ledger,
    claims
  };
  const manifestHash = computeManifestBodyHash(partial);
  return {
    ...partial,
    manifestHash
  };
}
function verifyManifest(manifest2, liveArtifactsById) {
  const problems = [];
  const { manifestHash, ...body } = manifest2;
  const expectedHash = computeManifestBodyHash(body);
  if (manifestHash !== expectedHash) {
    problems.push(`Manifest hash mismatch: expected ${expectedHash}, got ${manifestHash}`);
  }
  if (!manifest2.ledger.verified) {
    problems.push(`Underlying mission flight ledger integrity check failed (broken at entry ${manifest2.ledger.brokenAt ?? "unknown"})`);
  }
  if (liveArtifactsById) {
    for (const claim of manifest2.claims) {
      const live = liveArtifactsById[claim.artifactId];
      if (live && live.contentHash !== claim.contentHash) {
        problems.push(`Artifact ${claim.artifactId} (${claim.name}) content changed since manifest was signed (drift detected)`);
      }
    }
  }
  return {
    ok: problems.length === 0,
    claims: manifest2.claims.length,
    problems
  };
}

// probe/unit.test.ts
console.log("\n== 1. Hashing Parity ==");
assert.equal(hashString(""), "811c9dc5");
assert.equal(hashString("abc"), "1a47e90b");
assert.equal(hashString("hello world"), "d58b3fa7");
assert.equal(hashString("genesis|{seq:1}"), "054da6b1");
assert.equal(hashString("caf\xE9 \u2014 na\xEFve \u2713 \u65E5\u672C\u8A9E"), "0f93cefc");
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
var repeatedTask = {
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
  updatedAt: "2026-01-01T00:00:00.000Z"
};
var testOrg = {
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
  updatedAt: "2026-01-01T00:00:00.000Z"
};
var sigs = detectFailures({
  org: testOrg,
  busySlotIds: [],
  lastOutputAgoMs: {},
  toolErrors: {},
  invalidArtifactIds: [],
  regressions: [],
  conflictingTopics: [],
  budgetUtilization: 0.1,
  deadlockedTaskIds: []
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
var art1 = {
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
  tags: []
};
var manifest = buildProvenanceManifest([art1], { "art-1": art1 }, {
  missionId: "mis-test",
  generator: { name: "MJ Desktop", version: "11.1.0", harnesses: ["claude"] },
  ledger: { head: "abc123", entries: 1, verified: true },
  generatedAt: "2026-08-31T00:00:00.000Z"
});
assert.equal(manifest.syntheticContent, true);
assert.equal(manifest.manifestVersion, PROVENANCE_MANIFEST_VERSION);
var verifyRes = verifyManifest(manifest);
assert.equal(verifyRes.ok, true, "manifest verifies clean");
console.log("  ok   provenance manifest verifies clean and declares synthetic content under Art. 50");
