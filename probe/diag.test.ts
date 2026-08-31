import { MissionRuntime, createServices } from "../src/mission/missionRuntime";
import { instantiateTemplate } from "../src/mission/templates";
import { DEFAULT_BOUNDARY, DEFAULT_BUDGET, DEFAULT_POLICY } from "../src/mission/types";

const m = instantiateTemplate("tpl.software-development", { objective: "Build a production-ready SaaS billing feature in TypeScript", name: "d", workspace: "." });
m.successCriteria = ["Builds without errors", "Tests pass"];
m.budget = { ...DEFAULT_BUDGET, maxCostUsd: 5, maxRetriesPerTask: 3, maxConcurrentAgents: 6, maxGraphMutations: 4 };
m.riskPolicy = { ...DEFAULT_POLICY, autonomy: "SUPERVISED", approvalThreshold: "HIGH", allowReorganization: true, allowHarnessSwitch: true };
m.boundary = { ...DEFAULT_BOUNDARY, shell: true, filesystemWrite: true, credentials: false, browser: false };
const services = createServices();
let approvals = 0;
const rt = new MissionRuntime(m, services, { allowSimulated: true, installed: { "local-test": true }, approvalTimeoutMs: 4000,
  onApprovalRequired: (id) => { approvals += 1; console.log("APPROVAL REQUESTED", id); setTimeout(() => services.approvals.decide(id, "APPROVED", "human", "ok"), 20); } });
rt.prepare(); rt.buildOrganization();
const res = await rt.run();
const ev = rt.getEvents();
const count = (k: string) => ev.filter((e) => e.kind === k).length;
console.log("status", m.status, res.status ?? "");
console.log("approvalsSeen", approvals, "pending", services.approvals.forMission(m.missionId).length);
console.log("REPAIR_STARTED", count("REPAIR_STARTED"), "REPAIR_COMPLETED", count("REPAIR_COMPLETED"));
console.log("tasks:"); for (const t of rt.org.tasks_()) console.log("  ", t.title, t.state, "attempts", t.attempts, "/", t.maxAttempts, "risk", t.risk, "cls", t.cls, "|", (t.error??"").slice(0,80));
console.log("distinct event kinds", new Set(ev.map((e)=>e.kind)).size, "total", ev.length);
console.log("checkpoints", rt.getCheckpoints ? "?" : "?");
console.log("last 5 events:", ev.slice(-5).map((e)=>e.kind+" :: "+e.reason.slice(0,90)).join("\n  "));
