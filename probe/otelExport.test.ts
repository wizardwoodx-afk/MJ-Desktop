/**
 * OTLP export probe (V11, W4).
 *
 * Run: ./node_modules/.bin/esbuild probe/otelExport.test.ts --bundle --platform=node --format=esm \
 *        --outfile=/tmp/otel.mjs --log-level=error && node /tmp/otel.mjs
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { exportOtlpToFile, flightToOtlp } from "../src/mission/otel";
import type { FlightEvent } from "../src/mission/types";

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

let seq = 0;
const ev = (kind: FlightEvent["kind"], over: Partial<FlightEvent> = {}): FlightEvent => ({
  seq: ++seq,
  missionId: "m-otel",
  ts: new Date(Date.UTC(2026, 0, 15, 10, seq, 0)).toISOString(),
  kind,
  actor: "supervisor",
  authority: "policy:standard",
  policy: "auto-approve LOW",
  reason: "probe",
  evidence: [],
  subjectId: "seat-1",
  data: { role: "coder", title: "fix the bug" },
  ...over,
});

const events: FlightEvent[] = [
  ev("MISSION_CREATED"),
  ev("MISSION_PLANNED"),
  ev("AGENT_SPAWNED", { subjectId: "seat-1", data: { role: "coder" } }),
  ev("TASK_DELEGATED", { subjectId: "task-1" }),
  ev("APPROVAL_REQUIRED", { subjectId: "task-1" }),
  ev("APPROVAL_GRANTED", { actor: "human:opus", authority: "human:opus" }),
  ev("TASK_COMPLETED", { subjectId: "task-1" }),
  ev("EVALUATION_PASSED", { subjectId: "eval-1" }),
  ev("MISSION_COMPLETED"),
];

const trace = flightToOtlp(events);
const spans = (trace.resourceSpans[0]?.scopeSpans[0]?.spans ?? []) as Array<Record<string, unknown>>;

section("0. the document shape is OTLP-JSON");
ok("resourceSpans exists and carries a resource", trace.resourceSpans.length === 1 && Array.isArray(trace.resourceSpans[0].resource.attributes));
const svc = (trace.resourceSpans[0].resource.attributes as Array<{ key: string; value: { stringValue?: string } }>).find((a) => a.key === "service.name");
ok("service.name is mj", svc?.value.stringValue === "mj");
ok("the conventions status is stated honestly", JSON.stringify(trace).includes("development"));

section("1. the mission is one invoke_agent root span");
const root = spans.find((s) => String(s.name).startsWith("invoke_agent"));
ok("root span present", Boolean(root));
ok("root carries gen_ai attributes", JSON.stringify(root?.attributes).includes("gen_ai.agent.name"));
ok("root spans the whole event window", root?.startTimeUnixNano !== root?.endTimeUnixNano);
const rootEvents = (root?.events ?? []) as Array<{ name?: string }>;
ok("governance kinds become span events on the root", rootEvents.some((e) => e.name === "APPROVAL_REQUIRED") && rootEvents.some((e) => e.name === "POLICY_DENIED" || e.name === "MISSION_PLANNED"), `${rootEvents.length} events`);
const granted = rootEvents.find((e) => e.name === "APPROVAL_GRANTED") as { attributes?: Array<{ key: string; value: { stringValue?: string } }> } | undefined;
ok("the human approval names its authority", granted?.attributes?.some((a) => a.key === "mj.authority" && a.value.stringValue === "human:opus") === true, JSON.stringify(granted));

section("2. work becomes child spans");
ok("agent spawn is a create_agent span", spans.some((s) => String(s.name).startsWith("create_agent coder")));
ok("task delegation/complete are execute_tool spans", spans.filter((s) => String(s.name).startsWith("execute_tool")).length === 2);
ok("evaluation is its own span", spans.some((s) => String(s.name).startsWith("evaluation eval-1")));
ok("every child links to the root", spans.filter((s) => s !== root).every((s) => s.parentSpanId === root?.spanId));
ok("all spans share one trace id", new Set(spans.map((s) => s.traceId)).size === 1);
ok("span ids are 16 hex chars", spans.every((s) => /^[0-9a-f]{16}$/.test(String(s.spanId))));
ok("trace id is 32 hex chars", /^[0-9a-f]{32}$/.test(String(root?.traceId)));

section("3. determinism — a trace must mean the same thing twice");
const again = flightToOtlp(events);
ok("identical events produce identical JSON", JSON.stringify(trace) === JSON.stringify(again));

section("4. the empty case is a valid empty document");
ok("no events → empty resourceSpans", flightToOtlp([]).resourceSpans.length === 0);

section("5. the local-first file export works");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mj-otel-"));
try {
  const file = path.join(dir, "trace.json");
  exportOtlpToFile(trace, file, { writeFileSync: (p, c) => fs.writeFileSync(p, c, "utf8") });
  const written = JSON.parse(fs.readFileSync(file, "utf8")) as typeof trace;
  ok("the written file parses back to the same trace", JSON.stringify(written) === JSON.stringify(trace));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
