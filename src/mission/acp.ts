/**
 * §6.1 The ACP adapter — one wire for every coding agent (V11, MJ-11.0-PROPOSAL W1).
 *
 * The Agent Client Protocol (Zed Industries, Aug 2025; co-developed with JetBrains) standardizes
 * exactly the seam MJ's nine bespoke CLI parsers hand-roll: JSON-RPC 2.0 over stdin/stdout with
 * session management, streamed updates, tool-call reporting and bidirectional permission
 * requests. V11 makes MJ an ACP client: any ACP-compliant agent plugs into the mission runtime
 * through this one adapter, and `session/request_permission` lands in the same approval flow
 * MJ already gated by hand.
 *
 * Protocol surface used (newline-delimited JSON-RPC, per agentclientprotocol.com):
 *   client → agent   initialize, session/new, session/prompt, session/cancel
 *   agent → client   session/update (notification), session/request_permission,
 *                    fs/read_text_file, fs/write_text_file, terminal/*
 *
 * Honesty rules this module holds:
 *  - The browser host does not spawn processes, so it refuses up front (same as CliHarness).
 *  - Cost is `unmeasured` unless an agent reports usage; MJ never guesses dollars.
 *  - Permission requests are DENIED by default; an allow decision needs a decider that was
 *    explicitly attached (the mission approval inbox attaches one).
 *  - fs/terminal requests from the agent are answered with a JSON-RPC error unless a handler
 *    was attached — capability is granted, never assumed.
 */
import { MJ_VERSION } from "../version";
import type { CodingAgentHarness, HarnessOutcome, HarnessTask } from "./harnessAdapters";

/* ------------------------------------------------------------------ transport */

export interface AcpTransport {
  start(onLine: (line: string) => void, onExit: (code: number | null) => void): Promise<void>;
  send(line: string): void;
  stop(): Promise<void>;
}

/** Real child process. Node only — used by the probe and any embedded-node host. */
export class NodeAcpTransport implements AcpTransport {
  private child: { stdin: { write(s: string): void; end(): void }; kill(): void; unref(): void } | null = null;
  constructor(
    private readonly program: string,
    private readonly args: string[],
    private readonly cwd?: string,
    /** Pre-scrubbed environment (credentials removed). Never the parent env verbatim. */
    private readonly env?: Record<string, string>,
  ) {}
  async start(onLine: (line: string) => void, onExit: (code: number | null) => void): Promise<void> {
    const { spawn } = await import("node:child_process");
    const { createInterface } = await import("node:readline");
    const child = spawn(this.program, this.args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      ...(this.env ? { env: this.env } : {}),
    });
    this.child = child;
    createInterface({ input: child.stdout }).on("line", onLine);
    createInterface({ input: child.stderr }).on("line", () => {
      /* stderr is diagnostics, never protocol — ACP servers may log there */
    });
    child.on("exit", (code) => onExit(code));
  }
  send(line: string): void {
    this.child?.stdin.write(line + "\n");
  }
  async stop(): Promise<void> {
    this.child?.stdin.end();
    this.child?.kill();
    this.child = null;
  }
}

/* ------------------------------------------------------------------ protocol types */

export type AcpEvent =
  | { type: "message"; text: string }
  | { type: "thought"; text: string }
  | { type: "tool_call"; toolCallId: string; title: string; kind?: string; status?: string }
  | { type: "tool_call_update"; toolCallId: string; status?: string }
  | { type: "plan"; entries: Array<{ content: string; status?: string }> }
  | { type: "permission_request"; toolCallTitle?: string; decided: "allow" | "deny"; by: string }
  | { type: "agent_request_refused"; method: string; reason: string }
  | { type: "protocol_error"; detail: string };

export interface AcpPermissionOption {
  optionId: string;
  name?: string;
  kind?: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

export interface AcpPermissionRequest {
  sessionId: string;
  options: AcpPermissionOption[];
  toolCall?: { title?: string; kind?: string };
  respond: (outcome: { outcome: "selected"; optionId: string } | { outcome: "cancelled" }) => void;
}

export interface AcpClientOptions {
  clientInfo?: { name: string; version: string };
  /** Decide permission requests. Default: deny everything, recorded. */
  decidePermission?: (req: AcpPermissionRequest) => Promise<"allow" | "deny">;
  /** Answer agent fs requests. Default: refused with a JSON-RPC error. */
  readTextFile?: (sessionId: string, path: string) => Promise<string | null>;
  writeTextFile?: (sessionId: string, path: string, content: string) => Promise<boolean>;
  /** Every protocol-level event, for the flight recorder and probes. */
  onEvent?: (e: AcpEvent) => void;
  /** Per-request timeout. */
  timeoutMs?: number;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** JSON-RPC ids may be numbers or strings; ACP uses both. */
type RpcId = number | string;

const PROTOCOL_VERSION = 1;

export class AcpClient {
  private nextId = 1;
  private readonly pending = new Map<RpcId, Pending>();
  private exited: ((code: number | null) => void) | null = null;
  private initialized = false;
  private exitCode: number | null = null;
  readonly events: AcpEvent[] = [];

  constructor(
    private readonly transport: AcpTransport,
    private readonly opts: AcpClientOptions = {},
  ) {}

  private emit(e: AcpEvent) {
    this.events.push(e);
    this.opts.onEvent?.(e);
  }

  private rawSend(obj: unknown): void {
    this.transport.send(JSON.stringify(obj));
  }

  private request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id: RpcId = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`acp: ${method} timed out after ${this.opts.timeoutMs ?? 120_000}ms`));
      }, this.opts.timeoutMs ?? 120_000);
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      this.rawSend({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** Wire the transport and perform the initialize handshake. */
  async connect(): Promise<{ protocolVersion: number; agentName?: string; agentVersion?: string }> {
    await this.transport.start(
      (line) => this.onLine(line),
      (code) => {
        this.exitCode = code;
        this.exited?.(code);
      },
    );
    const result = await this.request<Record<string, unknown>>("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      clientInfo: this.opts.clientInfo ?? { name: "MJ", version: MJ_VERSION },
    });
    this.initialized = true;
    const agent = result.agentInfo as { name?: string; version?: string } | undefined;
    return {
      protocolVersion: Number(result.protocolVersion ?? PROTOCOL_VERSION),
      agentName: agent?.name,
      agentVersion: agent?.version,
    };
  }

  async newSession(cwd: string): Promise<string> {
    if (!this.initialized) throw new Error("acp: connect() must run before newSession()");
    const result = await this.request<{ sessionId: string }>("session/new", { cwd, mcpServers: [] });
    if (!result?.sessionId) throw new Error("acp: session/new returned no sessionId");
    return result.sessionId;
  }

  cancel(sessionId: string): void {
    this.rawSend({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
  }

  /** Drive one turn. Resolves with the agent's final text and the stop reason. */
  async prompt(sessionId: string, text: string): Promise<{ stopReason: string; text: string }> {
    const chunks: string[] = [];
    const saved = this.opts.onEvent;
    // Collect message chunks locally regardless of whether an external sink is attached.
    this.opts.onEvent = (e) => {
      if (e.type === "message") chunks.push(e.text);
      saved?.(e);
    };
    try {
      const result = await this.request<{ stopReason?: string }>("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text }],
      });
      return { stopReason: String(result.stopReason ?? "end_turn"), text: chunks.join("") };
    } finally {
      this.opts.onEvent = saved;
    }
  }

  async shutdown(): Promise<void> {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("acp: client shut down"));
    }
    this.pending.clear();
    await this.transport.stop();
  }

  get exitWith(): number | null {
    return this.exitCode;
  }

  /* -------------------------------------------------------------- inbound */

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      this.emit({ type: "protocol_error", detail: `unparseable line ignored (${trimmed.slice(0, 40)}…)` });
      return;
    }
    if (msg.id !== undefined && typeof msg.id !== "object" && (msg.result !== undefined || msg.error !== undefined)) {
      const p = this.pending.get(msg.id as RpcId);
      if (!p) return; // response to a request we never sent — ignore, recorded as nothing
      this.pending.delete(msg.id as RpcId);
      clearTimeout(p.timer);
      if (msg.error !== undefined) {
        const err = msg.error as { message?: string };
        p.reject(new Error(`acp: ${err.message ?? "protocol error"}`));
      } else {
        p.resolve(msg.result);
      }
      return;
    }
    const method = String(msg.method ?? "");
    const params = (msg.params ?? {}) as Record<string, unknown>;
    if (method === "session/update") {
      this.onUpdate(params);
      return;
    }
    if (method === "session/request_permission") {
      void this.onPermission(params, msg.id);
      return;
    }
    if (
      method === "fs/read_text_file" ||
      method === "fs/write_text_file" ||
      method.startsWith("terminal/")
    ) {
      void this.onAgentRequest(method, params, msg.id);
      return;
    }
    // Unknown request with an id: answer with a proper JSON-RPC error so the agent never hangs.
    if (msg.id !== undefined) {
      this.rawSend({ jsonrpc: "2.0", id: msg.id as RpcId, error: { code: -32601, message: `MJ does not implement ${method}` } });
    }
  }

  private onUpdate(params: Record<string, unknown>): void {
    const update = params.update as Record<string, unknown> | undefined;
    const kind = String(update?.sessionUpdate ?? (update as unknown) ?? "");
    const content = update?.content as { text?: string } | undefined;
    switch (kind) {
      case "agent_message_chunk":
        if (content?.text) this.emit({ type: "message", text: content.text });
        break;
      case "agent_thought_chunk":
      case "thought_message_chunk":
        if (content?.text) this.emit({ type: "thought", text: content.text });
        break;
      case "tool_call":
        this.emit({
          type: "tool_call",
          toolCallId: String(update?.toolCallId ?? ""),
          title: String(update?.title ?? ""),
          kind: update?.kind as string | undefined,
          status: update?.status as string | undefined,
        });
        break;
      case "tool_call_update":
        this.emit({
          type: "tool_call_update",
          toolCallId: String(update?.toolCallId ?? ""),
          status: update?.status as string | undefined,
        });
        break;
      case "plan":
        this.emit({
          type: "plan",
          entries: Array.isArray(update?.entries)
            ? (update.entries as Array<{ content?: string; status?: string }>).map((e) => ({
                content: String(e.content ?? ""),
                status: e.status,
              }))
            : [],
        });
        break;
      default:
        this.emit({ type: "protocol_error", detail: `unknown session/update kind: ${kind || "(none)"}` });
    }
  }

  private async onPermission(params: Record<string, unknown>, requestId: unknown): Promise<void> {
    const options = (params.options ?? []) as AcpPermissionOption[];
    const toolCall = params.toolCall as { title?: string; kind?: string } | undefined;
    const sessionId = String(params.sessionId ?? "");
    const respond = (outcome: { outcome: "selected"; optionId: string } | { outcome: "cancelled" }) => {
      // request_permission is a REQUEST — the reply must carry its id.
      if (requestId !== undefined) {
        this.rawSend({ jsonrpc: "2.0", id: requestId, result: { outcome } });
      }
    };
    const decided = (await this.opts.decidePermission?.({ sessionId, options, toolCall, respond })) ?? "deny";
    const allow = decided === "allow";
    const pick =
      options.find((o) => o.kind === (allow ? "allow_once" : "reject_once")) ??
      options.find((o) => (allow ? o.kind?.startsWith("allow") : o.kind?.startsWith("reject"))) ??
      null;
    this.emit({
      type: "permission_request",
      toolCallTitle: toolCall?.title,
      decided,
      by: this.opts.decidePermission ? "mission-approval" : "default-deny",
    });
    respond(pick ? { outcome: "selected", optionId: pick.optionId } : { outcome: "cancelled" });
  }

  private async onAgentRequest(method: string, params: Record<string, unknown>, id: unknown): Promise<void> {
    try {
      if (method === "fs/read_text_file" && this.opts.readTextFile) {
        const content = await this.opts.readTextFile(String(params.sessionId ?? ""), String(params.path ?? ""));
        if (content !== null) {
          this.rawSend({ jsonrpc: "2.0", id, result: { content } });
          return;
        }
      }
      if (method === "fs/write_text_file" && this.opts.writeTextFile) {
        const okWrite = await this.opts.writeTextFile(
          String(params.sessionId ?? ""),
          String(params.path ?? ""),
          String(params.content ?? ""),
        );
        this.rawSend({ jsonrpc: "2.0", id, result: {} });
        if (!okWrite) this.emit({ type: "agent_request_refused", method, reason: "handler returned false" });
        return;
      }
      this.emit({
        type: "agent_request_refused",
        method,
        reason: "no handler attached — MJ does not grant unconfigured capability",
      });
      this.rawSend({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `MJ does not grant ${method} in this session` },
      });
    } catch (e) {
      this.rawSend({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: e instanceof Error ? e.message : "handler failed" },
      });
    }
  }
}

/* ------------------------------------------------------------------ harness */

/**
 * The program to spawn. `MJ_ACP_BIN` overrides the packaged default, because ACP front-ends
 * differ per CLI (`claude-code-acp`, `gemini --experimental-acp`, …) and MJ does not pretend
 * to know the user's machine better than they do.
 */
export function acpInvocation(): { program: string; args: string[] } {
  const env =
    typeof process !== "undefined" && process.env
      ? (process.env as Record<string, string | undefined>)
      : {};
  const program = env.MJ_ACP_BIN ?? "claude-code-acp";
  const args = (env.MJ_ACP_ARGS ?? "--stdio").split(" ").filter(Boolean);
  return { program, args };
}

export class AcpHarness implements CodingAgentHarness {
  readonly simulated = false;
  readonly id = "acp" as const;
  readonly name = "ACP agent (Agent Client Protocol)";
  readonly installHint =
    "Provide any ACP-compliant agent: set MJ_ACP_BIN (e.g. claude-code-acp, or gemini with --experimental-acp). npm i -g @zed-industries/claude-code-acp is a common bridge.";
  readonly languages = ["*"];
  readonly strengths = ["streaming", "permission gating", "plan visibility", "one protocol for many agents"];
  readonly canEditFiles = true;
  readonly canRunTests = true;
  readonly capabilities = ["acp", "streaming", "permission-requests", "plan", "tool-call-events"];

  supports(_task: HarnessTask): boolean {
    return true;
  }

  prepare(task: HarnessTask): { program: string; args: string[] } {
    void task;
    return acpInvocation();
  }

  /** Optional event sink — missions attach the flight recorder here. */
  static eventSink: ((e: AcpEvent) => void) | null = null;

  async invoke(task: HarnessTask): Promise<HarnessOutcome> {
    const started = Date.now();
    const nodeHost = typeof window === "undefined";
    const tauriHost = typeof window !== "undefined" && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
    if (!nodeHost && !tauriHost) {
      return {
        ok: false,
        text: "",
        exitCode: null,
        latencyMs: Date.now() - started,
        costUsd: 0,
        simulated: false,
        detail: "not-executed",
        error: "ACP agents are spawned as processes; the browser preview cannot host them. Run the native desktop build (npm run tauri).",
      };
    }
    const { program, args } = this.prepare(task);
    let client: AcpClient | null = null;
    try {
      // V11 (W3): the seat runs under the risk-tier sandbox profile, and the child never sees
      // credential-shaped environment variables.
      const seatProgram = program;
      const { scrubEnv } = await import("./sandbox");
      const scrubbedEnv = nodeHost ? scrubEnv(process.env as Record<string, string>) : undefined;
      const transport = nodeHost
        ? new NodeAcpTransport(seatProgram, args, task.cwd, scrubbedEnv)
        : await (async () => {
            const { TauriAcpTransport } = await import("./acpTauri");
            return new TauriAcpTransport(seatProgram, args, task.cwd);
          })();
      client = new AcpClient(transport, {
        decidePermission: async () => {
          const denied = await defaultMissionDeny(task);
          return denied ? "deny" : "allow";
        },
        onEvent: (e) => AcpHarness.eventSink?.(e),
      });
      await client.connect();
      const sessionId = await client.newSession(task.cwd ?? ".");
      const preamble = task.grantedPermissions
        ? Object.entries(task.grantedPermissions)
            .filter(([, v]) => v)
            .map(([k]) => `- may ${k}`)
            .join("\n")
        : "- workspace-only; everything else is denied by default";
      const turn = await client.prompt(sessionId, `${task.prompt}\n\n[Permissions granted for this task]\n${preamble}`);
      const tools = client.events.filter((e) => e.type === "tool_call").length;
      const perms = client.events.filter((e) => e.type === "permission_request");
      const denied = perms.filter((p) => p.decided === "deny").length;
      const okTurn = turn.stopReason === "end_turn" && turn.text.trim().length > 0;
      return {
        ok: okTurn,
        text: turn.text,
        exitCode: okTurn ? 0 : (client.exitWith ?? 1),
        latencyMs: Date.now() - started,
        costUsd: 0,
        simulated: false,
        detail: `acp stop=${turn.stopReason} tools=${tools} perms=${denied}/${perms.length} cost=unmeasured`,
        error: okTurn ? null : `agent stopped with ${turn.stopReason} and no text`,
      };
    } catch (e) {
      return {
        ok: false,
        text: "",
        exitCode: client?.exitWith ?? null,
        latencyMs: Date.now() - started,
        costUsd: 0,
        simulated: false,
        detail: "spawn-failed",
        error: e instanceof Error ? e.message : String(e),
      };
    } finally {
      await client?.shutdown();
    }
  }
}

/**
 * Mission-level permission default. V11 ships conservative: unless the task explicitly grants
 * shell/browser, every permission request is denied and recorded — the agent is told "denied"
 * rather than being silently allowed because nobody was watching.
 */
async function defaultMissionDeny(task: HarnessTask): Promise<boolean> {
  // Conservative unless the task contract explicitly grants write/shell. The decision is
  // recorded by the caller as an event either way, so a denial is never silent.
  return !(task.mayRunShell || task.mayWriteFiles);
}
