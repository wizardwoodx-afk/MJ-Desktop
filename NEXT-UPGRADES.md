# MJ 11.1 — Roadmap & Architecture Evolutions

Answering "is there anything more you can do in this app?" with research rather than
brainstorm. Every item below is tied to an empirical finding, mapped to the specific
place in MJ where it lands, and given an honest cost.

---

## Active Upgrades in this Release

| # | Upgrade | Grounded in | Shipped Location |
|---|---|---|---|
| 1 | **Step-repetition and premature-termination detection** — the two largest MAST failure modes | MAST, 1,642 annotated traces across 7 frameworks; failure rates 41–87% [1](https://arxiv.org/pdf/2503.13657) | `src/engine/failureClassifier.ts` & `src/mission/failureDetection.ts` |
| 2 | **Machine-readable provenance export** (C2PA-shaped manifest, Art. 50) | EU AI Act Art. 50, enforceable August 2026 [2](https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-article-50-20260729/) | `src/engine/provenanceExport.ts` |
| 3 | **Pure decision unit tests** | Pinned UTF-8 FNV-1a hashing parity with Rust, deterministic repair ladders, and synthetic content verification | `tools/unit.ts` & `probe/unit.test.ts` |
| 4 | **Structural AST 3-Way Merge** | Semantic AST parsing & interface member union preserving parallel branch fields without conflict markers | `src/mission/astSynthesizer.ts` |
| 5 | **Autonomous Adversarial Hardening Arena** | Builder vs Fuzzer duels with bounded $[0, 100]\%$ scoring and honest simulation labeling | `src/mission/adversarialArena.ts` |
| 6 | **Reputation-Weighted Multi-Agent Consensus** | Dynamic reputation ledger derived from measured verified commits and accurate reviews | `src/mission/consensusEngine.ts` |
| 7 | **Causal Organizational Memory Cortex** | Invariant extraction compiled into `.mj-brief/LEARNED_INVARIANTS.md` and injected into worktree briefings | `src/mission/organizationalMemory.ts` & `src/mission/teamExecutor.ts` |

---

## Ranked Future Work

### 1. Reframe judges as failure detectors, not graders — HIGH
- **Finding**: An LLM judge asked "rate this 1–5" is measurably less consistent than one asked "did this specific failure occur?" Atomic failure-mode checks beat holistic success checks in stability and actionability.
- **Location**: `src/mission/evals.ts` and `src/mission/evaluation.ts`.

### 2. Multi-Level Verification (Agent -> Integration -> Objective) — HIGH
- **Finding**: Single-pass verification is insufficient. Unit verification at the agent level + cross-agent contract integration + final validation against the original charter objective text gains +15.6pp in task completion.
- **Location**: `src/mission/missionRuntime.ts` and `src/mission/checkRunner.ts`.

### 3. Inline Verifier Tiering by Cost — MEDIUM-HIGH
- **Finding**: Judge before irreversible tool execution and on writes to persistent memory using small distilled models (≤8B) for high-frequency inline checks, reserving large models for final validation.
- **Location**: `src/mission/riskPolicy.ts` and `src/mission/approvals.ts`.

### 4. Semantic Similarity Trajectory Loops — MEDIUM
- **Finding**: Token-set Jaccard and embedding comparisons between consecutive attempts catch subtle paraphrasing loops before hashes match.
- **Location**: `src/mission/failureDetection.ts`.
