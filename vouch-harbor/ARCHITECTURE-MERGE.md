# Vouch Harbor — merge architecture

How FLAMO (the agent) and MJ 14.1.3 (the assurance runtime) become one product,
and what is honestly true at each step.

## The one-sentence thesis

**FLAMO acts. MJ proves it. Vouch Harbor is the product where those are the same
motion.**

Every competitor in this category gives you an *activity log* — a list the
vendor wrote about itself. Vouch Harbor gives you a hash-chained, Ed25519-signed
receipt that a third party can verify **with zero vendor state**. That is a
different product, not a better log.

## What each side already is

| FLAMO | MJ 14.1.3 |
|---|---|
| The wheelhouse — one conversation surface | The engine room — 81 probe suites, five doors |
| The Vouch Cycle state machine | `missionLoop`, `custody`, `egress`, `receipts`, `signing` |
| Verdigris design system | 25 harnesses, harness argv policy |
| Routines / Tools / Ledger screens | Proof vault, audit, evidence packs, FinOps |

MJ's problem was never capability — it is that it presents **five products** and
asks the user to navigate them. FLAMO's problem is that it has no proof layer.
The merge solves both: **MJ stops being a place you go, and becomes a thing that
happens underneath FLAMO.**

## Target architecture

```
┌───────────────────────────────────────────────────────────┐
│  FLAMO shell (Tauri v2, native window, tray, autostart)   │
│  Thread · Routines · Tools · Ledger        ← the only UI  │
├───────────────────────────────────────────────────────────┤
│  Vouch Cycle engine                                       │
│  AUTHORITY → ROUTE → RECALL → PLAN → DELIBERATE           │
│    → SIMULATE → GATE → ACT⟲ → OBSERVE → VOUCH → LEARN     │
├───────────────────────────────────────────────────────────┤
│  MJ core (imported as a library, never as a screen)       │
│   AUTHORITY  ← custody.ts      human principal, scope can │
│                               only shrink, expiry enforced │
│   GATE       ← approvals.ts    BLOCKED is a real state,   │
│                               riskPolicy.requiresHuman()   │
│   ACT        ← harnessRunner   25 CLIs, argv policy,      │
│                               canary-proven sandbox        │
│   OBSERVE    ← checkRunner     exit-code-first, measured  │
│   VOUCH      ← receipts.ts     hash-chained, Ed25519,     │
│                               tools/verify-receipt.mjs     │
│   LEARN      ← lessons.ts      + retention, human-gated   │
│   everything ← egress.ts       digest-chained egress ledger│
├───────────────────────────────────────────────────────────┤
│  Host: SQLite · OS keychain · stdio child processes       │
└───────────────────────────────────────────────────────────┘
```

**Rule that keeps the merge honest:** FLAMO never renders MJ's screens. MJ's
Proof, Audit and System doors become *panels inside* FLAMO's Ledger and Tools
views, reading the same stores. One product, one navigation model.

## Stage → MJ module map (the actual wiring work)

| Cycle stage | MJ module | What has to change |
|---|---|---|
| AUTHORITY | `mission/custody.ts` | none — envelopes already require a human principal |
| ROUTE | `mission/missionPlanner.ts` | expose classification as a public call |
| RECALL | `mission/memory.ts` + `organizationalMemory.ts` | scope key comes from ROUTE (already mandatory by contract) |
| PLAN | `mission/missionPlanner.ts` | emit a typed plan FLAMO can render |
| DELIBERATE | `domain/templates.ts` Multi-agent Debate + `consensusEngine.ts` + `belief.ts` | **new**: the POV ladder as a typed gate; reuse proposer/critic/judge |
| SIMULATE | `mission/sandbox.ts` | **new**: predicted spend + failure modes from the sandbox wrapper |
| GATE | `mission/approvals.ts` + `riskPolicy.ts` | none — already a first-class BLOCKED state |
| ACT | `engine/harnessRunner.ts` + `mission/sessions.ts` | none — session continuity already proven |
| OBSERVE | `mission/checkRunner.ts` | none — measured-or-`unmeasured` already enforced |
| VOUCH | `mission/receipts.ts` + `signing.ts` + `receiptVault.ts` | chain FLAMO's cycle record into the existing hash chain |
| LEARN | `mission/lessons.ts` + `skillEvolution.ts` | none — retention and the human gate already exist |
| egress | `mission/egress.ts` | none — every export path already passes the gate |
| RECOVER | `mission/failureDetection.ts` + `supervisor.ts` | **new**: bounded retry/replan/escalate policy |

**Four modules are genuinely new** (DELIBERATE, SIMULATE, RECOVER, and the
FLAMO shell). Everything else is import-and-wire. That is the honest reason this
merge is weeks and not months.

## Sequencing

| Step | Deliverable | Verifiable how |
|---|---|---|
| 1 | FLAMO app, cycle as a real typed engine (not scripted demo) | probe suite + live UI |
| 2 | Real ACT: one harness, measured output, real session continuity | `realExecution`-style probe |
| 3 | AUTHORITY + GATE wired to `custody.ts` / `approvals.ts` | probe: expired envelope refuses |
| 4 | VOUCH: cycle record chained into MJ's hash chain | `tools/verify-receipt.mjs` on a FLAMO cycle |
| 5 | Ledger screen reads the real receipt vault | probe + UI |
| 6 | Tauri shell: native window, tray, autostart | `cargo check` + a real native build |
| 7 | Routines: a real scheduler (MJ ships none — `cap.cron` refuses) | probe: cron parses, skips when busy |

## Known gaps carried into the merge — stated, not hidden

1. **No scheduler exists in MJ.** `cap.cron` is a declaration that now *refuses*
   rather than silently succeeding (14.1.3). Routines need one written.
2. **No browser service.** `mj-browser` is external and not in the tree; the
   agent-browser surface is unavailable on a fresh checkout.
3. **No Rust toolchain in the build sandbox.** The Tauri shell compiles on a
   developer machine or in CI, not here.
4. **Computer-use reliability.** Frontier scores cleared the human baseline on
   OSWorld (83.6% verified vs 72.4%) but the harder OSWorld 2.0 dropped the
   frontier to 20.6%. Design consequence: FLAMO gates irreversible actions and
   vouches what it measured — it does not claim open-ended autonomy.

## What the assembled archive actually contains

`VouchHarbor-assembly/` ships **both trees plus this document** and a single
entry point. It is an **integration scaffold, not a finished merge**: the wiring
in the table above is specified and sequenced, not yet executed. Anyone reading
the archive should be able to tell immediately which parts run and which parts
are a plan. That is the same rule the product is built on.
