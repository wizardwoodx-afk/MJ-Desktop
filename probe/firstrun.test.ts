import { loadTemplate } from "../src/domain/templates";
import { useGraphStore } from "../src/graph/store";

// Exercise the real first-run path end to end, exactly as App.tsx calls it.
const before = useGraphStore.getState().graph.nodes.length;
const { instances, wires, skipped } = loadTemplate("code-test-review");
const added = useGraphStore.getState().insertTemplate(instances, wires);
const g = useGraphStore.getState().graph;

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass += 1; else { fail += 1; console.log("  FAIL " + m); } };

ok(before === 0, `a fresh app really does boot empty (got ${before}) — this is why it looked broken`);
ok(skipped.length === 0, `no template step was skipped, got ${skipped.join(",")}`);
ok(added === 5, `all 5 nodes land on the canvas, got ${added}`);
ok(g.nodes.length === 5, `the store holds 5 nodes, got ${g.nodes.length}`);
ok(g.connections.length === 5, `all 5 wires connected, got ${g.connections.length}`);

// Every connection must reference nodes and ports that exist.
const ids = new Set(g.nodes.map((n) => n.id));
for (const c of g.connections) {
  ok(ids.has(c.sourceNodeId) && ids.has(c.targetNodeId), `wire ${c.id} endpoints exist`);
  const s = g.nodes.find((n) => n.id === c.sourceNodeId)!;
  const t = g.nodes.find((n) => n.id === c.targetNodeId)!;
  ok(s.outputs.some((p) => p.id === c.sourcePortId), `wire ${c.id} source port exists on ${s.definitionId}`);
  ok(t.inputs.some((p) => p.id === c.targetPortId), `wire ${c.id} target port exists on ${t.definitionId}`);
}
ok(g.connections.every((c) => c.sourceNodeId !== c.targetNodeId), "no wire connects a node to itself");

// Firing twice must not duplicate the world.
const again = useGraphStore.getState().insertTemplate(instances, wires);
ok(again === 5, "a second insert is additive, not destructive");
ok(useGraphStore.getState().graph.nodes.length === 10, "duplicate detection is the caller's job, not insertTemplate's");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
