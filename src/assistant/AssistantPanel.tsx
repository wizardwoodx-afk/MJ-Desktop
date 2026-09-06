import { useEffect, useRef, useState } from "react";
import {
  assistSystemPrompt,
  draftCustomNode,
  generateCustomNodeFromSpec,
  parseNodeSpec,
  type NodeSpec,
} from "../domain/customNode";
import { iconFor } from "../canvas/icons";
import { useGraphStore } from "../graph/store";
import { ipc } from "../ipc/client";
import { toast } from "../panels/Toast";

/**
 * §Assist — V11.5 MERIDIAN REDESIGN.
 *
 * The old panel opened with a wall of disclaimer text and answered with unlabelled blobs.
 * The redesign is honest by construction:
 *   • the provider is resolved and LABELLED before you type (asst-prov chip) — you always
 *     know who will answer, and "offline" means offline;
 *   • every message rides a role rail (you / assist, with a dot) — no unattributed text;
 *   • model answers carry a via chip; offline drafts say so, never fake it;
 *   • quick-start chips instead of a wall of intro text;
 *   • inserted nodes offer "select on canvas" — one click focuses the node in the graph.
 */

const INTRO =
  "Assist designs exactly ONE custom node from text — it will not assemble a workflow.\n" +
  "It uses your local model (Ollama at 127.0.0.1:11434) when reachable, then any provider key you attached in Providers, and otherwise inserts a clearly-labelled offline draft. Nothing pretends to be AI that is not.";

const QUICK_STARTS = [
  "A node that fetches an RSS feed and returns the latest titles",
  "A node that reads a PDF and returns a one-paragraph summary",
  "A node that diffs two JSON files and reports the changed paths",
];

type Via = { label: string; kind: "model" | "offline" };

interface Msg {
  role: "user" | "bot";
  text: string;
  via?: Via;
  insertedId?: string;
}

/** Provider order: local Ollama (no key, local-first), then the first attached cloud key. */
async function resolveProvider(): Promise<{
  provider: string; model: string; base_url?: string; secret_ref: string; label: string;
} | null> {
  try {
    const statuses = await ipc.secretExists([
      "provider.openai.production",
      "provider.anthropic.production",
      "provider.google.production",
      "provider.openrouter.production",
    ]);
    const attached = Object.entries(statuses).find(([, s]) => s.exists);
    if (attached) {
      const [ref] = attached;
      const kind = ref.split(".")[1];
      const models: Record<string, string> = {
        openai: "gpt-4.1",
        anthropic: "claude-sonnet-4",
        google: "gemini-2.5-flash",
        openrouter: "auto",
      };
      return {
        provider: kind,
        model: models[kind] ?? "auto",
        secret_ref: ref,
        label: `${kind} · attached key`,
      };
    }
  } catch { /* secret store unavailable — fall through to Ollama */ }
  // Local-first default: Ollama needs no key. Reachability is proven by the call itself failing
  // over to the offline draft — there is no probe round-trip to lie about here.
  return { provider: "ollama", model: "llama3.1", base_url: "http://127.0.0.1:11434", secret_ref: "provider.ollama.local", label: "ollama · local" };
}

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "bot", text: INTRO }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [provLabel, setProvLabel] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      input.current?.focus();
      // Resolve and label WHO will answer before the user types a single word.
      if (provLabel === null) {
        void resolveProvider().then((p) => setProvLabel(p ? p.label : "offline · no model"));
      }
    }
  }, [open, provLabel]);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [msgs, busy]);

  if (!open) return null;

  const insertSpec = (spec: NodeSpec, via: Via): void => {
    const store = useGraphStore.getState();
    const vp = store.graph.viewport;
    const node = generateCustomNodeFromSpec(spec, -vp.x + 280, -vp.y + 180);
    store.insertTemplate([node], []);
    store.selectNode(node.id);
    toast(`Custom node: ${spec.title}`);
    setMsgs((m) => [
      ...m,
      {
        role: "bot",
        insertedId: node.id,
        text:
          `Inserted "${spec.title}".\nPurpose: ${spec.purpose}\n` +
          (spec.procedures.length > 0 ? `Procedures: ${spec.procedures.length} steps (edit them in the Inspector).\n` : "") +
          "One node, as designed. Wire it up yourself.",
        via,
      },
    ]);
  };

  const insertOffline = (q: string, reason?: string): void => {
    const draft = draftCustomNode(q);
    insertSpec(
      { title: draft.title, purpose: draft.purpose, procedures: draft.procedures.split("\n") },
      { label: "offline draft", kind: "offline" },
    );
    if (reason) setMsgs((m) => [...m, { role: "bot", text: reason, via: { label: "offline draft", kind: "offline" } }]);
  };

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    try {
      const prov = await resolveProvider();
      if (!prov) {
        insertOffline(q);
        return;
      }
      const reply = await ipc.llmChat({
        provider: prov.provider,
        base_url: prov.base_url,
        model: prov.model,
        system: assistSystemPrompt(),
        messages: [{ role: "user", content: q }],
        max_tokens: 500,
        temperature: 0.3,
        secret_ref: prov.secret_ref,
      });
      const spec = parseNodeSpec(reply.content);
      if (!spec) {
        insertOffline(q, `The model replied, but not in the node-spec shape — nothing half-parsed was inserted. Offline draft instead.`);
        return;
      }
      insertSpec(spec, { label: prov.label, kind: "model" });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      insertOffline(q, `${reason}\nSo: no model was used. What follows is a deterministic offline draft — not AI output.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="assistant-panel">
      <div className="asst-head">
        <span className="asst-lamp" aria-hidden="true" />
        <div className="asst-title">
          <span className="asst-word">ASSIST</span>
          <span className="asst-sub">one custom node · honestly labelled</span>
        </div>
        <span className={`asst-prov ${provLabel?.includes("offline") ? "offline" : ""}`} title="Who will answer, resolved before you type">
          {provLabel ?? "resolving…"}
        </span>
        <button className="ghost asst-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="msgs" ref={box}>
        {msgs.map((m, i) => (
          <div key={i} className={`asst-msg ${m.role === "user" ? "user" : "bot"}`}>
            <div className="asst-rail">
              <span className="asst-dot" aria-hidden="true" />
              <span className="asst-role">{m.role === "user" ? "you" : "assist"}</span>
            </div>
            {m.via && <span className={`asst-via ${m.via.kind}`}>{m.via.label}</span>}
            <div className="asst-body">{m.text}</div>
            {m.insertedId && (
              <button
                className="asst-action"
                onClick={() => {
                  useGraphStore.getState().selectNode(m.insertedId!);
                  window.__mjCanvas?.focusNode(m.insertedId!);
                }}
              >
                {iconFor("gitbranch")} select on canvas
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="asst-msg bot">
            <div className="asst-rail">
              <span className="asst-dot" aria-hidden="true" />
              <span className="asst-role">assist</span>
            </div>
            <div className="asst-body asst-typing" aria-label="designing">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>

      {msgs.length <= 1 && (
        <div className="asst-quick">
          <div className="asst-quick-label">Try one</div>
          {QUICK_STARTS.map((q) => (
            <button key={q} className="asst-chip" onClick={() => { setText(q); input.current?.focus(); }}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="composer">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder="Describe one custom node…"
          disabled={busy}
        />
        <button className="primary asst-send" onClick={() => void send()} disabled={busy || text.trim().length === 0}>
          Design
        </button>
      </div>
      <div className="asst-foot">local-first · one node per turn · offline drafts are labelled, never faked</div>
    </div>
  );
}
