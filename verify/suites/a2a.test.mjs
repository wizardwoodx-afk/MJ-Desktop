import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/version.ts
var MJ_VERSION = "11.8.1";
var MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");
var MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;

// src/mission/a2a.ts
function a2aEnabled() {
  return typeof process !== "undefined" && process.env?.MJ_A2A_ENABLED === "1";
}
function fence() {
  return {
    ok: false,
    fenced: true,
    error: "A2A is fenced OFF in this build (set MJ_A2A_ENABLED=1 at build time to opt in). Discovery is available for reading cards, but nothing here can start a remote task \u2014 supervision does not cross the network boundary yet."
  };
}
var REQUIRED_TEXT = ["name", "description", "url", "version", "protocolVersion"];
function parseAgentCard(raw, opts = {}) {
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["an agent card must be a JSON object"] };
  const o = raw;
  const errors = [];
  for (const k of REQUIRED_TEXT) {
    if (typeof o[k] !== "string" || o[k].trim() === "") errors.push(`missing or empty required string: ${k}`);
  }
  const caps = typeof o.capabilities === "object" && o.capabilities !== null ? o.capabilities : {};
  if (typeof o.capabilities !== "object" || o.capabilities === null) errors.push("missing required object: capabilities");
  const inputModes = Array.isArray(o.defaultInputModes) ? o.defaultInputModes.filter((m) => typeof m === "string") : [];
  const outputModes = Array.isArray(o.defaultOutputModes) ? o.defaultOutputModes.filter((m) => typeof m === "string") : [];
  if (!Array.isArray(o.defaultInputModes)) errors.push("missing required array: defaultInputModes (MIME types)");
  if (!Array.isArray(o.defaultOutputModes)) errors.push("missing required array: defaultOutputModes (MIME types)");
  const skills = [];
  if (Array.isArray(o.skills)) {
    for (const s of o.skills) {
      const sk = typeof s === "object" && s !== null ? s : {};
      if (typeof sk.id !== "string" || typeof sk.name !== "string" || typeof sk.description !== "string") {
        errors.push("a skill entry needs id, name and description strings");
        continue;
      }
      skills.push({ id: sk.id, name: sk.name, description: sk.description, tags: Array.isArray(sk.tags) ? sk.tags.filter((t) => typeof t === "string") : [] });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const url = o.url;
  if (!url.startsWith("https://") && !url.startsWith("http://localhost")) errors.push(`agent url must be https (got ${url})`);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    card: {
      name: o.name,
      description: o.description,
      url,
      version: o.version,
      protocolVersion: o.protocolVersion,
      capabilities: { streaming: caps.streaming === true, pushNotifications: caps.pushNotifications === true },
      defaultInputModes: inputModes,
      defaultOutputModes: outputModes,
      skills,
      provider: typeof o.provider === "object" && o.provider !== null ? o.provider : void 0,
      legacyLocation: opts.fromLegacyLocation === true
    }
  };
}
function agentCardForMission(mission2) {
  return {
    name: `MJ Mission: ${mission2.title}`,
    description: mission2.description,
    url: "http://localhost/local-mj",
    version: MJ_VERSION,
    protocolVersion: "0.3",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: mission2.id,
        name: mission2.title,
        description: `A supervised MJ mission with ${mission2.steps.length} checkpointed steps: ${mission2.steps.map((s) => s.title).join(" \u2192 ")}`,
        tags: ["mj", "supervised", "local"]
      }
    ]
  };
}
function remoteAgentToSeatDraft(card2) {
  if (!a2aEnabled()) return { ok: false, error: fence().error };
  return {
    ok: true,
    draft: {
      draft: true,
      source: "a2a-card",
      name: card2.name,
      url: card2.url,
      streaming: card2.capabilities.streaming,
      inputModes: card2.defaultInputModes,
      outputModes: card2.defaultOutputModes,
      skills: card2.skills.map((s) => ({ id: s.id, name: s.name, tags: s.tags })),
      requiresHumanConfirmation: [
        "the human reads the card's provider and skills before any draft becomes a seat",
        "the runtime never calls this url in V11 \u2014 invocation is future work, gated behind the same flag",
        `legacy location: ${card2.legacyLocation ? "yes ( /.well-known/agent.json \u2014 the card predates v0.3 )" : "no"}`
      ]
    },
    fence: fence().error
  };
}

// probe/a2a.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
section("0. the fence is real and default-off");
ok("A2A is OFF unless the build opts in", a2aEnabled() === false);
var fencedSeat = remoteAgentToSeatDraft({
  name: "x",
  description: "x",
  url: "https://a.example",
  version: "1",
  protocolVersion: "0.3",
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: [],
  defaultOutputModes: [],
  skills: []
});
ok("seat drafts are refused while fenced, with a loud reason", fencedSeat.ok === false && fencedSeat.error.includes("fenced OFF"));
section("1. card validation \u2014 the contract half");
var good = {
  name: "Research Agent",
  description: "Finds things",
  url: "https://research.example",
  version: "2.1.0",
  protocolVersion: "0.3",
  capabilities: { streaming: true, pushNotifications: false },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain", "application/json"],
  skills: [{ id: "s1", name: "Search", description: "Web search", tags: ["search"] }]
};
var parsed = parseAgentCard(good);
ok("a valid v0.3 card parses", parsed.ok === true);
if (parsed.ok) {
  ok("capabilities are normalized to booleans", parsed.card.capabilities.streaming === true && parsed.card.capabilities.pushNotifications === false);
  ok("skills keep their tags", parsed.card.skills[0]?.tags[0] === "search");
}
for (const [field, note] of [["url", "url"], ["protocolVersion", "protocolVersion"], ["defaultInputModes", "input modes"]]) {
  const broken = { ...good };
  delete broken[field];
  const r = parseAgentCard(broken);
  ok(`missing ${note} is rejected by name`, r.ok === false && r.errors.some((e) => e.includes(String(field))));
}
var httpCard = parseAgentCard({ ...good, url: "http://insecure.example" });
ok("plaintext (non-localhost) urls are rejected", httpCard.ok === false && httpCard.errors.some((e) => e.includes("https")));
var legacy = parseAgentCard(good, { fromLegacyLocation: true });
ok("legacy agent.json cards are accepted but labelled", legacy.ok === true && legacy.card.legacyLocation === true);
ok("garbage is rejected, not crashed on", parseAgentCard("not a card").ok === false && parseAgentCard(null).ok === false);
section("2. MJ's own card and the draft a human reviews");
var mission = {
  id: "m-1",
  title: "Refactor store",
  description: "Split the graph store",
  steps: [{ id: "s1", title: "Read", summary: "map the module" }, { id: "s2", title: "Split", summary: "extract slices" }]
};
var card = agentCardForMission(mission);
ok("mission \u2192 card keeps the mission as a skill", card.skills[0]?.id === "m-1" && card.skills[0]?.name === "Refactor store");
ok("MJ's card is honest about being local", card.url.startsWith("http://localhost") && card.tags?.every(() => true) !== false);
ok("MJ's card claims no streaming it does not do", card.capabilities.streaming === false && card.capabilities.pushNotifications === false);
process.env.MJ_A2A_ENABLED = "1";
var draft = remoteAgentToSeatDraft(parsed.ok ? parsed.card : null);
ok("with the flag on, a draft is produced but is only a draft", draft.ok === true && draft.draft.draft === true);
ok("the draft demands human confirmation before anything runs", draft.ok === true && draft.draft.requiresHumanConfirmation.length >= 2);
ok("the draft states V11 never calls the url", draft.ok === true && draft.draft.requiresHumanConfirmation.some((r) => r.includes("never calls this url")));
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
