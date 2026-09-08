# Verifying an MJ release

MJ ships its verification with it. There are two tiers — use the deepest one
your environment allows.

## Tier 1 — offline, zero install (any machine with Node.js)

From the extracted release tree:

```
node verify/run.mjs
```

This executes the 73 runtime probe suites as self-contained bundles — no `npm ci`,
no network, no `node_modules`. Expected tail:

```
OFFLINE VERIFY SUMMARY: 73 passed, 0 failed.
```

~30 seconds. The bundles are byte-pinned: `verify/MANIFEST.json` carries a sha256
per bundle, and in a dev environment the `offlinePack` suite fails the gate if a
fresh rebuild is not byte-identical to the shipped pack.

## Tier 2 — full toolchain (where `npm ci` works)

```
npm ci
npm run typecheck     # tsc --noEmit, exit 0
npm test              # 74 suites (73 runtime + the offline-pack freshness gate)
npm run build         # vite production build, exit 0
```

`tsc --noEmit` and `vite build` need the dev dependencies (React types, the Tauri
API surface) — that is exactly why Tier 1 exists: the runtime gate does not.

## What each tier proves

| Claim | Tier 1 | Tier 2 |
|---|---|---|
| The 73 runtime probe suites pass (incl. the 270-assertion harness suite) | ✔ | ✔ |
| The offline pack is byte-fresh (rebuild == shipped) | pinned by MANIFEST | ✔ (offlinePack suite) |
| TypeScript compiles clean | — | ✔ |
| Production web build succeeds | — | ✔ |

## What 11.12.x → 12.0.0 added to the gates

- **#61 mosaicAlign** (11.12.0) — predictions-are-not-evidence, proof-carrying
  actions, causal retrieval, mosaic rotation.
- **#62 varkhaAlign** (11.12.1) — SCAR-first retrieval, write asymmetry,
  attenuated envelopes, step-repetition signal, ablation clarity, and the
  cryptographic packet-boundary check at the executor.
- **#63 governanceAlign** (11.12.3) — human-only root principals enforced,
  ledger write matrix enforced at the store boundary (`saveLessons`,
  `saveSkills`, `saveBeliefs`, `saveImprovement`).
- **#64 differentiatorAlign** (11.13.0, 22/22 in 11.14.1+) — budget authority
  (envelope-carried USD caps, executor-checked against charged spend) and the
  proof dossier (digest-stamped export, `verifyProofDossier`).
- **#65 guardrailAlign** (11.14.1, 15/15 in 11.14.3) — code-level guardrails.
- **#66 patternAlign** (11.14.1) — pattern provenance, 9/9.
- **#67 egressAlign** (11.14.1) — egress authority + receipts, 8/8.
- **#68 capabilityAlign** (11.14.1, 26/26 in 11.14.3) — capability-not-data,
  Privacy Guard, durable budget.
- **#69 twoNodeAlign** (11.14.3) — two-machine proof, 13/13. The relay's own
  log is inspected: identity, request, authorization, receipt — zero raw
  record values.
- **#70 arenaGate / #71 arenaWired** (11.14.7 / 11.14.8, 22/22 and 15/15) —
  the governance arena: hostile scenarios attack MJ's own boundaries, and the
  battery gates the real mission path (a REFUSED arena aborts before
  dispatch; the PASS stamp rides the proof receipt).
- **#72 navAlign** (11.14.10 → re-pinned 12.0.0, 32/32) — the map is the
  product: PageKind == the five 12.0 doors, Engine/Verify/System groups in
  order, App routes exactly the map, the Loop page imports the engine module
  and no fragment store, and the page's phase rail equals the engine's arc.
- **#73 versionDrift** (40/40 in 11.14.11) — every manifest says the same
  release, operational-doc titles are patch-aware, and every operational
  doc's body is free of tokens naming any other release.
- **#74 missionLoop** (12.0.0, 56/56) — the ONE-ENGINE proof: a real gated
  team run heals across cycles. Three measured failing cycles produce a
  seat candidate from evidence; a human REJECT is recorded and changes
  nothing (the seat keeps failing — no pretend learning); a human ACCEPT
  applies a superset instruction edit; the next cycles complete verified;
  one signed receipt per cycle, bandit pulls accumulate, the cycle ledger is
  one ordered spine, OFF mode records telemetry but proposes nothing.

## Provenance

`verify/BUILD-INFO.txt` records the exact toolchain and the verbatim gate output
this pack was built and certified with.

## Why this exists

A release archive ships without `node_modules`; `npm ci` needs the network and a
bare `tsc` dies on missing React types before producing a usable exit code. Since
11.7.1 the gate itself is a shipped artifact, so "the tests pass" is something a
reviewer can execute, not a claim.
