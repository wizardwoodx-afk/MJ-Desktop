# MJ 11.8 — agent organization runtime

**MJ** is a **Tauri v2** desktop app for running agent organisations.

You state an outcome. MJ plans it, forms an organization to deliver it, arbitrates which coding
agent runs each task, detects and repairs failures while running, restructures the organization when
the plan turns out to be wrong, and keeps an immutable record of every decision — so you can answer
*why does this artifact exist*.

The graph is the source of truth for a workflow. For a mission, the plan is. Secrets stay in the OS
keychain. Hermes skills are `SKILL.md`. Official MCP servers run over **stdio**.

Not a localhost product: production loads `frontendDist` inside the WebView, agents are child
processes over stdin/stdout, and there is no HTTP sidecar. (Ollama at `127.0.0.1:11434` is *your*
local model, not an MJ service.)

---

## Design invariants

Five rules the code enforces, not just documents. They are the reason MJ's numbers mean anything.

- **No fake success.** A mission that used the labelled `local-test` double returns `BLOCKED`,
  never `COMPLETED`, and says why.
- **No fake metrics.** Cost and tokens come from what the harness actually reported
  (`total_cost_usd`, NDJSON usage events) or are recorded as unmeasured. Never `chars/4`. A zero
  token total is *not* reported as `0` — "the CLI told us nothing" is not "the CLI measured nothing",
  and conflating them would let a failed invocation look like a free successful one.
- **No self-certification.** An agent is never the sole authority on its own work. An unrun check is
  `measured: false` and drags the score down.
- **No silent mutation.** Every graph change is gated by policy → evaluation → regression, and
  refused mutations are recorded too.
- **No single success number.** `scoreMission` returns six dimensions plus what could not be measured.

## Harness registry

MJ wraps **25** ids — 23 spawnable CLIs plus `hermes` and `llm`. Each entry carries a researched
binary, argv template, install line and an **evidence grade** (binary-verified / vendor-documented /
community-reported / unverified), so a flag that turns out to be wrong can be traced back to the
claim it came from.

The policy layer derives its argv from this registry rather than hardcoding per-agent special cases,
so the two cannot drift apart. Suite #39 pins that agreement: for every harness, §10 asserts the
policy composes a turn flag **if and only if** the registry says the CLI supports it — 270 assertions,
including a source-level mutation test that fails the gate when a registry entry is changed.

## Verify

```bash
npm ci
npm run typecheck     # tsc --noEmit,            exit 0
npm test              # 40 suites, 0 failed      — esbuild's JS API, no shell, identical on all three OSes
npm run build         # vite production build,   exit 0

# Zero-install offline gate: pre-bundled suites, no node_modules, no network, ~25 s.
node verify/run.mjs   # OFFLINE VERIFY SUMMARY: 39 passed, 0 failed.
```

**Last run against this tree (11.8.5):** fresh `npm ci`, Linux x64, Node v20.20.2 — `tsc --noEmit`
exit 0; `npm test` **40/40**; `vite build` exit 0; `node verify/run.mjs` **39/39**. Recorded by the
release session itself, not certified by a third party.

Read the two offline numbers together. `verify/run.mjs` runs pre-bundled suites, so it stays green
even when the pack is stale; suite #40 is what proves every bundle is byte-identical to a fresh
rebuild. A green 39/39 means nothing unless #40 is green too.

Suite highlights: `harnesses` 270 assertions (§10 pins registry↔policy turn-flag agreement for all
25 harnesses), `canvasGeometry` 82, `checkRunner` 45, `theme` 44, `meridian` 43, `sandbox` 26.

**Rust** is covered by CI, not by the run above — no cargo toolchain was available in the
environment that produced this release. `cargo check`, `cargo test` and `cargo clippy -D warnings`
run on Linux, macOS and Windows in `.github/workflows/ci.yml`. The Rust parsers are plain `std` and
`include!`d into the Tauri file, so the code that ships is the code that compiles.

## Build

```bash
npm run tauri dev       # dev window
npm run tauri:build     # nsis / dmg / appimage / deb
```

The installer is typically 5–10 MB because Tauri uses the OS webview instead of shipping Chromium.

## Layout

| Path | What it is |
|---|---|
| `src/mission/` | The mission runtime — plan, organization, arbitration, repair, verification |
| `src/domain/` | Node library, 25-harness registry, role packs, frameworks, teams |
| `src/engine/` | Workflow scheduler, control runtime, Hermes loop, provenance export |
| `src-tauri/src/` | 92 Tauri commands, SQLite (14 tables), keyring, MCP/ACP/Hermes bridges, git |
| `probe/` | 40 probe suites — the test suite |
| `verify/` | Offline verification pack (39 bundles + zero-dependency runner) |
| `vendor/` | Upstream engines MJ wraps, plus MJ's own Python evolution service |
| `evolution-service/`→`vendor/` | DSPy/GEPA reflective optimiser (stdio, first-party) |

## Documents

| Read this | For |
|---|---|
| `MJ-11.8.5-UPGRADE.md` | What this release changes, and why the 11.8.1 approach was wrong |
| `MJ-11.8-UPGRADE.md` | The turn-limit truth and environment hardening |
| `MJ-11.7.1-UPGRADE.md` | The offline gate and the 25-harness registry |
| `VENDOR.md` + `NOTICE` | What MJ wraps, and on what licence |
| `VERIFICATION.md` | The three verification tiers and what each proves |
| `DESKTOP-NATIVE.md` | Native install per OS, toolchain, CLI sandbox mapping |
| `LOCAL-WORKLIST.md` | Ordered checklist for a local agent session |

## Known limits

Stated plainly, because the alternative is discovering them at runtime.

- Browser/Chromium nodes are not fully wired and fail closed. MJ does not bundle a browser.
- The WebView has no filesystem. `node:fs` / `node:os` calls throw with a stated reason rather than
  returning an empty result; filesystem work belongs in the desktop build or behind the `fs_*` IPC
  commands.
- Evolution fitness is heuristic unless the Python bridge scores it (it does ship, under
  `vendor/evolution-service`).
- The frontend build stack is 1–2 majors behind current: React 18 → 19, Vite 6 → 8, TypeScript
  5 → 7. Runtime dependencies (Tauri 2.11.5, `@tauri-apps/api` 2.11.1, zustand 5.0.15) are current.
- `vendor/hermes-agent` ships pruned to the skill contract, hooks and `skill_utils`; it is not the
  full upstream tree.

---

## License & Copyright

MJ Desktop v11.8.5 — Copyright © 2024-2026 Sree Harshen / MJ Project. All Rights Reserved.

This software is **PROPRIETARY**. The source is made visible on GitHub for the Author's review, for
demonstration to evaluators and interviewers, and for portfolio purposes. **Visibility ≠ license.**
See [`LICENSE`](LICENSE) for full terms.

Third-party engines under `vendor/` remain under their own licences — MIT and Apache-2.0 — detailed
in [`NOTICE`](NOTICE).
