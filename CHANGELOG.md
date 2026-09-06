# Changelog

Notable changes per release. Full notes in [docs/history/](docs/history/).

| Version | What changed |
|---|---|
| **11.11.0** | **SELF-EVOLVING — the AGI-grade autonomy release.** Measured runs now feed a closed improvement loop: **(1)** a lessons memory (`mission/lessons.ts`) reflects each run's measured facts into plain-language lessons that decay, reinforce and are retrieved into future team briefings (injected as `.mj-brief/ORG_LESSONS.md` for every seat); simulated runs produce environment lessons only — nothing about real execution is learned from them; **(2)** a strategy self-improvement loop (`mission/selfImprove.ts`) keeps an archive of team strategy versions, proposes one mutated candidate per generation and adopts only a strictly measured margin — all-simulated evidence leaves the candidate waiting with a written note; **(3)** skill evolution (`mission/skillEvolution.ts`) proposes reusable skills only from verified real missions (or three recurrences of one failure); skills join briefings only after human approval on the Evolve page; **(4)** learning receipts (`mission/learningReceipt.ts`) sign what the org learned — SHA-256 canonical digest plus Ed25519 issuer signature, verifiable with zero MJ state. New probe suite pins reflection determinism, memory dynamics, measured-only adoption, proposal honesty and receipt tamper-detection. Gates on Node v22.23.2: tsc 0, 60/60 live, 59/59 offline, vite 0. |
| **11.10.7** | **CLARITY — UI/UX redesign.** Icon rail replaced by a labelled, grouped sidebar (Workspace / Fleet / Proof / System) with Ctrl+B collapse to an icon rail; library drawer fixed (its entrance animation pinned it open, so the canvas could never use full width — now a slim LIBRARY handle); 14px base type with higher-contrast muted text; fourteenth palette **daylight** (paper ground, kiln-copper signal) and a theme-aware `color-scheme` meta so light themes render light form controls. Gates on Node v22.23.2: tsc 0, 59/59 live, 58/58 offline, vite 0. |
| **11.10.6** | Media asset release. Real 2× screenshots of the running product, the product brief and a 55-second demo recording ship under `media/`. No architecture change; manifests in lockstep; gates re-run. |
| **11.10.5** | **Verified AI Delivery V1.** Commit-bound provenance statements (`mission/provenance.ts`, in-toto-shaped, Ed25519-signed — issued only for merges that actually happened); AIBOM (`mission/aibom.ts`) built from receipts with approval status taken from the user's Role Board; deployer retention floor (Art. 26(6)-shaped, 6/12/24 months); Evidence Pack upgraded with all three plus SOX 404 / NIST 800-218A mappings. Suites #57–59 on a real git repository. |
| **11.10.1** | Merge engine. Ed25519 issuer signatures on receipts (`mj-proof-receipt/2`; a runtime without Ed25519 says so in writing via `signatureNote`), seat identity digests in-chain; **Merge Executor** (`mission/mergeExecutor.ts`) — `merge-tree` pre-flight, serialized merges, post-merge check, refuses blocked gates without a recorded override, reports `simulated` on git-less hosts, issues a signed merge attestation; **Evidence Pack** (`mission/evidencePack.ts`) re-verifies every receipt at export. Suites #54–56. |
| **11.10.0** | Enforcement. The adversarial gate is evaluated inside `executeTeam`, and its STRICT verdict blocks the merge path — the only way past is a recorded human override opened as a real approval request in Mission Control; every verifier's `reviewedSha` is checked against the snapshot sha so verdicts are bound to reviewed evidence; the runner emits real per-turn fleet heartbeats. Suite #53 on a real git repository. |
| **11.9.9** | Adversarial Verification Gate (`mission/verifyGate.ts` — verified only if a different harness than the writer checked the work); Receipt & Compliance Center (`mission/receiptVault.ts` — ledger, self-audit, SIEM export, compliance one-pager); Mission Control page over `mission/fleet.ts`; Role Board (`mission/roleBoard.ts`) — users declare which harnesses they own and which role each plays. Suites #49–52. |
| **11.9.8** | Layered (Sugiyama) auto-layout (`graph/layout.ts` — cycle breaking, longest-path layers, virtual nodes, deterministic barycenter crossing minimization, measured crossings) wired into `autoLayout`. Suite #48, 23 assertions. |
| **11.9.7** | Module headers state their full release lineage instead of a single version; historical markers kept as facts. Re-certified on Node 22. |
| **11.9.6** | Command-palette ranking made label-first (`paletteScore`); full re-certification under Node 22 LTS (v22.23.2). |
| **11.9.5** | Wire interaction fixed (drag-release port magnet, `connectRefusal` with the exact rule); Preflight lint (`graph/lint.ts`); command palette (`panels/CommandPalette.tsx` + `app/fuzzy.ts`); named checkpoints (`graph/checkpoints.ts`); Assist recut; **cyanotype** palette. |
| **11.9.4 (Redesign)** | Proof Receipts (`mission/receipts.ts` — SHA-256 hash-chained, sealed JSONL, verifiable with zero MJ state; suite #44); elastic seats inherit a harness the team already runs; structural redesign layer `styles/redesign.css` (tokens-only, inherited by every theme). |
| **11.9.4 (Commercial)** | Licensing engine (`mission/licensing.ts` — personal/trial/pro, offline HMAC-signed keys), first-run onboarding, License card in Settings. Investor memo in `docs/FUNDING.md`, deck in `media/MJ-Pitch-Deck.pptx`. |
| **11.9.4 (Major+)** | The three autonomy engines wired into real execution: `prepareAutonomy()` picks bandit arms per run, `executeTeam` modulates briefings and wave plans, runs settle measured outcomes into `autonomyStore`; `verify/BUILD-INFO.txt` pinned by the offlinePack gate. |
| **11.9.4 (Major)** | Autonomy engines: Web Evidence search (`mission/webSearch.ts`), Elastic Seats (`mission/elasticSeats.ts`), Bandit-Routed Evolution (`mission/evolutionBandit.ts`). |
| **11.9.4 (Fixed)** | **wabi** becomes the default palette; transform/opacity-only motion system (boot splash, node entrance, wire draw-in, page transitions), all behind `prefers-reduced-motion`. |
| **11.9.4** | FOUNDRY visual identity: carbon ground, cream ink, brass accent, engraved icon grammar, serif display voice. |
| **11.9.3** | Theme cascade fix — `:root` fallback pinned to `:where(:root)` specificity so theme blocks always win. |
| **11.9.2** | Offline pack built and certified under Node 22 instead of EOL Node 20. |
| **11.9.1** | Release-packaging fix — the 11.9.0 archive had shipped an empty `verify/suites/` (a vacuous 0/0 gate) and stale provenance text; pack regenerated, BUILD-INFO rewritten, gates green. |
| **11.9** | De-vendored the external hermes agent (~12 MB); NTH theme; canvas integrity fixes (wires re-measured onto rendered port anchors, stacking contexts, inset ports). |
| **11.8.7** | De-vendored `vendor/hermes-agent` and its self-evolution agent; skill contract and evolution fitness engine rewritten as MJ TypeScript. |
| **11.8.5(i)** | Deep type pass — concrete persisted-state types, narrowed dispatch helpers. |
| **11.8.5** | CI runner currency (ubuntu-24.04 / macos-15 / Node 22); typed `MjCommands` registry; zero `as never` in `src/`. |
| **11.8.4** | Vendored runtime MCP servers + browser stubs for node builtins. |
| **11.8.1** | Environment hardening — EACCES/EPERM/ENOEXEC classified UNMEASURED; exit-code-first verdicts. |
| **11.8.0** | Turn-limit truth — `withTurnLimit()` capability-driven per harness. |
| **11.7.1** | Offline verification gate (`verify/run.mjs`) shipped as a release artifact; harness count 21→25. |
| **11.7.0** | Fixed the vacuous harness gate (`ok()` arguments reversed since 11.6); surfaced 5 latent defects. |
| **11.6** | Connector — 25-harness registry with researched install + argv per harness, custom harnesses. |
| **11.5** | Meridian — icon grammar, node contracts, Assist redesign. |
| **11.4** | Teams loop audit (praise-drain, arm suppression), palette and signal diet. |
| **11.3** | Inscription — design tokens, self-hosted fonts, mechanical motion. |
| **11.0** | Replay, evals, git layer, Proof page; CI compiles the real Tauri crate on three OSes. |
| **10.0** | Reviewer snapshots against writers' branches. |
| **9.0** | Teams that review what was written, not the base. |
| **8.0** | Version metadata consolidation. |
| **7.0** | Real verification + git layer, replay/evals, Proof page. |
| **6.0** | Agent runtime × identities × reusable teams. |
