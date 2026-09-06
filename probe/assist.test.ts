/**
 * Assist probe — added in V11 after the "AI ASSIST is not working" report.
 *
 * The panel mechanically inserted a node with zero exceptions, so nothing crashed — and it was
 * still broken from the user's chair: the title was the first four words of the request
 * verbatim ("A Custom Node That"), request boilerplate was never stripped, and no model was
 * ever called. These assertions pin the deterministic half (titles, spec parsing, prompt
 * shape) so the fallback path can never quietly regress into nonsense again. The model call
 * itself is environment-dependent (Ollama / provider keys) and stays a live-binary concern,
 * same as reviewVisibility.
 *
 * Run: ./node_modules/.bin/esbuild probe/assist.test.ts --bundle --platform=node --format=esm \
 *        --outfile=/tmp/assist.mjs --log-level=error && node /tmp/assist.mjs
 */
import { deriveTitle, draftCustomNode, parseNodeSpec, assistSystemPrompt } from "../src/domain/customNode";

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

section("0. titles are names, not the first four words of the request");
const t1 = deriveTitle("a custom node that redacts PII from meeting notes");
ok(`"redacts PII…" → a readable title (got "${t1}")`, /^[A-Z]/.test(t1) && !/^a\s+custom\s+node/i.test(t1), t1);
const t2 = deriveTitle("make me a custom node that summarizes CSV invoices");
ok(`"make me…" boilerplate never survives (got "${t2}")`, !/make|me|custom|node/i.test(t2.replace(/CSV/i, "")), t2);
const t3 = deriveTitle("summarize long PDFs into briefings");
ok(`verbs survive when they carry the job (got "${t3}")`, /Summarize/i.test(t3), t3);
const t4 = deriveTitle("   ");
ok("empty input still yields a sane fallback", t4 === "Custom Agent", t4);
const t5 = deriveTitle("!!! ???");
ok("punctuation-only input yields the fallback", t5 === "Custom Agent", t5);
ok("titles stay short", deriveTitle("one two three four five six seven").split(" ").length <= 4);

section("1. the offline draft strips request boilerplate from the purpose");
const d1 = draftCustomNode("make a node that translates release notes to German");
ok("purpose drops the 'make a node that' prefix", !/^make\s/i.test(d1.purpose), d1.purpose);
ok("purpose keeps the actual job", /translates release notes/i.test(d1.purpose), d1.purpose);
const d2 = draftCustomNode("i want an agent to triage bug reports");
ok("'i want an agent to' is stripped too", !/i want/i.test(d2.purpose), d2.purpose);

section("2. the model reply parser is defensive by design");
const good = parseNodeSpec('```json\n{"title":"Invoice Summarizer","purpose":"Summarize CSV invoices into line-item briefs.","procedures":["Parse the CSV","Group by vendor","Emit the brief"]}\n```');
ok("parses a fenced JSON spec", good !== null && good.title === "Invoice Summarizer", JSON.stringify(good));
ok("procedures survive", (good?.procedures.length ?? 0) === 3);
const noisy = parseNodeSpec('Here is your node:\n{"title":"PII Redactor","purpose":"Redact personal data from notes."} — hope that helps!');
ok("parses JSON embedded in prose", noisy !== null && noisy.title === "PII Redactor");
ok("rejects prose without a spec", parseNodeSpec("I cannot do that.") === null);
ok("rejects a spec without a purpose", parseNodeSpec('{"title":"X"}') === null);
ok("rejects a spec without a title", parseNodeSpec('{"purpose":"Y"}') === null);
ok("rejects malformed JSON", parseNodeSpec('{"title": oops}') === null);
ok("rejects the empty string", parseNodeSpec("") === null);
const clipped = parseNodeSpec('{"title":"Long Title That Keeps Going And Going And Going Beyond The Cap","purpose":"p"}');
ok("over-long titles are clipped, not trusted", clipped !== null && clipped.title.length <= 60);

section("3. the model prompt pins the contract");
const sys = assistSystemPrompt();
ok("the prompt demands JSON only", /ONLY a JSON object/.test(sys));
ok("the prompt fixes the schema", /"title": string/.test(sys) && /"procedures": string\[\]/.test(sys));
ok("the prompt bans invented tools", /Never invent tools/.test(sys));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
