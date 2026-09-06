/**
 * MJ 11.11 SELF-EVOLVING — the strategy self-improvement loop.
 *
 * The 2026 pattern (Karpathy's autoresearch loop, HyperAgents' editable archive)
 * reduced to what a fleet orchestrator can do honestly: keep an archive of team
 * strategy versions; propose one mutated candidate from the adopted parent;
 * evaluate candidates on MEASURED runs only; adopt strictly better scores;
 * retire the rest with the numbers that condemned them. A candidate can never
 * be evaluated by simulated runs — if every run was simulated, the score stays
 * null and the candidate waits, because nothing real was observed.
 */

export interface StrategyParams {
  reviewDepth: number;   // 1..2 — independent review passes
  checkBias: number;     // 0..1 — how hard the check dimension searches
  serialExec: boolean;   // flatten the wave plan
  lessonBudget: number;  // org-memory lines injected into briefings
}

export interface StrategyVersion {
  id: string;
  gen: number;
  params: StrategyParams;
  parentId: string | null;
  status: "candidate" | "adopted" | "retired";
  score: number | null;        // verified-rate over measured (non-simulated) runs
  evaluatedOn: number;         // measured runs scored
  note: string;
  createdAt: number;
}

export interface ImprovementState {
  versions: StrategyVersion[];
  adoptedId: string | null;
}

export const ADOPT_MARGIN = 0.05;
export const ARCHIVE_CAP = 24;

const LS_KEY = "mj.selfimprove.v1";

export const BASE_PARAMS: StrategyParams = {
  reviewDepth: 1,
  checkBias: 0.5,
  serialExec: false,
  lessonBudget: 3,
};

export function initialState(now: number): ImprovementState {
  const v: StrategyVersion = {
    id: "strategy-v1",
    gen: 1,
    params: { ...BASE_PARAMS },
    parentId: null,
    status: "adopted",
    score: null,
    evaluatedOn: 0,
    note: "baseline — shipped defaults; adopted until a measured candidate beats it",
    createdAt: now,
  };
  return { versions: [v], adoptedId: v.id };
}

export function loadImprovement(): ImprovementState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as ImprovementState;
      if (p && Array.isArray(p.versions) && p.versions.length > 0) return p;
    }
  } catch { /* storage unavailable */ }
  return initialState(Date.now());
}

export function saveImprovement(s: ImprovementState): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function adoptedVersion(s: ImprovementState): StrategyVersion | null {
  return s.versions.find((v) => v.id === s.adoptedId) ?? null;
}

export function adoptedParams(s: ImprovementState): StrategyParams {
  return adoptedVersion(s)?.params ?? { ...BASE_PARAMS };
}

const DIMS: Array<keyof StrategyParams> = ["reviewDepth", "checkBias", "serialExec", "lessonBudget"];

/** One deterministic mutation per generation: rotate through the dimensions. */
export function proposeVariation(s: ImprovementState, now: number): ImprovementState {
  const parent = adoptedVersion(s);
  if (!parent) return s;
  if (s.versions.some((v) => v.status === "candidate")) return s; // one candidate at a time
  const gen = parent.gen + 1;
  const dim = DIMS[(gen - 2) % DIMS.length];
  const params: StrategyParams = { ...parent.params };
  if (dim === "reviewDepth") params.reviewDepth = params.reviewDepth === 1 ? 2 : 1;
  else if (dim === "checkBias") params.checkBias = params.checkBias >= 0.75 ? 0.25 : params.checkBias + 0.25;
  else if (dim === "serialExec") params.serialExec = !params.serialExec;
  else params.lessonBudget = params.lessonBudget >= 6 ? 1 : params.lessonBudget + 1;
  const v: StrategyVersion = {
    id: `strategy-v${gen}`,
    gen,
    params,
    parentId: parent.id,
    status: "candidate",
    score: null,
    evaluatedOn: 0,
    note: `mutated ${String(dim)} from parent v${parent.gen}; awaiting measured runs`,
    createdAt: now,
  };
  return { ...s, versions: [...s.versions, v].slice(-ARCHIVE_CAP) };
}

export interface RunOutcome { verified: boolean; simulated: boolean }

/** Score = verified-rate over REAL runs. All-simulated => null (nothing observed). */
export function scoreRuns(runs: RunOutcome[]): { score: number | null; measured: number } {
  const real = runs.filter((r) => !r.simulated);
  if (real.length === 0) return { score: null, measured: 0 };
  return {
    score: real.filter((r) => r.verified).length / real.length,
    measured: real.length,
  };
}

/**
 * Settle a candidate against accumulated measured runs. Adoption requires a
 * real score and a strict margin over the adopted parent's score (a parent
 * that has never been measured is beaten by any real score).
 */
export function settleCandidate(s: ImprovementState, runs: RunOutcome[], _now: number): ImprovementState {
  const candidate = s.versions.find((v) => v.status === "candidate");
  if (!candidate) return s;
  const { score, measured } = scoreRuns(runs);
  if (score === null) {
    return { ...s, versions: s.versions.map((v) => v.id === candidate.id
      ? { ...v, note: "only simulated runs observed — score stays null; candidate waits" }
      : v) };
  }
  const parent = adoptedVersion(s);
  const parentScore = parent?.score ?? null;
  const better = parentScore === null ? true : score > parentScore + ADOPT_MARGIN;
  const versions = s.versions.map((v) => {
    if (v.id === candidate.id) {
      return better
        ? { ...v, status: "adopted" as const, score, evaluatedOn: measured, note: `adopted at ${score.toFixed(2)} over ${measured} measured runs (parent ${parentScore === null ? "unmeasured" : parentScore.toFixed(2)})` }
        : { ...v, status: "retired" as const, score, evaluatedOn: measured, note: `retired at ${score.toFixed(2)} — parent held ${parentScore === null ? "unmeasured baseline" : parentScore.toFixed(2)}` };
    }
    if (better && v.id === s.adoptedId) return { ...v, status: "retired" as const };
    return v;
  });
  return { versions, adoptedId: better ? candidate.id : s.adoptedId };
}
