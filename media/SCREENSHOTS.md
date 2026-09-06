# MJ 11.10.6 — Screenshots

Captured 2026-09-06 from the **real, running application** (headless Chromium at 2× resolution
against `vite dev` serving this exact source tree). No mocks, no design-tool comps — every pixel
below is the product itself. The Web edition labels in-browser agent execution honestly; several
shots show that honesty on purpose (offline-draft tags, gate FAIL chips, "nothing was charged").

| File | Screen | What it shows |
|---|---|---|
| `screenshots/01-home-workstation.png` | Home | Workstation home: live counts (workflows, templates, 256 Hermes agents, 35 frameworks), recents, hand-authored template gallery. |
| `screenshots/02-canvas-security-audit.png` | Canvas | Visual workflow canvas with the Security Audit template: typed ports, wires, judge + human-approval + end nodes, agent library panel. |
| `screenshots/03-assist-custom-node.png` | Assist (V11) | One plain-text request → exactly one custom node, inserted and labelled `offline draft` because no local model was reachable. "Nothing pretends to be AI that is not." |
| `screenshots/04-teams-crews.png` | Teams | CLI Agent Crews: sample 3-seat team (planner/coder/reviewer), per-seat policy diagnostics, worktree & review-snapshot isolation architecture. |
| `screenshots/05-team-mission-runner.png` | Runner | Team Mission Runner after a run with no harness present: adversarial gate FAIL, merge blocked, "nothing was executed and nothing was charged", receipt still issued to vault. |
| `screenshots/06-mission-control.png` | Mission Control | Live fleet board (per-seat status, harness, last event), measured cost ledger, human approval inbox with APPROVE / REJECT. |
| `screenshots/07-proof-compliance.png` | Proof | Receipt & Compliance Center: Ed25519-signed hash-chained receipt on file, retention floor, SIEM / evidence-pack / AIBOM exports, external verify. |
| `screenshots/08-command-palette.png` | Palette | Ctrl+K command palette with grouped results (jump-to-node, templates) and its honest empty state when nothing exists to offer. |

Capture tooling: Playwright + Chromium, `deviceScaleFactor: 2`, 1600×1000 viewport, WABI theme (default).
