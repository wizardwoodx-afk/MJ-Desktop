import { useEffect, useMemo, useState } from "react";
import { ipc } from "../ipc/client";
import type { ApprovalRecord, DlqRecord, ExecutionRecord } from "../domain/types";
import { fmtUsd } from "../app/id";
import { toast } from "../panels/Toast";

export function ObservabilityPage() {
  const [runs, setRuns] = useState<ExecutionRecord[]>([]);
  const [appr, setAppr] = useState<ApprovalRecord[]>([]);
  const [dlq, setDlq] = useState<DlqRecord[]>([]);

  const refresh = () => {
    void ipc.executionList().then(setRuns);
    void ipc.approvalList().then((r) => setAppr(r as ApprovalRecord[]));
    void ipc.dlqList().then((r) => setDlq(r as DlqRecord[]));
  };
  useEffect(() => { refresh(); }, []);

  const spend = useMemo(() => runs.reduce((a, r) => a + (r.stats?.costUsd ?? 0), 0), [runs]);
  const tokens = useMemo(() => runs.reduce((a, r) => a + (r.stats?.inputTokens ?? 0) + (r.stats?.outputTokens ?? 0), 0), [runs]);

  return (
    <div className="panel-page">
      <h2>Observability</h2>
      <p className="sub">Token spend, approvals, dead-letter queue, and a lightweight Gantt of recent runs. Native build exports OpenTelemetry.</p>
      <div className="stat-row">
        <div className="stat"><div className="n">{fmtUsd(spend)}</div><div className="l">Estimated spend</div></div>
        <div className="stat"><div className="n">{tokens.toLocaleString()}</div><div className="l">Tokens</div></div>
        <div className="stat"><div className="n">{appr.length}</div><div className="l">Open approvals</div></div>
        <div className="stat"><div className="n">{dlq.length}</div><div className="l">DLQ</div></div>
      </div>

      <h3>Approvals</h3>
      {appr.length === 0 && <p className="muted">Nothing waiting.</p>}
      {appr.map((a) => (
        <div key={a.id} className="card">
          <div className="card-title">{a.summary}</div>
          <div className="muted">{a.nodeKey} · {a.executionId}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={async () => { await ipc.approvalDecide(a.id, "APPROVED"); toast("Approved"); refresh(); }}>Approve</button>
            <button className="danger" onClick={async () => { await ipc.approvalDecide(a.id, "REJECTED"); toast("Rejected"); refresh(); }}>Reject</button>
          </div>
        </div>
      ))}

      <h3>Dead letter</h3>
      {dlq.length === 0 && <p className="muted">Queue empty.</p>}
      {dlq.map((d) => (
        <div key={d.id} className="card">
          <div className="card-title">{d.error}</div>
          <div className="muted">{d.suggestedCause} · {d.candidateFix}</div>
          <button onClick={async () => { await ipc.dlqResolve(d.id); refresh(); }}>Resolve</button>
        </div>
      ))}

      <h3>Recent runs</h3>
      <div className="gantt">
        {runs.slice(0, 12).map((r) => (
          <div key={r.id} className="gantt-row">
            <span className="mono">{r.status}</span>
            <div className="gantt-bar" style={{ width: `${Math.min(100, (r.stats?.durationMs ?? 800) / 80)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
