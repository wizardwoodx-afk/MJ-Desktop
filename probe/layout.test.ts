/**
 * §Layout probe (MJ 11.9.8) — the real layered (Sugiyama) engine.
 *
 * Pins: layers flow left→right, crossing minimization is measured (not claimed), long edges are
 * normalized, cycles are insurance-handled (never crashed on), the output is deterministic,
 * components stack, nodes never overlap — and the store's autoLayout actually consumes it.
 */
import { countCrossings, layeredLayout } from "../src/graph/layout";
import { useGraphStore } from "../src/graph/store";
import { createNodeFromDef } from "../src/graph/factory";
import { DEFINITIONS_BY_ID } from "../src/domain/nodeLibrary";
import { GRAPH_SCHEMA_VERSION } from "../src/domain/types";
import type { Connection, NodeInstance, WorkflowGraph } from "../src/domain/types";

let pass = 0;
let fail = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (t: string) => console.log(`\n== ${t} ==`);

const N = (id: string) => ({ id, w: 264, h: 120 });
const xy = (r: ReturnType<typeof layeredLayout>, id: string) => r.positions.get(id)!;

section("0. honest emptiness");
const empty = layeredLayout({ nodes: [], edges: [] });
ok("no nodes → no positions, zero everything", empty.positions.size === 0 && empty.layers === 0 && empty.components === 0, JSON.stringify({ layers: empty.layers }));

section("1. chains flow left → right, one column per layer");
const chain = layeredLayout({ nodes: [N("a"), N("b"), N("c")], edges: [["a", "b"], ["b", "c"]] });
ok("three layers for a 3-chain", chain.layers === 3, `${chain.layers}`);
ok("x increases strictly along the chain", xy(chain, "a").x < xy(chain, "b").x && xy(chain, "b").x < xy(chain, "c").x, JSON.stringify([xy(chain, "a"), xy(chain, "b"), xy(chain, "c")]));
ok("a clean chain has zero crossings", chain.crossings === 0, `${chain.crossings}`);
ok("no edges were reversed in a DAG", chain.reversedEdges === 0, `${chain.reversedEdges}`);

section("2. diamonds: siblings share a column, never a position");
const diamond = layeredLayout({ nodes: [N("a"), N("b"), N("c"), N("d")], edges: [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]] });
ok("siblings b and c share one layer column", xy(diamond, "b").x === xy(diamond, "c").x, `${xy(diamond, "b").x} vs ${xy(diamond, "c").x}`);
ok("siblings are separated vertically", xy(diamond, "b").y !== xy(diamond, "c").y, "");
ok("d lands strictly after its parents", xy(diamond, "d").x > xy(diamond, "b").x && xy(diamond, "d").x > xy(diamond, "c").x, "");
ok("a diamond is planar — zero crossings", diamond.crossings === 0, `${diamond.crossings}`);

section("3. crossing minimization is real, and measured");
const xShaped = layeredLayout({ nodes: [N("s1"), N("s2"), N("t1"), N("t2")], edges: [["s1", "t2"], ["s2", "t1"]] });
ok("an X of wires is untangled to zero crossings by the sweep", xShaped.crossings === 0, `${xShaped.crossings}`);
ok("the crossing counter itself is honest (parallel = 0, X = 1)", countCrossings([0, 1], [0, 1]) === 0 && countCrossings([0, 1], [1, 0]) === 1, "");

section("4. long edges normalize through virtual layers");
const long = layeredLayout({ nodes: [N("a"), N("b"), N("c")], edges: [["a", "b"], ["b", "c"], ["a", "c"]] });
ok("a→c spanning two layers still keeps flow direction", xy(long, "a").x < xy(long, "c").x, "");
ok("the span reports three layer columns", long.layers === 3, `${long.layers}`);

section("5. cycles are insurance, not a crash");
const cyclic = layeredLayout({ nodes: [N("a"), N("b")], edges: [["a", "b"], ["b", "a"]] });
ok("a hostile 2-cycle still yields positions for both nodes", cyclic.positions.has("a") && cyclic.positions.has("b"), "");
ok("the reversal is reported, not hidden", cyclic.reversedEdges >= 1, `${cyclic.reversedEdges}`);

section("6. determinism — the same graph ALWAYS lays out the same way");
const input = { nodes: [N("a"), N("b"), N("c"), N("d"), N("e")], edges: [["a", "c"], ["b", "c"], ["c", "d"], ["a", "e"], ["e", "d"]] as Array<[string, string]> };
const r1 = layeredLayout(input);
const r2 = layeredLayout(input);
ok("two runs agree on every coordinate", [...r1.positions.entries()].every(([id, p]) => {
  const q = r2.positions.get(id);
  return q !== undefined && q.x === p.x && q.y === p.y;
}), "");

section("7. components stack with a gutter");
const comps = layeredLayout({ nodes: [N("a"), N("b"), N("c"), N("d")], edges: [["a", "b"], ["c", "d"]] });
ok("two components are detected", comps.components === 2, `${comps.components}`);
const ab = [xy(comps, "a"), xy(comps, "b")];
const cd = [xy(comps, "c"), xy(comps, "d")];
const span = (pts: { y: number }[]) => [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)) + 120];
const [a0, a1] = span(ab);
const [c0, c1] = span(cd);
ok("component y-ranges never interleave", a1 <= c0 || c1 <= a0, `[${a0},${a1}] vs [${c0},${c1}]`);

section("8. no two cards ever overlap");
const crowded = layeredLayout({
  nodes: [N("s"), N("m1"), N("m2"), N("m3"), N("t")],
  edges: [["s", "m1"], ["s", "m2"], ["s", "m3"], ["m1", "t"], ["m2", "t"], ["m3", "t"]],
});
const rects = [...crowded.positions.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y, w: 264, h: 120 }));
const overlaps = rects.filter((r, i) => rects.slice(i + 1).some((q) => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h));
ok("every card keeps its own space", overlaps.length === 0, JSON.stringify(overlaps.map((o) => o.id)));
ok("the fan-out middle layer stays zero-crossing", crowded.crossings === 0, `${crowded.crossings}`);

section("9. the store consumes the engine for real");
const mkNode = (defId: string, id: string): NodeInstance => createNodeFromDef(DEFINITIONS_BY_ID.get(defId)!, id, 5000, 5000);
const conn = (id: string, sn: NodeInstance, sp: string, tn: NodeInstance, tp: string): Connection => ({
  id, sourceNodeId: sn.id, sourcePortId: sp, targetNodeId: tn.id, targetPortId: tp,
  dataType: sn.outputs.find((p) => p.id === sp)?.dataType ?? "any", status: "idle",
});
const start = mkNode("control.start", "s");
const planner = mkNode("agent.planner", "p");
const coder = mkNode("agent.coder", "k");
const graph: WorkflowGraph = {
  schemaVersion: GRAPH_SCHEMA_VERSION, id: "wf-layout", name: "layout", nodes: [start, planner, coder],
  connections: [conn("c1", start, "payload", planner, "goal"), conn("c2", planner, "summary", coder, "task")],
  viewport: { x: 0, y: 0, zoom: 1 }, groups: [], notes: [],
};
useGraphStore.getState().loadWorkflow({ id: "wf-layout", name: "layout", description: "", graph });
useGraphStore.getState().autoLayout();
const laid = useGraphStore.getState().graph.nodes;
const px = (id: string) => laid.find((n) => n.id === id)!.x;
ok("autoLayout moved the nodes out of their dumped pile", laid.every((n) => n.x !== 5000 || n.y !== 5000), "");
ok("the wired chain lands in left→right columns", px("s") < px("p") && px("p") < px("k"), `${px("s")} → ${px("p")} → ${px("k")}`);
ok("undo restores the pre-layout positions (layout rides history)", (() => {
  useGraphStore.getState().undo();
  return useGraphStore.getState().graph.nodes.find((n) => n.id === "s")!.x === 5000;
})(), "");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
