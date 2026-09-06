/**
 * §Checkpoints probe (MJ 11.9.5) — LangGraph-shaped time travel for the design graph.
 *
 * Pins: snapshots are deep copies, structural equality ignores the viewport, duplicates of the
 * newest state are REFUSED (not stored), the cap holds, restore keeps the human's camera, and
 * persistence falls back to memory where localStorage does not exist (i.e. here, in Node).
 */
import { CHECKPOINT_CAP, addCheckpoint, createCheckpoint, graphsStructurallyEqual, loadCheckpoints, restoreGraph, saveCheckpoints, type GraphCheckpoint } from "../src/graph/checkpoints";
import { GRAPH_SCHEMA_VERSION } from "../src/domain/types";
import type { WorkflowGraph } from "../src/domain/types";

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

const mkGraph = (id: string, nodeCount: number): WorkflowGraph => ({
  schemaVersion: GRAPH_SCHEMA_VERSION,
  id,
  name: `wf-${id}`,
  nodes: Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`, definitionId: "agent.coder", title: `Node ${i}`, x: i * 10, y: 0, purpose: "", inputs: [], outputs: [],
    config: {}, rolePrompt: { system: "", user: "" }, feedbackLoop: { enabled: false, maxRounds: 0, trigger: "never" },
    evolutionMode: "fixed", reflection: { enabled: false }, permissions: { canWrite: false, canExecute: false, canBrowse: false },
    providers: [], contract: { timeoutMs: 60000, retries: 0 },
  })) as unknown as WorkflowGraph["nodes"],
  connections: [],
  viewport: { x: 1, y: 2, zoom: 0.7 },
  groups: [],
  notes: [],
});

section("1. a checkpoint is a true copy of the moment");
const g = mkGraph("w1", 2);
const cp = createCheckpoint("before the rewire", g);
ok("the checkpoint captures node + wire counts", cp.counts.nodes === 2 && cp.counts.connections === 0, JSON.stringify(cp.counts));
g.nodes[0].title = "MUTATED";
ok("later mutations of the source graph never leak in", cp.graph.nodes[0].title === "Node 0", cp.graph.nodes[0].title);
ok("an empty name becomes a named checkpoint anyway", createCheckpoint("   ", g).name === "Untitled checkpoint", "");

section("2. equality is structural — the camera is not the work");
const moved = structuredClone(g);
moved.viewport = { x: 999, y: -40, zoom: 2 };
ok("panning/zooming is NOT a change worth saving", graphsStructurallyEqual(g, moved) === true, "");
const changed = structuredClone(g);
changed.nodes[0].x += 8;
ok("moving a node IS a change", graphsStructurallyEqual(g, changed) === false, "");

section("3. add policy: no duplicates of the newest, cap enforced");
let list: GraphCheckpoint[] = [];
const r1 = addCheckpoint(list, createCheckpoint("one", g));
ok("first checkpoint lands", r1.list.length === 1 && r1.skipped === false, "");
list = r1.list;
const r2 = addCheckpoint(list, createCheckpoint("same state again", g));
ok("an identical state is REFUSED, not stored", r2.skipped === true && r2.list.length === 1, JSON.stringify({ skipped: r2.skipped, len: r2.list.length }));
for (let i = 0; i < CHECKPOINT_CAP + 10; i++) {
  const gg = mkGraph(`w${i}`, 1);
  gg.nodes[0].title = `gen ${i}`;
  list = addCheckpoint(list, createCheckpoint(`cp ${i}`, gg)).list;
}
ok(`the ledger never exceeds ${CHECKPOINT_CAP} entries`, list.length === CHECKPOINT_CAP, `${list.length}`);
ok("the newest survives the trim, the oldest falls", list[0].name.startsWith("cp ") && !list.some((c) => c.name === "one"), list[list.length - 1]?.name);

section("4. restore keeps the human's camera");
const now = mkGraph("w1", 3);
now.viewport = { x: 42, y: 24, zoom: 1.4 };
const back = restoreGraph(now, cp);
ok("restored work comes from the checkpoint", back.nodes.length === 2 && back.nodes[0].title === "Node 0", `${back.nodes.length}`);
ok("the viewport stays where the human is looking", back.viewport.x === 42 && back.viewport.zoom === 1.4, JSON.stringify(back.viewport));
ok("restore does not mutate the checkpoint itself", cp.graph.nodes.length === 2, "");

section("5. persistence degrades to memory, never crashes");
saveCheckpoints([cp]);
const loaded = loadCheckpoints();
ok("what was saved can be loaded back (memory fallback in Node)", loaded.length === 1 && loaded[0].id === cp.id, `${loaded.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
