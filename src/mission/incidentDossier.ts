/**
 * §INCIDENT BLACK BOX — the forensics dossier for agent missions (MJ 14.0).
 *
 * WHY THIS EXISTS
 * The market just named this category (Microsoft's AgentRx replay diagnostics, March
 * 2026; Vorlon's "AI Agent Flight Recorder" at RSAC 2026 — both capture telemetry into
 * someone else's cloud and ask you to trust their immutability). MJ's version is local
 * and cryptographic: ONE digest-stamped JSON that bundles the mission timeline, every
 * proof receipt RE-VERIFIED at export time, and a SIEM-shaped JSONL projection. When an
 * agent incident happens, the investigator gets a black box, not log archaeology.
 *
 * THE HONESTY RULES
 *  - Nothing is silently trusted: every receipt carries its LIVE verification verdict.
 *    A broken chain is still included but MARKED, and the digest covers the mark —
 *    the dossier cannot look healthier than the evidence it carries.
 *  - The dossier is tamper-evident: verifyIncidentDossier recomputes the digest AND
 *    re-verifies every receipt, so an edited export (including a flipped verdict)
 *    fails loudly.
 *  - No vendor cloud: the dossier is a file on the customer's machine.
 */
import { verifyProofReceipt, type ProofReceipt } from "./receipts";

export interface IncidentEvent {
  at: string;
  kind: string;
  seatId: string | null;
  summary: string;
}

export interface DossierReceiptEntry {
  receipt: ProofReceipt;
  verification: { ok: boolean; events: number; reason?: string };
}

export interface IncidentDossier {
  format: "vh-incident-dossier/1";
  incidentId: string;
  mission: string;
  teamId: string;
  openedAt: string;
  sealedAt: string;
  note?: string;
  envelopeId?: string | null;
  /** Chronological — sorted by at, then kind, so equal timestamps are deterministic. */
  timeline: IncidentEvent[];
  receipts: DossierReceiptEntry[];
  /** sha256 over the canonical dossier minus the digest field. */
  digest: string;
}

const enc = new TextEncoder();

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}
const canon = (o: unknown): string => JSON.stringify(sortDeep(o));

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sortedTimeline(events: IncidentEvent[]): IncidentEvent[] {
  return [...events].sort((a, b) => (a.at === b.at ? a.kind.localeCompare(b.kind) : a.at.localeCompare(b.at)));
}

export async function buildIncidentDossier(args: {
  incidentId: string;
  mission: string;
  teamId: string;
  openedAt: string;
  sealedAt?: string;
  note?: string;
  envelopeId?: string | null;
  timeline: IncidentEvent[];
  receipts: ProofReceipt[];
}): Promise<IncidentDossier> {
  const receipts: DossierReceiptEntry[] = [];
  for (const receipt of args.receipts) {
    const v = await verifyProofReceipt(receipt);
    receipts.push(
      v.ok
        ? { receipt, verification: { ok: true, events: v.events } }
        : { receipt, verification: { ok: false, events: receipt.events?.length ?? 0, reason: v.reason } },
    );
  }
  const sealedAt = args.sealedAt ?? new Date().toISOString();
  const { digest, ...body } = await (async () => {
    const dossierNoDigest = {
      format: "vh-incident-dossier/1" as const,
      incidentId: args.incidentId,
      mission: args.mission,
      teamId: args.teamId,
      openedAt: args.openedAt,
      sealedAt,
      ...(args.note !== undefined ? { note: args.note } : {}),
      ...(args.envelopeId !== undefined ? { envelopeId: args.envelopeId } : {}),
      timeline: sortedTimeline(args.timeline),
      receipts,
    };
    return { ...dossierNoDigest, digest: await sha256hex(canon(dossierNoDigest)) };
  })();
  return { ...body, digest };
}

export async function verifyIncidentDossier(
  d: IncidentDossier,
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const reasons: string[] = [];
  if (d.format !== "vh-incident-dossier/1" && d.format !== "mj-incident-dossier/1") reasons.push(`unknown format ${d.format}`);
  // "mj-incident-dossier/1" = pre-16.1 legacy export; older dossiers stay verifiable.
  const { digest, ...rest } = d;
  if ((await sha256hex(canon(rest))) !== digest) reasons.push("digest mismatch — the dossier was edited after sealing");
  // Re-verify every receipt and require the recorded verdict to still be TRUE —
  // an exported dossier must not claim healthier evidence than it carries.
  for (let i = 0; i < d.receipts.length; i++) {
    const entry = d.receipts[i];
    const fresh = await verifyProofReceipt(entry.receipt);
    if (entry.verification.ok !== fresh.ok) {
      reasons.push(`receipts[${i}]: recorded verdict (${entry.verification.ok ? "ok" : "broken"}) does not match live verification (${fresh.ok ? "ok" : "broken"})`);
    } else if (!fresh.ok && entry.verification.reason !== (fresh as { reason: string }).reason) {
      reasons.push(`receipts[${i}]: the recorded break reason was altered`);
    }
  }
  const sorted = sortedTimeline(d.timeline);
  if (JSON.stringify(sorted) !== JSON.stringify(d.timeline)) reasons.push("timeline is not in canonical order");
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/** SIEM-shaped projection: one head line, one line per timeline event, one per receipt verdict. */
export function toSiemJsonl(d: IncidentDossier): string {
  const head = {
    format: d.format,
    incidentId: d.incidentId,
    mission: d.mission,
    teamId: d.teamId,
    sealedAt: d.sealedAt,
    digest: d.digest,
    events: d.timeline.length,
    receipts: d.receipts.length,
    receiptsBroken: d.receipts.filter((r) => !r.verification.ok).length,
  };
  const lines: Array<Record<string, unknown>> = [{ kind: "dossier.head", ...head }];
  for (const e of d.timeline) lines.push({ kind: `incident.${e.kind}`, incidentId: d.incidentId, at: e.at, seatId: e.seatId, summary: e.summary });
  for (const r of d.receipts) {
    lines.push({
      kind: "dossier.receipt",
      incidentId: d.incidentId,
      mission: r.receipt.header.mission,
      seal: r.receipt.seal,
      verification: r.verification,
    });
  }
  return `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`;
}
