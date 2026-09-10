# MJ — Differentiated Feature Roadmap (the fundraise features)

> Eight features that put MJ in a position no funded competitor occupies. Each one maps
> to an existing, tested MJ primitive (the build cost column is honest: most of this is
> packaging + integration, not greenfield). Researched September 2026 against the funded
> competitive set (see POSITIONING.md).

| # | Feature | Existing MJ primitive | New work | Why it wins |
|---|---|---|---|---|
| 1 | **Verifiable Receipts as an open standard** — publish the receipt format + a one-file, zero-dependency verifier CLI (`npx verify-receipt receipt.jsonl`) and a hosted verifier page | `receipts.ts`, `verify/run.mjs` pattern already proves zero-dependency verification works | Extract verifier to a standalone npm package + landing page; propose the format publicly | Category-defining network effect: every auditor/MSP installs the verifier; "receipts" become the interoperability layer competitors must adopt. Stripe-receipts moment for agents |
| 2 | **Agent IAM: authority envelopes as agent identity** — just-in-time, attenuated, revocable scopes per mission; export to SIEM/IAM | `custody.ts` (attenuation, revocation, expiry, human-principal invariant), `arenaGate.ts` | Map envelopes to OIDC/SPIFFE-style tokens; connector exports to Okta/Entra/Veza | NHI/agent-identity is the hottest funded lane (Oasis $120M, Aembit, Astrix→Cisco) but nobody issues *scoped, attenuated, per-mission* agent authority with signed usage receipts |
| 3 | **EU AI Act Compliance Autopilot** — continuous Article 12/14 evidence generation, not questionnaires | `evidencePack.ts`, `aibom.ts`, control crosswalk (EU AI Act / ISO 42001 / SOC 2), receipts | Package as "audit binder" export; partner with one compliance consultancy for a certified mapping | Aug 2026 enforcement is live; observability vendors explicitly don't produce auditor-grade evidence (buyer's guides say so). MJ generates it by construction |
| 4 | **Agent FinOps: budget authority + chargeback** — hard per-mission USD caps, measured spend, per-team chargeback reports | `caps.ts` (atomic BudgetGate, reservation protocol), budget ledger, token-vs-USD honesty labels | Rollup views + CSV/API export; policy templates | Everyone measures tokens; nobody *enforces* dollars at dispatch time with race-proof reservations, and no one offers chargeback-grade, receipt-backed spend evidence |
| 5 | **The Flight Recorder: black box for agent incidents** — replay any mission seat-by-seat from the signed chain | `flightRecorder.ts`, `replay.ts`, `otel.ts`, event ledger | Timeline UI polish + OTLP export into Splunk/Elastic dashboards | "Prove why the agent did it" is the compliance requirement of 2026; replay from tamper-evident chains beats log archaeology. SIEM teams buy this |
| 6 | **Insurability score for agent fleets** — a measured risk score per team/mission derived from verification outcomes, gate results, and budget discipline | verify-gate tiers, arena gate digests, measured run history | Define the score; publish methodology; one cyber-insurance design partner | Nobody insures agent work because nobody can *prove* what agents did. Signed receipts are the actuarial dataset. Being first = default standard |
| 7 | **Cross-org capability channel (B2B agent commerce)** — two organizations' agents exchange *aggregate answers with receipts*, never raw data | `capability.ts` (aggregate whitelist + privacy guard), `twoNode.ts`, `egress.ts` | Real laptop-to-laptop transport (currently simulated — honest roadmap item), envelope handshake between orgs | Data-space / secure collaboration story unique to MJ's local-first architecture; cloud control planes structurally cannot offer "the raw record never exists outside machine A" |
| 8 | **Simulation preflight: predicted-vs-measured missions** — dry-run a mission in labeled simulation, diff against measured outcomes to score team configs before real spend | labeled simulation (browser edition), `evals.ts`, `selfImprove.ts` (baseline-vs-candidate experiment discipline) | One-command preflight + drift report | Unique honesty angle: MJ is the only platform whose simulations *refuse to count as evidence* — making the sim→real comparison itself a measured, trustworthy artifact |

## Sequencing for the pre-seed → seed narrative

- **Now (demo-able):** 1 (verifier CLI), 3 (audit binder), 4 (chargeback export) — weeks of packaging, not quarters.
- **During seed:** 2 (IAM connectors), 5 (SIEM export), 8 (preflight).
- **Series A moat:** 6 (insurance standard), 7 (cross-org channel + real transport).

## The strategic sentence for investors

> Orchestration is a commodity war between platform giants; the **assurance layer** —
> who may do what, what actually happened, provable to a third party, on the customer's
> own hardware — is unfunded whitespace where MJ already has a 75-suite-tested,
> cryptographically verified implementation and a regulatory forcing function that
> started enforcing in August 2026.
