/**
 * MJ's own evolution engine (TypeScript) — fitness, constraints and gating for
 * self-improving SKILL.md procedures. No weight updates; skills are plain text.
 *
 * Accept requires:
 *   1. every constraint passes
 *   2. holdoutPassed
 *   3. regressionPassed
 *   4. candidate composite > baseline
 * Bundled skills are never written.
 */

import { skillHasValidStructure, type HermesSkill } from "./hermesSkill";

export const EVOLUTION_CONFIG = {
  iterations: 10,
  populationSize: 5,
  maxSkillSize: 15_000,
  maxToolDescSize: 500,
  maxParamDescSize: 200,
  maxPromptGrowth: 0.2,
  evalDatasetSize: 20,
  trainRatio: 0.5,
  valRatio: 0.25,
  holdoutRatio: 0.25,
  tbliteRegressionThreshold: 0.02,
} as const;

export interface FitnessScore {
  correctness: number;
  procedureFollowing: number;
  conciseness: number;
  lengthPenalty: number;
  feedback: string;
  composite: number;
}

export interface ConstraintResult {
  passed: boolean;
  constraintName: string;
  message: string;
  details?: string;
}

export interface GateResult {
  constraints: ConstraintResult[];
  constraintsPassed: boolean;
  holdoutPassed: boolean;
  regressionPassed: boolean;
  baseline: FitnessScore;
  candidate: FitnessScore;
  accepted: boolean;
  reason: string;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function compositeOf(s: Omit<FitnessScore, "composite">): number {
  const raw = 0.5 * s.correctness + 0.3 * s.procedureFollowing + 0.2 * s.conciseness;
  return Math.max(0, raw - s.lengthPenalty);
}

export function lengthPenalty(artifactSize: number, maxSize: number): number {
  const ratio = artifactSize / Math.max(1, maxSize);
  if (ratio <= 0.9) return 0;
  return Math.min(0.3, (ratio - 0.9) * 3.0);
}

/** Fast heuristic metric for expected-behavior / output keyword overlap. */
export function skillFitnessMetric(_taskInput: string, expectedBehavior: string, agentOutput: string): number {
  if (!agentOutput.trim()) return 0;
  const expectedWords = new Set(expectedBehavior.toLowerCase().split(/\s+/).filter(Boolean));
  const outputWords = new Set(agentOutput.toLowerCase().split(/\s+/).filter(Boolean));
  if (expectedWords.size === 0) return 0.5;
  let overlap = 0;
  for (const w of expectedWords) if (outputWords.has(w)) overlap += 1;
  return clamp01(0.3 + 0.7 * (overlap / expectedWords.size));
}

export function scoreFitness(args: {
  taskInput: string;
  expectedBehavior: string;
  agentOutput: string;
  skillText: string;
}): FitnessScore {
  const overlap = skillFitnessMetric(args.taskInput, args.expectedBehavior, args.agentOutput);
  const procedure = skillFitnessMetric(args.skillText.slice(0, 800), args.expectedBehavior, args.agentOutput);
  const conciseness = args.agentOutput.length > 4000 ? 0.4 : args.agentOutput.length < 40 ? 0.5 : 0.8;
  const lp = lengthPenalty(args.skillText.length, EVOLUTION_CONFIG.maxSkillSize);
  const partial = {
    correctness: overlap,
    procedureFollowing: procedure,
    conciseness,
    lengthPenalty: lp,
    feedback: overlap < 0.5
      ? "Low keyword overlap with expected behavior. Tighten the procedure and name the done-when."
      : "Procedure coverage is acceptable. Prefer smaller, evidenced edits.",
  };
  return { ...partial, composite: compositeOf(partial) };
}

export function validateConstraints(artifactText: string, artifactType: "skill" | "tool_description" | "param_description", baselineText?: string): ConstraintResult[] {
  const results: ConstraintResult[] = [];
  const size = artifactText.length;
  const limit =
    artifactType === "tool_description"
      ? EVOLUTION_CONFIG.maxToolDescSize
      : artifactType === "param_description"
        ? EVOLUTION_CONFIG.maxParamDescSize
        : EVOLUTION_CONFIG.maxSkillSize;
  results.push({
    passed: size <= limit,
    constraintName: "size_limit",
    message: size <= limit ? `Size OK: ${size}/${limit} chars` : `Size exceeded: ${size}/${limit} chars (${size - limit} over)`,
  });
  if (baselineText !== undefined) {
    const growth = (size - baselineText.length) / Math.max(1, baselineText.length);
    results.push({
      passed: growth <= EVOLUTION_CONFIG.maxPromptGrowth,
      constraintName: "growth_limit",
      message: growth <= EVOLUTION_CONFIG.maxPromptGrowth
        ? `Growth OK: ${(growth * 100).toFixed(1)}% (max ${(EVOLUTION_CONFIG.maxPromptGrowth * 100).toFixed(0)}%)`
        : `Growth exceeded: ${(growth * 100).toFixed(1)}% (max ${(EVOLUTION_CONFIG.maxPromptGrowth * 100).toFixed(0)}%)`,
    });
  }
  results.push({
    passed: Boolean(artifactText.trim()),
    constraintName: "non_empty",
    message: artifactText.trim() ? "Artifact is non-empty" : "Artifact is empty",
  });
  if (artifactType === "skill") {
    const struct = skillHasValidStructure(artifactText);
    results.push({
      passed: struct.ok,
      constraintName: "skill_structure",
      message: struct.ok
        ? "Skill has valid frontmatter (name + description)"
        : `Skill missing: ${struct.missing.join(", ")}`,
    });
  }
  return results;
}

export function gateCandidate(args: {
  baselineText: string;
  candidateText: string;
  artifactType?: "skill" | "tool_description" | "param_description";
  taskInput: string;
  expectedBehavior: string;
  baselineOutput: string;
  candidateOutput: string;
  bundled: boolean;
}): GateResult {
    if (args.bundled) {
    return {
      constraints: [{ passed: false, constraintName: "bundled_readonly", message: "Curator never writes bundled skills." }],
      constraintsPassed: false,
      holdoutPassed: false,
      regressionPassed: false,
      baseline: scoreFitness({ taskInput: args.taskInput, expectedBehavior: args.expectedBehavior, agentOutput: args.baselineOutput, skillText: args.baselineText }),
      candidate: scoreFitness({ taskInput: args.taskInput, expectedBehavior: args.expectedBehavior, agentOutput: args.candidateOutput, skillText: args.candidateText }),
      accepted: false,
      reason: "Bundled skills are read-only.",
    };
  }
  const constraints = validateConstraints(args.candidateText, args.artifactType ?? "skill", args.baselineText);
  const constraintsPassed = constraints.every((c) => c.passed);
  const baseline = scoreFitness({
    taskInput: args.taskInput,
    expectedBehavior: args.expectedBehavior,
    agentOutput: args.baselineOutput,
    skillText: args.baselineText,
  });
  const candidate = scoreFitness({
    taskInput: args.taskInput,
    expectedBehavior: args.expectedBehavior,
    agentOutput: args.candidateOutput,
    skillText: args.candidateText,
  });
  const holdoutPassed = candidate.composite >= 0.45;
  const regressionPassed = candidate.composite + EVOLUTION_CONFIG.tbliteRegressionThreshold >= baseline.composite;
  const accepted = constraintsPassed && holdoutPassed && regressionPassed && candidate.composite > baseline.composite;
  let reason = "Pending gates.";
  if (!constraintsPassed) reason = "Constraint failed: " + constraints.filter((c) => !c.passed).map((c) => c.constraintName).join(", ");
  else if (!holdoutPassed) reason = "Holdout failed.";
  else if (!regressionPassed) reason = "Regression vs baseline.";
  else if (!(candidate.composite > baseline.composite)) reason = "No improvement over baseline.";
  else reason = "All gates passed.";
  return { constraints, constraintsPassed, holdoutPassed, regressionPassed, baseline, candidate, accepted, reason };
}

export function proposeSkillEdit(skill: HermesSkill, evidence: string[]): { nextBody: string; trigger: string } {
  const extra = evidence.length
    ? `\n\n## Learned corrections\n\n${evidence.map((e) => `- ${e}`).join("\n")}\n`
    : "\n\n## Learned corrections\n\n- Prefer explicit done-when checks after every tool call.\n";
  return { nextBody: skill.body + extra, trigger: "trace-failure" };
}
