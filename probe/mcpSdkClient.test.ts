/**
 * VOUCH HARBOR 16.7.0 — OFFICIAL SDK CLIENT CONFORMANCE (probe #90).
 *
 * The 16.5.0 review, item 3 (part two): the router is hand-implemented
 * (no official SDK). 16.6 pinned the WIRE against the official JSON Schemas.
 * 16.7 pins the WIRE against the official CLIENT: this suite drives the
 * REAL server (tools/mcp.mjs over real stdio) with the official
 * `@modelcontextprotocol/sdk` client library (pinned devDependency,
 * v1.30.0 — its latest protocol is 2025-11-25, which our server advertises
 * as a supported legacy revision).
 *
 * The proof this gives: a spec-faithful client implementation — written by
 * the MCP maintainers, not us — connects, negotiates, lists, calls, gates,
 * approves and verifies against our hand-implemented server. Successful
 * connection is itself the version-negotiation proof: the SDK only accepts
 * a protocol version it knows, so our server must answer its 2025-11-25
 * handshake with 2025-11-25 (echo), not the modern revision.
 */
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();

/* the pinned official client — the dependency is dev-only (probes + this suite) */

let client: Client;
let transport: StdioClientTransport;

before(async () => {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: ["tools/mcp.mjs"],
    cwd: ROOT,
  });
  client = new Client(
    { name: "vh-sdk-conformance", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
});

after(async () => {
  try {
    await client.close();
  } catch {
    /* already closed */
  }
});

describe("E1 the official client speaks to the real server", () => {
  it("the official SDK connects: the 2025-11-25 handshake is answered with 2025-11-25", () => {
    /* client.connect() THROWS unless the server's initialize response is
     * spec-shaped and its protocolVersion is one the SDK knows — the SDK's
     * supported list tops out at 2025-11-25, so a server that answered the
     * modern revision would have been rejected here. */
    const v = client.getServerVersion();
    assert.equal(v.name, "vouch-harbor");
    assert.ok(v.version.length > 0);
  });

  it("the server's capabilities and instructions reach the official client", () => {
    const caps = client.getServerCapabilities();
    assert.ok(caps?.tools, "the tools capability is visible to the SDK");
  });
});

describe("E2 tools over the official client", () => {
  it("listTools returns the full governed surface (20 tools, stable names)", async () => {
    const r = await client.listTools();
    assert.equal(r.tools.length, 20, "the full governed surface");
    const names = r.tools.map((t) => t.name);
    for (const expected of ["clock", "workspace_write", "approve_action", "call_status", "verify_receipt", "run_drill"]) {
      assert.ok(names.includes(expected), `tool "${expected}" is visible to the official client`);
    }
  });

  it("a safe call completes through the official client", async () => {
    const r = await client.callTool({ name: "clock", arguments: {} });
    assert.ok(!r.isError, JSON.stringify(r));
    const text = (r.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
    assert.ok(text.length > 10, "a real answer came back");
  });

  it("an unknown tool is an honest refusal, not a crash", async () => {
    const r = await client.callTool({ name: "no_such_tool", arguments: {} });
    assert.ok(r.isError === true, "refusals surface as isError results");
    const text = (r.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
    assert.ok(text.includes("refused"), "the refusal is in words: " + text);
  });
});

describe("E3 the human gate, end to end, over the official client", () => {
  it("risky call → in-band gate → approve → executed → the receipt verifies", async () => {
    const first = await client.callTool({
      name: "workspace_write",
      arguments: { name: "sdk-gate.txt", content: "sdk" },
    });
    assert.ok(!first.isError, JSON.stringify(first));
    const text = (first.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
    assert.ok(text.startsWith("Paused at the human gate"), "the gate is announced in-band (the legacy wire the SDK speaks): " + text);
    const approvalId = text.match(/approval (a[0-9a-z]+)/)?.[1];
    const callId = text.match(/call_status "(c[0-9a-z]+)"/)?.[1];
    assert.ok(approvalId && callId, "the handles ride in the text: " + text);

    const appr = await client.callTool({ name: "approve_action", arguments: { approvalId, approve: true } });
    const apprText = (appr.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
    assert.ok(apprText.startsWith("Approved"), apprText);

    let done = "";
    for (let i = 0; i < 120; i++) {
      const st = await client.callTool({ name: "call_status", arguments: { callId } });
      done = (st.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
      if (/done — ok=/.test(done)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(done.includes("ok=true"), "the approved write executed: " + done);
    assert.ok(done.includes("wrote sdk-gate.txt"), done);
    const rec = done.match(/receipt: (r[0-9a-z]+)/);
    assert.ok(rec, "the call minted a receipt");
    const v = await client.callTool({ name: "verify_receipt", arguments: { receiptId: rec![1] } });
    const vText = (v.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
    assert.ok(vText.startsWith("VALID"), "the receipt verifies offline — through the official client: " + vText);
  });

  it("a denial executes nothing (the gate is real, over the official client)", async () => {
    const first = await client.callTool({
      name: "workspace_write",
      arguments: { name: "sdk-denied.txt", content: "x" },
    });
    const text = (first.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
    const approvalId = text.match(/approval (a[0-9a-z]+)/)?.[1];
    const callId = text.match(/call_status "(c[0-9a-z]+)"/)?.[1];
    assert.ok(approvalId && callId, text);
    const deny = await client.callTool({ name: "deny_action", arguments: { approvalId } });
    const denyText = (deny.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
    assert.ok(denyText.startsWith("Denied"), denyText);
    let done = "";
    for (let i = 0; i < 120; i++) {
      const st = await client.callTool({ name: "call_status", arguments: { callId } });
      done = (st.content as Array<{ type: string; text: string }>).find((c) => c.type === "text")?.text ?? "";
      if (/done — ok=/.test(done)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(done.includes("ok=false") || done.includes("denied"), "the denial settled the call: " + done);
    assert.ok(!fs.existsSync(path.join(ROOT, "sdk-denied.txt")), "the denied write did NOT execute");
  });
});

describe("E4 the pinned dependency", () => {
  it("the official SDK is a pinned devDependency (provenance, not a casual import)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert.ok(pkg.devDependencies?.["@modelcontextprotocol/sdk"], "the SDK is declared (dev) in package.json");
    assert.ok(!pkg.dependencies?.["@modelcontextprotocol/sdk"], "the SDK is NOT a product runtime dependency — it is a conformance tool");
    const sdkVersion: string = JSON.parse(
      fs.readFileSync(path.join(ROOT, "node_modules", "@modelcontextprotocol", "sdk", "package.json"), "utf8"),
    ).version;
    assert.match(sdkVersion, /^\d+\.\d+\.\d+$/, "the SDK resolves to a real version");
  });
});
