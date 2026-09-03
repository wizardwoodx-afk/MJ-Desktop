import { composeNodePrompt } from "../domain/composer";
import { defaultHarness, HARNESS_BY_ID, isCustomHarness, type HarnessId } from "../domain/harness";
import type { NodeInstance } from "../domain/types";
import { ipc } from "../ipc/client";
import { detectHost } from "../app/desktop";

export interface HarnessRunResult {
  text: string;
  via: string;
  /** A built-in HarnessId, or a `custom:<slug>` user-registered harness. */
  harness: string;
  code: number | null;
}

/**
 * V11.6: the harness a node runs. Built-in ids resolve against the registry; `custom:<slug>`
 * ids (registered in Teams -> Connect) are passed through — the Rust side owns their
 * bin/argv expansion, so a custom harness needs nothing else from TypeScript.
 */
export function harnessOf(node: NodeInstance): string {
  const raw = String(node.config.harness ?? node.providers[0]?.cliProviderId ?? defaultHarness());
  if (HARNESS_BY_ID.has(raw as HarnessId) || isCustomHarness(raw)) return raw;
  return defaultHarness();
}

function crewIds(node: NodeInstance): string[] {
  const raw = String(node.config.crew ?? "");
  const listed = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => (HARNESS_BY_ID.has(s as HarnessId) || isCustomHarness(s)) && s !== "llm");
  if (node.definitionId === "agent.crew" && listed.length === 0) {
    return ["claude", "codex", "opencode"];
  }
  return listed;
}

async function invokeOne(hid: string, prompt: string, timeout: number, cwd?: string): Promise<HarnessRunResult> {
  if (hid === "llm") {
    throw new Error("LLM path is handled by the scheduler, not the harness runner.");
  }
  const custom = isCustomHarness(hid);
  const spec = custom ? null : HARNESS_BY_ID.get(hid as HarnessId);
  if (!spec && !custom) {
    throw new Error(`Unknown harness '${hid}'. Pick one in Teams -> Connect.`);
  }
  const label = custom ? `Custom harness '${hid.slice("custom:".length)}'` : spec!.name;
  const installHint = custom ? "Teams -> Connect -> your custom harness" : spec!.install;
  if (detectHost() !== "tauri") {
    throw new Error(
      `${label} cannot run in a browser preview. Build the native MJ app (see INSTALL-ON-LAPTOP.md), install ${label} (${installHint}), then Run.`,
    );
  }
  if (custom) {
    // The Rust side resolves custom:<slug> -> bin + argv from its own saved registry;
    // here we only check the binary is actually present on this machine.
    const list = await ipc.customHarnessList();
    const entry = list.find((h) => h.id === hid);
    if (!entry) {
      throw new Error(`${label} is not registered anymore. Re-add it in Teams -> Connect.`);
    }
    if (!entry.installed) {
      throw new Error(`${label}: binary '${entry.bin}' is not on PATH. Install it, or fix the binary in Teams -> Connect.`);
    }
  } else {
    const detected = await ipc.cliProvidersDetect();
    const hit = detected.find((d) => d.id === hid || spec!.bins.includes(d.invocation) || spec!.bins.includes(d.id));
    if (!hit?.installed) {
      throw new Error(`${spec!.name} is not on PATH. Install it locally, then restart MJ.\n${spec!.install}`);
    }
  }
  const r = (await ipc.cliInvoke(hid, prompt, cwd, timeout)) as { stdout?: string; stderr?: string; code?: number | null };
  const text = String(r.stdout || r.stderr || "").trim();
  if (!text) {
    throw new Error(`${label} returned empty output (code ${r.code ?? "?"}). Auth the CLI: ${installHint}`);
  }
  return { text, via: custom ? `${hid.slice("custom:".length)} (custom)` : spec!.name, harness: hid, code: r.code ?? 0 };
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
