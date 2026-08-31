/**
 * V9 — verification against the REAL Claude Code binary and a REAL git repository.
 *
 * Everything else in this project tests MJ's own logic. This suite tests MJ's logic against the
 * outside world, which is the only way to find out whether the capability table is fiction.
 *
 * It skips cleanly when the binary or git is absent, and it never invents a result: a skip is
 * reported as a skip.
 *
 * What it CANNOT do here: complete a real mission. That needs an ANTHROPIC_API_KEY or an OAuth
 * login, and MJ refuses to fake the worker's output. So the invocation ends at "Not logged in" —
 * which is itself the useful evidence, because it proves the FLAGS PARSED. A flag Claude rejected
 * would produce an argument error, not a JSON result with a session id.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGENT_CAPABILITIES } from "../src/mission/agentCapabilities";
import { PREBUILT_TEAMS, composeSeatArgv } from "../src/mission/agentTeam";
import { parseReportedUsage } from "../src/mission/caps";
import { gitApi, summariseDiff, parseUnifiedDiff } from "../src/mission/git";
import type { GitRunner } from "../src/mission/git";

let pass = 0;
let fail_count = 0;
let skipped = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass += 1;
  else fail(`(assertion) ${m}`);
};
const fail = (m: string) => {
  fail_count += 1;
  console.log(`  FAIL ${m}`);
};
const skip = (m: string) => {
  skipped += 1;
  console.log(`  SKIP ${m}`);
};

const CLAUDE = process.env.MJ_CLAUDE_BIN ?? "/tmp/cc/node_modules/.bin/claude";
const hasClaude = existsSync(CLAUDE);
const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
})();

console.log("\n== environment ==");
console.log(`  claude binary: ${hasClaude ? CLAUDE : "ABSENT"}`);
console.log(`  git:           ${hasGit ? "present" : "ABSENT"}`);

console.log("\n== the real binary's version and flags ==\n");

if (!hasClaude) {
  skip("claude is not installed, so nothing about it can be verified");
} else {
  const v = spawnSync(CLAUDE, ["--version"], { encoding: "utf8" });
  ok(v.status === 0, `claude --version exits 0, got ${v.status}`);
  const version = (v.stdout || "").trim();
  console.log(`  version: ${version}`);
  ok(/^\d+\.\d+\.\d+/.test(version), `it reports a semver: ${version}`);

  const help = spawnSync(CLAUDE, ["--help"], { encoding: "utf8" }).stdout || "";
  ok(help.length > 500, `--help produced ${help.length} chars`);

  // The flags MJ actually emits for a Claude seat must exist.
  const caps = AGENT_CAPABILITIES.claude;
  const emitted: string[] = [];
  for (const c of [caps.prompt, caps.json, caps.readOnly, caps.write, caps.model, caps.resume, caps.worktree]) {
    if (c?.argv) emitted.push(...c.argv.filter((a) => a.startsWith("-")));
  }
  for (const flag of emitted) {
    ok(help.includes(flag), `MJ emits ${flag} and claude --help documents it`);
  }
  // And the correction: --max-turns must NOT be emitted, because it does not exist.
  ok(!help.includes("--max-turns"), "claude has no --max-turns flag...");
  ok(caps.maxTurns?.argv === null, "...so MJ's table now says null instead of emitting it");
  const composed = composeSeatArgv(
    { id: "s", role: "coder", harness: "claude", model: null, mayWrite: true, maxRisk: "MEDIUM", maxTurns: 30, timeoutSecs: 600, instructions: "" },
    { prompt: "x", cwd: "/r", readOnly: false },
  );
  ok(!composed.argv.includes("--max-turns"), "and a coder seat with maxTurns=30 no longer emits --max-turns");
}

console.log("\n== MJ's composed argv, run by the real binary, in a real repo ==\n");

if (!hasClaude || !hasGit) {
  skip("needs both the claude binary and git");
} else {
  const dir = mkdtempSync(join(tmpdir(), "mj-real-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q");
  g("config", "user.email", "mj@test");
  g("config", "user.name", "MJ");
  writeFileSync(join(dir, "calc.ts"), "export function add(a: number, b: number) { return a + b; }\n");
  g("add", ".");
  g("commit", "-q", "-m", "init");

  const seat = PREBUILT_TEAMS.find((t) => t.id === "team.adversarial")!.seats.find((s) => s.role === "reviewer")!;
  ok(seat.harness === "grok", `the adversarial reviewer seat is grok, got ${seat.harness}`);
  // Use the Claude seat from the balanced crew so the installed binary can run it.
  // The balanced crew's reviewer seat is codex; its CODER seat is claude, which is the binary
  // installed here. Run that one, in read-only mode, so the argv under test is MJ's real output.
  const claudeSeat = PREBUILT_TEAMS.find((t) => t.id === "team.balanced")!.seats.find((s) => s.harness === "claude")!;
  ok(claudeSeat.harness === "claude", `the seat under test is a claude seat, got ${claudeSeat.harness}`);
  const inv = composeSeatArgv(claudeSeat, { prompt: "Review the diff", cwd: dir, readOnly: true });
  console.log(`  composed: ${inv.bin} ${inv.argv.join(" ")}`);

  const run = spawnSync(CLAUDE, inv.argv, { cwd: dir, encoding: "utf8", timeout: 90000 });
  const out = (run.stdout || "") + (run.stderr || "");
  const parsed = (() => {
    try {
      return JSON.parse(out.trim().split("\n")[0] ?? "") as Record<string, unknown>;
    } catch {
      return null;
    }
  })();

  if (!parsed) {
    fail(`the real binary did not return JSON. argv may be wrong. output: ${out.slice(0, 300)}`);
  } else {
    ok(parsed.type === "result", `it returned a real result object, type=${String(parsed.type)}`);
    // THE key assertion: the flags parsed. An unknown flag yields an argument error, not a result
    // object carrying a session id.
    ok(typeof parsed.session_id === "string", `a session id came back, so the argv parsed: ${String(parsed.session_id).slice(0, 8)}...`);
    ok(!/unknown option|error: unknown/i.test(out), "and no unknown-option error was raised");
    // It is NOT logged in here, and MJ must not pretend otherwise.
    ok(parsed.is_error === true, `it reports is_error=true (no credentials here), got ${String(parsed.is_error)}`);
    ok(String(parsed.result).toLowerCase().includes("not logged in"), `and says why: ${String(parsed.result)}`);
    ok(parsed.total_cost_usd === 0, `real cost is 0 because nothing ran, got ${String(parsed.total_cost_usd)}`);

    // Now run MJ's parser over the REAL bytes.
    const u = parseReportedUsage("claude", out);
    ok(u.costUsd === 0, `MJ's parser reads total_cost_usd=0 from real output, got ${String(u.costUsd)}`);
    ok(u.turns === 1, `and num_turns=1, got ${String(u.turns)}`);
    const usage = parsed.usage as Record<string, unknown> | undefined;
    const expectTokens = ((usage?.input_tokens as number) ?? 0) + ((usage?.output_tokens as number) ?? 0);
    // Nothing ran, so input+output is 0. MJ's parser deliberately returns null for a zero token sum:
    // 0 tokens means "no token data", and reporting 0 would look like a measured zero-cost run.
    ok(u.tokens === null, `and a zero token sum yields null (not a fake 0), got ${String(u.tokens)}`);
    ok(expectTokens === 0, `which is correct because the real usage block sums to ${expectTokens}`);
    console.log(`  parsed by MJ: cost=${u.costUsd} tokens=${u.tokens} turns=${u.turns} source=${u.source}`);
  }
  rmSync(dir, { recursive: true, force: true });
}

console.log("\n== git evidence over a real repository ==\n");

if (!hasGit) {
  skip("git is not installed");
} else {
  const dir = mkdtempSync(join(tmpdir(), "mj-gitreal-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q");
  g("config", "user.email", "mj@test");
  g("config", "user.name", "MJ");
  // Plain JS, not TS: the point of this section is that the repository's own test REALLY RUNS, and
  // `node` cannot parse type annotations. A test that cannot execute proves nothing.
  writeFileSync(join(dir, "calc.js"), "module.exports.add = (a, b) => a + b;\n");
  g("add", ".");
  g("commit", "-q", "-m", "init");

  // Simulate what a coding agent does: edit a file and add a test.
  writeFileSync(join(dir, "calc.js"), "module.exports.add = (a, b) => a + b;\nmodule.exports.sub = (a, b) => a - b;\n");
  writeFileSync(join(dir, "calc.test.js"), 'const { sub } = require("./calc");\nif (sub(2, 1) !== 1) { console.error("sub(2,1) !== 1"); process.exit(1); }\nconsole.log("ok");\n');
  g("add", "-A");

  const runner: GitRunner = async (args, cwd) => {
    try {
      return { ok: true, stdout: execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }), stderr: "", exitCode: 0, reason: null };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; status?: number | null };
      return { ok: false, stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.status ?? null, reason: (err.stderr || "failed").trim() };
    }
  };
  const api = gitApi(runner);
  const d = await api.diff(dir, { staged: true });
  ok(d.ok === true, "the diff of the agent's change is readable");
  const s = d.summary!;
  ok(s.files.length === 2, `two files changed, got ${s.files.length}`);
  ok(s.files.some((f) => f.path === "calc.js" && f.status === "modified"), "calc.js modified");
  ok(s.files.some((f) => f.path === "calc.test.js" && f.status === "added"), "calc.test.js added");
  ok(s.totalAdditions === 4, `+4 lines (1 in calc.js, 3 in the test), got +${s.totalAdditions}`);
  ok(summariseDiff(parseUnifiedDiff(d.raw)).totalAdditions === 4, "and re-parsing the raw diff agrees");

  // A real test run — this is the "real tests" part of the chain, and it really executes.
  const test = spawnSync("node", ["calc.test.js"], { cwd: dir, encoding: "utf8" });
  ok(test.status === 0, `the repository's own test exits 0, got ${test.status} (${(test.stdout || "").trim()})`);

  // Break it, and confirm the evidence chain catches the regression.
  writeFileSync(join(dir, "calc.js"), "module.exports.add = (a, b) => a + b;\nmodule.exports.sub = (a, b) => a + b;\n");
  const broken = spawnSync("node", ["calc.test.js"], { cwd: dir, encoding: "utf8" });
  ok(broken.status !== 0, `and when the agent breaks sub(), the test really fails (exit ${broken.status})`);
  // The earlier `git add -A` means the index already holds the first version of both files, so an
  // unstaged diff only shows calc.js. Asking for --staged compares the index against HEAD and gives
  // the full picture — which is the right call when reporting what an agent changed.
  const unstaged = await api.diff(dir, {});
  ok(unstaged.summary!.files.length === 1, `an unstaged diff sees only the newly broken file, got ${unstaged.summary!.files.length}`);
  const d2 = await api.diff(dir, { staged: true });
  ok(d2.summary!.files.length === 2, `the staged diff shows both files, got ${d2.summary!.files.length}`);
  ok(d2.raw.includes("module.exports.sub = (a, b) => a - b"), "and it shows the version that was committed to the index (the correct one)");
  // The REGRESSION lives in the working tree, because only the first version was staged. This is
  // exactly why MJ must look at the right diff: the staged view still looks correct here.
  ok(unstaged.raw.includes("=> a + b"), "the unstaged diff is where the regression appears...");
  ok(/sub = \(a, b\) => a \+ b/.test(unstaged.raw), "...as a sub() that adds instead of subtracting");
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail_count} failed, ${skipped} skipped\n`);
process.exit(fail_count ? 1 : 0);
