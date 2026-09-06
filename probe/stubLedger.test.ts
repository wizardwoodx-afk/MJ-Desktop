/**
 * Stub ledger probe (V11, W6). The ledger that must render empty.
 *
 * V5 shipped commands that answered with plausible success while storing nothing. V7 turned
 * them into honest refusals. V11 implements them. This probe scans the shipped surfaces for
 * the vocabulary of not-implemented so it can never come back quietly.
 *
 * Run: ./node_modules/.bin/esbuild probe/stubLedger.test.ts --bundle --platform=node --format=esm \
 *        --define:MJ_ROOT='"'$(pwd)'"' --outfile=/tmp/ledger.mjs --log-level=error && node /tmp/ledger.mjs
 */
import * as fs from "node:fs";
import * as path from "node:path";

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

declare const MJ_ROOT: string | undefined;
const root = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : process.cwd();
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf8");
const STUB_VOCAB = /not implemented|not persisted|cannot be saved|no such table|is a stub/i;

section("0. the native command surface has no stub vocabulary");
const commands = read("src-tauri/src/commands.rs");
const control = read("src-tauri/src/control_mcp.rs");
const hits: string[] = [];
// The no-connection refusal in dispatch() is an HONEST limitation message (it describes what
// did not happen), as is the V11 test that pins the invariant. Neither is a stub.
const HONEST = /fn not_implemented|did nothing|advertisement must equal behavior|notImplemented/;
commands.split("\n").forEach((line, i) => {
  if (STUB_VOCAB.test(line) && !line.trim().startsWith("//")) hits.push(`commands.rs:${i + 1}: ${line.trim().slice(0, 90)}`);
});
control.split("\n").forEach((line, i) => {
  if (/not implemented/i.test(line) && !line.trim().startsWith("//") && !HONEST.test(line)) hits.push(`control_mcp.rs:${i + 1}: ${line.trim().slice(0, 90)}`);
});
ok(`no non-comment line of commands.rs/control_mcp.rs speaks stub (${hits.length} hits)`, hits.length === 0, hits.slice(0, 5).join(" | "));

section("1. the five former stubs are real now");
for (const [fn, table] of [
  ["skill_touch", "UPDATE skills SET use_count"],
  ["evaluation_save", "INSERT INTO evaluations"],
  ["evaluation_history", "FROM evaluations WHERE node_key"],
  ["suite_save", "INSERT INTO suites"],
  ["suite_list", "FROM suites ORDER BY updated_at DESC"],
] as const) {
  ok(`${fn} touches ${table.split(" ")[1] ?? table}`, new RegExp(`pub fn ${fn.replace("_", "_+")}[\\s\\S]{0,400}${table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(commands + read("src-tauri/src/db.rs")));
}
ok("the evaluations and suites tables exist in the shipped schema", read("src-tauri/src/db.rs").includes("CREATE TABLE IF NOT EXISTS evaluations") && read("src-tauri/src/db.rs").includes("CREATE TABLE IF NOT EXISTS suites"));
ok("skill usage columns migrate in place", read("src-tauri/src/db.rs").includes("ALTER TABLE skills ADD COLUMN use_count"));

section("2. no TypeScript surface throws 'not implemented'");
const tsHits: string[] = [];
const walk = (dir: string): void => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) {
      const src = fs.readFileSync(p, "utf8");
      if (STUB_VOCAB.test(src)) {
        src.split("\n").forEach((line, i) => {
          // Instruction text aimed at AGENTS ("do not invent APIs that were not implemented")
          // is guidance, not a stub refusal.
          // The failure detector's regex (it scans agent output FOR stub words) is detection, not a stub.
          if (STUB_VOCAB.test(line) && !/Do not invent|purpose:|admitsFailure/.test(line)) tsHits.push(`${path.relative(root, p)}:${i + 1}: ${line.trim().slice(0, 90)}`);
        });
      }
    }
  }
};
walk(path.join(root, "src"));
ok(`no src file speaks stub vocabulary (${tsHits.length} hits)`, tsHits.length === 0, tsHits.slice(0, 5).join(" | "));

section("3. honest limitation messages are allowed — vague ones are not");
const client = read("src/ipc/client.ts");
ok("browser-host refusals name the environment, not just the absence",
  !/throw new Error\("[^"]*not implemented/i.test(client),
  "a refusal must say what environment lacks the capability and why");
ok("the doc gap list no longer names the closed stubs",
  !/Stubs: `workflow_versions`[\s\S]{0,200}`run_request_take`/.test(read("LOCAL-WORKLIST.md")),
  "update LOCAL-WORKLIST.md §5 when the ledger closes");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
