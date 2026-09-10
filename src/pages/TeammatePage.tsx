import { useEffect, useRef, useState } from "react";
import {
  BOT_NAME,
  exportTeammateMemoryMarkdown,
  newTeammateThread,
  rateTeammateRun,
  removeTeammateFact,
  removeTeammatePreference,
  removeTeammateSkill,
  resolveTeammateApproval,
  sendTeammateMessage,
  setActiveTeammateThread,
  setTeammateMode,
  setTeammatePersona,
  stopTeammate,
  subscribeTeammate,
  teammateBrain,
  teammateReceiptJsonl,
  teammateSession,
  teammateWorkspaceFiles,
  verifyTeammateReceipt,
  type TeammateMessage,
  type TeammateMode,
  type TeammatePersona,
  type TeammateSession,
  type TeammateTraceStep,
} from "../mission/teammate";

/* ── mini markdown → React nodes (no deps, no innerHTML) ─────────────────── */
function inline(s: string, key: number): (string | JSX.Element)[] {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const k = `${key}-${i}`;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={k}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={k} className="tm-code">{p.slice(1, -1)}</code>;
    return p;
  });
}

function renderMiniMd(text: string): JSX.Element {
  const lines = text.split("\n");
  const out: JSX.Element[] = [];
  let i = 0;
  let li = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i += 1;
      out.push(<pre key={`pre-${li++}`} className="tm-pre">{buf.join("\n")}</pre>);
      continue;
    }
    if (ln.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      out.push(<ul key={`ul-${li++}`} className="tm-ul">{items.map((it, j) => <li key={j}>{inline(it, j)}</li>)}</ul>);
      continue;
    }
    if (ln.startsWith("## ")) {
      out.push(<div key={`h-${li++}`} className="tm-h">{ln.slice(3)}</div>);
      i += 1;
      continue;
    }
    if (ln.trim() === "") {
      i += 1;
      continue;
    }
    out.push(<p key={`p-${li++}`} className="tm-p">{inline(ln, i)}</p>);
    i += 1;
  }
  return <>{out}</>;
}

/* ── trace steps (the Vouch Cycle, rendered honestly) ─────────────────────── */
function TraceStepView({ s, onApprove }: { s: TeammateTraceStep; onApprove: (id: string, ok: boolean) => void }): JSX.Element {
  const argStr = (a: Record<string, unknown>): string => {
    try {
      const t = JSON.stringify(a);
      return t.length > 90 ? `${t.slice(0, 90)}…` : t;
    } catch {
      return "";
    }
  };
  if (s.kind === "route") {
    return (
      <div className="tm-step">
        <span className={`tm-tag ${s.path === "slow" ? "tm-tag-slow" : "tm-tag-fast"}`}>{s.path.toUpperCase()}</span>
        <span className="tm-step-body tm-muted">{s.reasons.join(" · ")}</span>
      </div>
    );
  }
  if (s.kind === "recall") {
    return (
      <div className="tm-step">
        <span className="tm-tag tm-tag-recall">RECALL</span>
        <span className="tm-step-body tm-muted">{s.facts} facts · {s.preferences} preferences applied · {s.skills} skills in play</span>
      </div>
    );
  }
  if (s.kind === "thought") {
    return <div className="tm-step"><span className="tm-tag tm-tag-think">THOUGHT</span><span className="tm-step-body">{s.text}</span></div>;
  }
  if (s.kind === "plan") {
    return (
      <div className="tm-step">
        <span className="tm-tag tm-tag-plan">PLAN</span>
        <ol className="tm-plan">{s.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
      </div>
    );
  }
  if (s.kind === "simulate") {
    return (
      <div className="tm-step">
        <span className="tm-tag tm-tag-sim">SIMULATE</span>
        <span className="tm-step-body">
          <div className="tm-sim-pred">{s.prediction}</div>
          {s.sideEffects.length > 0 && (
            <div className="tm-muted">side effects — {s.sideEffects.join(" · ")}</div>
          )}
          {s.warnings.length > 0 && (
            <div className="tm-warn">⚠ {s.warnings.join(" · ")}</div>
          )}
          <div className="tm-muted">prediction confidence: {s.confidence} — checked against reality in the receipt (VOUCH)</div>
        </span>
      </div>
    );
  }
  if (s.kind === "dispatch") {
    return (
      <div className="tm-step">
        <span className="tm-tag tm-tag-tool">DISPATCH</span>
        <span className="tm-step-body">
          {s.objective}
          {s.awaitingApprovalId ? (
            <div className="tm-approval">
              <div className="tm-approval-h">HUMAN GATE — dispatch a mission to a crew</div>
              <div className="tm-approval-btns">
                <button className="control" onClick={() => onApprove(s.awaitingApprovalId!, true)}>Approve</button>
                <button className="ghost danger" onClick={() => onApprove(s.awaitingApprovalId!, false)}>Deny</button>
              </div>
            </div>
          ) : s.denied ? (
            <span className="tm-denied">denied by the human gate — nothing executed</span>
          ) : s.status ? (
            <span className="tm-done">{s.status}</span>
          ) : null}
        </span>
      </div>
    );
  }
  if (s.kind === "receipt") return <></>;
  /* tool */
  return (
    <div className="tm-step">
      <span className="tm-tag tm-tag-tool">{s.tool.toUpperCase()}</span>
      <span className="tm-step-body">
        <span className="tm-args">{argStr(s.args)}</span>
        {s.awaitingApprovalId ? (
          <div className="tm-approval">
            <div className="tm-approval-h">HUMAN GATE — {s.tool === "workspace_write" ? "write a file to the local workspace" : "risky action"}</div>
            <div className="tm-approval-btns">
              <button className="control" onClick={() => onApprove(s.awaitingApprovalId!, true)}>Approve</button>
              <button className="ghost danger" onClick={() => onApprove(s.awaitingApprovalId!, false)}>Deny</button>
            </div>
          </div>
        ) : s.denied ? (
          <span className="tm-denied">denied by the human gate — nothing executed</span>
        ) : s.output !== undefined ? (
          <pre className="tm-out">{s.output}</pre>
        ) : null}
        {s.ms !== undefined && !s.denied ? <span className="tm-ms">{s.ms}ms</span> : null}
      </span>
    </div>
  );
}

/* ── feedback (binds to the receipt, not a vibe) ──────────────────────────── */
function ReceiptFeedback({ receiptId, onRated }: { receiptId: string; onRated: () => void }): JSX.Element {
  const [score, setScore] = useState(0);
  const [note, setNote] = useState("");
  const [rated, setRated] = useState<number | null>(null);
  useEffect(() => {
    const ref = teammateSession().receipts.find((r) => r.id === receiptId);
    if (ref && ref.feedback.length > 0) setRated(ref.feedback[ref.feedback.length - 1].score);
  }, [receiptId]);
  if (rated !== null) {
    return (
      <div className="tm-fb">
        <span className="tm-muted">rated {rated}/5 — bound to this receipt</span>
      </div>
    );
  }
  return (
    <div className="tm-fb">
      <span className="tm-muted">rate this run:</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} className={`tm-star ${score >= n ? "on" : ""}`} onClick={() => setScore(n)} aria-label={`${n} stars`}>★</button>
      ))}
      <input
        className="tm-fb-note"
        placeholder="note (e.g. wrong answer / unsafe / slow)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button className="tm-fb-save" disabled={score === 0} onClick={() => { rateTeammateRun(receiptId, score, note); setRated(score); onRated(); }}>
        save
      </button>
    </div>
  );
}

function MessageView({ m, onApprove }: { m: TeammateMessage; onApprove: (id: string, ok: boolean) => void }): JSX.Element {
  if (m.role === "user") {
    return <div className="tm-msg tm-msg-user"><div className="tm-bubble-user">{m.text}</div></div>;
  }
  return (
    <div className="tm-msg tm-msg-bot">
      <div className="tm-avatar" title={`${BOT_NAME} — the accountable colleague`}>{BOT_NAME.slice(0, 1)}</div>
      <div className="tm-bubble-bot">
        {m.trace.length > 0 && (
          <div className="tm-trace">
            {m.trace.map((s, i) => {
              if (s.kind === "receipt") {
                const ref = teammateSession().receipts.find((r) => r.id === s.receiptId);
                return (
                  <div key={i} className="tm-step">
                    <span className="tm-tag tm-tag-receipt">RECEIPT</span>
                    <span className="tm-step-body">
                      <span className="tm-mono">
                        {s.events} events · head {s.head.slice(0, 12)}… · {s.signed ? "ED25519 SIGNED" : "HMAC SEAL (no Ed25519 in this runtime)"}
                        {ref?.skillId ? " · skill linked" : ""}
                      </span>
                      <ReceiptFeedback receiptId={s.receiptId} onRated={() => {}} />
                    </span>
                  </div>
                );
              }
              return <TraceStepView key={i} s={s} onApprove={onApprove} />;
            })}
          </div>
        )}
        {m.text ? renderMiniMd(m.text) : null}
        {m.streaming && <span className="tm-cursor" />}
      </div>
    </div>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────── */
export function TeammatePage(): JSX.Element {
  const [sess, setSess] = useState<TeammateSession>(() => teammateSession());
  const [input, setInput] = useState("");
  const [verifyRes, setVerifyRes] = useState<Record<string, string>>({});
  const [memoryTab, setMemoryTab] = useState<"facts" | "prefs" | "skills" | "failures">("facts");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribeTeammate(() => setSess(teammateSession())), []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sess.messages]);

  const busy = sess.messages.some((m) => m.streaming);
  const brain = teammateBrain();

  const send = (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput("");
    void sendTeammateMessage(t);
  };

  const approve = (id: string, ok: boolean) => resolveTeammateApproval(id, ok);

  const downloadBlob = (content: string, name: string, type: string) => {
    if (typeof document === "undefined") return;
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const downloadJsonl = (id: string) => {
    const jsonl = teammateReceiptJsonl(id);
    if (!jsonl) return;
    downloadBlob(jsonl, `teammate-receipt-${id}.jsonl`, "application/jsonl");
  };

  const verify = (id: string) => {
    void verifyTeammateReceipt(id).then((r) =>
      setVerifyRes((v) => ({ ...v, [id]: r.ok ? `verified ok · ${r.events} events` : `FAILED: ${r.reason}` })),
    );
  };

  const files = teammateWorkspaceFiles();
  const threads = sess.threads;
  const active = threads.find((t) => t.id === sess.activeThreadId);

  return (
    <div className="tm-root">
      <style>{`
        .tm-root{display:flex;height:100%;min-height:0;background:var(--bg,#0a0a0b);color:var(--text,#e8e6e3)}
        .tm-chat{flex:1;display:flex;flex-direction:column;min-width:0}
        .tm-threadstrip{display:flex;gap:6px;padding:8px 16px 0;align-items:center;flex-wrap:wrap}
        .tm-thread{font-size:11px;padding:4px 10px;border:1px solid var(--border,#2a2a2c);border-radius:14px;background:transparent;color:var(--text-soft,#c9c5be);cursor:pointer}
        .tm-thread.active{border-color:var(--accent,#ff4d00);color:var(--text,#e8e6e3)}
        .tm-thread.dropped{color:var(--text-mute,#8a867f);font-style:italic}
        .tm-thread-new{font-size:11px;padding:4px 10px;border:1px dashed var(--border,#2a2a2c);border-radius:14px;background:transparent;color:var(--text-mute,#9a968f);cursor:pointer}
        .tm-thread-new:hover{border-color:var(--accent,#ff4d00);color:var(--text,#e8e6e3)}
        .tm-threadtitle{font:600 10px var(--font-mono,monospace);letter-spacing:.1em;color:var(--text-mute,#7a766f);padding:8px 16px 0}
        .tm-scroll{flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:14px}
        .tm-msg{display:flex;gap:10px;align-items:flex-start}
        .tm-msg-user{justify-content:flex-end}
        .tm-avatar{width:26px;height:26px;border-radius:6px;flex:none;display:flex;align-items:center;justify-content:center;font:600 13px var(--font-mono,monospace);background:var(--accent,#ff4d00);color:#0a0a0b;margin-top:2px}
        .tm-bubble-bot{max-width:760px;min-width:0;padding:10px 14px;border:1px solid var(--border,#222);border-radius:10px;background:var(--bg-2,#101012)}
        .tm-bubble-user{max-width:640px;padding:8px 14px;border-radius:10px;background:var(--bg-2,#141416);border:1px solid var(--border,#222)}
        .tm-p{margin:2px 0;font-size:13.5px;line-height:1.55}
        .tm-h{margin:8px 0 2px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-mute,#9a968f)}
        .tm-ul{margin:4px 0 4px 18px;font-size:13.5px;line-height:1.55}
        .tm-code{font-family:var(--font-mono,monospace);font-size:12.5px;background:#000;padding:1px 5px;border-radius:4px}
        .tm-pre{margin:6px 0;padding:10px 12px;background:#050505;border:1px solid var(--border,#222);border-radius:8px;font:12px/1.5 var(--font-mono,monospace);overflow-x:auto;white-space:pre-wrap;word-break:break-word}
        .tm-trace{margin-bottom:8px;display:flex;flex-direction:column;gap:6px}
        .tm-step{display:flex;gap:8px;align-items:flex-start;font-size:12px}
        .tm-tag{flex:none;font:600 10px var(--font-mono,monospace);letter-spacing:.1em;padding:2px 7px;border-radius:4px;border:1px solid var(--border,#2a2a2c);color:var(--text-mute,#9a968f)}
        .tm-tag-think{color:#9a8fb8}.tm-tag-plan{color:#8fb8a0}.tm-tag-tool{color:#b8a08f}.tm-tag-receipt{color:var(--accent,#ff4d00);border-color:var(--accent,#ff4d00)}
        .tm-tag-fast{color:#7fbf8f;border-color:#7fbf8f}
        .tm-tag-slow{color:#d8b06a;border-color:#d8b06a}
        .tm-tag-recall{color:#8f9ab8}
        .tm-tag-sim{color:#b88fd8;border-color:#b88fd8}
        .tm-step-body{min-width:0;flex:1;color:var(--text-soft,#c9c5be);line-height:1.5}
        .tm-muted{color:var(--text-mute,#8a867f);font-size:11px}
        .tm-args{color:var(--text-mute,#8a867f);font-family:var(--font-mono,monospace);font-size:11px;display:block}
        .tm-out{margin:4px 0 0;padding:6px 9px;background:#050505;border:1px solid var(--border,#222);border-radius:6px;font:11px/1.5 var(--font-mono,monospace);white-space:pre-wrap;word-break:break-word;max-height:120px;overflow-y:auto}
        .tm-ms{color:var(--text-mute,#7a766f);font:10px var(--font-mono,monospace)}
        .tm-plan{margin:0 0 0 4px;padding-left:16px;color:var(--text-soft,#c9c5be);font-size:12px}
        .tm-sim-pred{padding:6px 9px;border-left:2px solid #b88fd8;background:rgba(184,143,216,.07);border-radius:4px;margin-bottom:4px;font-size:12px}
        .tm-warn{color:#d8b06a;font-size:11px;margin-top:3px}
        .tm-approval{margin-top:6px;padding:8px 10px;border:1px solid var(--accent,#ff4d00);border-radius:8px;background:rgba(255,77,0,.06)}
        .tm-approval-h{font:600 11px var(--font-mono,monospace);letter-spacing:.08em;color:var(--accent,#ff4d00);margin-bottom:6px}
        .tm-approval-btns{display:flex;gap:8px}
        .tm-denied{color:var(--red,#e05a4e);font-size:11px;margin-top:4px;display:block}
        .tm-done{color:var(--green,#7fbf8f);font-size:11px}
        .tm-mono{font-family:var(--font-mono,monospace);font-size:11px}
        .tm-cursor{display:inline-block;width:8px;height:14px;background:var(--accent,#ff4d00);margin-left:2px;animation:tmblink 1s steps(2) infinite}
        @keyframes tmblink{50%{opacity:0}}
        .tm-fb{display:flex;align-items:center;gap:5px;margin-top:5px;flex-wrap:wrap}
        .tm-star{background:none;border:none;color:var(--text-mute,#5a564f);font-size:14px;cursor:pointer;padding:0 1px}
        .tm-star.on{color:var(--accent,#ff4d00)}
        .tm-fb-note{background:var(--bg-2,#101012);border:1px solid var(--border,#2a2a2c);border-radius:5px;color:var(--text,#e8e6e3);font-size:11px;padding:3px 7px;min-width:170px}
        .tm-fb-save{font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid var(--border,#2a2a2c);background:transparent;color:var(--text-soft,#c9c5be);cursor:pointer}
        .tm-fb-save:disabled{opacity:.4;cursor:default}
        .tm-composer{border-top:1px solid var(--border,#222);padding:12px 16px;display:flex;gap:10px;align-items:flex-end;background:var(--bg,#0a0a0b)}
        .tm-input{flex:1;resize:none;font:13.5px/1.5 var(--font-sans,sans-serif);background:var(--bg-2,#101012);border:1px solid var(--border,#2a2a2c);border-radius:10px;padding:9px 12px;color:var(--text,#e8e6e3);min-height:40px;max-height:140px}
        .tm-input:focus{outline:none;border-color:var(--accent,#ff4d00)}
        .tm-chips{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}
        .tm-chip{font-size:12px;padding:6px 10px;border:1px solid var(--border,#2a2a2c);border-radius:16px;background:transparent;color:var(--text-soft,#c9c5be);cursor:pointer}
        .tm-chip:hover{border-color:var(--accent,#ff4d00);color:var(--text,#e8e6e3)}
        .tm-rail{width:320px;flex:none;border-left:1px solid var(--border,#222);overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:16px;background:var(--bg,#0a0a0b)}
        .tm-sec{font:600 10px var(--font-mono,monospace);letter-spacing:.14em;color:var(--text-mute,#9a968f);margin-bottom:8px}
        .tm-ident{padding:12px;border:1px solid var(--border,#222);border-radius:10px;background:var(--bg-2,#101012)}
        .tm-ident-name{font:700 15px var(--font-mono,monospace);letter-spacing:.06em}
        .tm-ident-sub{font-size:11px;color:var(--text-mute,#9a968f);margin-top:2px;line-height:1.5}
        .tm-badge{display:inline-block;margin-top:8px;font:600 10px var(--font-mono,monospace);letter-spacing:.08em;padding:2px 8px;border-radius:4px;border:1px solid var(--accent,#ff4d00);color:var(--accent,#ff4d00)}
        .tm-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;padding:6px 8px;border:1px solid var(--border,#222);border-radius:7px;margin-bottom:6px;background:var(--bg-2,#101012)}
        .tm-row-x{cursor:pointer;color:var(--text-mute,#7a766f);border:none;background:none;font-size:12px}
        .tm-row-x:hover{color:var(--red,#e05a4e)}
        .tm-empty{color:var(--text-mute,#7a766f);font-size:12px;padding:4px 2px}
        .tm-receipt{border:1px solid var(--border,#222);border-radius:8px;padding:8px 10px;margin-bottom:8px;background:var(--bg-2,#101012);font-size:11px}
        .tm-receipt-h{font:600 10px var(--font-mono,monospace);letter-spacing:.06em;color:var(--text-mute,#9a968f);margin-bottom:4px;word-break:break-all}
        .tm-receipt-btns{display:flex;gap:6px;margin-top:6px}
        .tm-receipt-btns button{font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid var(--border,#2a2a2c);background:transparent;color:var(--text-soft,#c9c5be);cursor:pointer}
        .tm-receipt-btns button:hover{border-color:var(--accent,#ff4d00)}
        .tm-verify{margin-top:5px;font:10px var(--font-mono,monospace);color:var(--green,#7fbf8f)}
        .tm-verify.bad{color:var(--red,#e05a4e)}
        .tm-skill{border:1px solid var(--border,#222);border-radius:8px;padding:8px 10px;margin-bottom:8px;background:var(--bg-2,#101012);font-size:11px}
        .tm-skill.flagged{border-color:#d8b06a}
        .tm-skill-name{font:600 11px var(--font-mono,monospace);color:var(--text,#e8e6e3)}
        .tm-skill-flag{color:#d8b06a;font-size:10px}
        .tm-tabs{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}
        .tm-tab{font:600 9px var(--font-mono,monospace);letter-spacing:.08em;padding:3px 8px;border:1px solid var(--border,#2a2a2c);border-radius:4px;background:transparent;color:var(--text-mute,#9a968f);cursor:pointer}
        .tm-tab.on{border-color:var(--accent,#ff4d00);color:var(--accent,#ff4d00)}
        select.tm-select{background:var(--bg-2,#101012);color:var(--text,#e8e6e3);border:1px solid var(--border,#2a2a2c);border-radius:6px;font-size:11px;padding:3px 6px}
        @media (max-width: 900px){.tm-rail{display:none}}
      `}</style>

      <section className="tm-chat">
        <div className="tm-threadstrip">
          <span className="tm-threadtitle">{active ? `THREAD — ${active.title.toUpperCase()}` : "THREAD"}</span>
          {threads.map((t) => (
            <button
              key={t.id}
              className={`tm-thread ${t.id === sess.activeThreadId ? "active" : ""} ${t.status === "dropped" ? "dropped" : ""}`}
              title={t.status === "dropped" ? `dropped — “continue ${t.title}” resumes it` : "open"}
              onClick={() => setActiveTeammateThread(t.id)}
            >
              {t.status === "dropped" ? "⌛ " : "● "}{t.title}
            </button>
          ))}
          <button
            className="tm-thread-new"
            onClick={() => {
              const t = typeof window !== "undefined" ? window.prompt("Thread name:", "New thread") : "New thread";
              if (t !== null) newTeammateThread(t.trim() || "New thread");
            }}
          >
            + new thread
          </button>
        </div>
        <div className="tm-scroll" ref={scrollRef}>
          {sess.messages.length === 0 && (
            <>
              <div className="tm-msg tm-msg-bot">
                <div className="tm-avatar">{BOT_NAME.slice(0, 1)}</div>
                <div className="tm-bubble-bot">
                  <p className="tm-p">
                    Hey. I'm <strong>{BOT_NAME}</strong> — the accountable colleague on this machine.
                    I run a cycle on everything: <strong>recall → plan → think → simulate → act → vouch → learn</strong>.
                    Risky actions are simulated first and paused at your gate. Every finished run mints a signed
                    receipt you can verify offline — and my memory, preferences, and learned skills are all
                    local, visible, and yours to delete.
                  </p>
                </div>
              </div>
              <div className="tm-chips">
                <button className="tm-chip" onClick={() => send("What time is it in Chennai right now?")}>What time is it in Chennai?</button>
                <button className="tm-chip" onClick={() => send("Calculate (12 * 8) + (144 / 9)")}>Calculate (12×8)+(144÷9)</button>
                <button className="tm-chip" onClick={() => send("Write a file called hello.txt: Vouch Harbor — every job vouched")}>Write a file (simulate + gate demo)</button>
                <button className="tm-chip" onClick={() => send("Search the web for agent receipts")}>Search the web (live evidence)</button>
                <button className="tm-chip" onClick={() => send("From now on: always mention the receipt at the end")}>Learn a preference</button>
                <button className="tm-chip" onClick={() => send("Remember: my project is Vouch Harbor")}>Remember a fact</button>
                <button className="tm-chip" onClick={() => send("Dispatch a mission: summarize what this runtime is")}>Dispatch a mission (gate)</button>
              </div>
            </>
          )}
          {sess.messages.map((m) => (
            <MessageView key={m.id} m={m} onApprove={approve} />
          ))}
        </div>
        <div className="tm-composer">
          <div className="tm-chips" style={{ margin: 0, flexWrap: "nowrap" }}>
            <button className="tm-chip" style={sess.mode === "quick" ? { borderColor: "var(--accent,#ff4d00)" } : undefined} onClick={() => setTeammateMode("quick" as TeammateMode)}>Quick</button>
            <button className="tm-chip" style={sess.mode === "deep" ? { borderColor: "var(--accent,#ff4d00)" } : undefined} onClick={() => setTeammateMode("deep" as TeammateMode)}>Deep ⚡</button>
          </div>
          <textarea
            className="tm-input"
            rows={1}
            placeholder={`Message ${BOT_NAME} — Enter sends, Shift+Enter for a new line · “continue <thread>” resumes a dropped thread`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          {busy ? (
            <button className="ghost danger" onClick={() => stopTeammate()}>Stop</button>
          ) : (
            <button className="control" onClick={() => send()} disabled={!input.trim()}>Send</button>
          )}
        </div>
      </section>

      <aside className="tm-rail" aria-label="Teammate context">
        <div className="tm-ident">
          <div className="tm-ident-name">{BOT_NAME}</div>
          <div className="tm-ident-sub">The accountable colleague · Vouch Cycle: recall → plan → think → simulate → act → vouch → learn. Runs on this machine — nothing phones home.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <span className="tm-sec" style={{ margin: 0 }}>PERSONA</span>
            <select className="tm-select" value={sess.persona} onChange={(e) => setTeammatePersona(e.target.value as TeammatePersona)}>
              <option value="witty">Witty</option>
              <option value="professional">Professional</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
          <div className="tm-badge">{brain.label.toUpperCase()}</div>
        </div>

        <div>
          <div className="tm-sec">MEMORY — local, inspectable, yours</div>
          <div className="tm-tabs">
            <button className={`tm-tab ${memoryTab === "facts" ? "on" : ""}`} onClick={() => setMemoryTab("facts")}>FACTS ({sess.facts.length})</button>
            <button className={`tm-tab ${memoryTab === "prefs" ? "on" : ""}`} onClick={() => setMemoryTab("prefs")}>PREFS ({sess.preferences.length})</button>
            <button className={`tm-tab ${memoryTab === "skills" ? "on" : ""}`} onClick={() => setMemoryTab("skills")}>SKILLS ({sess.skills.length})</button>
            <button className={`tm-tab ${memoryTab === "failures" ? "on" : ""}`} onClick={() => setMemoryTab("failures")}>FAILURES ({sess.failures.length})</button>
          </div>
          {memoryTab === "facts" && (
            <>
              {sess.facts.length === 0 ? (
                <div className="tm-empty">Nothing remembered yet. Try “remember: …”</div>
              ) : (
                sess.facts.map((f) => (
                  <div key={f.id} className="tm-row">
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.text}</span>
                    <button className="tm-row-x" title="Forget this" onClick={() => removeTeammateFact(f.id)}>✕</button>
                  </div>
                ))
              )}
            </>
          )}
          {memoryTab === "prefs" && (
            <>
              {sess.preferences.length === 0 ? (
                <div className="tm-empty">No preferences learned. Try “from now on: …”</div>
              ) : (
                sess.preferences.map((p) => (
                  <div key={p.id} className="tm-row">
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.text}</span>
                    <button className="tm-row-x" title="Delete preference" onClick={() => removeTeammatePreference(p.id)}>✕</button>
                  </div>
                ))
              )}
            </>
          )}
          {memoryTab === "skills" && (
            <>
              {sess.skills.length === 0 ? (
                <div className="tm-empty">No skills yet — successful runs distill test-gated skills here.</div>
              ) : (
                sess.skills.map((k) => (
                  <div key={k.id} className={`tm-skill ${k.flagged ? "flagged" : ""}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span className="tm-skill-name">{k.name} v{k.version}{k.flagged ? <span className="tm-skill-flag"> · ⚑ flagged — review</span> : null}</span>
                      <button className="tm-row-x" title="Delete skill" onClick={() => removeTeammateSkill(k.id)}>✕</button>
                    </div>
                    <div className="tm-muted">{k.when}</div>
                    <div className="tm-muted" style={{ marginTop: 3 }}>{k.steps.join(" → ")}</div>
                    <div className="tm-mono" style={{ marginTop: 3 }}>tool: {k.tool} · runs {k.runs} · wins {k.wins} · avg {k.avgScore ?? "n/a"}</div>
                    <div className="tm-muted" style={{ marginTop: 2 }}>provenance: receipt {k.bornReceiptId.slice(0, 14)}…</div>
                  </div>
                ))
              )}
            </>
          )}
          {memoryTab === "failures" && (
            <>
              {sess.failures.length === 0 ? (
                <div className="tm-empty">Failure memory is empty — rejected skill mutations land here.</div>
              ) : (
                sess.failures.map((x) => (
                  <div key={x.id} className="tm-skill">
                    <div className="tm-skill-name">{x.what}</div>
                    <div className="tm-muted">{x.reason}</div>
                  </div>
                ))
              )}
            </>
          )}
          <button className="tm-chip" style={{ marginTop: 6 }} onClick={() => downloadBlob(exportTeammateMemoryMarkdown(), "rogue-memory-export.md", "text/markdown")}>
            ⬇ export memory (.md — local, yours)
          </button>
        </div>

        <div>
          <div className="tm-sec">WORKSPACE — files written here</div>
          {files.length === 0 ? (
            <div className="tm-empty">Empty. Ask me to write a file — I'll simulate it, then ask first.</div>
          ) : (
            files.map((f) => (
              <div key={f.name} className="tm-row">
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span className="tm-ms">{f.chars} chars</span>
              </div>
            ))
          )}
        </div>

        <div>
          <div className="tm-sec">RECEIPTS — every job, vouched</div>
          {sess.receipts.length === 0 ? (
            <div className="tm-empty">No runs yet. Every finished job mints one.</div>
          ) : (
            [...sess.receipts].reverse().map((r) => (
              <div key={r.id} className="tm-receipt">
                <div className="tm-receipt-h">{r.mission}</div>
                <div className="tm-mono">{r.events} events · head {r.head.slice(0, 14)}… · {r.signed ? "ed25519 signed" : "hmac seal (runtime unsigned)"}{(r.feedback ?? []).length > 0 ? ` · rated ${r.feedback[r.feedback.length - 1].score}/5` : ""}</div>
                <div className="tm-receipt-btns">
                  <button onClick={() => verify(r.id)}>verify (offline)</button>
                  <button onClick={() => downloadJsonl(r.id)}>export .jsonl</button>
                </div>
                {verifyRes[r.id] && <div className={`tm-verify ${verifyRes[r.id].startsWith("FAILED") ? "bad" : ""}`}>{verifyRes[r.id]}</div>}
              </div>
            ))
          )}
        </div>

        <div className="tm-ident-sub" style={{ marginTop: "auto" }}>
          {sess.facts.length} facts · {sess.preferences.length} prefs · {sess.skills.length} skills · {sess.receipts.length} receipts · brain: {brain.id}
        </div>
      </aside>
    </div>
  );
}

export default TeammatePage;
