# MJ — Pre-Seed Pitch Narrative

*Working document for the raise. Keep numbers sourced; update the funding table each
quarter. Companion docs: [POSITIONING.md](POSITIONING.md), [UNIQUE-FEATURES.md](UNIQUE-FEATURES.md).*

---

## The pitch in 30 seconds

Enterprises are deploying fleets of AI coding and ops agents, and the #1 blocker is no
longer capability — it is **proof**. Auditors, security teams, and (since August 2026)
the EU AI Act demand evidence of *what the agent did, who authorized it, whether it was
verified, and that the data stayed put*. Every funded "solution" is a cloud SaaS whose
answer is *trust our logs*. **MJ is the assurance runtime that runs agent fleets
locally and turns every mission into an Ed25519-signed, hash-chained receipt any third
party can verify offline — no MJ installed, no vendor trust required.** It already
wraps 25 agent CLIs (Claude, Codex, Gemini, Grok, Cursor, …), enforces OS-level
sandboxing with canary-verified enforcement, and ships 75 test suites plus an offline
verification pack — verification is not a feature, it is the culture.

## Problem

- 88% of enterprise agent pilots never reach production — blocked by risk controls, not
  model quality; 92% of CISOs lack visibility into agent identities; 95% doubt they
  could contain a compromised agent (2026 surveys, documented in `docs/PROBLEM-FOCUS.md`).
- **EU AI Act high-risk enforcement began August 2, 2026**: Article 12 (tamper-evident
  logging), Article 14 (human oversight), Annex III conformity — penalties to 7% of
  global revenue. Compliance teams need *traceability*, not logs: why the agent acted,
  on what data, under which policy, at execution time.
- Observability tools (LangSmith, Braintrust, Arize) are for engineers, and buyer
  guides explicitly note they are **not auditor-grade evidence**. GRC platforms manage
  portfolios, not runtimes. A "runtime control plane" category is being born *right now*
  — with one vendor's $34M seed and another's $30M Series A — and every one of them is
  cloud-trust-me.

## Insight (the founder's edge)

Evidence that must survive an audit cannot live in the vendor's cloud and cannot be
produced *after the fact* from logs. It must be **minted at execution time, on the
customer's machine, signed, and chained** — the way PKI changed "trust this website"
into "verify this certificate." MJ generalizes that move to agent work: authority
becomes scoped, signed, attenuatable envelopes; actions become hash-chained events;
missions become issuer-signed receipts. **"Trust me" becomes "verify it yourself."**

## Product (what exists today, working)

- **One runtime, five doors** — Mission Loop · Workflows · Proof · Audit · System;
  desktop app (Tauri v2, Rust + SQLite + OS keychain), browser edition as labeled demo.
- **25 harnesses, zero lock-in** — orchestrates the agent CLIs enterprises actually run,
  one typed registry, argv policy that cannot drift (drift = compile error / failed gate).
- **Adversarial verification gate** — a mission is not verified unless a *different
  vendor's* agent, bound to the exact snapshot SHA, approved the work. STRICT mode blocks
  same-vendor self-grading.
- **Governance arena** — an 11-attack battery (privilege escalation, scope growth,
  budget races, tamper, egress violations…) must pass before any seat is invoked; the
  PASS digest rides the receipt.
- **Proof receipts** — Ed25519-signed, SHA-256-chained, JSONL/SIEM-exportable,
  verifiable with zero MJ state; Evidence Pack bundles AIBOM + EU-AI-Act/ISO-42001/SOC-2
  crosswalk.
- **Local-first privacy** — OS keychain secrets, egress gate (nothing leaves without a
  human-signed envelope; every departure digest-chained), capability channel (aggregates
  cross, raw rows structurally cannot).
- **Human-gated learning** — bandit-selected strategies and team evolution propose,
  humans dispose; simulated runs teach nothing.
- **Engineering rigor as a moat signal** — 75 probe suites, an offline 74-bundle
  verification pack (`node verify/run.mjs`, zero installs), a meta-probe that fails the
  build if docs/manifests/counts drift from code.

## Why now

1. **Regulation enforced** (EU AI Act, Aug 2026) with criminal-scale penalties.
2. **The category got funded** — JetStream $34M seed, Guild.ai $30M A, Geordie $30M A,
   WitnessAI $85M+, Noma $132M — validating "agent governance" while leaving the
   **verifiable, local-first** quadrant empty.
3. **Agents moved from demos to repos, budgets, and prod systems** — the evidence need
   went from theoretical to procurement-blocking.
4. Strategic M&A (Palo Alto ≈$29B identity+agent-security; ServiceNow $11.6B; Cisco→Astrix)
   shows incumbents paying up for exactly this layer.

## Business model

- **Open core, source-available** (PolyForm Noncommercial): free personal tier carries
  the full verification core (adoption engine).
- **Pro** (per seat/year): autonomous-mode evolution, elastic fleets, chargeback/FinOps
  exports, SIEM connectors.
- **Enterprise**: audit binder automation, IAM/SIEM integrations, cross-org capability
  channels, support & certification packages — priced against a compliance line item,
  not a dev-tool line item.

## Traction & diligence artifacts (be transparent about stage)

- Complete, working product; 30 tagged releases with per-release certification notes.
- 75/75 live suites, 74/74 offline verification, cross-platform CI.
- Independent audit (Sep 2026) reproduced the receipt cryptography and caught zero
  integrity failures under deliberate tampering.
- Honest gaps (the roadmap, not secrets): real two-machine transport for the cross-org
  channel; Windows sandboxing via WSL2 guidance; first lighthouse customers.

## The ask (pre-seed)

Raising to convert a proven engine into a counted company: **land 3–5 lighthouse
customers in regulated industries**, ship the verifier CLI + audit binder as public
artifacts, and hire #2 (distributed systems / Rust) + #3 (design/GTM).
Milestone for the seed: a public receipt-verification standard with an external auditor
partnership — the moment "agent receipts" becomes a procurement checkbox, MJ is the
name on it.

---

## Funding landscape quick-reference (update quarterly)

| Signal | Detail |
|---|---|
| Theme | "Agent governance: identity, permissions, audit logs, policy enforcement, runtime visibility" — the clearest funded theme of H1 2026 |
| Comparables | JetStream $34M seed · Guild.ai $30M A · Geordie $30M A · OpenBox $5M seed (audit trails) · Portkey $15M A |
| Investor appetite | >70% of Q2 2026 VC went to AI; "picks and shovels underneath agents" explicitly favored over thin wrappers |
| Strategic acquirers | Palo Alto, ServiceNow, Cisco, CrowdStrike all bought adjacent layers in 2025–26 |

Sources: [agent funding tracker Q3-2026](https://gravity.fast/blog/ai-agent-funding-tracker-q3-2026/) ·
[AI safety funding June 2026](https://newmarketpitch.com/blogs/news/ai-safety-funding-news) ·
[agentic security RSAC 2026](https://softwarestrategiesblog.com/2026/03/28/agentic-ai-security-startups-funding-mna-rsac-2026/) ·
[EU AI Act agent checklist](https://atlan.com/know/ai-agent/enterprise-ai-agent-guardrails-checklist/) ·
[compliance buyer's guide](https://kla.digital/blog/best-eu-ai-act-compliance-software-2026) ·
[agent infra landscape](https://presenc.ai/research/ai-agent-infrastructure-startups-2026)
