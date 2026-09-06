/**
 * MJ 11.11 SELF-EVOLVING — inter-task lessons memory.
 *
 * The research consensus for 2026 agentic systems is blunt: an agent without a
 * serious memory layer plateaus. MJ's version is measured-only. A lesson is
 * never a vibe — it is derived deterministically from facts a run already
 * produced (failure classifications, repair outcomes, gate verdicts, seat
 * outcomes), carries the evidence that produced it, decays with time unless
 * reinforced, and is retrieved into future team briefings so later missions
 * start smarter. Simulated runs produce environment lessons only: nothing
 * about real execution can be learned from a run that did not execute.
 */

export interface Lesson {
  id: string;
  kind: "failure" | "success" | "environment";
  text: string;
  sourceMissionId: string;
  /** The measured facts this lesson was derived from. Empty evidence = no lesson. */
  evidence: string[];
  strength: number; // 0..1, decays, reinforced by repetition
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
}

export const LESSON_CAP = 200;
export const DECAY_PER_DAY = 0.95;
export const RETRIEVE_K = 3;

const LS_KEY = "mj.lessons.v1";

let seq = 0;
function nextId(prefix: string, now: number): string {
  seq += 1;
  return `${prefix}-${now.toString(36)}-${seq}`;
}

const FAILURE_TEXT: Record<string, string> = {
  AGENT_STARVATION: "Seats went idle waiting for inputs — briefings must name the artifact each seat consumes.",
  REPEATED_FAILURE: "The same failure recurred — isolate the failing task before retrying it a third time.",
  SEQUENTIAL_BOTTLENECK: "Exclusive tasks serialized the run — split independent work before assigning it.",
  UNMEASURED_COST: "Cost arrived unmeasured — treat the run's totals as absent, not zero.",
};

export interface ReflectInput {
  missionId: string;
  simulated: boolean;
  verified: boolean;
  failureClasses: string[];
  /** Repair strategies in execution order, e.g. ["RETRY", "ISOLATE"]; last one succeeded if repaired. */
  repairLadder: string[];
  repaired: boolean;
  seatOutcomes: Array<{ role: string; passed: boolean }>;
  now?: number;
}

/** Deterministic reflection: same measured facts in, same lessons out. */
export function reflectOnMission(input: ReflectInput): Lesson[] {
  const now = input.now ?? Date.now();
  const out: Lesson[] = [];
  const push = (kind: Lesson["kind"], text: string, evidence: string[]): void => {
    if (!text || evidence.length === 0) return;
    out.push({
      id: nextId("lesson", now),
      kind,
      text,
      sourceMissionId: input.missionId,
      evidence,
      strength: 1,
      createdAt: now,
      lastUsedAt: now,
      useCount: 0,
    });
  };

  if (input.simulated) {
    push("environment",
      "Execution was simulated on this host — no lesson about real execution may be drawn; only host capability is known.",
      ["simulated=true"]);
    return out; // honest: a simulated run teaches nothing about real work
  }

  for (const cls of input.failureClasses) {
    const text = FAILURE_TEXT[cls];
    if (text) push("failure", text, [`failureClass=${cls}`]);
  }

  if (input.repaired && input.repairLadder.length > 0) {
    push("success",
      `Repair ladder ${input.repairLadder.join(" -> ")} recovered the run — prefer the cheapest strategy that previously worked.`,
      [`ladder=${input.repairLadder.join(">")}`, "repaired=true"]);
  }

  if (input.verified) {
    const reviewers = input.seatOutcomes.filter((s) => s.role === "reviewer" && s.passed).length;
    push("success",
      reviewers > 0
        ? "Cross-role review passed on real execution — keep an independent reviewer seat on missions like this."
        : "Mission verified on real execution — the team shape that produced this is worth reusing.",
      [`verified=true`, `reviewersPassed=${reviewers}`]);
  }
  return out;
}

export function decayedStrength(l: Lesson, now: number): number {
  const days = Math.max(0, (now - l.createdAt) / 86_400_000);
  return l.strength * Math.pow(DECAY_PER_DAY, days);
}

/** Merge new lessons into memory: identical text reinforces instead of duplicating. */
export function mergeLessons(memory: Lesson[], fresh: Lesson[], now: number): Lesson[] {
  const next = memory.map((l) => ({ ...l }));
  for (const f of fresh) {
    const hit = next.find((l) => l.text === f.text);
    if (hit) {
      hit.strength = Math.min(1, hit.strength + 0.25);
      hit.useCount += 1;
      hit.lastUsedAt = now;
      hit.evidence = [...new Set([...hit.evidence, ...f.evidence])].slice(0, 12);
    } else {
      next.push({ ...f });
    }
  }
  // strongest survive; the rest decay out of the cap
  next.sort((a, b) => decayedStrength(b, now) - decayedStrength(a, now));
  return next.slice(0, LESSON_CAP);
}

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
}

/** Rank memory against a mission goal: strength × recency × goal overlap. */
export function retrieveLessons(memory: Lesson[], goal: string, k: number, now: number): Lesson[] {
  const g = tokens(goal);
  const scored = memory.map((l) => {
    const t = tokens(l.text);
    let overlap = 0;
    g.forEach((w) => { if (t.has(w)) overlap += 1; });
    const recency = 1 / (1 + (now - l.lastUsedAt) / 86_400_000);
    return { l, score: decayedStrength(l, now) * (1 + overlap) * (0.5 + 0.5 * recency) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.l);
}

/** Briefing lines injected into team runs: the organization's remembered experience. */
export function lessonsForBriefing(memory: Lesson[], goal: string, now: number): string[] {
  return retrieveLessons(memory, goal, RETRIEVE_K, now).map(
    (l) => `[org memory] ${l.text}`,
  );
}

export function loadLessons(): Lesson[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Lesson[];
      if (Array.isArray(p)) return p.filter((l) => l && typeof l.text === "string");
    }
  } catch { /* storage unavailable */ }
  return [];
}

export function saveLessons(memory: Lesson[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(memory)); } catch { /* ignore */ }
}
