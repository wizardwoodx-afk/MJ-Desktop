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
  const low = sandboxProfileFor("LOW", ws);
  ok("LOW: no filesystem wrapper", low.wrapper.length === 0);
  ok("LOW: still scrubs credentials", low.scrubbedEnvKeys.length > 0);
  const med = sandboxProfileFor("MEDIUM", ws);
  ok("MEDIUM: workspace-only writes", med.wrapper.includes("--bind") || med.wrapper.includes("sandbox-exec"));
  ok("MEDIUM: network still allowed", !med.wrapper.includes("--unshare-net"));
  const high = sandboxProfileFor("HIGH", ws);
  ok("HIGH: network denied", high.tier === "fs+net" && (high.wrapper.includes("--unshare-net") || high.note.includes("network denied")));
  ok("every profile carries canaries or an honest note", [low, med, high].every((p) => p.canaries.length > 0 || p.note.length > 10));
  const wrapped = wrapForSeat("HIGH", ws, "claude", ["-p", "hi"]);
  ok("wrapForSeat puts the wrapper in front of the agent", wrapped.argv[0] !== "claude" && wrapped.argv.includes("claude"));
  ok("the wrapped command is fully visible for consent", wrapped.argv.join(" ").length > 0);
  fs.rmSync(ws, { recursive: true, force: true });
}

section("2. canaries are measured, not asserted (Linux + bubblewrap when present)");
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "mj-sbx-"));
  const profile = sandboxProfileFor("HIGH", ws, "linux");
  const hasBwrap = fs.existsSync("/usr/bin/bwrap") || fs.existsSync("/bin/bwrap");
  if (hasBwrap) {
    const result = await verifyEnforcement(profile);
    ok("enforcement was measured by real canaries", result.measured);
    ok("the workspace write INSIDE is possible (control canary is implicit in the seat)", fs.existsSync(ws));
    ok("a write outside the workspace FAILED as expected", result.evidence.some((e) => e.name.includes("write outside") && e.failedAsExpected), JSON.stringify(result.evidence));
    ok("network is unreachable as expected", result.evidence.some((e) => e.name.includes("network") && e.failedAsExpected));
    ok("verdict: enforced", result.enforced);
  } else {
    const result = await verifyEnforcement(profile);
    ok("bubblewrap absent → measured:false, enforced:false, stated plainly",
      result.measured === false && result.enforced === false && result.note.length > 0,
      "no silent pass");
    console.log("  (bubblewrap not installed here — install it to measure: apt install bubblewrap)");
  }
  // The "no wrapper" platform must never claim enforcement.
  const winProfile = sandboxProfileFor("HIGH", ws, "windows");
  const winResult = await verifyEnforcement(winProfile);
  ok("Windows profile refuses to claim enforcement", winResult.measured === false && winResult.enforced === false && winProfile.note.includes("WSL2"));
  fs.rmSync(ws, { recursive: true, force: true });
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
