import { useEffect, useState } from "react";
import { ipc, type SecretStatus } from "../ipc/client";
import { toast } from "../panels/Toast";
import { HARNESSES } from "../domain/harness";

const MODELS = [
  { ref: "provider.openai.production", label: "OpenAI", hint: "sk-…", models: ["gpt-4.1", "gpt-4o", "o3"] },
  { ref: "provider.anthropic.production", label: "Anthropic", hint: "sk-ant-…", models: ["claude-sonnet-4", "claude-opus-4"] },
  { ref: "provider.google.production", label: "Google", hint: "AIza…", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  { ref: "provider.openrouter.production", label: "OpenRouter", hint: "sk-or-…", models: ["auto"] },
  { ref: "provider.ollama.local", label: "Ollama (local)", hint: "no key — 127.0.0.1:11434", models: ["llama3.1", "qwen2.5", "mistral"] },
];

/**
 * V7 fix (bug W): "configured" used to mean "some value exists somewhere". Now it says where, so a
 * key held only in RAM is not presented as if it were safely in the OS keychain.
 */
function secretPill(s: SecretStatus | undefined): string {
  if (!s || !s.exists) return "missing";
  switch (s.location) {
    case "keychain":
      return "configured";
    case "memory-only":
      return "in memory only";
    case "browser-localStorage":
      return "browser storage";
    default:
      return "configured";
  }
}

export function ProvidersPage() {
  const [exists, setExists] = useState<Record<string, SecretStatus>>({});
  const [vals, setVals] = useState<Record<string, string>>({});
  const [cli, setCli] = useState<Array<{ id: string; name: string; installed: boolean; invocation?: string }>>([]);
  const [env, setEnv] = useState<Awaited<ReturnType<typeof ipc.cliEnv>> | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const refresh = () => void ipc.secretExists(MODELS.map((m) => m.ref)).then(setExists);

  useEffect(() => {
    refresh();
    void ipc.cliProvidersDetect().then(setCli);
  }, []);

  return (
    <div className="panel-page">
      <h2>Agent harnesses</h2>
      <p className="sub">
        Agent nodes are not Zapier/n8n steps. They spawn a real local coding agent.
        Install Claude Code, Codex, or OpenCode on this laptop. MJ detects them and runs the crew together.
      </p>

      {HARNESSES.filter((h) => h.id !== "llm").map((h) => {
        const found = cli.find((c) => c.id === h.id || h.bins.includes(c.id) || h.bins.includes(c.invocation ?? ""));
        const on = Boolean(found?.installed);
        return (
          <div key={h.id} className="card">
            <div className="card-title">
              {h.name}
              <span className={`pill ${on ? "ok" : "err"}`}>{on ? "on PATH" : "not installed"}</span>
            </div>
            <div className="muted">{h.notes}</div>
            {(() => {
              const hit = env?.bins.find((b) => b.id === h.id);
              if (!hit) return <div className="mono" style={{ marginTop: 8 }}>{h.install}</div>;
              return (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  {hit.installed ? (
                    <div className="mono">
                      {hit.executable}
                      {hit.version ? <span className="muted"> — {hit.version}</span> : null}
                    </div>
                  ) : (
                    <div className="mono" style={{ color: "var(--danger)" }}>
                      `{h.bins[0]}` not found. {h.install}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}

      <div className="row" style={{ margin: "12px 0 20px", gap: 8 }}>
        <button
          onClick={() => {
            void ipc.cliProvidersDetect().then(setCli);
            ipc.cliEnv().then(setEnv).catch(() => setEnv(null));
          }}
        >
          Re-scan PATH
        </button>
        <button onClick={() => setShowSearch((v) => !v)}>
          {showSearch ? "Hide" : "Show"} where MJ looked
        </button>
      </div>

      {showSearch && (
        <div className="card">
          <div className="card-title">PATH resolution</div>
          <div className="muted" style={{ fontSize: 12 }}>
            A packaged desktop app does not inherit your shell&apos;s PATH. MJ also searches the usual
            npm, Homebrew, nvm, volta, fnm, bun, deno and cargo locations, and finally asks your
            login shell. If a CLI works in your terminal but not here, its directory will be missing
            from this list.
          </div>
          {!env && <div className="muted" style={{ marginTop: 8 }}>Diagnostics need the native build — run <span className="mono">npm run tauri dev</span>.</div>}
          {env && (
            <pre className="mono" style={{ fontSize: 11, maxHeight: 220, overflow: "auto", marginTop: 8 }}>
              {env.searched.join("\n")}
            </pre>
          )}
        </div>
      )}

      <h2>Direct LLM keys</h2>
      <p className="sub">Only used when a node’s harness is set to “Direct LLM / Ollama”. Keys never enter the graph JSON.</p>
      {MODELS.map((m) => (
        <div key={m.ref} className="card">
          <div className="card-title">{m.label} <span className={`pill ${exists[m.ref]?.exists ? "ok" : ""}`}>{secretPill(exists[m.ref])}</span></div>
          {exists[m.ref]?.warning ? <p className="muted" style={{ fontSize: 11 }}>{exists[m.ref].warning}</p> : null}
          <div className="muted">{m.models.join(" · ")}</div>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="grow" type="password" placeholder={m.hint} value={vals[m.ref] ?? ""} onChange={(e) => setVals((s) => ({ ...s, [m.ref]: e.target.value }))} />
            <button className="primary" onClick={async () => {
              if (!vals[m.ref] && m.ref !== "provider.ollama.local") return;
              // V7 fix (bug W): "Saved" was shown unconditionally, including when the key landed
              // only in RAM and would be gone at the next restart.
              const r = await ipc.secretSet(m.ref, vals[m.ref] || "local");
              if (r.survivesRestart) toast(r.location === "keychain" ? "Saved to the OS keychain" : "Saved to browser storage");
              else toast(r.warning ?? "Held in memory only — it will be lost when MJ exits", "err");
              setVals((s) => ({ ...s, [m.ref]: "" }));
              refresh();
            }}>Save</button>
            <button className="danger" onClick={async () => { await ipc.secretDelete(m.ref); refresh(); }}>Clear</button>
          </div>
        </div>
      ))}
    </div>
  );
}
