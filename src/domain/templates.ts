import { createNodeFromDef } from "../graph/factory";
import { DEFINITIONS_BY_ID } from "./nodeLibrary";
import type { NodeInstance } from "./types";

export interface TemplateStep {
  key: string;
  defId: string;
  x: number;
  y: number;
  purpose?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  steps: TemplateStep[];
  wires: Array<[string, string, string, string]>;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "real-agent-crew",
    name: "Real Agent Crew",
    category: "Engineering",
    description: "Start → Claude/Codex/OpenCode crew → End. Not Zapier. Requires those CLIs on PATH.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "crew", defId: "agent.crew", x: 400, y: 180, purpose: "Ship the assigned coding task using the local CLIs as a team." },
      { key: "e", defId: "control.end", x: 760, y: 220 },
    ],
    wires: [
      ["s", "payload", "crew", "goal"],
      ["crew", "result", "e", "result"],
    ],
  },
  {
    id: "research-write-review",
    name: "Research → Write → Review",
    category: "Knowledge",
    description: "Investigate a question, synthesize a document, then review it.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "r", defId: "agent.researcher", x: 360, y: 80, purpose: "Research the assigned question with cited evidence." },
      { key: "d", defId: "agent.docs", x: 360, y: 340, purpose: "Write a clear document from the findings." },
      { key: "v", defId: "agent.reviewer", x: 680, y: 200, purpose: "Review the document for accuracy and gaps." },
      { key: "e", defId: "control.end", x: 980, y: 220 },
    ],
    wires: [
      ["s", "payload", "r", "query"],
      ["r", "findings", "d", "source"],
      ["d", "document", "v", "workProduct"],
      ["v", "review", "e", "result"],
    ],
  },
  {
    id: "code-test-review",
    name: "Code → Test → Review",
    category: "Engineering",
    description: "Implement a task, verify it, then peer-review.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 240 },
      { key: "c", defId: "agent.coder", x: 360, y: 80 },
      { key: "t", defId: "agent.tester", x: 360, y: 360 },
      { key: "v", defId: "agent.reviewer", x: 680, y: 220 },
      { key: "e", defId: "control.end", x: 980, y: 240 },
    ],
    wires: [
      ["s", "payload", "c", "task"],
      ["c", "result", "t", "subject"],
      ["c", "result", "v", "workProduct"],
      ["t", "report", "e", "result"],
      ["v", "review", "e", "result"],
    ],
  },
  {
    id: "plan-parallel-synth",
    name: "Plan → Parallel Research → Synthesize",
    category: "Knowledge",
    description: "Plan, fan out research, then merge.",
    steps: [
      { key: "s", defId: "control.start", x: 60, y: 260 },
      { key: "p", defId: "agent.planner", x: 320, y: 240 },
      { key: "fan", defId: "control.parallel", x: 580, y: 240 },
      { key: "r1", defId: "agent.researcher", x: 820, y: 80 },
      { key: "r2", defId: "agent.researcher", x: 820, y: 400 },
      { key: "y", defId: "agent.synthesizer", x: 1100, y: 240 },
      { key: "e", defId: "control.end", x: 1380, y: 260 },
    ],
    wires: [
      ["s", "payload", "p", "goal"],
      ["p", "plan", "fan", "input"],
      ["fan", "branch", "r1", "query"],
      ["fan", "branch", "r2", "query"],
      ["r1", "findings", "y", "inputs"],
      ["r2", "findings", "y", "inputs"],
      ["y", "synthesis", "e", "result"],
    ],
  },
  {
    id: "browser-extract",
    name: "Browse → Extract → Analyze",
    category: "Web",
    description: "Drive a browser, extract structured data, analyze it.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "sess", defId: "cap.browser", x: 340, y: 80 },
      { key: "b", defId: "agent.browser", x: 620, y: 200 },
      { key: "a", defId: "agent.preset.data-analyst", x: 920, y: 200 },
      { key: "e", defId: "control.end", x: 1220, y: 220 },
    ],
    wires: [
      ["s", "payload", "b", "objective"],
      ["sess", "session", "b", "session"],
      ["b", "extractedData", "a", "brief"],
      ["a", "deliverable", "e", "result"],
    ],
  },
  {
    id: "security-audit",
    name: "Security Audit",
    category: "Security",
    description: "Threat-model, review, and gate a change.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "sec", defId: "agent.security", x: 360, y: 80 },
      { key: "rev", defId: "agent.reviewer", x: 360, y: 360 },
      { key: "j", defId: "agent.judge", x: 680, y: 220 },
      { key: "h", defId: "control.approval", x: 960, y: 220 },
      { key: "e", defId: "control.end", x: 1240, y: 220 },
    ],
    wires: [
      ["s", "payload", "sec", "target"],
      ["s", "payload", "rev", "workProduct"],
      ["sec", "findings", "j", "artifact"],
      ["rev", "review", "j", "rubric"],
      ["j", "decision", "h", "proposal"],
      ["h", "approved", "e", "result"],
    ],
  },
  {
    id: "incident",
    name: "Incident Triage",
    category: "Operations",
    description: "Diagnose a failure, propose a fix, wait for approval.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 220 },
      { key: "d", defId: "agent.debugger", x: 360, y: 80 },
      { key: "sre", defId: "agent.preset.sre", x: 360, y: 360 },
      { key: "c", defId: "agent.coder", x: 680, y: 220 },
      { key: "h", defId: "control.approval", x: 980, y: 220 },
      { key: "e", defId: "control.end", x: 1260, y: 220 },
    ],
    wires: [
      ["s", "payload", "d", "symptom"],
      ["s", "payload", "sre", "brief"],
      ["d", "diagnosis", "c", "task"],
      ["c", "result", "h", "proposal"],
      ["h", "approved", "e", "result"],
    ],
  },
  {
    id: "docs-from-code",
    name: "Docs from Code",
    category: "Engineering",
    description: "Read a repo context and produce documentation.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 180 },
      { key: "d", defId: "agent.docs", x: 400, y: 160 },
      { key: "v", defId: "agent.reviewer", x: 720, y: 160 },
      { key: "e", defId: "control.end", x: 1040, y: 180 },
    ],
    wires: [
      ["s", "payload", "d", "source"],
      ["d", "document", "v", "workProduct"],
      ["v", "review", "e", "result"],
    ],
  },
  {
    id: "debate",
    name: "Multi-agent Debate",
    category: "Quality",
    description: "Proposal, critic, judge. High-signal decisions.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 240 },
      { key: "p", defId: "agent.planner", x: 340, y: 80 },
      { key: "k", defId: "agent.critic", x: 340, y: 380 },
      { key: "j", defId: "agent.judge", x: 680, y: 220 },
      { key: "e", defId: "control.end", x: 1000, y: 240 },
    ],
    wires: [
      ["s", "payload", "p", "goal"],
      ["p", "plan", "k", "proposal"],
      ["k", "critique", "j", "artifact"],
      ["p", "summary", "j", "rubric"],
      ["j", "decision", "e", "result"],
    ],
  },
  {
    id: "local-offline",
    name: "Local Offline Crew",
    category: "Local",
    description: "Plan and write using a local Ollama model. No cloud keys.",
    steps: [
      { key: "s", defId: "control.start", x: 80, y: 200 },
      { key: "p", defId: "agent.planner", x: 360, y: 80 },
      { key: "l", defId: "agent.local", x: 360, y: 340 },
      { key: "y", defId: "agent.synthesizer", x: 680, y: 200 },
      { key: "e", defId: "control.end", x: 980, y: 220 },
    ],
    wires: [
      ["s", "payload", "p", "goal"],
      ["p", "summary", "l", "prompt"],
      ["p", "plan", "y", "inputs"],
      ["l", "completion", "y", "inputs"],
      ["y", "synthesis", "e", "result"],
    ],
  },
  {
    id: "content-engine",
    name: "Content Engine",
    category: "Marketing",
    description: "Research, copy, SEO pass, human approval.",
    steps: [
      { key: "s", defId: "control.start", x: 60, y: 240 },
      { key: "r", defId: "agent.researcher", x: 320, y: 80 },
      { key: "c", defId: "agent.preset.copywriter", x: 320, y: 380 },
      { key: "seo", defId: "agent.preset.seo", x: 640, y: 220 },
      { key: "h", defId: "control.approval", x: 940, y: 220 },
      { key: "e", defId: "control.end", x: 1220, y: 240 },
    ],
    wires: [
      ["s", "payload", "r", "query"],
      ["s", "payload", "c", "brief"],
      ["r", "findings", "seo", "brief"],
      ["c", "deliverable", "seo", "context"],
      ["seo", "deliverable", "h", "proposal"],
      ["h", "approved", "e", "result"],
    ],
  },
];

export function templateFullyResolvable(id: string): boolean {
  const t = WORKFLOW_TEMPLATES.find((x) => x.id === id);
  if (!t) return false;
  return t.steps.every((s) => DEFINITIONS_BY_ID.has(s.defId));
}

export function loadTemplate(id: string): {
  instances: NodeInstance[];
  wires: Array<[string, string, string, string]>;
  skipped: string[];
} {
  const t = WORKFLOW_TEMPLATES.find((x) => x.id === id);
  if (!t) return { instances: [], wires: [], skipped: [id] };
  const skipped: string[] = [];
  const instances: NodeInstance[] = [];
  for (const step of t.steps) {
    const def = DEFINITIONS_BY_ID.get(step.defId);
    if (!def) {
      skipped.push(step.defId);
      continue;
    }
    const node = createNodeFromDef(def, `n-${step.key}-${Math.random().toString(36).slice(2, 7)}`, step.x, step.y);
    node.templateKey = step.key;
    if (step.purpose) node.purpose = step.purpose;
    instances.push(node);
  }
  return { instances, wires: t.wires, skipped };
}
