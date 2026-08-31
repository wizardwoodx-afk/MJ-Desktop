/**
 * Architectural Matrix: MJ vs Standard Multi-Agent IDEs & Workspaces.
 *
 * Details the structural and algorithmic capabilities in MJ that address
 * key bottlenecks in agent orchestration, parallel development, and verification.
 */

export interface CapabilityComparison {
  dimension: string;
  category: "collaboration" | "isolation" | "consensus" | "memory" | "resilience" | "orchestration";
  proliferateApproach: string;
  mjSuperpower: string;
  technicalAdvantage: string;
}

export const PROLIFERATE_COMPARISON_MATRIX: CapabilityComparison[] = [
  {
    dimension: "Parallel Worktree Merge & Collision Resolution",
    category: "collaboration",
    proliferateApproach: "Standard Git line-based merge (unless custom merge drivers are configured). May encounter conflicts on parallel interface edits.",
    mjSuperpower: "Semantic Structural 3-Way Merge & Interface Union Engine",
    technicalAdvantage: "Decomposes source files into structural blocks and performs interface member unions so parallel field additions merge with zero conflict markers.",
  },
  {
    dimension: "Flaky Test & Race Condition Isolation",
    category: "resilience",
    proliferateApproach: "Repeated execution sweeps across isolated worktrees / cloud sandboxes (not documented as using microtask jitter bisection).",
    mjSuperpower: "Chaos Microtask Jitter & Causal Race Bi-Section",
    technicalAdvantage: "Injects deterministic async event-loop delay, promise shuffling, and context-switch skew to expose races in <= 5 runs and auto-generate atomic mutex locks.",
  },
  {
    dimension: "Cross-Agent API Dependency Blocking",
    category: "collaboration",
    proliferateApproach: "Sequential wait: Downstream subagents wait on upstream branch completion before verifying integration contracts.",
    mjSuperpower: "Synthetic Contract Mock Bridge & Live Schema Server",
    technicalAdvantage: "Instant in-memory mock server generated from Blackboard schemas so frontend & backend agents code concurrently without blocking.",
  },
  {
    dimension: "Adversarial Code Verification & Hardening",
    category: "resilience",
    proliferateApproach: "Reviewer subagents and standard test suite execution against happy-path unit and integration tests.",
    mjSuperpower: "Autonomous Red-Team vs Blue-Team Adversarial Arena",
    technicalAdvantage: "Pits Builder against an Adversarial Fuzzer (null fuzzing, race attacks, auth bypass) with automated exploit reproduction & patch synthesis.",
  },
  {
    dimension: "Multi-Agent Consensus & Quorum",
    category: "consensus",
    proliferateApproach: "Human review gates & reviewer subagents (empirical reputation weighting not documented as a public core feature).",
    mjSuperpower: "Reputation-Weighted Multi-Agent Consensus",
    technicalAdvantage: "Weights reviews by empirical track records of verified commits and accurate reviews, computing quorum and arbitrating deadlocks.",
  },
  {
    dimension: "Long-Term Failure Memory & Invariant Learning",
    category: "memory",
    proliferateApproach: "Flat context retrieval / workspace summaries (causal failure-to-repair invariant compilation not documented as a public core feature).",
    mjSuperpower: "Causal Failure-to-Repair Knowledge Cortex",
    technicalAdvantage: "Distills verified causal repair chains from the Flight Recorder into active architectural invariants and auto-compiles pre-flight briefings (.mj-brief/).",
  },
  {
    dimension: "Visual Reactive Workflow Canvas",
    category: "orchestration",
    proliferateApproach: "Standard IDE layout (multi-tab terminals, chat splits, file trees, cloud multiplayer previews).",
    mjSuperpower: "Visual Flow-Based Node Graph & Topological DAG Engine",
    technicalAdvantage: "Typed ports, reactive wire expressions, visual dataflow inspection, and automatic topological cycle detection.",
  },
];
