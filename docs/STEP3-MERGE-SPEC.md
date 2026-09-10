# STEP 3 — MERGE SPEC: MJ × ROGUE → Vouch Harbor

**Status:** DRAFT-LOCKED (2026-09-10). Source: external architecture review (ChatGPT, 2026-09-10)
converged with the locked 4-step plan and the standing merge decisions.
**One-sentence thesis:**

> **MJ executes. ROGUE governs. Vouch proves. The system learns from verified outcomes.**

Everything in this spec supports that sentence. Everything that doesn't is out of scope.

---

## 1. The merge is ASYMMETRIC — control plane vs execution plane

Not a feature union. Not "MJ + ROGUE + 37 more features."

```
                    ROGUE CONTROL PLANE                  MJ EXECUTION PLANE
                    ───────────────────                  ──────────────────
  ROUTE (risk + complexity + confidence)          COMPOSE / PLAN (decompose objective)
  RECALL (memory OS, case + skill)                CREWS (agent delegation)
  THINK (verifiable LLM council)                  EXECUTE (25 harnesses, inter-agent bus)
  SIMULATE (SIGNED prediction)                    TOOLS (native / MCP)
  HUMAN GATE (approve / deny, OS notification)    BANDIT routing, retry, adapt
  ACT (→ MJ mission loop — the dispatch seam)
  VOUCH (prediction vs reality, Ed25519)
  LEARN (slow→fast distillation, test-gated)
  META-LOOP (gated, versioned, reversible self-release — LAST)
```

- **MJ is not weakened.** It keeps every capability (crews, harnesses, bus, routing, MCP).
- **ROGUE does not replace MJ's intelligence.** It governs it: forces every mission through
  the Vouch Cycle before, during, and after execution.
- **One product, one experience.** Internal planes are separated; the user never sees "two apps."
  Brand stays **Vouch Harbor** (locked). The review's "MJ — Powered by the Vouch Cycle" naming
  proposal is architecturally identical; the name decision stands.

## 2. The ONE-STATE LAW (non-negotiable)

The review's #1 warning is adopted as law:

```
NOT:  MJ memory + ROGUE memory · MJ receipts + ROGUE receipts · MJ missions + ROGUE missions
IS:   unified state · unified event bus · unified receipt chain
```

- **One mission ID** (`mission_8f31`) is minted at intake and rides the job end-to-end.
  Every event — from either plane — carries it.
- **One receipt chain: `mj-proof-receipt/2`.** This is not aspirational — it is *already true in
  code*: ROGUE 1.1.0's `src/engine/proof.ts` emits the format **byte-compatible with MJ's**,
  same header/version scheme, same zero-dep verifier (`tools/verify-receipt.mjs`), same
  VERIFY_SECRET family. The merge inherits one chain; there is no migration and no dual chain.
- The tamper demo works on the merged chain exactly as on either alone: flip 1 byte → chain broken.

### Unified event taxonomy (bus event → receipt event → plane)

| Phase | Bus event (carries mission ID) | Receipt event | Plane |
| --- | --- | --- | --- |
| Intake | `mission.created` | `rogue.session` | ROGUE |
| Route | `mission.routed` (risk, complexity, confidence) | verdict field | ROGUE |
| Plan | `plan.created` (steps, crews, integrations) | MJ plan event | MJ |
| Deliberate | `council.deliberation` (3 seats, 4-section synthesis) | `rogue.deliberation` | ROGUE |
| Simulate | `simulation.created` (signed prediction) | `rogue.simulation` | ROGUE |
| Gate | `human.approved` / `human.denied` | `rogue.verdict` (+OS notification native) | ROGUE |
| Execute | `crew.started` / `tool.called` / `tool.completed` / `agent.retry` / `agent.failure` | `rogue.action` (+ MJ events) | MJ |
| Vouch | `prediction.matched` (score) / `mission.completed` | `rogue.verdict` (predictionMatched, signature) | ROGUE |
| Learn | `skill.learned` (id, version, testGate) | `rogue.action` (+skill) | ROGUE |

Existing ROGUE receipt events (`rogue.session / .deliberation / .simulation / .action / .verdict`)
are retained; MJ events join the same chain under the shared mission ID.

## 3. Capability Router — every capability passes through Vouch

```
                MISSION (unified state)
                          │
                 Capability Router
                          │
      ┌───────────────────┼───────────────────┐
      │                   │                   │
  Native tools        MJ tools            MCP tools
  filesystem, shell,  crews, missions,    GitHub/Slack/SaaS,
  workspace           25 harnesses        specialized servers
      │                   │                   │
      └───────────────────┼───────────────────┘
                          ▼
   authorize → (risk-based) simulate → (gated) approve → call → verify → receipt
```

- ROGUE's existing gate generalizes: `RISKY_TOOLS` becomes **risk-tiered across all three
  classes**, and the ROUTE **confidence** score modulates gate strictness (high confidence +
  low risk = fast; either extreme = full gate).
- An MCP tool call is never `call → result`. It is `authorize → simulate → (approve) → call →
  verify → receipt`. Tracked against the 2026-07-28 MCP spec (stateless transport, Tasks,
  authorization hardening, caching, routing).

## 4. Learning loop — evidence-gated, across planes

```
MJ executes mission successfully
        ↓
ROGUE distills skill from the trajectory
        ↓
hidden / replay tests
   PASS → test-gated fast skill (future missions ROUTE straight to it)
   FAIL → failure memory + full-cycle fallback (skill flagged, both attempts vouched)
```

Already built in ROGUE 1.1.0 (distillation, replay failure → flag, slow→fast routing). The merge
adds exactly one new input: **MJ trajectories as distillation fuel.**

## 5. Seam inventory — what EXISTS vs what we BUILD

**Already built (zero merge work):**
- ✅ Byte-compatible `mj-proof-receipt/2` on BOTH sides + one verifier (ROGUE `proof.ts`).
- ✅ The dispatch seam: `rogue.ts` `dispatch_mission` → honest refusal
  ("The mission engine is not connected to this build…") — the exact plug point for MJ's loop.
- ✅ MJ mission loop (COMPOSE→DISPATCH→COMMUNICATE→EXECUTE→GATE→ADAPT, crews, 25 harnesses,
  inter-agent bus, bandit routing).
- ✅ ROGUE's full control cycle (route w/ confidence, council, signed simulation, gate, vouch,
  learn) — probe-pinned at 36/36.
- ✅ Tauri shell — one host for the unified product (native + web).

**To build (milestones, each probe-gated per MJ release discipline):**

| Milestone | Content | Probe gate |
| --- | --- | --- |
| **M1 — Mission bridge** | `dispatch_mission` → real MJ mission loop. Mission ID minted in ROGUE, passed to MJ; MJ events stream back on the unified bus under the same ID. | One receipt chain containing BOTH `rogue.*` and `mission.*` events; verifier green end-to-end. |
| **M2 — One state** | Unified store (single namespace per host; SQLite in the native shell), shared workspace. No dual memory, ever. | Zero cross-store drift: no mission exists in one store without the other. |
| **M3 — Capability router + MCP** | All three tool classes route through the Vouch-wrapped path; MCP server registration; per-call receipts. | An MCP tool call appears in the chain with prediction + verdict + signature. |
| **M4 — Learning bridge** | MJ trajectories → skill distillation → test-gated skills usable by both planes. | A skill learned from an MJ run fast-tracks a ROGUE re-run; replay failure flags it + falls back, both vouched. |
| **M5 — Unified UI** | One shell, one mission timeline: MISSION → ROUTE → PLAN → SIMULATION → GATE → EXECUTION (crew progress) → VOUCH (prediction vs reality) → PROOF (chain + signature) → LEARN. | UI renders the full merged timeline from a single chain; tamper demo on the merged chain. |
| **M6 — META-LOOP** (locked last) | Propose → independent evaluator (hidden tests, non-divergence) → owner approval → vouched, versioned, REVERSIBLE self-release. | Evaluator denial blocks release; rollback restores previous version; all steps in the chain. |

**Order note:** the 4-step plan stays locked — **Step 2 (MJ error fixes) precedes M1.** The merge
builds on a clean MJ base.

## 6. What we will NOT do

- No dual state / dual receipts / dual memories (the review's nightmare, prohibited by law).
- No feature bloat ("+37 features" is a regression, not a feature).
- No rebranding for the merge (Vouch Harbor / Vouch Harbor Labs / ROGUE / MJ / `vh` — locked).
- No self-release before M6; no ungated agent self-modification, ever.
- No faking: anything unimplemented is an honest refusal that lands in the receipt (the dispatch
  seam is the working example of this discipline).

## 7. Open decisions (need owner)

1. **MJ base:** merge on MJ **15.1.0** (current, all gates green: tsc 0, 82/82 probes, verify
   81/81) — confirm, or specify the Step-2 error list to fix first.
2. **MCP scope at M3:** which 2–3 external servers land first (proposal: GitHub, Slack, one
   SaaS the owner actually uses).

---
*This spec is the contract for Step 3. If implementation and this document drift, the document
gets updated in the same commit that changes the behavior — same discipline as the receipt chain.*
