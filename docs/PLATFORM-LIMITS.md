# MJ 13.0.1 — Platform limits

Known environment-specific limits, documented so they are never mistaken for
regressions.

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
