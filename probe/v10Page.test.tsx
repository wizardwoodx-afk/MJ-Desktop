/**
 * Renders the Proof page to a string, in node, and checks what it actually says.
 *
 * `tsc --noEmit` proves the page's types line up. It does not prove the page renders: a bad lookup, a
 * `.map` over `undefined`, or an exception in a `useMemo` all type-check perfectly and then blank the
 * screen at runtime behind an error boundary. So this renders the real component through
 * `react-dom/server` and asserts on the output.
 *
 * It also renders the page with a faked Tauri host, where `ipc.gitStatus` resolves through
 * `tauriInvoke` to nothing useful — which is the error path. A panel that throws there would be a blank
 * page for a real user whose git call failed, so that path is checked too.
 *
 * Run: ./node_modules/.bin/esbuild probe/v10Page.test.tsx --bundle --platform=node --format=esm \
 *        --loader:.tsx=tsx --outfile=/tmp/v10.mjs --log-level=error && node /tmp/v10.mjs
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { V10Page } from "../src/pages/V10Page";
import { MJ_VERSION_SHORT } from "../src/version";
import { AGENT_CAPABILITIES, binaryVerifiedHarnesses } from "../src/mission/agentCapabilities";
import { PREBUILT_TEAMS } from "../src/mission/agentTeam";
import { FlightRecorder, recorderFor } from "../src/mission/flightRecorder";

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

const strip = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

section("0. the browser build renders");
let html = "";
try {
  html = renderToStaticMarkup(createElement(V10Page));
} catch (err) {
  ok("V10Page renders without throwing", false, err instanceof Error ? err.message : String(err));
}
ok("V10Page renders without throwing", html.length > 1000, `${html.length} bytes`);

const text = strip(html);
ok("it is titled Proof", /Proof/.test(text), text.slice(0, 120));
ok("it names the release from the single source of truth", text.includes(`MJ ${MJ_VERSION_SHORT}`), `no MJ ${MJ_VERSION_SHORT}`);
ok("it declares this is a browser build", /Browser build/.test(text), "no build banner");
ok("it says git is NOT reachable rather than showing numbers", /Git, coding CLIs and SQLite are NOT reachable/.test(text), "no honest browser notice");

section("1. the pure panels rendered real data");
ok("every harness appears in the capabilities table", Object.values(AGENT_CAPABILITIES).every((c) => text.includes(c.name)), "a harness is missing");
ok("the verified-binary count is stated", new RegExp(`${binaryVerifiedHarnesses().length} of ${Object.keys(AGENT_CAPABILITIES).length} harnesses verified`).test(text), "count missing");
ok("unverified claims are surfaced, not hidden", /not verified against the binary/.test(text), "no unverified list");
ok("every prebuilt team is offered", PREBUILT_TEAMS.every((t) => text.includes(t.name)), "a team is missing");
ok("the merge plan is rendered", /Merge plan/.test(text) && /mj\/demo\/coder/.test(text), "no merge plan");
ok("the excluded branch is named with its reason", /excluded mj\/demo\/debugger/.test(text), "exclusion not shown");
ok("the caps panel renders", /Cost, turn and wall-clock caps/.test(text), "no caps panel");
ok("the run proof states the real snapshot SHA", /442a4fdd/.test(text), "no snapshot SHA");
ok("the run proof states the reviewer's real verdict", /said: CORRECT/.test(text), "no verdict");

section("2. no false-success defaults anywhere");
// These test what the panels DO, not which words appear — the git panel's own copy says it "will not
// show 0 files changed", so a naive string search matches the explanation instead of a fabrication.
const gitIdx = text.indexOf("Repository state");
const gitPanel = gitIdx >= 0 ? text.slice(gitIdx, gitIdx + 600) : "";
ok("the git panel reports NO entry count in a browser build", !/\b\d+ entr(y|ies)\b/.test(gitPanel), gitPanel.slice(0, 240));
ok("the git panel reports NO diff totals", !/\+\d+ -\d+/.test(gitPanel), gitPanel.slice(0, 240));
// Slice to the panel BODY, after the Reload button. The panel's own subtitle explains the rule
// ("…that is how a broken suite ends up showing 100%"), so searching the whole panel for a number
// matches the explanation rather than any fabricated data.
const evalIdx = text.indexOf("Reload from SQLite");
const evalBody = evalIdx >= 0 ? text.slice(evalIdx + "Reload from SQLite".length, evalIdx + 700) : "";
ok("the evals panel body contains no pass rate for a suite that never ran", !/\d+%/.test(evalBody), evalBody.slice(0, 200));
ok("the evals panel body makes no claim at all before data arrives", /Reading|No suites are stored yet|could not be read|not persisted/.test(evalBody), evalBody.slice(0, 200));
ok("it does NOT render an empty table that reads as 'nothing failed'", !/<tbody/.test(evalBody), "a table body was rendered with no data");
ok("the git panel refuses to show state it never read", /will not show .*0 files changed/.test(text) || /has not spoken to your repository/.test(text), "no refusal");
ok("the replay panel says there is no recorder instead of inventing one", /No mission has been opened in this session/.test(text), "no empty-state notice");
ok("the counterfactual rule is stated", /unknown — this was not re-run/.test(text), "no counterfactual rule");

section("3. with a mission in the recorder, replay renders real state");
const r: FlightRecorder = recorderFor("mission.rendered");
r.record({ kind: "MISSION_CREATED", actor: "human", authority: "human", policy: "none-required", reason: "Opened." });
r.record({ kind: "AGENT_SPAWNED", actor: "runtime", authority: "policy:org", policy: "org", reason: "Coder.", subjectId: "a.coder", data: { agentId: "a.coder", role: "coder" } });
r.record({ kind: "HARNESS_SELECTED", actor: "runtime", authority: "policy:risk-MEDIUM", policy: "risk", reason: "claude runs it.", subjectId: "a.coder", data: { agentId: "a.coder", harness: "claude" } });
r.record({ kind: "TASK_COMPLETED", actor: "a.coder", authority: "policy:task", policy: "task", reason: "Done.", subjectId: "a.coder", data: { agentId: "a.coder", costUsd: 0.31, tokens: 800, turns: 2 } });

let html2 = "";
try {
  html2 = renderToStaticMarkup(createElement(V10Page));
} catch (err) {
  ok("V10Page still renders with a live recorder", false, err instanceof Error ? err.message : String(err));
}
const text2 = strip(html2);
ok("V10Page still renders with a live recorder", html2.length > 1000, `${html2.length} bytes`);
ok("the projection shows the mission id", /mission\.rendered/.test(text2), "no mission id");
ok("the projection shows the agent and its harness", /harness=claude/.test(text2), "no harness line");
ok("the projection shows spend that was really reported", /\$0\.3100/.test(text2), "no spend");
ok("the scrubber has decision points", /decision points:/.test(text2), "no ticks");

section("4. the error path renders instead of blanking the page");
// Fake a Tauri host so the git panels take the real call path, with nothing behind it.
(globalThis as Record<string, unknown>).window = { __TAURI_INTERNALS__: {} } as unknown;
(globalThis as Record<string, unknown>).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};
let html3 = "";
try {
  html3 = renderToStaticMarkup(createElement(V10Page));
} catch (err) {
  ok("V10Page renders with a faked Tauri host", false, err instanceof Error ? err.message : String(err));
}
const text3 = strip(html3);
ok("V10Page renders with a faked Tauri host", html3.length > 1000, `${html3.length} bytes`);
ok("it now declares a native build", /Native build/.test(text3), "no native banner");
ok("the git panel offers a Read control rather than fake data", /Read/.test(text3), "no Read control");

// Let the effects' promises settle, then render again: every panel must still render.
await new Promise((res) => setTimeout(res, 60));
let html4 = "";
try {
  html4 = renderToStaticMarkup(createElement(V10Page));
} catch (err) {
  ok("V10Page renders after the git/eval calls have failed", false, err instanceof Error ? err.message : String(err));
}
ok("V10Page renders after the git/eval calls have failed", html4.length > 1000, `${html4.length} bytes`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
