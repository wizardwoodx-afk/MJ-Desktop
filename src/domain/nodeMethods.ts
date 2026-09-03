import type { NodeDefinition } from "./nodeLibrary";

/**
 * §V11.5 — NODE METHODS, THE HONEST CONTRACT.
 *
 * The owner's rule: node METHODS are IN-BUILT and NON-CHANGEABLE. A planner plans, a
 * coder codes, a critic attacks the plan — the user never edits the verb, only the noun:
 * what to operate on and where (URLs, paths, names, thresholds). This file is the single
 * place that says, for every node, WHAT ITS METHOD ACTUALLY IS — so the Inspector can
 * show it as a read-only contract line instead of a pretending-to-be-editable field.
 *
 * NODE_FIELDS carries the fold-fields: config keys that pre-date V11.5 ("fold: pre-existing")
 * versus the genuinely-new ones, each with a one-line default hint so the Inspector can
 * label every input honestly. composeAssignment() renders the whole assignment as text
 * (for Assist drafting and the method line) without inventing anything the user didn't set.
 */

export type FieldDoc = { label: string; def?: string; fold?: string };
export type AgentMethodEntry = { method: string };

/** In-built, non-changeable methods per agent/capability node. Owner rule: verbs never editable. */
export const NODE_METHODS: Record<string, AgentMethodEntry> = {
  "agent.planner": {
    method:
      "PLAN (built in): break the objective into an issue tree, resolve dependencies into a dependency map, then emit a stepped plan where every step names its owner. No code until every step has an owner.",
  },
  "agent.researcher": {
    method:
      "RESEARCH (built in): form the query plan, gather primary sources only, and return claims as (claim, source, confidence) triples — no secondhand summaries.",
  },
  "agent.browser": {
    method:
      "BROWSE (built in): plan first, then act — one action per step, each verified against the page state before the next. Never chains unverified actions.",
  },
  "agent.coder": {
    method:
      "CODE (built in): write the smallest diff that passes the tests. No drive-by refactors, no new dependencies without a stated reason.",
  },
  "agent.debugger": {
    method:
      "DEBUG (built in): reproduce → isolate → hypothesise → fix → prove with a re-run of the failing case. The bug is only closed by the re-run.",
  },
  "agent.tester": {
    method:
      "TEST (built in): derive tests from the acceptance criteria, edge cases before happy path, and report exact coverage of what was claimed.",
  },
  "agent.critic": {
    method:
      "CRITIQUE (built in): attack the plan, not the author. Every objection names the step it breaks and what evidence would change its mind.",
  },
  "agent.reviewer": {
    method:
      "REVIEW (built in): diff-only review — comment on what changed, block on correctness, style nits last and clearly labelled as nits.",
  },
  "agent.qa": {
    method:
      "QA (built in): turn the success criteria into an acceptance checklist and check every line — a pass is only a pass with evidence attached.",
  },
  "agent.docs": {
    method:
      "DOCUMENT (built in): write docs from the diff, not from aspiration — what changed, why, and how to migrate. A changelog entry always.",
  },
  "agent.security": {
    method:
      "SECURE (built in): threat-model the data paths through this node, list each threat with severity, and confirm secrets are never logged or echoed.",
  },
  "agent.evolution": {
    method:
      "EVOLVE (built in): run the current mission, measure against the rating signal, and propose exactly one change with the evidence for it.",
  },
  "agent.custom": {
    method:
      "CUSTOM (built in): follow the procedures exactly as written — the procedures ARE the method. No improvisation, no extra steps.",
  },
  "cap.http": {
    method:
      "CALL (built in): one request per run, timeout enforced, status and body size checked before anything downstream sees them.",
  },
  "cap.filesystem": {
    method:
      "FILE (built in): one operation per run, resolved paths only — no traversal outside the workspace root.",
  },
  "cap.terminal": {
    method:
      "RUN (built in): execute once with the configured timeout, capture stdout/stderr separately, and fail loudly on non-zero exit.",
  },
  "cap.browser": {
    method:
      "DRIVE (built in): attach to a real browser session, act one step at a time, verify between steps.",
  },
  "cap.json": {
    method:
      "SHAPE (built in): parse, then apply the shape — the output is the input made conformant, or a precise error.",
  },
  "cap.webhook": {
    method:
      "DELIVER (built in): sign the payload (HMAC-SHA256), deliver with 3 retries and exponential backoff, and record the final status.",
  },
  "cap.cron": {
    method:
      "SCHEDULE (built in): fire on the cron schedule; skip if the previous run is still busy — no overlapping runs, no queue buildup.",
  },
  "cap.vector": {
    method:
      "RECALL (built in): embed once, cache by content hash, and return the k nearest neighbours with their scores.",
  },
};

/** Fallback methods by category, for anything not listed above. */
export const CATEGORY_METHODS: Record<string, string> = {
  agent: "follow the node's procedures exactly as written",
  control: "route the payload exactly as configured — no improvisation",
  cap: "execute the one configured operation, then report honestly",
};

/** Honest field docs: fold-fields pre-date V11.5; new keys carry a one-line default hint. */
export const NODE_FIELDS: Record<string, FieldDoc> = {
  maxSteps: { label: "Max steps", def: "plan/act step ceiling (default 8)", fold: "pre-existing" },
  planningStyle: { label: "Planning style", def: "one of: pragmatic, rigorous, socratic (default pragmatic)", fold: "pre-existing" },
  depth: { label: "Research depth", def: "quick | standard | deep (default standard)", fold: "pre-existing" },
  requirePrimarySources: { label: "Primary sources only", def: "yes/no (default yes)", fold: "pre-existing" },
  startUrl: { label: "Start URL", def: "where browsing begins — a what/where input", fold: "pre-existing" },
  maxActions: { label: "Max actions", def: "hard cap on page actions (default 15)", fold: "pre-existing" },
  language: { label: "Language", def: "programming language for the diff", fold: "pre-existing" },
  styleGuide: { label: "Style guide", def: "one-line style rule the diff must respect", fold: "pre-existing" },
  maxAttempts: { label: "Max attempts", def: "retries before giving up", fold: "pre-existing" },
  passThreshold: { label: "Pass threshold", def: "fraction of green tests that counts as fixed", fold: "pre-existing" },
  harness: { label: "Harness", def: "CLI agent that executes this seat (Teams)", fold: "pre-existing" },
  endpoint: { label: "Endpoint", def: "model API base URL", fold: "pre-existing" },
  model: { label: "Model", def: "model id to call", fold: "pre-existing" },
  initialPayload: { label: "Initial payload", def: "the first value the flow carries", fold: "pre-existing" },
  expression: { label: "Expression", def: "evaluated to decide/route", fold: "pre-existing" },
  keyPath: { label: "Key path", def: "payload path to switch on (dot.notation)", fold: "pre-existing" },
  maxIterations: { label: "Max iterations", def: "loop safety ceiling", fold: "pre-existing" },
  mode: { label: "Mode", def: "fan-out mode", fold: "pre-existing" },
  ms: { label: "Delay ms", def: "pause before continuing", fold: "pre-existing" },
  op: { label: "Operation", def: "the single operation to perform" },
  path: { label: "Path", def: "workspace-relative path to act on" },
  method: { label: "HTTP method", def: "GET | POST | PUT | DELETE (default GET)" },
  timeoutSecs: { label: "Timeout s", def: "kill the call after this many seconds (default 30)" },
  url: { label: "URL", def: "destination for the request/hook" },
  body: { label: "Body", def: "request payload (JSON)" },
  headers: { label: "Headers", def: "request headers (JSON object)" },
  cron: { label: "Cron", def: "schedule expression, 5-field (default */5 * * * *)" },
  k: { label: "k", def: "number of nearest neighbours to return (default 4)" },
};

/**
 * composeAssignment — render a node's assignment as honest text: the head (title + purpose),
 * then an "Assignment:" block with one "- label: value" line per set config value.
 * Booleans render as yes/no; embedded newlines fold to "; ". Values that are undefined,
 * null, empty-string or false are omitted — nothing is invented.
 */
export function composeAssignment(def: NodeDefinition, config: Record<string, unknown> = {}): string {
  const head = `${def.title} (${def.id})\n${def.description}`;
  const lines: string[] = [];
  for (const c of def.configSchema ?? []) {
    const v = config?.[c.key];
    if (v === undefined || v === null || v === "" || v === false) continue;
    const label = NODE_FIELDS[c.key]?.label ?? c.key;
    const value = typeof v === "boolean" ? "yes" : String(v).replace(/\n/g, "; ");
    lines.push(`- ${label}: ${value}`);
  }
  return lines.length > 0 ? `${head}\nAssignment:\n${lines.join("\n")}` : head;
}

/** methodFor — the in-built method line for a node, or its category fallback, never a lie. */
export function methodFor(def: NodeDefinition): string {
  return NODE_METHODS[def.id]?.method ?? CATEGORY_METHODS[def.category] ?? "Method not yet specified";
}
