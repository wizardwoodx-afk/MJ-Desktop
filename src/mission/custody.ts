/**
 * MJ 11.12.2 — Custody: Authority Envelopes with hierarchical delegation.
 *
 * The external 11.12.0 review asked: receipts are signed, but WHO authorized
 * the mission, and how does authority flow to sub-agents? 11.12.1 added
 * attenuated seat envelopes; 11.12.2 makes the chain first-class and signed:
 *
 *   principal (a human, never an agent)
 *     → root envelope (the runner's click, scoped + expiring)
 *       → seat envelopes (strict subsets, delegation chain recorded)
 *
 * Rules, mechanically enforced by checkEnvelope:
 *   - the principal of every envelope traces to a human;
 *   - attenuation may only SHRINK scope (subset rule), never grow it;
 *   - a child envelope cannot outlive its parent;
 *   - expired or revoked envelopes refuse every action;
 *   - an action outside scope is architecturally unable to execute.
 *
 * Envelopes are signed (SHA-256 digest + Ed25519 where available) exactly like
 * receipts and packets, so the delegation chain survives an audit.
 */
import { sha256Hex } from "./learningReceipt";
import { signHexDigest, verifyIssuerSignature, signingSupported } from "./signing";

export interface AuthorityEnvelope {
  format: "mj-envelope/1";
  id: string;
  /** ultimate authority: a human identifier, never an agent */
  principal: string;
  /** [principal, agent1, agent2, ...] — every hop this authority passed through */
  delegationChain: string[];
  /** exact permitted action/resource patterns; children must be subsets */
  scope: string[];
  issuedAt: number;
  expiresAt: number | null;
  /** 11.13.0 — spend authority: hard USD cap this chain may charge; null = uncapped */
  budgetUsd: number | null;
  revoked: string | null;
  parentId: string | null;
  digest: string;
  signature?: { sigHex: string; publicKeyHex: string };
  signatureNote?: string;
}

/**
 * MJ 11.12.3 — the human-principal invariant, made mechanical.
 * The 11.12.2 review was right: commenting "the principal is a human" is not
 * enforcement. The format IS the policy: a root principal must be a
 * `human:<id>` identifier. Anything else (agent:foo, empty, "HUMAN:x", ids
 * with whitespace) is refused before an envelope is ever signed.
 */
export const HUMAN_PRINCIPAL_RE = /^human:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export function isHumanPrincipal(p: string): boolean {
  return HUMAN_PRINCIPAL_RE.test(p);
}

export function canonicalEnvelopeInput(e: Omit<AuthorityEnvelope, "digest" | "signature" | "signatureNote">): string {
  return JSON.stringify([e.format, e.id, e.principal, e.delegationChain, e.scope, e.issuedAt, e.expiresAt, e.budgetUsd, e.revoked, e.parentId]);
}

let seq = 0;

async function seal(base: Omit<AuthorityEnvelope, "digest" | "signature" | "signatureNote">): Promise<AuthorityEnvelope> {
  const digest = await sha256Hex(canonicalEnvelopeInput(base));
  const env: AuthorityEnvelope = { ...base, digest };
  if (signingSupported()) {
    const sig = await signHexDigest(digest);
    if (sig) env.signature = sig;
    else env.signatureNote = "Ed25519 unavailable in this runtime; envelope unsigned.";
  } else {
    env.signatureNote = "Ed25519 unavailable in this runtime; envelope unsigned.";
  }
  return env;
}

/** Root envelope: issued to the runner by a HUMAN principal (the button press). */
export async function issueRootEnvelope(args: { principal: string; scope: string[]; expiresAt: number | null; budgetUsd?: number | null; now?: number }): Promise<AuthorityEnvelope> {
  if (!isHumanPrincipal(args.principal)) {
    throw new Error(`custody: root principal "${args.principal}" is not a human principal — the root of every delegation chain must match human:<id>. Refused; nothing was signed.`);
  }
  const now = args.now ?? Date.now();
  const budget = args.budgetUsd ?? null;
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
    throw new Error(`custody: budget cap must be a finite non-negative USD amount — refused ${String(budget)}`);
  }
  seq += 1;
  return seal({
    format: "mj-envelope/1",
    id: `env-${now.toString(36)}-${seq}`,
    principal: args.principal,
    delegationChain: [args.principal],
    scope: args.scope,
    issuedAt: now,
    expiresAt: args.expiresAt,
    budgetUsd: budget,
    revoked: null,
    parentId: null,
  });
}

/**
 * Attenuation: a child envelope for a sub-agent. Scope must be a strict subset
 * of the parent's, expiry cannot outlive the parent, principal is inherited.
 * Returns null (and why) instead of ever granting a wider scope.
 */
export async function attenuate(parent: AuthorityEnvelope, agentId: string, subScope: string[], opts?: { expiresAt?: number | null; budgetUsd?: number | null; now?: number }): Promise<{ envelope: AuthorityEnvelope | null; reason: string }> {
  if (!isHumanPrincipal(parent.principal)) {
    return { envelope: null, reason: `custody: parent envelope principal "${parent.principal}" is not human-format — attenuation is refused rather than delegated from an illegitimate root` };
  }
  const now = opts?.now ?? Date.now();
  const notInParent = subScope.filter((s) => !parent.scope.includes(s));
  if (notInParent.length > 0) {
    return { envelope: null, reason: `attenuation refused: scope would GROW by [${notInParent.join(", ")}] — a sub-agent never exceeds its parent` };
  }
  const expiry = opts?.expiresAt ?? parent.expiresAt;
  if (parent.expiresAt !== null && (expiry === null || expiry > parent.expiresAt)) {
    return { envelope: null, reason: "attenuation refused: child expiry outlives the parent envelope" };
  }
  // 11.13.0 — spend authority attenuates too: a child may tighten the cap, never loosen it.
  const requestedBudget = opts?.budgetUsd ?? null;
  const budget = requestedBudget === null ? parent.budgetUsd
    : parent.budgetUsd !== null && requestedBudget > parent.budgetUsd ? null
    : requestedBudget;
  if (requestedBudget !== null && parent.budgetUsd !== null && requestedBudget > parent.budgetUsd) {
    return { envelope: null, reason: `attenuation refused: child budget $${requestedBudget} exceeds the parent's $${parent.budgetUsd} cap — spend authority never grows` };
  }
  seq += 1;
  const envelope = await seal({
    budgetUsd: budget,
    format: "mj-envelope/1",
    id: `env-${now.toString(36)}-${seq}`,
    principal: parent.principal,
    delegationChain: [...parent.delegationChain, agentId],
    scope: subScope,
    issuedAt: now,
    expiresAt: expiry,
    revoked: null,
    parentId: parent.id,
  });
  return { envelope, reason: `attenuated from ${parent.id}; chain ${envelope.delegationChain.join(" -> ")}` };
}

export function revoke(e: AuthorityEnvelope, reason: string): AuthorityEnvelope {
  return { ...e, revoked: reason };
}

/** The mechanical scope/expiry/revocation check, evaluated on every action. */
/**
 * MJ 11.13.0 — spend authority, enforced. A chain with a budget cap may not
 * charge beyond it; uncapped chains (budgetUsd === null) report no limit.
 * `budgetCheck` is deliberately separate from scope checks so reports can say
 * exactly which authority stopped the spend.
 */
export function budgetCheck(e: AuthorityEnvelope, spentUsd: number): { ok: boolean; reason: string; remainingUsd: number | null } {
  if (e.budgetUsd === null) return { ok: true, reason: "uncapped", remainingUsd: null };
  const remaining = e.budgetUsd - spentUsd;
  if (spentUsd >= e.budgetUsd) {
    return { ok: false, reason: `spend authority exhausted — $${spentUsd.toFixed(4)} spent against a $${e.budgetUsd.toFixed(2)} cap`, remainingUsd: Math.max(0, remaining) };
  }
  return { ok: true, reason: "within budget", remainingUsd: remaining };
}

export function checkEnvelope(e: AuthorityEnvelope | null, action: string, now: number): { ok: boolean; reason: string } {
  if (!e) return { ok: false, reason: "no authority envelope — nothing executes without traced authority" };
  if (e.revoked) return { ok: false, reason: `envelope ${e.id} revoked: ${e.revoked}` };
  if (e.expiresAt !== null && now > e.expiresAt) return { ok: false, reason: `envelope ${e.id} expired — authority is void` };
  if (!e.scope.includes(action)) return { ok: false, reason: `action "${action}" outside envelope scope [${e.scope.join(", ")}]` };
  return { ok: true, reason: `envelope ${e.id} permits "${action}" (principal ${e.principal})` };
}

export async function verifyEnvelope(e: AuthorityEnvelope): Promise<{ ok: boolean; reason?: string }> {
  if (!isHumanPrincipal(e.principal)) {
    return { ok: false, reason: `principal "${e.principal}" is not human-format — every chain must root in a human` };
  }
  const { digest, signature, signatureNote, ...rest } = e;
  void signatureNote;
  const recomputed = await sha256Hex(canonicalEnvelopeInput(rest));
  if (recomputed !== digest) return { ok: false, reason: "digest mismatch — envelope was altered" };
  if (e.signature) {
    const good = await verifyIssuerSignature(digest, e.signature.sigHex, e.signature.publicKeyHex);
    if (!good) return { ok: false, reason: "signature does not verify" };
  }
  return { ok: true };
}
