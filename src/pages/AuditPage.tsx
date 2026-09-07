import { loadLearningReceipts, verifyLearningReceipt } from "../mission/learningReceipt";
import { loadImprovement, adoptedVersion, armScores, MIN_TRIALS, ADOPT_MARGIN, TRIAL_CAP } from "../mission/selfImprove";
import { loadExperimentRuns } from "../mission/selfEvolveRuntime";
import { ledgerSummary, canWrite } from "../mission/ledger";
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

  return (
    <div className="panel-page">
      <h2>Audit — what MJ did, and who allowed it</h2>
      <p className="sub">
        Written for a reader who has never opened a terminal. Everything below is read live from
        MJ's own records; nothing here is typed by hand. MJ {MJ_VERSION}.
      </p>

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
