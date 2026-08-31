import { useEffect, useState } from "react";
import { ipc } from "../ipc/client";
import type { EvolutionCandidateRecord } from "../domain/types";
import { EVOLUTION_CONFIG, gateCandidate, validateConstraints } from "../domain/evolutionEngine";
import { reassembleSkill } from "../domain/hermesSkill";
import { toast } from "../panels/Toast";

export function EvolutionPage() {
  const [rows, setRows] = useState<EvolutionCandidateRecord[]>([]);
  const [health, setHealth] = useState<Record<string, unknown>>({});
  const refresh = () => void ipc.evolutionList().then((r) => setRows(r as EvolutionCandidateRecord[]));

  useEffect(() => {
    refresh();
    void ipc.evolutionServiceHealth().then((h) => setHealth(h as Record<string, unknown>));
  }, []);

  return (
    <div className="panel-page">
      <h2>Evolution</h2>
      <p className="sub">
        Wraps <span className="mono">vendor/hermes-agent-self-evolution</span>. Fitness = 0.5 correctness + 0.3 procedure + 0.2 conciseness − length penalty.
        Constraints: size ≤ {EVOLUTION_CONFIG.maxSkillSize}, growth ≤ {EVOLUTION_CONFIG.maxPromptGrowth * 100}%, non-empty, SKILL.md structure.
        Accept requires holdout + no regression. Bundled Hermes skills are read-only. No weight updates.
      </p>

      <div className="card">
        <div className="card-title">Vendored engine</div>
        <div className="muted">
          {health.available ? "stdio bridge live" : "in-process port of fitness.py + constraints.py (stdio bridge when native host is running)"}
        </div>
        <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{JSON.stringify(health, null, 2)}</pre>
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
