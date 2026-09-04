import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/otelExport.test.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// src/version.ts
var MJ_VERSION = "11.9.2";
var MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");
var MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;

// src/mission/otel.ts
var attr = (key, value) => typeof value === "boolean" ? { key, value: { boolValue: value } } : typeof value === "number" ? { key, value: { intValue: String(Math.round(value)) } } : { key, value: { stringValue: value } };
function spanId(seed) {
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i) * (i + 1), 2246822507) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}
function traceId(missionId) {
  return (spanId(missionId) + spanId(`trace:${missionId}`)).slice(0, 32);
}
function toNanoNanos(iso) {
  const ms = Date.parse(iso);
  const safe = Number.isFinite(ms) ? ms : 0;
  return String(safe * 1e6);
}
var SPAN_KINDS = /* @__PURE__ */ new Set([
  "AGENT_SPAWNED",
  "AGENT_ASSIGNED",
  "AGENT_REPLACED",
  "TASK_DELEGATED",
  "TASK_COMPLETED",
  "EVALUATION_STARTED",
  "EVALUATION_PASSED",
  "EVALUATION_FAILED"
]);
function spanNameFor(e) {
  switch (e.kind) {
    case "AGENT_SPAWNED":
    case "AGENT_ASSIGNED":
    case "AGENT_REPLACED":
      return `create_agent ${String(e.data?.role ?? e.subjectId ?? "agent")}`;
    case "TASK_DELEGATED":
    case "TASK_COMPLETED":
      return `execute_tool ${String(e.data?.title ?? e.subjectId ?? "task")}`;
    case "EVALUATION_STARTED":
    case "EVALUATION_PASSED":
    case "EVALUATION_FAILED":
      return `evaluation ${String(e.subjectId ?? "evaluation")}`;
    default:
      return null;
  }
}
function flightToOtlp(events2, opts = {}) {
  if (events2.length === 0) {
    return { resourceSpans: [] };
  }
  const missionId = events2[0].missionId;
  const tid = traceId(missionId);
  const first = events2[0];
  const last = events2[events2.length - 1];
  const rootSpanId = spanId(`root:${missionId}`);
  const governanceEvents = events2.filter((e) => !SPAN_KINDS.has(e.kind)).map((e) => ({
    timeUnixNano: toNanoNanos(e.ts),
    name: e.kind,
    attributes: [
      attr("mj.event.seq", e.seq),
      attr("mj.actor", e.actor),
      attr("mj.authority", e.authority),
      attr("mj.policy", e.policy),
      attr("mj.reason", e.reason),
      ...e.subjectId ? [attr("mj.subject", e.subjectId)] : []
    ]
  }));
  const root2 = {
    traceId: tid,
    spanId: rootSpanId,
    parentSpanId: "",
    name: `invoke_agent ${missionId}`,
    kind: "SPAN_KIND_INTERNAL",
    startTimeUnixNano: toNanoNanos(first.ts),
    endTimeUnixNano: toNanoNanos(last.ts),
    attributes: [
      attr("gen_ai.system", "mj"),
      attr("gen_ai.agent.name", missionId),
      attr("gen_ai.operation.name", "invoke_agent"),
      attr("mj.conventions.status", "development"),
      attr("mj.event.count", events2.length)
    ],
    events: governanceEvents
  };
  const children = events2.filter((e) => SPAN_KINDS.has(e.kind)).map((e) => {
    const sid = spanId(`${e.kind}:${e.seq}:${e.subjectId ?? ""}`);
    return {
      traceId: tid,
      spanId: sid,
      parentSpanId: rootSpanId,
      name: spanNameFor(e) ?? e.kind,
      kind: "SPAN_KIND_INTERNAL",
      startTimeUnixNano: toNanoNanos(e.ts),
      // Flight events are points in time; give each child span a nominal 1ms duration so
      // viewers render it. The recorder is the source of truth for durations, not OTLP.
      endTimeUnixNano: toNanoNanos(e.ts),
      attributes: [
        attr("gen_ai.system", "mj"),
        attr("gen_ai.operation.name", spanNameFor(e)?.split(" ")[0] ?? "execute_tool"),
        attr("mj.event.seq", e.seq),
        attr("mj.actor", e.actor),
        attr("mj.authority", e.authority),
        attr("mj.policy", e.policy),
        attr("mj.reason", e.reason),
        ...e.subjectId ? [attr("mj.subject", e.subjectId)] : []
      ],
      events: []
    };
  }).map((s) => ({ ...s, endTimeUnixNano: (Number(s.startTimeUnixNano) + 1e6).toString() }));
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            attr("service.name", "mj"),
            attr("service.version", opts.serviceVersion ?? MJ_VERSION),
            attr("gen_ai.conventions.status", "development")
          ]
        },
        scopeSpans: [
          {
            scope: { name: "mj.flight-recorder", version: MJ_VERSION },
            spans: [root2, ...children]
          }
        ]
      }
    ]
  };
}
function exportOtlpToFile(trace2, file, fsModule = { writeFileSync: (p, c) => void import("node:fs").then((f) => f.writeFileSync(p, c, "utf8")) }) {
  fsModule.writeFileSync(file, JSON.stringify(trace2, null, 2));
  return file;
}

// probe/otelExport.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
var seq = 0;
var ev = (kind, over = {}) => ({
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
  ...over
});
var events = [
  ev("MISSION_CREATED"),
  ev("MISSION_PLANNED"),
  ev("AGENT_SPAWNED", { subjectId: "seat-1", data: { role: "coder" } }),
  ev("TASK_DELEGATED", { subjectId: "task-1" }),
  ev("APPROVAL_REQUIRED", { subjectId: "task-1" }),
  ev("APPROVAL_GRANTED", { actor: "human:opus", authority: "human:opus" }),
  ev("TASK_COMPLETED", { subjectId: "task-1" }),
  ev("EVALUATION_PASSED", { subjectId: "eval-1" }),
  ev("MISSION_COMPLETED")
];
var trace = flightToOtlp(events);
var spans = trace.resourceSpans[0]?.scopeSpans[0]?.spans ?? [];
section("0. the document shape is OTLP-JSON");
ok("resourceSpans exists and carries a resource", trace.resourceSpans.length === 1 && Array.isArray(trace.resourceSpans[0].resource.attributes));
var svc = trace.resourceSpans[0].resource.attributes.find((a) => a.key === "service.name");
ok("service.name is mj", svc?.value.stringValue === "mj");
ok("the conventions status is stated honestly", JSON.stringify(trace).includes("development"));
section("1. the mission is one invoke_agent root span");
var root = spans.find((s) => String(s.name).startsWith("invoke_agent"));
ok("root span present", Boolean(root));
ok("root carries gen_ai attributes", JSON.stringify(root?.attributes).includes("gen_ai.agent.name"));
ok("root spans the whole event window", root?.startTimeUnixNano !== root?.endTimeUnixNano);
var rootEvents = root?.events ?? [];
ok("governance kinds become span events on the root", rootEvents.some((e) => e.name === "APPROVAL_REQUIRED") && rootEvents.some((e) => e.name === "POLICY_DENIED" || e.name === "MISSION_PLANNED"), `${rootEvents.length} events`);
var granted = rootEvents.find((e) => e.name === "APPROVAL_GRANTED");
ok("the human approval names its authority", granted?.attributes?.some((a) => a.key === "mj.authority" && a.value.stringValue === "human:opus") === true, JSON.stringify(granted));
section("2. work becomes child spans");
ok("agent spawn is a create_agent span", spans.some((s) => String(s.name).startsWith("create_agent coder")));
ok("task delegation/complete are execute_tool spans", spans.filter((s) => String(s.name).startsWith("execute_tool")).length === 2);
ok("evaluation is its own span", spans.some((s) => String(s.name).startsWith("evaluation eval-1")));
ok("every child links to the root", spans.filter((s) => s !== root).every((s) => s.parentSpanId === root?.spanId));
ok("all spans share one trace id", new Set(spans.map((s) => s.traceId)).size === 1);
ok("span ids are 16 hex chars", spans.every((s) => /^[0-9a-f]{16}$/.test(String(s.spanId))));
ok("trace id is 32 hex chars", /^[0-9a-f]{32}$/.test(String(root?.traceId)));
section("3. determinism \u2014 a trace must mean the same thing twice");
var again = flightToOtlp(events);
ok("identical events produce identical JSON", JSON.stringify(trace) === JSON.stringify(again));
section("4. the empty case is a valid empty document");
ok("no events \u2192 empty resourceSpans", flightToOtlp([]).resourceSpans.length === 0);
section("5. the local-first file export works");
var dir = fs.mkdtempSync(path.join(os.tmpdir(), "mj-otel-"));
try {
  const file = path.join(dir, "trace.json");
  exportOtlpToFile(trace, file, { writeFileSync: (p, c) => fs.writeFileSync(p, c, "utf8") });
  const written = JSON.parse(fs.readFileSync(file, "utf8"));
  ok("the written file parses back to the same trace", JSON.stringify(written) === JSON.stringify(trace));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
