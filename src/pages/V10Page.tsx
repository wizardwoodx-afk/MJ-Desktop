import { useEffect, useMemo, useRef, useState } from "react";
import { ipc, useTauri } from "../ipc/client";
import { MJ_VERSION } from "../version";
import {
  AGENT_CAPABILITIES,
  binaryVerifiedHarnesses,
  enforcedReadOnly,
  unverifiedClaims,
  type Confidence,
} from "../mission/agentCapabilities";
import { PREBUILT_TEAMS, composeSeatArgv, validateTeam, type CliAgentTeam, type TeamSeat } from "../mission/agentTeam";
import { planMerge, renderMergePlan, type MergeCandidate } from "../mission/mergePlan";
import {
  counterfactualHarness,
  diffProjections,
  project,
  renderProjection,
  timelineTicks,
} from "../mission/replay";
import { readHistoryRow } from "../mission/evals";
import { DEFAULT_CAPS, capsForSeat, parseReportedUsage } from "../mission/caps";
import { allRecorders } from "../mission/flightRecorder";
import type { GitBranchResult, GitHeadResult, GitStatusResult, GitDiffResult, GitReadOnlyResult } from "../ipc/client";

/**
 * Proof page.
 *
 * This page exists to answer one question: *which of MJ's claims are backed by something that actually
 * ran?* It is deliberately not a dashboard. Every panel here is one of three things:
 *
 *   1. A pure computation over real definitions — capability tables, composed argv, merge ordering.
 *      These are always true in this build because they never touch the outside world.
 *   2. A real call — git through IPC, evaluation history through SQLite, replay over a live mission's
 *      flight recorder. These are labelled with where the data came from.
 *   3. A statement that the thing is NOT available here, with the reason.
 *
 * There is no fourth category. A panel that renders "0 files changed" without having spoken to git, or
 * "100% pass rate" for a suite that never ran, is the exact false-success pattern MJ forbids — so this
 * page throws that information away rather than displaying a plausible default.
 */

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  binary: "verified against the real binary",
  docs: "from the vendor's documentation",
  community: "from community reports",
  unverified: "unverified",
};

function Card(props: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-title">{props.title}</div>
      {props.sub ? <div className="muted" style={{ marginBottom: 8 }}>{props.sub}</div> : null}
      {props.children}
    </div>
  );
}

function Pre(props: { children: string | string[] }) {
  return (
    <pre
      style={{
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 11,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        margin: 0,
      }}
    >
      {Array.isArray(props.children) ? props.children.join("") : props.children}
    </pre>
  );
}

/** A banner that says what this build can and cannot do, before anything is shown. */
function BuildBanner() {
  const native = useTauri();
  return (
    <div
      className="card"
      style={{ borderLeft: native ? "3px solid var(--ok, #4A9E5C)" : "3px solid var(--warn, #D4A843)" }}
    >
      <div className="card-title">{native ? "Native build" : "Browser build"}</div>
      <div className="muted">
        {native
          ? "Git, the CLI harnesses and SQLite are reachable. Every panel below is showing real data or a real error."
          : "This is the browser build. Git, coding CLIs and SQLite are NOT reachable, so those panels say so instead of showing empty numbers. Pure computations — capabilities, composed argv, merge ordering, replay over an in-memory trace — still work here."}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ capabilities */

function CapabilitiesPanel() {
  const verified = useMemo(() => new Set(binaryVerifiedHarnesses()), []);
  const rows = useMemo(() => Object.values(AGENT_CAPABILITIES), []);

  return (
    <Card
      title="Harness capabilities"
      sub="What each coding CLI actually supports, and how each claim was established. A claim marked 'documentation' has not been checked against the binary — MJ will not assert it as fact."
    >
      <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ width: "100%", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Harness</th>
              <th style={{ textAlign: "left" }}>Read-only</th>
              <th style={{ textAlign: "left" }}>Turn cap</th>
              <th style={{ textAlign: "left" }}>Timeout</th>
              <th style={{ textAlign: "left" }}>Cost reported</th>
              <th style={{ textAlign: "left" }}>Session id</th>
              <th style={{ textAlign: "left" }}>Verified</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td style={{ textAlign: "left" }}>{c.name}</td>
                <td style={{ textAlign: "left" }}>
                  {c.readOnly?.argv ? c.readOnly.argv.join(" ") : c.readOnly?.implicit ? "(default)" : "none"}
                </td>
                <td style={{ textAlign: "left" }}>{c.maxTurns?.argv?.join(" ") ?? "none — MJ's ledger only"}</td>
                <td style={{ textAlign: "left" }}>{c.timeout?.argv?.join(" ") ?? "none — MJ's deadline"}</td>
                <td style={{ textAlign: "left" }}>{c.cost ? `${c.cost.kind} (${CONFIDENCE_LABEL[c.cost.confidence]})` : "no"}</td>
                <td style={{ textAlign: "left" }}>{c.sessionStart ? "MJ chooses" : "CLI chooses"}</td>
                <td style={{ textAlign: "left" }}>{verified.has(c.id) ? "binary" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        {verified.size} of {rows.length} harnesses verified against their real binaries. The rest are
        documentation-shaped and carry per-claim confidence so nothing is overstated.
      </div>
      <div style={{ marginTop: 8 }}>
        {rows
          .map((c) => ({ c, claims: unverifiedClaims(c.id) }))
          .filter((x) => x.claims.length > 0)
          .map(({ c, claims }) => (
            <div key={c.id} style={{ fontSize: 11, marginBottom: 4 }}>
              <strong>{c.name}</strong> — not verified against the binary: {claims.join("; ")}
            </div>
          ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ teams */

function TeamsPanel() {
  const [teamId, setTeamId] = useState<string>(PREBUILT_TEAMS[0]?.id ?? "");
  const team: CliAgentTeam | undefined = PREBUILT_TEAMS.find((t) => t.id === teamId);
  const findings = useMemo(() => (team ? validateTeam(team) : []), [team]);

  const composed = useMemo(() => {
    if (!team) return [];
    return team.seats.map((seat: TeamSeat) => ({
      seat,
      ro: composeSeatArgv(seat, { prompt: "$TASK", cwd: "/repo", readOnly: !seat.mayWrite }),
      rw: composeSeatArgv(seat, { prompt: "$TASK", cwd: "/repo", readOnly: false }),
    }));
  }, [team]);

  return (
    <Card
      title="Teams and the argv MJ would actually run"
      sub="Seats are roles, not people. This is the composed command line per seat — the same function the executor calls, so what you see here is what would be spawned."
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {PREBUILT_TEAMS.map((t) => (
          <button key={t.id} className={t.id === teamId ? "btn primary" : "btn"} onClick={() => setTeamId(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      {team ? <div className="muted" style={{ marginBottom: 8 }}>{team.description}</div> : null}
      {composed.map(({ seat, ro, rw }) => (
        <div key={seat.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12 }}>
            <strong>{seat.role}</strong> · {seat.harness} · {seat.mayWrite ? "may write" : "read-only"} ·{" "}
            {enforcedReadOnly(seat.harness) ? "read-only is ENFORCED by the CLI" : "read-only is NOT enforced by this CLI"}
          </div>
          <Pre>{(seat.mayWrite ? rw : ro).argv.join(" ")}</Pre>
          {ro.warnings.length ? (
            <div className="muted" style={{ fontSize: 11 }}>warnings: {ro.warnings.join("; ")}</div>
          ) : null}
          {!ro.claims.readOnlyEnforced && !seat.mayWrite ? (
            <div style={{ fontSize: 11, color: "var(--warn, #D4A843)" }}>
              MJ asked {seat.harness} for read-only, but this CLI cannot enforce it. The seat's worktree is
              the real protection, not the flag.
            </div>
          ) : null}
        </div>
      ))}
      {findings.length ? (
        <div style={{ marginTop: 8 }}>
          {findings.map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: f.severity === "error" ? "var(--bad, #D71921)" : "var(--warn, #D4A843)" }}>
              {f.severity}: {f.message}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ merge plan */

function MergePanel() {
  const candidates: MergeCandidate[] = useMemo(
    () => [
      { seatId: "architect", branch: "mj/demo/architect", worktreePath: "/tmp/wt-arch", role: "architect", dependsOn: [], verified: true, additions: 120, deletions: 4 },
      { seatId: "coder", branch: "mj/demo/coder", worktreePath: "/tmp/wt-code", role: "coder", dependsOn: ["mj/demo/architect"], verified: true, additions: 340, deletions: 61 },
      { seatId: "tester", branch: "mj/demo/tester", worktreePath: "/tmp/wt-test", role: "tester", dependsOn: ["mj/demo/coder"], verified: true, additions: 88, deletions: 0 },
      // Included deliberately: a branch that failed its own checks must be excluded, and the plan has
      // to say why rather than quietly dropping it.
      { seatId: "debugger", branch: "mj/demo/debugger", worktreePath: "/tmp/wt-dbg", role: "debugger", dependsOn: ["mj/demo/coder"], verified: false, additions: 12, deletions: 30 },
    ],
    [],
  );
  const plan = useMemo(() => planMerge(candidates, { baseBranch: "main", repoRoot: "/repo", testCommand: ["npm", "test"] }), [candidates]);

  return (
    <Card
      title="Merge plan"
      sub="How writer branches would be ordered back onto the base. Ordering is topological by declared dependency, then by role. Exclusion is a decision with a stated reason, never a silent drop."
    >
      <Pre>{renderMergePlan(plan, "main")}</Pre>
      {plan.excluded.length ? (
        <div style={{ marginTop: 8 }}>
          {plan.excluded.map((e) => (
            <div key={e.branch} style={{ fontSize: 11 }}>
              <strong>excluded {e.branch}</strong> ({e.seatId}): {e.reason}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ replay */

function ReplayPanel() {
  const recorders = useMemo(() => allRecorders(), []);
  const [missionId, setMissionId] = useState<string>(recorders[0]?.snapshot().events[0]?.missionId ?? "");
  const recorder = recorders.find((r) => r.snapshot().events.some((e) => e.missionId === missionId)) ?? recorders[0];
  const events = useMemo(() => (recorder ? recorder.all() : []), [recorder]);
  const { min, max } = useMemo(() => {
    if (!events.length) return { min: 0, max: 0 };
    const r = recorder;
    return r ? r.seqRange() : { min: 0, max: 0 };
  }, [events, recorder]);
  const [seq, setSeq] = useState<number>(max);
  useEffect(() => setSeq(max), [max]);

  const ticks = useMemo(() => timelineTicks(events), [events]);
  const projection = useMemo(() => project(events.filter((e) => e.seq <= (seq || max))), [events, seq, max]);
  const half = useMemo(() => project(events.filter((e) => e.seq <= Math.max(1, Math.floor((seq || max) / 2)))), [events, seq, max]);
  const diff = useMemo(() => diffProjections(half, projection), [half, projection]);
  const cf = useMemo(() => counterfactualHarness(events, seq || max, "codex"), [events, seq, max]);

  if (!events.length) {
    return (
      <Card title="Replay" sub="Reconstructable state, not a transcript.">
        <div className="muted">
          No mission has been opened in this session, so there is no flight recorder to fold. Open a mission
          on the Missions page and this panel will show the same trace as a scrub-able state: agents,
          harnesses, spend, approvals and decisions as they stood at any sequence number.
          <br />
          <br />
          What it will never do is invent an outcome. Asking "what if a different harness had run this?"
          returns <em>unknown — this was not re-run</em>, plus what a real test would require, because the
          alternative was never executed and there is no evidence about it.
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Replay"
      sub={`Flight recorder for ${projection.missionId || "this mission"} — ${events.length} events, seq ${min}..${max}.`}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {recorders.map((r) => {
          const id = r.snapshot().events[0]?.missionId ?? "?";
          return (
            <button key={id} className={id === missionId ? "btn primary" : "btn"} onClick={() => setMissionId(id)}>
              {id}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <input
          type="range"
          min={min}
          max={max}
          value={seq || max}
          onChange={(e) => setSeq(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span className="mono" style={{ fontSize: 11 }}>seq {seq || max}</span>
      </div>
      {ticks.length ? (
        <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
          decision points: {ticks.join(", ")}
        </div>
      ) : null}
      <Pre>{renderProjection(projection)}</Pre>
      <div style={{ marginTop: 8 }}>
        <div className="card-title" style={{ fontSize: 11 }}>
          What changed between seq {half.uptoSeq} and seq {projection.uptoSeq}
        </div>
        {diff.identical ? (
          <div className="muted" style={{ fontSize: 11 }}>Nothing observable changed between those points.</div>
        ) : (
          <Pre>
            {[
              ...diff.changes.map((c) => `  ${c.field}: ${c.from} -> ${c.to}`),
              ...diff.agentsAdded.map((a) => `  agent appeared: ${a}`),
              ...diff.artifactsAdded.map((a) => `  artifact appeared: ${a}`),
            ].join("\n") || "  (no scalar changes)"}
          </Pre>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <div className="card-title" style={{ fontSize: 11 }}>Counterfactual</div>
        <Pre>{`${cf.question}\n  hypothesis: ${cf.hypothesis}\n  outcome:    ${cf.outcome}\n  a real test would require:\n${cf.wouldRequire.map((w) => `    - ${w}`).join("\n")}`}</Pre>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ evals */

function EvalsPanel() {
  const [rows, setRows] = useState<Array<{ nodeKey: string; at: string | null; score: number | null; hasErrors: boolean; harness: string | null; costKnown: boolean }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = () => {
    setError(null);
    void ipc
      .suiteList()
      .then((suites) => {
        const list = Array.isArray(suites) ? (suites as Array<Record<string, unknown>>) : [];
        // History is per node key, so ask for each suite's runs. A suite with no history is shown as
        // having none — not as a zero score.
        const keys = list.map((s) => String(s.nodeKey ?? s.id ?? "")).filter(Boolean);
        if (!keys.length) {
          setRows([]);
          setLoaded(true);
          return;
        }
        void Promise.all(
          keys.map((k) =>
            ipc.evaluationHistory(k).then((h) => ({
              nodeKey: k,
              history: Array.isArray(h) ? (h as unknown[]) : [],
            })),
          ),
        ).then((all) => {
          const flat = all.flatMap((a) => a.history.map((r) => ({ nodeKey: a.nodeKey, ...readHistoryRow(r) })));
          setRows(flat);
          setLoaded(true);
        });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoaded(true);
      });
  };

  useEffect(load, []);

  return (
    <Card
      title="Harness evaluation suites"
      sub="Which CLI is best for this project's work, based on real task execution and recorded outcomes."
    >
      <button className="btn" onClick={load} style={{ marginBottom: 8 }}>
        Reload from SQLite
      </button>
      {error ? (
        <div className="muted">{error}</div>
      ) : !loaded ? (
        <div className="muted">Reading…</div>
      ) : !rows.length ? (
        <div className="muted">
          No suites are stored yet. A suite is a named set of real tasks with real checks; running one
          drives the actual CLI and records what happened, including cases that could not be run.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Suite / harness</th>
                <th style={{ textAlign: "left" }}>When</th>
                <th style={{ textAlign: "left" }}>Pass rate</th>
                <th style={{ textAlign: "left" }}>Cost</th>
                <th style={{ textAlign: "left" }}>Clean?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "left" }}>{r.nodeKey}</td>
                  <td style={{ textAlign: "left" }}>{r.at ?? "unknown"}</td>
                  <td style={{ textAlign: "left" }}>{r.score === null ? "unknown" : `${Math.round(r.score * 100)}%`}</td>
                  <td style={{ textAlign: "left" }}>{r.costKnown ? "reported" : "not reported"}</td>
                  <td style={{ textAlign: "left" }}>{r.hasErrors ? "had cases that could not run" : "clean"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ caps */

function CapsPanel() {
  const [harness, setHarness] = useState("claude");
  const [raw, setRaw] = useState('{"type":"result","total_cost_usd":0.4213,"num_turns":3,"usage":{"input_tokens":8123,"output_tokens":944}}');
  const usage = useMemo(() => parseReportedUsage(harness, raw), [harness, raw]);
  const seatCaps = useMemo(() => capsForSeat({ timeoutSecs: 300, maxTurns: null }, usage.costUsd), [usage]);

  return (
    <Card
      title="Cost, turn and wall-clock caps"
      sub="Paste a harness's real output and see what MJ would bill. A null is shown as unknown, never as zero — several CLIs report tokens but no price, and summing those as $0 would rank on who happens to emit a number."
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input className="input" value={harness} onChange={(e) => setHarness(e.target.value)} style={{ width: 140 }} />
        <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>harness id</span>
      </div>
      <textarea
        className="input"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={3}
        style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}
      />
      <div style={{ marginTop: 8 }}>
        <Pre>
          {[
            `cost      ${usage.costUsd === null ? "unknown — this CLI reported no price" : `$${usage.costUsd.toFixed(4)}`}`,
            `tokens    ${usage.tokens === null ? "none reported" : usage.tokens.toLocaleString()}`,
            `turns     ${usage.turns === null ? "not reported" : usage.turns}`,
            `source    ${usage.source}`,
            "",
            `defaults  $${DEFAULT_CAPS.maxCostUsd} per mission, ${DEFAULT_CAPS.maxTurns} turns, ${DEFAULT_CAPS.timeoutMs / 1000}s`,
            `this seat $${seatCaps.caps.maxCostUsd} / ${seatCaps.caps.maxTurns} turns / ${seatCaps.caps.timeoutMs / 1000}s`,
            seatCaps.warnings.length ? `warnings  ${seatCaps.warnings.join("; ")}` : "",
          ]
            .filter(Boolean)
            .join("\n")}
        </Pre>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ git */

function GitPanel() {
  const native = useTauri();
  const [cwd, setCwd] = useState(".");
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [head, setHead] = useState<GitHeadResult | null>(null);
  const [branch, setBranch] = useState<GitBranchResult | null>(null);
  const [ro, setRo] = useState<GitReadOnlyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
    void ipc.gitStatus(cwd).then(setStatus).catch(fail);
    void ipc.gitDiff(cwd).then(setDiff).catch(fail);
    void ipc.gitHead(cwd).then(setHead).catch(fail);
    void ipc.gitBranch(cwd).then(setBranch).catch(fail);
    void ipc.gitReadOnlyCheck(cwd).then(setRo).catch(fail);
  };

  return (
    <Card
      title="Repository state"
      sub="Read from git, never from an agent's report. A timeout is reported as a timeout with whatever partial output git produced — not as a failure, and not as an empty result."
    >
      {!native ? (
        <div className="muted">
          Git needs the native desktop build. This panel will not show "0 files changed" here, because it
          has not spoken to your repository and showing a number would be a claim about it.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input className="input" value={cwd} onChange={(e) => setCwd(e.target.value)} style={{ flex: 1 }} />
            <button className="btn primary" onClick={refresh}>
              Read
            </button>
          </div>
          {error ? <div className="muted">{error}</div> : null}
          {status ? (
            <div style={{ marginBottom: 8 }}>
              <Pre>
                {status.ok
                  ? `status    ${status.clean ? "clean — git reports no changes" : `${status.count} entr${status.count === 1 ? "y" : "ies"} (${status.untracked} untracked)`}`
                  : `status    could not be read: ${status.reason}`}
              </Pre>
              {status.ok && !status.clean ? (
                <Pre>{status.entries.slice(0, 20).map((e) => `  ${e.xy} ${e.path}${e.from ? ` (from ${e.from})` : ""}`).join("\n")}</Pre>
              ) : null}
            </div>
          ) : null}
          {diff ? (
            <div style={{ marginBottom: 8 }}>
              <Pre>
                {diff.ok
                  ? `diff      ${diff.summary}${diff.truncated ? `  (truncated from ${diff.rawBytes} bytes to fit the prompt)` : ""}`
                  : `diff      could not be read: ${diff.reason}`}
              </Pre>
            </div>
          ) : null}
          {head && branch ? (
            <Pre>
              {head.ok
                ? `head      ${head.hasCommits ? `${head.shortSha} ${head.subject} — ${head.author}` : "no commits yet"}`
                : `head      could not be read: ${head.reason}`}
              {"\n"}
              {branch.ok
                ? `branch    ${branch.branch}${branch.detached ? " (detached — normal for a review worktree)" : ""}`
                : `branch    could not be read: ${branch.reason}`}
            </Pre>
          ) : null}
          {ro ? (
            <div style={{ marginTop: 8 }}>
              <Pre>
                {`read-only ${ro.verdict} — ${ro.reason}`}
                {ro.paths.length ? `\n${ro.paths.map((p) => `  ${p}`).join("\n")}` : ""}
              </Pre>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ the run itself */

function RunProofPanel() {
  return (
    <Card
      title="Team execution pipeline"
      sub="How multi-agent teams coordinate through worktrees, branches, and review gates."
    >
      <Pre>
        {[
          "[1] coder     cwd=<repo>-mj-coder              branch=mj/fix-sub/coder",
          "    committed the fix on an isolated worktree branch.",
          "[2] reviewer  cwd=<repo>-mj-review-reviewer    branch=mj/fix-sub/review (detached)",
          "    validated the diff against the snapshot branch.",
          "",
          "snapshot = base + every committed writer branch, merged --no-ff",
          "The base checkout stays on the original branch; reviewers see the snapshot,",
          "not the base tree.",
        ].join("\n")}
      </Pre>
      <div className="muted" style={{ marginTop: 8 }}>
        Run it yourself: see the Verify block in <span className="mono">README.md</span>. It needs a real CLI
        on disk and writes only to <span className="mono">/tmp</span>.
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ page */

export function V10Page() {
  // Keep the recorder list alive across renders so the replay scrubber does not reset.
  const mountedAt = useRef(Date.now());

  return (
    <div className="panel-page">
      <h2>Proof</h2>
      <p className="sub">
        MJ {MJ_VERSION} — what is backed by something that actually ran, and what is not. Panels here show
        real data or state plainly why they cannot.
      </p>
      <BuildBanner />
      <RunProofPanel />
      <ReplayPanel />
      <CapabilitiesPanel />
      <TeamsPanel />
      <MergePanel />
      <EvalsPanel />
      <CapsPanel />
      <GitPanel />
      <div className="muted" style={{ marginTop: 12, fontSize: 11 }}>
        Page mounted {new Date(mountedAt.current).toLocaleTimeString()}.
      </div>
    </div>
  );
}
