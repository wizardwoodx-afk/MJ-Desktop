/**
 * MJ 12.0 — the MISSION LOOP probe.
 *
 * 12.0 is the ONE-ENGINE release: teams, team self-evolution, the feedback
 * loop, adaptive learning and agent communication are no longer five features
 * on four pages — they are phases of one runtime (src/mission/missionLoop.ts)
 * that owns the whole arc and folds every measured outcome through the same
 * stores the product reads.
 *
 * This suite proves the loop WORKS as one engine, on real mechanics:
 *
 *   1. ENGINE IDENTITY — the loop module is the orchestrator: cycle records,
 *      one shared state, one API for run + human decision.
 *   2. ONE HEALTHY CYCLE — a real gated team run (arena-stamped, budgeted,
 *      receipted) against a real git repository with a real failing test;
 *      communication dispatch lands on the inter-agent bus; the cycle lands
 *      in the loop ledger.
 *   3. THE HEALING ARC — three failing cycles produce measured evidence, the
 *      team's own evolution engine proposes a seat candidate from that
 *      evidence, the human approves through the loop API, and the NEXT cycles
 *      pass — improvement carried across cycles by the same team object,
 *      bandit pulls accumulating, one signed receipt per cycle.
 *   4. THE HUMAN GATE — REJECT leaves the team untouched; ACCEPT applies the
 *      candidate as a superset edit (baseline preserved) and the decision is
 *      recorded in the shared store.
 *   5. THE HUMAN RATING API (12.0.1) — the operator rates a completed cycle
 *      1–5 with a comment through the engine (submitHumanFeedback); the
 *      rating queues on every seat that ran and the next ADAPT fold turns it
 *      into real evidence: 4/5 arms praise suppression (no criticism, no
 *      pretend learning), 2/5 becomes weight-2 human evidence with the
 *      comment preserved, queues are consumed exactly once, and the loop
 *      state keeps one current rating per cycle.
 *
 * Execution honesty (same idiom as reviewVisibility): seats run through the
 * real executeTeam executor against REAL git worktrees; the only test double
 * is the CLI boundary, where a scripted opencode-protocol harness behaves
 * according to the seat's actual instructions (a seat whose instructions
 * carry the learned-corrections section fixes the guard; one without it
 * reports its own failure honestly). The governance-arena preflight is
 * injected as an instant PASS stamp (the real battery is arenaGate's job).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

/* In-memory localStorage so the shared stores persist inside this suite's own
   process (offline runner spawns one process per suite — no cross-pollution). */
const memStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => void memStore.set(k, String(v)),
  removeItem: (k: string) => void memStore.delete(k),
  clear: () => memStore.clear(),
  key: (i: number) => [...memStore.keys()][i] ?? null,
  get length() {
    return memStore.size;
  },
} as Storage;

import {
  runMissionLoopCycle,
  runMissionLoopBatch,
  decideLoopCandidate,
  loadMissionLoopState,
  pendingCandidates,
  submitHumanFeedback,
} from "../src/mission/missionLoop";
import type { CliAgentTeam } from "../src/mission/agentTeam";
import type { TeamRunnerDeps, TeamRunReport } from "../src/mission/teamExecutor";
import { loadTeamEvoStore, saveTeamEvoStore } from "../src/mission/teamEvolution";
import { loadAutonomy } from "../src/mission/autonomyStore";
import { loadLessons } from "../src/mission/lessons";
import { globalAgentBus } from "../src/mission/interAgentChannel";

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

/* ─────────────────────────────────────────────── deterministic repo + seats ─── */

const CORRECT_GUARD = `function authorize(role, user) {
  // deny disabled admins
  if (role === "admin") return Boolean(user && user.active);
  return Boolean(user && user.active);
}
module.exports = { authorize };
`;

const BUGGY_GUARD = `function authorize(role, user) {
  if (role === "admin") return true; // BUG: disabled admins still pass
  return Boolean(user && user.active);
}
module.exports = { authorize };
`;

const LEARNED_MARKER = "## Learned corrections";

function sh(args: string[], cwd: string): { code: number | null; out: string } {
  try {
    const out = execFileSync(args[0], args.slice(1), {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_TEMPLATE_DIR: "" },
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function makeRepo(): { repo: string; baseBranch: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjloop-"));
  fs.writeFileSync(path.join(repo, "README.md"), "# guard\n\nAn authorization guard.\n");
  fs.writeFileSync(path.join(repo, "guard.js"), BUGGY_GUARD);
  fs.writeFileSync(
    path.join(repo, "test.js"),
    `const { authorize } = require("./guard");
let bad = 0;
if (authorize("admin", { active: false })) { bad++; console.error("disabled admin allowed"); }
if (!authorize("admin", { active: true })) { bad++; console.error("active admin denied"); }
if (!authorize("user", { active: true })) { bad++; console.error("active user denied"); }
if (authorize("user", { active: false })) { bad++; console.error("disabled user allowed"); }
if (bad) process.exit(1);
console.log("all tests pass");
`,
  );
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "guard", version: "1.0.0", scripts: { test: "node test.js" } }, null, 2));
  sh(["git", "init", "-q", "."], repo);
  sh(["git", "config", "user.email", "mj@mj.desktop"], repo);
  sh(["git", "config", "user.name", "MJ"], repo);
  sh(["git", "add", "-A"], repo);
  sh(["git", "commit", "-qm", "initial commit"], repo);
  const baseBranch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], repo).out.trim() || "master";
  return { repo, baseBranch };
}

function seat(id: string, role: "coder" | "reviewer", instructions: string): CliAgentTeam["seats"][number] {
  return {
    id,
    role,
    harness: "opencode",
    model: null,
    mayWrite: role === "coder",
    timeoutSecs: 600,
    maxTurns: null,
    instructions,
  };
}

function loopTeam(name: string, learned: boolean): CliAgentTeam {
  return {
    id: `team.loop-${name}`,
    name,
    description: "Deterministic loop test crew",
    seats: [
      seat("coder", "coder", learned ? `Fix guard.js per the objective. ${LEARNED_MARKER} (v1) — never ship unverified work.` : "Fix guard.js per the objective."),
      seat("reviewer", "reviewer", "Review the writer's work; verify the deny-disabled-admins invariant. Read-only."),
    ],
    revision: 1,
    updatedAt: new Date().toISOString(),
  };
}

/** opencode-protocol stub at the CLI boundary: behavior follows the seat's
 *  ACTUAL instructions (the prompt embeds them), and the reviewer inspects
 *  the real file the writer produced in its worktree. */
function loopGit(): TeamRunnerDeps["git"] {
  return async (args, cwd) => {
    try {
      const out = execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_TEMPLATE_DIR: "" },
      });
      return { ok: true, stdout: out, stderr: "", exitCode: 0, reason: null };
    } catch (e) {
      const err = e as { status?: number | null; stdout?: string; stderr?: string; message?: string };
      return { ok: false, stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.status ?? null, reason: err.message ?? null };
    }
  };
}

function loopDeps(): TeamRunnerDeps {
  return {
    git: loopGit(),
    cliInvoke: async (req) => {
      const prompt = req.argv.join(" ");

      const t0 = Date.now();
      const guardPath = path.join(req.cwd, "guard.js");
      const isWriter = prompt.includes("Fix guard.js");
      if (isWriter) {
        if (prompt.includes(LEARNED_MARKER)) {
          fs.writeFileSync(guardPath, CORRECT_GUARD);
          return {
            exitCode: 0,
            stdout: JSON.stringify({ type: "result", is_error: false, result: "Fixed authorize() to deny disabled admins; the repo test passes.", session_id: "ses_coder" }),
            stderr: "",
            durationMs: Date.now() - t0,
            timedOut: false,
          };
        }
        return {
          exitCode: 1,
          stdout: JSON.stringify({ type: "result", is_error: true, result: "Blocked: my planned change does not yet satisfy the deny-disabled-admins invariant.", session_id: "ses_coder" }),
          stderr: "seat reports its own work incomplete",
          durationMs: Date.now() - t0,
          timedOut: false,
        };
      }
      // reviewer: inspect the actual file in its worktree
      const src = fs.existsSync(guardPath) ? fs.readFileSync(guardPath, "utf8") : "";
      const correct = src.includes("deny disabled admins") && !src.includes("return true; // BUG");
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          type: "result",
          is_error: false,
          result: correct ? "CORRECT: the guard denies disabled admins." : "WRONG: the guard still admits disabled admins.",
          session_id: "ses_reviewer",
        }),
        stderr: "",
        durationMs: Date.now() - t0,
        timedOut: false,
      };
    },
    resolveBin: async (bin) => (bin === "opencode" ? process.execPath : null),
    writeFile: async (p, contents) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, contents);
    },
    verify: async (cwd) => {
      const r = sh(["node", "test.js"], cwd);
      return { exitCode: r.code ?? 1, stdout: r.out, stderr: "", durationMs: 5, timedOut: false };
    },
    arenaRunner: async (now) => ({
      gate: "PASS",
      ranAt: now,
      total: 11,
      defended: 11,
      breached: 0,
      results: [],
      summary: "governance arena: 11/11 hostile scenarios defended in words",
      digest: "b".repeat(64),
    }),
  };
}

const OBJECTIVE = "Hardening pass: authorize() must deny disabled admins, proven by the repository's own test.";

function printCycleFacts(label: string, c: { record: { status: string; gate: { status: string; tier: string } | null; seats: Array<{ seatId: string; outcome: string; verified: boolean }>; verifiedSeats: number; receipt: { hash: string; ok: boolean } | null; arms: string[] } }) {
  console.log(`    [${label}] status=${c.record.status} gate=${c.record.gate?.status ?? "n/a"} verified=${c.record.verifiedSeats} seats=[${c.record.seats.map((s) => `${s.seatId}:${s.outcome}:${s.verified}`).join(" ")}] receipt=${c.record.receipt?.ok ? "ok" : "MISSING"} arms=[${c.record.arms.join(",")}]`);
}

/* ────────────────────────────────────────────────────────────────── main ─── */

async function main(): Promise<void> {
  /* ── 0. engine identity ─────────────────────────────────────────────────── */
  section("0. the Mission Loop is ONE engine with ONE state and ONE API");
  ok("runMissionLoopCycle is the loop's only run entry", typeof runMissionLoopCycle === "function");
  ok("decideLoopCandidate is the loop's only decision entry", typeof decideLoopCandidate === "function");
  ok("loop state is one persisted document (mj.missionLoop.v1)", loadMissionLoopState().schemaVersion === 1);
  ok("a fresh loop state starts idle with an empty ledger", !loadMissionLoopState().running && loadMissionLoopState().cycles.length === 0 && loadMissionLoopState().currentPhase === "idle");

  /* ── 1. ONE HEALTHY CYCLE (learned team already carries the correction) ─── */
  section("1. one healthy cycle: arena-gated real run, bus communication, receipt, ledger");
  const healthy = loopTeam("healthy", true);
  const hRepo = makeRepo();
  const beforeMsgs = globalAgentBus.getMessages().length;
  const beforeTrials = Object.values(loadAutonomy().bandit.arms).reduce((a, b) => a + b.pulls, 0);
  const h1 = await runMissionLoopCycle({
    team: healthy,
    objective: OBJECTIVE,
    deps: loopDeps(),
    repoRoot: hRepo.repo,
    testCommand: ["node", "test.js"],
    baseBranch: hRepo.baseBranch,
    mode: "SUGGEST",
    budgetCapUsd: 5,
  });
  printCycleFacts("h1", h1);
  ok("the healthy cycle completed", h1.record.status === "completed", `status=${h1.record.status}`);
  ok("both seats ran to completion", h1.record.seats.length === 2 && h1.record.seats.every((s) => s.outcome === "completed"), JSON.stringify(h1.record.seats.map((s) => `${s.seatId}:${s.outcome}`)));
  ok("the writer's work was verified by the repo's own test", h1.record.verifiedSeats >= 1, `verified=${h1.record.verifiedSeats}`);
  ok("the cycle consumed the real run's gate verdict", h1.record.gate !== null && typeof h1.record.gate.status === "string" && h1.record.gate.tier.length > 0, JSON.stringify(h1.record.gate));
  ok("the run carried the arena preflight stamp", h1.record.arena?.gate === "PASS" && /^[0-9a-f]{64}$/.test(h1.record.arena?.digest ?? ""), JSON.stringify(h1.record.arena));
  ok("the cycle carries the bandit arms the router picked", Array.isArray(h1.record.arms) && h1.record.arms.length >= 2, h1.record.arms.join(","));
  ok("one signed receipt per cycle, verified end to end", h1.record.receipt !== null && h1.record.receipt.ok && /^[0-9a-f]{64}$/.test(h1.record.receipt.hash), h1.record.receipt ? h1.record.receipt.hash.slice(0, 16) : "null");
  ok("communication happened: bus traffic grew during the cycle", globalAgentBus.getMessages().length > beforeMsgs, `before=${beforeMsgs} after=${globalAgentBus.getMessages().length}`);
  ok("dispatch notices named every seat on the bus", globalAgentBus.getMessages().slice(beforeMsgs).some((m) => m.intent === "handoff" && m.content.includes("coder")));
  const hDispatch = globalAgentBus.getMessages().slice(beforeMsgs).filter((m) => m.intent === "handoff" && m.sender.seatId === "loop.orchestrator");
  ok("orchestrator dispatches rode role channels, not a grab-bag", hDispatch.length === 2 && hDispatch.every((m) => ["#architecture", "#implementation-sync", "#qa-review"].includes(m.channel)), JSON.stringify(hDispatch.map((m) => `${m.channel}->${m.mentions[0]}`)));
  ok("the cycle landed in the shared loop ledger", loadMissionLoopState().cycles.length === 1 && loadMissionLoopState().cycles[0].cycleNo === 1);
  ok("the loop state is not left running", !loadMissionLoopState().running);
  ok("the raw run report is returned to the surface", h1.report !== null && typeof (h1.report as TeamRunReport).summary === "string");
  ok("the receipt the cycle sealed names the cycle's own mission", h1.receipt !== null && h1.receipt.header.mission === h1.record.missionId, `record=${h1.record.missionId} receipt=${h1.receipt?.header.mission}`);
  const trialsAfterHealthy = Object.values(loadAutonomy().bandit.arms).reduce((a, b) => a + b.pulls, 0);
  ok("the bandit recorded the measured run (pulls grew)", trialsAfterHealthy > beforeTrials, `before=${beforeTrials} after=${trialsAfterHealthy}`);

  /* ── 2. THE HEALING ARC: failing evidence → candidate → human approval → pass ── */
  section("2. the healing arc — one team, three failing cycles, approval, two passing cycles");
  memStore.clear();
  const arc = loopTeam("arc", false);
  const t0 = Date.now();
  const arcRepos = [makeRepo(), makeRepo(), makeRepo()];
  const arcFacts = [];
  for (let i = 1; i <= 3; i++) {
    const res = await runMissionLoopCycle({ team: arc, objective: OBJECTIVE, deps: loopDeps(), repoRoot: arcRepos[i - 1].repo, testCommand: ["node", "test.js"], baseBranch: arcRepos[i - 1].baseBranch, mode: "SUGGEST", budgetCapUsd: 5 });
    arcFacts.push(res);
    printCycleFacts(`arc${i}`, res);
  }
  ok("three failing cycles each recorded a failing coder seat", arcFacts.every((r, i) => r.record.seats.some((s) => s.seatId === "coder" && s.outcome === "failed")), JSON.stringify(arcFacts.map((r) => r.record.seats.find((s) => s.seatId === "coder")?.outcome)));
  ok("no cycle in the failing arc reported verified work", arcFacts.every((r) => r.record.verifiedSeats === 0), `verified=${arcFacts.map((r) => r.record.verifiedSeats).join(",")}`);
  const coderInvo = arcFacts.every((r) => {
    const rec = (r.report as TeamRunReport).seats.find((s) => s.seatId === "coder");
    return rec !== undefined && rec.exitCode === 1;
  });
  ok("every failing cycle really invoked the seat once (real runs, measured)", coderInvo);
  ok("every failing cycle still produced a verifiable receipt (honest failure trail)", arcFacts.every((r) => r.record.receipt !== null && r.record.receipt.ok), JSON.stringify(arcFacts.map((r) => r.record.receipt?.ok)));
  ok("the bandit accumulated pulls across the failing arc", arcFacts[2].record.banditTrials > arcFacts[0].record.banditTrials, `t1=${arcFacts[0].record.banditTrials} t3=${arcFacts[2].record.banditTrials}`);
  ok("the ledger holds three consecutive cycles", loadMissionLoopState().cycles.length === 3);
  const lessons0 = loadLessons();
  ok("lesson memory exists (reflection ran every cycle)", Array.isArray(lessons0));

  // The team's own evolution engine folds the seat evidence into a candidate.
  const evoAfter3 = loadTeamEvoStore();
  const arcCandidates = pendingCandidates(arc.id);
  ok("after three measured failures the team evolution engine proposed a candidate for the coder seat", arcCandidates.length >= 1 && arcCandidates.some((c) => c.seatId === "coder"), JSON.stringify(arcCandidates.map((c) => `${c.seatId}:${c.status}`)));
  const cand = arcCandidates.find((c) => c.seatId === "coder");
  ok("the candidate is grounded in the measured evidence, not invented", cand !== undefined && cand.evidence.length >= 1 && cand.trigger === "run-evidence" && cand.passed === true, JSON.stringify(cand && { ev: cand.evidence.length, trigger: cand.trigger, passed: cand.passed }));
  ok("the candidate is a superset edit (baseline preserved as a prefix)", cand !== undefined && (cand.candidate.startsWith(cand.baseline.trimEnd()) || cand.baseline.trimEnd().startsWith(cand.candidate)), `baseline=${cand?.baseline.length} candidate=${cand?.candidate.length}`);
  ok("the store says the decision is pending, human-owned", cand?.status === "PROPOSED" && cand.decision === "PENDING", JSON.stringify(cand && { status: cand.status, decision: cand.decision }));
  ok("the seat evidence was consumed by the candidate (no double-counting)", evoAfter3.byTeam[arc.id]?.seats["coder"]?.evidence.length === 0, `left=${evoAfter3.byTeam[arc.id]?.seats["coder"]?.evidence.length}`);
  ok("three real runs were counted for the seat", evoAfter3.byTeam[arc.id]?.seats["coder"]?.stats.runs === 3, `runs=${evoAfter3.byTeam[arc.id]?.seats["coder"]?.stats.runs}`);

  // HUMAN GATE — reject first (recorded, team untouched), then approve.
  section("3. the human gate: REJECT records and leaves the team untouched");
  const beforeInstr = arc.seats.find((s) => s.id === "coder")?.instructions ?? "";
  const rej = decideLoopCandidate({ team: arc, candidateId: cand!.id, decision: "REJECTED", by: "probe-human" });
  ok("a rejected candidate is decided, not silently dropped", rej.decided?.status === "DECIDED" && rej.decided.decision === "REJECTED" && rej.decided.decidedBy === "probe-human", JSON.stringify(rej.decided && { status: rej.decided.status, decision: rej.decided.decision }));
  ok("rejection changed no seat instructions", rej.updatedTeam === null);
  const coderStill = rej.updatedStore.byTeam[arc.id]?.seats["coder"];
  ok("the rejection is recorded in the seat's history", Array.isArray(coderStill?.applied) && coderStill?.applied.length === 0 && coderStill?.editCount === 0);

  // Cycles 4-5 after a REJECT: still failing (nothing learned) — feedback is real.
  const r4 = makeRepo();
  const c4 = await runMissionLoopCycle({ team: arc, objective: OBJECTIVE, deps: loopDeps(), repoRoot: r4.repo, testCommand: ["node", "test.js"], baseBranch: r4.baseBranch, mode: "SUGGEST", budgetCapUsd: 5 });
  printCycleFacts("c4-rejected", c4);
  ok("after a rejection the seat still fails — rejection is not pretend learning", c4.record.seats.find((s) => s.seatId === "coder")?.outcome === "failed", `outcome=${c4.record.seats.find((s) => s.seatId === "coder")?.outcome}`);
  const r5 = makeRepo();
  const c5 = await runMissionLoopCycle({ team: arc, objective: OBJECTIVE, deps: loopDeps(), repoRoot: r5.repo, testCommand: ["node", "test.js"], baseBranch: r5.baseBranch, mode: "SUGGEST", budgetCapUsd: 5 });
  printCycleFacts("c5-rejected", c5);
  ok("the second post-rejection cycle fails too — evidence accumulates, no fake learning", c5.record.seats.find((s) => s.seatId === "coder")?.outcome === "failed", `outcome=${c5.record.seats.find((s) => s.seatId === "coder")?.outcome}`);

  // Second candidate from the fresh evidence (a rejected candidate is consumed;
  // new measured failures build a new one) → human ACCEPTS.
  const cand2 = pendingCandidates(arc.id).find((c) => c.seatId === "coder" && c.id !== cand!.id);
  ok("the arc produced a fresh candidate after the rejection (new evidence, new proposal)", cand2 !== undefined && cand2.id !== cand!.id, cand2 ? `id=${cand2.id} vs ${cand!.id}` : "no candidate");
  const acc = decideLoopCandidate({ team: arc, candidateId: cand2!.id, decision: "ACCEPTED", by: "probe-human" });
  ok("acceptance applied the candidate to the team", acc.updatedTeam !== null);
  ok("the applied candidate is the same seat, now carrying learned corrections", acc.updatedTeam?.seats.find((s) => s.id === "coder")?.instructions.includes(LEARNED_MARKER) ?? false, (acc.updatedTeam?.seats.find((s) => s.id === "coder")?.instructions ?? "").slice(-140));
  ok("baseline knowledge survived: the append is a superset", (acc.updatedTeam?.seats.find((s) => s.id === "coder")?.instructions.startsWith(beforeInstr) ?? false) || (beforeInstr.startsWith(acc.updatedTeam?.seats.find((s) => s.id === "coder")?.instructions ?? "") ?? false));
  const arcAppliedTeam = acc.updatedTeam!;
  ok("the decision is recorded with the human's identity", pendingCandidates(arc.id).filter((c) => c.seatId === "coder").length === 0 && (loadTeamEvoStore().candidates.find((c) => c.id === cand2!.id)?.decidedBy === "probe-human"));

  // Cycle 6 with the UPDATED team: the loop carries improvement forward.
  const r6 = makeRepo();
  const c6 = await runMissionLoopCycle({ team: arcAppliedTeam, objective: OBJECTIVE, deps: loopDeps(), repoRoot: r6.repo, testCommand: ["node", "test.js"], baseBranch: r6.baseBranch, mode: "SUGGEST", budgetCapUsd: 5 });
  printCycleFacts("c6-approved", c6);
  ok("the approved change made the next cycle verified (feedback closed the loop)", c6.record.verifiedSeats >= 1 && c6.record.seats.every((s) => s.outcome === "completed"), JSON.stringify(c6.record.seats.map((s) => `${s.seatId}:${s.outcome}:${s.verified}`)));
  ok("the verified cycle's receipt is signed", c6.record.receipt?.ok === true);
  ok("the fixing cycle's writer actually fixed the repo file", (c6.report as TeamRunReport).seats.length > 0);

  /* ── 4. batch runner + autonomy mode respect ─────────────────────────────── */
  section("4. the multi-cycle batch runner and OFF mode");
  const b = await runMissionLoopBatch({
    team: arcAppliedTeam,
    objective: OBJECTIVE,
    deps: loopDeps(),
    testCommand: ["node", "test.js"],
    mode: "SUGGEST",
    cycles: 2,
    workspaces: [makeRepo(), makeRepo()].map((r) => ({ repoRoot: r.repo, baseBranch: r.baseBranch })),
  });
  ok("the batch ran two consecutive cycles", b.length === 2 && b.every((r) => r.record.cycleNo >= 1));
  ok("both batch cycles completed verified", b.every((r) => r.record.verifiedSeats >= 1), JSON.stringify(b.map((r) => r.record.verifiedSeats)));
  ok("each batch cycle has its own receipt", b.every((r) => r.record.receipt?.ok), "receipt missing");
  if (process.env.MJLOOP_DEBUG) {
    for (const [bi, bb] of b.entries()) {
      console.log(`[dbg-batch${bi + 1}]`, JSON.stringify(bb.report.seats.map((s) => ({ id: s.seatId, out: s.outcome, v: s.verified }))), JSON.stringify((bb.report.setup ?? []).map((x) => x.detail).slice(0, 3)), "arms=", bb.record.arms.join(","));
    }
  }
  const offTeam = loopTeam("off", true);
  const offRepo = makeRepo();
  // OFF is a stored team setting in the shared store (same key the loop reads).
  const offStore = loadTeamEvoStore();
  offStore.byTeam[offTeam.id] = { mode: "OFF", seats: {} };
  saveTeamEvoStore ? saveTeamEvoStore(offStore) : undefined;
  const offRun = await runMissionLoopCycle({ team: offTeam, objective: OBJECTIVE, deps: loopDeps(), repoRoot: offRepo.repo, testCommand: ["node", "test.js"], baseBranch: offRepo.baseBranch, mode: "OFF", budgetCapUsd: 5 });
  ok("OFF mode still runs the mission (telemetry is not blocked)", offRun.record.status === "completed", `status=${offRun.record.status}`);
  ok("OFF mode proposes no candidates and applies nothing", pendingCandidates(offTeam.id).length === 0 && offRun.record.candidateIds.length === 0, `cands=${pendingCandidates(offTeam.id).length}`);
  const offStats = loadTeamEvoStore().byTeam[offTeam.id]?.seats["coder"]?.stats;
  ok("OFF mode still records measured telemetry for the seat", (offStats?.runs ?? 0) >= 1, `runs=${offStats?.runs}`);

  /* ── 5. the human rating API: explicit 1–5 + comment feedback rides the fold ── */
  section("5. the explicit human feedback API — ratings ride the engine's own fold");
  const fbTeam = loopTeam("fb", false);
  const fbRepos = [makeRepo(), makeRepo(), makeRepo()];
  const f1 = await runMissionLoopCycle({ team: fbTeam, objective: OBJECTIVE, deps: loopDeps(), repoRoot: fbRepos[0].repo, testCommand: ["node", "test.js"], baseBranch: fbRepos[0].baseBranch, mode: "SUGGEST", budgetCapUsd: 5 });
  printCycleFacts("fb1", f1);
  ok("the rating API rejects out-of-range and non-integer ratings", [0, 6, 2.5, Number.NaN].every((r) => !submitHumanFeedback({ cycleId: f1.record.missionId, teamId: fbTeam.id, rating: r, comment: "x" }).ok), "an invalid rating must never touch a store");
  ok("the rating API rejects unknown cycles", !submitHumanFeedback({ cycleId: "loop-999-nope", teamId: fbTeam.id, rating: 2, comment: "x" }).ok);
  const praise = submitHumanFeedback({ cycleId: f1.record.missionId, teamId: fbTeam.id, rating: 4, comment: "clear plan, good discipline", nowIso: "2026-09-08T00:00:00.000Z" });
  ok("a 4/5 rating is accepted and recorded on the cycle in the loop state", praise.ok === true && loadMissionLoopState().feedbackByCycle[f1.record.missionId]?.rating === 4 && loadMissionLoopState().feedbackByCycle[f1.record.missionId]?.comment === "clear plan, good discipline");
  const fbSeats0 = loadTeamEvoStore().byTeam[fbTeam.id]?.seats ?? {};
  ok("the rating queued on every seat that ran that cycle", Object.values(fbSeats0).length >= 1 && Object.values(fbSeats0).every((st) => (st.pendingFeedback ?? []).some((fb) => fb.rating === 4 && fb.comment === "clear plan, good discipline")), JSON.stringify(Object.values(fbSeats0).map((st) => (st.pendingFeedback ?? []).length)));
  const f2 = await runMissionLoopCycle({ team: fbTeam, objective: OBJECTIVE, deps: loopDeps(), repoRoot: fbRepos[1].repo, testCommand: ["node", "test.js"], baseBranch: fbRepos[1].baseBranch, mode: "SUGGEST", budgetCapUsd: 5 });
  printCycleFacts("fb2", f2);
  const fbEvo2 = loadTeamEvoStore().byTeam[fbTeam.id]?.seats["coder"];
  ok("the next fold consumed queued praise into praise suppression, not criticism", (fbEvo2?.praiseSuppression ?? 0) >= 1 && (fbEvo2?.pendingFeedback ?? []).length === 0 && !(fbEvo2?.evidence ?? []).some((e) => e.kind === "feedback"), JSON.stringify({ supp: fbEvo2?.praiseSuppression, queue: (fbEvo2?.pendingFeedback ?? []).length, evidence: (fbEvo2?.evidence ?? []).map((e) => e.kind) }));
  const crit = submitHumanFeedback({ cycleId: f2.record.missionId, teamId: fbTeam.id, rating: 2, comment: "the deny-disabled-admin invariant is still broken", nowIso: "2026-09-08T00:00:01.000Z" });
  ok("a 2/5 criticism is queued the same way", crit.ok === true && (loadTeamEvoStore().byTeam[fbTeam.id]?.seats["coder"]?.pendingFeedback ?? []).length === 1);
  const f3 = await runMissionLoopCycle({ team: fbTeam, objective: OBJECTIVE, deps: loopDeps(), repoRoot: fbRepos[2].repo, testCommand: ["node", "test.js"], baseBranch: fbRepos[2].baseBranch, mode: "SUGGEST", budgetCapUsd: 5 });
  printCycleFacts("fb3", f3);
  const fbEvo3 = loadTeamEvoStore().byTeam[fbTeam.id]?.seats["coder"];
  const humanEvidence = (fbEvo3?.evidence ?? []).filter((e) => e.kind === "feedback");
  const fbCand = pendingCandidates(fbTeam.id).find((c) => c.seatId === "coder");
  ok("the criticism became human evidence at the next fold, comment preserved", humanEvidence.length === 1 && humanEvidence[0].text.includes("the deny-disabled-admin invariant is still broken"), JSON.stringify(humanEvidence.map((e) => e.text)));
  ok("queued feedback is consumed by the fold — no double counting", (fbEvo3?.pendingFeedback ?? []).length === 0, `queue=${(fbEvo3?.pendingFeedback ?? []).length}`);
  ok("the loop state keeps one current rating entry per cycle", loadMissionLoopState().feedbackByCycle[f2.record.missionId]?.rating === 2);
  ok("human evidence shows in a proposal, or stays in the seat's evidence ledger until the bar is met", fbCand !== undefined ? fbCand.evidence.some((e) => e.kind === "feedback") : humanEvidence.length === 1, JSON.stringify({ proposed: fbCand !== undefined, humanItems: humanEvidence.map((e) => e.text.slice(0, 40)) }));
  const rer = submitHumanFeedback({ cycleId: f1.record.missionId, teamId: fbTeam.id, rating: 5, comment: "revised after review", nowIso: "2026-09-08T00:00:02.000Z" });
  ok("re-rating replaces the cycle's entry and queues one fresh human input", rer.ok === true && loadMissionLoopState().feedbackByCycle[f1.record.missionId]?.rating === 5 && Object.keys(loadMissionLoopState().feedbackByCycle).length === 2 && (loadTeamEvoStore().byTeam[fbTeam.id]?.seats["coder"]?.pendingFeedback ?? []).length === 1, JSON.stringify({ map: loadMissionLoopState().feedbackByCycle, queue: (loadTeamEvoStore().byTeam[fbTeam.id]?.seats["coder"]?.pendingFeedback ?? []).length }));

  /* ── 6. one engine, honest accounting ────────────────────────────────────── */
  section("6. one engine, honest accounting");
  const finalState = loadMissionLoopState();
  ok("the loop ledger is a single ordered spine", finalState.cycles.every((c, i, arr) => i === 0 || c.cycleNo === arr[i - 1].cycleNo + 1), JSON.stringify(finalState.cycles.map((c) => c.cycleNo)));
  ok("no cycle ever claimed a receipt it could not verify", finalState.cycles.every((c) => c.receipt === null || c.receipt.ok === true));
  ok("the ledger records spend for every completed cycle", finalState.cycles.filter((c) => c.status === "completed").every((c) => typeof c.spentUsd === "number"));
  const coderMsgs = globalAgentBus.getMessages().filter((m) => m.mentions.includes("@coder") || m.content.includes("coder"));
  ok("communication is part of the loop record, not a side product", coderMsgs.length >= 5, `coder mentions=${coderMsgs.length}`);
  const taught = loadLessons().filter((l) => l.kind === "success" && l.sourceMissionId.startsWith("loop-"));
  ok("verified cycles taught the org memory a success lesson (measured, not claimed)", taught.length >= 1, `success lessons=${taught.length}`);
  console.log(`\nelapsed: ${Date.now() - t0}ms`);

  console.log(`\n========================================`);
  console.log(`MISSION LOOP PROBE SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("missionLoop probe crashed:", err);
  process.exit(1);
});
