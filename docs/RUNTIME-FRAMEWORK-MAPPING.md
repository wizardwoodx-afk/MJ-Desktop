# Vouch Harbor — Runtime Framework Mapping

*16.6.0 — the external runtime framework spec (51 sections) mapped to the
shipped product (decided at 16.5.0, committed with the 16.6.0 hardening
release). One narrative rule: every framework claim must point at code and a
probe, or be labeled PARKED. This document is that map.*

**Adoption stance (decision, 16.5.0):** the framework is adopted as the
internal **design constitution and roadmap spine** — NOT as the definition
of the product. The product remains the shipped, verifiable artifact.
Nothing in the framework is "done" unless a row below says SHIPPED with
evidence. The five primitives (capability / contract / state / workflow /
evidence) and the ten invariants are the design language; the ten invariants
are treated as acceptance criteria for future builds.

**Status legend:** SHIPPED (code + probe exist) · PARTIAL (real mechanism,
named gaps) · NEW (planned build, sequenced) · PARKED (research/data
prerequisite not met — labeled, not promised).

## A. Control plane (capability, authority, policy)

| Framework | Status | Evidence / gap |
|---|---|---|
| §19 Capability system, authority before action (Inv 1) | SHIPPED | risky-tool classification + human gate on every risky action (`vouch.ts` `RISKY_TOOLS`, `runVouchToolCall`); MCP capability gating `-32021` (16.5, `mcpRouter.ts`); probes `vouch`, `mcpRouter` |
| §19 Capability delegation child ⊆ parent | PARKED | single-product, no multi-tenant actors; revisit with the tenant model |
| §5–§12 Policy Pack system (signed, versioned, composable, conformance) | **NEW — next major release** | the one big real gap; built on the existing Ed25519 issuer + hashing; conformance = the drill pattern |
| §7 Safety monotonicity (Inv 6), policy-weakening refused (Inv 10) | SHIPPED (control plane) | M6 meta loop: tighten-only, loosening refused in words, revert-gated (`meta.ts`, `probe/metaLoop`) — exactly these invariants, in-product |
| §9 Policy snapshot per task (Inv 7) | PARTIAL | receipts pin product version + gate state; the effective *policy* snapshot (pack refs + hash) lands with the pack system |
| §10–§11 Policy compiler + activation gates | NEW | with the pack system: signature → deps → schema → conformance → monotonicity → conflict → hash → activate, else quarantine |
| §25 Consequence engine (risk → autonomy/verification/human) | PARTIAL | risk tiers drive gate + simulation + arena; the multidimensional model (reversibility, blast radius, uncertainty) is implicit in the gate copy, not a typed artifact |
| §27 Human gates as durable state | SHIPPED | non-blocking pending approvals, resolvable from UI or MCP, pollable (`call_status`/`tasks/get`); probes `vouch`, `mcpRouter` (both eras) |

## B. Execution plane (state, workflow, arena)

| Framework | Status | Evidence / gap |
|---|---|---|
| §48/§49 Durable state, ledger = what happened + known + allowed + policy | PARTIAL | mission-loop ledger, unified mission ledger, receipt vault persist and rehydrate (`missionLoop.ts` state store); in-flight seat work across a process crash is NOT reconstructed — labeled gap |
| §13 Durable workflows (wait/sleep/resume/retry/delegate) | PARTIAL | retry/abort + persisted loop state + drill forensics kept; `delegate` and cross-process resume are the gaps |
| §18 Contract fabric | PARTIAL | action packets + cycle records + gate/arena outcomes are the contract substrate; a unified contract artifact (objective/acceptance/recovery as one object) is NEW |
| §23 Arena (parallel candidates, policy-enabled, disagreement = information) | PARTIAL | governance arena (adversarial, cross-vendor) gates every verified cycle (`arenaGate.ts`); multi-candidate selection + disagreement signals are NEW |
| §24 Verification membrane V0–V4 | PARTIAL | V0 structural (schema/type checks), V1 semantic (reviewer seats, test gates), V2 independent (cross-vendor arena, the drill's real test command), V3 adversarial (arena), V4 human (gate) — the tiers exist in fact, not as a policy-selected artifact |
| §26 Recovery engine, typed failures (Inv 9) | PARTIAL | retry/abort, failure memory, loop error notes; a structured typed-failure artifact (`code/layer/cause/recovery`) is NEW |
| §15 Durable side effects (idempotency, reconciliation, compensation) | PARTIAL | git worktrees give rollback for code; external side-effect idempotency keys are NOT claimed or built — the framework's own honest wording ("not exactly-once") is adopted |
| §16 Triggers (schedule/webhook/delegation) | NEW (small) | today: chat, MCP, UI; scheduled/webhook triggers are cheap and governance-free-to-add (same path) |
| §45 Resource scheduler | PARKED | budget ledger (USD) + crew sizing exist; token/CPU/queue scheduling waits on the multi-tenant model |

## C. Assurance plane (measurement, calibration, scorecards)

| Framework | Status | Evidence / gap |
|---|---|---|
| §32 Signed execution receipt | SHIPPED (ahead of spec) | `vh-proof-receipt/2` + mission records + verifier CLI: chain + seal + issuer, offline-verifiable with zero product state (`proof.ts`, `missionRecord.ts`, probes `vouch`, `missionRecord`, `receipts`) |
| §31 Evidence contract per task | SHIPPED | receipts carry session/route/simulate/gate/verdict events; evidence packs + dossiers + AIBOM export the lineage |
| §30 Simulation ≠ measurement ≠ assurance (Inv) | SHIPPED | SIMULATE vouches a *prediction*; verdicts are `matched/diverged` vs real verification; drill's `impossible` scenario tests the rule (`probe/drill`) |
| §33 Assurance plane (did it work, where did it fail, is it improving) | PARTIAL | Assurance Score, drill (standing self-test), skill replay gates, failure memory; the continuous *measurement* layer is the NEW build |
| §37 Benchmark integrity (shortcut correlation, leakage, perturbation → quarantine) | NEW (small) | applies to the drill + skill-replay suites; the drill is the natural home — three executable checks, failure quarantines the benchmark |
| §38 Label provenance / anti-circular evaluation | NEW (small) | label source + confidence + reviewer on every drill/skill outcome; cheap, closes a real hole |
| §34 Trajectory fault attribution | PARTIAL → NEW data capture | loop records already carry per-seat outcomes + notes; fault-step/detection-gap fields are NEW data capture — claims held until data exists |
| §35 Calibrated abstention | PARKED | needs outcome volume a local-first product doesn't have; data fields land first |
| §36 Memory assurance (recall accuracy + fabrication resistance) | PARKED (as a guarantee) | memory is inspectable/deletable vouched facts; probe-based measurement is future work, not a current claim |
| §39 Arena disagreement as uncertainty signal | NEW | with multi-candidate arena |
| §40 Scorecard per task | NEW (cheap) | raw material exists (mission record + assurance score + FinOps); one unified artifact per task |

## D. Security

| Framework | Status | Evidence / gap |
|---|---|---|
| §28 Tool trust (discoverable ≠ authorized ≠ trusted ≠ executable) | PARTIAL | harness registry with verified-binary claims + AIBOM; signed tool manifests are NEW |
| §29 Adversarial execution (base + policy + mission attack suite) | PARTIAL | arena adversarial + injection checks in probes; policy-supplied scenarios arrive with packs |
| §21 Data governance (typed policies: redact/block/require-local) | PARTIAL | egress gating with an audit trail (`egress.ts`); typed redaction/classifier policies are NEW |
| MCP authorization hardening (2026-07-28) | SHIPPED (stdio scope) | dual-era router, `-32021`/`-32022`, capability-gated Tasks; HTTP-specific auth (RFC 9207/CIMD) out of transport scope — labeled |

## E. Improvement loop

| Framework | Status | Evidence / gap |
|---|---|---|
| §41 Controlled improvement (propose → offline eval → conformance → canary → promote; never silently optimize authority) | SHIPPED (control plane) + NEW (canary) | M6 meta loop (gated, vouched, reversible, tighten-only) + M4 learning bridge (replay-gated skills); canary promotion is the NEW piece |

## Sequencing (what "NEW" means, in order)

1. **Policy Pack spine** (next major): signed pack format, deterministic
   compiler (stricter-wins; conflict → compile failure → quarantine, never
   guess), monotonicity check, conformance suite as a drill, effective-policy
   snapshot hashed into every receipt. Built on the existing issuer key.
2. **Assurance data + integrity** (small release): fault-step/detection-gap/
   label-provenance fields; the three benchmark-integrity checks on the drill
   suite; the unified task scorecard.
3. **Structured failures + triggers** (small): typed failure artifact;
   scheduled/webhook triggers through the same governed path.
4. **Arena upgrade**: multi-candidate under one contract + disagreement
   signal as an uncertainty input to verification tier.

**Parked, labeled** (prerequisite not met; not promised): calibrated
abstention, memory-assurance-as-guarantee, capability delegation/tenants,
resource scheduler, persistent agent identity across missions.

**The guarantee we keep** (§47 of the framework, adopted verbatim as product
posture): *Failure is expected; silent, unbounded, untraceable failure is
not.*
