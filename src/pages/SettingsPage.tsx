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
    /* V11.4 — cross-fade the palette change: `.theme-xing` rides on <html> for ~260ms so
     * every surface transitions to the new tokens instead of snapping (see mj.css). */
    const root = document.documentElement;
    if (!root.classList.contains("theme-xing")) {
      root.classList.add("theme-xing");
      window.setTimeout(() => root.classList.remove("theme-xing"), 260);
    }
    root.setAttribute("data-theme", p.theme);
  };

  const setOccupancy = (m: Occupancy) => {
    setMode(m);
    try { localStorage.setItem("mj.occupancy", m); } catch { /* */ }
    toast(m === "enterprise" ? "Enterprise: org skills stay token-gated" : "Individual: local skill store");
  };

  return (
    <div className="panel-page">
      <h2>Settings</h2>
      <p className="sub">Host {detectHost()} · {detectPlatform()} · MJ {MJ_VERSION} · ROX spec · Inter / Space Mono / Doto</p>

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
        <div className="muted">One Inscribed design system, eleven palettes — monochrome canvas, one accent signal, dot-matrix display type. nth · obsidian ground, electro-violet volt + plasma pulse (default) — inscribed · Nothing OS dark, signal red — chalk · the system on paper — carbon · industrial, phosphor green — bone · parchment, terracotta — indigo · slate dark, ice blue — sage · botanical light, forest green — hazard · soot dark, safety yellow — orchid · noir plum, orchid magenta — porcelain · porcelain light, ultraviolet — aurora · deep blue-teal night, ice signal</div>
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 6 }}>
          {(["nth", "inscribed", "chalk", "carbon", "bone", "indigo", "sage", "hazard", "orchid", "porcelain", "aurora"] as const).map((t) => (
            <button key={t} data-t={t} className={"theme-chip" + (prefs.theme === t ? " on primary" : "")} onClick={() => apply({ ...prefs, theme: t })}>
              <span className="tdot" aria-hidden="true"></span>
              {t}
            </button>
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
        <div className="card-title">Bundled runtime</div>
        <div className="muted">MJ's own evolution service + official MCP servers. Launched over stdio. Never HTTP sidecars.</div>
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

      <div className="card" style={{ borderLeft: "3px solid var(--amber)" }}>
        <div className="card-title">License &amp; Copyright</div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          MJ Desktop v{MJ_VERSION} — Copyright © 2024-2026 Sree Harshen / MJ Project. All rights reserved.
          <br /><br />
          This software is <strong>proprietary</strong> and protected by copyright, trademark, and trade secret laws. No license is granted to copy, modify, redistribute, or use this software for commercial purposes or AI/ML training without express written permission from the Owner.
          <br /><br />
          See the <span className="mono">LICENSE</span> file in the repository for full terms. Unauthorized use is strictly prohibited and may be subject to legal action.
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => {
            const licenseText = `MJ Desktop v${MJ_VERSION}\nCopyright (c) 2024-2026 Sree Harshen / MJ Project. All Rights Reserved.\n\nThis software is PROPRIETARY. No license is granted to copy, modify, redistribute, or use for commercial purposes or AI/ML training without express written permission. See LICENSE file for full terms.`;
            navigator.clipboard?.writeText(licenseText);
            toast("License notice copied to clipboard");
          }}>Copy License Notice</button>
        </div>
      </div>
    </div>
  );
}
