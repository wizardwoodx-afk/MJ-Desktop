import { safeEvaluate } from "./expression";
import type { Connection, NodeInstance } from "../domain/types";

export interface ControlResult {
  ports: Record<string, unknown>;
  skipTargets?: string[];
}

export function runControlNode(
  node: NodeInstance,
  collected: Record<string, unknown>,
  outgoing: Connection[],
): ControlResult {
  const id = node.definitionId;
  const first = Object.values(collected)[0];

  if (id === "control.start") {
    let payload: unknown = {};
    try { payload = JSON.parse(String(node.config.initialPayload || "{}")); } catch { payload = {}; }
    return { ports: { payload, "*": payload } };
  }
  if (id === "control.end") {
    return { ports: { result: first, "*": first } };
  }
  if (id === "control.wait") {
    return { ports: { out: first, "*": first } };
  }
  if (id === "control.sequential") {
    return { ports: { output: first, "*": first } };
  }
  if (id === "control.parallel") {
    return { ports: { branch: first, "*": first } };
  }
  if (id === "control.merge") {
    const mode = String(node.config.mode ?? "object");
    const vals = Object.values(collected);
    const out = mode === "array" ? vals : Object.assign({}, ...vals.map((v, i) => (v && typeof v === "object" && !Array.isArray(v) ? v as object : { [`in${i}`]: v })));
    return { ports: { out, "*": out } };
  }
  if (id === "control.split") {
    const items = Array.isArray(first) ? first : (first && typeof first === "object" ? Object.values(first as object) : [first]);
    return { ports: { items, "*": items } };
  }
  if (id === "control.fallback") {
    const out = collected.primary ?? collected.backup ?? first;
    return { ports: { out, "*": out } };
  }
  if (id === "control.retry") {
    return { ports: { out: first, "*": first } };
  }
  if (id === "control.condition") {
    let ok = false;
    try { ok = Boolean(safeEvaluate(String(node.config.expression || "Boolean(input)"), first)); }
    catch { ok = Boolean(first); }
    const skip = outgoing.filter((c) => c.sourcePortId === (ok ? "else" : "then")).map((c) => c.targetNodeId);
    return { ports: { then: ok ? first : undefined, else: ok ? undefined : first, "*": first }, skipTargets: skip };
  }
  if (id === "control.switch") {
    const key = String(node.config.keyPath || "input.route");
    const val = pick(first, key.replace(/^input\.?/, ""));
    const route = String(val ?? "default");
    const port = route === "A" || route === "caseA" ? "caseA" : route === "B" || route === "caseB" ? "caseB" : "default";
    const skip = outgoing.filter((c) => c.sourcePortId !== port && c.sourceNodeId === node.id).map((c) => c.targetNodeId);
    return { ports: { [port]: first, "*": first }, skipTargets: skip };
  }
  if (id === "control.loop") {
    const items = Array.isArray(first) ? first : [first];
    const max = Math.min(Number(node.config.maxIterations ?? 20), items.length);
    return { ports: { item: items[0], done: items.slice(0, max), "*": items.slice(0, max) } };
  }
  if (id === "control.approval") {
    return { ports: { approved: first, "*": first } };
  }
  return { ports: { "*": first ?? { passthrough: node.title } } };
}

function pick(input: unknown, path: string): unknown {
  if (!path) return input;
  let cur: unknown = input;
  for (const part of path.split(".").filter(Boolean)) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}
