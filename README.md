# Vouch Harbor 16.9.0 — the accountable agent OS (govern · execute · verify · learn)

> **The proof layer for agent work.** Vouch Harbor runs fleets of AI coding agents on your own machine and turns every mission into signed, independently verifiable evidence — the assurance runtime for the age of agent audits.

One product, one engine: you compose a crew, give it an outcome, and the
Mission Loop runs the whole agent-work cycle — dispatch, inter-agent
communication, gated execution, measured feedback, and human-approved
adaptation — leaving one signed, verifiable receipt per cycle. Before 12.0 the
app presented these as separate productions (Teams, Evolve, Missions, Mission
Control, Observe…). 12.0 merged them into a single runtime
(`src/mission/missionLoop.ts`) and one engine screen. 15.0 (the Vouch Harbor
face) made it six doors total: **Teammate · Mission Loop · Workflows · Proof ·
Audit · System**. 16.0 fused the two codebases into this product; 16.1 carries
one clean product line — the same single version stamps the engine, the
control plane, the proof protocol and the native shell — and adds the learning
bridge (M4) and the mission timeline (M5-lite). 16.2 adds the MCP capability
router (M3): any MCP client can list and call the product's capabilities
over stdio, and every call is routed through the same governed pipeline —
risky calls pause at the human gate, and every completed call mints a
receipt. 16.3 closes the roadmap with the gated, reversible meta-loop
(M6): the product can propose changes to its own control plane — risk
tiers and standing preferences — and every self-change is proposed in
words, simulated, human-gated, receipt-vouched and revertible (tighten
only; reverts are themselves gated). 16.4.0 closes the external-validation
gap with the drill: standard real missions — a fresh real git repo, the
repo's OWN test command, the real mission loop — run on demand, with the
verdict vouched and an attestation digest.

The Teammate door is the human front: a named, persistent Vouch seat you
message like a colleague — real tools, a human gate that pauses for approval
on risky actions, a signed receipt for every finished run, and — new in 16.1 —
it *learns*: a successful, verified mission distills into a test-gated skill,
and the next matching mission fast-paths on it, still paused at the human
gate.

## What it is

- **One engine, one cycle** — COMPOSE → DISPATCH → COMMUNICATE → EXECUTE →
  GATE → ADAPT runs as a single loop: the bandit router picks the run's
  strategy arms, dispatches every seat over the inter-agent bus, executes the
  team through the governance arena and budget ledger, and folds the measured
  report back through seat evolution (human-gated candidates), elastic
  scaling and lesson memory. One cycle = one signed receipt.
- **Learning bridge (16.1)** — a completed, verified mission trajectory
  distills into a vouched dispatch skill: real mission provenance (mission
  ID, verified seats), a replay gate that refuses too-coarse triggers, and a
  fast path that binds the skill into the next run's receipt. Failures land
  in failure memory; a failed replay flags the skill so it never
  auto-executes again.
- **Mission timeline (16.1)** — every dispatched mission opens into its
  unified chain: mission events plus the session and verdict bookends, as a
  phase-by-phase timeline. One mission, one chain, one state.
- **MCP capability router (16.2; spec-current at 16.5)** — `npm run mcp`
  serves the product's capabilities as an MCP server (JSON-RPC 2.0 over
  stdio): 20 governed tools, honest risk labels in the schema, risky calls
  non-blocking at the human gate (approve/deny from the UI or the server
  itself, then poll `call_status`), and a receipt minted for every completed
  call — success, denial, refusal or error — carrying the calling face's
  origin. **16.5 is a DUAL-ERA server for the MCP 2026-07-28 spec**: the
  stateless core (per-request capabilities in `_meta`, `server/discover`,
  no handshake, results carry `resultType`), cacheable tool lists
  (`ttlMs` + `cacheScope`), MRTR input flows (a gated call returns
  `input_required` with the decision as an elicitation request; the client
  answers with `inputResponses`), and the **Tasks extension** (durable task
  handles over gated work: `tasks/get` poll, `tasks/update`,
  `tasks/cancel`) — while legacy 2025-revision clients keep the exact old
  wire (initialize handshake, `approve_action` + `call_status`). One throat:
  both eras route through the same governed pipeline. `probe/mcpRouter`
  drives the real server over real stdio in both eras.
- **Gated, reversible meta-loop (16.3)** — the product proposes changes
  to its own control plane (`risk.tier` tighten-only, `preference.set`),
  each one proposed in words, simulated, paused at the human gate (the
  revert is gated too), receipt-vouched in every outcome, and reversible
  with the exact state restored. Behavior-pinned: a re-tiered tool
  actually pauses at the gate until reverted. Faces: System → Meta loop
  (ledger + intents; decisions on the one gate) and MCP
  (`meta_propose` / `meta_status` / `meta_revert`). What it cannot
  self-modify — the receipt protocol, the gate, the brain, the code — is
  stated in the code and the docs.
- **Clean identity, completed (16.5)** — the legacy heritage names are
  gone from the whole VISIBLE product surface, not just the control plane:
  the shell, every page, the canvas watermark, onboarding, the IPC bridge,
  the browser stubs and the domain catalogs (agent identity prompts now
  read "the Vouch Harbor planner", the home reads "Vouch", the provenance
  demo generator is "Vouch Harbor" at the current version). The ACP
  override env is `VOUCH_ACP_BIN` (the old name still honored), and the
  IPC workflow contract moved to `VH`. Pinned by a new `vhClean` surface
  scan; engine-internal historical comments are the one labeled exception.
- **The drill (16.4)** — the product proving itself on real missions:
  `guard` (fix the disabled-admin bug), `maths` (implement the missing
  `clamp`), `impossible` (must come back FAILED — never a fake pass).
  Each run is a fresh REAL git repo whose OWN test command decides,
  through the REAL mission loop (real governance arena, real worktrees,
  signed cycle receipt), with a vouched drill report + reproducible
  attestation digest, a unified mission-ledger entry, and — because it is
  a mission — the human gate. Faces: System → Drill and MCP
  (`run_drill`, 20 governed tools).
- **Hardening + external proof (16.6)** — the conformance release, per the
  16.5.0 review: (1) the **MCP conformance suite** (`probe/mcpConformance`)
  validates every wire message — both eras, both directions — against the
  OFFICIAL spec JSON Schemas committed under `tools/mcp-conformance/` with
  provenance and sha256 pins, and writes `report.json` evidence per run;
  (2) **one throat, whole-tree pinned** — the 15.x Teammate prototype is
  deleted and a scan pins the complete set of files that touch the mission
  loop engine; (3) **honest docs** — the one-pager claims only what the tree
  proves (the signed audit report is a planned deliverable, named as such)
  and keeps the drill's deterministic-seat distinction explicit (machinery,
  not model intelligence); (4) the **reproducible drill benchmark**
  (`tools/drill-benchmark.mjs`) — full catalog through the real Mission Loop,
  one stable `overallDigest`, probe-pinned cross-process.
- **External validation (16.7)** — the hardening sequence's external-proof
  items, probe-pinned: (1) the **official MCP SDK client** (pinned
  devDependency, the spec's own client library) drives the real server
  end to end — handshake at 2025-11-25, 20-tool surface, the full human
  gate to a verified receipt, denial executes nothing (`probe/mcpSdkClient`);
  (2) the **real-model seam** — `run_drill` can run its seats on a REAL
  agent CLI (the loop spawns the real bin; the seat is labeled REAL in the
  report and the receipt; a missing CLI is refused in words, never faked),
  and `tools/external-model-validation.mjs` inventories the product's own
  25-harness registry on the host's PATH and validates a real model when
  one is present — honestly reporting absence when none is; (3) **benchmark
  integrity** — the drill's impossible scenario now carries a per-run random
  SEAL, the test file never enters a seat's worktree (the seat that decides
  the outcome cannot read the judge; the verifier re-injects the canonical
  test per verification run), and a canary detects and labels tampering.
- **Modern-client conformance (16.9)** — the 2026-07-28 era, proven from
  the outside: the **official MCP TypeScript SDK v2** (`@modelcontextprotocol/client`
  v2.0.0, exact-pinned devDependency — the spec's own client library for the
  modern revision) drives the real server over real stdio with the era
  **pinned to 2026-07-28** (`probe/mcpSdkClientV2`, 10 tests): the
  connect-time `server/discover` (both eras advertised), the 20-tool
  surface, and the **human gate the modern way** — `input_required` +
  `requestState`, answered through the client's elicitation handler and
  retried with `inputResponses` (MRTR), approve → executed → receipt
  `VALID`, decline → nothing executed; honest refusals in words; and the
  same v2 SDK in default (legacy) posture still negotiates 2025-11-25 —
  one official client library, both eras. With probe #90, both protocol
  eras are now externally validated by their official clients.
- **Learn by proving (16.8)** — VH-COLOR Phase 1, the capability genome:
  capabilities become versioned **genomes** (objective, trigger, procedure,
  declared failure modes, resource limits, provenance) that climb the
  lifecycle OBSERVED → CANDIDATE → UNDER_EVALUATION → SHADOW → CANARY →
  ACTIVE through four **hard gates** — safety, provenance, dependencies,
  regression — where a failure QUARANTINES with the stated reason, and
  quarantine lifts only through a named governor re-evaluation. **The
  protocol's central invariant is mechanical**: a capability cannot grant
  itself safety authority — the governor's grant travels as a separate
  argument, a grant written into the genome's own fields is invisible to
  the gate (probe-pinned). Trust grades **C0–C5** derive from the
  provenance chain (receipt → replay → multi-seat → lineage), the **signed
  capability package** (canonical digest + Ed25519 from the receipt
  keychain) is portable yet re-earns its trust on any host it imports to
  (never lands in ACTIVE), production regressions **auto-rollback** with
  fallback to the last ACTIVE version, and existing M4 skills convert to
  genomes with their receipts and seats intact. Probe-locked
  (`probe/genome`, 56 assertions); the MCP surface is unchanged — the
  20-tool conformance pin holds.
- **25 harnesses, no lock-in** — 23 CLIs (claude, codex, gemini, grok,
  cursor, opencode, amp, …) plus `hermes` and `llm`, from one shared
  registry; install detection and argv policy cannot drift.
- **Verification first** — exit-code-first verdicts, measured cost
  (`unmeasured` rather than estimated), canary-proven sandbox wrappers, and
  an adversarial arena that must PASS before a run is admitted.
- **Communication as infrastructure** — every dispatch and seat event rides
  the inter-agent bus on role channels, visible live in the engine screen.
- **Gated merges** — the merge executor runs the plan's real git steps and
  refuses anything the gate blocked without a recorded human override; on a
  host without git it reports `simulated` instead of claiming a merge.
- **Proof receipts** — every cycle exports a SHA-256 hash-chained receipt,
  Ed25519-signed, verifiable with zero product state. New receipts ride the
  `vh-proof-receipt/2` wire; pre-16.1 receipts (`mj-proof-receipt/1|2`) still
  verify through the same open verifier — compatibility, not branding. The
  Evidence Pack bundles receipts, merge attestations, an AIBOM and a control
  crosswalk (EU AI Act / ISO 42001 / SOC 2).
- **Verify anywhere — the open verifier (14.0)** — `node tools/verify-receipt.mjs receipt.jsonl` re-checks any
  receipt's chain, seal and Ed25519 signature with zero dependencies and zero
  product state; auditors run it on a machine that never installed this
  product. Broken chains print the exact seq; nothing is laundered.
- **Agent FinOps — measured chargeback (14.0)** — per-team, per-mission chargeback rows built from the budget
  ledger's real settlements and exported as digest-stamped CSV; seats that reported only tokens stay
  `unmeasured`, simulated seats are never charged (`src/mission/finOps.ts`).
- **Assurance Score & incident black box (14.0)** — a 0–100 evidence-derived rating per team (verification
  mix, arena, budget discipline, egress integrity, human feedback) that refuses to exist without measured
  runs, and a one-file tamper-evident forensic dossier for any mission with a SIEM JSONL projection
  (`src/mission/assuranceScore.ts`, `src/mission/incidentDossier.ts`).
- **Adaptation with a human gate** — the loop proposes, people dispose: seat
  instruction candidates grounded in measured evidence, bandit arm updates
  from measured runs only, elastic seat suggestions, and a lesson memory that
  shapes future briefings. Simulated runs and predictions teach nothing about
  real execution; nothing the loop learns edits a team silently in SUGGEST.
- **Explicit human feedback on every cycle** (12.1.1) — each cycle in the
  ledger carries a 1–5 rating + comment panel; the rating queues on every
  seat that ran and the next fold turns it into real evidence (1–2 becomes
  weight-2 human evidence with the comment preserved, 4–5 arms praise
  suppression, 3 is neutral). Feedback is integrity-bound to the team that
  actually ran the cycle, and re-rating before the fold supersedes the
  unconsumed rating — the human's last word wins, nothing accumulates, the
  verbatim history keeps every submission. Only cycles that RAN are ratable:
  an aborted cycle (nothing executed) is refused outright, while a gate-FAIL
  cycle whose seats ran stays ratable — feedback belongs on the runs that
  went wrong. One engine over the engines of record — the model is one
  orchestrating runtime plus one cycle ledger, not a single physical store.
- **Knowledge Forge — documents → structured knowledge proposals** (12.1.1)
  — paste a document (a chapter, a runbook, a SKILL.md from a
  book-to-skill-style distiller) and the Knowledge Forge turns it into a
  candidate knowledge skill: a mechanical extractor for frameworks/decision
  rules that is fully local, optionally enhanced by an LLM pass through your
  own installed harness CLIs — disclosed plainly: that pass sends the document to the
  harness's configured model provider (cloud by default; a locally-configured
  model stays local), and every proposal records `dataHandling: local |
  provider`. Proposals carry real SHA-256 provenance and claim NO measured
  effect (approval is governance, not proof the book is right); you approve
  or discard, and approved knowledge rides future mission briefings as
  `[knowledge]` — the loop carries the book forward without pretending it
  measured it.
- **Native desktop, local first** — Tauri v2 (Rust) shell with SQLite, OS
  keychain and stdio child processes; the same frontend runs as a browser
  edition on any static host. State lives on the machine; nothing phones home.

## Screens

| Workflows | Proof vault |
|---|---|
| ![Canvas](media/screenshots/02-canvas.png) | ![Proof](media/screenshots/05-proof.png) |
| Design what the engine runs — typed ports, checkpoints, auto-layout | Signed receipt vault with self-audit, SIEM and evidence-pack export |

| Earlier surface (archived) | Command palette |
|---|---|
| ![Home](media/screenshots/01-home.png) | ![Palette](media/screenshots/06-command-palette.png) |
| Pre-12.0 pages (home, fleet board…) were consolidated into the Mission Loop screen; captures live in `media/` | Ctrl+K, fuzzy-ranked and grouped |

| Daylight theme | |
|---|---|
| ![Daylight](media/screenshots/08-daylight-canvas.png) | Six INK palettes ship on true-black grounds — smoked apricot, dusty rose, whetstone, seedpod olive — with ivory and travertine as the paper-light pair. Design skills ship in `skills/` (ui-premium-craft, ui-motion-language, node-graph-craft) — ingestible through the Knowledge Forge. Ctrl+B collapses the sidebar. |

A full asset index — captures and the demo recording — lives in
[`media/`](media/README.md).

### Demo

[`media/demo-recording.mp4`](media/demo-recording.mp4) walks the pre-12.0
surface (home → canvas → fleet → proof); the 12.0 walkthrough is the Mission
Loop screen — compose a crew, run a cycle, watch the bus, gate the proposals,
read the receipts.

## Run it

```bash
# Node 22 + Rust stable
npm ci
npm run typecheck     # tsc --noEmit
npm test              # 91 suites
npm run build         # vite production build

npm run tauri dev     # desktop dev
npm run tauri:build   # nsis / dmg / appimage / deb

# offline verification, no node_modules needed (~30 s)
node verify/run.mjs   # 90 bundles
```

## Repository layout

```
src/         React frontend — the engine (mission/missionLoop.ts), the Vouch control plane (vouch/), six doors, canvas, harness registry
src-tauri/   Rust shell — Tauri commands, SQLite, keyring, MCP/ACP bridges, git
probe/       91 probe suites, run by `npm test`
verify/      offline pack — self-contained bundles + runner, byte-pinned
vendor/      reference MCP servers and the evolution service
docs/        verification notes, information architecture, per-release history
media/       screenshots and demo assets
```

## Verification

Every release is certified by the same four gates this README was written
against: `tsc --noEmit`, the live probe suites, the offline pack, and the
production build (see [docs/VERIFICATION.md](docs/VERIFICATION.md)). CI
(`.github/workflows/ci.yml`) repeats them on **Windows — the pre-seed
platform where the native app is built, installed and demoed — on Node 22
(a supported runtime)**, including `cargo check`/`cargo test`/`clippy` on
the real Tauri crate. Releases are additionally certified on the Linux
build host: 16.8.1's gates ran under **both Node v22.23.2 (the CI runtime)
and v20.20.2**. The offline pack is portable — it reproduces the full
gate on any OS with Node alone, zero installs, so the Windows-only CI is
not the only verification path.

The typed command table in `src/ipc/client.ts` makes a renamed Rust command a
compile error, and a version-drift probe fails the build if manifests, docs,
counts or provenance metadata disagree with the code. The clean-identity
probe pins the 16.1 rebrand: no legacy product names anywhere in the routed
surface, `vouch.*` persistence keys only, and both wire generations
(current + legacy) still verifying.

## Documentation

- Desktop builds: [DESKTOP-NATIVE.md](DESKTOP-NATIVE.md), [BUILD-NATIVE.md](BUILD-NATIVE.md)
- Installing on a laptop: [INSTALL-ON-LAPTOP.md](INSTALL-ON-LAPTOP.md)
- Web deployment (Vercel): [DEPLOY-VERCER.md](DEPLOY-VERCEL.md)
- What Vouch Harbor wraps: [VENDOR.md](VENDOR.md) · [NOTICE](NOTICE)
- Release history: [CHANGELOG.md](CHANGELOG.md) and [docs/history/](docs/history/) — release notes 16.9.0: [docs/history/VH-16.9-UPGRADE.md](docs/history/VH-16.9-UPGRADE.md) · 16.8.1: [docs/history/VH-16.8-UPGRADE.md](docs/history/VH-16.8-UPGRADE.md) · 16.8.0: [docs/history/VH-16.8-UPGRADE.md](docs/history/VH-16.8-UPGRADE.md) · 16.7.0: [docs/history/VH-16.7-UPGRADE.md](docs/history/VH-16.7-UPGRADE.md) · 16.6.0: [docs/history/VH-16.6-UPGRADE.md](docs/history/VH-16.6-UPGRADE.md) · 16.5.0: [docs/history/VH-16.5-UPGRADE.md](docs/history/VH-16.5-UPGRADE.md) · 16.4.1: [docs/history/VH-16.4-UPGRADE.md](docs/history/VH-16.4-UPGRADE.md) · 16.3.0: [docs/history/VH-16.3-UPGRADE.md](docs/history/VH-16.3-UPGRADE.md) · 16.2.0: [docs/history/VH-16.2-UPGRADE.md](docs/history/VH-16.2-UPGRADE.md) · 16.1.0: [docs/history/VH-16.1-UPGRADE.md](docs/history/VH-16.1-UPGRADE.md)
- Problem map (what each feature exists to solve): [docs/PROBLEM-FOCUS.md](docs/PROBLEM-FOCUS.md)
- Information architecture (one product, one spine): [docs/INFORMATION-ARCHITECTURE.md](docs/INFORMATION-ARCHITECTURE.md)

## License

Source-available under **PolyForm Noncommercial 1.0.0** — free to run and
study; not for commercial products or model training. A commercial edition is
dual-licensed with signed-key desktop licenses
(`src/mission/licensing.ts`); vendored components ship under their own terms
([NOTICE](NOTICE), [VENDOR.md](VENDOR.md)).

---

Built by **Sree Harshen**. Feedback and pull requests welcome.
