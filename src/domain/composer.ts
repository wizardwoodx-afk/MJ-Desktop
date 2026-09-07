/**
 * Prompt composer — Role Prompt ≠ Purpose.
 * Purpose is the job for this run. Role Prompt is durable identity.
 * Skills, memory, contract, and permissions are attached, never mixed into identity.
 */
import type { MemoryRecord, NodeInstance, SkillRecord } from "./types";
import type { HermesSkill } from "./hermesSkill";

export interface ComposedPrompt {
  system: string;
  user: string;
  parts: {
    rolePrompt: string;
    purpose: string;
    skills: string;
    memory: string;
    contract: string;
    permissions: string;
  };
}

export function composeNodePrompt(
  node: NodeInstance,
  input: Record<string, unknown>,
  skills: Array<SkillRecord | HermesSkill> = [],
  memories: MemoryRecord[] = [],
): ComposedPrompt {
  const s = node.rolePrompt.sections;
  const rolePrompt = [
    `# Identity`,
    s.identity,
    ``,
    `# Mission`,
    s.mission,
    ``,
    `# Operating principles`,
    s.operatingPrinciples,
    ``,
    `# Procedures`,
    s.procedures,
    ``,
    `# Tool strategy`,
    s.toolStrategy,
    ``,
    `# Verification`,
    s.verificationStrategy,
    ``,
    `# Collaboration`,
    s.collaborationRules,
    ``,
    `# Learning`,
    s.learningRules,
    ``,
    `# Invariants (protected)`,
    s.invariants,
  ].join("\n");

  const purpose = [
    `# Purpose (this run — not identity)`,
    node.purpose || "(no purpose set)",
  ].join("\n");

  const skillBlocks = skills.map((sk) => {
    if ("frontmatter" in sk) {
      return `## SKILL ${sk.frontmatter.name}\n${sk.frontmatter.description}\n\n${sk.body}`;
    }
    return `## SKILL ${sk.name}\n${sk.description}\n\n${sk.procedure}`;
  });
  const skillsText = skillBlocks.length ? `# Active skills\n\n${skillBlocks.join("\n\n")}` : "# Active skills\n(none)";

  const memText = memories.length
    ? `# Memory\n\n${memories.map((m) => `- [${m.kind}] ${m.content}`).join("\n")}`
    : "# Memory\n(none)";

  const contract = [
    `# Contract`,
    `Success: ${node.contract.successCriteria}`,
    `Failure: ${node.contract.failureCriteria}`,
    `Timeout: ${node.contract.timeoutMs}ms`,
    `Retry: ${node.contract.retryPolicy.maxAttempts} × ${node.contract.retryPolicy.backoffMs}ms`,
    node.contract.outputSchema?.length ? `Output schema: ${JSON.stringify(node.contract.outputSchema)}` : "",
  ].filter(Boolean).join("\n");

  const granted = Object.entries(node.permissions)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const permissions = `# Permissions\nGranted: ${granted.join(", ") || "(none)"}\nAllowed MCP: ${node.allowedMcpServers.join(", ") || "(none)"}`;

  const system = [rolePrompt, skillsText, memText, contract, permissions].join("\n\n");
  const user = `${purpose}\n\n# Input\n${JSON.stringify(input, null, 2)}`;
  return {
    system,
    user,
    parts: { rolePrompt, purpose, skills: skillsText, memory: memText, contract, permissions },
  };
}
