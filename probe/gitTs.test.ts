/**
 * V9 — the git surface, tested against a REAL repository.
 *
 * `src-tauri/src/git.rs` has its own 6 Rust tests (including a 40,000-line diff). This suite covers
 * the TypeScript half: the parser and summariser, fed by real `git` output rather than by fixtures I
 * wrote by hand. A diff parser tested only against invented strings is how binary files, renames and
 * "no newline at end of file" get silently mishandled.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  NO_GIT,
  gitApi,
  parseStatusPorcelainZ,
  parseUnifiedDiff,
  renderDiffSummary,
  summariseDiff,
  truncateDiffForPrompt,
  type GitRunner,
} from "../src/mission/git";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};

const git: GitRunner = async (args, cwd) => {
  try {
    // QA fix (audit W2): no git call here may ever hang the suite. A stuck credential helper,
    // a wedged index.lock or an AV scan must surface as a failed assertion, not a dead run.
    const stdout = execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 30_000, killSignal: "SIGKILL" });
    return { ok: true, stdout, stderr: "", exitCode: 0, reason: null };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number | null };
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? null,
      reason: (err.stderr || `git ${args.join(" ")} failed`).trim(),
    };
  }
};

function makeRepo(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mj-git-${tag}-`));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8", timeout: 30_000, killSignal: "SIGKILL" });
  g("init", "-q");
  g("config", "user.email", "mj@test");
  g("config", "user.name", "MJ");
  writeFileSync(join(dir, "app.ts"), "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n");
  writeFileSync(join(dir, "old name.ts"), "keep me\n");
  g("add", ".");
  g("commit", "-q", "-m", "initial commit");
  return dir;
}

const api = gitApi(git);

console.log("\n== reading a real repository ==\n");

{
  const dir = makeRepo("clean");
  const isRepo = await api.isRepo(dir);
  ok(isRepo.ok === true, `a real repo is detected, got ok=${isRepo.ok} reason=${isRepo.reason}`);

  const d = await api.diff(dir);
  ok(d.ok === true, "diff on a clean tree succeeds");
  ok(d.summary?.empty === true, "and reports EMPTY — a real fact, not an error");
  ok(d.reason === null, "with no reason, because nothing went wrong");
  ok(renderDiffSummary(d.summary!).includes("No changes"), "and the summary says so in words");

  const notRepo = await api.isRepo(tmpdir());
  ok(notRepo.ok === false && notRepo.reason !== null, `a non-repo is refused with a reason: ${notRepo.reason}`);
  rmSync(dir, { recursive: true, force: true });
}

console.log("\n== a real diff, parsed ==\n");

{
  const dir = makeRepo("diff");
  writeFileSync(join(dir, "app.ts"), "export const a = 1;\nexport const B = 22;\nexport const c = 3;\nexport const d = 4;\n");
  // `git diff` deliberately ignores UNTRACKED files, so a brand-new file must be staged to appear.
  writeFileSync(join(dir, "brand new.ts"), "fresh\n");
  // `git add -A` stages new and modified files but NOT deletions — that is `git add -u`, and `git rm`
  // stages its own removal. Without the rm the deletion never reaches the index and a --staged diff
  // legitimately omits it, so both are needed.
  execFileSync("git", ["rm", "-q", "old name.ts"], { cwd: dir, timeout: 30_000, killSignal: "SIGKILL" });
  execFileSync("git", ["add", "-A"], { cwd: dir, timeout: 30_000, killSignal: "SIGKILL" });

  const r = await api.diff(dir, { staged: true });
  ok(r.ok === true, "the diff call succeeded");
  const s = r.summary!;
  ok(s.files.length >= 2, `at least two files changed, got ${s.files.length}`);
  const shapes = s.files.map((f) => `${f.path}=${f.status}`).join(", ");
  ok(s.files.some((f) => f.status === "added" && f.path === "brand new.ts"), `the staged new file shows as added; got ${shapes}`);
  ok(s.files.some((f) => f.status === "deleted"), `the removed file shows as deleted; got ${shapes}`);

  const app = s.files.find((f) => f.path === "app.ts")!;
  ok(app !== undefined, "app.ts is in the diff");
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
  // A file added with no trailing newline — git appends "\ No newline at end of file", which must
  // not be counted as a changed line.
  const dir = makeRepo("newline");
  writeFileSync(join(dir, "noeol.ts"), "one\ntwo");
  execFileSync("git", ["add", "."], { cwd: dir, timeout: 30_000, killSignal: "SIGKILL" });
  const staged = await api.diff(dir, { staged: true });
  const f = staged.summary!.files.find((x) => x.path === "noeol.ts")!;
  ok(f.additions === 2, `a 2-line file with no trailing newline is +2, got +${f.additions} (the "\\ No newline" marker must not count)`);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRepo("binary");
  writeFileSync(join(dir, "blob.bin"), Buffer.from([0, 1, 2, 3, 255, 254, 0, 7]));
  execFileSync("git", ["add", "."], { cwd: dir, timeout: 30_000, killSignal: "SIGKILL" });
  const r = await api.diff(dir, { staged: true });
  const b = r.summary!.files.find((x) => x.path === "blob.bin")!;
  ok(b.binary === true, "a binary file is detected as binary");
  ok(b.additions === 0 && b.deletions === 0, "and reports zero line changes rather than pretending to diff it");
  ok(r.summary!.binaryFiles === 1, "the summary counts it");
  ok(/binary/.test(renderDiffSummary(r.summary!)), "and the rendered summary admits there is no line diff");
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = makeRepo("rename");
  // Git only reports a rename above its similarity threshold. A 1-line file with 1 line ADDED is
  // ~50% similar, so git legitimately calls it add+delete. Use a file big enough that a pure move
  // stays a rename — that is the case a reviewer needs to see as "moved", not "new file".
  writeFileSync(join(dir, "old name.ts"), Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n") + "\n");
  execFileSync("git", ["add", "."], { cwd: dir, timeout: 30_000, killSignal: "SIGKILL" });
  execFileSync("git", ["commit", "-q", "-m", "bigger file"], { cwd: dir, timeout: 30_000, killSignal: "SIGKILL" });
  execFileSync("git", ["mv", "old name.ts", "new name.ts"], { cwd: dir, timeout: 30_000, killSignal: "SIGKILL" });
  execFileSync("git", ["add", "."], { cwd: dir, timeout: 30_000, killSignal: "SIGKILL" });
  const r = await api.diff(dir, { staged: true });
  const f = r.summary!.files.find((x) => x.path.includes("new name.ts"))!;
  ok(f !== undefined, "the renamed file is found despite the space in its name");
  ok(f.status === "renamed", `it is detected as a rename, got ${f.status}`);
  ok(f.oldPath !== null && f.oldPath.includes("old name"), `and the source path is recorded: ${f.oldPath}`);
  ok(/->/.test(renderDiffSummary(r.summary!)), "the summary shows old -> new");
  rmSync(dir, { recursive: true, force: true });
}

{
  // Spaces and quotes in filenames: the -z form is the only one that survives them.
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
  ok(!/No changes/.test(d.reason ?? ""), "and it does NOT claim there were no changes — an unavailable repo is not a clean tree");

  const empty = await api.diff(makeRepo("empty"));
  ok(empty.ok === true && empty.summary?.empty === true, "whereas a genuinely clean tree DOES say empty");
}

console.log("\n== diffstat from git's own count ==\n");

{
  const dir = makeRepo("stat");
  writeFileSync(join(dir, "app.ts"), "export const a = 1;\nCHANGED\nexport const c = 3;\nEXTRA\n");
  const r = await git(["diff", "--numstat", "--", "."], dir);
  ok(r.ok, "numstat ran");
  const [adds, dels] = r.stdout.split("\t");
  ok(adds === "2" && dels === "1", `git's own numstat says +2/-1, got +${adds}/-${dels} — and the Rust side reports these verbatim`);
  rmSync(dir, { recursive: true, force: true });
}

console.log("\n== truncation for a prompt ==\n");

{
  const dir = makeRepo("big");
  const big: string = Array.from({ length: 4000 }, (_, i) => `const v${i} = ${i};`).join("\n") + "\n";
  for (let i = 0; i < 6; i += 1) writeFileSync(join(dir, `mod${i}.ts`), big);
  execFileSync("git", ["add", "."], { cwd: dir, timeout: 30_000, killSignal: "SIGKILL" });
  execFileSync("git", ["commit", "-q", "-m", "mods"], { cwd: dir, timeout: 30_000, killSignal: "SIGKILL" });
  for (let i = 0; i < 6; i += 1) writeFileSync(join(dir, `mod${i}.ts`), big.replace(/= (\d+);/g, "= 999;"));
  const r = await api.diff(dir);
  ok(r.raw.length > 24000, `the real diff is ${r.raw.length} chars, over the prompt limit`);

  const t = truncateDiffForPrompt(r.raw, 24000);
  ok(t.truncated === true, "so it is truncated");
  ok(t.text.length <= 24000 + 400, `and the result fits the budget, got ${t.text.length}`);
  ok(t.omittedFiles > 0, `${t.omittedFiles} file(s) were omitted`);
  ok(/TRUNCATED/.test(t.text), "the truncation is announced IN the text the agent receives");
  ok(/do not report that you reviewed everything/i.test(t.text), "and it forbids the agent from claiming a full review");

  const small = truncateDiffForPrompt("diff --git a/x b/x\n+1\n", 24000);
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
  // A rename in -z form puts the source path in the NEXT NUL field.
  const parsed = parseStatusPorcelainZ("R  new.ts\u0000old.ts\u0000");
  ok(parsed.length === 1 && parsed[0].status === "renamed" && parsed[0].oldPath === "old.ts", `a -z rename pairs its paths: ${JSON.stringify(parsed)}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
