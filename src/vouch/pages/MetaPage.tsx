/**
 * Vouch Harbor 16.3.0 — M6: the meta loop.
 *
 * The most sensitive door in the product: it shows the ledger of the
 * product's self-change proposals — risk tiers and standing preferences —
 * each one proposed in words, simulated, human-gated, receipt-vouched, and
 * reversible. The gate decision itself is made on the Vouch face (the one
 * gate) or over MCP; this page is the ledger + the proposal/revert intent.
 */
import { useEffect, useState } from "react";
import {
  metaChanges,
  subscribeMeta,
  proposeMetaChange,
  revertMetaChange,
  currentGatedTools,
  type MetaChange,
} from "../engine/meta";
import { VOUCH_TOOLS, RISKY_TOOLS } from "../engine/vouch";
import { toast } from "../../panels/Toast";

const STATUS_COLOR: Record<string, string> = {
  proposed: "#e8b44a",
  applied: "#6fbf8f",
  reverted: "#8f9bb0",
  denied: "#c96a5a",
  refused: "#c96a5a",
};

function MetaRow({ c, onRevert }: { c: MetaChange; onRevert: (id: string) => void }) {
  return (
    <div style={{ border: "1px solid var(--border, #2a2f3a)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ font: "600 12px ui-monospace, monospace" }}>{c.id}</span>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          {c.kind} on <b>{c.target}</b>
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: STATUS_COLOR[c.status] ?? "#8f9bb0",
          }}
        >
          {c.status}
        </span>
        {c.revertOf && (
          <span style={{ fontSize: 11, opacity: 0.6 }}>revert of {c.revertOf}</span>
        )}
        {c.status === "applied" && c.revertOf === null && (
          <button className="pill" style={{ marginLeft: "auto", fontSize: 11 }} onClick={() => onRevert(c.id)}>
            Revert (gated)
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, lineHeight: 1.45 }}>
        {c.from} → {c.to}
      </div>
      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 3 }}>
        reason: {c.reason}
      </div>
      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
        {c.createdAt.slice(0, 16).replace("T", " ")}
        {c.decidedAt ? ` · decided ${c.decision} ${c.decidedAt.slice(0, 16).replace("T", " ")}` : " · pending at the human gate"}
        {c.receiptId ? ` · receipt ${c.receiptId}` : ""}
        {c.revertReceiptId ? ` · revert receipt ${c.revertReceiptId}` : ""}
      </div>
    </div>
  );
}

export function MetaPage() {
  const [, force] = useState(0);
  const [kind, setKind] = useState<"risk.tier" | "preference.set">("risk.tier");
  const [tool, setTool] = useState("");
  const [prefText, setPrefText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeMeta(() => force((n) => n + 1)), []);

  const changes = metaChanges();
  const safeTools = Object.keys(VOUCH_TOOLS).filter((t) => !RISKY_TOOLS.has(t));
  const gated = currentGatedTools();

  const propose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const target = kind === "risk.tier" ? tool : prefText.trim();
      const r = await proposeMetaChange(kind, target, reason.trim());
      if (r.pending) {
        toast("Meta change paused at the human gate — decide it on the Vouch face or via MCP.");
        setReason("");
      } else {
        toast(r.output);
      }
    } finally {
      setBusy(false);
      force((n) => n + 1);
    }
  };

  const revert = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await revertMetaChange(id);
      if (r.pending) toast("Revert paused at the human gate — a revert changes governance too, so it is gated as well.");
      else toast(r.output);
    } finally {
      setBusy(false);
      force((n) => n + 1);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.55, margin: "0 0 12px" }}>
        The meta loop is the product proposing changes to <b>its own control plane</b>. Every proposal is
        written in words, simulated, and paused at the <b>human gate</b> (decided on the Vouch face or over
        MCP); every decision — applied, denied, refused, reverted — mints a receipt. Two rules keep it a
        feature and not a loop: the meta loop may <b>tighten</b> the gate, never loosen it, and every
        change is <b>revertible</b> (the revert itself is gated + vouched; reverts are terminal).
      </p>

      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
        Currently gated: <b>{gated.join(", ") || "(none)"}</b>
      </div>

      <div style={{ border: "1px solid var(--border, #2a2f3a)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", opacity: 0.7, marginBottom: 8 }}>
          PROPOSE A SELF-CHANGE
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <button className="pill" style={kind === "risk.tier" ? { borderColor: "var(--accent, #4da3ff)" } : {}} onClick={() => setKind("risk.tier")}>
            risk.tier (tighten)
          </button>
          <button className="pill" style={kind === "preference.set" ? { borderColor: "var(--accent, #4da3ff)" } : {}} onClick={() => setKind("preference.set")}>
            preference.set
          </button>
        </div>
        {kind === "risk.tier" ? (
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <label style={{ opacity: 0.7, marginRight: 8 }}>tool to gate:</label>
            <select
              value={tool}
              onChange={(e) => setTool(e.target.value)}
              style={{ background: "var(--panel, #161a22)", color: "inherit", border: "1px solid var(--border, #2a2f3a)", borderRadius: 8, padding: "4px 8px", fontSize: 12 }}
            >
              <option value="">— pick a safe tool —</option>
              {safeTools.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span style={{ opacity: 0.5, marginLeft: 8 }}>safe → risky (the meta loop can never demote)</span>
          </div>
        ) : (
          <input
            value={prefText}
            onChange={(e) => setPrefText(e.target.value)}
            placeholder="the standing preference, e.g. 'always prefer concise answers'"
            style={{ width: "100%", background: "var(--panel, #161a22)", color: "inherit", border: "1px solid var(--border, #2a2f3a)", borderRadius: 8, padding: "6px 10px", fontSize: 12, marginBottom: 8 }}
          />
        )}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="the reason, in words — the human gate decides on these words"
          rows={2}
          style={{ width: "100%", background: "var(--panel, #161a22)", color: "inherit", border: "1px solid var(--border, #2a2f3a)", borderRadius: 8, padding: "6px 10px", fontSize: 12, resize: "vertical", marginBottom: 8 }}
        />
        <button className="pill" style={{ fontSize: 12 }} disabled={busy || !reason.trim()} onClick={() => void propose()}>
          {busy ? "…" : "Propose (goes to the human gate)"}
        </button>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", opacity: 0.7, marginBottom: 8 }}>
        SELF-CHANGE LEDGER ({changes.length})
      </div>
      {changes.length === 0 && (
        <div style={{ fontSize: 12, opacity: 0.5, padding: "8px 2px" }}>
          No self-changes yet — the product proposes, the human decides, everything is vouched.
        </div>
      )}
      {changes.slice(-10).reverse().map((c) => (
        <MetaRow key={c.id} c={c} onRevert={(id) => void revert(id)} />
      ))}
    </div>
  );
}
