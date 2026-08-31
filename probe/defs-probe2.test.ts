import { DEFINITIONS_BY_ID, NODE_DEFINITIONS } from "../src/domain/nodeLibrary";
const show = (id: string) => {
  const d = DEFINITIONS_BY_ID.get(id);
  if (!d) { console.log(id, "MISSING"); return; }
  console.log(id, "| cat:", (d as any).category, "| in:", JSON.stringify((d.inputs??[]).map((p:any)=>[p.id,p.dataType,p.required])), "| out:", JSON.stringify((d.outputs??[]).map((p:any)=>[p.id,p.dataType])));
};
["control.start","control.end","cap.transform","control.approval","control.branch"].forEach(show);
console.log("--- nodes whose FIRST output is Text and that need no required input ---");
for (const d of NODE_DEFINITIONS) {
  const outs = (d.outputs ?? []);
  const reqIn = (d.inputs ?? []).filter((p:any)=>p.required);
  if (outs[0]?.dataType === "Text" && reqIn.length === 0) console.log(" ", d.id, "|", d.title, "| outs:", outs.map((p:any)=>p.id+":"+p.dataType).join(","));
}
