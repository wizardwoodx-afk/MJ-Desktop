import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/graph/checkpoints.ts
var CHECKPOINT_CAP = 25;
var seq = 0;
var uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function createCheckpoint(name, graph) {
  return {
    id: uid("cp"),
    name: name.trim() || "Untitled checkpoint",
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    workflowId: graph.id,
    counts: { nodes: graph.nodes.length, connections: graph.connections.length },
    graph: structuredClone(graph)
  };
}
function graphsStructurallyEqual(a, b) {
  const strip = (g2) => JSON.stringify({ nodes: g2.nodes, connections: g2.connections, notes: g2.notes ?? [], groups: g2.groups ?? [] });
  return strip(a) === strip(b);
}
function addCheckpoint(list2, cp2) {
  if (list2.length > 0 && graphsStructurallyEqual(list2[0].graph, cp2.graph)) return { list: list2, skipped: true };
  return { list: [cp2, ...list2].slice(0, CHECKPOINT_CAP), skipped: false };
}
function restoreGraph(current, cp2) {
  const g2 = structuredClone(cp2.graph);
  g2.viewport = structuredClone(current.viewport);
  return g2;
}
var LS_KEY = "mj.checkpoints.v1";
var memory = [];
function loadCheckpoints() {
  try {
    if (typeof localStorage === "undefined") return memory;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return memory;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : memory;
  } catch {
    return memory;
  }
}
function saveCheckpoints(list2) {
  memory.length = 0;
  memory.push(...list2);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(list2));
  } catch {
  }
}

// src/domain/types.ts
var GRAPH_SCHEMA_VERSION = 2;

// probe/checkpoints.test.ts
var pass = 0;
var fail = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (t) => console.log(`
== ${t} ==`);
var mkGraph = (id, nodeCount) => ({
  schemaVersion: GRAPH_SCHEMA_VERSION,
  id,
  name: `wf-${id}`,
  nodes: Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    definitionId: "agent.coder",
    title: `Node ${i}`,
    x: i * 10,
    y: 0,
    purpose: "",
    inputs: [],
    outputs: [],
    config: {},
    rolePrompt: { system: "", user: "" },
    feedbackLoop: { enabled: false, maxRounds: 0, trigger: "never" },
    evolutionMode: "fixed",
    reflection: { enabled: false },
    permissions: { canWrite: false, canExecute: false, canBrowse: false },
    providers: [],
    contract: { timeoutMs: 6e4, retries: 0 }
  })),
  connections: [],
  viewport: { x: 1, y: 2, zoom: 0.7 },
  groups: [],
  notes: []
});
section("1. a checkpoint is a true copy of the moment");
var g = mkGraph("w1", 2);
var cp = createCheckpoint("before the rewire", g);
ok("the checkpoint captures node + wire counts", cp.counts.nodes === 2 && cp.counts.connections === 0, JSON.stringify(cp.counts));
g.nodes[0].title = "MUTATED";
ok("later mutations of the source graph never leak in", cp.graph.nodes[0].title === "Node 0", cp.graph.nodes[0].title);
ok("an empty name becomes a named checkpoint anyway", createCheckpoint("   ", g).name === "Untitled checkpoint", "");
section("2. equality is structural \u2014 the camera is not the work");
var moved = structuredClone(g);
moved.viewport = { x: 999, y: -40, zoom: 2 };
ok("panning/zooming is NOT a change worth saving", graphsStructurallyEqual(g, moved) === true, "");
var changed = structuredClone(g);
changed.nodes[0].x += 8;
ok("moving a node IS a change", graphsStructurallyEqual(g, changed) === false, "");
section("3. add policy: no duplicates of the newest, cap enforced");
var list = [];
var r1 = addCheckpoint(list, createCheckpoint("one", g));
ok("first checkpoint lands", r1.list.length === 1 && r1.skipped === false, "");
list = r1.list;
var r2 = addCheckpoint(list, createCheckpoint("same state again", g));
ok("an identical state is REFUSED, not stored", r2.skipped === true && r2.list.length === 1, JSON.stringify({ skipped: r2.skipped, len: r2.list.length }));
for (let i = 0; i < CHECKPOINT_CAP + 10; i++) {
  const gg = mkGraph(`w${i}`, 1);
  gg.nodes[0].title = `gen ${i}`;
  list = addCheckpoint(list, createCheckpoint(`cp ${i}`, gg)).list;
}
ok(`the ledger never exceeds ${CHECKPOINT_CAP} entries`, list.length === CHECKPOINT_CAP, `${list.length}`);
ok("the newest survives the trim, the oldest falls", list[0].name.startsWith("cp ") && !list.some((c) => c.name === "one"), list[list.length - 1]?.name);
section("4. restore keeps the human's camera");
var now = mkGraph("w1", 3);
now.viewport = { x: 42, y: 24, zoom: 1.4 };
var back = restoreGraph(now, cp);
ok("restored work comes from the checkpoint", back.nodes.length === 2 && back.nodes[0].title === "Node 0", `${back.nodes.length}`);
ok("the viewport stays where the human is looking", back.viewport.x === 42 && back.viewport.zoom === 1.4, JSON.stringify(back.viewport));
ok("restore does not mutate the checkpoint itself", cp.graph.nodes.length === 2, "");
section("5. persistence degrades to memory, never crashes");
saveCheckpoints([cp]);
var loaded = loadCheckpoints();
ok("what was saved can be loaded back (memory fallback in Node)", loaded.length === 1 && loaded[0].id === cp.id, `${loaded.length}`);
console.log(`
${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
