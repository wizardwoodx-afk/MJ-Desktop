import { createNodeFromDef } from "../graph/factory";
import { AGENT_FRAMEWORKS, type AgentFramework } from "./frameworks";
import { DEFINITIONS_BY_ID } from "./nodeLibrary";
import type { NodeInstance } from "./types";

export interface TeamMember {
  definitionId: string;
  title: string;
  harness: string;
  purpose?: string;
}

export interface TeamWorkspace {
  id: string;
  name: string;
  description: string;
  /** Shared memory namespace so the same team remembers across tasks. */
  memoryKey: string;
  frameworkId: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

export function teamFromFramework(fw: AgentFramework, name?: string): Omit<TeamWorkspace, "id" | "createdAt" | "updatedAt"> {
  const members: TeamMember[] = fw.roster
    .filter((id) => DEFINITIONS_BY_ID.has(id))
    .map((id) => {
      const def = DEFINITIONS_BY_ID.get(id)!;
      return {
        definitionId: id,
        title: def.title,
        harness: def.category === "agent" ? "hermes" : "",
      };
    });
  return {
    name: name || fw.name,
    description: fw.description,
    memoryKey: `team:${(name || fw.id).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    frameworkId: fw.id,
    members,
  };
}

export function instantiateTeam(team: TeamWorkspace, task: string): {
  nodes: NodeInstance[];
  wires: Array<[string, string, string, string]>;
} {
  const fw = AGENT_FRAMEWORKS.find((f) => f.id === team.frameworkId);
  const nodes: NodeInstance[] = [];
  const startDef = DEFINITIONS_BY_ID.get("control.start")!;
  const endDef = DEFINITIONS_BY_ID.get("control.end")!;
  const start = createNodeFromDef(startDef, `n-start-${rand()}`, 80, 240);
  start.templateKey = "s";
  start.config.initialPayload = JSON.stringify({ task }, null, 2);
  nodes.push(start);

  const agents: NodeInstance[] = [];
  team.members.forEach((m, i) => {
    const def = DEFINITIONS_BY_ID.get(m.definitionId);
    if (!def) return;
    const n = createNodeFromDef(def, `n-${i}-${rand()}`, 360 + (i % 4) * 300, 80 + Math.floor(i / 4) * 220);
    n.templateKey = `m${i}`;
    n.title = m.title;
    if (def.category === "agent") {
      n.config.harness = m.harness || "hermes";
      n.config.teamMemoryKey = team.memoryKey;
      n.purpose = m.purpose || task;
      n.memoryEnabled = true;
    }
    agents.push(n);
    nodes.push(n);
  });

  const end = createNodeFromDef(endDef, `n-end-${rand()}`, 360 + Math.min(agents.length, 4) * 300, 240);
  end.templateKey = "e";
  nodes.push(end);

  const wires: Array<[string, string, string, string]> = [];
  const wire = (a: NodeInstance, ap: string, b: NodeInstance, bp: string) => {
    wires.push([String(a.templateKey), ap, String(b.templateKey), bp]);
  };

  const pattern = fw?.pattern ?? "pipeline";
  if (agents.length === 0) {
    wire(start, "payload", end, "result");
  } else if (pattern === "map-reduce" || pattern === "swarm" || pattern === "council" || pattern === "shadow") {
    const last = agents[agents.length - 1];
    const body = agents.slice(0, -1);
    for (const a of body.length ? body : agents) wire(start, "payload", a, a.inputs[0]?.id ?? "input");
    for (const a of body) wire(a, a.outputs[0]?.id ?? "output", last, last.inputs[0]?.id ?? "input");
    if (!body.length) wire(start, "payload", last, last.inputs[0]?.id ?? "input");
    wire(last, last.outputs[0]?.id ?? "output", end, "result");
  } else {
    wire(start, "payload", agents[0], agents[0].inputs[0]?.id ?? "input");
    for (let i = 0; i < agents.length - 1; i++) {
      wire(agents[i], agents[i].outputs[0]?.id ?? "output", agents[i + 1], agents[i + 1].inputs[0]?.id ?? "input");
    }
    wire(agents[agents.length - 1], agents[agents.length - 1].outputs[0]?.id ?? "output", end, "result");
  }

  return { nodes, wires };
}

function rand() {
  return Math.random().toString(36).slice(2, 8);
}

const LS = "mj.v5.teams";

export function loadTeamsLocal(): TeamWorkspace[] {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return [];
    return JSON.parse(raw) as TeamWorkspace[];
  } catch {
    return [];
  }
}

export function saveTeamsLocal(teams: TeamWorkspace[]) {
  localStorage.setItem(LS, JSON.stringify(teams));
}
