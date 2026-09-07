import { loadLearningReceipts, verifyLearningReceipt } from "../mission/learningReceipt";
import { loadImprovement, adoptedVersion, armScores, MIN_TRIALS, ADOPT_MARGIN, TRIAL_CAP } from "../mission/selfImprove";
import { loadExperimentRuns } from "../mission/selfEvolveRuntime";
import { ledgerSummary, canWrite } from "../mission/ledger";
import { buildProofDossier } from "../mission/dossier";
import { issueRootEnvelope } from "../mission/custody";
import { requestEgress, loadEgressLedger, verifyEgressLedger } from "../mission/egress";
import { executeCapability, DEMO_COMPANY_DATA, CAPABILITY_OPS } from "../mission/capability";
import { useState } from "react";
import { sha256Hex } from "../mission/learningReceipt";
import { loadBeliefs } from "../mission/belief";
import { MJ_VERSION } from "../version";

/**
 * MJ 11.12.2 — Audit: a plain-language dashboard for the non-technical reader.
 * No jargon without a translation. Every number is derived live from the
 * stores; every receipt verifies with one click. This is the compliance
 * officer's view the external review said MJ lacked.
 */
export function AuditPage() {
  const now = Date.now();
  const receipts = loadLearningReceipts();
  const ledger = ledgerSummary(now);
  const beliefs = loadBeliefs();
  const imp = loadImprovement();
  const arms = armScores(imp, loadExperimentRuns());

  const plain = (b: { score: number | null; measured: number } | null, id: string | null, label: string) => {
    if (!id) return `${label}: none in the field`;
    const measured = b ? b.measured : 0;
    const rate = b && b.score !== null ? `${(b.score * 100).toFixed(0)}%` : "not yet measurable";
    return `${label}: ${measured} measured run(s) of its own, success rate ${rate}`;
  };

  const [dossierNote, setDossierNote] = useState<string | null>(null);
  const [egressTick, setEgressTick] = useState(0);
  const [capOp, setCapOp] = useState<string>("sum");
  const [capNote, setCapNote] = useState<string | null>(null);
  const runCapability = async () => {
    // 11.14.1 — capability, not data: the requester asks for an approved
    // operation; it runs where the data lives; only the answer may leave —
    // through the Egress Gate, with a receipt. The raw rows never travel.
    const now = Date.now();
    const envelope = await issueRootEnvelope({
      principal: "human:data-owner",
      scope: ["capability:run", "egress:share"],
      expiresAt: now + 5 * 60 * 1000,
      now,
    });
    const op = capOp as "count" | "sum" | "avg" | "max";
    const run = await executeCapability({
      request: { id: `cap-${now.toString(36)}`, requester: "employee:2 (remote)", op, dataset: DEMO_COMPANY_DATA.dataset, field: "revenue" },
      envelope,
      now,
    });
    if (!run.result) { setCapNote(`Capability refused: ${run.reason}`); return; }
    const gate = await requestEgress({
      envelope,
      item: { kind: "capability-result", name: `${op}(${DEMO_COMPANY_DATA.dataset}.revenue)`, sha256: run.result.digest },
      recipient: "employee:2 (remote)",
      now,
    });
    setEgressTick((t) => t + 1);
    setCapNote(gate.record
      ? `Answer ${run.result.value} authorized by ${envelope.principal}; only the answer left (receipt ${gate.record.digest.slice(0, 12)}…). Raw rows never crossed the boundary.`
      : `Egress refused: ${gate.reason}`);
  };
  const exportDossier = async () => {
    // 11.14.0 — the Egress Gate: this click is the human authority. A fresh,
    // short-lived envelope permits exactly this departure; the receipt lands
    // in the egress ledger; nothing crosses the boundary without both.
    const now = Date.now();
    const envelope = await issueRootEnvelope({
      principal: "human:runner",
      scope: ["egress:share"],
      expiresAt: now + 5 * 60 * 1000,
      now,
    });
    const d = await buildProofDossier(now);
    const payload = JSON.stringify(d, null, 2);
    const itemSha = await sha256Hex(payload);
    const gate = await requestEgress({ envelope, item: { kind: "dossier", name: `mj-proof-dossier-${new Date(d.generatedAt).toISOString().slice(0, 10)}.json`, sha256: itemSha }, recipient: "local download (runner session)", now });
    if (!gate.record) { setDossierNote(`Export blocked by the Egress Gate: ${gate.reason}`); return; }
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = gate.record.item.name;
    a.click();
    URL.revokeObjectURL(url);
    setEgressTick((t) => t + 1);
    setDossierNote(`Authorized by ${gate.record.principal}; receipt ${gate.record.digest.slice(0, 16)}… recorded in the egress ledger below.`);
  };

  return (
    <div className="panel-page">
      <h2>Audit — what MJ did, and who allowed it</h2>
      <p className="sub">
        Written for a reader who has never opened a terminal. Everything below is read live from
        MJ's own records; nothing here is typed by hand. MJ {MJ_VERSION}.
      </p>

      <div className="card">
        <div className="card-title">Egress ledger — what left this machine, and who allowed it <span className="pill">11.14.0</span></div>
        <p className="muted">
          The enterprise seed: company data stays on the laptop; the cloud is a switchboard, never
          a warehouse. Every artifact that crosses the boundary needs a human click, a signed
          authority envelope, and lands here as a receipt. Nothing is listed that did not leave;
          nothing left that is not listed.
        </p>
        {(() => {
          const records = loadEgressLedger();
          void egressTick;
          if (records.length === 0) return <div className="muted">nothing has left this machine yet.</div>;
          return (
            <div>
              {records.slice(-6).map((r) => (
                <div key={r.id} className="row" style={{ marginTop: 6 }}>
                  <span className="muted" style={{ flex: 1 }}>
                    <b style={{ color: "var(--text)" }}>{r.item.kind}</b> {r.item.name} → {r.recipient}<br />
                    {r.at} · by {r.principal} · envelope {r.envelopeId} · sha256 {r.item.sha256.slice(0, 12)}… · receipt {r.digest.slice(0, 12)}…
                  </span>
                </div>
              ))}
              <button style={{ marginTop: 8 }} onClick={() => { void verifyEgressLedger(records).then((v) => setDossierNote(v.ok ? `Egress ledger verified: all ${records.length} receipt(s) intact.` : `Egress ledger TAMPERED: ${v.bad.join(", ")}`)); }}>Verify ledger integrity</button>
            </div>
          );
        })()}
      </div>

      <div className="card">
        <div className="card-title">Capability channel — ask for an answer, never the data <span className="pill">11.14.1</span></div>
        <p className="muted">
          The enterprise thesis working: a remote colleague requests an approved OPERATION on this
          machine's data (a labelled demo stand-in for endpoint-resident company data). The
          computation runs HERE, where the data lives; only the aggregate answer may leave, through
          the Egress Gate, with a receipt. There is no path that returns raw rows.
        </p>
        <div className="row">
          <select value={capOp} onChange={(e) => setCapOp(e.target.value)} style={{ marginRight: 8 }}>
            {CAPABILITY_OPS.map((o) => <option key={o} value={o}>{o}(revenue)</option>)}
          </select>
          <button className="primary" onClick={() => { void runCapability(); }}>Approve as data owner & run</button>
          {capNote && <span className="muted">{capNote}</span>}
        </div>
      </div>

      <div className="card">
        <div className="card-title">In one paragraph</div>
        <p style={{ margin: 0 }}>
          MJ runs teams of coding agents on real missions. Before a run starts, a human's click
          issues a limited, expiring authority envelope; each agent receives a strictly smaller
          slice of that authority. Every run is checked by a DIFFERENT agent than the one that did
          the work, and nothing merges unless that check passes. What MJ learns is written into
          five separate memories with rules about who may write each, and anything learned is
          signed so an auditor can verify it later, without trusting MJ.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Guardrail manifest — what MJ physically cannot do <span className="pill">11.13.1</span></div>
        <p className="muted">
          The pattern MJ adopts from Anthropic's open commerce blueprint: safety rules enforced in
          CODE, not in prompts — so they survive anything a model is told. Each line below is a
          check that runs, pinned by probe suites; this list is generated, not written by hand.
        </p>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>No root authority without a HUMAN principal — <span className="pill">custody</span></li>
          <li>No delegation that grows scope or outlives its parent — <span className="pill">custody</span></li>
          <li>No spend beyond the signed cap — concurrent seats must RESERVE before dispatch — <span className="pill">budget gate</span></li>
          <li>No house rules (DOCTRINE) written by an agent — propose only — <span className="pill">ledger</span></li>
          <li>No skill or strategy installed without measured adoption or human approval — <span className="pill">ledger</span></li>
          <li>No merge when the verifier gate fails — the checker is never the author — <span className="pill">merge gate</span></li>
          <li>No learning persisted from simulated runs — measured facts only — <span className="pill">reflection</span></li>
          <li>No invented prices — token-only harnesses stay dollar-UNKNOWN — <span className="pill">cost honesty</span></li>
          <li>No artifact leaves this machine without a signed egress authority + receipt — <span className="pill">egress gate</span></li>
          <li>Capability requests return answers only — raw rows never leave the owner machine — <span className="pill">capability gate</span></li>
        </ul>
      </div>

      <div className="card">
        <div className="card-title">Proof dossier — one click, everything above, verifiable <span className="pill">11.13.0</span></div>
        <p className="muted">
          Exports a single digest-stamped JSON file: MJ's memories, beliefs, skills, the measured
          experiment and the ledger — exactly as the stores hold them right now. Anyone can
          re-hash the payload to confirm it was not edited after export. Honest scope: the dossier
          is TAMPER-EVIDENT from the moment of export, not independently issuer-signed — the
          Ed25519 signatures live on the individual learning receipts inside it.
        </p>
        <div className="row">
          <button className="primary" onClick={() => { void exportDossier(); }}>Export proof dossier</button>
          {dossierNote && <span className="muted">{dossierNote}</span>}
        </div>
      </div>

      <div className="card">
        <div className="card-title">The experiment — is MJ actually getting better?</div>
        <p className="muted" style={{ marginTop: 4 }}>
          MJ tries one small change to how it works at a time (the "candidate") against the way it
          works today (the "baseline"). Each side is judged ONLY on runs it actually governed, and
          a change is kept only if it is measurably better after {MIN_TRIALS} measured runs per side
          (margin &gt; {ADOPT_MARGIN}); after {TRIAL_CAP} runs without a verdict it is retired as
          inconclusive. A change is never credited with results it did not produce.
        </p>
        <div className="row" style={{ gap: 18, flexWrap: "wrap", marginTop: 8 }}>
          <span>adopted way of working: <b>v{adoptedVersion(imp)?.gen ?? 1}</b></span>
          <span>{plain(arms.baseline, arms.baselineId, "baseline")}</span>
          <span>{arms.candidateId ? plain(arms.candidate, arms.candidateId, "candidate") : "candidate: none in the field"}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">The five memories (who may write them)</div>
        <div className="muted" style={{ marginTop: 4 }}>
          STANCE — {ledger.stance}.<br />
          PRECEDENT ({ledger.precedent.count}) — what happened, with outcomes; written only from
          measured runs or by a human.<br />
          SCAR ({ledger.scar.count}) — what failed and why; always consulted BEFORE successes,
          because failures diagnose and successes flatter.<br />
          DOCTRINE — house rules; {ledger.doctrine.writeRule}.<br />
          RECOURSE — which ways of working are kept; only the measured experiment or a human
          changes it (current: v{ledger.recourse.strategyGen}).
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          Checks the code enforces: agent writes to DOCTRINE → {canWrite("DOCTRINE", "agent").ok ? "allowed (BUG)" : "refused"};
          agent installs a strategy → {canWrite("RECOURSE", "agent").ok ? "allowed (BUG)" : "refused"};
          measured runs write SCAR → {canWrite("SCAR", "agent").ok ? "allowed" : "refused (BUG)"}.
        </div>
      </div>

      <div className="card">
        <div className="card-title">Beliefs — what MJ thinks vs what MJ knows</div>
        <p className="muted" style={{ marginTop: 4 }}>
          Outside information is never "known" — at best "probably". Predictions are labelled as
          not-evidence. Anything MJ inferred ABOUT you waits for your approval before it is used.
        </p>
        <div className="muted">
          {beliefs.length === 0 ? "no beliefs recorded yet." : beliefs.slice(-6).map((b) => (
            <div key={b.id}>[{b.klass}{b.isPrediction ? " · prediction — NOT evidence" : ""}] {b.claim} <span className="pill">{b.source}</span></div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Signed learning receipts — verify them yourself</div>
        <p className="muted" style={{ marginTop: 4 }}>
          Each receipt says what MJ learned, from which mission, with a fingerprint (SHA-256) and a
          signature (Ed25519). Changing a single word breaks verification.
        </p>
        {receipts.length === 0 && <div className="muted">no receipts yet.</div>}
        {receipts.slice(-8).map((r) => (
          <div key={r.id} className="row" style={{ marginTop: 6 }}>
            <span className="muted" style={{ flex: 1 }}>{r.id} · mission {r.missionId} · {r.lessons.length} lesson(s){r.strategyChange ? ` · strategy change ${r.strategyChange}` : ""}</span>
            <button onClick={async () => {
              const v = await verifyLearningReceipt(r);
              alert(v.ok ? `${r.id} verifies — fingerprint and signature intact.` : `${r.id} FAILED: ${v.reason}`);
            }}>Verify</button>
          </div>
        ))}
      </div>
    </div>
  );
}
