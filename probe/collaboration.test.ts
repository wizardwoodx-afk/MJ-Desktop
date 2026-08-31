/**
 * V9 — collaboration. Proves that several different CLI agents can be given one plan, isolated
 * worktrees, a shared briefing and an independent verifier, and that the failure modes are detected
 * BEFORE the agents run rather than discovered at merge time.
 */

import {
  findClaimConflicts,
  planCollaboration,
  planVerification,
  planWorktrees,
  renderPlan,
  setupArgv,
  teardownArgv,
  writeContextFiles,
  type Claim,
} from "../src/mission/collaboration";
import { PREBUILT_TEAMS, type CliAgentTeam } from "../src/mission/agentTeam";
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

const balanced = PREBUILT_TEAMS.find((t) => t.id === "team.balanced")!;
const adversarial = PREBUILT_TEAMS.find((t) => t.id === "team.adversarial")!;
const audit = PREBUILT_TEAMS.find((t) => t.id === "team.audit")!;

const REPO = { repoRoot: "/repo/app", baseBranch: "main", missionSlug: "rate-limiter" };

console.log("\n== 1. worktree isolation ==\n");

{
  const plans = planWorktrees(balanced, REPO);
  ok(plans.length === balanced.seats.length, `every seat gets a plan, got ${plans.length} of ${balanced.seats.length}`);
  const writers = plans.filter((p) => !p.shared);
  const readers = plans.filter((p) => p.shared);
  ok(writers.length === 1, `exactly one writer gets its own worktree, got ${writers.length}`);
  ok(readers.length === balanced.seats.length - 1, "everyone read-only shares the base checkout");
  ok(writers[0].branch === "mj/rate-limiter/impl", `the branch is namespaced by mission and seat, got ${writers[0].branch}`);
  ok(!writers[0].path.startsWith("/repo/app/"), `the worktree is a SIBLING of the repo, not inside it, got ${writers[0].path}`);
  ok(writers[0].path.startsWith("/repo/app-mj-"), `sibling path is ${writers[0].path}`);
  ok(readers.every((r) => r.path === "/repo/app"), "read-only seats point at the real repo, so they review what is actually there");
  ok(/review a tree nobody is writing to/.test(readers[0].reason), "and the reason explains why they are not isolated");

  const argv = writers[0].createArgv[0];
  ok(argv[0] === "worktree" && argv[1] === "add" && argv.includes("-b"), `creation is real git argv: git ${argv.join(" ")}`);
  ok(argv[argv.length - 1] === "main", "and it branches from the base branch");
  ok(setupArgv(planCollaboration(balanced, { ...REPO, objective: "x" }))[0][0] === "git", "setup argv is prefixed with git");
  const td = teardownArgv(planCollaboration(balanced, { ...REPO, objective: "x" }));
  ok(td.some((a) => a.includes("prune")), "teardown prunes, so leftover worktrees do not accumulate");
}

{
  // A multi-writer team must isolate BOTH writers.
  const twoWriters: CliAgentTeam = { ...adversarial, seats: adversarial.seats.map((s) => (s.role === "tester" ? { ...s, mayWrite: true } : s)) };
  const plans = planWorktrees(twoWriters, REPO);
  ok(plans.filter((p) => !p.shared).length === 2, "two writing seats get two worktrees");
  const branches = plans.filter((p) => !p.shared).map((p) => p.branch);
  ok(new Set(branches).size === 2, `and they are on different branches: ${branches.join(", ")}`);
  const paths = plans.filter((p) => !p.shared).map((p) => p.path);
  ok(new Set(paths).size === 2, "in different directories, so they cannot overwrite each other");
}

{
  // Branch names must survive awkward seat ids.
  const weird: CliAgentTeam = { ...balanced, seats: [{ ...balanced.seats[2], id: "impl/../etc passwørd!" }] };
  const p = planWorktrees(weird, REPO).find((x) => !x.shared)!;
  ok(!/[^\w./-]/.test(p.branch.replace("mj/rate-limiter/", "")), `an awkward seat id still yields a legal branch: ${p.branch}`);
  ok(!p.branch.includes(".."), "and path traversal cannot be smuggled into a branch name");
}

console.log("\n== 2. the config bridge ==\n");

{
  const files = writeContextFiles(balanced, { objective: "Add a rate limiter", constraints: ["No new dependencies"], doNotTouch: ["src/legacy/**"] });
  const paths = files.map((f) => f.path);
  ok(paths.includes("CLAUDE.md"), `Claude Code gets CLAUDE.md; got ${paths.join(", ")}`);
  ok(paths.includes("AGENTS.md"), "Codex/OpenCode/Grok get AGENTS.md");
  // The balanced crew only contains claude + codex + opencode, so it must NOT get a .clinerules.
  ok(!paths.includes(".clinerules"), "a team with no Cline seat gets no .clinerules");
  ok(paths.filter((p) => p === "AGENTS.md").length === 1, "AGENTS.md is written ONCE even though two harnesses read it");

  // The adversarial crew adds Cline, so it must get one.
  const adv = writeContextFiles(adversarial, { objective: "x", constraints: [], doNotTouch: [] });
  ok(adv.some((f) => f.path === ".clinerules"), "a team WITH a Cline seat gets .clinerules");
  ok(!adv.some((f) => f.path === ".cursor/rules/mj.mdc"), "and no Cursor seat means no .cursor rules");

  const claude = files.find((f) => f.path === "CLAUDE.md")!;
  ok(claude.contents.includes("Add a rate limiter"), "the briefing carries the objective");
  ok(claude.contents.includes("No new dependencies"), "and the constraints");
  ok(claude.contents.includes("src/legacy/**"), "and what is off limits");
  ok(/OTHER worktrees/.test(claude.contents), "and it tells the agent other agents are working elsewhere");
  ok(/Do not reformat/.test(claude.contents), "and forbids drive-by reformatting, which makes other seats' diffs unreviewable");
  ok(/Generated by MJ/.test(claude.contents), "and is marked generated, so nobody hand-edits it");
}

{
  // The audit team is read-only everywhere, but still gets its briefing.
  const files = writeContextFiles(audit, { objective: "Audit", constraints: [], doNotTouch: [] });
  ok(files.length > 0, "a read-only team still gets a shared briefing");
  ok(files[0].contents.includes("(none declared)"), "and an empty constraint list is stated, not left blank");
}

console.log("\n== 3. claims — collisions caught before the work ==\n");

{
  const claims: Claim[] = [
    { seatId: "impl", paths: ["src/api/**"], symbols: ["RateLimiter"], declaredAt: "" },
    { seatId: "infra", paths: ["src/api/middleware.ts"], symbols: ["RateLimiter"], declaredAt: "" },
    { seatId: "docs", paths: ["docs/**"], symbols: [], declaredAt: "" },
  ];
  const conflicts = findClaimConflicts(claims);
  ok(conflicts.length === 1, `one conflict, got ${conflicts.length}`);
  ok(conflicts[0].severity === "symbol", "and it is SYMBOL-level, the dangerous kind");
  ok(conflicts[0].on.includes("RateLimiter"), "naming the function both would rewrite");
  ok(/clean-looking and semantically broken/.test(conflicts[0].advice), "explaining why a clean merge is not enough");
  ok(!conflicts.some((c) => c.a === "docs" || c.b === "docs"), "the docs seat overlaps nothing");
}

{
  // Glob overlap, not just exact equality.
  const a: Claim[] = [
    { seatId: "x", paths: ["src/**"], symbols: [], declaredAt: "" },
    { seatId: "y", paths: ["src/api/routes.ts"], symbols: [], declaredAt: "" },
  ];
  const c = findClaimConflicts(a);
  ok(c.length === 1 && c[0].severity === "path", "a glob overlapping a concrete path is a conflict");
  ok(findClaimConflicts([{ seatId: "x", paths: ["a/**"], symbols: [], declaredAt: "" }, { seatId: "y", paths: ["b/**"], symbols: [], declaredAt: "" }]).length === 0, "disjoint globs are not a conflict");
  ok(findClaimConflicts([]).length === 0, "no claims, no conflicts");
  ok(findClaimConflicts([{ seatId: "x", paths: ["a"], symbols: [], declaredAt: "" }]).length === 0, "a single claim cannot conflict with itself");
}

console.log("\n== 4. cross-vendor verification ==\n");

{
  const v = planVerification(adversarial);
  ok(v.length === 1, "one writing seat, one verification pair");
  ok(v[0].independent === true, "the adversarial team's verifier IS independent");
  ok(v[0].verifierHarness !== v[0].producerHarness, `${v[0].verifierHarness} checks ${v[0].producerHarness}`);
  ok(/blind spots are not shared/.test(v[0].reason), "and the reason says why that matters");
}

{
  // A single-vendor team must be told its review is advisory, not silently accepted.
  const mono: CliAgentTeam = { ...balanced, seats: balanced.seats.map((s) => ({ ...s, harness: "claude" as HarnessId })) };
  const v = planVerification(mono);
  ok(v.every((x) => !x.independent), "with one vendor, nothing is independent");
  ok(v.some((x) => /WARNING/.test(x.reason)), "and MJ says so loudly");
  ok(v.some((x) => /advisory, not as verification/.test(x.reason)), "and refuses to call it verification");
}

{
  // No reviewer at all.
  const none: CliAgentTeam = { ...balanced, seats: balanced.seats.filter((s) => s.role !== "reviewer" && s.role !== "security") };
  const v = planVerification(none);
  ok(v.length === 1 && v[0].verifierId === "", "a team with no reviewer pairs the writer with nobody");
  ok(/Self-certification is not verification/.test(v[0].reason), "and says self-certification does not count");
}

console.log("\n== the whole plan ==\n");

{
  const plan = planCollaboration(adversarial, {
    ...REPO,
    objective: "Add a rate limiter to the API",
    constraints: ["No new dependencies"],
    claims: [
      { seatId: "impl", paths: ["src/api/**"], symbols: [], declaredAt: "" },
      { seatId: "test", paths: ["tests/**"], symbols: [], declaredAt: "" },
    ],
  });
  ok(plan.waves.length >= 4, `${plan.waves.length} execution waves`);
  const first = plan.waves[0];
  ok(first.seats.length === 1 && adversarial.seats.find((s) => s.id === first.seats[0])?.role === "planner", "planning is the first wave");
  const lastWriters = plan.waves.findIndex((w) => w.seats.includes("impl"));
  const lastTesters = plan.waves.findIndex((w) => w.seats.includes("test"));
  const lastReview = plan.waves.findIndex((w) => w.seats.some((s) => adversarial.seats.find((x) => x.id === s)?.role === "reviewer"));
  ok(lastWriters < lastTesters, `writing (wave ${lastWriters + 1}) comes before testing (wave ${lastTesters + 1})`);
  ok(lastTesters < lastReview, `and testing before review (wave ${lastReview + 1}), so the review sees the tested result`);
  ok(plan.conflicts.length === 0, "these claims do not overlap");
  ok(plan.contextFiles.length > 0, "context files are planned");

  const text = renderPlan(plan);
  ok(/isolation:/.test(text) && /execution waves:/.test(text) && /verification:/.test(text), "the plan renders every section");
  ok(/independent/.test(text), "and labels the verifier independent");
}

{
  // Conflicting claims must push two WRITERS into separate waves rather than run them in parallel.
  // The fixture has to use two writing seats: the adversarial team's `test` seat is read-only, so it
  // cannot have a write claim at all — a claim from a seat that cannot write is meaningless.
  const twoWriters: CliAgentTeam = { ...adversarial, seats: [...adversarial.seats, { ...adversarial.seats[1], id: "impl2", harness: "codex" as HarnessId }] };
  const plan = planCollaboration(twoWriters, {
    ...REPO,
    objective: "x",
    claims: [
      { seatId: "impl", paths: ["src/**"], symbols: ["Handler"], declaredAt: "" },
      { seatId: "impl2", paths: ["src/handler.ts"], symbols: ["Handler"], declaredAt: "" },
    ],
  });
  ok(plan.conflicts.length === 1, "the symbol conflict is detected");
  ok(plan.conflicts[0].a === "impl" && plan.conflicts[0].b === "impl2", "between the two writers");
  const w1 = plan.waves.findIndex((w) => w.seats.includes("impl"));
  const w2 = plan.waves.findIndex((w) => w.seats.includes("impl2"));
  ok(w1 !== w2, `the two conflicting writers are in different waves (${w1 + 1} vs ${w2 + 1})`);
  ok(plan.waves[w1].seats.length === 1, "each runs alone");
  ok(plan.waves[w2].seats.length === 1, "so they cannot overwrite each other");
  ok(/looks clean and is semantically wrong/.test(plan.waves[w2].why), `and the wave says why: ${plan.waves[w2].why}`);
  ok(plan.problems.some((p) => /symbol-level/.test(p)), "and the plan flags it before starting");
  ok(plan.waves.every((w) => w.seats.length > 0), "no wave is empty");
  const allSeats = plan.waves.flatMap((w) => w.seats);
  ok(new Set(allSeats).size === allSeats.length, `and no seat is scheduled twice: ${allSeats.join(",")}`);
  ok(allSeats.length === twoWriters.seats.length, `every seat is scheduled exactly once (${allSeats.length} of ${twoWriters.seats.length})`);

  // The same two writers WITHOUT a conflict do run in parallel — worktree isolation is what makes
  // that safe rather than reckless.
  const free = planCollaboration(twoWriters, {
    ...REPO,
    objective: "x",
    claims: [
      { seatId: "impl", paths: ["src/a/**"], symbols: [], declaredAt: "" },
      { seatId: "impl2", paths: ["src/b/**"], symbols: [], declaredAt: "" },
    ],
  });
  ok(free.waves.some((w) => w.seats.includes("impl") && w.seats.includes("impl2")), "with disjoint claims they share one wave");
  ok(free.worktrees.filter((w) => !w.shared).length === 2, "in two separate worktrees");
  ok(free.problems.some((p) => /2 different CLIs will write/.test(p)), "and MJ still names the reconciliation cost");
}

{
  // The read-only audit team needs no worktrees and no merge.
  const plan = planCollaboration(audit, { ...REPO, objective: "Audit this repo" });
  ok(plan.worktrees.every((w) => w.shared), "a read-only team gets no worktrees at all");
  ok(setupArgv(plan).length === 0, "so there is nothing to set up");
  ok(plan.verification.length === 0, "and nothing writes, so nothing needs verifying");
}

{
  const plan = planCollaboration(balanced, { ...REPO, objective: "x" });
  ok(plan.problems.some((p) => /different CLIs will write/.test(p)) === false, "one writer produces no reconciliation warning");
  const multi: CliAgentTeam = { ...balanced, seats: [...balanced.seats, { ...balanced.seats[2], id: "impl2", harness: "codex" as HarnessId }] };
  const p2 = planCollaboration(multi, { ...REPO, objective: "x", claims: [{ seatId: "impl", paths: ["a/**"], symbols: [], declaredAt: "" }, { seatId: "impl2", paths: ["b/**"], symbols: [], declaredAt: "" }] });
  ok(p2.problems.some((p) => /2 different CLIs will write/.test(p)), "two writing CLIs is called out as a real reconciliation cost");
  ok(p2.worktrees.filter((w) => !w.shared).length === 2, "and both get isolated");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
