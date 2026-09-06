import { useState } from "react";
import { ipc } from "../ipc/client";
import { toast } from "../panels/Toast";

export function BrowserPage() {
  const [url, setUrl] = useState("https://example.com");
  const [session, setSession] = useState<string>("");
  const [log, setLog] = useState("No session. Native Chromium is bundled in the desktop build.");

  return (
    <div className="panel-page">
      <h2>Browser</h2>
      <p className="sub">Headless Chromium for Browser Agent nodes. Metadata IPs and credentialed URLs are blocked. Preview host uses a stub session.</p>
      <div className="row">
        <input className="grow" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="primary" onClick={async () => {
          // V7 fix (bug V): this toasted "Navigated" whatever happened, including when no browser
          // exists and the response was a refusal. The toast now follows the actual result.
          const created = (await ipc.browserSessionCreate()) as { sessionId: string | null; reason?: string };
          if (!created.sessionId) {
            setLog(JSON.stringify(created, null, 2));
            toast(created.reason ?? "No browser is attached in this build", "err");
            return;
          }
          const s = session || created.sessionId;
          setSession(s);
          const r = (await ipc.browserNavigate(s, url)) as { ok?: boolean; notAttached?: boolean; reason?: string };
          setLog(JSON.stringify(r, null, 2));
          if (r.ok === false || r.notAttached) toast(r.reason ?? "Navigation did not happen", "err");
          else toast("Navigated");
        }}>Go</button>
        <button onClick={async () => { if (session) { await ipc.browserSessionClose(session); setSession(""); toast("Closed"); } }}>Close</button>
      </div>
      <div className="card" style={{ marginTop: 16, minHeight: 240 }}>
        <div className="muted">Session {session || "—"}</div>
        <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{log}</pre>
      </div>
    </div>
  );
}
