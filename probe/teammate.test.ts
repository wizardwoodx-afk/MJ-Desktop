/**
 * MJ 15.1.0 — the ROGUE probe (the Vouch Harbor face, pinned).
 *
 * The rules, made mechanical (same spirit as navAlign / receipts):
 *   1. The Teammate page imports ONLY the teammate engine module — no fragment
 *      stores, no direct missionLoop/receipts import: a page that does is a fork.
 *   2. The teammate module is the one place that reaches the receipt protocol,
 *      the Mission Loop engine and the web-evidence layer — through their APIs.
 *   3. Risky actions are approval-gated, and the gate is real: a run PAUSES
 *      until the human resolves it; a denial executes nothing.
 *   4. Every finished run mints a vh-proof-receipt/2 that verifies offline, and
 *      tampering is caught.
 *   5. The brain is labeled: the simulated brain is rule-based and says so —
 *      the TeammateBrain seam is where a real model plugs in.
 *   6. The Vouch Cycle 2.0 is pinned: dual-process routing (fast/slow),
 *      SIMULATE before risky acts (signed predictions, checked in VOUCH),
 *      test-gated LEARN (skills that cannot regress; failure memory),
 *      threads with dropped-thread continuity, learned preferences, and an
 *      inspectable Markdown-native memory export.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert";

declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

const pageSrc = read("src/pages/TeammatePage.tsx");
const moduleSrc = read("src/mission/teammate.ts");
const navSrc = read("src/app/nav.ts");

import {
  VH_VERSION,
} from "../src/version";
import {
  RISKY_TOOLS,
  TEAMMATE_TOOLS,
  addTeammateFact,
  exportTeammateMemoryMarkdown,
  newTeammateThread,
  proposeTeammateSkill,
  rateTeammateRun,
  removeTeammateFact,
  removeTeammatePreference,
  resolveTeammateApproval,
  safeCalculate,
  searchKnowledge,
  sendTeammateMessage,
  simulateTeammateAction,
  simulatedBrain,
  stopTeammate,
  teammateBrain,
  teammateReceiptJsonl,
  teammateSession,
  teammateWorkspaceFiles,
  verifyTeammateReceipt,
  type TeammateAction,
  type TeammateReceiptRef,
} from "../src/mission/teammate";

function lastReceipt(): TeammateReceiptRef {
  const s = teammateSession();
  return s.receipts[s.receipts.length - 1];
}
import {
  buildChainedReceipt,
  verifyProofReceipt,
  type ProofReceipt,
} from "../src/mission/receipts";

const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));

/** A standard teammate-shaped receipt for the protocol assertions. */
async function probeReceipt(): Promise<ProofReceipt> {
  return buildChainedReceipt({
    mission: "teammate: probe",
    teamId: "teammate",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    mjVersion: VH_VERSION,
    edition: "personal",
    events: [
      { kind: "teammate.session", seatId: "teammate-rogue", data: { brain: "simulated", persona: "witty", mode: "quick", input: "probe" } },
      { kind: "teammate.action", seatId: "teammate-rogue", data: { tool: "calculator", args: { expression: "1+1" }, ok: true, approved: true, ms: 1, outputDigest: "2" } },
      { kind: "teammate.verdict", seatId: "teammate-rogue", data: { status: "done", actions: 1, approved: 1, brain: "simulated" } },
    ],
  });
}

async function verifyDirect(rc: ProofReceipt): Promise<{ ok: boolean; events?: number; reason?: string }> {
  const r = await verifyProofReceipt(rc);
  return r.ok ? { ok: true, events: r.events } : { ok: false, reason: r.reason };
}

describe("teammate — the door and the engine rule", () => {
  it("the Teammate door is in the nav map with a purpose", () => {
    assert.ok(navSrc.includes('key: "teammate"'), "the door is in the nav map");
    const m = navSrc.match(/key: "teammate", label: "([^"]+)"/);
    assert.ok(m && m[1] === "Vouch", `public label is "Vouch" (got ${m?.[1]})`);
    const d = navSrc.match(/key: "teammate"[^}]*description: "([^"]+)"/);
    assert.ok(d && d[1].length >= 24, "the door carries a substantive purpose description");
  });

  it("the page imports ONLY the teammate module from mission/ (one engine, one API)", () => {
    const missionImports = [...new Set(pageSrc.match(/from "\.\.\/mission\/[a-zA-Z]+/g) ?? [])];
    assert.deepEqual(missionImports, ['from "../mission/teammate'], "no fragment store or engine-internal import in the page");
    assert.ok(pageSrc.includes("TeammatePage"), "the page exports TeammatePage");
  });

  it("the module reaches the receipt protocol and the Mission Loop engine (and nothing leaks to the page)", () => {
    assert.ok(moduleSrc.includes('from "./receipts"'), "the module mints receipts through receipts.ts");
    assert.ok(moduleSrc.includes("buildChainedReceipt"), "the module uses the generic chained-receipt builder");
    assert.ok(moduleSrc.includes('from "./missionLoop"'), "the module reaches the engine API");
    assert.ok(moduleSrc.includes("runMissionLoopCycle") && moduleSrc.includes("loadCrews") && moduleSrc.includes("loopHostDeps"), "dispatch drives the real engine");
    assert.ok(!/from "\.\.\/mission\/(missionLoop|receipts)"/.test(pageSrc), "the page never imports the engine or receipts directly");
  });

  it("risky actions are approval-gated by policy", () => {
    assert.ok(RISKY_TOOLS.has("workspace_write"), "workspace writes are gated");
    assert.ok(RISKY_TOOLS.has("dispatch_mission"), "mission dispatch is gated");
    assert.ok(!RISKY_TOOLS.has("calculator") && !RISKY_TOOLS.has("memory_save"), "harmless tools are not gated");
  });

  it("the brain is the labeled simulated brain behind the seam", () => {
    assert.equal(teammateBrain().id, "simulated");
    assert.ok(/offline|rule-based|simulated/i.test(teammateBrain().label), "the label is honest about what it is");
    assert.equal(simulatedBrain.id, "simulated");
  });
});

describe("teammate — the tools are real, not vibes", () => {
  it("the calculator is a real parser (no eval)", () => {
    assert.equal(safeCalculate("12 * 8 + 144 / 9"), 112, "96 + 16");
    assert.equal(safeCalculate("(1 + 2) ^ 3"), 27);
    assert.equal(safeCalculate("10 % 3"), 1);
    assert.equal(safeCalculate("-2 ^ 2"), -4);
    assert.equal(safeCalculate("2 ^ 3 ^ 2"), 512, "power is right-associative");
    assert.throws(() => safeCalculate("1 +"), /cannot parse|trailing/i);
    assert.throws(() => safeCalculate("2 / 0"), /finite/);
  });

  it("the math intent produces a real calculator action and uses its result", () => {
    const plan = simulatedBrain.decide("Calculate (12 * 8) + (144 / 9)", { mode: "quick", persona: "witty", facts: [] });
    const tool = plan.actions.find((a) => a.kind === "tool" && a.tool === "calculator") as { args: Record<string, unknown> } | undefined;
    assert.ok(tool, "the plan calls the calculator");
    const out = safeCalculate(String(tool.args.expression));
    const final = plan.final([{ action: { kind: "tool", tool: "calculator", args: tool.args } as TeammateAction, ok: true, output: String(out), ms: 1, approved: true }]);
    assert.ok(final.includes(String(out)), `the final carries the computed value ${out}`);
  });

  it("dispatch intent is approval-gated and hands the objective to the engine", () => {
    const plan = simulatedBrain.decide("Dispatch a mission: summarize the README", { mode: "deep", persona: "professional", facts: [] });
    const d = plan.actions.find((a) => a.kind === "dispatch");
    assert.ok(d, "the plan dispatches");
    assert.ok(d.kind === "dispatch" && d.objective.length > 5, "the objective survives extraction");
    assert.ok(plan.plan.length >= 3, "deep mode shows a plan");
  });

  it("the knowledge base is offline and labeled as such", () => {
    const hits = searchKnowledge("What is the EU AI Act enforcement date for agents?");
    assert.ok(hits.length > 0, "the EU AI Act query hits the local base");
    assert.ok(hits[0].title.includes("EU AI Act"), `top hit is the EU AI Act entry (got ${hits[0].title})`);
    assert.ok(/local knowledge base/i.test(JSON.stringify(hits)), "hits are labeled as the local knowledge base");
  });
});

describe("teammate — receipts: every job vouched", () => {
  it("a minted teammate receipt verifies offline (chain + seal, and signature honesty)", async () => {
    const rc = await probeReceipt();
    assert.equal(rc.header.mjVersion, VH_VERSION, "the receipt carries the current release");
    const v = await verifyDirect(rc);
    assert.equal(v.ok, true, v.ok ? "" : v.reason);
    if (rc.signature) {
      assert.equal(rc.signatureNote, undefined, "a signed receipt carries no excuse");
    } else {
      assert.ok(rc.signatureNote && rc.signatureNote.length > 10, "an unsigned receipt says why, in writing");
    }
  });

  it("a tampered event breaks verification (tamper-evidence is real)", async () => {
    const rc = await probeReceipt();
    const tampered = { ...rc, events: rc.events.map((e, i) => (i === 0 ? { ...e, data: { ...e.data, forged: true } } : e)) };
    const v = await verifyDirect(tampered);
    assert.equal(v.ok, false, "tampering must be caught");
  });
});

describe("teammate — the run loop (node-safe e2e)", () => {
  it("a greeting run completes and mints a receipt", async () => {
    const before = teammateSession().receipts.length;
    await sendTeammateMessage("Hello, ROGUE");
    const s = teammateSession();
    assert.ok(s.messages.length >= 2, "user + teammate messages exist");
    assert.ok(!s.messages.some((m) => m.streaming), "the run finished (nothing left streaming)");
    assert.equal(s.receipts.length, before + 1, "the run minted exactly one receipt");
    const last = s.receipts[s.receipts.length - 1];
    assert.ok(last.events >= 2, "the receipt carries the session + verdict events");
    const v = await verifyTeammateReceipt(last.id);
    assert.equal(v.ok, true, v.ok ? "" : v.reason);
    const jsonl = teammateReceiptJsonl(last.id);
    assert.ok(jsonl && jsonl.split("\n").length >= 3, "the receipt exports to JSONL");
  }, 20000);

  it("a workspace write PAUSES at the human gate and executes only on approval", async () => {
    const run = sendTeammateMessage("Write a file called probe-gate.txt: gate probe content");
    let approved = false;
    for (let i = 0; i < 200; i++) {
      const pending = teammateSession().approvals.find((a) => a.status === "pending");
      if (pending) {
        assert.equal(pending.action, "workspace_write", "the gate names the action");
        resolveTeammateApproval(pending.id, true);
        approved = true;
        break;
      }
      await sleep(30);
    }
    await run;
    assert.ok(approved, "the run paused for a human approval (the gate fired)");
    const files = teammateWorkspaceFiles();
    assert.ok(files.some((f) => f.name === "probe-gate.txt"), "approval → the file exists in the local workspace");
    const s = teammateSession();
    const v = await verifyTeammateReceipt(s.receipts[s.receipts.length - 1].id);
    assert.equal(v.ok, true, "the approved run's receipt verifies");
    const actionEvent = s.receipts[s.receipts.length - 1].receipt.events.find((e) => e.kind === "teammate.action");
    assert.ok(actionEvent && actionEvent.data.approved === true, "the receipt records the approval");
  }, 20000);

  it("a DENIED write executes nothing and is recorded as denied", async () => {
    const run = sendTeammateMessage("Write a file called probe-denied.txt: should not exist");
    for (let i = 0; i < 200; i++) {
      const pending = teammateSession().approvals.find((a) => a.status === "pending");
      if (pending) {
        resolveTeammateApproval(pending.id, false);
        break;
      }
      await sleep(30);
    }
    await run;
    assert.ok(!teammateWorkspaceFiles().some((f) => f.name === "probe-denied.txt"), "denial → nothing was written");
    const actionEvent = teammateSession().receipts[teammateSession().receipts.length - 1].receipt.events.find((e) => e.kind === "teammate.action");
    assert.ok(actionEvent && actionEvent.data.approved === false && actionEvent.data.ok === false, "the receipt records the denial honestly");
  }, 20000);

  it("memory is local, visible and deletable", async () => {
    addTeammateFact("probe fact");
    let s = teammateSession();
    assert.ok(s.facts.some((f) => f.text === "probe fact"), "the fact is stored");
    const id = s.facts.find((f) => f.text === "probe fact")!.id;
    removeTeammateFact(id);
    s = teammateSession();
    assert.ok(!s.facts.some((f) => f.id === id), "the fact is gone — memory is the user's to delete");
  });

  it("stopTeammate aborts an in-flight run cleanly", async () => {
    const run = sendTeammateMessage("Tell me about the agent funding landscape and the EU AI Act and Tauri and Chennai and MJ and receipts");
    await sleep(60);
    stopTeammate();
    await run;
    const s = teammateSession();
    assert.ok(!s.messages.some((m) => m.streaming), "nothing left streaming after stop");
  }, 20000);
});

/* ── Vouch Cycle 2.0 — dual-process routing ───────────────────────────────── */
describe("teammate — vouch cycle 2.0: dual-process routing", () => {
  it("a safe single-step run routes FAST", async () => {
    await sendTeammateMessage("What time is it right now?");
    const last = lastReceipt();
    const sess = last.receipt.events.find((e) => e.kind === "teammate.session");
    assert.equal(sess?.data.route, "fast", "greeting/time runs are fast");
  }, 20000);

  it("a risky run routes SLOW (simulation + gate on the slow path)", async () => {
    const run = sendTeammateMessage("Write a file called route-slow.txt: routed slow");
    for (let i = 0; i < 200; i++) {
      const pending = teammateSession().approvals.find((a) => a.status === "pending");
      if (pending) { resolveTeammateApproval(pending.id, true); break; }
      await sleep(30);
    }
    await run;
    const last = lastReceipt();
    const sess = last.receipt.events.find((e) => e.kind === "teammate.session");
    assert.equal(sess?.data.route, "slow", "a write action routes slow");
  }, 20000);
});

/* ── Vouch Cycle 2.0 — SIMULATE before act, VOUCH checks it ───────────────── */
describe("teammate — vouch cycle 2.0: simulate + vouch", () => {
  it("a new-file write is simulated with a high-confidence prediction and no warnings", () => {
    const sim = simulateTeammateAction({ kind: "tool", tool: "workspace_write", args: { name: "sim-new.txt", content: "hello" } });
    assert.equal(sim.tool, "workspace_write");
    assert.equal(sim.confidence, "high");
    assert.equal(sim.warnings.length, 0, "a brand-new file has no overwrite warning");
    assert.ok(/5 chars/.test(sim.prediction), "the prediction states the exact size");
  });

  it("overwriting an existing file is flagged in the simulation", async () => {
    await TEAMMATE_TOOLS.workspace_write.run({ name: "sim-over.txt", content: "first" });
    const sim = simulateTeammateAction({ kind: "tool", tool: "workspace_write", args: { name: "sim-over.txt", content: "second" } });
    assert.ok(sim.warnings.some((w) => /already exists|overwrit/i.test(w)), "the overwrite is surfaced before the gate");
    assert.equal(sim.confidence, "high");
  });

  it("a minted write receipt carries the simulation and a matched prediction", async () => {
    const run = sendTeammateMessage("Write a file called sim-vouch.txt: vouch probe");
    for (let i = 0; i < 200; i++) {
      const pending = teammateSession().approvals.find((a) => a.status === "pending");
      if (pending) { resolveTeammateApproval(pending.id, true); break; }
      await sleep(30);
    }
    await run;
    const last = lastReceipt();
    const simEv = last.receipt.events.find((e) => e.kind === "teammate.simulation");
    assert.ok(simEv, "a simulation event is minted before the action");
    assert.equal(simEv?.data.confidence, "high");
    const actEv = last.receipt.events.find((e) => e.kind === "teammate.action");
    assert.equal(actEv?.data.simulated, true, "the action records that it was simulated");
    assert.equal(actEv?.data.predictionMatched, true, "reality matched the signed prediction");
    const verdict = last.receipt.events.find((e) => e.kind === "teammate.verdict");
    assert.equal(verdict?.data.prediction, "matched", "the verdict sums the prediction check");
  }, 20000);

  it("a DENIED write records a diverged (unrealized) prediction", async () => {
    const run = sendTeammateMessage("Write a file called sim-denied.txt: should not exist");
    for (let i = 0; i < 200; i++) {
      const pending = teammateSession().approvals.find((a) => a.status === "pending");
      if (pending) { resolveTeammateApproval(pending.id, false); break; }
      await sleep(30);
    }
    await run;
    assert.ok(!teammateWorkspaceFiles().some((f) => f.name === "sim-denied.txt"), "denial → nothing written");
    const last = lastReceipt();
    const actEv = last.receipt.events.find((e) => e.kind === "teammate.action");
    assert.equal(actEv?.data.predictionMatched, false, "a denied action did not realize its prediction");
    const verdict = last.receipt.events.find((e) => e.kind === "teammate.verdict");
    assert.equal(verdict?.data.prediction, "diverged", "the verdict records the divergence honestly");
  }, 20000);
});

/* ── Vouch Cycle 2.0 — LEARN: test-gated skills + failure memory ──────────── */
describe("teammate — vouch cycle 2.0: learn (test-gated)", () => {
  it("a successful run distills a test-gated skill with provenance", async () => {
    const before = teammateSession().skills.length;
    await sendTeammateMessage("Calculate (7 * 6) + (42 / 6)");
    const s = teammateSession();
    assert.ok(s.skills.length >= before + 1, "the run learned a skill");
    const calc = s.skills.find((k) => k.tool === "calculator");
    assert.ok(calc, "a calculator skill was distilled");
    assert.ok(calc!.bornReceiptId.length > 0, "the skill carries receipt provenance");
    assert.equal(calc!.runs, 1, "first successful run counts as run 1");
    assert.equal(calc!.wins, 1);
    const last = lastReceipt();
    assert.ok(last.skillId, "the receipt links the skill it produced");
  }, 20000);

  it("a skill with an unknown tool is REJECTED and lands in failure memory", () => {
    const beforeF = teammateSession().failures.length;
    const res = proposeTeammateSkill({ name: "phantom", when: "never", steps: ["ghost"], tool: "not_a_real_tool", bornReceiptId: "r0" });
    assert.equal(res.ok, false, "the test gate rejects unknown tools");
    assert.ok(/unknown tool/i.test(res.reason ?? ""), "the reason is specific");
    const s = teammateSession();
    assert.ok(s.skills.every((k) => k.name !== "phantom"), "no phantom skill was written");
    assert.equal(s.failures.length, beforeF + 1, "the rejection is recorded in failure memory");
  });

  it("a skill whose replay fails is REJECTED (self-learning cannot regress)", () => {
    const beforeF = teammateSession().failures.length;
    const res = proposeTeammateSkill({ name: "calculation", when: "math", steps: ["parse"], tool: "calculator", sampleArgs: { expression: "1 +" }, bornReceiptId: "r0" });
    assert.equal(res.ok, false, "a failing replay is rejected");
    assert.ok(/replay/i.test(res.reason ?? ""), "the reason names the failed replay");
    assert.equal(teammateSession().failures.length, beforeF + 1, "recorded in failure memory");
  });

  it("feedback binds to the receipt and flags a bad skill for review", async () => {
    await sendTeammateMessage("Calculate 3 + 4");
    const last = lastReceipt();
    assert.ok(last.skillId, "a skill is linked");
    rateTeammateRun(last.id, 1, "unsafe: it touched a file it shouldn't");
    const s = teammateSession();
    const ref = s.receipts.find((r) => r.id === last.id);
    assert.equal(ref?.feedback.length, 1, "the feedback is bound to the receipt");
    assert.equal(ref?.feedback[0].mode, "unsafe", "the failure mode is classified");
    const sk = s.skills.find((k) => k.id === last.skillId);
    assert.ok(sk, "the skill exists");
    assert.equal(sk!.flagged, true, "an unsafe report flags the skill for human review");
    assert.equal(sk!.avgScore, 1);
  }, 20000);
});

/* ── Vouch Cycle 2.0 — threads + dropped-thread continuity ────────────────── */
describe("teammate — vouch cycle 2.0: threads", () => {
  it("new threads drop the previous open one; “continue” resumes a dropped thread", async () => {
    newTeammateThread("probe-alpha");
    const mainDropped = teammateSession().threads.find((t) => t.title === "Main thread")?.status;
    assert.equal(mainDropped, "dropped", "opening a new thread drops the previous open thread");
    await sendTeammateMessage("Remember: the alpha plan is a harbor");
    const alpha = teammateSession().threads.find((t) => t.title === "probe-alpha");
    assert.ok(alpha && alpha.messages.length >= 2, "the exchange landed in the new thread");

    newTeammateThread("probe-beta");
    assert.equal(teammateSession().threads.find((t) => t.title === "probe-alpha")?.status, "dropped", "alpha is now dropped");

    await sendTeammateMessage("continue probe-alpha");
    const s = teammateSession();
    const resumed = s.threads.find((t) => t.title === "probe-alpha");
    assert.equal(resumed?.status, "open", "“continue” reopens the dropped thread");
    assert.equal(s.activeThreadId, resumed?.id, "the active thread is the resumed one");
    const lastMsg = resumed?.messages[resumed.messages.length - 1];
    assert.ok(lastMsg && lastMsg.role === "teammate" && /picked up/i.test(lastMsg.text), "ROGUE reports it picked the thread back up");
  }, 20000);

  it("a resume with no matching thread is answered honestly", async () => {
    await sendTeammateMessage("continue a thread that was never started");
    const last = lastReceipt();
    const finalMsg = teammateSession().threads.find((t) => t.id === teammateSession().activeThreadId)?.messages;
    const text = finalMsg && finalMsg.length > 0 ? finalMsg[finalMsg.length - 1].text : "";
    assert.ok(/don'?t have a thread/i.test(text), "it admits no such thread instead of inventing one");
    assert.ok(last.receipt.events.length >= 2, "the honest answer is still vouched");
  }, 20000);
});

/* ── Vouch Cycle 2.0 — preferences + inspectable memory ───────────────────── */
describe("teammate — vouch cycle 2.0: preferences + memory export", () => {
  it("a stated preference is learned and stored", async () => {
    const before = teammateSession().preferences.length;
    await sendTeammateMessage("From now on: always mention the receipt at the end");
    const s = teammateSession();
    assert.equal(s.preferences.length, before + 1, "the preference was learned");
    assert.ok(/always mention the receipt/i.test(s.preferences[s.preferences.length - 1].text), "the text is extracted cleanly");
    removeTeammatePreference(s.preferences[s.preferences.length - 1].id);
    assert.equal(teammateSession().preferences.length, before, "preferences are the user's to delete");
  }, 20000);

  it("the memory export is local, Markdown-native, and complete", () => {
    const md = exportTeammateMemoryMarkdown();
    assert.ok(md.startsWith("# ROGUE — memory export"), "it is a proper markdown document");
    for (const section of ["## Facts", "## Preferences", "## Skills", "## Failure memory", "## Workspace", "## Threads"]) {
      assert.ok(md.includes(section), `section present: ${section}`);
    }
    assert.ok(/test-gated/i.test(md), "the export says skills are test-gated");
  });
});
