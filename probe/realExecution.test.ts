/**
 * §18/§38 integration — real verification against a real repository.
 *
 * Everything else in the suite injects fakes. This one does not: it creates actual repositories on
 * disk with actual test suites, runs them through the actual executor, and drives them through the
 * actual MissionRuntime. If MJ claims a mission is verified, this is the test that decides whether
 * that claim means anything.
 *
 * Skips cleanly (rather than passing vacuously) when python3/pytest or cargo is unavailable, and
 * says so.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MissionRuntime, createServices } from "../src/mission/missionRuntime";
import { instantiateTemplate } from "../src/mission/templates";
import { DEFAULT_BOUNDARY, DEFAULT_BUDGET, DEFAULT_POLICY } from "../src/mission/types";
import { runAllChecks } from "../src/mission/checkRunner";

let pass = 0;
let fail = 0;
let skipped = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};

/** A rustup toolchain often has no shims on PATH; add its bin dir if present. */
const CARGO_BIN = "/home/user/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin";
const envPath = `${CARGO_BIN}:${process.env.PATH ?? ""}`;

function have(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore", env: { ...process.env, PATH: envPath } });
    process.env.PATH = envPath; // so the spawned check command can find it too
    return true;
  } catch {
    return false;
  }
}

const HAS_PYTEST = have("python3");
const HAS_CARGO = have("cargo");

function mkrepo(name: string, files: Record<string, string>): string {
  const dir = join(tmpdir(), `mj7-${name}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const PYPROJECT = "[project]\nname = 'target'\nversion = '0.1.0'\n";

console.log("\n== real commands, real exit codes ==\n");

if (!HAS_PYTEST) {
  skipped += 1;
  console.log("  SKIP python3 unavailable — real verification not exercisable here");
} else {
  const green = mkrepo("green", {
    "pyproject.toml": PYPROJECT,
    "test_thing.py": "def test_ok():\n    assert 1 + 1 == 2\n",
  });
  const red = mkrepo("red", {
    "pyproject.toml": PYPROJECT,
    "test_thing.py": "def test_broken():\n    assert 1 + 1 == 3\n",
  });
  const nodeps = mkrepo("nodeps", { "package.json": JSON.stringify({ name: "x", scripts: { test: "vitest run" } }) });

  {
    const results = await runAllChecks(green);
    const test = results.find((r) => r.spec.source === "TEST_RUN");
    ok(Boolean(test), "pytest must be discovered from pyproject.toml");
    ok(test?.didRun === true, `pytest must actually run, got ${test?.reason}`);
    ok(test?.exitCode === 0, `a passing suite must exit 0, got ${test?.exitCode}`);
    console.log(`       green repo: exit=${test?.exitCode}, ${test?.output.length} bytes of real pytest output`);
  }
  {
    const results = await runAllChecks(red);
    const test = results.find((r) => r.spec.source === "TEST_RUN");
    ok(test?.didRun === true, "the failing suite must still run");
    ok(test?.exitCode !== 0, `a failing suite must exit non-zero, got ${test?.exitCode}`);
    ok(/assert/.test(test?.output ?? ""), "the failure output must be captured verbatim");
    console.log(`       red repo: exit=${test?.exitCode}, failure text captured: ${/assert/.test(test?.output ?? "")}`);
  }
  {
    // A node repo with no node_modules must be refused, not reported as a test failure.
    const results = await runAllChecks(nodeps);
    const test = results.find((r) => r.spec.source === "TEST_RUN");
    ok(test !== undefined, "the npm test script must be discovered");
    ok(test?.didRun === false, "npm must not run without node_modules");
    ok(/node_modules is absent/.test(test?.reason ?? ""), `reason must explain: ${test?.reason}`);
  }

  for (const d of [green, red, nodeps]) rmSync(d, { recursive: true, force: true });
}

if (!HAS_CARGO) {
  skipped += 1;
  console.log("  SKIP cargo unavailable — Rust checks not exercised");
} else {
  const rust = mkrepo("rust", {
    "Cargo.toml": "[package]\nname = 'target'\nversion = '0.1.0'\nedition = '2021'\n",
    "src/lib.rs": "pub fn two() -> i32 { 2 }\n",
  });
  const results = await runAllChecks(rust, { only: ["STATIC_CHECK"] });
  const check = results.find((r) => r.spec.id === "cargo-check");
  ok(check?.didRun === true, `cargo check must run, got ${check?.reason}`);
  ok(check?.exitCode === 0, `a valid crate must pass cargo check, got ${check?.exitCode}`);
  console.log(`       rust repo: cargo check exit=${check?.exitCode}`);
  rmSync(rust, { recursive: true, force: true });
}

console.log("\n== a mission whose verification is real ==\n");

if (!HAS_PYTEST) {
  skipped += 1;
} else {
  const repo = mkrepo("mission", {
    "pyproject.toml": PYPROJECT,
    "test_billing.py": "def test_billing_totals():\n    assert sum([1, 2, 3]) == 6\n",
  });

  const mission = instantiateTemplate("tpl.software-development", {
    objective: "Build a billing module with verified totals",
    name: "Real verification probe",
    workspace: repo,
  });
  mission.successCriteria = ["Tests pass"];
  mission.budget = { ...DEFAULT_BUDGET, maxCostUsd: 5, maxRetriesPerTask: 2, maxGraphMutations: 2 };
  mission.riskPolicy = { ...DEFAULT_POLICY, autonomy: "SUPERVISED", approvalThreshold: "HIGH" };
  mission.boundary = { ...DEFAULT_BOUNDARY, shell: true, filesystemWrite: true };

  const services = createServices();
  const rt = new MissionRuntime(mission, services, {
    allowSimulated: true,
    installed: { "local-test": true },
    repository: repo,
    approvalTimeoutMs: 4000,
    onApprovalRequired: (id) => setTimeout(() => services.approvals.decide(id, "APPROVED", "human", "probe"), 10),
  });
  rt.prepare();
  rt.buildOrganization();
  await rt.run();

  const events = rt.getEvents();
  const evalStarted = events.find((e) => e.kind === "EVALUATION_STARTED" && e.policy === "evaluation.repository-own-commands");
  ok(Boolean(evalStarted), "the runtime must record that it ran the repository's own commands");
  console.log(`       ${evalStarted?.reason ?? "(nothing recorded)"}`);

  const testChecks = services.artifacts
    .forMission(mission.missionId)
    .flatMap((a) => a.evaluation?.checks ?? [])
    .filter((c) => c.source === "TEST_RUN");
  ok(testChecks.length > 0, "a TEST_RUN check must exist");
  const measured = testChecks.filter((c) => c.measured);
  ok(measured.length > 0, "the TEST_RUN check must be MEASURED — this is the whole point of V7");
  ok(measured.every((c) => c.passed), "the suite genuinely passes, so the measured check must pass");
  console.log(`       TEST_RUN checks: ${testChecks.length}, measured: ${measured.length}, passed: ${measured.filter((c) => c.passed).length}`);

  // §38: execution was still the labelled simulation, so the mission must NOT claim completion.
  ok(mission.status !== "COMPLETED", `simulated execution must not produce COMPLETED, got ${mission.status}`);
  console.log(`       mission status: ${mission.status} (simulated worker, real verification)`);

  rmSync(repo, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped\n`);
process.exit(fail ? 1 : 0);
