# VARKHA × MJ 11.12.0 — compatibility audit

Verdict up front: **yes — and it fits MJ better than MOSAIC-Ω did.** Varkha is
organized around *authority*, and authority is the language MJ already speaks:
scoped envelopes ≈ capability ledger + gate policy + action packets; typed
memory ≈ the four separate stores MJ already keeps; Forge-through-Custody ≈ the
11.11.1 experiment where self-modification is only adopted under measured,
human-approvable rules. Where MOSAIC-Ω asked MJ to add reasoning machinery,
Varkha mostly asks MJ to *formalize and bind* machinery it already has. Four
extracts are worth shipping (11.12.1); nothing in Varkha should replace MJ's
attribution-based experiment with a confidence-threshold router.

Audit basis: MJ-DESKTOP @ 4666a85 (11.12.0), gates green (tsc 0 · 61/61 live ·
60/60 offline · vite clean, Node v22.23.2).

## Plane-by-plane map

| Varkha | Status in MJ 11.12.0 | Where | Gap / extract |
|---|---|---|---|
| **Custody — principal & delegation chain** | Partial | receipts name the issuing runtime; fleet records seat→harness; human override is recorded in Mission Control | envelopes don't yet carry an explicit principal id + hop chain; sub-seat authority isn't derived as an attenuation of the runner's envelope |
| **Custody — scope** | **Present, enforced** | `CapLedger` refuses spend; `GatePolicy` STRICT; worktree isolation; 11.12 `packetAllowsExecution` aborts before any invocation | scope is per-run, not per-delegation-hop — attenuation rule is the missing piece |
| **Custody — reversibility tier** | **Present** | actionPacket.reversible + permission rule; merge gate = irreversible actions need human "allowed" | nothing material |
| **Custody — expiry & revocation** | Partial | budget caps act as condition-expiry | no time/condition expiry on a run's envelope; no mid-run revocation hook (runner can only wait) |
| **Custody — audit sink** | **Present, strong** | SHA-256 hash-chained receipts, Ed25519 signatures, learning receipts, BUILD-INFO provenance | nothing material — this is MJ's home turf |
| **Ledger — STANCE (working memory)** | Present | per-run briefing context, session store, onTurn heartbeats; never retrieved, just loaded | correct by construction |
| **Ledger — PRECEDENT (episodic)** | Present | lessons memory carries mission→outcome chains with evidence | separation from failure memory already exists (kind=failure vs success), but retrieval order doesn't force failures first |
| **Ledger — DOCTRINE (semantic)** | Present | LEARNED_INVARIANTS (globalMemoryCortex), gate policy, house rules | write-permission asymmetry not formalized (user-stated vs agent-inferred) |
| **Ledger — RECOURSE (procedural)** | Present | strategy archive + approved learned skills + evolve engine | nothing material |
| **Ledger — SCAR (failure memory)** | **Partial → extract** | failure lessons exist but are queried mixed with successes | implement SCAR-before-PRECEDENT ordering in briefing composition |
| **Ledger — write asymmetry** | Missing → extract | — | tag beliefs/lessons `user-stated` vs `agent-inferred`; inferred-about-user writes require stricter permission (human approval) |
| **Current (fast loop)** | Present | seat harness ReAct loops; MJ orchestrates, doesn't fake | nothing material |
| **Chamber escalation conditions** | Partial | irreversibility already escalates (packet rule + merge gate); step-repetition detection missing; belief-confidence threshold missing (belief store now exists, so it's buildable) | extract: repetition + SCAR-shape conditions |
| **Chamber — STAKE/FRAME/WEIGH** | Present | adversarial gate names failure conditions pre-run; 11.12 belief store = FRAME; SELECT machinery (gateCandidate, UCB, margins) = WEIGH | nothing material |
| **Chamber — BRANCH guardrail** | **Present in spirit, formalize it** | teams run parallel seats, but every seat gets an explicit `SeatAssignment` (written spec: role, harness, mayWrite, wave) and its own worktree — MJ already satisfies "written spec per branch"; envelopes per seat are implicit (mayWrite + ledger) | make attenuation explicit: seat scope = intersection(team envelope, seat spec) |
| **Chamber — REHEARSE ordering** | Present | simulation only where cheap and labelled; predictions quarantined (R1) | nothing material |
| **Chamber — AUDIT then CONTEST** | **Present, exact order** | gate verdict (did it verify?) first, adversarial different-harness review after | Varkha's ordering is literally MJ's 11.10 gate design |
| **Forge — bounded self-improvement** | **Present, stronger than Varkha asks** | 11.11.1/11.12 experiment: self-modification adopted only on attributed measured runs + strict margin; skills need human approval; Forge-can't-touch-Custody ≈ experiment can't change gate policy or ledger caps | the one Varkha idea MJ lacks: Forge proposals should also pass the *custody* check (human-approvable surface) — skills already do; strategy adoption could surface in Mission Control |

## What Varkha gets right that MJ should adopt now (11.12.1 extract)

1. **SCAR-before-PRECEDENT.** One-line ordering change in briefing composition:
   failure lessons matching the goal are retrieved FIRST, then successes. Cheap,
   measurable, and it corrects the optimism bias Varkha names.
2. **Write asymmetry.** `belief.isPrediction` already quarantines predictions;
   extend the tag to `provenance: "user-stated" | "agent-inferred"` and require
   human approval for agent-inferred beliefs ABOUT THE USER before they enter
   briefings. Small, high-trust-value.
3. **Envelope attenuation for seats.** Record on each SeatRecord the derived
   scope (`mayWrite`, budget slice, allowed paths`) as an attenuated sub-envelope
   of the run's packet — making explicit what worktrees already enforce.
4. **Step-repetition escalation signal.** Count identical consecutive seat
   states in onTurn heartbeats; feed it into the autonomy store as an escalation
   signal (SUGGEST mode first — never auto-escalate on it).

## What MJ should NOT adopt

- **Confidence-threshold escalation as the router.** MJ routes on measured
   attribution (which strategy governed the run), not on self-reported
   confidence. Varkha's "confidence fell below threshold" is exactly the kind of
   unmeasured signal MJ's honesty rule distrusts. Keep authority-as-router
   (reversibility/scope — mechanical facts), drop confidence-as-router.
- **Five-plane concurrency as a rebuild.** MJ's three clocks already map to
   Current/Chamber+Ledger/Forge. Rebranding adds vocabulary, not capability.
   (The vocabulary is Varkha's real IP — trademark it separately; MJ keeps its
   evidence-first names.)

## Honesty notes on Varkha's claims

- MAST percentages (42/37/21, 15.7% step repetition, "79% of production
  breakdowns") are cited as precise figures; treat them as directional until the
  primary traces are checked — MJ would never ship such numbers in a receipt
  without the evidence attached.
- IMDA/NIST 2026 initiatives align with MJ's existing direction (identity,
  audit trail, authorization) — MJ's receipts + envelopes are a credible answer
  to them, worth naming in the compliance crosswalk (the Evidence Pack already
  maps EU AI Act / ISO 42001 / SOC 2).

## Bottom line

Varkha helps MJ build the *governance* half of the next release: attenuation,
write asymmetry, SCAR-first ordering, repetition signal — all small, all
provable, all in MJ's voice. The reasoning-plane ideas add nothing MJ lacks.
Ship the four extracts as 11.12.1, pinned by probes, measured by the experiment.
