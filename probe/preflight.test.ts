/**
 * §Preflight lint probe (MJ 11.9.5) — "ESLint for the graph".
 *
 * Pins the linter's contract: structural errors REFUSE the run, warnings never do,
 * and every issue carries a code + a human message + a node to jump to.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { lintGraph, lintVerdict } from "../src/graph/lint";
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

const mkNode = (defId: string, id: string): NodeInstance =>
  createNodeFromDef(DEFINITIONS_BY_ID.get(defId)!, id, 0, 0);

const mkGraph = (nodes: NodeInstance[], connections: Connection[]): WorkflowGraph => ({
  schemaVersion: GRAPH_SCHEMA_VERSION,
  id: "wf",
  name: "probe",
  nodes,
  connections,
  viewport: { x: 0, y: 0, zoom: 1 },
  groups: [],
  notes: [],
});

const conn = (id: string, sn: NodeInstance, sp: string, tn: NodeInstance, tp: string): Connection => ({
  id,
  sourceNodeId: sn.id,
  sourcePortId: sp,
  targetNodeId: tn.id,
  targetPortId: tp,
  dataType: sn.outputs.find((p) => p.id === sp)?.dataType ?? "any",
  status: "idle",
});

section("0. honest baselines");
const empty = lintGraph(mkGraph([], []));
ok("empty canvas reports EMPTY_GRAPH info, nothing worse", empty.length === 1 && empty[0].code === "EMPTY_GRAPH" && empty[0].severity === "info", JSON.stringify(empty));
ok("an empty canvas is still 'runnable' (no errors to refuse)", lintVerdict(empty).runnable === true, "");

const solo = mkNode("agent.coder", "a");
const single = lintGraph(mkGraph([solo], []));
ok("a lone node earns an info, not a scare", single.some((i) => i.code === "SINGLE_NODE" && i.severity === "info"), JSON.stringify(single));

section("1. errors — the run refuses these");
const a = mkNode("agent.coder", "a");
const b = mkNode("agent.researcher", "b");
const ghost = mkGraph([a, b], [conn("c1", a, a.outputs[0].id, { ...b, id: "missing" } as NodeInstance, b.inputs[0].id)]);
ok("a wire to a missing node is DANGLING_WIRE", lintGraph(ghost).some((i) => i.code === "DANGLING_WIRE" && i.severity === "error"), "");
const noPort = mkGraph([a, b], [conn("c1", a, "nope", b, b.inputs[0].id)]);
ok("a wire from a missing port is DANGLING_WIRE too", lintGraph(noPort).some((i) => i.code === "DANGLING_WIRE"), "");

/* type mismatch: hand-rolled pair with hostile port types */
const fakeSrc = { ...a, id: "src", outputs: [{ ...a.outputs[0], id: "o1", dataType: "Image" as const }] };
const fakeTgt = { ...b, id: "tgt", inputs: [{ ...b.inputs[0], id: "i1", dataType: "Boolean" as const, required: false }] };
const mismatched = mkGraph([fakeSrc as NodeInstance, fakeTgt as NodeInstance], [conn("c1", fakeSrc as NodeInstance, "o1", fakeTgt as NodeInstance, "i1")]);
ok("Image → Boolean is a TYPE_MISMATCH error", lintGraph(mismatched).some((i) => i.code === "TYPE_MISMATCH" && i.severity === "error"), JSON.stringify(lintGraph(mismatched)));

const dup = mkGraph([a, b], [conn("c1", a, a.outputs[0].id, b, b.inputs[0].id), conn("c2", a, a.outputs[0].id, b, b.inputs[0].id)]);
ok("the same wire twice is DUPLICATE_WIRE", lintGraph(dup).some((i) => i.code === "DUPLICATE_WIRE"), "");

const loop = mkGraph([a, b], [conn("c1", a, a.outputs[0].id, b, b.inputs[0].id), conn("c2", b, b.outputs[0].id, a, a.inputs[0].id)]);
const loopIssues = lintGraph(loop);
ok("a two-node loop is caught as CYCLE", loopIssues.some((i) => i.code === "CYCLE" && i.severity === "error"), JSON.stringify(loopIssues.map((i) => i.code)));
ok("both loop members are named", loopIssues.filter((i) => i.code === "CYCLE").length >= 2, `${loopIssues.filter((i) => i.code === "CYCLE").length} named`);

const openInput = mkGraph([b], []);
const reqOpen = lintGraph(openInput).filter((i) => i.code === "REQUIRED_INPUT_OPEN");
ok("an unconnected REQUIRED input is an error (matches the run gate)", b.inputs.some((p) => p.required) ? reqOpen.length > 0 && reqOpen[0].severity === "error" : true, JSON.stringify(reqOpen));

section("2. warnings — never refuse, always say");
const orphan = mkNode("control.wait", "c"); // control node: no required inputs, so orphan is the ONLY finding
/* a fully-wired legal chain: control.start → planner → coder (every required input fed) */
const start = mkNode("control.start", "s");
const planner = mkNode("agent.planner", "p");
const coder = mkNode("agent.coder", "k");
const legalChain = mkGraph(
  [start, planner, coder],
  [conn("c1", start, "payload", planner, "goal"), conn("c2", planner, "summary", coder, "task")],
);
const warnGraph = mkGraph([...legalChain.nodes, orphan], legalChain.connections);
ok("an unwired extra node is ORPHAN_NODE (warn)", lintGraph(warnGraph).some((i) => i.code === "ORPHAN_NODE" && i.severity === "warn"), "");
const v = lintVerdict(lintGraph(warnGraph));
ok("warnings alone never refuse the run", v.runnable === true && v.warnings >= 1, JSON.stringify(v));

section("3. the verdict is the gate's truth");
ok("one error makes the graph un-runnable", lintVerdict(lintGraph(ghost)).runnable === false, "");
ok("a clean, fully-fed chain is runnable with zero issues to shout about", lintGraph(legalChain).length === 0, JSON.stringify(lintGraph(legalChain)));

section("4. provenance — the wiring is in the shipped sources");
declare const MJ_ROOT: string | undefined;
const root = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : path.resolve(import.meta.dirname ?? ".", "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
ok("the statusbar carries a live preflight chip", /preflight-chip/.test(app), "");
ok("the run-path surface mounts the PreflightPanel", /PreflightPanel/.test(app), "");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
