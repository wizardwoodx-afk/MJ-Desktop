import { useEffect, useReducer } from "react";
import { fmtUsd } from "../app/id";
import { HARNESS_BY_ID, type HarnessId } from "../domain/harness";
import { DEFAULT_STAGNANT_AFTER_MS, globalFleet, type FleetSeatView } from "../mission/fleet";

/**
 * §MISSION CONTROL (v11.9.9).
 *
 * The fleet view of the verified agent factory: live seat state, the per-harness and
 * per-role COST LEDGER (measured CLI reports only — a harness that gives tokens but not
 * dollars is shown as tokens-only, never converted at a guessed price), stagnation
 * alerts, and the unified approval inbox. Everything here is a projection of FleetEvents;
 * there is no state on this page the team runner did not produce.
 */

const STATUS_LABEL: Record<FleetSeatView["status"], string> = {
  queued: "queued",
  running: "running",
  "awaiting-approval": "awaiting approval",
  done: "done",
  failed: "failed",
  stagnant: "STAGNANT",
};

function statusPill(status: FleetSeatView["status"]) {
  const cls = status === "done" ? "ok" : status === "failed" || status === "stagnant" ? "err" : "";
  return <span className={`pill ${cls}`}>{STATUS_LABEL[status]}</span>;
}

function harnessName(id: string): string {
  return HARNESS_BY_ID.get(id as HarnessId)?.name ?? id;
}

export function MissionControlPage() {
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const unsub = globalFleet.subscribe(bump);
    const tick = window.setInterval(bump, 5000); // stagnation needs a clock even with no events
    return () => {
      unsub();
      window.clearInterval(tick);
    };
  }, []);

  const now = Date.now();
  const views = globalFleet.seatViews(now);
  const totals = globalFleet.totals();
  const byHarness = globalFleet.costByHarness();
  const byRole = globalFleet.costByRole();
  const stagnant = views.filter((v) => v.status === "stagnant");
  const inbox = globalFleet.approvalInbox();

  return (
    <div className="panel-page">
      <h2>Mission Control</h2>
      <p className="sub">
        Live fleet state, measured cost ledger, stagnation alerts and the approval inbox — every figure derived from
        fleet events the team runner produced. Run a mission in Teams → Runner and it appears here.
      </p>

      <div className="stat-row">
        <div className="stat"><div className="n">{totals.missions}</div><div className="l">Missions</div></div>
        <div className="stat"><div className="n">{totals.seatRuns}</div><div className="l">Seat runs finished</div></div>
        <div className="stat"><div className="n">{fmtUsd(totals.costUsd)}</div><div className="l">Measured spend</div></div>
        <div className="stat"><div className="n">{totals.tokens.toLocaleString()}</div><div className="l">Tokens reported</div></div>
        <div className="stat"><div className="n">{stagnant.length}</div><div className="l">Stagnant seats</div></div>
        <div className="stat"><div className="n">{inbox.length}</div><div className="l">Open approvals</div></div>
      </div>

      {totals.simulatedRuns > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: -16, marginBottom: 16 }}>
          {totals.simulatedRuns} seat run(s) executed against the labelled local test double — counted in the ledger,
          flagged as simulated, never passed off as a real CLI.
        </p>
      )}

      {stagnant.length > 0 && (
        <div className="card mc-alert" style={{ marginBottom: 14 }}>
          <div className="card-title">Stagnation alert</div>
          {stagnant.map((v) => (
            <div key={v.key} className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              <span className="pill err">stagnant</span> {v.missionId} · seat "{v.seatId}" ({harnessName(v.harness)}) has emitted no event
              since {new Date(v.lastTs).toLocaleTimeString()} — more than {Math.round(DEFAULT_STAGNANT_AFTER_MS / 60000)} min of silence.
            </div>
          ))}
        </div>
      )}

      <h3>Fleet board</h3>
      {views.length === 0 && <p className="muted">No fleet activity yet. The board fills as team missions run.</p>}
      {views.length > 0 && (
        <table className="mc-table">
          <thead>
            <tr>
              <th>Mission</th>
              <th>Seat</th>
              <th>Role</th>
              <th>Harness</th>
              <th>Status</th>
              <th>Last event</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {views.map((v) => (
              <tr key={v.key}>
                <td className="mono">{v.missionId}</td>
                <td>{v.seatId}{v.simulated ? " · sim" : ""}</td>
                <td>{v.role}</td>
                <td>{harnessName(v.harness)}</td>
                <td>{statusPill(v.status)}</td>
                <td className="mono">{new Date(v.lastTs).toLocaleTimeString()}</td>
                <td className="mono">
                  {v.costUsd > 0 ? fmtUsd(v.costUsd) : v.tokensOnly ? "tokens only" : "—"}
                  {v.tokens > 0 ? ` · ${v.tokens.toLocaleString()} tok` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
        <div>
          <h3>Cost ledger — by harness</h3>
          {Object.keys(byHarness).length === 0 && <p className="muted">No measured spend yet.</p>}
          {Object.keys(byHarness).length > 0 && (
            <table className="mc-table">
              <thead>
                <tr><th>Harness</th><th>Runs</th><th>Cost</th><th>Tokens</th></tr>
              </thead>
              <tbody>
                {Object.entries(byHarness).map(([h, r]) => (
                  <tr key={h}>
                    <td>{harnessName(h)}</td>
                    <td>{r.runs}{r.simulatedRuns > 0 ? ` (${r.simulatedRuns} sim)` : ""}</td>
                    <td className="mono">{r.costUsd > 0 ? fmtUsd(r.costUsd) : r.tokensOnly ? "tokens only" : "—"}</td>
                    <td className="mono">{r.tokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h3>Cost ledger — by role</h3>
          {Object.keys(byRole).length === 0 && <p className="muted">No measured spend yet.</p>}
          {Object.keys(byRole).length > 0 && (
            <table className="mc-table">
              <thead>
                <tr><th>Role</th><th>Runs</th><th>Cost</th><th>Tokens</th></tr>
              </thead>
              <tbody>
                {Object.entries(byRole).map(([role, r]) => (
                  <tr key={role}>
                    <td>{role}</td>
                    <td>{r.runs}</td>
                    <td className="mono">{r.costUsd > 0 ? fmtUsd(r.costUsd) : r.tokensOnly ? "tokens only" : "—"}</td>
                    <td className="mono">{r.tokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h3 style={{ marginTop: 22 }}>Approval inbox</h3>
      {inbox.length === 0 && <p className="muted">Nothing waiting on a human.</p>}
      {inbox.map((a) => (
        <div key={a.approvalId} className="card" style={{ marginBottom: 8 }}>
          <div className="card-title">{a.missionId} · seat "{a.seatId}" ({harnessName(a.harness)})</div>
          <div className="muted" style={{ fontSize: 12 }}>requested {new Date(a.since).toLocaleString()}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={() => globalFleet.decideApproval(a.approvalId, "approved")}>Approve</button>
            <button className="danger" onClick={() => globalFleet.decideApproval(a.approvalId, "rejected")}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
