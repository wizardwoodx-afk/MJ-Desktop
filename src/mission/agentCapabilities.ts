/**
 * AGENT CAPABILITIES — what each coding CLI can actually be made to do, and how MJ knows.
 *
 * WHY THIS EXISTS AS DATA RATHER THAN CODE
 *
 * Nine CLIs, each with its own vocabulary for the same five ideas: take a prompt, emit JSON, refuse to
 * write, pick a model, resume a conversation. Hardcoding that as branches would scatter nine sets of
 * assumptions across the codebase. As a table, the assumptions are visible, comparable and testable —
 * and, crucially, each one carries the evidence behind it.
 *
 * THE LESSON THIS FILE IS BUILT AROUND
 *
 * A doc-shaped capability table looks identical to a tested one until a real binary disagrees. MJ
 * shipped `--max-turns` for Claude Code because documentation described it; the shipped 2.1.197
 * binary has no such flag. It shipped `--dangerously-skip-permissions` for OpenCode, which does not
 * exist there at all. Both were found only by running the executable.
 *
 * 2026-09 postscript: the --max-turns story grew a third act. The current vendor CLI reference
 * documents it for print mode while --help still omits it, so the claude entry is docs-graded
 * with the old scan recorded — and probe §10 now pins registry↔policy agreement on turn flags
 * for every harness. The lesson is unchanged: state the evidence, and keep the layers agreeing.
 *
 * So every entry states its confidence and its source, and `enforcedReadOnly()` is keyed off
 * enforcement rather than off whether a flag merely exists.
 */

import { getCustomHarness, isCustomHarness, type CustomHarnessSpec, type HarnessId } from "../domain/harness";

/**
 * How much weight a claim deserves.
 *
 *   binary     — checked against the shipped executable, by running it. The strongest evidence
 *                available, and the only kind that has ever caught a wrong flag.
 *   docs       — from the vendor's documentation. Usually right, occasionally ahead of the release.
 *   community  — from forum posts, issues and blog reports. Plausible, unconfirmed.
 *   unverified — MJ is guessing, or the capability does not exist. Treat as a gap, not a feature.
 */
export type Confidence = "binary" | "docs" | "community" | "unverified";

export interface Capability {
  /** The argv fragment that provides it, or null when the CLI has no such control. */
  argv: string[] | null;
  confidence: Confidence;
  /** Where the claim came from, so it can be re-checked. */
  source: string;
  /**
   * True when the control is the CLI's DEFAULT rather than a flag to pass. Cursor's read-only is
   * exactly this: writes require --force, so plain `-p` cannot modify files. Emitting a flag for it
   * would duplicate the prompt flag — which is what `-p` already is.
   */
  implicit?: boolean;
}

export interface CostReporting {
  kind: "usd" | "tokens-only";
  /** Where the number appears in the output, as a hint for parsing. */
  path?: string;
  confidence: Confidence;
  source: string;
}

export interface AgentCapabilities {
  id: HarnessId;
  name: string;
  /** Candidate executable names, in preference order. */
  bins: string[];
  install: string;
  /** How the prompt is passed. For several CLIs this carries the subcommand, so it must come first. */
  prompt: Capability;
  /** Structured output. `kind` distinguishes a single JSON object from an NDJSON stream. */
  json: (Capability & { kind?: "json" | "ndjson" | "text" }) | null;
  /** Refuse to modify files. */
  readOnly: Capability | null;
  /** Explicitly permit writes. null means the default agent already writes. */
  write: Capability | null;
  /** The escape hatch that disables all permission checks. MJ treats this as requiring a human decision. */
  fullAuto: Capability | null;
  /** Cap the agent's internal turn count. */
  maxTurns: Capability | null;
  /** Cap wall-clock time. null means MJ enforces its own deadline instead. */
  timeout: Capability | null;
  /** Constrain output to a schema. */
  outputSchema: Capability | null;
  /** Have the CLI create its own worktree. */
  worktree: Capability | null;
  /** Set the working directory. */
  cwd: Capability | null;
  /** Model selection. */
  model: Capability | null;
  /** Resume a previous session. */
  resume: Capability | null;
  /**
   * Start a session under an id MJ chose, rather than one the CLI invents.
   *
   * This distinction is not cosmetic. Claude's `--session-id <uuid>` CREATES a conversation under the
   * id you pass. OpenCode's `--session <id>` LOADS an existing one and hard-fails with
   * "Error: Session not found" (exit 1) if it does not exist — observed on the real 1.18.25 binary.
   * Assuming every CLI accepts a chosen id breaks half of them on turn one, before any work is done.
   * Where this is null, MJ lets the CLI choose and captures the id from its output.
   */
  sessionStart: Capability | null;
  /** Suppress background update checks — without this a CI run can stall on a prompt. */
  noAutoUpdate: Capability | null;
  /** Per-rule allow/deny filters, e.g. "Bash(git *)". */
  filters: { allowFlag: string; denyFlag: string; confidence: Confidence; source: string } | null;
  /** How to read real cost out of the output. null means the CLI does not report it. */
  cost: CostReporting | null;
  /** True only when a read-only mode is actually ENFORCED by the CLI, not merely advisory. */
  enforcedReadOnly: boolean;
  /** Traps worth stating out loud, each with the evidence behind it. */
  gotchas: string[];
}

export const AGENT_CAPABILITIES: Record<HarnessId, AgentCapabilities> = {
  acp: {
    id: "acp",
    name: "ACP agent (Agent Client Protocol)",
    bins: ["claude-code-acp"],
    install: "Set MJ_ACP_BIN to any ACP-compliant agent binary (claude-code-acp bridges Claude Code; gemini --experimental-acp bridges Gemini).",
    prompt: { argv: null, confidence: "docs", source: "ACP spec (agentclientprotocol.com): the prompt travels as session/prompt ContentBlock[], not argv. Conformance exercised by probe/acp.test.ts against a scripted agent." },
    json: { argv: null, kind: "ndjson", confidence: "docs", source: "ACP streams structured session/update events (agent_message_chunk, tool_call, plan) over newline-delimited JSON — there is no JSON output flag to pass." },
    readOnly: { argv: null, confidence: "docs", source: "ACP models permissions natively: session/request_permission. MJ's mission policy answers it (default: deny) instead of passing a CLI flag." },
    write: { argv: null, confidence: "docs", source: "Writes happen through fs/write_text_file or the agent's own tools, each gated by session/request_permission." },
    fullAuto: { argv: null, confidence: "unverified", source: "ACP has no skip-permissions primitive and MJ will not emulate one. Autonomy comes from the mission policy, not the wire." },
    maxTurns: { argv: null, confidence: "docs", source: "No turn-cap in the protocol; MJ's CapLedger enforces the wall clock and MJ cancels via session/cancel." },
    timeout: { argv: null, confidence: "docs", source: "Protocol-level: client-side request timeout + session/cancel. Verified in probe/acp.test.ts." },
    outputSchema: { argv: null, confidence: "unverified", source: "No schema primitive in ACP v1; structured output is the mission's job, not the transport's." },
    worktree: { argv: null, confidence: "docs", source: "session/new takes cwd — MJ points the session at its prepared worktree, as with any CLI." },
    cwd: { argv: null, confidence: "docs", source: "session/new { cwd, mcpServers } — first-class in the protocol, unlike most CLIs." },
    model: { argv: null, confidence: "docs", source: "session/new may return models/modes; session/set_mode switches. Not required for a first turn." },
    resume: { argv: ["session/load"], confidence: "docs", source: "session/load resumes a session by id — MJ does not use it yet; every mission seat is a fresh session." },
    sessionStart: { argv: null, confidence: "docs", source: "Sessions are created per seat via session/new; there is nothing to pre-create." },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "Update behavior belongs to the agent binary, not the protocol." },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "ACP is a protocol, not a binary: what is verified is MJ's client (probe/acp.test.ts), not any particular agent's server. Per-agent verification stays on the Proof page's live-binary ledger.",
      "Newline-delimited JSON: a chatty stderr is fine, but any agent that prints non-JSON to stdout breaks the stream — MJ counts such lines as protocol_error events instead of crashing.",
    ],
  },
  claude: {
    id: "claude",
    name: "Claude Code",
    bins: ["claude"],
    install: "npm install -g @anthropic-ai/claude-code   then   claude",
    prompt: { argv: ["-p", "$PROMPT"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 (--help); -p, --print" },
    json: { argv: ["--output-format", "json"], kind: "json", confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; choices text|json|stream-json" },
    readOnly: { argv: ["--permission-mode", "plan"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; permission-mode choices acceptEdits|auto|bypassPermissions|default|dontAsk|plan" },
    write: { argv: ["--permission-mode", "acceptEdits"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; acceptEdits is a real choice" },
    fullAuto: { argv: ["--dangerously-skip-permissions"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 --help" },
    // V11.8.0: the turn cap is real after all — but the story matters. The 2.1.197 --help scan
    // (which once removed this flag) found no match, and the 11.7.x review then caught the
    // registry and the policy layer DISAGREEING: caps said absent while policyFor still
    // emitted it. The 2026 vendor CLI reference documents --max-turns for print mode (no
    // default; exits with an error at the cap) and five independent 2026 sources cite it —
    // so the flag is restored at DOCS grade, the old scan is recorded in the source line,
    // and probe §10 pins registry↔policy agreement so the two layers can never split again.
    maxTurns: { argv: ["--max-turns", "$N"], confidence: "docs", source: "code.claude.com CLI reference (2026): print-mode only, no default, exits with an error at the cap. Supersedes the 2.1.197 --help scan that found no match — the flag is not listed in --help." },
    timeout: { argv: null, confidence: "binary", source: "VERIFIED ABSENT against the real binary: claude 2.1.197 — no timeout flag; MJ enforces its own wall clock" },
    outputSchema: { argv: ["--json-schema"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 --help" },
    worktree: { argv: ["-w"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; -w, --worktree [name]" },
    cwd: { argv: null, confidence: "binary", source: "VERIFIED ABSENT against the real binary: claude 2.1.197 — no cwd flag; MJ sets the child process cwd instead" },
    model: { argv: ["--model", "$MODEL"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; --model <model>" },
    resume: { argv: ["--resume", "$SESSION"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; -r, --resume [value]" },
    sessionStart: { argv: ["--session-id", "$SESSION"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 --help — `--session-id <uuid>` CREATES a session under the id you pass, so MJ can pick the id. `--resume` loads one; passing both is a conflict, so MJ emits exactly one per turn." },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: { allowFlag: "--allowedTools", denyFlag: "--disallowedTools", confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 — note --allowedTools PRE-APPROVES, it does not restrict. --tools restricts which tools exist." },
    cost: { kind: "usd", path: "total_cost_usd", confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 — total_cost_usd, num_turns and session_id all present in the shipped executable, and a live run returned them" },
    enforcedReadOnly: true,
    gotchas: [
      "--allowedTools pre-approves (skips the prompt) but does NOT restrict. --tools restricts which tools exist; --tools \"\" is pure text. Conflating them is the classic bug.",
      "--max-turns exists in print mode only (docs-graded; --help does not list it). The CapLedger stays the authoritative ceiling — the CLI-side cap is defence in depth that fails fast. The vendor also documents --max-budget-usd (print-mode spend cap); MJ deliberately does not compose it: the CapLedger is the spend authority.",
      "Without credentials it still exits 0 and returns a full result object with is_error:true and result:\"Not logged in · Please run /login\". Exit code alone would read that as success.",
    ],
  },

  codex: {
    id: "codex",
    name: "Codex CLI",
    bins: ["codex"],
    install: "npm install -g @openai/codex   then   codex",
    // `exec` is the subcommand, so it must precede every flag.
    prompt: { argv: ["exec", "$PROMPT"], confidence: "docs", source: "codex exec" },
    json: { argv: ["--json"], kind: "ndjson", confidence: "docs", source: "NDJSON event stream" },
    readOnly: { argv: ["--sandbox", "read-only"], confidence: "docs", source: "read-only is ALSO the default, so this is belt-and-braces rather than a behaviour change" },
    write: { argv: ["--sandbox", "workspace-write"], confidence: "docs", source: "--full-auto is DEPRECATED; use --sandbox workspace-write" },
    fullAuto: { argv: ["--sandbox", "danger-full-access"], confidence: "docs", source: "the documented escape hatch" },
    maxTurns: { argv: null, confidence: "unverified", source: "no documented turn flag" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: ["--output-schema"], confidence: "docs", source: "codex exec --output-schema" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: ["--cd", "$CWD"], confidence: "docs", source: "alias -C" },
    model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "OpenAI Codex docs" },
    resume: { argv: ["resume"], confidence: "docs", source: "codex exec resume — takes no session id, so MJ cannot say WHICH conversation to continue" },
    sessionStart: { argv: null, confidence: "unverified", source: "codex names its own sessions and there is no documented way to choose the id, so MJ must capture it from the output" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: { kind: "tokens-only", confidence: "docs", source: "reports tokens but NOT cost. MJ must leave costUsd null rather than guess a price." },
    enforcedReadOnly: true,
    gotchas: [
      "--full-auto is DEPRECATED. Use --sandbox workspace-write.",
      "Reports tokens with no price, so a cost figure for a codex seat would be invented. MJ records tokens and says the spend is unknown.",
    ],
  },

  opencode: {
    id: "opencode",
    name: "OpenCode",
    bins: ["opencode"],
    install: "npm install -g opencode-ai   then   opencode",
    prompt: { argv: ["run", "$PROMPT"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — `run [message..]`; a real run executed bash and returned NDJSON" },
    json: { argv: ["--format", "json"], kind: "ndjson", confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — choices default|json; json emits NDJSON events step_start/text/tool_use/step_finish" },
    readOnly: { argv: ["--agent", "plan"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — asked to create a file, the plan agent made ZERO tool calls and created nothing, while the default agent created it. Read-only is enforced, not advisory." },
    // The DEFAULT agent is the writing one — proven by a real write. `--agent build` is not what the
    // binary expects, so MJ emits no agent flag when it wants writes.
    write: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — the default agent wrote proof-default.txt. No agent flag is needed to write; do NOT pass --agent build." },
    // There is no --dangerously-skip-permissions in this CLI (0 matches in `run --help`). That flag
    // belongs to Claude Code; the OpenCode equivalent is --auto, which is far more dangerous than it
    // sounds, so MJ never emits it without an explicit human decision.
    fullAuto: { argv: ["--auto"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — `--auto  auto-approve permissions that are not explicitly denied (dangerous!)`. --dangerously-skip-permissions does NOT exist here." },
    maxTurns: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — no turn-cap flag exists in `run --help`, so MJ's own CapLedger is the only turn limit" },
    timeout: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — no timeout flag; MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — no output-schema flag in `run --help`" },
    worktree: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — no worktree flag; MJ uses git worktree itself" },
    cwd: { argv: ["--dir", "$CWD"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — `--dir  directory to run in, path on remote server if attaching`" },
    model: { argv: ["--model", "$MODEL"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — `-m, --model` in provider/model format" },
    resume: { argv: ["--session", "$SESSION"], confidence: "binary", source: "VERIFIED END-TO-END against the real binary: opencode 1.18.25 — turn 1 planted a codeword, a FRESH process resumed with --session <id> and recalled it exactly. -c/--continue resumes the latest session; --fork copies before continuing." },
    sessionStart: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — `--session <unknown-id>` exits 1 with `Error: Session not found`. It LOADS, it does not create, so MJ must NOT pass a session id on turn one. Run turn one bare, capture the sessionID from the NDJSON, and resume with it afterwards." },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented; `opencode upgrade` is a separate command" },
    filters: null,
    cost: { kind: "usd", path: "step_finish.part.cost", confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 — each step_finish carries .part.cost and .part.tokens{total,input,output,reasoning,cache}. tokens.total is CUMULATIVE (8019 then 8038 across two steps), so take the LAST value; summing would multiply-count." },
    enforcedReadOnly: true,
    gotchas: [
      "CORRECTION: the widely-quoted issue anomalyco/opencode#13851 claimed non-interactive sessions get a restrictive preset that blocks writes. On the real 1.18.25 binary the DEFAULT agent wrote a file without any flag, so that no longer holds. MJ no longer warns about it — a stale warning would push every seat to read-only for no reason.",
      "There is NO --dangerously-skip-permissions here. The escape hatch is --auto, whose own help text says '(dangerous!)' because it approves everything not explicitly denied. MJ treats it as requiring an explicit human decision, never a default.",
      "Sessions are real and resumable by id: --session <id>, -c/--continue for the latest, --fork to branch without polluting the original. Every NDJSON event carries sessionID, so MJ can capture it from turn one.",
      "opencode ships credential-free models (opencode/mimo-v2.5-free, opencode/nemotron-3.5-lightning-free, opencode/big-pickle and others). With zero credentials configured these still run and report cost 0 — useful for proving the plumbing before any API key exists.",
      "opencode.json supports permission: [{permission, pattern, action}] and tools: {write:false, bash:false} — MJ can write this file into the mission workspace to express its risk class.",
    ],
  },

  grok: {
    id: "grok",
    name: "Grok Build",
    bins: ["grok"],
    install: "curl -fsSL https://x.ai/cli/install.sh | bash    (Windows: irm https://x.ai/cli/install.ps1 | iex)",
    // V11.6: `grok exec` is the documented one-shot mode (developersdigest/x.ai guides,
    // 2026-09); -p also runs headless but exec is the canonical scripting surface.
    prompt: { argv: ["exec", "$PROMPT"], confidence: "docs", source: "docs.x.ai — grok exec is non-interactive; -p is the headless alias" },
    json: { argv: ["--output-format", "json"], kind: "json", confidence: "docs", source: "plain|json|streaming-json" },
    readOnly: { argv: ["--permission-mode", "plan", "--sandbox", "read-only"], confidence: "docs", source: "permission vocabulary is deliberately Claude-compatible" },
    write: { argv: ["--permission-mode", "acceptEdits", "--sandbox", "workspace"], confidence: "docs", source: "sandbox off|workspace|read-only|strict|devbox" },
    fullAuto: { argv: ["--permission-mode", "bypassPermissions", "--sandbox", "off"], confidence: "docs", source: "the documented escape hatch" },
    // V11.8.0: --max-turns is real here AND in Claude Code's print mode (docs-graded there).
    // Same name, two CLIs — graded differently, which is exactly why per-harness evidence
    // matters. V11.8.0 also fixed the policy layer ignoring this flag (withTurnLimit
    // special-cased claude only); it is capability-driven now, so grok seats get their
    // documented turn cap on the policyFor path too.
    maxTurns: { argv: ["--max-turns", "$N"], confidence: "docs", source: "docs.x.ai — a real flag here; Claude Code documents the same name for print mode (docs-graded, see the claude entry)" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: ["-w", "$NAME"], confidence: "docs", source: "--worktree [NAME], with --ref to choose the base" },
    cwd: { argv: ["--cwd", "$CWD"], confidence: "docs", source: "docs.x.ai" },
    model: { argv: ["-m", "$MODEL"], confidence: "docs", source: "docs.x.ai" },
    resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "-r; -c continues the latest, --fork-session copies context" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented; MJ captures the id from the output instead" },
    noAutoUpdate: { argv: ["--no-auto-update"], confidence: "docs", source: "REQUIRED in CI, or a background update check can stall the run" },
    filters: { allowFlag: "--allow", denyFlag: "--deny", confidence: "docs", source: "Bash | Edit | Read | Grep | MCPTool | WebFetch. Deny wins over allow." },
    cost: { kind: "tokens-only", confidence: "unverified", source: "not documented as reporting USD" },
    enforcedReadOnly: true,
    gotchas: [
      "Permission vocabulary is deliberately Claude-compatible (default | dontAsk | acceptEdits | bypassPermissions | plan), so one risk mapping covers both.",
      "--no-auto-update is REQUIRED in CI: a background update check can stall the run indefinitely.",
      "Deny wins over allow, so an allowlist alone does not grant anything the deny list touches.",
    ],
  },

  cursor: {
    id: "cursor",
    name: "Cursor Agent",
    bins: ["cursor-agent"],
    install: "curl https://cursor.com/install -fsS | bash",
    // `-p` IS the prompt flag, so it cannot be emitted twice — see the `implicit` note on readOnly.
    prompt: { argv: ["-p", "$PROMPT"], confidence: "docs", source: "cursor-agent -p" },
    json: { argv: ["--output-format", "json"], kind: "json", confidence: "community", source: "verify with --help" },
    // Writes require --force, so plain -p cannot modify anything. Emitting a flag here would produce
    // `cursor-agent -p <task> -p`, which does not parse.
    readOnly: { argv: null, implicit: true, confidence: "docs", source: "writes require --force, so plain -p is read-only by construction" },
    write: { argv: ["--force"], confidence: "docs", source: "--force is what permits writes" },
    fullAuto: { argv: ["--force"], confidence: "docs", source: "same flag; there is no separate bypass" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock — see the no-exit bug below" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: ["--workspace", "$CWD"], confidence: "community", source: "verify with --help" },
    model: { argv: ["--model", "$MODEL"], confidence: "community", source: "-m" },
    resume: { argv: ["--resume", "$SESSION"], confidence: "community", source: "--resume [session_id]" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented; MJ captures the id from the output instead" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: { allowFlag: "", denyFlag: "", confidence: "community", source: "permissions live in .cursor/cli-config.json as {permissions:{allow:[\"Shell(git)\",\"Read(*)\"],deny:[\"Read(.env*)\"]}}, not on the command line" },
    cost: null,
    enforcedReadOnly: true,
    gotchas: [
      "KNOWN BUG: under -p the process may not exit after the result is emitted, so CI runs hang until killed. MJ MUST apply a wall-clock timeout and parse the result from the stream rather than waiting for exit. Reported repeatedly on the Cursor forum.",
      "Reports no cost at all, so a cursor seat's spend is unknown rather than zero.",
    ],
  },

  cline: {
    id: "cline",
    name: "Cline CLI",
    bins: ["cline"],
    install: "npm install -g @cline/cli   then   cline",
    prompt: { argv: ["$PROMPT"], confidence: "docs", source: "a bare prompt is a one-shot run" },
    json: { argv: ["--json"], kind: "ndjson", confidence: "docs", source: "NDJSON of agent_event" },
    readOnly: { argv: ["-p"], confidence: "docs", source: "-p/--plan is read-only; act is the default" },
    write: { argv: null, confidence: "docs", source: "act mode is the default, so no flag is needed" },
    fullAuto: { argv: ["-y"], confidence: "docs", source: "-y/--yolo; --auto-approve is the narrower form" },
    // --retries is a consecutive-mistake limit, NOT a turn cap. Treating it as one would silently
    // allow unbounded turns.
    maxTurns: { argv: null, confidence: "docs", source: "--retries N is a consecutive-mistake limit, not a turn cap, so MJ does not use it as one" },
    timeout: { argv: ["--timeout", "$SECS"], confidence: "docs", source: "-t/--timeout" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented, but instances are fully isolated so parallel branches are safe" },
    cwd: { argv: ["--cwd", "$CWD"], confidence: "docs", source: "-c" },
    model: { argv: ["-m", "$MODEL"], confidence: "docs", source: "with -P provider and -k key for a single run" },
    resume: { argv: null, confidence: "unverified", source: "cline history lists sessions; no documented resume flag" },
    sessionStart: { argv: null, confidence: "unverified", source: "no session control at all, so every cline turn starts from scratch" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: { allowFlag: "", denyFlag: "", confidence: "docs", source: "CLINE_COMMAND_PERMISSIONS env var: {\"allow\":[\"npm *\",\"git *\"],\"deny\":[\"rm -rf *\"]}" },
    cost: { kind: "usd", path: "verbose stats", confidence: "community", source: "-v prints elapsed time, tokens and estimated cost when available — parse, do not assume" },
    enforcedReadOnly: true,
    gotchas: [
      "--data-dir <path> uses isolated state instead of ~/.cline/data and AUTOMATICALLY enables sandbox mode. That is the strongest isolation available here, so MJ uses it for untrusted repos.",
      "--zen/-z returns immediately with no result. MJ must NEVER use it: it looks like a fast success and delivers nothing.",
    ],
  },

  kilo: {
    id: "kilo",
    name: "Kilo Code",
    bins: ["kilo"],
    install: "npm install -g kilocode-cli   then   kilo   (kilo.ai)",
    prompt: { argv: ["run", "$PROMPT"], confidence: "docs", source: "kilo run" },
    json: { argv: ["--format", "json"], kind: "ndjson", confidence: "docs", source: "--format json" },
    // Read-only is per-AGENT only, expressed in .kilo/agents/*.md. There is no flag, so MJ has to
    // author the agent file — and cannot claim enforcement it did not verify.
    readOnly: { argv: ["--agent", "mj-readonly"], confidence: "docs", source: "read-only is expressed per agent in .kilo/agents/*.md, not by a flag" },
    write: { argv: ["--auto"], confidence: "docs", source: "--auto approves automatically" },
    fullAuto: { argv: ["--auto"], confidence: "docs", source: "same flag" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "kilo pr <number> checks out a PR branch instead" },
    cwd: { argv: ["--workspace", "$CWD"], confidence: "community", source: "verify with kilo --help" },
    model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "provider/model format, e.g. openai/gpt-5" },
    resume: { argv: ["--continue"], confidence: "docs", source: "-c; also --session, --fork" },
    sessionStart: { argv: null, confidence: "unverified", source: "--session exists but whether it can create an id MJ chose is not documented; MJ captures the id instead" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: { allowFlag: "", denyFlag: "", confidence: "community", source: "per-agent permission block in the agent markdown" },
    cost: { kind: "tokens-only", confidence: "unverified", source: "not documented as reporting USD" },
    // Deliberately false: MJ authors the agent file, but has never verified kilo honours it.
    enforcedReadOnly: false,
    gotchas: [
      "Read-only is per-agent ONLY (.kilo/agents/*.md), so MJ authors the file and says the guarantee is advisory until verified. enforcedReadOnly is false on purpose.",
    ],
  },

  hermes: {
    id: "hermes",
    name: "Hermes Runtime",
    bins: ["hermes"],
    install: "bundled with MJ; runs as a stdio child process",
    prompt: { argv: ["$PROMPT"], confidence: "docs", source: "MJ's own runtime" },
    json: null,
    readOnly: null,
    write: null,
    fullAuto: null,
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: null,
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["No enforced sandbox, so a hermes seat must never be assigned HIGH or CRITICAL risk."],
  },

  aider: {
    id: "aider",
    name: "Aider AI Pair Programmer",
    bins: ["aider"],
    install: "pip install aider-chat   then   aider",
    prompt: { argv: ["--message", "$PROMPT"], confidence: "docs", source: "aider --message <prompt>" },
    json: null,
    readOnly: { argv: ["--read-only"], implicit: false, confidence: "docs", source: "--read-only" },
    write: { argv: ["--yes", "--no-auto-commits"], confidence: "docs", source: "--yes --no-auto-commits" },
    fullAuto: { argv: ["--yes"], confidence: "docs", source: "--yes" },
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "--model" },
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: true,
    gotchas: ["Pass --no-auto-commits so MJ manages worktree commits deterministically."],
  },

  gemini: {
    id: "gemini",
    name: "Google Gemini CLI",
    bins: ["gemini"],
    install: "npm install -g @google/gemini-cli   or   gemini auth",
    prompt: { argv: ["-p", "$PROMPT"], confidence: "docs", source: "gemini -p <prompt>" },
    json: { argv: ["--output-format", "json"], kind: "json", confidence: "docs", source: "--output-format json" },
    readOnly: { argv: ["--approval-mode", "plan"], implicit: false, confidence: "docs", source: "--approval-mode plan" },
    write: { argv: [], confidence: "docs", source: "default" },
    fullAuto: { argv: ["--full-auto"], confidence: "docs", source: "--full-auto" },
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: { argv: ["--workspace", "$CWD"], confidence: "docs", source: "--workspace" },
    model: { argv: ["-m", "$MODEL"], confidence: "docs", source: "-m" },
    resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "--resume" },
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["Documentation-level integration; uses --approval-mode plan for Plan Mode."],
  },

  goose: {
    id: "goose",
    name: "Goose Developer Agent",
    bins: ["goose"],
    install: "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash",
    prompt: { argv: ["run", "--text", "$PROMPT"], confidence: "docs", source: "goose run --text <prompt>" },
    json: { argv: ["--format", "json"], kind: "json", confidence: "docs", source: "--format json" },
    readOnly: { argv: ["--plan"], implicit: false, confidence: "docs", source: "--plan" },
    write: { argv: [], confidence: "docs", source: "default" },
    fullAuto: { argv: [], confidence: "docs", source: "default" },
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: { argv: ["--dir", "$CWD"], confidence: "docs", source: "--dir" },
    model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "--model" },
    resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "--resume" },
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["Open-source agent by Block with extensive MCP extension ecosystem."],
  },

  qwen: {
    id: "qwen",
    name: "Qwen Code",
    bins: ["qwen"],
    install: "npm install -g @qwen/code-cli   then   qwen login",
    prompt: { argv: ["-p", "$PROMPT"], confidence: "docs", source: "qwen -p <prompt>" },
    json: { argv: ["--output-format", "json"], kind: "json", confidence: "docs", source: "--output-format json" },
    readOnly: { argv: ["--read-only"], implicit: false, confidence: "docs", source: "--read-only" },
    write: { argv: [], confidence: "docs", source: "default" },
    fullAuto: { argv: ["--yes"], confidence: "docs", source: "--yes" },
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: { argv: ["--cwd", "$CWD"], confidence: "docs", source: "--cwd" },
    model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "--model" },
    resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "--resume" },
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["Alibaba open-source terminal agent tuned for Qwen3-Coder models."],
  },

  amazonq: {
    id: "amazonq",
    name: "Amazon Q / Kiro CLI",
    bins: ["kiro-cli", "q", "amazonq"],
    install: "Install Kiro CLI (Amazon Q Developer CLI) via AWS / Homebrew",
    prompt: { argv: ["chat", "--no-interactive", "$PROMPT"], confidence: "docs", source: "kiro-cli chat --no-interactive <prompt>" },
    json: { argv: ["--json"], kind: "json", confidence: "docs", source: "--json" },
    readOnly: { argv: ["--read-only"], implicit: false, confidence: "docs", source: "--read-only" },
    write: { argv: [], confidence: "docs", source: "default" },
    fullAuto: { argv: ["--trust-all"], confidence: "docs", source: "--trust-all" },
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: { argv: ["--workspace", "$CWD"], confidence: "docs", source: "--workspace" },
    model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "--model" },
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["AWS developer CLI transitioning to Kiro CLI; enterprise Bedrock integration."],
  },

  openclaude: {
    id: "openclaude",
    name: "OpenClaude",
    bins: ["openclaude"],
    install: "npm install -g @gitlawb/openclaude@latest   then   openclaude   (/provider for guided setup)",
    // Claude-Code-shaped CLI (github.com/Gitlawb/openclaude, 30.9k stars, checked 2026-09).
    prompt: { argv: ["-p", "$PROMPT"], confidence: "community", source: "Claude-Code-compatible surface; --bg exists for detached runs. -p is reported by users, not yet by vendor docs." },
    json: { argv: null, kind: "text", confidence: "unverified", source: "no documented --output-format flag" },
    readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag; treat as advisory" },
    write: { argv: null, confidence: "unverified", source: "writes via its file tools; no flag to gate them" },
    fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: null, confidence: "unverified", source: "run it from the repo directory (MJ sets cwd on the process)" },
    model: { argv: null, confidence: "docs", source: "OPENAI_MODEL / OPENAI_BASE_URL env or /provider profiles — config is env/profile driven, not argv" },
    resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "github README: --resume <id>, --continue for latest" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "Open-source Claude-Code-shaped CLI for OpenAI-compatible/Gemini/Ollama backends — no Claude subscription needed.",
      "Config lives in ~/.openclaude and ~/.openclaude-profile.json; it deliberately never reads ~/.claude.",
      "Background sessions (--bg) return immediately — MJ needs the synchronous -p shape, so -p is the registered invocation.",
      "No verified read-only mode: an OpenClaude seat marked no-write is advisory, not enforced.",
    ],
  },

  copilot: {
    id: "copilot",
    name: "GitHub Copilot CLI",
    bins: ["copilot"],
    install: "npm install -g @github/copilot   (winget install GitHub.Copilot / brew install --cask copilot-cli)   then   copilot login",
    // GitHub Docs, checked 2026-09: -p is the documented programmatic prompt; -s silences usage info.
    prompt: { argv: ["-p", "$PROMPT", "-s"], confidence: "docs", source: "docs.github.com/en/copilot/get-started/cli-quickstart — 'pass a prompt to the CLI with the -p flag'; -s outputs only the response" },
    json: { argv: null, kind: "text", confidence: "unverified", source: "no documented JSON output flag" },
    readOnly: { argv: ["--available-tools", "read"], confidence: "docs", source: "--available-tools=LIST exposes only selected tools; --deny-tool wins over --allow-tool" },
    write: { argv: ["--allow-tool", "edit"], confidence: "docs", source: "permission patterns: --allow-tool / --deny-tool / --add-dir" },
    fullAuto: { argv: ["--allow-all"], confidence: "docs", source: "--allow-all (tools+paths+urls); the docs themselves call the yolo posture high-risk" },
    maxTurns: { argv: null, confidence: "unverified", source: "no documented turn flag" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: ["-C", "$CWD"], confidence: "docs", source: "-C DIRECTORY changes directory before startup" },
    model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "--model=MODEL or auto; default was Claude Sonnet 4.5 as of mid-2026" },
    resume: { argv: ["--resume"], confidence: "docs", source: "-r/--resume[=VALUE] by ID, prefix or name; --continue resumes newest" },
    sessionStart: { argv: ["--session-id", "$ID"], confidence: "docs", source: "--session-id ID addresses or creates an exact session UUID" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: { allowFlag: "--allow-tool", denyFlag: "--deny-tool", confidence: "docs", source: "deny rules win over allow rules; also --allow-url/--deny-url and --add-dir PATH" },
    cost: { kind: "tokens-only", confidence: "unverified", source: "consumes GitHub AI Credits; no per-run USD figure reported" },
    enforcedReadOnly: true,
    gotchas: [
      "Uses Copilot plan credits; COPILOT_GITHUB_TOKEN (fine-grained PAT) authenticates headless/CI runs.",
      "-s matters in scripts: without it the response is wrapped in usage information.",
      "Read-only is real when constructed via --available-tools read + --deny-tool write families — but deny patterns must actually cover the write tools.",
    ],
  },

  antigravity: {
    id: "antigravity",
    name: "Antigravity CLI (agy)",
    bins: ["agy"],
    install: "curl -fsSL https://antigravity.google/cli/install.sh | bash   (Windows: irm https://antigravity.google/cli/install.ps1 | iex)",
    // V11.6.1 correction: the shipped binary is `agy` — a closed-source Go executable that
    // came with Antigravity 2.0 (2026-05-19), NOT an `antigravity` binary. The headless
    // prompt flag is still community-graded (Gemini-CLI heritage); `agy --help` decides.
    prompt: { argv: ["-p", "$PROMPT"], confidence: "community", source: "binary `agy` verified (antigravity.google/docs/gcli-migration, 2026 cutover coverage); headless flag not vendor-documented" },
    json: { argv: null, kind: "text", confidence: "unverified", source: "not re-verified for Antigravity" },
    readOnly: { argv: ["--approval-mode", "plan"], confidence: "community", source: "inherited Gemini vocabulary; re-verify on the shipped binary" },
    write: { argv: null, confidence: "unverified", source: "not re-verified" },
    fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
    model: { argv: ["-m", "$MODEL"], confidence: "community", source: "Gemini-lineage -m flag" },
    resume: { argv: null, confidence: "unverified", source: "not re-verified" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "Google moved unpaid-tier and Google One users from Gemini CLI to Antigravity CLI on 2026-06-18; paid Code Assist tiers keep `gemini`.",
      "Everything here is community-graded: the cutover was recent and the binary disagrees with guides sometimes. Run the Teams test before relying on a flag.",
    ],
  },

  amp: {
    id: "amp",
    name: "Amp (Sourcegraph)",
    bins: ["amp"],
    install: "npm install -g @sourcegraph/amp   then   amp login",
    // V11.6.1 correction: execute mode is `amp -x "<prompt>"` (non-interactive single-shot),
    // documented in Sourcegraph's own CLI guide. The old `--headless` mapping was wrong —
    // that conflated runner mode (`--no-tui`) with execute mode.
    prompt: { argv: ["-x", "$PROMPT"], confidence: "docs", source: "ampcode.com/docs/cli/execute-mode + sourcegraph/amp-examples-and-guides — execute mode is documented" },
    json: { argv: null, kind: "text", confidence: "unverified", source: "not documented" },
    readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag" },
    write: { argv: null, confidence: "unverified", source: "not documented" },
    fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
    model: { argv: ["--model", "$MODEL"], confidence: "community", source: "model selection reported in amp config rather than argv" },
    resume: { argv: null, confidence: "unverified", source: "not documented" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "Sourcegraph's agent; strongest when your repo is indexed by Sourcegraph.",
      "No verified read-only enforcement: an Amp seat marked no-write is advisory.",
    ],
  },

  crush: {
    id: "crush",
    name: "Crush (Charm)",
    bins: ["crush"],
    install: "npm install -g @charmbracelet/crush   (or brew install charmbracelet/crush/crush)   then   crush",
    prompt: { argv: ["run", "$PROMPT"], confidence: "community", source: "crush run executes a prompt non-interactively; verify on the shipped binary" },
    json: { argv: null, kind: "text", confidence: "unverified", source: "not documented" },
    readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag" },
    write: { argv: null, confidence: "unverified", source: "not documented" },
    fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
    model: { argv: ["-m", "$MODEL"], confidence: "community", source: "Charm's config-driven model selection" },
    resume: { argv: null, confidence: "unverified", source: "not documented" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "Charm's TUI agent — LSP-aware, multi-provider.",
      "No verified read-only enforcement: a Crush seat marked no-write is advisory.",
    ],
  },

  openhands: {
    id: "openhands",
    name: "OpenHands",
    bins: ["openhands"],
    // V11.6.1 correction: the V1 CLI's headless mode is `openhands --headless -t "<task>"`
    // (documented on PyPI + docs.openhands.dev); the earlier `solve` subcommand was a
    // pre-V1 design. --json streams JSONL events; -f takes a task file.
    install: "pip install openhands   then   openhands login   (or configure any LLM)",
    prompt: { argv: ["--headless", "-t", "$PROMPT"], confidence: "docs", source: "pypi.org/project/openhands + docs.openhands.dev — headless mode documented" },
    json: { argv: ["--json"], kind: "ndjson", confidence: "docs", source: "docs.openhands.dev CLI headless — JSONL event stream" },
    readOnly: { argv: null, confidence: "unverified", source: "sandboxing is config-level (docker/local), not an argv flag" },
    write: { argv: null, confidence: "unverified", source: "writes via its own tools inside its runtime" },
    fullAuto: { argv: null, confidence: "unverified", source: "it is autonomous by design; containment is the sandbox config" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented as argv" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "workspace config, not argv" },
    cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
    model: { argv: null, confidence: "unverified", source: "LLM config file, not argv" },
    resume: { argv: null, confidence: "unverified", source: "not documented as argv" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "Formerly OpenDevin. The open-source autonomous software engineer.",
      "Containment comes from its runtime sandbox config, not from an argv flag MJ can pass — treat read-only seats as advisory.",
    ],
  },

  droid: {
    id: "droid",
    name: "Droid (Factory)",
    bins: ["droid"],
    install: "curl -fsSL https://app.factory.ai/cli | sh   (Linux also needs xdg-utils)",
    // V11.7.1: vendor-documented headless mode (docs.factory.ai/droid-exec). `droid exec` is
    // a single non-interactive pass whose DEFAULT is spec-mode — read-only operations only —
    // so the derived READ_ONLY shape needs no flag at all. Writes are tiered: --auto low is
    // the vendor's example tier for "enable edits and commands".
    prompt: { argv: ["exec", "$PROMPT"], confidence: "docs", source: "docs.factory.ai/droid-exec — 'Execute a single command (non-interactive mode)'" },
    json: { argv: null, kind: "text", confidence: "unverified", source: "-o/--output-format exists but the documented values were not verified" },
    readOnly: { argv: [], confidence: "docs", source: "spec-mode default: exec only executes read-only operations (docs.factory.ai/droid-exec)" },
    write: { argv: ["--auto", "low"], confidence: "docs", source: "'add --auto to enable edits and commands, with risk tiers gating what can run' — low is the vendor's example tier" },
    fullAuto: { argv: null, confidence: "unverified", source: "tier semantics (--auto low|medium shown in docs) not mapped to a full-auto shape" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "droid has git-worktree machinery but no documented argv flag" },
    cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
    model: { argv: null, confidence: "unverified", source: "not verified on the exec flag table" },
    resume: { argv: null, confidence: "unverified", source: "stream-json multi-turn sessions exist; no resume-by-id flag documented" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "Exec defaults to SPEC MODE: read-only operations only. A write seat composes --auto low; raise the tier in the argv only if a team explicitly trusts it.",
      "Factory's agent: honours AGENTS.md conventions at the repo root.",
    ],
  },

  kimi: {
    id: "kimi",
    name: "Kimi Code (Moonshot)",
    bins: ["kimi"],
    install: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash   (or: npm install -g @moonshot-ai/kimi-code)",
    // V11.7.1: vendor-documented prompt mode (kimi.ai cheat sheet + moonshotai/kimi-code
    // sources): -p runs a single prompt non-interactively and finalizeHeadlessRun exits
    // cleanly. stream-json output and -S session resume are both on the vendor flag table.
    prompt: { argv: ["-p", "$PROMPT"], confidence: "docs", source: "kimi.ai/resources/kimi-code-cheat-sheet — 'Run a single non-interactive prompt without opening the TUI'" },
    json: { argv: ["--output-format", "stream-json"], kind: "ndjson", confidence: "docs", source: "'--output-format stream-json — emit JSONL events for scripting; only works with --prompt'" },
    readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag; a no-write seat is advisory" },
    write: { argv: [], confidence: "docs", source: "default: prompt mode edits files when the agent decides" },
    fullAuto: { argv: ["--yolo"], confidence: "docs", source: "'--yolo (-y) — auto-approve regular tool calls; use only in trusted directories'" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process (-w reported in community wrappers)" },
    model: { argv: ["-m", "$MODEL"], confidence: "docs", source: "'--model <model> (-m) — specify a model alias for this launch'" },
    resume: { argv: ["--session", "$SESSION"], confidence: "docs", source: "'--session [id] (-S) — resume a session by ID'" },
    sessionStart: { argv: null, confidence: "unverified", source: "no documented create-under-chosen-id flag; Kimi assigns its own session ids" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "Single native binary via the install script; the npm route needs Node 22.19+.",
      "--auto is the no-questions permission mode; --yolo additionally skips regular tool approvals.",
    ],
  },

  auggie: {
    id: "auggie",
    name: "Auggie (Augment Code)",
    bins: ["auggie"],
    install: "npm install -g @augmentcode/auggie   then   auggie login",
    // V11.7.1: vendor-documented print mode (docs.augmentcode.com/cli/reference): --print
    // runs one instruction and exits. Ask mode (--ask) is a real read-only mode but is
    // documented as a mode of its own — combining it with --print is not shown, so the
    // capability registry does not claim that composition.
    prompt: { argv: ["--print", "$PROMPT"], confidence: "docs", source: "docs.augmentcode.com/cli/reference — 'Run one instruction in print mode and exit' (-p)" },
    json: { argv: ["--output-format", "json"], kind: "json", confidence: "docs", source: "'--print --output-format json — output the response in structured JSON format for automation workflows'" },
    readOnly: { argv: null, confidence: "unverified", source: "ask mode (--ask: retrieval and non-editing tools only) is documented as its own mode; combining with --print is not shown" },
    write: { argv: [], confidence: "docs", source: "default: print mode edits when the agent decides" },
    fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
    model: { argv: ["--model", "$MODEL"], confidence: "community", source: "github/gh-aw's auggie engine appends --model; not on the vendor flag table" },
    resume: { argv: null, confidence: "unverified", source: "not documented" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "Non-interactive mode may be DISABLED by enterprise agreement (vendor docs) — a headless Auggie seat can fail for licensing, not technical, reasons.",
      "--augment-session-json <json-or-path> authenticates automation without auggie login.",
      "--acp runs Auggie as an ACP agent for compatible editors; --mcp runs it as an MCP tool server.",
    ],
  },

  warp: {
    id: "warp",
    name: "Warp Oz Agent CLI",
    bins: ["oz"],
    install: "Ships with Warp 2026 (Command Palette → Install Warp CLI), or: brew tap warpdotdev/warp && brew install --cask warp-cli   then   oz login",
    // V11.7.1: Warp's agent infrastructure has its own CLI (docs.warp.dev/reference/cli).
    // oz agent run --prompt starts a LOCAL agent run; WARP_API_KEY authenticates headless
    // (CI pipelines, headless servers). run-cloud is cloud infrastructure — not composed.
    prompt: { argv: ["agent", "run", "--prompt", "$PROMPT"], confidence: "docs", source: "docs.warp.dev/reference/cli — 'oz agent run --prompt ...' quickstart; API keys 'let the CLI authenticate non-interactively'" },
    json: { argv: null, kind: "text", confidence: "unverified", source: "not documented on the CLI reference" },
    readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag; a no-write seat is advisory" },
    write: { argv: [], confidence: "docs", source: "default: the local agent run can edit" },
    fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process (--cwd existed on the 2025 warp surface)" },
    model: { argv: null, confidence: "unverified", source: "not documented" },
    resume: { argv: null, confidence: "unverified", source: "local runs are one-shot; run-cloud has --attach, not resume-by-id" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "MJ spawns LOCAL runs (oz agent run). oz agent run-cloud needs --environment and is deliberately NOT composed.",
      "WARP_API_KEY (wk-...) authenticates CI/headless servers; otherwise `oz login`.",
      "The 2025-era `warp agent run --prompt` surface still exists on the warp binary, and the Linux desktop launcher is warp-terminal — neither is the agent CLI MJ detects.",
    ],
  },

  llm: {
    id: "llm",
    name: "Direct LLM",
    bins: [],
    install: "no binary; MJ calls the provider API directly",
    prompt: { argv: ["$PROMPT"], confidence: "docs", source: "MJ's own call path" },
    json: null,
    readOnly: null,
    write: null,
    fullAuto: null,
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: null,
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["No filesystem access and no enforced sandbox. Useful for reasoning, useless for edits."],
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
 * §V11.6.1 — ONE RESOLVER FOR EVERY HARNESS REFERENCE.
 *
 * The 11.6.0 review found the hole this closes: custom ids (`custom:<slug>`) were smuggled
 * through `as HarnessId` casts, and `teamExecutor` looked them up directly in
 * AGENT_CAPABILITIES — which is undefined for them, and the executor dereferenced it.
 * Every consumer now goes through resolveCaps(), which is TOTAL: a builtin entry, a
 * registered custom's synthetic entry, or an honest unregistered-custom entry. It never
 * returns undefined caps, so no execution path can crash on a custom seat again.
 * ───────────────────────────────────────────────────────────────────────────── */

export interface ResolvedHarness {
  caps: AgentCapabilities;
  /** True when the id is a `custom:<slug>` reference. */
  custom: boolean;
  /** False for an unregistered custom (or an unknown id): the seat cannot run. */
  registered: boolean;
}

/** Synthetic capability entry for a REGISTERED custom harness: unknown-by-definition. */
export function syntheticCustomCaps(id: string, spec: CustomHarnessSpec): AgentCapabilities {
  return {
    id: id as HarnessId,
    name: `${spec.name} (custom)`,
    bins: [spec.bin],
    install: "Teams -> Connect -> Custom harnesses",
    prompt: { argv: spec.argv, confidence: "community", source: "user-registered harness — MJ verified none of its flags" },
    json: null, readOnly: null, write: null, fullAuto: null, maxTurns: null, timeout: null,
    outputSchema: null, worktree: null, cwd: null, model: null, resume: null, sessionStart: null,
    noAutoUpdate: null, filters: null, cost: null,
    enforcedReadOnly: false,
    gotchas: ["User-registered harness: MJ verified none of its flags. Read-only is advisory."],
  } as AgentCapabilities;
}

/** The honest entry for a custom id (or unknown id) with no registered spec. */
function unregisteredCustomCaps(id: string): AgentCapabilities {
  return {
    id: id as HarnessId,
    name: `Custom harness "${id}"`,
    bins: [],
    install: "Teams -> Connect -> Custom harnesses (re-add it, then recompile)",
    prompt: { argv: [], confidence: "unverified", source: "not registered (anymore)" },
    json: null, readOnly: null, write: null, fullAuto: null, maxTurns: null, timeout: null,
    outputSchema: null, worktree: null, cwd: null, model: null, resume: null, sessionStart: null,
    noAutoUpdate: null, filters: null, cost: null,
    enforcedReadOnly: false,
    gotchas: ["This harness is not registered (anymore); it cannot run until re-added in Teams -> Connect."],
  } as AgentCapabilities;
}

/** TOTAL harness resolver — builtin, registered custom, or honest unregistered. Never undefined. */
export function resolveCaps(harness: string): ResolvedHarness {
  if (isCustomHarness(harness)) {
    const spec = getCustomHarness(harness);
    return spec
      ? { caps: syntheticCustomCaps(harness, spec), custom: true, registered: true }
      : { caps: unregisteredCustomCaps(harness), custom: true, registered: false };
  }
  const caps = AGENT_CAPABILITIES[harness as HarnessId];
  return caps
    ? { caps, custom: false, registered: true }
    : { caps: unregisteredCustomCaps(harness), custom: false, registered: false };
}

/** Is read-only actually enforced by the CLI, or only requested?
 *  Custom harnesses (custom:*) are advisory-only by definition: MJ did not verify them. */
export function enforcedReadOnly(id: HarnessId | string): boolean {
  const caps = AGENT_CAPABILITIES[id as HarnessId];
  return caps ? caps.enforcedReadOnly : false;
}

/**
 * Claims MJ could not verify, surfaced as warnings rather than hidden.
 *
 * A flag that came from a forum post is not the same as one that came from `--help`, and the UI has
 * to be able to say which is which.
 */
export function unverifiedClaims(id: HarnessId | string): string[] {
  const caps = AGENT_CAPABILITIES[id as HarnessId];
  if (!caps) {
    return ["Custom harness: every flag is the user's own — MJ verified none of it. Read-only is advisory."];
  }
  const out: string[] = [];
  const check = (name: string, cap: Capability | null) => {
    if (cap?.argv && cap.confidence === "community") {
      out.push(`${name}: ${cap.source}`);
    }
  };
  check("cwd", caps.cwd);
  check("model", caps.model);
  check("resume", caps.resume);
  check("json", caps.json);
  if (!caps.enforcedReadOnly && caps.readOnly?.argv) {
    out.push("read-only is advisory: no enforcement was verified, so this seat can still modify files.");
  }
  return out;
}

/** Which harnesses have had their behaviour checked against a real executable. */
export function binaryVerifiedHarnesses(): HarnessId[] {
  return (Object.keys(AGENT_CAPABILITIES) as HarnessId[]).filter((id) =>
    Object.values(AGENT_CAPABILITIES[id]).some((v) => v && typeof v === "object" && "confidence" in v && (v as { confidence?: Confidence }).confidence === "binary"),
  );
}

/** Harnesses that correspond to an executable CLI binary on disk. */
export const EXECUTABLE_HARNESSES: HarnessId[] = (Object.keys(AGENT_CAPABILITIES) as HarnessId[]).filter(
  (id) => AGENT_CAPABILITIES[id].bins.length > 0,
);

/** True when all claims about this harness come from binary verification or vendor docs with no unverified community claims. */
export function fullyDocumented(id: HarnessId): boolean {
  return unverifiedClaims(id).length === 0;
}

