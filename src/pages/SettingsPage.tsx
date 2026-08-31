import { useEffect, useState } from "react";
import { MJ_VERSION } from "../version";
import { getEditorPrefs, saveEditorPrefs, type EditorPrefs } from "../graph/store";
import { ipc } from "../ipc/client";
import { detectHost, detectPlatform } from "../app/desktop";
import { toast } from "../panels/Toast";

type Occupancy = "individual" | "enterprise";

export function SettingsPage() {
  const [prefs, setPrefs] = useState<EditorPrefs>(getEditorPrefs());
  const [info, setInfo] = useState<Record<string, unknown>>({});
  const [size, setSize] = useState<number>(0);
  const [mode, setMode] = useState<Occupancy>(() => {
    try { return (localStorage.getItem("mj.occupancy") as Occupancy) || "individual"; } catch { return "individual"; }
  });

  useEffect(() => {
    void ipc.appInfo().then(setInfo);
    void ipc.dbMaintenance(false).then((r) => setSize((r as { sizeBytes: number }).sizeBytes));
  }, []);

  const apply = (p: EditorPrefs) => {
    setPrefs(p);
    saveEditorPrefs(p);
    document.documentElement.setAttribute("data-theme", p.theme);
  };

  const setOccupancy = (m: Occupancy) => {
    setMode(m);
    try { localStorage.setItem("mj.occupancy", m); } catch { /* */ }
    toast(m === "enterprise" ? "Enterprise: org skills stay token-gated" : "Individual: local skill store");
  };

  return (
    <div className="panel-page">
      <h2>Settings</h2>
      <p className="sub">Host {detectHost()} · {detectPlatform()} · MJ {MJ_VERSION} · ROX spec · Inter / JetBrains Mono</p>

      <div className="card">
        <div className="card-title">Occupancy</div>
        <div className="muted">Enterprise keeps org-shared Hermes skills token-gated. Individual uses the local skill store only.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className={mode === "individual" ? "primary" : ""} onClick={() => setOccupancy("individual")}>Individual</button>
          <button className={mode === "enterprise" ? "primary" : ""} onClick={() => setOccupancy("enterprise")}>Enterprise</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Appearance</div>
        <div className="muted">void · warm dark — graphite · neutral dark — paper · warm light — nothing · Nothing OS dark — nothing-light · Nothing OS chalk — monochrome · stark minimal — cyber-matrix · emerald phosphor — tokyo-night · indigo slate — terminal · phosphor mono — nord · arctic frost — solar · solarized light — hermes · espresso &amp; brass</div>
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 6 }}>
          {(["void", "graphite", "paper", "nothing", "nothing-light", "monochrome", "cyber-matrix", "tokyo-night", "terminal", "nord", "solar", "hermes"] as const).map((t) => (
            <button key={t} className={prefs.theme === t ? "primary" : ""} onClick={() => apply({ ...prefs, theme: t })}>{t}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Editor</div>
        <label className="field">Grid snap (0 = free)
          <input type="number" value={prefs.snap} onChange={(e) => apply({ ...prefs, snap: Number(e.target.value) })} />
        </label>
        <label className="field" style={{ marginTop: 10 }}>Autosave ms (0 = off)
          <input type="number" value={prefs.autosaveMs} onChange={(e) => apply({ ...prefs, autosaveMs: Number(e.target.value) })} />
        </label>
      </div>

      <div className="card">
        <div className="card-title">Vendors</div>
        <div className="muted">Hermes Agent · hermes-agent-self-evolution · official MCP servers. Wrapped over stdio. Never HTTP sidecars.</div>
      </div>

      <div className="card">
        <div className="card-title">Maintenance</div>
        <div className="muted">Local store · {size.toLocaleString()} bytes</div>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={async () => { const r = await ipc.dbMaintenance(true); setSize((r as { sizeBytes: number }).sizeBytes); toast("Compacted"); }}>Compact</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Runtime</div>
        <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(info, null, 2)}</pre>
      </div>
    </div>
  );
}
