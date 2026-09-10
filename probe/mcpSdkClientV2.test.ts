/**
 * VH 16.9.0 — probe #92: OFFICIAL MCP SDK v2 CLIENT CONFORMANCE (the modern era).
 *
 * Probe #90 (mcpSdkClient) validated the LEGACY path (2025-11-25) with the
 * official v1 SDK client. The 16.7.0 external review named the missing half:
 * the 2026-07-28 MODERN path, validated with the official v2 client. This
 * suite closes it:
 *
 *   @modelcontextprotocol/client v2.0.0 (pinned devDependency — the spec's
 *   own client library, v2 line, which implements 2026-07-28) drives the
 *   REAL server over real stdio with the era PINNED to 2026-07-28.
 *
 * What connect success proves: the v2 client speaks the stateless modern
 * core (per-request _meta envelope, server/discover, MRTR input_required).
 * A server that could not serve the 2026-07-28 revision would fail the
 * pinned negotiation.
 *
 * The human gate is exercised the modern way: a gated call returns
 * resultType "input_required" with the decision embedded as an
 * elicitation/create input request + an opaque requestState; the SDK's
 * multi-round-trip auto-fulfilment answers it through the registered
 * elicitation handler and retries the call with inputResponses — the
 * whole interactive round-trip happens INSIDE callTool().
 */
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();

let client: Client;
let transport: StdioClientTransport;
let elicitationCalls: string[] = [];
/** switch the "human" decision without touching the server */
let decision: "accept" | "decline" = "accept";

function textOf(result: { content?: Array<{ type?: string; text?: string }> }): string {
  return (result.content ?? []).find((c) => c.type === "text")?.text ?? "";
}

before(async () => {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: ["tools/mcp.mjs"],
    cwd: ROOT,
  });
  client = new Client(
    { name: "vh-sdk-v2-conformance", version: "1.0.0" },
    {
      // the whole point: pin the 2026-07-28 era — no probe-and-fallback,
      // a server that cannot serve it fails loudly.
      versionNegotiation: { mode: { pin: "2026-07-28" } },
      // the client must DECLARE it can be elicited — the SDK refuses to
      // register the elicitation handler without the capability (and the
      // capability rides the per-request _meta envelope our server reads).
      capabilities: { elicitation: {} },
    },
  );
  // The modern-era "human": the elicitation handler the SDK's MRTR
  // auto-fulfilment calls for the embedded input request.
  client.setRequestHandler("elicitation/create", async (req) => {
    const p = req.params as { message?: string };
    elicitationCalls.push(p?.message ?? "");
    const d: "accept" | "decline" = decision;
    return { action: d, content: { decision: d } } as never;
  });
  await client.connect(transport);
});

after(async () => {
  try {
    await client.close();
  } catch {
    /* already closed */
  }
});

describe("M1 the official v2 client speaks the MODERN era to the real server", () => {
  it("the pinned negotiation lands on 2026-07-28 (connect at a pinned modern revision)", () => {
    /* pin mode declares the era outright (no probe-and-fallback): a server
     * that cannot serve 2026-07-28 would fail this connect loudly. The
     * end-to-end proof is behavioral — the MRTR suite below only exists on
     * the modern wire. */
    const v = client.getNegotiatedProtocolVersion();
    assert.equal(v, "2026-07-28", `the official v2 client negotiated the modern revision, got ${v}`);
  });

  it("server/discover reaches the client: both eras advertised, capabilities + cache hints", () => {
    const d = client.getDiscoverResult();
    assert.ok(d, "the connect-time discover result is retained");
    const versions: string[] = (d as { supportedVersions?: string[] }).supportedVersions ?? [];
    assert.ok(versions.includes("2026-07-28"), "modern era advertised: " + versions.join(","));
    assert.ok(versions.includes("2025-11-25"), "legacy era still advertised (dual-era): " + versions.join(","));
    assert.ok((d as { capabilities?: { tools?: unknown } }).capabilities?.tools, "tools capability advertised");
  });

  it("the full 20-tool governed surface is visible, deterministically ordered", async () => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 20, "the surface is still exactly 20 tools");
    const names = tools.map((t) => t.name);
    assert.deepStrictEqual([...names].sort(), names, "tool order is deterministic (sorted)");
    for (const expected of ["clock", "workspace_write", "approve_action", "call_status", "verify_receipt", "run_drill"]) {
      assert.ok(names.includes(expected), `missing ${expected}: ${names.join(",")}`);
    }
  });

  it("a safe call executes and returns real output (modern result shape)", async () => {
    const r = await client.callTool({ name: "system_info", arguments: {} });
    assert.ok(!r.isError, JSON.stringify(r));
    const t = textOf(r);
    assert.ok(t.length > 10, "real output, not an empty shell: " + t.slice(0, 80));
  });
});

describe("M2 the human gate, MODERN way: MRTR input_required, decided in-band", () => {
  it("approve: gated call → input_required → elicitation answer → approved → executed → receipt VALID", async () => {
    decision = "accept";
    elicitationCalls = [];
    const first = await client.callTool({
      name: "workspace_write",
      arguments: { name: "sdkv2-gate.txt", content: "modern-gate" },
    });
    assert.ok(!first.isError, JSON.stringify(first));
    assert.equal(elicitationCalls.length, 1, "the SDK asked the registered elicitation handler exactly once");
    assert.ok(elicitationCalls[0].includes("human gate"), "the embedded request is our gate: " + (elicitationCalls[0] ?? "").slice(0, 80));
    const t0 = textOf(first);
    assert.ok(/^Approved a[0-9a-z]+/.test(t0), "the MRTR round-trip approved the gate in-band: " + t0);
    const callId = t0.match(/call_status "(c[0-9a-z]+)"/)?.[1];
    assert.ok(callId, "the call handle rides the approval text: " + t0);
    let done = "";
    for (let i = 0; i < 120; i++) {
      const st = await client.callTool({ name: "call_status", arguments: { callId } });
      done = textOf(st);
      if (/done — ok=/.test(done)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(done.includes("ok=true"), "the approved write executed: " + done);
    assert.ok(done.includes("wrote sdkv2-gate.txt"), done);
    const rec = done.match(/receipt: (r[0-9a-z]+)/);
    assert.ok(rec, "the call minted a receipt: " + done);
    const v = await client.callTool({ name: "verify_receipt", arguments: { receiptId: rec![1] } });
    assert.ok(textOf(v).startsWith("VALID"), "the receipt verifies — through the official v2 client: " + textOf(v));
    const list = await client.callTool({ name: "workspace_list", arguments: {} });
    assert.ok(textOf(list).includes("sdkv2-gate.txt"), "the approved write is in the workspace store: " + textOf(list));
  });

  it("decline: the SAME gate answered decline executes nothing (the gate is real, modern way)", async () => {
    decision = "decline";
    const r = await client.callTool({
      name: "workspace_write",
      arguments: { name: "sdkv2-denied.txt", content: "x" },
    });
    const t = textOf(r);
    assert.ok(/ok=false|denied|declined/i.test(t), "the decline is reported in words: " + t);
    const list = await client.callTool({ name: "workspace_list", arguments: {} });
    assert.ok(!textOf(list).includes("sdkv2-denied.txt"), "a declined write is NOT in the workspace store (while the approved one is)");
    decision = "accept";
  });
});

describe("M3 honesty over the official v2 client", () => {
  it("an unknown tool is refused in words (isError)", async () => {
    let errText = "";
    try {
      const r = await client.callTool({ name: "no_such_tool_vh", arguments: {} });
      errText = textOf(r);
      assert.ok(r.isError, "refusal surfaces as isError");
    } catch (e) {
      errText = String(e);
    }
    assert.ok(/unknown (mcp )?tool/i.test(errText), errText);
  });

  it("a drill on a missing harness refuses in words (never a fake real-model run)", async () => {
    decision = "accept"; // the gate is approved — the REFUSAL is what is pinned
    const first = await client.callTool({ name: "run_drill", arguments: { scenario: "guard", harness: "vh-missing-harness" } });
    let out = textOf(first);
    const callId = out.match(/call_status "(c[0-9a-z]+)"/)?.[1];
    if (callId) {
      for (let i = 0; i < 120; i++) {
        const st = await client.callTool({ name: "call_status", arguments: { callId } });
        out = textOf(st);
        if (/done — ok=/.test(out)) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    assert.ok(/not installed|refused/i.test(out), "the refusal is reported in words: " + out);
  });
});

describe("M4 dual-era from ONE official client library", () => {
  it("the same v2 SDK, default (legacy) posture, still drives the 2025-11-25 handshake", async () => {
    const legacyTransport = new StdioClientTransport({ command: process.execPath, args: ["tools/mcp.mjs"], cwd: ROOT });
    const legacy = new Client({ name: "vh-sdk-v2-legacy-posture", version: "1.0.0" }); // no versionNegotiation → 'legacy'
    try {
      await legacy.connect(legacyTransport);
      const v = legacy.getNegotiatedProtocolVersion();
      assert.equal(v, "2025-11-25", `the default legacy posture negotiated the 2025 revision, got ${v}`);
      const { tools } = await legacy.listTools();
      assert.equal(tools.length, 20, "the legacy path sees the same 20-tool surface");
    } finally {
      await legacy.close().catch(() => undefined);
    }
  });
});

describe("M5 devDependency hygiene", () => {
  it("the v2 client is a conformance tool, never product runtime", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    assert.ok(pkg.devDependencies?.["@modelcontextprotocol/client"], "the v2 client is a devDependency");
    assert.ok(!pkg.dependencies?.["@modelcontextprotocol/client"], "…and NOT a runtime dependency");
    const serverSrc = fs.readFileSync(path.join(ROOT, "tools/mcp.mjs"), "utf8");
    assert.ok(!serverSrc.includes("@modelcontextprotocol/client"), "the server bundle never imports the v2 client");
  });
});
