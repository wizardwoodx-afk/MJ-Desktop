/**
 * In-process Hermes-class runtime for every agent node.
 *
 * Vendored Hermes Agent (Nous) is the model: session, skills, memory, tools, bounded loop.
 * We do not copy 200 Python files into 200 nodes. We instantiate ONE runtime per node
 * with that node's identity (role pack) and permission-gated tools.
 *
 * Backends:
 *   harness=hermes → this loop (LLM or local Ollama as the model)
 *   harness=claude|codex|… → those CLIs already have their own tool loop; we inject identity
 */
import { composeNodePrompt } from "../domain/composer";
import type { NodeInstance } from "../domain/types";
import { ipc, nodeKeyOf } from "../ipc/client";
import { detectHost } from "../app/desktop";
import { harnessOf, runHarnessAgent } from "./harnessRunner";

export interface HermesRun {
  text: string;
  via: string;
  steps: number;
  toolsUsed: string[];
}

const TOOL_RE = /```tool\s*([\s\S]*?)```/i;

function toolCatalog(node: NodeInstance): string {
  const p = node.permissions;
  const lines = [
    "You are a Hermes-class agent. You may call tools by emitting a fenced block:",
    "```tool",
    '{"name":"finish","args":{"output":"final deliverable"}}',
    "```",
    "Available tools:",
    '- finish {output}  — end the loop with the deliverable',
    '- remember {content, kind?} — write memory (no secrets)',
  ];
  if (p.skillWrite) lines.push('- skill_write {name, procedure} — persist a SKILL.md-shaped procedure');
  if (p.filesystemRead) lines.push('- fs_read {path}  - fs_list {path}');
  if (p.filesystemWrite) lines.push('- fs_write {path, content}');
  if (p.terminalExecute) lines.push('- shell {program, args, cwd?}');
  if (p.mcpUse) lines.push('- mcp {serverId, tool, arguments}');
  if (p.browserControl) {
    lines.push('- browser_navigate {url}  — load a page (fails closed if no browser can be started)');
    lines.push('- browser_act {action, selector?, value?, key?, url?}  — act on the live page');
    lines.push('    actions: click | type | fill | select | hover | check | uncheck | clear | press | wait | scroll | keyboard | evaluate | extract | html | title | back | forward | reload');
    lines.push('    extract {selector} returns visible text; evaluate {value} runs JS and returns its result.');
  }
  lines.push("Do not pretend a tool succeeded. If a tool errors, change approach or finish with the failure.");
  return lines.join("\n");
}

async function execTool(node: NodeInstance, name: string, args: Record<string, unknown>, nodeKey: string): Promise<string> {
  const p = node.permissions;
  switch (name) {
    case "finish":
      return String(args.output ?? "");
    case "remember": {
      if (!p.memoryWrite && !node.memoryEnabled) return "memory disabled";
      await ipc.memoryAdd(nodeKey, String(args.kind ?? "working"), String(args.content ?? ""), ["hermes"], 0.6);
      return "remembered";
    }
    case "skill_write": {
      if (!p.skillWrite) return "skillWrite not granted";
      await ipc.skillUpsert({
        nodeKey,
        name: String(args.name ?? "skill"),
        description: String(args.description ?? args.name ?? "skill"),
        procedure: String(args.procedure ?? ""),
        origin: "learned",
      });
      return "skill saved";
    }
    case "fs_read": {
      if (!p.filesystemRead) return "filesystemRead not granted";
      return ipc.fsRead(String(args.path ?? ""));
    }
    case "fs_list": {
      if (!p.filesystemRead) return "filesystemRead not granted";
      return JSON.stringify(await ipc.fsList(String(args.path ?? ".")), null, 2);
    }
    case "fs_write": {
      if (!p.filesystemWrite) return "filesystemWrite not granted";
      await ipc.fsWrite(String(args.path ?? ""), String(args.content ?? ""));
      return "written";
    }
    case "shell": {
      if (!p.terminalExecute) return "terminalExecute not granted";
      const r = await ipc.shellExec(String(args.program ?? ""), (args.args as string[]) ?? [], args.cwd as string | undefined, 60);
      return JSON.stringify(r);
    }
    case "mcp": {
      if (!p.mcpUse) return "mcpUse not granted";
      const r = await ipc.mcpCall(String(args.serverId ?? ""), String(args.tool ?? ""), args.arguments ?? {});
      return JSON.stringify(r);
    }
    case "browser_navigate": {
      if (!p.browserControl) return "browserControl not granted";
      // Keyed on the node, so the whole loop drives ONE tab: repeated navigations keep history,
      // cookies and scroll position, instead of opening (and leaking) a context per call.
      const sess = await ipc.browserSessionCreate(nodeKey) as { sessionId?: string | null; notAttached?: boolean };
      // V7 fix (bug V): this used to serialise whatever came back, and the Rust side fabricated a
      // page title, so the model was handed a description of a page nobody had loaded. Fail closed.
      if (!sess.sessionId) return `browser_navigate failed: ${String((sess as { reason?: string }).reason ?? "no browser session")}`;
      const r = await ipc.browserNavigate(String(sess.sessionId), String(args.url ?? "")) as { ok?: boolean; notAttached?: boolean; reason?: string };
      if (r.ok === false || r.notAttached) return `browser_navigate failed: nothing was fetched. ${String(r.reason ?? "")}`.trim();
      return JSON.stringify(r);
    }
    case "browser_act": {
      if (!p.browserControl) return "browserControl not granted";
      const action = String(args.action ?? "").trim();
      if (!action) {
        return "browser_act needs an `action` (click, type, fill, select, extract, evaluate, wait, scroll, keyboard, back, forward, reload, html, title).";
      }
      const sess = await ipc.browserSessionCreate(nodeKey) as { sessionId?: string | null };
      if (!sess.sessionId) {
        return `browser_act failed: ${String((sess as { reason?: string }).reason ?? "no browser session")}`;
      }
      const r = await ipc.browserAct({ ...args, sessionId: String(sess.sessionId) }) as { ok?: boolean; reason?: string };
      if (r.ok === false) return `browser_act ${action} failed: ${String(r.reason ?? "")}`.trim();
      return JSON.stringify(r);
    }
    default:
      return `unknown tool: ${name}`;
  }
}

function parseTool(text: string): { name: string; args: Record<string, unknown> } | null {
  const m = text.match(TOOL_RE);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]) as { name?: string; args?: Record<string, unknown> };
    if (!j.name) return null;
    return { name: j.name, args: j.args ?? {} };
  } catch {
    return null;
  }
}

export async function runHermesNode(
  node: NodeInstance,
  collected: Record<string, unknown>,
  composed: ReturnType<typeof composeNodePrompt>,
  execId: string,
  workflowId: string,
): Promise<HermesRun> {
  const hid = harnessOf(node);
  const teamKey = String(node.config.teamMemoryKey ?? "");
  const nodeKey = teamKey || nodeKeyOf(workflowId, node.id);

  // Coding CLIs are already full agents. Inject identity; do not wrap a second loop.
  if (hid !== "hermes" && hid !== "llm") {
    const ran = await runHarnessAgent(node, collected, composed);
    return { text: ran.text, via: ran.via, steps: 1, toolsUsed: [hid] };
  }

  if (hid === "hermes" && detectHost() === "tauri") {
    const detected = await ipc.cliProvidersDetect();
    const hermesCli = detected.find((d) => d.id === "hermes" && d.installed);
    if (hermesCli) {
      const ran = await runHarnessAgent(
        { ...node, config: { ...node.config, harness: "hermes" } },
        collected,
        composed,
      );
      return { text: ran.text, via: "hermes-cli", steps: 1, toolsUsed: ["hermes"] };
    }
  }

  const toolsUsed: string[] = [];
  const transcript: Array<{ role: string; content: string }> = [
    { role: "user", content: `${composed.user}\n\n${toolCatalog(node)}` },
  ];
  let finalText = "";
  const maxSteps = Math.max(1, Number(node.config.maxToolSteps ?? 8));

  for (let step = 0; step < maxSteps; step++) {
    const provider = await resolveLlm(node);
    if (!provider) {
      throw new Error(
        `${node.title} is a Hermes-class agent. Install Claude Code/Codex/OpenCode and set harness to that CLI, or set harness=llm/hermes and save a provider key / run Ollama.`,
      );
    }
    const r = await ipc.llmChat({
      provider: provider.provider,
      base_url: provider.base_url,
      model: provider.model,
      messages: transcript,
      system: composed.system,
      max_tokens: 1800,
      temperature: 0.2,
      secret_ref: provider.secret_ref,
    }) as { content?: string };
    const content = String(r.content ?? "").trim();
    if (!content) throw new Error("Hermes loop: empty model content");
    transcript.push({ role: "assistant", content });
    const call = parseTool(content);
    if (!call || call.name === "finish") {
      finalText = call?.name === "finish" ? String(call.args.output ?? content) : content;
      break;
    }
    toolsUsed.push(call.name);
    let result: string;
    try {
      result = await execTool(node, call.name, call.args, nodeKey);
    } catch (e) {
      result = `tool error: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (call.name === "finish") {
      finalText = result || content;
      break;
    }
    transcript.push({ role: "user", content: `TOOL RESULT (${call.name}):\n${result.slice(0, 8000)}` });
    finalText = content;
  }

  if (!finalText.trim()) throw new Error("Hermes loop ended with empty deliverable.");
  await ipc.eventEmit(execId, "HERMES_LOOP", "INFO", node.id, { steps: transcript.length, toolsUsed });
  return { text: finalText, via: `hermes:${hid}`, steps: Math.floor(transcript.length / 2), toolsUsed };
}

async function resolveLlm(node: NodeInstance): Promise<{
  provider: string; model: string; secret_ref: string; base_url?: string;
} | null> {
  const p = node.providers[0];
  const kind = p?.kind && p.kind !== "cli-agent" ? p.kind : "openai";
  const model = p?.model ?? (kind === "anthropic" ? "claude-sonnet-4" : kind === "ollama" ? "llama3.1" : "gpt-4.1");
  const secret_ref = p?.secretRef ?? `provider.${kind === "ollama" ? "ollama.local" : `${kind}.production`}`;
  if (kind === "ollama") {
    return { provider: "ollama", model, secret_ref, base_url: String(node.config.endpoint ?? "http://127.0.0.1:11434") };
  }
  const exists = await ipc.secretExists([secret_ref]);
  if (!exists[secret_ref]) {
    const ollama = await ipc.secretExists(["provider.ollama.local"]);
    if (ollama["provider.ollama.local"]) {
      return { provider: "ollama", model: "llama3.1", secret_ref: "provider.ollama.local", base_url: "http://127.0.0.1:11434" };
    }
    return null;
  }
  return { provider: kind, model, secret_ref };
}
