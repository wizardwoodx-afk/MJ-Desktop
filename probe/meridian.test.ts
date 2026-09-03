/**
 * §V11.5 MERIDIAN — the release-contract probe (suite #38).
 *
 * Meridian is a FEEL release with one rule: honest surfaces. This probe pins the four
 * things the owner demanded plus the redesign contracts:
 *
 *   1. ICONS    — the Meridian icon grammar: 1.6-weight strokes and a 1.7-radius ink dot
 *                 at the junction of every glyph (dot = currentColor, no stroke).
 *   2. METHODS  — node methods are IN-BUILT and NON-CHANGEABLE (owner rule): every agent
 *                 def has a method entry, methodFor falls back honestly, and the fold-field
 *                 table labels pre-V11.5 keys instead of pretending everything is new.
 *   3. ASSIST   — the redesign: provider resolved and labelled before you type, role rails
 *                 on every message, quick-starts, offline drafts labelled, select-on-canvas.
 *   4. CANVAS   — details open on DOUBLE-click only (owner rule); the minimap draws the
 *                 normal/small node rects (owner rule); the shortcuts overlay documents it.
 *
 * Run: ./node_modules/.bin/esbuild probe/meridian.test.ts --bundle --platform=node --format=esm \
 *        --define:MJ_ROOT='"'$(pwd)'"' --outfile=/tmp/meridian.mjs --log-level=error && node /tmp/meridian.mjs
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { CATEGORY_METHODS, composeAssignment, methodFor, NODE_FIELDS, NODE_METHODS } from "../src/domain/nodeMethods";
import { DEFINITIONS_BY_ID } from "../src/domain/nodeLibrary";

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
  console.log(`\n== ${name} ==\n`);
}
const root = MJ_ROOT;
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf8");

const icons = read("src/canvas/icons.tsx");
const assistant = read("src/assistant/AssistantPanel.tsx");
const canvas = read("src/canvas/Canvas.tsx");
const overlay = read("src/panels/ShortcutsOverlay.tsx");
const inspector = read("src/panels/Inspector.tsx");
const storeSrc = read("src/graph/store.ts");

/* ── 1. the Meridian icon grammar ─────────────────────────────────────────── */
section("1. the Meridian icon grammar — 1.6 strokes, junction ink dots");

const caseCount = (icons.match(/case "/g) ?? []).length;
const dotCount = (icons.match(/dot\(/g) ?? []).length;
ok(`every glyph is redrawn on the grammar (${caseCount} cases)`, caseCount >= 42, `${caseCount} cases`);
ok(`the ink dot helper exists and is used everywhere (${dotCount} dots)`, dotCount >= 40, `${dotCount} dots`);
ok("the dot is a filled 1.7-radius currentColor circle", icons.includes('r="1.7" fill="currentColor" stroke="none"'), "no dot grammar");
ok("strokes slimmed to the Meridian 1.6 weight", /strokeWidth: 1\.6/.test(icons), "still 1.7");
ok("the 24-grid viewBox survives", /viewBox: "0 0 24 24"/.test(icons), "viewBox changed");
ok("round caps keep the hand-set feel", /strokeLinecap: "round" as const/.test(icons), "caps changed");
ok("iconFor stays the single export the app calls", /export function iconFor/.test(icons), "export changed");

/* ── 2. node methods — the honest contract (owner rule) ───────────────────── */
section("2. node methods are in-built and non-changeable (owner rule)");

const DEFINITIONS = [...DEFINITIONS_BY_ID.values()];
const agentDefs = DEFINITIONS.filter((d) => d.category === "agent");
const CORE_AGENTS = ["agent.planner", "agent.researcher", "agent.browser", "agent.coder", "agent.debugger", "agent.tester", "agent.critic", "agent.reviewer", "agent.qa", "agent.docs", "agent.security"];
ok(`the core agents carry in-built methods (${CORE_AGENTS.length} of ${agentDefs.length} agent defs)`,
  CORE_AGENTS.every((id) => typeof NODE_METHODS[id]?.method === "string"),
  CORE_AGENTS.filter((id) => !NODE_METHODS[id]).join(", "));
ok(`no agent def is left without an honest method (${agentDefs.length} defs, role packs fall back to the category verb)`,
  agentDefs.every((d) => methodFor(d).length > 0 && methodFor(d) !== "Method not yet specified"),
  agentDefs.filter((d) => methodFor(d) === "Method not yet specified").map((d) => d.id).slice(0, 5).join(", "));
ok("capability nodes carry methods too (webhook/cron/vector)",
  ["cap.webhook", "cap.cron", "cap.vector"].every((id) => NODE_METHODS[id]?.method), "missing cap method");
ok("methods speak in verbs (built-in marker)",
  Object.values(NODE_METHODS).every((m) => /\(built in\)/i.test(m.method)), "a method lost its built-in marker");
ok("methodFor falls back to the category, never to silence",
  methodFor({ id: "agent.unknown", category: "agent" } as never).length > 0, "empty fallback");
ok("methodFor's last resort admits ignorance",
  methodFor({ id: "x.y", category: "misc" } as never) === "Method not yet specified", "fallback lies");
const foldKeys = Object.entries(NODE_FIELDS).filter(([, v]) => v.fold === "pre-existing").map(([k]) => k);
ok(`fold-fields are labelled as pre-existing (${foldKeys.length} keys)`, foldKeys.length >= 15, foldKeys.join(", "));
ok("genuinely-new keys carry a one-line default hint",
  Object.entries(NODE_FIELDS).filter(([, v]) => !v.fold).every(([, v]) => (v.def ?? "").length > 0), "a new key has no hint");
{
  const coder = DEFINITIONS.find((d) => d.id === "agent.coder")!;
  if (!coder) throw new Error("agent.coder missing from the library");
  const text = composeAssignment(coder, { language: "TypeScript", styleGuide: "" });
  ok("composeAssignment renders set values as '- label: value' lines", text.includes("- Language: TypeScript"), text);
  ok("composeAssignment omits empty values (nothing invented)", !text.includes("Style guide"), "empty value leaked");
  const planner = DEFINITIONS.find((d) => d.id === "agent.planner")!;
  const plan = composeAssignment(planner, { maxSteps: 4, planningStyle: "" });
  ok("numeric fields render unquoted (Max steps: 4)", plan.includes("- Max steps: 4"), plan);
  ok("composeAssignment folds newlines to '; '", composeAssignment(coder, { styleGuide: "line one\nline two" }).includes("line one; line two"), "newline survived");
  const head = composeAssignment(coder);
  ok("the assignment head names the node and its purpose", head.includes("agent.coder") && head.includes(coder.description.slice(0, 12)), head.slice(0, 60));
}
ok("the Inspector shows the method as a read-only contract line", inspector.includes("method-contract") && inspector.includes("methodFor("), "no method line");
ok("the Inspector hints fields from NODE_FIELDS", inspector.includes("NODE_FIELDS[c.key]"), "no field hints");
ok("the Inspector previews the composed assignment", inspector.includes("composeAssignment("), "no assignment preview");

/* ── 3. the Assist redesign ───────────────────────────────────────────────── */
section("3. Assist — labelled provider, role rails, honest offline drafts");

ok("the provider is resolved before you type (provLabel state)", /provLabel/.test(assistant) && /resolveProvider\(\)/.test(assistant), "no provider chip");
ok("the provider chip admits offline honestly", assistant.includes('provLabel?.includes("offline")'), "no offline styling");
ok("every message rides a role rail (you / assist)", assistant.includes("asst-rail") && assistant.includes("asst-role"), "no rails");
ok("via chips label model vs offline on the message", assistant.includes("asst-via") && assistant.includes("m.via.kind"), "no via chips");
ok("quick-starts replace the wall of intro text", /QUICK_STARTS/.test(assistant) && /asst-quick/.test(assistant), "no quick-starts");
ok("three quick-starts: RSS, PDF, JSON-diff", /RSS/.test(assistant) && /PDF/.test(assistant) && /diffs two JSON/.test(assistant), "wrong quick-starts");
ok("typing indicator is three blinking dots", /asst-typing/.test(assistant) && (assistant.match(/<span \/>/g) ?? []).length === 3, "no typing dots");
ok("inserted nodes offer select-on-canvas", assistant.includes("asst-action") && assistant.includes("focusNode"), "no select action");
ok("the footer states the honesty contract", /offline drafts are labelled, never faked/.test(assistant), "no footer line");
ok("offline drafts still say WHY they are offline", /deterministic offline draft — not AI output/.test(assistant), "offline reason lost");
ok("Ctrl+J toggles Assist", read("src/app/shortcuts.ts").includes('"toggleAssistant"') && read("src/App.tsx").includes("toggleAssistant"), "no chord");

/* ── 4. the canvas rules (owner rules, pinned) ────────────────────────────── */
section("4. details on double-click, minimap normal/small (owner rules)");

ok("single-click selects, it does not open details", canvas.includes("onClick={() => useGraphStore.getState().selectNode(node.id)}"), "single-click changed");
ok("details open on DOUBLE-click only", canvas.includes('onDoubleClick={() => useGraphStore.getState().openDetails(node.id)}'), "no double-click handler");
ok("the store keeps inspectorId separate from selection", storeSrc.includes("inspectorId: string | null") && storeSrc.includes("openDetails:"), "no inspectorId");
ok("clearing the selection closes the details", /selectNode: \(id\) =>\n      set\(id \? \{ selectedNodeId: id, selectedIds: \[id\] \} : \{ selectedNodeId: null, inspectorId: null, selectedIds: \[\] \}\)/.test(storeSrc), "selection clear leaks details");
ok("App opens the Inspector on inspectorId, not on selection", read("src/App.tsx").includes("if (store.inspectorId) setInspectorOpen(true);"), "App still follows selection");
ok("the shortcuts overlay documents the double-click rule", overlay.includes("Double-click") && overlay.includes("Open node details"), "not documented");
ok("the minimap draws normal/small node rects (46×32 / 28×20)", canvas.includes("nodeHitRect(n, n.definitionId.startsWith(\"control.\"))"), "minimap rects not from geometry");
ok("wires carry the Meridian midpoint dot", canvas.includes("wire-mid"), "no midpoint dot");
ok("the overlay documents the Assist chord", overlay.includes("Ctrl+J"), "not documented");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
