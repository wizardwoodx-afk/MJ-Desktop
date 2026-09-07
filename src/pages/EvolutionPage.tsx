import { useEffect, useState } from "react";
import { ipc } from "../ipc/client";
import type { EvolutionCandidateRecord } from "../domain/types";
import { EVOLUTION_CONFIG, gateCandidate, validateConstraints } from "../domain/evolutionEngine";
import { reassembleSkill } from "../domain/hermesSkill";
import { toast } from "../panels/Toast";
import { planElasticScale } from "../mission/elasticSeats";
import { selectArms, skillDigest, ucbScore } from "../mission/evolutionBandit";
import { loadAutonomy, saveAutonomy, subscribeAutonomy, type AutonomyState } from "../mission/autonomyStore";
import { loadLessons, decayedStrength } from "../mission/lessons";
import { loadImprovement, adoptedVersion, armScores, nextAssignment, MIN_TRIALS, TRIAL_CAP, ADOPT_MARGIN } from "../mission/selfImprove";
import { loadExperimentRuns } from "../mission/selfEvolveRuntime";
import { loadBeliefs, needsApproval, approveBelief, saveBeliefs as saveBeliefsLocal } from "../mission/belief";
import { loadSkills, saveSkills, decideProposal } from "../mission/skillEvolution";
import { loadLearningReceipts, verifyLearningReceipt } from "../mission/learningReceipt";

export function EvolutionPage() {
  const [rows, setRows] = useState<EvolutionCandidateRecord[]>([]);
  const [health, setHealth] = useState<Record<string, unknown>>({});
  /* 11.9.4(Major+): the autonomy upgrade reads and writes the SHARED autonomy
     store — real runs settle into it (autonomyRuntime), this page reflects it,
     and a storage-event subscription refreshes it live when a run lands in
     another view. The UI shows decisions, never fakes them. */
  const [autonomy, setAutonomy] = useState<AutonomyState>(() => loadAutonomy());
  useEffect(() => subscribeAutonomy(() => setAutonomy(loadAutonomy())), []);
  /* 11.11 SELF-EVOLVING: this page reflects the org's measured learning — the
     lesson memory, the strategy archive and the signed learning receipts that
     real runs produced. Decisions happen here; nothing is pretended. */
  const [, setEvolveTick] = useState(0);
  const reEvolve = () => setEvolveTick((t) => t + 1);
  const lessons = loadLessons();
  const improvement = loadImprovement();
  const skills = loadSkills();
  const learnReceipts = loadLearningReceipts();
  const nowMs = Date.now();
  const elastic = autonomy.elastic;
  const bandit = autonomy.bandit;
  const setElasticPolicy = (next: typeof elastic) => {
    saveAutonomy({ ...loadAutonomy(), elastic: next });
    setAutonomy(loadAutonomy());
  };
  const refresh = () => void ipc.evolutionList().then((r) => setRows(r as EvolutionCandidateRecord[]));

  useEffect(() => {
    refresh();
    void ipc.evolutionServiceHealth().then((h) => setHealth(h as Record<string, unknown>));
  }, []);

  return (
    <div className="panel-page">
      <h2>Evolution</h2>
      <p className="sub">
        MJ's own engine. Fitness = 0.5 correctness + 0.3 procedure + 0.2 conciseness − length penalty.
        Constraints: size ≤ {EVOLUTION_CONFIG.maxSkillSize}, growth ≤ {EVOLUTION_CONFIG.maxPromptGrowth * 100}%, non-empty, SKILL.md structure.
        Accept requires holdout + no regression. Bundled skills are read-only. No weight updates.
      </p>

      <div className="card">
        <div className="card-title">Evolution engine</div>
        <div className="muted">
          {health.available ? "stdio bridge live" : "in-process TypeScript engine (stdio bridge when native host is running)"}
        </div>
        <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(health, null, 2)}</pre>
      </div>

      <div className="card">
        <div className="card-title">Autonomy — elastic seats + bandit router <span className="pill">11.9.4 Major+</span></div>
        <div className="muted">
          Elastic seats let the runtime propose scaling from measured signals only — caps are hard and praised
          seats are never touched. The bandit router picks which strategy dimensions the evolve loop searches
          next: UCB1 over measured runs; simulated runs are logged as experience but never move a posterior;
          the structural-jump arm arms itself only after {`stagnation`}. Outcomes are recorded by real runs.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={elastic.enabled} onChange={(e) => setElasticPolicy({ ...elastic, enabled: e.target.checked })} />
            elastic seats {elastic.enabled ? "ON" : "OFF"} · min {elastic.minSeats} · cap {elastic.maxSeats}
          </label>
        </div>
        <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{
          `policy preview on neutral signals: ${planElasticScale({ currentSeats: 4, writerSeats: 3, reviewerSeats: 1, debuggerSeats: 0, pendingTasks: 0, unreviewedArtifacts: 0, failedSeats: [], praisedSeats: [], idleRuns: 0 }, elastic).kind}\n` +
          `next strategy arms: ${selectArms(bandit).join(", ")}\n\n${skillDigest(bandit)}`
        }</pre>
        <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{
          (Object.keys(bandit.arms) as Array<keyof typeof bandit.arms>).map((id) => {
            const a = bandit.arms[id];
            const u = ucbScore(bandit, id);
            return `${id.padEnd(16)} pulls=${String(a.pulls).padStart(2)} mean=${(a.alpha / (a.alpha + a.beta)).toFixed(2)} ucb=${Number.isFinite(u) ? u.toFixed(2) : "untried"}`;
          }).join("\n")
        }</pre>
        <div className="muted" style={{ marginTop: 8 }}>
          Last {autonomy.log.length} settled run(s) — recorded by real executions, refreshed live:
        </div>
        <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{
          autonomy.log.length === 0
            ? "none yet — run a team and the settlement lands here."
            : autonomy.log.slice(-6).map((l) =>
                `${l.ts.slice(11, 19)} ${l.teamId.slice(0, 8)} arms=[${l.arms.join(",") || "-"}] verified=${String(l.verified)} sim=${String(l.simulated)} -> ${l.action.kind}${l.applied ? " (applied)" : ""}`
              ).join("\n")
        }</pre>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <button onClick={async () => {
          const baseline = reassembleSkill(
            { name: "meeting-notes", description: "Summarize a meeting into decisions and actions." },
            "# Meeting notes\n\nExtract decisions and owners.",
          );
          const candidate = reassembleSkill(
            { name: "meeting-notes", description: "Summarize a meeting into decisions and actions." },
            "# Meeting notes\n\nExtract decisions and owners.\n\n## Learned corrections\n\n- Always include a done-when for each action.\n",
          );
          const constraints = validateConstraints(candidate, "skill", baseline);
          const gate = gateCandidate({
            baselineText: baseline,
            candidateText: candidate,
            taskInput: "Summarize the standup.",
            expectedBehavior: "decisions owners done-when",
            baselineOutput: "Decisions listed.",
            candidateOutput: "Decisions and owners with done-when.",
            bundled: false,
          });
          await ipc.evolutionProposeSave({
            nodeKey: "demo:meeting-notes",
            parentVersion: 1,
            candidateVersion: 2,
            trigger: "trace-failure",
            evidence: ["Missing done-when on two consecutive runs"],
            changes: { skill: { procedure: "Add done-when for each action." } },
            baselineScore: gate.baseline.composite,
            candidateScore: gate.candidate.composite,
            holdoutPassed: gate.holdoutPassed,
            regressionPassed: gate.regressionPassed,
          });
          toast(gate.accepted ? "Gated candidate proposed (would auto-accept in AUTONOMOUS)" : `Proposed · ${gate.reason}`);
          void constraints;
          refresh();
        }}>Propose gated sample</button>
      </div>

      {rows.length === 0 && <p className="muted">No candidates yet.</p>}
      {rows.map((c) => (
        <div key={c.id} className="card">
          <div className="card-title">
            {c.nodeKey}
            <span className="pill">{c.decision}</span>
            <span className="pill">{c.status}</span>
            {c.holdoutPassed ? <span className="pill ok">holdout</span> : <span className="pill">holdout fail</span>}
            {c.regressionPassed ? <span className="pill ok">no regression</span> : <span className="pill">regression</span>}
          </div>
          <div className="muted">{c.trigger} · baseline {fmt(c.baselineScore)} → {fmt(c.candidateScore)}</div>
          <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(c.changes, null, 2)}</pre>
          {c.decision === "PENDING" && (
            <div className="row">
              <button className="primary" onClick={async () => { await ipc.evolutionDecide(c.id, "ACCEPTED"); refresh(); }}>Accept</button>
              <button className="danger" onClick={async () => { await ipc.evolutionDecide(c.id, "REJECTED"); refresh(); }}>Reject</button>
              <button onClick={async () => { await ipc.evolutionRollback(c.id); refresh(); }}>Rollback</button>
            </div>
          )}
        </div>
      ))}

      <div className="card">
        <div className="card-title">Self-evolution — lessons · strategy experiment · skills <span className="pill">11.11.1</span></div>
        <p className="muted">
          Real runs reflect into lessons; the strategy loop is a genuine online experiment —
          runs alternate between baseline and candidate, each run executes the parameters of
          the strategy that governs it, and each arm is scored ONLY on its own attributed runs.
          Whatever the org learns is signed as a learning receipt. Simulated runs teach nothing.
        </p>
        <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
          <span><b>{lessons.length}</b> lessons in memory</span>
          <span>strategy <b>v{adoptedVersion(improvement)?.gen ?? 1}</b> adopted</span>
          <span><b>{skills.filter((s) => s.status === "proposed").length}</b> skill proposal(s) waiting</span>
          <span><b>{learnReceipts.length}</b> learning receipt(s)</span>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          <b>Experiment rule (11.11.1):</b> a verdict needs {MIN_TRIALS} measured runs on EACH arm,
          adoption needs a strict margin &gt; {ADOPT_MARGIN}; {TRIAL_CAP} attributed runs per arm
          without a verdict retires the candidate inconclusive; unattributed runs (pre-11.11.1)
          score for no arm. A strategy is never credited with results it did not produce.
        </div>
        <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{experimentSummary()}</pre>
        {lessons.slice(0, 5).map((l) => (
          <div key={l.id} className="muted" style={{ marginTop: 6 }}>
            [{l.kind}] {l.text} <span className="pill">{decayedStrength(l, nowMs).toFixed(2)}</span>
          </div>
        ))}
        {improvement.versions.slice(-6).map((v) => (
          <div key={v.id} className="muted" style={{ marginTop: 4 }}>
            {v.id} · {v.status} · {v.score === null ? "unmeasured" : v.score.toFixed(2)} — {v.note}
          </div>
        ))}
        <div className="muted" style={{ marginTop: 8 }}>
          <b>What skill evolution is (and isn't):</b> it learns reusable procedural knowledge —
          an approved proposal becomes a learned node definition and a briefing line. It does
          NOT invent or implement new executable tools; humans approve every proposal.
        </div>
        {skills.filter((s) => s.status === "proposed").map((s) => (
          <div key={s.id} className="row" style={{ marginTop: 8 }}>
            <span className="muted" style={{ flex: 1 }}>{s.name}: {s.description}</span>
            <button className="primary" onClick={() => { saveSkills(decideProposal(loadSkills(), s.id, "approved")); reEvolve(); toast(`Skill approved: ${s.name} — it now rides in briefings`); }}>Approve</button>
            <button className="danger" onClick={() => { saveSkills(decideProposal(loadSkills(), s.id, "discarded")); reEvolve(); }}>Discard</button>
          </div>
        ))}
        <div className="card">
        <div className="card-title">Human approval queue — one structured inbox <span className="pill">11.12.2</span></div>
        <p className="muted">
          Everything that needs a human, in one place: skill proposals, beliefs MJ inferred about
          you, and (on the Control page) mission gates and merge overrides. Nothing here approves
          itself; every decision records who clicked.
        </p>
        {(() => {
          const pendSkills = skills.filter((x) => x.status === "proposed");
          const pendBeliefs = loadBeliefs().filter(needsApproval);
          if (pendSkills.length === 0 && pendBeliefs.length === 0) return <div className="muted">queue empty — nothing awaits a human.</div>;
          return (
            <div>
              {pendBeliefs.map((b) => (
                <div key={b.id} className="row" style={{ marginTop: 8 }}>
                  <span className="muted" style={{ flex: 1 }}>[belief about you] {b.claim} <span className="pill">{b.source}</span></span>
                  <button className="primary" onClick={() => { saveBeliefsLocal(approveBelief(loadBeliefs(), b.id)); reEvolve(); toast(`Belief approved: ${b.claim}`); }}>Approve</button>
                  <button className="danger" onClick={() => { saveBeliefsLocal(loadBeliefs().filter((x) => x.id !== b.id)); reEvolve(); }}>Discard</button>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {learnReceipts.length > 0 && (
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">latest receipt {learnReceipts[learnReceipts.length - 1].id} · {learnReceipts[learnReceipts.length - 1].lessons.length} lesson(s)</span>
            <button onClick={async () => {
              const v = await verifyLearningReceipt(learnReceipts[learnReceipts.length - 1]);
              toast(v.ok ? "Learning receipt verifies — digest + signature intact" : `Learning receipt FAILED: ${v.reason}`, v.ok ? undefined : "err");
            }}>Verify latest</button>
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(n: number | null) {
  return typeof n === "number" ? n.toFixed(3) : "—";
}

/** 11.11.1 — the live state of the strategy experiment: both arms, own-run scores, next assignment. */
function experimentSummary(): string {
  const s = loadImprovement();
  const runs = loadExperimentRuns();
  const arms = armScores(s, runs);
  const next = nextAssignment(s, runs);
  const line = (label: string, id: string | null, a: { score: number | null; measured: number; attributed: number } | null, status: string) => {
    if (!id || !a) return `${label.padEnd(9)} — none`;
    return `${label.padEnd(9)} ${id.padEnd(12)} ${status.padEnd(9)} score ${a.score === null ? "null (no measured own-runs)" : a.score.toFixed(2)} · ${a.measured}/${MIN_TRIALS} measured · ${a.attributed} attributed run(s)`;
  };
  const baseline = adoptedVersion(s);
  const candidate = s.versions.find((v) => v.status === "candidate") ?? null;
  return [
    line("baseline", arms.baselineId, arms.baseline, baseline?.status ?? "-"),
    line("candidate", arms.candidateId, arms.candidate, candidate?.status ?? "-"),
    candidate ? `candidate params: reviewDepth ${candidate.params.reviewDepth} · checkBias ${candidate.params.checkBias} · serialExec ${candidate.params.serialExec} · lessonBudget ${candidate.params.lessonBudget}` : "no candidate in the field — next verified settlement proposes one",
    `next run executes: ${next ? `${next.id} (${next.status === "candidate" ? "CANDIDATE" : "baseline"})` : "—"}`,
  ].join("\n");
}
