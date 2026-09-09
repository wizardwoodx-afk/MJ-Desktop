# MJ — Market Position (researched September 2026)

> This document is the strategic map for the fundraise: where the market is crowded,
> where the whitespace is, and the one sentence that puts MJ in its own category.
> Sources are linked inline.

---

## 1 · The one-sentence position

**MJ is the proof layer for agent work: a local-first runtime that turns every agent
mission into cryptographically signed, audit-grade evidence — the layer every other
agent platform is missing when the auditor, the CISO, or the regulator asks "prove it."**

Category to claim: **Agent Assurance** (runtime proof + authority + compliance evidence
for AI-agent fleets). Not "another orchestrator" — the assurance runtime that sits
*under* whatever orchestrator a customer already runs.

Elevator variants:

- For infra investors: *"Stripe receipts for AI agents — every agent action gets a
  signed, verifiable receipt, computed where the data lives."*
- For security investors: *"The black box + authority system for agent fleets: who was
  allowed to do what, what actually ran, cryptographically provable offline."*
- For compliance buyers: *"EU AI Act Article 12/14 evidence, generated automatically by
  the runtime that executes your agents — not reconstructed from logs after the fact."*

---

## 2 · What the 2026 market looks like

### Orchestration is crowded and commoditizing (do NOT compete here)

| Player | 2026 status |
|---|---|
| LangGraph | De-facto enterprise standard: ~38% of multi-agent production deployments, ~400 companies on the platform (Klarna, Uber, LinkedIn, BlackRock, JPMorgan) — [acropolium](https://acropolium.com/blog/ai-agent-orchestration-frameworks/), [presenc.ai](https://presenc.ai/research/multi-agent-orchestration-frameworks-2026) |
| CrewAI | Role-based crews, enterprise tier shipped Mar 2026 |
| Microsoft Agent Framework | Consolidated AutoGen + Semantic Kernel, Azure-native |
| OpenAI / Anthropic Agent SDKs | Vendor-native defaults, production-grade |

**Read:** orchestration is a features war between platform giants. MJ's harness-agnostic
design (it orchestrates 25 CLI agents) means it *complements* all of the above instead of
fighting them. The pitch is never "better orchestrator."

### The adjacent funded category: agent governance / control planes — hot, but all cloud

2026 funding in the governance/assurance space ([newmarketpitch tracker](https://newmarketpitch.com/blogs/news/ai-safety-funding-news), [softwarestrategies](https://softwarestrategiesblog.com/2026/03/28/agentic-ai-security-startups-funding-mna-rsac-2026/)):

| Company | Round | What they sell |
|---|---|---|
| JetStream Security | **$34M seed** (Mar 2026) | AI governance, runtime visibility & control |
| Guild.ai | **$30M Series A** (Mar 2026) | "Neutral control plane for AI agents" — governance & auditability |
| Geordie | **$30M Series A** (Jun 2026) | Agent governance & runtime safety monitoring |
| WitnessAI | **$85.5M total / $58M Series B** (Jan 2026) | AI security & governance |
| Noma Security | **$132M total** | AI agent security posture |
| Portkey | **$15M Series A** | AI gateway + governance control plane |
| OpenBox AI | **$5M seed** (Mar 2026) | Governance, verification & **audit trails** |
| Iridius | **$8.6M seed** (Apr 2026) | Compliance-by-design execution |
| Oasis Security | **$120M Series B** | Non-human identity (agents included) |

Consolidation confirms strategic value: Palo Alto ≈ **$29B** (CyberArk + Protect AI —
"identity + observability + model security for agentic AI"), ServiceNow **$11.6B**
(Armis + Moveworks + Veza), Cisco → Astrix.

**Read:** the investor consensus in mid-2026 is exactly MJ's theme — *"agent-focused
governance was the clearest theme, with most deals tied to identity, permissions, audit
logs, policy enforcement, or runtime visibility."* The category is funded. MJ's angle
within it is differentiated (below).

### The regulatory forcing function (why now)

- **EU AI Act high-risk enforcement began August 2, 2026.** High-risk agent deployments
  need: Article 10 data-governance documentation, **Article 12 logging with traceability**,
  **Article 14 human oversight**, Annex III classification; penalties up to **7% of global
  revenue** — [atlan checklist](https://atlan.com/know/ai-agent/enterprise-ai-agent-guardrails-checklist/), [agent-works](https://agent-works.ai/insights/eu-ai-act-compliance-for-ai-agents), [eyreACT](https://eyreact.com/ai-agents-eu-ai-act/).
- Buyer guidance already separates the layers: GRC platforms (Vanta/Drata) and AI
  governance systems-of-record (OneTrust/Credo/Holistic) manage *portfolios*; LLM
  observability (LangSmith/Langfuse/Arize) is *developer debugging* — explicitly **"not
  auditor-grade evidence, human-approval workflows, integrity verification"**; and a
  **runtime control plane** category is emerging to enforce and *prove* oversight at
  execution time — [KLA buyer's guide](https://kla.digital/blog/best-eu-ai-act-compliance-software-2026).
- The compliance bar is **traceability, not logs**: "you must be able to prove *why* an
  agent took a specific action, what data it used, and what governance policies were
  applied at the moment of execution" — [dev.to](https://dev.to/igorganapolsky/your-compliance-team-will-ask-for-an-ai-agent-audit-trail-before-august-2-heres-the-part-most-h2n).

**That last sentence is a description of MJ's authority envelopes + signed receipts,
written by the market.**

---

## 3 · The whitespace MJ owns (and nobody funded occupies)

Every funded "control plane" is a **cloud SaaS that asks you to trust its logs**.
MJ is the only player in the category whose evidence is:

1. **Cryptographically verifiable without trusting the vendor** — Ed25519-signed,
   SHA-256 hash-chained receipts any auditor re-verifies offline with zero MJ state.
   Competitors export logs; MJ exports *proof*.
2. **Local-first by architecture** — execution, secrets (OS keychain), and evidence live
   on the customer's machine; the cloud is a switchboard, never a warehouse. For
   regulated data (finance, healthcare, defense, public sector) this converts the
   #1 objection to agent adoption into the reason to buy.
3. **Measured, not asserted** — sandbox enforcement is canary-verified; costs are
   measured not estimated; verification requires a *different* vendor's harness than the
   writer's. The evidence layer itself is adversarially self-tested (11-attack authority
   battery, 75 probe suites, offline verification pack).

Positioning frame for decks:

```
        Observability (LangSmith, Braintrust, Arize)   → for engineers: "what happened?"
        Governance SaaS (Credo, OneTrust, WitnessAI)   → for policy teams: "what's allowed?"
   ───  MJ: Agent Assurance runtime ───                → for everyone with liability:
        "what happened, provably — signed, local, offline-verifiable"
```

---

## 4 · Ideal first customers (wedge)

1. **Regulated-industry platform teams running coding/ops agents on real repos**
   (banks, insurers, healthcare IT) — they already run Claude/Codex/Gemini CLIs and
   cannot pass an audit with screenshots.
2. **Agent consultancies / GSIs** delivering agent programs into regulated clients —
   MJ is the evidence layer they can resell in every engagement.
3. **Public sector / defense-adjacent** — air-gapped, local-first execution with signed
   provenance is a procurement requirement, not a nice-to-have.

---

## 5 · Proof points to build before the raise (already coded, needs packaging)

- Live demo: run a mission → open the receipt vault → verify a receipt **on a machine
  with no MJ installed** (one-command verifier). This demo closes the "so what is it"
  gap in 90 seconds.
- One-page control crosswalk (already generated by the app: EU AI Act Art. 12/14,
  ISO 42001, SOC 2) annotated by an external compliance reviewer → instant credibility.
- The 75-suite/offline-pack verification story as a diligence artifact: "our test gates
  are part of the product."
