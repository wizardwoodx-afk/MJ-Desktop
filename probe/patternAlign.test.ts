/**
 * MJ 11.13.1 — pattern registry probe.
 *
 * Pins the adaptive-extraction doctrine: MJ studies capability PATTERNS from
 * other public agent systems and adopts them independently — never copying
 * code. Provenance is mandatory (observed source + license of the observed
 * project), and adoption flows through the same human-approval pipeline as
 * every learned skill.
 */
import { PATTERN_REGISTRY, loadPatternRegistry, patternToSkillProposal } from "../src/mission/patterns";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

ok("the registry is non-empty and every entry names a capability and an adoption",
  PATTERN_REGISTRY.length >= 5 && PATTERN_REGISTRY.every((p) => p.capability.length > 10 && p.mjAdoption.length > 10));
ok("every entry carries provenance: where it was observed and the observed project's license",
  PATTERN_REGISTRY.every((p) => p.observedIn.length > 5 && p.observedLicense.length > 5));
ok("every entry states the code-copying prohibition explicitly (patterns, not code)",
  PATTERN_REGISTRY.every((p) => p.observedLicense.includes("no code copied")));
ok("Anthropic's commerce blueprint is represented — including the skill-loading stance",
  PATTERN_REGISTRY.some((p) => p.observedIn.includes("Claude Commerce Agents")) &&
  PATTERN_REGISTRY.some((p) => p.id === "pattern.skill-loading-over-splitting"));
ok("the cost-honesty pattern is registered (token-only stays dollar-UNKNOWN)",
  PATTERN_REGISTRY.some((p) => p.id === "pattern.harness-cost-honesty"));
ok("entry ids are unique", new Set(PATTERN_REGISTRY.map((p) => p.id)).size === PATTERN_REGISTRY.length);

const prop = patternToSkillProposal(PATTERN_REGISTRY[0], 123);
ok("a pattern becomes a standard skill proposal — status proposed, source observed-pattern",
  prop.status === "proposed" && prop.source === "observed-pattern" && prop.id.startsWith("skill.pattern."));
ok("the proposal carries the adoption story, so the approver sees what they approve",
  prop.description.includes("MJ adoption:") && prop.description.includes(PATTERN_REGISTRY[0].observedLicense));
ok("loadPatternRegistry returns the registry (the UI reads it live)", loadPatternRegistry().length === PATTERN_REGISTRY.length);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
