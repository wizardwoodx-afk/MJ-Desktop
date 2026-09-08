import { useEffect, useState } from "react";
import { ipc } from "../ipc/client";
import type { ExecutionRecord } from "../domain/types";
import { fmtDuration, fmtUsd } from "../app/id";

export function ExecutionsPage() {
  const [rows, setRows] = useState<ExecutionRecord[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [events, setEvents] = useState<string>("");

  useEffect(() => { void ipc.executionList().then(setRows); }, []);

  return (
    <div className="panel-page">
      <h2>Executions</h2>
      <p className="sub">Every run is persisted. Open a trace to inspect node-level events, tokens, and cost.</p>
      {rows.length === 0 && <p className="muted">No runs yet. Press Run on a workflow.</p>}
      {rows.map((r) => (
        <div key={r.id} className="card">
          <div className="card-title">
            {r.id}
            <span className={`pill ${r.status === "COMPLETED" ? "ok" : r.status === "FAILED" ? "err" : ""}`}>{r.status}</span>
          </div>
          <div className="muted">
            {new Date(r.startedAt).toLocaleString()} · {fmtDuration(r.stats?.durationMs ?? 0)} · {r.stats?.nodesRun ?? 0} nodes · {r.stats?.inputTokens ?? 0}/{r.stats?.outputTokens ?? 0} tok · {fmtUsd(r.stats?.costUsd ?? 0)}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={async () => {
              setOpen(r.id);
              const ev = await ipc.executionEvents(r.id);
              setEvents(ev.map((e) => `${e.ts}  ${e.kind}  ${e.nodeId ?? ""}`).join("\n"));
            }}>Trace</button>
          </div>
          {open === r.id && <pre className="mono" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{events || "no events"}</pre>}
        </div>
      ))}
    </div>
  );
}
