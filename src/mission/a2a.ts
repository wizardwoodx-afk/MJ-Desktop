/**
 * §7 Agent-to-Agent discovery for MJ (V11, MJ-11.0-PROPOSAL W7). FENCED: OFF by default.
 *
 * The 2026 state of agent interoperability: A2A v0.3 is a Linux Foundation project with real
 * adoption (50+ partners), but it describes *task* exchange between self-standing agents, not
 * the local, human-supervised seats MJ runs. V11 therefore ships only the discovery + contract
 * half — reading and validating Agent Cards — behind an explicit opt-in flag. Nothing in V11
 * *calls* a remote agent: that would move authority across a network boundary the governance
 * model cannot see, and would be a lie about supervision. What this file does:
 *
 *   • `parseAgentCard(json)` — validate a card from https://host/.well-known/agent-card.json
 *     (the v0.3 location; the legacy /.well-known/agent.json is accepted and labelled).
 *   • `agentCardForMission(mission)` — emit MJ's own card for a mission, so the local runtime
 *     can be *described* in A2A terms the day federation is proven.
 *   • `remoteAgentToSeatDraft(card)` — turn a validated card into a DRAFT seat descriptor the
 *     human must confirm before anything runs. Drafts never execute; they are documentation
 *     with structure.
 *
 * The fence: `A2A_ENABLED` is false unless the build sets MJ_A2A_ENABLED=1, and every entry
 * point refuses when it is off — loudly, per the honesty rule.
 */

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocolVersion: string;
  capabilities: { streaming: boolean; pushNotifications: boolean };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{ id: string; name: string; description: string; tags: string[] }>;
  provider?: { organization: string; url: string };
  /** Present when the card came from the legacy agent.json location. */
  legacyLocation?: boolean;
}

/** The flag is build-time, not a UI toggle: turning federation on is a release decision. */
export function a2aEnabled(): boolean {
  return typeof process !== "undefined" && process.env?.MJ_A2A_ENABLED === "1";
}

function fence(): { ok: false; fenced: true; error: string } {
  return {
    ok: false,
    fenced: true,
    error: "A2A is fenced OFF in this build (set MJ_A2A_ENABLED=1 at build time to opt in). Discovery is available for reading cards, but nothing here can start a remote task — supervision does not cross the network boundary yet.",
  };
}

const REQUIRED_TEXT = ["name", "description", "url", "version", "protocolVersion"] as const;
const CARD_LOCATION = "/.well-known/agent-card.json";

/** Validate an Agent Card (A2A v0.3 shape; legacy location labelled). */
export function parseAgentCard(raw: unknown, opts: { fromLegacyLocation?: boolean } = {}): { ok: true; card: AgentCard } | { ok: false; errors: string[] } {
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["an agent card must be a JSON object"] };
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];
  for (const k of REQUIRED_TEXT) {
    if (typeof o[k] !== "string" || (o[k] as string).trim() === "") errors.push(`missing or empty required string: ${k}`);
  }
  const caps = (typeof o.capabilities === "object" && o.capabilities !== null ? o.capabilities : {}) as Record<string, unknown>;
  if (typeof o.capabilities !== "object" || o.capabilities === null) errors.push("missing required object: capabilities");
  const inputModes = Array.isArray(o.defaultInputModes) ? (o.defaultInputModes as unknown[]).filter((m): m is string => typeof m === "string") : [];
  const outputModes = Array.isArray(o.defaultOutputModes) ? (o.defaultOutputModes as unknown[]).filter((m): m is string => typeof m === "string") : [];
  if (!Array.isArray(o.defaultInputModes)) errors.push("missing required array: defaultInputModes (MIME types)");
  if (!Array.isArray(o.defaultOutputModes)) errors.push("missing required array: defaultOutputModes (MIME types)");
  const skills: AgentCard["skills"] = [];
  if (Array.isArray(o.skills)) {
    for (const s of o.skills as unknown[]) {
      const sk = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
      if (typeof sk.id !== "string" || typeof sk.name !== "string" || typeof sk.description !== "string") {
        errors.push("a skill entry needs id, name and description strings");
        continue;
      }
      skills.push({ id: sk.id, name: sk.name, description: sk.description, tags: Array.isArray(sk.tags) ? (sk.tags as unknown[]).filter((t): t is string => typeof t === "string") : [] });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const url = o.url as string;
  if (!url.startsWith("https://") && !url.startsWith("http://localhost")) errors.push(`agent url must be https (got ${url})`);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    card: {
      name: o.name as string,
      description: o.description as string,
      url,
      version: o.version as string,
      protocolVersion: o.protocolVersion as string,
      capabilities: { streaming: caps.streaming === true, pushNotifications: caps.pushNotifications === true },
      defaultInputModes: inputModes,
      defaultOutputModes: outputModes,
      skills,
      provider: typeof o.provider === "object" && o.provider !== null ? (o.provider as AgentCard["provider"]) : undefined,
      legacyLocation: opts.fromLegacyLocation === true,
    },
  };
}

/** Fetch + validate a card. Refuses when fenced off. (Renderer fetch only; no commands added.) */
export async function discoverAgentCard(host: string): Promise<{ ok: true; card: AgentCard } | { ok: false; error: string }> {
  if (!a2aEnabled()) return { ok: false, error: fence().error };
  const base = host.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}${CARD_LOCATION}`);
    if (!res.ok) return { ok: false, error: `${CARD_LOCATION} answered ${res.status}` };
    const parsed = parseAgentCard(await res.json());
    return parsed.ok ? { ok: true, card: parsed.card } : { ok: false, error: parsed.errors.join("; ") };
  } catch (e) {
    return { ok: false, error: `card discovery failed: ${(e as Error).message}` };
  }
}

/** MJ's own card, in A2A terms. Local documentation — nothing serves it over the network. */
export function agentCardForMission(mission: { id: string; title: string; description: string; steps: Array<{ id: string; title: string; summary: string }> }): AgentCard {
  return {
    name: `MJ Mission: ${mission.title}`,
    description: mission.description,
    url: "http://localhost/local-mj",
    version: "11.0.0",
    protocolVersion: "0.3",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: mission.id,
        name: mission.title,
        description: `A supervised MJ mission with ${mission.steps.length} checkpointed steps: ${mission.steps.map((s) => s.title).join(" → ")}`,
        tags: ["mj", "supervised", "local"],
      },
    ],
  };
}

export interface SeatDraft {
  draft: true;
  source: "a2a-card";
  name: string;
  url: string;
  streaming: boolean;
  inputModes: string[];
  outputModes: string[];
  skills: Array<{ id: string; name: string; tags: string[] }>;
  /** What a human must confirm before this draft could ever become a seat. */
  requiresHumanConfirmation: string[];
}

/** Card → seat DRAFT. Drafts never execute; they are what the human reviews. */
export function remoteAgentToSeatDraft(card: AgentCard): { ok: true; draft: SeatDraft; fence: string } | { ok: false; error: string } {
  if (!a2aEnabled()) return { ok: false, error: fence().error };
  return {
    ok: true,
    draft: {
      draft: true,
      source: "a2a-card",
      name: card.name,
      url: card.url,
      streaming: card.capabilities.streaming,
      inputModes: card.defaultInputModes,
      outputModes: card.defaultOutputModes,
      skills: card.skills.map((s) => ({ id: s.id, name: s.name, tags: s.tags })),
      requiresHumanConfirmation: [
        "the human reads the card's provider and skills before any draft becomes a seat",
        "the runtime never calls this url in V11 — invocation is future work, gated behind the same flag",
        `legacy location: ${card.legacyLocation ? "yes ( /.well-known/agent.json — the card predates v0.3 )" : "no"}`,
      ],
    },
    fence: fence().error,
  };
}
