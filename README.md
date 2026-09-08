# MJ 12.0.0 — the One-Engine desktop runtime for agent work

MJ is ONE engine: you compose a crew, give it an outcome, and the Mission Loop
runs the whole agent-work cycle — dispatch, inter-agent communication, gated
execution, measured feedback, and human-approved adaptation — leaving one
signed, verifiable receipt per cycle. Before 12.0 the app presented these as
separate productions (Teams, Evolve, Missions, Mission Control, Observe…).
12.0 merged them into a single runtime (`src/mission/missionLoop.ts`) and one
engine screen, with five doors total: **Mission Loop · Workflows · Proof ·
Audit · System**.

## What it is

- **One engine, one cycle** — COMPOSE → DISPATCH → COMMUNICATE → EXECUTE →
  GATE → ADAPT runs as a single loop: the bandit router picks the run's
  strategy arms, dispatches every seat over the inter-agent bus, executes the
  team through the governance arena and budget ledger, and folds the measured
  report back through seat evolution (human-gated candidates), elastic
  scaling and lesson memory. One cycle = one signed receipt.
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
- **Proof receipts** — every cycle can export a SHA-256 hash-chained receipt,
  Ed25519-signed, verifiable with zero MJ state. The Evidence Pack bundles
  receipts, merge attestations, an AIBOM and a control crosswalk (EU AI Act /
  ISO 42001 / SOC 2).
- **Adaptation with a human gate** — the loop proposes, people dispose: seat
  instruction candidates grounded in measured evidence, bandit arm updates
  from measured runs only, elastic seat suggestions, and a lesson memory that
  shapes future briefings. Simulated runs and predictions teach nothing about
  real execution; nothing the loop learns edits a team silently in SUGGEST.
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
| ![Daylight](media/screenshots/08-daylight-canvas.png) | Fourteen palettes ship; `daylight` is the paper-light one. Ctrl+B collapses the sidebar. |

A full asset index — captures, the demo recording, the brief and the deck —
lives in [`media/`](media/README.md).

### Demo

[`media/demo-recording.mp4`](media/demo-recording.mp4) walks the pre-12.0
surface (home → canvas → fleet → proof); the 12.0 walkthrough is the Mission
Loop screen — compose a crew, run a cycle, watch the bus, gate the proposals,
read the receipts. The one-page product brief is
[`media/MJ-product-brief.pdf`](media/MJ-product-brief.pdf).

## Run it

```bash
# Node 22 + Rust stable
npm ci
npm run typecheck     # tsc --noEmit
npm test              # 74 suites
npm run build         # vite production build

npm run tauri dev     # desktop dev
npm run tauri:build   # nsis / dmg / appimage / deb

# offline verification, no node_modules needed (~30 s)
node verify/run.mjs   # 73 bundles
```

## Repository layout

```
src/         React frontend — the engine (mission/missionLoop.ts), five doors, canvas, harness registry
src-tauri/   Rust shell — Tauri commands, SQLite, keyring, MCP/ACP bridges, git
probe/       74 probe suites, run by `npm test`
verify/      offline pack — 73 self-contained bundles + runner, byte-pinned
vendor/      reference MCP servers and the evolution service
docs/        verification notes, information architecture, per-release history
media/       screenshots and demo assets
```

## Verification## Verification

Every release is certified by the same four gates this README was written against:
`tsc --noEmit`, the live probe suites, the offline pack, and the production build
(see [docs/VERIFICATION.md](docs/VERIFICATION.md)). CI repeats them on Linux, macOS
and Windows, including `cargo check`/`cargo test`/`clippy` on the real Tauri crate
(`.github/workflows/ci.yml`).

The typed `MjCommands` table in `src/ipc/client.ts` makes a renamed Rust command a
compile error, and a version-drift probe fails the build if manifests, docs, counts
or provenance metadata disagree with the code.

## Documentation

- Desktop builds: [DESKTOP-NATIVE.md](DESKTOP-NATIVE.md), [BUILD-NATIVE.md](BUILD-NATIVE.md)
- Installing on a laptop: [INSTALL-ON-LAPTOP.md](INSTALL-ON-LAPTOP.md)
- Web deployment (Vercel): [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)
- What MJ wraps: [VENDOR.md](VENDOR.md) · [NOTICE](NOTICE)
- Release history: [CHANGELOG.md](CHANGELOG.md) and [docs/history/](docs/history/)
- Problem map (what each feature exists to solve): [docs/PROBLEM-FOCUS.md](docs/PROBLEM-FOCUS.md)
- Information architecture (one product, one spine): [docs/INFORMATION-ARCHITECTURE.md](docs/INFORMATION-ARCHITECTURE.md)

## License

Source-available under **PolyForm Noncommercial 1.0.0** — free to run and study;
not for commercial products or model training. A commercial edition is dual-licensed
with signed-key desktop licenses (`src/mission/licensing.ts`); vendored components
ship under their own terms ([NOTICE](NOTICE), [VENDOR.md](VENDOR.md)).

---

Built by **Sree Harshen**. Feedback and pull requests welcome.
