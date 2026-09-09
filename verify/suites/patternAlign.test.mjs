import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/mission/patterns.ts
var PATTERN_REGISTRY = [
  {
    id: "pattern.subagent-orchestration",
    name: "Sub-agent orchestration",
    observedIn: "OpenHands (MIT), SWE-agent (MIT) \u2014 public event-stream / ACI designs",
    observedLicense: "MIT (reference only \u2014 no code copied)",
    capability: "A planner delegates isolated subtasks to specialist workers and merges their results.",
    mjAdoption: "MJ runs heterogeneous seats in worktrees with role-based delegation and gated merge \u2014 and MEASURES team shapes against single-agent arms in the strategy experiment instead of assuming which wins.",
    status: "native"
  },
  {
    id: "pattern.tool-calling-registry",
    name: "Tool calling through a registry",
    observedIn: "Goose (Apache 2.0) \u2014 70+ MCP extensions; the MCP ecosystem at large",
    observedLicense: "Apache 2.0 (reference only \u2014 no code copied)",
    capability: "One calling convention lets any tool join an agent without bespoke glue.",
    mjAdoption: "MJ's harness registry + vendor MCP servers: harnesses are wrapped as seats with composed argv; capabilities join through the same typed command table, never by forking the caller.",
    status: "native"
  },
  {
    id: "pattern.skill-loading-over-splitting",
    name: "Dynamic skill loading vs agent splitting",
    observedIn: "Anthropic Claude Commerce Agents (Apache 2.0, Sept 2026)",
    observedLicense: "Apache 2.0 (reference only \u2014 no code copied)",
    capability: "One agent instance loads skills on demand instead of spawning a sub-agent per capability.",
    mjAdoption: "MJ keeps BOTH options and lets evidence decide: approved skills ride in every briefing (the loading pattern), while seat splits stay available \u2014 the strategy experiment measures which shape wins per mission class.",
    status: "native"
  },
  {
    id: "pattern.code-level-guardrails",
    name: "Guardrails enforced in code, not prompts",
    observedIn: "Anthropic Claude Commerce Agents (Apache 2.0) \u2014 payment/sourcing/approval rules enforced at code level",
    observedLicense: "Apache 2.0 (reference only \u2014 no code copied)",
    capability: "Safety rules survive prompt injection because the code refuses, not the model.",
    mjAdoption: "MJ's oldest doctrine, surfaced as a guardrail manifest on the Audit page: human-only principals, scope subsets, expiry, revocation, budget reservation, DOCTRINE write rule, approval-before-install, verifier-not-author \u2014 each enforced by a check that runs, pinned by probes.",
    status: "native"
  },
  {
    id: "pattern.merchant-approval-staging",
    name: "Every proposed change staged behind human approval",
    observedIn: "Anthropic Claude Commerce Agents (Apache 2.0) \u2014 merchant agent drafts, humans approve",
    observedLicense: "Apache 2.0 (reference only \u2014 no code copied)",
    capability: "The agent may draft anything; nothing applies without an explicit human decision.",
    mjAdoption: "MJ's unified approval queue: skill proposals and inferred beliefs wait for a human click; DOCTRINE and RECOURSE writes pass the ledger matrix before persisting.",
    status: "native"
  },
  {
    id: "pattern.harness-cost-honesty",
    name: "Report-only cost honesty",
    observedIn: "Codex CLI / OpenCode (Apache 2.0 / MIT) \u2014 token reporting varies by provider",
    observedLicense: "Apache 2.0 / MIT (reference only \u2014 no code copied)",
    capability: "Spend accounting must distinguish 'reported dollars' from 'tokens only'.",
    mjAdoption: "MJ enforces caps on REPORTED USD only; token-only seats are marked dollar-UNKNOWN in the run report \u2014 MJ never invents a price. Stated in the budget note of every capped run.",
    status: "native"
  }
];
function loadPatternRegistry() {
  return PATTERN_REGISTRY;
}
function patternToSkillProposal(p, now) {
  return {
    id: `skill.pattern.${p.id}`,
    name: p.name,
    description: `Adopted pattern from ${p.observedIn} (${p.observedLicense}). ${p.capability} MJ adoption: ${p.mjAdoption}`,
    source: "observed-pattern",
    sourceMissionId: p.id,
    status: "proposed",
    learnedAt: now
  };
}

// probe/patternAlign.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
ok(
  "the registry is non-empty and every entry names a capability and an adoption",
  PATTERN_REGISTRY.length >= 5 && PATTERN_REGISTRY.every((p) => p.capability.length > 10 && p.mjAdoption.length > 10)
);
ok(
  "every entry carries provenance: where it was observed and the observed project's license",
  PATTERN_REGISTRY.every((p) => p.observedIn.length > 5 && p.observedLicense.length > 5)
);
ok(
  "every entry states the code-copying prohibition explicitly (patterns, not code)",
  PATTERN_REGISTRY.every((p) => p.observedLicense.includes("no code copied"))
);
ok(
  "Anthropic's commerce blueprint is represented \u2014 including the skill-loading stance",
  PATTERN_REGISTRY.some((p) => p.observedIn.includes("Claude Commerce Agents")) && PATTERN_REGISTRY.some((p) => p.id === "pattern.skill-loading-over-splitting")
);
ok(
  "the cost-honesty pattern is registered (token-only stays dollar-UNKNOWN)",
  PATTERN_REGISTRY.some((p) => p.id === "pattern.harness-cost-honesty")
);
ok("entry ids are unique", new Set(PATTERN_REGISTRY.map((p) => p.id)).size === PATTERN_REGISTRY.length);
var prop = patternToSkillProposal(PATTERN_REGISTRY[0], 123);
ok(
  "a pattern becomes a standard skill proposal \u2014 status proposed, source observed-pattern",
  prop.status === "proposed" && prop.source === "observed-pattern" && prop.id.startsWith("skill.pattern.")
);
ok(
  "the proposal carries the adoption story, so the approver sees what they approve",
  prop.description.includes("MJ adoption:") && prop.description.includes(PATTERN_REGISTRY[0].observedLicense)
);
ok("loadPatternRegistry returns the registry (the UI reads it live)", loadPatternRegistry().length === PATTERN_REGISTRY.length);
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
