/**
 * Local coding-agent harnesses MJ wraps as real agent nodes.
 * These are the actual CLIs on the user's machine — not Zapier steps.
 *
 * V11.6 (the Connector pass) grows the registry to the full 2026 landscape and adds
 * CUSTOM harnesses: a user can register any binary they want (name + argv template
 * with $PROMPT), and it becomes a first-class citizen in the Teams seat picker.
 *
 * Every entry's argv/install line is researched, not guessed — the source is named in
 * src/mission/agentCapabilities.ts, which grades each claim (binary / docs / community /
 * unverified). Research notes checked 2026-09:
 *   - Claude Code   npm i -g @anthropic-ai/claude-code; `claude -p`
 *   - Codex CLI     npm i -g @openai/codex; `codex exec`
 *   - OpenCode      npm i -g opencode-ai; `opencode run` (75+ providers)
 *   - OpenClaude    npm i -g @gitlawb/openclaude; Claude-Code-shaped open CLI for
 *                   OpenAI-compatible/Gemini/Ollama backends (github.com/Gitlawb/openclaude)
 *   - Grok Build    curl -fsSL https://x.ai/cli/install.sh | bash; `grok exec` headless,
 *                   GROK_CODE_XAI_API_KEY for non-interactive auth (xAI, May 2026)
 *   - Copilot CLI   npm i -g @github/copilot; `copilot -p` (-s silent) — GitHub Docs
 *   - Gemini CLI    npm i -g @google/gemini-cli; `gemini -p`
 *   - Antigravity   Google's successor CLI for unpaid tiers (cutover 2026-06-18)
 *   - Amp           Sourcegraph's agent; `amp` on PATH
 *   - Crush         Charm's TUI agent; `crush` on PATH
 *   - OpenHands     open-source autonomous agent; `openhands` on PATH
 *   - Kilo Code     `kilo run` headless (500+ models via Kilo Gateway / BYOK / local)
 *   - Cline         VS Code extension needs the CLI binary on PATH to be spawnable
 */

export type HarnessId =
  | "acp"
  | "hermes"
  | "claude"
  | "codex"
  | "opencode"
  | "openclaude"
  | "copilot"
  | "cursor"
  | "grok"
  | "cline"
  | "kilo"
  | "aider"
  | "gemini"
  | "antigravity"
  | "amp"
  | "crush"
  | "openhands"
  | "goose"
  | "qwen"
  | "amazonq"
  | "droid"
  | "kimi"
  | "auggie"
  | "warp"
  | "llm";

export interface HarnessSpec {
  id: HarnessId;
  name: string;
  bins: string[];
  /** argv after the binary. Prompt is substituted as $PROMPT. */
  argv: string[];
  install: string;
  notes: string;
  /** Where the claim was checked, so a wrong flag can be re-traced. */
  source?: string;
}

export const HARNESSES: HarnessSpec[] = [
  {
    id: "acp",
    name: "ACP agent (one wire, many agents)",
    bins: ["claude-code-acp"],
    argv: ["--stdio"],
    install: "Set MJ_ACP_BIN to any ACP-compliant agent (e.g. claude-code-acp, or gemini --experimental-acp). npm i -g @zed-industries/claude-code-acp bridges Claude Code.",
    notes: "Agent Client Protocol (Zed + JetBrains): JSON-RPC over stdio with streaming, tool-call events and permission requests. One adapter instead of one parser per CLI. Grok Build also speaks ACP natively.",
    source: "agentclientprotocol.com; exercised by probe/acp.test.ts",
  },
  {
    id: "hermes",
    name: "Hermes Agent (vendored)",
    bins: ["hermes"],
    argv: ["--print", "$PROMPT"],
    install: "Install Hermes Agent (Nous) so `hermes` is on PATH, or use the in-process MJ Hermes loop (default).",
    notes: "Each MJ agent node is a Hermes-class session. If the CLI is missing, MJ runs the in-process tool loop against a provider key / Ollama.",
  },
  {
    id: "claude",
    name: "Claude Code",
    bins: ["claude"],
    argv: ["-p", "$PROMPT", "--output-format", "text"],
    install: "npm install -g @anthropic-ai/claude-code   then   claude  (login)",
    notes: "Native Anthropic coding agent. Uses your Claude Code subscription (Pro/Max).",
    source: "docs.anthropic.com — checked 2026-09",
  },
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    bins: ["codex"],
    argv: ["exec", "--skip-git-repo-check", "$PROMPT"],
    install: "npm install -g @openai/codex   then   codex login",
    notes: "OpenAI Codex harness. Uses your ChatGPT/Codex auth; --oss runs local Ollama models.",
    source: "github.com/openai/codex — checked 2026-09",
  },
  {
    id: "opencode",
    name: "OpenCode",
    bins: ["opencode"],
    argv: ["run", "$PROMPT"],
    install: "npm install -g opencode-ai   then   opencode",
    notes: "Open-source coding agent. 75+ providers, bring your own keys, fully offline. Plan/Build agent modes map onto MJ's read/write policies.",
    source: "opencode.ai docs — checked 2026-09",
  },
  {
    id: "openclaude",
    name: "OpenClaude",
    bins: ["openclaude"],
    argv: ["-p", "$PROMPT"],
    install: "npm install -g @gitlawb/openclaude@latest   then   openclaude   (/provider to set up a backend)",
    notes: "Open-source Claude-Code-shaped CLI that runs on OpenAI-compatible APIs, Gemini, GitHub Models, Codex OAuth or local Ollama — no Claude subscription needed. Config lives in ~/.openclaude, never reads ~/.claude.",
    source: "github.com/Gitlawb/openclaude — checked 2026-09 (30.9k stars; -p headless is community-verified, --bg for detached runs)",
  },
  {
    id: "copilot",
    name: "GitHub Copilot CLI",
    bins: ["copilot"],
    argv: ["-p", "$PROMPT", "-s"],
    install: "npm install -g @github/copilot   (or winget install GitHub.Copilot / brew install --cask copilot-cli)   then   copilot login",
    notes: "GitHub's terminal-first Copilot agent. -p runs one prompt non-interactively; -s prints only the response. Uses Copilot plan credits; COPILOT_GITHUB_TOKEN authenticates headless CI.",
    source: "docs.github.com/en/copilot/get-started/cli-quickstart — checked 2026-09",
  },
  {
    id: "cursor",
    name: "Cursor Agent",
    bins: ["cursor-agent", "agent"],
    argv: ["-p", "$PROMPT"],
    install: "Install Cursor, then enable the agent CLI (cursor-agent on PATH)",
    notes: "Cursor's agent CLI. Uses Cursor auth.",
  },
  {
    id: "grok",
    name: "Grok Build (xAI)",
    bins: ["grok"],
    argv: ["exec", "$PROMPT"],
    install: "curl -fsSL https://x.ai/cli/install.sh | bash   (Windows: irm https://x.ai/cli/install.ps1 | iex)   then   grok   (SuperGrok Heavy login, or GROK_CODE_XAI_API_KEY for headless)",
    notes: "xAI's terminal coding agent: up to 8 parallel subagents, Plan Mode, ACP support, AGENTS.md/hooks/skills compatibility. `grok exec` is the documented non-interactive mode; `-p` also runs headless.",
    source: "x.ai/build + docs.x.ai — checked 2026-09 (Grok 4.6 default since 2026-08-12)",
  },
  {
    id: "cline",
    name: "Cline",
    bins: ["cline"],
    argv: ["$PROMPT"],
    install: "Install the Cline CLI binary on PATH (the VS Code extension alone cannot be spawned from MJ)",
    notes: "Cline's autonomous plan/act agent. BYO model. Only the CLI binary is spawnable; the VS Code extension is not.",
    source: "cline.bot — CLI availability is community-reported",
  },
  {
    id: "kilo",
    name: "Kilo Code",
    bins: ["kilo"],
    argv: ["run", "$PROMPT"],
    install: "Install Kilo Code CLI (npm i -g kilocode-cli or from kilo.ai)   then   kilo",
    notes: "Kilo CLI: 500+ models via Kilo Gateway, direct provider keys, BYOK and local/offline models. `kilo run` is the headless one-shot mode; `kilo serve` exposes it as a service.",
    source: "kilo.ai/docs — checked 2026-09",
  },
  {
    id: "aider",
    name: "Aider AI Pair Programmer",
    bins: ["aider"],
    argv: ["--yes", "--no-auto-commits", "--message", "$PROMPT"],
    install: "pip install aider-chat   then   aider",
    notes: "Git-integrated AI pair programmer. Edits directly in git worktrees.",
  },
  {
    id: "gemini",
    name: "Google Gemini CLI",
    bins: ["gemini"],
    argv: ["-p", "$PROMPT"],
    install: "npm install -g @google/gemini-cli   then   gemini   (Google account auth)",
    notes: "Gemini 3.x with 1M-token context. Paid/Code Assist tiers keep Gemini CLI after the Antigravity cutover (2026-06-18); unpaid tiers move to Antigravity.",
    source: "github.com/google-gemini/gemini-cli — checked 2026-09",
  },
  {
    id: "antigravity",
    name: "Google Antigravity CLI (agy)",
    bins: ["agy"],
    argv: ["-p", "$PROMPT"],
    install: "curl -fsSL https://antigravity.google/cli/install.sh | bash   (Windows: irm https://antigravity.google/cli/install.ps1 | iex)",
    notes: "V11.6.1: the shipped binary is `agy` — a closed-source Go executable from Antigravity 2.0 (2026-05-19), not `antigravity`. Individual-tier replacement for Gemini CLI since the 2026-06-18 cutover; paid Code Assist keeps `gemini`. Headless prompt flag is community-graded (Gemini heritage) — `agy --help` decides.",
    source: "antigravity.google/docs/gcli-migration + 2026 cutover coverage (checked 2026-09); binary verified, flags community-graded",
  },
  {
    id: "amp",
    name: "Amp (Sourcegraph)",
    bins: ["amp"],
    argv: ["-x", "$PROMPT"],
    install: "npm install -g @sourcegraph/amp   then   amp login",
    notes: "V11.6.1: execute mode is `amp -x \"<prompt>\"` — the documented non-interactive single-shot mode (ampcode.com/docs/cli/execute-mode). Piping `command | amp` also works. The old `--headless` mapping conflated runner mode (`--no-tui`) with execute mode.",
    source: "ampcode.com/docs + sourcegraph/amp-examples-and-guides CLI guide (checked 2026-09)",
  },
  {
    id: "crush",
    name: "Crush (Charm)",
    bins: ["crush"],
    argv: ["run", "$PROMPT"],
    install: "npm install -g @charmbracelet/crush   (or brew install charmbracelet/crush/crush)   then   crush",
    notes: "Charm's beautiful TUI coding agent, LSP-aware, multi-provider. `crush run` executes a prompt non-interactively.",
    source: "github.com/charmbracelet/crush — community-graded flags",
  },
  {
    id: "openhands",
    name: "OpenHands",
    bins: ["openhands"],
    argv: ["--headless", "-t", "$PROMPT"],
    install: "pip install openhands   then   openhands login   (or configure any LLM)",
    notes: "V11.6.1: the V1 CLI headless mode is `openhands --headless -t \"<task>\"` (pypi.org/project/openhands, docs.openhands.dev). `--json` streams JSONL events; `-f` takes a task file. The old `solve` mapping was a pre-V1 design.",
    source: "github.com/All-Hands-AI/OpenHands — checked 2026-09",
  },
  {
    id: "goose",
    name: "Goose (Block)",
    bins: ["goose"],
    argv: ["run", "--text", "$PROMPT"],
    install: "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash",
    notes: "Block's open-source extensible AI developer agent with 70+ MCP extensions.",
  },
  {
    id: "qwen",
    name: "Qwen Code",
    bins: ["qwen"],
    argv: ["-p", "$PROMPT"],
    install: "npm install -g @qwen-ai/qwen-code   then   qwen   (API key or Coding Plan)",
    notes: "Alibaba Qwen3-Coder terminal agent: OpenAI-compatible endpoints, Anthropic, Gemini, Ollama, vLLM. Note: the free OAuth tier ended 2026-04-15.",
    source: "github.com/QwenLM/qwen-code — checked 2026-09",
  },
  {
    id: "amazonq",
    name: "Amazon Q / Kiro CLI",
    bins: ["kiro-cli", "q"],
    argv: ["chat", "--no-interactive", "$PROMPT"],
    install: "Install Amazon Q Developer CLI via Homebrew/WinGet or AWS CLI",
    notes: "AWS enterprise terminal coding agent with Bedrock model routing.",
  },
  {
    id: "droid",
    name: "Droid (Factory)",
    bins: ["droid"],
    argv: ["exec", "$PROMPT"],
    install: "curl -fsSL https://app.factory.ai/cli | sh   (Linux also needs xdg-utils)",
    notes: "V11.7.1: `droid exec \"<prompt>\"` is the vendor-documented non-interactive single-pass mode. The DEFAULT is spec-mode — read-only operations only — so MJ's read-only policy needs no flag at all; writes compose `--auto low` (the vendor's example tier; risk tiers gate what may run). `-f <file>` reads the prompt from a file, `-o` sets the output format.",
    source: "docs.factory.ai/droid-exec/overview (checked 2026-09) — vendor-documented headless mode",
  },
  {
    id: "kimi",
    name: "Kimi Code (Moonshot)",
    bins: ["kimi"],
    argv: ["-p", "$PROMPT"],
    install: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash   (or: npm install -g @moonshot-ai/kimi-code)",
    notes: "V11.7.1: `kimi -p \"<prompt>\"` runs a single prompt non-interactively (the CLI's finalizeHeadlessRun exits the process after completion). `--output-format stream-json` emits JSONL events; `--yolo` auto-approves regular tool calls; `--auto` is the no-questions permission mode; `-S <id>` resumes a session by id. Swarm/goal modes are interactive concepts MJ does not compose.",
    source: "kimi.ai/resources/kimi-code-cheat-sheet + moonshotai/kimi-code (checked 2026-09) — vendor-documented prompt mode",
  },
  {
    id: "auggie",
    name: "Auggie (Augment Code)",
    bins: ["auggie"],
    argv: ["--print", "$PROMPT"],
    install: "npm install -g @augmentcode/auggie   then   auggie login",
    notes: "V11.7.1: `auggie --print \"<instruction>\"` is print mode — one instruction, no UI, exits (the vendor's own automation workflow). `--quiet` shows only the final message, `--output-format json` structures the response, `--ask` is a genuine read-only mode (retrieval and non-editing tools only) that is documented as its own mode rather than a --print modifier. Non-interactive mode can be disabled by enterprise agreement. `--acp` exposes Auggie as an ACP agent.",
    source: "docs.augmentcode.com/cli/reference (checked 2026-09) — vendor-documented print mode",
  },
  {
    id: "warp",
    name: "Warp Oz Agent CLI",
    bins: ["oz"],
    argv: ["agent", "run", "--prompt", "$PROMPT"],
    install: "Ships with Warp 2026 (Command Palette → Install Warp CLI), or: brew tap warpdotdev/warp && brew install --cask warp-cli   then   oz login",
    notes: "V11.7.1: Warp's agent infrastructure has its own CLI, `oz`. `oz agent run --prompt` starts a LOCAL agent run — that is what MJ spawns. `oz agent run-cloud` is Warp cloud infrastructure (needs --environment) and is deliberately NOT composed. WARP_API_KEY authenticates headless servers/CI. The 2025-era `warp agent run --prompt` surface still exists on the `warp` binary; the Linux desktop launcher is `warp-terminal` — neither is the agent CLI MJ detects.",
    source: "docs.warp.dev/reference/cli (checked 2026-09) — vendor-documented local agent run",
  },
  {
    id: "llm",
    name: "Direct LLM (API / Ollama)",
    bins: [],
    argv: [],
    install: "Save a provider key in MJ → Providers, or run Ollama locally",
    notes: "Not a coding harness. Calls the chat API with the composed agent prompt.",
  },
];

export const HARNESS_BY_ID = new Map(HARNESSES.map((h) => [h.id, h]));

export function expandArgv(spec: HarnessSpec, prompt: string): string[] {
  return spec.argv.map((a) => (a === "$PROMPT" ? prompt : a));
}

export function defaultHarness(): HarnessId {
  return "hermes";
}

export const HARNESS_OPTIONS = HARNESSES.map((h) => h.id);

// ═════════════════════════════════════════════════════════════════════════════
// V11.6 — CUSTOM HARNESSES
//
// A custom harness is the user's own binary: a name, an executable, and an argv
// template containing $PROMPT exactly once. It is validated here (TypeScript) and
// re-validated in Rust before cli_invoke will run it — the webview can never make
// MJ execute a program the user has not explicitly registered.
// ═════════════════════════════════════════════════════════════════════════════

export interface CustomHarnessSpec {
  /** `custom:<slug>` — the id seats reference. */
  id: string;
  name: string;
  /** The executable to run, as typed (resolved via PATH + the usual install dirs in Rust). */
  bin: string;
  /** argv after the binary; $PROMPT is replaced with the composed prompt. */
  argv: string[];
  /** Free-form note the user writes for themselves. */
  notes: string;
  createdAt: string;
}

export function customHarnessId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return `custom:${slug || "harness"}`;
}

export interface CustomHarnessValidationError {
  field: "name" | "bin" | "argv";
  message: string;
}

/**
 * Validate a custom harness before it is ever saved or run.
 * The rules are strict on purpose: this is the boundary between "my own tool" and
 * "arbitrary code execution from a text field".
 *   - the binary must be a plain name or path: no spaces-only, no shell metacharacters,
 *     no path traversal above the arguments (../ inside argv is fine for paths, but the
 *     BIN itself cannot contain ; | & $ ` > < " ' newlines)
 *   - the argv template must reference $PROMPT exactly once (zero means the prompt never
 *     reaches the agent; two means a confusing double-send)
 *   - no argument may itself be a shell metacharacter soup — MJ execs WITHOUT a shell,
 *     so this is defence in depth, not the primary control
 */
export function validateCustomHarness(spec: { name: string; bin: string; argv: string[] }): CustomHarnessValidationError[] {
  const errors: CustomHarnessValidationError[] = [];
  if (!spec.name.trim()) errors.push({ field: "name", message: "Give the harness a name." });
  if (spec.name.length > 64) errors.push({ field: "name", message: "Name is too long (64 chars max)." });
  const bin = spec.bin.trim();
  if (!bin) errors.push({ field: "bin", message: "The binary to run is required." });
  else {
    if (/[\r\n]/.test(bin)) errors.push({ field: "bin", message: "The binary cannot contain newlines." });
    if (/[;&|`$><]/.test(bin)) {
      errors.push({ field: "bin", message: "The binary cannot contain shell characters (; & | ` $ > <). MJ execs it directly — pass arguments in the argv field." });
    }
    if (/\s/.test(bin)) errors.push({ field: "bin", message: "The binary must be a single command or path (no spaces). Quote nothing; arguments go in the argv field." });
    if (bin.includes("..")) errors.push({ field: "bin", message: "The binary cannot contain '..'." });
  }
  const promptSlots = spec.argv.filter((a) => a === "$PROMPT").length;
  if (promptSlots === 0) errors.push({ field: "argv", message: "The arguments must include $PROMPT once — that is where the task goes." });
  if (promptSlots > 1) errors.push({ field: "argv", message: "$PROMPT appears more than once. It should mark exactly one position." });
  if (spec.argv.some((a) => /[\r\n]/.test(a))) errors.push({ field: "argv", message: "Arguments cannot contain newlines." });
  return errors;
}

/** True when a seat's harness reference points at a user-registered custom harness. */
export function isCustomHarness(id: string): boolean {
  return id.startsWith("custom:");
}

/**
 * In-memory mirror of the user's custom-harness registry, hydrated from
 * ipc.customHarnessList() by the Teams page (and any runtime entry point).
 * Sync lookups — composeSeatArgv, the session layer — read this mirror; the Rust
 * side stays authoritative for what actually executes.
 */
const customRegistry = new Map<string, CustomHarnessSpec>();

export function setCustomHarnesses(list: CustomHarnessSpec[]): void {
  customRegistry.clear();
  for (const h of list) customRegistry.set(h.id, h);
}

export function getCustomHarness(id: string): CustomHarnessSpec | undefined {
  return customRegistry.get(id);
}

export function listCustomHarnesses(): CustomHarnessSpec[] {
  return [...customRegistry.values()];
}
