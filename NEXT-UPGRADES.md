# MJ 6.0 — what to build next, and why

Answering "is there anything more you can do in this app?" with research rather than
brainstorm. Every item below is tied to a finding I could cite, mapped to the specific
place in MJ where it would land, and given an honest cost. Three of them are already
built (see the top of the list); the rest are ranked.

---

## Already done in this pass

| # | Upgrade | Grounded in |
|---|---|---|
| 1 | **Step-repetition and premature-termination detection** — the two largest MAST failure modes MJ had no class for | MAST, 1,642 annotated traces across 7 frameworks; failure rates 41–87% [1](https://arxiv.org/pdf/2503.13657) [2](https://www.alphaxiv.org/abs/2503.13657) |
| 2 | **Machine-readable provenance export** (C2PA-shaped manifest, Art. 50) | EU AI Act Art. 50, enforceable 2 Aug 2026 [3](https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-article-50-20260729/) [4](https://www.faegredrinker.com/en/insights/publications/2026/7/eu-ai-act-commission-confirms-transparency-code-of-practice-as-adequate-and-publishes-final-version-of-its-guidelines-on-transparency-obligations) |
| 3 | **Unit tests for the pure decision functions + shared score panel** | — (self-evident gap: the only test was the whole-mission acceptance run) |

Details are in `WHAT-CHANGED.md`.

---

## 1. Reframe the judges as failure detectors, not graders — HIGH

**Finding.** An LLM judge asked "rate this 1–5" is measurably less consistent than one
asked "did this specific failure occur?" — in a direct comparison, 42 *atomic
failure-mode* checks beat 8 *holistic success* checks, and the reason was framing, not
volume. The rules that mattered: one failure mode per check, define N/A explicitly so
"passed" never means "not applicable", and require the judge to cite the evidence it
relied on [5](https://veris.ai/blog/llm-as-a-judge).

**What MJ does now.** `src/engine/evaluator.ts` scores rubrics 0–5 and averages them.
That is the holistic shape — the weaker of the two shapes.

**Change.** Keep the rubric *dimensions* (§19 forbids collapsing to one number) but
express each dimension as a set of atomic, binary, failure-framed checks with a
mandatory evidence citation and an explicit N/A. The dimension score then becomes
"fraction of applicable checks that did not detect a failure", which is both more
stable and more actionable: a failure tells you what to repair, a 3/5 does not.

**Cost.** Medium — evaluator + rubric definitions + the UI that renders them. No
schema migration if the check results live inside the existing `ArtifactEvaluation`.

---

## 2. Verify at three levels, not one — HIGH

**Finding.** MAST's own intervention evidence: single-pass verification is
insufficient. What works is *multi-level* — unit verification at the agent level,
integration verification across agents' outputs, and final validation against the
**original** requirements. Two documented interventions: fixing a role specification in
ChatDev gained +9.4pp, and adding high-level task-objective verification gained +15.6pp
[1](https://arxiv.org/pdf/2503.13657). Production guidance converges on the same
three-level split: end-to-end, trajectory-level, component-level
[6](https://www.confident-ai.com/blog/llm-agent-evaluation-complete-guide).

**What MJ does now.** Per-artifact evaluation (agent level) plus a holdout check.
Missing in practice: **integration** verification — nothing asks whether the
*combination* of artifacts is coherent — and **final validation against the mission's
original success criteria**, which is exactly the +15.6pp intervention.

**Change.** Add a `verifyIntegration(artifacts, contracts)` pass that checks the
cross-artifact claims (does the test file reference the symbols the implementation
claims to export? does the summary's numbers match the evaluation's?), and make the
existing final scoring explicitly re-judge against the *charter's original objective
text*, not against the plan's restatement of it.

**Cost.** Medium-high. This is the single highest-value item on the list and the one
most likely to move MJ's own demo score.

---

## 3. Judge at boundaries, and tier the judges by cost — MEDIUM-HIGH

**Finding.** Don't judge every step; judge at three boundaries — before user-facing
output, **before irreversible tool execution**, and **on writes to persistent memory**.
Use small distilled judges (≤8B) for high-frequency inline checks and reserve large
models for high-stakes decisions. Also: judge *before* an irreversible call and pause
for a human when the verdict is REJECT [7](https://zylos.ai/research/2026-04-10-llm-as-judge-production-agent-verification-2026/).

**What MJ does now.** `src/engine/governor.ts` gates actions by risk class and routes
them to a human. What it does not do is *verify the content* of a HIGH/CRITICAL action
before executing it — it asks permission, not "is this the right call?".

**Change.** Before any action that survives the risk gate, run a cheap verifier on the
proposed call + context; on REJECT, convert the request into an approval prompt that
shows the verifier's objection rather than a bare "allow?". Route inline checks to a
small local model and keep the large judge for final validation only.

**Cost.** Medium. Reuses the existing approval pipeline; the new piece is verifier
placement and model tiering.

---

## 4. Trajectory metrics — catch the loop before the hashes match — MEDIUM

**Finding.** Step efficiency and plan adherence are first-class trajectory metrics:
"did the agent avoid unnecessary steps, retries and loops"
[6](https://www.confident-ai.com/blog/llm-agent-evaluation-complete-guide).

**Why MJ needs it.** The repetition detector I added compares *identical* output
hashes. An agent that paraphrases the same wrong answer each time slips past it — and
paraphrase is the common case for a language model. Semantic-similarity ensemble
patterns (generate twice, compare, escalate if similarity < 0.85) are the standard
answer [7](https://zylos.ai/research/2026-04-10-llm-as-judge-production-agent-verification-2026/).

**Change.** Store an embedding-free approximation first (token-set Jaccard between
consecutive attempts, which needs no vector store and catches paraphrase), and treat
"similarity above threshold **and** no new artifacts produced" as repetition. Upgrade
to real embeddings later if the cheap version proves noisy.

**Cost.** Low-medium. `attemptHashes` already exists; this adds a second detector over
the same recorded outputs.

---

## 5. Give memory a lifetime — MEDIUM

**Finding.** Memory that is never consolidated degrades: practitioners converge on
deduplication, conflict resolution (recency wins) and forgetting as the three
consolidation operations, with an explicit **no-invention** rule so consolidation never
adds facts absent from the source [8](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization).
Staleness needs explicit temporal modelling — TTL expiry (blunt but reliable),
bitemporal supersede (keep the old fact for audit, flag it non-current), and LLM
conflict resolution [9](https://zylos.ai/research/2026-04-05-ai-agent-memory-architectures-persistent-knowledge/).
A governance framing for exactly this — write validation before consolidation, temporal
decay, and replaying a mutable store against an immutable log — is spelled out in SSGM
[10](https://arxiv.org/html/2603.11768v1). And the performance argument for not just
dumping context: full-context retrieval costs ~14× the tokens and ~10× the latency for
the same or better accuracy [11](https://zylos.ai/research/2026-04-20-memory-consolidation-ai-agents/).

**What MJ does now.** §20 scoped memory is *scope*-correct — it never dumps everything
into every agent. What it lacks is a lifetime: no staleness policy, no decay, no
conflict resolution, no temporal dimension, and no causal capture. AMA-Bench's finding
is directly on point — existing memory systems underperform because they fail to
capture **causal and objective** information and rely on lossy similarity retrieval.

**Change.** Three pieces, in order: (a) TTL + bitemporal supersede on memory entries so
a superseded fact stays auditable but stops being retrieved; (b) a background
consolidation pass with dedupe, recency-wins conflict resolution and a hard
no-invention rule; (c) record *why* a memory was written (the objective it served) so
retrieval has a causal handle. MJ already has the ideal substrate for (c): the
hash-chained audit ledger is the immutable episodic log SSGM wants, and it is already
there.

**Cost.** Medium-high, and it touches persistence — needs a migration.

---

## 6. Make the eval harness re-runnable and versioned — MEDIUM

**Finding.** The yardstick moves under you. OSWorld 2.0 shipped on 26 June 2026 and the
best model's *end-to-end* completion fell from ~83% on the old benchmark to **20.6%** —
a collapse attributed to state management on long-horizon tasks, not to GUI skill
[12](https://o-mega.ai/articles/the-2025-2026-guide-to-ai-computer-use-benchmarks-and-top-ai-agents)
[13](https://nerdleveltech.com/osworld-2-computer-use-agents-long-horizon). The same
review notes that step and token budgets are silently load-bearing: the 20.6% figure is
a 500-step, ~244K-output-token result [12](https://o-mega.ai/articles/the-2025-2026-guide-to-ai-computer-use-benchmarks-and-top-ai-agents).

**Consequence for MJ.** A score from a mission run in January means nothing in
September unless you can re-run it. MJ persists scores but not the *evaluator version*
that produced them, so a rubric change silently rewrites history.

**Change.** Stamp every evaluation with an `evaluatorVersion` and a hash of the rubric
set that produced it; add `mj eval --rerun <missionId>` to re-score old artifacts
against current judges and report the delta. That turns the scorecard from a fact into
a measurement with a known instrument.

**Cost.** Low. Mostly bookkeeping; high leverage for trust.

---

## 7. Close the provenance gap honestly — MEDIUM (time-sensitive)

**Finding.** Art. 50 became enforceable **2 August 2026**. Useful clarifications from
the final guidance: the relevant date for retroactivity is the date of **generation**,
not publication — content generated before 2 Aug 2026 does not need retrospective
marking; pre-existing systems have until **2 December 2026** to implement marking; and
interoperability solutions for watermark detection are due **2 February 2027**
[4](https://www.faegredrinker.com/en/insights/publications/2026/7/eu-ai-act-commission-confirms-transparency-code-of-practice-as-adequate-and-publishes-final-version-of-its-guidelines-on-transparency-obligations).
The Commission and AI Board also concluded that **no single marking technique currently
satisfies all four statutory requirements** (robust, reliable, interoperable,
effective) [4](https://www.faegredrinker.com/en/insights/publications/2026/7/eu-ai-act-commission-confirms-transparency-code-of-practice-as-adequate-and-publishes-final-version-of-its-guidelines-on-transparency-obligations),
and there is a documented gap between what the law asks for and what watermarking can
deliver [3](https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-article-50-20260729/).

**What I built.** The sidecar manifest — tamper-evident, not signed, because MJ holds no
signing key. That is a defensible *first* step precisely because nobody can satisfy all
four requirements with one technique yet.

**What's genuinely missing.** (a) Signing. Add a keypair in the OS keychain and sign
`manifestHash` — that upgrades "tamper-evident" to "tamper-evident *and* attributable",
and MJ already has the keychain integration. (b) Embedding. A sidecar file travels badly;
the mark needs to be inside the bytes for text (front-matter / metadata stream) and
images (C2PA-style). (c) The Art. 50(1) chatbot disclosure, if MJ ever presents
agent output as a conversational interface.

**Cost.** (a) low, (b) high and format-by-format, (c) trivial when needed.

---

## 8. Worth doing, lower priority

- **A2A Agent Card signature verification** — currently detection only. Already noted
  in `WHAT-CHANGED.md` as V6.1.
- **Run the Rust layer as an actual desktop app.** It compiles, links and passes 8/8
  persistence tests, but has never been *clicked*. Highest-value remaining risk
  reduction, and it needs your machine, not mine: `npm install && npm run tauri:build`.
- **Fix the demo's blocking dimensions.** `Autonomy` scores 0 because every gated
  action routes through a human, and `Tests` scores 0/1 because the acceptance harness
  has no repo to test. Both are honest results, but a demo that can never pass its own
  `Tests` criterion is hard to evaluate the runtime against. A tiny fixture repo in
  `tools/` would make `COMMAND_EXIT` criteria genuinely exercisable.

---

## What I would build first, if picking only two

**#2 (three-level verification)** and **#1 (failure-framed judges)**. They compound:
MAST's largest documented single gain (+15.6pp) came from verifying against the
original task objective, and failure-framed checks are what make the resulting signal
*actionable* by the repair ladder. Neither requires a schema migration. Both make every
other item on this list produce a better signal.
