/**
 * MJ 6.0 — unit tests for the pure engine logic.
 *
 * `npm run accept` drives one whole mission end to end and asserts the twenty
 * observable behaviours of §39. What it cannot do is pin down the *pure* decision
 * functions: given this exact state, does the supervisor classify it this way?
 * Those are the functions most worth testing, because they are the ones a wrong
 * refactor would silently change — the mission would still "finish", just for
 * worse reasons.
 *
 * Deliberately dependency-free: no test framework, no globals, no snapshots.
 * Exit code 1 on the first failure so it can gate a build.
 */
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
import type {
  AgentSlot,
  MissionTask,
  Organization,
  TaskStatus,
} from "../src/domain/organization";
import type { PermissionSet } from "../src/domain/types";
import {
  buildProvenanceManifest,
  renderManifest,
  verifyManifest,
  PROVENANCE_MANIFEST_VERSION,
} from "../src/engine/provenanceExport";
import type { Artifact } from "../src/domain/artifact";

// ── micro harness ────────────────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${name}: ${msg}`);
    console.log(`  FAIL  ${name}\n          ${msg}`);
  }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function eq<T>(actual: T, expected: T, msg = "value"): void {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── builders ─────────────────────────────────────────────────────────────────

function permissions(): PermissionSet {
  const off: PermissionSet = {
    filesystemRead: false, filesystemWrite: false, terminalExecute: false,
    networkAccess: false, browserControl: false, mcpUse: false,
    providerExecute: false, workflowModify: false, memoryWrite: false,
    skillWrite: false, evolutionPropose: false, evolutionAccept: false,
    secretResolve: false,
  };
  return off;
}

function slot(id: string, over: Partial<AgentSlot> = {}): AgentSlot {
  return {
    id,
    orgId: "org-test",
    roleKey: "coder",
    title: `Agent ${id}`,
    definitionId: "coder",
    harness: "hermes",
    status: "IDLE",
    contract: {
      identity: id,
      purpose: "test",
      capabilities: [],
      inputs: [],
      outputs: [],
      permissions: permissions(),
      budget: { maxCostUsd: 1, maxTokens: 1000, timeoutMs: 1000, maxToolSteps: 5, maxRetries: 2 },
      successCriteria: [],
      failurePolicy: "REPAIR",
      escalationPolicy: { onRiskClass: "HIGH", afterAttempts: 2, onBudgetUtilization: 0.9 },
    },
    scorecard: emptyScorecard(),
    active: true,
    spawnedReason: "unit test",
    spawnedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function task(id: string, over: Partial<MissionTask> = {}): MissionTask {
  return {
    id,
    orgId: "org-test",
    missionId: "mis-test",
    phaseId: "phase-1",
    title: `Task ${id}`,
    instruction: `instruction for ${id}`,
    assigneeId: "slot-1",
    assigneeHistory: ["slot-1"],
    status: "RUNNING" as TaskStatus,
    parallelism: "SEQUENTIAL",
    dependsOn: [],
    inputs: [],
    outputs: [],
    riskClass: "MEDIUM",
    attempts: 1,
    maxAttempts: 3,
    attemptHashes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function org(slots: AgentSlot[], tasks: MissionTask[]): Organization {
  return {
    id: "org-test",
    missionId: "mis-test",
    charterId: "charter-test",
    frameworkId: "fw.test",
    topology: "hierarchical",
    candidatePool: slots,
    active: slots.map((s) => s.id),
    teams: [],
    phases: [],
    tasks,
    blackboardKey: "bb-test",
    constitutionId: "constitution-test",
    generation: 0,
    metrics: emptyOrgMetrics(),
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function input(o: Organization, over: Partial<SupervisorInput> = {}): SupervisorInput {
  return {
    org: o,
    busySlotIds: [],
    lastOutputAgoMs: {},
    toolErrors: {},
    invalidArtifactIds: [],
    regressions: [],
    conflictingTopics: [],
    budgetUtilization: 0.1,
    deadlockedTaskIds: [],
    ...over,
  };
}

// ── hashing (cross-language parity with Rust) ────────────────────────────────

console.log("\nMJ 6.0 — unit tests\n");

check("hashString matches the vectors pinned in Rust", () => {
  // These five are asserted on both sides of the FFI boundary. The non-ASCII
  // case is the discriminator: UTF-16 and UTF-8 only differ there.
  eq(hashString(""), "811c9dc5", "empty");
  eq(hashString("abc"), "1a47e90b", "abc");
  eq(hashString("hello world"), "d58b3fa7", "hello world");
  eq(hashString("genesis|{seq:1}"), "054da6b1", "genesis");
  eq(hashString("café — naïve ✓ 日本語"), "0f93cefc", "utf-8");
});

check("hashString is stable and collision-free on near-identical inputs", () => {
  eq(hashString("a"), hashString("a"), "stability");
  assert(hashString("a") !== hashString("b"), "'a' and 'b' must not collide");
  assert(hashString("ab") !== hashString("ba"), "'ab' and 'ba' must not collide");
});

// ── error classification (§15) ───────────────────────────────────────────────

check("classifyError separates harness absence from a plain retry", () => {
  eq(classifyError("claude: command not found", 3), "HARNESS_UNAVAILABLE");
  eq(classifyError("401 unauthorized", 1), "HARNESS_UNAVAILABLE");
  eq(classifyError("permission denied", 1), "PERMISSION_DENIAL");
  eq(classifyError("request timed out", 1), "UNKNOWN");
  eq(classifyError("request timed out", 2), "TIMEOUT_LOOP");
  eq(classifyError("tool failed: write_file", 2), "TOOL_FAILURE_LOOP");
  eq(classifyError("budget ceiling exhausted", 4), "BUDGET_EXHAUSTION");
  eq(classifyError("something odd", 1), "UNKNOWN");
  eq(classifyError("something odd", 5), "REPEATED_FAILURE");
});

check("every FailureClass has a label", () => {
  for (const c of FAILURE_CLASSES) {
    const label = FAILURE_CLASS_LABEL[c];
    assert(typeof label === "string" && label.length > 0, `${c} has no label`);
  }
});

// ── the two MAST classes MJ used to be blind to ──────────────────────────────

check("STEP_REPETITION fires when an agent repeats its own output", () => {
  const h = hashString("the same answer, twice");
  const repeated = task("task-1", { attemptHashes: [hashString("first try"), h, h] });
  const signals = detectFailures(input(org([slot("slot-1")], [repeated])));
  const sig = signals.find((s) => s.class === "STEP_REPETITION");
  assert(sig, "expected a STEP_REPETITION signal");
  eq(sig.severity, "ERROR");
  eq(sig.subjectId, "task-1");
});

check("STEP_REPETITION stays quiet when each attempt differs", () => {
  const varied = task("task-1", {
    attemptHashes: [hashString("a"), hashString("b"), hashString("c")],
  });
  const signals = detectFailures(input(org([slot("slot-1")], [varied])));
  assert(!signals.some((s) => s.class === "STEP_REPETITION"), "must not fire on varied output");
});

check("STEP_REPETITION stays quiet on a single attempt", () => {
  const once = task("task-1", { attemptHashes: [hashString("only one go")] });
  const signals = detectFailures(input(org([slot("slot-1")], [once])));
  assert(!signals.some((s) => s.class === "STEP_REPETITION"), "one attempt cannot be a repetition");
});

check("PREMATURE_TERMINATION fires on a completed task with no artifact", () => {
  const empty = task("task-1", { status: "COMPLETED", outputs: [] });
  const signals = detectFailures(input(org([slot("slot-1")], [empty])));
  const sig = signals.find((s) => s.class === "PREMATURE_TERMINATION");
  assert(sig, "expected a PREMATURE_TERMINATION signal");
  eq(sig.severity, "WARN");
});

check("PREMATURE_TERMINATION stays quiet when an artifact exists", () => {
  const done = task("task-1", { status: "COMPLETED", outputs: ["art-1"] });
  const signals = detectFailures(input(org([slot("slot-1")], [done])));
  assert(!signals.some((s) => s.class === "PREMATURE_TERMINATION"), "an artifact is evidence");
});

// ── repair ladder (§16, §17) ─────────────────────────────────────────────────

check("every FailureClass has a repair ladder", () => {
  for (const c of FAILURE_CLASSES) {
    const ladder = fullLadder(c);
    assert(ladder.length > 0, `${c} has an empty ladder`);
  }
});

check("no ladder opens with a blind retry", () => {
  // §16 forbids blind retry. Retrying with *new context* is a different strategy
  // and is allowed; naked RETRY_SAME is not — and is deliberately absent from
  // every ladder except where the class is genuinely transient.
  for (const c of FAILURE_CLASSES) {
    const ladder = fullLadder(c);
    assert(ladder[0] !== "RETRY_SAME", `${c} leads with a blind RETRY_SAME`);
  }
});

check("the new MAST classes repair by changing the agent's situation", () => {
  // Asking again is exactly the wrong move for an agent that is looping: it will
  // loop identically. The ladder must change context, owner, or decomposition.
  const rep = fullLadder("STEP_REPETITION");
  assert(rep.includes("MODIFY_CONTEXT"), "repetition needs new context");
  assert(rep.includes("REASSIGN_AGENT"), "repetition needs a new owner");
  assert(rep.includes("SPLIT_TASK"), "repetition needs decomposition");
  assert(!rep.includes("RETRY_SAME"), "repetition must never ask again unchanged");
  assert(fullLadder("PREMATURE_TERMINATION").includes("ADD_VERIFIER"), "premature stop needs a verifier");
});

check("every ladder ends by escalating to a human", () => {
  // §17: no repair path may loop forever inside the machine.
  for (const c of FAILURE_CLASSES) {
    const ladder = fullLadder(c);
    eq(ladder[ladder.length - 1], "ESCALATE_HUMAN", `${c} does not end at a human`);
  }
});

// ── provenance manifest (EU AI Act Art. 50) ──────────────────────────────────

function artifact(id: string, over: Partial<Artifact> = {}): Artifact {
  const content = over.content ?? "content of " + id;
  return {
    id,
    missionId: "mis-test",
    orgId: "org-test",
    lineageId: "lin-" + id,
    version: 1,
    name: id,
    contentType: "TEXT",
    content,
    contentHash: hashString(content),
    createdBy: "slot-1",
    modifiedBy: ["slot-1"],
    inputs: [],
    parentArtifacts: [],
    toolsUsed: ["write_file"],
    modelsUsed: ["gpt-test"],
    harnessUsed: "hermes",
    costUsd: 0,
    latencyMs: 10,
    approvalState: "APPROVED",
    riskClass: "MEDIUM",
    provenance: "created by unit test",
    createdAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    ...over,
  };
}

const LEDGER = { head: "abc123", entries: 10, verified: true };
const GENERATOR = { name: "MJ Desktop", version: "6.0.0", harnesses: ["hermes"] };

function manifest(artifacts: Artifact[], byId: Record<string, Artifact> = {}) {
  return buildProvenanceManifest(artifacts, { ...Object.fromEntries(artifacts.map((a) => [a.id, a])), ...byId }, {
    missionId: "mis-test",
    orgId: "org-test",
    generator: GENERATOR,
    ledger: LEDGER,
    generatedAt: "2026-08-29T00:00:00.000Z",
  });
}

check("a fresh manifest verifies clean", () => {
  const m = manifest([artifact("art-1"), artifact("art-2")]);
  const v = verifyManifest(m);
  assert(v.ok, `expected clean, got: ${v.problems.join("; ")}`);
  eq(v.claims, 2);
});

check("the manifest declares its content synthetic (Art. 50)", () => {
  const m = manifest([artifact("art-1")]);
  eq(m.syntheticContent, true);
  eq(m.claims[0].synthetic, true);
  eq(m.manifestVersion, PROVENANCE_MANIFEST_VERSION);
});

check("editing any claim breaks the manifest hash", () => {
  const m = manifest([artifact("art-1")]);
  const tampered = { ...m, claims: [{ ...m.claims[0], name: "renamed by hand" }] };
  const v = verifyManifest(tampered);
  assert(!v.ok, "tampering must be detected");
  assert(v.problems.some((p) => p.includes("Manifest hash")), "expected a hash mismatch");
});

check("a manifest bound to a broken ledger does not verify", () => {
  const m = buildProvenanceManifest([artifact("art-1")], { "art-1": artifact("art-1") }, {
    missionId: "mis-test",
    generator: GENERATOR,
    ledger: { head: "abc", entries: 4, verified: false, brokenAt: 3 },
    generatedAt: "2026-08-29T00:00:00.000Z",
  });
  const v = verifyManifest(m);
  assert(!v.ok, "a broken ledger must fail the manifest");
  assert(v.problems.some((p) => p.includes("ledger")), "expected a ledger problem");
});

check("lineage is exported as C2PA-style ingredients", () => {
  const parent = artifact("art-1");
  const child = artifact("art-2", { version: 2, parentArtifacts: ["art-1"] });
  const m = manifest([child], { "art-1": parent });
  eq(m.claims[0].derivedFrom.length, 1);
  eq(m.claims[0].derivedFrom[0].artifactId, "art-1");
  eq(m.claims[0].derivedFrom[0].contentHash, parent.contentHash);
});

check("drift between the manifest and live content is reported", () => {
  const a = artifact("art-1");
  const m = manifest([a]);
  const edited: Artifact = { ...a, content: "someone edited this", contentHash: hashString("someone edited this") };
  const v = verifyManifest(m, { "art-1": edited });
  assert(!v.ok, "drift must be detected");
  assert(v.problems.some((p) => p.includes("changed since")), "expected a drift problem");
});

check("the rendered manifest is valid JSON that round-trips", () => {
  const m = manifest([artifact("art-1")]);
  const parsed = JSON.parse(renderManifest(m)) as typeof m;
  eq(parsed.manifestHash, m.manifestHash, "hash survives a JSON round trip");
  assert(verifyManifest(parsed).ok, "a round-tripped manifest still verifies");
});

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
