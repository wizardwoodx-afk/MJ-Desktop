# MJ

**A desktop runtime for agent organisations.** Give it an outcome; it plans the work, forms the team, runs the agents in isolated git worktrees, checks the result adversarially, merges what survives — and keeps signed receipts for all of it.

MJ is local-first, source-available, and opinionated about one thing: **proof**. A run only counts as done when an agent *other than* the writer reviewed the work, the check is measured (exit codes, not vibes), the merge is gated, and the receipt is issuer-signed. Nothing here claims more than it can show.

## Why it exists

Every agent orchestrator solves *coordination*. Almost none solve *evidence*: the writer grades its own work, "it ran" is the only artifact, and the merge goes out on trust. MJ closes that gap end-to-end:

- **Adversarial verification gate.** A run is verified only if a different harness than the writer checked it — cross-vendor, cross-seat, self-verification, or unverified. STRICT mode blocks; ADVISORY marks; the only way past a STRICT block is a human override on the audit ledger.
- **Snapshot-bound review.** Every verifier's reviewed-snapshot SHA is checked against the writer snapshot, so "Codex approved" means Codex approved *that code* — not a base ref.
- **The gate owns the merge.** The merge executor runs the gated plan's real git steps — pre-flight `merge-tree` conflict checks, then the merges, then the repo's own post-merge check — and records the merge-commit SHA in a signed attestation. A blocked gate is a hard stop, not a warning.
- **Commit-bound provenance.** Every executed merge issues an in-toto-shaped, Ed25519-signed statement whose subject *is* the merge commit: builder, AI materials (writer seats + harness + deterministic identity digest), the gate verdict, the executed merge. A simulated or refused merge produces no statement — provenance exists only for what happened.
- **The AI Bill of Materials.** The AIBOM auditors ask for, built from receipts: components, roles, missions, seat identities, last-used. Approval status is your own Role Board declaration; what MJ cannot measure (model versions, for instance) is marked *not measured*, never invented.
- **Receipts that survive an audit.** Ed25519 issuer-signed, SHA-256 hash-chained JSONL, externally verifiable with zero MJ state. The evidence pack wraps receipts, attestations, SIEM bundle, AIBOM, provenance statements, the retention declaration, and a control crosswalk (EU AI Act / ISO 42001 / SOC 2 / SOX 404 / NIST 800-218A) into one JSON. MJ supports compliance work; it is not itself "compliant", and the provenance is MJ-shaped, not SLSA certification.
- **Checks that measure.** Cost and tokens come from the CLI's NDJSON or are reported `unmeasured` — never `chars/4`. A check runner that cannot run honestly (no executor, missing dependencies, pytest not installed) **refuses with a named reason** instead of recording a phantom failure.

## Harnesses — no lock-in

25 harnesses: 23 CLIs with researched installs and argv (Claude Code, Codex, Gemini, Grok, Cursor, OpenCode, AMP, Auggie, Warp, Aider, Continue, Cody, Cline, OpenHands, SWE-agent, MentatBot, Plandex, Goose, Forge, Hermes, Engraver) plus the `llm` fallback and a `custom` slot. Each has a researched install and argv, and the policy that builds the argv comes from the same registry — with a probe suite pinning the turn flags so drift fails loudly.

## Autonomy

- **Missions own teams.** The mission is the source of truth; the team is formed from the plan, not the other way round.
- **Role Board.** You declare the harnesses you own and cast them; MJ flags unowned assignments and self-verification risk before the run starts.
- **Mission Control.** Live fleet board, measured per-harness cost ledger, stagnation alerts, unified approval inbox — every figure derived from events the runner actually emitted.
- **Researcher, elastic seats, bandit-evolution.** Web-evidence research (honest about provider failure), mode-gated seat scaling, UCB1 evolution with a stagnation jump-arm.

## Local first

SQLite on disk, secrets in the OS keychain, child processes over stdio. No sidecar HTTP. Your Ollama at `127.0.0.1:11434` stays yours.

## Stack

Tauri v2 (Rust) · React 18 · Vite 6 · TypeScript 5.6 · Zustand · a Python `vendor/evolution-service` over stdio. Vanilla CSS, self-hosted fonts, an OLED-frameless shell.

## Quick start

```bash
npm ci
npm run typecheck   # tsc --noEmit
npm test            # 59 suites
npm run build       # vite build

npm run tauri dev       # desktop window
npm run tauri:build     # nsis / dmg / appimage

node verify/run.mjs     # reviewer gate — 58 bundles, zero install, byte-pinned
```

The Rust engine compiles the first time you run `tauri dev`. Everything else works on Node 22 alone.

## Layout

```
src/         React — pages, canvas, mission runtime, harness adapters, engines
src-tauri/   # 94 Tauri commands, SQLite, keyring, MCP/ACP bridges, git
probe/       59 probe suites — the live gate
verify/      offline pack — 58 bundles + runner, byte-pinned against the sources
vendor/      mcp-servers-reference, mcp-github, evolution-service
docs/        verification notes, release history
```

## Tests

`npm test` runs the full probe surface: the harness registry (turn-flag drift pinned), `verifyGate` (cross-vendor / cross-seat / self-verification tiers), `mergeGate` and `mergeExecutor` (on real git repositories with stubbed CLIs), `signing` (Ed25519 round-trips, v1 receipt backward compatibility), `evidencePack` (re-verify at export, tamper-flagging), `provenance` (subject-digest-is-the-real-SHA, no statement for a simulated merge), `aibom`, `retention`, `receiptVault`, `fleet`, and `realExecution` (real pytest/cargo runs where the tools genuinely exist — and a named refusal where they don't).

`node verify/run.mjs` is the reviewer gate: the same suites shipped as self-contained bundles, byte-pinned via `verify/MANIFEST.json`, runnable from the extracted archive with nothing but Node. A rebuild that isn't byte-identical fails the `offlinePack` suite, and `versionDrift` fails if any manifest, document, or CI runner label falls out of step — including this README's counts.

## History

5.0 → 11.10.7 in about a year. Recent chapters: the vacuous-gate fix (11.7.0), the offline reviewer gate (11.7.1), exit-code-first verdicts (11.8.1), the typed Rust↔TS boundary (11.8.5), the adversarial verification gate (11.9.9), gate-over-merge (11.10.0), the completion release (11.10.1 — issuer signatures, the real merge executor, the evidence pack), the compliance vertical (11.10.5 — provenance, AIBOM, retention floor), and the green-CI release (11.10.7 — the pytest-environment refusal CI itself caught, see `docs/history/MJ-11.10.7-CI-FIX.md`).

Full notes in `CHANGELOG.md` and `docs/history/`.

## Documents

| File | What it is |
|---|---|
| `INSTALL-ON-LAPTOP.md` | Build the desktop installer on Windows |
| `DESKTOP-NATIVE.md` | Full native install, per-OS deps, risk→sandbox mapping |
| `BUILD-NATIVE.md` | Toolchain and the exact build steps |
| `LOCAL-WORKLIST.md` | What was verified, what still needs your machine |
| `UPGRADE.md` | How the major versions differ |
| `WHAT-CHANGED.md` | The 11.10-series delta, defects fixed, honest list |
| `V6-SPEC.md` | The specification this build implements |
| `NEXT-UPGRADES.md` | The research-backed roadmap |
| `docs/VERIFICATION.md` | How to verify a build yourself |
| `VENDOR.md` | What MJ bundles and why |

## License

Source-available — see `LICENSE` and `NOTICE`.
