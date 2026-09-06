# MJ — Agent Organization Runtime

A desktop app for running agent organisations. Not a workflow builder with AI bolted on.

> I kept running into workflows that *looked* successful but weren't. MJ is my take on fixing that — you give it an outcome, it plans the work, picks the right agent for each task, actually checks if it worked, and remembers why.

![MJ — wiring two planners](docs/images/03-wiring.png)

### Screenshots

| Empty canvas | Node Library |
|---|---|
| ![Empty](docs/images/01-empty-canvas.png) | ![Library](docs/images/02-node-library.png) |
| Dotted grid, hint `DRAG FROM A PORT...` — start blank, no demo data | Planner, Researcher, Browser, Coder, Debugger, Tester, QA — search and drag onto canvas |

| Wired workflow | With library closed |
|---|---|
| ![Wiring](docs/images/03-wiring.png) | ![Final](docs/images/04-wiring-final.png) |
| Two Planners wired port-to-port | Same graph, library collapsed — canvas is the source of truth |

*Tauri desktop build (OLED, frameless). Browser fallback renders the same shell.*

---

### What it does

- **Mission owns the org, not the other way around.** The plan is the source of truth — MJ forms the team from it.
- **25 harnesses, no lock-in.** Works with claude, codex, gemini, grok, cursor, opencode, amp, auggie, warp ... 23 CLIs + hermes + llm. Each has a researched install + argv. The policy that builds the argv comes from the same registry, so they can't drift.
- **Teams that actually review.** Writers work in worktrees, reviewers get a snapshot of the writers' branches — they review what was written, not the base.
- **Checks what matters.** Cost/tokens come from the CLI's own NDJSON or it's `unmeasured` — never `chars/4`. Sandbox wrappers are proven with canaries that *must* fail, verdicts are exit-code first.
- **Local first.** SQLite, OS keychain for secrets, child processes over stdio. No sidecar HTTP. Ollama at `127.0.0.1:11434` is yours if you have it.

### Stack

Tauri v2 (Rust 1.80) + React 18 / Vite 6 / TypeScript 5.6 / Zustand on top, Python `vendor/evolution-service` (`mj_evolution.stdio_server`) for the evolve loop. Vanilla CSS, self-hosted fonts.

### Run it

```bash
# Node 22 + Rust stable (WebKit/GTK on Linux)
npm ci
npm run typecheck   # tsc --noEmit
npm test            # 53 suites
npm run build       # vite build

# dev
npm run tauri dev
npm run tauri:build   # nsis / dmg / appimage

# quick check without node_modules (~25s)
node verify/run.mjs
```

### Layout

```
src/         # React — pages, canvas, mission runtime, domain/harness, engines
src-tauri/   # 94 Tauri commands, SQLite, keyring, MCP/ACP bridges, evolution-service, git
probe/       # 53 suites (53/53)
verify/      # offline pack — 52 bundles + runner, byte-pinned
vendor/      # mcp-servers-reference, mcp-github, evolution-service (hermes-agent + its self-evolution agent de-vendored in 11.9)
docs/        # history + verification
```

### Tests

`npm test` does 53 suites — harnesses 270 assertions (the `iff` on turn-flags for all 25), checkRunner, sandbox, theme, canvasGeometry, etc. There's a typed `MjCommands` in `src/ipc/client.ts` so a renamed Rust command is a compile error, not a runtime surprise.

`node verify/run.mjs` is the reviewer gate — same suites as bundles, no install.

More in `docs/VERIFICATION.md` and `verify/BUILD-INFO.txt`.

### History

5.0 → 11.9.4 over about a year. Biggest fixes: vacuous gate (args reversed), turn-flag drift, wrapper `EACCES` mis-classified as enforced, browser `require('fs')` that broke in ESM, shipping the vendored engines, then typing the whole Rust↔TS boundary and killing every `as never` in `src/`. 11.9 then de-vendored the Hermes agent engines, shipped the minimal/unique **NTH** theme (obsidian ground, electro-violet volt, plasma pulse — no gimmicky motion), 11.9.4 re-cut it on the v3 atlas **FOUNDRY** identity (carbon ground, cream ink, brass accent — frontend-only), and fixed the four canvas integrity bugs the review found: wires now land on their port anchors via rendered bounding-box measurement, overlapping cards own their stacking contexts, ports are inset into the card edge, and agent cards are a consistent `264px`. **11.9.4(Fixed)** then reworked the feel: the five-color-minimal **wabi** palette (charcoal / washi / kiln / moss / berry) became the twelfth theme and the new default, and a transform-only motion system landed — boot splash, staggered node entrance, wire draw-in, port hover, keyed page transitions — all behind `prefers-reduced-motion`. **11.9.4(Major)** added three autonomy engines (web-evidence Researcher, elastic seats, bandit-routed evolution), and **11.9.4(Major+)** wired all three into the real execution path — bandit arms modulate each run's briefings and wave plan, runs settle measured outcomes back into the shared autonomy store, elastic scaling acts mode-gated — with source-kind-honest web providers, pull-honest seeding, and BUILD-INFO provenance pinned by a gate. **11.9.4(Redesign)** is the differentiation release: **Proof Receipts** (`mission/receipts.ts`) — every mission can export a SHA-256 hash-chained, externally verifiable receipt (JSONL, sealed) aimed squarely at the Aug-2026 EU AI Act tamper-evidence enforcement, verified with no MJ state and probed by suite 44; elastic seats now inherit a harness the team already runs (no vendor default); and a full structural **redesign layer** (`styles/redesign.css`, loaded after mj.css) re-cuts radii, elevation, display type (Space Grotesk), canvas chrome and a mature spring/deceleration motion system — token-pure, so every shipped theme inherits it. **11.9.5** is the craft release: the wire fix (drag-release connections with a port magnet + spoken refusal reasons via `connectRefusal`), the **Preflight lint** (`graph/lint.ts` — ESLint-for-the-graph, researched on FlowLint/n8n-workflow-validator), the **Raycast-grade command palette** (fuzzy ranking, groups, node jumps, recents), **Checkpoints** (`graph/checkpoints.ts` — LangGraph-shaped named time travel, undoable restore), the **Assist recut**, the thirteenth five-color palette **cyanotype** (Prussian ground, paper ink, exposure-cyan signal), and three new probe suites. **11.9.6** is the certification release: palette ranking is label-first (`paletteScore` — category text can surface a command but never out-rank a visible-label hit, review-fixed and probed), and the entire shipped pack was re-certified under **Node 22 LTS (v22.23.2)** — fresh `npm ci`, typecheck, 47 live suites, pack rebuild and the offline gate all executed on Node 22. **11.9.7** is provenance polish: module headers that claimed a single version now state their full lineage (fuzzy core 11.9.5 → label-first `paletteScore` 11.9.6), historical release markers stay as facts, and the whole pack is re-certified under Node v22.23.2 once more — the rule going forward: a header names what shipped WHEN, never a stale 'current'. **11.9.8** is the editor-quality release: the naive frontier auto-layout is replaced by a real **layered (Sugiyama) engine** (`graph/layout.ts`, researched on ELK/OGDF/dagre) — longest-path layers, virtual nodes for long edges, deterministic barycenter crossing minimization with measured crossing counts, neighbour-smoothed coordinates, stacked components — wired into `autoLayout` (Layout button, Ctrl+Shift+L, palette) and pinned by 23 probe assertions (suite #48). **11.9.9** is the verified-agent-factory release, built on 2026 fleet-orchestration research (every competitor solves coordination; nobody solves proof): the **Adversarial Verification Gate** (`mission/verifyGate.ts` — a run is not verified unless a DIFFERENT harness than the writer checked it; STRICT blocks, ADVISORY marks), the **Receipt & Compliance Center** (the Proof page is now `mission/receiptVault.ts` — a local ledger of issued receipts with self-audit, SIEM export and an EU-AI-Act-mapped one-pager; receipts gain the gate verdict in-chain), **Mission Control** (new Control page over `mission/fleet.ts` — live fleet board, measured per-harness/per-role cost ledger, stagnation alerts, approval inbox), and the **Role Board** (`mission/roleBoard.ts` — nothing fixed: each user declares the harnesses they own and decides which plays which role; User 1 runs Claude Code, User 2 runs Grok Build, both valid) — four new probe suites (#49–52) pin the spine. **11.10** is the enforcement release, answering the 9.8/10 review's two gaps head-on: the adversarial gate now **owns the merge path** — evaluated INSIDE `executeTeam`, not after it, so a STRICT-blocked run's branches cannot merge without a recorded human override from Mission Control (`verifyGate.enforceMergeGate`, `teamExecutor.merge.gate`) — and its verdict is **bound to the reviewed-snapshot evidence**: every verifier's `reviewedSha` is checked against the snapshot sha, so the receipt says "verified against snapshot abc123", not merely "the verifier ran"; the runner emits real per-turn fleet heartbeats, merge-blocks open real approval requests in the inbox, the stale 11.9.4 counts in `docs/FUNDING.md` are corrected, and new suite #53 proves gate-over-merge on a real git repository.

Short version in `CHANGELOG.md`, full notes in `docs/history/`.

### Docs & License

- Setup: `DESKTOP-NATIVE.md` / `BUILD-NATIVE.md` / `INSTALL-ON-LAPTOP.md`
- What MJ wraps: `VENDOR.md` · `NOTICE`

Source-available under **PolyForm Noncommercial 1.0.0** — free to run and study, not for commercial products or AI training. See `LICENSE`. **Commercial edition:** the copyright holder dual-licenses MJ Pro (signed-key desktop license, see `src/mission/licensing.ts`); the in-app gate is honest about being a soft gate, and vendored components (`NOTICE`, `VENDOR.md`) ship under their own permissive terms. Want a commercial license? Open an issue.

---

Built by **Sree Harshen** — MJ is a real desktop app we ship. Feedback and PRs welcome.
