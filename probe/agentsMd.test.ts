/**
 * AGENTS.md round-trip probe (V11, W4).
 *
 * Run: ./node_modules/.bin/esbuild probe/agentsMd.test.ts --bundle --platform=node --format=esm \
 *        --outfile=/tmp/agentsmd.mjs --log-level=error && node /tmp/agentsmd.mjs
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { agentsMdForMission, collectAgentsContext, parseAgentsMd, writeAgentsMd } from "../src/mission/agentsMd";

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mj-agentsmd-"));
try {
  section("0. reading: nearest-wins collection");
  fs.writeFileSync(
    path.join(dir, "AGENTS.md"),
    "# Project\n\n- Build with `npm ci && npm run build`\n- Never touch `/infra`\n",
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "packages", "web"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "packages", "web", "AGENTS.md"),
    "# Web package\n\n- Tests: `npm test -w web`\n",
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "packages", "web", "deep", "deeper"), { recursive: true });
  fs.writeFileSync(path.join(dir, "packages", "web", "deep", "deeper", "AGENTS.md"), "# Too deep\n", "utf8");

  const ctx = collectAgentsContext(dir, 3);
  ok("the root AGENTS.md is found", ctx.docs.some((d) => d.file === "AGENTS.md"));
  ok("a nested AGENTS.md is found", ctx.docs.some((d) => d.file === "packages/web/AGENTS.md"));
  ok("collection is depth-capped", !ctx.docs.some((d) => d.file.includes("deep")), ctx.docs.map((d) => d.file).join(", "));
  ok("the composed block carries both files", ctx.composed.includes("npm run build") && ctx.composed.includes("npm test -w web"));
  ok("provenance is explicit per block", ctx.composed.includes("### from packages/web/AGENTS.md"));

  section("1. parsing: sections survive any reasonable markdown");
  const parsed = parseAgentsMd("# T\n\nintro line\n\n## Build\n\nnpm ci\nnpm test\n", "AGENTS.md");
  // The H1 is the doc title, so the intro lines belong to the "T" section — that is the
  // convention the parser implements (first heading = title section).
  ok("intro lines survive under the title section", parsed.sections[0].heading === "T" && parsed.sections[0].lines.join(" ").includes("intro"), JSON.stringify(parsed.sections[0]));
  ok("named sections are captured in order", parsed.sections[1].heading === "Build" && parsed.sections[1].lines.includes("npm test"));
  ok("the title falls back sensibly", parsed.title === "T");

  section("2. writing: a mission renders a valid AGENTS.md");
  const ws = path.join(dir, "mission-workspace");
  const written = writeAgentsMd(ws, {
    missionId: "m-probe-1",
    objective: "Fix the flaky checkout tests",
    doneWhen: ["npm test exits 0 twice in a row", "no test is skipped"],
    boundaries: ["write only inside /src/checkout", "never run git push"],
    tasks: [
      { title: "Reproduce the flake", kind: "investigate", checks: ["npm test -- --repeat 5"], harness: "acp" },
      { title: "Fix it", kind: "implement", checks: ["npm test"] },
    ],
  });
  ok("the file is written into the workspace", fs.existsSync(written) && written.endsWith("AGENTS.md"));
  const text = fs.readFileSync(written, "utf8");
  ok("the objective is the title", text.startsWith("# Fix the flaky checkout tests"));
  ok("the done-when contract is present", text.includes("- npm test exits 0 twice in a row"));
  ok("boundaries are stated as instructions", text.includes("never run git push"));
  ok("per-task verify commands survive", text.includes("`npm test -- --repeat 5`"));
  ok("provenance names the mission", text.includes("m-probe-1"));

  section("3. the round-trip: MJ reads back what MJ wrote");
  const reread = collectAgentsContext(ws);
  ok("the generated file is discoverable", reread.docs.length === 1);
  ok("the generated file parses into sections", reread.docs[0].sections.length >= 4, `${reread.docs[0].sections.length} sections`);
  ok("and a different mission could consume it as context", reread.composed.includes("Fix the flaky checkout tests"));

  section("4. the missing-file case is quiet, not an error");
  const empty = collectAgentsContext(path.join(dir, "no-such-dir"));
  ok("no docs, no throw", empty.docs.length === 0 && empty.composed === "");

  section("5. the generator is deterministic");
  const input = {
    missionId: "m-det",
    objective: "o",
    doneWhen: ["d"],
    boundaries: ["b"],
    tasks: [{ title: "t", kind: "implement", checks: ["c"] }],
  };
  ok("identical input, identical markdown", agentsMdForMission(input) === agentsMdForMission(input));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
