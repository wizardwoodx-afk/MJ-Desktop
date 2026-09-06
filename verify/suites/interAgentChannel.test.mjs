import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/interAgentChannel.test.ts
import assert from "node:assert/strict";

// src/domain/harness.ts
var HARNESSES = [
  {
    id: "acp",
    name: "ACP agent (one wire, many agents)",
    bins: ["claude-code-acp"],
    argv: ["--stdio"],
    install: "Set MJ_ACP_BIN to any ACP-compliant agent (e.g. claude-code-acp, or gemini --experimental-acp). npm i -g @zed-industries/claude-code-acp bridges Claude Code.",
    notes: "Agent Client Protocol (Zed + JetBrains): JSON-RPC over stdio with streaming, tool-call events and permission requests. One adapter instead of one parser per CLI. Grok Build also speaks ACP natively.",
    source: "agentclientprotocol.com; exercised by probe/acp.test.ts"
  },
  {
    id: "hermes",
    name: "Hermes Agent (vendored)",
    bins: ["hermes"],
    argv: ["--print", "$PROMPT"],
    install: "Install Hermes Agent (Nous) so `hermes` is on PATH, or use the in-process MJ Hermes loop (default).",
    notes: "Each MJ agent node is a Hermes-class session. If the CLI is missing, MJ runs the in-process tool loop against a provider key / Ollama."
  },
  {
    id: "claude",
    name: "Claude Code",
    bins: ["claude"],
    argv: ["-p", "$PROMPT", "--output-format", "text"],
    install: "npm install -g @anthropic-ai/claude-code   then   claude  (login)",
    notes: "Native Anthropic coding agent. Uses your Claude Code subscription (Pro/Max).",
    source: "docs.anthropic.com \u2014 checked 2026-09"
  },
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    bins: ["codex"],
    argv: ["exec", "--skip-git-repo-check", "$PROMPT"],
    install: "npm install -g @openai/codex   then   codex login",
    notes: "OpenAI Codex harness. Uses your ChatGPT/Codex auth; --oss runs local Ollama models.",
    source: "github.com/openai/codex \u2014 checked 2026-09"
  },
  {
    id: "opencode",
    name: "OpenCode",
    bins: ["opencode"],
    argv: ["run", "$PROMPT"],
    install: "npm install -g opencode-ai   then   opencode",
    notes: "Open-source coding agent. 75+ providers, bring your own keys, fully offline. Plan/Build agent modes map onto MJ's read/write policies.",
    source: "opencode.ai docs \u2014 checked 2026-09"
  },
  {
    id: "openclaude",
    name: "OpenClaude",
    bins: ["openclaude"],
    argv: ["-p", "$PROMPT"],
    install: "npm install -g @gitlawb/openclaude@latest   then   openclaude   (/provider to set up a backend)",
    notes: "Open-source Claude-Code-shaped CLI that runs on OpenAI-compatible APIs, Gemini, GitHub Models, Codex OAuth or local Ollama \u2014 no Claude subscription needed. Config lives in ~/.openclaude, never reads ~/.claude.",
    source: "github.com/Gitlawb/openclaude \u2014 checked 2026-09 (30.9k stars; -p headless is community-verified, --bg for detached runs)"
  },
  {
    id: "copilot",
    name: "GitHub Copilot CLI",
    bins: ["copilot"],
    argv: ["-p", "$PROMPT", "-s"],
    install: "npm install -g @github/copilot   (or winget install GitHub.Copilot / brew install --cask copilot-cli)   then   copilot login",
    notes: "GitHub's terminal-first Copilot agent. -p runs one prompt non-interactively; -s prints only the response. Uses Copilot plan credits; COPILOT_GITHUB_TOKEN authenticates headless CI.",
    source: "docs.github.com/en/copilot/get-started/cli-quickstart \u2014 checked 2026-09"
  },
  {
    id: "cursor",
    name: "Cursor Agent",
    bins: ["cursor-agent", "agent"],
    argv: ["-p", "$PROMPT"],
    install: "Install Cursor, then enable the agent CLI (cursor-agent on PATH)",
    notes: "Cursor's agent CLI. Uses Cursor auth."
  },
  {
    id: "grok",
    name: "Grok Build (xAI)",
    bins: ["grok"],
    argv: ["exec", "$PROMPT"],
    install: "curl -fsSL https://x.ai/cli/install.sh | bash   (Windows: irm https://x.ai/cli/install.ps1 | iex)   then   grok   (SuperGrok Heavy login, or GROK_CODE_XAI_API_KEY for headless)",
    notes: "xAI's terminal coding agent: up to 8 parallel subagents, Plan Mode, ACP support, AGENTS.md/hooks/skills compatibility. `grok exec` is the documented non-interactive mode; `-p` also runs headless.",
    source: "x.ai/build + docs.x.ai \u2014 checked 2026-09 (Grok 4.6 default since 2026-08-12)"
  },
  {
    id: "cline",
    name: "Cline",
    bins: ["cline"],
    argv: ["$PROMPT"],
    install: "Install the Cline CLI binary on PATH (the VS Code extension alone cannot be spawned from MJ)",
    notes: "Cline's autonomous plan/act agent. BYO model. Only the CLI binary is spawnable; the VS Code extension is not.",
    source: "cline.bot \u2014 CLI availability is community-reported"
  },
  {
    id: "kilo",
    name: "Kilo Code",
    bins: ["kilo"],
    argv: ["run", "$PROMPT"],
    install: "Install Kilo Code CLI (npm i -g kilocode-cli or from kilo.ai)   then   kilo",
    notes: "Kilo CLI: 500+ models via Kilo Gateway, direct provider keys, BYOK and local/offline models. `kilo run` is the headless one-shot mode; `kilo serve` exposes it as a service.",
    source: "kilo.ai/docs \u2014 checked 2026-09"
  },
  {
    id: "aider",
    name: "Aider AI Pair Programmer",
    bins: ["aider"],
    argv: ["--yes", "--no-auto-commits", "--message", "$PROMPT"],
    install: "pip install aider-chat   then   aider",
    notes: "Git-integrated AI pair programmer. Edits directly in git worktrees."
  },
  {
    id: "gemini",
    name: "Google Gemini CLI",
    bins: ["gemini"],
    argv: ["-p", "$PROMPT"],
    install: "npm install -g @google/gemini-cli   then   gemini   (Google account auth)",
    notes: "Gemini 3.x with 1M-token context. Paid/Code Assist tiers keep Gemini CLI after the Antigravity cutover (2026-06-18); unpaid tiers move to Antigravity.",
    source: "github.com/google-gemini/gemini-cli \u2014 checked 2026-09"
  },
  {
    id: "antigravity",
    name: "Google Antigravity CLI (agy)",
    bins: ["agy"],
    argv: ["-p", "$PROMPT"],
    install: "curl -fsSL https://antigravity.google/cli/install.sh | bash   (Windows: irm https://antigravity.google/cli/install.ps1 | iex)",
    notes: "V11.6.1: the shipped binary is `agy` \u2014 a closed-source Go executable from Antigravity 2.0 (2026-05-19), not `antigravity`. Individual-tier replacement for Gemini CLI since the 2026-06-18 cutover; paid Code Assist keeps `gemini`. Headless prompt flag is community-graded (Gemini heritage) \u2014 `agy --help` decides.",
    source: "antigravity.google/docs/gcli-migration + 2026 cutover coverage (checked 2026-09); binary verified, flags community-graded"
  },
  {
    id: "amp",
    name: "Amp (Sourcegraph)",
    bins: ["amp"],
    argv: ["-x", "$PROMPT"],
    install: "npm install -g @sourcegraph/amp   then   amp login",
    notes: 'V11.6.1: execute mode is `amp -x "<prompt>"` \u2014 the documented non-interactive single-shot mode (ampcode.com/docs/cli/execute-mode). Piping `command | amp` also works. The old `--headless` mapping conflated runner mode (`--no-tui`) with execute mode.',
    source: "ampcode.com/docs + sourcegraph/amp-examples-and-guides CLI guide (checked 2026-09)"
  },
  {
    id: "crush",
    name: "Crush (Charm)",
    bins: ["crush"],
    argv: ["run", "$PROMPT"],
    install: "npm install -g @charmbracelet/crush   (or brew install charmbracelet/crush/crush)   then   crush",
    notes: "Charm's beautiful TUI coding agent, LSP-aware, multi-provider. `crush run` executes a prompt non-interactively.",
    source: "github.com/charmbracelet/crush \u2014 community-graded flags"
  },
  {
    id: "openhands",
    name: "OpenHands",
    bins: ["openhands"],
    argv: ["--headless", "-t", "$PROMPT"],
    install: "pip install openhands   then   openhands login   (or configure any LLM)",
    notes: 'V11.6.1: the V1 CLI headless mode is `openhands --headless -t "<task>"` (pypi.org/project/openhands, docs.openhands.dev). `--json` streams JSONL events; `-f` takes a task file. The old `solve` mapping was a pre-V1 design.',
    source: "github.com/All-Hands-AI/OpenHands \u2014 checked 2026-09"
  },
  {
    id: "goose",
    name: "Goose (Block)",
    bins: ["goose"],
    argv: ["run", "--text", "$PROMPT"],
    install: "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash",
    notes: "Block's open-source extensible AI developer agent with 70+ MCP extensions."
  },
  {
    id: "qwen",
    name: "Qwen Code",
    bins: ["qwen"],
    argv: ["-p", "$PROMPT"],
    install: "npm install -g @qwen-ai/qwen-code   then   qwen   (API key or Coding Plan)",
    notes: "Alibaba Qwen3-Coder terminal agent: OpenAI-compatible endpoints, Anthropic, Gemini, Ollama, vLLM. Note: the free OAuth tier ended 2026-04-15.",
    source: "github.com/QwenLM/qwen-code \u2014 checked 2026-09"
  },
  {
    id: "amazonq",
    name: "Amazon Q / Kiro CLI",
    bins: ["kiro-cli", "q"],
    argv: ["chat", "--no-interactive", "$PROMPT"],
    install: "Install Amazon Q Developer CLI via Homebrew/WinGet or AWS CLI",
    notes: "AWS enterprise terminal coding agent with Bedrock model routing."
  },
  {
    id: "droid",
    name: "Droid (Factory)",
    bins: ["droid"],
    argv: ["exec", "$PROMPT"],
    install: "curl -fsSL https://app.factory.ai/cli | sh   (Linux also needs xdg-utils)",
    notes: "V11.7.1: `droid exec \"<prompt>\"` is the vendor-documented non-interactive single-pass mode. The DEFAULT is spec-mode \u2014 read-only operations only \u2014 so MJ's read-only policy needs no flag at all; writes compose `--auto low` (the vendor's example tier; risk tiers gate what may run). `-f <file>` reads the prompt from a file, `-o` sets the output format.",
    source: "docs.factory.ai/droid-exec/overview (checked 2026-09) \u2014 vendor-documented headless mode"
  },
  {
    id: "kimi",
    name: "Kimi Code (Moonshot)",
    bins: ["kimi"],
    argv: ["-p", "$PROMPT"],
    install: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash   (or: npm install -g @moonshot-ai/kimi-code)",
    notes: 'V11.7.1: `kimi -p "<prompt>"` runs a single prompt non-interactively (the CLI\'s finalizeHeadlessRun exits the process after completion). `--output-format stream-json` emits JSONL events; `--yolo` auto-approves regular tool calls; `--auto` is the no-questions permission mode; `-S <id>` resumes a session by id. Swarm/goal modes are interactive concepts MJ does not compose.',
    source: "kimi.ai/resources/kimi-code-cheat-sheet + moonshotai/kimi-code (checked 2026-09) \u2014 vendor-documented prompt mode"
  },
  {
    id: "auggie",
    name: "Auggie (Augment Code)",
    bins: ["auggie"],
    argv: ["--print", "$PROMPT"],
    install: "npm install -g @augmentcode/auggie   then   auggie login",
    notes: 'V11.7.1: `auggie --print "<instruction>"` is print mode \u2014 one instruction, no UI, exits (the vendor\'s own automation workflow). `--quiet` shows only the final message, `--output-format json` structures the response, `--ask` is a genuine read-only mode (retrieval and non-editing tools only) that is documented as its own mode rather than a --print modifier. Non-interactive mode can be disabled by enterprise agreement. `--acp` exposes Auggie as an ACP agent.',
    source: "docs.augmentcode.com/cli/reference (checked 2026-09) \u2014 vendor-documented print mode"
  },
  {
    id: "warp",
    name: "Warp Oz Agent CLI",
    bins: ["oz"],
    argv: ["agent", "run", "--prompt", "$PROMPT"],
    install: "Ships with Warp 2026 (Command Palette \u2192 Install Warp CLI), or: brew tap warpdotdev/warp && brew install --cask warp-cli   then   oz login",
    notes: "V11.7.1: Warp's agent infrastructure has its own CLI, `oz`. `oz agent run --prompt` starts a LOCAL agent run \u2014 that is what MJ spawns. `oz agent run-cloud` is Warp cloud infrastructure (needs --environment) and is deliberately NOT composed. WARP_API_KEY authenticates headless servers/CI. The 2025-era `warp agent run --prompt` surface still exists on the `warp` binary; the Linux desktop launcher is `warp-terminal` \u2014 neither is the agent CLI MJ detects.",
    source: "docs.warp.dev/reference/cli (checked 2026-09) \u2014 vendor-documented local agent run"
  },
  {
    id: "llm",
    name: "Direct LLM (API / Ollama)",
    bins: [],
    argv: [],
    install: "Save a provider key in MJ \u2192 Providers, or run Ollama locally",
    notes: "Not a coding harness. Calls the chat API with the composed agent prompt."
  }
];
var HARNESS_BY_ID = new Map(HARNESSES.map((h) => [h.id, h]));
var HARNESS_OPTIONS = HARNESSES.map((h) => h.id);
function isCustomHarness(id) {
  return id.startsWith("custom:");
}
var customRegistry = /* @__PURE__ */ new Map();
function getCustomHarness(id) {
  return customRegistry.get(id);
}

// src/mission/agentCapabilities.ts
var AGENT_CAPABILITIES = {
  acp: {
    id: "acp",
    name: "ACP agent (Agent Client Protocol)",
    bins: ["claude-code-acp"],
    install: "Set MJ_ACP_BIN to any ACP-compliant agent binary (claude-code-acp bridges Claude Code; gemini --experimental-acp bridges Gemini).",
    prompt: { argv: null, confidence: "docs", source: "ACP spec (agentclientprotocol.com): the prompt travels as session/prompt ContentBlock[], not argv. Conformance exercised by probe/acp.test.ts against a scripted agent." },
    json: { argv: null, kind: "ndjson", confidence: "docs", source: "ACP streams structured session/update events (agent_message_chunk, tool_call, plan) over newline-delimited JSON \u2014 there is no JSON output flag to pass." },
    readOnly: { argv: null, confidence: "docs", source: "ACP models permissions natively: session/request_permission. MJ's mission policy answers it (default: deny) instead of passing a CLI flag." },
    write: { argv: null, confidence: "docs", source: "Writes happen through fs/write_text_file or the agent's own tools, each gated by session/request_permission." },
    fullAuto: { argv: null, confidence: "unverified", source: "ACP has no skip-permissions primitive and MJ will not emulate one. Autonomy comes from the mission policy, not the wire." },
    maxTurns: { argv: null, confidence: "docs", source: "No turn-cap in the protocol; MJ's CapLedger enforces the wall clock and MJ cancels via session/cancel." },
    timeout: { argv: null, confidence: "docs", source: "Protocol-level: client-side request timeout + session/cancel. Verified in probe/acp.test.ts." },
    outputSchema: { argv: null, confidence: "unverified", source: "No schema primitive in ACP v1; structured output is the mission's job, not the transport's." },
    worktree: { argv: null, confidence: "docs", source: "session/new takes cwd \u2014 MJ points the session at its prepared worktree, as with any CLI." },
    cwd: { argv: null, confidence: "docs", source: "session/new { cwd, mcpServers } \u2014 first-class in the protocol, unlike most CLIs." },
    model: { argv: null, confidence: "docs", source: "session/new may return models/modes; session/set_mode switches. Not required for a first turn." },
    resume: { argv: ["session/load"], confidence: "docs", source: "session/load resumes a session by id \u2014 MJ does not use it yet; every mission seat is a fresh session." },
    sessionStart: { argv: null, confidence: "docs", source: "Sessions are created per seat via session/new; there is nothing to pre-create." },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "Update behavior belongs to the agent binary, not the protocol." },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "ACP is a protocol, not a binary: what is verified is MJ's client (probe/acp.test.ts), not any particular agent's server. Per-agent verification stays on the Proof page's live-binary ledger.",
      "Newline-delimited JSON: a chatty stderr is fine, but any agent that prints non-JSON to stdout breaks the stream \u2014 MJ counts such lines as protocol_error events instead of crashing."
    ]
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
    maxTurns: { argv: ["--max-turns", "$N"], confidence: "docs", source: "code.claude.com CLI reference (2026): print-mode only, no default, exits with an error at the cap. Supersedes the 2.1.197 --help scan that found no match \u2014 the flag is not listed in --help." },
    timeout: { argv: null, confidence: "binary", source: "VERIFIED ABSENT against the real binary: claude 2.1.197 \u2014 no timeout flag; MJ enforces its own wall clock" },
    outputSchema: { argv: ["--json-schema"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 --help" },
    worktree: { argv: ["-w"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; -w, --worktree [name]" },
    cwd: { argv: null, confidence: "binary", source: "VERIFIED ABSENT against the real binary: claude 2.1.197 \u2014 no cwd flag; MJ sets the child process cwd instead" },
    model: { argv: ["--model", "$MODEL"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; --model <model>" },
    resume: { argv: ["--resume", "$SESSION"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; -r, --resume [value]" },
    sessionStart: { argv: ["--session-id", "$SESSION"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 --help \u2014 `--session-id <uuid>` CREATES a session under the id you pass, so MJ can pick the id. `--resume` loads one; passing both is a conflict, so MJ emits exactly one per turn." },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: { allowFlag: "--allowedTools", denyFlag: "--disallowedTools", confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 \u2014 note --allowedTools PRE-APPROVES, it does not restrict. --tools restricts which tools exist." },
    cost: { kind: "usd", path: "total_cost_usd", confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 \u2014 total_cost_usd, num_turns and session_id all present in the shipped executable, and a live run returned them" },
    enforcedReadOnly: true,
    gotchas: [
      '--allowedTools pre-approves (skips the prompt) but does NOT restrict. --tools restricts which tools exist; --tools "" is pure text. Conflating them is the classic bug.',
      "--max-turns exists in print mode only (docs-graded; --help does not list it). The CapLedger stays the authoritative ceiling \u2014 the CLI-side cap is defence in depth that fails fast. The vendor also documents --max-budget-usd (print-mode spend cap); MJ deliberately does not compose it: the CapLedger is the spend authority.",
      'Without credentials it still exits 0 and returns a full result object with is_error:true and result:"Not logged in \xB7 Please run /login". Exit code alone would read that as success.'
    ]
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
    resume: { argv: ["resume"], confidence: "docs", source: "codex exec resume \u2014 takes no session id, so MJ cannot say WHICH conversation to continue" },
    sessionStart: { argv: null, confidence: "unverified", source: "codex names its own sessions and there is no documented way to choose the id, so MJ must capture it from the output" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: { kind: "tokens-only", confidence: "docs", source: "reports tokens but NOT cost. MJ must leave costUsd null rather than guess a price." },
    enforcedReadOnly: true,
    gotchas: [
      "--full-auto is DEPRECATED. Use --sandbox workspace-write.",
      "Reports tokens with no price, so a cost figure for a codex seat would be invented. MJ records tokens and says the spend is unknown."
    ]
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    bins: ["opencode"],
    install: "npm install -g opencode-ai   then   opencode",
    prompt: { argv: ["run", "$PROMPT"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 `run [message..]`; a real run executed bash and returned NDJSON" },
    json: { argv: ["--format", "json"], kind: "ndjson", confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 choices default|json; json emits NDJSON events step_start/text/tool_use/step_finish" },
    readOnly: { argv: ["--agent", "plan"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 asked to create a file, the plan agent made ZERO tool calls and created nothing, while the default agent created it. Read-only is enforced, not advisory." },
    // The DEFAULT agent is the writing one — proven by a real write. `--agent build` is not what the
    // binary expects, so MJ emits no agent flag when it wants writes.
    write: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 the default agent wrote proof-default.txt. No agent flag is needed to write; do NOT pass --agent build." },
    // There is no --dangerously-skip-permissions in this CLI (0 matches in `run --help`). That flag
    // belongs to Claude Code; the OpenCode equivalent is --auto, which is far more dangerous than it
    // sounds, so MJ never emits it without an explicit human decision.
    fullAuto: { argv: ["--auto"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 `--auto  auto-approve permissions that are not explicitly denied (dangerous!)`. --dangerously-skip-permissions does NOT exist here." },
    maxTurns: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 no turn-cap flag exists in `run --help`, so MJ's own CapLedger is the only turn limit" },
    timeout: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 no timeout flag; MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 no output-schema flag in `run --help`" },
    worktree: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 no worktree flag; MJ uses git worktree itself" },
    cwd: { argv: ["--dir", "$CWD"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 `--dir  directory to run in, path on remote server if attaching`" },
    model: { argv: ["--model", "$MODEL"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 `-m, --model` in provider/model format" },
    resume: { argv: ["--session", "$SESSION"], confidence: "binary", source: "VERIFIED END-TO-END against the real binary: opencode 1.18.25 \u2014 turn 1 planted a codeword, a FRESH process resumed with --session <id> and recalled it exactly. -c/--continue resumes the latest session; --fork copies before continuing." },
    sessionStart: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 `--session <unknown-id>` exits 1 with `Error: Session not found`. It LOADS, it does not create, so MJ must NOT pass a session id on turn one. Run turn one bare, capture the sessionID from the NDJSON, and resume with it afterwards." },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented; `opencode upgrade` is a separate command" },
    filters: null,
    cost: { kind: "usd", path: "step_finish.part.cost", confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 each step_finish carries .part.cost and .part.tokens{total,input,output,reasoning,cache}. tokens.total is CUMULATIVE (8019 then 8038 across two steps), so take the LAST value; summing would multiply-count." },
    enforcedReadOnly: true,
    gotchas: [
      "CORRECTION: the widely-quoted issue anomalyco/opencode#13851 claimed non-interactive sessions get a restrictive preset that blocks writes. On the real 1.18.25 binary the DEFAULT agent wrote a file without any flag, so that no longer holds. MJ no longer warns about it \u2014 a stale warning would push every seat to read-only for no reason.",
      "There is NO --dangerously-skip-permissions here. The escape hatch is --auto, whose own help text says '(dangerous!)' because it approves everything not explicitly denied. MJ treats it as requiring an explicit human decision, never a default.",
      "Sessions are real and resumable by id: --session <id>, -c/--continue for the latest, --fork to branch without polluting the original. Every NDJSON event carries sessionID, so MJ can capture it from turn one.",
      "opencode ships credential-free models (opencode/mimo-v2.5-free, opencode/nemotron-3.5-lightning-free, opencode/big-pickle and others). With zero credentials configured these still run and report cost 0 \u2014 useful for proving the plumbing before any API key exists.",
      "opencode.json supports permission: [{permission, pattern, action}] and tools: {write:false, bash:false} \u2014 MJ can write this file into the mission workspace to express its risk class."
    ]
  },
  grok: {
    id: "grok",
    name: "Grok Build",
    bins: ["grok"],
    install: "curl -fsSL https://x.ai/cli/install.sh | bash    (Windows: irm https://x.ai/cli/install.ps1 | iex)",
    // V11.6: `grok exec` is the documented one-shot mode (developersdigest/x.ai guides,
    // 2026-09); -p also runs headless but exec is the canonical scripting surface.
    prompt: { argv: ["exec", "$PROMPT"], confidence: "docs", source: "docs.x.ai \u2014 grok exec is non-interactive; -p is the headless alias" },
    json: { argv: ["--output-format", "json"], kind: "json", confidence: "docs", source: "plain|json|streaming-json" },
    readOnly: { argv: ["--permission-mode", "plan", "--sandbox", "read-only"], confidence: "docs", source: "permission vocabulary is deliberately Claude-compatible" },
    write: { argv: ["--permission-mode", "acceptEdits", "--sandbox", "workspace"], confidence: "docs", source: "sandbox off|workspace|read-only|strict|devbox" },
    fullAuto: { argv: ["--permission-mode", "bypassPermissions", "--sandbox", "off"], confidence: "docs", source: "the documented escape hatch" },
    // V11.8.0: --max-turns is real here AND in Claude Code's print mode (docs-graded there).
    // Same name, two CLIs — graded differently, which is exactly why per-harness evidence
    // matters. V11.8.0 also fixed the policy layer ignoring this flag (withTurnLimit
    // special-cased claude only); it is capability-driven now, so grok seats get their
    // documented turn cap on the policyFor path too.
    maxTurns: { argv: ["--max-turns", "$N"], confidence: "docs", source: "docs.x.ai \u2014 a real flag here; Claude Code documents the same name for print mode (docs-graded, see the claude entry)" },
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
      "Deny wins over allow, so an allowlist alone does not grant anything the deny list touches."
    ]
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
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock \u2014 see the no-exit bug below" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: ["--workspace", "$CWD"], confidence: "community", source: "verify with --help" },
    model: { argv: ["--model", "$MODEL"], confidence: "community", source: "-m" },
    resume: { argv: ["--resume", "$SESSION"], confidence: "community", source: "--resume [session_id]" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented; MJ captures the id from the output instead" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: { allowFlag: "", denyFlag: "", confidence: "community", source: 'permissions live in .cursor/cli-config.json as {permissions:{allow:["Shell(git)","Read(*)"],deny:["Read(.env*)"]}}, not on the command line' },
    cost: null,
    enforcedReadOnly: true,
    gotchas: [
      "KNOWN BUG: under -p the process may not exit after the result is emitted, so CI runs hang until killed. MJ MUST apply a wall-clock timeout and parse the result from the stream rather than waiting for exit. Reported repeatedly on the Cursor forum.",
      "Reports no cost at all, so a cursor seat's spend is unknown rather than zero."
    ]
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
    filters: { allowFlag: "", denyFlag: "", confidence: "docs", source: 'CLINE_COMMAND_PERMISSIONS env var: {"allow":["npm *","git *"],"deny":["rm -rf *"]}' },
    cost: { kind: "usd", path: "verbose stats", confidence: "community", source: "-v prints elapsed time, tokens and estimated cost when available \u2014 parse, do not assume" },
    enforcedReadOnly: true,
    gotchas: [
      "--data-dir <path> uses isolated state instead of ~/.cline/data and AUTOMATICALLY enables sandbox mode. That is the strongest isolation available here, so MJ uses it for untrusted repos.",
      "--zen/-z returns immediately with no result. MJ must NEVER use it: it looks like a fast success and delivers nothing."
    ]
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
      "Read-only is per-agent ONLY (.kilo/agents/*.md), so MJ authors the file and says the guarantee is advisory until verified. enforcedReadOnly is false on purpose."
    ]
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
    gotchas: ["No enforced sandbox, so a hermes seat must never be assigned HIGH or CRITICAL risk."]
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
    gotchas: ["Pass --no-auto-commits so MJ manages worktree commits deterministically."]
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
    gotchas: ["Documentation-level integration; uses --approval-mode plan for Plan Mode."]
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
    gotchas: ["Open-source agent by Block with extensive MCP extension ecosystem."]
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
    gotchas: ["Alibaba open-source terminal agent tuned for Qwen3-Coder models."]
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
    gotchas: ["AWS developer CLI transitioning to Kiro CLI; enterprise Bedrock integration."]
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
    model: { argv: null, confidence: "docs", source: "OPENAI_MODEL / OPENAI_BASE_URL env or /provider profiles \u2014 config is env/profile driven, not argv" },
    resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "github README: --resume <id>, --continue for latest" },
    sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "Open-source Claude-Code-shaped CLI for OpenAI-compatible/Gemini/Ollama backends \u2014 no Claude subscription needed.",
      "Config lives in ~/.openclaude and ~/.openclaude-profile.json; it deliberately never reads ~/.claude.",
      "Background sessions (--bg) return immediately \u2014 MJ needs the synchronous -p shape, so -p is the registered invocation.",
      "No verified read-only mode: an OpenClaude seat marked no-write is advisory, not enforced."
    ]
  },
  copilot: {
    id: "copilot",
    name: "GitHub Copilot CLI",
    bins: ["copilot"],
    install: "npm install -g @github/copilot   (winget install GitHub.Copilot / brew install --cask copilot-cli)   then   copilot login",
    // GitHub Docs, checked 2026-09: -p is the documented programmatic prompt; -s silences usage info.
    prompt: { argv: ["-p", "$PROMPT", "-s"], confidence: "docs", source: "docs.github.com/en/copilot/get-started/cli-quickstart \u2014 'pass a prompt to the CLI with the -p flag'; -s outputs only the response" },
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
      "Read-only is real when constructed via --available-tools read + --deny-tool write families \u2014 but deny patterns must actually cover the write tools."
    ]
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
      "Everything here is community-graded: the cutover was recent and the binary disagrees with guides sometimes. Run the Teams test before relying on a flag."
    ]
  },
  amp: {
    id: "amp",
    name: "Amp (Sourcegraph)",
    bins: ["amp"],
    install: "npm install -g @sourcegraph/amp   then   amp login",
    // V11.6.1 correction: execute mode is `amp -x "<prompt>"` (non-interactive single-shot),
    // documented in Sourcegraph's own CLI guide. The old `--headless` mapping was wrong —
    // that conflated runner mode (`--no-tui`) with execute mode.
    prompt: { argv: ["-x", "$PROMPT"], confidence: "docs", source: "ampcode.com/docs/cli/execute-mode + sourcegraph/amp-examples-and-guides \u2014 execute mode is documented" },
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
      "No verified read-only enforcement: an Amp seat marked no-write is advisory."
    ]
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
      "Charm's TUI agent \u2014 LSP-aware, multi-provider.",
      "No verified read-only enforcement: a Crush seat marked no-write is advisory."
    ]
  },
  openhands: {
    id: "openhands",
    name: "OpenHands",
    bins: ["openhands"],
    // V11.6.1 correction: the V1 CLI's headless mode is `openhands --headless -t "<task>"`
    // (documented on PyPI + docs.openhands.dev); the earlier `solve` subcommand was a
    // pre-V1 design. --json streams JSONL events; -f takes a task file.
    install: "pip install openhands   then   openhands login   (or configure any LLM)",
    prompt: { argv: ["--headless", "-t", "$PROMPT"], confidence: "docs", source: "pypi.org/project/openhands + docs.openhands.dev \u2014 headless mode documented" },
    json: { argv: ["--json"], kind: "ndjson", confidence: "docs", source: "docs.openhands.dev CLI headless \u2014 JSONL event stream" },
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
      "Containment comes from its runtime sandbox config, not from an argv flag MJ can pass \u2014 treat read-only seats as advisory."
    ]
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
    prompt: { argv: ["exec", "$PROMPT"], confidence: "docs", source: "docs.factory.ai/droid-exec \u2014 'Execute a single command (non-interactive mode)'" },
    json: { argv: null, kind: "text", confidence: "unverified", source: "-o/--output-format exists but the documented values were not verified" },
    readOnly: { argv: [], confidence: "docs", source: "spec-mode default: exec only executes read-only operations (docs.factory.ai/droid-exec)" },
    write: { argv: ["--auto", "low"], confidence: "docs", source: "'add --auto to enable edits and commands, with risk tiers gating what can run' \u2014 low is the vendor's example tier" },
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
      "Factory's agent: honours AGENTS.md conventions at the repo root."
    ]
  },
  kimi: {
    id: "kimi",
    name: "Kimi Code (Moonshot)",
    bins: ["kimi"],
    install: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash   (or: npm install -g @moonshot-ai/kimi-code)",
    // V11.7.1: vendor-documented prompt mode (kimi.ai cheat sheet + moonshotai/kimi-code
    // sources): -p runs a single prompt non-interactively and finalizeHeadlessRun exits
    // cleanly. stream-json output and -S session resume are both on the vendor flag table.
    prompt: { argv: ["-p", "$PROMPT"], confidence: "docs", source: "kimi.ai/resources/kimi-code-cheat-sheet \u2014 'Run a single non-interactive prompt without opening the TUI'" },
    json: { argv: ["--output-format", "stream-json"], kind: "ndjson", confidence: "docs", source: "'--output-format stream-json \u2014 emit JSONL events for scripting; only works with --prompt'" },
    readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag; a no-write seat is advisory" },
    write: { argv: [], confidence: "docs", source: "default: prompt mode edits files when the agent decides" },
    fullAuto: { argv: ["--yolo"], confidence: "docs", source: "'--yolo (-y) \u2014 auto-approve regular tool calls; use only in trusted directories'" },
    maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
    timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
    outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
    worktree: { argv: null, confidence: "unverified", source: "not documented" },
    cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process (-w reported in community wrappers)" },
    model: { argv: ["-m", "$MODEL"], confidence: "docs", source: "'--model <model> (-m) \u2014 specify a model alias for this launch'" },
    resume: { argv: ["--session", "$SESSION"], confidence: "docs", source: "'--session [id] (-S) \u2014 resume a session by ID'" },
    sessionStart: { argv: null, confidence: "unverified", source: "no documented create-under-chosen-id flag; Kimi assigns its own session ids" },
    noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: [
      "Single native binary via the install script; the npm route needs Node 22.19+.",
      "--auto is the no-questions permission mode; --yolo additionally skips regular tool approvals."
    ]
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
    prompt: { argv: ["--print", "$PROMPT"], confidence: "docs", source: "docs.augmentcode.com/cli/reference \u2014 'Run one instruction in print mode and exit' (-p)" },
    json: { argv: ["--output-format", "json"], kind: "json", confidence: "docs", source: "'--print --output-format json \u2014 output the response in structured JSON format for automation workflows'" },
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
      "Non-interactive mode may be DISABLED by enterprise agreement (vendor docs) \u2014 a headless Auggie seat can fail for licensing, not technical, reasons.",
      "--augment-session-json <json-or-path> authenticates automation without auggie login.",
      "--acp runs Auggie as an ACP agent for compatible editors; --mcp runs it as an MCP tool server."
    ]
  },
  warp: {
    id: "warp",
    name: "Warp Oz Agent CLI",
    bins: ["oz"],
    install: "Ships with Warp 2026 (Command Palette \u2192 Install Warp CLI), or: brew tap warpdotdev/warp && brew install --cask warp-cli   then   oz login",
    // V11.7.1: Warp's agent infrastructure has its own CLI (docs.warp.dev/reference/cli).
    // oz agent run --prompt starts a LOCAL agent run; WARP_API_KEY authenticates headless
    // (CI pipelines, headless servers). run-cloud is cloud infrastructure — not composed.
    prompt: { argv: ["agent", "run", "--prompt", "$PROMPT"], confidence: "docs", source: "docs.warp.dev/reference/cli \u2014 'oz agent run --prompt ...' quickstart; API keys 'let the CLI authenticate non-interactively'" },
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
      "The 2025-era `warp agent run --prompt` surface still exists on the warp binary, and the Linux desktop launcher is warp-terminal \u2014 neither is the agent CLI MJ detects."
    ]
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
    gotchas: ["No filesystem access and no enforced sandbox. Useful for reasoning, useless for edits."]
  }
};
function syntheticCustomCaps(id, spec) {
  return {
    id,
    name: `${spec.name} (custom)`,
    bins: [spec.bin],
    install: "Teams -> Connect -> Custom harnesses",
    prompt: { argv: spec.argv, confidence: "community", source: "user-registered harness \u2014 MJ verified none of its flags" },
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
    gotchas: ["User-registered harness: MJ verified none of its flags. Read-only is advisory."]
  };
}
function unregisteredCustomCaps(id) {
  return {
    id,
    name: `Custom harness "${id}"`,
    bins: [],
    install: "Teams -> Connect -> Custom harnesses (re-add it, then recompile)",
    prompt: { argv: [], confidence: "unverified", source: "not registered (anymore)" },
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
    gotchas: ["This harness is not registered (anymore); it cannot run until re-added in Teams -> Connect."]
  };
}
function resolveCaps(harness) {
  if (isCustomHarness(harness)) {
    const spec = getCustomHarness(harness);
    return spec ? { caps: syntheticCustomCaps(harness, spec), custom: true, registered: true } : { caps: unregisteredCustomCaps(harness), custom: true, registered: false };
  }
  const caps = AGENT_CAPABILITIES[harness];
  return caps ? { caps, custom: false, registered: true } : { caps: unregisteredCustomCaps(harness), custom: false, registered: false };
}
function enforcedReadOnly(id) {
  const caps = AGENT_CAPABILITIES[id];
  return caps ? caps.enforcedReadOnly : false;
}
function unverifiedClaims(id) {
  const caps = AGENT_CAPABILITIES[id];
  if (!caps) {
    return ["Custom harness: every flag is the user's own \u2014 MJ verified none of it. Read-only is advisory."];
  }
  const out = [];
  const check = (name, cap) => {
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
var EXECUTABLE_HARNESSES = Object.keys(AGENT_CAPABILITIES).filter(
  (id) => AGENT_CAPABILITIES[id].bins.length > 0
);

// src/mission/sessions.ts
function sessionArgv(harness, opts) {
  const rc = resolveCaps(harness);
  if (rc.custom) {
    return { argv: [], continuity: "none", warning: "Custom harness: no session continuity \u2014 every turn is stateless." };
  }
  if (!rc.registered) {
    return { argv: [], continuity: "none", warning: `Harness "${harness}" is not registered (anymore); this turn is stateless.` };
  }
  const caps = rc.caps;
  if (opts.kind === "first" && opts.idKind === "cli-chosen") {
    return { argv: [], continuity: "session", warning: null };
  }
  if (opts.kind === "first") {
    const start = caps.sessionStart;
    if (!start?.argv) {
      return { argv: [], continuity: "none", warning: `${caps.name} has no documented way to start a session under a chosen id, so this turn is stateless.` };
    }
    return { argv: start.argv.map((a) => a === "$SESSION" ? opts.sessionId : a), continuity: "session", warning: null };
  }
  const resume = caps.resume;
  if (!resume?.argv) {
    return {
      argv: [],
      continuity: "none",
      warning: `${caps.name} has no documented way to resume a session, so this turn starts from scratch. The agent will not remember the previous turn \u2014 do not treat a second-pass approval as informed.`
    };
  }
  if (!resume.argv.includes("$SESSION")) {
    return {
      argv: [],
      continuity: "none",
      warning: `${caps.name}'s resume form takes no session id, so MJ cannot say which conversation to continue and will not guess. This turn starts from scratch and the prompt restates the context.`
    };
  }
  return { argv: resume.argv.map((a) => a === "$SESSION" ? opts.sessionId : a), continuity: "session", warning: null };
}
function sessionIdKind(harness) {
  const rc = resolveCaps(harness);
  if (rc.custom) return "cli-chosen";
  return rc.caps.sessionStart?.argv ? "mj-chosen" : "cli-chosen";
}

// src/mission/agentTeam.ts
var SCHEMA_VERSION = 1;
var seat = (id, role, harness, over = {}) => ({
  id,
  role,
  harness,
  model: null,
  mayWrite: role === "coder" || role === "debugger",
  maxRisk: role === "coder" || role === "debugger" ? "MEDIUM" : "LOW",
  timeoutSecs: 900,
  maxTurns: null,
  instructions: "",
  ...over
});
var PREBUILT_TEAMS = [
  {
    id: "team.balanced",
    name: "Balanced",
    description: "Plan, build, test, review. One vendor writes, a second reviews \u2014 so the review is not the author grading its own work.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "claude", { mayWrite: false, maxRisk: "LOW", instructions: "Break the objective into steps small enough to verify individually." }),
      seat("architect", "architect", "claude", { mayWrite: false, maxRisk: "LOW" }),
      seat("impl", "coder", "claude", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement the change. Touch only what the task requires." }),
      seat("synthesizer", "synthesizer", "grok", { mayWrite: false, maxRisk: "LOW" }),
      seat("test", "tester", "opencode", { mayWrite: false, maxRisk: "LOW", instructions: "Run the repository's own checks and report what failed." }),
      seat("reviewer", "reviewer", "codex", { mayWrite: false, maxRisk: "LOW", instructions: "Review the diff. Say what is wrong, not what is fine." }),
      seat("security", "security", "codex", { mayWrite: false, maxRisk: "LOW", instructions: "Check for security vulnerabilities." })
    ]
  },
  {
    id: "team.adversarial",
    name: "Adversarial",
    description: "Deliberately cross-vendor. Every writer is reviewed by a different vendor, because agreement across vendors is weaker evidence than agreement with itself.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "claude", { mayWrite: false, maxRisk: "LOW" }),
      seat("impl", "coder", "claude", { mayWrite: true, maxRisk: "MEDIUM" }),
      seat("test", "tester", "cline", { mayWrite: false, maxRisk: "LOW", instructions: "Prove the change works or find the case where it does not." }),
      seat("reviewer", "reviewer", "grok", { mayWrite: false, maxRisk: "LOW" }),
      seat("security", "security", "codex", { mayWrite: false, maxRisk: "LOW", instructions: "Look only for injection, secret leakage and unsafe deserialisation." }),
      seat("synthesizer", "synthesizer", "opencode", { mayWrite: false, maxRisk: "LOW", instructions: "Reconcile the verdicts into one decision." })
    ]
  },
  {
    id: "team.powerhouse",
    name: "Cross-Vendor Powerhouse",
    description: "Connects the most popular CLI agents into one unified team: Claude plans, Codex architectures, OpenCode builds, Cursor debugs, Grok tests, Cline reviews, and Hermes synthesizes.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "claude", { mayWrite: false, maxRisk: "LOW", instructions: "Formulate the execution plan and criteria." }),
      seat("architect", "architect", "codex", { mayWrite: false, maxRisk: "LOW", instructions: "Design component interfaces and data schemas." }),
      seat("coder", "coder", "opencode", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement core logic and tests in isolated worktree." }),
      seat("debugger", "debugger", "cursor", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Diagnose edge cases and optimize performance." }),
      seat("tester", "tester", "grok", { mayWrite: false, maxRisk: "LOW", instructions: "Run test suites and fuzz edge cases." }),
      seat("reviewer", "reviewer", "cline", { mayWrite: false, maxRisk: "LOW", instructions: "Conduct independent peer review against the snapshot merge." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Reconcile findings into final release notes." })
    ]
  },
  {
    id: "team.solo",
    name: "Solo",
    description: "One seat. Cheap, fast, and the review is advisory only \u2014 an author grading its own work is not a review.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [seat("impl", "coder", "opencode", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement and self-check." })]
  },
  {
    id: "team.audit",
    name: "Read-only audit",
    description: "No seat may write. For answering 'what is wrong with this code?' without risking a change.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("reviewer", "reviewer", "claude", { mayWrite: false, maxRisk: "LOW" }),
      seat("security", "security", "codex", { mayWrite: false, maxRisk: "LOW" })
    ]
  }
];
var TEAM_BY_ID = new Map(PREBUILT_TEAMS.map((t) => [t.id, t]));
function fill(cap, vars) {
  if (!cap || !cap.argv) return [];
  return cap.argv.map((a) => a.startsWith("$") ? vars[a] ?? "" : a);
}
function composeSeatArgv(teamSeat, ctx) {
  const resolved = resolveCaps(teamSeat.harness);
  const caps = resolved.registered ? resolved.caps : null;
  if (!caps) {
    return {
      bin: "",
      argv: [],
      env: {},
      files: [],
      claims: { readOnlyEnforced: false, costKind: "none" },
      warnings: [`Custom harness "${teamSeat.harness}" is not registered (anymore). Add it in Teams -> Connect, then recompile.`]
    };
  }
  const warnings = [];
  const vars = {
    $PROMPT: ctx.prompt,
    $MODEL: teamSeat.model ?? "",
    $N: String(teamSeat.maxTurns ?? 20),
    $CWD: ctx.cwd,
    $SECS: String(teamSeat.timeoutSecs),
    $SESSION: ctx.sessionId ?? "",
    $REVIEWER: "mj-readonly",
    $NAME: `mj-${teamSeat.id}`
  };
  const argv = [];
  const flags = [];
  const env = {};
  const files = [];
  const wantsReadOnly = ctx.readOnly || !teamSeat.mayWrite;
  argv.push(...fill(caps.prompt, vars));
  if (wantsReadOnly) {
    if (caps.readOnly?.argv?.length) flags.push(...fill(caps.readOnly, vars));
    else if (caps.readOnly?.implicit) {
    } else warnings.push(`${caps.name} has no enforced read-only mode, so this seat is ADVISORY only \u2014 it can still modify files.`);
  } else if (caps.write?.argv?.length) {
    flags.push(...fill(caps.write, vars));
  }
  if (caps.json?.argv) flags.push(...fill(caps.json, vars));
  if (teamSeat.maxTurns && caps.maxTurns?.argv) flags.push(...fill(caps.maxTurns, vars));
  if (caps.timeout?.argv) flags.push(...fill(caps.timeout, vars));
  if (caps.cwd?.argv) flags.push(...fill(caps.cwd, vars));
  if (teamSeat.model && caps.model?.argv) flags.push(...fill(caps.model, vars));
  if (caps.noAutoUpdate?.argv) flags.push(...fill(caps.noAutoUpdate, vars));
  if (ctx.sessionId) {
    const s = sessionArgv(teamSeat.harness, {
      kind: (ctx.turn ?? 1) <= 1 ? "first" : "follow-up",
      idKind: sessionIdKind(teamSeat.harness),
      sessionId: ctx.sessionId
    });
    flags.push(...s.argv);
    if (s.warning) warnings.push(s.warning);
  }
  if (teamSeat.harness === "cline") {
    env.CLINE_COMMAND_PERMISSIONS = wantsReadOnly ? JSON.stringify({ allow: ["git *", "ls *", "cat *"], deny: ["rm *", "git push *", "git commit *"] }) : JSON.stringify({ allow: ["npm *", "git *"], deny: ["rm -rf *", "git push --force *"] });
  }
  if (teamSeat.harness === "cursor") {
    files.push({
      path: ".cursor/cli-config.json",
      contents: JSON.stringify(
        {
          permissions: {
            allow: wantsReadOnly ? ["Read(*)", "Shell(git status)", "Shell(git diff)"] : ["Read(*)", "Shell(git)", "Shell(npm)"],
            deny: wantsReadOnly ? ["Write(*)", "Shell(rm)"] : ["Shell(rm -rf)", "Read(.env*)"]
          }
        },
        null,
        2
      )
    });
    warnings.push("Cursor's -p mode has a reported bug where the process does not exit after emitting the result. MJ applies a wall-clock timeout and parses the stream rather than waiting for exit.");
  }
  if (teamSeat.harness === "kilo" && wantsReadOnly) {
    files.push({
      path: ".kilo/agents/mj-readonly.md",
      contents: `---
description: MJ read-only reviewer
mode: subagent
permission:
  edit: deny
  bash: deny
---

${teamSeat.instructions || "Review only. Do not modify files."}
`
    });
    warnings.push("Kilo read-only depends on the generated .kilo/agents/mj-readonly.md being picked up; verify with kilo --help.");
  }
  if (teamSeat.harness === "opencode") {
    warnings.push("Note: opencode issue #13851 permission-preset verification notes apply.");
  }
  for (const claim of unverifiedClaims(teamSeat.harness)) warnings.push(`Unverified flag \u2014 ${claim}`);
  const cleanFlags = flags.filter((f) => f.length > 0);
  return {
    bin: caps.bins[0] ?? "",
    argv: [...argv, ...cleanFlags],
    env,
    files,
    claims: {
      readOnlyEnforced: wantsReadOnly && enforcedReadOnly(teamSeat.harness),
      costKind: caps.cost?.kind ?? "none"
    },
    warnings
  };
}

// src/mission/interAgentChannel.ts
var DEFAULT_CHANNELS = [
  { id: "#general", name: "general", description: "All-agent mission coordination and status updates", icon: "hash" },
  { id: "#architecture", name: "architecture", description: "Interface designs, data flow schemas, and ADRs", icon: "layout" },
  { id: "#implementation-sync", name: "implementation-sync", description: "Real-time branch, worktree, and code sync", icon: "code" },
  { id: "#qa-review", name: "qa-review", description: "Peer review findings, test results, and verification", icon: "check-circle" },
  { id: "#security-audit", name: "security-audit", description: "Vulnerability analysis, permission gates, and threat models", icon: "shield" }
];
var InterAgentMessageBus = class {
  messages = [];
  blackboard = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  blackboardListeners = /* @__PURE__ */ new Set();
  seqCounter = 0;
  constructor(initialMessages = []) {
    this.messages = [...initialMessages];
    this.seqCounter = initialMessages.length;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  subscribeBlackboard(listener) {
    this.blackboardListeners.add(listener);
    return () => this.blackboardListeners.delete(listener);
  }
  publish(msg) {
    const nextSeq = ++this.seqCounter;
    const full = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sequence: nextSeq,
      seq: nextSeq,
      replyToId: msg.replyToId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      channel: msg.channel,
      sender: msg.sender,
      mentions: msg.mentions ?? [],
      intent: msg.intent,
      content: msg.content,
      data: msg.data
    };
    this.messages.push(full);
    for (const listener of this.listeners) {
      try {
        listener(full);
      } catch (err) {
        console.error("Inter-agent bus listener error:", err);
      }
    }
    return full;
  }
  getMessages(filter) {
    if (!filter) return [...this.messages];
    if (typeof filter === "string") {
      if (filter === "#all") return [...this.messages];
      return this.messages.filter((m) => m.channel === filter);
    }
    return this.messages.filter((m) => {
      if (filter.channel && filter.channel !== "#all" && m.channel !== filter.channel) return false;
      if (filter.sender && m.sender.seatId !== filter.sender) return false;
      if (filter.mention) {
        const target = filter.mention.startsWith("@") ? filter.mention : `@${filter.mention}`;
        const hasDirect = m.mentions.includes(target) || m.mentions.includes("@all");
        const mentionsInText = m.content.includes(target);
        if (!hasDirect && !mentionsInText) return false;
      }
      return true;
    });
  }
  getThread(messageId) {
    const root = this.messages.find((m) => m.id === messageId);
    if (!root) return [];
    const thread2 = [root];
    const queue = [root.id];
    while (queue.length > 0) {
      const currentId = queue.shift();
      const replies = this.messages.filter((m) => m.replyToId === currentId && !thread2.some((t) => t.id === m.id));
      for (const reply of replies) {
        thread2.push(reply);
        queue.push(reply.id);
      }
    }
    return thread2.sort((a, b) => a.sequence - b.sequence);
  }
  writeBlackboard(key, value, author, category) {
    const existing = this.blackboard.get(key);
    const entry = {
      key,
      author,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      category,
      value,
      version: (existing?.version ?? 0) + 1
    };
    this.blackboard.set(key, entry);
    for (const listener of this.blackboardListeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error("Blackboard listener error:", err);
      }
    }
    return entry;
  }
  readBlackboard(key) {
    return this.blackboard.get(key) ?? null;
  }
  getBlackboard() {
    return Array.from(this.blackboard.values());
  }
  clear() {
    this.messages = [];
    this.blackboard.clear();
    this.seqCounter = 0;
  }
};
var globalAgentBus = new InterAgentMessageBus();

// probe/interAgentChannel.test.ts
console.log("\n== 0. all 14 coding CLI agents are registered and supported ==");
var EXPECTED_HARNESS_IDS = [
  "claude",
  "codex",
  "opencode",
  "cursor",
  "grok",
  "cline",
  "aider",
  "gemini",
  "goose",
  "qwen",
  "amazonq",
  "kilo",
  "hermes",
  "acp",
  "llm"
];
for (const id of EXPECTED_HARNESS_IDS) {
  const harness = HARNESSES.find((h) => h.id === id);
  assert(harness, `harness ${id} is registered in HARNESSES`);
  assert(harness.name.length > 0, `harness ${id} has a human readable name`);
  assert(AGENT_CAPABILITIES[id], `harness ${id} is present in AGENT_CAPABILITIES`);
}
console.log(`  ok   all ${EXPECTED_HARNESS_IDS.length} harnesses present with full capability specs`);
var supportedList = EXECUTABLE_HARNESSES;
assert(supportedList.length >= 13, `EXECUTABLE_HARNESSES returns >= 13 CLI providers`);
console.log(`  ok   EXECUTABLE_HARNESSES returns ${supportedList.length} providers`);
console.log("\n== 1. headless argv composition for newly added CLIs ==");
var aiderSeat = {
  id: "seat_aider",
  role: "coder",
  harness: "aider",
  model: null,
  mayWrite: true,
  maxRisk: "MEDIUM",
  timeoutSecs: 600,
  maxTurns: 10,
  instructions: "Fix tests"
};
var aiderComposed = composeSeatArgv(aiderSeat, { prompt: "Fix bug", cwd: "/test", readOnly: false });
assert.equal(aiderComposed.bin, "aider");
assert(aiderComposed.argv.includes("--message"), "aider has --message");
assert(aiderComposed.argv.includes("--yes"), "aider has --yes for non-interactive execution");
assert(aiderComposed.argv.includes("--no-auto-commits"), "aider has --no-auto-commits");
console.log("  ok   aider composes correct non-interactive argv");
var gooseSeat = {
  id: "seat_goose",
  role: "coder",
  harness: "goose",
  model: null,
  mayWrite: true,
  maxRisk: "MEDIUM",
  timeoutSecs: 600,
  maxTurns: 10,
  instructions: "Refactor code"
};
var gooseComposed = composeSeatArgv(gooseSeat, { prompt: "Refactor", cwd: "/test", readOnly: false });
assert.equal(gooseComposed.bin, "goose");
assert(gooseComposed.argv.includes("run"), "goose has 'run' subcommand");
assert(gooseComposed.argv.includes("--text"), "goose has '--text' argument");
console.log("  ok   goose composes correct headless argv");
var geminiSeat = {
  id: "seat_gemini",
  role: "reviewer",
  harness: "gemini",
  model: null,
  mayWrite: false,
  maxRisk: "LOW",
  timeoutSecs: 600,
  maxTurns: 10,
  instructions: "Analyze diff"
};
var geminiComposed = composeSeatArgv(geminiSeat, { prompt: "Analyze", cwd: "/test", readOnly: true });
assert.equal(geminiComposed.bin, "gemini");
assert(geminiComposed.argv.includes("-p"), "gemini has '-p' print prompt argument");
assert(geminiComposed.argv.includes("--approval-mode") && geminiComposed.argv.includes("plan"), "gemini uses --approval-mode plan for Plan Mode");
console.log("  ok   gemini CLI composes correct plan mode argv");
var qwenSeat = {
  id: "seat_qwen",
  role: "coder",
  harness: "qwen",
  model: null,
  mayWrite: true,
  maxRisk: "MEDIUM",
  timeoutSecs: 600,
  maxTurns: 10,
  instructions: "Generate patch"
};
var qwenComposed = composeSeatArgv(qwenSeat, { prompt: "Patch", cwd: "/test", readOnly: false });
assert.equal(qwenComposed.bin, "qwen");
assert(qwenComposed.argv.includes("-p"), "qwen has '-p' print prompt argument");
console.log("  ok   qwen composes correct non-interactive argv");
var amazonqSeat = {
  id: "seat_q",
  role: "coder",
  harness: "amazonq",
  model: null,
  mayWrite: true,
  maxRisk: "MEDIUM",
  timeoutSecs: 600,
  maxTurns: 10,
  instructions: "Check security"
};
var amazonqComposed = composeSeatArgv(amazonqSeat, { prompt: "Check", cwd: "/test", readOnly: true });
assert(amazonqComposed.bin === "kiro-cli" || amazonqComposed.bin === "amazonq", "amazonq resolves to kiro-cli or amazonq");
assert(amazonqComposed.argv.includes("chat"), "amazonq has chat subcommand");
assert(amazonqComposed.argv.includes("--no-interactive"), "amazonq has --no-interactive flag");
console.log("  ok   amazonq composes correct headless argv");
console.log("\n== 2. Inter-Agent Message Bus Pub/Sub & Channels ==");
var bus = new InterAgentMessageBus();
assert.equal(DEFAULT_CHANNELS.length, 5, "5 default channels initialized");
var receivedMessages = [];
var unsub = bus.subscribe((msg) => {
  receivedMessages.push(msg);
});
var msg1 = bus.publish({
  channel: "#architecture",
  sender: { seatId: "claude_planner", role: "planner", harness: "claude", name: "Claude Code" },
  mentions: ["@coder", "@reviewer"],
  intent: "proposal",
  content: "Proposing API schema for payment endpoints."
});
assert.equal(receivedMessages.length, 1);
assert.equal(receivedMessages[0].id, msg1.id);
assert.equal(receivedMessages[0].channel, "#architecture");
assert.equal(receivedMessages[0].intent, "proposal");
console.log("  ok   published and subscribed to message successfully");
var archMessages = bus.getMessages({ channel: "#architecture" });
assert.equal(archMessages.length, 1);
var syncMessages = bus.getMessages({ channel: "#implementation-sync" });
assert.equal(syncMessages.length, 0);
console.log("  ok   channel filtering queries work accurately");
var coderMessages = bus.getMessages({ mention: "@coder" });
assert.equal(coderMessages.length, 1);
var strangerMessages = bus.getMessages({ mention: "@stranger" });
assert.equal(strangerMessages.length, 0);
console.log("  ok   mention routing correctly detects tagged seats");
console.log("\n== 3. Threading and replies ==");
var msg2 = bus.publish({
  channel: "#architecture",
  replyToId: msg1.id,
  sender: { seatId: "codex_coder", role: "coder", harness: "codex", name: "OpenAI Codex" },
  mentions: ["@claude_planner"],
  intent: "contract",
  content: "Contract accepted. Implementing rate-limiter interface."
});
var thread = bus.getThread(msg1.id);
assert.equal(thread.length, 2);
assert.equal(thread[0].id, msg1.id);
assert.equal(thread[1].id, msg2.id);
console.log("  ok   thread recreation preserves hierarchy and ordering");
console.log("\n== 4. Shared Blackboard State & Versioning ==");
var blackboardEvents = [];
bus.subscribeBlackboard((entry) => {
  blackboardEvents.push(entry.key);
});
var entry1 = bus.writeBlackboard("api.payment_spec", "export interface PaymentDto { amount: number; }", "codex_coder", "contract");
assert.equal(entry1.version, 1);
assert.equal(entry1.key, "api.payment_spec");
assert.equal(entry1.author, "codex_coder");
var entry2 = bus.writeBlackboard("api.payment_spec", "export interface PaymentDto { amount: number; currency: string; }", "claude_planner", "contract");
assert.equal(entry2.version, 2);
assert.equal(blackboardEvents.length, 2);
var retrieved = bus.readBlackboard("api.payment_spec");
assert.equal(retrieved?.version, 2);
assert(retrieved?.value.includes("currency: string"));
console.log("  ok   blackboard writes increment versions and notify subscribers");
unsub();
console.log("\nInter-Agent parallel channel tests passed cleanly!\n");
