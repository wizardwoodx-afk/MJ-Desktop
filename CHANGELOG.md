# Changelog

All notable changes — one line per release, with the bug that was fixed.

| Version | What changed |
|---|---|
| **11.9** | NTH visual system + canvas integrity: de-vendored the external agent (hermes removed, ~12 MB), added the `nth` default palette (obsidian + electro-violet volt + plasma pulse — 5 rare colours, no brown), volt-junction icons, percussive entrance/press motion, layout alignment; and fixed the canvas — wires now re-measure onto ports after a drag/drop (port geometry uses rendered bounding boxes), nodes own their stacking context so an overlapping node never exposes a behind node's ports, ports sit inside the card edge, minimap repositioned, node sizing tuned. Version 11.9 across all manifests. |
| **6.0** | Agent runtime × identities × reusable teams |
| **7.0** | Real verification + git layer, replay/evals, Proof page |
| **8.0** | Version metadata + reviewer-visibility fix |
| **9.0** | Reviewer snapshot against writers' branches |
| **10.0** | Replay, evals, git, Proof page + `nothing` theme pass |
| **11.3** | Inscription pass — tokens, real fonts, mechanical motion |
| **11.4** | Teams loop audit (praise-drain + arms suppression), palettes, signal diet |
| **11.5** | Meridian — icon grammar, node contracts, Assist redesign |
| **11.6** | Connector — 25-harness registry, custom harnesses, Connect tab |
| **11.7.0** | Fixed vacuous harness gate (`ok()` args reversed since 11.6) — 5 latent defects surfaced |
| **11.7.1** | Offline gate (`verify/run.mjs` 39 bundles + `MANIFEST` + suite #40 freshness) + 4 harnesses (21→25) |
| **11.8.0** | Turn-limit truth — `withTurnLimit()` now capability-driven, claude `--max-turns` docs-grade |
| **11.8.1** | Env-hardening — EACCES/EPERM/ENOEXEC → UNMEASURED, exit-code-first verdict |
| **11.8.4** | Vendoring — ships `vendor/*` (hermes-agent pruned, mcp-servers, mcp-github, evolution-service) + browser stubs (`fs/os/path` → honest throws) |
| **11.8.5** | CI-currency (ubuntu-24.04/macos-15/Node22, 40-suite gate) + typed `MjCommands` registry, zero `as never` in `src/` |
| **11.8.5(i)** | Deep type pass — `PersistedMissionState` concrete types, `methodFor`/`composeAssignment` narrowed, `workflowGet: WorkflowRecord` |
| **11.8.7** | De-vendored the external agent — removed `vendor/hermes-agent` + `vendor/hermes-agent-self-evolution` (~12 MB / 633 files). Skill contract, parsing, and the evolution fitness/constraints engine are now MJ's own TypeScript. `NOTICE`/`VENDOR.md` updated; only the two runtime MCP server sets remain vendored. |
| **11.9.1** | Release-packaging + provenance: the previous 11.9.0 archive shipped `verify/suites/` empty (a 0/0 vacuous green gate) and a stale docs/`BUILD-INFO.txt` (11.8.5) and `DEEP-DEBUG-REPORT.md` title. 11.9.1 regenerates the offline pack from the 11.9.1 source (39 bundles), rewrites `BUILD-INFO.txt` for 11.9.1, corrects the report title and reconciles its stale "still open" type-hole section (those are closed via the typed `MjCommands` registry), and fixes README vendor/history drift. All gates green: `tsc` 0, 40/40 live probes, 39/39 offline, `vite build` 0. |
| **11.9.2** | Verification toolchain + provenance: the offline pack is now built and verified under **Node 22** (`v22.23.2`) — the same supported LTS line CI pins — instead of EOL **Node 20** (which reached end-of-life 2026-04-30 and must not certify a release). `verify/BUILD-INFO.txt` records Node 22 and notes Node 20 is EOL; `docs/VERIFICATION.md` tier line updated to 11.9.2. All 39 bundles rebuilt from the 11.9.2 source; independent SHA-256 recompute 39/39 match; gate under Node 22: `tsc` 0, 40/40 live probes (incl. `offlinePack` freshness + `versionDrift`), 39/39 offline, `vite build` 0. |

Full per-release notes live in [docs/history/](docs/history/).
