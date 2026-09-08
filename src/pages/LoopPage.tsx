/**
 * MJ 12.0 — the MISSION LOOP page: the engine, one screen.
 *
 * Before 12.0 the app asked its user to live across a lab bench: Teams (17
 * tabs), Evolve (a card zoo over eight stores), Missions, Mission Control,
 * Runs, Observe. This page is the answer to that: ONE surface where the whole
 * agent-work cycle runs as one loop —
 *
 *   COMPOSE  →  DISPATCH  →  COMMUNICATE  →  EXECUTE  →  GATE  →  ADAPT
 *
 * Every section on this page is a live view of the SAME runtime
 * (missionLoop.ts): the crew panel edits the team the loop runs; the channel
 * feed is the loop's communication projected by the engine; the cycle ledger
 * is the loop's history with one signed receipt per cycle and, since 12.0.1,
 * the explicit human feedback panel (1–5 + comment) on every cycle; the
 * decisions card is the human gate on the loop's proposals; the learning
 * strip is the loop's measured adaptation. The page imports the engine module
 * only — one runtime, one API, one screen (navAlign pins the import rule).
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "../panels/Toast";
import { useTauri } from "../ipc/client";
import {
  runMissionLoopCycle,
  decideLoopCandidate,
  loadMissionLoopState,
  subscribeMissionLoop,
  pendingCandidates,
  autonomySnapshot,
  lessonDigest,
  loadCrews,
  persistCrew,
  loopHostDeps,
  loopBusFeed,
  submitHumanFeedback,
  type CliAgentTeam,
  type TeamSeat,
  type InterAgentMessage,
  type CycleHumanFeedback,
  type LoopPhase,
  type TeamEvolutionCandidate,
} from "../mission/missionLoop";
import { MJ_VERSION_SHORT } from "../version";

const PHASES: LoopPhase[] = ["compose", "dispatch", "communicate", "execute", "gate", "adapt"];

const PRESET_OBJECTIVES = [
  "Harden the payment middleware: strict token-bucket rate limiting, proven by the repository's own test suite.",
  "Migrate the auth module to OIDC with refresh-token rotation, verified end to end.",
  "Fix the flaky checkout flow: reproduce, isolate, fix, and prove with a re-run of the failing case.",
  "Add structured audit logging to every write path, gated and receipted.",
];

const ROLES: Array<{ role: TeamSeat["role"]; writer: boolean }> = [
  { role: "planner", writer: true },
  { role: "architect", writer: true },
  { role: "coder", writer: true },
  { role: "synthesizer", writer: true },
  { role: "tester", writer: false },
  { role: "reviewer", writer: false },
  { role: "security", writer: false },
];

const HARNESS_IDS = ["opencode", "claude", "codex", "grok", "gemini", "qwen", "llm", "aider", "goose", "openhands", "kilo", "cline", "cursor"];

function phaseIndex(p: LoopPhase): number {
  return PHASES.indexOf(p);
}

interface CycleFeedbackProps {
  cycle: { missionId: string; cycleNo: number };
  teamId: string | undefined;
  current: CycleHumanFeedback | null;
  onRated: () => void;
}

/** 12.0.1 — the explicit human feedback surface, back in the product: rate a
 *  completed cycle 1–5 with a comment. submitHumanFeedback() is engine API:
 *  the rating queues on every seat that ran and joins the seat's evidence at
 *  the next ADAPT fold (1–2 criticism = weight-2 human evidence, 4–5 arms
 *  praise suppression, 3 neutral). */
function CycleFeedback({ cycle, teamId, current, onRated }: CycleFeedbackProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const submit = () => {
    if (rating === null || !teamId) return;
    const res = submitHumanFeedback({ cycleId: cycle.missionId, teamId, rating, comment: comment.trim() });
    if (res.ok) {
      toast(`Rating ${rating}/5 recorded for cycle #${cycle.cycleNo} — it joins the seats' evidence at the next fold`);
      setRating(null);
      setComment("");
      onRated();
    } else {
      toast(`Feedback not recorded: ${res.error ?? "unknown error"}`);
    }
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
      <span className="muted" style={{ fontSize: 11 }}>
        Your feedback:
      </span>
      {[1, 2, 3, 4, 5].map((r) => (
        <button
          key={r}
          className="pill"
          onClick={() => setRating(r)}
          title={`${r}/5`}
          style={
            rating === r
              ? { borderColor: "var(--accent, #4da3ff)" }
              : rating === null && current?.rating === r
                ? { borderColor: "var(--green, #4caf7d)" }
                : {}
          }
        >
          {r}
        </button>
      ))}
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="why? a comment rides 1–2 ratings into the evidence"
        style={{ fontSize: 11, flex: "1 1 240px", minWidth: 160 }}
      />
      <button className="primary" style={{ fontSize: 11 }} disabled={rating === null || !teamId} onClick={submit}>
        Submit rating
      </button>
      {current && (
        <span className="mono muted" style={{ fontSize: 11 }}>
          recorded: {current.rating}/5{current.comment ? ` — "${current.comment.slice(0, 72)}"` : ""}
        </span>
      )}
    </div>
  );
}

export function LoopPage() {
  const native = useTauri();
  const [teams, setTeams] = useState<CliAgentTeam[]>(() => loadCrews());
  const [teamId, setTeamId] = useState<string>(() => teams[0]?.id ?? "team.balanced");
  const team = useMemo(() => teams.find((t) => t.id === teamId) ?? teams[0], [teams, teamId]);

  const [objective, setObjective] = useState(PRESET_OBJECTIVES[0]);
  const [repoRoot, setRepoRoot] = useState("/home/user/workspace/app");
  const [baseBranch, setBaseBranch] = useState("main");
  const [testCmd, setTestCmd] = useState("npm test");
  const [budget, setBudget] = useState("5");
  const [mode, setMode] = useState<"SUGGEST" | "AUTONOMOUS" | "OFF">("SUGGEST");

  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<LoopPhase>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [loopState, setLoopState] = useState(() => loadMissionLoopState());
  const [candidates, setCandidates] = useState<TeamEvolutionCandidate[]>(() => pendingCandidates(team?.id ?? ""));
  const [messages, setMessages] = useState<InterAgentMessage[]>(() => loopBusFeed().messages);
  const [channel, setChannel] = useState("#all");

  useEffect(() => subscribeMissionLoop(() => setLoopState(loadMissionLoopState())), []);
  useEffect(() => loopBusFeed().subscribe((m) => setMessages((prev) => [...prev.slice(-240), m])), []);
  useEffect(() => {
    setCandidates(pendingCandidates(team?.id ?? ""));
  }, [team?.id, loopState]);

  const addLog = (line: string) => setLog((prev) => [...prev.slice(-40), line]);
  const refresh = () => {
    setLoopState(loadMissionLoopState());
    setCandidates(pendingCandidates(team?.id ?? ""));
  };

  const runCycle = async (count = 1) => {
    if (!team) return;
    setRunning(true);
    setPhase("compose");
    setLog([]);
    for (let i = 0; i < count; i++) {
      const res = await runMissionLoopCycle({
        team,
        objective,
        repoRoot: repoRoot.trim() || ".",
        baseBranch: baseBranch.trim() || "main",
        testCommand: testCmd.trim().split(/\s+/),
        budgetCapUsd: Number(budget) || 5,
        mode,
        deps: loopHostDeps({ testCommand: testCmd }),
        emit: (ev) => {
          if (ev.phase) setPhase(ev.phase);
          if (ev.note) addLog(ev.note);
        },
      });
      if (res.record.status === "aborted") {
        toast(`Cycle ${res.record.cycleNo} aborted: ${res.record.note.slice(0, 140)}`);
        setPhase("idle");
        setRunning(false);
        refresh();
        return;
      }
      addLog(
        `cycle ${res.record.cycleNo}: ${res.record.status} · gate ${res.record.gate?.status ?? "n/a"} · ${res.record.verifiedSeats}/${res.record.seatCount} verified · receipt ${res.record.receipt?.ok ? "signed" : "MISSING"}`,
      );
    }
    setRunning(false);
    setPhase("idle");
    refresh();
    toast("Loop cycle complete — see the ledger below");
  };

  const decide = (c: TeamEvolutionCandidate, decision: "ACCEPTED" | "REJECTED") => {
    if (!team) return;
    const res = decideLoopCandidate({ team, candidateId: c.id, decision, by: "human:loop-page" });
    if (res.updatedTeam) {
      setTeams(persistCrew(teams, { ...res.updatedTeam, updatedAt: new Date().toISOString() }));
      toast(`Approved — seat ${c.seatId} instructions updated to the learned revision`);
    } else {
      toast(`Rejected candidate ${c.id.slice(-8)} — recorded, team untouched`);
    }
    refresh();
  };

  /* crew editor (compose) */
  const [draftSeats, setDraftSeats] = useState<TeamSeat[]>([]);
  useEffect(() => {
    setDraftSeats((team?.seats ?? []).map((s) => ({ ...s, instructions: s.instructions ?? "" })));
  }, [team]);
  const patchSeat = (id: string, patch: Partial<TeamSeat>) => {
    setDraftSeats((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const saveCrew = () => {
    if (!team) return;
    const updated: CliAgentTeam = { ...team, seats: draftSeats, updatedAt: new Date().toISOString(), revision: (team.revision ?? 1) + 1 };
    setTeams(persistCrew(teams, updated));
    toast("Crew saved — the next loop cycle runs this composition");
  };

  const visibleMessages = useMemo(
    () => (channel === "#all" ? messages.slice(-80) : messages.filter((m) => m.channel === channel).slice(-80)),
    [messages, channel],
  );
  const channels = useMemo(() => Array.from(new Set(messages.map((m) => m.channel))).slice(-8), [messages]);

  const bandit = autonomySnapshot().bandit;
  const armRows = useMemo(
    () =>
      Object.entries(bandit.arms ?? {})
        .sort((a, b) => b[1].pulls - a[1].pulls)
        .slice(0, 4),
    [bandit],
  );
  const lessons = useMemo(() => lessonDigest(4), [loopState]);
  const autonomyLog = autonomySnapshot().log;

  const cycles = loopState.cycles.slice(-12).reverse();
  const pending = candidates.filter((c) => c.status === "PROPOSED" && c.teamId === team?.id);

  const cell: React.CSSProperties = { padding: "6px 8px", fontSize: 12 };
  const phaseChip = (p: LoopPhase, label: string) => {
    const idx = phaseIndex(p);
    const cur = phaseIndex(phase);
    const done = cur > idx || (running && cur === idx && p === phase);
    return (
      <span
        key={p}
        style={{
          ...cell,
          border: "1px solid var(--border, #333)",
          borderRadius: 6,
          color: p === phase && running ? "var(--accent, #4da3ff)" : done ? "var(--green, #4caf7d)" : "var(--text-mute, #888)",
          fontWeight: p === phase && running ? 700 : 400,
        }}
      >
        {done ? "✓ " : ""}
        {label}
      </span>
    );
  };

  return (
    <div className="panel-page" style={{ maxWidth: 1180 }}>
      {/* ── hero: what the product is ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>Mission Loop</h2>
          <p className="sub" style={{ marginTop: 0 }}>
            The engine: one crew, one cycle — dispatch, channels, gates, feedback, adaptation, receipts. MJ {MJ_VERSION_SHORT} · One Engine
            {native ? "" : " · browser host (simulated seats)"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PHASES.map((p) => phaseChip(p, p.toUpperCase()))}
        </div>
      </div>

      {/* ── run deck ──────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">Run the loop</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {PRESET_OBJECTIVES.map((o) => (
            <button key={o.slice(0, 24)} className="pill" onClick={() => setObjective(o)} style={objective === o ? { borderColor: "var(--accent, #4da3ff)" } : {}}>
              {o.slice(0, 44)}…
            </button>
          ))}
        </div>
        <textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} style={{ width: "100%" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, margin: "10px 0" }}>
          <label className="muted" style={{ fontSize: 11 }}>
            CREW
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.seats.length} seats)
                </option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ fontSize: 11 }}>
            REPO ROOT
            <input value={repoRoot} onChange={(e) => setRepoRoot(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <label className="muted" style={{ fontSize: 11 }}>
            BASE BRANCH
            <input value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <label className="muted" style={{ fontSize: 11 }}>
            TEST COMMAND
            <input value={testCmd} onChange={(e) => setTestCmd(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <label className="muted" style={{ fontSize: 11 }}>
            MODE
            <select value={mode} onChange={(e) => setMode(e.target.value as "SUGGEST" | "AUTONOMOUS" | "OFF")} style={{ display: "block", width: "100%", marginTop: 4 }}>
              <option value="SUGGEST">SUGGEST — human approves every change</option>
              <option value="AUTONOMOUS">AUTONOMOUS — apply passing proposals (Pro)</option>
              <option value="OFF">OFF — telemetry only</option>
            </select>
          </label>
          <label className="muted" style={{ fontSize: 11 }}>
            BUDGET $/CYCLE
            <input value={budget} onChange={(e) => setBudget(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="primary" disabled={running} onClick={() => void runCycle(1)}>
            {running ? `running… ${phase}` : "▶ Run one cycle"}
          </button>
          <button className="primary" disabled={running} onClick={() => void runCycle(3)} style={{ opacity: 0.9 }}>
            Run loop (3 cycles)
          </button>
          {running && <span className="muted mono">{log[log.length - 1] ?? ""}</span>}
        </div>
        {!native && (
          <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
            Browser host: seats execute through the high-fidelity simulation; install the desktop app for real CLI harnesses and native git.
          </div>
        )}
      </div>

      {/* ── crew + communication ──────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,5fr) minmax(0,7fr)", gap: 12, marginTop: 12 }} className="loop-split">
        <div className="card">
          <div className="card-title">Crew — {team?.name}</div>
          {draftSeats.map((s) => (
            <div key={s.id} style={{ borderBottom: "1px solid var(--border, #222)", padding: "6px 0" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 12, width: 90 }}>
                  {s.role}
                </span>
                <select value={s.harness} onChange={(e) => patchSeat(s.id, { harness: e.target.value as TeamSeat["harness"] })} style={{ fontSize: 11 }}>
                  {HARNESS_IDS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="checkbox" checked={Boolean(s.mayWrite)} onChange={(e) => patchSeat(s.id, { mayWrite: e.target.checked })} /> write
                </label>
                <button
                  style={{ marginLeft: "auto", fontSize: 11 }}
                  onClick={() => setDraftSeats((prev) => prev.filter((x) => x.id !== s.id))}
                  disabled={draftSeats.length <= 1}
                >
                  ✕
                </button>
              </div>
              <textarea
                value={s.instructions ?? ""}
                onChange={(e) => patchSeat(s.id, { instructions: e.target.value })}
                rows={2}
                style={{ width: "100%", marginTop: 4, fontSize: 11 }}
              />
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button
              style={{ fontSize: 11 }}
              onClick={() => {
                const nextRole = ROLES.find((r) => !draftSeats.some((s) => s.role === r.role))?.role ?? "coder";
                setDraftSeats((prev) => [
                  ...prev,
                  { id: `seat.${nextRole}.${Date.now().toString(36).slice(-4)}`, role: nextRole, harness: "opencode", model: null, mayWrite: true, timeoutSecs: 600, maxTurns: null, instructions: "" },
                ]);
              }}
            >
              + seat
            </button>
            <button className="primary" style={{ fontSize: 11, marginLeft: "auto" }} onClick={saveCrew}>
              Save crew
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Communication — inter-agent bus
            <span className="mono muted" style={{ fontSize: 11 }}>
              {messages.length} msgs
            </span>
            <span style={{ flex: 1 }} />
            {["#all", ...channels.filter((c) => c !== "#all")].map((ch) => (
              <button key={ch} className="pill" onClick={() => setChannel(ch)} style={channel === ch ? { borderColor: "var(--accent, #4da3ff)" } : {}}>
                {ch}
              </button>
            ))}
          </div>
          <div style={{ maxHeight: 330, overflowY: "auto", fontSize: 12 }}>
            {visibleMessages.map((m) => (
              <div key={m.id} style={{ borderBottom: "1px solid var(--border, #1c1c1c)", padding: "4px 2px", display: "flex", gap: 8 }}>
                <span className="mono muted" style={{ minWidth: 118 }}>
                  {m.channel}
                </span>
                <span className="mono" style={{ minWidth: 132 }}>
                  {m.sender.role}:{m.sender.name}
                </span>
                <span style={{ color: "var(--text-mute, #999)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.content}</span>
              </div>
            ))}
            {visibleMessages.length === 0 && <div className="muted">Quiet — run a cycle and the loop's dispatches and seat traffic land here.</div>}
          </div>
        </div>
      </div>

      {/* ── human gate: the loop's proposals ───────────────────────────────── */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">Human gate — proposals from the loop's measured evidence</div>
        {pending.length === 0 && <div className="muted">No pending proposals. The loop proposes a seat change only after measured failures meet the evidence bar.</div>}
        {pending.map((c) => (
          <div key={c.id} style={{ border: "1px solid var(--border, #333)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="mono" style={{ fontSize: 12 }}>
                seat {c.seatId} ({c.role} · {c.harness})
              </span>
              <span className="pill">{c.trigger}</span>
              <span className="muted" style={{ fontSize: 11 }}>
                {c.evidence.length} evidence items · baseline score {c.baselineScore}
              </span>
              <span style={{ flex: 1 }} />
              <button className="primary" onClick={() => decide(c, "ACCEPTED")}>
                Approve
              </button>
              <button className="danger" onClick={() => decide(c, "REJECTED")}>
                Reject
              </button>
            </div>
            <div className="mono muted" style={{ fontSize: 11, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 90, overflowY: "auto" }}>
              {c.evidence.slice(0, 3).map((e) => `• ${e.text}`).join("\n")}
            </div>
          </div>
        ))}
      </div>

      {/* ── cycle ledger ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">Cycle ledger — one signed receipt per cycle</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          Rate any cycle: 1–2 joins the seat's failure evidence (weight 2) · 4–5 arms praise suppression (no new candidates for 3 runs) · 3 is neutral — a rating queues on every seat that ran, and the human gate still decides.
        </div>
        {cycles.length === 0 && <div className="muted">No cycles yet. Run the loop above — every cycle is recorded here with its gate verdict and receipt.</div>}
        {cycles.map((c) => (
          <div key={c.missionId} style={{ borderBottom: "1px solid var(--border, #222)", padding: "8px 0", fontSize: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="mono">#{c.cycleNo}</span>
              <span className={`pill ${c.status === "completed" ? "" : "danger"}`}>{c.status}</span>
              <span className={`pill ${c.gate?.status === "PASS" ? "" : c.gate?.status === "FAIL" || c.gate?.status === "BLOCKED" ? "danger" : ""}`}>
                gate {c.gate?.status ?? "n/a"} {c.gate?.tier ?? ""}
              </span>
              <span className="muted">
                {c.verifiedSeats}/{c.seatCount} verified · ${c.spentUsd.toFixed(4)}
              </span>
              <span className="mono muted">{c.arms.join(", ")}</span>
              <span style={{ flex: 1 }} />
              <span className="mono" title={c.receipt?.hash ?? "no receipt"}>
                {c.receipt?.ok ? "✓ signed" : "✗ MISSING"}
              </span>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              {c.seats.map((s) => `${s.role}:${s.outcome}${s.verified ? "✓" : ""}`).join(" · ")}
            </div>
            <CycleFeedback cycle={c} teamId={team?.id} current={loopState.feedbackByCycle[c.missionId] ?? null} onRated={refresh} />
          </div>
        ))}
      </div>

      {/* ── learning strip ────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-title">Adaptation — what the loop learned (measured)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 11 }}>
              BANDIT ARMS BY PULLS
            </div>
            {armRows.map(([arm, st]) => (
              <div key={arm} className="mono" style={{ fontSize: 12 }}>
                {arm} — pulls {st.pulls} (α{st.alpha} β{st.beta})
              </div>
            ))}
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11 }}>
              ELASTIC / AUTONOMY (last)
            </div>
            {autonomyLog.length > 0 ? (
              <div className="mono" style={{ fontSize: 12 }}>
                {autonomyLog[autonomyLog.length - 1].action.kind} · applied={String(autonomyLog[autonomyLog.length - 1].applied)}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                no settlements yet
              </div>
            )}
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11 }}>
              LESSON MEMORY (recent)
            </div>
            {lessons.map((l) => (
              <div key={l.id} className="mono" style={{ fontSize: 11, marginBottom: 4 }}>
                [{l.kind}] {l.text.slice(0, 110)}
              </div>
            ))}
            {lessons.length === 0 && <div className="muted" style={{ fontSize: 12 }}>empty — verified cycles write lessons here</div>}
          </div>
        </div>
        <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>
          One engine · one ledger · one signed receipt per cycle · human gate on every change · <span className="mono">MJ {MJ_VERSION_SHORT}</span>
        </div>
      </div>
    </div>
  );
}
