# MJ — Differentiator Roadmap (researched 2026-09-07)

> How MJ becomes a *different* product, not a *more featured* one. Every play below is
> grounded in fresh market research and mapped against what already exists in MJ's tree —
> so the recommendation is "productize what you already proved," not "invent more."

---

## 1 · The market evidence (why now)

**The security gap is real and quantified:**
- ~**8,000 MCP servers** exposed on the public internet without authentication; tool
  poisoning, "rug pulls" (servers that alter behavior after connecting), and PII
  exfiltration at machine speed are the documented 2026 attack set
  ([Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-agent-governance-framework-gap-20260403/),
  [MCP Manager](https://mcpmanager.ai/blog/ai-security-tools/)).
- **92% of large-enterprise CISOs lack visibility into agent identities**; only **38%**
  monitor agent traffic end-to-end and **17%** continuously monitor agent-to-agent
  interactions ([CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-agent-governance-framework-gap-20260403/)).
- OWASP's **Top 10 for Agentic Applications** (2026) puts prompt injection, tool misuse,
  excessive agency, and *logging & monitoring gaps* at the top
  ([Meta-Intelligence](https://www.meta-intelligence.tech/en/insight-ai-agent-security)).
- The market is already naming the missing product: **Vorlon launched an "AI Agent Flight
  Recorder" + Action Center at RSAC 2026** — "when an AI agent is compromised today, most
  security teams have nothing" ([Vorlon](https://vorlon.io/ai-security/ai-agent-flight-recorder-action-center/)) —
  but it watches **cloud SaaS traffic**. The *local-execution* side (what the agent did on
  the machine, with whose authority, on which data) is still open.

**The eval/observability market is crowded — do NOT compete there:**
LangSmith, Braintrust, DeepEval, Arize/Phoenix, Langfuse, Maxim, Galileo, Confident AI,
W&B Weave, Truesight all own dev-facing tracing/evals ([GoodEye](https://www.goodeyelabs.com/articles/top-ai-agent-evaluation-tools-2026),
[Confident](https://www.confident-ai.com/knowledge-base/compare/best-ai-agent-observability-tools-2026)).
They are framework-locked and cloud-facing; none issues **signed, tamper-evident receipts
of local agent work with an adversarial gate**.

---

## 2 · Four feature plays (each: market → MJ-fit → build → verdict)

### PLAY A — "Agent Black Box": incident forensics & replay for local agent work ⭐ best fit
- **Market:** Vorlon proved demand at RSAC 2026; regulators expect *evidence-quality audit
  trails* (EU AI Act high-risk enforcement, Aug 2026); only 17% monitor agent-to-agent.
- **Already in MJ:** `flightRecorder.ts` (governance-tagged event stream), `replay.ts`,
  `checkpoints.ts` (restore any moment), Ed25519 receipts, egress ledger, SIEM/OTLP
  exports, Executions + Observability + Audit pages.
- **To build (productization, ~medium):** an **Incident view** — pick any receipt/mission →
  replay the exact event chain → show who authorized what, what left the machine, and a
  one-click **"contain"** (revoke envelope + rotate keys + freeze the machine's capabilities).
- **Differentiator vs Vorlon:** theirs is a cloud-SaaS watcher; MJ records *inside* the
  machine with signed authority + receipts — evidence an auditor can verify with zero MJ
  state. Nobody else pairs replay-with-receipts.

### PLAY B — MCP & tool supply-chain gate: admission, pinning, call budgets
- **Market:** OWASP #3/#8/#9; documented rug pulls; the #1 P2 mitigation list is: admission
  review for new servers, tool-description pinning, per-tool call budgets.
- **Already in MJ:** `McpPage`, `control_mcp.rs` (server validation, tool wiring), ACP/MCP
  bridges, harnessPolicy + per-seat argv, envelope machinery, `vendor/` MCP servers.
- **To build (~medium):** **Tool Admission** — every new MCP server/tool enters a signed
  manifest (hash + description pin), runs through the human-approval queue, gets a per-tool
  call budget, and any post-admission drift *refuses in words*. Receipts extend to
  tool calls.
- **Differentiator:** MJ is the only tool that already has policy envelopes + receipts —
  tool vetting becomes another scope of the same engine, not a bolt-on.

### PLAY C — "The Arena as a gate": hostile-scenario battery before real runs
- **Market:** adversarial eval sets in CI are the emerging best practice (security consultancies
  now ship 50–100 hostile cases per deploy); Galileo sells "eval-to-guardrail."
- **Already in MJ:** `adversarialArena.ts` (STANDARD_ATTACK_VECTORS, duels, hardening
  reports), `chaosBisection.ts`, `evals.ts`, the adversarial verification gate.
- **To build (~small-medium):** surface the arena in the UI: a mission is **blocked from
  real execution until its team passes the arena** (injection, exfiltration-attempt,
  scope-escape scenarios); the hardening report joins the receipt.
- **Differentiator:** verification already exists as MJ's spine — this makes security
  verification *part of the run*, not a separate dashboard.

### PLAY D — Live Agent Registry (continuous AIBOM with drift alerts)
- **Market:** CSA: inventories are "the artifact an organization presents to regulators";
  92% visibility gap; "shadow AI agents" found in 82% of orgs.
- **Already in MJ:** `aibom.ts` builds a bill of materials from receipts; role board;
  harness registry.
- **To build (~medium):** continuous inventory (every approved harness/seat/MCP → one
  owner-of-record), **drift detection** (a new harness/MCP/server appeared → notify + log),
  exportable to SIEM/GRC.
- **Differentiator:** AIBOM *from receipts* = inventory that is itself evidence.

---

## 3 · Vertical options (where to aim the wedge)

| Vertical | Why it fits MJ | Risk |
|---|---|---|
| **Regulated engineering** (fintech, insurance, health-IT) | Evidence packs map to EU AI Act / SOC 2 / ISO 42001 already; local-first answers data-residency (DPDP in India, EU) | Long sales cycles — needs design partners, not cold sales |
| **Security teams running agent IR** | Play A/C map to CISO pain; 92% visibility gap | Vorlon/others are converging on the *cloud* story — MJ must lead with "local execution evidence" |
| **Gov/defence-adjacent & air-gapped** | Tauri local-first + offline verification pack + no-phoning-home is a *feature* | Access/sales motion is hard for a solo founder |
| **Indian enterprise (DPDP tailwind)** | Data-residency narrative + Chennai/India presence | Market smaller ticket sizes; good for pilots |

**Recommendation: regulated engineering + security teams as the two pilot personas**, with
the "auditable local agent work" story — not another agent platform.

---

## 4 · What NOT to build (crowded / off-moat)
- Dev-facing **eval/observability dashboards** (LangSmith, Braintrust, DeepEval, Galileo,
  Maxim, Confident AI, …) — you would enter last against funded incumbents.
- A **cloud agent platform** (Devin, Factory, Codex Cloud, Claude Code web) — you cannot
  out-scale them; your moat is evidence + endpoint.
- Another **mesh/ZTNA** layer (Tailscale, Netbird, Twingate…) — connectivity is a commodity.

---

## 5 · The recommended product line (one sentence each)
1. **"MJ Flight Deck"** = Play A + C: adversarial arena gates every run; every mission ends
   in a replayable, receipt-verified black box with one-click containment. *(the flagship)*
2. **"Tool Admission"** = Play B: signed, human-approved MCP/tool manifests with call
   budgets and drift refusal. *(the security hook)*
3. **"Live Registry"** = Play D: continuous, evidence-grade agent inventory. *(the
   compliance hook)*

…and the **two-machine transport** stays the unlock underneath all three (the protocol is
proven; the encrypted laptop-to-laptop channel is the milestone that turns "simulation"
into "product").

**Final note (echoing the external review):** the next evidence MJ needs is not feature 71.
Freeze 11.14.5 (done — re-certified under Node 22.23.2), pick one pilot persona, run real
missions on real machines, and let the Flight Deck story earn the preseed.
