/**
 * A2A probe (V11, W7). The fence is the feature: discovery reads cards; nothing calls agents.
 *
 * Run: ./node_modules/.bin/esbuild probe/a2a.test.ts --bundle --platform=node --format=esm \
 *        --outfile=/tmp/a2a.mjs --log-level=error && node /tmp/a2a.mjs
 */
import { a2aEnabled, agentCardForMission, parseAgentCard, remoteAgentToSeatDraft } from "../src/mission/a2a";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}`);
}

section("0. the fence is real and default-off");
ok("A2A is OFF unless the build opts in", a2aEnabled() === false);
const fencedSeat = remoteAgentToSeatDraft({
  name: "x", description: "x", url: "https://a.example", version: "1", protocolVersion: "0.3",
  capabilities: { streaming: false, pushNotifications: false }, defaultInputModes: [], defaultOutputModes: [], skills: [],
});
ok("seat drafts are refused while fenced, with a loud reason", fencedSeat.ok === false && fencedSeat.error.includes("fenced OFF"));

section("1. card validation — the contract half");
const good = {
  name: "Research Agent", description: "Finds things", url: "https://research.example",
  version: "2.1.0", protocolVersion: "0.3",
  capabilities: { streaming: true, pushNotifications: false },
  defaultInputModes: ["text/plain"], defaultOutputModes: ["text/plain", "application/json"],
  skills: [{ id: "s1", name: "Search", description: "Web search", tags: ["search"] }],
};
const parsed = parseAgentCard(good);
ok("a valid v0.3 card parses", parsed.ok === true);
if (parsed.ok) {
  ok("capabilities are normalized to booleans", parsed.card.capabilities.streaming === true && parsed.card.capabilities.pushNotifications === false);
  ok("skills keep their tags", parsed.card.skills[0]?.tags[0] === "search");
}
for (const [field, note] of [["url", "url"], ["protocolVersion", "protocolVersion"], ["defaultInputModes", "input modes"]] as const) {
  const broken: Record<string, unknown> = { ...good };
  delete broken[field];
  const r = parseAgentCard(broken);
  ok(`missing ${note} is rejected by name`, r.ok === false && r.errors.some((e) => e.includes(String(field))));
}
const httpCard = parseAgentCard({ ...good, url: "http://insecure.example" });
ok("plaintext (non-localhost) urls are rejected", httpCard.ok === false && httpCard.errors.some((e) => e.includes("https")));
const legacy = parseAgentCard(good, { fromLegacyLocation: true });
ok("legacy agent.json cards are accepted but labelled", legacy.ok === true && legacy.card.legacyLocation === true);
ok("garbage is rejected, not crashed on", parseAgentCard("not a card").ok === false && parseAgentCard(null).ok === false);

section("2. MJ's own card and the draft a human reviews");
const mission = {
  id: "m-1", title: "Refactor store", description: "Split the graph store",
  steps: [{ id: "s1", title: "Read", summary: "map the module" }, { id: "s2", title: "Split", summary: "extract slices" }],
};
const card = agentCardForMission(mission);
ok("mission → card keeps the mission as a skill", card.skills[0]?.id === "m-1" && card.skills[0]?.name === "Refactor store");
ok("MJ's card is honest about being local", card.url.startsWith("http://localhost") && card.tags?.every(() => true) !== false);
ok("MJ's card claims no streaming it does not do", card.capabilities.streaming === false && card.capabilities.pushNotifications === false);
process.env.MJ_A2A_ENABLED = "1";
const draft = remoteAgentToSeatDraft(parsed.ok ? parsed.card : (null as never));
ok("with the flag on, a draft is produced but is only a draft", draft.ok === true && (draft as { draft: { draft: boolean } }).draft.draft === true);
ok("the draft demands human confirmation before anything runs", draft.ok === true && (draft as { draft: { requiresHumanConfirmation: string[] } }).draft.requiresHumanConfirmation.length >= 2);
ok("the draft states V11 never calls the url", draft.ok === true && (draft as { draft: { requiresHumanConfirmation: string[] } }).draft.requiresHumanConfirmation.some((r) => r.includes("never calls this url")));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
