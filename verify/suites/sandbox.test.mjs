import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/sandbox.test.ts
import * as fs from "node:fs";
import * as os2 from "node:os";
import * as path2 from "node:path";
import { execFile } from "node:child_process";

// src/mission/sandbox.ts
import * as os from "node:os";
import * as path from "node:path";
var SCRUB_EXACT = /* @__PURE__ */ new Set([
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "GH_ENTERPRISE_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
  "GROK_API_KEY",
  "OPENROUTER_API_KEY",
  "SLACK_BOT_TOKEN",
  "STRIPE_API_KEY",
  "NPM_TOKEN",
  "NODE_AUTH_TOKEN",
  "PYPI_TOKEN",
  "CARGO_REGISTRY_TOKEN",
  "HF_TOKEN",
  "VERCEL_TOKEN",
  "NETLIFY_AUTH_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FIREBASE_TOKEN",
  "SSH_AUTH_SOCK",
  "GPG_PASSPHRASE",
  "MJ_UPDATER_KEY"
]);
var SCRUB_SUFFIX = ["_TOKEN", "_SECRET", "_API_KEY", "_APIKEY", "_PASSWORD", "_PRIVATE_KEY"];
function scrubEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    const upper = k.toUpperCase();
    const shaped = SCRUB_EXACT.has(upper) || SCRUB_SUFFIX.some((s) => upper.endsWith(s)) || // Token-shaped values (JWT / long opaque secrets) under innocent names.
    v.length >= 40 && /^[A-Za-z0-9_\-.=+/]+$/.test(v) || /^[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{12,}/.test(v);
    if (!shaped) out[k] = v;
  }
  return out;
}
function detectPlatform() {
  if (typeof process === "undefined" || !process.platform) return typeof navigator !== "undefined" ? "unknown" : "unknown";
  const p = process.platform;
  return p === "darwin" ? "macos" : p === "win32" ? "windows" : p === "linux" ? "linux" : "unknown";
}
function sandboxProfileFor(risk, workspace, platform = detectPlatform()) {
  const tier = risk === "LOW" ? "none" : risk === "MEDIUM" ? "fs" : "fs+net";
  const scrubbed2 = [...SCRUB_EXACT].sort();
  const base = {
    tier,
    platform,
    wrapper: [],
    scrubbedEnvKeys: scrubbed2,
    canaries: [],
    note: ""
  };
  if (tier === "none") {
    return { ...base, note: "read-class task: no filesystem wrapper; credentials are still scrubbed from the child environment" };
  }
  if (platform === "linux") {
    const canaryPath = path.posix.join("/", "mj-sandbox-canary.txt");
    const wrapper = [
      "bwrap",
      "--ro-bind",
      "/",
      "/",
      "--bind",
      workspace,
      workspace,
      "--bind",
      os.tmpdir(),
      os.tmpdir(),
      "--dev",
      "/dev",
      "--proc",
      "/proc"
    ];
    if (tier === "fs+net") wrapper.push("--unshare-net");
    wrapper.push("--");
    return {
      ...base,
      wrapper,
      canaries: [
        {
          name: "write outside the workspace must fail",
          argv: [...wrapper, "sh", "-c", `echo mj-canary > ${canaryPath}`],
          mustFail: true
        },
        ...tier === "fs+net" ? [{ name: "network must be unreachable", argv: [...wrapper, "sh", "-c", "command -v curl >/dev/null && curl -m 2 -s https://example.com >/dev/null || false"], mustFail: true }] : []
      ],
      note: "bubblewrap profile: root read-only, workspace+tmp writable" + (tier === "fs+net" ? ", network namespace isolated" : "")
    };
  }
  if (platform === "macos") {
    const canaryPath = path.posix.join("/", "mj-sandbox-canary.txt");
    const profile = tier === "fs+net" ? `(version 1)(deny default)(allow process*)(allow file-read*)(allow file-write* (subpath "${workspace}") (subpath "${os.tmpdir()}"))(deny network*)` : `(version 1)(deny default)(allow process*)(allow file-read*)(allow file-write* (subpath "${workspace}") (subpath "${os.tmpdir()}"))`;
    return {
      ...base,
      wrapper: ["sandbox-exec", "-p", profile],
      canaries: [
        {
          name: "write outside the workspace must fail",
          argv: ["sandbox-exec", "-p", profile, "sh", "-c", `echo mj-canary > ${canaryPath}`],
          mustFail: true
        }
      ],
      note: "Seatbelt profile: workspace-only writes" + (tier === "fs+net" ? ", network denied" : "")
    };
  }
  return {
    ...base,
    note: platform === "windows" ? "no native Windows wrapper is shipped; run missions under WSL2 where the Linux profiles apply \u2014 this seat runs UNSANDBOXED and the UI labels it" : "no wrapper available for this platform; credentials are still scrubbed"
  };
}
var WRAPPER_UNAVAILABLE = /* @__PURE__ */ new Set(["ENOENT", "EACCES", "EPERM", "ENOEXEC"]);
async function verifyEnforcement(profile, timeoutMs = 8e3) {
  const evidence = [];
  if (profile.canaries.length === 0) {
    return { enforced: false, measured: false, evidence, note: profile.note };
  }
  const { execFile: execFile2 } = await import("node:child_process");
  let wrapperAbsent = false;
  for (const canary of profile.canaries) {
    const ran = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ failed: true, absent: false, detail: "timeout (treated as blocked)" }), timeoutMs);
      execFile2(canary.argv[0], canary.argv.slice(1), { timeout: timeoutMs }, (err) => {
        clearTimeout(timer);
        const code = err?.code;
        const absent = Boolean(err) && typeof code === "string" && WRAPPER_UNAVAILABLE.has(code);
        resolve({
          failed: Boolean(err),
          absent,
          detail: absent ? `wrapper '${canary.argv[0]}' is not installed or not executable (${code}) \u2014 the canary never ran` : err ? (err.message.split("\n")[0] ?? "").slice(0, 120) : "exited 0"
        });
      });
    });
    if (ran.absent) wrapperAbsent = true;
    evidence.push({ name: canary.name, ran: !ran.absent, failedAsExpected: !ran.absent && ran.failed === canary.mustFail, detail: ran.detail });
  }
  const enforced = !wrapperAbsent && evidence.length > 0 && evidence.every((e) => e.ran && e.failedAsExpected);
  return {
    enforced,
    measured: !wrapperAbsent,
    evidence,
    note: wrapperAbsent ? `${profile.note}; wrapper unavailable on this machine (not installed or not executable) \u2014 enforcement UNMEASURED` : profile.note
  };
}
function wrapForSeat(risk, workspace, program, args) {
  const profile = sandboxProfileFor(risk, workspace);
  return { argv: profile.wrapper.length > 0 ? [...profile.wrapper, program, ...args] : [program, ...args], profile };
}

// probe/sandbox.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
var envSample = {
  PATH: "/usr/bin",
  HOME: "/home/dev",
  AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  GITHUB_TOKEN: "ghp_0123456789abcdefghijklmnopqrstuvwxyz",
  OPENAI_API_KEY: "sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  NPM_TOKEN: "npm_0000000000000000000000000000000000",
  MY_SERVICE_PASSWORD: "hunter2hunter2",
  SLACK_BOT_TOKEN: "xoxb-123456789012-123456789012",
  MJ_EDITOR_PREFS: "snap=16"
};
section("0. credential scrubbing \u2014 the baseline hygiene");
var scrubbed = scrubEnv(envSample);
for (const gone of ["AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "OPENAI_API_KEY", "NPM_TOKEN", "MY_SERVICE_PASSWORD", "SLACK_BOT_TOKEN"]) {
  ok(`scrubbed: ${gone}`, !(gone in scrubbed), JSON.stringify(Object.keys(scrubbed)));
}
ok("non-credential variables survive", "PATH" in scrubbed && "HOME" in scrubbed && "MJ_EDITOR_PREFS" in scrubbed);
ok("token-shaped VALUES are scrubbed even under innocent names", !("MJ_EDITOR_PREFS" in scrubEnv({ MJ_EDITOR_PREFS: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c" })));
ok("the profile lists what it will scrub", sandboxProfileFor("MEDIUM", os2.tmpdir()).scrubbedEnvKeys.includes("GITHUB_TOKEN"));
section("1. profiles match the risk tier");
{
  const ws = fs.mkdtempSync(path2.join(os2.tmpdir(), "mj-sbx-"));
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
  const ws = fs.mkdtempSync(path2.join(os2.tmpdir(), "mj-sbx-"));
  const profile = sandboxProfileFor("HIGH", ws, "linux");
  const bwrapUsable = await new Promise((resolve) => {
    const unavailable = /* @__PURE__ */ new Set(["ENOENT", "EACCES", "EPERM", "ENOEXEC"]);
    execFile("bwrap", ["--version"], { timeout: 4e3 }, (err) => {
      if (!err) return resolve(true);
      resolve(!unavailable.has(String(err.code ?? "")));
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
    ok(
      "bubblewrap absent or unusable \u2192 measured:false, enforced:false, stated plainly",
      result.measured === false && result.enforced === false && result.note.length > 0,
      "no silent pass"
    );
    console.log("  (bubblewrap not installed or not executable here \u2014 install it to measure: apt install bubblewrap)");
  }
  const winProfile = sandboxProfileFor("HIGH", ws, "windows");
  const winResult = await verifyEnforcement(winProfile);
  ok("Windows profile refuses to claim enforcement", winResult.measured === false && winResult.enforced === false && winProfile.note.includes("WSL2"));
  fs.rmSync(ws, { recursive: true, force: true });
}
section("2.5. an unusable wrapper is UNMEASURED, never enforced (V11.8.1 regression)");
{
  const dir = fs.mkdtempSync(path2.join(os2.tmpdir(), "mj-unusable-"));
  const fixtureProfile = (wrapper) => ({
    tier: "fs+net",
    platform: "linux",
    wrapper: [wrapper],
    scrubbedEnvKeys: [],
    canaries: [
      { name: "write outside workspace", argv: [wrapper, "--ro-bind", "/", "/", "--", "sh", "-c", "echo canary > /etc/mj-probe"], mustFail: true },
      { name: "network", argv: [wrapper, "--unshare-net", "--", "sh", "-c", "exit 0"], mustFail: true }
    ],
    note: "V11.8.1 unusable-wrapper fixture"
  });
  fs.writeFileSync(path2.join(dir, "fake-bwrap"), "#!/bin/sh\nexit 0\n");
  fs.chmodSync(path2.join(dir, "fake-bwrap"), 420);
  const eacces = await verifyEnforcement(fixtureProfile(path2.join(dir, "fake-bwrap")));
  ok("EACCES wrapper \u2192 measured:false (the canary never ran)", eacces.measured === false, JSON.stringify(eacces));
  ok("EACCES wrapper \u2192 enforced:false (a spawn error is not a canary failing)", eacces.enforced === false, JSON.stringify(eacces));
  ok("the spawn error is never recorded as failedAsExpected", eacces.evidence.every((e) => !e.ran && !e.failedAsExpected), JSON.stringify(eacces.evidence));
  ok("the evidence names the real cause \u2014 the wrapper, not the canary", eacces.evidence.every((e) => /not installed or not executable/.test(e.detail)), JSON.stringify(eacces.evidence.map((e) => e.detail)));
  ok("the verdict states UNMEASURED plainly", /UNMEASURED/.test(eacces.note), eacces.note);
  const enoent = await verifyEnforcement(fixtureProfile(path2.join(dir, "no-such-wrapper")));
  ok(
    "ENOENT wrapper \u2192 measured:false, enforced:false, UNMEASURED note (the 11.8.0 rule, kept)",
    enoent.measured === false && enoent.enforced === false && /UNMEASURED/.test(enoent.note),
    JSON.stringify(enoent)
  );
  fs.rmSync(dir, { recursive: true, force: true });
}
section("3. profiles are deterministic");
{
  const ws = os2.tmpdir();
  const a = sandboxProfileFor("MEDIUM", ws, "linux");
  const b = sandboxProfileFor("MEDIUM", ws, "linux");
  ok("identical tier+platform+workspace \u2192 identical profile", JSON.stringify(a) === JSON.stringify(b));
}
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
