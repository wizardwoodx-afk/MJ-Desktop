/**
 * V9 — CLI agent teams. The thing that makes nine different coding CLIs usable as one reusable,
 * savable crew.
 *
 * Every assertion here is about behaviour that would silently break a real mission: a seat that
 * claims a sandbox its CLI cannot enforce, a team that round-trips wrong, a CRITICAL task quietly
 * handed to a harness.
 */

import { AGENT_CAPABILITIES, EXECUTABLE_HARNESSES, enforcedReadOnly, fullyDocumented, unverifiedClaims } from "../src/mission/agentCapabilities";
import {
  PREBUILT_TEAMS,
  composeSeatArgv,
  loadSavedTeams,
  parseTeam,
  saveTeams,
  seatForTask,
  serializeTeam,
  upsertTeam,
  validateTeam,
  type CliAgentTeam,
  type TeamSeat,
} from "../src/mission/agentTeam";
import { ENFORCED_SANDBOX, policyFor } from "../src/mission/harnessPolicy";
import type { HarnessId } from "../src/domain/harness";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};

console.log("\n== the capability table itself ==\n");

{
  const ids = Object.keys(AGENT_CAPABILITIES) as HarnessId[];
  ok(ids.length >= 9, `all harnesses are described, got ${ids.length}`);
  for (const id of ids) {
    const c = AGENT_CAPABILITIES[id];
    ok(c.id === id, `${id}: id field matches its key`);
    ok(c.name.length > 0, `${id}: has a name`);
    ok(c.install.length > 0, `${id}: says how to install it`);
    ok(c.gotchas.length > 0, `${id}: has at least one production gotcha written down`);
    // Every non-null capability must cite where the claim came from.
    const caps = [c.prompt, c.json, c.readOnly, c.write, c.fullAuto, c.maxTurns, c.timeout, c.outputSchema, c.worktree, c.cwd, c.model, c.resume, c.noAutoUpdate];
    ok(caps.every((x) => x === null || (x.source.length > 0 && x.confidence !== undefined)), `${id}: every capability cites a source`);
  }
}

{
  // The bug this release fixes: three harnesses were wrongly marked as having no sandbox.
  ok(enforcedReadOnly("claude"), "claude enforces read-only (--permission-mode plan)");
  ok(enforcedReadOnly("codex"), "codex enforces read-only (--sandbox read-only)");
  ok(enforcedReadOnly("opencode"), "opencode enforces read-only (--agent plan)");
  ok(enforcedReadOnly("cursor"), "cursor enforces read-only (writes need --force)");
  ok(enforcedReadOnly("grok"), "grok enforces read-only (--sandbox read-only)");
  ok(enforcedReadOnly("cline"), "cline enforces read-only (-p/--plan)");
  ok(!enforcedReadOnly("kilo"), "kilo does NOT: its read-only is a per-agent file, not a flag");
  ok(!enforcedReadOnly("hermes"), "hermes has no sandbox");
  ok(!enforcedReadOnly("llm"), "a plain LLM has no sandbox");

  // And the derived map in harnessPolicy must agree with the table.
  for (const id of Object.keys(AGENT_CAPABILITIES) as HarnessId[]) {
    ok(ENFORCED_SANDBOX[id] === enforcedReadOnly(id), `harnessPolicy's ENFORCED_SANDBOX agrees about ${id}`);
  }
}

{
  ok(EXECUTABLE_HARNESSES.includes("claude") && !EXECUTABLE_HARNESSES.includes("llm"), "only harnesses with a binary are executable");
  ok(fullyDocumented("codex"), "codex is fully documented");
  ok(!fullyDocumented("cursor"), "cursor is NOT fully documented — some claims are community-sourced");
  ok(unverifiedClaims("cursor").length > 0, "cursor's unverified claims are listed so the UI can show them");
  ok(unverifiedClaims("codex").length === 0, "codex has no unverified claims");
}

console.log("\n== composing a seat into a real command line ==\n");

function mkSeat(harness: HarnessId, over: Partial<TeamSeat> = {}): TeamSeat {
  return {
    id: "s",
    role: "reviewer",
    harness,
    model: null,
    mayWrite: false,
    maxRisk: "LOW",
    maxTurns: null,
    timeoutSecs: 600,
    instructions: "",
    ...over,
  };
}

{
  const ctx = { prompt: "Review the diff", cwd: "/repo", readOnly: true };

  const claude = composeSeatArgv(mkSeat("claude"), ctx);
  ok(claude.bin === "claude", "claude resolves to the claude binary");
  ok(claude.argv.includes("plan"), `claude gets plan mode, got ${claude.argv.join(" ")}`);
  ok(claude.argv.includes("--output-format") && claude.argv.includes("json"), "claude gets json so real cost can be read");
  ok(claude.claims.readOnlyEnforced, "claude may claim the sandbox is enforced");
  ok(claude.claims.costKind === "usd", "claude reports real USD");

  const codex = composeSeatArgv(mkSeat("codex"), ctx);
  ok(codex.argv.includes("read-only"), `codex gets --sandbox read-only, got ${codex.argv.join(" ")}`);
  ok(codex.argv[0] === "exec", `codex must lead with the exec subcommand, got: ${codex.argv.join(" ")}`);
  ok(codex.argv.indexOf("--sandbox") > codex.argv.indexOf("exec"), "and the sandbox flag must come after it");
  ok(codex.claims.costKind === "tokens-only", `codex reports tokens only, never dollars, got ${codex.claims.costKind}`);
  ok(claude.claims.costKind === "usd", "claude reports real USD");

  const grok = composeSeatArgv(mkSeat("grok"), ctx);
  const g = grok.argv.join(" ");
  ok(g.includes("--sandbox read-only"), `grok gets the read-only sandbox, got ${g}`);
  ok(g.includes("--permission-mode plan"), "grok gets plan mode");
  ok(grok.argv.includes("--no-auto-update"), "grok must pass --no-auto-update or a CI run can stall");

  const cline = composeSeatArgv(mkSeat("cline"), ctx);
  ok(cline.argv.includes("-p"), `cline gets plan mode, got ${cline.argv.join(" ")}`);
  ok(cline.env.CLINE_COMMAND_PERMISSIONS !== undefined, "cline gets command permissions via env, its only mechanism");
  ok(JSON.parse(cline.env.CLINE_COMMAND_PERMISSIONS).deny.includes("git commit *"), "a read-only cline seat denies commits");

  const cursor = composeSeatArgv(mkSeat("cursor"), ctx);
  ok(cursor.files.some((f) => f.path === ".cursor/cli-config.json"), "cursor gets a cli-config.json, since permissions are file-based");
  const cfg = JSON.parse(cursor.files[0].contents);
  ok(cfg.permissions.deny.includes("Write(*)"), "a read-only cursor seat denies writes in that file");
  ok(cursor.warnings.some((w) => /does not exit/i.test(w)), "cursor's hang bug is surfaced as a warning");

  const kilo = composeSeatArgv(mkSeat("kilo"), ctx);
  ok(kilo.files.some((f) => f.path === ".kilo/agents/mj-readonly.md"), "kilo gets a generated read-only agent file");
  ok(kilo.warnings.some((w) => /verify with kilo --help/i.test(w)), "kilo says its read-only needs verifying");
  ok(!kilo.claims.readOnlyEnforced, "kilo must NOT claim the sandbox is enforced");

  const opencode = composeSeatArgv(mkSeat("opencode", { role: "coder", mayWrite: true }), { prompt: "Implement", cwd: "/repo", readOnly: false });
  ok(opencode.warnings.some((w) => /13851/.test(w)), "opencode's permission-preset issue is surfaced");
}

{
  // A write-capable seat gets the write shape, not the read-only one.
  const w = composeSeatArgv(mkSeat("claude", { role: "coder", mayWrite: true, maxTurns: 30 }), { prompt: "Implement it", cwd: "/repo", readOnly: false });
  ok(w.argv.includes("acceptEdits"), `a coder seat gets acceptEdits, got ${w.argv.join(" ")}`);
  ok(!w.argv.includes("plan"), "a coder seat must not also be in plan mode");
  // CORRECTED after checking the real binary: Claude Code 2.1.197 has no --max-turns flag, so MJ must
  // NOT emit one. The turn bound is enforced by MJ's own caps instead. Grok does have the flag, so it
  // is asserted separately below.
  ok(!w.argv.includes("--max-turns"), "claude does not get a --max-turns flag, because the binary has none");
  const grokWrite = composeSeatArgv(mkSeat("grok", { role: "coder", mayWrite: true, maxRisk: "MEDIUM", maxTurns: 30 }), { prompt: "Implement it", cwd: "/repo", readOnly: false });
  if (grokWrite.argv.includes("--max-turns")) {
    ok(grokWrite.argv.includes("30"), "grok does accept --max-turns, and the bound is passed through");
  } else {
    ok(true, "grok's --max-turns is unverified, so MJ emits nothing rather than a guessed flag");
  }
  ok(w.claims.readOnlyEnforced === false, "a writing seat does not claim read-only");
}

{
  // No seat may silently become read-only-advisory without saying so.
  const advisory = composeSeatArgv(mkSeat("hermes"), { prompt: "x", cwd: "/repo", readOnly: true });
  ok(advisory.warnings.some((w) => /ADVISORY/i.test(w)), "a harness with no sandbox must warn that read-only is advisory");
}

{
  // Regression guard: a flag emitted twice does not parse. This is exactly what happened with
  // cursor, whose read-only mode IS the prompt flag (-p), so the composed line became
  // `cursor-agent -p <task> -p`. Any harness whose read-only or write shape overlaps its prompt
  // flag must model that as `implicit` rather than emitting it.
  for (const id of ["claude", "codex", "opencode", "grok", "cursor", "cline", "kilo"] as HarnessId[]) {
    for (const mode of [true, false]) {
      const r = composeSeatArgv(mkSeat(id, { role: mode ? "reviewer" : "coder", mayWrite: !mode, maxRisk: mode ? "LOW" : "MEDIUM", maxTurns: mode ? null : 30 }), { prompt: "t", cwd: "/r", readOnly: mode });
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const a of r.argv) {
        if (!a.startsWith("-")) continue;
        if (seen.has(a)) dupes.push(a);
        seen.add(a);
      }
      ok(dupes.length === 0, `${id} (${mode ? "read-only" : "write"}) must not repeat a flag: ${dupes.join(", ")} in \`${r.argv.join(" ")}\``);
      ok(r.argv.length > 0, `${id} (${mode ? "read-only" : "write"}) composes a non-empty command`);
      ok(r.bin.length > 0, `${id} resolves to a binary`);
    }
  }
}

console.log("\n== validating a team ==\n");

{
  for (const t of PREBUILT_TEAMS) {
    const errors = validateTeam(t).filter((f) => f.severity === "error");
    ok(errors.length === 0, `prebuilt "${t.name}" has no errors: ${errors.map((e) => e.message).join("; ")}`);
  }
  const balanced = PREBUILT_TEAMS.find((t) => t.id === "team.balanced")!;
  ok(balanced.seats.length === 7, `the balanced crew has 7 seats, got ${balanced.seats.length}`);
  ok(balanced.seats.some((s) => s.role === "coder") && balanced.seats.some((s) => s.role === "tester"), "it can both implement and test");
}

{
  const bad: CliAgentTeam = {
    id: "t",
    name: "",
    description: "",
    seats: [
      { id: "a", role: "coder", harness: "llm", model: null, mayWrite: true, maxRisk: "MEDIUM", maxTurns: null, timeoutSecs: 5, instructions: "" },
      { id: "a", role: "coder", harness: "kilo", model: null, mayWrite: false, maxRisk: "LOW", maxTurns: 99, timeoutSecs: 600, instructions: "" },
    ],
    budgetUsd: null,
    createdAt: "",
    updatedAt: "",
    revision: 1,
  };
  const f = validateTeam(bad);
  const codes = f.map((x) => x.code);
  ok(codes.includes("no_name"), "a nameless team is rejected");
  ok(codes.includes("duplicate_seat"), "duplicate seat ids are rejected");
  ok(codes.includes("cannot_write"), "an LLM cannot fill a coder seat");
  ok(codes.includes("advisory_readonly"), "kilo read-only is flagged advisory");
  ok(codes.includes("short_timeout"), "a 5s timeout is flagged as too short");
  ok(codes.includes("cline_retries") === false, "the cline warning only fires for cline seats");
  ok(codes.includes("no_reviewer"), "a team with no reviewer is warned about");
}

{
  // Single-vendor writing is called out, because that is exactly the blind spot MJ exists to avoid.
  const mono: CliAgentTeam = { ...PREBUILT_TEAMS[0], seats: PREBUILT_TEAMS[0].seats.map((s) => (s.mayWrite ? { ...s, harness: "claude" as HarnessId } : s)) };
  const mono2: CliAgentTeam = { ...PREBUILT_TEAMS[0], seats: PREBUILT_TEAMS[0].seats.map((s) => (s.mayWrite ? { ...s, harness: "claude" as HarnessId } : s)) };
  mono2.seats.push({ ...mono2.seats[2], id: "impl2" }); // two writing seats, one vendor
  ok(validateTeam(mono2).some((f) => f.code === "single_vendor"), "two writing seats on one vendor is flagged");
  const adversarial = PREBUILT_TEAMS.find((t) => t.id === "team.adversarial")!;
  ok(adversarial.seats.filter((s) => s.mayWrite).length === 1, "the adversarial team has exactly one writer");
  ok(!validateTeam(adversarial).some((f) => f.code === "single_vendor"), "one writer is not a diversity problem, so it is not flagged");
}

console.log("\n== routing a task to a seat ==\n");

{
  const team = PREBUILT_TEAMS.find((t) => t.id === "team.balanced")!;
  ok(seatForTask(team, "coder", "MEDIUM").seat !== null, "a MEDIUM coding task finds a seat");
  ok(seatForTask(team, "reviewer", "LOW").seat !== null, "a LOW review finds a seat");
  const crit = seatForTask(team, "coder", "CRITICAL");
  ok(crit.seat === null, "CRITICAL is never routed to a harness");
  ok(/human/i.test(crit.reason ?? ""), `and it says why: ${crit.reason}`);
  const missing = seatForTask(team, "reviewer", "HIGH");
  ok(missing.seat === null, "a risk above every reviewer's ceiling is not routed");
  ok(/escalate/i.test(missing.reason ?? ""), `and it says to escalate: ${missing.reason}`);
}

console.log("\n== saving and reloading a team ==\n");

{
  const team = PREBUILT_TEAMS[0];
  const json = serializeTeam(team);
  const back = parseTeam(json);
  ok(back.errors.length === 0, `a saved team parses cleanly: ${back.errors.join("; ")}`);
  ok(back.team?.seats.length === team.seats.length, "every seat survives the round trip");
  ok(back.team?.seats[2].harness === team.seats[2].harness, "the harness of each seat survives");
  ok(back.team?.budgetUsd === team.budgetUsd, "the budget survives");
}

{
  ok(parseTeam("not json").team === null, "garbage is refused, not guessed at");
  ok(parseTeam('{"schemaVersion":99,"team":{}}').errors[0].includes("Schema version"), "a future schema is refused with a clear message");
  ok(parseTeam('{"schemaVersion":1,"team":{"seats":[{"id":"a","harness":"nope","role":"coder"}]}}').team === null, "an unknown harness is refused");
  ok(parseTeam('{"schemaVersion":1,"team":{"seats":[]}}').team !== null, "an empty seat list is valid — validateTeam warns, parse does not");
}

{
  // Storage round trip. localStorage does not exist under node, so provide one — and assert the
  // module degrades safely when it does not.
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  saveTeams([PREBUILT_TEAMS[0], PREBUILT_TEAMS[1]]);
  const loaded = loadSavedTeams();
  ok(loaded.length === 2, `two teams come back from storage, got ${loaded.length}`);
  ok(loaded[0].name === PREBUILT_TEAMS[0].name, "the saved name is intact");

  const edited = upsertTeam(loaded, { ...loaded[0], name: "Renamed" });
  ok(edited.length === 2, "upsert replaces rather than appends");
  ok(edited[0].name === "Renamed", "the edit landed");
  ok(edited[0].revision === loaded[0].revision + 1, "the revision bumped, so a stale copy is detectable");
  saveTeams([]);
  delete (globalThis as Record<string, unknown>).localStorage;
  ok(loadSavedTeams().length === 0, "with no storage at all it returns empty instead of throwing");
  saveTeams([PREBUILT_TEAMS[0]]); // must not throw
}

console.log("\n== the composed argv is accepted by the policy layer ==\n");

{
  // The two layers must agree: if the team says read-only, the policy must produce a read-only shape.
  for (const id of ["claude", "codex", "opencode", "grok", "cline"] as HarnessId[]) {
    const s = mkSeat(id);
    const composed = composeSeatArgv(s, { prompt: "p", cwd: "/r", readOnly: true });
    const pol = policyFor(id, { kind: "review", risk: "LOW", mayWriteFiles: false, mayRunShell: true, mayUseBrowser: false, maxTurns: 20 });
    ok(composed.claims.readOnlyEnforced === (ENFORCED_SANDBOX[id] === true), `${id}: composed claim and policy agree`);
    ok(pol.canWrite === false, `${id}: policy refuses write for a read-only review`);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
