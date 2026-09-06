# MJ — Investor Memo (pre-seed)

**Positioning in one line:** *MJ is the verification & governance layer for agentic software work — the desktop control plane that proves your AI agents actually did what they claimed.*

Not "another orchestrator." The layer that makes orchestration trustworthy.

---

## 1. The demo moment (open every meeting with this)

A team of agents runs a mission. One writer's check fails. Every other tool in the category would show a green pipeline. MJ shows **`MISSION_FAILED :: Not verified`**, blocks the merge, records the evidence, and proposes the repair. **That single moment is the product.** Workflows that *look* successful but aren't are the most expensive failure mode in 2026 software, and nobody owns "prove it worked."

## 2. Problem

- Enterprises are scaling multi-agent systems while orchestration layers remain **optimistic by design** — success is inferred from exit chatter, not measured ([Deloitte TMT Predictions 2026](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/ai-agent-orchestration.html)).
- Governance, auditability and outcome-tracing are named as the missing layer across the industry ([Techment](https://www.techment.com/blogs/agentic-ai-orchestration-scalable-ai-2026/), [TrueFoundry](https://www.truefoundry.com/blog/what-is-multi-agent-orchestration)); frameworks solve coordination but "none solves the governance layer" ([TrueFoundry comparison](https://www.truefoundry.com/blog/multi-agent-orchestration-frameworks)).
- Vendor-locked SDKs (Claude Agent SDK, OpenAI Agents SDK) force customers into one model family; teams already pay for 3–6 agent CLIs and want a control plane that uses all of them.

## 3. Solution — what MJ is

A **native desktop workstation** (Tauri v2 + Rust, React/TS) where missions own teams, not the other way around:

- **25 real harnesses, no lock-in** — wraps the CLIs customers already subscribe to (claude, codex, gemini, grok, copilot, cursor, opencode…), each with researched argv + sandbox policy.
- **Verification-first runtime** — exit-code-first verdicts, `unmeasured` instead of guessed cost, canary-proven sandboxes, review snapshots so reviewers see the writers' work, provenance export.
- **Autonomy engines (2026 SOTA, wired into execution)** — bandit-routed strategy evolution (UCB1 + stagnation jump-arm, per RecHarness/AEL research), elastic seat scaling under human-on-the-loop supervision, live web evidence with primary/secondary source-kind honesty.
- **Local-first** — SQLite, OS keychain, stdio child processes. The privacy posture enterprises ask for.
- **Adversarial verification gate + proof receipts (11.9.9 → 11.10)** — a writer cannot grade its own work: verification must come from a DIFFERENT harness, evidence is bound to the reviewed snapshot sha ("Codex ran against snapshot abc123 and approved it"), and the gate controls the actual merge path. Every run issues a tamper-evident, hash-chained receipt an auditor can re-verify with zero MJ state.
- **User-defined teams (Role Board)** — users declare which agent CLIs they actually own and choose which plays each role; one developer's Claude Code and another's Grok Build are both first-class. No vendor assumed.

## 4. Traction substitute: engineering due diligence

Pre-revenue, so the repo *is* the evidence. Everything below is reproducible by any diligence engineer in minutes:

- 59 probe suites + 58 byte-pinned offline bundles, all green; mutation-tested (defects injected are caught; vacuous gates historically self-disclosed and fixed).
- A version-drift gate that fails the build if docs, counts, runners, or provenance (`BUILD-INFO.txt`) disagree with code.
- ~1 year of weekly cadence by a single founder (5.0 → 11.10), with an honesty ledger documenting its own bugs.

**Founder signal is the asset investors buy at pre-seed; this repo is unusually strong signal.**

## 5. Market & positioning

- Category: agentic orchestration / AI-devtooling control plane — 2026 inflection year ([Deloitte](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/ai-agent-orchestration.html)).
- Wedge: **compliance-adjacent devtools** — "the audit trail for agent work." Buyers: engineering leadership first, then compliance.
- Competition map: orchestrators (LangGraph, CrewAI, MS Agent Framework) own *coordination*; vendor SDKs own *one model family*; MJ owns *truth*. Complementary, not head-on.

## 6. Business model (benchmarked)

| Tier | Price | Notes |
|---|---|---|
| Personal | Free | noncommercial, forever — the PLG top of funnel |
| Pro | **$119/yr** (or $12/mo) | benchmarked to desktop devtools band $99–150/yr ([Parallels 2026](https://parallelscoupon.com/subscription/)); unlocks AUTONOMOUS + elastic>5 |
| Business | **$149/seat/yr** | team audit export (roadmap) |
| Enterprise | Custom | compliance pack, signed builds, attestation |

Subscription-first: subscription trials convert 15–25% vs 2–5% perpetual ([perpetual-vs-subscription analysis 2026](https://dev.to/soraco-technologies/perpetual-vs-subscription-licenses-which-business-model-wins-in-2026-19nb)); 14-day no-card Pro trial implemented.

## 7. Go-to-market (2026 PLG playbook)

- Time-to-value engineered to minutes: onboarding ships a labelled sample team that runs with zero CLIs/keys; smart default theme; skip-everything path ([PLG 2026](https://userpilot.com/blog/product-led-growth/), [TTV benchmarks](https://www.saasgrowthpros.com/product-led-growth-for-developer-tools): dev tools must show value in 5–15 min).
- Dogfood metric loop: MJ's own flight-recorder produces the activation dashboard (missions run, verified-rate, time-to-first-verified-mission).
- Content wedge: "your agents are lying to you" — the demo clip is the marketing asset.

## 8. Risks & mitigations (we list our own first)

| Risk | Mitigation |
|---|---|
| Solo founder | Hire #1 from the design-partner pipeline; repo discipline de-risks onboarding contributors |
| No users yet | 30-day plan: 20–50 users, 3 design partners, waitlist page |
| License was noncommercial | Dual-licensing implemented in-product; vendored deps permissive (NOTICE/VENDOR.md) — clean before diligence |
| Desktop-only imagination | Roadmap: opt-in team audit dashboard that preserves local-first |
| Soft license gate | Declared honestly; hard enforcement (signed native builds) on roadmap |
| Crowded category | Own "verification/governance," never pitch "orchestrator" |

## 9. 12-month roadmap

1. **M0–1:** commercial packaging (done in 11.9.4-Commercial), landing + waitlist, demo clip, 3 design partners.
2. **M1–3:** Pro launch; team run-history export; Windows/mac installer CI hardening.
3. **M3–6:** Business tier: shared audit view (opt-in sync, local-first preserved); compliance export (provenance + OTel).
4. **M6–12:** Enterprise: signed builds, key attestation, SSO-friendly org keys; 2 more hires.

## 10. The ask

**Pre-seed: $500k–$750k** (angels/accelerator). Use of funds: 12 months runway = founder + 1 engineer + design-partner program + infra. Milestones to next round: 500 weekly actives, 25 paid Pro, 3 Business pilots, verified-rate benchmark published as industry content.

---

*Appendix — reproduce the diligence:* `npm ci && npm test` (59/59), `node verify/run.mjs` (58/58 offline), mutation-test any harness argv and watch the gate fail. The honesty is the moat.
