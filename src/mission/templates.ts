/**
 * §27 Mission templates + §28 organization template library.
 *
 * A template is a *starting structure*, not an immutable workflow. Instantiating one produces
 * a Mission in DRAFT with a proposed roster and policy; the planner may then change it, and
 * the supervisor may reorganise it while it runs.
 *
 * Templates are also how successful missions become reusable (§27): `fromMission` distils a
 * finished mission back into a template.
 */

import { uid } from "../app/id";
import { DEFAULT_BOUNDARY, DEFAULT_BUDGET, DEFAULT_POLICY } from "./types";
import type { Mission, MissionBudget, MissionPolicy, PlanStepKind, SecurityBoundary } from "./types";

export interface TemplateRole {
  definitionId: string;
  title: string;
  kind: PlanStepKind;
  purpose: string;
}

export interface MissionTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Roster in execution order. */
  roles: TemplateRole[];
  /** Success criteria shape the mission must satisfy. */
  defaultSuccessCriteria: string[];
  defaultConstraints: string[];
  budget: Partial<MissionBudget>;
  policy: Partial<MissionPolicy>;
  boundary: Partial<SecurityBoundary>;
  preferredFramework: string | null;
  /** Where this template came from — hand-authored, or distilled from a mission. */
  origin: "built-in" | "distilled";
}

const role = (definitionId: string, title: string, kind: PlanStepKind, purpose: string): TemplateRole => ({
  definitionId,
  title,
  kind,
  purpose,
});

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: "tpl.software-development",
    name: "Software Development",
    category: "Engineering",
    description: "Plan → architect → implement → test → review → release gate. The default shape for building something that has to work.",
    roles: [
      role("agent.planner", "Planner", "research", "Decompose the objective into testable units and name the unknowns."),
      role("agent.architect", "Architect", "architecture", "Design the system: components, data model, interfaces, failure modes."),
      role("agent.coder", "Implementer", "implementation", "Implement the design. Produce runnable code and the commands that build it."),
      role("agent.tester", "Tester", "test", "Run the tests. Record actual output. Report failures verbatim."),
      role("agent.reviewer", "Reviewer", "review", "Review against the success criteria. Say what is missing; do not rewrite."),
      role("control.approval", "Release gate", "release", "Human decision on release."),
    ],
    defaultSuccessCriteria: ["Builds without errors", "Tests pass", "Review has no unresolved blockers"],
    defaultConstraints: ["No production deployment without approval"],
    budget: { maxCostUsd: 15, maxConcurrentAgents: 3 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "HIGH" },
    boundary: { shell: true, filesystemWrite: true, credentials: false },
    preferredFramework: "fw.specdriven",
    origin: "built-in",
  },
  {
    id: "tpl.security-review",
    name: "Security Review",
    category: "Security",
    description: "Threat model → secure review → judge → human gate. Findings ranked by exploitability; no exploit payloads.",
    roles: [
      role("agent.security", "Threat modeller", "security", "Model trust boundaries and rank findings by exploitability."),
      role("agent.reviewer", "Secure reviewer", "review", "Review the diff for injection, authorisation gaps, secret handling."),
      role("agent.judge", "Judge", "review", "Adjudicate disagreements between the reviewer and the implementer."),
      role("control.approval", "Human gate", "approval", "Human decision on whether findings are acceptable."),
    ],
    defaultSuccessCriteria: ["Every finding has a severity and a remediation", "No untriaged high-severity finding remains"],
    defaultConstraints: ["No exploit payloads", "No live exploitation"],
    budget: { maxCostUsd: 8 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "MEDIUM" },
    boundary: { filesystemRead: true, filesystemWrite: false, shell: true },
    preferredFramework: "fw.security-gate",
    origin: "built-in",
  },
  {
    id: "tpl.research",
    name: "Research",
    category: "Knowledge",
    description: "Three independent angles → synthesis → judge. Conflicts are preserved, not smoothed.",
    roles: [
      role("agent.researcher", "Researcher A", "research", "Investigate from the technical angle. Cite sources."),
      role("agent.researcher", "Researcher B", "research", "Investigate from the cost/operational angle. Cite sources."),
      role("agent.researcher", "Researcher C", "research", "Investigate from the risk angle. Cite sources."),
      role("agent.synthesizer", "Synthesizer", "synthesis", "Merge the three. Keep the disagreements visible."),
      role("agent.judge", "Judge", "review", "State which conclusion the evidence actually supports."),
    ],
    defaultSuccessCriteria: ["Every claim is sourced", "Conflicting findings are named explicitly"],
    defaultConstraints: ["Mark unknowns rather than filling them"],
    budget: { maxCostUsd: 6, maxConcurrentAgents: 3 },
    policy: { autonomy: "AUTONOMOUS", approvalThreshold: "HIGH" },
    boundary: { network: true, browser: true, filesystemWrite: false, shell: false },
    preferredFramework: "fw.triangulation",
    origin: "built-in",
  },
  {
    id: "tpl.due-diligence",
    name: "Due Diligence",
    category: "Enterprise",
    description: "Research → finance → legal → security → synthesis → judge.",
    roles: [
      role("agent.researcher", "Researcher", "research", "Establish the factual record with sources."),
      role("agent.preset.data-analyst", "Financial analyst", "research", "Assess the financial picture. State assumptions."),
      role("agent.preset.legal", "Legal reviewer", "review", "Flag contractual and compliance risk. Not legal advice."),
      role("agent.security", "Security reviewer", "security", "Assess technical and security risk."),
      role("agent.synthesizer", "Synthesizer", "synthesis", "Produce one memorandum. Conflicts stay visible."),
      role("agent.judge", "Judge", "review", "Recommend, with the reasoning stated."),
    ],
    defaultSuccessCriteria: ["Every material risk is named", "Recommendation follows from the evidence"],
    defaultConstraints: ["Not legal or financial advice"],
    budget: { maxCostUsd: 12 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "HIGH" },
    boundary: { network: true, filesystemWrite: true },
    preferredFramework: "fw.due-diligence",
    origin: "built-in",
  },
  {
    id: "tpl.market-analysis",
    name: "Market Analysis",
    category: "Knowledge",
    description: "Map-reduce over sources, then a synthesis with the numbers shown.",
    roles: [
      role("agent.researcher", "Market researcher", "research", "Size the market and name the sources."),
      role("agent.preset.data-analyst", "Analyst", "research", "Build the numbers. Show the arithmetic."),
      role("agent.critic", "Critic", "review", "Attack the assumptions."),
      role("agent.synthesizer", "Synthesizer", "synthesis", "Produce the analysis."),
    ],
    defaultSuccessCriteria: ["Numbers are reproducible from stated sources"],
    defaultConstraints: ["No invented market figures"],
    budget: { maxCostUsd: 6 },
    policy: { autonomy: "AUTONOMOUS" },
    boundary: { network: true, filesystemWrite: false },
    preferredFramework: "fw.mapreduce",
    origin: "built-in",
  },
  {
    id: "tpl.data-pipeline",
    name: "Data Pipeline",
    category: "Data",
    description: "Design → implement → test on real data → review.",
    roles: [
      role("agent.architect", "Pipeline architect", "architecture", "Design the pipeline: sources, contracts, failure handling, backfill."),
      role("agent.coder", "Pipeline engineer", "implementation", "Implement it. Handle late-arriving and bad data explicitly."),
      role("agent.tester", "Data tester", "test", "Run it against real data. Show row counts and diffs."),
      role("agent.reviewer", "Reviewer", "review", "Review for correctness and idempotency."),
    ],
    defaultSuccessCriteria: ["Pipeline is idempotent", "Row counts reconcile"],
    defaultConstraints: ["Never drop source data"],
    budget: { maxCostUsd: 10 },
    policy: { autonomy: "SUPERVISED" },
    boundary: { shell: true, filesystemWrite: true },
    preferredFramework: "fw.pipeline",
    origin: "built-in",
  },
  {
    id: "tpl.content-production",
    name: "Content Production",
    category: "Content",
    description: "Research → draft → critique → edit. Facts sourced, claims checked.",
    roles: [
      role("agent.researcher", "Researcher", "research", "Gather sourced material."),
      role("agent.docs", "Writer", "synthesis", "Draft from the research. No invented facts."),
      role("agent.critic", "Critic", "review", "Attack the claims and the structure."),
      role("agent.reviewer", "Editor", "review", "Edit for accuracy and clarity."),
    ],
    defaultSuccessCriteria: ["Every factual claim is sourced"],
    defaultConstraints: ["No fabricated quotes or statistics"],
    budget: { maxCostUsd: 5 },
    policy: { autonomy: "AUTONOMOUS" },
    boundary: { network: true, shell: false, filesystemWrite: true },
    preferredFramework: "fw.handoff-chain",
    origin: "built-in",
  },
  {
    id: "tpl.qa",
    name: "QA",
    category: "Quality",
    description: "Producer → reviewer → QA gate. QA may not rewrite the work.",
    roles: [
      role("agent.coder", "Producer", "implementation", "Produce the work."),
      role("agent.reviewer", "Reviewer", "review", "Review it."),
      role("agent.qa", "QA", "test", "Gate it against the acceptance criteria."),
      role("control.approval", "Human gate", "approval", "Human sign-off."),
    ],
    defaultSuccessCriteria: ["Acceptance criteria are each explicitly met or explicitly not"],
    defaultConstraints: ["QA does not rewrite the work"],
    budget: { maxCostUsd: 8 },
    policy: { autonomy: "SUPERVISED" },
    boundary: { shell: true },
    preferredFramework: "fw.producer-gate",
    origin: "built-in",
  },
  {
    id: "tpl.incident-response",
    name: "Incident Response",
    category: "Ops",
    description: "War room: supervisor, security, SRE, debugger, human approval. Time-boxed; no silent changes.",
    roles: [
      role("agent.supervisor", "Incident commander", "review", "Own impact, comms and the next action."),
      role("agent.debugger", "Debugger", "research", "Find the root cause with evidence."),
      role("agent.preset.sre", "SRE", "research", "Assess blast radius and recovery options."),
      role("agent.security", "Security", "security", "Rule in or out a security cause."),
      role("control.approval", "Human gate", "approval", "Human approves any change to a live system."),
    ],
    defaultSuccessCriteria: ["Root cause is evidenced", "Blast radius is stated", "Next action is explicit"],
    defaultConstraints: ["No change to production without human approval"],
    budget: { maxCostUsd: 6, maxWallClockMs: 30 * 60 * 1000 },
    policy: { autonomy: "HUMAN_ONLY", approvalThreshold: "MEDIUM" },
    boundary: { shell: true, filesystemRead: true, filesystemWrite: false },
    preferredFramework: "fw.war-room",
    origin: "built-in",
  },
  {
    id: "tpl.migration",
    name: "Migration",
    category: "Engineering",
    description: "Canary → verify → full → QA. The second pass sees the canary evidence.",
    roles: [
      role("agent.architect", "Migration architect", "architecture", "Plan the migration and the rollback path."),
      role("agent.coder", "Canary", "implementation", "Migrate one representative slice."),
      role("agent.tester", "Canary tester", "test", "Verify the slice end to end."),
      role("agent.coder", "Full migration", "implementation", "Migrate the rest, using the canary evidence."),
      role("agent.qa", "QA", "test", "Gate the result."),
    ],
    defaultSuccessCriteria: ["Rollback path exists and is tested", "No data loss"],
    defaultConstraints: ["Reversible at every step"],
    budget: { maxCostUsd: 15 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "HIGH" },
    boundary: { shell: true, filesystemWrite: true, credentials: false },
    preferredFramework: "fw.canary",
    origin: "built-in",
  },
  {
    id: "tpl.release-engineering",
    name: "Release Engineering",
    category: "Release",
    description: "Cut → changelog → gates → human release decision.",
    roles: [
      role("agent.tester", "Release verifier", "test", "Run the full suite. Record output."),
      role("agent.docs", "Changelog author", "synthesis", "Write the changelog from what actually changed."),
      role("agent.security", "Release security", "security", "Confirm no new high-severity finding ships."),
      role("control.approval", "Release decision", "release", "Human decides whether to ship."),
    ],
    defaultSuccessCriteria: ["Suite passes", "Changelog matches the diff"],
    defaultConstraints: ["No release without human approval"],
    budget: { maxCostUsd: 6 },
    policy: { autonomy: "HUMAN_ONLY" },
    boundary: { shell: true, filesystemWrite: true },
    preferredFramework: "fw.staged-approval",
    origin: "built-in",
  },
];

export const TEMPLATE_BY_ID = new Map(MISSION_TEMPLATES.map((t) => [t.id, t]));

export function getTemplate(id: string): MissionTemplate | null {
  return TEMPLATE_BY_ID.get(id) ?? null;
}

/** Instantiate a template as a DRAFT mission. Nothing executes. */
export function instantiateTemplate(
  templateId: string,
  input: { name?: string; objective: string; description?: string; workspace?: string; deadline?: string | null },
): Mission {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`unknown mission template ${templateId}`);
  const now = new Date().toISOString();
  return {
    missionId: uid("msn"),
    name: input.name || `${t.name}: ${truncate(input.objective, 48)}`,
    objective: input.objective,
    description: input.description ?? t.description,
    constraints: [...t.defaultConstraints],
    successCriteria: [...t.defaultSuccessCriteria],
    deadline: input.deadline ?? null,
    budget: { ...DEFAULT_BUDGET, ...t.budget },
    riskPolicy: { ...DEFAULT_POLICY, ...t.policy },
    boundary: { ...DEFAULT_BOUNDARY, ...t.boundary },
    allowedHarnesses: [],
    allowedTools: [],
    allowedMcpServers: [],
    allowedAgents: t.roles.map((r) => r.definitionId),
    preferredFramework: t.preferredFramework,
    workspace: input.workspace ?? ".",
    templateId: t.id,
    priority: "NORMAL",
    status: "DRAFT",
    workflowId: null,
    graphVersion: 0,
    checkpointId: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    endedAt: null,
  };
}

/**
 * §27 Turn a finished mission into a reusable template. Only the shape is kept; the
 * objective, artifacts and trace are not.
 */
export function templateFromMission(
  mission: Mission,
  roster: Array<{ definitionId: string; title: string; kind: PlanStepKind; purpose: string }>,
  notes?: string,
): MissionTemplate {
  return {
    id: `tpl.${mission.missionId}`,
    name: mission.name,
    category: "Distilled",
    description: notes ?? `Distilled from mission ${mission.missionId}.`,
    roles: roster,
    defaultSuccessCriteria: [...mission.successCriteria],
    defaultConstraints: [...mission.constraints],
    budget: { ...mission.budget },
    policy: { ...mission.riskPolicy },
    boundary: { ...mission.boundary },
    preferredFramework: mission.preferredFramework,
    origin: "distilled",
  };
}

export function describeTemplate(t: MissionTemplate): string {
  return [
    `${t.name} (${t.category})`,
    t.description,
    "",
    "Roster:",
    ...t.roles.map((r, i) => `  ${i + 1}. ${r.title} [${r.definitionId}] — ${r.purpose}`),
    "",
    `Success: ${t.defaultSuccessCriteria.join("; ")}`,
    `Constraints: ${t.defaultConstraints.join("; ") || "none"}`,
    `Autonomy: ${t.policy.autonomy ?? DEFAULT_POLICY.autonomy}, approval threshold ${t.policy.approvalThreshold ?? DEFAULT_POLICY.approvalThreshold}`,
  ].join("\n");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
