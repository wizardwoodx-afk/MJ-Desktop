/**
 * §32.1 OpenTelemetry GenAI export (V11, MJ-11.0-PROPOSAL W4).
 *
 * The flight recorder is MJ's authoritative "why" trail; OTLP export makes that trail
 * readable in every OTel backend (Datadog, Jaeger, Langfuse, …) without inventing a vendor
 * format. Spans follow the OTel GenAI semantic conventions — which, stated plainly, are
 * still **Development** status: attribute names can change, and the Proof page says so.
 *
 * Mapping (FlightEvent → spans):
 *   the whole mission          → `invoke_agent {gen_ai.agent.name}`       (root span)
 *   AGENT_SPAWNED / ASSIGNED   → `create_agent` children
 *   TASK_DELEGATED..COMPLETED  → `execute_tool {tool.name}` children
 *   EVALUATION_*               → `evaluation` children
 *   APPROVAL_REQUIRED/GRANTED/REJECTED, POLICY_DENIED, FAILURE_DETECTED
 *                              → span events on the root (governance is a property of the
 *                                run, not a unit of work)
 *
 * Local-first rule: nothing is exported anywhere by default. `exportOtlpToFile` writes a
 * file; `postOtlp` sends to a user-configured endpoint and only when the caller explicitly
 * asks. MJ has no telemetry endpoint of its own and never will.
 */

import type { FlightEvent } from "./types";
import { MJ_VERSION } from "../version";

export interface OtlpAttr {
  key: string;
  value: { stringValue?: string; intValue?: string; boolValue?: boolean };
}

const attr = (key: string, value: string | number | boolean): OtlpAttr =>
  typeof value === "boolean"
    ? { key, value: { boolValue: value } }
    : typeof value === "number"
      ? { key, value: { intValue: String(Math.round(value)) } }
      : { key, value: { stringValue: value } };

/** Stable 8-byte span id derived from a string, so replays produce identical ids. */
function spanId(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i) * (i + 1), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}

/** Stable 16-byte trace id per mission. */
function traceId(missionId: string): string {
  return (spanId(missionId) + spanId(`trace:${missionId}`)).slice(0, 32);
}

/** OTLP JSON timestamps are epoch nanoseconds as strings. */
function toNanoNanos(iso: string): string {
  const ms = Date.parse(iso);
  const safe = Number.isFinite(ms) ? ms : 0;
  return String(safe * 1_000_000);
}

/** Which FlightEventKinds become child SPANS (the rest become span EVENTS on the root). */
const SPAN_KINDS = new Set([
  "AGENT_SPAWNED",
  "AGENT_ASSIGNED",
  "AGENT_REPLACED",
  "TASK_DELEGATED",
  "TASK_COMPLETED",
  "EVALUATION_STARTED",
  "EVALUATION_PASSED",
  "EVALUATION_FAILED",
]);

function spanNameFor(e: FlightEvent): string | null {
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

export interface OtlpTrace {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttr[] };
    scopeSpans: Array<{
      scope: { name: string; version: string };
      spans: unknown[];
    }>;
  }>;
}

/**
 * Fold a mission's flight events into one OTLP-JSON trace document.
 *
 * Deterministic: identical events produce byte-identical output, because ids are derived
 * from content, not from a random generator. That matters — this trace must mean the same
 * thing in an external viewer as the recorder means in MJ.
 */
export function flightToOtlp(events: FlightEvent[], opts: { serviceVersion?: string } = {}): OtlpTrace {
  if (events.length === 0) {
    return { resourceSpans: [] };
  }
  const missionId = events[0].missionId;
  const tid = traceId(missionId);
  const first = events[0];
  const last = events[events.length - 1];
  const rootSpanId = spanId(`root:${missionId}`);

  const governanceEvents = events
    .filter((e) => !SPAN_KINDS.has(e.kind))
    .map((e) => ({
      timeUnixNano: toNanoNanos(e.ts),
      name: e.kind,
      attributes: [
        attr("mj.event.seq", e.seq),
        attr("mj.actor", e.actor),
        attr("mj.authority", e.authority),
        attr("mj.policy", e.policy),
        attr("mj.reason", e.reason),
        ...(e.subjectId ? [attr("mj.subject", e.subjectId)] : []),
      ],
    }));

  const root = {
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
      attr("mj.event.count", events.length),
    ],
    events: governanceEvents,
  };

  const children = events
    .filter((e) => SPAN_KINDS.has(e.kind))
    .map((e) => {
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
        endTimeUnixNano: toNanoNanos(e.ts) as unknown as string,
        attributes: [
          attr("gen_ai.system", "mj"),
          attr("gen_ai.operation.name", spanNameFor(e)?.split(" ")[0] ?? "execute_tool"),
          attr("mj.event.seq", e.seq),
          attr("mj.actor", e.actor),
          attr("mj.authority", e.authority),
          attr("mj.policy", e.policy),
          attr("mj.reason", e.reason),
          ...(e.subjectId ? [attr("mj.subject", e.subjectId)] : []),
        ],
        events: [] as unknown[],
      };
    })
    .map((s) => ({ ...s, endTimeUnixNano: (Number(s.startTimeUnixNano) + 1_000_000).toString() }));

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            attr("service.name", "mj"),
            attr("service.version", opts.serviceVersion ?? MJ_VERSION),
            attr("gen_ai.conventions.status", "development"),
          ],
        },
        scopeSpans: [
          {
            scope: { name: "mj.flight-recorder", version: MJ_VERSION },
            spans: [root, ...children],
          },
        ],
      },
    ],
  };
}

/** Write the trace to a file (the default, local-first export path). */
export function exportOtlpToFile(
  trace: OtlpTrace,
  file: string,
  fsModule: { writeFileSync(p: string, c: string): void } = { writeFileSync: (p, c) => (void import("node:fs").then((f) => f.writeFileSync(p, c, "utf8"))) },
): string {
  fsModule.writeFileSync(file, JSON.stringify(trace, null, 2));
  return file;
}
