/**
 * Tests for §6/§10/§33 at the execution boundary: the risk class must become a real sandbox
 * argument, and usage parsing must produce a number only when the harness actually reported one.
 *
 * The fixtures below are shaped like real CLI output (Claude Code `--output-format json`,
 * Codex `--json` NDJSON, OpenCode `--format json` events). If a harness changes its schema this
 * test goes red, which is the point: MJ would otherwise silently stop measuring spend.
 */

import { ENFORCED_SANDBOX, parseUsage, permissionPreamble, policyFor, type HarnessPolicyRequest } from "../src/mission/harnessPolicy";
import { preambleFor } from "../src/mission/harnessAdapters";
import { HARNESSES } from "../src/domain/harness";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);

const base: HarnessPolicyRequest = {
  risk: "MEDIUM",
  mayWriteFiles: true,
  mayRunShell: true,
  mayUseBrowser: false,
  maxTurns: 12,
  kind: "implementation",
};
const has = (argv: string[], ...flags: string[]) => flags.every((f) => argv.includes(f));

console.log("\n== risk class becomes a real sandbox ==\n");

{
  const p = policyFor("claude", { ...base, risk: "LOW" });
  ok(p.readOnly, "LOW risk must be read-only for Claude Code");
  ok(has(p.argv, "--permission-mode", "plan"), `LOW must pass --permission-mode plan, got ${p.argv.join(" ")}`);
  ok(has(p.argv, "--tools", ""), "LOW must strip tools entirely with --tools ''");
  ok(!p.argv.includes("acceptEdits"), "LOW must never pass acceptEdits");
}
{
  const p = policyFor("claude", base);
  ok(!p.readOnly && p.canWrite, "MEDIUM with filesystemWrite must be able to write");
  ok(has(p.argv, "--permission-mode", "acceptEdits"), "MEDIUM must pass acceptEdits");
  ok(has(p.argv, "--output-format", "json"), "must request JSON so cost is measurable");
  ok(has(p.argv, "--max-turns", "12"), `must cap turns, got ${p.argv.join(" ")}`);
  ok(!has(p.argv, "--dangerously-skip-permissions"), "must never bypass permissions");
}
{
  const p = policyFor("claude", { ...base, risk: "CRITICAL" });
  ok(p.readOnly, "CRITICAL must be read-only");
  ok(Boolean(p.refused), "CRITICAL must state that it was refused");
  ok(!has(p.argv, "acceptEdits"), "CRITICAL must not grant writes");
}
{
  const p = policyFor("codex", base);
  ok(has(p.argv, "--sandbox", "workspace-write"), `codex write must use --sandbox workspace-write, got ${p.argv.join(" ")}`);
  ok(!has(p.argv, "--full-auto"), "must not use the deprecated --full-auto");
  ok(!has(p.argv, "--dangerously-bypass-approvals-and-sandbox", "--yolo"), "must never bypass the sandbox");
  ok(has(p.argv, "--json"), "must request JSON events");
}
{
  const p = policyFor("codex", { ...base, kind: "review" });
  ok(has(p.argv, "--sandbox", "read-only"), "review work must be read-only even when writes are allowed");
  ok(p.readOnly, "review policy must report readOnly");
}
{
  const p = policyFor("opencode", base);
  ok(has(p.argv, "--agent", "build"), "opencode write shape must use the build agent");
  ok(has(p.argv, "--format", "json"), "opencode must request json events");
  const ro = policyFor("opencode", { ...base, mayWriteFiles: false });
  ok(has(ro.argv, "--agent", "plan"), "opencode read-only must use the plan agent");
}
{
  // §33: a boundary that denies writes must produce read-only even at MEDIUM/HIGH risk.
  const p = policyFor("claude", { ...base, mayWriteFiles: false, risk: "HIGH" });
  ok(p.readOnly, "boundary denying filesystemWrite must force read-only at HIGH risk");
  ok(!p.canWrite, "canWrite must be false when the boundary denies it");
}
{
  // Harnesses with no enforced sandbox must not claim one.
  const p = policyFor("cursor", base);
  ok(ENFORCED_SANDBOX.cursor === false, "cursor is not expected to have an enforced sandbox");
  ok(/advisory/i.test(p.grant), `cursor must say the control is advisory, got: ${p.grant}`);
  ok(p.canWrite, "cursor write shape still reports canWrite");
}
{
  // Every real harness must produce argv that contains the prompt exactly once.
  for (const h of HARNESSES.filter((x) => x.id !== "llm")) {
    const p = policyFor(h.id, base);
    eq(p.argv.filter((a) => a === "$PROMPT").length, 1, `${h.id} must place $PROMPT exactly once`);
    ok(p.argv.length >= 1, `${h.id} produced empty argv`);
  }
}

console.log("\n== real usage parsing ==\n");

{
  const claudeOut = JSON.stringify({
    type: "result",
    subtype: "success",
    result: "Implemented the billing webhook and added 4 tests.",
    session_id: "abc-123",
    num_turns: 7,
    total_cost_usd: 0.4182,
    usage: { input_tokens: 18234, output_tokens: 4120 },
  });
  const u = parseUsage("claude", claudeOut);
  eq(u.costUsd, 0.4182, "claude cost must come from total_cost_usd");
  eq(u.tokens, 22354, "claude tokens must be input+output");
  eq(u.text, "Implemented the billing webhook and added 4 tests.", "claude text must be the result field");
  ok(/total_cost_usd=0.4182/.test(u.source), "source must state what was parsed");
}
{
  const u = parseUsage("claude", "I could not run the tests because npm is missing.");
  eq(u.costUsd, null, "no JSON means no invented cost");
  eq(u.tokens, null, "no JSON means no invented token count");
  eq(u.text, "I could not run the tests because npm is missing.", "plain text must survive");
}
{
  const codexOut = [
    '{"type":"thread.started","thread_id":"t1"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"type":"command_execution"}}',
    '{"type":"turn.completed","usage":{"input_tokens":9000,"output_tokens":1500}}',
  ].join("\n");
  const u = parseUsage("codex", codexOut);
  eq(u.tokens, 10500, "codex tokens must come from the turn.completed usage");
  eq(u.costUsd, null, "codex does not report dollars — MJ must not guess a price");
  ok(/4 NDJSON event/.test(u.source), `source must count events, got ${u.source}`);
}
{
  const opencodeOut = [
    '{"type":"text","part":{"type":"text","text":"Fixed the failing assertion."}}',
    '{"type":"step_finish","part":{"type":"step-finish","cost":0.0321,"tokens":{"input":5210,"output":940,"reasoning":120}}}',
  ].join("\n");
  const u = parseUsage("opencode", opencodeOut);
  eq(u.costUsd, 0.0321, "opencode cost must come from step_finish");
  eq(u.tokens, 6270, "opencode tokens must include reasoning tokens");
  eq(u.text, "Fixed the failing assertion.", "opencode text must be assembled from text parts");
}
{
  const u = parseUsage("grok", "done");
  eq(u.costUsd, null, "harnesses without a machine format must report null, not 0");
  ok(/no machine-readable usage/.test(u.source), "source must say nothing was measurable");
}

console.log("\n== the stated contract ==\n");

{
  const policy = policyFor("claude", base);
  const text = preambleFor({ grantedPermissions: { filesystemWrite: true, shell: true, credentials: false } } as never, policy);
  ok(/Allowed: filesystemWrite, shell/.test(text), `preamble must list what is allowed, got: ${text}`);
  ok(/Denied: credentials/.test(text), "preamble must list what is denied");
  ok(/Do not work around it/.test(text), "preamble must forbid working around a denial");
  ok(text.includes(policy.grant), "preamble must state the sandbox");
}
{
  const p: { grant: string } = { grant: "Read-only, enforced by the harness (no file writes, no shell)." };
  const text = permissionPreamble({ filesystemWrite: false, shell: false }, p as never);
  ok(/Allowed: none/.test(text), "no permissions must render as none, not an empty string");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
