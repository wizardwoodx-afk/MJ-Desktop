import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/mergeExecutor.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// src/mission/mergePlan.ts
var ROLE_ORDER = {
  architect: 0,
  coder: 1,
  debugger: 2,
  tester: 3,
  security: 4,
  reviewer: 5,
  synthesizer: 6
};
function orderBranches(candidates) {
  const byBranch = new Map(candidates.map((c) => [c.branch, c]));
  const ordered = [];
  const placed = /* @__PURE__ */ new Set();
  const cycles = [];
  const visit = (c, stack) => {
    if (placed.has(c.branch)) return;
    if (stack.includes(c.branch)) {
      cycles.push([...stack.slice(stack.indexOf(c.branch)), c.branch].join(" -> "));
      return;
    }
    for (const dep of c.dependsOn) {
      const d = byBranch.get(dep);
      if (d) visit(d, [...stack, c.branch]);
    }
    placed.add(c.branch);
    ordered.push(c);
  };
  const sorted = [...candidates].sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 99;
    const rb = ROLE_ORDER[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    return b.additions + b.deletions - (a.additions + a.deletions);
  });
  for (const c of sorted) visit(c, []);
  return { ordered, cycles };
}
function planMerge(candidates, opts) {
  const problems = [];
  const excluded = [];
  const mergeable = [];
  for (const c of candidates) {
    if (!c.verified) {
      excluded.push({ branch: c.branch, seatId: c.seatId, reason: "Its own verification did not pass, so it does not merge. A branch that failed its checks would put a known-broken state on the base branch." });
      continue;
    }
    if (c.additions + c.deletions === 0) {
      excluded.push({ branch: c.branch, seatId: c.seatId, reason: "It changed nothing. Merging an empty branch adds a commit and a conflict surface for no benefit." });
      continue;
    }
    mergeable.push(c);
  }
  const { ordered, cycles } = orderBranches(mergeable);
  for (const cyc of cycles) problems.push(`Dependency cycle: ${cyc}. Two branches each claim to depend on the other, which is a decomposition bug \u2014 MJ will not guess an order.`);
  const steps = ordered.map((c, i) => ({
    order: i + 1,
    branch: c.branch,
    seatId: c.seatId,
    argv: [
      ["checkout", opts.baseBranch],
      ["merge", "--no-ff", "--no-edit", c.branch]
    ],
    requires: i === 0 ? [opts.baseBranch] : [ordered[i - 1]?.branch ?? opts.baseBranch],
    note: c.role === "tester" ? "Tests merge after the code they test, so the base branch is never in a state where tests reference code that is not there." : c.dependsOn.length ? `Depends on ${c.dependsOn.join(", ")}, so it merges after them.` : `${c.role} work; +${c.additions}/-${c.deletions}.`
  }));
  const preflight = [];
  for (let i = 0; i < mergeable.length; i += 1) {
    for (let j = i + 1; j < mergeable.length; j += 1) {
      const a = mergeable[i];
      const b = mergeable[j];
      if (!a || !b) continue;
      if (a.dependsOn.includes(b.branch) || b.dependsOn.includes(a.branch)) continue;
      preflight.push({
        a: a.branch,
        b: b.branch,
        // merge-tree does a three-way merge in memory. No working tree is touched, so this is safe to
        // run while agents are still working.
        //
        // It takes TWO branches, not three: the merge base is derived from their history. Passing the
        // base as a third argument makes git reject the command with a usage error (exit 129), which is
        // easy to mistake for "these branches conflict" — verified on git 2.47.3.
        argv: ["merge-tree", "--write-tree", "--name-only", a.branch, b.branch],
        why: `Neither declares a dependency on the other, so a conflict here would be a surprise. Check before merging, not after.`
      });
    }
  }
  if (mergeable.length > 4) {
    problems.push(`${mergeable.length} branches are queued to merge. Four is about where review stops keeping up; consider splitting the mission.`);
  }
  if (excluded.length === candidates.length && candidates.length > 0) {
    problems.push("Every branch was excluded, so nothing will be merged. The mission produced no verified change.");
  }
  const cleanup = [];
  for (const c of mergeable) {
    cleanup.push(["worktree", "remove", "--force", c.worktreePath]);
    cleanup.push(["branch", "-d", c.branch]);
  }
  cleanup.push(["worktree", "prune"]);
  return { steps, excluded, preflight, postMergeCheck: opts.testCommand ?? [], cleanup, problems };
}
function interpretMergeTree(exitCode, stdout) {
  if (exitCode === 0) return { clean: true, conflicted: [], error: null };
  if (exitCode === 1) {
    const lines = stdout.split(/\r?\n/);
    const oid = (lines[0] ?? "").trim();
    const body = lines.slice(1);
    const cut = body.findIndex((l) => !l.trim());
    const paths = (cut === -1 ? body : body.slice(0, cut)).map((l) => l.trim()).filter(Boolean);
    const conflicted = paths.map((l) => l.includes("	") ? l.split("	").pop() ?? l : l).filter((l) => l !== oid);
    return { clean: false, conflicted, error: null };
  }
  return {
    clean: false,
    conflicted: [],
    error: exitCode === null ? "git merge-tree did not run at all." : exitCode === 129 ? "git merge-tree rejected its arguments (exit 129 is a usage error). This is MJ's mistake in how it called git, NOT a conflict between the branches." : `git merge-tree exited ${exitCode}, which is neither clean (0) nor conflict (1).`
  };
}

// src/mission/signing.ts
var STORAGE_KEY = "mj.issuerkey.v1";
var cached = null;
function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function ed25519Available() {
  try {
    return typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof crypto.subtle.generateKey === "function";
  } catch {
    return false;
  }
}
async function ensureIssuerIdentity() {
  if (cached) return cached;
  if (!ed25519Available()) return null;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity = {
          keyId: `mj-issuer-${stored.publicKeyHex.slice(0, 12)}`,
          publicKeyHex: stored.publicKeyHex,
          createdAt: stored.createdAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
        };
        cached = { identity, privateKey };
        return cached;
      }
    }
  } catch {
  }
  try {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKeyHex = toHex(rawPub);
    const identity = {
      keyId: `mj-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt }));
    } catch {
    }
    cached = { identity, privateKey: pair.privateKey };
    return cached;
  } catch {
    return null;
  }
}
async function signHexDigest(hexDigest) {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  try {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, holder.privateKey, fromHex(hexDigest)));
    return { alg: "EdDSA", keyId: holder.identity.keyId, publicKeyHex: holder.identity.publicKeyHex, sigHex: toHex(sig) };
  } catch {
    return null;
  }
}

// src/mission/mergeExecutor.ts
async function revParse(git2, ref) {
  const r = await git2(["rev-parse", ref]);
  if (r.code !== 0) return null;
  const sha = r.out.trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}
async function executeMergePlan(input) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const base = (msg, extra) => ({
    executed: false,
    refusedReason: msg,
    startedAt,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    baseBranch: input.baseBranch,
    simulated: input.simulated === true,
    baseShaBefore: null,
    mergeCommitSha: null,
    preflight: [],
    steps: [],
    postMergeCheck: { ran: false, ok: null, detail: "not run" },
    cleanup: [],
    gate: { status: input.gate.status, tier: input.gate.tier, allowed: input.gate.allowed, overrideRecorded: Boolean(input.overrideRecorded) },
    ...extra
  });
  if (!input.gate.allowed && !input.overrideRecorded) {
    return base(`Merge REFUSED by the verification gate (${input.gate.status}, tier ${input.gate.tier}): ${input.gate.reason}. Nothing was merged. Record an explicit override to proceed anyway \u2014 MJ will name it in the attestation.`);
  }
  if (input.plan.problems.length > 0) {
    return base(`Merge REFUSED: the plan itself reports problems: ${input.plan.problems.join(" ")}`);
  }
  if (input.plan.steps.length === 0) {
    return base("Merge REFUSED: the plan has no steps. Nothing was verified, changed, or mergeable \u2014 there is nothing to execute.");
  }
  if (input.simulated) {
    return base("This host has no git access (browser/dev preview), so the merge was planned but NOT executed. Re-run from the desktop app to merge for real.");
  }
  const preflight = [];
  const steps = [];
  const cleanup = [];
  for (const p of input.plan.preflight) {
    const r = await input.git(p.argv);
    const interp = interpretMergeTree(r.code, r.out);
    preflight.push({
      a: p.a,
      b: p.b,
      clean: interp.clean,
      conflicted: interp.conflicted,
      detail: interp.error ?? (interp.clean ? "clean" : `conflict in: ${interp.conflicted.join(", ") || "(no paths listed)"}`)
    });
    if (interp.error || !interp.clean) {
      return base(
        `Merge REFUSED at pre-flight: ${p.a} vs ${p.b} \u2014 ${interp.error ?? `conflicting paths: ${interp.conflicted.join(", ") || "(see git output)"}`}. No branch was merged.`,
        { preflight }
      );
    }
  }
  const baseShaBefore = await revParse(input.git, input.baseBranch);
  let failed = null;
  for (const step of [...input.plan.steps].sort((a, b) => a.order - b.order)) {
    const rec = { order: step.order, branch: step.branch, seatId: step.seatId, ok: false, commands: [] };
    steps.push(rec);
    for (const argv of step.argv) {
      const r = await input.git(argv);
      const detail = r.code === 0 ? "ok" : (r.err.trim() || r.out.trim() || `exit ${r.code}`).split("\n")[0] ?? `exit ${r.code}`;
      rec.commands.push({ argv, code: r.code, detail });
      if (r.code !== 0) {
        failed = { step: rec, code: r.code, argv, err: detail };
        break;
      }
    }
    if (!failed) rec.ok = true;
    if (failed) break;
  }
  if (failed) {
    return base(
      `Merge FAILED at step ${failed.step.order} (${failed.step.branch}): git ${failed.argv.join(" ")} exited ${failed.code} \u2014 ${failed.err}. Steps after it were NOT attempted; the repository is left exactly where git left it.`,
      { preflight, steps, baseShaBefore }
    );
  }
  const pmc = { ran: false, ok: null, detail: "not run" };
  if (input.plan.postMergeCheck.length > 0) {
    if (input.runRepoCommand) {
      const r = await input.runRepoCommand(input.plan.postMergeCheck);
      pmc.ran = true;
      pmc.ok = r.code === 0;
      pmc.detail = r.code === 0 ? `exit 0: ${input.plan.postMergeCheck.join(" ")}` : `exit ${r.code}: ${(r.err.trim() || r.out.trim()).split("\n")[0] ?? ""}`;
    } else {
      pmc.detail = `planned (${input.plan.postMergeCheck.join(" ")}) but this host has no repo-command runner \u2014 the combined suite was NOT executed. Do not treat the merge as validated.`;
    }
  } else {
    pmc.detail = "no post-merge check was planned for this team";
  }
  for (const argv of input.plan.cleanup) {
    const r = await input.git(argv);
    cleanup.push({ argv, ok: r.code === 0 });
  }
  const mergeCommitSha = await revParse(input.git, "HEAD");
  return {
    executed: true,
    startedAt,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    baseBranch: input.baseBranch,
    simulated: false,
    baseShaBefore,
    mergeCommitSha,
    preflight,
    steps,
    postMergeCheck: pmc,
    cleanup,
    gate: { status: input.gate.status, tier: input.gate.tier, allowed: input.gate.allowed, overrideRecorded: Boolean(input.overrideRecorded) }
  };
}
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function mergeAttestationPayload(a) {
  const { issuer: _i, signature: _s, signatureNote: _n, ...payload } = a;
  return sortDeep(payload);
}
async function buildMergeAttestation(result, mjVersion) {
  const att = {
    format: "mj-merge-attestation/1",
    issuedAt: (/* @__PURE__ */ new Date()).toISOString(),
    mjVersion,
    baseBranch: result.baseBranch,
    executed: result.executed,
    simulated: result.simulated,
    ...result.refusedReason !== void 0 ? { refusedReason: result.refusedReason } : {},
    gate: result.gate,
    stepsMerged: result.steps.filter((s) => s.ok).map((s) => ({ order: s.order, branch: s.branch, seatId: s.seatId })),
    baseShaBefore: result.baseShaBefore,
    mergeCommitSha: result.mergeCommitSha,
    postMergeCheck: result.postMergeCheck,
    issuer: null,
    signature: null
  };
  const payload = mergeAttestationPayload(att);
  const digest = await sha256hex(JSON.stringify(payload));
  const sig = await signHexDigest(digest);
  if (sig) {
    att.issuer = { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex };
    att.signature = sig.sigHex;
  } else {
    att.signatureNote = "Runtime has no Ed25519 \u2014 attestation is unsigned (payload is still fully recorded).";
  }
  return att;
}
async function verifyMergeAttestation(att) {
  if (att.format !== "mj-merge-attestation/1") return { ok: false, reason: `unknown attestation format: ${String(att.format)}` };
  if (!att.signature) return { ok: false, reason: att.signatureNote ?? "attestation is unsigned" };
  if (!att.issuer?.publicKeyHex) return { ok: false, reason: "attestation is signed but carries no issuer public key" };
  const digest = await sha256hex(JSON.stringify(mergeAttestationPayload(att)));
  const key = await crypto.subtle.importKey("raw", hexToBytes(att.issuer.publicKeyHex), { name: "Ed25519" }, false, ["verify"]).catch(() => null);
  if (!key) return { ok: false, reason: "issuer public key is not a valid Ed25519 key" };
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, hexToBytes(att.signature), hexToBytes(digest)).catch(() => false);
  return ok ? { ok: true } : { ok: false, reason: "signature verification FAILED against the embedded public key" };
}
function hexToBytes(hex) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// probe/mergeExecutor.test.ts
function git(repo, argv) {
  try {
    const out = execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e) {
    const err = e;
    return { code: err.status ?? 1, out: String(err.stdout ?? ""), err: String(err.stderr ?? "") };
  }
}
function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjmrgx-"));
  fs.writeFileSync(path.join(repo, "app.js"), "module.exports = { v: 1 };\n");
  execFileSync("git", ["init", "-q", "."], { cwd: repo });
  execFileSync("git", ["config", "user.email", "mj@mj.desktop"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "MJ"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: repo });
  return repo;
}
function baseBranch(repo) {
  const r = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return r.out.trim();
}
function branchWithFile(repo, base, branch, file, content) {
  git(repo, ["checkout", "-q", base]);
  git(repo, ["checkout", "-q", "-b", branch]);
  fs.writeFileSync(path.join(repo, file), content);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", `${branch} work`]);
}
var PASS_GATE = { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false };
var BLOCK_GATE = { status: "BLOCKED", tier: "unverified", allowed: false, reason: "no cross-harness verification", overrideRequired: true };
describe("merge executor \u2014 real git", () => {
  it("gate allowed \u2192 executes the plan and records a real merge-commit sha", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    branchWithFile(repo, base, "mj/coder", "feature-a.js", "exports.a = 1;\n");
    branchWithFile(repo, base, "mj/tester", "feature-b.js", "exports.b = 2;\n");
    git(repo, ["checkout", "-q", base]);
    const before = git(repo, ["rev-parse", "HEAD"]).out.trim();
    const plan = planMerge(
      [
        { seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt-a", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 },
        { seatId: "tester", branch: "mj/tester", worktreePath: "/tmp/wt-b", role: "tester", dependsOn: [], verified: true, additions: 1, deletions: 0 }
      ],
      { baseBranch: base, repoRoot: repo, testCommand: ["node", "-e", "process.exit(0)"] }
    );
    const result = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: PASS_GATE,
      git: (argv) => Promise.resolve(git(repo, argv)),
      runRepoCommand: (argv) => Promise.resolve((() => {
        try {
          return { code: 0, out: execFileSync(argv[0], argv.slice(1), { cwd: repo, encoding: "utf8" }), err: "" };
        } catch {
          return { code: 1, out: "", err: "check failed" };
        }
      })()),
      mjVersion: "11.10.1"
    });
    assert.equal(result.executed, true);
    assert.ok(result.mergeCommitSha, "the merge-commit sha must be recorded");
    assert.match(result.mergeCommitSha, /^[0-9a-f]{40}$/);
    assert.notEqual(result.mergeCommitSha, before, "HEAD must have moved \u2014 a merge actually landed");
    assert.equal(result.baseShaBefore, before);
    assert.equal(result.steps.length, 2);
    assert.ok(result.steps.every((s) => s.ok), "every step must report ok");
    assert.equal(result.postMergeCheck.ran, true);
    assert.equal(result.postMergeCheck.ok, true, "the repo's own check ran and passed");
    assert.ok(fs.existsSync(path.join(repo, "feature-a.js")));
    assert.ok(fs.existsSync(path.join(repo, "feature-b.js")));
    const log = git(repo, ["log", "--oneline"]).out;
    assert.match(log, /mj\/coder/);
    assert.match(log, /mj\/tester/);
  });
  it("gate blocked, no override \u2192 REFUSED and the repository is untouched", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    branchWithFile(repo, base, "mj/coder", "feature-a.js", "exports.a = 1;\n");
    git(repo, ["checkout", "-q", base]);
    const before = git(repo, ["rev-parse", "HEAD"]).out.trim();
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo }
    );
    const result = await executeMergePlan({ plan, baseBranch: base, gate: BLOCK_GATE, git: (argv) => Promise.resolve(git(repo, argv)), mjVersion: "11.10.1" });
    assert.equal(result.executed, false);
    assert.match(result.refusedReason ?? "", /REFUSED by the verification gate/);
    assert.equal(result.mergeCommitSha, null);
    assert.equal(git(repo, ["rev-parse", "HEAD"]).out.trim(), before, "HEAD must not move on a refusal");
    assert.equal(fs.existsSync(path.join(repo, "feature-a.js")), false, "nothing from the branch may be on the base");
  });
  it("gate blocked + recorded override \u2192 executes, override named in the gate record", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    branchWithFile(repo, base, "mj/coder", "feature-a.js", "exports.a = 1;\n");
    git(repo, ["checkout", "-q", base]);
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo }
    );
    const result = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: BLOCK_GATE,
      overrideRecorded: { by: "owner", at: (/* @__PURE__ */ new Date()).toISOString(), note: "shipping hotfix; gate re-run tomorrow" },
      git: (argv) => Promise.resolve(git(repo, argv)),
      mjVersion: "11.10.1"
    });
    assert.equal(result.executed, true, "a recorded override must allow the merge");
    assert.ok(result.mergeCommitSha);
    assert.equal(result.gate.overrideRecorded, true);
  });
  it("a real conflict is caught at PRE-FLIGHT before any branch is merged", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    git(repo, ["checkout", "-q", "-b", "mj/a"]);
    fs.writeFileSync(path.join(repo, "app.js"), "module.exports = { v: 100 };\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "a edits app.js"]);
    git(repo, ["checkout", "-q", base]);
    git(repo, ["checkout", "-q", "-b", "mj/b"]);
    fs.writeFileSync(path.join(repo, "app.js"), "module.exports = { v: 200 };\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "b edits app.js"]);
    git(repo, ["checkout", "-q", base]);
    const before = git(repo, ["rev-parse", "HEAD"]).out.trim();
    const plan = planMerge(
      [
        { seatId: "a", branch: "mj/a", worktreePath: "/tmp/wt-a", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 1 },
        { seatId: "b", branch: "mj/b", worktreePath: "/tmp/wt-b", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 1 }
      ],
      { baseBranch: base, repoRoot: repo }
    );
    assert.ok(plan.preflight.length >= 1, "unordered pairs must be pre-flighted");
    const result = await executeMergePlan({ plan, baseBranch: base, gate: PASS_GATE, git: (argv) => Promise.resolve(git(repo, argv)), mjVersion: "11.10.1" });
    assert.equal(result.executed, false);
    assert.match(result.refusedReason ?? "", /pre-flight/i);
    assert.equal(result.mergeCommitSha, null);
    assert.equal(git(repo, ["rev-parse", "HEAD"]).out.trim(), before, "no merge may have happened after a pre-flight stop");
  });
  it("simulated host \u2192 planned but NEVER claimed as merged", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo }
    );
    const result = await executeMergePlan({ plan, baseBranch: base, gate: PASS_GATE, git: (argv) => Promise.resolve(git(repo, argv)), simulated: true, mjVersion: "11.10.1" });
    assert.equal(result.executed, false);
    assert.equal(result.simulated, true);
    assert.match(result.refusedReason ?? "", /no git access/i);
    assert.equal(result.mergeCommitSha, null);
  });
});
describe("merge executor \u2014 signed attestation", () => {
  it("attestation carries the merge-commit sha; signature verifies; tampering fails", async () => {
    const repo = makeRepo();
    const base = baseBranch(repo);
    branchWithFile(repo, base, "mj/coder", "feature-a.js", "exports.a = 1;\n");
    git(repo, ["checkout", "-q", base]);
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo }
    );
    const result = await executeMergePlan({ plan, baseBranch: base, gate: PASS_GATE, git: (argv) => Promise.resolve(git(repo, argv)), mjVersion: "11.10.1" });
    assert.equal(result.executed, true);
    const att = await buildMergeAttestation(result, "11.10.1");
    assert.equal(att.format, "mj-merge-attestation/1");
    assert.equal(att.mergeCommitSha, result.mergeCommitSha, "the attestation must carry the exact sha the executor recorded");
    assert.equal(att.executed, true);
    assert.ok(att.signature, "attestation must be signed on this runtime");
    assert.equal((await verifyMergeAttestation(att)).ok, true);
    const tampered = { ...att, mergeCommitSha: "deadbeef".repeat(5) };
    const v = await verifyMergeAttestation(tampered);
    assert.equal(v.ok, false, "a swapped merge-commit sha must fail signature verification");
  });
});
