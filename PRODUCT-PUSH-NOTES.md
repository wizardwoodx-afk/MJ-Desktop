# Product Push — every change in this working tree (review before commit)

Date: 2026-09-09 · All gates re-run after the changes: **tsc clean · 75/75 probes ·
offline pack rebuilt (74 fresh bundles) · offline runner green.**

## 1 · CI fix (the red Linux/macOS "Probes" step)

Root cause analysis: `offlinePack.test.ts` is the heavy tail — it rebuilds all 74
bundles sequentially and then runs the whole offline pack inside one suite. On a loaded
runner the suite's TOTAL time can exceed the 120s per-suite watchdog (reproduced once
locally under load; the suite itself passes when not loaded, so it reads as a flake).

- `.github/workflows/ci.yml`
  - `MJ_PROBE_TIMEOUT_MS: "300000"` on the Probes step (per-suite watchdog headroom).
  - `set -o pipefail` + `npm test 2>&1 | tee probe-run.log`, and an always-on artifact
    upload of `probe-run.log` so a red run is debuggable forever.
  - A `git config --global user.name/email` step before probes (belt-and-braces for the
    git-driving suites on bare runners).
- `.github/workflows/release.yml` — same timeout env + git identity before the
  verify gate. (`npm test` string kept — versionDrift asserts it.)
- `tools/run-all-probes.mjs` — default watchdog raised 120s → 300s
  (`MJ_PROBE_TIMEOUT_MS` still overrides).

Decision: Linux/macOS jobs were NOT removed. Multi-OS verification is a diligence
asset; the fix addresses the cause instead.

## 2 · Security hardening (from the independent audit)

- Receipt-issuer Ed25519 private key now **seals into the OS keychain on the native
  desktop** (was: webview localStorage only). Browser edition and probe runs keep the
  deterministic localStorage path; keychain write is best-effort with honest fallback.
  Files: `src/mission/signing.ts`, `src/ipc/client.ts` (typed `secret_get` + `secretGet`),
  `src-tauri/src/commands.rs` (new `secret_get` command), `src-tauri/src/lib.rs` (registered).

## 3 · Dev-machine leftovers removed

- `src-tauri/src/commands.rs`:
  - `browser_dir()` default is now portable (`%LOCALAPPDATA%\MJ\mj-browser` on Windows,
    `~/.local/share/mj/mj-browser` elsewhere; `MJ_BROWSER_DIR` still wins).
  - Dropped `D:\Node24\node.exe` / `D:\Node.js\node.exe` from the Node-runtime search
    (standard Program Files paths remain).
  - The browser-attached error message no longer references `D:\mj-browser`.

## 4 · Product voice / docs

- `README.md`: fixed the duplicated header (`## Verification## Verification` →
  `## Verification`) and added a one-line positioning banner. Version strings and all
  drift-gated counts untouched.
- NEW `docs/POSITIONING.md` — market map (researched Sep 2026, sources linked), the
  whitespace, category claim ("Agent Assurance"), ICP/wedge.
- NEW `docs/UNIQUE-FEATURES.md` — 8 differentiated features mapped to existing code
  with honest effort tags and sequencing.
- NEW `docs/PRESEED-PITCH.md` — the 30-second pitch, problem, insight, why-now,
  business model, diligence artifacts, ask, funding-landscape table.
- NEW `PRODUCT-PUSH-NOTES.md` — this file.

## 5 · Regenerated

- `verify/suites/*` + `verify/MANIFEST.json` — rebuilt from the new source by
  `tools/build-offline-verify.mjs` (the offlinePack freshness gate demands this after
  any source change — it caught exactly this).
- NOTE for next release: regenerate `verify/BUILD-INFO.txt` under your certifying
  Node (22.23.2) so the provenance block reflects the new certification run.

## Not changed (deliberate)

- `runs-on` labels (versionDrift pins them), `npm test` gate shape, suite/bundle counts,
  LICENSE, version numbers. The offline pack rebuild keeps 74 bundles / MJ 13.5.1.
