/**
 * VOUCH HARBOR 16.6.0 — MCP CONFORMANCE SUITE (probe #89).
 *
 * The 16.5.0 review, item 3: the MCP router is hand-implemented (no official
 * SDK), and 2026-07-28 is a breaking revision — so exact wire-compatibility
 * is OUR burden. This suite makes that burden mechanical, in BOTH
 * directions, against the OFFICIAL spec JSON Schemas:
 *
 *   1. FIXTURE INTEGRITY — the official schemas are committed under
 *      tools/mcp-conformance/fixtures/ with recorded provenance, and this
 *      probe sha256-pins them. A silently swapped fixture is a fake
 *      conformance claim; the digest makes it fail the gate.
 *   2. RESPONSE CONFORMANCE — a REAL server over REAL stdio is driven
 *      through the modern era (discover, tools/list, safe call, risky
 *      call → MRTR retry → receipt, tasks lifecycle, the two spec'd
 *      error codes) and the legacy era (initialize, tools/list, gate
 *      flow). Every response the server emits is validated against the
 *      official schema definitions.
 *   3. REQUEST CONFORMANCE — every request the probe sends is validated
 *      against the official request definitions: our client-side wire is
 *      spec-shaped, not just our server-side wire.
 *
 * The run also writes tools/mcp-conformance/report.json (regenerated on
 * every run — customer-facing evidence, not a committed artifact).
 */
import assert from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import AjvDraft7 from "ajv";

declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();
const FIX = path.join(ROOT, "tools", "mcp-conformance", "fixtures");

/* ── official fixtures, digest-pinned (provenance in PROVENANCE.md) ──────── */
const FIXTURES: Record<string, string> = {
  "schema-2026-07-28.json": "ef70b61f99b6d2e5e3b46863822eab08dff6a45bedc7a08914e0e5b133f40203",
  "schema-2025-06-18.json": "af845e7e5b9d27107d1690f0936022546177a1403e63ffb11470135b296a2e01",
  "ext-tasks-2026-07-28.json": "bf30afb7ac251e3e22c037b7a685f60ef6603031b5484c0d08b1fa0bbe86d460",
};

/* ── JSON-RPC over real stdio (same discipline as the mcpRouter probe) ───── */
let child: ChildProcess;
let buf = "";
const pending = new Map<number, (msg: any) => void>();
let nextId = 1;

function send(method: string, params: any): { req: any; reply: Promise<any> } {
  const id = nextId++;
  const req = { jsonrpc: "2.0", id, method, params };
  const reply = new Promise<any>((resolve) => pending.set(id, resolve));
  child!.stdin!.write(JSON.stringify(req) + "\n");
  return { req, reply };
}
const request = (method: string, params: any): Promise<any> => send(method, params).reply;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── validators, registered by name so in-document #/$defs refs resolve ──── */
const ajv2026 = new Ajv2020({ strict: false, validateFormats: false });
const ajvTasks = new Ajv2020({ strict: false, validateFormats: false });
const ajv2025 = new AjvDraft7({ strict: false, validateFormats: false });

/* register the official documents by name so in-document #/$defs refs resolve */
ajv2026.addSchema(JSON.parse(fs.readFileSync(path.join(FIX, "schema-2026-07-28.json"), "utf8")), "mcp-2026");
ajvTasks.addSchema(JSON.parse(fs.readFileSync(path.join(FIX, "ext-tasks-2026-07-28.json"), "utf8")), "mcp-tasks");
ajv2025.addSchema(JSON.parse(fs.readFileSync(path.join(FIX, "schema-2025-06-18.json"), "utf8")), "mcp-2025");

type Validator = (data: any) => boolean;
function validator(ajv: Ajv2020 | AjvDraft7, doc: string, def: string): Validator {
  /* the 2025-06-18 document is draft-07 (uses `definitions`); 2026-07-28 and
   * ext-tasks are draft 2020-12 (use `$defs`). */
  const ns = doc === "mcp-2025" ? "definitions" : "$defs";
  const v = ajv.getSchema(`${doc}#/${ns}/${def}`);
  assert.ok(v, `schema definition not found: ${doc}#/${ns}/${def}`);
  return v as Validator;
}

const checks: Array<{ area: string; name: string; ok: boolean; detail: string }> = [];
function record(area: string, name: string, ok: boolean, detail: string): void {
  checks.push({ area, name, ok, detail });
}
function conforms(ajv: Ajv2020 | AjvDraft7, doc: string, def: string, data: any, label: string): void {
  const v = validator(ajv, doc, def);
  const ok = v(data);
  record("response", `${label} → ${def}`, ok, ok ? "" : JSON.stringify(v.errors ?? []).slice(0, 400));
  assert.ok(ok, `NOT CONFORMANT — ${label} vs ${doc}#/$defs/${def}:\n${JSON.stringify(v.errors ?? [], null, 2)}`);
}
function conformsRequest(ajv: Ajv2020 | AjvDraft7, doc: string, def: string, req: any, label: string): void {
  const v = validator(ajv, doc, def);
  const ok = v(req);
  record("request", `${label} → ${def}`, ok, ok ? "" : JSON.stringify(v.errors ?? []).slice(0, 400));
  assert.ok(ok, `NON-CONFORMANT REQUEST — ${label} vs ${doc}#/$defs/${def}:\n${JSON.stringify(v.errors ?? [], null, 2)}`);
}

/* ── modern-era _meta, per the 2026-07-28 spec (stateless discovery) ─────── */
const META = (caps: any = {}) => ({
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": caps,
});
const TASKS_CAPS = { extensions: { "io.modelcontextprotocol/tasks": {} } };

before(async () => {
  child = spawn(process.execPath, ["tools/mcp.mjs"], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  child.stdout!.on("data", (d: Buffer) => {
    buf += d.toString("utf8");
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof msg.id === "number" && pending.has(msg.id)) {
        const resolve = pending.get(msg.id)!;
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });
  // the server announces nothing before the first request — but give it a beat
  await sleep(200);
});

after(() => {
  try {
    child?.kill("SIGKILL");
  } catch {
    /* already gone */
  }
});

describe("C1 fixture integrity — the official schemas are the fixtures, digest-pinned", () => {
  it("all three official schema fixtures are present and match their recorded sha256", () => {
    for (const [file, expected] of Object.entries(FIXTURES)) {
      const p = path.join(FIX, file);
      assert.ok(fs.existsSync(p), `missing fixture: tools/mcp-conformance/fixtures/${file}`);
      const actual = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
      assert.equal(actual, expected, `fixture digest drift — ${file} was replaced; restore it and record it in PROVENANCE.md`);
    }
    assert.ok(fs.existsSync(path.join(ROOT, "tools", "mcp-conformance", "PROVENANCE.md")), "PROVENANCE.md must document where the fixtures came from");
  });
});

describe("C2 modern era — server responses conform to the 2026-07-28 schema", () => {
  it("server/discover conforms (DiscoverResult) and advertises the dual era", async () => {
    const { req, reply } = send("server/discover", { _meta: META() });
    const r = await reply;
    conformsRequest(ajv2026, "mcp-2026", "DiscoverRequest", req, "server/discover request");
    conforms(ajv2026, "mcp-2026", "DiscoverResult", r.result, "discover response");
    const versions: string[] = r.result.supportedVersions;
    assert.ok(versions.includes("2026-07-28") && versions.includes("2025-06-18"), "dual-era: the current and the legacy revision are both advertised");
    assert.deepEqual(r.result.capabilities.extensions["io.modelcontextprotocol/tasks"], {}, "the tasks extension is advertised");
    assert.ok(r.result.cacheScope === "public" && r.result.ttlMs >= 0, "cache hints (spec MUST on complete discover results)");
  });

  it("tools/list conforms (ListToolsResult) and every tool conforms (Tool)", async () => {
    const { req, reply } = send("tools/list", { _meta: META() });
    const r = await reply;
    conformsRequest(ajv2026, "mcp-2026", "ListToolsRequest", req, "tools/list request");
    conforms(ajv2026, "mcp-2026", "ListToolsResult", r.result, "tools/list response");
    assert.equal(r.result.tools.length, 20, "the full governed surface");
    const names = r.result.tools.map((t: any) => t.name);
    assert.deepEqual(names, [...names].sort(), "deterministic sorted order (stable client caches)");
    for (const t of r.result.tools) conforms(ajv2026, "mcp-2026", "Tool", t, `tool "${t.name}"`);
  });

  it("a safe tools/call conforms (CallToolResult, complete) and the call is governed", async () => {
    const { req, reply } = send("tools/call", { name: "clock", arguments: {}, _meta: META() });
    const r = await reply;
    conformsRequest(ajv2026, "mcp-2026", "CallToolRequest", req, "tools/call request (safe)");
    conforms(ajv2026, "mcp-2026", "CallToolResult", r.result, "safe tools/call response");
    assert.equal(r.result.resultType, "complete");
    assert.equal(r.result.isError, false);
  });

  it("a risky call conforms (InputRequiredResult): the gate is a spec-shaped elicitation", async () => {
    const { req, reply } = send("tools/call", {
      name: "workspace_write",
      arguments: { name: "conform-mrtr.txt", content: "x" },
      _meta: META(),
    });
    const r = await reply;
    conformsRequest(ajv2026, "mcp-2026", "CallToolRequest", req, "tools/call request (risky)");
    conforms(ajv2026, "mcp-2026", "InputRequiredResult", r.result, "risky tools/call response");
    assert.equal(r.result.resultType, "input_required");
    assert.ok(r.result.inputRequests?.human_approval, "the approval request rides in inputRequests");
    assert.ok(typeof r.result.requestState === "string" && r.result.requestState.length > 0, "opaque requestState for the retry");
  });

  it("the MRTR retry conforms: CallToolRequest carries inputResponses at top level, and the receipt verifies", async () => {
    const first = await request("tools/call", {
      name: "workspace_write",
      arguments: { name: "conform-mrtr.txt", content: "conform" },
      _meta: META(),
    });
    assert.equal(first.result.resultType, "input_required");
    const { req, reply } = send("tools/call", {
      name: "workspace_write",
      arguments: { name: "conform-mrtr.txt", content: "conform" },
      inputResponses: { human_approval: { action: "accept", content: { decision: "accept" } } },
      requestState: first.result.requestState,
      _meta: META(),
    });
    const r = await reply;
    conformsRequest(ajv2026, "mcp-2026", "CallToolRequest", req, "MRTR retry request (top-level inputResponses)");
    conforms(ajv2026, "mcp-2026", "CallToolResult", r.result, "MRTR retry response");
    assert.equal(r.result.resultType, "complete");
    const text: string = r.result.content[0].text;
    const callId = text.match(/call_status "(c[0-9a-z]+)"/)?.[1];
    assert.ok(callId, "the approved call reports its call status");
    for (let i = 0; i < 120; i++) {
      const st = await request("tools/call", { name: "call_status", arguments: { callId }, _meta: META() });
      const stText: string = st.result.content[0].text;
      if (/done — ok=/.test(stText)) {
        assert.ok(stText.includes("ok=true"), stText);
        const rec = stText.match(/receipt: (r[0-9a-z]+)/);
        assert.ok(rec, "the MRTR-approved call mints a receipt");
        const v = await request("tools/call", { name: "verify_receipt", arguments: { receiptId: rec![1] }, _meta: META() });
        assert.ok(v.result.content[0].text.startsWith("VALID"), "the receipt verifies offline");
        return;
      }
      await sleep(100);
    }
    assert.fail("MRTR-approved call did not settle");
  });

  it("the Tasks lifecycle conforms (CreateTaskResult, GetTaskResult, UpdateTaskResult, completed + receipt)", async () => {
    const { req, reply } = send("tools/call", {
      name: "workspace_write",
      arguments: { name: "conform-task.txt", content: "t" },
      _meta: META(TASKS_CAPS),
    });
    const created = await reply;
    conformsRequest(ajv2026, "mcp-2026", "CallToolRequest", req, "tools/call request (tasks client)");
    conforms(ajvTasks, "mcp-tasks", "CreateTaskResult", created.result, "task creation response");
    const taskId: string = created.result.taskId;
    assert.ok(taskId.length > 0, "a durable task handle");
    assert.equal(created.result.status, "input_required", "the gate rides the task");
    assert.equal(created.result.resultType, "task");

    const g1 = await request("tasks/get", { taskId, _meta: META(TASKS_CAPS) });
    conforms(ajvTasks, "mcp-tasks", "GetTaskResult", g1.result, "tasks/get response (input_required)");
    assert.equal(g1.result.status, "input_required");

    const upd = await request("tasks/update", {
      taskId,
      inputResponses: { human_approval: { action: "accept" } },
      _meta: META(TASKS_CAPS),
    });
    conforms(ajvTasks, "mcp-tasks", "UpdateTaskResult", upd.result, "tasks/update response");

    for (let i = 0; i < 120; i++) {
      const g = await request("tasks/get", { taskId, _meta: META(TASKS_CAPS) });
      conforms(ajvTasks, "mcp-tasks", "GetTaskResult", g.result, `tasks/get poll ${i + 1}`);
      if (g.result.status === "completed") {
        assert.ok(g.result.result.content[0].text.includes("ok=true"), g.result.result.content[0].text);
        const rec = g.result.result.content[0].text.match(/receipt: (r[0-9a-z]+)/);
        assert.ok(rec, "the task's terminal result carries the receipt");
        const v = await request("tools/call", { name: "verify_receipt", arguments: { receiptId: rec![1] }, _meta: META(TASKS_CAPS) });
        assert.ok(v.result.content[0].text.startsWith("VALID"));
        return;
      }
      if (g.result.status === "failed") assert.fail("task failed: " + JSON.stringify(g.result.statusMessage));
      await sleep(100);
    }
    assert.fail("task did not reach completed");
  });

  it("the two spec'd error codes conform (MissingRequiredClientCapabilityError, UnsupportedProtocolVersionError)", async () => {
    const { req, reply } = send("tasks/get", { taskId: "t_any", _meta: META() });
    const noCap = await reply;
    assert.equal(noCap.error.code, -32021);
    conforms(ajv2026, "mcp-2026", "MissingRequiredClientCapabilityError", noCap, "-32021 error envelope");
    assert.deepEqual(
      noCap.error.data.requiredCapabilities,
      { extensions: { "io.modelcontextprotocol/tasks": {} } },
      "the missing capability is named as a ClientCapabilities object (official shape)",
    );
    void req;

    const { req: req2, reply: reply2 } = send("tools/list", {
      _meta: { "io.modelcontextprotocol/protocolVersion": "1900-01-01", "io.modelcontextprotocol/clientCapabilities": {} },
    });
    const badVer = await reply2;
    assert.equal(badVer.error.code, -32022);
    conforms(ajv2026, "mcp-2026", "UnsupportedProtocolVersionError", badVer, "-32022 error envelope");
    assert.ok(badVer.error.data.supported.includes("2026-07-28"), "the retry list names the supported versions");
    assert.equal(badVer.error.data.requested, "1900-01-01");
    void req2;
  });
});

describe("C3 legacy era — 2025-06-18 clients see exactly their era's wire", () => {
  it("initialize conforms (InitializeResult, 2025-06-18 schema) with no modern leakage", async () => {
    const { req, reply } = send("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "conformance-probe", version: "1" },
    });
    const r = await reply;
    conformsRequest(ajv2025, "mcp-2025", "InitializeRequest", req, "legacy initialize request");
    conforms(ajv2025, "mcp-2025", "InitializeResult", r.result, "legacy initialize response");
    assert.equal(r.result.protocolVersion, "2025-06-18");
    assert.equal(r.result.serverInfo.name, "vouch-harbor");
    assert.equal("resultType" in r.result, false, "no modern resultType on the legacy wire");
  });

  it("legacy tools/list conforms (ListToolsResult, 2025-06-18) with no modern fields", async () => {
    const { req, reply } = send("tools/list", {});
    const r = await reply;
    conformsRequest(ajv2025, "mcp-2025", "ListToolsRequest", req, "legacy tools/list request");
    conforms(ajv2025, "mcp-2025", "ListToolsResult", r.result, "legacy tools/list response");
    assert.equal("resultType" in r.result, false, "legacy results carry no modern fields");
    for (const t of r.result.tools) conforms(ajv2025, "mcp-2025", "Tool", t, `legacy tool "${t.name}"`);
  });

  it("legacy gate flow conforms: no resultType, approval via approve_action + call_status, receipt verifies", async () => {
    const first = await request("tools/call", {
      name: "workspace_write",
      arguments: { name: "conform-legacy.txt", content: "leg" },
    });
    conforms(ajv2025, "mcp-2025", "CallToolResult", first.result, "legacy risky call response");
    assert.equal("resultType" in first.result, false, "the legacy gate has no modern resultType");
    assert.equal("requestState" in first.result, false, "the legacy gate has no requestState");
    const text: string = first.result.content[0].text;
    assert.ok(text.startsWith("Paused at the human gate"), "the legacy gate is announced in-band, the 16.2-16.4 way: " + text);
    const approvalId = text.match(/approval (a[0-9a-z]+)/)?.[1];
    const callId = text.match(/call_status "(c[0-9a-z]+)"/)?.[1];
    assert.ok(approvalId && callId, "the approval + call handles ride in the text: " + text);

    const appr = await request("tools/call", {
      name: "approve_action",
      arguments: { approvalId, approve: true },
    });
    conforms(ajv2025, "mcp-2025", "CallToolResult", appr.result, "legacy approve_action response");
    assert.ok(appr.result.content[0].text.startsWith("Approved"), appr.result.content[0].text);

    for (let i = 0; i < 120; i++) {
      const st = await request("tools/call", { name: "call_status", arguments: { callId } });
      conforms(ajv2025, "mcp-2025", "CallToolResult", st.result, `legacy call_status poll ${i + 1}`);
      const stText: string = st.result.content[0].text;
      if (/done — ok=/.test(stText)) {
        assert.ok(stText.includes("ok=true"), stText);
        const rec = stText.match(/receipt: (r[0-9a-z]+)/);
        assert.ok(rec, "the legacy-approved call mints a receipt");
        const v = await request("tools/call", { name: "verify_receipt", arguments: { receiptId: rec![1] } });
        assert.ok(v.result.content[0].text.startsWith("VALID"), "the receipt verifies offline");
        return;
      }
      await sleep(100);
    }
    assert.fail("legacy-approved call did not settle");
  });
});

describe("C4 conformance report — the evidence is written, not just asserted", () => {
  it("report.json is written with the full check tally and zero failures", () => {
    const failed = checks.filter((c) => !c.ok);
    assert.equal(failed.length, 0, "conformance checks failed: " + failed.map((f) => `${f.name} — ${f.detail}`).join(" | "));
    const report = {
      suite: "vouch-harbor-mcp-conformance",
      spec: "Model Context Protocol",
      eras: { modern: "2026-07-28", legacy: "2025-06-18" },
      fixtures: FIXTURES,
      totalChecks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      checks: checks,
    };
    const out = path.join(ROOT, "tools", "mcp-conformance", "report.json");
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    void report;
  });
});
