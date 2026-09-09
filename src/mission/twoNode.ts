/**
 * MJ 11.14.3 — THE TWO-MACHINE PROOF.
 *
 * The 11.14.2 review's final judgment: the next real step is not another
 * feature — it is this experiment. Employee A owns the data. Employee B
 * requests a capability. The relay (the future cloud control plane)
 * coordinates. A computes locally. Only the permitted, bounded result
 * crosses. The privacy budget and policy apply at A. The egress receipt
 * proves what crossed.
 *
 * This module is the protocol, run honestly inside one repo: the relay is a
 * DUMB PIPE that forwards typed wire messages and logs everything it sees —
 * so the probe can inspect exactly what the coordinator learned, and prove
 * it learned identity / request / authorization / receipt, and NEVER raw
 * rows. No cloud infrastructure is built here — that is deliberate and
 * stated: MJ remains the endpoint runtime; the relay is a simulation of
 * the thin control plane a real deployment would add.
 */
import {
  executeCapability,
  capabilityCanonical,
  type CapabilityRequest,
  type CapabilityResult,
} from "./capability";
import { type AuthorityEnvelope } from "./custody";
import { requestEgress, verifyEgressLedger, loadEgressLedger } from "./egress";
import { sha256Hex } from "./learningReceipt";

/** the only message shapes that ever enter the relay */
export interface WireRequest {
  kind: "capability-request";
  requestId: string;
  /** requester identity — B */
  from: string;
  /** owner identity — A */
  to: string;
  op: CapabilityRequest["op"];
  dataset: string;
  field: string;
  where?: Record<string, string | number>;
  /** authorization evidence — the envelope's identity and digest, not its contents */
  envelopeId: string;
  envelopeDigest: string;
}

export interface WireVerdict {
  kind: "verdict";
  requestId: string;
  /** owner identity — A answers */
  from: string;
  /** back to the requester — B */
  to: string;
  authorized: boolean;
  /** every outcome, granted or refused, is stated in words */
  reason: string;
  /** present ONLY when authorized — the bounded answer, never raw rows */
  result?: CapabilityResult;
  /** the egress receipt digest proving what crossed */
  receiptDigest?: string;
}

export type WireMessage = WireRequest | WireVerdict;

/** the coordinator. It forwards messages and can see nothing else. */
export class RelayNode {
  readonly log: WireMessage[] = [];
  send(msg: WireMessage): void { this.log.push(msg); }
}

/**
 * Employee A's endpoint. Receives the wire request plus the authority
 * envelope, computes WHERE THE DATA LIVES under the full Privacy Guard,
 * and — only if authorized — routes the bounded answer through the Egress
 * Gate so a receipt exists for what crossed. Returns the verdict message.
 */
export async function ownerComputes(args: {
  wire: WireRequest;
  envelope: AuthorityEnvelope;
  now: number;
}): Promise<WireVerdict> {
  const request: CapabilityRequest = {
    id: args.wire.requestId,
    requester: args.wire.from,
    op: args.wire.op,
    dataset: args.wire.dataset,
    field: args.wire.field,
    where: args.wire.where,
  };
  const { result, reason } = await executeCapability({
    request, envelope: args.envelope, now: args.now,
  });
  if (!result) {
    return {
      kind: "verdict", requestId: args.wire.requestId,
      from: args.wire.to, to: args.wire.from,
      authorized: false, reason,
    };
  }
  // the answer crosses only through the Egress Gate — receipt included
  const egress = await requestEgress({
    envelope: args.envelope,
    item: {
      kind: "capability-result",
      name: `capability-answer:${args.wire.requestId}`,
      sha256: await sha256Hex(capabilityCanonical(result)),
    },
    recipient: args.wire.from,
    now: args.now,
  });
  return {
    kind: "verdict", requestId: args.wire.requestId,
    from: args.wire.to, to: args.wire.from,
    authorized: true, reason,
    result,
    receiptDigest: egress.record ? egress.record.digest : undefined,
  };
}

/**
 * Employee B's side. Verifies the answer it received: the result digest
 * must re-derive from the bounded answer alone — so B (and any auditor)
 * can check the hash of exactly what crossed, and a relay that tampered
 * with the value fails this check.
 */
export async function requesterVerifies(verdict: WireVerdict): Promise<{ ok: boolean; detail: string }> {
  if (!verdict.authorized || !verdict.result) {
    return { ok: !verdict.authorized, detail: verdict.reason };
  }
  const { digest, ...rest } = verdict.result;
  const recomputed = await sha256Hex(capabilityCanonical(rest));
  if (recomputed !== digest) {
    return { ok: false, detail: "tampered — the answer received does not match its digest" };
  }
  if (!(await verifyEgressLedger(loadEgressLedger()))) {
    return { ok: false, detail: "tampered — the egress receipt chain does not verify" };
  }
  return { ok: true, detail: `verified — answer ${verdict.result.value} over ${verdict.result.cohortSize} records, receipt ${verdict.receiptDigest?.slice(0, 12)}…` };
}
