/**
 * Sandbox probe (V11, W3). Runs the real canaries where a real wrapper exists (Linux CI with
 * bubblewrap), and otherwise states exactly what was and was not measured — the same honesty
 * rule the Proof page uses.
 *
 * Run: ./node_modules/.bin/esbuild probe/sandbox.test.ts --bundle --platform=node --format=esm \
 *        --outfile=/tmp/sandbox.mjs --log-level=error && node /tmp/sandbox.mjs
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { sandboxProfileFor, scrubEnv, verifyEnforcement, wrapForSeat, type SandboxProfile } from "../src/mission/sandbox";

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

const envSample: Record<string, string> = {
  PATH: "/usr/bin",
  HOME: "/home/dev",
  AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  GITHUB_TOKEN: "ghp_0123456789abcdefghijklmnopqrstuvwxyz",
  OPENAI_API_KEY: "sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  NPM_TOKEN: "npm_0000000000000000000000000000000000",
  MY_SERVICE_PASSWORD: "hunter2hunter2",
  SLACK_BOT_TOKEN: "xoxb-123456789012-123456789012",
  MJ_EDITOR_PREFS: "snap=16",
};

section("0. credential scrubbing — the baseline hygiene");
const scrubbed = scrubEnv(envSample);
for (const gone of ["AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "OPENAI_API_KEY", "NPM_TOKEN", "MY_SERVICE_PASSWORD", "SLACK_BOT_TOKEN"]) {
  ok(`scrubbed: ${gone}`, !(gone in scrubbed), JSON.stringify(Object.keys(scrubbed)));
}
ok("non-credential variables survive", "PATH" in scrubbed && "HOME" in scrubbed && "MJ_EDITOR_PREFS" in scrubbed);
ok("token-shaped VALUES are scrubbed even under innocent names", !("MJ_EDITOR_PREFS" in scrubEnv({ MJ_EDITOR_PREFS: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c" })));
ok("the profile lists what it will scrub", sandboxProfileFor("MEDIUM", os.tmpdir()).scrubbedEnvKeys.includes("GITHUB_TOKEN"));

section("1. profiles match the risk tier");
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "mj-sbx-"));
  const testPlatform = process.platform === "win32" ? "linux" : undefined;
  const low = sandboxProfileFor("LOW", ws, testPlatform);
  ok("LOW: no filesystem wrapper", low.wrapper.length === 0);
  ok("LOW: still scrubs credentials", low.scrubbedEnvKeys.length > 0);
  const med = sandboxProfileFor("MEDIUM", ws, testPlatform);
  ok("MEDIUM: workspace-only writes", med.wrapper.includes("--bind") || med.wrapper.includes("sandbox-exec"));
  ok("MEDIUM: network still allowed", !med.wrapper.includes("--unshare-net"));
  const high = sandboxProfileFor("HIGH", ws, testPlatform);
  ok("HIGH: network denied", high.tier === "fs+net" && (high.wrapper.includes("--unshare-net") || high.note.includes("network denied")));
  ok("every profile carries canaries or an honest note", [low, med, high].every((p) => p.canaries.length > 0 || p.note.length > 10));
  const wrapped = wrapForSeat("HIGH", ws, "claude", ["-p", "hi"], testPlatform);
  ok("wrapForSeat puts the wrapper in front of the agent", wrapped.argv[0] !== "claude" && wrapped.argv.includes("claude"));
  ok("the wrapped command is fully visible for consent", wrapped.argv.join(" ").length > 0);
  fs.rmSync(ws, { recursive: true, force: true });
}

section("2. canaries are measured, not asserted (Linux + bubblewrap when present)");
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "mj-sbx-"));
  const profile = sandboxProfileFor("HIGH", ws, "linux");
  // V11.8.1: existence is not usability. On the 7th review's machine bwrap existed but
  // could not be executed (EACCES — e.g. a noexec mount): existsSync said "present" while
  // every spawn failed. Detect the wrapper by trying to run it, so this probe branches on
  // what the canaries will actually observe. A NUMERIC error code means bwrap ran and
  // exited (even a usage error proves the binary executes); a spawn errno does not.
  const bwrapUsable = await new Promise<boolean>((resolve) => {
    const unavailable = new Set(["ENOENT", "EACCES", "EPERM", "ENOEXEC"]);
    execFile("bwrap", ["--version"], { timeout: 4000 }, (err) => {
      if (!err) return resolve(true);
      resolve(!unavailable.has(String((err as NodeJS.ErrnoException).code ?? "")));
    });
  });
  if (bwrapUsable) {
    const result = await verifyEnforcement(profile);
    ok("enforcement was measured by real canaries", result.measured);
    ok("the workspace write INSIDE is possible (control canary is implicit in the seat)", fs.existsSync(ws));
    ok("a write outside the workspace FAILED as expected", result.evidence.some((e) => e.name.includes("write outside") && e.failedAsExpected), JSON.stringify(result.evidence));
    ok("network is unreachable as expected", result.evidence.some((e) => e.name.includes("network") && e.failedAsExpected));
    ok("verdict: enforced", result.enforced);
  } else {
    const result = await verifyEnforcement(profile);
    ok("bubblewrap absent or unusable → measured:false, enforced:false, stated plainly",
      result.measured === false && result.enforced === false && result.note.length > 0,
      "no silent pass");
    console.log("  (bubblewrap not installed or not executable here — install it to measure: apt install bubblewrap)");
  }
  // The "no wrapper" platform must never claim enforcement.
  const winProfile = sandboxProfileFor("HIGH", ws, "windows");
  const winResult = await verifyEnforcement(winProfile);
  ok("Windows profile refuses to claim enforcement", winResult.measured === false && winResult.enforced === false && winProfile.note.includes("WSL2"));
  fs.rmSync(ws, { recursive: true, force: true });
}

section("2.5. an unusable wrapper is UNMEASURED, never enforced (V11.8.1 regression)");
{
  // The 7th review ran the shipped 11.8.0 offline gate on a machine where bwrap existed
  // but could not be executed (EACCES — e.g. a noexec mount or a confined AppArmor
  // profile). The 11.8.0 code recognized only ENOENT as "wrapper unavailable", so the
  // spawn error was recorded as a canary that "failed as expected" — certifying
  // enforcement that never ran. This fixture reproduces that machine deterministically
  // (a present, readable, deliberately NON-executable file), so every environment proves
  // the fix, not just the one that exposed it.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mj-unusable-"));
  const fixtureProfile = (wrapper: string): SandboxProfile => ({
    tier: "fs+net",
    platform: "linux",
    wrapper: [wrapper],
    scrubbedEnvKeys: [],
    canaries: [
      { name: "write outside workspace", argv: [wrapper, "--ro-bind", "/", "/", "--", "sh", "-c", "echo canary > /etc/mj-probe"], mustFail: true },
      { name: "network", argv: [wrapper, "--unshare-net", "--", "sh", "-c", "exit 0"], mustFail: true },
    ],
    note: "V11.8.1 unusable-wrapper fixture",
  });
  fs.writeFileSync(path.join(dir, "fake-bwrap"), "#!/bin/sh\nexit 0\n");
  fs.chmodSync(path.join(dir, "fake-bwrap"), 0o644); // present, readable, deliberately NOT executable
  const eacces = await verifyEnforcement(fixtureProfile(path.join(dir, "fake-bwrap")));
  ok("EACCES wrapper → measured:false (the canary never ran)", eacces.measured === false, JSON.stringify(eacces));
  ok("EACCES wrapper → enforced:false (a spawn error is not a canary failing)", eacces.enforced === false, JSON.stringify(eacces));
  ok("the spawn error is never recorded as failedAsExpected", eacces.evidence.every((e) => !e.ran && !e.failedAsExpected), JSON.stringify(eacces.evidence));
  ok("the evidence names the real cause — the wrapper, not the canary", eacces.evidence.every((e) => /not installed or not executable/.test(e.detail)), JSON.stringify(eacces.evidence.map((e) => e.detail)));
  ok("the verdict states UNMEASURED plainly", /UNMEASURED/.test(eacces.note), eacces.note);
  const enoent = await verifyEnforcement(fixtureProfile(path.join(dir, "no-such-wrapper")));
  ok("ENOENT wrapper → measured:false, enforced:false, UNMEASURED note (the 11.8.0 rule, kept)",
    enoent.measured === false && enoent.enforced === false && /UNMEASURED/.test(enoent.note),
    JSON.stringify(enoent));
  fs.rmSync(dir, { recursive: true, force: true });
}

section("3. profiles are deterministic");
{
  const ws = os.tmpdir();
  const a: SandboxProfile = sandboxProfileFor("MEDIUM", ws, "linux");
  const b: SandboxProfile = sandboxProfileFor("MEDIUM", ws, "linux");
  ok("identical tier+platform+workspace → identical profile", JSON.stringify(a) === JSON.stringify(b));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
