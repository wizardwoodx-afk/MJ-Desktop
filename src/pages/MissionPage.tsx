/**
 * §29 Mission UI.
 *
 * The screen exists to answer one question the old workflow editor could not: *why is this
 * artifact here, who made it, what failed on the way, and who authorised it.* So the layout is
 * organised around evidence rather than around a canvas:
 *
 *   objective + status + policy   |   plan (inspectable before anything runs)
 *   organization roster + tasks   |   approvals inbox (what / why / who / changes / risk)
 *   artifacts + lineage + checks  |   flight recorder with a scrubber (time travel)
 *   repairs + mutations           |   checkpoints + rollback, mission score (never one number)
 *
 * The runtime on this page is the real `MissionRuntime` — planning, arbitration, failure
 * detection, the repair ladder, independent evaluation, checkpoints and the approval gate all
 * run in the browser against the in-process store. Execution itself needs a coding agent: when
 * no CLI is installed the runtime uses the labelled `local-test` double, says so in the UI, and
 * refuses to mark the mission verified. Nothing here implies capability that is not there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MISSION_TEMPLATES, instantiateTemplate } from "../mission/templates";
import { MissionRuntime, createServices } from "../mission/missionRuntime";
import { onFlightEvent } from "../mission/flightRecorder";
import { policyTable } from "../mission/riskPolicy";
import { validateWorkflow } from "../graph/validation";
import { toast } from "../panels/Toast";
import type { ApprovalRequest, Artifact, FlightEvent, Mission, MissionPlan } from "../mission/types";

/* ------------------------------------------------------------------ local persistence */

const LS_KEY = "mj.missions.v1";
/**
 * The key this store used before the naming was aligned with the rest of the app
 * (`mj.theme`, `mj.v3.db`, `mj.teams.v1`, …).
 *
 * Kept because renaming a persistence key is not a cosmetic edit: every user who already has missions
 * saved would open MJ and find an empty list, with no error, and no way to tell the difference between
 * "you have no missions" and "your missions are under the old key". Reads fall back to it and migrate
 * on the next save, so existing data survives the rename.
 */
const LS_KEY_LEGACY = "mj6.missions.v1";

interface StoredMission {
  mission: Mission;
  state: ReturnType<MissionRuntime["persist"]> | null;
}

function loadStored(): StoredMission[] {
  try {
    const raw = localStorage.getItem(LS_KEY) ?? localStorage.getItem(LS_KEY_LEGACY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredMission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStored(rows: StoredMission[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch {
    /* quota or private mode — the mission still runs, it just will not survive a reload */
  }
}

/* ------------------------------------------------------------------ small presentational bits */

function Status({ status }: { status: string }) {
  const tone =
    status === "COMPLETED"
      ? "var(--amber)"
      : status === "FAILED" || status === "BLOCKED"
        ? "var(--danger)"
        : status === "RUNNING" || status === "REPAIRING"
          ? "var(--text)"
          : "var(--text-dim)";
  return (
    <span className="pill" style={{ color: tone, borderColor: tone, border: `1px solid ${tone}`, padding: "1px 8px", fontSize: 11 }}>
      {status}
    </span>
  );
}

function Bar({ label, value, note }: { label: string; value: number; note?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div style={{ marginBottom: 6 }}>
      <div className="row" style={{ justifyContent: "space-between", fontSize: 11 }}>
        <span className="muted">{label}</span>
        <span className="mono">{note ?? `${Math.round(pct)}%`}</span>
      </div>
      <div style={{ height: 4, background: "var(--bg-input)", border: "1px solid var(--border)", marginTop: 2 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--amber)" }} />
      </div>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <div className="card-title row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span>{title}</span>
        {right}
      </div>
      <div style={{ padding: "8px 10px" }}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="muted" style={{ fontSize: 12, padding: "6px 0" }}>{children}</div>;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/* ------------------------------------------------------------------ the page */

export function MissionPage() {
  const [stored, setStored] = useState<StoredMission[]>(() => loadStored());
  const [selectedId, setSelectedId] = useState<string>(stored[0]?.mission.missionId ?? "");
  const [templateId, setTemplateId] = useState<string>(MISSION_TEMPLATES[0]?.id ?? "");
  const [objective, setObjective] = useState("");
  const [autonomy, setAutonomy] = useState<"AUTONOMOUS" | "SUPERVISED" | "HUMAN_ONLY">("SUPERVISED");
  const [allowSimulated, setAllowSimulated] = useState(true);

  const servicesRef = useRef(createServices());
  const rtRef = useRef<MissionRuntime | null>(null);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  const mission = useMemo(() => stored.find((s) => s.mission.missionId === selectedId)?.mission ?? null, [stored, selectedId]);
  const rt = rtRef.current;

  /* Live updates: every flight event repaints the evidence panels. */
  useEffect(() => onFlightEvent(rerender), [rerender]);
  useEffect(() => {
    const id = setInterval(rerender, 700);
    return () => clearInterval(id);
  }, [rerender]);

  /* Build (or rebuild) the runtime for the selected mission. */
  useEffect(() => {
    if (!mission) {
      rtRef.current = null;
      return;
    }
    const row = stored.find((s) => s.mission.missionId === mission.missionId);
    const runtime = new MissionRuntime(mission, servicesRef.current, {
      allowSimulated,
      installed: { "local-test": true },
      approvalTimeoutMs: 10 * 60 * 1000,
      onApprovalRequired: (id) => toast(`Approval required — ${id.slice(0, 12)}`),
    });
    rtRef.current = runtime;
    if (row?.state) {
      const res = runtime.restore(row.state);
      if (!res.ok) toast(`Restore refused: ${res.errors.join("; ")}`);
    }
    rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, allowSimulated]);

  const persistNow = useCallback(() => {
    const cur = rtRef.current;
    if (!cur) return;
    setStored((rows) => {
      const next = rows.map((r) => (r.mission.missionId === cur.mission.missionId ? { mission: cur.mission, state: cur.persist() } : r));
      saveStored(next);
      return next;
    });
  }, []);

  /* ------------------------------------------------------------------ actions */

  const createMission = () => {
    const obj = objective.trim();
    if (!obj) {
      toast("A mission needs an objective.");
      return;
    }
    const m = instantiateTemplate(templateId, { objective: obj, workspace: "." });
    m.riskPolicy = { ...m.riskPolicy, autonomy };
    const rows = [{ mission: m, state: null }, ...stored];
    setStored(rows);
    saveStored(rows);
    setSelectedId(m.missionId);
    setObjective("");
    toast(`Mission created: ${m.name}`);
  };

  const prepare = () => {
    const cur = rtRef.current;
    if (!cur) return;
    try {
      cur.prepare();
      cur.buildOrganization();
      persistNow();
      rerender();
      toast("Plan built and organization formed.");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  const run = async () => {
    const cur = rtRef.current;
    if (!cur) return;
    rerender();
    try {
      await cur.run();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
    persistNow();
    rerender();
  };

  const decide = (req: ApprovalRequest, verdict: "APPROVED" | "REJECTED") => {
    servicesRef.current.approvals.decide(req.id, verdict, "human", verdict === "APPROVED" ? "Approved from the Mission screen." : "Rejected from the Mission screen.");
    rerender();
    setTimeout(persistNow, 50);
  };

  const rollback = (checkpointId: string) => {
    const cur = rtRef.current;
    if (!cur) return;
    const target = servicesRef.current.checkpoints.forMission(cur.mission.missionId).find((c) => c.checkpointId === checkpointId);
    const done = cur.restoreCheckpoint(checkpointId, "Rolled back by the user from the Mission screen.");
    persistNow();
    rerender();
    toast(done ? `Rolled back to "${target?.label ?? checkpointId}" (graph v${target?.graphVersion ?? "?"})` : "Rollback refused — that checkpoint is no longer available.");
  };

  /* ------------------------------------------------------------------ derived data */

  const plan: MissionPlan | null = rt?.getPlan() ?? null;
  const events: FlightEvent[] = rt?.getEvents() ?? [];
  const artifacts: Artifact[] = rt ? servicesRef.current.artifacts.forMission(rt.mission.missionId) : [];
  const approvals: ApprovalRequest[] = rt ? servicesRef.current.approvals.forMission(rt.mission.missionId) : [];
  const pending = approvals.filter((a) => a.status === "PENDING");
  const agents = rt?.org.agents() ?? [];
  const tasks = rt?.org.tasks_() ?? [];
  const repairs = rt?.getRepairs() ?? [];
  const failures = rt?.getFailures() ?? [];
  const mutations = rt?.getMutations() ?? [];
  const checkpoints = rt ? servicesRef.current.checkpoints.forMission(rt.mission.missionId) : [];
  const usage = rt ? rt.usage() : null;
  const graphIssues = rt ? validateWorkflow(rt.getGraph()).filter((i) => i.severity === "error") : [];
  const boundary = mission?.boundary ?? null;
  const unverified = artifacts.filter((a) => a.evaluation && (!a.evaluation.passed || !a.evaluation.fullyMeasured));

  const [scrub, setScrub] = useState<number | null>(null);
  const visibleEvents = scrub == null ? events : events.filter((e) => e.seq <= scrub);
  const score = mission?.status === "COMPLETED" || mission?.status === "BLOCKED" || mission?.status === "FAILED" ? lastScore(events) : null;

  return (
    <div className="panel-page" style={{ overflow: "auto", height: "100%", padding: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15 }}>Missions</div>
          <div className="muted" style={{ fontSize: 12, maxWidth: 640 }}>
            A mission is an outcome, not a workflow: MJ plans it, forms an organization to deliver it, repairs that
            organization while it runs, and keeps the evidence for every decision.
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {rt && (
            <>
              <button className="ghost" onClick={() => { rt.pause("Paused by the user."); persistNow(); rerender(); }}>Pause</button>
              <button className="ghost" onClick={() => { rt.resume("Resumed by the user."); rerender(); }}>Resume</button>
              <button className="ghost" onClick={() => { rt.checkpoint("manual", "Taken by the user from the Mission screen."); persistNow(); rerender(); }}>Checkpoint</button>
              <button className="ghost" onClick={persistNow}>Save</button>
            </>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------- create */}
      <Card title="New mission">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ flexGrow: 1, minWidth: 260 }}
            placeholder="Objective — e.g. Build a production-ready SaaS billing feature in TypeScript"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createMission()}
          />
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {MISSION_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select className="input" value={autonomy} onChange={(e) => setAutonomy(e.target.value as typeof autonomy)}>
            <option value="AUTONOMOUS">AUTONOMOUS</option>
            <option value="SUPERVISED">SUPERVISED</option>
            <option value="HUMAN_ONLY">HUMAN ONLY</option>
          </select>
          <label className="row" style={{ fontSize: 12, gap: 4 }}>
            <input type="checkbox" checked={allowSimulated} onChange={(e) => setAllowSimulated(e.target.checked)} />
            allow the labelled simulation
          </label>
          <button className="primary" onClick={createMission}>Create</button>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          No coding CLI is registered in this session, so execution runs on MJ&apos;s labelled <span className="mono">local-test</span> double.
          It is reported as simulated everywhere and the runtime will not mark a mission verified on it.
          Register a real harness on the Providers page to execute for real.
        </div>
      </Card>

      {/* ---------------------------------------------------- mission list */}
      {stored.length > 0 && (
        <Card title={`Missions (${stored.length})`}>
          {stored.map((row) => (
            <div
              key={row.mission.missionId}
              className="row"
              style={{ justifyContent: "space-between", padding: "3px 4px", cursor: "pointer", background: row.mission.missionId === selectedId ? "var(--bg-input)" : "transparent" }}
              onClick={() => setSelectedId(row.mission.missionId)}
            >
              <span style={{ fontSize: 12 }}>
                <span className="mono muted">{row.mission.missionId.slice(0, 10)}</span> {row.mission.name}
                <span className="muted"> — {row.mission.objective.slice(0, 70)}</span>
              </span>
              <Status status={row.mission.status} />
            </div>
          ))}
        </Card>
      )}

      {!mission && <Empty>Create a mission to see its plan, organization, evidence and flight recorder.</Empty>}

      {mission && rt && (
        <>
          {/* ---------------------------------------------------- objective + policy */}
          <div className="grid-2">
            <Card title="Objective and governance" right={<Status status={mission.status} />}>
              <div style={{ fontSize: 12, marginBottom: 6 }}>{mission.objective}</div>
              <div className="muted mono" style={{ fontSize: 11 }}>
                autonomy={mission.riskPolicy.autonomy} · threshold={mission.riskPolicy.approvalThreshold} · budget=$
                {mission.budget.maxCostUsd} / {mission.budget.maxTokens.toLocaleString()} tok · retries/task=
                {mission.budget.maxRetriesPerTask} · concurrent={mission.budget.maxConcurrentAgents}
              </div>
              <div style={{ marginTop: 8 }}>
                {policyTable(mission.riskPolicy.autonomy, mission.riskPolicy.approvalThreshold).map((r) => (
                  <div key={r.risk} className="row" style={{ justifyContent: "space-between", fontSize: 11 }}>
                    <span className="mono">{r.risk}</span>
                    <span className="muted">{r.behaviour}</span>
                  </div>
                ))}
              </div>
              {boundary && (
                <div className="muted mono" style={{ fontSize: 11, marginTop: 8 }}>
                  boundary: {Object.entries(boundary).filter(([, v]) => v === true).map(([k]) => k).join(", ") || "nothing permitted"}
                </div>
              )}
            </Card>

            <Card title="Resources and honesty" right={usage ? <span className="mono muted">${usage.costUsd.toFixed(4)}</span> : undefined}>
              {usage ? (
                <>
                  <Bar label="cost" value={mission.budget.maxCostUsd ? usage.costUsd / mission.budget.maxCostUsd : 0} note={`$${usage.costUsd.toFixed(4)} / $${mission.budget.maxCostUsd}`} />
                  <Bar label="tokens" value={mission.budget.maxTokens ? usage.tokens / mission.budget.maxTokens : 0} note={`${usage.tokens.toLocaleString()} / ${mission.budget.maxTokens.toLocaleString()}`} />
                  <Bar label="retries" value={mission.budget.maxRetriesPerTask * Math.max(1, tasks.length) ? usage.retries / (mission.budget.maxRetriesPerTask * Math.max(1, tasks.length)) : 0} note={`${usage.retries}`} />
                  <Bar label="graph mutations" value={mission.budget.maxGraphMutations ? usage.graphMutations / mission.budget.maxGraphMutations : 0} note={`${usage.graphMutations} / ${mission.budget.maxGraphMutations}`} />
                  <div style={{ marginTop: 6, fontSize: 11 }}>
                    {unverified.length ? (
                      <span style={{ color: "var(--danger)" }}>{unverified.length} artifact(s) not independently verified — the mission cannot claim verified completion.</span>
                    ) : (
                      <span className="muted">No artifacts yet.</span>
                    )}
                  </div>
                </>
              ) : (
                <Empty>Nothing spent yet.</Empty>
              )}
            </Card>
          </div>

          {/* ---------------------------------------------------- plan */}
          <Card
            title="Plan (inspectable before execution)"
            right={
              <span className="row" style={{ gap: 6 }}>
                {plan && <span className="muted mono" style={{ fontSize: 11 }}>est. ${plan.estimatedCostUsd.toFixed(2)} · {plan.frameworkId}</span>}
                {(mission.status === "DRAFT" || mission.status === "PLANNING") && <button className="primary" onClick={prepare}>Plan and form organization</button>}
                {(mission.status === "READY" || mission.status === "PAUSED" || mission.status === "BLOCKED") && <button className="primary" onClick={() => void run()}>Run</button>}
              </span>
            }
          >
            {!plan && <Empty>Not planned yet. Planning does not execute anything — the plan is a proposal you can read first.</Empty>}
            {plan?.steps.map((s) => (
              <div key={s.id} className="row" style={{ justifyContent: "space-between", padding: "3px 0", fontSize: 12, borderTop: "1px solid var(--border)" }}>
                <span>
                  <span className="mono muted">{s.id}</span> {s.title} <span className="muted">[{s.agentDefId}]</span>
                  {s.requiresApproval && <span style={{ color: "var(--danger)" }}> · HUMAN GATE</span>}
                </span>
                <span className="muted mono" style={{ fontSize: 11 }}>
                  risk={s.risk} · deps={s.dependsOn.join(",") || "—"} · ~${s.estimatedCostUsd.toFixed(2)}
                </span>
              </div>
            ))}
            {plan?.warnings?.length ? (
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{plan.warnings.map((w) => <div key={w}>⚠ {w}</div>)}</div>
            ) : null}
          </Card>

          {/* ---------------------------------------------------- organization */}
          <div className="grid-2">
            <Card title={`Organization (${agents.length} agents)`}>
              {!agents.length && <Empty>No agents yet — form the organization from the plan.</Empty>}
              {agents.map((a) => (
                <div key={a.agentId} className="row" style={{ justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                  <span>
                    {a.title} <span className="muted mono">{a.definitionId}</span>
                  </span>
                  <span className="muted mono" style={{ fontSize: 11 }}>
                    {a.state} · {a.harness ?? "no runtime"} · {a.contract.permissions.shell ? "shell" : ""}
                    {a.contract.permissions.filesystemWrite ? ",write" : ""}
                  </span>
                </div>
              ))}
            </Card>

            <Card title={`Tasks (${tasks.length})`} right={graphIssues.length ? <span style={{ color: "var(--danger)", fontSize: 11 }}>{graphIssues.length} graph error(s)</span> : undefined}>
              {!tasks.length && <Empty>No tasks yet.</Empty>}
              {tasks.map((t) => (
                <div key={t.taskId} className="row" style={{ justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                  <span>
                    {t.title}
                    {t.error && <div className="muted" style={{ fontSize: 11 }}>{t.error.slice(0, 110)}</div>}
                  </span>
                  <span className="muted mono" style={{ fontSize: 11 }}>
                    {t.state} · {t.cls} · {t.attempts}/{t.maxAttempts}
                  </span>
                </div>
              ))}
            </Card>
          </div>

          {/* ---------------------------------------------------- approvals */}
          <Card title={`Approvals (${pending.length} pending)`}>
            {!approvals.length && <Empty>No high-risk action has needed a human on this mission.</Empty>}
            {approvals.map((a) => (
              <div key={a.id} style={{ borderTop: "1px solid var(--border)", padding: "6px 0", fontSize: 12 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    <strong>{a.summary}</strong> <span className="mono muted">{a.risk}</span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    <span className="muted mono" style={{ fontSize: 11 }}>{a.status}{a.decidedBy ? ` by ${a.decidedBy}` : ""}</span>
                    {a.status === "PENDING" && (
                      <>
                        <button className="primary" onClick={() => decide(a, "APPROVED")}>Approve</button>
                        <button className="ghost" onClick={() => decide(a, "REJECTED")}>Reject</button>
                      </>
                    )}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  why: {a.justification}<br />
                  who: {a.requestedBy} · reversible: {String(a.reversible)}<br />
                  changes: {a.changes.join(" | ") || "none stated"}<br />
                  expected: {a.expectedOutcome}<br />
                  evidence: {a.evidence.join(" | ") || "none"}
                </div>
              </div>
            ))}
          </Card>

          {/* ---------------------------------------------------- artifacts + lineage */}
          <Card title={`Artifacts (${artifacts.length})`}>
            {!artifacts.length && <Empty>No artifacts produced yet.</Empty>}
            {artifacts.map((a) => (
              <details key={a.artifactId} style={{ borderTop: "1px solid var(--border)", padding: "4px 0" }}>
                <summary style={{ cursor: "pointer", fontSize: 12 }}>
                  {a.name} <span className="muted mono">v{a.version}</span>{" "}
                  {a.evaluation ? (
                    a.evaluation.passed && a.evaluation.fullyMeasured ? (
                      <span style={{ color: "var(--amber)" }}>verified</span>
                    ) : (
                      <span style={{ color: "var(--danger)" }}>not verified</span>
                    )
                  ) : (
                    <span className="muted">unevaluated</span>
                  )}
                </summary>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  <div className="muted">
                    why it exists: produced by {a.provenance.agentTitle || a.createdBy} via {a.provenance.harness ?? "in-process"} for task {a.provenance.taskId ?? "—"} · parents{" "}
                    {a.parentArtifactIds.join(", ") || "none"} · lineage root {a.lineageRoot}
                  </div>
                  {a.evaluation?.checks.map((c) => (
                    <div key={c.id} className="row" style={{ justifyContent: "space-between" }}>
                      <span className="mono">
                        {c.measured ? (c.passed ? "✓" : "✗") : "○"} {c.name} <span className="muted">[{c.source}]</span>
                      </span>
                      <span className="muted">{c.measured ? (c.score == null ? "—" : pct(c.score)) : "not measured"}</span>
                    </div>
                  ))}
                  {a.evaluation && !a.evaluation.fullyMeasured && (
                    <div style={{ color: "var(--danger)" }}>unmeasured: {a.evaluation.unmeasured.join("; ")}</div>
                  )}
                  <pre className="mono" style={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", fontSize: 11 }}>{a.content.slice(0, 1200)}</pre>
                </div>
              </details>
            ))}
          </Card>

          {/* ---------------------------------------------------- what will actually execute */}
          <Card title="Execution policy — what each harness is allowed to do">
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
              The mission&apos;s risk class and boundary become real CLI sandbox flags. MJ never passes
              <span className="mono"> --dangerously-skip-permissions</span>, <span className="mono">--yolo</span> or{" "}
              <span className="mono">danger-full-access</span>.
            </div>
            {(() => {
              const rows = rt.getEvents().filter((e) => e.kind === "HARNESS_SELECTED" && e.data && typeof (e.data as Record<string, unknown>).argv === "object");
              if (!rows.length) return <Empty>Nothing has been dispatched yet.</Empty>;
              const seen = new Set<string>();
              return rows.slice(-6).reverse().map((e) => {
                const d = e.data as { argv: string[]; readOnly: boolean; canWrite: boolean; refused: string | null };
                const key = `${e.seq}`;
                if (seen.has(key)) return null;
                seen.add(key);
                return (
                  <div key={key} style={{ fontSize: 11, borderTop: "1px solid var(--border)", padding: "4px 0" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="mono">{e.policy}</span>
                      <span className="muted">{d.readOnly ? "read-only" : d.canWrite ? "workspace-write" : "no write"}</span>
                    </div>
                    <div className="mono muted" style={{ wordBreak: "break-all" }}>{d.argv.join(" ").slice(0, 220)}</div>
                    <div className="muted">{e.reason.slice(0, 160)}</div>
                    {d.refused && <div style={{ color: "var(--danger)" }}>REFUSED: {d.refused}</div>}
                  </div>
                );
              });
            })()}
          </Card>

          {/* ---------------------------------------------------- repairs + mutations */}
          <div className="grid-2">
            <Card title={`Failures (${failures.length}) and repairs (${repairs.length})`}>
              {!failures.length && <Empty>Nothing has failed on this mission.</Empty>}
              {failures.slice(-8).map((f) => (
                <div key={f.id} style={{ fontSize: 11, borderTop: "1px solid var(--border)", padding: "3px 0" }}>
                  <span className="mono">{f.kind}</span> <span className="muted">{f.severity}</span> — {f.detail.slice(0, 140)}
                </div>
              ))}
              {repairs.slice(-8).map((r) => (
                <div key={r.attemptId} style={{ fontSize: 11, borderTop: "1px solid var(--border)", padding: "3px 0" }}>
                  <span className="mono">{r.strategy}</span> → <span className={r.result === "SUCCESS" ? "" : "muted"}>{r.result}</span>
                  <div className="muted">{r.rationale}</div>
                  {r.changes.length > 0 && <div className="mono">changed: {r.changes.join(", ")}</div>}
                </div>
              ))}
            </Card>

            <Card title={`Organization changes (${mutations.length})`}>
              {!mutations.length && <Empty>The organization has not been restructured on this mission.</Empty>}
              {mutations.map((m) => (
                <div key={m.mutationId} style={{ fontSize: 11, borderTop: "1px solid var(--border)", padding: "3px 0" }}>
                  <span className="mono">v{m.fromGraphVersion}→v{m.toGraphVersion}</span> {m.applied ? "applied" : "REFUSED"} by {m.authority}
                  <div className="muted">{m.reason}</div>
                  {m.policyCheck.failures.length > 0 && <div style={{ color: "var(--danger)" }}>policy: {m.policyCheck.failures.join("; ")}</div>}
                </div>
              ))}
            </Card>
          </div>

          {/* ---------------------------------------------------- checkpoints */}
          <Card title={`Checkpoints (${checkpoints.length})`}>
            {!checkpoints.length && <Empty>No checkpoints yet — one is taken after planning and before every repair.</Empty>}
            {checkpoints.map((c) => (
              <div key={c.checkpointId} className="row" style={{ justifyContent: "space-between", fontSize: 12, borderTop: "1px solid var(--border)", padding: "3px 0" }}>
                <span>
                  <span className="mono muted">v{c.graphVersion}</span> {c.label} <span className="muted">— {c.reason.slice(0, 90)}</span>
                </span>
                <button className="ghost" onClick={() => rollback(c.checkpointId)}>Roll back here</button>
              </div>
            ))}
          </Card>

          {/* ---------------------------------------------------- flight recorder */}
          <Card
            title={`Flight recorder (${events.length} events)`}
            right={
              <span className="row" style={{ gap: 6, alignItems: "center" }}>
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, events.length)}
                  value={scrub ?? Math.max(1, events.length)}
                  onChange={(e) => setScrub(Number(e.target.value))}
                  style={{ width: 160 }}
                />
                <button className="ghost" onClick={() => setScrub(null)}>Live</button>
              </span>
            }
          >
            {scrub != null && (
              <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                Time travel: showing the mission as it stood at event {scrub}. Everything after it is hidden, not deleted.
              </div>
            )}
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              {visibleEvents.slice(-160).map((e) => (
                <div key={e.seq} className="ev-line" style={{ fontSize: 11, borderTop: "1px solid var(--border)", padding: "2px 0" }}>
                  <span className="mono muted">#{e.seq}</span> <span className="mono">{e.kind}</span>{" "}
                  <span className="muted">[{e.actor} · {e.authority} · {e.policy}]</span>
                  <div>{e.reason}</div>
                  {e.evidence.length > 0 && <div className="muted">evidence: {e.evidence.slice(0, 4).join(" | ")}</div>}
                </div>
              ))}
            </div>
          </Card>

          {/* ---------------------------------------------------- score */}
          {score && (
            <Card title="Mission score — six dimensions, never one number">
              <div className="grid-2">
                <div>
                  <Bar label="goal completion" value={score.goalCompletion} />
                  <Bar label="quality" value={score.quality} />
                  <Bar label="tests" value={score.tests} />
                </div>
                <div>
                  <Bar label="security" value={score.security} />
                  <Bar label="cost efficiency" value={score.costEfficiency} />
                  <Bar label="latency efficiency" value={score.latencyEfficiency} />
                </div>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                human interventions: {score.humanInterventions} · regressions: {score.regressionCount}
                {score.unmeasured.length > 0 && <> · <span style={{ color: "var(--danger)" }}>unmeasured: {score.unmeasured.join(", ")}</span></>}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** The mission score is not carried on the mission object; read the last scored transition. */
function lastScore(events: FlightEvent[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if ((e.kind === "MISSION_COMPLETED" || e.kind === "MISSION_FAILED") && e.data && typeof e.data === "object") {
      const d = e.data as Record<string, unknown>;
      const s = d.score as
        | {
            goalCompletion: number;
            quality: number;
            tests: number;
            security: number;
            costEfficiency: number;
            latencyEfficiency: number;
            humanInterventions: number;
            regressionCount: number;
            unmeasured: string[];
          }
        | undefined;
      if (s && typeof s.goalCompletion === "number") return s;
    }
  }
  return null;
}
