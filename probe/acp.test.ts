/**
 * ACP conformance probe (V11, W1).
 *
 * A protocol adapter is exactly the kind of code that type-checks perfectly and then never
 * works over a real wire. So this probe spawns a REAL child process — a scripted ACP agent
 * speaking newline-delimited JSON-RPC over stdio — and drives MJ's client through the full
 * lifecycle: initialize handshake, session/new, a streamed turn (message chunks, tool_call
 * events), a permission request answered both ways, and the stop reason. Then the failure
 * paths: a crashing agent, and garbage on the wire.
 *
 * Run: ./node_modules/.bin/esbuild probe/acp.test.ts --bundle --platform=node --format=esm \
 *        --outfile=/tmp/acp.mjs --log-level=error && node /tmp/acp.mjs
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AcpClient, NodeAcpTransport, type AcpEvent, type AcpPermissionRequest } from "../src/mission/acp";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}`);
}

/** A scripted ACP agent. Behavior is controlled by argv flags so one file covers all scenarios. */
const FAKE_AGENT = `
const rl = require("node:readline").createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
if (process.argv.includes("--crash")) { process.exit(3); }
let promptId = null;
rl.on("line", (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params, result } = msg;
  // Responses from the client: the permission decision arrives as a response to our request.
  if (method === undefined && result !== undefined && id === "perm-1") {
    const outcome = result.outcome || {};
    if (outcome.outcome === "selected" && outcome.optionId === "opt-allow") {
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" } } });
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " — check ran" } } } });
    } else {
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "cancelled" } } });
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " — check skipped" } } } });
    }
    // Answer the client's session/prompt with the id it actually used.
    send({ jsonrpc: "2.0", id: promptId, result: { stopReason: "end_turn" } });
    return;
  }
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: { protocolVersion: params.protocolVersion, agentInfo: { name: "fake-acp", version: "1.0.0" } } });
  } else if (method === "session/new") {
    send({ jsonrpc: "2.0", id, result: { sessionId: "sess-1" } });
  } else if (method === "session/prompt") {
    promptId = id;
    const sid = params.sessionId;
    const upd = (sessionUpdate, extra = {}) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: sid, update: { sessionUpdate, ...extra } } });
    upd("agent_message_chunk", { content: { type: "text", text: "Hello " } });
    upd("agent_message_chunk", { content: { type: "text", text: "world" } });
    upd("tool_call", { toolCallId: "t1", title: "Run safe check", kind: "execute", status: "pending" });
    send({ jsonrpc: "2.0", id: "perm-1", method: "session/request_permission", params: {
      sessionId: sid,
      options: [
        { optionId: "opt-allow", name: "Allow", kind: "allow_once" },
        { optionId: "opt-deny", name: "Deny", kind: "reject_once" },
      ],
      toolCall: { toolCallId: "t1", title: "Run safe check", kind: "execute" },
    } });
  } else if (method.startsWith("fs/") || method.startsWith("terminal/")) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "no handler" } });
  }
});
`;

async function makeClient(agentPath: string, opts: {
  decide?: (req: AcpPermissionRequest) => Promise<"allow" | "deny">;
} = {}): Promise<{ client: AcpClient; events: AcpEvent[] }> {
  const events: AcpEvent[] = [];
  const client = new AcpClient(new NodeAcpTransport(process.execPath, [agentPath], os.tmpdir()), {
    timeoutMs: 10_000,
    // No decider attached unless the scenario supplies one — section 1 exists to prove the
    // client's built-in default deny, so it must run exactly that path.
    ...(opts.decide ? { decidePermission: opts.decide } : {}),
    onEvent: (e) => events.push(e),
  });
  return { client, events };
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mj-acp-"));
  const agentPath = path.join(dir, "fake-acp-agent.cjs");
  fs.writeFileSync(agentPath, FAKE_AGENT);

  section("0. handshake and session");
  {
    const { client } = await makeClient(agentPath);
    const hello = await client.connect();
    ok("initialize negotiates protocol version 1", hello.protocolVersion === 1, JSON.stringify(hello));
    ok("the agent identifies itself", hello.agentName === "fake-acp", `${hello.agentName}`);
    const sessionId = await client.newSession(process.cwd());
    ok("session/new returns the agent's session id", sessionId === "sess-1", sessionId);

    section("1. a streamed turn with tool events and a DENIED permission (default-deny path)");
    const turn = await client.prompt(sessionId, "run the safe check");
    ok("stop reason is end_turn", turn.stopReason === "end_turn", turn.stopReason);
    ok("message chunks stream in order", turn.text === "Hello world — check skipped", JSON.stringify(turn.text));
    const toolCall = client.events.find((e) => e.type === "tool_call");
    ok("tool_call event captured", Boolean(toolCall) && (toolCall as { title: string }).title === "Run safe check");
    const toolUpdate = client.events.find((e) => e.type === "tool_call_update");
    ok("the denied tool call ends cancelled", (toolUpdate as { status?: string } | undefined)?.status === "cancelled");
    const perm = client.events.find((e) => e.type === "permission_request");
    ok("the permission request was recorded", Boolean(perm));
    ok("the default decision is deny", (perm as { decided?: string } | undefined)?.decided === "deny");
    ok("the deny came from the default, not an attached approver", (perm as { by?: string } | undefined)?.by === "default-deny");
    await client.shutdown();
  }

  section("2. an ALLOWED permission flows back through the wire");
  {
    const { client, events } = await makeClient(agentPath, { decide: async () => "allow" });
    await client.connect();
    const sessionId = await client.newSession(process.cwd());
    const turn = await client.prompt(sessionId, "run the safe check");
    ok("the allowed tool completed", events.some((e) => e.type === "tool_call_update" && e.status === "completed"));
    ok("the post-permission chunk arrived", turn.text === "Hello world — check ran", JSON.stringify(turn.text));
    const perm = events.find((e) => e.type === "permission_request");
    ok("allow recorded with its decider", (perm as { decided?: string; by?: string } | undefined)?.decided === "allow");
    await client.shutdown();
  }

  section("3. hostile wires do not crash the client");
  {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "mj-acp-noise-"));
    const noisy = path.join(dir2, "noisy-agent.cjs");
    fs.writeFileSync(noisy, `
const rl = require("node:readline").createInterface({ input: process.stdin });
process.stdout.write("this is not json\\n");
process.stdout.write("{broken json\\n");
rl.on("line", (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    process.stdout.write("garbage before the result\\n");
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1, agentInfo: { name: "noisy", version: "0" } } }) + "\\n");
  } else if (msg.method === "session/new") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 424242, result: { note: "response to an id we never sent" } }) + "\\n");
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "s-noise" } }) + "\\n");
  } else if (msg.method === "session/prompt") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn" } }) + "\\n");
  }
});
`);
    const events: AcpEvent[] = [];
    const client = new AcpClient(new NodeAcpTransport(process.execPath, [noisy]), {
      timeoutMs: 10_000,
      onEvent: (e) => events.push(e),
    });
    const hello = await client.connect();
    ok("initialize survives garbage interleaved on the wire", hello.protocolVersion === 1);
    const sessionId = await client.newSession(process.cwd());
    ok("unsolicited responses are ignored, not matched", sessionId === "s-noise", sessionId);
    const turn = await client.prompt(sessionId, "hi");
    ok("the turn still completes", turn.stopReason === "end_turn");
    ok("garbage lines were counted as protocol errors, not swallowed",
      events.filter((e) => e.type === "protocol_error").length >= 2,
      `${events.filter((e) => e.type === "protocol_error").length} protocol errors`);
    await client.shutdown();
  }

  section("4. a crashing agent produces an honest failure, never fabricated text");
  {
    const crashPath = path.join(dir, "crash-acp-agent.cjs");
    fs.writeFileSync(crashPath, FAKE_AGENT);
    const client = new AcpClient(new NodeAcpTransport(process.execPath, [crashPath, "--crash"]), { timeoutMs: 1_500 });
    let err: string | null = null;
    try {
      await client.connect();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    ok("initialize against a crasher fails loudly", err !== null, err ?? "no error");
    await client.shutdown();
  }

  section("5. the harness resolves and reports like a first-class adapter");
  {
    const { AcpHarness } = await import("../src/mission/acp");
    const { getHarness } = await import("../src/mission/harnessAdapters");
    const h = getHarness("acp");
    ok("the acp harness is in the registry", Boolean(h) && h?.id === "acp");
    ok("it is a real adapter (not the test double)", h?.simulated === false);
    const prep = new AcpHarness().prepare({} as never);
    ok("prepare names a program and args", prep.program.length > 0 && prep.args.length > 0, JSON.stringify(prep));
    // The full harness.invoke() runs the same client end to end with the env-pinned binary.
    process.env.MJ_ACP_BIN = process.execPath;
    process.env.MJ_ACP_ARGS = `${agentPath}`;
    const outcome = await new AcpHarness().invoke({
      taskId: "t", title: "probe", prompt: "run the safe check", kind: "implement",
      languages: [], timeoutMs: 15_000, requiredCapabilities: [], cwd: process.cwd(),
    } as never);
    ok("harness invoke returns a real outcome", outcome.ok === true, outcome.error ?? "");
    ok("the outcome text is the agent's streamed text", outcome.text === "Hello world — check skipped", JSON.stringify(outcome.text));
    ok("the outcome detail names stop/tools/perms and honest cost",
      /acp stop=end_turn tools=1 perms=1\/1 cost=unmeasured/.test(outcome.detail), outcome.detail);
    delete process.env.MJ_ACP_BIN;
    delete process.env.MJ_ACP_ARGS;
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

void main();
