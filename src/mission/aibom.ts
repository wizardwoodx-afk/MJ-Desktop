/**
 * §AIBOM — the AI Bill of Materials auditors now ask for (MJ 11.10.5, Verified AI Delivery V1).
 *
 * THE AUDITOR QUESTION (2026, per CISA/G7 minimum-element guidance and Codacy's auditor
 * survey): which AI tools/models touched the codebase, where, and are they approved?
 * MJ is unusually well-placed to answer, because MJ MEASURES this: every receipt records
 * seat outcomes with harness + identity digest. The AIBOM is that measurement, folded
 * into the inventory shape auditors expect.
 *
 * THE HONESTY RULES
 *  - version is "not measured" — CLIs do not report model versions to MJ, and MJ will
 *    not guess one. An honest unknown beats a confident invention in an audit document.
 *  - approvalStatus comes from the user's OWN Role Board declaration (the harnesses they
 *    said they own): owned → "approved", observed-but-not-declared → "not-declared".
 *    MJ does not decide approval policy; it reports the declaration.
 *  - Only harnesses OBSERVED IN RECEIPTS appear. No speculation about tools that might
 *    be installed.
 */
import type { VaultRecord } from "./receiptVault";

export interface AibomEntry {
  /** The AI component (agent harness) observed producing or reviewing work. */
  component: string;
  type: "ai-coding-agent";
  /** CISA/G7 minimum elements ask for a version. MJ cannot measure it, and says so. */
  version: "not measured (CLIs do not report model versions to MJ)";
  identifier: string;
  roles: string[];
  missions: number;
  /** Deterministic seat identity digests observed for this component (chain-bound in the receipts). */
  seatIdentities: string[];
  lastUsed: string;
  approvalStatus: "approved" | "not-declared";
}

export interface Aibom {
  format: "mj-aibom/1";
  generatedAt: string;
  mjVersion: string;
  receiptsScanned: number;
  entries: AibomEntry[];
  declarationSource: string;
  disclaimer: string;
}

/** Build the AIBOM from the vault's receipts + the user's Role Board declaration. */
export function buildAibom(args: { records: VaultRecord[]; ownedHarnesses: string[]; mjVersion: string }): Aibom {
  const byComponent = new Map<string, AibomEntry>();

  for (const rec of args.records) {
    for (const ev of rec.receipt.events) {
      if (ev.kind !== "seat.outcome") continue;
      const harness = ev.data.harness;
      if (typeof harness !== "string" || harness.length === 0) continue;
      let entry = byComponent.get(harness);
      if (!entry) {
        entry = {
          component: harness,
          type: "ai-coding-agent",
          version: "not measured (CLIs do not report model versions to MJ)",
          identifier: harness,
          roles: [],
          missions: 0,
          seatIdentities: [],
          lastUsed: rec.issuedAt,
          approvalStatus: args.ownedHarnesses.includes(harness) ? "approved" : "not-declared",
        };
        byComponent.set(harness, entry);
      }
      const role = ev.data.role;
      if (typeof role === "string" && !entry.roles.includes(role)) entry.roles.push(role);
      const identity = ev.data.identity;
      if (typeof identity === "string" && !entry.seatIdentities.includes(identity)) entry.seatIdentities.push(identity);
      if (rec.issuedAt > entry.lastUsed) entry.lastUsed = rec.issuedAt;
    }
  }

  // Second pass: mission counts per component (a mission counts once per component).
  for (const rec of args.records) {
    const seen = new Set<string>();
    for (const ev of rec.receipt.events) {
      if (ev.kind !== "seat.outcome") continue;
      const harness = ev.data.harness;
      if (typeof harness !== "string" || seen.has(harness)) continue;
      seen.add(harness);
      const entry = byComponent.get(harness);
      if (entry) entry.missions += 1;
    }
  }

  const entries = [...byComponent.values()].sort((a, b) => a.component.localeCompare(b.component));

  return {
    format: "mj-aibom/1",
    generatedAt: new Date().toISOString(),
    mjVersion: args.mjVersion,
    receiptsScanned: args.records.length,
    entries,
    declarationSource: "MJ Role Board — the harnesses the user declared as owned (approved); observed-but-undeclared components are marked not-declared.",
    disclaimer:
      "Generated from proof receipts on this machine. Versions are not claimed because MJ does not measure them. Approval status reflects the user's own declaration, not any MJ judgment. This is an evidence inventory, not a certification.",
  };
}

/** Markdown rendering for humans (auditors like tables they can paste into reports). */
export function aibomToMarkdown(bom: Aibom): string {
  const lines: string[] = [];
  lines.push(`# MJ — AI Bill of Materials (mj-aibom/1)`);
  lines.push(``);
  lines.push(`Generated ${bom.generatedAt} · MJ ${bom.mjVersion} · receipts scanned: ${bom.receiptsScanned}`);
  lines.push(``);
  if (bom.entries.length === 0) {
    lines.push(`No AI components observed in receipts yet. Run team missions to populate the inventory.`);
  } else {
    lines.push(`| Component | Roles | Missions | Approval | Version |`);
    lines.push(`|---|---|---|---|---|`);
    for (const e of bom.entries) {
      lines.push(`| ${e.component} | ${e.roles.join(", ") || "—"} | ${e.missions} | ${e.approvalStatus} | ${e.version} |`);
    }
  }
  lines.push(``);
  lines.push(`_${bom.declarationSource}_`);
  lines.push(``);
  lines.push(`_${bom.disclaimer}_`);
  lines.push(``);
  return lines.join("\n");
}
