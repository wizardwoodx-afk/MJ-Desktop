/**
 * VOUCH HARBOR — M6 meta-loop probe (16.3.0, suite #87)
 *
 * The meta-loop is the product proposing changes to its OWN control plane.
 * The acceptance bar is deliberately strict, because a self-modifying
 * governance layer is a loop or a feature depending on these five:
 *
 *   1. PROPOSED IN WORDS  — a reason is mandatory; refusals are vouched
 *   2. SIMULATED          — a dry-run prediction before the gate
 *   3. HUMAN-GATED        — the same gate primitive as every risky action;
 *                           the REVERT is gated too
 *   4. VOUNCHED           — applied / denied / refused / reverted all mint
 *                           receipts that verify offline
 *   5. REVERSIBLE         — revert restores the exact previous state
 *
 * plus the tightening-only rule (the meta loop may add gates, never remove
 * them — loosening happens only via a gated, vouched revert).
 *
 * The strongest assertions are BEHAVIORAL: after a risk.tier tightening is
 * applied, a call to that tool through the governed executor ACTUALLY
 * pauses at the human gate; after the revert, it runs freely again. The
 * control plane changed for real — and changed back.
 *
 * Levels: (a) engine in-process, (b) the real server over real stdio
 * (meta_propose / meta_status / meta_revert + the over-the-wire behavior
 * proof), (c) the committed MCP engine bundle stays byte-pinned.
 */
import assert from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";

import {
  proposeMetaChange,
  revertMetaChange,
  metaChanges,
  metaChange,
  currentGatedTools,
} from "../src/vouch/engine/meta";
import {
  RISKY_TOOLS,
  runVouchToolCall,
  resolveVouchApproval,
  vouchSession,
  verifyVouchReceipt,
} from "../src/vouch/engine/vouch";

declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function pollMeta(changeId: string, timeoutMs = 15000): Promise<ReturnType<typeof metaChange>> {
  const t0 = Date.now();
  for (;;) {
    const c = metaChange(changeId);
    if (c && c.status !== "proposed") return c;
    if (Date.now() - t0 > timeoutMs) throw new Error(`meta change ${changeId} did not settle`);
    await sleep(50);
  }
}

/* ── engine: the five properties, in-process ─────────────────────────────── */
describe("M6 engine — propose → simulate → gate → apply → vouch → revert", () => {
  it("a tightening is gated, applies the REAL control change, and is vouched", async () => {
    assert.equal(RISKY_TOOLS.has("search"), false, "precondition: search starts safe");
    const p = await proposeMetaChange("risk.tier", "search", "probe: tighten search to prove the loop");
    assert.equal(p.pending, true, "meta changes are non-blocking at the gate");
    assert.ok(p.changeId && p.approvalId, "handles returned");
    assert.equal(metaChange(p.changeId)!.status, "proposed");
    resolveVouchApproval(p.approvalId!, true);
    const c = await pollMeta(p.changeId!);
    assert.equal(c.status, "applied");
    assert.equal(c.decision, "approved");
    assert.ok(c.receiptId, "the application mints a receipt");
    assert.equal(RISKY_TOOLS.has("search"), true, "the control plane changed: search is now risky");
    assert.ok(currentGatedTools().includes("search"), "the gated surface reports it");
    const v = await verifyVouchReceipt(c.receiptId!);
    assert.equal(v.ok, true, "the meta receipt verifies offline — " + JSON.stringify(v));
  });

  it("BEHAVIOR PROOF: a re-tiered tool now pauses at the human gate", async () => {
    const r = await runVouchToolCall("search", { query: "does the loop work" }, { origin: "probe" });
    assert.equal(r.pending, true, "search now GATES — the control change is real, not cosmetic");
    resolveVouchApproval(r.approvalId!, true);
    await sleep(400);
  });

  it("the revert is itself gated, restores the exact state, and vouches itself", async () => {
    const origId = metaChanges().find((c) => c.status === "applied")!.id;
    const rv = await revertMetaChange(origId);
    assert.equal(rv.pending, true, "a revert is gated — it changes governance too");
    assert.ok(rv.changeId && rv.changeId !== origId, "the revert is its own audited entry");
    resolveVouchApproval(rv.approvalId!, true);
    const rc = await pollMeta(rv.changeId!);
    assert.equal(rc.status, "applied", "the revert applied");
    assert.equal(rc.revertOf, origId, "the revert entry names what it reverts");
    assert.ok(rc.receiptId, "the revert mints its OWN receipt");
    const orig = metaChange(origId)!;
    assert.equal(orig.status, "reverted", "the original change is marked reverted");
    assert.ok(orig.revertedAt && orig.revertReceiptId, "with the revert's receipt bound to it");
    assert.equal(RISKY_TOOLS.has("search"), false, "the control plane is RESTORED");
    const r2 = await runVouchToolCall("search", { query: "and is it reversible" }, { origin: "probe" });
    assert.equal(r2.pending, false, "search runs freely again — reversibility proven behaviorally");
    const v = await verifyVouchReceipt(rc.receiptId!);
    assert.equal(v.ok, true, "the revert receipt verifies offline");
  });

  it("the tightening-only rule: no demotions, no double reverts, no unknowns — all refused in words and vouched", async () => {
    const d1 = await proposeMetaChange("risk.tier", "workspace_write", "try to loosen the gate");
    assert.equal(d1.ok, false);
    assert.ok(/already at the maximum gate/i.test(d1.output), d1.output);
    assert.ok(d1.receiptId, "the refusal is vouched");

    const d2 = await revertMetaChange("mc-does-not-exist");
    assert.equal(d2.ok, false);
    assert.ok(/unknown meta change/.test(d2.output));
    assert.ok(d2.receiptId, "the refusal is vouched");

    const appliedId = metaChanges().find((c) => c.status === "reverted")!.id;
    const d3 = await revertMetaChange(appliedId);
    assert.equal(d3.ok, false);
    assert.ok(/not "applied"/.test(d3.output), "a reverted change cannot be reverted again");

    const revertEntry = metaChanges().find((c) => c.revertOf !== null)!;
    const d4 = await revertMetaChange(revertEntry.id);
    assert.equal(d4.ok, false);
    assert.ok(/IS a revert/.test(d4.output), "reverts are terminal");

    const d5 = await proposeMetaChange("self_upgrade", "vouch.ts", "nope");
    assert.equal(d5.ok, false);
    assert.ok(/unknown meta kind/.test(d5.output));

    const d6 = await proposeMetaChange("risk.tier", "search", "");
    assert.equal(d6.ok, false);
    assert.ok(/needs a reason/.test(d6.output));
    /* and the control plane never moved */
    assert.equal(RISKY_TOOLS.has("workspace_write"), true, "the demotion never applied");
    assert.equal(RISKY_TOOLS.has("search"), false);
  });

  it("preference.set: applied to the real session, reverted from it, both vouched", async () => {
    const p = await proposeMetaChange("preference.set", "always prefer concise answers in probes", "probe: standing preference");
    assert.equal(p.pending, true);
    resolveVouchApproval(p.approvalId!, true);
    const c = await pollMeta(p.changeId!);
    assert.equal(c.status, "applied");
    assert.ok(vouchSession().preferences.some((x) => x.text === "always prefer concise answers in probes"), "RECALL now carries the preference");
    const rv = await revertMetaChange(c.id);
    assert.equal(rv.pending, true);
    resolveVouchApproval(rv.approvalId!, true);
    const rc = await pollMeta(rv.changeId!);
    assert.equal(rc.status, "applied");
    assert.ok(!vouchSession().preferences.some((x) => x.text === "always prefer concise answers in probes"), "the revert removed it from the session");
  });

  it("a DENIED meta change changes nothing and is still vouched", async () => {
    const p = await proposeMetaChange("preference.set", "a preference the human will refuse", "probe: denial path");
    resolveVouchApproval(p.approvalId!, false);
    const c = await pollMeta(p.changeId!);
    assert.equal(c.status, "denied");
    assert.equal(c.decision, "denied");
    assert.ok(c.receiptId, "the denial is vouched");
    assert.ok(!vouchSession().preferences.some((x) => x.text === "a preference the human will refuse"), "nothing was applied");
    const v = await verifyVouchReceipt(c.receiptId!);
    assert.equal(v.ok, true);
  });

  it("every meta receipt in the ledger verifies offline", async () => {
    const all = metaChanges();
    assert.ok(all.length >= 8, "the ledger is full of audited decisions");
    let verified = 0;
    for (const c of all) {
      if (c.receiptId) {
        const v = await verifyVouchReceipt(c.receiptId);
        assert.equal(v.ok, true, `receipt for ${c.id} (${c.status}) verifies — ${JSON.stringify(v)}`);
        verified++;
      }
    }
    assert.ok(verified >= 8, `at least the decisions vouched: ${verified}`);
  });
});

/* ── protocol: the real server over real stdio ───────────────────────────── */
describe("M6 protocol — meta_propose / meta_status / meta_revert over the wire", () => {
  let child: ChildProcess;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  let buf = "";
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
  const call = (name: string, args: Record<string, unknown>): Promise<string> =>
    request("tools/call", { name, arguments: args }).then((m: any) => m.result.content[0].text as string);
  const pollMetaStatus = async (changeId: string): Promise<string> => {
    for (let i = 0; i < 100; i++) {
      const st = await call("meta_status", { changeId });
      if (!st.includes("pending at the human gate")) return st;
      await sleep(100);
    }
    throw new Error("meta change did not settle over the wire");
  };
  const pollMetaList = async (needle: string): Promise<string> => {
    for (let i = 0; i < 100; i++) {
      const st = await call("meta_status", {});
      if (st.includes(needle)) return st;
      await sleep(100);
    }
    throw new Error(`"${needle}" never appeared in the wire ledger`);
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
          /* notification or unparsable — ignore */
        }
      }
    });
    await sleep(600);
  });
  after(() => {
    child.kill("SIGKILL");
  });

  it("clock is free, then a wire-gated tightening changes its behavior over the wire", async () => {
    await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "0" } });
    const free = await call("clock", {});
    assert.ok(free.length > 0, "clock starts safe over the wire");

    const propText = await call("meta_propose", { kind: "risk.tier", target: "clock", reason: "wire probe: tighten clock" });
    assert.ok(propText.includes("PAUSED at the human gate"), propText);
    const changeId = propText.match(/meta change (mc[0-9a-z]+)/i)! [1];
    const approval = propText.match(/approval (a[0-9a-z]+)/)! [1];

    await call("approve_action", { approvalId: approval, approve: true });
    const st = await pollMetaStatus(changeId);
    assert.ok(st.includes("status: applied"), st);

    /* THE over-the-wire behavior proof: clock now pauses at the gate */
    const gatedText = await call("clock", {});
    assert.ok(gatedText.includes("Paused at the human gate"), "the wire call now gates — " + gatedText);
    const gatedApproval = gatedText.match(/approval (a[0-9a-z]+)/)! [1];
    const gatedCallId = gatedText.match(/call_status "(c[0-9a-z]+)"/)! [1];
    await call("approve_action", { approvalId: gatedApproval, approve: true });
    for (let i = 0; i < 100; i++) {
      const cs = await call("call_status", { callId: gatedCallId });
      if (/done — ok=/.test(cs)) break;
      await sleep(100);
    }
  });

  it("the wire revert restores freedom; the ledger and receipts are auditable over the wire", async () => {
    const listText = await call("meta_status", {});
    assert.ok(listText.includes("Currently gated: "), listText);
    assert.ok(listText.includes("clock"), "the wire tightening is in the ledger");
    const appliedLine = listText.split("\n").find((l) => l.includes("clock") && l.includes("applied"))!;
    const changeId = appliedLine.match(/(mc[0-9a-z]+)/)! [1];
    const recId = appliedLine.match(/receipt (r[0-9a-z]+)/)! [1];
    const v = await call("verify_receipt", { receiptId: recId });
    assert.ok(v.startsWith("VALID"), "the wire-applied meta receipt verifies");

    const rvText = await call("meta_revert", { changeId });
    assert.ok(rvText.includes("PAUSED at the human gate"), "the revert is gated over the wire — " + rvText);
    const rvApproval = rvText.match(/approval (a[0-9a-z]+)/)! [1];
    await call("approve_action", { approvalId: rvApproval, approve: true });
    await pollMetaList("reverted");

    const free = await call("clock", {});
    assert.ok(free.length > 0 && !free.includes("Paused at the human gate"), "clock is free again over the wire — reversibility end to end");
  });
});
