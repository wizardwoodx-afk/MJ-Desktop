import { MissionRuntime, createServices } from "../src/mission/missionRuntime";
import { instantiateTemplate } from "../src/mission/templates";
import { DEFAULT_BOUNDARY, DEFAULT_BUDGET, DEFAULT_POLICY } from "../src/mission/types";
const m = instantiateTemplate("tpl.software-development", { objective: "Build a production-ready SaaS billing feature in TypeScript", name: "d", workspace: "." });
m.successCriteria = ["Builds without errors","Tests pass"];
m.budget = { ...DEFAULT_BUDGET, maxCostUsd: 5, maxRetriesPerTask: 3, maxConcurrentAgents: 6, maxGraphMutations: 4 };
m.riskPolicy = { ...DEFAULT_POLICY, autonomy: "SUPERVISED", approvalThreshold: "HIGH", allowReorganization: true, allowHarnessSwitch: true };
m.boundary = { ...DEFAULT_BOUNDARY, shell: true, filesystemWrite: true, credentials: false, browser: false };
const services = createServices();
const rt = new MissionRuntime(m, services, { allowSimulated: true, installed: { "local-test": true }, approvalTimeoutMs: 4000 });
rt.prepare(); rt.buildOrganization();
await rt.run();
const ev = rt.getEvents();
for (const k of ["REPAIR_STARTED","REPAIR_COMPLETED"]) {
  const rows = ev.filter((e)=>e.kind===k);
  const byPolicy: Record<string, number> = {};
  for (const e of rows) byPolicy[e.policy] = (byPolicy[e.policy] ?? 0) + 1;
  console.log(k, "=", rows.length, JSON.stringify(byPolicy));
  for (const e of rows.slice(0,3)) console.log("   sample:", e.seq, e.policy, "::", e.reason.slice(0,90), "| subj", e.subjectId);
}
const seqs = ev.map((e)=>e.seq);
console.log("total", ev.length, "min seq", seqs[0], "max seq", seqs[seqs.length-1], "unique seqs", new Set(seqs).size);
