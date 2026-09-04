import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/gitTs.test.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// src/mission/git.ts
function fail(reason) {
  return { ok: false, stdout: "", stderr: "", exitCode: null, reason };
}
var NO_GIT = async () => fail("No git runner is available in this environment, so MJ cannot read the repository. Nothing was inspected and no diff is shown.");
function parseStatusPorcelainZ(raw) {
  if (!raw) return [];
  const fields = raw.split("\0");
  const out = [];
  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    if (!entry || entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    let oldPath = null;
    if (code === "R " || code === "RM" || code === "C " || code === "CM") {
      oldPath = fields[i + 1] ?? null;
      i += 1;
    }
    const status = code === "??" ? "untracked" : code.startsWith("R") ? "renamed" : code.startsWith("C") ? "copied" : code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified";
    out.push({ status, path, oldPath });
  }
  return out;
}
function parseUnifiedDiff(raw) {
  const files = [];
  let current = null;
  let currentHunk = null;
  const flush = () => {
    if (current) files.push(current);
    current = null;
    currentHunk = null;
  };
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      flush();
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      current = { path: m?.[2] ?? m?.[1] ?? "unknown", oldPath: null, status: "modified", additions: 0, deletions: 0, binary: false, hunks: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("rename from ")) current.oldPath = line.slice("rename from ".length);
    else if (line.startsWith("copy from ")) current.oldPath = line.slice("copy from ".length);
    else if (line.startsWith("new file mode")) current.status = "added";
    else if (line.startsWith("deleted file mode")) current.status = "deleted";
    else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) current.binary = true;
    else if (line.startsWith("@@")) {
      currentHunk = { header: line, added: [], removed: [], lines: [] };
      current.hunks.push(currentHunk);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions += 1;
      if (currentHunk) {
        currentHunk.added.push(line.slice(1));
        currentHunk.lines.push(line);
      }
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions += 1;
      if (currentHunk) {
        currentHunk.removed.push(line.slice(1));
        currentHunk.lines.push(line);
      }
    } else if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }
  flush();
  for (const f of files) if (f.oldPath && f.status === "modified") f.status = "renamed";
  return files;
}
function summariseDiff(files) {
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);
  let largest = null;
  let biggest = -1;
  for (const f of files) {
    const churn = f.additions + f.deletions;
    if (churn > biggest) {
      biggest = churn;
      largest = f.path;
    }
  }
  return {
    files,
    totalAdditions,
    totalDeletions,
    netLines: totalAdditions - totalDeletions,
    binaryFiles: files.filter((f) => f.binary).length,
    empty: files.length === 0,
    largest: files.length ? largest : null
  };
}
function gitApi(runner) {
  const run = async (args, cwd) => runner(args, cwd);
  return {
    async isRepo(cwd) {
      const r = await run(["rev-parse", "--is-inside-work-tree"], cwd);
      if (!r.ok) return { ok: false, reason: r.reason ?? (r.stderr || "git rev-parse failed.") };
      return { ok: r.stdout.trim() === "true", reason: r.stdout.trim() === "true" ? null : "This directory is not inside a git work tree." };
    },
    async status(cwd) {
      const r = await run(["status", "--porcelain=v1", "-z"], cwd);
      if (!r.ok) return { ok: false, entries: [], reason: r.reason ?? (r.stderr || "git status failed.") };
      return { ok: true, entries: parseStatusPorcelainZ(r.stdout), reason: null };
    },
    async diff(cwd, opts = {}) {
      const args = ["diff", "--no-color", "--no-ext-diff", "-M"];
      if (opts.staged) args.push("--staged");
      if (opts.ref) args.push(opts.ref);
      args.push("--");
      for (const p of opts.paths ?? []) args.push(p);
      const r = await run(args, cwd);
      if (!r.ok) return { ok: false, summary: null, raw: "", reason: r.reason ?? (r.stderr || "git diff failed.") };
      return { ok: true, summary: summariseDiff(parseUnifiedDiff(r.stdout)), raw: r.stdout, reason: null };
    },
    async head(cwd) {
      const r = await run(["log", "-1", "--format=%H%x00%s"], cwd);
      if (!r.ok) return { ok: false, sha: null, subject: null, reason: r.reason ?? (r.stderr || "git log failed \u2014 is there a commit yet?") };
      const [sha, subject] = r.stdout.replace(/\n+$/, "").split("\0");
      return { ok: true, sha: (sha ?? "").trim() || null, subject: subject ?? null, reason: null };
    },
    async branch(cwd) {
      const r = await run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      if (!r.ok) return { ok: false, name: null, reason: r.reason ?? (r.stderr || "git rev-parse failed.") };
      return { ok: true, name: r.stdout.trim() || null, reason: null };
    }
  };
}
function renderDiffSummary(s) {
  if (s.empty) return "No changes. The working tree matches HEAD.";
  const lines = [`${s.files.length} files changed, +${s.totalAdditions} / -${s.totalDeletions} (net ${s.netLines >= 0 ? "+" : ""}${s.netLines})`];
  if (s.binaryFiles) lines.push(`${s.binaryFiles} binary file(s) \u2014 contents not shown, so they cannot be reviewed from this diff.`);
  if (s.largest) lines.push(`largest change: ${s.largest} (start the review there)`);
  for (const f of s.files.slice(0, 20)) {
    lines.push(`  ${f.status.padEnd(9)} ${f.oldPath ? `${f.oldPath} -> ${f.path}` : f.path}  +${f.additions}/-${f.deletions}${f.binary ? "  [binary]" : ""}`);
  }
  if (s.files.length > 20) lines.push(`  \u2026and ${s.files.length - 20} more`);
  return lines.join("\n");
}
function truncateDiffForPrompt(raw, maxChars = 24e3) {
  if (raw.length <= maxChars) return { text: raw, truncated: false, omittedFiles: 0 };
  const kept = [];
  let size = 0;
  let omitted = 0;
  for (const chunk of raw.split(/(?=^diff --git )/m)) {
    if (size + chunk.length > maxChars) {
      omitted += 1;
      continue;
    }
    kept.push(chunk);
    size += chunk.length;
  }
  const notice = `

[DIFF TRUNCATED: ${omitted} file(s) omitted. Do not report that you reviewed everything \u2014 note the truncation in your review.]
`;
  return { text: kept.join("") + notice, truncated: true, omittedFiles: omitted };
}

// probe/gitTs.test.ts
var pass = 0;
var fail2 = 0;
var ok = (c, m) => {
  if (c) pass += 1;
  else {
    fail2 += 1;
    console.log(`  FAIL ${m}`);
  }
};
var git = async (args, cwd) => {
  try {
    const stdout = execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, stdout, stderr: "", exitCode: 0, reason: null };
  } catch (e) {
    const err = e;
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? null,
      reason: (err.stderr || `git ${args.join(" ")} failed`).trim()
    };
  }
};
function makeRepo(tag) {
  const dir = mkdtempSync(join(tmpdir(), `mj-git-${tag}-`));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q");
  g("config", "user.email", "mj@test");
  g("config", "user.name", "MJ");
  writeFileSync(join(dir, "app.ts"), "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n");
  writeFileSync(join(dir, "old name.ts"), "keep me\n");
  g("add", ".");
  g("commit", "-q", "-m", "initial commit");
  return dir;
}
var api = gitApi(git);
console.log("\n== reading a real repository ==\n");
{
  const dir = makeRepo("clean");
  const isRepo = await api.isRepo(dir);
  ok(isRepo.ok === true, `a real repo is detected, got ok=${isRepo.ok} reason=${isRepo.reason}`);
  const d = await api.diff(dir);
  ok(d.ok === true, "diff on a clean tree succeeds");
  ok(d.summary?.empty === true, "and reports EMPTY \u2014 a real fact, not an error");
  ok(d.reason === null, "with no reason, because nothing went wrong");
  ok(renderDiffSummary(d.summary).includes("No changes"), "and the summary says so in words");
  const notRepo = await api.isRepo(tmpdir());
  ok(notRepo.ok === false && notRepo.reason !== null, `a non-repo is refused with a reason: ${notRepo.reason}`);
  rmSync(dir, { recursive: true, force: true });
}
console.log("\n== a real diff, parsed ==\n");
{
  const dir = makeRepo("diff");
  writeFileSync(join(dir, "app.ts"), "export const a = 1;\nexport const B = 22;\nexport const c = 3;\nexport const d = 4;\n");
  writeFileSync(join(dir, "brand new.ts"), "fresh\n");
  execFileSync("git", ["rm", "-q", "old name.ts"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  const r = await api.diff(dir, { staged: true });
  ok(r.ok === true, "the diff call succeeded");
  const s = r.summary;
  ok(s.files.length >= 2, `at least two files changed, got ${s.files.length}`);
  const shapes = s.files.map((f) => `${f.path}=${f.status}`).join(", ");
  ok(s.files.some((f) => f.status === "added" && f.path === "brand new.ts"), `the staged new file shows as added; got ${shapes}`);
  ok(s.files.some((f) => f.status === "deleted"), `the removed file shows as deleted; got ${shapes}`);
  const app = s.files.find((f) => f.path === "app.ts");
  ok(app !== void 0, "app.ts is in the diff");
  ok(app.status === "modified", `app.ts is 'modified', got ${app.status}`);
  ok(app.additions === 2 && app.deletions === 1, `app.ts is +2/-1, got +${app.additions}/-${app.deletions}`);
  ok(app.hunks.length === 1, `one hunk, got ${app.hunks.length}`);
  ok(app.hunks[0].added.includes("export const B = 22;"), "the added line is captured verbatim");
  ok(app.hunks[0].removed.includes("export const b = 2;"), "and so is the removed line");
  ok(app.hunks[0].header.startsWith("@@"), "the hunk header is preserved for the UI");
  ok(s.totalAdditions > s.totalDeletions, "net change is positive");
  ok(s.netLines === s.totalAdditions - s.totalDeletions, "netLines is consistent with the totals");
  ok(s.largest === "app.ts", `the largest change is app.ts, got ${s.largest}`);
  const text = renderDiffSummary(s);
  ok(/files changed/.test(text) && /\+\d+ \/ -\d+/.test(text), "the summary renders real counts");
  ok(/start the review there/.test(text), "and points the reviewer at the biggest change");
  rmSync(dir, { recursive: true, force: true });
}
console.log("\n== the shapes real repos produce ==\n");
{
  const dir = makeRepo("newline");
  writeFileSync(join(dir, "noeol.ts"), "one\ntwo");
  execFileSync("git", ["add", "."], { cwd: dir });
  const staged = await api.diff(dir, { staged: true });
  const f = staged.summary.files.find((x) => x.path === "noeol.ts");
  ok(f.additions === 2, `a 2-line file with no trailing newline is +2, got +${f.additions} (the "\\ No newline" marker must not count)`);
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = makeRepo("binary");
  writeFileSync(join(dir, "blob.bin"), Buffer.from([0, 1, 2, 3, 255, 254, 0, 7]));
  execFileSync("git", ["add", "."], { cwd: dir });
  const r = await api.diff(dir, { staged: true });
  const b = r.summary.files.find((x) => x.path === "blob.bin");
  ok(b.binary === true, "a binary file is detected as binary");
  ok(b.additions === 0 && b.deletions === 0, "and reports zero line changes rather than pretending to diff it");
  ok(r.summary.binaryFiles === 1, "the summary counts it");
  ok(/binary/.test(renderDiffSummary(r.summary)), "and the rendered summary admits there is no line diff");
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = makeRepo("rename");
  writeFileSync(join(dir, "old name.ts"), Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n") + "\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "bigger file"], { cwd: dir });
  execFileSync("git", ["mv", "old name.ts", "new name.ts"], { cwd: dir });
  execFileSync("git", ["add", "."], { cwd: dir });
  const r = await api.diff(dir, { staged: true });
  const f = r.summary.files.find((x) => x.path.includes("new name.ts"));
  ok(f !== void 0, "the renamed file is found despite the space in its name");
  ok(f.status === "renamed", `it is detected as a rename, got ${f.status}`);
  ok(f.oldPath !== null && f.oldPath.includes("old name"), `and the source path is recorded: ${f.oldPath}`);
  ok(/->/.test(renderDiffSummary(r.summary)), "the summary shows old -> new");
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = makeRepo("spaces");
  writeFileSync(join(dir, "a file with spaces.ts"), "x\n");
  if (process.platform !== "win32") {
    writeFileSync(join(dir, 'quote"mark.ts'), "y\n");
  } else {
    writeFileSync(join(dir, "quote'mark.ts"), "y\n");
  }
  const st = await api.status(dir);
  ok(st.ok === true, "status succeeded");
  const names = st.entries.map((e) => e.path);
  ok(names.includes("a file with spaces.ts"), `spaces survive: ${JSON.stringify(names)}`);
  ok(names.some((n) => n.includes("mark.ts")), "a filename with a quote survives");
  ok(st.entries.every((e) => e.status === "untracked"), "both are untracked");
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = makeRepo("head");
  const h = await api.head(dir);
  ok(h.ok === true && (h.sha?.length ?? 0) === 40, `HEAD sha is a full 40 chars, got ${h.sha?.length}`);
  ok(h.subject === "initial commit", `and the subject is parsed, got ${h.subject}`);
  const b = await api.branch(dir);
  ok(b.ok === true && b.name !== null, `branch resolves to ${b.name}`);
  rmSync(dir, { recursive: true, force: true });
}
console.log("\n== honesty when git is unavailable ==\n");
{
  const none = gitApi(NO_GIT);
  const d = await none.diff("/anywhere");
  ok(d.ok === false, "with no runner the call fails");
  ok(d.summary === null, "and returns NO summary");
  ok(d.raw === "", "and no raw diff");
  ok(/cannot read the repository/.test(d.reason ?? ""), `with a reason that says why: ${d.reason?.slice(0, 50)}...`);
  ok(!/No changes/.test(d.reason ?? ""), "and it does NOT claim there were no changes \u2014 an unavailable repo is not a clean tree");
  const empty = await api.diff(makeRepo("empty"));
  ok(empty.ok === true && empty.summary?.empty === true, "whereas a genuinely clean tree DOES say empty");
}
console.log("\n== diffstat from git's own count ==\n");
{
  const dir = makeRepo("stat");
  writeFileSync(join(dir, "app.ts"), "export const a = 1;\nCHANGED\nexport const c = 3;\nEXTRA\n");
  const r = await git(["diff", "--numstat", "--", "."], dir);
  ok(r.ok, "numstat ran");
  const [adds, dels] = r.stdout.split("	");
  ok(adds === "2" && dels === "1", `git's own numstat says +2/-1, got +${adds}/-${dels} \u2014 and the Rust side reports these verbatim`);
  rmSync(dir, { recursive: true, force: true });
}
console.log("\n== truncation for a prompt ==\n");
{
  const dir = makeRepo("big");
  const big = Array.from({ length: 4e3 }, (_, i) => `const v${i} = ${i};`).join("\n") + "\n";
  for (let i = 0; i < 6; i += 1) writeFileSync(join(dir, `mod${i}.ts`), big);
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "mods"], { cwd: dir });
  for (let i = 0; i < 6; i += 1) writeFileSync(join(dir, `mod${i}.ts`), big.replace(/= (\d+);/g, "= 999;"));
  const r = await api.diff(dir);
  ok(r.raw.length > 24e3, `the real diff is ${r.raw.length} chars, over the prompt limit`);
  const t = truncateDiffForPrompt(r.raw, 24e3);
  ok(t.truncated === true, "so it is truncated");
  ok(t.text.length <= 24e3 + 400, `and the result fits the budget, got ${t.text.length}`);
  ok(t.omittedFiles > 0, `${t.omittedFiles} file(s) were omitted`);
  ok(/TRUNCATED/.test(t.text), "the truncation is announced IN the text the agent receives");
  ok(/do not report that you reviewed everything/i.test(t.text), "and it forbids the agent from claiming a full review");
  const small = truncateDiffForPrompt("diff --git a/x b/x\n+1\n", 24e3);
  ok(small.truncated === false && small.omittedFiles === 0, "a small diff is passed through untouched");
  rmSync(dir, { recursive: true, force: true });
}
console.log("\n== parser robustness ==\n");
{
  ok(parseUnifiedDiff("").length === 0, "an empty diff yields no files");
  ok(parseUnifiedDiff("garbage that is not a diff").length === 0, "non-diff text yields no files rather than throwing");
  ok(summariseDiff([]).empty === true, "no files means an empty summary");
  ok(summariseDiff([]).largest === null, "and no 'largest change' is invented");
  ok(parseStatusPorcelainZ("").length === 0, "an empty status is an empty list");
  const parsed = parseStatusPorcelainZ("R  new.ts\0old.ts\0");
  ok(parsed.length === 1 && parsed[0].status === "renamed" && parsed[0].oldPath === "old.ts", `a -z rename pairs its paths: ${JSON.stringify(parsed)}`);
}
console.log(`
${pass} passed, ${fail2} failed
`);
process.exit(fail2 ? 1 : 0);
