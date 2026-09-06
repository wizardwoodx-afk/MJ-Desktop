/**
 * §Palette probe — fuzzy ranking + honest connection refusals.
 * Provenance: fuzzy core probed since 11.9.5; the label-first paletteScore
 * checks are the 11.9.6 review fix; both stay pinned here.
 *
 * Two halves of the keyboard-first release:
 *   1. the palette's scorer behaves like the tools it studied (Raycast/Linear/VS Code):
 *      exact > prefix > word-boundary > mid-word subsequence, non-subsequences rejected;
 *   2. the wire fix's honesty layer: connectRefusal names the EXACT rule that refuses,
 *      and says nothing (null) when the wire will connect.
 */
import { fuzzyScore, paletteScore, rankFuzzy } from "../src/app/fuzzy";
import { useGraphStore } from "../src/graph/store";

let pass = 0;
let fail = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (t: string) => console.log(`\n== ${t} ==`);

section("1. the fuzzy scorer ranks like a launcher");
ok("exact match beats everything", fuzzyScore("run", "run") === 1000, String(fuzzyScore("run", "run")));
ok("prefix beats subsequence", fuzzyScore("run", "Run workflow") > fuzzyScore("rw", "Run workflow"), "");
ok("word-boundary letters beat mid-word letters", fuzzyScore("rw", "Run Workflow") > fuzzyScore("un", "Run workflow"), `${fuzzyScore("rw", "Run Workflow")} vs ${fuzzyScore("un", "Run workflow")}`);
ok("a non-subsequence is rejected (negative)", fuzzyScore("xyz", "Run workflow") < 0, String(fuzzyScore("xyz", "Run workflow")));
ok("empty query matches everything neutrally", fuzzyScore("", "anything") === 0, "");
ok("contiguous runs score above scattered letters", fuzzyScore("work", "Run workflow") > fuzzyScore("wfk", "Run workflow"), "");

section("1.5 label-first palette scoring (11.9.6 review fix)");
ok("a label hit is the label score lifted above any group score (group never inflates it)", paletteScore("fit", "Fit view", "Canvas") === fuzzyScore("fit", "Fit view") + 1000, `${paletteScore("fit", "Fit view", "Canvas")} vs ${fuzzyScore("fit", "Fit view")}`);
ok("a label hit always out-ranks a group-only hit", paletteScore("canvas", "Open canvas", "Navigate") > paletteScore("canvas", "Auto layout", "Canvas"), `${paletteScore("canvas", "Open canvas", "Navigate")} vs ${paletteScore("canvas", "Auto layout", "Canvas")}`);
ok("a group-only query still surfaces, but damped (never outranks labels)", (() => {
  const groupOnly = paletteScore("nodes", "Jump to node: Coder", "Nodes");
  const labelHit = paletteScore("nodes", "Open nodes page", undefined);
  return groupOnly >= 0 && labelHit > groupOnly;
})(), "");
ok("label miss + group miss stays rejected", paletteScore("zzq", "Fit view", "Canvas") < 0, "");

section("2. rankFuzzy filters AND orders");
const items = ["Run workflow", "Save workflow", "Open settings", "Auto layout", "Jump to node: Coder"];
const ranked = rankFuzzy(items, "run", (s) => s).map((r) => r.item);
ok("matching items survive, ranked best-first", ranked[0] === "Run workflow" && ranked.includes("Auto layout") === false, JSON.stringify(ranked));
ok("no query keeps original order (recent-first belongs to the UI)", rankFuzzy(items, "  ", (s) => s).map((r) => r.item).join("|") === items.join("|"), "");
ok("garbage query yields an honest empty list", rankFuzzy(items, "qqzz", (s) => s).length === 0, "");

section("2.5 provenance — the shipped palette ranks labels, not category text");
import * as fs from "node:fs";
import * as path from "node:path";
declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : path.resolve(import.meta.dirname ?? ".", "..");
const paletteSrc = fs.readFileSync(path.join(ROOT, "src", "panels", "CommandPalette.tsx"), "utf8");
ok("the palette no longer concatenates the group into the search text", !paletteSrc.includes("${a.group"), "concatenated ranking text found");
ok("the palette composes through paletteScore (label-first)", /paletteScore\(q, item\.label, item\.group\)/.test(paletteSrc), "");

section("3. connectRefusal — the wire fix speaks in reasons");
const store = useGraphStore.getState();
const a = store.addNode("agent.planner", 0, 0)!;
const b = store.addNode("agent.coder", 400, 0)!;
ok("two real nodes landed on the probe graph", Boolean(a && b), `${a},${b}`);
const na = useGraphStore.getState().graph.nodes.find((n) => n.id === a)!;
const nb = useGraphStore.getState().graph.nodes.find((n) => n.id === b)!;
const outA = "summary"; // planner.summary: Markdown flows into Text
const inB = "task"; // coder.task:Text(req)

ok("a self-wire is refused in words", useGraphStore.getState().connectRefusal(a, outA, a, inB) === "A node cannot wire to itself.", String(useGraphStore.getState().connectRefusal(a, outA, a, inB)));
ok("a ghost port is refused in words", /does not exist/.test(useGraphStore.getState().connectRefusal(a, "nope", b, inB) ?? ""), String(useGraphStore.getState().connectRefusal(a, "nope", b, inB)));

const preRefusal = useGraphStore.getState().connectRefusal(a, outA, b, inB);
const first = useGraphStore.getState().connect(a, outA, b, inB);
ok("a legal wire: silence before, success after", preRefusal === null && first === true, `pre=${preRefusal} first=${first}`);
const second = useGraphStore.getState().connect(a, outA, b, inB);
ok("the duplicate is refused, not silently dropped", second === false && /already has a wire|Type mismatch|loop/.test(useGraphStore.getState().connectRefusal(a, outA, b, inB) ?? "NULL"), String(useGraphStore.getState().connectRefusal(a, outA, b, inB)));

/* cycle: b -> a would close the loop a -> b */
const outB = "result"; // coder.result: AgentResult → Text legal
const inA = "goal"; // would close planner → coder → planner
const loopRefusal = useGraphStore.getState().connectRefusal(b, outB, a, inA);
ok("a loop is refused BEFORE it is drawn", /loop/.test(loopRefusal ?? ""), String(loopRefusal));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail > 0 ? 1 : 0);
