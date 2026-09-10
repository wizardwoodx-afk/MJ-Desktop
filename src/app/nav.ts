/**
 * v15.0.0 — the navigation SINGLE SOURCE OF TRUTH (One Engine, six doors).
 *
 * 12.0 answered the 11.14.x reviews: the app's destinations used to be a lab
 * bench of fourteen doors into the same machinery, each presenting itself as
 * its own product. 12.0 is ONE product — a single engine (the MISSION LOOP)
 * with doors onto it and its evidence:
 *
 *   ENGINE   →  Mission Loop (the engine, one screen) · Workflows (design what
 *               the engine runs)
 *   VERIFY   →  Proof (signed receipt vault) · Audit (guardrail manifest +
 *               ledgers — the compliance view)
 *   SYSTEM   →  System (connectors, providers, browser, preferences)
 *
 * 15.0 added the sixth door (the teammate); 16.0 (the Vouch Harbor merge)
 * makes it canonical: the Vouch door is the control plane — a named,
 * persistent colleague you message like a colleague. It runs the full Vouch
 * Cycle (route → recall → plan → council → signed simulation → human gate →
 * act → vouch → learn) and dispatches objectives into the REAL Mission Loop
 * under one mission ID, so every job lands in one unified receipt chain.
 * The lifecycle (Compose → Dispatch → Communicate → Execute → Gate → Adapt)
 * still runs INSIDE the engine screen as the loop's own phase rail; Vouch is
 * a door onto it, not a fork.
 *
 * probe/navAlign asserts this file is complete, canonical and drift-free, and
 * that App.tsx renders ONLY from it. A page that is not in this map is an
 * orphan; orphans are the pre-12.0 disease.
 */
import type { PageKind } from "../domain/types";

export interface NavEntry {
  /** Stable identifier — must be a PageKind. */
  key: PageKind;
  /** Public label — the product vocabulary, not the internal codename. */
  label: string;
  /** Icon glyph name consumed by App's iconFor(). */
  icon: string;
  /** One-line purpose — shown as the tooltip and in the IA map. */
  description: string;
}

export interface NavGroup {
  /** Stable group id. */
  id: "engine" | "verify" | "system";
  /** Public group label. */
  label: string;
  /** One-line group definition, shared with the IA map. */
  description: string;
  items: NavEntry[];
}

export const NAV: NavEntry[] = [
  { key: "teammate", label: "Vouch", icon: "users", description: "The face — your accountable colleague: recall, plan, council, signed simulation, a human gate for risky actions, and a signed receipt for every run. Dispatches real missions to the engine." },
  { key: "loop", label: "Mission Loop", icon: "radar", description: "The engine — compose a crew, run the loop: dispatch, channels, gates, adaptation, receipts. One screen, one cycle." },
  { key: "workflow", label: "Workflows", icon: "gitbranch", description: "Design what the engine runs — visual agent workflows with typed ports, checkpoints and auto-layout." },
  { key: "proof", label: "Proof", icon: "shield", description: "The signed receipt vault — tamper-evident evidence for every run, exportable with zero app state." },
  { key: "audit", label: "Audit", icon: "eye", description: "The compliance view — guardrail manifest, ledgers, egress and capability posture." },
  { key: "settings", label: "System", icon: "tool", description: "Connectors, providers, the agent browser and preferences — how the engine is configured." },
];

/** The engine order IS the navigation order — one product, top to bottom. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "engine",
    label: "Engine",
    description: "The one engine and its face: Teammate is the human front door, the Mission Loop is the engine, Workflows designs what it runs.",
    items: NAV.filter((n) => n.key === "teammate" || n.key === "loop" || n.key === "workflow"),
  },
  {
    id: "verify",
    label: "Verify",
    description: "Prove the work: the signed receipt vault and the audit view of every guarantee.",
    items: NAV.filter((n) => n.key === "proof" || n.key === "audit"),
  },
  {
    id: "system",
    label: "System",
    description: "Configure the engine: connectors, providers, the agent browser and preferences.",
    items: NAV.filter((n) => n.key === "settings"),
  },
];
