/**
 * MJ 12.0 — SYSTEM: one configuration door for the engine.
 *
 * Pre-12.0 the app scattered configuration across four destinations
 * (Connectors, Browser, Providers, Settings). They are all "how the engine is
 * configured" — one door, four sections.
 */
import { useState } from "react";
import { McpHubPage } from "./McpPage";
import { BrowserPage } from "./BrowserPage";
import { ProvidersPage } from "./ProvidersPage";
import { SettingsPage } from "./SettingsPage";

const SECTIONS = [
  { id: "prefs", label: "Preferences", Page: SettingsPage },
  { id: "connectors", label: "Connectors", Page: McpHubPage },
  { id: "providers", label: "Providers", Page: ProvidersPage },
  { id: "browser", label: "Browser", Page: BrowserPage },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SystemPage() {
  const [section, setSection] = useState<SectionId>("prefs");
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <div className="panel-page">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {SECTIONS.map((s) => (
          <button key={s.id} className="pill" onClick={() => setSection(s.id)} style={section === s.id ? { borderColor: "var(--accent, #4da3ff)" } : {}}>
            {s.label}
          </button>
        ))}
      </div>
      <active.Page />
    </div>
  );
}
