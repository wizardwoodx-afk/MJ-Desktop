/**
 * Mission replay: reconstructable state, not a transcript.
 *
 * `FlightRecorder.replay(seq)` already existed and already did the useful low-level thing — it hands
 * back the events up to a sequence number. What it cannot answer is *"what was true at that moment?"*,
 * because a list of events is a log, not a state. This module folds those events into a
 * `MissionProjection`: the agents that existed, which harness each was on, what had been spent, which
 * approvals were outstanding, and where the mission stood.
 *
 * That distinction is the whole point. A transcript tells you what was said; a projection tells you
 * what the mission was. With a projection you can scrub a timeline, diff two moments and get field-level
 * changes, and point at the exact sequence number where a decision was made — which is what makes
 * "why does this artifact exist" answerable in seconds rather than by reading a log.
 *
 * Honesty rule this module holds itself to: **a counterfactual never produces a result.** Asking "what
 * if a different harness had run this task?" yields a hypothetical selection plus an explicit statement
 * that the outcome is unknown. It would be trivial to synthesize a plausible outcome here, and doing so
 * would poison every decision made on the strength of it.
 */

import type { FlightEvent, MissionStatus } from "./types";
import type { HarnessId } from "../domain/harness";

/* ------------------------------------------------------------------ projection */

export interface AgentState {
  id: string;
  name: string;
  role: string;
  harness: string | null;
  /** True once the agent has been replaced or has failed without recovery. */
  retired: boolean;
  tasksAssigned: number;
  tasksCompleted: number;
  firstSeq: number;
  lastSeq: number;
}

export interface ArtifactState {
  id: string;
  title: string;
  versions: number;
  evaluated: boolean;
  passed: boolean | null;
  lastSeq: number;
}

export interface Decision {
  seq: number;
  /** Short label for the kind of decision, e.g. "harness selected". */
  label: string;
  kind: FlightEvent["kind"];
  actor: string;
  authority: string;
  reason: string;
  /** The evidence the decision rested on. Empty means the decision was recorded without any. */
  evidence: string[];
  /** True when a human, not a policy, authorised it. */
  byHuman: boolean;
  ts: string;
}

export interface MissionProjection {
  missionId: string;
  /** The sequence number this projection reflects. 0 for an empty trace. */
  uptoSeq: number;
  eventCount: number;
  status: MissionStatus | null;
  statusHistory: Array<{ seq: number; from: string | null; to: string; ts: string }>;
  agents: Record<string, AgentState>;
  artifacts: Record<string, ArtifactState>;
  /** Dollars reported by harnesses. Unknown stays unknown — see `spendKnown`. */
  spendUsd: number;
  spendKnown: boolean;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  humanInterventions: number;
  approvalsOutstanding: number;
  approvalsDecided: number;
  approvalsRejected: number;
  repairsAttempted: number;
  repairsCompleted: number;
  failuresDetected: number;
  resourceLimitsHit: number;
  policyDenials: number;
  rollbacks: number;
  checkpoints: number;
  decisions: Decision[];
  /** Kinds present in the trace, with counts. Useful for "was X ever even attempted?". */
  kindCounts: Record<string, number>;
}

/** Events that represent a decision rather than an observation, with the label the UI shows. */
const DECISION_LABELS: Partial<Record<FlightEvent["kind"], string>> = {
  HARNESS_SELECTED: "harness selected",
  HARNESS_SWITCHED: "harness switched",
  AGENT_ASSIGNED: "task assigned",
  AGENT_REPLACED: "agent replaced",
  TASK_DELEGATED: "task delegated",
  TASK_REASSIGNED: "task reassigned",
  TASK_SPLIT: "task split",
  TASK_MERGED: "tasks merged",
  GRAPH_MUTATED: "plan restructured",
  REPAIR_STARTED: "repair strategy chosen",
  RECOMMENDATION_EXECUTED: "recommendation executed",
  NEGOTIATION_RESOLVED: "negotiation resolved",
  MISSION_ROLLED_BACK: "mission rolled back",
  APPROVAL_GRANTED: "approval granted",
  APPROVAL_REJECTED: "approval rejected",
};

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.length ? v : fallback;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Usage figures arrive in different shapes from different harnesses, and a mission's events can carry
 * any of them. Reading only one shape is how a run ends up billed at $0 — so every plausible key is
 * tried, and the first finite number wins. `spendKnown` records whether anything was found at all.
 */
function readUsage(data: Record<string, unknown>): { usd: number | null; input: number; output: number; turns: number } {
  const usage = (data.usage && typeof data.usage === "object" ? data.usage : {}) as Record<string, unknown>;
  const usdCandidates = [data.costUsd, data.totalCostUsd, data.cost, usage.cost, usage.totalCostUsd];
  let usd: number | null = null;
  for (const c of usdCandidates) {
    if (typeof c === "number" && Number.isFinite(c)) {
      usd = c;
      break;
    }
  }
  return {
    usd,
    input: num(data.inputTokens ?? usage.inputTokens ?? usage.input_tokens),
    output: num(data.outputTokens ?? usage.outputTokens ?? usage.output_tokens),
    turns: num(data.turns ?? data.numTurns ?? data.num_turns),
  };
}

/**
 * Fold events into the state they describe.
 *
 * Tolerant by design: `FlightEvent.data` is `Record<string, unknown>`, so a missing or differently
 * shaped field must degrade to "unknown" rather than throw. A replay that crashes on one unexpected
 * event is worse than no replay, because it happens exactly when someone is trying to debug.
 */
export function project(events: FlightEvent[], missionId = ""): MissionProjection {
  const p: MissionProjection = {
    missionId,
    uptoSeq: 0,
    eventCount: events.length,
    status: null,
    statusHistory: [],
    agents: {},
    artifacts: {},
    spendUsd: 0,
    spendKnown: false,
    inputTokens: 0,
    outputTokens: 0,
    turns: 0,
    humanInterventions: 0,
    approvalsOutstanding: 0,
    approvalsDecided: 0,
    approvalsRejected: 0,
    repairsAttempted: 0,
    repairsCompleted: 0,
    failuresDetected: 0,
    resourceLimitsHit: 0,
    policyDenials: 0,
    rollbacks: 0,
    checkpoints: 0,
    decisions: [],
    kindCounts: {},
  };

  // Events must be folded in order or the projection describes a mission that never happened.
  const ordered = [...events].sort((a, b) => a.seq - b.seq);

  for (const e of ordered) {
    const d = e.data ?? {};
    p.uptoSeq = Math.max(p.uptoSeq, e.seq);
    p.kindCounts[e.kind] = (p.kindCounts[e.kind] ?? 0) + 1;
    if (!p.missionId) p.missionId = e.missionId;

    const usage = readUsage(d);
    if (usage.usd !== null) {
      p.spendUsd += usage.usd;
      p.spendKnown = true;
    }
    p.inputTokens += usage.input;
    p.outputTokens += usage.output;
    p.turns += usage.turns;

    const label = DECISION_LABELS[e.kind];
    if (label) {
      p.decisions.push({
        seq: e.seq,
        label,
        kind: e.kind,
        actor: e.actor,
        authority: e.authority,
        reason: e.reason,
        evidence: e.evidence ?? [],
        byHuman: e.authority === "human" || e.authority.startsWith("human:"),
        ts: e.ts,
      });
    }

    switch (e.kind) {
      case "MISSION_CREATED":
      case "MISSION_PLANNED":
      case "MISSION_STATUS": {
        const to = str(d.to ?? d.status);
        if (to) {
          p.statusHistory.push({ seq: e.seq, from: typeof d.from === "string" ? d.from : null, to, ts: e.ts });
          p.status = to as MissionStatus;
        }
        break;
      }
      case "MISSION_COMPLETED":
        p.status = "COMPLETED";
        break;
      case "MISSION_FAILED":
        p.status = "FAILED";
        break;
      case "MISSION_CHECKPOINTED":
        p.checkpoints += 1;
        break;
      case "MISSION_ROLLED_BACK":
        p.rollbacks += 1;
        break;

      case "AGENT_SPAWNED":
      case "AGENT_ASSIGNED": {
        const id = str(d.agentId ?? e.subjectId, e.subjectId ?? "");
        if (!id) break;
        const a = (p.agents[id] ??= {
          id,
          name: str(d.name ?? d.role, id),
          role: str(d.role, "unspecified"),
          harness: typeof d.harness === "string" ? d.harness : null,
          retired: false,
          tasksAssigned: 0,
          tasksCompleted: 0,
          firstSeq: e.seq,
          lastSeq: e.seq,
        });
        a.lastSeq = e.seq;
        if (typeof d.harness === "string") a.harness = d.harness;
        if (typeof d.role === "string") a.role = d.role;
        if (e.kind === "AGENT_ASSIGNED") a.tasksAssigned += 1;
        break;
      }
      case "AGENT_REPLACED": {
        const id = str(d.agentId ?? e.subjectId);
        if (id && p.agents[id]) {
          p.agents[id].retired = true;
          p.agents[id].lastSeq = e.seq;
        }
        const next = str(d.replacementId ?? d.newAgentId);
        if (next) {
          p.agents[next] ??= {
            id: next,
            name: str(d.replacementName, next),
            role: str(d.role, "unspecified"),
            harness: typeof d.harness === "string" ? d.harness : null,
            retired: false,
            tasksAssigned: 0,
            tasksCompleted: 0,
            firstSeq: e.seq,
            lastSeq: e.seq,
          };
        }
        break;
      }
      case "AGENT_FAILED": {
        const id = str(d.agentId ?? e.subjectId);
        if (id && p.agents[id]) p.agents[id].lastSeq = e.seq;
        break;
      }
      case "AGENT_RECOVERED": {
        const id = str(d.agentId ?? e.subjectId);
        if (id && p.agents[id]) {
          p.agents[id].retired = false;
          p.agents[id].lastSeq = e.seq;
        }
        break;
      }

      case "HARNESS_SELECTED":
      case "HARNESS_SWITCHED": {
        const id = str(d.agentId ?? e.subjectId);
        const harness = str(d.harness ?? d.to);
        if (id && harness && p.agents[id]) {
          p.agents[id].harness = harness;
          p.agents[id].lastSeq = e.seq;
        }
        break;
      }

      case "TASK_COMPLETED": {
        const id = str(d.agentId ?? e.subjectId);
        if (id && p.agents[id]) {
          p.agents[id].tasksCompleted += 1;
          p.agents[id].lastSeq = e.seq;
        }
        break;
      }

      case "ARTIFACT_CREATED": {
        const id = str(d.artifactId ?? e.subjectId, e.subjectId ?? "");
        if (!id) break;
        p.artifacts[id] = {
          id,
          title: str(d.title ?? d.name, id),
          versions: 1,
          evaluated: false,
          passed: null,
          lastSeq: e.seq,
        };
        break;
      }
      case "ARTIFACT_VERSIONED": {
        const id = str(d.artifactId ?? e.subjectId);
        if (id && p.artifacts[id]) {
          p.artifacts[id].versions += 1;
          p.artifacts[id].lastSeq = e.seq;
        }
        break;
      }
      case "EVALUATION_PASSED":
      case "EVALUATION_FAILED": {
        const id = str(d.artifactId ?? e.subjectId);
        if (id && p.artifacts[id]) {
          p.artifacts[id].evaluated = true;
          p.artifacts[id].passed = e.kind === "EVALUATION_PASSED";
          p.artifacts[id].lastSeq = e.seq;
        }
        break;
      }

      case "APPROVAL_REQUIRED":
        p.approvalsOutstanding += 1;
        p.humanInterventions += 1;
        break;
      case "APPROVAL_GRANTED":
        p.approvalsOutstanding = Math.max(0, p.approvalsOutstanding - 1);
        p.approvalsDecided += 1;
        break;
      case "APPROVAL_REJECTED":
        p.approvalsOutstanding = Math.max(0, p.approvalsOutstanding - 1);
        p.approvalsDecided += 1;
        p.approvalsRejected += 1;
        break;

      case "REPAIR_STARTED":
        p.repairsAttempted += 1;
        break;
      case "REPAIR_COMPLETED":
        p.repairsCompleted += 1;
        break;
      case "FAILURE_DETECTED":
        p.failuresDetected += 1;
        break;
      case "RESOURCE_LIMIT":
        p.resourceLimitsHit += 1;
        break;
      case "POLICY_DENIED":
        p.policyDenials += 1;
        break;
      default:
        break;
    }
  }

  return p;
}

/* ------------------------------------------------------------------ diffing */

export interface ProjectionDelta {
  seq: number;
  field: string;
  from: string;
  to: string;
}

export interface ProjectionDiff {
  fromSeq: number;
  toSeq: number;
  changes: ProjectionDelta[];
  agentsAdded: string[];
  agentsRetired: string[];
  artifactsAdded: string[];
  /** Decisions made strictly between the two points. */
  decisionsBetween: Decision[];
  /** True when nothing observable changed, which is itself worth stating. */
  identical: boolean;
}

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return String(v);
};

/**
 * Field-level difference between two moments in a mission.
 *
 * Numeric counters are compared so a reader sees "spend 0.00 → 0.42" rather than having to subtract two
 * panels in their head. Only scalar fields are diffed; nested records are summarised by key count, which
 * is enough to spot "an agent appeared" without pretending to a full structural diff.
 */
export function diffProjections(a: MissionProjection, b: MissionProjection): ProjectionDiff {
  const changes: ProjectionDelta[] = [];

  const scalars: Array<keyof MissionProjection> = [
    "status",
    "spendUsd",
    "spendKnown",
    "inputTokens",
    "outputTokens",
    "turns",
    "humanInterventions",
    "approvalsOutstanding",
    "approvalsDecided",
    "approvalsRejected",
    "repairsAttempted",
    "repairsCompleted",
    "failuresDetected",
    "resourceLimitsHit",
    "policyDenials",
    "rollbacks",
    "checkpoints",
    "eventCount",
  ];
  for (const k of scalars) {
    const av = a[k];
    const bv = b[k];
    if (av !== bv) changes.push({ seq: b.uptoSeq, field: k as string, from: fmt(av), to: fmt(bv) });
  }

  const aAgents = new Set(Object.keys(a.agents));
  const bAgents = new Set(Object.keys(b.agents));
  const agentsAdded = [...bAgents].filter((id) => !aAgents.has(id));
  const agentsRetired = [...bAgents].filter((id) => a.agents[id] && !a.agents[id].retired && b.agents[id]?.retired);
  for (const id of [...aAgents].filter((x) => bAgents.has(x))) {
    const aa = a.agents[id];
    const bb = b.agents[id];
    if (!aa || !bb) continue;
    if (aa.harness !== bb.harness) changes.push({ seq: bb.lastSeq, field: `agent ${id} harness`, from: fmt(aa.harness), to: fmt(bb.harness) });
    if (aa.tasksCompleted !== bb.tasksCompleted) changes.push({ seq: bb.lastSeq, field: `agent ${id} tasks completed`, from: fmt(aa.tasksCompleted), to: fmt(bb.tasksCompleted) });
    if (aa.retired !== bb.retired) changes.push({ seq: bb.lastSeq, field: `agent ${id} active`, from: fmt(!aa.retired), to: fmt(!bb.retired) });
  }

  const artifactsAdded = Object.keys(b.artifacts).filter((id) => !a.artifacts[id]);
  for (const id of Object.keys(a.artifacts).filter((x) => b.artifacts[x])) {
    const av = a.artifacts[id];
    const bv = b.artifacts[id];
    if (!av || !bv) continue;
    if (av.versions !== bv.versions) changes.push({ seq: bv.lastSeq, field: `artifact ${id} versions`, from: fmt(av.versions), to: fmt(bv.versions) });
    if (av.passed !== bv.passed) changes.push({ seq: bv.lastSeq, field: `artifact ${id} evaluation`, from: fmt(av.passed), to: fmt(bv.passed) });
  }

  const decisionsBetween = b.decisions.filter((d) => d.seq > a.uptoSeq && d.seq <= b.uptoSeq);

  return {
    fromSeq: a.uptoSeq,
    toSeq: b.uptoSeq,
    changes,
    agentsAdded,
    agentsRetired,
    artifactsAdded,
    decisionsBetween,
    identical: changes.length === 0 && !agentsAdded.length && !artifactsAdded.length,
  };
}

/* ------------------------------------------------------------------ decision points */

/**
 * Find where a mission turned.
 *
 * Returns the decision at or before `seq`, plus the projection immediately before and after it, so a
 * reader can see the state on both sides of the choice. This is the "why does this artifact exist"
 * question, answered with the surrounding state rather than a single log line.
 */
export function decisionAt(events: FlightEvent[], seq: number): {
  decision: Decision | null;
  before: MissionProjection;
  after: MissionProjection;
  diff: ProjectionDiff;
} | null {
  const p = project(events.filter((e) => e.seq <= seq));
  const decision = [...p.decisions].reverse().find((d) => d.seq <= seq) ?? null;
  if (!decision) return null;
  const before = project(events.filter((e) => e.seq < decision.seq));
  const after = project(events.filter((e) => e.seq <= decision.seq));
  return { decision, before, after, diff: diffProjections(before, after) };
}

/* ------------------------------------------------------------------ counterfactuals */

export interface Counterfactual {
  atSeq: number;
  question: string;
  /** The hypothetical change. */
  hypothesis: string;
  /**
   * Always the same string, and deliberately so. Replaying with a different harness would require
   * re-running the agent, which replay cannot do. Anything else here would be invented.
   */
  outcome: "unknown — this was not re-run";
  /** What would have to be true for the hypothesis to be testable. */
  wouldRequire: string[];
}

/**
 * State what a different choice would have needed, without inventing what it would have produced.
 *
 * The temptation here is to score the alternative and show a number. That number would be fiction: the
 * alternative harness was never run on this task, so there is no evidence about it. MJ's rule is that
 * metrics come from what actually happened, so a counterfactual reports its own ignorance and lists what
 * a real test would require.
 */
export function counterfactualHarness(events: FlightEvent[], seq: number, alternative: HarnessId): Counterfactual {
  const p = project(events.filter((e) => e.seq <= seq));
  const actual = p.decisions.filter((d) => d.kind === "HARNESS_SELECTED" || d.kind === "HARNESS_SWITCHED").pop();
  const harnessEvent = [...events].reverse().find((e) => (e.kind === "HARNESS_SELECTED" || e.kind === "HARNESS_SWITCHED") && e.seq <= seq);
  const usedHarness = harnessEvent ? str(harnessEvent.data?.harness ?? harnessEvent.data?.to, "unknown") : "unknown";

  return {
    atSeq: seq,
    question: `What if ${alternative} had run this instead of ${usedHarness}?`,
    hypothesis: `Replace harness ${usedHarness} with ${alternative} at seq ${seq}${actual ? ` (the ${actual.label} decision)` : ""}.`,
    outcome: "unknown — this was not re-run",
    wouldRequire: [
      `re-running the task with ${alternative} against the same inputs`,
      "the same verification commands, so the two runs are comparable",
      "a recorded result from that run — a projection cannot produce one",
    ],
  };
}

/* ------------------------------------------------------------------ rendering */

/**
 * A text rendering of a projection, for the console and for prompts.
 *
 * Spend is rendered as "unknown" unless a harness actually reported a cost. Printing $0.00 for a run
 * whose cost was never reported is the single most misleading thing this module could do.
 */
export function renderProjection(p: MissionProjection): string {
  const lines: string[] = [
    `Mission ${p.missionId || "(unknown)"} at seq ${p.uptoSeq} — ${p.eventCount} events`,
    `  status            ${p.status ?? "—"}`,
    `  agents            ${Object.keys(p.agents).length} (${Object.values(p.agents).filter((a) => a.retired).length} retired)`,
    `  artifacts         ${Object.keys(p.artifacts).length}`,
    `  spend             ${p.spendKnown ? `$${p.spendUsd.toFixed(4)}` : "unknown — no harness reported a cost"}`,
    `  tokens            ${p.inputTokens.toLocaleString()} in / ${p.outputTokens.toLocaleString()} out`,
    `  turns             ${p.turns}`,
    `  approvals         ${p.approvalsOutstanding} outstanding, ${p.approvalsDecided} decided (${p.approvalsRejected} rejected)`,
    `  repairs           ${p.repairsCompleted}/${p.repairsAttempted} completed`,
    `  failures          ${p.failuresDetected} detected`,
    `  limits / denials  ${p.resourceLimitsHit} resource limits, ${p.policyDenials} policy denials`,
    `  checkpoints       ${p.checkpoints} taken, ${p.rollbacks} rollbacks`,
  ];

  const agentRows = Object.values(p.agents);
  if (agentRows.length) {
    lines.push("", "  agents:");
    for (const a of agentRows) {
      lines.push(`    ${a.id.padEnd(18)} ${a.role.padEnd(14)} harness=${a.harness ?? "—"}  ${a.tasksCompleted}/${a.tasksAssigned} tasks${a.retired ? "  (retired)" : ""}`);
    }
  }

  if (p.decisions.length) {
    lines.push("", "  decisions:");
    for (const d of p.decisions.slice(-12)) {
      lines.push(`    [${d.seq}] ${d.label} by ${d.actor} (${d.authority})${d.evidence.length ? ` — ${d.evidence.length} evidence` : " — no evidence recorded"}`);
    }
    if (p.decisions.length > 12) lines.push(`    … ${p.decisions.length - 12} earlier`);
  }

  return lines.join("\n");
}

/** Scrubber positions for a timeline UI: every seq that changed something observable. */
export function timelineTicks(events: FlightEvent[], maxTicks = 40): number[] {
  const p = project(events);
  const decisionSeqs = p.decisions.map((d) => d.seq);
  const interesting = new Set<number>([...decisionSeqs]);
  for (const e of events) {
    if (e.kind === "MISSION_STATUS" || e.kind === "RESOURCE_LIMIT" || e.kind === "FAILURE_DETECTED" || e.kind === "APPROVAL_REQUIRED") {
      interesting.add(e.seq);
    }
  }
  const sorted = [...interesting].sort((a, b) => a - b);
  if (sorted.length <= maxTicks) return sorted;
  const step = sorted.length / maxTicks;
  const out: number[] = [];
  for (let i = 0; i < maxTicks; i++) out.push(sorted[Math.floor(i * step)] as number);
  if (out[out.length - 1] !== sorted[sorted.length - 1]) out.push(sorted[sorted.length - 1] as number);
  return out;
}
