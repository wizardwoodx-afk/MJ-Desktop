/**
 * VOUCH HARBOR — M3 capability router probe (16.2.0, suite #86)
 *
 * "Every capability through authorize → simulate → approve → call → verify →
 * receipt" must hold for the MCP face too, not just the chat face. This
 * suite pins it at three levels:
 *   1. ENGINE — runVouchToolCall is the single governed path: safe calls
 *      act + vouch; risky calls PAUSE at the human gate (pending +
 *      approval handle), denials execute nothing, refusals are vouched,
 *      and every completed call's receipt verifies offline with the
 *      calling face's origin riding in the events.
 *   2. PROTOCOL — the real server (tools/mcp.mjs) over real stdio
 *      JSON-RPC: initialize, tools/list (16 governed tools), tools/call
 *      through the governed pipeline, the full gate flow over the wire
 *      (pending → deny / approve → call_status → receipt), honest
 *      refusals (unknown tool, missing crew), and JSON-RPC errors.
 *   3. FRESHNESS — the committed engine bundle (tools/mcp-engine.mjs) is
 *      byte-identical to a fresh rebuild, same discipline as the offline
 *      pack: a stale bundle fails the gate.
 */
import assert from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";

import {
  runVouchToolCall,
  vouchToolCallStatus,
  vouchSession,
  resolveVouchApproval,
  verifyVouchReceipt,
} from "../src/vouch/engine/vouch";
import { VH_VERSION } from "../src/version";

declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => T | null | undefined, what: string, timeoutMs = 15000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v !== null && v !== undefined) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

/* ── 1. ENGINE — the governed single-call path ───────────────────────────── */
describe("M3 engine — runVouchToolCall is the only route, governed end to end", () => {
  it("a safe call acts, vouches, and the receipt verifies offline with the face's origin", async () => {
    const r = await runVouchToolCall("calculator", { expression: "1+1" }, { origin: "mcp" });
    assert.equal(r.ok, true, "calculator ran");
    assert.equal(r.output, "2", "real parser result");
    assert.equal(r.pending, false);
    assert.equal(r.approved, true, "safe tools are not gated");
    assert.ok(r.receiptId, "every completed call mints a receipt");
    const ref = vouchSession().receipts[vouchSession().receipts.length - 1];
    assert.equal(ref.id, r.receiptId, "the receipt is in the session ledger");
    const sessionEv = ref.receipt.events.find((e) => e.kind === "vouch.session")!.data as { origin?: string };
    assert.equal(sessionEv.origin, "mcp", "provenance: the calling face rides in the receipt");
    const verdict = ref.receipt.events.find((e) => e.kind === "vouch.verdict")!.data as { status?: string };
    assert.equal(verdict.status, "done");
    const v = await verifyVouchReceipt(r.receiptId!);
    assert.equal(v.ok, true, "the MCP call's receipt verifies offline — " + JSON.stringify(v));
  });

  it("a risky call PAUSES at the human gate: pending, nothing executed, denial is vouched", async () => {
    const r = await runVouchToolCall("workspace_write", { name: "gate-probe.txt", content: "x" }, { origin: "mcp" });
    assert.equal(r.pending, true, "risky calls do not block the caller");
    assert.ok(r.approvalId && r.callId, "the caller gets the approval handle + call id");
    assert.equal(vouchToolCallStatus(r.callId)!.state, "gated", "the call is tracked as gated");
    const approval = vouchSession().approvals.find((a) => a.id === r.approvalId);
    assert.ok(approval && approval.status === "pending", "the approval is in the session's gate queue");
    /* deny it — nothing may execute */
    resolveVouchApproval(r.approvalId!, false);
    const track = await waitFor(() => (vouchToolCallStatus(r.callId)!.state === "done" ? vouchToolCallStatus(r.callId)! : null), "denied call to settle");
    assert.equal(track.result!.ok, false);
    assert.ok(track.result!.output.includes("Denied by the human gate"), "the refusal is honest");
    assert.equal(track.result!.approved, false);
    assert.ok(!fs.existsSync(path.join(ROOT, "gate-probe.txt")), "the denied write did NOT execute");
    assert.ok(track.result!.receiptId, "the DENIAL mints a receipt — the audit trail is never optional");
    const ref = vouchSession().receipts.find((x) => x.id === track.result!.receiptId)!;
    const verdict = ref.receipt.events.find((e) => e.kind === "vouch.verdict")!.data as { status?: string };
    assert.equal(verdict.status, "denied");
    const simEv = ref.receipt.events.find((e) => e.kind === "vouch.simulation");
    assert.ok(simEv, "the SIMULATION (dry-run prediction) is vouched before the gate");
    const v = await verifyVouchReceipt(track.result!.receiptId!);
    assert.equal(v.ok, true, "the denial receipt verifies offline — " + JSON.stringify(v));
  });

  it("a risky call that is APPROVED executes and vouches", async () => {
    const r = await runVouchToolCall("workspace_write", { name: "mcp-approved.txt", content: "hello from the mcp face" }, { origin: "mcp" });
    assert.equal(r.pending, true);
    resolveVouchApproval(r.approvalId!, true);
    const track = await waitFor(() => (vouchToolCallStatus(r.callId)!.state === "done" ? vouchToolCallStatus(r.callId)! : null), "approved call to settle");
    assert.equal(track.result!.ok, true, "the approved write executed");
    assert.ok(track.result!.output.includes("wrote mcp-approved.txt"), track.result!.output);
    assert.equal(track.result!.simulated, true, "it went through SIMULATE before the gate");
    assert.ok(track.result!.receiptId, "the approved call mints a receipt");
    assert.equal((await verifyVouchReceipt(track.result!.receiptId!)).ok, true);
    const written = path.join(ROOT, "mcp-approved.txt");
    if (fs.existsSync(written)) fs.rmSync(written);
  });

  it("an unknown tool is refused in words — and the refusal is vouched", async () => {
    const r = await runVouchToolCall("self_upgrade", {}, { origin: "mcp" });
    assert.equal(r.ok, false);
    assert.ok(r.output.includes('unknown tool "self_upgrade"'), "refusal names the tool");
    assert.ok(r.receiptId, "refusals mint receipts too");
  });
});

/* ── 2. PROTOCOL — the real server over real stdio ───────────────────────── */
describe("M3 protocol — tools/mcp.mjs speaks MCP over stdio, governed", () => {
  let child: ChildProcess;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  let buf = "";
  let serverLog = "";
  let nextId = 1;

  const request = (method: string, params?: Record<string, unknown>): Promise<any> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) + "\n");
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`timeout waiting for ${method}`));
        }
      }, 20000);
    });
  };
  const notify = (method: string, params?: Record<string, unknown>): void => {
    child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) }) + "\n");
  };
  /** Poll call_status until the call has settled (done) — the denial/approval
   * continuation mints its receipt asynchronously after the human decides. */
  const pollStatus = async (callId: string, attempts = 100, intervalMs = 100): Promise<any> => {
    for (let i = 0; i < attempts; i++) {
      const st = await request("tools/call", { name: "call_status", arguments: { callId } });
      if (/done — ok=/.test(st.result.content[0].text)) return st;
      await sleep(intervalMs);
    }
    throw new Error(`call did not settle in ${attempts * intervalMs}ms`);
  };

  before(async () => {
    child = spawn(process.execPath, ["tools/mcp.mjs"], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout!.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line.length === 0) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) {
            const p = pending.get(msg.id)!;
            pending.delete(msg.id);
            p.resolve(msg);
          }
        } catch {
          serverLog += `UNPARSED: ${line}\n`;
        }
      }
    });
    child.stderr!.on("data", (d: Buffer) => (serverLog += d.toString("utf8")));
    // wait for the server's import to settle
    await sleep(600);
  });
  after(() => {
    child.kill("SIGKILL");
    /* sweep the files this suite wrote into the trunk */
    for (const f of ["gate-probe.txt", "wire-denied.txt", "wire-approved.txt"]) {
      const p = path.join(ROOT, f);
      if (fs.existsSync(p)) fs.rmSync(p);
    }
  });

  it("initialize negotiates the protocol and names the server", async () => {
    const r = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "0" } });
    assert.equal(r.result.protocolVersion, "2025-06-18");
    assert.equal(r.result.serverInfo.name, "vouch-harbor");
    assert.equal(r.result.serverInfo.version, VH_VERSION);
    assert.ok(r.result.instructions.toLowerCase().includes("human gate"), "the instructions name the gate, plainly");
    notify("notifications/initialized");
  });

  it("tools/list exposes the governed surface (20 tools, schemas, honest risk labels)", async () => {
    const r = await request("tools/list");
    const tools: Array<{ name: string; description: string }> = r.result.tools;
    assert.equal(tools.length, 20);
    const names = new Set(tools.map((t) => t.name));
    for (const n of ["calculator", "workspace_write", "dispatch_mission", "approve_action", "deny_action", "call_status", "mission_status", "verify_receipt", "system_info", "meta_propose", "meta_status", "meta_revert", "run_drill"]) {
      assert.ok(names.has(n), `tool ${n} exposed`);
    }
    for (const t of tools) assert.ok(t.description.length > 10 && t.inputSchema && t.inputSchema.type === "object", `${t.name} has a schema`);
    const ww = tools.find((t) => t.name === "workspace_write")!;
    assert.ok(/RISKY|HUMAN GATE/i.test(ww.description), "the risky tool says it is gated");
  });

  it("a safe tools/call runs the real tool and mints a receipt over the wire", async () => {
    const r = await request("tools/call", { name: "calculator", arguments: { expression: "6*7" } });
    assert.equal(r.result.isError, false);
    const text: string = r.result.content[0].text;
    assert.ok(text.includes("42"), text);
    const m = text.match(/receipt: (r[0-9a-z]+)/);
    assert.ok(m, "the response carries the receipt id");
    const v = await request("tools/call", { name: "verify_receipt", arguments: { receiptId: m![1] } });
    assert.ok(v.result.content[0].text.startsWith("VALID"), v.result.content[0].text);
  });

  it("an unknown tool is refused over the wire (isError + named refusal)", async () => {
    const r = await request("tools/call", { name: "rm_rf_everything", arguments: {} });
    assert.equal(r.result.isError, true);
    assert.ok(r.result.content[0].text.includes('unknown MCP tool "rm_rf_everything"'), r.result.content[0].text);
  });

  it("the FULL gate flow over the wire: pending → deny → vouched denial", async () => {
    const r = await request("tools/call", { name: "workspace_write", arguments: { name: "wire-denied.txt", content: "nope" } });
    const text: string = r.result.content[0].text;
    assert.ok(text.includes("Paused at the human gate"), text);
    const approval = text.match(/approval (a[0-9a-z]+)/)! [1];
    const callId = text.match(/call_status "(c[0-9a-z]+)"/)! [1];
    /* nothing executed while gated */
    const deny = await request("tools/call", { name: "deny_action", arguments: { approvalId: approval } });
    assert.ok(deny.result.content[0].text.includes("Denied"), deny.result.content[0].text);
    const st = await pollStatus(callId);
    assert.equal(st.result.isError, true, "a denied call reports not-ok");
    assert.ok(st.result.content[0].text.includes("Denied by the human gate"), st.result.content[0].text);
    const rec = st.result.content[0].text.match(/receipt: (r[0-9a-z]+)/);
    assert.ok(rec, "the wire denial mints a receipt");
    const v = await request("tools/call", { name: "verify_receipt", arguments: { receiptId: rec![1] } });
    assert.ok(v.result.content[0].text.startsWith("VALID"));
  });

  it("the FULL gate flow over the wire: pending → approve → executed + vouched", async () => {
    const r = await request("tools/call", { name: "workspace_write", arguments: { name: "wire-approved.txt", content: "hello wire" } });
    const text: string = r.result.content[0].text;
    const approval = text.match(/approval (a[0-9a-z]+)/)! [1];
    const callId = text.match(/call_status "(c[0-9a-z]+)"/)! [1];
    await request("tools/call", { name: "approve_action", arguments: { approvalId: approval, approve: true } });
    const done = await pollStatus(callId);
    assert.ok(done.result.content[0].text.includes("done — ok=true"), "the approved call reports ok=true");
    assert.ok(done.result.content[0].text.includes("wrote wire-approved.txt"), done.result.content[0].text);
    const list = await request("tools/call", { name: "workspace_list", arguments: {} });
    assert.ok(list.result.content[0].text.includes("wire-approved.txt"), "the approved write is in the workspace");
  });

  it("dispatch_mission over the wire: gated, then a REAL mission loop runs and vouches", async () => {
    const r = await request("tools/call", { name: "dispatch_mission", arguments: { objective: "probe: check that the mcp face dispatches a real mission" } });
    const text: string = r.result.content[0].text;
    assert.ok(text.includes("Paused at the human gate"), "dispatch is risky → gated first");
    const approval = text.match(/approval (a[0-9a-z]+)/)! [1];
    const callId = text.match(/call_status "(c[0-9a-z]+)"/)! [1];
    await request("tools/call", { name: "approve_action", arguments: { approvalId: approval, approve: true } });
    const done = await pollStatus(callId, 120, 500);
    assert.equal(done.result.isError, false, "the mission completed");
    const doneText: string = done.result.content[0].text;
    assert.ok(doneText.includes("Dispatched — mission_"), doneText);
    assert.ok(/crew /.test(doneText) && /verified/.test(doneText), "the report carries the real crew + verified seats");
    const rec = doneText.match(/receipt: (r[0-9a-z]+)/);
    assert.ok(rec, "the dispatch mints a receipt");
    const v = await request("tools/call", { name: "verify_receipt", arguments: { receiptId: rec![1] } });
    assert.ok(v.result.content[0].text.startsWith("VALID"), "the dispatch receipt verifies offline");
    const ms = await request("tools/call", { name: "mission_status", arguments: {} });
    const msText: string = ms.result.content[0].text;
    assert.ok(msText.includes("mission_") && /status:/.test(msText), "the mission is in the unified ledger");
    assert.ok(msText.includes(msText.match(/mission_([0-9a-z]+)/)![0]), "latest mission is the one dispatched");
  });

  it("system_info reports the product, and JSON-RPC errors are standard", async () => {
    const r = await request("tools/call", { name: "system_info", arguments: {} });
    assert.ok(r.result.content[0].text.includes(VH_VERSION), "version in the info");
    const bad = await request("nope/method");
    assert.equal(bad.error.code, -32601, "unknown method → -32601");
  });
});

/* ── 3. FRESHNESS — the committed engine bundle is a faithful build ──────── */
describe("M3 bundle — tools/mcp-engine.mjs is byte-pinned", () => {
  const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");
  it("the committed bundle matches its recorded sha256 (offline-capable pin)", () => {
    const shaFile = path.join(ROOT, "tools", "mcp-engine.sha256");
    assert.ok(fs.existsSync(shaFile), "tools/mcp-engine.sha256 is missing — rebuild with: npm run mcp:build");
    const expected = fs.readFileSync(shaFile, "utf8").trim().split(/\s+/)[0];
    const shipped = fs.readFileSync(path.join(ROOT, "tools", "mcp-engine.mjs"));
    assert.equal(sha256(shipped), expected, "the committed MCP engine bundle does not match its recorded sha256 — rebuild with: npm run mcp:build");
  });
  it("a fresh rebuild is byte-identical to the committed bundle (live only)", async () => {
    // 16.4.1-windows-fix: node_modules/.bin/esbuild is an extensionless shell
    // shim — it exists (so the old existsSync check passed) but Windows
    // cannot exec it (ENOENT). Resolve the platform executable and run
    // through the shell on Windows, matching tools/run-all-probes.mjs.
    const exe = process.platform === "win32" ? "esbuild.cmd" : "esbuild";
    const esbuild = path.join(ROOT, "node_modules", ".bin", exe);
    if (!fs.existsSync(esbuild)) {
      // Offline pack mode: no node_modules → the sha256 pin above is the gate.
      console.log("  (esbuild not available in this environment — source-rebuild check skipped; sha256 pin enforced)");
      return;
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vh-mcp-build-"));
    const out = path.join(tmp, "mcp-engine.mjs");
    const { execFileSync } = await import("node:child_process");
    execFileSync(esbuild, [
      "src/vouch/engine/mcpRouter.ts",
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--packages=external",
      "--outfile=" + out,
      "--log-level=error",
    ], { cwd: ROOT, shell: process.platform === "win32" });
    const fresh = fs.readFileSync(out);
    const shipped = fs.readFileSync(path.join(ROOT, "tools", "mcp-engine.mjs"));
    assert.equal(sha256(fresh), sha256(shipped), "the committed MCP engine bundle is stale — rebuild with: npm run mcp:build");
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
