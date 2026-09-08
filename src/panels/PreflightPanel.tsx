/**
 * §PREFLIGHT PANEL — the lint surface (MJ 11.9.5).
 *
 * Lists every issue the graph linter found, most severe first; each row is a jump-to-node.
 * The RUN gate itself stays on graph/validation.ts (the engine contract); this panel is the
 * human-facing layer that also surfaces warns (orphans, unprovisioned agents) the gate ignores.
 */
import { useMemo } from "react";
import { lintGraph, lintVerdict, type LintSeverity } from "../graph/lint";
import { useGraphStore } from "../graph/store";

const ORDER: Record<LintSeverity, number> = { error: 0, warn: 1, info: 2 };
const MARK: Record<LintSeverity, string> = { error: "✕", warn: "▲", info: "·" };

export function PreflightPanel({ onClose }: { onClose: () => void }) {
  const graph = useGraphStore((s) => s.graph);
  const issues = useMemo(() => lintGraph(graph).sort((a, b) => ORDER[a.severity] - ORDER[b.severity]), [graph]);
  const v = lintVerdict(issues);

  return (
    <div className="preflight-panel">
      <div className="preflight-head">
        <span className="card-title">Preflight</span>
        <span className="pill">{issues.length === 0 ? "clean" : `${v.errors} err · ${v.warnings} warn`}</span>
        <span className="push" />
        <button className="ghost" onClick={onClose} title="Close">✕</button>
      </div>
      <div className="preflight-list">
        {issues.length === 0 && <div className="muted" style={{ padding: 12 }}>No issues. The graph is shaped like it means it.</div>}
        {issues.map((i, idx) => (
          <div
            key={`${i.code}-${idx}`}
            className={`preflight-row ${i.severity} ${i.nodeId ? "jump" : ""}`}
            onClick={() => {
              if (i.nodeId) {
                useGraphStore.getState().selectNode(i.nodeId);
                window.__mjCanvas?.focusNode(i.nodeId);
              }
            }}
          >
            <span className={`mark ${i.severity}`}>{MARK[i.severity]}</span>
            <span className="code">{i.code}</span>
            <span className="msg">{i.message}</span>
          </div>
        ))}
      </div>
      <div className="preflight-foot muted">
        errors refuse the run · warnings never do · pure static analysis, nothing was executed
      </div>
    </div>
  );
}
