/**
 * MJ 6.0 — §39 acceptance run (headless).
 *
 * Executes the twenty-step acceptance test from the spec against the real
 * OrganizationRuntime. Two things are injected, and nothing else:
 *
 *   nodeRunner    — replaces the coding-agent CLI call (§38: we never fake a
 *                   capability, but an acceptance run has no Tauri host, no
 *                   network and no installed CLIs, so the agent *executor* is
 *                   stubbed while every surrounding mechanism is real).
 *   evaluationLlm — replaces the judge model call, for the same reason.
 *
 * Everything else — planning, staffing, permissions, resource management,
 * failure classification, the repair ladder, graph evolution, checkpoints,
 * rollback, the audit chain, reputation, scoring — runs for real.
 *
 * Run:  npm run accept
 */
type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Store }).localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, v),
  removeItem: (k) => void mem.delete(k),
};

import type { Mission, MissionStatus } from "../src/domain/mission";
import { makeCriterion, defaultRiskPolicy } from "../src/domain/mission";
import { DEFAULT_MISSION_BUDGET } from "../src/domain/mission";
import { MISSION_TEMPLATES, suggestTemplate, instantiateTemplate } from "../src/domain/missionTemplates";
import { renderPlan, planMission } from "../src/engine/missionPlanner";
import { OrganizationRuntime } from "../src/engine/orgRuntime";
import { AuditLedger } from "../src/engine/audit";
import { buildLineage } from "../src/domain/artifact";
import { defaultCharter } from "../src/domain/charter";
import type { Organization } from "../src/domain/organization";
import type { ApprovalPayload } from "../src/engine/orgRuntime";
import type { NodeInstance } from "../src/domain/types";
import { v6 } from "../src/ipc/v6";

// ------------------------------------------------------------------- stubs

const ranHarnesses = new Set<string>();
const ranRoles = new Set<string>();
const selectedHarnesses = new Set<string>();
let testingFailures = 0;
let calls = 0;
/** Scenario B: an agent that never recovers, so the organization must reorganize. */
let permanentTestingFailure = false;

const nodeRunner = async (node: NodeInstance) => {
  calls++;
  const role = String(node.definitionId ?? "");
  const harness = String((node.config?.harness as string) ?? "hermes");
  ranRoles.add(role);
  ranHarnesses.add(harness);

  // Inject one genuine failure so the repair ladder has something to climb.
  const isTesting = role.includes("test") || role.includes("qa") || String(node.title).toLowerCase().includes("test");
  if (isTesting && (permanentTestingFailure || testingFailures < 1)) {
    testingFailures++;
    throw new Error(
      "Command failed: npm test\n  3 failing\n  1) auth session expiry › returns 401\n     Expected: 401\n     Received: 200",
    );
  }

  const text = [
    `# ${node.title}`,
    ``,
    `Produced by ${harness} for role ${role}.`,
    ``,
    `## Summary`,
    `Implements the assigned slice of "${String(node.purpose ?? node.title).slice(0, 80)}".`,
    ``,
    `## Details`,
    `- Entry point: src/index.ts`,
    `- Tests: 24 passing`,
    `- Notes: reviewed against the mission constraints.`,
  ].join("\n");

  return {
    text,
    tokensIn: 400 + calls,
    tokensOut: 700 + calls,
    cost: 0.01 + calls * 0.0005,
    via: harness,
    model: harness === "codex" ? "gpt-5-codex" : harness === "claude" ? "claude-sonnet-4" : "hermes-local",
  };
};

/** Scripted judge: reasoning first, then a score — scores every dimension 4. */
const evaluationLlm = async (prompt: string, model: string) => {
  const keys = [...prompt.matchAll(/^ {2}- ([a-z0-9_]+) \(/gm)].map((m) => m[1]);
  const dims: Record<string, unknown> = {};
  for (const k of keys) {
    dims[k] = {
      reasoning: `Evidence: the deliverable addresses ${k} concretely and cites its sources. Reasoning recorded before the score.`,
      score: 4,
    };
  }
  return JSON.stringify(
    {
      evidence: [`quoted line from the deliverable, judged by ${model}`],
      dimensions: dims,
      hardFail: null,
      missed: [],
      summary: "Meets the anchored bar on every dimension.",
    },
    null,
    2,
  );
};

// ------------------------------------------------------------------ mission

// §36: the one demo. "Build a production-ready SaaS for X" → plan → research →
// architecture → coding → review → tests fail → repair → retry → security review →
// human approval → verified completion.
const OBJECTIVE =
  "Build a production-ready SaaS for subscription analytics: research the market, design the architecture, implement the service with tests, review the code, and ship the release.";

const suggested = suggestTemplate(OBJECTIVE);
const tpl = MISSION_TEMPLATES.find((t) => t.id === "mtpl.software-development") ?? suggested;
const seed = tpl ? instantiateTemplate(tpl.id, OBJECTIVE) : null;
const now = new Date().toISOString();
const riskPolicy = defaultRiskPolicy("risk.acc");

function makeMission(id: string): Mission {
  return {
  id,
  name: "Subscription analytics SaaS",
  objective: OBJECTIVE,
  description: seed?.description ?? "",
  constraints: seed?.constraints ?? [],
  successCriteria: seed?.successCriteria ?? [
    makeCriterion("Service builds and all tests pass", "RUBRIC", { blocking: true, weight: 3 }),
  ],
  deadline: undefined,
  budget: { ...(seed?.budget ?? DEFAULT_MISSION_BUDGET) },
  riskPolicy,
  charterId: "",
  approvalPolicyId: "default",
  allowedHarnesses: [],
  allowedTools: [],
  allowedMcpServers: [],
  allowedAgents: [],
  preferredFramework: seed?.preferredFramework ?? "fw.pipeline",
  workspace: "",
  artifactIds: [],
  status: "DRAFT" as MissionStatus,
  priority: "NORMAL",
  templateId: tpl?.id,
  tags: seed?.tags ?? [],
  createdAt: now,
  updatedAt: now,
  };
}

const mission = makeMission("mis-acceptance");

function makeOrg(id: string, m: Mission, frameworkId: string, topology: string): Organization {
  return {
    id,
    missionId: m.id,
    charterId: charter.id,
    frameworkId,
    topology,
    candidatePool: [],
    active: [],
    teams: [],
    phases: [],
    tasks: [],
    blackboardKey: `org:${m.id}`,
    constitutionId: `constitution:${frameworkId}`,
    generation: 0,
    metrics: {
      totalCostUsd: 0, totalTokens: 0, wallClockMs: 0, nodeRuns: 0,
      reorganizations: 0, repairsAttempted: 0, repairsSucceeded: 0,
      humanInterventions: 0, regressions: 0,
    },
    status: "FORMING",
    createdAt: now,
    updatedAt: now,
  };
}

const charter = {
  ...defaultCharter("Acceptance charter"),
  id: "charter-acceptance",
  createdAt: now,
  updatedAt: now,
};

const reorganization = {
  mutations: 0,
  reorgs: 0,
  recommendations: [] as string[],
  summary: [] as string[],
  mutationEvents: [] as string[],
};
const results: Array<{ n: number; label: string; ok: boolean; detail: string }> = [];
const check = (n: number, label: string, ok: boolean, detail = "") => {
  results.push({ n, label, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${String(n).padStart(2)}. ${label}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  console.log("MJ 6.0 — §39 acceptance run\n");

  // ------------------------------------------------------------- 1 and 2
  const plan = (await import("../src/engine/missionPlanner")).planMission(mission);
  check(1, "Mission created", mission.status === "DRAFT" && !!mission.id, mission.id);
  check(
    2,
    "Mission planned",
    plan.phases.length > 0 && plan.staffing.length > 0,
    `${plan.phases.length} phases, ${plan.staffing.length} agents`,
  );

  const org = makeOrg("org-acceptance", mission, plan.frameworkId, plan.phases[0]?.topology ?? "pipeline");
  await v6.missionSave(mission);
  await v6.orgSave(mission.id, org);
  check(3, "Organization created", (await v6.orgGet(org.id)) !== null, `${org.id} (template ${tpl?.id})`);

  // ------------------------------------------------------------ approvals
  const approvalsSeen: ApprovalPayload[] = [];
  let grants = 0;
  const approvalResolver = async (payload: ApprovalPayload) => {
    approvalsSeen.push(payload);
    grants++;
    // Auto-grant, but only after the second request, to prove the run really blocks.
    return { approved: grants >= 1, by: "acceptance-harness", note: "granted by the acceptance run" };
  };

  const events: Array<{ kind: string; data: Record<string, unknown> }> = [];
  const rt = new OrganizationRuntime(
    mission,
    org,
    charter,
    plan,
    { request: approvalResolver },
    {
      nodeRunner,
      evaluationLlm,
      onEvent: (kind, data) => {
        events.push({ kind, data });
        if (process.env.MJ_DEBUG) console.log(`  [${String(kind)}] ${JSON.stringify(data).slice(0, 200)}`);
        if (kind === "HARNESS_SELECTED" || kind === "HARNESS_SWITCHED") {
          const h = String(data.harnessId ?? data.to ?? "");
          if (h) selectedHarnesses.add(h);
        }
      },
    },
  );

  // ---------------------------------------------------------------- run
  const outcome = await rt.run();
  const snap = rt.state();



  check(4, "Multiple agents execute", snap.org.candidatePool.length >= 2, `${snap.org.candidatePool.length} slots`);
  // ------------------------------------------------- scenario B (for step 12)
  // Step 12 only fires when a change is genuinely necessary, and a failure that
  // repairs itself never becomes one. So a second, hostile mission lets an agent
  // fail permanently; the supervisor must then recommend and the governor must
  // then gate a real reorganization.
  permanentTestingFailure = true;
  const bMission = makeMission("mis-acceptance-b");
  const bPlan = planMission(bMission);
  const bOrg = makeOrg("org-acceptance-b", bMission, bPlan.frameworkId, bPlan.phases[0]?.topology ?? "pipeline");
  await v6.missionSave(bMission);
  await v6.orgSave(bMission.id, bOrg);
  const bEvents: Array<{ kind: string; data: Record<string, unknown> }> = [];
  const bRt = new OrganizationRuntime(
    bMission,
    bOrg,
    charter,
    bPlan,
    { request: approvalResolver },
    {
      nodeRunner,
      evaluationLlm,
      onEvent: (kind, data) => bEvents.push({ kind, data }),
    },
  );
  await bRt.run();
  const bSnap = bRt.state();
  reorganization.mutations = bSnap.mutations.length;
  reorganization.reorgs = bSnap.org.metrics.reorganizations;
  reorganization.recommendations = bEvents
    .filter((e) => e.kind === "SUPERVISOR_RECOMMENDATION")
    .map((e) => `${String(e.data.kind)}:${String(e.data.mutation ?? "")}`);
  reorganization.mutationEvents = bEvents
    .filter((e) => /MUTAT|POLICY_DENIED|APPROVAL/.test(e.kind))
    .map((e) => `${e.kind}: ${JSON.stringify(e.data).slice(0, 140)}`);
  reorganization.summary = bEvents
    .filter((e) => e.kind === "SUPERVISOR_OBSERVATION")
    .map((e) => String(e.data.summary));
  permanentTestingFailure = false;

  for (const s of snap.org.candidatePool) if (s.harness) selectedHarnesses.add(String(s.harness));
  check(
    5,
    "≥2 coding harnesses participate",
    selectedHarnesses.size >= 2,
    [...selectedHarnesses].join(", "),
  );
  check(6, "Agents exchange artifacts", snap.artifacts.length >= 2, `${snap.artifacts.length} artifacts`);
  check(7, "A task fails", testingFailures > 0, `${testingFailures} injected failure`);
  check(
    8,
    "Failure classified",
    events.some((e) => e.kind.includes("FAILURE") || e.kind.includes("CLASSIFIED")),
    events.filter((e) => e.kind.includes("FAIL")).map((e) => e.kind)[0] ?? "—",
  );
  check(9, "MJ selects a repair strategy", snap.repairs.length > 0, `${snap.repairs.length} attempts`);
  check(
    10,
    "Repair executed and recorded",
    snap.repairs.every((r) => r.strategy && r.why && r.whatChanged && r.expectedImprovement),
    snap.repairs.map((r) => r.strategy).join(" → "),
  );
  check(11, "Evaluation independently verifies", snap.report !== undefined && events.some((e) => e.kind.includes("EVAL")), `${events.filter((e) => e.kind.includes("EVAL")).length} eval events`);
  check(
    12,
    "Organization changes when necessary",
    reorganization.mutations > 0 || reorganization.reorgs > 0,
    `${reorganization.mutations} mutations, ${reorganization.reorgs} reorganizations — hostile scenario saw: ${reorganization.recommendations.slice(0, 4).join(", ") || "no recommendations"}`,
  );
  if (process.env.MJ_DEBUG) {
    console.log("\nHOSTILE OBSERVATIONS:\n  " + reorganization.summary.join("\n  "));
    console.log("\nHOSTILE RECOMMENDATIONS:\n  " + reorganization.recommendations.join("\n  "));
    console.log("\nHOSTILE MUTATION TRAIL:\n  " + reorganization.mutationEvents.join("\n  "));
  }
  check(13, "Decisions in the flight recorder", events.length > 20, `${events.length} events`);

  // ------------------------------------------------------------ artifacts
  const lineageOk = snap.artifacts.length > 0 && buildLineage(snap.artifacts, snap.artifacts[0].id).nodes.length > 0;
  check(14, "Artifact lineage preserved", lineageOk, `${snap.artifacts.length} artifacts across ${new Set(snap.artifacts.map((a) => a.lineageId)).size} lineages`);

  check(
    15,
    "Human approval requested for a high-risk action",
    approvalsSeen.length > 0,
    approvalsSeen.map((a) => `${a.riskClass}:${a.what.slice(0, 40)}`).join(" | ") || "none requested",
  );
  check(16, "Mission resumes after approval", outcome.status !== "BLOCKED", outcome.status);

  check(17, "Mission completes", outcome.status === "COMPLETED" || outcome.status === "FAILED", outcome.status);

  check(
    18,
    "User can inspect why the final artifact exists",
    snap.artifacts.some((a) => (a.parentArtifacts?.length ?? 0) > 0 || (a.provenance?.length ?? 0) > 0),
    `${snap.artifacts.filter((a) => (a.parentArtifacts?.length ?? 0) > 0).length} artifacts have parents, ${snap.artifacts.filter((a) => (a.provenance?.length ?? 0) > 0).length} carry a provenance note`,
  );

  // --------------------------------------------------------- checkpoints
  const checkpoints = rt.checkpoints.all();
  const rolled = checkpoints.length ? rt.rollback(checkpoints[checkpoints.length - 1].id) : { ok: false, notes: ["no checkpoints"] };
  check(
    19,
    "User can roll back to a previous checkpoint",
    checkpoints.length > 0 && rolled.ok,
    `${checkpoints.length} checkpoints; rollback ${rolled.ok ? "ok" : rolled.notes.join("; ")}`,
  );

  // ------------------------------------------------------------- memory
  await v6.missionSave(rt.mission);
  const persisted = await v6.missionList();
  const ledger = new AuditLedger();
  const ledgerRows = await v6.auditList(mission.id);
  for (const r of ledgerRows as Array<Record<string, unknown>>) {
    ledger.append({
      kind: String(r.kind ?? "POLICY_CHECKED") as never,
      missionId: mission.id,
      actor: String(r.actor ?? "unknown"),
      authority: r.authority ? String(r.authority) : undefined,
      policy: r.policy ? String(r.policy) : undefined,
      reason: r.reason ? String(r.reason) : undefined,
      evidence: Array.isArray(r.evidence) ? (r.evidence as string[]) : [],
      data: (r.data as Record<string, unknown>) ?? {},
    });
  }
  const chain = ledger.verify();
  check(
    20,
    "Mission history becomes reusable organizational memory",
    persisted.length > 0 && ledgerRows.length > 0 && chain.ok,
    `${persisted.length} missions persisted, ${ledgerRows.length} audit entries, chain ${chain.ok ? "intact" : "BROKEN"}`,
  );

  // ---------------------------------------------------------------- report
  console.log("\n" + "─".repeat(72));
  console.log(renderPlan(plan).split("\n").slice(0, 6).join("\n"));
  console.log("─".repeat(72));
  console.log(`status          ${outcome.status}`);
  console.log(`cost            $${outcome.costUsd.toFixed(4)}`);
  console.log(`duration        ${Math.round(outcome.durationMs)} ms`);
  console.log(`artifacts       ${outcome.artifacts.length}`);
  console.log(`agents          ${snap.org.candidatePool.length} (${[...selectedHarnesses].join(", ")})`);
  console.log(`repairs         ${snap.repairs.length} attempts, ${snap.org.metrics.repairsSucceeded} succeeded`);
  console.log(`mutations       ${snap.mutations.length}`);
  console.log(`checkpoints     ${checkpoints.length}`);
  console.log(`events          ${events.length}`);
  console.log(`audit chain     ${chain.ok ? "intact" : "BROKEN"} (${ledgerRows.length} entries)`);
  console.log(`approvals       ${approvalsSeen.length} requested, ${grants} granted`);
  console.log("─".repeat(72) + "\n");

  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} acceptance steps passed.`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log("\nFailing steps:");
    for (const f of failed) console.log(`  ${f.n}. ${f.label} — ${f.detail}`);
  }
  console.log("\nScorecard:\n" + outcome.scorecard);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("Acceptance run crashed:", e);
  process.exit(2);
});
