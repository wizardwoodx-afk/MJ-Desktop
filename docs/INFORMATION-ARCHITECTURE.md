# MJ — Information Architecture: One Product, One Spine (11.14.10)

> 11.14.10 is the **Consolidation Release**. Before it, MJ read like fourteen
> mini-apps stapled together — each destination had grown in its own release,
> with its own nickname ("Canvas", "Control", "Observe", "MCP"…), its own
> corner of the sidebar, and no shared model of what the product is for.
>
> MJ is ONE product with ONE spine — the agent-work lifecycle —
> and every feature in the app belongs to exactly one stage of it.

---

## 1 · The spine (the mental model everything hangs off)

```
OVERVIEW → BUILD → RUN → VERIFY → LEARN → SYSTEM
   |         |       |       |        |       |
 start    design  execute   prove   improve  connect
```

The same spine that organizes the sidebar organizes the product story
(PROBLEM-FOCUS), the receipts (`mission → gate → proof`), and the
navigation map (`src/app/nav.ts`, the single source of truth). One model,
every surface.

## 2 · The six groups and their destinations

| Group | Destination (key · public label) | What it is FOR (purpose, not internals) |
|---|---|---|
| **Overview** | `home` · Home | Your workspace overview — the problem MJ solves, recent workflows, where to start. |
| **Build** | `workflow` · **Workflows** *(was Canvas)* | Design the work: visual agent workflows — typed ports, templates, checkpoints, auto-layout. |
| | `teams` · Teams | Compose the workforce: agent fleets from 25+ harnesses or any binary, with roles, policies, budgets. |
| **Run** | `missions` · Missions | Execute the work: plan and run missions on real agent harnesses — measured, gated, receipted. |
| | `control` · **Mission Control** *(was Control)* | Supervise the work: live fleet board — heartbeats, cost ledger, approval inbox, human overrides. |
| | `executions` · Runs | Account for the work: every execution's record — outcomes, measured spend, gate verdicts. |
| | `observability` · Observe | Watch the work: live telemetry — OTLP traces and events showing what agents did, as it happens. |
| **Verify** | `proof` · Proof | Prove the work: the signed receipt vault — tamper-evident evidence, verifiable with zero MJ state. |
| | `audit` · Audit | Answer for the work: the compliance view — guardrail manifest, ledgers, egress and capability demos. |
| **Learn** | `evolution` · Evolve | Improve the work: lessons, skills, beliefs and strategy experiments — measured, human-approved. |
| **System** | `mcp` · **Connectors** *(was MCP)* | Connect the work: managed MCP servers under validation and policy. |
| | `browser` · Browser | The agent's sandboxed browser — isolated sessions, full navigation log. |
| | `providers` · Providers | Model providers and keys used by Assist and local-model paths. |
| | `settings` · Settings | Licensing, palettes, retention, gate policy — the product's preferences. |

Every key is a stable identifier; every label is public vocabulary. The map is
`src/app/nav.ts`; the page switch lives in `App.tsx` and renders ONLY from it;
`probe/navAlign.test.ts` (30 assertions) fails the build if a page is orphaned,
a group drifts from the lifecycle order, a legacy label returns, or App forks
its own nav again.

## 3 · The rename table (legacy mini-app names → product vocabulary)

| Internal / legacy | Public label | Why |
|---|---|---|
| Canvas | **Workflows** | The destination is the object model (workflows), the canvas is its editor. |
| Control | **Mission Control** | "Control" alone was ambiguous; this is the fleet board with approvals + cost ledger. |
| MCP | **Connectors** | The buyer-facing concept is connecting tools, MCP is the protocol underneath. |
| Workspace / Fleet / Proof / System (old groups) | Overview / Build / Run / Verify / Learn / System | Old groups mixed jobs (Proof group contained Evolve); the new groups are one lifecycle, read top to bottom. |

## 4 · Design principles (researched 2026-09-07, applied here)

1. **Content-first IA** — structure follows the work a user is doing, not the
   org chart of features that built it ([slickplan, IA trends 2026](https://slickplan.com/blog/information-architecture-trends)).
2. **Clear, consistent labeling** — one name per destination, no internal
   codenames in the rail; labels extend to tooltips that state *purpose*
   ([slickplan](https://slickplan.com/blog/information-architecture-trends)).
3. **Agent UX = accountability surfaces** — run, observe, prove and audit are
   first-class stages because supervising agents *is* the product, not an
   afterthought ([fuselab, agent UX 2026](https://fuselabcreative.com/ui-design-for-ai-agents/)).
4. **No orphan features** — every feature lands on an existing destination or
   opens a new one *in the map*; a page without a nav entry is a product
   decision nobody made (enforced by `probe/navAlign`).
5. **One model on every surface** — the spine is the same in the sidebar, the
   Home hero, PROBLEM-FOCUS, and the receipts story; repetition builds trust.

## 5 · What consolidation means for future releases

- **A new feature** first answers: which destination does it belong to?
- **A new destination** first answers: which lifecycle stage is missing it —
  and only opens after the map, the page switch, and navAlign all move together.
- **A rename** is one edit in `nav.ts` plus its probe expectations — never a
  hunt through the codebase.
- The Home hero (11.14.5, problem-first) now speaks the same pillars the
  spine names: verification, learning from feedback, data staying local,
  signed evidence — pinned by navAlign §4.
