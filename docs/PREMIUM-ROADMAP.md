# MJ — The Premium Agentic Roadmap (researched September 2026)

> Forward plan for the releases after 14.1.1. Thesis: the market already concluded what
> MJ was built on — now surface it as a premium agentic EXPERIENCE, not governance
> widgets. Every feature below passes the anti-fake test (§1). Sources linked inline.

---

## 1 · The anti-fake doctrine (why users call agent apps "fake")

2026 research is brutal and clarifying:

- The **demo→production gap is ~37%** — "a system that looks production-ready on your
  dashboard can be missing one task in three once it meets actual inputs"
  ([the reliability reckoning](https://learnagentic.substack.com/p/the-agent-hype-just-broke-the-reliability)).
- **Compounding math**: 90% per-step accuracy = ~12% end-to-end over 20 steps — "the
  95% illusion" ([hackernoon](https://hackernoon.com/why-ai-agents-work-in-demos-but-fail-in-production)).
- **61% of multi-agent failures start at agent BOUNDARIES** — the handoff points, not
  the agents ([foundra](https://www.foundra.ai/key-reads/ai-agent-production-reliability-testing-2026)).
- The named production killers: *state lost on crash, no mid-stream resume, no
  monitoring, confidently-wrong silent failures*. 79% of enterprises adopted agents;
  only ~11% run them in production.
- "The agents that succeed in production are the **most constrained**: external
  validation, deterministic orchestration, human oversight designed in."
- Reddit coined **"agent washing"** — labeling chatbots as agents. Sophisticated buyers
  now discount benchmarks entirely (UC Berkeley showed they're gameable).

**MJ's identity: the app for people burned by agent washing.** Premium = every feature
does real work, is measured, and degrades honestly. The test every feature must pass:

> **The Premium Test** — (1) it executes for real (never canned), (2) it produces or
> consumes measured evidence, (3) it says `unmeasured`/`simulated` when it must,
> (4) it attacks a NAMED production failure mode, (5) it feels machined (ATELIER).

---

## 2 · Pillar A — The Real Agent Experience (kills the "fake" feel)

The 2026 agentic-UX canon is explicit: chat-first fails; the product is the **control
surface** — predict, pause, approve, recover
([hatchworks patterns](https://hatchworks.com/blog/ai-agents/agent-ux-patterns/),
[zylos 2026 patterns](https://zylos.ai/research/2026-05-28-agentic-ux-frontend-design-patterns-ai-agents/),
[agentic-ux framework](https://www.agentic-ux.com/framework)). MJ implements the canon
*with authority attached* — nobody else does that.

### A1 · Mission Theater (live, real execution visibility)
Per-seat streaming transcripts with **per-tool-call rows: inputs, outputs, elapsed** —
the single highest-trust UX signal in 2026 ("streaming tool calls dramatically improves
user trust and reduces abandonment"). Overlay the assurance layer live: budget meter
burning against the signed cap, arena PASS badge, gate tier, bus traffic. MJ already
streams seat events on the inter-agent bus — this is the premium render of what is
already real. **The demo moment.**

### A2 · Plan Preview + Autonomy Dial (approve BEFORE it runs)
"Plan-and-execute preview is the highest-ROI UX improvement for tasks over 30 seconds."
Before any mission: steps, scope, risks in plain language; user approves, edits, or
dials autonomy (SUGGEST ↔ AUTO) per mission. **MJ-unique:** the approved plan binds
INTO the signed authority envelope — the mission is only authorized to do what the
human read. Deviation from the approved plan becomes a gate event in the receipt chain.

### A3 · Checkpoint pause / steer / resume (the resume killer)
Top-5 named failure: "no way to resume a task mid-stream." MJ adds checkpoints per
wave (checkpoints.ts exists); premium surface: pause mid-mission, inspect, steer the
briefing, resume from the checkpoint — with the receipt chain marking exactly where it
paused and resumed. Crashed or closed app → mission resumes from its last checkpoint.

### A4 · The Morning Briefing (async mission deck)
Devin-style async delegation, MJ-style: queue missions overnight under envelopes; the
Return Moment is a digest — what ran, what was cross-vendor verified, what needs
approval, what it cost — each line linked to its signed Mission Record. "MJ ran your
backlog while you slept; here is the evidence."

---

## 3 · Pillar B — Governed Power (the moat nobody occupies)

### B1 · The Governed MCP Host ⭐ (the headline feature)
MCP is the data plane of the entire agent economy (10,000+ public servers, 97M monthly
SDK downloads; every commerce protocol composes over it —
[eco.com MCP+payments guide](https://eco.com/support/en/articles/14845480-mcp-and-payments-a-2026-guide)).
What does not exist anywhere: an MCP host where **every tool call is authority-scoped,
budget-metered, and receipt-chained**. The market literally named the gap: "x402
wallets are unlimited by default… neither x402 nor MPP ships spend governance —
[the budget circuit-breaker, approval workflows, and audit trail] are what enterprises
require before deploying agents against production budgets"
([agentpay-mcp](https://github.com/up2itnow0822/agentpay-mcp)).
MJ has the budget gate, envelopes, approval workflow and receipts ALREADY. Ship the
MCP client where a tool call = envelope check → budget reservation → execution →
receipt event → Mission Record. **"The only MCP host where every tool call is signed,
priced, and auditable."** That sentence wins enterprise deals on its own.

### B2 · Agent-spend circuit breaker (x402-ready)
On top of B1: per-mission and per-seat hard caps enforced at the TOOL layer (not just
model tokens) — the circuit breaker above any payment rail. When agent commerce goes
mainstream (165M x402 transactions already), MJ is the governance layer the market says
is missing.

### B3 · Handoff contracts (the 61% fix)
Microsoft Research: 61% of multi-agent failures start at agent boundaries. MJ's bus
carries **typed handoff contracts**: the writer's output digest + the reviewer's
expected-input schema, bound in the action packet; a malformed or drifted handoff is a
gate event, not a silent relay drop. Probe-pinned, receipt-chained. "Boundary integrity,
measured" — nobody has this.

### B4 · The Watchdog (kill the silent wrongness)
The expensive failure is the agent that "confidently does the wrong thing." Cross-vendor
spot-recheck of critical claims (a second harness re-verifies sampled outputs — the
adversarial gate, extended from merges to assertions), plus anomaly telemetry MJ
already tracks (repetition, budget overrun, timeout patterns) surfaced as **risk
events in the Mission Record** with their own factor on the Assurance Score.

---

## 4 · Pillar C — Measured Excellence (premium honesty as UX)

### C1 · Rehearsal — evals built from YOUR mess
"The only benchmark that matters is a test set built from your customers' actual mess."
Rehearsal: import real scenarios/tickets; run the crew against them in LABELED
simulation before real spend; then track **predicted-vs-measured drift** as missions
run for real. Simulation never counts as evidence (house rule) — but its measured drift
against reality becomes a trust metric nobody else can print.

### C2 · Measured model routing
Multi-model is table stakes (Cursor wins on it) — MJ makes it EVIDENCE-BASED: the
bandit extends to per-role harness/model choice; the UI shows the measured cost/quality
table per seat role ("codex verified 92% at $0.11/run; local llama verified 84% at
$0.00"). Routing as a receipt-backed instrument, not a vibes dropdown.

### C3 · The fully-local crew (one-click sovereign mode)
Ollama bridge exists. One profile: every seat on local models, zero network beyond the
machine, receipts still signed. For r/LocalLLaMA, defense, healthcare, and the
air-gapped enterprise — "premium" also means *sovereign*.

---

## 5 · Sequencing (post-14.1.1)

| Release | Ships | Why first |
|---|---|---|
| **14.2 — "The Theater"** | A1 Mission Theater · A2 Plan Preview + Autonomy Dial · C3 local profile | The demo transformation: premium feel + the approve-before-run moment; mostly surface over real existing machinery |
| **14.3 — "The Governed Host"** | B1 MCP host · B2 circuit breaker · A3 resume | The enterprise headline; B1 is the moat sentence |
| **14.4 — "The Watchdog"** | B3 handoff contracts · B4 watchdog · A4 briefing | Reliability-completeness; the morning-briefing retention loop |
| **15 — "Measured"** | C1 Rehearsal · C2 routing | The data flywheel: MJ learns what works, measurably |

## 6 · What MJ will NOT do (the anti-hype list, standing)

- No fake autonomy or scripted demos presented as runs; simulation stays labeled and
  evidence-free.
- No benchmark-score marketing (gameable — Berkeley 2026); MJ markets measured evidence.
- No chat-first UX; the control surface is the product.
- No "unlimited" agent wallets; every spend path has a signed cap.
- No claims stronger than the artifacts: "issuer key pinned out-of-band," "MJ-governed
  artifacts leave through an auditable egress path."
