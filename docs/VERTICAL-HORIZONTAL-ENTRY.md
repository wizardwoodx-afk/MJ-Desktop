# MJ — Entering Verticals & Horizontals (how the product line connects)

> How MJ grows without becoming "another agent platform." The rule: **one engine,
> two directions.** Horizontals are new product lines built from primitives MJ already
> ships (each = a module + a probe + a surface). Verticals are the SAME engine pointed
> at one compliance regime and one buyer, with a thin bundle layer on top.

---

## 1 · The architecture that makes this cheap

MJ's engine is already layered so horizontals and verticals reuse everything:

```
ENGINE (unchanged for every entry)
  custody / capability / egress / ledger / verifyGate / receipts / lessons
  └─ probe-pinned: 71 live suites, 70 offline bundles, byte-identical pack

HORIZONTAL PRODUCT LINES (modules + probes + receipts)
  Arena Gate (11.14.7, built)      → pre-run hostile battery, digest on receipts
  Agent Black Box (flight recorder + replay + containment)
  MCP Tool Admission (signed manifests, call budgets, drift refusal)
  Live Agent Registry (continuous AIBOM + drift alerts)

VERTICAL BUNDLES (same engine + one thin profile)
  Regulated engineering   fintech / insurance / health-IT
  Security / agent IR     CISO buyers
  Air-gapped / gov        offline-first deployment
  Indian enterprise       DPDP data-residency narrative
```

**The connection rule:** a horizontal never forks the engine — it adds a module,
a probe suite, and a receipt shape, and the existing drift gates keep everything
consistent. A vertical never forks a horizontal — it is a **profile** (config +
branding + compliance mapping + pilot collateral) over the same engine.

---

## 2 · The four horizontals and how each connects to what exists

| Horizontal | Primitives already in MJ (11.14.7) | Build = connect these | Receipt/shape it adds |
|---|---|---|---|
| **A. Agent Black Box** | `flightRecorder.ts`, `replay.ts`, `checkpoints.ts`, egress ledger, SIEM/OTLP export, Executions/Audit pages | Incident view: receipt → replay → authority timeline → one-click **contain** (revoke + freeze) | `incident-forensics` receipt |
| **B. MCP Tool Admission** | `McpPage`, `control_mcp.rs`, ACP/MCP bridges, envelope engine, approval queue | Signed tool manifests (hash + description pin), per-tool call budgets, drift = refusal in words | `tool-admission` receipt |
| **C. Arena Gate (built 11.14.7)** | `arenaGate.ts` attacks custody/capability/egress/verifyGate/ledger | Next layer: prompt-fuzz vectors through live harnesses + pre-flight card on mission planning | gate digest already on the report |
| **D. Live Agent Registry** | `aibom.ts`, role board, harness registry, receipts | Continuous inventory from receipts + owner-of-record + drift alerts → SIEM/GRC | continuous AIBOM |

Each horizontal becomes a separately pitchable product line (e.g. "MJ Flight Deck"
= A + C) while sharing 100% of the engine — which is exactly the story preseed
investors understand: one moat, multiple surfaces.

---

## 3 · The verticals and the exact entry sequence

| Vertical | Why it connects to MJ's engine today | First horizontal to lead with | First real step (this quarter) |
|---|---|---|---|
| **Regulated engineering** (fintech/insurance/health-IT) | Evidence packs already map to EU AI Act / ISO 42001 / SOC 2; local-first answers data residency | **C → A** (prove the gate, then the black box) | 3 design partners run real missions on real machines; collect signed receipts as pilot artifacts |
| **Security teams / agent IR** | CISO pain is quantified (92% no agent-identity visibility); arena + black box answer "what did the agent do?" | **A → D** (forensics first, registry second) | Threat-model one agent workflow; export one incident replay to their SIEM |
| **Gov / air-gapped** | Offline verification pack + no-phoning-home is a *feature*, not a limitation | **D + offline pack** | Self-contained demo on an air-gapped laptop |
| **Indian enterprise (DPDP)** | Data-residency story + Chennai presence; DPDP pushes transfer minimization | **C → B** (gate, then tool admission) | Pilot with one data-heavy regulated firm; DPDP clause as the wedge |

**Entry do's:** lead every pitch with the problem pillar (verification / privacy /
learning / adaptation), demo the Arena Gate as "our own guards are attack-tested
before every run," and price the vertical bundle, not the engine.

**Entry don'ts:** do NOT build a cloud SaaS plane yet (protocol is proven; transport
is the next milestone); do NOT bolt on dev-facing evals dashboards (crowded); do NOT
fork the engine per customer — a fork is how this moat dies.

---

## 4 · What "connect" means concretely for a new vertical today

To enter a new vertical you do NOT write new governance code. You:
1. **Pick the horizontal** the buyer's problem maps to (table above).
2. **Run the engine's gates** on their machine (71/71 live, 70/70 offline — the
   offline pack is your trust demo: it runs with zero installs on an air-gapped box).
3. **Point the problem map** (docs/PROBLEM-FOCUS.md) at their regulation: swap the
   compliance crosswalk in the evidence pack, keep the receipts engine untouched.
4. **Collect pilot evidence** — real missions, real receipts — and let that be the
   preseed artifact.

The engine is the moat; the vertical is the door. 11.14.7's Arena Gate is the first
horizontal built from that rule — module + probe + digest, engine untouched.
