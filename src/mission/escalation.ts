/**
 * MJ 11.12.1 (Varkha extract) — escalation signals, measured not vibes.
 *
 * The only escalation input MJ trusts here is a mechanical pattern: identical
 * consecutive turn signatures (MAST's "step repetition", ~15.7% of documented
 * multi-agent failures). `repetitionDepth` returns the longest run of
 * identical signatures in a sequence. The executor records it per seat; the UI
 * may SUGGEST Chamber-style deliberation on depth >= 3 — it never escalates
 * automatically, and it never feeds the strategy experiment (it is not a
 * measured outcome of a strategy arm).
 */
export function repetitionDepth(signatures: string[]): number {
  let max = 0;
  let run = 0;
  let last: string | null = null;
  for (const s of signatures) {
    run = s === last ? run + 1 : 1;
    last = s;
    max = Math.max(max, run);
  }
  return max;
}

/** Named escalation conditions (Varkha's Current→Chamber set), evaluated on facts. */
export interface EscalationSignals {
  irreversibleAction: boolean;
  stepRepetition: number;      // repetitionDepth over a seat's turn signatures
  scarMatch: boolean;          // SCAR says this task shape failed under Current alone
  contradictedBelief: boolean; // FRAME shows a contradicted belief on the path
}

export function shouldSuggestDeliberation(sig: EscalationSignals): { suggest: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (sig.irreversibleAction) reasons.push("irreversible action in scope");
  if (sig.stepRepetition >= 3) reasons.push(`step repetition x${sig.stepRepetition}`);
  if (sig.scarMatch) reasons.push("SCAR: this task shape failed under Current alone");
  if (sig.contradictedBelief) reasons.push("contradicted belief on the action path");
  return { suggest: reasons.length > 0, reasons };
}
