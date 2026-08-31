/**
 * Control-plane probe (V11, W2).
 *
 * The V5 stub advertised 8 tools and implemented 1 — an echo that answered `ok: true`. V7 made
 * the lie impossible (unimplemented tools refuse). V11 closes the loop: advertisement equals
 * behavior. Since the dispatcher is Rust and this environment has no cargo, this probe pins
 * the SOURCE-LEVEL invariants the same way `wiring.test.ts` does — the parseable contract that
 * `cargo test` (control_mcp's own unit tests, which ship in the file) double-checks natively.
 *
 * Run: ./node_modules/.bin/esbuild probe/controlPlane.test.ts --bundle --platform=node --format=esm \
 *        --outfile=/tmp/cplane.mjs --log-level=error && node /tmp/cplane.mjs
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

const cm = read("src-tauri/src/control_mcp.rs");
const commands = read("src-tauri/src/commands.rs");
const lib = read("src-tauri/src/lib.rs");
const mcp = read("src-tauri/src/mcp.rs");

section("0. advertisement equals behavior — parsed from the source, not restated");
const extractList = (name: string): string[] => {
  const m = cm.match(new RegExp(`${name}\\s*:\\s*&\\[&str\\]\\s*=\\s*&\\[([^\\]]*)\\]`, "s"));
  return m ? (m[1].match(/"([a-z_]+)"/g) ?? []).map((x) => x.replaceAll('"', "")) : [];
};
const advertised = extractList("ADVERTISED_TOOLS");
const implemented = extractList("IMPLEMENTED_TOOLS");
ok(`the advertisement is non-trivial (${advertised.length} tools)`, advertised.length >= 5, advertised.join(", "));
ok("advertised == implemented, exactly", JSON.stringify([...advertised].sort()) === JSON.stringify([...implemented].sort()),
  `advertised-only: ${advertised.filter((t) => !implemented.includes(t)).join(", ") || "none"}; implemented-only: ${implemented.filter((t) => !advertised.includes(t)).join(", ") || "none"}`);
ok("the graph tools are implemented for real",
  ["connect_ports", "disconnect_ports", "list_nodes", "run_workflow"].every((t) => implemented.includes(t) && cm.includes(`pub fn ${t}(conn`)),
  "each tool needs a real `pub fn <tool>(conn…)`");

section("1. the delisted tools are gone from the advertisement and say so");
ok("pause/resume/cancel are NOT advertised", ["pause_execution", "resume_execution", "cancel_execution"].every((t) => !advertised.includes(t)));
ok("the delisted arm answers with an explicit marker", /delisted.*true/.test(cm) && cm.includes("`{tool}` is no longer advertised"));

section("2. the production entry point has database access");
ok("dispatch_with_db exists and routes every graph tool",
  ["list_nodes", "connect_ports", "disconnect_ports", "run_workflow"].every((t) => new RegExp(`dispatch_with_db[\\s\\S]*?"${t}"\\s*=>`).test(cm)),
  "each tool must be routed through the db-backed dispatcher");
ok("mcp_call serves the control server through dispatch_with_db", commands.includes("control_mcp::dispatch_with_db(&tool, &arguments, &lock_db(&state)?)"));
ok("validate_graph aliases the TS graph shape", cm.includes('or_else(|| graph.get("connections"))') && cm.includes('or_else(|| str_field(n, "definitionId"))'));

section("3. every mutation is Plan → Apply → Verify, with refusals that name what failed");
ok("connect_ports has the three phases", cm.includes('"phase": "plan"') && cm.includes('"phase": "apply"') && cm.includes('"phase": "verify"'));
ok("a refused mutation cannot have touched the store", cm.includes("nothing was changed") && cm.includes("would create a cycle"));
ok("run_workflow queues durable state, and says what drains it", cm.includes("INSERT INTO run_queue") && cm.includes("run_request_take"));
ok("run_workflow refuses to queue an invalid graph", cm.includes("fails validation — fix it before queuing"));

section("4. the V5 ghost is really gone");
ok("no tool echoes its arguments as success", !/json!\(\{\s*"ok": true,[^}]*"echo"/.test(cm));
ok("the echo stub of V5 is documented as history, not present as code", !/"echoed"/.test(cm.replace(/V7 fix \(bug U\)[^"]*/g, "")));

section("5. the new commands are registered in the Tauri handler");
for (const cmd of ["control_disconnect_ports", "control_list_nodes", "control_run_workflow"]) {
  ok(`${cmd} exists and is registered`, commands.includes(`pub fn ${cmd}`) && lib.includes(`commands::${cmd},`));
}
ok("mcp.rs derives its honest count from the same tables", mcp.includes("IMPLEMENTED_TOOLS.len()") && mcp.includes("notImplementedTools"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
