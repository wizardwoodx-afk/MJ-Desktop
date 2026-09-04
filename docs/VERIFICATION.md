# Verifying an MJ release

MJ 11.9.2 ships its verification with it. There are three tiers — use the deepest one
your environment allows.

## Tier 1 — offline, zero install (any machine with Node.js)

From the extracted release tree:

```
node verify/run.mjs
```

This executes all 39 runtime probe suites (the same suites `npm test` runs, minus the
pack's own freshness gate) as self-contained bundles — no `npm ci`, no network, no
`node_modules`. Expected tail:

```
OFFLINE VERIFY SUMMARY: 39 passed, 0 failed.
```

~25 seconds. The bundles are byte-pinned: `verify/MANIFEST.json` carries a sha256 per
bundle, and in the dev environment suite #40 (`probe/offlinePack.test.ts`) fails the
gate if a fresh rebuild is not byte-identical to the shipped pack.

## Tier 2 — full toolchain (where `npm ci` works)

```
npm ci
npm run typecheck     # tsc --noEmit, exit 0
npm test              # 40/40 suites (39 runtime + the offline-pack freshness gate)
npm run build         # vite production build, exit 0
```

`tsc --noEmit` and `vite build` genuinely need the dev dependencies (React types, the
Tauri API surface) — that is exactly why Tier 1 exists: the runtime gate does not.

## What each tier proves

| Claim | Tier 1 | Tier 2 |
|---|---|---|
| The 39 runtime probe suites pass (incl. the 270-assertion harness suite) | ✔ | ✔ |
| The offline pack is byte-fresh (rebuild == shipped) | pinned by MANIFEST | ✔ (suite #40) |
| TypeScript compiles clean | — | ✔ |
| Production web build succeeds | — | ✔ |

## Provenance

See `verify/BUILD-INFO.txt` for the exact toolchain and the verbatim gate output this
pack was built and certified with.

## Why this exists

The 11.7.0 review honestly reported it could not certify the runtime test result
offline: the zip ships no `node_modules`, `npm ci` needs the network, and bare `tsc`
dies on missing React types before producing a usable exit code. MJ 11.7.1 makes the
gate itself a shipped artifact.
