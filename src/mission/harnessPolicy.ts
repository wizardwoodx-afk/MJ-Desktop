/**
 * §6 + §10 + §33 — translating MJ's risk classes and security boundary into the arguments a
 * real coding CLI actually understands.
 *
 * Why this file exists: a mission boundary that only appears in the UI is a claim, not a
 * control. Every harness here has a real, enforced read-only mode, and MJ uses it:
 *
 *   Claude Code   --permission-mode plan | acceptEdits      (--tools "" strips tools entirely)
 *   Codex         --sandbox read-only | workspace-write
 *   OpenCode      --agent plan | build  (+ an opencode.json permission block for writes)
 *
 * Research notes that shaped this (checked 2026-08):
 *  - `claude -p` supports `--output-format text|json|stream-json`; **json** returns
 *    `total_cost_usd`, `session_id`, `num_turns` and usage. That is real spend, which is why
 *    MJ no longer derives cost from `chars/4`. `stream-json` additionally requires `--verbose`.
 *  - `--allowedTools` skips permission prompts; `--tools` restricts which tools exist at all.
 *    They are different flags and only the second one is a real restriction.
 *  - `codex exec` defaults to a **read-only** sandbox; `--full-auto` is deprecated in favour of
 *    `--sandbox workspace-write`. `--json` emits NDJSON events; `-o <path>` captures the final
 *    message.
 *  - `opencode run` is non-interactive but its sessions start with `question: deny` and
 *    `plan_enter/plan_exit: deny`, so a run that needs to *write* will silently cancel unless
 *    permissions are granted. `--agent plan` is the read-only shape; `--format json` emits
 *    events including `step_finish`, which carries cost and tokens.
 *
 * Everything here is argv. There is no orchestration logic — that lives in `missionRuntime.ts`.
 */

import type { HarnessId } from "../domain/harness";
import type { RiskClass } from "./types";
import { enforcedReadOnly } from "./agentCapabilities";

export const ENFORCED_SANDBOX: Record<HarnessId, boolean> = {
  acp: enforcedReadOnly("acp"),
  claude: enforcedReadOnly("claude"),
  codex: enforcedReadOnly("codex"),
  opencode: enforcedReadOnly("opencode"),
  cursor: enforcedReadOnly("cursor"),
  grok: enforcedReadOnly("grok"),
  cline: enforcedReadOnly("cline"),
  kilo: enforcedReadOnly("kilo"),
  hermes: enforcedReadOnly("hermes"),
  llm: enforcedReadOnly("llm"),
};
export interface HarnessPolicyRequest {
  /** Mission classification for this task (§10). */
  risk: RiskClass;
  /** Mission boundary (§33). Never widened here — only ever narrowed. */
  mayWriteFiles: boolean;
  mayRunShell: boolean;
  mayUseBrowser: boolean;
  /** Hard turn ceiling so a runaway agent cannot burn the budget. */
  maxTurns: number;
  /** Task kind, used to prefer a read-only reviewer shape for review/security work. */
  kind: string;
}

export interface HarnessPolicy {
  /** argv for the harness, with `$PROMPT` marking where the composed prompt goes. */
  argv: string[];
  /** Human-readable statement of what the harness is allowed to do. Shown in the UI. */
  grant: string;
  /** True when the harness can modify the repository under this policy. */
  canWrite: boolean;
  /** True when this policy is read-only by construction. */
  readOnly: boolean;
  /** Set when the request was refused rather than downgraded. */
  refused: string | null;
  /** Which output format MJ will parse for cost and token counts. */
  outputFormat: "text" | "json" | "ndjson";
}

/** Read-only shapes per harness: no filesystem writes, no shell. */
const READ_ONLY: Partial<Record<HarnessId, string[]>> = {
  claude: ["-p", "$PROMPT", "--permission-mode", "plan", "--tools", "", "--output-format", "json"],
  codex: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--json", "$PROMPT"],
  opencode: ["run", "--agent", "plan", "--format", "json", "$PROMPT"],
  cursor: ["-p", "$PROMPT"],
  grok: ["-p", "$PROMPT"],
  cline: ["$PROMPT"],
  kilo: ["$PROMPT"],
  hermes: ["--print", "$PROMPT"],
};

/** Workspace-write shapes per harness. */
const WRITE: Partial<Record<HarnessId, string[]>> = {
  claude: ["-p", "$PROMPT", "--permission-mode", "acceptEdits", "--output-format", "json"],
  codex: ["exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--json", "$PROMPT"],
  opencode: ["run", "--agent", "build", "--format", "json", "$PROMPT"],
  cursor: ["-p", "$PROMPT"],
  grok: ["-p", "$PROMPT"],
  cline: ["$PROMPT"],
  kilo: ["$PROMPT"],
  hermes: ["--print", "$PROMPT"],
};

const REVIEW_KINDS = new Set(["review", "security", "architecture", "synthesis"]);

export function policyFor(id: HarnessId, req: HarnessPolicyRequest): HarnessPolicy {
  const writeShape = WRITE[id];
  const readShape = READ_ONLY[id];
  const enforced = ENFORCED_SANDBOX[id] === true;
  const wantsReadOnly = !req.mayWriteFiles || REVIEW_KINDS.has(req.kind) || req.risk === "LOW";

  // CRITICAL is never handed to a harness. §10: it is a human decision, not a flag.
  if (req.risk === "CRITICAL") {
    return {
      argv: readShape ?? ["$PROMPT"],
      grant: "Read-only. A CRITICAL task is escalated to a human; no harness runs it autonomously.",
      canWrite: false,
      readOnly: true,
      refused: "CRITICAL risk requires human approval before any harness executes it.",
      outputFormat: outputFormatFor(id),
    };
  }

  if (wantsReadOnly) {
    return {
      argv: readShape ?? ["$PROMPT"],
      grant: enforced
        ? "Read-only, enforced by the harness (no file writes, no shell)."
        : "Read-only requested. This harness has no enforced sandbox, so MJ additionally withholds write permission in the prompt and records that the control is advisory.",
      canWrite: false,
      readOnly: true,
      refused: null,
      outputFormat: outputFormatFor(id),
    };
  }

  if (!writeShape) {
    return {
      argv: readShape ?? ["$PROMPT"],
      grant: "Read-only fallback: this harness has no workspace-write mode MJ can request.",
      canWrite: false,
      readOnly: true,
      refused: null,
      outputFormat: outputFormatFor(id),
    };
  }

  const argv = withTurnLimit(id, [...writeShape], req.maxTurns);
  return {
    argv,
    grant: enforced
      ? "Write inside the mission workspace only, enforced by the harness sandbox."
      : "Write requested. This harness has no enforced sandbox; MJ records the control as advisory.",
    canWrite: true,
    readOnly: false,
    refused: null,
    outputFormat: outputFormatFor(id),
  };
}

function withTurnLimit(id: HarnessId, argv: string[], maxTurns: number): string[] {
  if (!Number.isFinite(maxTurns) || maxTurns <= 0) return argv;
  const at = argv.indexOf("$PROMPT");
  const limit = String(Math.max(1, Math.round(maxTurns)));
  const extra: string[] = id === "claude" ? ["--max-turns", limit] : [];
  if (!extra.length) return argv;
  if (at < 0) return [...argv, ...extra];
  return [...argv.slice(0, at), ...extra, ...argv.slice(at)];
}

function outputFormatFor(id: HarnessId): "text" | "json" | "ndjson" {
  if (id === "codex" || id === "opencode") return "ndjson";
  if (id === "claude") return "json";
  return "text";
}

/* ------------------------------------------------------------------ real usage parsing */

export interface ParsedUsage {
  /** Null unless the harness actually reported a figure. MJ never estimates spend. */
  costUsd: number | null;
  tokens: number | null;
  /** Free-form text for the flight recorder: what was parsed, or why nothing was. */
  source: string;
  /** The human-readable result, extracted from the machine format when there is one. */
  text: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Pull real cost/token figures out of what the CLI printed. Returns nulls rather than guesses:
 * a mission that cannot measure its spend says so instead of printing a plausible number.
 */
export function parseUsage(id: HarnessId, stdout: string): ParsedUsage {
  const raw = stdout ?? "";
  if (id === "claude") {
    // `--output-format json` prints one object.
    const obj = lastJsonObject(raw);
    if (!obj) return { costUsd: null, tokens: null, source: "claude: no JSON object in stdout", text: raw };
    const cost = num(obj.total_cost_usd);
    const usage = (obj.usage ?? {}) as Record<string, unknown>;
    const input = num(usage.input_tokens) ?? 0;
    const output = num(usage.output_tokens) ?? 0;
    const tokens = input + output > 0 ? input + output : null;
    const text = typeof obj.result === "string" ? obj.result : raw;
    return { costUsd: cost, tokens, source: `claude: total_cost_usd=${cost ?? "n/a"}, turns=${num(obj.num_turns) ?? "n/a"}`, text };
  }

  if (id === "codex") {
    // `--json` prints NDJSON events; token_count carries last_token_usage.
    const events = jsonLines(raw);
    let tokens: number | null = null;
    let text = "";
    for (const e of events) {
      const payload = (e.payload ?? e) as Record<string, unknown>;
      // Codex nests usage differently across versions: on the event, under `payload.info`, or
      // under `usage` directly. Look in all of them rather than betting on one shape.
      const info = (payload.info ?? payload) as Record<string, unknown>;
      const usage = firstObject(
        info.last_token_usage,
        info.total_token_usage,
        info.token_usage,
        info.usage,
        payload.usage,
        e.usage,
      );
      if (usage) {
        const total = num(usage.total_tokens) ?? (num(usage.input_tokens) ?? 0) + (num(usage.output_tokens) ?? 0);
        if (total > 0) tokens = total;
      }
      const t = payload.type ?? e.type;
      if (typeof t === "string" && t.includes("completed")) {
        const last = (info.last_agent_message ?? payload.text ?? null) as unknown;
        if (typeof last === "string" && last) text = last;
      }
    }
    return {
      costUsd: null, // Codex reports tokens, not dollars; MJ will not convert with a guessed price.
      tokens,
      source: `codex: ${events.length} NDJSON event(s), tokens=${tokens ?? "n/a"}`,
      text: text || raw,
    };
  }

  if (id === "opencode") {
    // `--format json` prints raw events; step_finish carries cost and tokens.
    const events = jsonLines(raw);
    let cost: number | null = null;
    let tokens: number | null = null;
    const parts: string[] = [];
    for (const e of events) {
      const type = String(e.type ?? "");
      const part = (e.part ?? {}) as Record<string, unknown>;
      if (type === "text" && typeof part.text === "string") parts.push(part.text);
      if (type === "step_finish" || part.type === "step-finish") {
        const c = num(part.cost) ?? num((part.tokens as Record<string, unknown> | undefined)?.cost);
        if (c != null) cost = c;
        const tk = (part.tokens ?? {}) as Record<string, unknown>;
        const t = (num(tk.input) ?? 0) + (num(tk.output) ?? 0) + (num(tk.reasoning) ?? 0);
        if (t > 0) tokens = t;
      }
    }
    return {
      costUsd: cost,
      tokens,
      source: `opencode: ${events.length} event(s), cost=${cost ?? "n/a"}, tokens=${tokens ?? "n/a"}`,
      text: parts.join("\n").trim() || raw,
    };
  }

  return { costUsd: null, tokens: null, source: `${id}: no machine-readable usage in output`, text: raw };
}

function firstObject(...vals: unknown[]): Record<string, unknown> | null {
  for (const v of vals) if (v && typeof v === "object") return v as Record<string, unknown>;
  return null;
}

function jsonLines(raw: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const v = JSON.parse(t) as unknown;
      if (v && typeof v === "object") out.push(v as Record<string, unknown>);
    } catch {
      /* a partial line is not an event */
    }
  }
  return out;
}

function lastJsonObject(raw: string): Record<string, unknown> | null {
  const lines = jsonLines(raw);
  if (lines.length) return lines[lines.length - 1];
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object") return v as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  return null;
}

/* ------------------------------------------------------------------ what a mission boundary means in argv */

/**
 * The permission block MJ puts in front of the prompt. It is not the enforcement mechanism for
 * harnesses that have a sandbox — the sandbox is — but for harnesses that do not, and for the
 * agent reading it, it is the stated contract. It is always derived from the *intersection* of
 * the mission boundary and the role's requirements, never from the role alone.
 */
export function permissionPreamble(granted: Record<string, boolean>, policy: HarnessPolicy): string {
  const allowed = Object.entries(granted).filter(([, v]) => v).map(([k]) => k);
  const denied = Object.entries(granted).filter(([, v]) => !v).map(([k]) => k);
  return [
    `# Permissions for this run`,
    `Allowed: ${allowed.join(", ") || "none"}`,
    `Denied: ${denied.join(", ") || "none"}`,
    `Sandbox: ${policy.grant}`,
    ``,
    `If the task needs something denied here, stop and say what you needed. Do not work around it.`,
  ].join("\n");
}
