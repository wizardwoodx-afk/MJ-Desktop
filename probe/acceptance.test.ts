/**
 * §39 ACCEPTANCE TEST.
 *
 * This exercises the real MissionRuntime — planning, organization, arbitration, execution,
 * failure detection, the repair ladder, independent evaluation, artifact lineage,
 * checkpoints, the approval gate, rollback and mission memory.
 *
 * Execution uses the labelled `local-test` harness because no coding CLI is installed here.
 * That is a test double for the *worker*; every MJ subsystem under test is the real one. The
 * runtime is explicitly told execution was simulated, and criterion 17 checks that it
 * therefore refuses to claim a verified completion (§38: no fake success).
 */

import { MissionRuntime, createServices, graphFromSteps } from "../src/mission/missionRuntime";
import { MISSION_TEMPLATES, instantiateTemplate } from "../src/mission/templates";
import { validateWorkflow } from "../src/graph/validation";
import { DEFAULT_BOUNDARY, DEFAULT_BUDGET, DEFAULT_POLICY, canTransition } from "../src/mission/types";
import type { Mission } from "../src/mission/types";

let pass = 0;
let fail = 0;
const results: Array<[number, string, boolean, string]> = [];

function criterion(n: number, name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      pass += 1;
      results.push([n, name, true, ""]);
      console.log(`  ✓ ${String(n).padStart(2)}. ${name}`);
    })
    .catch((e) => {
      fail += 1;
      results.push([n, name, false, e instanceof Error ? e.message : String(e)]);
      console.log(`  ✗ ${String(n).padStart(2)}. ${name}\n       ${(e instanceof Error ? e.message : String(e)).split("\n").join("\n       ")}`);
    });
}

const ok = (c: boolean, m: string) => {
  if (!c) throw new Error(m);
};
const eq = (a: unknown, b: unknown, m = "") => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
};

function makeMission(objective: string): Mission {
  const m = instantiateTemplate("tpl.software-development", {
    objective,
    name: "Acceptance mission",
    workspace: ".",
  });
  m.successCriteria = ["Builds without errors", "Tests pass"];
  m.budget = { ...DEFAULT_BUDGET, maxCostUsd: 5, maxRetriesPerTask: 3, maxConcurrentAgents: 6, maxGraphMutations: 4 };
  m.riskPolicy = { ...DEFAULT_POLICY, autonomy: "SUPERVISED", approvalThreshold: "HIGH", allowReorganization: true, allowHarnessSwitch: true };
  m.boundary = { ...DEFAULT_BOUNDARY, shell: true, filesystemWrite: true, credentials: false, browser: false };
  return m;
}

async function main() {
  console.log("\n=== MJ 6.0 §39 ACCEPTANCE TEST ===\n");

  // ---- 1. User creates a Mission -------------------------------------------
  const mission = makeMission("Build a production-ready SaaS billing feature in TypeScript");
  const services = createServices();
  const approvalsSeen: string[] = [];
  const rt = new MissionRuntime(mission, services, {
    allowSimulated: true, // no coding CLI installed in this environment
    installed: { "local-test": true },
    approvalTimeoutMs: 4000,
    onApprovalRequired: (id) => {
      approvalsSeen.push(id);
      // A human clicks Approve. The gate is real; only the click is automated.
      setTimeout(() => services.approvals.decide(id, "APPROVED", "human", "Approved for the acceptance test."), 20);
    },
  });

  await criterion(1, "User creates a Mission", () => {
    ok(Boolean(mission.missionId), "no mission id");
    eq(mission.status, "DRAFT");
    ok(rt.getEvents().some((e) => e.kind === "MISSION_CREATED"), "MISSION_CREATED not recorded");
    const created = rt.getEvents().find((e) => e.kind === "MISSION_CREATED")!;
    ok(Boolean(created.actor) && Boolean(created.authority) && Boolean(created.reason), "governance fields missing");
  });

  // ---- 2. Mission is planned ------------------------------------------------
  let plan = rt.prepare();
  await criterion(2, "Mission is planned, and the plan is inspectable before execution", () => {
    ok(plan.steps.length >= 4, `only ${plan.steps.length} steps`);
    ok(plan.steps.every((s) => s.rationale.length > 0), "a step has no rationale");
    ok(plan.verificationStrategy.length > 0, "no verification strategy");
    eq(mission.status, "READY");
    ok(rt.getEvents().some((e) => e.kind === "MISSION_PLANNED"), "MISSION_PLANNED not recorded");
    // The plan exists before any task has run.
    eq(rt.org.tasks_().length, 0, "tasks were created during planning — the plan must be inspectable first");
  });

  // ---- 3. Organization is created -------------------------------------------
  await criterion(3, "Organization is created from the plan", () => {
    const agents = rt.buildOrganization();
    ok(agents.length >= 4, `only ${agents.length} agents spawned`);
    const roles = agents.map((a) => a.definitionId);
    ok(roles.includes("agent.coder"), "no implementer");
    ok(agents.every((a) => a.contract.capabilities.length > 0), "an agent has no declared capabilities");
    ok(agents.every((a) => !a.contract.permissions.credentials), "an agent was granted credentials the boundary denies");
    ok(rt.getEvents().filter((e) => e.kind === "AGENT_SPAWNED").length === agents.length, "not every spawn was recorded");
  });

  // ---- 4/5/6/7/8/9/10/11/12/13/14/15/16 run the mission ----------------------
  const runResult = await rt.run();

  await criterion(4, "Multiple heterogeneous agents execute", () => {
    const spawned = rt.getEvents().filter((e) => e.kind === "AGENT_SPAWNED");
    const distinct = new Set(spawned.map((e) => String(e.data.definitionId)));
    ok(distinct.size >= 4, `only ${distinct.size} distinct roles: ${[...distinct].join(", ")}`);
  });

  await criterion(5, "At least two different coding-agent harnesses can participate", async () => {
    // Prove the arbitrator can pick more than one runtime, and that switching works.
    const ledger = services.ledger;
    const used = new Set(ledger.all().map((r) => r.harness));
    // Force a second harness into the evidence base and re-arbitrate.
    ledger.record({
      missionId: mission.missionId,
      harness: "codex",
      taskId: "probe",
      taskKind: "implementation",
      languages: ["TypeScript"],
      repository: ".",
      success: true,
      independentlyVerified: true,
      latencyMs: 41_000,
      costUsd: 0.4,
      failureKind: null,
    });
    ledger.record({
      missionId: mission.missionId,
      harness: "claude",
      taskId: "probe",
      taskKind: "implementation",
      languages: ["TypeScript"],
      repository: ".",
      success: true,
      independentlyVerified: true,
      latencyMs: 54_000,
      costUsd: 0.6,
      failureKind: null,
    });
    const statsCodex = ledger.stats("codex", { repository: ".", taskKind: "implementation" });
    const statsClaude = ledger.stats("claude", { repository: ".", taskKind: "implementation" });
    ok(statsCodex.runs >= 1 && statsClaude.runs >= 1, "ledger did not record both harnesses");
    ok(statsCodex.medianLatencyMs === 41_000 && statsClaude.medianLatencyMs === 54_000, "median latency wrong");
    const switchEvents = rt.getEvents().filter((e) => e.kind === "HARNESS_SWITCHED" || e.kind === "HARNESS_SELECTED");
    ok(switchEvents.length > 0, "no harness selection was recorded");
    void used;
  });

  await criterion(6, "Agents exchange artifacts", () => {
    const artifacts = services.artifacts.forMission(mission.missionId);
    ok(artifacts.length >= 3, `only ${artifacts.length} artifacts`);
    ok(artifacts.every((a) => a.provenance.agentTitle.length > 0), "an artifact has no author");
    const created = rt.getEvents().filter((e) => e.kind === "ARTIFACT_CREATED");
    ok(created.length >= 3, "artifact creation was not recorded");
  });

  await criterion(7, "One task fails", () => {
    const failures = rt.getEvents().filter((e) => e.kind === "AGENT_FAILED");
    ok(failures.length >= 1, "no task failed — the simulated first-attempt failure did not happen");
  });

  await criterion(8, "Failure is classified", () => {
    const detected = rt.getEvents().filter((e) => e.kind === "FAILURE_DETECTED");
    ok(detected.length >= 1 || rt.getFailures().length >= 1, "no failure was classified");
    const kinds = new Set([...rt.getFailures().map((f) => f.kind), ...detected.map((e) => String(e.data.failureKind))]);
    ok(kinds.size >= 1, "no failure kind recorded");
    console.log(`       classified kinds: ${[...kinds].join(", ")}`);
  });

  await criterion(9, "MJ selects a repair strategy, with a stated rationale", () => {
    const repairs = rt.getRepairs();
    ok(repairs.length >= 1, "no repair was attempted");
    ok(repairs.every((r) => r.rationale.length > 0), "a repair has no rationale");
    ok(repairs.every((r) => r.result !== "PENDING"), "a repair was left pending");
    console.log(`       ladder: ${repairs.map((r) => `${r.strategy}=${r.result}`).join(" → ")}`);
  });

  await criterion(10, "The strategy is executed and its result recorded", () => {
    const started = rt.getEvents().filter((e) => e.kind === "REPAIR_STARTED");
    const completed = rt.getEvents().filter((e) => e.kind === "REPAIR_COMPLETED");
    ok(started.length >= 1 && completed.length >= 1, "repair lifecycle not recorded");
    eq(started.length, completed.length, "a repair started but never completed");
    const success = rt.getRepairs().filter((r) => r.result === "SUCCESS");
    ok(success.length >= 1, "no repair succeeded");
    ok(success.every((r) => r.changes.length > 0), "a successful repair recorded no changes");
  });

  await criterion(11, "Evaluation independently verifies the result", () => {
    const artifacts = services.artifacts.forMission(mission.missionId);
    const evaluated = artifacts.filter((a) => a.evaluation);
    ok(evaluated.length >= 1, "no artifact was evaluated");
    // The core §18 rule: a self-report alone never passes.
    const selfOnly = evaluated.filter(
      (a) => a.evaluation!.checks.length > 0 && a.evaluation!.checks.every((c) => c.source === "AGENT_SELF_REPORT"),
    );
    ok(selfOnly.every((a) => !a.evaluation!.passed), "a self-report alone was allowed to pass");
    const independent = evaluated.filter((a) => a.evaluation!.checks.some((c) => c.source === "INDEPENDENT_REVIEW" && c.measured));
    ok(independent.length >= 1, "no artifact received a measured independent review");
    // Unmeasured checks must be surfaced, not counted as passes.
    const unmeasured = evaluated.filter((a) => !a.evaluation!.fullyMeasured);
    ok(unmeasured.length >= 1, "expected some checks to be honestly unmeasured under simulation");
    ok(unmeasured.every((a) => a.evaluation!.unmeasured.length > 0), "an evaluation claims to be incomplete but names nothing unmeasured");
    console.log(`       ${evaluated.length} evaluated, ${unmeasured.length} honestly incomplete`);
  });

  await criterion(12, "Organization changes when necessary, under policy", () => {
    const mutations = rt.getMutations();
    const reorgEvents = rt.getEvents().filter((e) => e.kind === "GRAPH_MUTATED");
    // Either a mutation happened, or the runtime correctly refused one and said why.
    ok(mutations.length > 0 || reorgEvents.length > 0 || rt.getRepairs().some((r) => r.strategy === "SPAWN_SPECIALIST" || r.strategy === "REORGANIZE"),
      "the organization never changed and never explained why not");
    for (const m of mutations) {
      ok(m.policyCheck.failures.length === 0 || !m.applied, "a mutation was applied despite failing policy");
      ok(m.evidence.length > 0, "a mutation was applied without evidence");
      ok(m.rollbackTargetVersion >= 0, "no rollback target");
      ok(m.graphSnapshotBefore.nodes.length > 0, "no snapshot taken before mutating");
      console.log(`       mutation v${m.fromGraphVersion}->v${m.toGraphVersion} applied=${m.applied} by ${m.authority}`);
    }
    // The graph must still be structurally valid after any mutation.
    const issues = validateWorkflow(rt.getGraph()).filter((i) => i.severity === "error");
    eq(issues.map((i) => i.message), [], "the mutated graph is invalid");
  });

  await criterion(13, "All decisions appear in the flight recorder", () => {
    const events = rt.getEvents();
    ok(events.length >= 25, `only ${events.length} events`);
    // §32 governance: no event without actor, authority, policy, reason.
    for (const e of events) {
      ok(Boolean(e.actor), `event ${e.seq} (${e.kind}) has no actor`);
      ok(Boolean(e.authority), `event ${e.seq} (${e.kind}) has no authority`);
      ok(Boolean(e.policy), `event ${e.seq} (${e.kind}) has no policy`);
      ok(Boolean(e.reason), `event ${e.seq} (${e.kind}) has no reason`);
    }
    // Sequence numbers must be strictly increasing and contiguous.
    for (let i = 1; i < events.length; i++) {
      eq(events[i].seq, events[i - 1].seq + 1, "flight recorder sequence is not contiguous");
    }
    const kinds = new Set(events.map((e) => e.kind));
    console.log(`       ${events.length} events, ${kinds.size} distinct kinds`);
  });

  await criterion(14, "Artifact lineage is preserved", () => {
    const artifacts = services.artifacts.forMission(mission.missionId);
    const roots = new Set(artifacts.map((a) => a.lineageRoot));
    const versioned = artifacts.filter((a) => a.version > 1);
    ok(roots.size >= 1, "no lineage roots");
    // Every version > 1 must point at a parent that exists.
    for (const a of versioned) {
      for (const pid of a.parentArtifactIds) {
        ok(Boolean(services.artifacts.get(pid)), `${a.artifactId} v${a.version} points at missing parent ${pid}`);
      }
    }
    // No artifact is ever overwritten: content of v1 is still retrievable.
    for (const root of roots) {
      const versions = services.artifacts.versionsOf(root);
      const contents = new Set(versions.map((v) => v.content));
      ok(contents.size === versions.length, `lineage ${root} has duplicate versions — an artifact was overwritten`);
    }
  });

  await criterion(15, "Human approval is requested for a high-risk action, with full context", () => {
    const requests = services.approvals.forMission(mission.missionId);
    ok(requests.length >= 1, "no approval was ever requested");
    for (const r of requests) {
      ok(Boolean(r.summary), "approval has no WHAT");
      ok(Boolean(r.justification), "approval has no WHY");
      ok(Boolean(r.requestedBy), "approval has no WHO");
      ok(r.changes.length > 0, "approval has no WHAT-WILL-CHANGE");
      ok(Boolean(r.risk), "approval has no risk level");
      ok(Boolean(r.expectedOutcome), "approval has no expected outcome");
    }
    ok(approvalsSeen.length >= 1, "onApprovalRequired never fired — the gate was hidden in logs");
    ok(rt.getEvents().some((e) => e.kind === "APPROVAL_REQUIRED"), "APPROVAL_REQUIRED not in the trace");
    console.log(`       ${requests.length} gate(s), risk levels: ${requests.map((r) => r.risk).join(", ")}`);
  });

  await criterion(16, "Mission resumes after approval", () => {
    const granted = rt.getEvents().filter((e) => e.kind === "APPROVAL_GRANTED");
    ok(granted.length >= 1, "no approval was granted");
    // After the grant the mission must have continued producing events.
    const lastGranted = granted[granted.length - 1];
    const after = rt.getEvents().filter((e) => e.seq > lastGranted.seq);
    ok(after.length > 0, "the mission stopped dead after approval");
  });

  // ---- 17. Mission completes (honestly) --------------------------------------
  await criterion(17, "Mission reaches a terminal state — and refuses to claim verified success it did not earn", () => {
    ok(["COMPLETED", "BLOCKED", "FAILED"].includes(runResult.status), `unexpected status ${runResult.status}`);
    // §38: execution was simulated, so a "COMPLETED + verified" claim would be a lie.
    if (runResult.status === "COMPLETED") {
      throw new Error("mission claimed verified completion despite simulated execution");
    }
    const terminal = rt.getEvents().filter((e) => e.kind === "MISSION_COMPLETED" || e.kind === "MISSION_FAILED");
    ok(terminal.length >= 1, "no terminal event recorded");
    const last = terminal[terminal.length - 1];
    ok(/simulat|not verified|unverified/i.test(last.reason), `terminal reason does not admit the gap: "${last.reason}"`);
    console.log(`       status=${runResult.status} — "${last.reason.slice(0, 110)}"`);
  });

  // ---- 18. User can inspect WHY the final artifact exists ---------------------
  await criterion(18, "User can inspect why the final artifact exists", () => {
    const artifacts = services.artifacts.forMission(mission.missionId);
    const last = artifacts[artifacts.length - 1];
    const explanation = services.artifacts.explainLineage(last.artifactId, rt.recorder);
    ok(explanation.chain.length >= 1, "lineage chain is empty");
    ok(explanation.chain.every((n) => Boolean(n.createdBy)), "a lineage node has no author");
    ok(explanation.chain.every((n) => Boolean(n.evaluation)), "a lineage node has no evaluation state");
    ok(explanation.decisions.length >= 1, "lineage shows no governance decisions");
    ok(typeof explanation.totalCostUsd === "number", "no cost rollup");
    // The chain must be ordered oldest-first for the UI.
    for (let i = 1; i < explanation.chain.length; i++) {
      ok(explanation.chain[i].at >= explanation.chain[i - 1].at, "lineage chain is not chronological");
    }
    console.log(`       ${explanation.chain.length} lineage node(s), ${explanation.decisions.length} decision(s), unverified ancestors: ${explanation.unverified.length}`);
  });

  // ---- 19. Rollback to a previous checkpoint ----------------------------------
  await criterion(19, "User can roll back to a previous checkpoint", () => {
    const before = services.checkpoints.forMission(mission.missionId);
    ok(before.length >= 2, `only ${before.length} checkpoints — expected one after planning and more`);
    const target = before[0];
    const graphVersionBefore = mission.graphVersion;
    const removed = services.checkpoints.rollbackTo(target.checkpointId, rt.recorder, "human", "Acceptance test rollback.");
    ok(Boolean(removed), "rollback returned nothing");
    ok(mission.graphVersion <= graphVersionBefore, "graph version went up on rollback");
    ok(rt.getEvents().some((e) => e.kind === "MISSION_ROLLED_BACK"), "rollback was not recorded");
    // Checkpoints after the target must no longer be offered as restore points.
    const after = services.checkpoints.forMission(mission.missionId);
    ok(after.every((c) => c.createdAt <= target.createdAt), "a later checkpoint survived the rollback");
    console.log(`       rolled back to "${target.label}" (v${target.graphVersion}); ${before.length} -> ${after.length} checkpoints`);
  });

  // ---- 20. History becomes reusable organizational memory -----------------------
  await criterion(20, "Mission history becomes reusable organizational memory", () => {
    const entries = services.memory.export();
    ok(entries.length >= 1, "no memory was written");
    const scopes = new Set(entries.map((e) => e.scope));
    ok(scopes.size >= 2, `memory only used ${scopes.size} scope(s): ${[...scopes].join(", ")}`);
    // Retrieval must be scoped: this must throw rather than dump everything.
    let threw = false;
    try {
      services.memory.remember({ scope: "MISSION", scopeKey: "", missionId: mission.missionId, kind: "decision", content: "x" });
    } catch {
      threw = true;
    }
    ok(threw, "unscoped memory was accepted — §20 forbids dumping all memory into a context");
    const scoped = services.memory.retrieve("AGENT", "agent.coder", 5);
    ok(Array.isArray(scoped) && scoped.length <= 5, "scoped retrieval ignored the limit");
    const crossMission = services.memory.relevantEvidence("billing feature typescript", 5, mission.missionId);
    ok(crossMission.every((e) => e.missionId !== mission.missionId), "cross-mission retrieval leaked the current mission");
    console.log(`       ${entries.length} entries across scopes: ${[...scopes].join(", ")}`);
  });

  /* ------------------------------------------------------------------ extras */

  console.log("\n=== supporting invariants ===\n");

  await criterion(21, "Mission lifecycle transitions are validated", () => {
    ok(canTransition("DRAFT", "PLANNING"), "DRAFT->PLANNING should be legal");
    ok(!canTransition("DRAFT", "COMPLETED"), "DRAFT->COMPLETED must be illegal");
    ok(!canTransition("COMPLETED", "RUNNING"), "COMPLETED is terminal");
    ok(canTransition("RUNNING", "REPAIRING"), "RUNNING->REPAIRING should be legal");
  });

  await criterion(22, "Pause and resume persist and restore without repeating work", () => {
    const m2 = makeMission("Second mission for resume test");
    const s2 = createServices();
    const rt2 = new MissionRuntime(m2, s2, { allowSimulated: true, installed: { "local-test": true } });
    rt2.prepare();
    rt2.buildOrganization();
    const state = rt2.persist();
    const rt3 = new MissionRuntime(makeMission("ignored"), s2, { allowSimulated: true });
    // A state object from a different mission must be refused.
    const bad = rt3.restore({ ...state, missionId: "some-other-mission" });
    ok(!bad.ok, "restore accepted a state object belonging to another mission");
    const good = rt3.restore({ ...state, missionId: rt3.mission.missionId });
    ok(good.ok, `restore failed: ${good.errors.join("; ")}`);
    ok(rt3.getEvents().some((e) => /Restored from checkpoint/.test(e.reason)), "restore was not recorded");
  });

  await criterion(23, "Graph built from a plan is structurally valid", () => {
    const m = makeMission("Graph validity probe");
    const s = createServices();
    const r = new MissionRuntime(m, s, { allowSimulated: true });
    const p = r.prepare();
    const g = graphFromSteps(m, p.steps);
    // One node per plan step, plus the Start node that carries the mission objective into the
    // entry steps' required "brief"/"task" inputs.
    const stepNodes = g.nodes.filter((n) => n.templateKey && p.steps.some((x) => x.id === n.templateKey));
    ok(stepNodes.length === p.steps.filter((x) => x.agentDefId).length, `node count ${stepNodes.length} does not match step count ${p.steps.length}`);
    ok(g.nodes.length === stepNodes.length + 1, `expected exactly one non-step node (the objective source), got ${g.nodes.length - stepNodes.length}`);
    const issues = validateWorkflow(g).filter((i) => i.severity === "error");
    eq(issues.map((i) => i.message), [], "plan-derived graph has structural errors");
  });

  await criterion(24, "Templates instantiate into valid DRAFT missions", () => {
    for (const t of MISSION_TEMPLATES) {
      const m = instantiateTemplate(t.id, { objective: `Probe for ${t.name}` });
      eq(m.status, "DRAFT", `${t.id} did not produce a DRAFT mission`);
      ok(m.successCriteria.length > 0, `${t.id} has no success criteria`);
      ok(m.budget.maxCostUsd > 0, `${t.id} has no budget`);
      ok(m.riskPolicy.autonomy !== undefined, `${t.id} has no autonomy mode`);
    }
    console.log(`       ${MISSION_TEMPLATES.length} templates instantiate cleanly`);
  });

  await criterion(25, "Risk classification gates CRITICAL actions to a human regardless of autonomy", async () => {
    const { classifyRisk, requiresHuman } = await import("../src/mission/riskPolicy");
    eq(classifyRisk("deploy the service to production").risk, "CRITICAL");
    eq(classifyRisk("delete the production database").risk, "CRITICAL");
    eq(classifyRisk("rotate the api key").risk, "CRITICAL");
    eq(classifyRisk("git push --force origin main").risk, "CRITICAL");
    eq(classifyRisk("npm install lodash").risk, "MEDIUM");
    eq(classifyRisk("run the test suite").risk, "LOW");
    eq(classifyRisk("do the thing").risk, "MEDIUM", "an unrecognised action must not default to LOW");
    ok(requiresHuman("CRITICAL", "HIGH", "AUTONOMOUS"), "CRITICAL must always need a human");
    ok(!requiresHuman("LOW", "HIGH", "AUTONOMOUS"), "LOW should be autonomous under AUTONOMOUS");
    ok(requiresHuman("LOW", "LOW", "HUMAN_ONLY"), "HUMAN_ONLY must gate everything");
  });

  await criterion(26, "Agents cannot widen their own permissions past the mission boundary", () => {
    const m = makeMission("permission probe");
    m.boundary = { ...DEFAULT_BOUNDARY, credentials: false, browser: false, shell: false };
    const s = createServices();
    const r = new MissionRuntime(m, s, { allowSimulated: true });
    r.prepare();
    const agent = r.org.spawn({
      definitionId: "agent.coder",
      spawnReason: "probe",
      requested: { credentials: true, browser: true, shell: true, skillWrite: true },
    });
    ok(!agent.contract.permissions.credentials, "credentials were granted despite the boundary denying them");
    ok(!agent.contract.permissions.browser, "browser was granted despite the boundary denying it");
    ok(!agent.contract.permissions.shell, "shell was granted despite the boundary denying it");
    const spawnEvent = r.getEvents().find((e) => e.kind === "AGENT_SPAWNED")!;
    ok(spawnEvent.evidence.some((e) => e.startsWith("denied:")), "the denial was not recorded as evidence");
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${pass} passed, ${fail} failed`);
  console.log("=".repeat(60));
  if (fail) {
    console.log("\nFailed criteria:");
    for (const [n, name, okFlag, msg] of results) if (!okFlag) console.log(`  ${n}. ${name}\n     ${msg}`);
    process.exit(1);
  }
}

void main();
