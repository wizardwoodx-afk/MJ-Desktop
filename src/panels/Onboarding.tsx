/**
 * §FIRST-RUN ONBOARDING (v11.9.4-Commercial).
 *
 * Built to the 2026 PLG bar: under five steps, smart defaults, sample data so
 * nobody stares at an empty canvas, and a skip path — value first, setup
 * later. One screen, three choices, done:
 *   1. theme (ink default — black ground, smoked-apricot signal)
 *   2. sample team (labelled, hermes-powered so it runs with zero CLIs) or start blank
 *   3. the honest edition line (personal / trial days / pro)
 * Never blocks: "Start blank" is always one click.
 */
import { useState } from "react";
import { loadSavedTeams, saveTeams, type CliAgentTeam } from "../mission/agentTeam";
import { currentEdition, trialDaysLeft } from "../mission/licensing";

const LS_ONBOARDED = "mj.onboarded";

export function onboardingDone(): boolean {
  try {
    return localStorage.getItem(LS_ONBOARDED) === "1";
  } catch {
    return true; // no storage → never nag
  }
}

const SAMPLE_TEAM: CliAgentTeam = {
  id: "team.sample-first-mission",
  name: "Sample — First Mission",
  description: "Labelled sample: planner → coder → reviewer on the in-process harness. Runs with zero external CLIs so your first run is one click.",
  seats: [
    { id: "planner", role: "planner", harness: "hermes", model: null, mayWrite: false, timeoutSecs: 600, maxTurns: 10, instructions: "Break the objective into steps with owners and a done-when for each." },
    { id: "coder", role: "coder", harness: "hermes", model: null, mayWrite: true, timeoutSecs: 900, maxTurns: 25, instructions: "Implement the smallest diff that passes the checks; clean commits." },
    { id: "reviewer", role: "reviewer", harness: "hermes", model: null, mayWrite: false, timeoutSecs: 600, maxTurns: 10, instructions: "Diff-only review against the snapshot; block on correctness." },
  ],
};

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [theme, setTheme] = useState<"ink" | "pitch" | "ivory">("ink");
  const edition = currentEdition();
  const finish = (withSample: boolean) => {
    try {
      localStorage.setItem("mj.editor.prefs", JSON.stringify({ theme }));
      document.documentElement.setAttribute("data-theme", theme);
      if (withSample) {
        const existing = loadSavedTeams();
        if (!existing.some((t) => t.id === SAMPLE_TEAM.id)) saveTeams([SAMPLE_TEAM, ...existing]);
      }
      localStorage.setItem(LS_ONBOARDED, "1");
    } catch {
      /* private mode — still let them in */
    }
    onDone();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99, background: "var(--overlay, rgba(10,10,10,0.86))", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ maxWidth: 560, width: "92%", padding: 24, animation: "vh-node-in 0.34s cubic-bezier(0.2,0.9,0.25,1) both" }}>
        <div className="card-title" style={{ fontSize: 18 }}>Welcome to Vouch Harbor</div>
        <p className="muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
          The workstation that checks whether your agents <em>actually</em> did the work.
          Edition: <strong>{edition}</strong>
          {edition === "trial" ? ` — ${trialDaysLeft()} day(s) of Pro left` : edition === "pro" ? " — licensed" : " — free, noncommercial · Pro unlocks AUTONOMOUS evolution"}
          .
        </p>

        <div className="muted" style={{ marginTop: 14, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Pick a look (default: ink)</div>
        <div className="row" style={{ marginTop: 6 }}>
          {(["ink", "pitch", "ivory"] as const).map((t) => (
            <button key={t} className={t === theme ? "primary" : ""} onClick={() => setTheme(t)}>{t}</button>
          ))}
        </div>

        <div className="muted" style={{ marginTop: 14, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>First run</div>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="primary" onClick={() => finish(true)}>Load the sample team</button>
          <button onClick={() => finish(false)}>Start blank</button>
        </div>
        <p className="muted" style={{ marginTop: 12, fontSize: 11 }}>
          The sample runs on the labelled in-process harness — no API keys, no CLIs, nothing to install. Your first verified mission is one click away.
        </p>
      </div>
    </div>
  );
}
