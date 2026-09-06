/**
 * §PREFLIGHT LINT — "ESLint for the graph" (MJ 11.9.5).
 *
 * Researched grounding: n8n ships FlowLint ("ESLint for automations" — problems BEFORE you run)
 * and the OSS n8n-workflow-validator separates structural checks (missing connections, bad types)
 * from parameter checks, each with a code + severity. Dagster does the same for assets. MJ's run
 * path used to fail late and vaguely; the linter fails early and specifically.
 *
 * Pure: graph in → issues out. No DOM, no store, fully probe-able offline.
 *
 * Severities are honest:
 *   error  → the run is REFUSED (dangling wire, type mismatch, duplicate wire, cycle)
 *   warn   → the run proceeds, but the graph is probably not what the human meant
 *   info   → nothing is wrong, there is just nothing to run yet
 */
import { portsCompatible } from "../domain/dataTypes";
import type { WorkflowGraph } from "../domain/types";

export type LintSeverity = "error" | "warn" | "info";

export interface LintIssue {
  code: string;
  severity: LintSeverity;
  nodeId: string | null;
  message: string;
}

/** Human name for a node, for messages. */
const nameOf = (g: WorkflowGraph, id: string): string => g.nodes.find((n) => n.id === id)?.title ?? id;

export function lintGraph(g: WorkflowGraph): LintIssue[] {
  const issues: LintIssue[] = [];
  const byId = new Map(g.nodes.map((n) => [n.id, n]));

  if (g.nodes.length === 0) {
    issues.push({ code: "EMPTY_GRAPH", severity: "info", nodeId: null, message: "The canvas is empty — drop a node from the library or load a template." });
    return issues;
  }
  if (g.nodes.length === 1) {
    issues.push({ code: "SINGLE_NODE", severity: "info", nodeId: g.nodes[0].id, message: "Only one node — nothing to flow yet." });
  }

  /* — ERROR checks: the run refuses these — */
  const seenWire = new Set<string>();
  for (const c of g.connections) {
    const sn = byId.get(c.sourceNodeId);
    const tn = byId.get(c.targetNodeId);
    if (!sn || !tn) {
      issues.push({ code: "DANGLING_WIRE", severity: "error", nodeId: c.sourceNodeId, message: `A wire references a node that no longer exists (${!sn ? c.sourceNodeId : c.targetNodeId}).` });
      continue;
    }
    const sp = sn.outputs.find((p) => p.id === c.sourcePortId);
    const tp = tn.inputs.find((p) => p.id === c.targetPortId);
    if (!sp || !tp) {
      issues.push({ code: "DANGLING_WIRE", severity: "error", nodeId: sn.id, message: `"${sn.title}" → "${tn.title}": a wire is attached to a port that no longer exists.` });
      continue;
    }
    if (!portsCompatible(sp.dataType, tp.dataType)) {
      issues.push({ code: "TYPE_MISMATCH", severity: "error", nodeId: tn.id, message: `"${sn.title}·${sp.label}" (${sp.dataType}) cannot feed "${tn.title}·${tp.label}" (${tp.dataType}).` });
    }
    const key = `${c.sourceNodeId}:${c.sourcePortId}→${c.targetNodeId}:${c.targetPortId}`;
    if (seenWire.has(key)) {
      issues.push({ code: "DUPLICATE_WIRE", severity: "error", nodeId: tn.id, message: `Duplicate wire: "${sn.title}" → "${tn.title}" is connected twice.` });
    }
    seenWire.add(key);
  }

  /* cycle: Kahn reduction — whatever survives is in a loop */
  const indeg = new Map<string, number>(g.nodes.map((n) => [n.id, 0]));
  for (const c of g.connections) {
    if (byId.has(c.sourceNodeId) && byId.has(c.targetNodeId)) indeg.set(c.targetNodeId, (indeg.get(c.targetNodeId) ?? 0) + 1);
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const seen = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const c of g.connections) {
    if (byId.has(c.sourceNodeId) && byId.has(c.targetNodeId)) adj.set(c.sourceNodeId, [...(adj.get(c.sourceNodeId) ?? []), c.targetNodeId]);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const nx of adj.get(cur) ?? []) {
      const d = (indeg.get(nx) ?? 1) - 1;
      indeg.set(nx, d);
      if (d === 0) queue.push(nx);
    }
  }
  for (const [id] of byId) {
    if (!seen.has(id)) issues.push({ code: "CYCLE", severity: "error", nodeId: id, message: `"${nameOf(g, id)}" is part of a loop — MJ runs DAGs, not cycles.` });
  }

  /* — WARN checks: probably not what the human meant — */
  const touched = new Set<string>();
  for (const c of g.connections) {
    touched.add(c.sourceNodeId);
    touched.add(c.targetNodeId);
  }
  for (const n of g.nodes) {
    if (g.nodes.length > 1 && !touched.has(n.id)) {
      issues.push({ code: "ORPHAN_NODE", severity: "warn", nodeId: n.id, message: `"${n.title}" has no wires at all — it will never run.` });
    }
    if (n.definitionId.startsWith("control.")) continue;
    for (const p of n.inputs) {
      if (p.required && !g.connections.some((c) => c.targetNodeId === n.id && c.targetPortId === p.id)) {
        issues.push({ code: "REQUIRED_INPUT_OPEN", severity: "error", nodeId: n.id, message: `"${n.title}" needs input "${p.label}" — it is unconnected.` });
      }
    }
    if (n.definitionId.startsWith("agent.") && n.providers.length === 0 && typeof n.config.harness !== "string") {
      issues.push({ code: "AGENT_UNPROVISIONED", severity: "warn", nodeId: n.id, message: `"${n.title}" has no provider and no harness attached.` });
    }
  }

  return issues;
}

/** Does this graph deserve to run? Only honest errors refuse; warns and infos pass. */
export function lintVerdict(issues: LintIssue[]): { runnable: boolean; errors: number; warnings: number } {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warn").length;
  return { runnable: errors === 0, errors, warnings };
}
