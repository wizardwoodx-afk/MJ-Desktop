import { useEffect, useState } from "react";
import { ipc } from "../ipc/client";
import type { McpServerEntry } from "../domain/types";
import { VENDORED_MCP_SERVERS, planControlMutation } from "../domain/mcpCatalog";
import { toast } from "../panels/Toast";

export function McpHubPage() {
  const [rows, setRows] = useState<McpServerEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [plan, setPlan] = useState<ReturnType<typeof planControlMutation> | null>(null);
  const refresh = () => void ipc.mcpServerList().then(setRows);

  useEffect(() => { refresh(); }, []);

  return (
    <div className="panel-page">
      <h2>MCP Hub</h2>
      <p className="sub">
        Official servers are vendored and launched over stdio. MJ does not reimplement Filesystem, Git, Memory,
        Sequential Thinking, Time, or GitHub. Control MCP is the only MJ-authored server — mutations are Plan → Apply → Verify. No HTTP sidecar.
      </p>

      <h3 style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>Vendored catalog</h3>
      {VENDORED_MCP_SERVERS.map((s) => (
        <div key={s.id} className="card">
          <div className="card-title">
            {s.name}
            <span className="pill">{s.kind}</span>
            {s.pinned && <span className="pill">pinned</span>}
            {s.authoredByMj ? <span className="pill ok">MJ authored</span> : <span className="pill">official</span>}
          </div>
          <div className="muted">{s.description}</div>
          <div className="muted" style={{ marginTop: 6 }}>{s.vendorPath}</div>
          <div className="mono" style={{ marginTop: 6 }}>{s.command} {s.args.join(" ")}</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button disabled={busy === s.id} onClick={async () => {
              setBusy(s.id);
              const existing = rows.find((r) => r.id === s.id);
              if (!existing) {
                await ipc.mcpServerSave({
                  id: s.id,
                  name: s.name,
                  transport: "stdio",
                  command: s.command,
                  args: s.args,
                  enabled: true,
                  pinned: true,
                });
                await refresh();
              }
              const r = await ipc.mcpConnectTest(s.id);
              setResult(JSON.stringify(r, null, 2));
              setBusy(null);
            }}>Enable + test stdio</button>
          </div>
        </div>
      ))}

      <h3 style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginTop: 24 }}>Control MCP</h3>
      <div className="card">
        <div className="card-title">Plan → Apply → Verify</div>
        <div className="muted">Graph mutations never apply until you accept the plan. Verify re-runs validate_graph.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => {
            const p = planControlMutation("validate_graph", { workflowId: window.__mjActiveWorkflowId ?? "" });
            setPlan(p);
          }}>Plan validate_graph</button>
          {plan && (
            <>
              <button className="primary" onClick={async () => {
                const r = await ipc.controlValidate(String(plan.args.workflowId || window.__mjActiveWorkflowId || ""));
                setResult(JSON.stringify({ applied: plan, verified: r }, null, 2));
                toast("Applied + verified");
                setPlan(null);
              }}>Apply + verify</button>
              <button className="danger" onClick={() => setPlan(null)}>Discard plan</button>
            </>
          )}
        </div>
        {plan && <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{plan.preview}</pre>}
      </div>

      <h3 style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginTop: 24 }}>Registry</h3>
      <div className="row" style={{ marginBottom: 16 }}>
        <button onClick={refresh}>Refresh</button>
      </div>
      {rows.map((s) => (
        <div key={s.id} className="card">
          <div className="card-title">
            {s.name}
            <span className={`pill ${s.config.enabled ? "ok" : ""}`}>{s.state}</span>
            <span className="pill">{s.transport}</span>
          </div>
          <div className="muted">{s.config.command} {(s.config.args ?? []).join(" ")}</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="danger" onClick={async () => { await ipc.mcpServerRemove(s.id); refresh(); }}>Remove</button>
          </div>
        </div>
      ))}
      {result && <pre className="card mono" style={{ whiteSpace: "pre-wrap" }}>{result}</pre>}
    </div>
  );
}
