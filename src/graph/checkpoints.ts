/**
 * §CHECKPOINTS — named time-travel for the graph (MJ 11.9.5).
 *
 * Researched grounding: LangGraph's checkpointer is the production reference — graph state is
 * saved at a point in time, organised by thread, and any checkpoint can be restored to replay
 * or recover (zylos.ai durable-execution survey 2026: Temporal/Inngest/LangGraph all expose
 * checkpoint+replay as the durability primitive). MJ applies the same idea to the DESIGN graph:
 * name a moment, keep its exact node/wire state, restore it later — and restoration rides the
 * existing undo stack, so even a restore can be undone.
 *
 * Pure + storage wrapper. No DOM in the pure half; storage falls back to memory when
 * localStorage is unavailable (Node probes, sandboxed iframes).
 */
import type { WorkflowGraph } from "../domain/types";

export interface GraphCheckpoint {
  id: string;
  name: string;
  ts: string;
  workflowId: string;
  counts: { nodes: number; connections: number };
  graph: WorkflowGraph;
}

export const CHECKPOINT_CAP = 25;

let seq = 0;
const uid = (p: string): string => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createCheckpoint(name: string, graph: WorkflowGraph): GraphCheckpoint {
  return {
    id: uid("cp"),
    name: name.trim() || "Untitled checkpoint",
    ts: new Date().toISOString(),
    workflowId: graph.id,
    counts: { nodes: graph.nodes.length, connections: graph.connections.length },
    graph: structuredClone(graph),
  };
}

/** Structural equality of two graphs IGNORING viewport (a pan is not a change worth saving). */
export function graphsStructurallyEqual(a: WorkflowGraph, b: WorkflowGraph): boolean {
  const strip = (g: WorkflowGraph) =>
    JSON.stringify({ nodes: g.nodes, connections: g.connections, notes: g.notes ?? [], groups: g.groups ?? [] });
  return strip(a) === strip(b);
}

/** Append with policy: never store a duplicate of the newest, never exceed the cap. */
export function addCheckpoint(list: GraphCheckpoint[], cp: GraphCheckpoint): { list: GraphCheckpoint[]; skipped: boolean } {
  if (list.length > 0 && graphsStructurallyEqual(list[0].graph, cp.graph)) return { list, skipped: true };
  return { list: [cp, ...list].slice(0, CHECKPOINT_CAP), skipped: false };
}

/** Restore = the saved graph, but keep the viewport the human is looking at right now. */
export function restoreGraph(current: WorkflowGraph, cp: GraphCheckpoint): WorkflowGraph {
  const g = structuredClone(cp.graph);
  g.viewport = structuredClone(current.viewport);
  return g;
}

/* --- persistence (LS with memory fallback, same honesty as autonomyStore) --- */
const LS_KEY = "mj.checkpoints.v1";
const memory: GraphCheckpoint[] = [];

export function loadCheckpoints(): GraphCheckpoint[] {
  try {
    if (typeof localStorage === "undefined") return memory;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return memory;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as GraphCheckpoint[]) : memory;
  } catch {
    return memory;
  }
}

export function saveCheckpoints(list: GraphCheckpoint[]): void {
  memory.length = 0;
  memory.push(...list);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* memory copy already holds it */
  }
}
