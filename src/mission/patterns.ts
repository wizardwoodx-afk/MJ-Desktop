/**
 * MJ 11.13.1 — the Pattern Registry (adaptive extraction: patterns, NOT code).
 *
 * The idea, made honest: MJ watches the agent ecosystem, notices that "Agent A
 * has the best sub-agent system" or "Agent B has the best tool calling", and
 * takes THAT CAPABILITY into its own skills — but only the pattern, never the
 * code. Copying code would entangle MJ in other projects' licenses and dilute
 * the governance story that makes MJ different; re-implementing a pattern
 * independently and measuring it through the same experiment + human-approval
 * pipeline as everything else keeps MJ MJ.
 *
 * Every entry carries provenance: where the pattern was observed, the license
 * of the observed project (reference only — nothing copied), and how MJ adopts
 * it. `patternToSkillProposal` turns an entry into a normal skillEvolution
 * proposal: agents propose, HUMANS install (the ledger's RECOURSE rule).
 * Anthropic's commerce blueprint (Apache 2.0, Sept 2026) appears here as an
 * observed pattern too — including the stance MJ answers differently
 * (single-agent skill loading vs MJ's measured multi-seat teams).
 */
import type { SkillProposal } from "./skillEvolution";

export interface PatternEntry {
  id: string;
  name: string;
  /** where the pattern was observed (public project / docs), for provenance */
  observedIn: string;
  /** license of the OBSERVED project — reference only; MJ copies no code */
  observedLicense: string;
  capability: string;
  /** how MJ adopts this pattern independently */
  mjAdoption: string;
  /** native = already part of MJ; proposed = awaiting the human approval queue */
  status: "native" | "proposed";
}

export const PATTERN_REGISTRY: PatternEntry[] = [
  {
    id: "pattern.subagent-orchestration",
    name: "Sub-agent orchestration",
    observedIn: "OpenHands (MIT), SWE-agent (MIT) — public event-stream / ACI designs",
    observedLicense: "MIT (reference only — no code copied)",
    capability: "A planner delegates isolated subtasks to specialist workers and merges their results.",
    mjAdoption: "MJ runs heterogeneous seats in worktrees with role-based delegation and gated merge — and MEASURES team shapes against single-agent arms in the strategy experiment instead of assuming which wins.",
    status: "native",
  },
  {
    id: "pattern.tool-calling-registry",
    name: "Tool calling through a registry",
    observedIn: "Goose (Apache 2.0) — 70+ MCP extensions; the MCP ecosystem at large",
    observedLicense: "Apache 2.0 (reference only — no code copied)",
    capability: "One calling convention lets any tool join an agent without bespoke glue.",
    mjAdoption: "MJ's harness registry + vendor MCP servers: harnesses are wrapped as seats with composed argv; capabilities join through the same typed command table, never by forking the caller.",
    status: "native",
  },
  {
    id: "pattern.skill-loading-over-splitting",
    name: "Dynamic skill loading vs agent splitting",
    observedIn: "Anthropic Claude Commerce Agents (Apache 2.0, Sept 2026)",
    observedLicense: "Apache 2.0 (reference only — no code copied)",
    capability: "One agent instance loads skills on demand instead of spawning a sub-agent per capability.",
    mjAdoption: "MJ keeps BOTH options and lets evidence decide: approved skills ride in every briefing (the loading pattern), while seat splits stay available — the strategy experiment measures which shape wins per mission class.",
    status: "native",
  },
  {
    id: "pattern.code-level-guardrails",
    name: "Guardrails enforced in code, not prompts",
    observedIn: "Anthropic Claude Commerce Agents (Apache 2.0) — payment/sourcing/approval rules enforced at code level",
    observedLicense: "Apache 2.0 (reference only — no code copied)",
    capability: "Safety rules survive prompt injection because the code refuses, not the model.",
    mjAdoption: "MJ's oldest doctrine, surfaced as a guardrail manifest on the Audit page: human-only principals, scope subsets, expiry, revocation, budget reservation, DOCTRINE write rule, approval-before-install, verifier-not-author — each enforced by a check that runs, pinned by probes.",
    status: "native",
  },
  {
    id: "pattern.merchant-approval-staging",
    name: "Every proposed change staged behind human approval",
    observedIn: "Anthropic Claude Commerce Agents (Apache 2.0) — merchant agent drafts, humans approve",
    observedLicense: "Apache 2.0 (reference only — no code copied)",
    capability: "The agent may draft anything; nothing applies without an explicit human decision.",
    mjAdoption: "MJ's unified approval queue: skill proposals and inferred beliefs wait for a human click; DOCTRINE and RECOURSE writes pass the ledger matrix before persisting.",
    status: "native",
  },
  {
    id: "pattern.harness-cost-honesty",
    name: "Report-only cost honesty",
    observedIn: "Codex CLI / OpenCode (Apache 2.0 / MIT) — token reporting varies by provider",
    observedLicense: "Apache 2.0 / MIT (reference only — no code copied)",
    capability: "Spend accounting must distinguish 'reported dollars' from 'tokens only'.",
    mjAdoption: "MJ enforces caps on REPORTED USD only; token-only seats are marked dollar-UNKNOWN in the run report — MJ never invents a price. Stated in the budget note of every capped run.",
    status: "native",
  },
];

export function loadPatternRegistry(): PatternEntry[] {
  return PATTERN_REGISTRY;
}

/** Turn an observed pattern into a standard skill proposal — agents propose, humans install. */
export function patternToSkillProposal(p: PatternEntry, now: number): SkillProposal {
  return {
    id: `skill.pattern.${p.id}`,
    name: p.name,
    description: `Adopted pattern from ${p.observedIn} (${p.observedLicense}). ${p.capability} MJ adoption: ${p.mjAdoption}`,
    source: "observed-pattern",
    sourceMissionId: p.id,
    status: "proposed",
    learnedAt: now,
  };
}
