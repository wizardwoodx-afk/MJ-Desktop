/**
 * §Harnesses probe — the V11.6 Connector contract. (Suite #39.)
 *
 * TEAMS lets users run their own coding-agent CLIs, and V11.6 grew that surface: the
 * full 2026 registry (researched, sources named in agentCapabilities.ts) plus
 * user-registered CUSTOM harnesses. This probe holds the contract together:
 *
 *   1. the registry is well-formed: unique ids, real bins, exactly one $PROMPT,
 *      honest install lines — and the researched 2026 set is all there;
 *   2. every harness id is covered by ALL FOUR consumers — capabilities, sandbox
 *      policy, Teams badges, and the Rust detect/invoke allowlists — so a new id
 *      cannot be half-wired;
 *   3. custom harnesses are validated on the TypeScript side (the Rust side
 *      re-validates: probe checks the Rust guard exists too);
 *   4. the Connect tab really exists: detect, test, custom form, seat binding.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { HARNESSES, HARNESS_BY_ID, customHarnessId, validateCustomHarness, type HarnessId } from "../src/domain/harness";
import { AGENT_CAPABILITIES, resolveCaps } from "../src/mission/agentCapabilities";
import { ENFORCED_SANDBOX, READ_ONLY, WRITE, policyFor } from "../src/mission/harnessPolicy";
import { allHarnesses, getHarness } from "../src/mission/harnessAdapters";
import { sessionArgv, sessionIdKind } from "../src/mission/sessions";
import { setCustomHarnesses } from "../src/domain/harness";
import { executeTeam, type TeamRunRequest, type TeamRunnerDeps } from "../src/mission/teamExecutor";
import { CapLedger } from "../src/mission/caps";
import type { CliAgentTeam, TeamSeat } from "../src/mission/agentTeam";
import { execFileSync } from "node:child_process";
import * as os from "node:os";

let pass = 0;
let fail = 0;
/**
 * §V11.7.0 — THE VACUOUS-GATE FIX. This helper was written `(c: boolean, m: string)`
 * while every call site in this suite was written `ok(label, condition, detail)` — so
 * `c` received the LABEL (always a truthy string) and every check passed vacuously from
 * 11.6.0 through 11.6.3. The counts were real executions but zero assertions. The
 * signature now matches the call sites, and the suite's failures are real again.
 */
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (s: string) => console.log(`\n== ${s}\n`);

const read = (p: string): string => {
  const direct = path.join(process.cwd(), p);
  if (fs.existsSync(direct)) return fs.readFileSync(direct, "utf8");
  const history = path.join(process.cwd(), "docs", "history", p);
  if (fs.existsSync(history)) return fs.readFileSync(history, "utf8");
  return fs.readFileSync(direct, "utf8");
};
const teams = read("src/pages/TeamsPage.tsx");
const ipcSrc = read("src/ipc/client.ts");
const runnerSrc = read("src/engine/harnessRunner.ts");
const rust = read("src-tauri/src/commands.rs");
const libRs = read("src-tauri/src/lib.rs");
const agentTeamSrc = read("src/mission/agentTeam.ts");

const ids = HARNESSES.map((h) => h.id);

// ═══════════════════════════════════ 1. the registry is well-formed
section("1. the registry is well-formed");

ok(`unique ids (${ids.length} harnesses)`, new Set(ids).size === ids.length);
const noBins = HARNESSES.filter((h) => h.id !== "llm" && h.bins.length === 0);
ok("every harness except the direct-LLM names at least one binary", noBins.length === 0, noBins.map((h) => h.id).join(", "));
const promptCount = HARNESSES.filter((h) => h.id !== "llm" && h.id !== "acp" && h.argv.filter((a) => a === "$PROMPT").length !== 1);
ok("every spawnable harness passes $PROMPT exactly once (acp is a protocol, llm has no argv)",
  promptCount.length === 0, promptCount.map((h) => `${h.id} (${h.argv.filter((a) => a === "$PROMPT").length})`).join(", "));
const noMeta = HARNESSES.filter((h) => !h.name || !h.install || !h.notes);
ok("every harness carries a name, an install line, and notes", noMeta.length === 0, noMeta.map((h) => h.id).join(", "));
ok("HARNESS_BY_ID resolves every id", ids.every((id) => HARNESS_BY_ID.has(id)));

const RESEARCHED: HarnessId[] = [
  "acp", "hermes", "claude", "codex", "opencode", "openclaude", "copilot", "cursor", "grok",
  "cline", "kilo", "aider", "gemini", "antigravity", "amp", "crush", "openhands", "goose",
  "qwen", "amazonq", "droid", "kimi", "auggie", "warp", "llm",
];
ok(`the researched 2026 landscape is complete (${RESEARCHED.length} ids)`,
  RESEARCHED.every((id) => HARNESS_BY_ID.has(id)),
  RESEARCHED.filter((id) => !HARNESS_BY_ID.has(id)).join(", ") || "all present");
ok("the registry adds nothing unresearched", ids.every((id) => RESEARCHED.includes(id)), ids.filter((id) => !RESEARCHED.includes(id)).join(", "));

// invocation shapes that research corrected in V11.6
ok("grok invokes the documented non-interactive mode (grok exec)", HARNESS_BY_ID.get("grok")!.argv[0] === "exec");
ok("kilo invokes the headless mode (kilo run)", HARNESS_BY_ID.get("kilo")!.argv[0] === "run");
ok("copilot passes -s (response-only) with -p", HARNESS_BY_ID.get("copilot")!.argv.includes("-s"));
ok("openclaude is wired to the Gitlawb binary", HARNESS_BY_ID.get("openclaude")!.bins[0] === "openclaude" && HARNESS_BY_ID.get("openclaude")!.install.includes("@gitlawb/openclaude"));
ok("grok install names the x.ai installer", HARNESS_BY_ID.get("grok")!.install.includes("x.ai/cli/install.sh"));

// ═══════════════════════════════════ 2. every id is fully wired, TS and Rust
section("2. every id is fully wired — capabilities, policy, badges, Rust");

const capsKeys = Object.keys(AGENT_CAPABILITIES) as HarnessId[];
ok(`AGENT_CAPABILITIES covers every registry id (${capsKeys.length} entries)`,
  ids.every((id) => capsKeys.includes(id)), ids.filter((id) => !capsKeys.includes(id)).join(", "));
ok("AGENT_CAPABILITIES adds nothing the registry does not know", capsKeys.every((id) => ids.includes(id)), capsKeys.filter((id) => !ids.includes(id)).join(", "));
ok("ENFORCED_SANDBOX covers every id", ids.every((id) => id in ENFORCED_SANDBOX), ids.filter((id) => !(id in ENFORCED_SANDBOX)).join(", "));
const SPAWNABLE = ids.filter((id) => id !== "acp" && id !== "llm");
ok("READ_ONLY policy covers every spawnable CLI id (acp is a protocol, llm is a direct call)",
  SPAWNABLE.every((id) => id in READ_ONLY), SPAWNABLE.filter((id) => !(id in READ_ONLY)).join(", "));
ok("WRITE policy covers every spawnable CLI id (acp is a protocol, llm is a direct call)",
  SPAWNABLE.every((id) => id in WRITE), SPAWNABLE.filter((id) => !(id in WRITE)).join(", "));
ok("every policy shape still passes the prompt exactly once",
  Object.values(READ_ONLY).every((argv) => (argv ?? []).filter((a) => a === "$PROMPT").length <= 1) &&
  Object.values(WRITE).every((argv) => (argv ?? []).filter((a) => a === "$PROMPT").length <= 1));
const v116 = ["openclaude", "copilot", "antigravity", "amp", "crush", "openhands"] as HarnessId[];
ok("the six V11.6 agents have capability entries with a prompt shape and a named source",
  v116.every((id) => {
    const caps = AGENT_CAPABILITIES[id];
    return Boolean(caps) && Array.isArray(caps.prompt.argv) && caps.prompt.source.length > 0;
  }),
  v116.filter((id) => !AGENT_CAPABILITIES[id]).join(", ") || "entry without prompt shape");
const v1171 = ["droid", "kimi", "auggie", "warp"] as HarnessId[];
ok("the four V11.7.1 agents have capability entries with a DOCS-graded prompt shape and a named source",
  v1171.every((id) => {
    const caps = AGENT_CAPABILITIES[id];
    return Boolean(caps) && Array.isArray(caps.prompt.argv) && caps.prompt.confidence === "docs" && caps.prompt.source.length > 0;
  }),
  v1171.filter((id) => !AGENT_CAPABILITIES[id] || AGENT_CAPABILITIES[id].prompt.confidence !== "docs").join(", ") || "entry without a docs-graded prompt shape");
ok("HARNESS_BADGES in TeamsPage covers every id",
  ids.every((id) => teams.includes(`${id}: { label:`)), ids.filter((id) => !teams.includes(`${id}: { label:`)).join(", "));

// Rust: detect list, env list, allowlist, argv table
const rustDetectIds = ["hermes", "claude", "codex", "opencode", "openclaude", "copilot", "cursor", "grok", "cline", "kilo", "aider", "gemini", "antigravity", "amp", "crush", "openhands", "qwen", "goose", "amazonq", "droid", "kimi", "auggie", "warp"];
ok("the Rust detect list covers every executable harness", rustDetectIds.every((id) => rust.includes(`("${id}",`)), rustDetectIds.filter((id) => !rust.includes(`("${id}",`)).join(", "));
const rustBins = ["hermes", "claude", "codex", "opencode", "openclaude", "copilot", "cursor-agent", "grok", "cline", "kilo", "qwen", "gemini", "aider", "goose", "agy", "amp", "crush", "openhands", "amazonq", "kiro-cli", "q", "agent", "droid", "kimi", "auggie", "oz"];
const allowMatch = rust.match(/const ALLOWED_CLI_BINS[^;]+;/)?.[0] ?? "";
ok("every registry bin is on the Rust invoke allowlist",
  rustBins.every((b) => allowMatch.includes(`"${b}"`)), rustBins.filter((b) => !allowMatch.includes(`"${b}"`)).join(", "));
ok("the Rust argv table knows grok exec", rust.includes('"grok" => ("grok".into(), vec!["exec".into()'));
ok("the Rust argv table knows kilo run", rust.includes('"kilo" => ("kilo".into(), vec!["run".into()'));
const argvFn = rust.match(/fn harness_argv[\s\S]*?\n\}/)?.[0] ?? "";
ok("the Rust argv table has the six V11.6 agents",
  ['"openclaude"', '"copilot"', '"antigravity"', '"amp"', '"crush"', '"openhands"'].every((k) => argvFn.includes(k)),
  'harness_argv is missing a V11.6 entry');
ok("the Rust argv table has the four V11.7.1 agents",
  ['"droid"', '"kimi"', '"auggie"', '"warp"'].every((k) => argvFn.includes(k)),
  'harness_argv is missing a V11.7.1 entry');

// ═══════════════════════════════════ 3. custom harnesses — validated twice
section("3. custom harnesses — validated in TS, re-validated in Rust");

const good = validateCustomHarness({ name: "My Agent", bin: "my-agent", argv: ["--headless", "$PROMPT"] });
ok("a well-formed custom harness passes validation", good.length === 0, good.map((e) => e.message).join("; "));
const cases: Array<[string, ReturnType<typeof validateCustomHarness>, string]> = [
  ["no $PROMPT", validateCustomHarness({ name: "x", bin: "agent", argv: ["--go"] }), "argv"],
  ["two $PROMPTs", validateCustomHarness({ name: "x", bin: "agent", argv: ["$PROMPT", "$PROMPT"] }), "argv"],
  ["empty bin", validateCustomHarness({ name: "x", bin: "  ", argv: ["$PROMPT"] }), "bin"],
  ["shell chars in bin", validateCustomHarness({ name: "x", bin: "agent;rm", argv: ["$PROMPT"] }), "bin"],
  ["spaces in bin", validateCustomHarness({ name: "x", bin: "my agent", argv: ["$PROMPT"] }), "bin"],
  ["path traversal in bin", validateCustomHarness({ name: "x", bin: "../agent", argv: ["$PROMPT"] }), "bin"],
  ["empty name", validateCustomHarness({ name: "", bin: "agent", argv: ["$PROMPT"] }), "name"],
];
for (const [label, errors, field] of cases) {
  ok(`rejected: ${label}`, errors.length > 0 && errors.some((e) => e.field === field), "slipped through");
}
ok("newline arguments are rejected", validateCustomHarness({ name: "x", bin: "agent", argv: ["$PROMPT", "a\nb"] }).length > 0);
ok("custom ids are slugged namespaced", customHarnessId("My Internal Agent!") === "custom:my-internal-agent");
ok("custom id slug has a floor for empty names", customHarnessId("!!!").startsWith("custom:"));

ok("the Rust side re-validates before saving (custom_harness_validate)",
  rust.includes("fn custom_harness_validate") && rust.includes("$PROMPT exactly once".replace("$PROMPT", "argv must contain $PROMPT")),
  "the server-side guard is missing");
ok("cli_invoke resolves custom:<slug> against the saved registry only",
  rust.includes('provider_id.starts_with("custom:")') && rust.includes("unknown custom harness"),
  "the custom execution path is missing");
ok("the three custom-harness commands are registered in lib.rs",
  libRs.includes("commands::custom_harness_list") && libRs.includes("commands::custom_harness_save") && libRs.includes("commands::custom_harness_delete"));
ok("custom harnesses persist next to the database (custom-harnesses.json)",
  rust.includes('custom-harnesses.json'));
ok("ipc exposes the custom-harness trio with a web-preview fallback",
  ipcSrc.includes("customHarnessList") && ipcSrc.includes("customHarnessSave") && ipcSrc.includes("customHarnessDelete") && ipcSrc.includes("mj.customHarnesses"));

// ═══════════════════════════════════ 4. the Connect tab and the runtime path
section("4. the Connect tab and the runtime path");

ok('"connect" is a Teams tab', teams.includes('type ActiveTab = "connect" |'));
ok("the Connect tab button is first in the row", teams.includes('activeTab === "connect" ? "primary" : ""'));
ok("the panel smoke-tests harnesses via cliInvoke", teams.includes('Reply with exactly one word: CONNECTED'));
ok("the panel shows the web-preview limitation honestly", teams.includes("You are in the web preview."));
ok("the add-custom form validates before saving", teams.includes("validateCustomHarness(spec)"));
ok("the seat picker offers custom harnesses", teams.includes("(custom)</option>"));
ok("the custom registry hydrates the sync mirror for composeSeatArgv", teams.includes("mirrorCustomHarnesses(entries)"));
ok("the harness runner executes custom ids through the Rust registry",
  runnerSrc.includes('isCustomHarness(hid)') && runnerSrc.includes("customHarnessList"),
  "the runner cannot execute a custom harness");
ok("composeSeatArgv compiles custom seats from the registered spec",
  agentTeamSrc.includes("resolveCaps(teamSeat.harness)") && agentTeamSrc.includes("not registered (anymore)"),
  "a custom seat would not compile");
ok("session continuity degrades honestly for custom harnesses (stateless, warned)",
  read("src/mission/sessions.ts").includes("Custom harness: no session continuity"),
  "the session layer would crash or lie on a custom id");

/* ── 5. the 2026-09 corrections — agy, amp -x, openhands --headless ─────────── */
section("5. the V11.6.1 corrections: agy / amp -x / openhands --headless -t");

ok("Antigravity's binary is agy (the shipped Go executable), not 'antigravity'",
  (HARNESS_BY_ID.get("antigravity")?.bins ?? []).includes("agy") && !JSON.stringify(HARNESS_BY_ID.get("antigravity")?.bins).includes('"antigravity"'),
  JSON.stringify(HARNESS_BY_ID.get("antigravity")?.bins));
ok("the Rust allowlist admits agy, not the nonexistent antigravity binary",
  rust.includes('"agy"') && !/ALLOWED_CLI_BINS[^;]*"antigravity"/s.test(rust), "allowlist stale");
ok("Amp's one-shot is execute mode: amp -x $PROMPT (docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.amp.prompt.argv) === JSON.stringify(["-x", "$PROMPT"]) && AGENT_CAPABILITIES.amp.prompt.confidence === "docs",
  JSON.stringify(AGENT_CAPABILITIES.amp.prompt));
ok("the Rust argv table agrees on amp -x",
  rust.includes('"amp" => ("amp".into(), vec!["-x".into(), prompt.into()])'), "rust amp argv stale");
ok("OpenHands headless is --headless -t $PROMPT (docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.openhands.prompt.argv) === JSON.stringify(["--headless", "-t", "$PROMPT"]) && AGENT_CAPABILITIES.openhands.prompt.confidence === "docs",
  JSON.stringify(AGENT_CAPABILITIES.openhands.prompt));
ok("OpenHands documents its JSONL mode (--json, ndjson)",
  AGENT_CAPABILITIES.openhands.json?.kind === "ndjson", "json capability stale");
ok("the Rust argv table agrees on openhands --headless -t",
  rust.includes('"openhands" => ("openhands".into(), vec!["--headless".into(), "-t".into(), prompt.into()])'), "rust openhands argv stale");

/* ── 6. custom harnesses actually EXECUTE (the V11.6.1 hole, closed) ─────────
   The 11.6.0 review found that teamExecutor dereferenced AGENT_CAPABILITIES[custom-id]
   (undefined) — the advertised flow (register custom → assign to seat → run team) could
   crash. V11.6.1 routes every consumer through resolveCaps(), which is total. This
   section runs a REAL executeTeam() pass over a real git repo with a stubbed CLI. */
section("6. custom harnesses actually execute (V11.6.1: the executor hole, closed)");

const PROBE_SPEC = { id: "custom:probe-agent", name: "Probe Agent", bin: "probe-agent", argv: ["run", "$PROMPT"], notes: "probe fixture", createdAt: new Date().toISOString() };

setCustomHarnesses([PROBE_SPEC]);
const rcReg = resolveCaps("custom:probe-agent");
ok("resolveCaps resolves a REGISTERED custom to its synthetic entry", rcReg.custom && rcReg.registered && rcReg.caps.bins[0] === "probe-agent" && rcReg.caps.name === "Probe Agent (custom)", JSON.stringify(rcReg.caps.bins));
ok("the synthetic entry carries the user's argv template", JSON.stringify(rcReg.caps.prompt.argv) === JSON.stringify(["run", "$PROMPT"]), JSON.stringify(rcReg.caps.prompt.argv));
setCustomHarnesses([]);
const rcGone = resolveCaps("custom:gone");
ok("resolveCaps is TOTAL: an unregistered custom yields an honest entry, never undefined", !rcGone.registered && rcGone.custom && rcGone.caps.bins.length === 0 && rcGone.caps.name.includes("custom:gone"), rcGone.caps.name);
const rcBuiltin = resolveCaps("claude");
ok("resolveCaps passes builtins through unchanged", !rcBuiltin.custom && rcBuiltin.registered && rcBuiltin.caps === AGENT_CAPABILITIES.claude, "passthrough broken");
setCustomHarnesses([PROBE_SPEC]);

const te = read("src/mission/teamExecutor.ts");
ok("the executor no longer dereferences AGENT_CAPABILITIES[seat.harness] (the 11.6.0 hole)", !te.includes("AGENT_CAPABILITIES[a.seat.harness]"), "bare lookup survives");
ok("the executor resolves every seat through resolveCaps()", (te.match(/resolveCaps\(/g) ?? []).length >= 3, `${(te.match(/resolveCaps\(/g) ?? []).length} uses`);
ok("an unregistered custom is refused BEFORE any spawn, with the re-add message", te.includes('Custom harness "${a.seat.harness}" is not registered (anymore)'), "preflight message missing");

function sh(args: string[], cwd: string): { code: number | null; out: string } {
  try {
    const out = execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function makeRepo(): { repo: string; branch: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjcustom-"));
  fs.writeFileSync(path.join(repo, "calc.js"), "function add(a, b) { return a + b; }\nmodule.exports = { add };\n");
  fs.writeFileSync(path.join(repo, "test.js"), "const { add } = require('./calc');\nif (add(2, 3) !== 5) process.exit(1);\nconsole.log('ok');\n");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "calc", version: "1.0.0" }, null, 2));
  sh(["git", "init", "-q", "."], repo);
  sh(["git", "config", "user.email", "mj@mj.desktop"], repo);
  sh(["git", "config", "user.name", "MJ"], repo);
  sh(["git", "add", "-A"], repo);
  sh(["git", "commit", "-qm", "initial"], repo);
  const branch = sh(["git", "symbolic-ref", "--short", "HEAD"], repo).out.trim() || "master";
  return { repo, branch };
}

const invocations: Array<{ bin: string; argv: string[] }> = [];
const { repo, branch } = makeRepo();
const customSeat: TeamSeat = {
  id: "probe-seat", role: "coder", harness: "custom:probe-agent" as never, model: null,
  mayWrite: true, timeoutSecs: 60, maxTurns: 2, instructions: "Say CONNECTED.",
};
const customTeam: CliAgentTeam = {
  id: "t.custom-probe", name: "Custom probe team", description: "one registered custom seat",
  schemaVersion: 1, seats: [customSeat],
};
const customReq: TeamRunRequest = {
  team: customTeam,
  assignments: [{ seat: customSeat, wave: 1, readOnly: false, prompt: "Say CONNECTED." }],
  repoRoot: repo, baseBranch: branch, missionSlug: "custom-probe",
  objective: "Prove a custom harness runs through the executor.",
  constraints: [], doNotTouch: [], testCommand: ["node", "test.js"],
  ledger: new CapLedger({ maxCostUsd: 1, maxTurns: 10, timeoutMs: 60_000 }, Date.now()),
};
const customDeps: TeamRunnerDeps = {
  cliInvoke: async (req) => {
    invocations.push({ bin: req.bin, argv: req.argv });
    return { exitCode: 0, stdout: "CONNECTED", stderr: "", durationMs: 4, timedOut: false };
  },
  resolveBin: async (bin) => (bin === "probe-agent" ? "/usr/bin/probe-agent" : null),
  git: async (args, cwd) => {
    const r = sh(["git", ...args], cwd);
    return { ok: r.code === 0, stdout: r.out, stderr: "", exitCode: r.code, reason: null };
  },
  writeFile: async (p, contents) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, contents);
  },
  verify: async (cwd) => {
    const r = sh(["node", "test.js"], cwd);
    return { exitCode: r.code, stdout: r.out, stderr: "", durationMs: 5, timedOut: false };
  },
};

const report = await executeTeam(customReq, customDeps);
const seatRec = report.seats.find((s) => s.seatId === "probe-seat");
ok("a REGISTERED custom seat RUNS (preflight passes, no undefined deref)", Boolean(seatRec) && seatRec.outcome === "completed", `${seatRec?.outcome ?? "no record"} — ${seatRec?.reason?.slice(0, 120) ?? report.notRun.map((n) => n.reason).join(" | ").slice(0, 160)}`);
ok("the seat record names the custom harness honestly", seatRec?.harnessName === "Probe Agent (custom)", seatRec?.harnessName ?? "");
ok("the seat ran the user's binary", Boolean(invocations[0]) && invocations[0].bin.includes("probe-agent"), invocations[0]?.bin ?? "never invoked");
ok("the seat ran the user's argv template (run $PROMPT)", Boolean(invocations[0]) && invocations[0].argv.includes("run") && invocations[0].argv.includes("Say CONNECTED."), JSON.stringify(invocations[0]?.argv ?? []));

setCustomHarnesses([]);
const goneReq: TeamRunRequest = { ...customReq, missionSlug: "custom-gone", repoRoot: makeRepo().repo };
const goneReport = await executeTeam(goneReq, customDeps);
const goneRec = goneReport.seats.find((s) => s.seatId === "probe-seat");
const goneNotRun = goneReport.notRun.find((n) => n.seatId === "probe-seat");
ok("an UNREGISTERED custom seat is refused with the re-add message (not a crash)",
  Boolean(goneRec || goneNotRun) && (goneRec?.reason ?? goneNotRun?.reason ?? "").includes("not registered (anymore)") && !goneReport.seats.some((s) => s.seatId === "probe-seat" && s.outcome === "completed"),
  `${goneRec?.outcome ?? "no seat record"} — ${(goneRec?.reason ?? goneNotRun?.reason ?? "no refusal reason").slice(0, 160)}`);
setCustomHarnesses([]);

/* ── 7. ONE HARNESS TRUTH — the V11.6.2 consolidation ──────────────────────────
   The 11.6.1 review: "one canonical resolved-harness object should feed every execution
   path." The policy layer now DERIVES its argv from the capability registry, and the
   adapter registry covers every CLI in the domain registry (plus customs). This section
   pins both, so the two-tiers / stale-argv class of bug cannot return. */
section("7. one harness truth — policy derives, adapters cover everything");

const derived = (id: string, kind: "readOnly" | "write"): string[] => {
  const caps = AGENT_CAPABILITIES[id as HarnessId];
  const base = caps?.prompt?.argv?.length ? [...caps.prompt.argv] : ["$PROMPT"];
  const extra = kind === "readOnly" ? caps?.readOnly?.argv : caps?.write?.argv;
  return extra && extra.length > 0 ? [...base, ...extra] : base;
};

{
  const polSrc = read("src/mission/harnessPolicy.ts");
  ok("the policy layer derives from the capability registry (registryArgv)", polSrc.includes("function registryArgv("), "no derivation");
  const derivedIds = [...polSrc.matchAll(/(\w+): registryArgv\("(\w+)", "(readOnly|write)"\)/g)];
  ok(`every non-legacy policy entry is DERIVED, not hand-copied (${derivedIds.length} entries = 12 legacy ids x 2 + kimi/auggie/warp x 2 + droid readOnly; droid's WRITE is the one DOCUMENTED hand-tune: --auto low, because exec defaults to spec-mode read-only)`, derivedIds.length === 31, `${derivedIds.length}`);
  const policyIds = new Set([...Object.keys(READ_ONLY), ...Object.keys(WRITE)]);

  for (const id of policyIds) {
    const capsPrompt = AGENT_CAPABILITIES[id as HarnessId]?.prompt?.argv;
    if (id === "hermes") continue; // documented dual shape: in-process runtime (bare) vs CLI shim (--print)
    for (const [mapName, map] of [["READ_ONLY", READ_ONLY], ["WRITE", WRITE]] as const) {
      const entry = (map as Partial<Record<string, string[]>>)[id];
      if (!entry) continue;
      ok(`${mapName}[${id}]: base invocation agrees with the registry (first token)`,
        Boolean(capsPrompt?.[0]) && entry[0] === capsPrompt?.[0],
        `${entry[0]} vs ${capsPrompt?.[0] ?? "none"}`);
      ok(`${mapName}[${id}]: $PROMPT appears exactly once`, entry.filter((t) => t === "$PROMPT").length === 1, JSON.stringify(entry));
    }
  }
  for (const id of ["openclaude", "copilot", "antigravity", "amp", "crush", "openhands", "gemini", "goose", "qwen", "amazonq", "cursor", "grok", "kimi", "auggie", "warp"]) {
    ok(`READ_ONLY[${id}] IS the registry shape (derived, not drifted)`, JSON.stringify(READ_ONLY[id as HarnessId]) === JSON.stringify(derived(id, "readOnly")), `${JSON.stringify(READ_ONLY[id as HarnessId])} vs ${JSON.stringify(derived(id, "readOnly"))}`);
    ok(`WRITE[${id}] IS the registry shape (derived, not drifted)`, JSON.stringify(WRITE[id as HarnessId]) === JSON.stringify(derived(id, "write")), `${JSON.stringify(WRITE[id as HarnessId])} vs ${JSON.stringify(derived(id, "write"))}`);
  }
  ok("the stale Amp shape is gone from the policy layer (no --headless under amp)", !(READ_ONLY.amp ?? []).includes("--headless") && !(WRITE.amp ?? []).includes("--headless"), "stale --headless survives");
  ok("the stale OpenHands shape is gone from the policy layer (no solve)", !(READ_ONLY.openhands ?? []).includes("solve") && !(WRITE.openhands ?? []).includes("solve"), "stale solve survives");
  ok("Amp's policy shape is execute mode", JSON.stringify(READ_ONLY.amp) === JSON.stringify(["-x", "$PROMPT"]) && JSON.stringify(WRITE.amp) === JSON.stringify(["-x", "$PROMPT"]), JSON.stringify(READ_ONLY.amp));
  ok("OpenHands' policy shape is the documented headless mode", JSON.stringify(READ_ONLY.openhands) === JSON.stringify(["--headless", "-t", "$PROMPT"]), JSON.stringify(READ_ONLY.openhands));
  ok("Grok's write shape carries its permission flags (registry-derived fix)", (WRITE.grok ?? []).includes("--permission-mode") && (WRITE.grok ?? []).includes("acceptEdits"), JSON.stringify(WRITE.grok));
}

{
  const cliIds = HARNESSES.map((h) => h.id).filter((id) => id !== "llm");
  ok(`every CLI in the domain registry has a mission adapter (${cliIds.length} ids)`,
    cliIds.every((id) => getHarness(id as never) !== null),
    cliIds.filter((id) => getHarness(id as never) === null).join(", ") || "all covered");
  ok("llm is deliberately NOT a spawnable CLI adapter (direct-LLM has its own path)", getHarness("llm" as never) === null, "llm got an adapter");
  ok(`the adapter pool is whole-registry sized (${allHarnesses().length} adapters: 23 CLIs + acp + local-test)`, allHarnesses().length >= 25, String(allHarnesses().length));
  const ampAdapter = getHarness("amp" as never);
  const ampPrep = ampAdapter?.prepare({ taskId: "t", title: "t", prompt: "do it", kind: "implement", languages: [], timeoutMs: 60_000, requiredCapabilities: [], cwd: "/tmp" } as never);
  ok("a graph-mission agent pinned to amp now prepares a REAL invocation (-x)", Boolean(ampPrep) && ampPrep.args.includes("-x") && ampPrep.program === "amp", JSON.stringify(ampPrep));

  setCustomHarnesses([{ id: "custom:probe-2", name: "Probe Two", bin: "probe-two", argv: ["go", "$PROMPT"], notes: "", createdAt: new Date().toISOString() }]);
  const customAdapter = getHarness("custom:probe-2" as never);
  const customPrep = customAdapter?.prepare({ taskId: "t", title: "t", prompt: "say hi", kind: "implement", languages: [], timeoutMs: 60_000, requiredCapabilities: [], cwd: "/tmp" } as never);
  ok("a custom harness resolves to a REAL mission adapter (simulated=false)", Boolean(customAdapter) && customAdapter.simulated === false && customAdapter.name.includes("Probe Two"), customAdapter?.name ?? "null");
  ok("the custom adapter prepares the USER's bin and argv", Boolean(customPrep) && customPrep.program === "probe-two" && customPrep.args.includes("go") && customPrep.args.includes("say hi"), JSON.stringify(customPrep));
  setCustomHarnesses([]);
  ok("an unregistered custom harness yields NO adapter (honest null)", getHarness("custom:probe-2" as never) === null, "stale adapter survives");
}

/* ── 8. documentation truth + the resolver, everywhere (V11.6.3) ─────────────── */
section("8. doc truth (25 ids) and the resolver in the session layer");

ok(`the registry is 25 ids (23 CLIs + hermes + llm) — 21 until V11.7.1 grew it, 22 was the 11.6.0 miscount`,
  HARNESSES.length === 25, String(HARNESSES.length));
{
  // V11.7.1 — claim-precise, generation two. The registry grew 21 -> 25, so the claim
  // rules move with it: CURRENT claims (README, the V11.7.1 record) must say 25; the
  // V11.6/V11.7 release records may keep their 21s only as MARKED history (each such
  // line names V11.7.1 as the release that grew the count); and the original miscount
  // rule still stands — every "22" mention must be the marked historical explanation.
  const doc = read("MJ-11.6-UPGRADE.md");
  const stale22 = doc.split("\n").map((l, i) => [i + 1, l] as const).filter(([, l]) => l.includes("22 ids") || l.includes("22 registry"));
  ok(`every '22' mention in the V11.6 record is a MARKED historical miscount (${stale22.length} line(s))`,
    stale22.length > 0 && stale22.every(([, l]) => l.includes("miscount")),
    stale22.map(([n, l]) => `line ${n}: ${l.slice(0, 70)}`).join(" | "));
  for (const name of ["MJ-11.6-UPGRADE.md", "MJ-11.7-UPGRADE.md"]) {
    const rec = read(name);
    const lines21 = rec.split("\n").map((l, i) => [i + 1, l] as const).filter(([, l]) => l.includes("21 ids") || l.includes("all 21 registry") || l.includes("**21**") || l.includes("21 harnesses"));
    ok(`every '21' mention in ${name} is MARKED as superseded history (${lines21.length} line(s))`,
      lines21.length > 0 && lines21.every(([, l]) => l.includes("V11.7.1")),
      lines21.filter(([, l]) => !l.includes("V11.7.1")).map(([n, l]) => `line ${n}: ${l.slice(0, 70)}`).join(" | ") || "all marked");
  }
  const readme = read("README.md");
  ok("the README's CURRENT registry claims say 25",
    (readme.includes("**25** ids") && readme.includes("23 spawnable")) || (readme.includes("25 harnesses") && readme.includes("23 CLIs")),
    "a README current claim does not say 25");
  const rec71 = read("MJ-11.7.1-UPGRADE.md");
  ok("the V11.7.1 record claims 25 (growth line, seat dropdowns, probe description)",
    rec71.includes("grew from 21 to **25** ids") && rec71.includes("all 25 registry harnesses") && rec71.includes("well-formedness (25 ids,"),
    "a V11.7.1 current claim does not say 25");
}
{
  const sessionsSrc = read("src/mission/sessions.ts");
  ok("session resolution consumes the SAME resolver (no direct AGENT_CAPABILITIES lookups)", !sessionsSrc.includes("AGENT_CAPABILITIES[") && sessionsSrc.includes("resolveCaps("), "a second path survives");

  setCustomHarnesses([{ id: "custom:probe-3", name: "Probe Three", bin: "probe-three", argv: ["run", "$PROMPT"], notes: "", createdAt: new Date().toISOString() }]);
  const reg = sessionArgv("custom:probe-3", { kind: "resume", idKind: "mj-chosen", sessionId: "ses_1" });
  ok("a REGISTERED custom is still stateless in the session layer (same warning)", reg.continuity === "none" && reg.warning === "Custom harness: no session continuity — every turn is stateless.", JSON.stringify(reg));
  ok("a custom harness never claims to name its own session id", sessionIdKind("custom:probe-3") === "cli-chosen", sessionIdKind("custom:probe-3"));
  setCustomHarnesses([]);
  const unreg = sessionArgv("custom:gone-3", { kind: "first", idKind: "mj-chosen", sessionId: "ses_2" });
  ok("an UNREGISTERED custom degrades identically (stateless, warned)", unreg.continuity === "none" && (unreg.warning ?? "").includes("no session continuity"), JSON.stringify(unreg));
  const claude = sessionArgv("claude", { kind: "resume", idKind: "mj-chosen", sessionId: "ses_3" });
  ok("builtin session behaviour is unchanged through the resolver (claude resumes by id)", claude.continuity === "session" && claude.argv.includes("ses_3"), JSON.stringify(claude));
  ok("builtin id-kind detection is unchanged (claude is mj-chosen)", sessionIdKind("claude") === "mj-chosen", sessionIdKind("claude"));
}

/* ── 9. the V11.7.1 additions — droid / kimi / auggie / warp ────────────────────
   Researched 2026-09, every prompt shape below is VENDOR-documented (docs.factory.ai,
   kimi.ai/moonshotai, docs.augmentcode.com, docs.warp.dev) — no community-graded flags
   in any base argv, which no earlier registry growth could claim. droid is the
   interesting one: its headless mode defaults to read-only (spec mode), so MJ's
   write policy composes the documented --auto tier instead of a permission flag. */
section("9. the V11.7.1 additions: droid / kimi / auggie / warp (vendor-documented)");

ok("droid's one-shot is exec mode: droid exec $PROMPT (docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.droid.prompt.argv) === JSON.stringify(["exec", "$PROMPT"]) && AGENT_CAPABILITIES.droid.prompt.confidence === "docs",
  JSON.stringify(AGENT_CAPABILITIES.droid.prompt.argv));
ok("droid's spec-mode default is modelled as the read-only shape (no flag needed — the rare CLI whose headless default IS read-only)",
  JSON.stringify(READ_ONLY.droid) === JSON.stringify(["exec", "$PROMPT"]) && AGENT_CAPABILITIES.droid.readOnly?.argv?.length === 0,
  `${JSON.stringify(READ_ONLY.droid)} / caps readOnly ${JSON.stringify(AGENT_CAPABILITIES.droid.readOnly?.argv)}`);
ok("droid's WRITE composes the documented --auto tier (the one hand-tuned V11.7.1 shape)",
  JSON.stringify(WRITE.droid) === JSON.stringify(["exec", "--auto", "low", "$PROMPT"]) && JSON.stringify(AGENT_CAPABILITIES.droid.write?.argv) === JSON.stringify(["--auto", "low"]),
  JSON.stringify(WRITE.droid));
ok("the Rust argv table agrees on droid exec",
  rust.includes('"droid" => ("droid".into(), vec!["exec".into(), prompt.into()])'), "rust droid argv stale");
ok("kimi's one-shot is prompt mode: kimi -p $PROMPT (docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.kimi.prompt.argv) === JSON.stringify(["-p", "$PROMPT"]) && AGENT_CAPABILITIES.kimi.prompt.confidence === "docs",
  JSON.stringify(AGENT_CAPABILITIES.kimi.prompt.argv));
ok("the Rust argv table agrees on kimi -p",
  rust.includes('"kimi" => ("kimi".into(), vec!["-p".into(), prompt.into()])'), "rust kimi argv stale");
ok("kimi documents its JSONL mode (--output-format stream-json, ndjson)",
  AGENT_CAPABILITIES.kimi.json?.kind === "ndjson" && JSON.stringify(AGENT_CAPABILITIES.kimi.json?.argv) === JSON.stringify(["--output-format", "stream-json"]),
  JSON.stringify(AGENT_CAPABILITIES.kimi.json));
ok("kimi resumes by session id through the SAME session layer (--session $SESSION, docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.kimi.resume?.argv) === JSON.stringify(["--session", "$SESSION"]) &&
  sessionArgv("kimi", { kind: "resume", idKind: sessionIdKind("kimi"), sessionId: "ses_kimi" }).argv.includes("ses_kimi"),
  JSON.stringify(sessionArgv("kimi", { kind: "resume", idKind: sessionIdKind("kimi"), sessionId: "ses_kimi" })));
ok("all four V11.7.1 harnesses are honest about WHO assigns session ids (cli-chosen, no documented sessionStart)",
  sessionIdKind("droid") === "cli-chosen" && sessionIdKind("kimi") === "cli-chosen" && sessionIdKind("auggie") === "cli-chosen" && sessionIdKind("warp") === "cli-chosen",
  "a V11.7.1 harness claims mj-chosen ids without a documented sessionStart");
ok("auggie's one-shot is print mode: auggie --print $PROMPT (docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.auggie.prompt.argv) === JSON.stringify(["--print", "$PROMPT"]) && AGENT_CAPABILITIES.auggie.prompt.confidence === "docs",
  JSON.stringify(AGENT_CAPABILITIES.auggie.prompt.argv));
ok("the Rust argv table agrees on auggie --print",
  rust.includes('"auggie" => ("auggie".into(), vec!["--print".into(), prompt.into()])'), "rust auggie argv stale");
ok("auggie documents its JSON output (--print --output-format json)",
  AGENT_CAPABILITIES.auggie.json?.kind === "json" && JSON.stringify(AGENT_CAPABILITIES.auggie.json?.argv) === JSON.stringify(["--output-format", "json"]),
  JSON.stringify(AGENT_CAPABILITIES.auggie.json));
ok("auggie's enterprise gotcha is recorded (headless can be disabled by agreement)",
  (AGENT_CAPABILITIES.auggie.gotchas ?? []).some((g) => g.includes("enterprise")),
  "the licensing gotcha is missing");
ok("auggie does NOT claim an unverified --print --ask composition (ask mode stays a noted mode, not a composed shape)",
  AGENT_CAPABILITIES.auggie.readOnly?.argv === null && (HARNESS_BY_ID.get("auggie")?.notes ?? "").includes("--ask"),
  "readOnly overclaims or the ask-mode note is gone");
ok("warp's agent runs through the oz binary (like agy, the id is not the bin)",
  JSON.stringify(HARNESS_BY_ID.get("warp")?.bins) === JSON.stringify(["oz"]),
  JSON.stringify(HARNESS_BY_ID.get("warp")?.bins));
ok("the Rust detect table maps warp -> oz and the allowlist admits oz (no warp-terminal confusion)",
  rust.includes('("warp", "Warp Oz Agent CLI", "oz")') && !rust.includes('"warp-terminal"'),
  "warp bin wiring stale");
ok("warp's local agent run is the composed shape; run-cloud is explicitly NOT composed (honesty pin)",
  JSON.stringify(READ_ONLY.warp) === JSON.stringify(["agent", "run", "--prompt", "$PROMPT"]) && (HARNESS_BY_ID.get("warp")?.notes ?? "").includes("run-cloud"),
  JSON.stringify(READ_ONLY.warp));
ok("the Rust argv table agrees on oz agent run --prompt",
  rust.includes('"warp" => ("oz".into(), vec!["agent".into(), "run".into(), "--prompt".into(), prompt.into()])'), "rust warp argv stale");
{
  const expect: Array<[HarnessId, string, string[]]> = [
    ["droid", "droid", ["exec"]],
    ["kimi", "kimi", ["-p"]],
    ["auggie", "auggie", ["--print"]],
    ["warp", "oz", ["agent", "run", "--prompt"]],
  ];
  for (const [id, bin, head] of expect) {
    const adapter = getHarness(id);
    const prep = adapter?.prepare({ taskId: "t", title: "t", prompt: "do it", kind: "implement", languages: [], timeoutMs: 60_000, requiredCapabilities: [], cwd: "/tmp" } as never);
    ok(`a graph-mission agent pinned to ${id} prepares a REAL invocation (${bin})`,
      Boolean(prep) && prep.program === bin && head.every((t) => prep.args.includes(t)),
      JSON.stringify(prep));
  }
}
ok("the four installs name their documented installers",
  HARNESS_BY_ID.get("droid")!.install.includes("app.factory.ai/cli") &&
  HARNESS_BY_ID.get("kimi")!.install.includes("code.kimi.com") &&
  HARNESS_BY_ID.get("auggie")!.install.includes("@augmentcode/auggie") &&
  HARNESS_BY_ID.get("warp")!.install.includes("warp-cli"),
  "an install line drifted from the vendor installer");
ok("all four V11.7.1 harnesses are honest in the sandbox table (no enforced read-only claims)",
  ENFORCED_SANDBOX.droid === false && ENFORCED_SANDBOX.kimi === false && ENFORCED_SANDBOX.auggie === false && ENFORCED_SANDBOX.warp === false,
  "a V11.7.1 harness claims an enforced sandbox it does not have");

/* ── 10. the turn-limit truth (V11.8.0) ────────────────────────────────────────
   The 11.7.x review caught the registry and the policy layer DISAGREEING on Claude's
   turn cap: caps said VERIFIED ABSENT (a 2.1.197 --help scan) while withTurnLimit()
   still emitted --max-turns — two layers, two answers. The 2026-09 web evidence then
   INVERTED the proposed remedy: the flag IS vendor-documented (print-mode only, exits
   with an error at the cap), so the registry was corrected rather than the policy —
   and withTurnLimit is capability-driven now, which also closed a second latent gap:
   grok's documented turn cap was ignored by the policy path. This section pins the
   whole class shut: the policy emits a turn flag IFF the registry documents one. */
section("10. the turn-limit truth — the policy composes what the registry says, for every harness");

{
  const writeReq = { risk: "MEDIUM" as const, mayWriteFiles: true, mayRunShell: true, mayUseBrowser: false, maxTurns: 7, kind: "implement" };
  for (const id of SPAWNABLE) {
    const hasCap = Boolean((AGENT_CAPABILITIES[id as HarnessId]?.maxTurns?.argv ?? []).length);
    const pol = policyFor(id as HarnessId, writeReq);
    const emits = pol.argv.includes("--max-turns");
    ok(`${id}: the write policy emits a turn flag IFF the registry documents one`,
      hasCap === emits,
      `registry ${hasCap ? "documents" : "has no"} turn flag; policy ${emits ? "emits" : "emits no"} --max-turns`);
  }
  ok("claude's turn cap is RESTORED at docs grade with the honest history (print-mode-only, supersedes the 2.1.197 --help scan)",
    JSON.stringify(AGENT_CAPABILITIES.claude.maxTurns?.argv) === JSON.stringify(["--max-turns", "$N"]) && AGENT_CAPABILITIES.claude.maxTurns?.confidence === "docs" && (AGENT_CAPABILITIES.claude.maxTurns?.source ?? "").includes("2.1.197"),
    JSON.stringify(AGENT_CAPABILITIES.claude.maxTurns));
  ok("the registry no longer claims VERIFIED ABSENT for a flag the vendor documents",
    !(AGENT_CAPABILITIES.claude.maxTurns?.source ?? "").includes("ABSENT"),
    "the stale absence claim survives");
  const pol5 = policyFor("claude", { ...writeReq, maxTurns: 5 });
  ok("claude's write shape carries --max-turns 5 BEFORE the prompt (print-mode composition)",
    pol5.argv.includes("--max-turns") && pol5.argv.includes("5") && pol5.argv.indexOf("--max-turns") < pol5.argv.indexOf("$PROMPT"),
    JSON.stringify(pol5.argv));
  const grok9 = policyFor("grok", { ...writeReq, maxTurns: 9 });
  ok("grok's DOCUMENTED turn cap now flows through the policy path too (the second latent gap, closed)",
    grok9.argv.includes("--max-turns") && grok9.argv.includes("9") && grok9.argv.indexOf("--max-turns") < grok9.argv.indexOf("$PROMPT"),
    JSON.stringify(grok9.argv));
  const codex7 = policyFor("codex", writeReq);
  ok("codex (no documented turn flag) still gets none — the ledger is its only ceiling",
    !codex7.argv.includes("--max-turns"), JSON.stringify(codex7.argv));
  ok("the hardcoded claude special-case is GONE from withTurnLimit (capability-driven now)",
    !read("src/mission/harnessPolicy.ts").includes('id === "claude" ? ["--max-turns"'),
    "the special case survives");
  ok("claude's gotchas record the --max-budget-usd decision (documented, deliberately not composed — the CapLedger is the spend authority)",
    (AGENT_CAPABILITIES.claude.gotchas ?? []).some((g) => g.includes("--max-budget-usd") && g.includes("CapLedger")),
    "the budget-cap note is missing");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
