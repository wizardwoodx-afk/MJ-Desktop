# MJ — Problem-Focused Map (11.14.5)

> Every feature in MJ exists because of a specific, named problem. This document is the
> reverse-index: **problem → feature → where it lives → how it is proven.** If a feature
> cannot point at a problem, it does not ship. That is the 11.14.5 doctrine.

---

## The problem (why this product exists)

AI agents are moving from chat toys to **workers that touch real company systems** — code,
repos, budgets, data. Enterprise deployment data, 2026:

- **88% of enterprise agent pilots never reach production**, and Gartner predicts >40% of
  agentic-AI projects will be cancelled by 2027 — blocked by *risk controls*, not model
  quality ([Northflank, May 2026](https://northflank.com/blog/enterprise-ai-coding-agent-deployment)).
- **92% of large-enterprise CISOs lack full visibility into their AI agent identities**, and
  **95% doubt they could detect or contain a compromised agent** — a 2026 survey of 235
  security leaders ([Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-agent-governance-framework-gap-20260403/)).
- **82% of organizations discovered shadow AI agents** in the past year despite believing they
  had full visibility ([mintmcp, Aug 2026](https://www.mintmcp.com/blog/ai-agent-workforce-management)).
- Regulators are arriving: the **EU AI Act's high-risk enforcement wave began August 2026**,
  and NIST's agent-interoperability profile lands Q4 2026 — audits will expect *evidence*:
  who ran what agent, with whose authority, against which data, with what result.

**The one-sentence problem:** companies cannot run fleets of autonomous agents on their
real work because nobody can *prove* what the agents did, who allowed it, that the work was
checked, or that data never left the machine.

**MJ's one-sentence answer:** run agent *teams* that verify each other, learn from measured
feedback, absorb capabilities with provenance, and keep data where it lives — every run
sealed with a signed, tamper-evident receipt.

---

## The four problem pillars → features

### 1 · "How do I know the agent actually did the work?"

| Problem | MJ feature | Where | Proof |
|---|---|---|---|
| One agent's self-report is not evidence | **Adversarial verification gate** — a mission is not "verified" unless a *different* harness than the writer checked it; STRICT verdict blocks the merge path; only a recorded human override passes | `src/mission/verifyGate.ts`, `teamExecutor.ts` | probe `verifyGate`, `realExecution` |
| "Estimated" costs hide reality | **Measured, not estimated** — exit-code-first verdicts, real USD when reported, honest `unmeasured`/`simulated` labels | `checkRunner.ts`, `executor` | probe `checkRunner` |
| Policy that is only documented gets bypassed | **Governance Arena Gate (11.14.7 → 11.14.8, wired)** — a hostile battery attacks MJ's own authority machine (self-grading, agent root, scope growth, expiry, revocation, budget races, egress scope, tamper, ledger writes, off-policy data) BEFORE any seat is invoked on every real mission; ANY breach aborts the mission in words; the PASS stamp + canonical digest ride the run report AND the sealed proof receipt (`arena.gate` event) | `src/mission/arenaGate.ts`, `teamExecutor.ts`, `receipts.ts` | probes `arenaGate` (22) + `arenaWired` (15) |
| Audit asks "who ran what, when, with whose approval?" | **Signed proof receipts** — Ed25519-signed, SHA-256 hash-chained, verifiable with zero MJ state; Evidence Pack + AIBOM + EU AI Act / ISO 42001 / SOC 2 crosswalk | `receipts.ts`, `evidencePack.ts`, `aibom.ts` | probe `receiptVault`, `aibom`, `evidencePack` |
| Merges can be gamed | **Gate-blocked merges** — the merge executor runs the plan's real git steps and refuses anything the gate blocked | `mergeExecutor.ts`, `git_core.rs` | probe `mergeGate` |

### 2 · "Where does our data go?" (the trust & privacy core)

| Problem | MJ feature | Where | Proof |
|---|---|---|---|
| Cloud agents must copy your repo to their VMs | **Local-first execution** — state lives in SQLite/keychain on the employee's machine; the cloud is a *switchboard, never a warehouse* | Tauri shell, `db.rs`, `secrets.rs` | probe `firstrun` |
| File-sharing leaks the whole vault | **WhatsApp model for enterprise data** — Employee A exposes only a *capability* (aggregate whitelist: count/sum/avg/max); B requests an approved operation; A computes **where the data lives**; only the bounded, digest-stamped answer crosses | `capability.ts`, `twoNode.ts`, `egress.ts` | probe `capabilityAlign` (26), `twoNodeAlign` (13), `egressAlign` (8) |
| Repeated narrow queries reconstruct rows | **Privacy Guard** — minimum cohort, hard per-window budget (refusals count), bounded precision, **durable** digest-chained budget ledger (restart resets nothing) | `capability.ts` | probe `capabilityAlign` §4–5 |
| Nothing may leave without permission | **Egress Gate** — every departure needs a human-signed envelope + lands in a tamper-evident departure ledger | `egress.ts`, `custody.ts` | probe `egressAlign` |

### 3 · "Does it get better with use, or repeat its mistakes?"

| Problem | MJ feature | Where | Proof |
|---|---|---|---|
| Every mission starts from zero knowledge | **Lessons memory** — runs reflect into plain-language lessons that decay/reinforce and are injected into the *next* team's briefing (`.mj-brief/ORG_LESSONS.md`) | `lessons.ts`, `teamExecutor.ts` | probe `selfEvolve` (52) |
| "We changed the strategy" is a vibe, not data | **Self-improvement as a real experiment** — runs alternate baseline vs candidate; adoption needs ≥3 measured runs per arm and a strict margin; simulated runs teach nothing | `selfImprove.ts`, `selfEvolveRuntime.ts` | probe `selfEvolve`, `mosaicAlign` |
| Feedback loops can corrupt what the org knows | **Human-gated learning** — agents propose, humans install; belief write-asymmetry; signed learning receipts | `ledger.ts`, `belief.ts`, `learningReceipt.ts` | probe `governanceAlign` (31) |

### 4 · "Can it adopt what the ecosystem invents?"

| Problem | MJ feature | Where | Proof |
|---|---|---|---|
| Agent tooling moves monthly; re-inventing every pattern is impossible | **Pattern Registry** — MJ observes public agent systems (OpenHands, SWE-agent, Goose, Anthropic's commerce blueprint…), records provenance + license, and re-implements the *pattern* — never copied code — through the same measured, human-approved pipeline | `patterns.ts`, `skillEvolution.ts` | probe `patternAlign` (9) |
| Skills learned on real work should persist | Verified missions propose skills; they join briefings only after human approval | `skillEvolution.ts` | probe `patternAlign`, `skillEvolution` |

### Cross-cutting · "Can we make it ours?"

| Problem | MJ feature | Where |
|---|---|---|
| Every team works differently | Any binary as a harness (name + executable + argv template); 25 prebuilt harnesses; visual team builder; natural-language custom nodes; 14 palettes | `TeamsPage.tsx`, `harnessRegistry`, `customNode.ts` |

---

## The honest 60-second demo (problem-first)

1. **Show the problem:** open the Audit page — receipts, ledger, guardrail manifest. Ask:
   *"Which tool you use today can show you a signed receipt of what its agent did?"*
2. **Show verification:** run a mission, watch a *different* agent review the writer's work,
   and the gate refuse to merge until verified.
3. **Show privacy:** the capability demo — a request for `avg(revenue)` by region succeeds;
   a request for raw rows is *refused in words*; the relay log provably contains zero raw values.
4. **Show learning:** two runs of the same mission — the second opens with lessons from the first.

---

## Honest limits (also the roadmap)

- The two-machine protocol is **proven on one machine** (`twoNode.ts` is a simulation the probes
  inspect); real laptop-to-laptop transport is the next milestone, not a shipped feature.
- MJ orchestrates frontier CLIs (Claude, Codex, Gemini, Grok, Cursor…) and does not claim to
  beat any of them at raw capability — its moat is the **combination**: authority + verification
  + learning evidence + proof export, on your hardware.
- Nothing here replaces SSO/SIEM integration or an org's own policy stack; MJ's exports
  (OTLP-JSON, SIEM-shaped, receipts) are built to feed them.
