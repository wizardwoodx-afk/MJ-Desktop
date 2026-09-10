/**
 * M3 — Vouch Harbor's MCP capability router (16.2.0).
 *
 * Vouch Harbor speaks MCP (Model Context Protocol, JSON-RPC 2.0 over stdio)
 * as a SERVER: an MCP client (Claude Desktop, an agent harness, your own
 * tooling) can list and call the product's capabilities.
 *
 * THE ROUTING RULE (the whole point of M3):
 *   `tools/call` never executes anything itself. Every call is routed into
 *   `runVouchToolCall` — the SAME governed path the chat face uses:
 *   authorize → SIMULATE (risky) → HUMAN GATE (risky) → call → VOUCH
 *   (receipt). The MCP face has no other route to the tools, so it cannot
 *   bypass the pipeline. Refusals, denials and errors mint receipts too —
 *   the audit trail is never optional.
 *
 * Gate semantics: a risky call returns immediately with `pending` plus its
 * approval handle (an MCP tool call must not block for a human). The human
 * decides through the Vouch UI or through this server's own
 * `approve_action` / `deny_action` tools; `call_status` reports
 * gated → running → done. Every COMPLETED call carries a receipt id.
 *
 * State: this face holds its session in the server process (the engine's
 * node-safe store). The native app's session is separate; a given process
 * is one face. That is labeled plainly — no silent shared state.
 *
 * Stateless-transport friendly: no long-lived MCP session is required;
 * every request is self-contained (protocol 2025-06-18 / 2025-03-26).
 */
import {
  VOUCH_TOOLS,
  RISKY_TOOLS,
  runVouchToolCall,
  resolveVouchApproval,
  vouchToolCallStatus,
  vouchMissions,
  verifyVouchReceipt,
} from "./vouch";
import {
  proposeMetaChange,
  revertMetaChange,
  metaChanges,
  metaChange,
  currentGatedTools,
} from "./meta";
/* side-effect import: registers run_drill as a governed tool (risky) */
import "./drill";
import { VH_VERSION } from "../../version";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"];
const SERVER_INFO = { name: "vouch-harbor", version: VH_VERSION };

type Json = Record<string, unknown>;

/* ── the tool manifest (schemas are the contract; descriptions are honest) ── */
export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Json;
}

const toolDef = (name: string, description: string, props: Record<string, Json>, required: string[] = []): McpToolDef => ({
  name,
  description,
  inputSchema: { type: "object", properties: props, required },
});

const str = { type: "string" };

export const MCP_TOOLS: McpToolDef[] = [
  toolDef("calculator", "Evaluate a math expression with the product's real parser (no eval). Safe; mints a receipt.", { expression: str }, ["expression"]),
  toolDef("clock", "Current date/time — Chennai (IST), UTC, and this machine. Safe; mints a receipt.", {}),
  toolDef("search", "Search the local offline knowledge base. Safe; mints a receipt.", { query: str }, ["query"]),
  toolDef("web_search", "Live web evidence — keyless providers (Wikipedia, HN, GitHub); failures reported, never hidden. Safe; mints a receipt.", { query: str }, ["query"]),
  toolDef("memory_save", "Store a durable fact about the user (visible + deletable in the product). Safe; mints a receipt.", { fact: str }, ["fact"]),
  toolDef("memory_recall", "List everything remembered about the user — facts and preferences. Safe; mints a receipt.", {}),
  toolDef("preference_save", "Learn a standing preference from the user. Safe; mints a receipt.", { text: str }, ["text"]),
  toolDef("workspace_list", "List files in the local workspace. Safe; mints a receipt.", {}),
  toolDef(
    "workspace_write",
    "Write a file to the local workspace. RISKY — pauses at the HUMAN GATE: the response is pending with an approval id; approve it (approve_action) or deny it (deny_action), then poll call_status.",
    { name: str, content: str },
    ["name", "content"],
  ),
  toolDef(
    "dispatch_mission",
    "Dispatch a mission to the host crew (your saved crew, or the prebuilt crew) via the real Mission Loop. RISKY — human-gated; on approval the mission runs in the background and the result arrives via call_status / mission_status. A missing crew is an honest refusal, never a fake.",
    { objective: str },
    ["objective"],
  ),
  toolDef("approve_action", "Resolve a pending human-gate approval (the MCP face of the gate). Control surface — no receipt.", { approvalId: str, approve: { type: "boolean", description: "true = approve, false = deny" } }, ["approvalId"]),
  toolDef("deny_action", "Deny a pending human-gate approval. Control surface — no receipt.", { approvalId: str }, ["approvalId"]),
  toolDef("call_status", "Poll a tool call started through this face: gated → running → done, with the final result (incl. receipt id). Control surface — no receipt.", { callId: str }, ["callId"]),
  toolDef("mission_status", "Look up a mission in the unified mission ledger (omit missionId for the most recent). Control surface — no receipt.", { missionId: str }),
  toolDef("verify_receipt", "Re-verify a receipt from this face's ledger (chain + seal + issuer). Control surface — no receipt.", { receiptId: str }, ["receiptId"]),
  toolDef("system_info", "This machine: runtime, OS/arch, product version, brain. Safe; mints a receipt.", {}),
  toolDef(
    "meta_propose",
    "M6 meta-loop: propose a change to the product's OWN control plane — kind 'risk.tier' (tighten a tool's gate: safe -> risky; the meta-loop may never loosen) or 'preference.set' (add a standing preference). This is the most sensitive class of change: SIMULATE + human gate + vouched receipt. Returns pending with the change id; poll meta_status.",
    { kind: str, target: str, reason: str },
    ["kind", "target", "reason"],
  ),
  toolDef("meta_status", "M6 meta-loop: list the product's self-change ledger, or one change by id (status: refused / denied / proposed / applied / reverted, with receipts). Control surface — no receipt.", { changeId: str }),
  toolDef(
    "meta_revert",
    "M6 meta-loop: revert an APPLIED meta change. The revert is itself human-gated and mints its own receipt; the original change is marked reverted. Reverts are terminal — a revert cannot be reverted (propose a new change instead).",
    { changeId: str },
    ["changeId"],
  ),
  toolDef(
    "run_drill",
    "16.4 drill: dispatch a standard REAL mission — a fresh real git repo, the repo's OWN test command, the real mission loop with the real governance arena. Scenarios: guard (fix the disabled-admin bug), maths (implement clamp so the failing test passes), impossible (honest-failure scenario — must report FAILED, never a fake pass). RISKY — it is a mission; it pauses at the human gate, then runs in the background (poll call_status). The result is a vouched drill report + attestation digest.",
    { scenario: str },
    ["scenario"],
  ),
];

const TOOL_NAMES = new Set(MCP_TOOLS.map((t) => t.name));
const ACTION_TOOLS = new Set(["calculator", "clock", "search", "web_search", "memory_save", "memory_recall", "preference_save", "workspace_list", "workspace_write", "dispatch_mission", "system_info", "run_drill"]);

/* ── JSON-RPC plumbing ── */
interface RpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Json;
}

function result(id: number | string | null, result: Json): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}
function rpcError(id: number | string | null, code: number, message: string, data?: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
}
function textResult(id: number | string | null, text: string, isError = false): string {
  return result(id, { content: [{ type: "text", text }], isError });
}

async function callTool(name: string, args: Json, id: number | string | null): Promise<string> {
  try {
    /* control surface — the gate's own tools and the audit reads */
    if (name === "approve_action") {
      const approvalId = String(args.approvalId ?? "");
      const approve = args.approve === undefined ? true : args.approve === true;
      if (!approvalId) return textResult(id, "approve_action needs the approvalId from the pending response.", true);
      resolveVouchApproval(approvalId, approve);
      return textResult(id, approve ? `Approved ${approvalId} — the call continues in the background; poll call_status for the receipt.` : `Denied ${approvalId} — nothing was executed; the denial is recorded in the session.`);
    }
    if (name === "deny_action") {
      const approvalId = String(args.approvalId ?? "");
      if (!approvalId) return textResult(id, "deny_action needs the approvalId from the pending response.", true);
      resolveVouchApproval(approvalId, false);
      return textResult(id, `Denied ${approvalId} — nothing was executed; the denial is recorded in the session.`);
    }
    if (name === "call_status") {
      const track = vouchToolCallStatus(String(args.callId ?? ""));
      if (!track) return textResult(id, `no such call "${String(args.callId ?? "")}" on this server (calls are per-process).`, true);
      if (track.state !== "done" || !track.result) {
        const mission = track.missionId ? ` (mission ${track.missionId})` : "";
        return textResult(id, `call ${args.callId} [${track.tool}] is ${track.state === "gated" ? "waiting at the human gate — approve_action / deny_action" : "running"}${mission}.`);
      }
      const r = track.result;
      const receipt = r.receiptId ? `\nreceipt: ${r.receiptId}` : "";
      return textResult(id, `call ${args.callId} [${track.tool}] done — ok=${r.ok}, approved=${r.approved}${receipt}\n${r.output}`, !r.ok);
    }
    if (name === "mission_status") {
      const missions = vouchMissions();
      if (missions.length === 0) return textResult(id, "no missions in this face's unified ledger yet.");
      const want = String(args.missionId ?? "").trim();
      const m = want ? missions.find((x) => x.missionId === want) ?? null : missions[missions.length - 1];
      if (!m) return textResult(id, `no mission "${want}" in this face's ledger.`, true);
      return textResult(
        id,
        `${m.missionId} — "${m.objective}"\nstatus: ${m.status} · cycle ${m.cycleNo} · verified ${m.verifiedSeats}/${m.seatCount} · gate ${m.gateStatus ?? "n/a"} · receipt ${m.receiptOk ? "signed" : "missing"}\ncrew: ${m.teamName} · ${m.runMs}ms · engine: ${m.engine}`,
      );
    }
    if (name === "verify_receipt") {
      const v = await verifyVouchReceipt(String(args.receiptId ?? ""));
      return v.ok
        ? textResult(id, `VALID — receipt ${args.receiptId} verifies (chain + seal${v.events ? ` + ${v.events} events` : ""}).`)
        : textResult(id, `INVALID — receipt "${String(args.receiptId ?? "")}": ${v.reason ?? "unknown"}.`, true);
    }
    if (name === "meta_propose") {
      const r = await proposeMetaChange(String(args.kind ?? ""), String(args.target ?? ""), String(args.reason ?? ""));
      const extra = r.receiptId ? `\nreceipt: ${r.receiptId}` : "";
      return textResult(id, r.output + extra, !r.ok && !r.pending);
    }
    if (name === "meta_status") {
      const want = String(args.changeId ?? "").trim();
      if (want) {
        const c = metaChange(want);
        if (!c) return textResult(id, `no meta change "${want}" in this face's ledger.`, true);
        const rec = c.receiptId ? ` · decision receipt ${c.receiptId}` : "";
        const rv = c.revertedAt ? ` · REVERTED at ${c.revertedAt}${c.revertReceiptId ? ` (receipt ${c.revertReceiptId})` : ""}` : "";
        const ro = c.revertOf ? ` · revert of ${c.revertOf}` : "";
        return textResult(id, `${c.id} — ${c.kind} on "${c.target}" — status: ${c.status}${ro}${rv}${rec}\nBEFORE: ${c.from}\nAFTER: ${c.to}\nREASON: ${c.reason}${c.decidedAt ? `\nDECIDED: ${c.decision} at ${c.decidedAt}` : "\nDECIDED: pending at the human gate"}`);
      }
      const all = metaChanges();
      if (all.length === 0) return textResult(id, "no meta changes in this face's ledger yet. Currently gated: " + currentGatedTools().join(", ") + ".");
      return textResult(
        id,
        `Currently gated: ${currentGatedTools().join(", ")}.\n` +
          all
            .slice(-10)
            .map((c) => `${c.id} — ${c.kind} on "${c.target}" — ${c.status}${c.revertOf ? ` (revert of ${c.revertOf})` : ""}${c.receiptId ? ` [receipt ${c.receiptId}]` : ""}`)
            .join("\n"),
      );
    }
    if (name === "meta_revert") {
      const r = await revertMetaChange(String(args.changeId ?? ""));
      const extra = r.receiptId ? `\nreceipt: ${r.receiptId}` : "";
      return textResult(id, r.output + extra, !r.ok && !r.pending);
    }

    /* unknown tool — honest refusal (never a silent no-op) */
    if (!TOOL_NAMES.has(name)) {
      return textResult(id, `unknown MCP tool "${name}" — refused. Available: ${[...TOOL_NAMES].join(", ")}.`, true);
    }

    /* action surface — the ROUTE: every capability call goes through
     * runVouchToolCall (authorize → simulate → gate → call → vouch). */
    if (!ACTION_TOOLS.has(name)) return textResult(id, `tool "${name}" is not routable.`, true);
    const r = await runVouchToolCall(name, args, { origin: "mcp" });
    const extra = r.receiptId ? `\nreceipt: ${r.receiptId}` : "";
    return textResult(id, r.output + extra, !r.ok && !r.pending);
  } catch (e) {
    return textResult(id, `tool "${name}" failed in the governed pipeline: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

/* ── the message dispatcher (one line in, one line out) ── */
export async function handleMcpMessage(line: string): Promise<string | null> {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let msg: RpcRequest;
  try {
    msg = JSON.parse(trimmed) as RpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error — the line is not valid JSON.");
  }
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg.id ?? null, -32600, "Invalid Request — expected JSON-RPC 2.0 with a method.");
  }
  const id = msg.id ?? null;
  const params = (msg.params ?? {}) as Json;

  switch (msg.method) {
    case "initialize": {
      const requested = String(params.protocolVersion ?? "");
      const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Vouch Harbor's governed capabilities. Every action tool call is routed through the product's pipeline (risk classification, human gate on risky calls, signed receipt per completed call). Risky calls return pending with an approval id — use approve_action / deny_action, then poll call_status. Audit reads: mission_status, verify_receipt.",
      });
    }
    case "notifications/initialized":
    case "initialized":
      return null; // notification — no response
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: MCP_TOOLS });
    case "tools/call": {
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Json;
      return callTool(name, args, id);
    }
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

/* ── stdio transport (used by tools/mcp.mjs and by the probe) ── */
export async function serveMcpStdio(readLine: () => Promise<string | null>): Promise<void> {
  for (;;) {
    const line = await readLine();
    if (line === null) return;
    const out = await handleMcpMessage(line);
    if (out !== null) process.stdout.write(out + "\n");
  }
}

export { RISKY_TOOLS, VOUCH_TOOLS };
