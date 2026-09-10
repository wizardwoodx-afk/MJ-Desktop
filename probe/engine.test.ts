import { safeEvaluate } from "../src/engine/expression";
import { runControlNode } from "../src/engine/controlRuntime";
import { gateCandidate, scoreFitness, validateConstraints, compositeOf, lengthPenalty, EVOLUTION_CONFIG } from "../src/domain/evolutionEngine";
import { parseFrontmatter, skillHasValidStructure, reassembleSkill } from "../src/domain/hermesSkill";
import { NODE_DEFINITIONS as DEFINITIONS, DEFINITIONS_BY_ID } from "../src/domain/nodeLibrary";
import { createNodeFromDef } from "../src/graph/factory";
import { validateWorkflow, topoSort } from "../src/graph/validation";
import { loadTemplate, templateFullyResolvable, WORKFLOW_TEMPLATES } from "../src/domain/templates";
import { AGENT_FRAMEWORKS } from "../src/domain/frameworks";
import { teamFromFramework, instantiateTeam } from "../src/domain/teams";
import { composeNodePrompt } from "../src/domain/composer";
import { portsCompatible } from "../src/domain/dataTypes";
import { ROLE_PACKS } from "../src/domain/rolePacks";

let pass = 0, fail = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}: ${(e as Error).message}`); }
};
const eq = (a: unknown, b: unknown, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
// mirrors store.insertTemplate's port resolution (id-or-label, type-gated) so templates are checked as the app wires them
function materialise(nodes: ReturnType<typeof loadTemplate>["instances"], wires: Array<[string,string,string,string]>, lenient = false) {
  const byKey = new Map(nodes.map(n=>[n.templateKey as string, n]));
  const out: Array<{id:string;sourceNodeId:string;sourcePortId:string;targetNodeId:string;targetPortId:string;dataType:"any";status:"idle"}> = [];
  wires.forEach(([sk,sp,tk,tp],i)=>{
    const src = byKey.get(sk); const tgt = byKey.get(tk);
    if (!src || !tgt) throw new Error(`wire ${i} references unknown template key ${!src?sk:tk}`);
    const find = (n: typeof src, dir: "inputs"|"outputs", k: string) => n[dir].find(p=>p.id.toLowerCase()===k.toLowerCase() || p.label.toLowerCase()===k.toLowerCase());
    const s = find(src,"outputs",sp); const t = find(tgt,"inputs",tp);
    if (!s || !t || !portsCompatible(s.dataType, t.dataType)) { if (lenient) return; throw new Error(`wire ${i}: ${src.title}.${s?.id ?? sp} -> ${tgt.title}.${t?.id ?? tp} unresolvable`); }
    out.push({ id: "c"+i, sourceNodeId: src.id, sourcePortId: s.id, targetNodeId: tgt.id, targetPortId: t.id, dataType: "any", status: "idle" });
  });
  return out;
}
const ok = (c: boolean, m = "") => { if (!c) throw new Error(m || "expected true"); };

console.log("\n== library integrity ==");
t("311 node definitions, unique ids", () => { eq(DEFINITIONS.length, 311); eq(new Set(DEFINITIONS.map(d=>d.id)).size, 311); });
t("agent defs = 21 core + 256 role packs + 12 presets", () => {
  const ids = DEFINITIONS.map(d=>d.id);
  const core = ids.filter(i=>i.startsWith("agent.") && !i.startsWith("agent.pack.") && !i.startsWith("agent.preset."));
  const packs = ids.filter(i=>i.startsWith("agent.pack."));
  const presets = ids.filter(i=>i.startsWith("agent.preset."));
  console.log(`       core=${core.length} packs=${packs.length} presets=${presets.length} control=${ids.filter(i=>i.startsWith("control.")).length} cap=${ids.filter(i=>i.startsWith("cap.")).length}`);
  eq(core.length, 21); eq(packs.length, 256); eq(presets.length, 12);
});
t("256 role packs, unique slugs", () => { eq(ROLE_PACKS.length, 256); eq(new Set(ROLE_PACKS.map(r=>r.slug)).size, 256); });
t("35 frameworks, 10 composition patterns", () => {
  eq(AGENT_FRAMEWORKS.length, 35);
  eq(new Set(AGENT_FRAMEWORKS.map(f=>f.pattern)).size, 10);
});
t("every framework roster id resolves in DEFINITIONS_BY_ID", () => {
  const used = [...new Set(AGENT_FRAMEWORKS.flatMap(f=>f.roster))];
  const missing = used.filter(r=>!DEFINITIONS_BY_ID.has(r));
  eq(missing, []);
  console.log(`       ${used.length} distinct roster ids across 35 frameworks`);
});
t("every template step defId resolves (templateFullyResolvable)", () => {
  const bad = WORKFLOW_TEMPLATES.filter(t=>!templateFullyResolvable(t.id)).map(t=>t.id);
  eq(bad, []);
});

console.log("\n== templates & teams ==");
let tplDeclared = 0, tplKept = 0; const tplBroken: string[] = [];
for (const tpl of WORKFLOW_TEMPLATES) {
  const { instances: nodes, wires } = loadTemplate(tpl.id);
  ok(nodes.length >= 3, `template "${tpl.name}" too few nodes`);
  const connections = materialise(nodes, wires, true);
  tplDeclared += wires.length; tplKept += connections.length;
  const g = { schemaVersion: 2, id: "w", name: tpl.name, nodes, connections, viewport: {x:0,y:0,zoom:1} };
  const errors = validateWorkflow(g).filter(i=>i.severity==="error");
  if (errors.length) tplBroken.push(`${tpl.name} (${errors.length})`);
  const order = topoSort(nodes, connections);
  eq(order.length, nodes.length, `template "${tpl.name}": topoSort lost a node`);
}
t(`template wiring: every declared wire survives and no template leaves a required input unwired`, () => {
  eq([tplDeclared, tplKept], [52, 52]);
  eq(tplBroken, []);
});
t("framework->team->graph for all 35 frameworks", () => {
  let totalNodes = 0;
  for (const fw of AGENT_FRAMEWORKS) {
    const team = teamFromFramework(fw);
    const { nodes, wires } = instantiateTeam(team as never, "test task");
    totalNodes += nodes.length;
    ok(nodes.length >= 3, `${fw.id} produced ${nodes.length} nodes`);
    ok(wires.length >= 2, `${fw.id} produced ${wires.length} wires`);
  }
  console.log(`       ${totalNodes} nodes across 35 frameworks`);
});

console.log("\n== expression sandbox ==");
t("evaluates arithmetic and input access", () => { eq(safeEvaluate("input.a + 1", {a:41}), 42); });
t("whitelisted globals only", () => { eq(safeEvaluate("Math.max(input.x, 3)", {x:9}), 9); });
t("blocks window", () => { let threw=false; try{ safeEvaluate("window.x", {}); }catch{ threw=true; } ok(threw, "window should be blocked"); });
t("blocks process", () => { let threw=false; try{ safeEvaluate("process.env", {}); }catch{ threw=true; } ok(threw, "process should be blocked"); });
t("blocks semicolon injection", () => { let threw=false; try{ safeEvaluate("1;2", {}); }catch{ threw=true; } ok(threw); });
t("blocks prototype escape", () => { let threw=false; try{ safeEvaluate("input.constructor", {}); }catch{ threw=true; } ok(threw); });
t("rejects >600 chars", () => { let threw=false; try{ safeEvaluate("1+".repeat(400)+"1", {}); }catch{ threw=true; } ok(threw); });

console.log("\n== control runtime ==");
const mk = (id: string, cfg: Record<string, unknown> = {}, outgoing: never[] = []) => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get(id)!, "x", 0, 0);
  n.config = { ...n.config, ...cfg };
  return runControlNode(n, cfg.__collected as never ?? {}, outgoing);
};
t("control.start parses initialPayload JSON", () => {
  const r = mk("control.start", { initialPayload: '{"task":"ship"}', __collected: {} });
  eq((r.ports.payload as {task:string}).task, "ship");
});
t("control.start survives bad JSON", () => { const r = mk("control.start", { initialPayload: "not json", __collected: {} }); eq(r.ports.payload, {}); });
t("control.merge object mode merges inputs", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("control.merge")!, "m", 0, 0);
  const r = runControlNode(n, { a: {x:1}, b: {y:2} }, []);
  eq(r.ports.out, {x:1,y:2});
});
t("control.merge array mode collects", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("control.merge")!, "m", 0, 0);
  n.config.mode = "array";
  const r = runControlNode(n, { a: 1, b: 2 }, []);
  eq(r.ports.out, [1,2]);
});
t("control.condition routes + returns skipTargets", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("control.condition")!, "c", 0, 0);
  n.config.expression = "input > 5";
  const out = [{ id:"c1", sourceNodeId:"c", sourcePortId:"then", targetNodeId:"T", targetPortId:"i", dataType:"any", status:"idle" },
               { id:"c2", sourceNodeId:"c", sourcePortId:"else", targetNodeId:"E", targetPortId:"i", dataType:"any", status:"idle" }];
  const r = runControlNode(n, { input: 10 }, out as never);
  eq(r.skipTargets, ["E"]);
  const r2 = runControlNode(n, { input: 1 }, out as never);
  eq(r2.skipTargets, ["T"]);
});
t("control.switch maps A/B/default", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("control.switch")!, "s", 0, 0);
  n.config.keyPath = "input.route";
  const out = ["caseA","caseB","default"].map(p=>({ id:"c"+p, sourceNodeId:"s", sourcePortId:p, targetNodeId:"T"+p, targetPortId:"i", dataType:"any", status:"idle" }));
  eq(runControlNode(n, { input: { route: "B" } }, out as never).skipTargets, ["TcaseA","Tdefault"]);
});
t("control.loop truncates to maxIterations", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("control.loop")!, "l", 0, 0);
  n.config.maxIterations = 2;
  const r = runControlNode(n, { input: [1,2,3,4] }, []);
  eq(r.ports.done, [1,2]);
});

console.log("\n== evolution gates ==");
t("composite = 0.5c + 0.3p + 0.2conc - penalty", () => {
  eq(compositeOf({ correctness: 1, procedureFollowing: 1, conciseness: 1, lengthPenalty: 0, feedback: "" }), 1);
  eq(compositeOf({ correctness: 0.5, procedureFollowing: 0.5, conciseness: 0.5, lengthPenalty: 0.1, feedback: "" }), 0.4);
});
t("length penalty only above 90% of max", () => {
  eq(lengthPenalty(1000, 15000), 0);
  ok(lengthPenalty(15000, 15000) > 0);
});
t("bundled skills are read-only", () => {
  const g = gateCandidate({ baselineText:"a", candidateText:"b", taskInput:"t", expectedBehavior:"e", baselineOutput:"o", candidateOutput:"o", bundled: true });
  eq(g.accepted, false);
  ok(g.constraints[0].constraintName === "bundled_readonly");
});
t("growth gate rejects >20% growth", () => {
  const base = "x".repeat(1000);
  const cand = "x".repeat(1500);
  const r = validateConstraints(cand, "skill", base);
  const growth = r.find(c=>c.constraintName==="growth_limit")!;
  eq(growth.passed, false);
});
t("empty candidate fails non_empty", () => {
  const r = validateConstraints("   ", "skill");
  eq(r.find(c=>c.constraintName==="non_empty")!.passed, false);
});
t("identical skill: no improvement over baseline", () => {
  const md = "---\nname: s\ndescription: d\n---\n# Body\nverify the build passes and report failures\n";
  const g = gateCandidate({ baselineText: md, candidateText: md, taskInput:"t", expectedBehavior:"verify the build passes", baselineOutput:"verify the build passes", candidateOutput:"verify the build passes", bundled:false });
  eq(g.accepted, false);
  ok(g.reason.includes("No improvement") || g.reason.includes("Holdout"), g.reason);
  console.log(`       reason="${g.reason}" baseline=${g.baseline.composite.toFixed(3)} candidate=${g.candidate.composite.toFixed(3)}`);
});
t("scheduler's own gate call can never accept: it scores both sides from the same output", () => {
  // Mirrors src/engine/scheduler.ts runAgent(): baselineOutput and candidateOutput are both text.slice(0,400).
  const run = (procedures: string) => gateCandidate({
    baselineText: reassembleSkill({ name:"coder", description:"d" }, procedures),
    candidateText: reassembleSkill({ name:"coder", description:"d" }, procedures + "\n\n## Learned corrections\n\n- Prefer explicit done-when after each tool call.\n"),
    taskInput: "fix the build", expectedBehavior: "tests pass",
    baselineOutput: "SAME OUTPUT", candidateOutput: "SAME OUTPUT", bundled: false,
  });
  let accepted = 0;
  for (const proc of ["1. Reproduce.\n2. Fix.\n3. Verify.", "Run the tests.", "a".repeat(14000), "Inspect, patch, re-run, confirm."]) {
    const g = run(proc);
    if (g.accepted) accepted++;
    console.log(`       procedures=${proc.length}ch baseline=${g.baseline.composite.toFixed(4)} candidate=${g.candidate.composite.toFixed(4)} accepted=${g.accepted} reason="${g.reason}"`);
  }
  eq(accepted, 0, "AUTONOMOUS accept should be unreachable while both sides score the same output");
});
t("holdout threshold is 0.45", () => {
  const g = gateCandidate({ baselineText:"a", candidateText:"a better", taskInput:"t", expectedBehavior:"zzz", baselineOutput:"", candidateOutput:"zzz", bundled:false });
  eq(g.holdoutPassed, g.candidate.composite >= 0.45);
});
t("scoreFitness returns 0 for empty output", () => {
  eq(scoreFitness({taskInput:"a",expectedBehavior:"b",agentOutput:"  ",skillText:"s"}).correctness, 0);
});
t("config matches vendored GEPA numbers", () => {
  eq(EVOLUTION_CONFIG.maxSkillSize, 15000); eq(EVOLUTION_CONFIG.maxToolDescSize, 500);
  eq(EVOLUTION_CONFIG.maxPromptGrowth, 0.2); eq(EVOLUTION_CONFIG.trainRatio, 0.5);
});

console.log("\n== SKILL.md contract ==");
t("parses YAML frontmatter + body", () => {
  const md = "---\nname: demo\ndescription: \"a demo skill\"\nversion: 1.0.0\n---\n# Body\nstep one\n";
  const p = parseFrontmatter(md);
  eq(p.frontmatter.name, "demo");
  ok(p.body.includes("step one"));
});
t("structure check flags missing description", () => {
  eq(skillHasValidStructure("---\nname: x\n---\nbody").ok, false);
  eq(skillHasValidStructure("---\nname: x\ndescription: y\n---\nbody").ok, true);
});
t("reassembleSkill round-trips", () => {
  const out = reassembleSkill({ name: "n", description: "d" }, "# Body");
  ok(out.startsWith("---") && out.includes("name: n") && out.includes("# Body"));
});

console.log("\n== graph validation & topo ==");
t("cycle detection", () => {
  const a = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.coder")!, "a", 0, 0);
  const b = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.reviewer")!, "b", 0, 0);
  const conn = (s:string,t:string,id:string)=>({ id, sourceNodeId:s, sourcePortId:"output", targetNodeId:t, targetPortId:"input", dataType:"any" as const, status:"idle" as const });
  const g = { schemaVersion:2, id:"g", name:"g", nodes:[a,b], connections:[conn("a","b","1"), conn("b","a","2")], viewport:{x:0,y:0,zoom:1} };
  const issues = validateWorkflow(g);
  ok(issues.some(i=>i.message.startsWith("Cycle detected")), "cycle not detected");
  let threw=false; try { topoSort(g.nodes, g.connections); } catch { threw=true; }
  ok(threw, "topoSort should throw on cycle");
});
t("topoSort orders start->agent->end", () => {
  const s = createNodeFromDef(DEFINITIONS_BY_ID.get("control.start")!, "s", 0, 0);
  const a = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.coder")!, "a", 0, 0);
  const e = createNodeFromDef(DEFINITIONS_BY_ID.get("control.end")!, "e", 0, 0);
  const conn=(sn:string,sp:string,tn:string,tp:string,id:string)=>({id,sourceNodeId:sn,sourcePortId:sp,targetNodeId:tn,targetPortId:tp,dataType:"any" as const,status:"idle" as const});
  const conns=[conn("s","payload","a",a.inputs[0].id,"1"),conn("a",a.outputs[0].id,"e","result","2")];
  eq(topoSort([a,e,s], conns), ["s","a","e"]);
  const g = { schemaVersion:2,id:"g",name:"g",nodes:[s,a,e],connections:conns,viewport:{x:0,y:0,zoom:1} };
  const errs = validateWorkflow(g).filter(i=>i.severity==="error");
  eq(errs, []);
});
t("type mismatch is an error", () => {
  const s = createNodeFromDef(DEFINITIONS_BY_ID.get("control.start")!, "s", 0, 0);
  const a = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.coder")!, "a", 0, 0);
  const bad = { id:"c", sourceNodeId:"s", sourcePortId:"payload", targetNodeId:"a", targetPortId:"does-not-exist", dataType:"any" as const, status:"idle" as const };
  const g = { schemaVersion:2,id:"g",name:"g",nodes:[s,a],connections:[bad],viewport:{x:0,y:0,zoom:1} };
  ok(validateWorkflow(g).some(i=>i.message.includes("Target port not found")));
});
t("portsCompatible allows any<->typed", () => { ok(portsCompatible("any","Text")); ok(portsCompatible("Text","any")); });

console.log("\n== prompt composition ==");
t("system contains identity/skills/memory/contract/permissions; user holds purpose", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.security")!, "sec", 0, 0);
  n.purpose = "Audit this repo";
  const c = composeNodePrompt(n, { input: "x" }, [], []);
  for (const h of ["# Identity","# Mission","# Procedures","# Invariants","# Active skills","# Memory","# Contract","# Permissions"])
    ok(c.system.includes(h), `missing ${h}`);
  ok(c.user.includes("Audit this repo"));
  ok(!c.system.includes("Audit this repo"), "purpose leaked into identity/system");
  ok(!c.user.includes("# Identity"), "identity leaked into user turn");
});
t("memory and skills are injected when present", () => {
  const n = createNodeFromDef(DEFINITIONS_BY_ID.get("agent.coder")!, "c", 0, 0);
  const c = composeNodePrompt(n, {}, [
    { id:"s", nodeKey:"k", name:"ship", description:"d", procedure:"do it", preconditions:"", toolStrategy:"", verificationStrategy:"", knownFailureModes:"", version:1, score:null, origin:"learned", active:true, createdAt:"", updatedAt:"" },
  ], [{ id:"m", nodeKey:"k", kind:"episodic", content:"last time X failed", tags:[], importance:0.5, createdAt:"" }]);
  ok(c.system.includes("## SKILL ship") && c.system.includes("do it"));
  ok(c.system.includes("[episodic] last time X failed"));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
