# MJ 14.1.3 — Platform limits

Known environment-specific limits, documented so they are never mistaken for
regressions.

## Declared but not built

Two capability nodes exist on the canvas that this release does not implement. They
are stated here rather than left to imply behaviour:

- **Schedule (`cap.cron`)** — holds a cron expression. MJ ships no scheduler, so
  nothing fires on it. Running the node refuses with that reason instead of emitting
  a tick no scheduler produced.
- **Webhook (`cap.webhook`)** — holds a URL. There is no sender: nothing is signed,
  nothing is delivered, and the node refuses rather than reporting a delivery.

Before 14.1.3 both fell through the capability runner's pass-through return and
reported `NODE_SUCCEEDED` having done nothing — the same silent fake `cap.http`
explicitly refuses. `probe/meridian.test.ts` now fails the build if any capability
the runner refuses still claims `(built in)` in its method text.

`Vector Memory (cap.vector)` *is* built, and its method text was corrected to match
what it does: a substring match over the node's memory store ordered by importance —
keyword recall, not embeddings or nearest-neighbour search.

## The browser is an external service

MJ does not bundle or launch Chromium. `browser_act`, `browser_navigate`,
`browser_screenshot` and `browser_console` forward over loopback to a separate local
service (the `mj-browser` directory, `MJ_BROWSER_DIR`), which is **not part of this
repository**. Without it every browser call fails closed with
`notAttached: true` and a reason, the Browser screen says so, and `cap.browser`
throws instead of reporting success. The agent-browser surface is therefore
unavailable on a fresh checkout until that service is installed.

`playwright` and `puppeteer-core` were removed from `package.json` in 14.1.3: neither
had a single call site in this tree, and a 50 MB browser dependency in the manifest
implied a capability the build did not have.

## Web (browser) edition

Agent execution and git operations require a host OS; on a static web host those
surfaces run MJ's labelled `local-test` double. Every event, artifact and UI surface
it produces carries `simulated: true`, and a mission that used it finishes
`BLOCKED`, never `COMPLETED`. Signing, receipts, the vault, the gate and the merge
logic are the same real code in both editions.

## Windows

Four probe suites are environment-specific on Windows and are treated as such in CI
rather than failures:

- Linux sandbox wrappers cannot run on Windows.
- Windows filename rules differ (the wrapper-permission probes assume POSIX).
- Smoke tests need a real coding CLI binary on PATH.

All other suites pass identically; see `docs/history/MJ-11.8.1-WINDOWS-CI.md` for
the recorded run.

## This development environment

The release gates (tsc, probes, offline pack, vite build) run on Node 22 in this
environment; the Rust/Tauri shell compiles in CI and on any machine with a Rust
toolchain (`cargo check --all-targets`), not here.
