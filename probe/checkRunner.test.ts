/**
 * §18/§38 — the real check runner.
 *
 * These tests exist because the failure mode they guard against is the worst kind: a verification
 * system that reports a pass or a fail for work it never performed. So the assertions are as much
 * about "did it refuse honestly" as about "did it work".
 */

import { discoverChecks, runAllChecks, runCheck, type CheckSpec, type ReadFn, type RunFn } from "../src/mission/checkRunner";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);

/** An in-memory repo. Nothing touches the real filesystem. */
function repo(files: Record<string, string>): ReadFn {
  return async (path: string) => {
    for (const [name, content] of Object.entries(files)) {
      if (path.endsWith(name)) return content;
    }
    throw new Error(`ENOENT ${path}`);
  };
}

const pkg = (scripts: Record<string, string>, dev: Record<string, string> = {}) =>
  JSON.stringify({ name: "target", scripts, devDependencies: dev });

/**
 * In-memory existence, with the same endsWith path semantics as `repo()` above. True when a known
 * file *is* that path or lives under it — which is what makes a directory like node_modules
 * detectable without a real filesystem.
 */
function existsFor(files: Record<string, string>) {
  return async (path: string) => {
    const clean = path.replace(/\/$/, "");
    const base = clean.split("/").filter(Boolean).pop() ?? clean;
    // Keys are repo-relative ("node_modules/x") while paths are absolute ("/repo/node_modules"),
    // so compare the path's last segment against the key's first segment.
    return Object.keys(files).some((f) => f === clean || f.split("/")[0] === base);
  };
}

const runOk: RunFn = async () => ({ stdout: "all good\n", stderr: "", code: 0 });
const runFail: RunFn = async () => ({ stdout: "", stderr: "2 tests failed\n", code: 1 });
const canRun = async () => true;

console.log("\n== discovery: derived from the manifest, never invented ==\n");

{
  const specs = await discoverChecks("/repo", repo({ "package.json": pkg({ typecheck: "tsc --noEmit", lint: "eslint .", test: "vitest run" }) }));
  const ids = specs.map((s) => s.id);
  eq(ids, ["typecheck", "lint", "test"], "a node repo with all three scripts must yield exactly three checks");
  ok(specs.every((s) => s.discoveredFrom.startsWith("package.json scripts.")), "every check must name the script it came from");
  eq(specs.find((s) => s.id === "test")?.source, "TEST_RUN", "the test script must be a TEST_RUN check");
  eq(specs.find((s) => s.id === "lint")?.source, "STATIC_CHECK", "lint must be a STATIC_CHECK");
}
{
  // No typecheck script but typescript is a dependency: fall back to tsc --noEmit.
  const specs = await discoverChecks("/repo", repo({ "package.json": pkg({ build: "vite build" }, { typescript: "^5.6.0" }) }));
  eq(specs.map((s) => s.id), ["typecheck"], "typescript as a dep must imply a typecheck even with no script");
  eq(specs[0].args, ["exec", "--", "tsc", "--noEmit"], "the fallback must be tsc --noEmit");
  eq(specs[0].discoveredFrom, "package.json dependency: typescript", "the fallback must say where it came from");
}
{
  // A repo with nothing recognisable must produce nothing — not a guess.
  const specs = await discoverChecks("/repo", repo({ "README.md": "hello" }));
  eq(specs.length, 0, "an unrecognisable repo must yield zero checks");
}
{
  const specs = await discoverChecks("/repo", repo({ "Cargo.toml": "[package]\nname='x'\n" }));
  eq(specs.map((s) => s.id), ["cargo-check", "cargo-test"], "a Rust repo must yield cargo check + cargo test");
  eq(specs[0].source, "STATIC_CHECK", "cargo check is static analysis");
  eq(specs[1].source, "TEST_RUN", "cargo test is the test run");
}
{
  const specs = await discoverChecks("/repo", repo({ "pyproject.toml": "[project]\nname='x'\n" }));
  eq(specs.map((s) => s.id), ["pytest"], "a python repo must yield pytest");
}
{
  // A malformed manifest must not throw and must not invent checks.
  const specs = await discoverChecks("/repo", repo({ "package.json": "{ this is not json" }));
  eq(specs.length, 0, "a malformed package.json must yield zero checks, not an exception");
}

console.log("\n== execution: exit code becomes a measured result ==\n");

{
  const spec: CheckSpec = { id: "test", label: "Test suite", source: "TEST_RUN", command: "npm", args: ["run", "test"], timeoutSecs: 60, discoveredFrom: "package.json scripts.test" };
  const r = await runCheck(spec, "/repo", runOk, canRun, existsFor({ "node_modules/x": "" }));
  ok(r.didRun, "with node_modules present the check must run");
  eq(r.exitCode, 0, "exit code must be captured");
  eq(r.reason, null, "a passing run has no reason");
  ok(r.durationMs >= 0, "duration must be recorded");
}
{
  const spec: CheckSpec = { id: "test", label: "Test suite", source: "TEST_RUN", command: "npm", args: ["run", "test"], timeoutSecs: 60, discoveredFrom: "package.json scripts.test" };
  const r = await runCheck(spec, "/repo", runFail, canRun, existsFor({ "node_modules/x": "" }));
  ok(r.didRun, "a failing test still ran");
  eq(r.exitCode, 1, "the failing exit code must be captured");
  ok(/exited 1/.test(r.reason ?? ""), `the reason must state the exit code, got ${r.reason}`);
  ok(r.output.includes("2 tests failed"), "stderr must be captured as output");
}

console.log("\n== the two rules that stop it lying ==\n");

{
  // Rule 1: never run npm with no dependencies installed.
  const spec: CheckSpec = { id: "test", label: "Test suite", source: "TEST_RUN", command: "npm", args: ["run", "test"], timeoutSecs: 60, discoveredFrom: "package.json scripts.test" };
  let executed = false;
  const spy: RunFn = async () => {
    executed = true;
    return { stdout: "", stderr: "", code: 0 };
  };
  const r = await runCheck(spec, "/repo", spy, canRun, existsFor({ "package.json": "{}" }));
  ok(!executed, "npm must NOT be executed when node_modules is absent");
  ok(!r.didRun, "the check must report that it did not run");
  eq(r.exitCode, null, "no exit code when nothing ran");
  ok(/node_modules is absent/.test(r.reason ?? ""), `the reason must explain, got ${r.reason}`);
}
{
  // Rule 2: no executor means unmeasured, not failed.
  const spec: CheckSpec = { id: "test", label: "Test suite", source: "TEST_RUN", command: "cargo", args: ["test"], timeoutSecs: 60, discoveredFrom: "Cargo.toml" };
  const r = await runCheck(spec, "/repo", runFail, async () => false, existsFor({}));
  ok(!r.didRun, "with no executor nothing may run");
  ok(/native desktop build/.test(r.reason ?? ""), `the reason must name the missing executor, got ${r.reason}`);
}
{
  // A throwing executor must not become a phantom failure either.
  const spec: CheckSpec = { id: "test", label: "Test suite", source: "TEST_RUN", command: "cargo", args: ["test"], timeoutSecs: 60, discoveredFrom: "Cargo.toml" };
  const boom: RunFn = async () => {
    throw new Error("spawn cargo ENOENT");
  };
  const r = await runCheck(spec, "/repo", boom, canRun, existsFor({}));
  ok(!r.didRun, "a spawn failure means it did not run");
  ok(/ENOENT/.test(r.reason ?? ""), "the spawn error must be surfaced verbatim");
}

console.log("\n== a whole pass ==\n");

{
  const files = { "package.json": pkg({ typecheck: "tsc --noEmit", test: "vitest run" }), "node_modules/x": "" };
  const read = repo(files);
  const results = await runAllChecks("/repo", { read, run: runOk, canRun, exists: existsFor(files) });
  eq(results.length, 2, "both discovered checks must run");
  ok(results.every((r) => r.didRun && r.exitCode === 0), "all must run and pass");

  const onlyTests = await runAllChecks("/repo", { read, run: runOk, canRun, exists: existsFor(files), only: ["TEST_RUN"] });
  eq(onlyTests.map((r) => r.spec.id), ["test"], "`only` must filter by evidence source");
}
{
  // The honest shape of a repo that cannot be verified at all.
  const results = await runAllChecks("/repo", { read: repo({ "package.json": pkg({ test: "vitest run" }) }), run: runOk, canRun, exists: existsFor({ "package.json": "x" }) });
  eq(results.length, 1, "one check discovered");
  ok(!results[0].didRun, "and it must not have run, because node_modules is absent");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
