/**
 * VOUCH HARBOR — 16.4.0 drill probe (suite #88)
 *
 * THE DRILL is the product proving itself on real missions: a fresh REAL
 * git repository, the repository's OWN test command executed for real,
 * the REAL mission loop (real governance arena, real git worktrees, one
 * signed cycle receipt), a unified mission-ledger entry, and a vouched
 * drill report with an attestation digest.
 *
 * What this suite pins:
 *   1. REAL — the scenario repos are real git repos and the verdict comes
 *      from the repo's own test command (the report carries the real test
 *      output tail).
 *   2. NO FAKE PASSES — the `impossible` scenario must come back FAILED
 *      with the real failing test output; its repo is kept for forensics;
 *      it is vouched like everything else.
 *   3. ONE THROAT — run_drill is a governed tool (risky): through
 *      runVouchToolCall it pauses at the human gate like every mission.
 *   4. LEDGER PARITY — drill missions land in the unified mission ledger.
 *   5. WIRE — over real stdio: run_drill → gate → approve → poll
 *      call_status → PASSED → the receipt verifies over the wire.
 *   6. REPRODUCIBLE — the attestation digest is stable across runs of the
 *      same scenario (it covers stable fields, not wall-clock time).
 */
import assert from "node:assert";
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";

import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { runDrill, drillReports, DRILL_SCENARIOS, findHarnessBin, testFileCanary } from "../src/vouch/engine/drill";
import { HARNESSES } from "../src/domain/harness";
import {
  VOUCH_TOOLS,
  RISKY_TOOLS,
  runVouchToolCall,
  resolveVouchApproval,
  vouchToolCallStatus,
  vouchMissions,
  verifyVouchReceipt,
} from "../src/vouch/engine/vouch";

declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let forensics: string | null = null;
after(() => {
  if (forensics && fs.existsSync(forensics)) fs.rmSync(forensics, { recursive: true, force: true });
});

/* ── engine: real repos, real tests, honest outcomes ─────────────────────── */
describe("drill — the product proving itself on real missions", () => {
  it("run_drill is a governed tool: registered and RISKY (it is a mission)", () => {
    assert.ok(VOUCH_TOOLS["run_drill"], "run_drill is in the governed tool registry");
    assert.ok(RISKY_TOOLS.has("run_drill"), "run_drill is on the risky side — it pauses at the gate");
  });

  it("guard: a real git repo, the real loop, the repo's OWN tests — PASSED, vouched, led", async () => {
    const r = await runDrill("guard");
    assert.equal(r.ok, true, r.output);
    assert.equal(r.report!.status, "passed");
    assert.equal(r.report!.verifiedSeats, 2, "both seats verified by the repository's own check");
    assert.equal(r.report!.seatCount, 2);
    assert.ok(r.report!.testTail.includes("all tests pass"), "the REAL test output is in the report: " + r.report!.testTail);
    assert.equal(r.report!.repoPath, null, "a passed drill cleans up its repo");
    assert.equal(r.report!.missionReceiptOk, true, "the loop's own cycle receipt is signed");
    const v = await verifyVouchReceipt(r.report!.receiptId!);
    assert.equal(v.ok, true, "the drill receipt verifies offline — " + JSON.stringify(v));
    const inLedger = vouchMissions().find((m) => m.missionId === r.report!.missionId);
    assert.ok(inLedger, "the drill mission is in the UNIFIED mission ledger");
    assert.equal(inLedger!.status, "completed");
    assert.ok(inLedger!.objective.startsWith("drill:guard"), "ledger entry carries the drill provenance");
  });

  it("maths: implementing the missing function makes the failing test pass — PASSED", async () => {
    const r = await runDrill("maths");
    assert.equal(r.report!.status, "passed", r.output);
    assert.equal(r.report!.verifiedSeats, 2);
    assert.ok(r.report!.testTail.includes("all tests pass"), "the repo's own test passed for real");
  });

  it("impossible: the honest-failure scenario — FAILED for real, never a fake pass, repo kept, still vouched", async () => {
    const r = await runDrill("impossible");
    assert.equal(r.ok, false);
    assert.equal(r.report!.status, "failed", "the loop reported failure — the drill says so");
    assert.ok(r.report!.verifiedSeats < r.report!.seatCount, "unverified seats are reported, not papered over");
    assert.ok(r.report!.testTail.includes("FAIL: SEAL missing or wrong"), "the real failing test output is in the report");
    assert.ok(r.report!.repoPath, "the failed scenario's repo is kept for forensics");
    assert.ok(fs.existsSync(r.report!.repoPath!), "the forensics repo is a real directory");
    const gitHead = fs.existsSync(path.join(r.report!.repoPath!, ".git"));
    assert.ok(gitHead, "the forensics repo is a REAL git repo");
    const v = await verifyVouchReceipt(r.report!.receiptId!);
    assert.equal(v.ok, true, "the failure is vouched too");
    forensics = r.report!.repoPath;
  });

  it("unknown scenarios are refused in words — nothing runs, nothing is claimed", async () => {
    const r = await runDrill("nope");
    assert.equal(r.ok, false);
    assert.equal(r.report, null);
    assert.ok(r.output.includes("unknown drill scenario"), r.output);
    assert.ok(r.output.includes("guard") && r.output.includes("maths") && r.output.includes("impossible"), "the known scenarios are named");
  });

  it("the attestation digest is reproducible per scenario (stable fields, not wall-clock)", async () => {
    const a = await runDrill("guard");
    const b = await runDrill("guard");
    assert.equal(a.report!.digest, b.report!.digest, "same scenario → same attestation digest");
    assert.equal(a.report!.digest.length, 64, "sha256 hex");
    const c = await runDrill("maths");
    assert.notEqual(a.report!.digest, c.report!.digest, "different scenarios → different digests");
  });

  it("the reproducible benchmark CLI (16.6.0): real run, honest verdicts, stable digest, cross-process attestation parity", async () => {
    const { execFileSync } = await import("node:child_process");
    const stdout = execFileSync(process.execPath, ["tools/drill-benchmark.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 240_000,
    });
    const rep = JSON.parse(stdout);
    assert.equal(rep.suite, "vouch-harbor-drill-benchmark");
    assert.ok(rep.scope.includes("DETERMINISTIC"), "the deterministic-seat distinction stays explicit in the artifact (not model intelligence)");
    assert.ok(Array.isArray(rep.scenarios) && rep.scenarios.length === 3, "the full catalog");
    const byId: Record<string, any> = Object.fromEntries(rep.scenarios.map((s: any) => [s.scenarioId, s]));
    assert.equal(byId.guard.status, "passed");
    assert.equal(byId.maths.status, "passed");
    assert.equal(byId.impossible.status, "failed", "the honest failure ships in the benchmark — never a fake pass");
    assert.match(rep.overallDigest, /^[0-9a-f]{64}$/, "a single stable digest for the whole run");
    const recomputed = crypto
      .createHash("sha256")
      .update(
        rep.scenarios
          .map((s: any) => [s.scenarioId, s.status, s.verifiedSeats, s.seatCount, s.cycleNo, s.engine, s.missionReceiptOk, s.testTail].join("|"))
          .join("\n"),
      )
      .digest("hex");
    assert.equal(rep.overallDigest, recomputed, "overallDigest recomputes from the stable fields alone");
    for (const s of DRILL_SCENARIOS) {
      const local = drillReports().filter((r) => r.scenarioId === s.id).pop();
      assert.ok(local, `in-process report for ${s.id}`);
      assert.equal(byId[s.id].attestation, local.digest, `cross-process attestation parity for ${s.id}`);
    }
  });

  it("benchmark integrity (16.7.0): two runs carry different SEALs, and the test file is out of every seat worktree", async () => {
    const first = await runDrill("impossible");
    const firstSeal = fs.readFileSync(path.join(first.report!.repoPath!, "canonical-test.js"), "utf8").match(/SEAL !== "([0-9a-f]{32})"/)?.[1];
    assert.ok(firstSeal, "run 1 has a 128-bit SEAL in its canonical test");
    const second = await runDrill("impossible");
    const secondSeal = fs.readFileSync(path.join(second.report!.repoPath!, "canonical-test.js"), "utf8").match(/SEAL !== "([0-9a-f]{32})"/)?.[1];
    assert.ok(secondSeal, "run 2 has a 128-bit SEAL in its canonical test");
    assert.notEqual(firstSeal, secondSeal, "the SEAL is random per run — the honest-failure scenario is impossible for a REAL model, not just the built-in seat's fixed playbook");
    // the judge never enters the seat's worktree: test.js and canonical-test.js
    // are NOT tracked in the baseline commit (worktrees are fresh checkouts).
    const tracked = execFileSync("git", ["ls-files"], { cwd: first.report!.repoPath!, encoding: "utf8" }).split("\n").filter(Boolean);
    assert.ok(tracked.includes("vault.js"), "the code files are committed");
    assert.ok(!tracked.includes("test.js"), "the test file is NOT committed into the seat's worktree");
    assert.ok(!tracked.includes("canonical-test.js"), "the canonical test is untracked (verifier-owned)");
    // and the verdict is unchanged by the integrity upgrade:
    assert.equal(second.report!.status, "failed", "impossible still fails honestly");
    assert.ok(second.report!.testTail.includes("FAIL: SEAL missing or wrong"), second.report!.testTail);
  });

  it("the test-file canary classifies absent / ok / tampered (pure, probe-pinned)", () => {
    const canary = testFileCanary("CANONICAL");
    assert.equal(canary(null), "absent", "no test file yet (the normal pre-injection state)");
    assert.equal(canary("CANONICAL"), "ok");
    assert.equal(canary("HACKED"), "tampered", "a seat-modified test is detected");
  });

  it("the external-model seam refuses honestly: unknown harness, missing CLI — never a silent fallback", async () => {
    const unknown = await runDrill("guard", { harness: "no_such_harness" as never });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.report, null, "nothing was run, nothing is reported");
    assert.ok(unknown.output.includes("refused") && unknown.output.includes("unknown harness"), unknown.output);
    // the first registry harness that is NOT on this host's PATH
    const missing = HARNESSES.find((h) => !findHarnessBin(h.id)?.bin);
    assert.ok(missing, "on any sane host at least one of the 25 CLIs is absent");
    const r = await runDrill("guard", { harness: missing.id });
    assert.equal(r.ok, false);
    assert.equal(r.report, null, "a refused real-model run mints no report");
    assert.ok(r.output.includes("refused") && r.output.includes(missing.id) && r.output.includes("not installed on this host"), r.output);
    assert.ok(r.output.includes("never fakes a real-model run"), "the honesty rule is in the refusal: " + r.output);
  });

  it("the external-model validation CLI (16.7.0): registry inventory, honest absence, stable digest", () => {
    const stdout = execFileSync(process.execPath, ["tools/external-model-validation.mjs"], { cwd: ROOT, encoding: "utf8", timeout: 60_000 });
    const rep = JSON.parse(stdout);
    assert.equal(rep.suite, "vouch-harbor-external-model-validation");
    assert.equal(rep.harnessInventory.length, HARNESSES.length, "the inventory covers the product's OWN registry (single source of truth)");
    const anyFound = rep.harnessInventory.some((h: any) => h.found);
    assert.equal(rep.realModelAvailable, anyFound, "realModelAvailable is exactly 'some harness bin on PATH'");
    assert.match(rep.overallDigest, /^[0-9a-f]{64}$/);
    if (anyFound) {
      assert.equal(rep.refusedReason, null);
      assert.equal(rep.scenarios.length, DRILL_SCENARIOS.length, "with a real model, the full catalog runs");
      for (const s of rep.scenarios) {
        assert.equal(s.seat.kind, "real-cli", "the seat is labeled real, never deterministic-under-a-fake-label");
        assert.ok(s.seat.harness && s.seat.bin, "the harness + bin are named in the report");
      }
    } else {
      assert.equal(rep.scenarios.length, 0, "on a CLI-less host NOTHING is run — the report says so, it does not fake");
      assert.ok(rep.scope.toLowerCase().includes("never fakes"), "the honesty rule travels inside the artifact");
    }
  });

  it("through the SINGLE THROAT: run_drill pauses at the human gate, then vouches the result", async () => {
    const g = await runVouchToolCall("run_drill", { scenario: "guard" }, { origin: "probe" });
    assert.equal(g.pending, true, "a drill is a mission — it gates");
    assert.ok(g.approvalId && g.callId);
    resolveVouchApproval(g.approvalId, true);
    const t0 = Date.now();
    let track = vouchToolCallStatus(g.callId)!;
    while (!(track.state === "done" && track.result)) {
      if (Date.now() - t0 > 60000) throw new Error("drill did not settle");
      await sleep(100);
      track = vouchToolCallStatus(g.callId)!;
    }
    assert.equal(track.result!.ok, true, "the gated drill passed");
    assert.ok(track.result!.output.includes("PASSED"), track.result!.output);
    assert.ok(track.result!.receiptId, "the gated drill mints a receipt");
    const v = await verifyVouchReceipt(track.result!.receiptId!);
    assert.equal(v.ok, true);
    /* the drill's own report also landed in the store */
    assert.ok(drillReports().some((x) => x.scenarioId === "guard"), "the report is persisted");
  });

  it("the scenario catalog is complete and honest", () => {
    const ids = DRILL_SCENARIOS.map((s) => s.id);
    assert.deepEqual(ids, ["guard", "maths", "impossible"]);
    for (const sc of DRILL_SCENARIOS) {
      assert.ok(sc.objective.length > 10);
      assert.ok(sc.files["test.js"], "every scenario carries its OWN test file");
    }
  });
});

/* ── protocol: the drill over real stdio ─────────────────────────────────── */
describe("drill over the wire — run_drill through the MCP face", () => {
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
      }, 30000);
    });
  };
  const call = (name: string, args: Record<string, unknown>): Promise<string> =>
    request("tools/call", { name, arguments: args }).then((m: any) => m.result.content[0].text as string);

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
    await sleep(700);
  });
  after(() => {
    child.kill("SIGKILL");
  });

  it("run_drill over the wire: gated → approved → a REAL mission runs → PASSED → receipt verifies", async () => {
    await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "0" } });
    const list = await request("tools/list");
    const names = new Set(list.result.tools.map((t: { name: string }) => t.name));
    assert.ok(names.has("run_drill"), "run_drill is exposed over the wire (20 tools total)");
    assert.equal(list.result.tools.length, 20);

    const text = await call("run_drill", { scenario: "guard" });
    assert.ok(text.includes("Paused at the human gate"), "the wire drill gates — " + text);
    const approval = text.match(/approval (a[0-9a-z]+)/)! [1];
    const callId = text.match(/call_status "(c[0-9a-z]+)"/)! [1];

    await call("approve_action", { approvalId: approval, approve: true });
    let doneText = "";
    for (let i = 0; i < 120; i++) {
      doneText = await call("call_status", { callId });
      if (/done — ok=/.test(doneText)) break;
      await sleep(500);
    }
    assert.ok(doneText.includes("done — ok=true"), "the wire drill settled ok — " + doneText);
    assert.ok(doneText.includes("DRILL guard: PASSED"), doneText);
    assert.ok(doneText.includes("2/2 seats verified"), "the real verification count rides over the wire");
    const rec = doneText.match(/receipt: (r[0-9a-z]+)/);
    assert.ok(rec, "the wire drill mints a receipt");
    const v = await call("verify_receipt", { receiptId: rec![1] });
    assert.ok(v.startsWith("VALID"), "the wire drill receipt verifies");
    const ms = await call("mission_status", { missionId: doneText.match(/mission: (mission_[a-z0-9]+)/)![1] });
    assert.ok(ms.includes("completed"), "the wire drill is in the mission ledger: " + ms);
  });

  it("the external-model seam over the wire (16.7.0): a missing harness gates, then refuses in words — never a fake run", async () => {
    const missing = HARNESSES.find((h) => !findHarnessBin(h.id)?.bin);
    assert.ok(missing, "at least one of the 25 CLIs is absent on this host");
    const text = await call("run_drill", { scenario: "guard", harness: missing.id });
    assert.ok(text.includes("Paused at the human gate"), "the seam gates like every mission — " + text);
    const approval = text.match(/approval (a[0-9a-z]+)/)![1];
    const callId = text.match(/call_status "(c[0-9a-z]+)"/)![1];
    await call("approve_action", { approvalId: approval, approve: true });
    let doneText = "";
    for (let i = 0; i < 120; i++) {
      doneText = await call("call_status", { callId });
      if (/done — ok=/.test(doneText)) break;
      await sleep(250);
    }
    assert.ok(/done — ok=false/.test(doneText), "the approved run settles as a refusal, not a fake run: " + doneText);
    assert.ok(doneText.includes("refused") && doneText.includes(missing.id), doneText);
    assert.ok(doneText.includes("never fakes a real-model run"), doneText);
  });
});
