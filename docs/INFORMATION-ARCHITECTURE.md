# MJ 12.0.0 — Information Architecture: ONE ENGINE, five doors

*The map is the product. `src/app/nav.ts` is the single source of truth;
`probe/navAlign.test.ts` (32 assertions) makes every rule in this document
mechanical.*

## The model

MJ is one product: an engine that runs agent work as one loop —

```
COMPOSE → DISPATCH → COMMUNICATE → EXECUTE → GATE → ADAPT
```

— and five doors onto it:

| Door | Key | What it is | Where the old destinations went |
|---|---|---|---|
| **Mission Loop** | `loop` | THE ENGINE — compose a crew, run cycles, watch the bus, gate proposals, read receipts | home, teams, missions, control, executions, observability, evolution all collapsed INTO this one screen |
| **Workflows** | `workflow` | design what the engine runs | (unchanged) canvas + workflow editor |
| **Proof** | `proof` | the signed receipt vault | (unchanged) |
| **Audit** | `audit` | guardrail manifest + ledgers | (unchanged) |
| **System** | `settings` | connectors, providers, browser, preferences | mcp + browser + providers + settings folded into one door with four sections |

Groups (the public model, in order): **Engine** (loop, workflow) ·
**Verify** (proof, audit) · **System** (settings).

## Why 12.0 exists: the pre-12.0 disease

11.14.10 created the first coherent spine (Overview → Build → Run → Verify →
Learn → System) and 11.14.11 made the release metadata trustworthy. What the
reviews still saw — correctly — was that the app's *features* were separate
productions:

- **TeamsPage** carried 17 tabs (`crews`, `roles`, `channel`, `arena`,
  `astmerge`, `consensus`, `chaos`, `memory`, `failure`, `provenance`,
  `matrix`, `mockbridge`, `runner`, `evolve`, `builder`, `frameworks`…) — each
  bolted on by a different release, each presenting itself as a product.
- **EvolutionPage** was a card zoo reading **eight independent stores**
  (autonomy, lessons, selfImprove, selfEvolve, beliefs, patterns, skills,
  learningReceipts) — a learning system that looked like a museum of learning
  systems.
- The nav itself was 14 destinations; the same "fleet" concept appeared on
  three of them.

12.0 merges at the RUNTIME, not just the labels: one module
(`src/mission/missionLoop.ts`) drives the cycle and folds every measured
outcome through the same engines into one ledger (`mj.missionLoop.v1`), and
the product surface shrinks to match. Legacy feature pages remain in the
source tree only where probes still exercise them; they are **not doors** —
navAlign asserts the routes App can render are exactly the five keys.

## The 12.0 rules (each pinned by navAlign unless noted)

1. **The map is the product.** PageKind == the five doors, exactly; nav.ts
   lists each once. An orphan door is a product decision nobody made.
2. **App renders only from the map.** No second nav array; the routes App can
   render equal the map keys exactly.
3. **One engine, one API.** The Loop page imports `missionLoop` (the engine)
   and never reaches into the fragment stores (autonomyStore, lessons,
   teamEvolution, belief, selfImprove, skillEvolution, patterns,
   learningReceipt, selfEvolveRuntime, evolutionBandit, evolutionEngine) —
   nor the engine's internals (agentTeam, hostDeps, interAgentChannel, which
   became engine API in 12.0.1: loadCrews/persistCrew, loopHostDeps,
   loopBusFeed, submitHumanFeedback). A page that does is a fork of the
   engine — fork = the pre-12.0 disease.
4. **The rail is the engine.** The Loop page's phase rail is the engine's
   real phase set (compose/dispatch/communicate/execute/gate/adapt). If the
   UI narrates a lifecycle the engine does not execute, navAlign fails.
5. **Labels are the public vocabulary.** Public product names only (Mission
   Loop, Workflows, Proof, Audit, System); no mini-app labels (Canvas, Teams,
   Evolve, Connectors, MCP…) in the map.

## The rule for future releases

A feature belongs to a destination. A destination opens only when the map,
the PageKind union, the App route, the page and the probe move together — a
new door without a probe is not a feature, it is a regression in disguise.

## Release history of the IA

| Release | IA change |
|---|---|
| ≤ 11.14.9 | fourteen destinations, ad-hoc arrays, per-release labels |
| 11.14.10 | one map, six lifecycle groups, tooltips = purpose |
| 11.14.11 | hygiene: patch-aware titles + body scans (versionDrift 40) |
| **12.0.0** | **one engine + five doors; lifecycle becomes the engine's real phase rail; page imports engine only** |
| **12.0.1** | **the model stated precisely: one canonical orchestrator over the engines of record (no one-store claim); explicit human feedback (1–5 + comment) returns inside the Loop through engine API; page imports only the engine** |
| **12.0.2** | **feedback integrity: ratings bound to the team that ran the cycle; per-run supersede in the queue (one current human input per cycle, nothing accumulates); architecture frozen** |
| **12.0.3** | **rating scope: only cycles that ran are ratable (aborted refused explicitly, gate-FAIL-with-seats ratable); architecture frozen — next release is the real-world evidence program** |
| **12.1.0** | **one new card on the engine screen: Knowledge forge (books → human-approved skills) — the frozen architecture gains a capability without a new door; the forge is engine API (page imports one mission module, pinned)** |
| **12.1.1** | **forge honesty: renderer-safe byte provenance (no Node Buffer), dataHandling local|provider recorded per proposal with UI disclosure — positioning: documents → structured knowledge proposals** |
| **13.5.1** | **no IA change — the motion skill now matches the implementation (layout = transform/opacity; paint allowed for state) and is probe-pinned; design system FROZEN (INK + NATURA + skills); five doors unchanged** |
| **13.5.0** | **no IA change — the NATURA pass: design skills ship in skills/ (ui-premium-craft, ui-motion-language, node-graph-craft), natural motion vocabulary (settle/stagger/ring, reduced-motion kill-list), warm depth on the INK palettes; five doors unchanged** |
| **13.0.1** | **no IA change — INK retune: palette to true black + rare mineral signals (smoked apricot/dusty rose/whetstone/seedpod olive), premium frame (Inter body copy, airy cards, accent focus rings, Inter rail), clean-cut icons, node anatomy v2 (state on the frame, edge-straddling ports); five doors unchanged** |
| **13.0.0** | **no IA change — the OBSIDIAN production-surface finish: six palettes replace the fourteen (old prefs migrate by alias), node cards re-cut as precision plates (icon tile, category spine, breathing state lamp), ports fill when connected + reach stubs join wires to anchors, 140–280ms motion all behind prefers-reduced-motion; Assist removed (nav item, chord, panel) — the canvas keeps its five-door map untouched** |
| **12.2.0** | **provider precision on the forge: provider-bound proposals record vendor (default-when-unconfigured label) + endpoint class (cloud-default/local-configured/unknown) with explicit basis detected/user-declared/not-visible — every unknown carries its written reason; the page gains an ENDPOINT declaration select; mechanical paths keep providerInfo null; no new doors, no IA change** |
