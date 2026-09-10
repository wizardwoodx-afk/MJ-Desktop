# Verifying an MJ release

MJ ships its verification with it. There are two tiers — use the deepest one
your environment allows.

## Tier 1 — offline, zero install (any machine with Node.js)

From the extracted release tree:

```
node verify/run.mjs
```

This executes the 87 runtime probe suites as self-contained bundles — no `npm ci`,
no network, no `node_modules`. Expected tail:

```
OFFLINE VERIFY SUMMARY: 87 passed, 0 failed.
```

~30 seconds. The bundles are byte-pinned: `verify/MANIFEST.json` carries a sha256
per bundle, and in a dev environment the `offlinePack` suite fails the gate if a
fresh rebuild is not byte-identical to the shipped pack.

## Tier 2 — full toolchain (where `npm ci` works)

```
npm ci
npm run typecheck     # tsc --noEmit, exit 0
npm test              # 88 suites (87 runtime + the offline-pack freshness gate)
npm run build         # vite production build, exit 0
```

`tsc --noEmit` and `vite build` need the dev dependencies (React types, the Tauri
API surface) — that is exactly why Tier 1 exists: the runtime gate does not.

## What each tier proves

| Claim | Tier 1 | Tier 2 |
|---|---|---|
| The 87 runtime probe suites pass (incl. the 270-assertion harness suite) | ✔ | ✔ |
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
- **#72 navAlign** (11.14.10 → re-pinned 12.0.0, 32/32 → 12.0.1, 39/39) —
  the map is the product: PageKind == the five 12.0 doors, Engine/Verify/
  System groups in order, App routes exactly the map, the Loop page imports
  the engine module and no fragment store — nor any engine internal
  (agentTeam/hostDeps/interAgentChannel: crew, bus and host deps are engine
  API since 12.0.1) — and the page's phase rail equals the engine's arc. Also
  pins the engine's own header wording (orchestration, not literal one-store
  fusion) and the presence of the explicit 1–5 rating surface on the page.
- **#73 versionDrift** (40/40 in 11.14.11) — every manifest says the same
  release, operational-doc titles are patch-aware, and every operational
  doc's body is free of tokens naming any other release.
- **#74 missionLoop** (12.0.0, 56/56 → 12.0.1, 67/67 → 12.0.2, 76/76 → 12.0.3, 80/80) — the ONE-ENGINE proof:
  a real gated team run heals across cycles. Three measured failing cycles
  produce a seat candidate from evidence; a human REJECT is recorded and
  changes nothing (the seat keeps failing — no pretend learning); a human
  ACCEPT applies a superset instruction edit; the next cycles complete
  verified; one signed receipt per cycle, bandit pulls accumulate, the cycle
  ledger is one ordered spine, OFF mode records telemetry but proposes
  nothing. 12.0.1 adds the explicit human rating arc: a 4/5 rating queues on
  every seat that ran and the next fold arms praise suppression (no invented
  criticism); a 2/5 with a comment becomes weight-2 `Human: …` evidence at
  the next fold, comment preserved; queues are consumed exactly once and the
  loop state keeps one current rating per cycle; invalid ratings and unknown
  cycles are refused without touching any store. 12.0.2 adds the integrity
  edge cases: ratings are bound to the team that ran the cycle (mismatched
  teams are refused before any store is touched, byte-identical after), and
  re-ratings before the fold supersede the unconsumed queued entry (per-run
  runId; 4→2→5 folds exactly the 5 — the superseded criticism provably never
  reaches evidence; verbatim history keeps every submission). 12.0.3 adds
  rating scope: an ABORTED cycle (engine exception path, nothing executed)
  is refused with an explicit error and touches no store; a gate-FAIL cycle
  whose seats ran stays ratable.

- **#75 knowledgeSkills** (12.1.0, 34/34 → 12.1.1, 44/44 → 12.2.0, 56/56) — the Knowledge Forge: books and
  documents distill locally into structured knowledge proposals (mechanical
  extractor core; optional LLM pass through MJ's own installed harness CLIs
  — missing/garbage harnesses degrade to mechanical with the reason written
  in, never credited to a model). Provenance is mandatory (real SHA-256,
  bytes, tool+version, distiller, time); unstructured blobs are refused
  (structure, not summaries); knowledge claims NO measured effect and never
  touches lessons/autonomy/bandit; a human decides each proposal exactly
  once, and APPROVED mirrors into skill memory as [knowledge] RECOURSE that
  rides every future mission briefing through the SAME approvedSkillDefs
  path verified-mission skills use. 12.2.0 adds provider precision on
  provider-bound proposals: `providerInfo` records vendor (the harness's
  default when unconfigured, labeled as such) plus endpoint class
  cloud-default / local-configured / unknown with an explicit basis
  detected / user-declared / not-visible and a written reason on every
  record — MJ only ever reports what it can see (host `readEnv` probe or
  the user's own declaration); the honest default for an invisible endpoint
  is unknown/not-visible, never a guess; mechanical paths keep
  providerInfo null.

- **missionRecord, evidenceSurfaces, finOps, assuranceScore,
  incidentDossier, verifierTool** (14.0–14.1) — the trust-anchor
  and economics line: missionRecord engine + per-cycle economics, the three
  Audit products (evidence surfaces), finOps (22 assertions), assurance score
  (21), incident dossier (15), standalone dependency-free verifiers (11).
  missionRecord and evidenceSurfaces report via the node:test runner.
  Measured on the 14.1.2 tree: 81/81 live, 80/80 offline.

- **drill, mcpRouter, metaLoop** (16.2–16.4) — the drill release line:
  real-mission drills on real git repos with honest-failure scenarios,
  the MCP capability router (20 governed tools over JSON-RPC stdio,
  byte-pinned engine bundle), and the gated reversible meta-loop.
  Measured on this tree: 88/88 live, 87/87 offline.

## Provenance

`verify/BUILD-INFO.txt` records the exact toolchain and the verbatim gate output
this pack was built and certified with.

## Why this exists

A release archive ships without `node_modules`; `npm ci` needs the network and a
bare `tsc` dies on missing React types before producing a usable exit code. Since
11.7.1 the gate itself is a shipped artifact, so "the tests pass" is something a
reviewer can execute, not a claim.
