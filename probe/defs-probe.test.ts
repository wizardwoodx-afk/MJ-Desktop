import { DEFINITIONS_BY_ID } from "../src/domain/nodeLibrary";
const pick = ["agent.architect","agent.coder","agent.tester","agent.reviewer","agent.synthesizer","agent.researcher"];
for (const id of pick) {
  const d = DEFINITIONS_BY_ID.get(id);
  if (!d) { console.log(id, "MISSING"); continue; }
  console.log(id, "| in:", JSON.stringify((d.inputs??[]).map((p:any)=>[p.id,p.label,p.dataType,p.required])), "| out:", JSON.stringify((d.outputs??[]).map((p:any)=>[p.id,p.label,p.dataType])));
}
console.log("--- candidates for a source/brief node ---");
console.log([...DEFINITIONS_BY_ID.keys()].filter((k)=>/input|source|brief|objective|seed|start/i.test(k)).join("\n"));
