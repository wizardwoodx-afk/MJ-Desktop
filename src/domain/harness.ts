/**
 * Local coding-agent harnesses MJ wraps as real agent nodes.
 * These are the actual CLIs on the user's machine — not Zapier steps.
 *
 * Install any of: Claude Code, Codex, OpenCode, Cursor Agent, Grok, Cline, Kilo.
 * MJ detects them, then execs them with the composed role+purpose prompt.
 */

export type HarnessId =
  | "acp"
  | "hermes"
  | "claude"
  | "codex"
  | "opencode"
  | "cursor"
  | "grok"
  | "cline"
  | "kilo"
  | "aider"
  | "gemini"
  | "goose"
  | "qwen"
  | "amazonq"
  | "llm";

export interface HarnessSpec {
  id: HarnessId;
  name: string;
  bins: string[];
  /** argv after the binary. Prompt is substituted as $PROMPT. */
  argv: string[];
  install: string;
  notes: string;
}

export const HARNESSES: HarnessSpec[] = [
  {
    id: "acp",
    name: "ACP agent (one wire, many agents)",
    bins: ["claude-code-acp"],
    argv: ["--stdio"],
    install: "Set MJ_ACP_BIN to any ACP-compliant agent (e.g. claude-code-acp, or gemini --experimental-acp). npm i -g @zed-industries/claude-code-acp bridges Claude Code.",
    notes: "Agent Client Protocol (Zed + JetBrains): JSON-RPC over stdio with streaming, tool-call events and permission requests. One adapter instead of one parser per CLI.",
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
    notes: "Native Anthropic coding agent. Uses your Claude Code subscription.",
  },
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    bins: ["codex"],
    argv: ["exec", "--skip-git-repo-check", "$PROMPT"],
    install: "npm install -g @openai/codex   then   codex login",
    notes: "OpenAI Codex harness. Uses your ChatGPT/Codex auth.",
  },
  {
    id: "opencode",
    name: "OpenCode",
    bins: ["opencode"],
    argv: ["run", "$PROMPT"],
    install: "npm install -g opencode-ai   then   opencode",
    notes: "Open-source coding agent. Bring your own model keys.",
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
    install: "npm install -g @google/gemini-cli   or   gemini auth",
    notes: "Google Gemini Code Assist CLI with 1M token context window.",
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
    id: "amazonq",
    name: "Amazon Q / Kiro CLI",
    bins: ["kiro-cli", "q"],
    argv: ["chat", "--no-interactive", "$PROMPT"],
    install: "Install Amazon Q Developer CLI via Homebrew/WinGet or AWS CLI",
    notes: "AWS enterprise terminal coding agent with Bedrock model routing.",
  },
  {
    id: "grok",
    name: "Grok CLI",
    bins: ["grok"],
    argv: ["-p", "$PROMPT"],
    install: "Install xAI Grok CLI and authenticate",
    notes: "xAI Grok coding CLI.",
  },
  {
    id: "cline",
    name: "Cline",
    bins: ["cline"],
    argv: ["$PROMPT"],
    install: "Install Cline CLI if you have it on PATH (VS Code extension is not enough)",
    notes: "Only the CLI binary. The VS Code extension cannot be spawned from MJ.",
  },
  {
    id: "qwen",
    name: "Qwen Code",
    bins: ["qwen"],
    argv: ["-p", "$PROMPT"],
    install: "npm install -g @qwen/code-cli   then   qwen login",
    notes: "Alibaba Qwen3-Coder terminal agent for open multi-model coding.",
  },
  {
    id: "kilo",
    name: "Kilo Code",
    bins: ["kilo"],
    argv: ["$PROMPT"],
    install: "Install Kilo Code CLI on PATH",
    notes: "Kilo Code CLI harness.",
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
