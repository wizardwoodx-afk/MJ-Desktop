import assert from "node:assert/strict";
import { HARNESSES, type HarnessId } from "../src/domain/harness";
import { AGENT_CAPABILITIES, EXECUTABLE_HARNESSES, binaryVerifiedHarnesses } from "../src/mission/agentCapabilities";
import { composeSeatArgv, type TeamSeat } from "../src/mission/agentTeam";
import {
  DEFAULT_CHANNELS,
  InterAgentMessageBus,
  type InterAgentMessage,
} from "../src/mission/interAgentChannel";

console.log("\n== 0. all 14 coding CLI agents are registered and supported ==");

const EXPECTED_HARNESS_IDS: HarnessId[] = [
  "claude",
  "codex",
  "opencode",
  "cursor",
  "grok",
  "cline",
  "aider",
  "gemini",
  "goose",
  "qwen",
  "amazonq",
  "kilo",
  "hermes",
  "acp",
  "llm",
];

for (const id of EXPECTED_HARNESS_IDS) {
  const harness = HARNESSES.find((h) => h.id === id);
  assert(harness, `harness ${id} is registered in HARNESSES`);
  assert(harness.name.length > 0, `harness ${id} has a human readable name`);
  assert(AGENT_CAPABILITIES[id], `harness ${id} is present in AGENT_CAPABILITIES`);
}
console.log(`  ok   all ${EXPECTED_HARNESS_IDS.length} harnesses present with full capability specs`);

const supportedList = EXECUTABLE_HARNESSES;
assert(supportedList.length >= 13, `EXECUTABLE_HARNESSES returns >= 13 CLI providers`);
console.log(`  ok   EXECUTABLE_HARNESSES returns ${supportedList.length} providers`);

console.log("\n== 1. headless argv composition for newly added CLIs ==");

// Aider
const aiderSeat: TeamSeat = {
  id: "seat_aider",
  role: "coder",
  harness: "aider",
  model: null,
  mayWrite: true,
  maxRisk: "MEDIUM",
  timeoutSecs: 600,
  maxTurns: 10,
  instructions: "Fix tests",
};
const aiderComposed = composeSeatArgv(aiderSeat, { prompt: "Fix bug", cwd: "/test", readOnly: false });
assert.equal(aiderComposed.bin, "aider");
assert(aiderComposed.argv.includes("--message"), "aider has --message");
assert(aiderComposed.argv.includes("--yes"), "aider has --yes for non-interactive execution");
assert(aiderComposed.argv.includes("--no-auto-commits"), "aider has --no-auto-commits");
console.log("  ok   aider composes correct non-interactive argv");

// Goose
const gooseSeat: TeamSeat = {
  id: "seat_goose",
  role: "coder",
  harness: "goose",
  model: null,
  mayWrite: true,
  maxRisk: "MEDIUM",
  timeoutSecs: 600,
  maxTurns: 10,
  instructions: "Refactor code",
};
const gooseComposed = composeSeatArgv(gooseSeat, { prompt: "Refactor", cwd: "/test", readOnly: false });
assert.equal(gooseComposed.bin, "goose");
assert(gooseComposed.argv.includes("run"), "goose has 'run' subcommand");
assert(gooseComposed.argv.includes("--text"), "goose has '--text' argument");
console.log("  ok   goose composes correct headless argv");

// Gemini
const geminiSeat: TeamSeat = {
  id: "seat_gemini",
  role: "reviewer",
  harness: "gemini",
  model: null,
  mayWrite: false,
  maxRisk: "LOW",
  timeoutSecs: 600,
  maxTurns: 10,
  instructions: "Analyze diff",
};
const geminiComposed = composeSeatArgv(geminiSeat, { prompt: "Analyze", cwd: "/test", readOnly: true });
assert.equal(geminiComposed.bin, "gemini");
assert(geminiComposed.argv.includes("-p"), "gemini has '-p' print prompt argument");
assert(geminiComposed.argv.includes("--approval-mode") && geminiComposed.argv.includes("plan"), "gemini uses --approval-mode plan for Plan Mode");
console.log("  ok   gemini CLI composes correct plan mode argv");

// Qwen
const qwenSeat: TeamSeat = {
  id: "seat_qwen",
  role: "coder",
  harness: "qwen",
  model: null,
  mayWrite: true,
  maxRisk: "MEDIUM",
  timeoutSecs: 600,
  maxTurns: 10,
  instructions: "Generate patch",
};
const qwenComposed = composeSeatArgv(qwenSeat, { prompt: "Patch", cwd: "/test", readOnly: false });
assert.equal(qwenComposed.bin, "qwen");
assert(qwenComposed.argv.includes("-p"), "qwen has '-p' print prompt argument");
console.log("  ok   qwen composes correct non-interactive argv");

// Amazon Q / Kiro CLI
const amazonqSeat: TeamSeat = {
  id: "seat_q",
  role: "coder",
  harness: "amazonq",
  model: null,
  mayWrite: true,
  maxRisk: "MEDIUM",
  timeoutSecs: 600,
  maxTurns: 10,
  instructions: "Check security",
};
const amazonqComposed = composeSeatArgv(amazonqSeat, { prompt: "Check", cwd: "/test", readOnly: true });
assert(amazonqComposed.bin === "kiro-cli" || amazonqComposed.bin === "amazonq", "amazonq resolves to kiro-cli or amazonq");
assert(amazonqComposed.argv.includes("chat"), "amazonq has chat subcommand");
assert(amazonqComposed.argv.includes("--no-interactive"), "amazonq has --no-interactive flag");
console.log("  ok   amazonq composes correct headless argv");

console.log("\n== 2. Inter-Agent Message Bus Pub/Sub & Channels ==");

const bus = new InterAgentMessageBus();
assert.equal(DEFAULT_CHANNELS.length, 5, "5 default channels initialized");

let receivedMessages: InterAgentMessage[] = [];
const unsub = bus.subscribe((msg) => {
  receivedMessages.push(msg);
});

const msg1 = bus.publish({
  channel: "#architecture",
  sender: { seatId: "claude_planner", role: "planner", harness: "claude", name: "Claude Code" },
  mentions: ["@coder", "@reviewer"],
  intent: "proposal",
  content: "Proposing API schema for payment endpoints.",
});

assert.equal(receivedMessages.length, 1);
assert.equal(receivedMessages[0].id, msg1.id);
assert.equal(receivedMessages[0].channel, "#architecture");
assert.equal(receivedMessages[0].intent, "proposal");
console.log("  ok   published and subscribed to message successfully");

// Channel-specific querying
const archMessages = bus.getMessages({ channel: "#architecture" });
assert.equal(archMessages.length, 1);
const syncMessages = bus.getMessages({ channel: "#implementation-sync" });
assert.equal(syncMessages.length, 0);
console.log("  ok   channel filtering queries work accurately");

// Mention filtering
const coderMessages = bus.getMessages({ mention: "@coder" });
assert.equal(coderMessages.length, 1);
const strangerMessages = bus.getMessages({ mention: "@stranger" });
assert.equal(strangerMessages.length, 0);
console.log("  ok   mention routing correctly detects tagged seats");

console.log("\n== 3. Threading and replies ==");

const msg2 = bus.publish({
  channel: "#architecture",
  replyToId: msg1.id,
  sender: { seatId: "codex_coder", role: "coder", harness: "codex", name: "OpenAI Codex" },
  mentions: ["@claude_planner"],
  intent: "contract",
  content: "Contract accepted. Implementing rate-limiter interface.",
});

const thread = bus.getThread(msg1.id);
assert.equal(thread.length, 2);
assert.equal(thread[0].id, msg1.id);
assert.equal(thread[1].id, msg2.id);
console.log("  ok   thread recreation preserves hierarchy and ordering");

console.log("\n== 4. Shared Blackboard State & Versioning ==");

let blackboardEvents: string[] = [];
bus.subscribeBlackboard((entry) => {
  blackboardEvents.push(entry.key);
});

const entry1 = bus.writeBlackboard("api.payment_spec", "export interface PaymentDto { amount: number; }", "codex_coder", "contract");
assert.equal(entry1.version, 1);
assert.equal(entry1.key, "api.payment_spec");
assert.equal(entry1.author, "codex_coder");

// Update same key
const entry2 = bus.writeBlackboard("api.payment_spec", "export interface PaymentDto { amount: number; currency: string; }", "claude_planner", "contract");
assert.equal(entry2.version, 2);
assert.equal(blackboardEvents.length, 2);

const retrieved = bus.readBlackboard("api.payment_spec");
assert.equal(retrieved?.version, 2);
assert(retrieved?.value.includes("currency: string"));
console.log("  ok   blackboard writes increment versions and notify subscribers");

unsub();
console.log("\nInter-Agent parallel channel tests passed cleanly!\n");
