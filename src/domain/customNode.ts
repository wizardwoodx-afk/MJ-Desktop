/**
 * v1 natural-language assist — ONE custom node only.
 * Full-workflow synthesis is a spec violation (ROX §15 / §43).
 *
 * V11: this module is the *deterministic* half of Assist. When a local model (Ollama) or a
 * configured cloud provider is reachable, AssistantPanel asks the LLM for a node spec and only
 * falls back to this draft — clearly labelled "offline draft" — when no model answers. The
 * title derivation is also no longer "first four words verbatim": request boilerplate is
 * stripped, stopwords dropped, and the result is a readable Title Case name.
 */
import { createNodeFromDef } from "../graph/factory";
import { uid } from "../app/id";
import { DEFINITIONS_BY_ID } from "./nodeLibrary";
import type { NodeInstance } from "./types";

export interface CustomNodeDraft {
  title: string;
  purpose: string;
  identity: string;
  mission: string;
  procedures: string;
}

/** Words that never belong in a node title. */
const STOPWORDS = new Set([
  "a", "an", "the", "that", "which", "to", "for", "from", "with", "and", "or", "of",
  "my", "me", "i", "we", "our", "us", "it", "its", "is", "are", "be", "can", "could",
  "would", "should", "will", "node", "agent", "custom", "make", "create", "build",
  "want", "need", "please", "some", "any", "new", "using", "use",
]);

/**
 * Derive a readable node title from a free-text request.
 *
 * "make me a custom node that redacts PII from meeting notes"
 *   → "Redacts PII Meeting Notes" (trimmed to "Redacts PII")
 * V10.1 and earlier returned "Make Me A Custom" — the first four words of the request.
 */
export function deriveTitle(text: string): string {
  const cleaned = text
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Custom Agent";
  const words = cleaned.split(" ");
  const meaningful = words.filter((w, i) => {
    const lower = w.toLowerCase();
    // Keep the first verb even if it is a common one ("summarize", "redact") — it carries the job.
    if (i < 3 && !STOPWORDS.has(lower)) return true;
    return !STOPWORDS.has(lower);
  });
  const picked = (meaningful.length > 0 ? meaningful : words).slice(0, 4);
  const titled = picked.map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w));
  const title = titled.join(" ").trim();
  return title || "Custom Agent";
}

export function draftCustomNode(instruction: string): CustomNodeDraft {
  const text = instruction
    .trim()
    .replace(/^(make|create|build)\s+(me\s+)?(a|an)?\s*(custom\s+)?(node|agent)\s+(that|to|which)\s+/i, "")
    .replace(/^(i\s+(want|need)\s+(a|an)\s*)?(custom\s+)?(node|agent)\s+(that|to|which)\s+/i, "")
    .trim();
  const title = deriveTitle(text || instruction);
  return {
    title,
    purpose: text || "Accomplish the stated job.",
    identity: `You are MJ ${title}, a specialist custom agent.`,
    mission: text || "Complete the assigned job without leaving this identity.",
    procedures: [
      "1. Restate the job as a testable outcome.",
      "2. Use only granted tools and MCP servers.",
      "3. Verify the output against the purpose.",
      "4. Emit the deliverable. Mark unknowns. Never invent tools or secrets.",
    ].join("\n"),
  };
}

export interface NodeSpec {
  title: string;
  purpose: string;
  procedures: string[];
}

/**
 * Parse an LLM's node-spec reply defensively. Accepts a bare JSON object, a fenced ```json
 * block, or prose around one. Returns null on anything that is not a usable spec — the caller
 * falls back to the offline draft instead of trusting garbage.
 */
export function parseNodeSpec(reply: string): NodeSpec | null {
  if (!reply) return null;
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], reply];
  for (const cand of candidates) {
    if (!cand) continue;
    const start = cand.indexOf("{");
    const end = cand.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      const obj = JSON.parse(cand.slice(start, end + 1)) as Record<string, unknown>;
      const title = typeof obj.title === "string" ? obj.title.trim().slice(0, 60) : "";
      const purpose = typeof obj.purpose === "string" ? obj.purpose.trim().slice(0, 600) : "";
      const procedures = Array.isArray(obj.procedures)
        ? obj.procedures.filter((p): p is string => typeof p === "string" && p.trim().length > 0).slice(0, 10)
        : [];
      if (!title || !purpose) continue;
      return { title, purpose, procedures };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/** The system prompt Assist sends when a model is available. Deliberately strict about shape. */
export function assistSystemPrompt(): string {
  return [
    "You design ONE agent node for MJ, a visual agent orchestration workstation.",
    "Reply with ONLY a JSON object, no prose, no markdown fence:",
    '{"title": string (2-5 words, Title Case, the job in a name), "purpose": string (one sentence, testable), "procedures": string[] (3-6 imperative steps)}',
    "The purpose is the job for THIS run, not an identity. Never invent tools, MCP servers, or secrets.",
  ].join("\n");
}

export function generateCustomNodeFromSpec(spec: NodeSpec, x = 280, y = 180): NodeInstance {
  const def = DEFINITIONS_BY_ID.get("agent.custom") ?? DEFINITIONS_BY_ID.get("agent.synthesizer");
  if (!def) throw new Error("Assist is broken: no agent.custom / agent.synthesizer definition in the library.");
  const node = createNodeFromDef(def, uid("n"), x, y);
  const procedures = spec.procedures.length > 0
    ? spec.procedures.map((p, i) => `${i + 1}. ${p.replace(/^\d+\.\s*/, "")}`).join("\n")
    : draftCustomNode(spec.purpose).procedures;
  node.title = spec.title;
  node.purpose = spec.purpose;
  node.rolePrompt = {
    version: 1,
    sections: {
      ...node.rolePrompt.sections,
      identity: `You are MJ ${spec.title}, a specialist custom agent.`,
      mission: spec.purpose,
      procedures,
      invariants: `You are ${spec.title}. You never act outside this identity. You do not fabricate results or expose secrets.`,
    },
  };
  node.feedbackLoop = "OFF";
  node.evolutionMode = "OFF";
  return node;
}

export function generateCustomNode(instruction: string, x = 280, y = 180): NodeInstance {
  const def = DEFINITIONS_BY_ID.get("agent.custom") ?? DEFINITIONS_BY_ID.get("agent.synthesizer");
  if (!def) throw new Error("Assist is broken: no agent.custom / agent.synthesizer definition in the library.");
  const draft = draftCustomNode(instruction);
  const node = createNodeFromDef(def, uid("n"), x, y);
  node.title = draft.title;
  node.purpose = draft.purpose;
  node.rolePrompt = {
    version: 1,
    sections: {
      ...node.rolePrompt.sections,
      identity: draft.identity,
      mission: draft.mission,
      procedures: draft.procedures,
      invariants: `You are ${draft.title}. You never act outside this identity. You do not fabricate results or expose secrets.`,
    },
  };
  node.feedbackLoop = "OFF";
  node.evolutionMode = "OFF";
  return node;
}
