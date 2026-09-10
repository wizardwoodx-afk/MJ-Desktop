import { useEffect, useState } from "react";
import { VH_VERSION } from "../version";
import { getEditorPrefs, saveEditorPrefs, type EditorPrefs } from "../graph/store";
import { ipc } from "../ipc/client";
import { detectHost, detectPlatform } from "../app/desktop";
import { toast } from "../panels/Toast";
import { currentEdition, rememberLicense, trialDaysLeft, verifyLicenseKey } from "../mission/licensing";

type Occupancy = "individual" | "enterprise";

export function SettingsPage() {
  const [prefs, setPrefs] = useState<EditorPrefs>(getEditorPrefs());
  const [info, setInfo] = useState<Record<string, unknown>>({});
  const [size, setSize] = useState<number>(0);
  const [mode, setMode] = useState<Occupancy>(() => {
    try { return (localStorage.getItem("mj.occupancy") as Occupancy) || "individual"; } catch { return "individual"; }
  });
  const [licKey, setLicKey] = useState("");
  const [licMsg, setLicMsg] = useState<string | null>(null);
  const edition = currentEdition();

  useEffect(() => {
    void ipc.appInfo().then(setInfo);
    void ipc.dbMaintenance(false).then((r) => setSize((r as { sizeBytes: number }).sizeBytes));
  }, []);

  const apply = (p: EditorPrefs) => {
    setPrefs(p);
    saveEditorPrefs(p);
    /* V11.4 — cross-fade the palette change: `.theme-xing` rides on <html> for ~260ms so
     * every surface transitions to the new tokens instead of snapping (see vouch.css). */
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
      <p className="sub">Host {detectHost()} · {detectPlatform()} · Vouch Harbor {VH_VERSION} · ROX spec · Inter / Space Mono / Doto</p>

      <div className="card">
        <div className="card-title">Occupancy</div>
        <div className="muted">Enterprise keeps org-shared Hermes skills token-gated. Individual uses the local skill store only.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className={mode === "individual" ? "primary" : ""} onClick={() => setOccupancy("individual")}>Individual</button>
          <button className={mode === "enterprise" ? "primary" : ""} onClick={() => setOccupancy("enterprise")}>Enterprise</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">License <span className={`pill ${edition === "pro" ? "ok" : ""}`}>{edition}</span></div>
        <div className="muted">
          personal · free forever, noncommercial — trial · 14 days of Pro from first launch — pro · signed key,
          unlocks AUTONOMOUS evolution + elastic caps above 5 seats. Verification is offline; local-first stays local-first.
          {edition === "trial" ? ` ${trialDaysLeft()} day(s) left.` : ""}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            type="text"
            value={licKey}
            onChange={(e) => setLicKey(e.target.value)}
            placeholder="paste a Pro key (issued by founder tooling)"
            style={{ width: 380 }}
          />
          <button className="primary" onClick={async () => {
            const r = await verifyLicenseKey(licKey.trim());
            if (r.ok) {
              rememberLicense(r.payload);
              setLicMsg(`activated for ${r.payload.org}${r.payload.expires ? ` until ${r.payload.expires.slice(0, 10)}` : " (perpetual)"}`);
              toast("Vouch Harbor Pro activated");
            } else {
              setLicMsg(`rejected: ${r.reason}`);
            }
          }}>Activate</button>
        </div>
        {licMsg && <div className="muted" style={{ marginTop: 6 }}>{licMsg}</div>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Appearance</div>
        <div className="muted">True-black ground with rare, unsaturated mineral signals — no gold, no violet, no neon. ink · black, parchment ink, smoked-apricot signal — the flagship (default) — pitch · OLED black, dusty-rose signal — slag · graphite black, whetstone signal — fern · black-green, seedpod-olive signal — ivory · warm paper light, copper signal — travertine · warm stone light, bronze-olive signal</div>
        <div className="theme-options" role="listbox" aria-label="Theme">
          {([
            { id: "ink", name: "Ink", desc: "black · smoked apricot" },
            { id: "pitch", name: "Pitch", desc: "OLED black · dusty rose" },
            { id: "slag", name: "Slag", desc: "graphite · whetstone" },
            { id: "fern", name: "Fern", desc: "black-green · seedpod olive" },
            { id: "ivory", name: "Ivory", desc: "paper light · copper" },
            { id: "travertine", name: "Travertine", desc: "stone light · bronze-olive" },
          ] as const).map((t) => (
            <button key={t.id} data-t={t.id} role="option" aria-selected={prefs.theme === t.id}
              className={"theme-opt" + (prefs.theme === t.id ? " on" : "")}
              onClick={() => apply({ ...prefs, theme: t.id })}>
              <span className="swatch" aria-hidden="true"><i className="sw-ground" /><i className="sw-signal" /></span>
              <span className="theme-name">{t.name}</span>
              <span className="theme-desc">{t.desc}</span>
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
        <div className="muted">The built-in evolution service + official MCP servers. Launched over stdio. Never HTTP sidecars.</div>
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
          Vouch Harbor v{VH_VERSION} — Copyright © 2024-2026 Sree Harshen / Vouch Harbor. All rights reserved.
          <br /><br />
          This software is <strong>proprietary</strong> and protected by copyright, trademark, and trade secret laws. No license is granted to copy, modify, redistribute, or use this software for commercial purposes or AI/ML training without express written permission from the Owner.
          <br /><br />
          See the <span className="mono">LICENSE</span> file in the repository for full terms. Unauthorized use is strictly prohibited and may be subject to legal action.
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => {
            const licenseText = `Vouch Harbor v${VH_VERSION}\nCopyright (c) 2024-2026 Sree Harshen / Vouch Harbor. All Rights Reserved.\n\nThis software is PROPRIETARY. No license is granted to copy, modify, redistribute, or use for commercial purposes or AI/ML training without express written permission. See LICENSE file for full terms.`;
            navigator.clipboard?.writeText(licenseText);
            toast("License notice copied to clipboard");
          }}>Copy License Notice</button>
        </div>
      </div>
    </div>
  );
}
