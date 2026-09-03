/**
 * §6 Agent arbitration layer — the common harness interface.
 *
 * V5 had a table of argv templates in `domain/harness.ts`. V6 keeps that table (it is still
 * the source of truth for how to invoke each CLI) and adds a real adapter interface so
 * orchestration logic is written once:
 *
 *     CodingAgentHarness -> prepare / supports / invoke / parse
 *
 * Adapters do not decide *which* harness runs; `arbitration.ts` does that. Adapters do not
 * contain mission logic; they only translate a task into a CLI invocation and a result back
 * into a structured outcome.
 *
 * `local-test` is an explicit, labelled test double. It exists so the mission runtime, the
 * flight recorder and the acceptance test can be exercised without a coding CLI installed.
 * It is reported as `installed: true, simulated: true` everywhere it surfaces, and
 * `MissionRuntime` refuses to mark a mission COMPLETED on simulated results unless the
 * mission explicitly opts in. It never pretends to be a real harness.
 */

import { HARNESSES, HARNESS_BY_ID, isCustomHarness, type HarnessId } from "../domain/harness";
import { resolveCaps } from "./agentCapabilities";
import { parseUsage, permissionPreamble, policyFor, type HarnessPolicy } from "./harnessPolicy";
import type { RiskClass } from "./types";
import type { PlanStepKind } from "./types";

export type HarnessIdV6 = HarnessId | "local-test";

export interface HarnessTask {
  taskId: string;
  title: string;
  prompt: string;
  kind: PlanStepKind;
  languages: string[];
  cwd?: string;
  timeoutMs: number;
  /** Capabilities the task needs; adapters report which they actually cover. */
  requiredCapabilities: string[];
  /** §10 Mission classification for this task. Picks the harness sandbox. */
  risk?: RiskClass;
  /** §33 What the mission boundary actually grants this agent, after intersection. */
  mayWriteFiles?: boolean;
  mayRunShell?: boolean;
  mayUseBrowser?: boolean;
  /** Permissions granted, for the stated contract in the prompt. */
  grantedPermissions?: Record<string, boolean>;
}

export interface HarnessOutcome {
  ok: boolean;
  text: string;
  exitCode: number | null;
  latencyMs: number;
  costUsd: number;
  /** True when the result came from the labelled test double rather than a real runtime. */
  simulated: boolean;
  /** What the adapter actually did, for the flight recorder. */
  detail: string;
  error: string | null;
}

export interface CodingAgentHarness {
  id: HarnessIdV6;
  name: string;
  /** Never true for the test double in a real mission. */
  simulated: boolean;
  installHint: string;
  languages: string[];
  strengths: string[];
  canEditFiles: boolean;
  canRunTests: boolean;
  /** Capabilities this adapter genuinely provides. */
  capabilities: string[];
  supports(task: HarnessTask): boolean;
  /** Build the argv / prompt. Exposed so the UI can show exactly what will be executed. */
  prepare(task: HarnessTask): { program: string; args: string[] };
  invoke(task: HarnessTask): Promise<HarnessOutcome>;
}

/* ------------------------------------------------------------------ real adapters */

/**
 * The shared CLI adapter. Every real harness is the same code path with a different argv
 * template — that is the point of §6 ("do not duplicate orchestration logic for every
 * harness").
 */
class CliHarness implements CodingAgentHarness {
  readonly simulated = false;
  constructor(
    readonly id: HarnessId,
    readonly name: string,
    readonly installHint: string,
    readonly languages: string[],
    readonly strengths: string[],
    readonly canEditFiles: boolean,
    readonly canRunTests: boolean,
    readonly capabilities: string[],
  ) {}

  supports(_task: HarnessTask): boolean {
    return true;
  }

  prepare(task: HarnessTask): { program: string; args: string[] } {
    const spec = HARNESS_BY_ID.get(this.id);
    const program = spec?.bins[0] ?? this.id;
    const policy = policyFor(this.id, policyRequestFor(task));
    // The UI shows exactly what will be executed, sandbox flags included. If MJ cannot say what
    // it is about to run, the user cannot consent to it.
    return { program, args: policy.argv.map((a) => (a === "$PROMPT" ? task.prompt : a)) };
  }

  /** The sandbox/write policy this task will run under, for the flight recorder and the UI. */
  policy(task: HarnessTask) {
    return policyFor(this.id, policyRequestFor(task));
  }

  async invoke(task: HarnessTask): Promise<HarnessOutcome> {
    const started = Date.now();
    // Late import keeps the browser preview working: @tauri-apps/api is only touched when
    // the code actually runs inside the native shell.
    const { ipc } = await import("../ipc/client");
    const { detectHost } = await import("../app/desktop");
    if (detectHost() !== "tauri") {
      return {
        ok: false,
        text: "",
        exitCode: null,
        latencyMs: Date.now() - started,
        costUsd: 0,
        simulated: false,
        detail: "not-executed",
        error: `${this.name} requires the native desktop build. Run \`npm run tauri\` (see INSTALL-ON-LAPTOP.md).`,
      };
    }
    const spec = HARNESS_BY_ID.get(this.id)!;
    const detected = await ipc.cliProvidersDetect();
    const hit = detected.find((d) => d.id === this.id || spec.bins.includes(d.invocation) || spec.bins.includes(d.id));
    if (!hit?.installed) {
      return {
        ok: false,
        text: "",
        exitCode: null,
        latencyMs: Date.now() - started,
        costUsd: 0,
        simulated: false,
        detail: "not-installed",
        error: `${this.name} is not on PATH. ${this.installHint}`,
      };
    }
    const policy = policyFor(this.id, policyRequestFor(task));
    if (policy.refused) {
      return {
        ok: false,
        text: "",
        exitCode: null,
        latencyMs: Date.now() - started,
        costUsd: 0,
        simulated: false,
        detail: "refused-by-policy",
        error: `${this.name} was not run: ${policy.refused}`,
      };
    }
    try {
      const argv = policy.argv.map((a) => (a === "$PROMPT" ? task.prompt : a));
      const r = (await ipc.cliInvoke(this.id, task.prompt, task.cwd, Math.max(60, Math.round(task.timeoutMs / 1000)), argv)) as {
        stdout?: string;
        stderr?: string;
        code?: number | null;
      };
      const stdout = String(r.stdout ?? "");
      const usage = parseUsage(this.id, stdout);
      const text = (usage.text || stdout || String(r.stderr ?? "")).trim();
      return {
        ok: Boolean(text) && (r.code == null || r.code === 0),
        text,
        exitCode: r.code ?? null,
        latencyMs: Date.now() - started,
        // Real spend when the harness reports it. Null-equivalent 0 with the source recorded,
        // because MJ does not convert tokens to dollars at a guessed price.
        costUsd: usage.costUsd ?? 0,
        simulated: false,
        detail: `exit=${r.code ?? "?"} bytes=${text.length}; ${usage.source}; sandbox=${policy.readOnly ? "read-only" : "workspace-write"}`,
        error: text ? null : `${this.name} returned no output (exit ${r.code ?? "?"}). ${usage.source}`,
      };
    } catch (e) {
      return {
        ok: false,
        text: "",
        exitCode: null,
        latencyMs: Date.now() - started,
        costUsd: 0,
        simulated: false,
        detail: "spawn-failed",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

function policyRequestFor(task: HarnessTask) {
  return {
    risk: (task.risk ?? "MEDIUM") as RiskClass,
    mayWriteFiles: task.mayWriteFiles ?? false,
    mayRunShell: task.mayRunShell ?? false,
    mayUseBrowser: task.mayUseBrowser ?? false,
    maxTurns: Math.max(1, Math.round(task.timeoutMs / 60_000)),
    kind: task.kind,
  };
}

/** §33 The stated permission contract that goes in front of the prompt. */
export function preambleFor(task: HarnessTask, policy: HarnessPolicy): string {
  return permissionPreamble(task.grantedPermissions ?? {}, policy);
}

/* ------------------------------------------------------------------ §6 test double */

/**
 * The labelled test double. Deterministic, offline, and unmistakably marked.
 *
 * It exists so that the mission runtime's *own* logic — planning, arbitration, failure
 * detection, repair, evaluation, lineage, checkpoints — can be exercised and tested without
 * a coding CLI or an API key. It is not a stand-in for real work and the runtime treats its
 * output as unverified by default.
 */
export class LocalTestHarness implements CodingAgentHarness {
  readonly id = "local-test" as const;
  readonly name = "Local Test Harness (simulated — not a real coding agent)";
  readonly simulated = true;
  readonly installHint = "Built in. Used only when a mission explicitly allows simulated execution.";
  readonly languages = ["any"];
  readonly strengths = ["deterministic-offline-testing"];
  readonly canEditFiles = false;
  readonly canRunTests = false;
  readonly capabilities = ["simulation"];
  /** Task titles matching this fail on the first attempt, to exercise the repair path. */
  failFirstAttemptFor = /implement|build|code/i;
  private attempts = new Map<string, number>();

  supports(_task: HarnessTask): boolean {
    return true;
  }

  prepare(task: HarnessTask): { program: string; args: string[] } {
    return { program: "(in-process simulation)", args: [task.taskId] };
  }

  async invoke(task: HarnessTask): Promise<HarnessOutcome> {
    const started = Date.now();
    const n = (this.attempts.get(task.taskId) ?? 0) + 1;
    this.attempts.set(task.taskId, n);
    // Deterministic, so tests can rely on it: the first attempt at an implementation task
    // fails, which is what drives the §16 repair ladder.
    const shouldFail = this.failFirstAttemptFor.test(task.title) && n === 1;
    await new Promise((r) => setTimeout(r, 5));
    if (shouldFail) {
      return {
        ok: false,
        text: "",
        exitCode: 1,
        latencyMs: Date.now() - started,
        costUsd: 0,
        simulated: true,
        detail: "simulated-failure",
        error: `[local-test] Simulated failure on first attempt at "${task.title}" so the repair path is exercised. This is not real work.`,
      };
    }
    return {
      ok: true,
      text: [
        `[local-test simulation — attempt ${n}]`,
        `Task: ${task.title}`,
        `Kind: ${task.kind}`,
        `Languages: ${task.languages.join(", ") || "n/a"}`,
        "",
        "This output was produced by MJ's labelled test double, not by a coding agent.",
        "It is recorded as simulated and is NOT counted as independently verified.",
      ].join("\n"),
      exitCode: 0,
      latencyMs: Date.now() - started,
      costUsd: 0,
      simulated: true,
      detail: `simulated attempt=${n}`,
      error: null,
    };
  }

  reset(): void {
    this.attempts.clear();
  }
}

/* ------------------------------------------------------------------ registry */

/* ─────────────────────────────────────────────────────────────────────────────
 * §V11.6.2 — THE ADAPTER TIER GAP, CLOSED.
 *
 * The 11.6.1 review found two tiers: the new execution world knew 21 harnesses while
 * this adapter registry still had 8 profiles, so a graph-mission agent pinned to (say)
 * `amp` got NO adapter. Every CLI in the domain registry now has a profile, `llm` is
 * deliberately excluded (a direct LLM call is not a spawnable CLI — it has its own
 * path in the mission runtime), acp is registered by acp.ts, and `custom:<slug>` ids
 * resolve through resolveCaps() into a CustomCliHarness. One registry, no tiers.
 * ───────────────────────────────────────────────────────────────────────────── */
const PROFILES: Array<Omit<CliHarness, "simulated" | "supports" | "prepare" | "invoke">> = [
  { id: "claude", name: "Claude Code", installHint: "npm install -g @anthropic-ai/claude-code, then `claude` to log in.", languages: ["TypeScript", "Python", "Rust", "Go"], strengths: ["coding", "refactor", "security-review", "review"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "refactor", "review", "security-review", "testing"] } as never,
  { id: "codex", name: "OpenAI Codex CLI", installHint: "npm install -g @openai/codex, then `codex login`.", languages: ["TypeScript", "Python", "Rust", "Go"], strengths: ["coding", "testing", "migration"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "testing", "migration", "review"] } as never,
  { id: "opencode", name: "OpenCode", installHint: "npm install -g opencode-ai.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "testing"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "testing", "review"] } as never,
  { id: "cursor", name: "Cursor Agent", installHint: "Install Cursor and enable the agent CLI (cursor-agent on PATH).", languages: ["TypeScript", "Python"], strengths: ["coding", "ui"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "ui", "review"] } as never,
  { id: "grok", name: "Grok CLI", installHint: "Install the xAI Grok CLI and authenticate.", languages: ["TypeScript", "Python"], strengths: ["coding", "research"], canEditFiles: true, canRunTests: false, capabilities: ["coding", "research"] } as never,
  { id: "cline", name: "Cline", installHint: "Install the Cline CLI (the VS Code extension cannot be spawned).", languages: ["TypeScript", "Python"], strengths: ["coding"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] } as never,
  { id: "kilo", name: "Kilo Code", installHint: "Install the Kilo Code CLI on PATH.", languages: ["TypeScript", "Python"], strengths: ["coding"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] } as never,
  { id: "hermes", name: "Hermes Agent", installHint: "Install Hermes Agent (Nous) so `hermes` is on PATH, or use the in-process MJ Hermes loop.", languages: ["any"], strengths: ["general", "tool-use"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "research", "review", "testing", "synthesis"] } as never,
  // ── V11.6.2: the registry's remaining CLIs, profiled honestly (researched 2026-09) ──
  { id: "openclaude", name: "OpenClaude", installHint: "npm install -g @gitlawb/openclaude@latest, then openclaude /provider.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "byok"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] } as never,
  { id: "copilot", name: "GitHub Copilot CLI", installHint: "npm install -g @github/copilot, then copilot login.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "review"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] } as never,
  { id: "aider", name: "Aider", installHint: "python -m pip install aider-install && aider-install.", languages: ["Python", "TypeScript", "Go", "Rust"], strengths: ["coding", "refactor", "git-native-edits"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "refactor", "review"] } as never,
  { id: "gemini", name: "Gemini CLI", installHint: "npm install -g @google/gemini-cli (paid Code Assist tiers; individuals moved to agy).", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "research"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "research", "review"] } as never,
  { id: "antigravity", name: "Antigravity CLI (agy)", installHint: "curl -fsSL https://antigravity.google/cli/install.sh | bash.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "research", "multi-model"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "research", "review"] } as never,
  { id: "amp", name: "Amp (Sourcegraph)", installHint: "npm install -g @sourcegraph/amp, then amp login.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "review", "code-search-context"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] } as never,
  { id: "crush", name: "Crush (Charm)", installHint: "npm install -g @charmbracelet/crush.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "llm-agnostic"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] } as never,
  { id: "openhands", name: "OpenHands", installHint: "pip install openhands, then openhands login.", languages: ["Python", "TypeScript"], strengths: ["coding", "autonomous-tasks", "sandboxed"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "testing"] } as never,
  { id: "goose", name: "Goose (Block)", installHint: "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash.", languages: ["TypeScript", "Python", "Rust"], strengths: ["coding", "automation", "mcp-native"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] } as never,
  { id: "qwen", name: "Qwen Code", installHint: "npm install -g @qwen-code/qwen-code, then qwen (API key or Coding Plan).", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "multi-provider"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] } as never,
  { id: "amazonq", name: "Amazon Q / Kiro CLI", installHint: "Install the AWS Q or Kiro CLI (kiro-cli on PATH) and authenticate.", languages: ["TypeScript", "Python"], strengths: ["coding", "aws"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] } as never,
];

export const localTestHarness = new LocalTestHarness();

/* ── §V11.6.2: custom:<slug> adapters, built from the resolver (no second registry) ── */

/**
 * A user-registered custom harness as a mission adapter. Unlike CliHarness it does NOT go
 * through harnessPolicy (the policy layer is builtin-only): the user's own argv is the
 * contract, read-only is advisory, and the Rust side re-expands $PROMPT from its own
 * saved registry at spawn time — the same trust boundary the team executor uses.
 */
class CustomCliHarness implements CodingAgentHarness {
  readonly simulated = false;
  readonly canEditFiles = true;
  readonly canRunTests = true;
  readonly languages = ["any"];
  readonly strengths = ["user-registered"];
  readonly capabilities = ["coding"];
  constructor(readonly id: HarnessIdV6, readonly name: string, readonly installHint: string) {}

  supports(_task: HarnessTask): boolean {
    return true;
  }

  prepare(task: HarnessTask): { program: string; args: string[] } {
    const { caps } = resolveCaps(this.id);
    return {
      program: caps.bins[0] ?? this.id,
      args: (caps.prompt.argv ?? ["$PROMPT"]).map((a) => (a === "$PROMPT" ? task.prompt : a)),
    };
  }

  async invoke(task: HarnessTask): Promise<HarnessOutcome> {
    const started = Date.now();
    const { ipc } = await import("../ipc/client");
    const { detectHost } = await import("../app/desktop");
    if (detectHost() !== "tauri") {
      return {
        ok: false, text: "", exitCode: null, latencyMs: Date.now() - started, costUsd: 0,
        simulated: false, detail: "web-preview", error: "Custom harnesses spawn through the native shell only.",
      };
    }
    try {
      // No argv from TypeScript on purpose: Rust re-expands $PROMPT from its own registry.
      const r = (await ipc.cliInvoke(this.id, task.prompt, task.cwd, Math.max(60, Math.round(task.timeoutMs / 1000)))) as {
        stdout?: string; stderr?: string; code?: number | null;
      };
      const text = (String(r.stdout ?? "") || String(r.stderr ?? "")).trim();
      return {
        ok: Boolean(text) && (r.code == null || r.code === 0),
        text,
        exitCode: r.code ?? null,
        latencyMs: Date.now() - started,
        costUsd: 0,
        simulated: false,
        detail: `exit=${r.code ?? "?"} bytes=${text.length}; custom harness (advisory read-only)`,
        error: text ? null : `${this.name} returned no output (exit ${r.code ?? "?"}).`,
      };
    } catch (e) {
      return {
        ok: false, text: "", exitCode: null, latencyMs: Date.now() - started, costUsd: 0,
        simulated: false, detail: "spawn-failed", error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

const registry = new Map<HarnessIdV6, CodingAgentHarness>();
for (const p of PROFILES) {
  const h = new CliHarness(p.id, p.name, p.installHint, p.languages, p.strengths, p.canEditFiles, p.canRunTests, p.capabilities);
  registry.set(h.id, h);
}
registry.set("local-test", localTestHarness);
// V11 (W1): the ACP adapter. Type-only import above keeps this acyclic at runtime.
import { AcpHarness } from "./acp";
registry.set("acp", new AcpHarness());

const customAdapters = new Map<string, CodingAgentHarness>();

export function getHarness(id: HarnessIdV6): CodingAgentHarness | null {
  const hit = registry.get(id);
  if (hit) return hit;
  // V11.6.2: custom:<slug> — memoized adapter built from the resolver, so a graph-mission
  // agent pinned to a custom harness gets a REAL adapter (prepare shows the user's bin +
  // argv; invoke goes through the Rust custom path). Unregistered customs return null.
  if (typeof id === "string" && isCustomHarness(id)) {
    const { caps, registered } = resolveCaps(id);
    if (!registered) return null;
    let a = customAdapters.get(id);
    if (!a) {
      a = new CustomCliHarness(id as HarnessIdV6, caps.name, "Teams -> Connect -> Custom harnesses");
      customAdapters.set(id, a);
    }
    return a;
  }
  return null;
}

export function allHarnesses(): CodingAgentHarness[] {
  return [...registry.values()];
}

export function realHarnesses(): CodingAgentHarness[] {
  return [...registry.values()].filter((h) => !h.simulated);
}

/** Register or replace an adapter — used by tests and by user-supplied harnesses. */
export function registerHarness(h: CodingAgentHarness): void {
  registry.set(h.id, h);
}

export function isHarnessId(id: string): id is HarnessIdV6 {
  return registry.has(id as HarnessIdV6);
}

/** Human-readable list of every known runtime, for the Providers page. */
export function describeHarnesses(): Array<{ id: string; name: string; simulated: boolean; install: string; languages: string[]; strengths: string[] }> {
  return [...registry.values()].map((h) => ({
    id: h.id,
    name: h.name,
    simulated: h.simulated,
    install: h.installHint,
    languages: h.languages,
    strengths: h.strengths,
  }));
}

/** Re-export so callers do not need two imports for the same concept. */
export { HARNESSES };
