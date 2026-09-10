# VOUCH HARBOR — one-pager (pre-seed)

*Vouch Harbor Labs · v15.0.0 · September 2026*
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

## The product (shipped, v15.0.0 — this tree)

One local-first app (Tauri v2 desktop + browser edition), one engine, six doors:

| Door | What it is |
|---|---|
| **Teammate** | The face. A named, persistent seat (default: **ROGUE**) you message like a colleague. Real tools (math, time, local knowledge, memory you can inspect and delete, a local workspace). A **human gate** pauses the run before anything risky — writes, mission dispatch — and records the decision. "dispatch a mission: …" drives the real Mission Loop from a chat sentence. |
| **Mission Loop** | The engine. COMPOSE → DISPATCH → COMMUNICATE → EXECUTE → GATE → ADAPT over 25 agent CLIs (claude, codex, gemini, grok, cursor, opencode, …). Adversarial arena, budget ledger, human-gated evolution. |
| **Workflows** | Design what the engine runs — typed ports, checkpoints, auto-layout. |
| **Proof** | The signed receipt vault — every mission AND every teammate run. |
| **Audit** | The compliance view — Assurance Score, FinOps chargeback, incident black box, EU AI Act / ISO 42001 / SOC 2 crosswalk. |
| **System** | Connectors, providers, preferences. (15.1: the provider brain plugs into the same seam.) |

## The vouch (the differentiator, in one mechanism)

Every finished job — a chat answer, a workspace write, a whole fleet mission —
is minted into a **mj-proof-receipt**: SHA-256 hash-chained events, HMAC seal,
Ed25519 issuer signature (or an honest `signatureNote` when the runtime can't
sign). Verifiable **offline, with zero product state**:
`node tools/verify-receipt.mjs receipt.jsonl` on a machine that never saw the
app. 14.x proved it for missions; 15.0 extends the same protocol to the
teammate's every action — including the human-gate decision itself
(`approved: true/false` in the chain).

**"Trust me" becomes "verify it yourself" — and it's true for the chat too.**

## Why it wins the quadrant

| Axis | Cloud teammates (e.g., Grok Bot) | Cloud observability | **Vouch Harbor** |
|---|---|---|---|
| Where the agent's "computer" is | Vendor VM | n/a (no runtime) | **Your machine** (Tauri v2, OS keychain, egress-gated) |
| Who holds your credentials/logins | The vendor | — | **You** |
| Proof of what the agent did | "Trust our logs" | Dashboard, not evidence | **Signed, hash-chained, offline-verifiable receipts** |
| Human oversight | Partial (auto-review) | After the fact | **Human gate in the run + human-gated evolution** |
| Pricing | $30–300/mo, gated | SaaS seat | **Open-core: free personal tier, Pro/Enterprise** |
| Lock-in | Vendor cloud | Vendor platform | **25 harnesses, zero lock-in; receipt protocol is open** |

## The wedge → the moat

1. **Wedge (15.x):** the developer's own machine — "my agents, my box, my
   proof." Adoption engine: free, local, the verifier CLI works for anyone.
2. **Moat (Enterprise):** the assurance story the pitch already makes —
   tamper-evident logging for the EU AI Act, audit binder automation, IAM/SIEM
   integrations, AIBOM + control crosswalks, measured FinOps chargeback.
   Priced against a compliance line item, not a dev-tool line item.
3. **Standard:** a public receipt-verification standard with an external
   auditor partnership — the moment "agent receipts" is a procurement
   checkbox, Vouch Harbor is the name on it.

## Traction & stage (honest)

- Complete, working product — v15.0.0, 30+ tagged releases, 82 probe suites,
  byte-pinned offline verification pack, cross-platform CI, an independent
  audit (Sep 2026) that reproduced the receipt cryptography and found zero
  integrity failures under deliberate tampering.
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

*Brand: Vouch Harbor Labs (house) → Vouch Harbor (product) → ROGUE (the
teammate seat) → MJ engine (the Mission Loop runtime) → `vh` (the CLI, 15.2).*
*Domains secured: vouchharbor.com + vouchharbor.ai.*
