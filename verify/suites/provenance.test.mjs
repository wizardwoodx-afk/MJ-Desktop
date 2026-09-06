import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/provenance.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

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

// src/mission/provenance.ts
var MJ_PROVENANCE_PREDICATE_TYPE = "https://mj.desktop/provenance/v1";
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
function hexToBytes(hex) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function provenanceBody(st) {
  const { issuer: _i, signature: _s, signatureNote: _n, ...body } = st;
  return sortDeep(body);
}
async function buildProvenanceStatement(args) {
  if (!args.merge.executed || !args.merge.mergeCommitSha) return null;
  const materials = [];
  for (const c of args.candidates.filter((c2) => c2.verified)) {
    const step = args.merge.steps.find((s) => s.branch === c.branch && s.ok);
    if (!step) continue;
    materials.push({
      seatId: c.seatId,
      role: c.role,
      harness: harnessForSeat(c.seatId, args),
      branch: c.branch,
      identity: await sha256hex(`${c.seatId}|${c.role}|${harnessForSeat(c.seatId, args)}`),
      verified: true,
      additions: c.additions,
      deletions: c.deletions
    });
  }
  const st = {
    _type: "https://in-toto.io/Statement/v1",
    format: "mj-provenance-statement/1",
    subject: [{ name: args.merge.baseBranch, digest: { gitCommit: args.merge.mergeCommitSha } }],
    predicateType: MJ_PROVENANCE_PREDICATE_TYPE,
    predicate: {
      builder: { id: `mj-desktop@${args.mjVersion}` },
      buildType: "mj.verified-team-run/v1",
      metadata: { mission: args.mission, teamId: args.teamId, mjVersion: args.mjVersion, issuedAt: (/* @__PURE__ */ new Date()).toISOString() },
      materials,
      verification: {
        gateStatus: args.gate.status,
        gateTier: args.gate.tier,
        crossVerified: args.gate.crossVerified,
        snapshotSha: args.gate.evidence?.snapshotSha ?? null,
        reviewers: (args.gate.evidence?.reviewedBy ?? []).map((r) => ({ seatId: r.seatId, harness: r.harness, matchesSnapshot: r.matchesSnapshot }))
      },
      merge: {
        baseBranch: args.merge.baseBranch,
        baseShaBefore: args.merge.baseShaBefore,
        mergeCommitSha: args.merge.mergeCommitSha,
        stepsMerged: args.merge.steps.filter((s) => s.ok).length,
        overrideRecorded: args.merge.gate.overrideRecorded,
        postMergeCheckOk: args.merge.postMergeCheck.ran ? args.merge.postMergeCheck.ok : null
      }
    },
    issuer: null,
    signature: null
  };
  const digest = await sha256hex(JSON.stringify(provenanceBody(st)));
  const sig = await signHexDigest(digest);
  if (sig) {
    st.issuer = { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex };
    st.signature = sig.sigHex;
  } else {
    st.signatureNote = "Runtime has no Ed25519 \u2014 statement is unsigned (its contents are still fully recorded).";
  }
  return st;
}
async function verifyProvenanceStatement(st) {
  if (st.format !== "mj-provenance-statement/1") return { ok: false, reason: `unknown statement format: ${String(st.format)}` };
  if (!st.signature) return { ok: false, reason: st.signatureNote ?? "statement is unsigned" };
  if (!st.issuer?.publicKeyHex) return { ok: false, reason: "statement is signed but carries no issuer public key" };
  const digest = await sha256hex(JSON.stringify(provenanceBody(st)));
  const key = await crypto.subtle.importKey("raw", hexToBytes(st.issuer.publicKeyHex), { name: "Ed25519" }, false, ["verify"]).catch(() => null);
  if (!key) return { ok: false, reason: "issuer public key is not a valid Ed25519 key" };
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, hexToBytes(st.signature), hexToBytes(digest)).catch(() => false);
  return ok ? { ok: true } : { ok: false, reason: "signature verification FAILED against the embedded public key" };
}
function harnessForSeat(seatId, args) {
  const measured = args.harnessBySeat[seatId];
  if (measured) return measured;
  const ev = args.gate.evidence;
  const hit = ev?.reviewedBy.find((r) => r.seatId === seatId);
  return hit?.harness ?? "unknown";
}

// probe/provenance.test.ts
var sha256 = (s) => createHash("sha256").update(s).digest("hex");
function git(repo, argv) {
  try {
    const out = execFileSync("git", argv, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e) {
    const err = e;
    return { code: err.status ?? 1, out: String(err.stdout ?? ""), err: String(err.stderr ?? "") };
  }
}
function makeRepoWithBranch() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mjprov-"));
  fs.writeFileSync(path.join(repo, "app.js"), "1\n");
  execFileSync("git", ["init", "-q", "."], { cwd: repo });
  execFileSync("git", ["config", "user.email", "mj@mj.desktop"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "MJ"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: repo });
  const base = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).out.trim();
  git(repo, ["checkout", "-q", "-b", "mj/coder"]);
  fs.writeFileSync(path.join(repo, "feature.js"), "2\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "feature"]);
  git(repo, ["checkout", "-q", base]);
  return { repo, base };
}
var PASS_GATE = {
  status: "PASS",
  tier: "cross-vendor",
  reasons: [],
  policy: "STRICT",
  crossVerified: true,
  evidence: {
    snapshotBuilt: true,
    snapshotSha: "abc123".padEnd(40, "0"),
    snapshotRef: "mj/review/snapshot",
    writerBranches: ["mj/coder"],
    reviewedBy: [{ seatId: "reviewer", harness: "codex", reviewedSha: "abc123".padEnd(40, "0"), matchesSnapshot: true }]
  }
};
describe("provenance statements \u2014 commit-bound AI authorship", () => {
  it("an executed merge yields a statement whose subject IS the real merge-commit sha", async () => {
    const { repo, base } = makeRepoWithBranch();
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo }
    );
    const merge = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false },
      git: (argv) => Promise.resolve(git(repo, argv)),
      mjVersion: "11.10.5"
    });
    assert.equal(merge.executed, true);
    const st = await buildProvenanceStatement({
      mission: "mission-prov",
      teamId: "team-prov",
      mjVersion: "11.10.5",
      candidates: [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      gate: PASS_GATE,
      merge,
      harnessBySeat: { coder: "claude-code", reviewer: "codex" }
    });
    assert.ok(st, "an executed merge must yield a statement");
    assert.equal(st._type, "https://in-toto.io/Statement/v1");
    assert.equal(st.predicateType, MJ_PROVENANCE_PREDICATE_TYPE);
    assert.equal(st.subject.length, 1);
    assert.equal(st.subject[0].digest.gitCommit, merge.mergeCommitSha, "the subject digest must be the REAL merge-commit sha");
    assert.equal(git(repo, ["rev-parse", base]).out.trim(), merge.mergeCommitSha);
    assert.equal(st.predicate.builder.id, "mj-desktop@11.10.5");
    assert.equal(st.predicate.merge.mergeCommitSha, merge.mergeCommitSha);
    assert.equal(st.predicate.verification.gateTier, "cross-vendor");
    assert.equal(st.predicate.verification.snapshotSha, PASS_GATE.evidence?.snapshotSha);
  });
  it("materials name the AI authorship: harness + deterministic identity digest", async () => {
    const { repo, base } = makeRepoWithBranch();
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo }
    );
    const merge = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false },
      git: (argv) => Promise.resolve(git(repo, argv)),
      mjVersion: "11.10.5"
    });
    const st = await buildProvenanceStatement({
      mission: "m",
      teamId: "t",
      mjVersion: "11.10.5",
      candidates: [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      gate: PASS_GATE,
      merge,
      harnessBySeat: { coder: "claude-code" }
    });
    assert.ok(st);
    assert.equal(st.predicate.materials.length, 1);
    const m = st.predicate.materials[0];
    assert.equal(m.harness, "claude-code");
    assert.equal(m.identity, sha256("coder|coder|claude-code"), "identity must be the exact digest \u2014 chain-consistent with receipts");
    assert.equal(m.verified, true);
    assert.equal(st.predicate.verification.reviewers[0].harness, "codex");
    assert.equal(st.predicate.verification.reviewers[0].matchesSnapshot, true);
  });
  it("the statement is Ed25519-signed; a tampered predicate fails verification", async () => {
    const { repo, base } = makeRepoWithBranch();
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo }
    );
    const merge = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false },
      git: (argv) => Promise.resolve(git(repo, argv)),
      mjVersion: "11.10.5"
    });
    const st = await buildProvenanceStatement({
      mission: "m",
      teamId: "t",
      mjVersion: "11.10.5",
      candidates: [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      gate: PASS_GATE,
      merge,
      harnessBySeat: { coder: "claude-code" }
    });
    assert.ok(st);
    assert.match(st.signature ?? "", /^[0-9a-f]{128}$/);
    assert.equal((await verifyProvenanceStatement(st)).ok, true);
    const laundered = { ...st, subject: [{ name: st.subject[0].name, digest: { gitCommit: "deadbeef".repeat(5) } }] };
    const v = await verifyProvenanceStatement(laundered);
    assert.equal(v.ok, false, "a laundered subject must fail signature verification");
  });
  it("a simulated or refused merge yields NO statement \u2014 provenance is only for what happened", async () => {
    const { repo, base } = makeRepoWithBranch();
    const plan = planMerge(
      [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      { baseBranch: base, repoRoot: repo }
    );
    const simulated = await executeMergePlan({
      plan,
      baseBranch: base,
      gate: { status: "PASS", tier: "cross-vendor", allowed: true, reason: "", overrideRequired: false },
      git: (argv) => Promise.resolve(git(repo, argv)),
      simulated: true,
      mjVersion: "11.10.5"
    });
    assert.equal(simulated.executed, false);
    const st = await buildProvenanceStatement({
      mission: "m",
      teamId: "t",
      mjVersion: "11.10.5",
      candidates: [{ seatId: "coder", branch: "mj/coder", worktreePath: "/tmp/wt", role: "coder", dependsOn: [], verified: true, additions: 1, deletions: 0 }],
      gate: PASS_GATE,
      merge: simulated,
      harnessBySeat: { coder: "claude-code" }
    });
    assert.equal(st, null, "no provenance may exist for a merge that did not happen");
  });
});
