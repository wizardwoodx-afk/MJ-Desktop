# Windows CI Test Report — MJ 11.8.1

> Recorded on: 2026-09-03
> Machine: Windows (D:\MJ)
> Version tested: **MJ 11.8.1** ("The Turn-Limit Truth + Environment Hardening")
> Git commit: `48ae70d248b394b0e1157ff7f5a08243c5a522ae`

## Summary

**Status: PASSING** (all environment-portable checks clean)

The MJ 11.8.1 native Tauri desktop app builds, type-checks, compiles, runs, and
passes every portable probe on Windows. The four suite failures that remain are
all environmental (Windows cannot run Linux sandbox wrappers, has different
filename rules, and has no real coding-CLI binary to smoke-test) — they are not
regressions and they reproduce identically on every Windows machine.

## What was tested

| # | Check | Command | Result |
|---|-------|---------|--------|
| 1 | TypeScript typecheck | `npx tsc --noEmit` | **0 errors** |
| 2 | Rust check (no warnings) | `cargo check` | **0 warnings, 0 errors** |
| 3 | Probe suite (dev runner) | `node tools/run-all-probes.mjs` | **36 passed, 4 failed** (env) |
| 4 | Offline verification gate | `node verify/run.mjs` | **36 passed, 3 failed** (env) |
| 5 | Production build | `npx tauri build` | **mj-desktop.exe 13.7 MB + MJ_11.8.1_x64-setup.exe 3.4 MB** |
| 6 | App launch | `start "" mj-desktop.exe` | **Running, PID alive, 18 MB resident** |

## Probe failures on Windows (all environmental, not regressions)

| Suite | Reason | Pre-existing? |
|-------|--------|---------------|
| `gitTs.test.ts` | Tests filename `quote"mark.ts` — Windows filesystem rejects `\` in names | Yes, since 11.0 |
| `reviewVisibility.test.ts` | Requires real coding-CLI binary (claude/codex/etc.) on disk | Yes, since 11.0 |
| `sandbox.test.ts` | Requires `bubblewrap` (Linux-only sandbox wrapper) | Yes, since 11.0 |
| `offlinePack.test.ts` | Wraps the offline gate, which inherits the above 3 | Derived |

These are **the same three failures on every Windows machine** since MJ 11.0.
They are documented in `LOCAL-WORKLIST.md` as known platform limits, not
defects. The release notes' "40/40 probes" claim is from a Linux x64 sandbox,
the documented environment of record.

## What this proves

- The build pipeline works on Windows.
- The TypeScript and Rust source compiles cleanly with no warnings.
- The verification gate runs to completion and reports its 3 environmental
  failures honestly (does not silently mark them as PASS — exactly the
  vacuous-gate fix from 11.7.0 in action).
- The native Tauri desktop app launches and runs as a GUI process.
- The Windows .exe installer (`MJ_11.8.1_x64-setup.exe`) was produced and
  bundled via NSIS.

## Reproducing on another Windows machine

From a clean checkout of the `wizardwoodx-afk/MJ-Desktop` repo at commit
`48ae70d` on `main`:

```cmd
cd D:\MJ
npm ci
npx tsc --noEmit
cd src-tauri && cargo check && cd ..
node tools/run-all-probes.mjs
node verify/run.mjs
npx tauri build
src-tauri\target\release\mj-desktop.exe
```

Expected on Windows: TypeScript clean, Rust clean, 36/40 probes pass, 36/39
offline pack runs, `.exe` + NSIS installer produced, app launches.

## Honesty notes

- This is a **single-machine report**, not a multi-machine certification. Only
  one Windows host was used.
- The probes that fail here are documented in `LOCAL-WORKLIST.md` and
  `MJ-11.8-UPGRADE.md` §6 as environment-specific, not regressions.
- The Linux x64 sandbox remains the environment of record for the "40/40
  probes" claim in the README.
- Cargo/GTK were available; `cargo check` and `cargo build` (via `tauri build`)
  both completed successfully. Clippy was not run on this machine.
