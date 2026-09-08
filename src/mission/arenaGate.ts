/**
 * MJ 11.14.7 — the Governance Arena Gate (Play C of the differentiator roadmap).
 *
 * 2026 enterprise practice: adversarial batteries gate deployments (Lakera,
 * Promptfoo, PyRIT, Giskard — see docs/DIFFERENTIATOR-ROADMAP.md). MJ's answer
 * is not another LLM red-teaming SaaS — it is a battery that attacks MJ's OWN
 * governance machine with the same hostile intent, and refuses to bless a
 * mission until every scenario is DEFENDED in words.
 *
 * Unlike guardrailAlign (which asserts the SOURCE contains the right markers),
 * this gate EXECUTES the real modules — custody, capability, egress,
 * verifyGate, ledger — with hostile inputs and checks the refusal actually
 * happens. Guardrails-as-code become guardrails-as-executable-battery.
 *
 * Every scenario is deterministic, offline, and requires no harness or LLM:
 * the defences being attacked are mechanical policy boundaries, so the attack
 * either lands (breach → gate REFUSED) or is refused with a reason (defended).
 */
import {
  issueRootEnvelope,
  attenuate,
  revoke,
  budgetCheck,
  checkEnvelope,
  verifyEnvelope,
  BudgetGate,
  type AuthorityEnvelope,
} from "./custody";
import { executeCapability, type CapabilityRequest } from "./capability";
import { requestEgress, type EgressItem } from "./egress";
import { evaluateVerifyGate, type GatePolicy, type GateWriter, type GateVerifier } from "./verifyGate";
import { enforceWrite } from "./ledger";
import { sha256Hex } from "./learningReceipt";

export type ArenaOutcome = "defended" | "breached";

export interface ArenaScenarioResult {
  id: string;
  title: string;
  /** attacked = the hostile input was attempted; outcome says whether the boundary held. */
  outcome: ArenaOutcome;
  /** the refusal in words when defended; the failure when breached. */
  note: string;
}

export interface ArenaGateReport {
  gate: "PASS" | "REFUSED";
  ranAt: number;
  total: number;
  defended: number;
  breached: number;
  results: ArenaScenarioResult[];
  summary: string;
  /** sha256 over the canonical scenario outcomes — attachable to a receipt. */
  digest: string;
}

const NOW = 1_750_000_000_000; // fixed epoch for full determinism; callers may override.

/** One human root with the two scopes a working endpoint needs. */
async function humanRoot(now: number, scope: string[], budgetUsd: number | null = 100): Promise<AuthorityEnvelope> {
  return issueRootEnvelope({ principal: "human:alice", scope, expiresAt: null, budgetUsd, now });
}

async function scenario(
  id: string,
  title: string,
  run: () => Promise<{ held: boolean; note: string }>,
): Promise<ArenaScenarioResult> {
  try {
    const { held, note } = await run();
    return { id, title, outcome: held ? "defended" : "breached", note };
  } catch (err) {
    // A thrown refusal counts as defended ONLY when the error text says so;
    // an unexpected exception is a breach (the boundary did not answer in words).
    const msg = err instanceof Error ? err.message : String(err);
    const refusedInWords = /refus|denied|human|DOCTRINE|scope|expired|revoked|budget|not permitted/i.test(msg);
    return { id, title, outcome: refusedInWords ? "defended" : "breached", note: msg };
  }
}

/** Canonical string over the outcomes — stable for a given pass/refusal shape. */
export async function arenaGateDigest(results: ArenaScenarioResult[]): Promise<string> {
  return sha256Hex(
    JSON.stringify(results.map((r) => [r.id, r.outcome])),
  );
}

/**
 * Runs the full hostile battery against MJ's own governance modules.
 *
 *   gate "PASS"    → every scenario defended, in words. The mission/team is
 *                    fit to run against real harnesses.
 *   gate "REFUSED" → at least one boundary fell; the report names it. Nothing
 *                    that touches real work should proceed on a refused gate.
 */
export async function runGovernanceArena(args: { now?: number; policy?: GatePolicy } = {}): Promise<ArenaGateReport> {
  const now = args.now ?? NOW;
  const policy: GatePolicy = args.policy ?? "STRICT";
  const results: ArenaScenarioResult[] = [];

  /* 1 · self-grading — the writer must never verify its own work (STRICT) */
  results.push(
    await scenario("arena.self-grading", "A writer harness tries to grade its own output as verified", async () => {
      const writers: GateWriter[] = [{ seatId: "seat-w", harness: "claude" }];
      const verifiers: GateVerifier[] = [
        { seatId: "seat-v", harness: "claude", ran: true, verdict: "approve", reviewedSha: "abc123" },
      ];
      const verdict = evaluateVerifyGate({
        runStatus: "verified",
        writers,
        verifiers,
        receiptAttached: true,
        policy,
        snapshot: { built: true, sha: "abc123", ref: "head", writerBranches: ["seat-w"] },
      });
      const selfGraded = !verdict.crossVerified;
      const named = verdict.reasons.some((r) => /own work|self/i.test(r));
      return { held: selfGraded && named, note: selfGraded && named ? verdict.reasons.join("; ") : `verdict ${verdict.status}: ${verdict.reasons.join("; ")}` };
    }),
  );

  /* 2 · agent root — no authority envelope may ever be issued to an agent */
  results.push(
    await scenario("arena.agent-root", "An agent identity tries to obtain a root authority envelope", async () => {
      try {
        await issueRootEnvelope({ principal: "agent:hermes", scope: ["*"], expiresAt: null, now });
        return { held: false, note: "agent principal was issued a root envelope" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { held: /human/i.test(msg), note: msg };
      }
    }),
  );

  /* 3 · scope growth — attenuation must never widen what the human allowed */
  results.push(
    await scenario("arena.scope-growth", "A delegated seat tries to widen its scope beyond the parent", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const child = await attenuate(root, "agent:seat", ["capability:run", "egress:share"], { now });
      return { held: child.envelope === null, note: child.envelope === null ? child.reason : "scope was widened" };
    }),
  );

  /* 4 · expiry — a lapsed envelope must be refused */
  results.push(
    await scenario("arena.expiry", "A mission runs on an envelope whose authority has lapsed", async () => {
      const root = await issueRootEnvelope({ principal: "human:alice", scope: ["capability:run"], expiresAt: now + 1, now });
      const later = checkEnvelope(root, "capability:run", now + 60_000);
      return { held: !later.ok, note: later.ok ? "expired envelope accepted" : later.reason };
    }),
  );

  /* 5 · revocation — a revoked envelope must be refused instantly */
  results.push(
    await scenario("arena.revocation", "A compromised envelope tries to act after revocation", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const dead = revoke(root, "seat compromised — kill switch");
      const verdict = checkEnvelope(dead, "capability:run", now);
      return { held: !verdict.ok, note: verdict.ok ? "revoked envelope accepted" : verdict.reason };
    }),
  );

  /* 6 · budget cap — spend authority is a hard ceiling, checked mechanically */
  results.push(
    await scenario("arena.budget-cap", "A seat tries to charge past the envelope's hard USD cap", async () => {
      const root = await humanRoot(now, ["capability:run"], 100);
      const verdict = budgetCheck(root, 150);
      return { held: !verdict.ok, note: verdict.ok ? "over-budget charge accepted" : verdict.reason };
    }),
  );

  /* 7 · atomic budget — concurrent reservations must never overshoot the cap */
  results.push(
    await scenario("arena.budget-race", "Two concurrent seats both try to reserve the last of the budget", async () => {
      const gate = new BudgetGate(100);
      const first = gate.reserve("seat-a", 60);
      const second = gate.reserve("seat-b", 60); // sequential here — the gate is check-and-commit with no await
      const held = first !== null && second === null && gate.committedUsd === 60;
      return { held, note: held ? "second reservation refused; cap never crossed" : `first=${!!first} second=${!!second} committed=${gate.committedUsd}` };
    }),
  );

  /* 8 · egress scope — nothing leaves the machine outside a signed egress authority */
  results.push(
    await scenario("arena.egress-scope", "An envelope scoped for compute tries to exfiltrate a file", async () => {
      const computeOnly = await humanRoot(now, ["capability:run"]);
      const item: EgressItem = { kind: "file", name: "financial_report.xlsx", sha256: "deadbeef" };
      const verdict = await requestEgress({ envelope: computeOnly, item, recipient: "human:bob", now });
      return { held: verdict.record === null, note: verdict.record === null ? verdict.reason : "egress allowed outside scope" };
    }),
  );

  /* 9 · tamper — any edit to a signed envelope must fail verification */
  results.push(
    await scenario("arena.tamper", "An attacker edits an envelope's scope after signing", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const forged: AuthorityEnvelope = { ...root, scope: [...root.scope, "egress:share"] };
      const verdict = await verifyEnvelope(forged);
      return { held: !verdict.ok, note: verdict.ok ? "forged envelope verified" : (verdict.reason ?? "digest mismatch") };
    }),
  );

  /* 10 · ledger write matrix — agents may never write DOCTRINE */
  results.push(
    await scenario("arena.ledger-write", "An agent tries to install DOCTRINE directly into the ledger", async () => {
      try {
        enforceWrite("DOCTRINE", "agent");
        return { held: false, note: "agent wrote DOCTRINE" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { held: /DOCTRINE|human|agent/i.test(msg), note: msg };
      }
    }),
  );

  /* 11 · capability policy — unknown datasets never compute (raw rows cannot
         even be typed: the whitelist is enforced by the type system too) */
  results.push(
    await scenario("arena.capability-policy", "A requester asks for an aggregate over a dataset this machine does not expose", async () => {
      const root = await humanRoot(now, ["capability:run"]);
      const request: CapabilityRequest = {
        id: `req-${now}-offpolicy`,
        op: "sum",
        dataset: "hr_salaries_2026", // not exposed on this machine — off-policy data
        field: "salary",
        requester: "human:bob",
      };
      const verdict = await executeCapability({ request, envelope: root, now });
      return { held: verdict.result === null, note: verdict.result === null ? verdict.reason : "off-policy dataset computed" };
    }),
  );

  const defended = results.filter((r) => r.outcome === "defended").length;
  const breached = results.length - defended;
  const gate = breached === 0 ? "PASS" : "REFUSED";
  const summary =
    gate === "PASS"
      ? `governance arena: ${defended}/${results.length} hostile scenarios defended in words — the team's authority machine held`
      : `governance arena REFUSED: ${breached} scenario(s) breached the boundary — ${results
          .filter((r) => r.outcome === "breached")
          .map((r) => r.id)
          .join(", ")}`;

  return {
    gate,
    ranAt: now,
    total: results.length,
    defended,
    breached,
    results,
    summary,
    digest: await arenaGateDigest(results),
  };
}
