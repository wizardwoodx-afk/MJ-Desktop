import { useMemo, useState } from "react";
import { AGENT_FRAMEWORKS } from "../domain/frameworks";
import { ROLE_PACK_COUNT } from "../domain/rolePacks";
import {
  instantiateTeam,
  loadTeamsLocal,
  saveTeamsLocal,
  teamFromFramework,
  type TeamWorkspace,
} from "../domain/teams";
import { useGraphStore } from "../graph/store";
import { ipc } from "../ipc/client";
import { toast } from "../panels/Toast";
import { uid } from "../app/id";

export function TeamsPage({ onOpened }: { onOpened: () => void }) {
  const [teams, setTeams] = useState<TeamWorkspace[]>(() => loadTeamsLocal());
  const [task, setTask] = useState("");
  const [selected, setSelected] = useState<string>(teams[0]?.id ?? "");
  const store = useGraphStore();
  const fwById = useMemo(() => new Map(AGENT_FRAMEWORKS.map((f) => [f.id, f])), []);

  const persist = (next: TeamWorkspace[]) => {
    setTeams(next);
    saveTeamsLocal(next);
  };

  const apply = async (team: TeamWorkspace) => {
    const t = task.trim() || "New task for this team";
    const { nodes, wires } = instantiateTeam(team, t);
    if (!store.workflowId) {
      const res = await ipc.workflowCreate(`${team.name}: ${t.slice(0, 40)}`, team.description);
      const created = await ipc.workflowGet(res.id);
      store.loadWorkflow(created as never);
      window.__mjActiveWorkflowId = res.id;
    }
    store.insertTemplate(nodes, wires);
    store.rename(`${team.name}: ${t.slice(0, 40)}`);
    toast(`Team “${team.name}” on canvas`);
    onOpened();
  };

  return (
    <div className="panel-page">
      <h2>Reusable teams</h2>
      <p className="sub">
        A team is a roster of Hermes-class agents plus a coordination framework.
        Save it once. Drop the same team onto a new task. Shared memory key stays with the team.
        {ROLE_PACK_COUNT} specialist identities · {AGENT_FRAMEWORKS.length} frameworks — not n8n steps.
      </p>

      <label className="field">Task for the selected team
        <div className="nl-box">
          <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. threat-model the payments service and patch the top finding" />
          <button className="primary" disabled={!selected} onClick={() => {
            const t = teams.find((x) => x.id === selected);
            if (t) void apply(t);
          }}>Apply team</button>
        </div>
      </label>

      {teams.map((t) => (
        <div key={t.id} className={`card ${selected === t.id ? "selected" : ""}`} onClick={() => setSelected(t.id)}>
          <div className="card-title">{t.name} <span className="pill">{fwById.get(t.frameworkId)?.pattern ?? t.frameworkId}</span></div>
          <div className="muted">{t.description}</div>
          <div className="muted" style={{ marginTop: 8 }}>{t.members.map((m) => m.title).join(" · ")}</div>
          <div className="muted">memory {t.memoryKey}</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={(e) => { e.stopPropagation(); void apply(t); }}>Use for this task</button>
            <button className="danger" onClick={(e) => {
              e.stopPropagation();
              persist(teams.filter((x) => x.id !== t.id));
            }}>Forget team</button>
          </div>
        </div>
      ))}

      <h3 style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 11, color: "var(--text-3)", marginTop: 28 }}>
        Save a framework as a team
      </h3>
      <div className="grid-2">
        {AGENT_FRAMEWORKS.map((f) => (
          <div key={f.id} className="card tpl">
            <div className="pill">{f.category}</div>
            <h3>{f.name}</h3>
            <div className="muted">{f.description}</div>
            <div className="muted" style={{ marginTop: 8 }}>{f.roster.length} seats · {f.pattern}</div>
            <button style={{ marginTop: 10 }} onClick={() => {
              const now = new Date().toISOString();
              const body = teamFromFramework(f);
              const rec: TeamWorkspace = { ...body, id: uid("team"), createdAt: now, updatedAt: now };
              persist([rec, ...teams]);
              setSelected(rec.id);
              toast(`Saved team ${rec.name}`);
            }}>Save as team</button>
          </div>
        ))}
      </div>
    </div>
  );
}
