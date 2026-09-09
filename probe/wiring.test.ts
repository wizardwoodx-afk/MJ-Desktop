// Does every wire a template declares actually survive the app's own resolution rule?
// Rule under test = store.insertTemplate + dataTypes.portsCompatible (both shipped code).
import { loadTemplate, WORKFLOW_TEMPLATES } from "../src/domain/templates";
import { AGENT_FRAMEWORKS } from "../src/domain/frameworks";
import { teamFromFramework, instantiateTeam } from "../src/domain/teams";
import { portsCompatible } from "../src/domain/dataTypes";
import { validateWorkflow, topoSort } from "../src/graph/validation";
import type { Connection, NodeInstance } from "../src/domain/types";

type Node = NodeInstance;
const dropped: string[] = [];

function materialise(nodes: Node[], wires: Array<[string,string,string,string]>, label: string): Connection[] {
  const byKey = new Map(nodes.map(n=>[n.templateKey as string, n]));
  const out: Connection[] = [];
  wires.forEach(([sk,sp,tk,tp])=>{
    const src = byKey.get(sk); const tgt = byKey.get(tk);
    if (!src || !tgt) { dropped.push(`${label}: unknown key ${sk}->${tk}`); return; }
    const find = (n: Node, dir: "inputs"|"outputs", k: string) => n[dir].find(p=>p.id.toLowerCase()===k.toLowerCase() || p.label.toLowerCase()===k.toLowerCase());
    const s = find(src,"outputs",sp); const t = find(tgt,"inputs",tp);
    if (!s) { dropped.push(`${label}: no output port "${sp}" on ${src.title}`); return; }
    if (!t) { dropped.push(`${label}: no input port "${tp}" on ${tgt.title}`); return; }
    if (!portsCompatible(s.dataType, t.dataType)) { dropped.push(`${label}: ${src.title}.${s.id}(${s.dataType}) -> ${tgt.title}.${t.id}(${t.dataType}) type-incompatible`); return; }
    out.push({ id:`c${out.length}`, sourceNodeId:src.id, sourcePortId:s.id, targetNodeId:tgt.id, targetPortId:t.id, dataType:s.dataType, status:"idle" });
  });
  return out;
}

console.log("== templates: declared wires vs wires that survive ==");
let dT=0, kT=0;
for (const tpl of WORKFLOW_TEMPLATES) {
  const { instances, wires } = loadTemplate(tpl.id);
  const conns = materialise(instances, wires, tpl.name);
  dT += wires.length; kT += conns.length;
  const errs = validateWorkflow({schemaVersion:2,id:"w",name:tpl.name,nodes:instances,connections:conns,viewport:{x:0,y:0,zoom:1}}).filter(i=>i.severity==="error");
  let order: string[] = []; try { order = topoSort(instances, conns); } catch { order = []; }
  console.log(`  ${tpl.name.padEnd(38)} declared=${wires.length} kept=${conns.length} errors=${errs.length} topo=${order.length}/${instances.length}${errs.length?`  e.g. "${errs[0].message}"`:""}`);
}
console.log(`  TOTAL declared=${dT} kept=${kT} dropped=${dT-kT}`);

console.log("\n== frameworks -> teams: declared wires vs wires that survive ==");
let dF=0, kF=0;
for (const fw of AGENT_FRAMEWORKS) {
  const { nodes, wires } = instantiateTeam(teamFromFramework(fw) as never, "task");
  const conns = materialise(nodes, wires, fw.id);
  dF += wires.length; kF += conns.length;
  if (conns.length !== wires.length) console.log(`  ${fw.id.padEnd(24)} declared=${wires.length} kept=${conns.length}`);
}
console.log(`  TOTAL declared=${dF} kept=${kF} dropped=${dF-kF}`);

console.log(`\n== every dropped wire (${dropped.length}) ==`);
for (const d of [...new Set(dropped)].slice(0, 12)) console.log("  " + d);
console.log(`  distinct drop reasons: ${new Set(dropped.map(s=>s.split(": ")[1])).size}`);
