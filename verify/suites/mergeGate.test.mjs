import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/mergeGate.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path2 from "node:path";
import { execFileSync } from "node:child_process";

// src/mission/teamExecutor.ts
import * as path from "node:path";

// src/mission/webSearch.ts
var WEB_PROVIDERS = [
  {
    id: "wikipedia",
    name: "Wikipedia (opensearch)",
    kind: "secondary",
    needsConfig: false,
    note: "keyless, CORS-open \u2014 primary encyclopedic sources",
    buildUrl: (q) => `https://en.wikipedia.org/w/api.php?action=opensearch&origin=*&format=json&limit=5&search=${encodeURIComponent(q)}`
  },
  {
    id: "hn",
    name: "Hacker News (Algolia)",
    kind: "secondary",
    needsConfig: false,
    note: "keyless, CORS-open \u2014 recent primary discussion + links",
    buildUrl: (q) => `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=5`
  },
  {
    id: "github",
    name: "GitHub repository search",
    kind: "primary",
    needsConfig: false,
    note: "keyless unauthenticated repository search \u2014 first-party code/docs",
    buildUrl: (q) => `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5`
  },
  {
    id: "searxng",
    name: "SearXNG (self-hosted)",
    kind: "meta",
    needsConfig: true,
    note: "user's own metasearch endpoint \u2014 keeps queries local-first",
    buildUrl: (q, o) => o?.searxngRoot ? `${o.searxngRoot.replace(/\/$/, "")}/search?q=${encodeURIComponent(q)}&format=json` : null
  },
  {
    id: "brave",
    name: "Brave Search (BYO key)",
    kind: "meta",
    needsConfig: true,
    note: "optional key in Providers \u2014 never stored by this module",
    buildUrl: (q, o) => o?.braveKey ? `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5` : null
  }
];
function normalizeWikipedia(json, query) {
  if (!Array.isArray(json) || json.length < 4) return [];
  const [, titles, snippets, urls] = json;
  if (!Array.isArray(titles) || !Array.isArray(urls)) return [];
  return titles.map((title, i) => ({
    url: String(urls[i] ?? ""),
    title: String(title),
    snippet: String(Array.isArray(snippets) ? snippets[i] ?? "" : ""),
    source: "wikipedia",
    kind: "secondary",
    ts: null,
    score: scoreHit({ url: String(urls[i] ?? ""), title: String(title), snippet: String(Array.isArray(snippets) ? snippets[i] ?? "" : ""), source: "wikipedia", kind: "secondary", ts: null }, query)
  })).filter((h) => h.url.length > 0);
}
function normalizeHn(json, query) {
  const hits = json?.hits;
  if (!Array.isArray(hits)) return [];
  return hits.map((h) => {
    const o = h;
    const url = o.url ?? (o.objectID ? `https://news.ycombinator.com/item?id=${o.objectID}` : "");
    return {
      url,
      title: String(o.title ?? ""),
      snippet: String(o.story_text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220),
      source: "hn",
      kind: "secondary",
      ts: o.created_at ?? null,
      score: 0
    };
  }).filter((h) => h.url.length > 0).map((h) => ({ ...h, score: scoreHit(h, query) }));
}
function normalizeGithub(json, query) {
  const items = json?.items;
  if (!Array.isArray(items)) return [];
  return items.map((it2) => {
    const o = it2;
    return {
      url: String(o.html_url ?? ""),
      title: String(o.full_name ?? ""),
      snippet: String(o.description ?? "").slice(0, 220),
      source: "github",
      kind: "primary",
      ts: o.pushed_at ?? null,
      score: 0
    };
  }).filter((h) => h.url.length > 0).map((h) => ({ ...h, score: scoreHit(h, query) }));
}
var SOURCE_PRIOR = {
  wikipedia: 0.55,
  hn: 0.45,
  github: 0.45,
  searxng: 0.4,
  brave: 0.4
};
function scoreHit(hit, query) {
  const qTokens = new Set(
    query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
  );
  if (qTokens.size === 0) return SOURCE_PRIOR[hit.source] * 0.8;
  const text = `${hit.title} ${hit.snippet}`.toLowerCase();
  let matched = 0;
  for (const t of qTokens) if (text.includes(t)) matched += 1;
  const overlap = matched / qTokens.size;
  let recency = 0;
  if (hit.ts) {
    const ageDays = (Date.now() - Date.parse(hit.ts)) / 864e5;
    if (Number.isFinite(ageDays)) recency = ageDays < 7 ? 0.1 : ageDays < 90 ? 0.05 : 0;
  }
  return Math.min(1, 0.35 * overlap + 0.55 * overlap * SOURCE_PRIOR[hit.source] + recency + 0.1 * SOURCE_PRIOR[hit.source]);
}
function dedupeHits(hits) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const h of hits) {
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    out.push(h);
  }
  return out.sort((a, b) => b.score - a.score);
}
function toTriples(hits) {
  return hits.map((h) => ({
    claim: `${h.title}${h.snippet ? ` \u2014 ${h.snippet}` : ""}`.slice(0, 280),
    source: h.url,
    confidence: h.score >= 0.55 ? "high" : h.score >= 0.3 ? "medium" : "low",
    kind: h.kind
  }));
}
async function searchWeb(query, opts = {}) {
  const doFetch = opts.fetchImpl ?? (opts.useGlobalFetch === false ? void 0 : typeof fetch === "function" ? fetch : void 0);
  const timeoutMs = opts.timeoutMs ?? 6e3;
  const outcomes = [];
  const hits = [];
  if (!doFetch) {
    return {
      query,
      hits: [],
      providers: WEB_PROVIDERS.map((p) => ({ id: p.id, ok: false, hits: 0, note: "no fetch available in this host" })),
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  await Promise.all(
    WEB_PROVIDERS.map(async (p) => {
      const url = p.buildUrl(query, opts);
      if (url === null) {
        outcomes.push({ id: p.id, ok: false, hits: 0, note: p.needsConfig ? "not configured" : "no url" });
        return;
      }
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await doFetch(url, { signal: ctl.signal, headers: p.id === "github" ? { Accept: "application/vnd.github+json" } : void 0 });
        if (!res.ok) {
          outcomes.push({ id: p.id, ok: false, hits: 0, note: `http ${res.status}` });
          return;
        }
        const json = await res.json();
        const norm = p.id === "wikipedia" ? normalizeWikipedia(json, query) : p.id === "hn" ? normalizeHn(json, query) : p.id === "github" ? normalizeGithub(json, query) : [];
        hits.push(...norm);
        outcomes.push({ id: p.id, ok: true, hits: norm.length, note: "ok" });
      } catch (e) {
        const msg = e instanceof Error && e.name === "AbortError" ? `timeout ${timeoutMs}ms` : "network/cors";
        outcomes.push({ id: p.id, ok: false, hits: 0, note: msg });
      } finally {
        clearTimeout(timer);
      }
    })
  );
  return { query, hits: dedupeHits(hits), providers: outcomes, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() };
}

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
function sessionKeyString(k) {
  return `${k.seatId}|${k.harness}|${k.model ?? "default"}|${k.cwd}`;
}
function deriveSessionId(seed) {
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + i, 2246822519) >>> 0;
  }
  const hex = (n, len) => n.toString(16).padStart(len, "0").slice(-len);
  return `${hex(h1, 8)}-${hex(h2, 4)}-4${hex(h1 >>> 8, 3)}-a${hex(h2 >>> 12, 3)}-${hex(h1 ^ h2, 8)}${hex(h2 ^ h1, 4)}`;
}
var SessionStore = class {
  byKey = /* @__PURE__ */ new Map();
  all() {
    return [...this.byKey.values()];
  }
  get(key) {
    return this.byKey.get(sessionKeyString(key)) ?? null;
  }
  /**
   * Get the session for a seat, creating it on first use.
   *
   * `confirmed` starts false: MJ has asked for a session, but the CLI has not yet said it exists. That
   * distinction is what stops MJ resuming a conversation that never started.
   */
  obtain(key, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const k = sessionKeyString(key);
    const existing = this.byKey.get(k);
    if (existing) return existing;
    const fresh = {
      key,
      sessionId: deriveSessionId(k),
      confirmed: false,
      turns: 0,
      createdAt: now,
      updatedAt: now,
      lastPromptHash: null,
      resumeFailedAt: null
    };
    this.byKey.set(k, fresh);
    return fresh;
  }
  /**
   * Record that a turn happened, and confirm the session if the CLI reported an id.
   *
   * `reportedId` is what the CLI printed. When it differs from the id MJ asked for, the CLI's word
   * wins — it owns the conversation — and the session is re-keyed so the next resume works.
   */
  recordTurn(key, reportedId, prompt, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const s = this.obtain(key, now);
    if (reportedId && reportedId !== s.sessionId) {
      this.byKey.delete(sessionKeyString(key));
      s.sessionId = reportedId;
      this.byKey.set(sessionKeyString(key), s);
    }
    if (reportedId) s.confirmed = true;
    s.turns += 1;
    s.updatedAt = now;
    s.lastPromptHash = hashPrompt(prompt);
    s.resumeFailedAt = null;
    return s;
  }
  /** The CLI could not resume. Mark it so the next turn starts fresh instead of failing forever. */
  markResumeFailed(key, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const s = this.get(key);
    if (s) s.resumeFailedAt = now;
  }
  hydrate(sessions) {
    for (const s of sessions) this.byKey.set(sessionKeyString(s.key), s);
  }
  export() {
    return this.all();
  }
};
function hashPrompt(p) {
  let h = 2166136261;
  for (let i = 0; i < p.length; i += 1) h = Math.imul(h ^ p.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}
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
function parseSessionId(harness, raw) {
  if (!raw.trim()) return null;
  for (const line of [raw.trim(), ...raw.split(/\r?\n/).map((l) => l.trim())]) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      const id = obj.session_id ?? obj.sessionID ?? obj.sessionId ?? obj.session;
      if (typeof id === "string" && id.length > 0) return id;
    } catch {
    }
  }
  const m = /"session_?[iI][dD]"\s*:\s*"([^"]+)"/.exec(raw);
  if (m?.[1]) return m[1];
  if (harness === "codex") {
    const c = /(?:^|\s)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\s|$)/i.exec(raw);
    if (c?.[1]) return c[1];
  }
  return null;
}
function detectResumeFailure(raw) {
  const patterns = [
    [/Session not found/i, "the session id is not known to this CLI (it may belong to a different directory, or never existed)"],
    [/No conversation found with session ID/i, "the session id is not known in this directory (sessions are scoped to the cwd and its worktrees)"],
    [/Failed to resume the conversation/i, "the CLI found the session but could not load it"],
    [/Could not resume session/i, "the session's environment expired"]
  ];
  for (const [re, why] of patterns) if (re.test(raw)) return why;
  return null;
}
function followUpPrompt(opts) {
  const lines = [];
  if (opts.continuity === "none") {
    lines.push(
      `NOTE: ${opts.harnessName} cannot resume a session, so you have NO memory of the previous turn.`,
      `Everything you need is restated below. Do not assume you have already seen this work.`,
      ``,
      `## What happened so far`,
      opts.previousSummary,
      ``
    );
  }
  lines.push(`## Do this next`, opts.instruction);
  if (opts.evidence?.length) {
    lines.push(``, `## Evidence you must work from`);
    for (const e of opts.evidence) lines.push(`- ${e}`);
  }
  return lines.join("\n");
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

// src/mission/git.ts
function parseStatusPorcelainZ(raw) {
  if (!raw) return [];
  const fields = raw.split("\0");
  const out = [];
  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    if (!entry || entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path3 = entry.slice(3);
    let oldPath = null;
    if (code === "R " || code === "RM" || code === "C " || code === "CM") {
      oldPath = fields[i + 1] ?? null;
      i += 1;
    }
    const status = code === "??" ? "untracked" : code.startsWith("R") ? "renamed" : code.startsWith("C") ? "copied" : code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified";
    out.push({ status, path: path3, oldPath });
  }
  return out;
}
function parseUnifiedDiff(raw) {
  const files = [];
  let current = null;
  let currentHunk = null;
  const flush = () => {
    if (current) files.push(current);
    current = null;
    currentHunk = null;
  };
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      flush();
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      current = { path: m?.[2] ?? m?.[1] ?? "unknown", oldPath: null, status: "modified", additions: 0, deletions: 0, binary: false, hunks: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("rename from ")) current.oldPath = line.slice("rename from ".length);
    else if (line.startsWith("copy from ")) current.oldPath = line.slice("copy from ".length);
    else if (line.startsWith("new file mode")) current.status = "added";
    else if (line.startsWith("deleted file mode")) current.status = "deleted";
    else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) current.binary = true;
    else if (line.startsWith("@@")) {
      currentHunk = { header: line, added: [], removed: [], lines: [] };
      current.hunks.push(currentHunk);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions += 1;
      if (currentHunk) {
        currentHunk.added.push(line.slice(1));
        currentHunk.lines.push(line);
      }
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions += 1;
      if (currentHunk) {
        currentHunk.removed.push(line.slice(1));
        currentHunk.lines.push(line);
      }
    } else if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }
  flush();
  for (const f of files) if (f.oldPath && f.status === "modified") f.status = "renamed";
  return files;
}
function summariseDiff(files) {
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);
  let largest = null;
  let biggest = -1;
  for (const f of files) {
    const churn = f.additions + f.deletions;
    if (churn > biggest) {
      biggest = churn;
      largest = f.path;
    }
  }
  return {
    files,
    totalAdditions,
    totalDeletions,
    netLines: totalAdditions - totalDeletions,
    binaryFiles: files.filter((f) => f.binary).length,
    empty: files.length === 0,
    largest: files.length ? largest : null
  };
}
function gitApi(runner) {
  const run = async (args, cwd) => runner(args, cwd);
  return {
    async isRepo(cwd) {
      const r = await run(["rev-parse", "--is-inside-work-tree"], cwd);
      if (!r.ok) return { ok: false, reason: r.reason ?? (r.stderr || "git rev-parse failed.") };
      return { ok: r.stdout.trim() === "true", reason: r.stdout.trim() === "true" ? null : "This directory is not inside a git work tree." };
    },
    async status(cwd) {
      const r = await run(["status", "--porcelain=v1", "-z"], cwd);
      if (!r.ok) return { ok: false, entries: [], reason: r.reason ?? (r.stderr || "git status failed.") };
      return { ok: true, entries: parseStatusPorcelainZ(r.stdout), reason: null };
    },
    async diff(cwd, opts = {}) {
      const args = ["diff", "--no-color", "--no-ext-diff", "-M"];
      if (opts.staged) args.push("--staged");
      if (opts.ref) args.push(opts.ref);
      args.push("--");
      for (const p of opts.paths ?? []) args.push(p);
      const r = await run(args, cwd);
      if (!r.ok) return { ok: false, summary: null, raw: "", reason: r.reason ?? (r.stderr || "git diff failed.") };
      return { ok: true, summary: summariseDiff(parseUnifiedDiff(r.stdout)), raw: r.stdout, reason: null };
    },
    async head(cwd) {
      const r = await run(["log", "-1", "--format=%H%x00%s"], cwd);
      if (!r.ok) return { ok: false, sha: null, subject: null, reason: r.reason ?? (r.stderr || "git log failed \u2014 is there a commit yet?") };
      const [sha, subject] = r.stdout.replace(/\n+$/, "").split("\0");
      return { ok: true, sha: (sha ?? "").trim() || null, subject: subject ?? null, reason: null };
    },
    async branch(cwd) {
      const r = await run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      if (!r.ok) return { ok: false, name: null, reason: r.reason ?? (r.stderr || "git rev-parse failed.") };
      return { ok: true, name: r.stdout.trim() || null, reason: null };
    }
  };
}

// src/mission/caps.ts
var DEFAULT_CAPS = { timeoutMs: 10 * 60 * 1e3, maxTurns: 40, maxCostUsd: 5 };
var CapLedger = class {
  caps;
  state;
  constructor(caps, now = Date.now()) {
    this.caps = caps;
    this.state = { spentUsd: 0, spentTokens: 0, turnsUsed: 0, invocationsUsed: 0, startedAt: now, cappedInvocations: [] };
  }
  beginInvocation() {
    this.state.invocationsUsed += 1;
  }
  /** Can another invocation start at all? Checked BEFORE dispatch — refusing is control, charging after is bookkeeping. */
  admissionError(now = Date.now()) {
    const maxCost = this.caps.maxCostUsd ?? 0;
    if (maxCost > 0 && this.state.spentUsd >= maxCost) {
      return `the mission has already spent $${this.state.spentUsd.toFixed(4)} of its $${maxCost.toFixed(4)} ceiling`;
    }
    const maxTurns = this.caps.maxTurns ?? 0;
    if (maxTurns > 0 && this.state.turnsUsed >= maxTurns) {
      return `the mission has already used ${this.state.turnsUsed} of its ${maxTurns} turns`;
    }
    const maxInvocations = this.caps.maxInvocations ?? 0;
    if (maxInvocations > 0 && this.state.invocationsUsed >= maxInvocations) {
      return `the mission has used all ${maxInvocations} permitted invocations`;
    }
    const maxWall = this.caps.maxWallClockMs ?? this.caps.timeoutMs ?? 0;
    if (maxWall > 0 && now - this.state.startedAt >= maxWall) {
      return `the mission's ${Math.round(maxWall / 1e3)}s wall clock has elapsed`;
    }
    return null;
  }
  /** Record what a CLI actually consumed. Returns why, so the caller can show it. */
  charge(r) {
    if (r.tokens !== null && Number.isFinite(r.tokens)) {
      this.state.spentTokens += r.tokens;
    }
    if (r.costUsd !== null && Number.isFinite(r.costUsd)) {
      this.state.spentUsd += r.costUsd;
      const maxCost = this.caps.maxCostUsd ?? 0;
      const breach = maxCost > 0 && this.state.spentUsd > maxCost ? "mission_cap" : null;
      return {
        chargedUsd: r.costUsd,
        basis: "reported_usd",
        breach,
        reason: breach ? `Charged $${r.costUsd.toFixed(4)} from ${r.source}, taking the mission to $${this.state.spentUsd.toFixed(4)} over a $${maxCost.toFixed(4)} ceiling.` : `Charged $${r.costUsd.toFixed(4)} reported by ${r.source}. Mission total $${this.state.spentUsd.toFixed(4)}.`
      };
    }
    if (r.tokens !== null) {
      return {
        chargedUsd: 0,
        basis: "tokens_only",
        breach: null,
        reason: `${r.source} reported ${r.tokens} tokens and no price. Recorded as tokens; NOT converted to dollars, because a guessed price would be a fabricated cost.`
      };
    }
    return { chargedUsd: 0, basis: "unknown", breach: null, reason: `${r.source} reported neither cost nor tokens, so nothing was charged and the true spend is unknown.` };
  }
  /** Note that something was stopped by a cap. Kept separately from charges: a refusal is not a spend. */
  recordCapped(id, outcome, detail, at = (/* @__PURE__ */ new Date()).toISOString()) {
    this.state.cappedInvocations.push({ id, outcome, at, detail });
  }
  addTurns(n) {
    this.state.turnsUsed += n;
  }
  snapshot() {
    return { ...this.state, cappedInvocations: [...this.state.cappedInvocations] };
  }
};
async function withDeadline(work, timeoutMs, now = Date.now) {
  const t0 = now();
  const signal = { cancelled: false };
  if (timeoutMs <= 0) {
    const value = await work(signal);
    return { outcome: "ok", value, timedOut: false, elapsedMs: now() - t0, detail: "No deadline set." };
  }
  let timer = null;
  const deadline = new Promise((resolve2) => {
    timer = setTimeout(() => {
      signal.cancelled = true;
      resolve2("__timeout__");
    }, timeoutMs);
  });
  const winner = await Promise.race([work(signal).then((v) => ({ v })), deadline]);
  if (timer) clearTimeout(timer);
  if (winner === "__timeout__") {
    return {
      outcome: "timeout",
      value: null,
      timedOut: true,
      elapsedMs: now() - t0,
      detail: `Deadline of ${timeoutMs}ms reached. The caller must terminate the child process; MJ cannot assume it stopped.`
    };
  }
  return { outcome: "ok", value: winner.v, timedOut: false, elapsedMs: now() - t0, detail: `Finished in ${now() - t0}ms, inside the ${timeoutMs}ms deadline.` };
}
function parseReportedUsage(harness, raw) {
  const empty = { costUsd: null, tokens: null, turns: null, source: harness };
  if (!raw.trim()) return empty;
  const candidates = jsonChunks(raw);
  let costUsd = null;
  let tokens2 = null;
  let turns = null;
  for (const obj of candidates) {
    const c = findNumber(obj, ["total_cost_usd", "cost_usd", "costUsd", "cost"], 0);
    if (c !== null) costUsd = c;
    const t = findNumber(obj, ["total_tokens"], 0) ?? sumTokens(obj);
    if (t === null) {
      const flat = findNumber(obj, ["tokens"], 0);
      if (flat !== null) tokens2 = flat;
    } else {
      tokens2 = t;
    }
    const n = findNumber(obj, ["num_turns", "turns", "total_turns"], 0);
    if (n !== null) turns = n;
  }
  if (harness === "codex") costUsd = null;
  return { costUsd, tokens: tokens2, turns, source: harness };
}
function jsonChunks(raw) {
  const out = [];
  const tryOne = (s) => {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === "object") out.push(v);
    } catch {
    }
  };
  tryOne(raw.trim());
  for (const line of raw.split(/\r?\n/)) if (line.trim()) tryOne(line.trim());
  return out;
}
function pickNumber(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
function findNumber(obj, keys, depth) {
  if (depth > 3 || !obj || typeof obj !== "object") return null;
  const o = obj;
  const direct = pickNumber(o, keys);
  if (direct !== null) return direct;
  for (const v of Object.values(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = findNumber(v, keys, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}
function sumTokens(obj) {
  const blocks = [];
  const collect = (o, depth) => {
    if (depth > 3 || !o || typeof o !== "object" || Array.isArray(o)) return;
    const rec = o;
    for (const k of ["usage", "tokens"]) {
      const v = rec[k];
      if (v && typeof v === "object" && !Array.isArray(v)) blocks.push(v);
    }
    for (const v of Object.values(rec)) collect(v, depth + 1);
  };
  collect(obj, 0);
  let best = null;
  for (const u of blocks) {
    const total = typeof u.total === "number" && Number.isFinite(u.total) ? u.total : null;
    const i = typeof u.input_tokens === "number" ? u.input_tokens : typeof u.input === "number" ? u.input : 0;
    const o = typeof u.output_tokens === "number" ? u.output_tokens : typeof u.output === "number" ? u.output : 0;
    const candidate = total !== null && total > 0 ? total : i + o > 0 ? i + o : null;
    if (candidate !== null) best = candidate;
  }
  return best;
}

// src/mission/collaboration.ts
function branchSafe(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "").replace(/^-+|-+$/g, "").slice(0, 40) || "seat";
}
function planWorktrees(team, opts) {
  const plans = [];
  const root = opts.repoRoot.replace(/\/+$/, "");
  const hasWriter = team.seats.some((s) => s.mayWrite);
  for (const seat3 of team.seats) {
    if (!seat3.mayWrite) {
      if (opts.deferReview && hasWriter) {
        const path4 = `${root}-mj-review-${branchSafe(seat3.id)}`;
        plans.push({
          seatId: seat3.id,
          branch: "",
          path: path4,
          createArgv: [],
          removeArgv: [["worktree", "remove", "--force", path4]],
          shared: false,
          deferred: true,
          reason: `${seat3.role} is read-only, so it gets its own worktree on the REVIEW SNAPSHOT \u2014 the base plus every writer branch merged. Pointing it at the base checkout would have it review the tree as it was before the work happened, which is the bug this replaces.`
        });
        continue;
      }
      plans.push({
        seatId: seat3.id,
        branch: opts.baseBranch,
        path: root,
        createArgv: [],
        removeArgv: [],
        shared: true,
        deferred: false,
        reason: `${seat3.role} is read-only \u2014 giving a reviewer its own worktree would mean it would review a tree nobody is writing to. Read-only seats share the base checkout.`
      });
      continue;
    }
    const branch = `mj/${opts.missionSlug}/${branchSafe(seat3.id)}`;
    const path3 = `${root}-mj-${branchSafe(seat3.id)}`;
    plans.push({
      seatId: seat3.id,
      branch,
      path: path3,
      createArgv: [["worktree", "add", "-b", branch, path3, opts.baseBranch]],
      removeArgv: [["worktree", "remove", "--force", path3]],
      shared: false,
      deferred: false,
      reason: `${seat3.role} writes, so it gets its own worktree on ${branch}. Two agents in one working tree overwrite each other.`
    });
  }
  return plans;
}
function reviewSnapshotBranch(missionSlug) {
  return `mj/${missionSlug}/review`;
}
function reviewSnapshotArgv(opts) {
  const snapshotBranch = reviewSnapshotBranch(opts.missionSlug);
  if (opts.writerBranches.length === 0) {
    return { argv: [], snapshotBranch, problem: "No writer produced a branch, so there is nothing to snapshot." };
  }
  const argv = [
    ["checkout", "-B", snapshotBranch, opts.baseBranch]
  ];
  for (const b of opts.writerBranches) argv.push(["merge", "--no-ff", "--no-edit", b]);
  return { argv, snapshotBranch, problem: null };
}
function reviewWorktreeArgv(snapshotBranch, path3) {
  return [["worktree", "add", "--detach", path3, snapshotBranch]];
}
function snapshotPreflightArgv(baseBranch, writerBranches) {
  const out = [];
  for (let i = 0; i < writerBranches.length; i += 1) {
    for (let j = i + 1; j < writerBranches.length; j += 1) {
      const a = writerBranches[i];
      const b = writerBranches[j];
      if (a && b) out.push(["merge-tree", "--write-tree", "--name-only", a, b]);
    }
  }
  void baseBranch;
  return out;
}
var CONTEXT_PATHS = [
  { harness: "claude", path: "CLAUDE.md" },
  { harness: "codex", path: "AGENTS.md" },
  { harness: "opencode", path: "AGENTS.md" },
  { harness: "grok", path: "AGENTS.md" },
  { harness: "cursor", path: ".cursor/rules/mj.mdc" },
  { harness: "cline", path: ".clinerules" },
  { harness: "kilo", path: ".kilo/rules.md" }
];
function briefingContents(opts) {
  const constraintsList = opts.constraints && opts.constraints.length ? opts.constraints.map((c) => `- ${c}`).join("\n") : "- (none declared)";
  const doNotTouchList = opts.doNotTouch && opts.doNotTouch.length ? opts.doNotTouch.map((p) => `- ${p}`).join("\n") : "- (none declared)";
  return [
    `# MISSION BRIEFING \u2014 Generated by MJ`,
    ``,
    `## Objective`,
    opts.objective,
    ``,
    `## Constraints`,
    constraintsList,
    ``,
    `## Off-limits files (Do not touch)`,
    doNotTouchList,
    ``,
    `## Collaboration Rules`,
    `- OTHER worktrees are active simultaneously. Work ONLY on files matching your task scope.`,
    `- Do not reformat unrelated code; clean diffs make peer reviews possible.`,
    opts.testCommand ? `- Verify command: \`${opts.testCommand.join(" ")}\`` : ""
  ].filter(Boolean).join("\n");
}
function writeContextFiles(team, opts) {
  const activeHarnesses = new Set(team.seats.map((s) => s.harness));
  const out = [];
  const seenPaths = /* @__PURE__ */ new Set();
  const body = briefingContents(opts);
  for (const entry of CONTEXT_PATHS) {
    if (activeHarnesses.has(entry.harness)) {
      if (seenPaths.has(entry.path)) continue;
      seenPaths.add(entry.path);
      out.push({
        path: entry.path,
        contents: body,
        forHarness: entry.harness
      });
    }
  }
  if (out.length === 0 && team.seats.length > 0) {
    out.push({
      path: "AGENTS.md",
      contents: body,
      forHarness: team.seats[0].harness
    });
  }
  return out;
}

// src/mission/mergePlan.ts
var ROLE_ORDER = {
  architect: 0,
  coder: 1,
  debugger: 2,
  tester: 3,
  security: 4,
  reviewer: 5,
  synthesizer: 6
};
function orderBranches(candidates) {
  const byBranch = new Map(candidates.map((c) => [c.branch, c]));
  const ordered = [];
  const placed = /* @__PURE__ */ new Set();
  const cycles = [];
  const visit = (c, stack) => {
    if (placed.has(c.branch)) return;
    if (stack.includes(c.branch)) {
      cycles.push([...stack.slice(stack.indexOf(c.branch)), c.branch].join(" -> "));
      return;
    }
    for (const dep of c.dependsOn) {
      const d = byBranch.get(dep);
      if (d) visit(d, [...stack, c.branch]);
    }
    placed.add(c.branch);
    ordered.push(c);
  };
  const sorted = [...candidates].sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 99;
    const rb = ROLE_ORDER[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    return b.additions + b.deletions - (a.additions + a.deletions);
  });
  for (const c of sorted) visit(c, []);
  return { ordered, cycles };
}
function planMerge(candidates, opts) {
  const problems = [];
  const excluded = [];
  const mergeable = [];
  for (const c of candidates) {
    if (!c.verified) {
      excluded.push({ branch: c.branch, seatId: c.seatId, reason: "Its own verification did not pass, so it does not merge. A branch that failed its checks would put a known-broken state on the base branch." });
      continue;
    }
    if (c.additions + c.deletions === 0) {
      excluded.push({ branch: c.branch, seatId: c.seatId, reason: "It changed nothing. Merging an empty branch adds a commit and a conflict surface for no benefit." });
      continue;
    }
    mergeable.push(c);
  }
  const { ordered, cycles } = orderBranches(mergeable);
  for (const cyc of cycles) problems.push(`Dependency cycle: ${cyc}. Two branches each claim to depend on the other, which is a decomposition bug \u2014 MJ will not guess an order.`);
  const steps = ordered.map((c, i) => ({
    order: i + 1,
    branch: c.branch,
    seatId: c.seatId,
    argv: [
      ["checkout", opts.baseBranch],
      ["merge", "--no-ff", "--no-edit", c.branch]
    ],
    requires: i === 0 ? [opts.baseBranch] : [ordered[i - 1]?.branch ?? opts.baseBranch],
    note: c.role === "tester" ? "Tests merge after the code they test, so the base branch is never in a state where tests reference code that is not there." : c.dependsOn.length ? `Depends on ${c.dependsOn.join(", ")}, so it merges after them.` : `${c.role} work; +${c.additions}/-${c.deletions}.`
  }));
  const preflight = [];
  for (let i = 0; i < mergeable.length; i += 1) {
    for (let j = i + 1; j < mergeable.length; j += 1) {
      const a = mergeable[i];
      const b = mergeable[j];
      if (!a || !b) continue;
      if (a.dependsOn.includes(b.branch) || b.dependsOn.includes(a.branch)) continue;
      preflight.push({
        a: a.branch,
        b: b.branch,
        // merge-tree does a three-way merge in memory. No working tree is touched, so this is safe to
        // run while agents are still working.
        //
        // It takes TWO branches, not three: the merge base is derived from their history. Passing the
        // base as a third argument makes git reject the command with a usage error (exit 129), which is
        // easy to mistake for "these branches conflict" — verified on git 2.47.3.
        argv: ["merge-tree", "--write-tree", "--name-only", a.branch, b.branch],
        why: `Neither declares a dependency on the other, so a conflict here would be a surprise. Check before merging, not after.`
      });
    }
  }
  if (mergeable.length > 4) {
    problems.push(`${mergeable.length} branches are queued to merge. Four is about where review stops keeping up; consider splitting the mission.`);
  }
  if (excluded.length === candidates.length && candidates.length > 0) {
    problems.push("Every branch was excluded, so nothing will be merged. The mission produced no verified change.");
  }
  const cleanup = [];
  for (const c of mergeable) {
    cleanup.push(["worktree", "remove", "--force", c.worktreePath]);
    cleanup.push(["branch", "-d", c.branch]);
  }
  cleanup.push(["worktree", "prune"]);
  return { steps, excluded, preflight, postMergeCheck: opts.testCommand ?? [], cleanup, problems };
}

// src/mission/verifyGate.ts
var GATE_VERIFIER_ROLES = /* @__PURE__ */ new Set(["reviewer", "security", "tester"]);
var GATE_WRITER_ROLES = /* @__PURE__ */ new Set(["coder", "debugger"]);
var POLICY_KEY = "mj.gatepolicy.v1";
function loadGatePolicy() {
  try {
    const raw = globalThis.localStorage?.getItem(POLICY_KEY);
    return raw === "ADVISORY" ? "ADVISORY" : "STRICT";
  } catch {
    return "STRICT";
  }
}
function evaluateVerifyGate(input) {
  const reasons = [];
  const ranVerifiers = input.verifiers.filter((v) => v.ran);
  const snap = input.snapshot;
  if (input.runStatus !== "completed") {
    reasons.push(`Run status is "${input.runStatus}" \u2014 only completed runs can be verified.`);
  }
  const rejections = ranVerifiers.filter((v) => v.verdict === "reject");
  for (const r of rejections) {
    reasons.push(`Verifier "${r.seatId}" (${r.harness}) rejected the work.`);
  }
  const writerHarnesses = [...new Set(input.writers.map((w) => w.harness))];
  let evidence = null;
  if (snap) {
    evidence = {
      snapshotBuilt: snap.built,
      snapshotSha: snap.sha,
      snapshotRef: snap.ref ?? "",
      writerBranches: snap.writerBranches ?? [],
      reviewedBy: ranVerifiers.map((v) => ({
        seatId: v.seatId,
        harness: v.harness,
        reviewedSha: v.reviewedSha ?? null,
        matchesSnapshot: snap.built && snap.sha !== null && v.reviewedSha === snap.sha
      }))
    };
  }
  const countingVerifiers = !snap ? ranVerifiers : ranVerifiers.filter((v) => snap.built && snap.sha !== null && (v.reviewedSha ?? null) === snap.sha);
  let tier;
  let crossVerified = false;
  if (ranVerifiers.length === 0) {
    tier = "unverified";
    reasons.push("No verifier seat ran \u2014 the work was never checked by anyone.");
  } else if (writerHarnesses.length === 0) {
    tier = "cross-vendor";
    crossVerified = true;
  } else if (snap && (!snap.built || snap.sha === null)) {
    tier = "unverified";
    reasons.push("Writers produced work but no review snapshot was built \u2014 no verifier can prove it saw the writers' output, so the run is unverified.");
  } else {
    if (snap && countingVerifiers.length < ranVerifiers.length) {
      const off = ranVerifiers.filter((v) => !(snap.built && snap.sha !== null && (v.reviewedSha ?? null) === snap.sha));
      for (const o of off) {
        reasons.push(`Verifier "${o.seatId}" (${o.harness}) ran, but its reviewed ref (${o.reviewedSha ?? "none recorded"}) does not match the snapshot (${snap.sha}) \u2014 it cannot vouch for the writers' work.`);
      }
    }
    const selfVerified = writerHarnesses.filter(
      (wh) => !countingVerifiers.some((v) => v.harness !== wh)
    );
    if (selfVerified.length > 0) {
      tier = "self-verification";
      reasons.push(
        `Self-verification: writer harness(es) ${selfVerified.join(", ")} had no verifier from a different harness that reviewed the snapshot. An author grading its own work is not a review.`
      );
    } else {
      crossVerified = true;
      const verifierHarnesses = new Set(countingVerifiers.map((v) => v.harness));
      const overlap = writerHarnesses.some((wh) => verifierHarnesses.has(wh));
      tier = overlap ? "cross-seat" : "cross-vendor";
    }
  }
  if (!input.receiptAttached) {
    reasons.push("No proof receipt attached \u2014 verification without a hash-chained record is a claim, not evidence.");
  }
  const hardFail = input.runStatus !== "completed" || rejections.length > 0;
  let status;
  if (hardFail) {
    status = "FAIL";
  } else if (crossVerified && input.receiptAttached) {
    status = "PASS";
  } else {
    status = input.policy === "STRICT" ? "BLOCKED" : "FAIL";
  }
  return { status, tier, reasons, policy: input.policy, crossVerified, evidence };
}
function gateForTeamReport(report, policy, receiptAttached) {
  const notRun = new Set(report.notRun ?? []);
  const seats = report.seats.filter((s) => !notRun.has(s.seatId));
  const failedOutcomes = /* @__PURE__ */ new Set(["failed", "timeout", "blocked_budget"]);
  const writers = seats.filter((s) => GATE_WRITER_ROLES.has(s.role)).map((s) => ({ seatId: s.seatId, harness: s.harness }));
  const verifiers = seats.filter((s) => GATE_VERIFIER_ROLES.has(s.role)).map((s) => ({
    seatId: s.seatId,
    harness: s.harness,
    ran: s.outcome !== "not_run" && s.outcome !== "skipped",
    verdict: s.outcome === "completed" ? "approve" : failedOutcomes.has(s.outcome) ? "reject" : "none",
    reviewedSha: s.reviewedSha ?? null
  }));
  return evaluateVerifyGate({ runStatus: report.status, writers, verifiers, receiptAttached, policy, snapshot: report.snapshot });
}
function enforceMergeGate(verdict) {
  if (verdict.status === "PASS") {
    return { allowed: true, reason: "", overrideRequired: false, verdict };
  }
  if (verdict.policy === "ADVISORY") {
    return {
      allowed: true,
      reason: `Merged under ADVISORY policy despite gate verdict ${verdict.status} (${verdict.tier}): ${verdict.reasons.join(" ")}`,
      overrideRequired: false,
      verdict
    };
  }
  return {
    allowed: false,
    reason: `STRICT gate: merge blocked \u2014 ${verdict.reasons[0] ?? `verdict ${verdict.status} (${verdict.tier})`}`,
    overrideRequired: true,
    verdict
  };
}

// src/mission/interAgentChannel.ts
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
    const thread = [root];
    const queue = [root.id];
    while (queue.length > 0) {
      const currentId = queue.shift();
      const replies = this.messages.filter((m) => m.replyToId === currentId && !thread.some((t) => t.id === m.id));
      for (const reply of replies) {
        thread.push(reply);
        queue.push(reply.id);
      }
    }
    return thread.sort((a, b) => a.sequence - b.sequence);
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

// src/mission/organizationalMemory.ts
var SEED_INVARIANTS = [
  {
    id: "inv-001-worktree-isolation",
    category: "sandbox",
    rule: "Writing agents must never write directly into the base repository checkout; all edits must be staged in private sibling worktrees.",
    originatingMissionId: "mission-init-01",
    failureObserved: "Base checkout dirty with untracked files before reviewer execution.",
    verifiedRepairAction: "Allocated dedicated git worktrees per writing seat under mj/<mission>/<seatId>.",
    timesApplied: 34,
    successRate: 1,
    active: true
  },
  {
    id: "inv-002-snapshot-peer-review",
    category: "testing",
    rule: "Reviewers must inspect a synthesized merge snapshot branch (--no-ff) containing all writer commits, not the untouched base checkout.",
    originatingMissionId: "mission-init-02",
    failureObserved: "Reviewer passed code without seeing newly written features.",
    verifiedRepairAction: "Built temporary review snapshot branch mj/<mission>/review before wave 3 review runs.",
    timesApplied: 28,
    successRate: 1,
    active: true
  },
  {
    id: "inv-003-async-token-bucket",
    category: "concurrency",
    rule: "Token bucket rate limiters must acquire an atomic reservation lock before consuming burst tokens in async handlers.",
    originatingMissionId: "mission-payment-04",
    failureObserved: "Parallel request burst drained bucket below zero.",
    verifiedRepairAction: "Wrapped token consumption in atomic reservation promise.",
    timesApplied: 12,
    successRate: 0.95,
    active: true
  }
];
var OrganizationalMemoryCortex = class {
  invariants = /* @__PURE__ */ new Map();
  constructor(initial = SEED_INVARIANTS) {
    for (const inv of initial) {
      this.invariants.set(inv.id, inv);
    }
  }
  recordRepairSuccess(category, failureObserved, verifiedRepairAction, missionId, rule) {
    const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const invariant = {
      id,
      category,
      rule,
      originatingMissionId: missionId,
      failureObserved,
      verifiedRepairAction,
      timesApplied: 1,
      successRate: 1,
      active: true
    };
    this.invariants.set(id, invariant);
    globalAgentBus.writeBlackboard(
      `cortex.invariants.${id}`,
      `Rule: ${rule}
Origin: ${missionId}
Action: ${verifiedRepairAction}`,
      "memory_cortex",
      "architecture"
    );
    return invariant;
  }
  compileBriefing() {
    const active = Array.from(this.invariants.values()).filter((i) => i.active);
    const cortexId = `cortex-${Date.now()}`;
    const lines = [
      "# ORGANIZATIONAL MEMORY & LEARNED INVARIANTS",
      `<!-- Auto-compiled by MJ Memory Cortex for Mission Execution (${(/* @__PURE__ */ new Date()).toISOString()}) -->`,
      "",
      "The following architectural invariants were derived from past empirical failures and proven repairs:",
      ""
    ];
    for (const inv of active) {
      lines.push(`### [${inv.category.toUpperCase()}] ${inv.rule}`);
      lines.push(`- **Failure Observed**: ${inv.failureObserved}`);
      lines.push(`- **Proven Repair**: ${inv.verifiedRepairAction}`);
      lines.push(`- **Historical Reliability**: ${(inv.successRate * 100).toFixed(0)}% across ${inv.timesApplied} runs`);
      lines.push("");
    }
    const generatedBriefingMarkdown = lines.join("\n");
    const agentsMdInjections = active.map((i) => `MUST OBEY: ${i.rule}`);
    return {
      cortexId,
      invariantsCompiled: active.length,
      activeRules: active,
      generatedBriefingMarkdown,
      agentsMdInjections
    };
  }
  getInvariants() {
    return Array.from(this.invariants.values());
  }
};
var globalMemoryCortex = new OrganizationalMemoryCortex();

// src/mission/selfImprove.ts
var LS_KEY = "mj.selfimprove.v1";
var BASE_PARAMS = {
  reviewDepth: 1,
  checkBias: 0.5,
  serialExec: false,
  lessonBudget: 3,
  mosaic: false
};
function initialState(now) {
  const v = {
    id: "strategy-v1",
    gen: 1,
    params: { ...BASE_PARAMS },
    parentId: null,
    status: "adopted",
    score: null,
    evaluatedOn: 0,
    note: "baseline \u2014 shipped defaults; measured on the runs it itself governs",
    createdAt: now
  };
  return { versions: [v], adoptedId: v.id };
}
function loadImprovement() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.versions) && p.versions.length > 0) return p;
    }
  } catch {
  }
  return initialState(Date.now());
}
function adoptedVersion(s) {
  return s.versions.find((v) => v.id === s.adoptedId) ?? null;
}
function nextAssignment(s, runs) {
  const baseline = adoptedVersion(s);
  const candidate = s.versions.find((v) => v.status === "candidate") ?? null;
  if (!candidate) return baseline;
  if (!baseline) return candidate;
  const cN = runs.filter((r) => r.strategyId === candidate.id).length;
  const bN = runs.filter((r) => r.strategyId === baseline.id).length;
  return cN <= bN ? candidate : baseline;
}
function strategyWaveShape(assignments, serial) {
  if (serial) return assignments.map((a) => [a]);
  const byWave = /* @__PURE__ */ new Map();
  for (const a of assignments) {
    const list = byWave.get(a.wave) ?? [];
    list.push(a);
    byWave.set(a.wave, list);
  }
  return [...byWave.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
}
function evidenceDepth(checkBias) {
  return Math.max(2, Math.min(8, Math.round(2 + checkBias * 6)));
}
function reviewBriefingLines(reviewDepth) {
  if (reviewDepth < 2) return [];
  return ["[strategy review depth 2] Reviewers: two independent passes. Pass 1 attacks correctness and demands re-run evidence for every pass claim. Pass 2 re-reads the diff assuming pass 1 missed something. Style nits last and labelled."];
}

// src/mission/skillEvolution.ts
var LS_KEY2 = "mj.skills.v1";
function approvedSkillDefs(memory) {
  return memory.filter((p) => p.status === "approved").map((p) => ({
    id: `learned:${p.id}`,
    label: `\u2605 ${p.name}`,
    description: p.description,
    learnedFrom: p.sourceMissionId
  }));
}
function loadSkills() {
  try {
    const raw = localStorage.getItem(LS_KEY2);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
}

// src/mission/lessons.ts
var DECAY_PER_DAY = 0.95;
var RETRIEVE_K = 3;
var LS_KEY3 = "mj.lessons.v1";
function decayedStrength(l, now) {
  const days = Math.max(0, (now - l.createdAt) / 864e5);
  return l.strength * Math.pow(DECAY_PER_DAY, days);
}
function tokens(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
}
function retrieveLessons(memory, goal, k, now) {
  const g = tokens(goal);
  const scored = memory.map((l) => {
    const t = tokens(l.text);
    let overlap = 0;
    g.forEach((w) => {
      if (t.has(w)) overlap += 1;
    });
    const recency = 1 / (1 + (now - l.lastUsedAt) / 864e5);
    return { l, score: decayedStrength(l, now) * (1 + overlap) * (0.5 + 0.5 * recency) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.l);
}
function retrieveCausal(memory, condition, k, now) {
  const c = tokens(condition);
  const causalText = (l) => l.causal ? [l.causal.decision, l.causal.action, l.causal.observation, l.causal.outcome].filter(Boolean).join(" ") : "";
  const scored = memory.filter((l) => l.causal).map((l) => {
    const t = tokens(causalText(l));
    let overlap = 0;
    c.forEach((w) => {
      if (t.has(w)) overlap += 1;
    });
    return { l, score: overlap === 0 ? 0 : decayedStrength(l, now) * overlap };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((x) => x.l);
}
function lessonsForBriefing(memory, goal, now) {
  const scars = retrieveLessons(memory.filter((l) => l.kind === "failure"), goal, RETRIEVE_K, now);
  const scarIds = new Set(scars.map((l) => l.id));
  const rest = retrieveLessons(memory, goal, RETRIEVE_K, now).filter((l) => !scarIds.has(l.id));
  return [...scars, ...rest].slice(0, RETRIEVE_K).map(
    (l) => l.kind === "failure" ? `[org memory scar] ${l.text}` : `[org memory] ${l.text}`
  );
}
function loadLessons() {
  try {
    const raw = localStorage.getItem(LS_KEY3);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.filter((l) => l && typeof l.text === "string");
    }
  } catch {
  }
  return [];
}

// src/mission/belief.ts
var LS_KEY4 = "mj.beliefs.v1";
function needsApproval(b) {
  return b.provenance === "agent-inferred" && b.aboutUser && !b.approved;
}
function beliefsForBriefing(memory, goal, now) {
  void now;
  const goalWords = goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const relevant = (b) => {
    if (needsApproval(b)) return false;
    const low = b.claim.toLowerCase();
    return b.klass === "contradicted" || b.isPrediction || goalWords.some((w) => low.includes(w));
  };
  const lines = [];
  for (const b of memory.filter(relevant)) {
    if (b.isPrediction) lines.push(`[prediction \u2014 NOT evidence] ${b.claim}`);
    else if (b.klass === "contradicted") lines.push(`[belief contradicted] ${b.claim} \u2014 sources disagree; verify before acting on it`);
    else lines.push(`[belief ${b.klass}] ${b.claim} (${b.source})`);
  }
  return lines.slice(0, 6);
}
function loadBeliefs() {
  try {
    const raw = localStorage.getItem(LS_KEY4);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
  } catch {
  }
  return [];
}

// src/mission/signing.ts
var STORAGE_KEY = "mj.issuerkey.v1";
var cached = null;
function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function ed25519Available() {
  try {
    return typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof crypto.subtle.generateKey === "function";
  } catch {
    return false;
  }
}
async function ensureIssuerIdentity() {
  if (cached) return cached;
  if (!ed25519Available()) return null;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity = {
          keyId: `mj-issuer-${stored.publicKeyHex.slice(0, 12)}`,
          publicKeyHex: stored.publicKeyHex,
          createdAt: stored.createdAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
        };
        cached = { identity, privateKey };
        return cached;
      }
    }
  } catch {
  }
  try {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKeyHex = toHex(rawPub);
    const identity = {
      keyId: `mj-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt }));
    } catch {
    }
    cached = { identity, privateKey: pair.privateKey };
    return cached;
  } catch {
    return null;
  }
}
async function signHexDigest(hexDigest) {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  try {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, holder.privateKey, fromHex(hexDigest)));
    return { alg: "EdDSA", keyId: holder.identity.keyId, publicKeyHex: holder.identity.publicKeyHex, sigHex: toHex(sig) };
  } catch {
    return null;
  }
}
async function verifyIssuerSignature(chainHashHex, sigHex, publicKeyHex) {
  if (!ed25519Available()) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", fromHex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromHex(sigHex), fromHex(chainHashHex));
  } catch {
    return false;
  }
}
function signingSupported() {
  return ed25519Available();
}

// src/mission/learningReceipt.ts
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/version.ts
var MJ_VERSION = "11.13.0";
var MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");
var MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;

// src/mission/selfEvolveRuntime.ts
var RUNS_KEY = "mj.selfimprove.runs.v2";
var RUNS_KEY_V1 = "mj.selfimprove.runs.v1";
function loadExperimentRuns() {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
    }
    const old = localStorage.getItem(RUNS_KEY_V1);
    if (old) {
      const p = JSON.parse(old);
      if (Array.isArray(p)) {
        const migrated = p.map((r) => ({ verified: r.verified, simulated: r.simulated, strategyId: null }));
        localStorage.setItem(RUNS_KEY, JSON.stringify(migrated.slice(-100)));
        localStorage.removeItem(RUNS_KEY_V1);
        return migrated;
      }
    }
  } catch {
  }
  return [];
}
function nextRunStrategy() {
  const v = nextAssignment(loadImprovement(), loadExperimentRuns());
  if (!v) return null;
  return { id: v.id, gen: v.gen, params: v.params, isCandidate: v.status === "candidate" };
}
function composeBriefing(lessons, skillLines, mosaicLines, goal, now, params) {
  const lines = lessonsForBriefing(lessons, goal, now);
  if (params.mosaic) for (const m of mosaicLines) lines.push(m);
  for (const d of skillLines) lines.push(d);
  return lines.slice(0, Math.max(0, params.lessonBudget) + 2 + (params.mosaic ? 4 : 0));
}
function briefingForMission(goal, now) {
  const assigned = nextRunStrategy();
  const params = assigned?.params ?? { reviewDepth: 1, checkBias: 0.5, serialExec: false, lessonBudget: 3, mosaic: false };
  const skillLines = approvedSkillDefs(loadSkills()).map((d) => `[learned skill ${d.label}] ${d.description}`);
  let mosaicLines = [];
  if (params.mosaic) {
    const mem = loadLessons();
    mosaicLines = [
      ...retrieveCausal(mem, goal, 2, now).map((l) => `[causal memory] tried: ${l.causal?.action ?? l.causal?.decision ?? "-"} \u2192 ${l.causal?.outcome ?? "-"}`),
      ...beliefsForBriefing(loadBeliefs(), goal, now)
    ];
  }
  return composeBriefing(loadLessons(), skillLines, mosaicLines, goal, now, params);
}

// src/mission/actionPacket.ts
function canonicalPacketInput(p) {
  return JSON.stringify([
    p.format,
    p.id,
    p.mjVersion,
    p.issuedAt,
    p.intent,
    p.beliefDigest,
    p.planStep,
    p.prediction,
    p.risk,
    p.permission,
    p.rollback,
    p.verification,
    p.reversible
  ]);
}
async function verifyActionPacket(p) {
  const { digest, signature, signatureNote, ...rest } = p;
  void signatureNote;
  const recomputed = await sha256Hex(canonicalPacketInput(rest));
  if (recomputed !== digest) return { ok: false, reason: "digest mismatch \u2014 packet was altered" };
  if (p.signature) {
    const good = await verifyIssuerSignature(digest, p.signature.sigHex, p.signature.publicKeyHex);
    if (!good) return { ok: false, reason: "signature does not verify" };
  }
  return { ok: true };
}
function packetAllowsExecution(p) {
  if (!p) return { ok: true, reason: "no packet \u2014 run proceeds under gate policy alone (pre-11.12 caller)" };
  if (p.permission === "refused") return { ok: false, reason: `action packet ${p.id} is refused: ${p.risk}` };
  if (!p.reversible && p.permission !== "allowed") {
    return { ok: false, reason: `irreversible action requires explicit "allowed" permission; packet ${p.id} says "${p.permission}"` };
  }
  return { ok: true, reason: `packet ${p.id} permits execution (${p.permission}${p.reversible ? ", reversible" : ", irreversible+allowed"})` };
}

// src/mission/custody.ts
var HUMAN_PRINCIPAL_RE = /^human:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function isHumanPrincipal(p) {
  return HUMAN_PRINCIPAL_RE.test(p);
}
function canonicalEnvelopeInput(e) {
  return JSON.stringify([e.format, e.id, e.principal, e.delegationChain, e.scope, e.issuedAt, e.expiresAt, e.budgetUsd, e.revoked, e.parentId]);
}
var seq = 0;
async function seal(base) {
  const digest = await sha256Hex(canonicalEnvelopeInput(base));
  const env = { ...base, digest };
  if (signingSupported()) {
    const sig = await signHexDigest(digest);
    if (sig) env.signature = sig;
    else env.signatureNote = "Ed25519 unavailable in this runtime; envelope unsigned.";
  } else {
    env.signatureNote = "Ed25519 unavailable in this runtime; envelope unsigned.";
  }
  return env;
}
async function attenuate(parent, agentId, subScope, opts) {
  if (!isHumanPrincipal(parent.principal)) {
    return { envelope: null, reason: `custody: parent envelope principal "${parent.principal}" is not human-format \u2014 attenuation is refused rather than delegated from an illegitimate root` };
  }
  const now = opts?.now ?? Date.now();
  const notInParent = subScope.filter((s) => !parent.scope.includes(s));
  if (notInParent.length > 0) {
    return { envelope: null, reason: `attenuation refused: scope would GROW by [${notInParent.join(", ")}] \u2014 a sub-agent never exceeds its parent` };
  }
  const expiry = opts?.expiresAt ?? parent.expiresAt;
  if (parent.expiresAt !== null && (expiry === null || expiry > parent.expiresAt)) {
    return { envelope: null, reason: "attenuation refused: child expiry outlives the parent envelope" };
  }
  const requestedBudget = opts?.budgetUsd ?? null;
  const budget = requestedBudget === null ? parent.budgetUsd : parent.budgetUsd !== null && requestedBudget > parent.budgetUsd ? null : requestedBudget;
  if (requestedBudget !== null && parent.budgetUsd !== null && requestedBudget > parent.budgetUsd) {
    return { envelope: null, reason: `attenuation refused: child budget $${requestedBudget} exceeds the parent's $${parent.budgetUsd} cap \u2014 spend authority never grows` };
  }
  seq += 1;
  const envelope = await seal({
    budgetUsd: budget,
    format: "mj-envelope/1",
    id: `env-${now.toString(36)}-${seq}`,
    principal: parent.principal,
    delegationChain: [...parent.delegationChain, agentId],
    scope: subScope,
    issuedAt: now,
    expiresAt: expiry,
    revoked: null,
    parentId: parent.id
  });
  return { envelope, reason: `attenuated from ${parent.id}; chain ${envelope.delegationChain.join(" -> ")}` };
}
function budgetCheck(e, spentUsd) {
  if (e.budgetUsd === null) return { ok: true, reason: "uncapped", remainingUsd: null };
  const remaining = e.budgetUsd - spentUsd;
  if (spentUsd >= e.budgetUsd) {
    return { ok: false, reason: `spend authority exhausted \u2014 $${spentUsd.toFixed(4)} spent against a $${e.budgetUsd.toFixed(2)} cap`, remainingUsd: Math.max(0, remaining) };
  }
  return { ok: true, reason: "within budget", remainingUsd: remaining };
}
function checkEnvelope(e, action, now) {
  if (!e) return { ok: false, reason: "no authority envelope \u2014 nothing executes without traced authority" };
  if (e.revoked) return { ok: false, reason: `envelope ${e.id} revoked: ${e.revoked}` };
  if (e.expiresAt !== null && now > e.expiresAt) return { ok: false, reason: `envelope ${e.id} expired \u2014 authority is void` };
  if (!e.scope.includes(action)) return { ok: false, reason: `action "${action}" outside envelope scope [${e.scope.join(", ")}]` };
  return { ok: true, reason: `envelope ${e.id} permits "${action}" (principal ${e.principal})` };
}

// src/mission/consensusEngine.ts
var AgentReputationLedger = class {
  ledger = /* @__PURE__ */ new Map();
  constructor() {
    const harnesses = [
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
    for (const h of harnesses) {
      this.ledger.set(h, {
        seatId: h,
        harness: h,
        missionsParticipated: 0,
        verifiedCommits: 0,
        accurateReviews: 0,
        falseAlarms: 0,
        reputationWeight: 1
        // Neutral 1.0 baseline
      });
    }
  }
  getReputation(harnessOrSeatId) {
    return this.ledger.get(harnessOrSeatId) ?? {
      seatId: harnessOrSeatId,
      harness: "llm",
      missionsParticipated: 0,
      verifiedCommits: 0,
      accurateReviews: 0,
      falseAlarms: 0,
      reputationWeight: 1
    };
  }
  recordOutcome(harnessOrSeatId, result) {
    const rep = this.getReputation(harnessOrSeatId);
    rep.missionsParticipated++;
    if (result.verifiedCommit) rep.verifiedCommits++;
    if (result.accurateReview) rep.accurateReviews++;
    if (result.falseAlarm) rep.falseAlarms++;
    const delta = rep.accurateReviews * 0.05 + rep.verifiedCommits * 0.05 - rep.falseAlarms * 0.1;
    rep.reputationWeight = Math.min(2, Math.max(0.5, 1 + delta));
    this.ledger.set(harnessOrSeatId, rep);
    return rep;
  }
  getAll() {
    return Array.from(this.ledger.values());
  }
};
var globalReputationLedger = new AgentReputationLedger();
var INITIAL_REPUTATIONS = Object.fromEntries(
  globalReputationLedger.getAll().map((r) => [r.harness, r])
);

// src/mission/teamExecutor.ts
var OUTPUT_TAIL_CHARS = 4e3;
var BRIEF_DIR = ".mj-brief";
async function git(deps2, args, cwd) {
  if (!deps2.git) return { ok: false, stdout: "", stderr: "", exitCode: null };
  const r = await deps2.git(args, cwd);
  return { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
}
function gateTheRun(args) {
  const gate = gateForTeamReport(
    {
      status: args.status,
      seats: args.seats.map((s) => ({
        seatId: s.seatId,
        role: s.role,
        harness: s.harness,
        outcome: s.outcome,
        verified: s.verified,
        reviewedSha: s.reviewedSha
      })),
      notRun: args.notRun,
      snapshot: {
        built: args.snapshot.built,
        sha: args.snapshot.sha,
        ref: args.snapshot.branch,
        writerBranches: args.snapshot.writerBranches
      }
    },
    args.policy,
    true
  );
  return { gate, mergeGate: enforceMergeGate(gate) };
}
async function executeTeam(req, deps2, sessions = new SessionStore()) {
  const now = deps2.now ?? (() => Date.now());
  const t0 = now();
  const startedAt = new Date(t0).toISOString();
  const seats = [];
  const notRun = [];
  const setup = [];
  const repCount = /* @__PURE__ */ new Map();
  const depsWithRep = {
    ...deps2,
    onTurn: (rec) => {
      const sig = `${rec.seatId}|${rec.exitCode}|${(rec.outputTail ?? "").length}|${(rec.selfReport ?? "").slice(0, 80)}`;
      const st = repCount.get(rec.seatId) ?? { last: "", run: 0, max: 0 };
      st.run = sig === st.last ? st.run + 1 : 1;
      st.last = sig;
      st.max = Math.max(st.max, st.run);
      repCount.set(rec.seatId, st);
      if (deps2.onTurn) deps2.onTurn(rec);
    }
  };
  let seatEnvelopes = [];
  let packetVerified = false;
  const emptySnapshot = { built: false, branch: "", sha: null, writerBranches: [], conflicts: [], detail: "Not attempted." };
  const finish = (status2, summary, spentUsd2, snapshot2, briefings2) => {
    if (status2 === "completed") {
      globalMemoryCortex.recordRepairSuccess(
        "architecture",
        `Mission ${req.missionSlug} task completed`,
        `Verified worktree commit and review passed on ${req.baseBranch}`,
        req.missionSlug,
        `Mission "${req.objective}" verified with 0 regressions.`
      );
    }
    globalAgentBus.publish({
      channel: "#general",
      sender: { seatId: "orchestrator", role: "planner", harness: "llm", name: "Team Orchestrator" },
      mentions: ["@all"],
      intent: "broadcast",
      content: `Team mission "${req.missionSlug}" finished with status ${status2.toUpperCase()} ($${(spentUsd2 || 0).toFixed(4)} spent). Summary: ${summary}`
    });
    globalAgentBus.writeBlackboard("mission.verdict", `Status: ${status2}
Summary: ${summary}
Spent: $${(spentUsd2 || 0).toFixed(4)}`, "orchestrator", "finding");
    const gated2 = gateTheRun({
      status: status2,
      seats,
      notRun: notRun.map((n) => n.seatId),
      snapshot: snapshot2,
      policy: req.gatePolicy ?? loadGatePolicy()
    });
    return {
      seats,
      status: status2,
      summary,
      spentUsd: spentUsd2,
      notRun,
      setup,
      briefings: briefings2,
      snapshot: snapshot2,
      merge: { candidates: [], plan: planMerge([], { baseBranch: req.baseBranch, repoRoot: req.repoRoot, testCommand: req.testCommand }), gate: gated2.mergeGate },
      gate: gated2.gate,
      startedAt,
      finishedAt: new Date(now()).toISOString(),
      wallClockMs: now() - t0,
      autonomyArms: req.autonomy?.arms,
      strategy: req.strategy ?? null,
      actionPacket: req.actionPacket ? { id: req.actionPacket.id, digest: req.actionPacket.digest, permission: req.actionPacket.permission, reversible: req.actionPacket.reversible, verification: req.actionPacket.verification, verified: packetVerified } : null,
      envelopes: seatEnvelopes,
      repetition: [...repCount.entries()].map(([seatId, r]) => ({ seatId, repeated: r.max })).filter((r) => r.repeated >= 2)
    };
  };
  if (req.rootEnvelope) {
    const envCheck = checkEnvelope(req.rootEnvelope, "run:team-mission", now());
    if (!envCheck.ok) {
      return finish("aborted", `Custody refused the mission before any invocation \u2014 ${envCheck.reason}`, 0, emptySnapshot, []);
    }
  }
  if (req.rootEnvelope) {
    for (const st of req.team.seats) {
      const sub = ["role:any", "read:review-snapshot", "spend:capped-by-ledger", ...st.mayWrite ? ["write:worktrees"] : []].filter((x) => req.rootEnvelope.scope.includes(x));
      const att = await attenuate(req.rootEnvelope, `seat:${st.id}`, sub, { now: now() });
      if (att.envelope) {
        seatEnvelopes.push({ seatId: st.id, scope: att.envelope.scope, attenuatedFrom: req.rootEnvelope.id, principal: att.envelope.principal, delegationChain: att.envelope.delegationChain, expiresAt: att.envelope.expiresAt ?? null });
      } else {
        seatEnvelopes.push({ seatId: st.id, scope: [], attenuatedFrom: null });
      }
    }
  }
  if (req.rootEnvelope && req.rootEnvelope.budgetUsd !== null) {
    const bc = budgetCheck(req.rootEnvelope, 0);
    if (!bc.ok) {
      return finish("aborted", `Budget authority refused the mission before any invocation \u2014 ${bc.reason}. Nothing executed, nothing spent.`, 0, emptySnapshot, []);
    }
  }
  if (req.actionPacket) {
    const integrity = await verifyActionPacket(req.actionPacket);
    if (!integrity.ok) {
      return finish("aborted", `Action packet ${req.actionPacket.id} FAILED cryptographic verification \u2014 ${integrity.reason}. Nothing executed, nothing spent.`, 0, emptySnapshot, []);
    }
    packetVerified = true;
  }
  const packetGate = packetAllowsExecution(req.actionPacket ?? null);
  if (!packetGate.ok) {
    return finish("aborted", `Refused before any invocation by its action packet \u2014 ${packetGate.reason}`, 0, emptySnapshot, []);
  }
  globalAgentBus.publish({
    channel: "#general",
    sender: { seatId: "orchestrator", role: "planner", harness: "llm", name: "Team Orchestrator" },
    mentions: ["@all"],
    intent: "broadcast",
    content: `Launching Team Mission "${req.missionSlug}": ${req.objective} with ${req.team.seats.length} seats.`
  });
  const worktrees = planWorktrees(req.team, { repoRoot: req.repoRoot, baseBranch: req.baseBranch, missionSlug: req.missionSlug, deferReview: true });
  const wtBySeat = new Map(worktrees.map((w) => [w.seatId, w]));
  const autonomyLines = [];
  const arms = req.autonomy?.arms ?? [];
  if (arms.includes("review:deep")) autonomyLines.push("[autonomy arm review:deep] Reviewers: attack correctness first; require re-run evidence for every pass claim; style nits last and labelled.");
  if (arms.includes("review:shallow")) autonomyLines.push("[autonomy arm review:shallow] Reviewers: blockers only this run; defer nits.");
  if (arms.includes("check:strict")) autonomyLines.push("[autonomy arm check:strict] Testers/QA: run EVERY listed check and quote failures verbatim; a pass without output is not a pass.");
  if (arms.includes("check:lenient")) autonomyLines.push("[autonomy arm check:lenient] Testers/QA: core acceptance checks this run; edge cases sampled.");
  if (req.team.seats.some((st) => st.role === "planner" || st.mayWrite) && arms.length > 0) {
    autonomyLines.push(`[autonomy router] strategy arms this run: ${arms.join(", ")} \u2014 outcomes feed the router's next decision.`);
  }
  if (req.strategy) {
    const p = req.strategy.params;
    autonomyLines.push(
      `[strategy experiment ${req.strategy.id}${req.strategy.isCandidate ? " (CANDIDATE)" : " (baseline)"}] this run executes gen ${req.strategy.gen} parameters: reviewDepth ${p.reviewDepth}, checkBias ${p.checkBias}, serialExec ${p.serialExec}, lessonBudget ${p.lessonBudget}. Measured outcomes attribute to this strategy.`
    );
    for (const l of reviewBriefingLines(p.reviewDepth)) autonomyLines.push(l);
  }
  if (req.autonomy?.webEvidence !== false && req.team.seats.some((st) => st.role === "planner" || st.role === "reviewer")) {
    try {
      const web = await searchWeb(req.objective.slice(0, 80), { timeoutMs: 4e3 });
      const live = web.providers.filter((pr) => pr.ok);
      if (live.length > 0) {
        autonomyLines.push(`[web evidence] ${web.hits.length} deduplicated hit(s) from ${live.map((pr) => pr.id).join(", ")}:`);
        for (const t of toTriples(web.hits).slice(0, evidenceDepth(req.strategy?.params.checkBias ?? 0.5))) {
          autonomyLines.push(`  - (${t.confidence}, ${t.kind}) ${t.claim} \u2014 ${t.source}`);
        }
      } else {
        autonomyLines.push(`[web evidence] unavailable this run (${web.providers.map((pr) => `${pr.id}: ${pr.note}`).join("; ")}) \u2014 research proceeds without it.`);
      }
    } catch {
      autonomyLines.push("[web evidence] fetch failed \u2014 research proceeds without it.");
    }
  }
  const briefingsByHarness = writeContextFiles(req.team, {
    objective: req.objective,
    constraints: [...req.constraints ?? [], ...autonomyLines],
    doNotTouch: req.doNotTouch ?? [],
    testCommand: req.testCommand
  });
  const learnedMarkdown = globalMemoryCortex.compileBriefing().generatedBriefingMarkdown;
  for (const seat3 of req.team.seats) {
    briefingsByHarness.push({
      path: ".mj-brief/LEARNED_INVARIANTS.md",
      contents: learnedMarkdown,
      forHarness: seat3.harness
    });
  }
  const lessonLines = briefingForMission(req.objective, Date.now());
  if (lessonLines.length > 0) {
    const lessonsMd = `# Organizational lessons (MJ 11.11)

${lessonLines.map((l) => `- ${l}`).join("\n")}
`;
    for (const seat3 of req.team.seats) {
      briefingsByHarness.push({
        path: ".mj-brief/ORG_LESSONS.md",
        contents: lessonsMd,
        forHarness: seat3.harness
      });
    }
  }
  const setupFailed = /* @__PURE__ */ new Set();
  for (const w of worktrees) {
    if (w.deferred) {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: "Deferred: created on the review snapshot when this seat's wave runs." });
      continue;
    }
    if (w.shared) {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: "Runs in the base checkout \u2014 no writer exists on this team, so there is nothing to snapshot." });
      continue;
    }
    if (!deps2.git) {
      setup.push({ seatId: w.seatId, path: w.path, ok: false, detail: "MJ has no git runner here, so the worktree was NOT created. This seat would have written into the base checkout, which defeats isolation, so it is blocked instead." });
      setupFailed.add(w.seatId);
      continue;
    }
    let failed = null;
    for (const argv of w.createArgv) {
      const r = await git(deps2, argv, req.repoRoot);
      if (!r.ok) {
        failed = r.exitCode === null ? `git ${argv.join(" ")} could not run.` : `git ${argv.join(" ")} exited ${r.exitCode}: ${(r.stderr || r.stdout).trim().slice(0, 200)}`;
        break;
      }
    }
    if (failed) {
      setup.push({ seatId: w.seatId, path: w.path, ok: false, detail: failed });
      setupFailed.add(w.seatId);
    } else {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: `Created ${w.branch} at ${w.path}.` });
    }
  }
  const briefings = [];
  const writerWorktrees = worktrees.filter((w) => !w.shared && !w.deferred && !setupFailed.has(w.seatId));
  for (const f of briefingsByHarness) {
    const writtenTo = [];
    for (const w of writerWorktrees) {
      const target = `${w.path}/${BRIEF_DIR}/${f.path}`;
      if (deps2.writeFile) {
        try {
          await deps2.writeFile(target, f.contents);
          writtenTo.push(w.path);
        } catch {
        }
      }
    }
    briefings.push({
      path: `${BRIEF_DIR}/${f.path}`,
      writtenTo,
      excludedFromGit: false,
      detail: writtenTo.length ? `Written into ${writtenTo.length} worktree(s), under ${BRIEF_DIR}/, which MJ adds to .git/info/exclude so it can never be committed.` : deps2.writeFile ? "No writable worktree existed for this briefing." : "MJ has no file writer here, so the briefing was composed but NOT written. The agents will not see it."
    });
  }
  let excludedEverywhere = true;
  for (const w of writerWorktrees) {
    const okExcl = await excludeBriefDir(deps2, w.path);
    if (!okExcl) excludedEverywhere = false;
  }
  for (const b of briefings) {
    b.excludedFromGit = excludedEverywhere && b.writtenTo.length > 0;
    if (b.writtenTo.length > 0 && !excludedEverywhere) {
      b.detail = `Written into ${b.writtenTo.length} worktree(s), but MJ could NOT exclude ${BRIEF_DIR}/ from git. Those files will appear as untracked and WILL be picked up by a commit \u2014 treat this seat's diff as containing the briefing.`;
    }
  }
  const waves = strategyWaveShape(req.assignments, arms.includes("exec:serial") || req.strategy?.params.serialExec === true);
  const runnable = /* @__PURE__ */ new Map();
  const binPaths = /* @__PURE__ */ new Map();
  for (const w of waves) {
    for (const a of w) {
      if (runnable.has(a.seat.id)) continue;
      const rc = resolveCaps(a.seat.harness);
      const caps = rc.caps;
      if (rc.custom && !rc.registered) {
        runnable.set(a.seat.id, false);
        notRun.push({ seatId: a.seat.id, reason: `Custom harness "${a.seat.harness}" is not registered (anymore). Add it in Teams -> Connect, then recompile.` });
        continue;
      }
      let resolved = null;
      for (const b of caps.bins) {
        const r = await deps2.resolveBin(b);
        if (r) {
          resolved = r;
          break;
        }
      }
      if (resolved) binPaths.set(a.seat.harness, resolved);
      const ok = resolved !== null;
      runnable.set(a.seat.id, ok);
      if (!ok) notRun.push({ seatId: a.seat.id, reason: `None of ${caps.name}'s binaries (${caps.bins.join(", ")}) are installed or executable. Install: ${caps.install}` });
    }
  }
  const minSeats = req.minimumRunnableSeats ?? 1;
  const runnableCount = [...runnable.values()].filter(Boolean).length;
  if (runnableCount < minSeats) {
    return finish(
      "aborted",
      `Aborted before any invocation: only ${runnableCount} of ${req.assignments.length} seats can run, and ${minSeats} is the minimum. Nothing was executed and nothing was charged.`,
      0,
      emptySnapshot,
      briefings
    );
  }
  let waveFailed = false;
  let budgetStop = null;
  let snapshot = emptySnapshot;
  const committedBranches = [];
  for (const wave of waves) {
    if (waveFailed) {
      const skipReason = budgetStop ? `Spend authority ran out \u2014 ${budgetStop}` : "An earlier wave did not complete, so this seat was skipped rather than asked to review work that does not exist.";
      for (const a of wave) {
        notRun.push({ seatId: a.seat.id, reason: skipReason });
        seats.push(unrunRecord(a, wtBySeat.get(a.seat.id) ?? null, "skipped_wave_failed", `Skipped: ${skipReason}`));
      }
      continue;
    }
    const hasReadOnly = wave.some((a) => a.readOnly || !a.seat.mayWrite);
    const skippedIds = /* @__PURE__ */ new Set();
    if (hasReadOnly && worktrees.some((w) => w.deferred)) {
      snapshot = await buildReviewSnapshot(req, deps2, worktrees, committedBranches, setupFailed);
      if (!snapshot.built) {
        for (const a of wave.filter((x) => x.readOnly || !x.seat.mayWrite)) {
          const wt = wtBySeat.get(a.seat.id);
          if (!wt?.deferred) continue;
          skippedIds.add(a.seat.id);
          const outcome = committedBranches.length === 0 ? "skipped_nothing_to_review" : "review_snapshot_failed";
          seats.push(
            unrunRecord(
              a,
              wt,
              outcome,
              committedBranches.length === 0 ? "Nothing was committed by any writer, so there was no work to review. Reviewing the untouched base would have produced a verdict about code nobody wrote." : `The review snapshot could not be built: ${snapshot.detail}`
            )
          );
          notRun.push({ seatId: a.seat.id, reason: committedBranches.length === 0 ? "No writer committed anything, so there was nothing to review." : snapshot.detail });
        }
      }
    }
    const runnableWave = wave.filter((a) => !skippedIds.has(a.seat.id));
    const results = await Promise.all(
      runnableWave.map(
        (a) => runSeat(
          req,
          depsWithRep,
          a,
          sessions,
          wtBySeat.get(a.seat.id) ?? null,
          runnable.get(a.seat.id) ?? false,
          binPaths.get(a.seat.harness) ?? null,
          setupFailed,
          snapshot,
          briefingsByHarness,
          now
        )
      )
    );
    seats.push(...results);
    if (req.rootEnvelope && req.rootEnvelope.budgetUsd !== null && !budgetStop) {
      const spentSoFar = seats.reduce((sum, r) => sum + (r.chargedUsd ?? 0), 0);
      const bc = budgetCheck(req.rootEnvelope, spentSoFar);
      if (!bc.ok) {
        budgetStop = bc.reason;
        waveFailed = true;
      }
    }
    for (const r of results) {
      if (r.outcome === "completed" && r.branch && r.branch !== req.baseBranch && !committedBranches.includes(r.branch)) {
        if (/Committed on/.test(r.commit)) committedBranches.push(r.branch);
      }
    }
    if (results.every((r) => r.outcome !== "completed")) waveFailed = true;
  }
  const spentUsd = seats.reduce((s, r) => s + r.chargedUsd, 0);
  const candidates = seats.filter((r) => r.branch && r.branch !== req.baseBranch && !r.branch.startsWith(`mj/${req.missionSlug}/review`)).map((r) => ({
    seatId: r.seatId,
    branch: r.branch,
    worktreePath: r.worktreePath,
    role: r.role,
    dependsOn: req.assignments.find((a) => a.seat.id === r.seatId)?.dependsOn ?? [],
    verified: r.verified,
    additions: r.git.measured ? r.git.additions : 0,
    deletions: r.git.measured ? r.git.deletions : 0
  }));
  const plan = planMerge(candidates, { baseBranch: req.baseBranch, repoRoot: req.repoRoot, testCommand: req.testCommand });
  const completed = seats.filter((r) => r.outcome === "completed").length;
  const verifiedCount = seats.filter((r) => r.verified).length;
  const status = seats.length === 0 ? "blocked" : completed === seats.length && completed > 0 ? "completed" : completed > 0 ? "partial" : "blocked";
  const gated = gateTheRun({
    status,
    seats,
    notRun: notRun.map((n) => n.seatId),
    snapshot,
    policy: req.gatePolicy ?? loadGatePolicy()
  });
  if (!gated.mergeGate.allowed) {
    globalAgentBus.publish({
      channel: "#general",
      sender: { seatId: "orchestrator", role: "planner", harness: "llm", name: "Team Orchestrator" },
      mentions: ["@all"],
      intent: "blocker",
      content: `MERGE BLOCKED by the adversarial gate (${gated.gate.status}, ${gated.gate.tier}): ${gated.mergeGate.reason} A recorded human approval from Mission Control can override.`
    });
  }
  return {
    seats,
    status,
    summary: buildSummary({ status, seats, verifiedCount, spentUsd, notRun, briefings, snapshot }),
    spentUsd,
    notRun,
    setup,
    briefings,
    snapshot,
    merge: { candidates, plan, gate: gated.mergeGate },
    gate: gated.gate,
    startedAt,
    finishedAt: new Date(now()).toISOString(),
    wallClockMs: now() - t0,
    autonomyArms: req.autonomy?.arms
  };
}
async function buildReviewSnapshot(req, deps2, worktrees, committedBranches, setupFailed) {
  const plan = reviewSnapshotArgv({ repoRoot: req.repoRoot, baseBranch: req.baseBranch, missionSlug: req.missionSlug, writerBranches: committedBranches });
  if (plan.problem || !deps2.git) {
    return { built: false, branch: plan.snapshotBranch, sha: null, writerBranches: committedBranches, conflicts: [], detail: plan.problem ?? "MJ has no git runner, so the snapshot could not be built." };
  }
  const conflicts = [];
  for (const argv of snapshotPreflightArgv(req.baseBranch, committedBranches)) {
    const r = await git(deps2, argv, req.repoRoot);
    if (r.exitCode === 1) {
      const paths = r.stdout.split(/\r?\n/).slice(1).filter((l) => l.trim()).join(", ");
      conflicts.push(`Writers disagree: ${paths || "conflicting changes"}`);
    }
  }
  let failed = null;
  for (const argv of plan.argv) {
    const r = await git(deps2, argv, req.repoRoot);
    if (!r.ok) {
      failed = `git ${argv.join(" ")} exited ${r.exitCode ?? "null"}: ${(r.stderr || r.stdout).trim().slice(0, 240)}`;
      break;
    }
  }
  if (failed) {
    return { built: false, branch: plan.snapshotBranch, sha: null, writerBranches: committedBranches, conflicts, detail: failed };
  }
  const head = await git(deps2, ["rev-parse", "HEAD"], req.repoRoot);
  const sha = head.ok ? head.stdout.trim() || null : null;
  for (const w of worktrees) {
    if (!w.deferred || setupFailed.has(w.seatId)) continue;
    for (const argv of reviewWorktreeArgv(plan.snapshotBranch, w.path)) {
      const r = await git(deps2, argv, req.repoRoot);
      if (!r.ok) {
        setupFailed.add(w.seatId);
        await git(deps2, ["checkout", "-q", req.baseBranch], req.repoRoot);
        return { built: false, branch: plan.snapshotBranch, sha, writerBranches: committedBranches, conflicts, detail: `git ${argv.join(" ")} exited ${r.exitCode ?? "null"}: ${(r.stderr || r.stdout).trim().slice(0, 240)}` };
      }
    }
    await excludeBriefDir(deps2, w.path);
  }
  await git(deps2, ["checkout", "-q", req.baseBranch], req.repoRoot);
  return {
    built: true,
    branch: plan.snapshotBranch,
    sha,
    writerBranches: committedBranches,
    conflicts,
    detail: `Built ${plan.snapshotBranch} from ${committedBranches.join(" + ")} on top of ${req.baseBranch}.`
  };
}
async function excludeBriefDir(deps2, worktreePath) {
  if (!deps2.git || !deps2.writeFile) return false;
  const r = await git(deps2, ["rev-parse", "--git-common-dir"], worktreePath);
  if (!r.ok) return false;
  let gitDir = r.stdout.trim();
  if (!gitDir) return false;
  const isAbs = gitDir.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(gitDir);
  if (!isAbs) gitDir = path.resolve(worktreePath, gitDir);
  try {
    const excludePath = path.join(gitDir, "info", "exclude");
    await deps2.writeFile(excludePath, `${BRIEF_DIR}/
`);
    const check = await git(deps2, ["status", "--porcelain"], worktreePath);
    return check.ok && !check.stdout.includes(BRIEF_DIR);
  } catch {
    return false;
  }
}
async function runSeat(req, deps2, a, sessions, wt, binaryExists, resolvedBin, setupFailedSeats, snapshot, briefings, now) {
  const caps = resolveCaps(a.seat.harness).caps;
  const readOnly = a.readOnly || !a.seat.mayWrite;
  const cwd = wt?.path ?? req.repoRoot;
  const branch = wt?.deferred ? snapshot.branch : wt?.branch ?? req.baseBranch;
  const reviewedRef = wt?.deferred ? snapshot.sha ?? snapshot.branch : branch;
  const base = {
    seatId: a.seat.id,
    role: a.seat.role,
    harness: a.seat.harness,
    harnessName: caps.name,
    bin: resolvedBin ?? caps.bins[0] ?? "",
    argv: [],
    cwd,
    branch,
    worktreePath: cwd,
    reviewedRef,
    reviewedSha: wt?.deferred ? snapshot.sha : null,
    wave: a.wave,
    turnsRun: 0,
    sessionId: null,
    continuity: "none",
    exitCode: null,
    durationMs: 0,
    usage: { costUsd: null, tokens: null, turns: null, source: a.seat.harness },
    chargedUsd: 0,
    verified: false,
    verificationDetail: "Not run.",
    git: { measured: false, detail: "Not measured.", additions: 0, deletions: 0, filesChanged: 0 },
    commit: "Never ran, so nothing was committed.",
    warnings: [],
    selfReport: null,
    outputTail: ""
  };
  if (!binaryExists) {
    return { ...base, outcome: "blocked_missing_binary", reason: `${caps.name} is not installed, so this seat never ran. Install: ${caps.install}` };
  }
  if (setupFailedSeats.has(a.seat.id)) {
    return {
      ...base,
      outcome: wt?.deferred ? "review_snapshot_failed" : "failed",
      reason: wt?.deferred ? "This seat's review worktree could not be created, so it never ran. Running it in the base checkout instead would have it review the tree from before the work happened \u2014 the exact mistake the review snapshot exists to prevent." : "This seat's worktree could not be created, so it never ran. Running it anyway would have pointed it at the base checkout and let it overwrite another seat's work."
    };
  }
  if (wt?.deferred && !snapshot.built) {
    return { ...base, outcome: "skipped_nothing_to_review", reason: "No review snapshot exists, so there was no work to review." };
  }
  if (deps2.writeFile && cwd !== req.repoRoot) {
    for (const f of briefings) {
      try {
        await deps2.writeFile(`${cwd}/${BRIEF_DIR}/${f.path}`, f.contents);
      } catch {
      }
    }
  }
  const sessionKey = { seatId: a.seat.id, harness: a.seat.harness, model: a.seat.model, cwd };
  const session = sessions.obtain(sessionKey);
  const channel = a.seat.role === "planner" || a.seat.role === "architect" ? "#architecture" : a.seat.role === "security" ? "#security-audit" : a.seat.mayWrite ? "#implementation-sync" : "#qa-review";
  globalAgentBus.publish({
    channel,
    sender: { seatId: a.seat.id, role: a.seat.role, harness: a.seat.harness, name: caps.name },
    mentions: ["@all"],
    intent: a.seat.role === "planner" || a.seat.role === "architect" ? "proposal" : a.seat.mayWrite ? "proposal" : "verification",
    content: `[Wave ${a.wave}] Commencing execution in ${cwd} (${branch}).`
  });
  const turns = [{ prompt: a.prompt, turn: 1 }];
  if (a.followUp) turns.push({ prompt: a.followUp, turn: 2 });
  let last = null;
  let continuity = "none";
  let chargedTotal = 0;
  let usage = base.usage;
  const warnings = [];
  let lastArgv = [];
  let lastSummary = "";
  for (const t of turns) {
    const admission = req.ledger.admissionError(now());
    if (admission) {
      return { ...base, argv: lastArgv, sessionId: session.sessionId, continuity, turnsRun: t.turn - 1, chargedUsd: chargedTotal, usage, warnings, outcome: "blocked_budget", reason: `Turn ${t.turn} was never started: ${admission}` };
    }
    const composed = composeSeatArgv(a.seat, {
      prompt: t.turn === 1 ? t.prompt : followUpPrompt({ continuity, harnessName: caps.name, previousSummary: lastSummary, instruction: t.prompt }),
      cwd,
      readOnly,
      sessionId: session.sessionId,
      turn: t.turn
    });
    lastArgv = composed.argv;
    warnings.push(...composed.warnings.filter((w) => !warnings.includes(w)));
    const timeoutSecs = a.seat.timeoutSecs > 0 ? a.seat.timeoutSecs : 600;
    const enforced = await withDeadline(
      () => deps2.cliInvoke({ bin: resolvedBin ?? composed.bin, argv: composed.argv, env: composed.env, cwd, timeoutSecs }),
      timeoutSecs * 1e3,
      now
    );
    const res = enforced.value;
    const durationMs = res ? res.durationMs : enforced.elapsedMs;
    if (enforced.outcome === "timeout" || res?.timedOut) {
      req.ledger.recordCapped(a.seat.id, "timeout", `${caps.name} exceeded its ${timeoutSecs}s deadline on turn ${t.turn}. The child had to be killed; MJ cannot assume it stopped cleanly.`);
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity,
        turnsRun: t.turn - 1,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        outputTail: tail(res?.stdout ?? ""),
        outcome: "timeout",
        reason: `Turn ${t.turn} ran past its ${timeoutSecs}s deadline and was killed. Partial work may be left in the worktree.`
      };
    }
    if (!res) {
      return { ...base, argv: composed.argv, sessionId: session.sessionId, continuity, turnsRun: t.turn - 1, chargedUsd: chargedTotal, usage, warnings, outcome: "failed", reason: `Turn ${t.turn} produced no result: ${enforced.detail}` };
    }
    last = res;
    const reportedId = parseSessionId(a.seat.harness, res.stdout);
    if (reportedId) continuity = "session";
    sessions.recordTurn(sessionKey, reportedId, t.prompt);
    const resumeProblem = detectResumeFailure(res.stdout + "\n" + res.stderr);
    if (resumeProblem && t.turn > 1) {
      sessions.markResumeFailed(sessionKey);
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity: "none",
        turnsRun: t.turn - 1,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        exitCode: res.exitCode,
        outputTail: tail(res.stdout || res.stderr),
        outcome: "resume_failed",
        reason: `Turn ${t.turn} could not resume the session: ${resumeProblem}. The follow-up never ran, so the repair was not applied.`
      };
    }
    const parsed = parseReportedUsage(a.seat.harness, res.stdout);
    usage = parsed;
    const charge = req.ledger.charge(parsed);
    chargedTotal += charge.chargedUsd;
    if (charge.reason && !charge.reason.startsWith("Charged $0.0000")) warnings.push(charge.reason);
    if (charge.breach) req.ledger.recordCapped(a.seat.id, charge.breach === "mission_cap" ? "mission_cap" : "cost_cap", charge.reason);
    lastSummary = summariseOutput(res.stdout);
    if (deps2.onTurn) {
      deps2.onTurn({ ...base, argv: composed.argv, turnsRun: t.turn, sessionId: session.sessionId, continuity, outcome: "completed", reason: "", exitCode: res.exitCode, durationMs, usage, chargedUsd: chargedTotal, outputTail: tail(res.stdout), commit: "", warnings, selfReport: lastSummary });
    }
    if (res.exitCode !== 0 || reportsError(res.stdout)) {
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity,
        turnsRun: t.turn,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        exitCode: res.exitCode,
        selfReport: lastSummary,
        // stdout when there is any, stderr when that is all the CLI produced. Throwing stderr away is
        // what once hid `Error: Session not found`.
        outputTail: tail(res.stdout || res.stderr),
        outcome: "failed",
        reason: res.exitCode !== 0 ? `${caps.name} exited ${res.exitCode} on turn ${t.turn}. ${res.stderr.trim() ? `It said: ${tail(res.stderr, 500)}` : "It wrote nothing to stderr."}` : `${caps.name} exited 0 but reported an error in its own output, so MJ treats it as a failure rather than a success.`
      };
    }
  }
  let verified = false;
  let verificationDetail = "No verification command is configured for this mission, so nothing was checked. This seat's work is UNVERIFIED.";
  if (deps2.verify) {
    const v = await deps2.verify(cwd);
    if (v.exitCode === 0) {
      verified = true;
      verificationDetail = `The repository's own check ran in ${cwd} and exited 0.`;
    } else if (v.exitCode === null) {
      verificationDetail = "The verification command did not run at all, so this is NOT a failed check \u2014 it is an unmeasured one. The seat is unverified either way.";
    } else {
      verificationDetail = `The repository's own check ran and FAILED (exit ${v.exitCode}). ${tail(v.stdout || v.stderr, 600)}`;
    }
  }
  const gitEv = await collectGitEvidence(deps2.git, cwd);
  let commitDetail = readOnly ? "Read-only seat; nothing to commit." : "No git runner, so the work could not be committed.";
  if (deps2.git && !readOnly) {
    await git(deps2, ["add", "-A"], cwd);
    const commit = await git(deps2, ["-c", "user.email=mj@mj.desktop", "-c", "user.name=MJ", "commit", "-q", "-m", `mj(${a.seat.id}): ${req.missionSlug}`], cwd);
    commitDetail = commit.ok ? `Committed on ${branch}.` : commit.exitCode === null ? "Could not run git commit." : /nothing to commit|no changes added/i.test(commit.stderr + commit.stdout) ? "Nothing to commit \u2014 this seat changed no files." : `git commit exited ${commit.exitCode}: ${(commit.stderr || commit.stdout).trim().slice(0, 200)}`;
  }
  const finalRecord = {
    ...base,
    argv: lastArgv,
    sessionId: session.sessionId,
    continuity,
    turnsRun: turns.length,
    chargedUsd: chargedTotal,
    usage,
    warnings,
    durationMs: last?.durationMs ?? 0,
    exitCode: last?.exitCode ?? null,
    verified,
    verificationDetail,
    git: gitEv,
    commit: commitDetail,
    selfReport: lastSummary,
    outputTail: tail(last?.stdout ?? ""),
    outcome: "completed",
    reason: verified ? "Completed and verified by the repository's own check." : "Completed, but not verified \u2014 see verificationDetail."
  };
  if (!readOnly && commitDetail.includes("Committed on")) {
    globalReputationLedger.recordOutcome(a.seat.harness, { verifiedCommit: true });
    globalAgentBus.publish({
      channel: "#implementation-sync",
      sender: { seatId: a.seat.id, role: a.seat.role, harness: a.seat.harness, name: caps.name },
      mentions: ["@reviewer", "@architect"],
      intent: "handoff",
      content: `[Wave ${a.wave}] Changes committed on ${branch}: ${commitDetail}`
    });
    globalAgentBus.writeBlackboard(`commits.${a.seat.id}`, `Worktree: ${cwd}
Branch: ${branch}
${commitDetail}`, a.seat.id, "contract");
  } else if (readOnly) {
    globalReputationLedger.recordOutcome(a.seat.harness, { accurateReview: true });
    globalAgentBus.publish({
      channel: "#qa-review",
      sender: { seatId: a.seat.id, role: a.seat.role, harness: a.seat.harness, name: caps.name },
      mentions: ["@all"],
      intent: "verification",
      content: `[Wave ${a.wave}] Review finished on ${reviewedRef}. Verdict: ${lastSummary || (verified ? "VERIFIED_PASS" : "DONE")}`
    });
    globalAgentBus.writeBlackboard(`qa.verdict.${a.seat.id}`, `Ref: ${reviewedRef}
Verdict: ${lastSummary || (verified ? "VERIFIED_PASS" : "DONE")}
Verified: ${verified}`, a.seat.id, "test_criteria");
  }
  return finalRecord;
}
async function collectGitEvidence(gitRunner, cwd) {
  if (!gitRunner) return { measured: false, detail: "No git runner is available, so MJ cannot say what changed. This is not a clean tree \u2014 it is an unmeasured one.", additions: 0, deletions: 0, filesChanged: 0 };
  const api = gitApi(gitRunner);
  const status = await api.status(cwd);
  if (!status.ok) return { measured: false, detail: `git status failed: ${status.reason ?? "unknown reason"}`, additions: 0, deletions: 0, filesChanged: 0 };
  const diff = await api.diff(cwd);
  if (!diff.ok || !diff.summary) return { measured: false, detail: `git diff failed: ${diff.reason ?? "unknown reason"}`, additions: 0, deletions: 0, filesChanged: 0 };
  const files = diff.summary.files;
  return {
    measured: true,
    detail: files.length === 0 ? "git reports no changes in this worktree." : `${files.length} file(s) changed: ${files.map((f) => f.path).slice(0, 8).join(", ")}${files.length > 8 ? ", \u2026" : ""}`,
    additions: diff.summary.totalAdditions,
    deletions: diff.summary.totalDeletions,
    filesChanged: files.length
  };
}
function reportsError(raw) {
  for (const line of raw.split(/\r?\n/).reverse()) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (typeof o.is_error === "boolean") return o.is_error;
    } catch {
    }
    break;
  }
  return /"is_error"\s*:\s*true/.test(raw);
}
function summariseOutput(raw) {
  const texts = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (typeof o.result === "string") texts.push(o.result);
      else if (o.part && typeof o.part === "object") {
        const p = o.part;
        if (p.type === "text" && typeof p.text === "string") texts.push(p.text);
      }
    } catch {
    }
  }
  if (texts.length === 0) return raw.trim().slice(-800);
  return texts.join("\n").trim().slice(-800);
}
function tail(s, n = OUTPUT_TAIL_CHARS) {
  const t = s.trimEnd();
  return t.length > n ? `\u2026(truncated ${t.length - n} chars)\u2026
${t.slice(-n)}` : t;
}
function unrunRecord(a, wt, outcome, reason) {
  const caps = resolveCaps(a.seat.harness).caps;
  return {
    seatId: a.seat.id,
    role: a.seat.role,
    harness: a.seat.harness,
    harnessName: caps.name,
    bin: caps.bins[0] ?? "",
    argv: [],
    cwd: wt?.path ?? "",
    branch: wt?.branch ?? "",
    worktreePath: wt?.path ?? "",
    reviewedRef: "",
    reviewedSha: null,
    wave: a.wave,
    turnsRun: 0,
    sessionId: null,
    continuity: "none",
    outcome,
    reason,
    exitCode: null,
    durationMs: 0,
    usage: { costUsd: null, tokens: null, turns: null, source: a.seat.harness },
    chargedUsd: 0,
    verified: false,
    verificationDetail: "Never ran, so nothing was verified.",
    git: { measured: false, detail: "Never ran, so nothing was measured.", additions: 0, deletions: 0, filesChanged: 0 },
    commit: "Never ran, so nothing was committed.",
    warnings: [],
    selfReport: null,
    outputTail: ""
  };
}
function buildSummary(o) {
  const ran = o.seats.filter((s) => s.turnsRun > 0).length;
  const parts = [];
  parts.push(`${ran} of ${o.seats.length} seats ran real CLI invocations; ${o.verifiedCount} were verified by the repository's own check.`);
  if (o.snapshot.built) parts.push(`Reviewers ran against snapshot ${o.snapshot.sha ? o.snapshot.sha.slice(0, 8) : o.snapshot.branch}.`);
  else if (o.snapshot.writerBranches.length === 0) parts.push("No review snapshot was built because no writer committed anything.");
  if (o.spentUsd > 0) parts.push(`Reported spend $${o.spentUsd.toFixed(4)}.`);
  else parts.push("No cost was reported by any CLI, so the true spend is unknown rather than zero.");
  if (o.notRun.length) parts.push(`${o.notRun.length} seat(s) never ran: ${o.notRun.map((n) => n.seatId).join(", ")}.`);
  if (o.briefings.some((f) => f.writtenTo.length === 0)) parts.push("At least one briefing could not be written, so some agents ran without the mission brief.");
  if (o.status === "blocked") parts.push("Nothing completed \u2014 this run produced no usable work.");
  return parts.join(" ");
}

// probe/mergeGate.test.ts
function sh(args, cwd) {
  try {
    const out = execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e;
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}
function makeRepo() {
  const repo = fs.mkdtempSync(path2.join(os.tmpdir(), "mjgate-"));
  fs.writeFileSync(path2.join(repo, "app.js"), "module.exports = { v: 1 };\n");
  fs.writeFileSync(path2.join(repo, "package.json"), JSON.stringify({ name: "gate-fixture", version: "1.0.0" }, null, 2));
  sh(["git", "init", "-q", "."], repo);
  sh(["git", "config", "user.email", "mj@mj.desktop"], repo);
  sh(["git", "config", "user.name", "MJ"], repo);
  sh(["git", "add", "-A"], repo);
  sh(["git", "commit", "-qm", "initial"], repo);
  const branch = sh(["git", "symbolic-ref", "--short", "HEAD"], repo).out.trim() || "master";
  return { repo, branch };
}
var seat2 = (id, role, harness) => ({
  id,
  role,
  harness,
  model: null,
  mayWrite: role === "coder",
  maxRisk: role === "coder" ? "MEDIUM" : "LOW",
  timeoutSecs: 120,
  maxTurns: 2,
  instructions: role === "coder" ? "Implement the change." : "Review the diff against the snapshot."
});
function request(repo, branch, team, over = {}) {
  return {
    team,
    assignments: team.seats.map((s) => ({
      seat: s,
      prompt: `Objective for ${s.role}.`,
      wave: s.role === "coder" ? 1 : 2,
      readOnly: s.role !== "coder"
    })),
    repoRoot: repo,
    baseBranch: branch,
    missionSlug: `gate-${Math.random().toString(36).slice(2, 8)}`,
    objective: "Gate enforcement fixture.",
    ledger: new CapLedger({ maxCostUsd: 5, maxTurns: 10, timeoutMs: 6e4 }, Date.now()),
    testCommand: ["node", "-e", "process.exit(0)"],
    ...over
  };
}
function deps() {
  return {
    resolveBin: async (bin) => `/usr/local/bin/${bin}`,
    cliInvoke: async (req) => {
      const isWriter = req.argv.includes("acceptEdits") || req.argv.includes("workspace-write") || req.argv.includes("--yes");
      if (isWriter) {
        fs.writeFileSync(path2.join(req.cwd, "feature.js"), "module.exports = { feature: true };\n");
        fs.writeFileSync(path2.join(req.cwd, "app.js"), "module.exports = { v: 2 };\n");
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({ type: "result", is_error: false, result: isWriter ? "Implemented." : "CORRECT: reviewed against snapshot.", total_cost_usd: 0.01, usage: { input_tokens: 100, output_tokens: 40 } }),
        stderr: "",
        durationMs: 5,
        timedOut: false
      };
    },
    git: async (args, cwd) => {
      const r = sh(["git", ...args], cwd);
      return { ok: r.code === 0, stdout: r.out, stderr: "", exitCode: r.code, reason: null };
    },
    writeFile: async (p, contents) => {
      fs.mkdirSync(path2.dirname(p), { recursive: true });
      fs.writeFileSync(p, contents);
    },
    verify: async (cwd) => {
      const r = sh(["node", "-e", "process.exit(0)"], cwd);
      return { exitCode: r.code ?? 0, stdout: r.out, stderr: "", durationMs: 3, timedOut: false };
    }
  };
}
var crossTeam = (reviewHarness) => ({
  id: `t.gate.${String(reviewHarness)}`,
  name: "Gate fixture",
  description: "writer + reviewer",
  schemaVersion: 1,
  seats: [seat2("impl", "coder", "claude"), seat2("reviewer", "reviewer", reviewHarness)]
});
describe("merge gate \u2014 STRICT enforcement inside the runtime", () => {
  it("cross-harness review PASSES, binds evidence to the snapshot sha, and allows the merge", async () => {
    const { repo, branch } = makeRepo();
    const report = await executeTeam(request(repo, branch, crossTeam("codex"), { gatePolicy: "STRICT" }), deps());
    assert.equal(report.status, "completed");
    assert.equal(report.gate.status, "PASS");
    assert.equal(report.gate.tier, "cross-vendor");
    assert.ok(report.gate.evidence, "verdict carries evidence");
    assert.ok(report.gate.evidence?.snapshotBuilt);
    assert.ok(report.gate.evidence?.snapshotSha);
    const rev = report.gate.evidence?.reviewedBy.find((r) => r.seatId === "reviewer");
    assert.ok(rev, "reviewer appears in the evidence");
    assert.equal(rev?.matchesSnapshot, true);
    assert.equal(rev?.reviewedSha, report.snapshot.sha);
    assert.equal(report.merge.gate.allowed, true);
    assert.equal(report.merge.gate.overrideRequired, false);
    assert.ok(report.merge.candidates.length >= 1, "writer produced a merge candidate");
  });
  it("same-harness 'review' is BLOCKED and the merge with it (STRICT)", async () => {
    const { repo, branch } = makeRepo();
    const report = await executeTeam(request(repo, branch, crossTeam("claude"), { gatePolicy: "STRICT" }), deps());
    assert.equal(report.gate.status, "BLOCKED");
    assert.equal(report.gate.tier, "self-verification");
    assert.equal(report.gate.crossVerified, false);
    assert.equal(report.merge.gate.allowed, false, "the gate blocks the merge path");
    assert.equal(report.merge.gate.overrideRequired, true, "only a recorded human override can unlock it");
    assert.match(report.merge.gate.reason, /STRICT/);
  });
  it("ADVISORY keeps the merge open but records the failure in the merge reason", async () => {
    const { repo, branch } = makeRepo();
    const report = await executeTeam(request(repo, branch, crossTeam("claude"), { gatePolicy: "ADVISORY" }), deps());
    assert.equal(report.gate.status, "FAIL", "self-verification is still a failure, never silent");
    assert.equal(report.merge.gate.allowed, true);
    assert.equal(report.merge.gate.overrideRequired, false);
    assert.match(report.merge.gate.reason, /ADVISORY/);
  });
  it("a rejecting verifier fails the gate and blocks the merge even cross-harness", async () => {
    const { repo, branch } = makeRepo();
    let calls = 0;
    const d = {
      ...deps(),
      cliInvoke: async (req) => {
        calls += 1;
        const isWriter = req.argv.includes("acceptEdits") || req.argv.includes("workspace-write") || req.argv.includes("--yes");
        if (isWriter) fs.writeFileSync(path2.join(req.cwd, "feature.js"), "module.exports = { feature: true };\n");
        return { exitCode: isWriter ? 0 : 1, stdout: "", stderr: isWriter ? "" : "review failed", durationMs: 4, timedOut: false };
      }
    };
    const report = await executeTeam(request(repo, branch, crossTeam("codex"), { gatePolicy: "STRICT" }), d);
    assert.ok(calls >= 2);
    assert.equal(report.gate.status, "FAIL");
    assert.equal(report.merge.gate.allowed, false);
    assert.match(report.gate.reasons.join("\n"), /rejected/);
  });
});
