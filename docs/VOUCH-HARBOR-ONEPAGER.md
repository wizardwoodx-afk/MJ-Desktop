# VOUCH HARBOR — one-pager (pre-seed)

*Vouch Harbor Labs · v16.5.0 · September 2026*
*Companion to `PRESEED-PITCH.md` (the enterprise thesis) — this page is the brand layer and the product story as shipped.*

---

## The line

> **Vouch Harbor: the AI teammate that works on your machine and proves everything it did.**

## The problem (unchanged from the thesis, now with a face)

Enterprises are deploying fleets of AI agents, and the #1 blocker is no longer
capability — it is **proof**. Auditors, CISOs, and (since Aug 2, 2026) the EU
AI Act demand evidence of *what the agent did, who authorized it, whether it
was verified, and that the data stayed put*. Every funded "solution" answers
with **trust our logs** — cloud SaaS, vendor-trust-me.

And the consumer/developer side got Grok Bot (Aug 2026): AI teammates that do
real work — on **their** cloud computer, with **your** credentials, opaque
internals, and a $30–300/mo subscription. The critique the teardowns landed
on the same day: *your data and logins live on the vendor's VM, and separate
bots are not a security boundary — their own docs say so.*

**Nobody owns the quadrant: a teammate you can talk to, running on YOUR
machine, that signs what it did.**

## The product (shipped, v16.5.0 — this tree)

One local-first app (Tauri v2 desktop + browser edition), one engine, six
doors:

| Door | What it is |
|---|---|
| **Vouch** | The face. A named, persistent seat you message like a colleague. Real tools (math, time, local knowledge, memory you can inspect and delete, a local workspace). A **human gate** pauses the run before anything risky — writes, mission dispatch — and records the decision. "dispatch a mission: …" drives the real Mission Loop from a chat sentence. |
| **Mission Loop** | The engine. COMPOSE → DISPATCH → COMMUNICATE → EXECUTE → GATE → ADAPT over 25 agent CLIs (claude, codex, gemini, grok, cursor, opencode, …). Adversarial governance arena, per-seat git worktrees, budget ledger, human-gated evolution. |
| **Workflows** | Design what the engine runs — typed ports, checkpoints, auto-layout. |
| **Proof** | The signed receipt vault — every mission, every teammate action, every MCP call, every drill run, every self-change. |
| **Audit** | The compliance view — Assurance Score, FinOps chargeback, incident black box, EU AI Act / ISO 42001 / SOC 2 crosswalk. |
| **System** | Connectors, providers, preferences — plus **Drill** (the product proving itself, below) and the **Meta loop** door (the self-change ledger). |

## The capability inventory (what 16.5 actually does)

- **Govern** — dual-process routing (fast path / slow path), SIMULATE-before-act
  with vouched predictions, a human gate on every risky action, learned
  preferences, and the **M6 meta loop**: the product can propose changes to its
  OWN control plane, and every self-change is proposed in words, simulated,
  human-gated, receipt-vouched and reversible — and it can never loosen its
  own controls (tighten-only; loosening is a revert, and reverts are gated).
- **Execute** — the real Mission Loop on real coding-agent CLIs: composed
  crews, per-seat worktrees, an adversarial arena that must see the work
  before it passes, a budget ledger, honest failure.
- **Verify itself** — the **Drill** (16.4): on demand, the product builds a
  fresh real git repo, runs a real two-seat mission on the repo's own test
  command, and reports the loop's verdict — including an `impossible`
  scenario that MUST fail, so "can it admit failure without fabricating
  success" is a standing test, not a promise.
- **Learn** — the **M4 learning bridge**: a verified mission distills into a
  trajectory-backed skill (real provenance: mission ID, team, verified seats,
  cycle), replay-gated before activation, fast-pathed for matching future
  missions, and permanently flagged if a live replay fails.
- **Be called** — the **MCP capability router (16.5: spec-current)**: any MCP
  client lists and calls 20 governed capabilities over stdio through the SAME
  governed pipeline as the chat face. Speaks the **2026-07-28 stateless core**
  (per-request capabilities, `server/discover`, cacheable tool lists, MRTR
  input flows, the Tasks extension for durable human-gated work) AND the
  legacy 2025 revisions — dual-era, one throat.
- **Prove** — `vh-proof-receipt/2`: SHA-256 hash-chained events, HMAC seal,
  Ed25519 issuer signature. Verifiable **offline, with zero product state**,
  on a machine that never saw the app. One unified mission ledger; one signed
  mission record per mission.

**"Trust me" becomes "verify it yourself" — and it's true for the chat, the
fleets, the MCP calls, the drills, and the product's changes to itself.**

## Why it wins the quadrant

| Axis | Cloud teammates (e.g., Grok Bot) | Cloud observability | **Vouch Harbor** |
|---|---|---|---|
| Where the agent's "computer" is | Vendor VM | n/a (no runtime) | **Your machine** (Tauri v2, OS keychain, egress-gated) |
| Who holds your credentials/logins | The vendor | — | **You** |
| Proof of what the agent did | "Trust our logs" | Dashboard, not evidence | **Signed, hash-chained, offline-verifiable receipts** |
| Human oversight | Partial (auto-review) | After the fact | **Human gate in the run + gated, reversible self-changes** |
| Standards posture | Vendor cloud | Vendor platform | **MCP 2026-07-28 server, dual-era; open receipt protocol** |
| Pricing | $30–300/mo, gated | SaaS seat | **Open-core: free personal tier, Pro/Enterprise** |
| Lock-in | Vendor cloud | Vendor platform | **25 harnesses, zero lock-in; receipt protocol is open** |

## The wedge → the moat

1. **Wedge (16.x):** the developer's own machine — "my agents, my box, my
   proof." Adoption engine: free, local, the verifier CLI works for anyone,
   and the MCP face means existing agent tooling can call the product
   natively.
2. **Moat (Enterprise):** the assurance story the pitch already makes —
   tamper-evident logging for the EU AI Act, audit binder automation, IAM/SIEM
   integrations, AIBOM + control crosswalks, measured FinOps chargeback.
   Priced against a compliance line item, not a dev-tool line item.
3. **Standard:** a public receipt-verification standard with an external
   auditor partnership — the moment "agent receipts" is a procurement
   checkbox, Vouch Harbor is the name on it.

## Traction & stage (honest)

- Complete, working product — v16.5.0, 30+ tagged releases, **88 probe
  suites / 87 offline verification bundles**, byte-pinned offline
  verification pack (runs in ~2.5 min with zero network), cross-platform CI,
  an independent audit (Sep 2026) that reproduced the receipt cryptography
  and found zero integrity failures under deliberate tampering, and an
  external review that tracked the MJ × ROGUE → Vouch Harbor lineage and
  called 16.4.1 "the current best."
- Not yet: lighthouse customers (that's what the raise buys). The open-core
  personal tier + verifier CLI are the adoption engine; the waitlist starts
  at launch.

## The ask (pre-seed)

Convert a proven engine + a shipped face into a counted company:

1. **Land 3–5 lighthouse customers** in regulated industries (finance,
   legal, defense-adjacent ops) — the compliance wedge.
2. **Ship the verifier CLI + audit binder as public artifacts** and open the
   receipt-verification standard (community + auditor partnership).
3. **Hire #2** (distributed systems / Rust — the cross-org transport) and
   **#3** (design/GTM).

**Seed milestone:** "agent receipts" becomes a procurement checkbox — and
Vouch Harbor is the name on it.

---

*Brand: Vouch Harbor Labs (house) → Vouch Harbor (product) → Vouch (the
teammate face) → the Mission Loop runtime → `vh` (the CLI).*
*Domains secured: vouchharbor.com + vouchharbor.ai.*
