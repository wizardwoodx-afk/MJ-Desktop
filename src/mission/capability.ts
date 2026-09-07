/**
 * MJ 11.14.1 — the Capability Channel (the enterprise thesis, working).
 *
 * The upgrade from "share a file" to "expose a capability without exposing
 * the data": Employee 2 does not receive Employee 1's dataset. Employee 2
 * requests an APPROVED OPERATION; the operation runs where the data lives;
 * only the aggregate answer crosses the boundary — and it crosses through
 * the Egress Gate like everything else, with a signed receipt.
 *
 * Discipline, kept deliberately tight:
 *  - operations come from an explicit whitelist (aggregate-only); there is no
 *    free-form query surface and no path that returns raw rows;
 *  - the request needs a human-signed authority envelope scoped
 *    capability:run — no envelope, wrong scope, expired, revoked or non-human
 *    principal are each refused in words;
 *  - the result is digest-stamped, so the receipt proves WHICH answer left;
 *  - the demo dataset stands in for "company data on this laptop" and is
 *    labelled as such — MJ does not pretend to see a real corporate store.
 */
import { sha256Hex } from "./learningReceipt";
import { checkEnvelope, isHumanPrincipal, type AuthorityEnvelope } from "./custody";

export interface CapabilityRequest {
  id: string;
  /** who is asking — e.g. "employee:2" on another machine */
  requester: string;
  /** whitelist only: aggregate operations, never raw rows */
  op: "count" | "sum" | "avg" | "max";
  dataset: string;
  field: string;
}

export interface CapabilityResult {
  requestId: string;
  op: CapabilityRequest["op"];
  dataset: string;
  field: string;
  /** 11.14.2 — how many records the aggregate folded (metadata, not data) */
  cohortSize: number;
  /** aggregate only — structurally incapable of carrying raw rows */
  value: number;
  computedAt: string;
  digest: string;
}

export const CAPABILITY_OPS: CapabilityRequest["op"][] = ["count", "sum", "avg", "max"];

/**
 * MJ 11.14.2 — the Privacy Guard (the 9.9/10 review's serious problem, faced
 * honestly: aggregate-only does NOT automatically mean privacy-safe — narrow
 * or repeated aggregate queries can reconstruct rows). The production answer
 * is dataset-level policy enforced BEFORE any computation:
 *   - field policy: only declared fields may be aggregated at all
 *   - minimum cohort: an aggregate over fewer than k records is refused —
 *     small cohorts let a requester infer individuals
 *   - privacy budget: a hard cap on queries per window — repeated slightly
 *     different aggregates are exactly the reconstruction attack
 *   - bounded precision: answers are rounded to the policy's grain, so a
 *     result never carries more decimal information than intended
 * Differential privacy is the later enterprise tier (thesis §"Honest
 * engineering choice"); these four guards are what the seed can enforce
 * mechanically, today, and they are pinned by probe.
 */
export interface DatasetPolicy {
  dataset: string;
  allowedFields: string[];
  minCohortSize: number;
  maxQueriesPerWindow: number;
  windowMs: number;
  roundTo: number;
}


const queryLedger = new Map<string, number[]>();
/** Test/demo seam: clear the privacy-budget accounting. */
export function resetCapabilityQueryLedger(): void { queryLedger.clear(); }
/** How many queries have counted against this dataset's budget in the window. */
export function capabilityQueryCount(dataset: string, now: number): number {
  const policy = DEMO_POLICY.dataset === dataset ? DEMO_POLICY : null;
  if (!policy) return 0;
  const ts = (queryLedger.get(dataset) ?? []).filter((t) => now - t < policy.windowMs);
  return ts.length;
}

/** Demo stand-in for endpoint-resident company data. Labelled honestly. */
export const DEMO_COMPANY_DATA: { dataset: string; rows: Array<Record<string, number | string>> } = {
  dataset: "demo.revenue-by-region",
  rows: [
    { region: "APAC", revenue: 128.4 },
    { region: "EMEA", revenue: 96.2 },
    { region: "APAC", revenue: 64.1, bonus: 2.2 },
    { region: "EMEA", revenue: 45.9, bonus: 4.1 },
    { region: "AMER", revenue: 210.7 },
  ],
};

export const DEMO_POLICY: DatasetPolicy = {
  dataset: DEMO_COMPANY_DATA.dataset,
  allowedFields: ["revenue", "bonus"],
  minCohortSize: 5,
  maxQueriesPerWindow: 8,
  windowMs: 10 * 60 * 1000,
  roundTo: 0.1,
};

export function capabilityCanonical(r: Omit<CapabilityResult, "digest">): string {
  return JSON.stringify([r.requestId, r.op, r.dataset, r.field, r.cohortSize, r.value, r.computedAt]);
}

/**
 * The gate for capability requests. Returns the computed result when the
 * operation is authorized — or the plain-language reason it was refused.
 * Raw rows never enter the result: every whitelisted op folds to one number.
 */
export async function executeCapability(args: {
  request: CapabilityRequest;
  envelope: AuthorityEnvelope | null;
  now: number;
}): Promise<{ result: CapabilityResult | null; reason: string }> {
  const { request, envelope, now } = args;
  if (!envelope) return { result: null, reason: "refused — no authority envelope; a capability request needs the data owner's signed authority" };
  if (!isHumanPrincipal(envelope.principal)) return { result: null, reason: `refused — principal "${envelope.principal}" is not human; only the data owner may authorize operations on their data` };
  const scope = checkEnvelope(envelope, "capability:run", now);
  if (!scope.ok) return { result: null, reason: `refused — ${scope.reason}` };
  if (!envelope.scope.includes("capability:run")) return { result: null, reason: "refused — the envelope's scope does not permit capability:run" };
  if (!CAPABILITY_OPS.includes(request.op)) return { result: null, reason: `refused — operation "${request.op}" is not on the approved whitelist` };
  if (request.dataset !== DEMO_COMPANY_DATA.dataset) return { result: null, reason: `refused — dataset "${request.dataset}" is not exposed on this machine` };

  // 11.14.2 — Privacy Guard, enforced before any computation. Every attempt
  // that passes authority counts against the privacy budget — refusals too —
  // because probing itself is the reconstruction attack.
  const policy = DEMO_POLICY;
  const spent = (queryLedger.get(request.dataset) ?? []).filter((t) => now - t < policy.windowMs);
  queryLedger.set(request.dataset, spent);
  if (spent.length >= policy.maxQueriesPerWindow) {
    return { result: null, reason: `refused — privacy budget exhausted: ${spent.length} queries already counted in this ${Math.round(policy.windowMs / 60000)}-minute window; repeated aggregates can reconstruct rows, so the budget is hard` };
  }
  spent.push(now);
  if (!policy.allowedFields.includes(request.field)) {
    return { result: null, reason: `refused — field "${request.field}" is not in this dataset's aggregation policy` };
  }

  const values = DEMO_COMPANY_DATA.rows
    .map((r) => Number(r[request.field]))
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return { result: null, reason: `refused — field "${request.field}" has no numeric data` };
  if (values.length < policy.minCohortSize) {
    return { result: null, reason: `refused — cohort of ${values.length} is below the minimum of ${policy.minCohortSize}; an aggregate that small can expose individuals` };
  }
  const value =
    request.op === "count" ? values.length :
    request.op === "sum" ? values.reduce((a, b) => a + b, 0) :
    request.op === "max" ? Math.max(...values) :
    values.reduce((a, b) => a + b, 0) / values.length;
  // bounded precision: never return more decimal grain than the policy allows
  const rounded = Math.round(value / policy.roundTo) * policy.roundTo;

  const base: Omit<CapabilityResult, "digest"> = {
    requestId: request.id,
    op: request.op,
    dataset: request.dataset,
    field: request.field,
    cohortSize: values.length,
    value: Math.round(rounded * 1e6) / 1e6,
    computedAt: new Date(now).toISOString(),
  };
  const digest = await sha256Hex(capabilityCanonical(base));
  return { result: { ...base, digest }, reason: "authorized — computed where the data lives; only the answer may leave" };
}
