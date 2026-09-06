import { useEffect, useState } from "react";
import { downloadText } from "../app/desktop";
import { receiptFromJsonl, receiptToJsonl, verifyProofReceipt } from "../mission/receipts";
import { globalReceiptVault, type VaultRecord } from "../mission/receiptVault";
import { MJ_VERSION } from "../version";

/**
 * §RECEIPT & COMPLIANCE CENTER (MJ 11.9.9).
 *
 * The "Proof" page used to be a placeholder. Now it is the compliance surface of the
 * verified agent factory: every receipt MJ has issued, the gate verdict each one carries,
 * a self-audit that re-runs the external verification over the whole vault, SIEM export,
 * and the one-pager an auditor actually reads. Verification still needs no MJ state —
 * that box at the bottom proves it on demand.
 */

function GateBadge({ status, tier }: { status: VaultRecord["gateStatus"]; tier: string }) {
  const cls = status === "PASS" ? "ok" : status === "BLOCKED" ? "err" : status === "n/a" ? "" : "warn";
  return (
    <span className={`pill ${cls}`} title={`Adversarial verification tier: ${tier}`}>
      gate {status}
      {tier && tier !== "n/a" ? ` · ${tier}` : ""}
    </span>
  );
}

export function ProofPage() {
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [audit, setAudit] = useState<{ total: number; valid: number; broken: Array<{ id: string; reason: string }> } | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [verifyText, setVerifyText] = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");

  const refresh = () => setRecords(globalReceiptVault.list());
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="panel-page">
      <h2>Receipt &amp; Compliance Center</h2>
      <p className="sub">
        Every team mission can issue a SHA-256 hash-chained proof receipt; since 11.9.9 each one also carries the
        adversarial-gate verdict. The vault below is the local ledger — audit it, export it to a SIEM, or verify any
        receipt with no MJ state at all.
      </p>

      <div className="stat-row">
        <div className="stat"><div className="n">{records.length}</div><div className="l">Receipts on file</div></div>
        <div className="stat"><div className="n">{records.filter((r) => r.gateStatus === "PASS").length}</div><div className="l">Gate PASS</div></div>
        <div className="stat"><div className="n">{records.filter((r) => r.gateStatus === "BLOCKED" || r.gateStatus === "FAIL").length}</div><div className="l">Gate blocked / failed</div></div>
        <div className="stat"><div className="n">{audit ? `${audit.valid}/${audit.total}` : "—"}</div><div className="l">Last chain audit</div></div>
      </div>

      <div className="row" style={{ margin: "12px 0" }}>
        <button
          className="primary"
          disabled={auditing || records.length === 0}
          onClick={() => {
            setAuditing(true);
            void globalReceiptVault.audit().then((a) => {
              setAudit(a);
              setAuditing(false);
            });
          }}
        >
          {auditing ? "Auditing chains…" : "Audit all chains"}
        </button>
        <button
          disabled={records.length === 0}
          onClick={() => downloadText("mj-receipts-siem.jsonl", globalReceiptVault.siemBundle(), "application/x-ndjson")}
        >
          Export SIEM bundle
        </button>
        <button onClick={() => downloadText("MJ-Agent-Evidence-One-Pager.md", globalReceiptVault.onePager({ mjVersion: MJ_VERSION, edition: "desktop" }), "text/markdown")}>
          Compliance one-pager
        </button>
        {records.length > 0 && (
          <button
            onClick={() => {
              globalReceiptVault.clear();
              setAudit(null);
              refresh();
            }}
          >
            Clear vault
          </button>
        )}
      </div>

      {audit && (
        <div className="card" style={{ marginBottom: 12 }}>
          {audit.broken.length === 0 ? (
            <span className="pill ok">Chain audit: all {audit.total} receipt(s) re-verified — every hash and seal intact</span>
          ) : (
            <>
              <span className="pill err">Chain audit: {audit.broken.length} of {audit.total} receipt(s) broken</span>
              <ul className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                {audit.broken.map((b) => (
                  <li key={b.id} className="mono">{b.id} — {b.reason}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <h3>Issued receipts</h3>
      {records.length === 0 && (
        <p className="muted">
          Nothing on file yet. Run a team mission in Teams → Runner: the receipt is issued automatically at the end of
          the run, gate verdict attached.
        </p>
      )}
      {records.map((r) => (
        <div key={r.id} className="card" style={{ marginBottom: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="card-title">{r.mission}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {r.teamId} · issued {r.issuedAt} · {r.receipt.events.length} chained events · MJ {r.receipt.header.mjVersion} ({r.receipt.header.edition})
              </div>
              <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>seal {r.receipt.seal.slice(0, 16)}…</div>
            </div>
            <GateBadge status={r.gateStatus} tier={r.gateTier} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => downloadText(`mj-receipt-${r.id}.jsonl`, receiptToJsonl(r.receipt), "application/x-ndjson")}>
              Export JSONL
            </button>
            <button
              onClick={async () => {
                const v = await verifyProofReceipt(r.receipt);
                setVerifyMsg(v.ok ? `${r.id}: VALID — ${v.events} chained events, seal ok` : `${r.id}: REJECTED — ${v.reason}`);
              }}
            >
              Verify
            </button>
          </div>
        </div>
      ))}
      {verifyMsg && <p className="muted" style={{ fontSize: 12 }}>{verifyMsg}</p>}

      <details style={{ marginTop: 12 }}>
        <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>Verify ANY receipt (external check — no MJ state needed, no vault needed)</summary>
        <textarea value={verifyText} onChange={(e) => setVerifyText(e.target.value)} rows={5} style={{ width: "100%", marginTop: 6 }} placeholder="paste a mj-receipt .jsonl exported by any MJ install" />
        <div className="row" style={{ marginTop: 6 }}>
          <button
            onClick={async () => {
              const rc = receiptFromJsonl(verifyText);
              if (!rc) {
                setVerifyMsg("verify: not a readable receipt");
                return;
              }
              const v = await verifyProofReceipt(rc);
              setVerifyMsg(v.ok ? `verify: VALID — ${v.events} chained events, seal ok` : `verify: REJECTED — ${v.reason}`);
            }}
          >
            Verify pasted receipt
          </button>
        </div>
      </details>
    </div>
  );
}
