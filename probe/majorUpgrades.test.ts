import assert from "node:assert/strict";
import { parseSemanticBlocks, synthesizeAstMerge } from "../src/mission/astSynthesizer";
import { runAdversarialDuel, STANDARD_ATTACK_VECTORS } from "../src/mission/adversarialArena";
import { evaluateConsensus, AgentReputationLedger, type ReviewVote } from "../src/mission/consensusEngine";
import { OrganizationalMemoryCortex } from "../src/mission/organizationalMemory";
import { globalMockBridge } from "../src/mission/contractMockBridge";
import { globalChaosEngine } from "../src/mission/chaosBisection";
import { PROLIFERATE_COMPARISON_MATRIX } from "../src/mission/proliferateMatrix";

console.log("\n== 1. Semantic AST 3-Way Merge & Interface Union ==");

const baseCode = `import { Request, Response } from "express";

export interface AppConfig {
  port: number;
}

export function createApp() {
  return { ok: true };
}
`;

const branch1Code = `import { Request, Response } from "express";
import { TokenBucket } from "./bucket";

export interface AppConfig {
  port: number;
  rateLimitTokens: number;
}

export function rateLimitMiddleware(req: Request, res: Response) {
  return true;
}

export function createApp() {
  return { ok: true };
}
`;

const branch2Code = `import { Request, Response } from "express";
import { auditLogger } from "./logger";

export interface AppConfig {
  port: number;
  enableAuditLogs: boolean;
}

export function auditLogMiddleware(req: Request, res: Response) {
  auditLogger.log(req.path);
}

export function createApp() {
  return { ok: true };
}
`;

const parsed = parseSemanticBlocks(branch1Code, "src/app.ts");
assert.equal(parsed.imports.length, 2, "2 import statements parsed");
assert.equal(parsed.types.length, 1, "1 interface parsed");
assert.equal(parsed.declarations.length, 2, "2 functions parsed");
console.log("  ok   semantic block decomposition correctly categorizes AST nodes");

const mergeResult = synthesizeAstMerge("src/app.ts", baseCode, [
  { seatId: "claude_coder", branch: "mj/feat-ratelimit", content: branch1Code },
  { seatId: "codex_coder", branch: "mj/feat-auditlog", content: branch2Code },
]);

assert.equal(mergeResult.success, true, "merge succeeded");
assert(mergeResult.mergedContent.includes("rateLimitMiddleware"), "contains branch 1 addition");
assert(mergeResult.mergedContent.includes("auditLogMiddleware"), "contains branch 2 addition");
assert(mergeResult.mergedContent.includes("TokenBucket"), "contains branch 1 import");
assert(mergeResult.mergedContent.includes("auditLogger"), "contains branch 2 import");
// Critical check: Interface member union preserved both rateLimitTokens and enableAuditLogs
assert(mergeResult.mergedContent.includes("rateLimitTokens"), "interface union contains branch 1 rateLimitTokens");
assert(mergeResult.mergedContent.includes("enableAuditLogs"), "interface union contains branch 2 enableAuditLogs");
assert(!mergeResult.mergedContent.includes("<<<<<<< HEAD"), "contains zero git conflict markers");
console.log("  ok   synthesizes clean structural AST union preserving all interface properties from parallel worktrees");

console.log("\n== 2. Autonomous Red-Team vs Blue-Team Adversarial Arena ==");

async function testArena() {
  const duelReport = await runAdversarialDuel({
    objective: "Implement token bucket middleware",
    defenderSeatId: "claude_builder",
    defenderHarness: "claude",
    attackerSeatId: "grok_fuzzer",
    attackerHarness: "grok",
    targetCwd: "/workspace",
    maxRounds: 3,
  });

  assert.equal(duelReport.roundsExecuted, 3, "3 rounds executed");
  assert(duelReport.defenseScore >= 0 && duelReport.defenseScore <= 100, `defense score bounded in [0, 100]% (got ${duelReport.defenseScore}%)`);
  assert.equal(duelReport.isSimulated, true, "labeled as simulation when testRunner is not attached");
  assert(duelReport.summary.includes("[SIMULATION / PROTOTYPE DUEL]"), "summary includes simulation label");
  assert(duelReport.rounds.some((r) => r.defenseStatus === "patched"), "at least one patch applied during duel");
  console.log("  ok   adversarial duel generates probes, detects race conditions, bounds score, and marks simulation accurately");
}
await testArena();

console.log("\n== 3. Reputation-Weighted Multi-Agent Consensus ==");

const dynamicRepLedger = new AgentReputationLedger();
dynamicRepLedger.recordOutcome("claude", { verifiedCommit: true, accurateReview: true });
dynamicRepLedger.recordOutcome("codex", { verifiedCommit: true, accurateReview: true });
dynamicRepLedger.recordOutcome("grok", { falseAlarm: true });

const unanimousVotes: ReviewVote[] = [
  { seatId: "claude_rev", harness: "claude", verdict: "APPROVE", confidence: 0.95, rationale: "LGTM", diffRef: "ref", timestamp: new Date().toISOString() },
  { seatId: "codex_rev", harness: "codex", verdict: "APPROVE", confidence: 0.90, rationale: "All tests pass", diffRef: "ref", timestamp: new Date().toISOString() },
];

const res1 = evaluateConsensus("Test Objective", unanimousVotes, dynamicRepLedger);
assert.equal(res1.status, "APPROVED");
assert(res1.consensusScore >= 0.8, "unanimous approval score >= 0.8");
console.log("  ok   unanimous approval passes with dynamic reputation weights");

const dissentingVotes: ReviewVote[] = [
  { seatId: "claude_rev", harness: "claude", verdict: "APPROVE", confidence: 0.80, rationale: "Looks ok", diffRef: "ref", timestamp: new Date().toISOString() },
  { seatId: "codex_rev", harness: "codex", verdict: "REJECT", confidence: 0.95, rationale: "Buffer overrun in parseJson", diffRef: "ref", timestamp: new Date().toISOString() },
];

const res2 = evaluateConsensus("Test Objective", dissentingVotes, dynamicRepLedger);
assert.equal(res2.status, "ARBITRATION_REQUIRED");
assert(res2.arbitrationAction?.includes("Deadlock detected"), "deadlock triggers automated arbitration");
console.log("  ok   reputation-weighted dissenting vote triggers arbitration");

console.log("\n== 4. Causal Organizational Memory Cortex ==");

const cortex = new OrganizationalMemoryCortex();
const inv = cortex.recordRepairSuccess(
  "security",
  "Unvalidated redirect in auth callback",
  "Enforced whitelist domain check before redirection",
  "mission-auth-09",
  "All HTTP 302 redirects must validate domain against trusted whitelist.",
);

assert.equal(inv.category, "security");
const compiled = cortex.compileBriefing();
assert(compiled.invariantsCompiled >= 4, "compiled >= 4 active invariants");
assert(compiled.generatedBriefingMarkdown.includes("ORGANIZATIONAL MEMORY"), "generated briefing markdown header present");
assert(compiled.generatedBriefingMarkdown.includes("trusted whitelist"), "newly learned invariant present in briefing");
console.log("  ok   memory cortex extracts causal repairs and compiles pre-flight briefings");

console.log("\n== 5. Synthetic Contract Mock Bridge & Chaos Bisection (Beyond Proliferate) ==");

// Test Contract Mock Bridge
const mockBridge = globalMockBridge.compileFromBlackboard({
  key: "contracts.payment_api",
  author: "claude_architect",
  updatedAt: new Date().toISOString(),
  category: "contract",
  value: "export interface RateLimitResult { allowed: boolean; remaining: number; resetMs: number; }",
  version: 1,
});

assert.equal(mockBridge.endpoints.length, 2, "2 mock endpoints generated");
const res = globalMockBridge.handleMockRequest("POST", "/api/v1/ratelimit/consume");
assert.equal(res?.status, 200, "mock endpoint responds 200");
console.log("  ok   contract mock bridge auto-generates live in-memory mock endpoints from blackboard schemas");

// Test Chaos Flaky Test Isolator
const diagnosis = await globalChaosEngine.isolateFlakyRace({
  testName: "test_token_bucket_burst_concurrency",
  targetFilePath: "src/bucket.ts",
  sourceCode: "this.tokens = this.tokens - count;",
});

assert.equal(diagnosis.reproducedInRuns <= 5, true, "flaky race condition reproduced in <= 5 runs");
assert(diagnosis.atomicLockPatch.includes("mutex"), "atomic mutex patch generated");
assert.equal(diagnosis.isSimulated, true, "diagnosis is marked simulated when unattached");
assert.equal(diagnosis.verifiedFixed, false, "verifiedFixed is false in simulation mode without verification runner");
console.log("  ok   chaos bisection engine isolates async race conditions in <= 5 runs with honest simulation flag");

assert.equal(PROLIFERATE_COMPARISON_MATRIX.length, 7, "7 architectural dimensions documented in comparison matrix");
console.log("  ok   proliferate architectural comparison matrix complete with 7 key dimensions");

console.log("\nAll major upgrade engines verified!\n");
