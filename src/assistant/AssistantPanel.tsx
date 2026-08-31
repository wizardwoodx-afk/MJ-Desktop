import { useEffect, useRef, useState } from "react";
import {
  assistSystemPrompt,
  draftCustomNode,
  generateCustomNodeFromSpec,
  parseNodeSpec,
  type NodeSpec,
} from "../domain/customNode";
import { useGraphStore } from "../graph/store";
import { ipc } from "../ipc/client";
import { toast } from "../panels/Toast";

const INTRO =
  "Assist designs exactly ONE custom node from text — it will not assemble a workflow.\n" +
  "It uses your local model (Ollama at 127.0.0.1:11434) when reachable, then any provider key you attached in Providers, and otherwise inserts a clearly-labelled offline draft. Nothing pretends to be AI that is not.";

type Via = { label: string; kind: "model" | "offline" };

interface Msg {
  role: "user" | "bot";
  text: string;
  via?: Via;
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
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
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
        text:
          `Inserted “${spec.title}”.\nPurpose: ${spec.purpose}\n` +
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
      setMsgs((m) => [...m, { role: "bot", text: `Designing the node with ${prov.label}…`, via: { label: prov.label, kind: "model" } }]);
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
      <div className="inspector-head">
        <strong>Assist · one custom node</strong>
        <span className="spacer" />
        <button className="ghost" onClick={onClose}>Close</button>
      </div>
      <div className="msgs" ref={box}>
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.via && <span className={`via-pill ${m.via.kind}`}>[{m.via.label}]</span>}
            {m.text}
          </div>
        ))}
        {busy && <div className="msg bot via-busy">[designing…]</div>}
      </div>
      <div className="composer">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder="Describe one custom node…"
          disabled={busy}
        />
        <button className="primary" onClick={() => void send()} disabled={busy}>Add</button>
      </div>
    </div>
  );
}
