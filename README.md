# MJ

A desktop runtime for agent organisations. You give it an outcome; it plans the work, picks the agents, runs them in worktrees, checks the result, and remembers why.

MJ is local-first, source-available, and opinionated about proof. A run only counts as done when a different agent than the writer reviewed the work, the check is measured, the merge is gated, and the receipt is issuer-signed. A merge that actually happened carries a signed provenance statement; a deployer can prove the AI Bill of Materials and the retention floor it ran under.

## What it does

- **Missions own teams.** A mission is the source of truth. The team is formed from the plan, not the other way around.
- **25 harnesses, no lock-in.** 23 CLIs (Claude Code, Codex, Gemini, Grok, Cursor, OpenCode, AMP, Auggie, Warp, Aider, Continue, Cody, Cline, OpenHands, Swe-agent, MentatBot, Plandex, Goose, Forge, Hermes, Engraver) plus the `llm` fallback and the `custom` slot. Each harness has a researched install and argv; the policy that builds the argv comes from the same registry.
- **Verification that the writer didn't grade itself.** The adversarial verification gate (11.9.9) blocks a run from completing on a self-check. The merge gate (11.10) ties the verdict to the actual merge path: STRICT blocks, ADVISORY allows with the failure recorded, the only way past STRICT is a human override logged to the audit ledger.
- **Snapshot-bound evidence.** Every verifier's reviewed-snapshot SHA is checked against the writer's snapshot, so "Codex approved" means Codex approved *that work*, not a base ref.
- **The gate becomes a merge.** The merge executor (11.10.1) runs the gated plan's real git steps — pre-flight `merge-tree` conflict checks first, then the merges, then the repo's own post-merge check — and records the resulting merge-commit sha in a signed attestation. A blocked gate is a hard stop, not a warning.
- **Commit-bound provenance (11.10.5).** Every real merge issues an in-toto-shaped, Ed25519-signed statement whose subject digest *is* the actual merge-commit sha. The statement names the builder, the AI materials (writer seats with harness and a deterministic identity digest `sha256(seatId|role|harness)`), the cross-harness gate verdict, the review-snapshot sha as independent approval, and the executed merge. A simulated or refused merge produces no statement — provenance exists only for what happened.
- **The AI Bill of Materials (11.10.5).** The AIBOM auditors ask for, built from receipts: components, roles, missions, seat identities, last-used. Approval status is the user's own Role Board declaration (owned → approved, else not-declared). Model versions are honestly marked "not measured". Exports as JSON and a paste-ready Markdown table.
- **Deployer retention floor (11.10.5).** Art. 26(6)-shaped — defaults to 6 months, with a 6/12/24 selector on the Proof page. The floor is declared, named in every evidence pack, and visible per-record in the vault UI.
- **Receipts that survive an audit.** Ed25519 issuer-signed (11.10.1), SHA-256 hash-chained, JSONL, externally verifiable with zero MJ state. An auditor with the public key can verify MJ issued the receipt and that no event was tampered with, in three steps. The evidence pack assembles receipts, attestations, the SIEM bundle, the AIBOM, the provenance statements, the retention declaration, and a control crosswalk (EU AI Act / ISO 42001 / SOC 2 / SOX 404 / NIST 800-218A) into one JSON for compliance.
- **Checks that measure.** Cost and tokens come from the CLI's NDJSON or are reported as `unmeasured` — never `chars/4`. Sandbox wrappers are proven with canaries that must fail; verdicts are exit-code first.
- **Autonomy engines.** Web-evidence Researcher (primary/secondary source kinds, honest about provider failure), elastic seat scaling (mode-gated), and bandit-routed evolution (UCB1 with a stagnation jump-arm).
- **Local first.** SQLite, OS keychain for secrets, child processes over stdio. No sidecar HTTP. Ollama at `127.0.0.1:11434` is yours.

## Stack

Tauri v2 (Rust) + React 18 / Vite 6 / TypeScript 5.6 / Zustand. Python `vendor/evolution-service` over stdio for the evolve loop. Vanilla CSS, self-hosted fonts, OLED-frameless shell.

## Run it

```bash
npm ci
npm run typecheck   # tsc --noEmit
npm test            # 59 suites
npm run build       # vite build

npm run tauri dev     # desktop window
npm run tauri:build   # nsis / dmg / appimage

node verify/run.mjs   # reviewer gate — 58 bundles, no install
```

The Rust engine compiles the first time you run `tauri dev` or `tauri:build`. Everything else works on Node 22 alone.

## Layout

```
src/         React — pages, canvas, mission runtime, harness, engines
src-tauri/   91 Tauri commands, SQLite, keyring, MCP/ACP bridges, git
probe/       59 Vitest suites (59/59)
verify/      offline pack — 58 bundles + runner, byte-pinned
vendor/      mcp-servers-reference, mcp-github, evolution-service
docs/        verification, history
```

## Tests

`npm test` runs 59 suites including 270+ assertions on the harness suite (turn-flag drift caught and pinned), `verifyGate` (cross-vendor/cross-seat/self-verification tiers), `mergeGate` (gate-over-merge on a real git repo with stubbed CLIs), `mergeExecutor` (pre-flight conflict check, real git merges, signed merge-attestation with the merge-commit sha), `signing` (Ed25519 issuer identity, `mj-proof-receipt/2` round-trip, v1 backward compat), `evidencePack` (re-verify at export, EU AI Act / ISO 42001 / SOC 2 / SOX 404 / NIST 800-218A crosswalk), `provenance` (commit-bound statements on a real git merge: subject-digest-is-the-real-sha, authorship digests, signature tamper detection, no-statement-for-simulated), `aibom` (Role-Board-declared approval, honest "not measured" model versions, empty-vault → empty inventory, paste-ready Markdown), `retention` (declared floor, satisfied-only-when-elapsed), `receiptVault` (chain verification, tamper detection, SIEM shape), and `fleet` (Mission Control state, cost-ledger honesty, isDecided). The typed `MjCommands` registry in `src/ipc/client.ts` makes a renamed Rust command a compile error.

`node verify/run.mjs` is the reviewer gate — same suites as bundles, no install, byte-pinned via `verify/MANIFEST.json`. The `offlinePack` probe refuses to pass if `verify/BUILD-INFO.txt` does not name the current bundle and suite counts.

See `docs/VERIFICATION.md` and `verify/BUILD-INFO.txt`.

## History

5.0 → 11.10.5 in about a year. Notable fixes: vacuous harness gate (11.7.0), turn-flag drift (11.8.0), exit-code-first verdicts (11.8.1), typed Rust↔TS boundary (11.8.5), proof receipts (11.9.4 Redesign), the offline reviewer gate (11.7.1), the adversarial verification gate (11.9.9), the merge-record gate (11.10), the completion release (11.10.1 — Ed25519 issuer signatures on every receipt, the merge executor that actually performs and records the merge, and the evidence pack that wraps it all for auditors), and the compliance vertical (11.10.5 — commit-bound provenance, the AI Bill of Materials, the deployer retention floor, and the upgraded evidence pack with SOC 2 CC8.1 / SOX 404 / NIST 800-218A mappings).

Full notes in `CHANGELOG.md` and `docs/history/`.

## Documents

| File | What it is |
|---|---|
| `INSTALL-ON-LAPTOP.md` | Build the desktop installer on Windows |
| `DESKTOP-NATIVE.md` | Full native install, per-OS deps, risk→sandbox mapping |
| `BUILD-NATIVE.md` | Toolchain and the exact build steps |
| `LOCAL-WORKLIST.md` | What was verified, what still needs your machine |
| `UPGRADE.md` | How the major versions differ |
| `WHAT-CHANGED.md` | 11.10.1 → 11.10.5 delta, defects fixed, honest list |
| `V6-SPEC.md` | The 11.10.5 specification this build implements |
| `NEXT-UPGRADES.md` | Research-backed roadmap |
| `ACCEPTANCE-RUN.md` | Captured probe run output |
| `UNIT-RUN.md` | Captured unit-test run output |
| `DEPLOY-VERCEL.md` | Ship the web edition to Vercel (zero-config) |
| `VENDOR.md` | What MJ vendors and why |
| `docs/VERIFICATION.md` | How to verify a release |
| `docs/DEEP-DEBUG-REPORT.md` | The audit that found and closed the `as never` casts |
| `docs/FUNDING.md` | Investor memo (pre-seed) |
| `docs/history/` | Per-version release notes |

## License

Source-available under **PolyForm Noncommercial 1.0.0** — free to run, free to study, not for commercial products, not for AI training. Commercial licenses available; open an issue.

Vendored components (`NOTICE`, `VENDOR.md`) ship under their own permissive terms.

---

Built by **Sree Harshen** — MJ is a real desktop app we ship. The verification gates are how you confirm that without taking my word for it.
