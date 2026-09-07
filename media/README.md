# Media

Product assets captured from this source tree.

## Screenshots (`screenshots/`)

2× headless-Chromium captures, 1600×1000 viewport, default **wabi** theme unless
noted.

| File | Screen |
|---|---|
| `01-home.png` | Workstation home: live counts, recents, template gallery |
| `02-canvas.png` | Workflow canvas, grouped sidebar, closed library drawer |
| `03-teams.png` | CLI agent crews with per-seat policy diagnostics |
| `04-mission-control.png` | Fleet board, measured cost ledger, approval inbox |
| `05-proof.png` | Receipt vault, retention floor, SIEM / evidence-pack / AIBOM export |
| `06-command-palette.png` | Ctrl+K, grouped fuzzy-ranked results |
| `07-daylight-home.png` | Home in the paper-light daylight theme |
| `08-daylight-canvas.png` | Canvas in the daylight theme |

## Demo recording

`demo-recording.mp4` — a 29-second walkthrough of this tree: home, canvas with the
library drawer open/close cycle, command palette, Teams, Mission Control, Proof.
Recorded with headless Chromium (`recordVideo`) plus a cursor overlay drawn at
capture time, converted to H.264. Plays directly on GitHub.

## Documents

- `MJ-product-brief.pdf` — one-page landscape product brief.
- `MJ-Pitch-Deck.pptx` — investor deck.

Everything here is reproducible from this tree with `npm run dev` and Playwright.
