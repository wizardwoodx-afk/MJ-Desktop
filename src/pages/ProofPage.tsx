import { useEffect, useState } from "react";
import { downloadText } from "../app/desktop";
import { receiptFromJsonl, receiptToJsonl, verifyProofReceipt } from "../mission/receipts";
import { globalReceiptVault, type VaultRecord } from "../mission/receiptVault";
import { buildEvidencePack, evidencePackToJson } from "../mission/evidencePack";
import { exportIssuerPublicKeyDocument } from "../mission/signing";
import { verifyMergeAttestation } from "../mission/mergeExecutor";
import { MJ_VERSION } from "../version";

/**
 * §RECEIPT & COMPLIANCE CENTER (MJ 11.9.9; completed 11.10.1).
 *
 * The "Proof" page used to be a placeholder. Now it is the compliance surface of the
 * verified agent factory: every receipt MJ has issued — issuer-SIGNED since 11.10.1 —
 * the gate verdict each one carries, any merge attestation attached to a run, a
 * self-audit that re-runs the external verification over the whole vault, SIEM export,
 * the one-pager an auditor actually reads, and the Evidence Pack: one exportable bundle
 * with the EU AI Act / ISO 42001 / SOC 2 crosswalk. Verification still needs no MJ
 * state — that box at the bottom proves it on demand.
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
        Every team mission can issue a SHA-256 hash-chained proof receipt; since 11.9.9 each one carries the
        adversarial-gate verdict, and since 11.10.1 each one is <b>Ed25519-signed by the local issuer key</b> — and a
        gated merge, once executed, attaches a signed attestation naming the merge-commit sha. The vault below is the
        local ledger — audit it, export it to a SIEM, export the full evidence pack, or verify any receipt with no MJ
        state at all.
      </p>

      <div className="stat-row">
        <div className="stat"><div className="n">{records.length}</div><div className="l">Receipts on file</div></div>
        <div className="stat"><div className="n">{records.filter((r) => r.gateStatus === "PASS").length}</div><div className="l">Gate PASS</div></div>
        <div className="stat"><div className="n">{records.filter((r) => Boolean(r.receipt.signature)).length}</div><div className="l">Issuer-signed (Ed25519)</div></div>
        <div className="stat"><div className="n">{records.filter((r) => r.mergeAttestation).length}</div><div className="l">Merge attestations</div></div>
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
        <button
          disabled={records.length === 0}
          title="One JSON bundle: every receipt re-verified at export, signed merge attestations, SIEM bundle, one-pager, and the EU AI Act / ISO 42001 / SOC 2 crosswalk."
          onClick={async () => {
            const pack = await buildEvidencePack({ vault: globalReceiptVault, mjVersion: MJ_VERSION, edition: "desktop" });
            downloadText(`mj-evidence-pack-${new Date().toISOString().slice(0, 10)}.json`, evidencePackToJson(pack), "application/json");
            setVerifyMsg(
              pack.manifest.receiptsBrokenAtExport.length === 0
                ? `evidence pack: ${pack.manifest.receiptsOnFile} receipt(s) re-verified clean, ${pack.manifest.mergeAttestations} merge attestation(s) included`
                : `evidence pack: WARNING — ${pack.manifest.receiptsBrokenAtExport.length} receipt(s) FAILED re-verification and are flagged inside the pack`,
            );
          }}
        >
          Export evidence pack
        </button>
        <button
          onClick={async () => {
            const doc = await exportIssuerPublicKeyDocument(MJ_VERSION);
            if (doc) downloadText("MJ-Issuer-Public-Key.txt", doc, "text/plain");
            else setVerifyMsg("This runtime has no Ed25519 — receipts stay tamper-evident via the HMAC seal, but no issuer key can be exported.");
          }}
        >
          Export issuer public key
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
            <div className="row" style={{ gap: 6 }}>
              {r.receipt.signature ? (
                <span className="pill ok" title={`Issuer ${r.receipt.issuer?.keyId ?? "?"} — Ed25519 over the final chain hash`}>signed</span>
              ) : (
                <span className="pill warn" title={r.receipt.signatureNote ?? "v1 receipt (pre-11.10.1): chain + seal only"}>
                  {r.receipt.format === "mj-proof-receipt/2" ? "unsigned" : "v1 · seal only"}
                </span>
              )}
              <GateBadge status={r.gateStatus} tier={r.gateTier} />
            </div>
          </div>
          {r.mergeAttestation && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 11 }}>
                  merge attestation: {r.mergeAttestation.executed
                    ? <>merged → {r.mergeAttestation.baseBranch} @ <b>{(r.mergeAttestation.mergeCommitSha ?? "?").slice(0, 10)}</b>{r.mergeAttestation.gate.overrideRecorded ? " · HUMAN OVERRIDE recorded" : ""}</>
                    : <>not merged{r.mergeAttestation.simulated ? " (simulated host)" : ""}{r.mergeAttestation.refusedReason ? ` — ${r.mergeAttestation.refusedReason.slice(0, 120)}…` : ""}</>}
                </span>
                <div className="row" style={{ gap: 6 }}>
                  {r.mergeAttestation.signature ? <span className="pill ok" title={`issuer ${r.mergeAttestation.issuer?.keyId}`}>signed</span> : <span className="pill warn">unsigned</span>}
                  <button
                    onClick={() => downloadText(`mj-merge-attestation-${r.id}.json`, JSON.stringify(r.mergeAttestation, null, 2), "application/json")}
                  >
                    Attestation
                  </button>
                  <button
                    onClick={async () => {
                      if (!r.mergeAttestation) return;
                      const v = await verifyMergeAttestation(r.mergeAttestation);
                      setVerifyMsg(v.ok ? `${r.id}: merge attestation signature VERIFIED` : `${r.id}: attestation check failed — ${v.reason}`);
                    }}
                  >
                    Verify attestation
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => downloadText(`mj-receipt-${r.id}.jsonl`, receiptToJsonl(r.receipt), "application/x-ndjson")}>
              Export JSONL
            </button>
            <button
              onClick={async () => {
                const v = await verifyProofReceipt(r.receipt);
                setVerifyMsg(
                  v.ok
                    ? `${r.id}: VALID — ${v.events} chained events, seal ok${r.receipt.signature ? ", issuer signature verified" : r.receipt.format === "mj-proof-receipt/2" ? " (unsigned — see receipt note)" : ""}`
                    : `${r.id}: REJECTED — ${v.reason}`,
                );
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
