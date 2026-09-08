/**
 * MJ 11.14.10 — the navigation SINGLE SOURCE OF TRUTH.
 *
 * Before this module, the app's destinations lived as two parallel ad-hoc
 * arrays inside App.tsx (a flat list and a grouping list) that could drift,
 * and every label had grown in its own release ("Canvas", "Control",
 * "Observe", "MCP"…) — fourteen destinations that read like fourteen
 * mini-apps stapled together.
 *
 * MJ is ONE product with ONE spine: the agent-work lifecycle —
 *
 *   Overview → Build → Run → Verify → Learn → System
 *
 * Every destination belongs to exactly one stage of that spine, has one
 * purpose-clear label, one description, and is reachable from one place.
 * Nothing ships as a navigation entry without all four. probe/navAlign
 * asserts this file is complete, canonical and drift-free, and that
 * App.tsx renders ONLY from it — a page that is not in this map is an
 * orphan, and an orphan is a product decision nobody made.
 *
 * The labels are the product's public vocabulary (mature, consistent,
 * job-first). The keys are stable identifiers shared with the page switch
 * and PageKind — renaming a page never renames its key.
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
  /** Stable group id — the lifecycle stage. */
  id: "overview" | "build" | "run" | "verify" | "learn" | "system";
  /** Public group label. */
  label: string;
  /** One-line stage definition, shared with the IA map. */
  description: string;
  items: NavEntry[];
}

export const NAV: NavEntry[] = [
  { key: "home", label: "Home", icon: "home", description: "Your workspace overview — the problem MJ solves, recent workflows and where to start." },
  { key: "workflow", label: "Workflows", icon: "gitbranch", description: "Design agent workflows visually — typed ports, templates, checkpoints and auto-layout." },
  { key: "teams", label: "Teams", icon: "users", description: "Compose agent fleets from 25+ harnesses or any binary — roles, policies and budgets." },
  { key: "missions", label: "Missions", icon: "crown", description: "Plan and run missions on real agent harnesses — measured, gated, receipted." },
  { key: "control", label: "Mission Control", icon: "radar", description: "The live fleet board — heartbeats, cost ledger, approval inbox and human overrides." },
  { key: "executions", label: "Runs", icon: "history", description: "Every execution's record — outcomes, measured spend, gate verdicts." },
  { key: "observability", label: "Observe", icon: "activity", description: "Live telemetry — OTLP traces and events showing what agents did as it happens." },
  { key: "proof", label: "Proof", icon: "shield", description: "The signed receipt vault — tamper-evident evidence, exportable with zero MJ state." },
  { key: "audit", label: "Audit", icon: "eye", description: "The compliance view — guardrail manifest, ledgers, egress and capability demos." },
  { key: "evolution", label: "Evolve", icon: "dna", description: "The learning loop — lessons, skills, beliefs and strategy experiments, human-approved." },
  { key: "mcp", label: "Connectors", icon: "plug", description: "Managed MCP servers — connect tools to your agents under validation and policy." },
  { key: "browser", label: "Browser", icon: "globe", description: "The agent's sandboxed browser — isolated sessions with a full navigation log." },
  { key: "providers", label: "Providers", icon: "terminal", description: "Model providers and keys for Assist and local-model paths." },
  { key: "settings", label: "Settings", icon: "tool", description: "Licensing, palettes, retention and gate policy — the product's preferences." },
];

/** The lifecycle order IS the navigation order — one spine, read top to bottom. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Where you start — one glance at what MJ guarantees and what needs you.",
    items: NAV.filter((n) => n.key === "home"),
  },
  {
    id: "build",
    label: "Build",
    description: "Design the work: visual workflows and the agent teams that execute them.",
    items: NAV.filter((n) => n.key === "workflow" || n.key === "teams"),
  },
  {
    id: "run",
    label: "Run",
    description: "Execute and observe: missions, the live fleet board, run records and telemetry.",
    items: NAV.filter((n) => ["missions", "control", "executions", "observability"].includes(n.key)),
  },
  {
    id: "verify",
    label: "Verify",
    description: "Prove the work: signed receipts and the audit view of every guarantee.",
    items: NAV.filter((n) => n.key === "proof" || n.key === "audit"),
  },
  {
    id: "learn",
    label: "Learn",
    description: "Improve the work: the organization's measured learning loop.",
    items: NAV.filter((n) => n.key === "evolution"),
  },
  {
    id: "system",
    label: "System",
    description: "Connect and configure: connectors, browser, providers and settings.",
    items: NAV.filter((n) => ["mcp", "browser", "providers", "settings"].includes(n.key)),
  },
];
