import { useEffect, useState } from "react";
import { ipc } from "../ipc/client";
import type { EvolutionCandidateRecord } from "../domain/types";
import { EVOLUTION_CONFIG, gateCandidate, validateConstraints } from "../domain/evolutionEngine";
import { reassembleSkill } from "../domain/hermesSkill";
import { toast } from "../panels/Toast";
import { planElasticScale } from "../mission/elasticSeats";
import { selectArms, skillDigest, ucbScore } from "../mission/evolutionBandit";
import { loadAutonomy, saveAutonomy, subscribeAutonomy, type AutonomyState } from "../mission/autonomyStore";

export function EvolutionPage() {
  const [rows, setRows] = useState<EvolutionCandidateRecord[]>([]);
  const [health, setHealth] = useState<Record<string, unknown>>({});
  /* 11.9.4(Major+): the autonomy upgrade reads and writes the SHARED autonomy
     store — real runs settle into it (autonomyRuntime), this page reflects it,
     and a storage-event subscription refreshes it live when a run lands in
     another view. The UI shows decisions, never fakes them. */
  const [autonomy, setAutonomy] = useState<AutonomyState>(() => loadAutonomy());
  useEffect(() => subscribeAutonomy(() => setAutonomy(loadAutonomy())), []);
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
        <div className="card-title">Autonomy — elastic seats + bandit router <span className="pill">11.9.4 Major</span></div>
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
    </div>
  );
}

function fmt(n: number | null) {
  return typeof n === "number" ? n.toFixed(3) : "—";
}
