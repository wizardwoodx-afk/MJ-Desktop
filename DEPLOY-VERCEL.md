# Deploying MJ 11.10.7 to Vercel (web edition)

MJ's frontend is a pure Vite + React SPA. The desktop shell (Tauri/Rust) is optional:
on any web host MJ runs as its **browser edition**, and its honesty design carries
over — the merge executor reports `simulated` instead of claiming merges, receipts are
still REAL Ed25519-signed (WebCrypto works in every modern browser), and the Evidence
Pack, vault and compliance center all work against `localStorage`.

`vercel.json`, `.vercelignore` and `.gitignore` are already in the repo. Vercel
auto-detects the Vite framework; build = `npm ci && npm run build`, output = `dist/`.

## Option A — GitHub → Vercel (RECOMMENDED for proof-of-work)

Companies get BOTH: the live app AND the code it runs on.

1. Create a (public) repository on GitHub, e.g. `mj-desktop`.
2. From this tree:
   ```bash
   git add -A
   git commit -m "MJ 11.10.7 — CLARITY: labelled sidebar, drawer fix, daylight palette"
   git branch -M main
   git remote add origin git@github.com:<you>/mj-desktop.git
   git push -u origin main
   ```
3. On https://vercel.com → **Add New → Project → Import** the repo.
   Framework preset: **Vite** (auto-detected). Leave Root Directory empty.
   Install `npm ci`, build `npm run build`, output `dist` — all pre-filled from `vercel.json`.
4. **Deploy.** You get `https://mj-desktop.vercel.app` (rename it to e.g.
   `mj-agent-orchestrator.vercel.app` under Project → Settings → Domains).

Every later `git push` auto-deploys; Vercel gives you preview URLs per branch —
useful when you want to show "here is the next iteration".

## Option B — Vercel CLI, straight from this folder

```bash
npm i -g vercel
vercel login
vercel --prod
```
`.vercelignore` keeps the upload to just the web build inputs.

## What to tell companies (30-second framing)

> MJ is an orchestrator for heterogeneous coding-agent teams (Claude Code, Codex,
> OpenCode, …) with a verification layer: isolated worktrees, review snapshots, an
> adversarial gate that requires a DIFFERENT harness than the writer to verify the
> work, and a gated merge executor that lands verified work and signs the resulting
> merge-commit sha (Ed25519). Every run issues a hash-chained proof receipt; the
> Evidence Pack exports all of it with an EU AI Act / ISO 42001 / SOC 2 crosswalk.
> The web edition you are looking at runs the full state machine in the browser;
> agent execution and git are honest-simulated here, everything else — signing,
> receipts, vault, gating logic — is the real code. 56 probe suites / 55 offline
> bundles, all reproducible from the repo (`npm test`, `node verify/run.mjs`).

## Notes

- No environment variables needed. No backend, no database — state lives in the
  visitor's browser (that is a feature for a demo: each reviewer gets their own vault).
- Node version for builds: Vercel's default Node 22 runtime matches the certifying
  runtime (v22.23.2) used for the release gates.
- The desktop edition with real agent execution still ships as the Tauri app; the
  web edition is the proof-of-work surface.
