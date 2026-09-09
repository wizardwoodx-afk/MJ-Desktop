/**
 * V9 — team binding, end to end.
 *
 * `agentTeam.test.ts` proves the team model in isolation. This proves the other half: that a saved
 * crew actually changes what a real MissionRuntime plans. A team that only lives in the Teams page
 * would be decoration, and MJ does not ship decoration.
 *
 * Planning here is real. Execution is not run — nothing in this test needs a CLI.
 */

import { MissionRuntime, createServices } from "../src/mission/missionRuntime";
import { instantiateTemplate } from "../src/mission/templates";
import { DEFAULT_BOUNDARY, DEFAULT_BUDGET, DEFAULT_POLICY } from "../src/mission/types";
import type { Mission } from "../src/mission/types";
import {
  PREBUILT_TEAMS,
  STEP_KIND_TO_ROLE,
  applyTeamToSteps,
  bindTeamToPlan,
  type CliAgentTeam,
  type TeamSeat,
} from "../src/mission/agentTeam";
import { AGENT_CAPABILITIES } from "../src/mission/agentCapabilities";
import type { HarnessId } from "../src/domain/harness";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};

function makeMission(objective: string): Mission {
  const m = instantiateTemplate("tpl.software-development", { objective, name: "Team binding test", workspace: "." });
  m.successCriteria = ["Builds without errors", "Tests pass"];
  m.budget = { ...DEFAULT_BUDGET, maxCostUsd: 5, maxRetriesPerTask: 3, maxConcurrentAgents: 6, maxGraphMutations: 4 };
  m.riskPolicy = { ...DEFAULT_POLICY, autonomy: "SUPERVISED", approvalThreshold: "HIGH", allowReorganization: true, allowHarnessSwitch: true };
  m.boundary = { ...DEFAULT_BOUNDARY, shell: true, filesystemWrite: true, credentials: false, browser: false };
  return m;
}

const balanced = PREBUILT_TEAMS.find((t) => t.id === "team.balanced")!;
const audit = PREBUILT_TEAMS.find((t) => t.id === "team.audit")!;

console.log("\n== every plan step kind has a decided fate ==\n");

{
  const kinds = ["research", "architecture", "implementation", "test", "security", "review", "approval", "synthesis", "release"];
  for (const k of kinds) {
    ok(k in STEP_KIND_TO_ROLE, `"${k}" is mapped, so no step kind is silently unhandled`);
  }
  ok(STEP_KIND_TO_ROLE.approval === null, "approval is deliberately not agent work — it is a human's");
}

console.log("\n== binding a crew to a real plan ==\n");

{
  const rt = new MissionRuntime(makeMission("Add a rate limiter to the API"), createServices(), {
    allowSimulated: true,
    installed: { "local-test": true },
    team: balanced,
  });
  rt.prepare();

  const binding = rt.getTeamBinding();
  ok(binding !== null, "prepare() with a team produces a binding");
  const plan = rt.getPlan();
  ok(plan !== null && plan.steps.length > 0, `a real plan was produced: ${plan?.steps.length} steps`);
  ok(binding!.bound + binding!.unbound === plan!.steps.length, `every step has a decided fate (${binding!.bound} bound + ${binding!.unbound} unbound = ${plan!.steps.length})`);

  // The binding must have actually landed on the steps, not just been computed.
  const impl = plan!.steps.find((s) => s.kind === "implementation");
  ok(impl !== undefined, "the plan has an implementation step");
  const implBind = binding!.bindings.find((b) => b.stepId === impl!.id);
  ok(implBind?.harness === "claude", `implementation is seated on the crew's coder (claude), got ${implBind?.harness}`);
  ok(impl!.preferredHarness === "claude", `and preferredHarness was actually set on the step, got ${impl!.preferredHarness}`);

  const rev = plan!.steps.find((s) => s.kind === "review");
  if (rev) {
    ok(binding!.bindings.find((b) => b.stepId === rev.id)?.harness === "codex", "review is seated on codex, a DIFFERENT vendor than the coder");
  }

  // Recorded in the flight recorder, so the user can see why each step went where.
  const events = rt.getEvents().filter((e) => e.policy === "mission.team-bound");
  ok(events.length === 1, `exactly one team-binding event, got ${events.length}`);
  ok(events[0]?.kind === "HARNESS_SELECTED", `recorded as HARNESS_SELECTED, got ${events[0]?.kind}`);
  ok(events[0]?.actor === "team", "and attributed to the team, not to arbitration");
  ok(events[0]?.reason.includes(balanced.name), `the reason names the crew: ${events[0]?.reason}`);
  ok(Array.isArray((events[0]?.data as { bindings?: unknown[] })?.bindings), "and carries the per-step table");
}

console.log("\n== a read-only crew cannot seat a writer ==\n");

{
  const steps = [
    { id: "s1", kind: "implementation", risk: "MEDIUM" as const },
    { id: "s2", kind: "review", risk: "LOW" as const },
  ];
  const r = bindTeamToPlan(audit, steps);
  ok(r.bindings.find((b) => b.stepId === "s1")?.harness === null, "the audit crew has no coder, so implementation is left unbound");
  ok(/no .* seat|may accept/i.test(r.bindings.find((b) => b.stepId === "s1")?.reason ?? ""), `and it says why: ${r.bindings.find((b) => b.stepId === "s1")?.reason}`);
  ok(r.bindings.find((b) => b.stepId === "s2")?.harness !== null, "but it can still seat a review");

  // Unbound means the arbitrator decides — it must NOT mean "silently run it anyway".
  const scratch = [{ id: "s1", preferredHarness: null as HarnessId | null }];
  ok(applyTeamToSteps(scratch, r) === 0, "an unbound step is left untouched, so arbitration still runs");
  ok(scratch[0].preferredHarness === null, "preferredHarness stays null rather than being guessed");
}

console.log("\n== CRITICAL is never seated ==\n");

{
  const r = bindTeamToPlan(balanced, [{ id: "x", kind: "implementation", risk: "CRITICAL" }]);
  ok(r.bindings[0].harness === null, "a CRITICAL step gets no harness, whatever the crew says");
  ok(r.refused.includes("x"), "and it is listed as refused, not just unbound");
  ok(/human/i.test(r.bindings[0].reason), `the reason names a human: ${r.bindings[0].reason}`);
}

console.log("\n== changing a seat changes the plan ==\n");

{
  const edited: CliAgentTeam = { ...balanced, seats: balanced.seats.map((s: TeamSeat) => (s.role === "coder" ? { ...s, harness: "grok" as HarnessId } : s)) };
  const rt = new MissionRuntime(makeMission("Refactor the auth module"), createServices(), { allowSimulated: true, installed: { "local-test": true }, team: edited });
  rt.prepare();
  const plan = rt.getPlan();
  const impl = plan!.steps.find((s) => s.kind === "implementation")!;
  ok(impl.preferredHarness === "grok", `editing the coder seat to grok changes the plan to ${impl.preferredHarness}`);
  ok(AGENT_CAPABILITIES.grok.name.length > 0, "grok is a real described harness, not a placeholder");
}

console.log("\n== a mission with no team behaves exactly as before ==\n");

{
  const rt = new MissionRuntime(makeMission("Write the docs"), createServices(), { allowSimulated: true, installed: { "local-test": true } });
  rt.prepare();
  ok(rt.getTeamBinding() === null, "no team, no binding — the feature is opt-in");
  ok(rt.getEvents().filter((e) => e.policy === "mission.team-bound").length === 0, "and it emits no team events");
  ok(rt.getPlan()!.steps.length > 0, "planning still works");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
