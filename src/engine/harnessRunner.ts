import { composeNodePrompt } from "../domain/composer";
import { defaultHarness, HARNESS_BY_ID, type HarnessId } from "../domain/harness";
import type { NodeInstance } from "../domain/types";
import { ipc } from "../ipc/client";
import { detectHost } from "../app/desktop";

export interface HarnessRunResult {
  text: string;
  via: string;
  harness: HarnessId;
  code: number | null;
}

export function harnessOf(node: NodeInstance): HarnessId {
  const raw = String(node.config.harness ?? node.providers[0]?.cliProviderId ?? defaultHarness());
  if (HARNESS_BY_ID.has(raw as HarnessId)) return raw as HarnessId;
  return defaultHarness();
}

function crewIds(node: NodeInstance): HarnessId[] {
  const raw = String(node.config.crew ?? "");
  const listed = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s): s is HarnessId => HARNESS_BY_ID.has(s as HarnessId) && s !== "llm");
  if (node.definitionId === "agent.crew" && listed.length === 0) {
    return ["claude", "codex", "opencode"];
  }
  return listed;
}

async function invokeOne(hid: HarnessId, prompt: string, timeout: number, cwd?: string): Promise<HarnessRunResult> {
  const spec = HARNESS_BY_ID.get(hid)!;
  if (hid === "llm") {
    throw new Error("LLM path is handled by the scheduler, not the harness runner.");
  }
  if (detectHost() !== "tauri") {
    throw new Error(
      `${spec.name} cannot run in a browser preview. Build the native MJ app (see INSTALL-ON-LAPTOP.md), install ${spec.name} (${spec.install}), then Run.`,
    );
  }
  const detected = await ipc.cliProvidersDetect();
  const hit = detected.find((d) => d.id === hid || spec.bins.includes(d.invocation) || spec.bins.includes(d.id));
  if (!hit?.installed) {
    throw new Error(`${spec.name} is not on PATH. Install it locally, then restart MJ.\n${spec.install}`);
  }
  const r = (await ipc.cliInvoke(hid, prompt, cwd, timeout)) as { stdout?: string; stderr?: string; code?: number | null };
  const text = String(r.stdout || r.stderr || "").trim();
  if (!text) {
    throw new Error(`${spec.name} returned empty output (code ${r.code ?? "?"}). Auth the CLI: ${spec.install}`);
  }
  return { text, via: spec.name, harness: hid, code: r.code ?? 0 };
}

export async function runHarnessAgent(
  node: NodeInstance,
  _collected: Record<string, unknown>,
  composed: ReturnType<typeof composeNodePrompt>,
  cwd?: string,
): Promise<HarnessRunResult> {
  const prompt = [
    composed.system,
    "",
    composed.user,
    "",
    "You are a real coding agent, not a Zapier step. Use tools. Edit files. Run commands. Return the deliverable.",
  ].join("\n");
  const timeout = Math.max(60, Math.round((node.contract.timeoutMs || 180000) / 1000));
  const team = crewIds(node);

  if (team.length > 0) {
    const parts: string[] = [];
    const used: string[] = [];
    const failed: string[] = [];
    for (const hid of team) {
      try {
        const r = await invokeOne(hid, prompt, timeout, cwd);
        used.push(r.via);
        parts.push(`## ${r.via}\n\n${r.text}`);
      } catch (e) {
        failed.push(`${hid}: ${e instanceof Error ? e.message : String(e)}`);
        parts.push(`## ${hid} — FAILED\n\n${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (used.length === 0) {
      throw new Error(`Crew ran nobody. Install at least one CLI.\n${failed.join("\n")}`);
    }
    return {
      text: parts.join("\n\n---\n\n"),
      via: `crew:${used.join("+")}`,
      harness: harnessOf(node),
      code: 0,
    };
  }

  return invokeOne(harnessOf(node), prompt, timeout, cwd);
}
