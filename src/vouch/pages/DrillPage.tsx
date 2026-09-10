/**
 * Vouch Harbor 16.4.0 — THE DRILL door.
 *
 * The product proving itself on real missions: a standard scenario is a
 * fresh REAL git repository with the repository's OWN test command,
 * dispatched through the REAL mission loop (real governance arena, real
 * git, real verification). The seats are the labeled built-in drill seat
 * (the swappable-brain seam); everything else is real. `run_drill` is a
 * governed tool — it pauses at the human gate like every mission.
 */
import { useEffect, useState } from "react";
import { DRILL_SCENARIOS, drillReports, runDrill, type DrillReport } from "../engine/drill";
import { toast } from "../../panels/Toast";

const STATUS_COLOR: Record<string, string> = {
  passed: "#6fbf8f",
  failed: "#c96a5a",
  blocked: "#e8b44a",
};

function ReportRow({ r }: { r: DrillReport }) {
  return (
    <div style={{ border: "1px solid var(--border, #2a2f3a)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ font: "600 12px ui-monospace, monospace" }}>{r.id}</span>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{r.scenarioId}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: STATUS_COLOR[r.status] ?? "#8f9bb0" }}>
          {r.status}
        </span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>
          {r.verifiedSeats}/{r.seatCount} seats verified · cycle {r.cycleNo} · {r.runMs}ms
        </span>
      </div>
      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 5, lineHeight: 1.5 }}>
        mission {r.missionId} · drill receipt {r.receiptId ?? "n/a"} · mission receipt {r.missionReceiptOk ? "signed" : "missing"} · digest {r.digest.slice(0, 24)}…
      </div>
      {r.testTail && (
        <div style={{ font: "11px ui-monospace, monospace", opacity: 0.5, marginTop: 4, whiteSpace: "pre-wrap" }}>
          {r.testTail.slice(-160)}
        </div>
      )}
      {r.repoPath && (
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 3 }}>
          failed-scenario repo kept for forensics: {r.repoPath}
        </div>
      )}
    </div>
  );
}

export function DrillPage() {
  const [, force] = useState(0);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 1500);
    return () => window.clearInterval(t);
  }, []);

  const reports = drillReports();

  const run = async (scenarioId: string) => {
    if (running) return;
    setRunning(scenarioId);
    toast(`Drill ${scenarioId} submitted — it is a mission, so it pauses at the human gate (decide it on the Vouch face or via MCP).`);
    try {
      const r = await runDrill(scenarioId);
      toast(r.ok ? `Drill ${scenarioId} PASSED — vouched.` : `Drill ${scenarioId}: ${r.report ? r.report.status.toUpperCase() : "no report"} — vouched either way.`);
    } finally {
      setRunning(null);
      force((n) => n + 1);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.55, margin: "0 0 12px" }}>
        The drill is the product proving itself on <b>real missions</b>: each scenario is a fresh, real git
        repository whose OWN test command decides the outcome, dispatched through the real mission loop
        (real governance arena, real git, real verification, one cycle receipt, one mission-ledger entry,
        one vouched drill report with an attestation digest). The seats are the <b>labeled built-in
        drill seat</b> — the swappable-brain seam; on a host with real agent CLIs, real crews run real
        missions. The <code>impossible</code> scenario exists to prove the negative: it must come back{" "}
        <b>FAILED</b>, never a fake pass.
      </p>

      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", opacity: 0.7, marginBottom: 8 }}>
        STANDARD SCENARIOS
      </div>
      {DRILL_SCENARIOS.map((sc) => (
        <div key={sc.id} style={{ border: "1px solid var(--border, #2a2f3a)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{sc.id}</span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{sc.label}</span>
            <button className="pill" style={{ marginLeft: "auto", fontSize: 11 }} disabled={running !== null} onClick={() => void run(sc.id)}>
              {running === sc.id ? "running…" : "Run drill (gated)"}
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
            objective: {sc.objective}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", opacity: 0.7, margin: "14px 0 8px" }}>
        DRILL REPORTS ({reports.length})
      </div>
      {reports.length === 0 && (
        <div style={{ fontSize: 12, opacity: 0.5, padding: "8px 2px" }}>
          No drills run yet — the product ships with its own acceptance test. Run one; it is vouched either way.
        </div>
      )}
      {reports.slice(-8).reverse().map((r) => (
        <ReportRow key={r.id} r={r} />
      ))}
    </div>
  );
}
