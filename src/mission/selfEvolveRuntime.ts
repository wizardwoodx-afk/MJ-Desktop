/**
 * MJ 11.11 SELF-EVOLVING — settlement orchestrator.
 *
 * Called once per finished team run with the SAME measured report the other
 * engines settle on. Runs the full loop: reflect lessons → merge into org
 * memory → settle the strategy candidate on accumulated measured runs →
 * propose skills → issue a learning receipt for whatever was learned.
 * Returns a plain summary the runner UI can display. Never throws: a failure
 * to persist must not break the run.
 */
import { reflectOnMission, mergeLessons, loadLessons, saveLessons, lessonsForBriefing, type Lesson } from "./lessons";
import { loadImprovement, saveImprovement, proposeVariation, settleCandidate, adoptedVersion, adoptedParams, type RunOutcome } from "./selfImprove";
import { proposeSkills, mergeProposals, approvedSkillDefs, loadSkills, saveSkills, type SkillProposal } from "./skillEvolution";
import { issueLearningReceipt, loadLearningReceipts, saveLearningReceipts } from "./learningReceipt";
import { MJ_VERSION } from "../version";

export interface SelfEvolveInput {
  missionId: string;
  goal: string;
  simulated: boolean;
  verified: boolean;
  failureClasses: string[];
  repairLadder: string[];
  repaired: boolean;
  seatOutcomes: Array<{ role: string; label: string; harness: string; passed: boolean }>;
  now?: number;
}

export interface SelfEvolveSummary {
  lessonsLearned: number;
  memorySize: number;
  briefingLines: string[];
  strategy: { adoptedGen: number; candidateStatus: string | null; note: string };
  skillsProposed: number;
  learningReceiptId: string | null;
}

const RUNS_KEY = "mj.selfimprove.runs.v1";

function loadRunLog(): RunOutcome[] {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as RunOutcome[];
      if (Array.isArray(p)) return p;
    }
  } catch { /* ignore */ }
  return [];
}

function saveRunLog(runs: RunOutcome[]): void {
  try { localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(-100))); } catch { /* ignore */ }
}

export function briefingForMission(goal: string, now: number): string[] {
  const params = adoptedParams(loadImprovement());
  const lines = lessonsForBriefing(loadLessons(), goal, now);
  // approved learned skills are runtime wiring, not decoration: they modulate briefings
  for (const d of approvedSkillDefs(loadSkills())) {
    lines.push(`[learned skill ${d.label}] ${d.description}`);
  }
  return lines.slice(0, Math.max(0, params.lessonBudget) + 2);
}

export async function settleSelfEvolution(input: SelfEvolveInput): Promise<SelfEvolveSummary> {
  const now = input.now ?? Date.now();
  try {
    // 1. reflect + merge
    const fresh = reflectOnMission(input);
    let memory = mergeLessons(loadLessons(), fresh, now);
    saveLessons(memory);

    // 2. strategy loop: log the measured run, settle, then maybe propose next
    const runLog = [...loadRunLog(), { verified: input.verified, simulated: input.simulated }];
    saveRunLog(runLog);
    let imp = settleCandidate(loadImprovement(), runLog, now);
    if (!imp.versions.some((v) => v.status === "candidate")) {
      const before = adoptedVersion(imp)?.id ?? null;
      imp = proposeVariation(imp, now);
      const after = imp.versions.find((v) => v.status === "candidate");
      if (after && before !== null) void before;
    }
    const strategyBefore = adoptedVersion(loadImprovement())?.id ?? null;
    saveImprovement(imp);
    const adopted = adoptedVersion(imp);
    const candidate = imp.versions.find((v) => v.status === "candidate") ?? null;

    // 3. skills — recurring failures counted over memory
    const recurring = memory
      .filter((l) => l.kind === "failure" && l.useCount >= 2)
      .map((l) => l.text);
    const freshSkills = proposeSkills({
      missionId: input.missionId,
      verified: input.verified,
      simulated: input.simulated,
      tasks: input.seatOutcomes.map((s) => ({ role: s.role, label: s.label, passed: s.passed })),
      recurringFailureTexts: recurring,
      now,
    });
    const skills = mergeProposals(loadSkills(), freshSkills);
    saveSkills(skills);

    // 4. learning receipt for what this mission taught
    const strategyChange = adopted && strategyBefore !== adopted.id ? `${strategyBefore} -> ${adopted.id}` : null;
    let receiptId: string | null = null;
    if (fresh.length > 0 || strategyChange) {
      const receipt = await issueLearningReceipt({
        mjVersion: MJ_VERSION,
        missionId: input.missionId,
        lessons: fresh.map((l) => ({ id: l.id, kind: l.kind, text: l.text, evidence: l.evidence })),
        strategyChange,
        now,
      });
      const all = [...loadLearningReceipts(), receipt];
      saveLearningReceipts(all);
      receiptId = receipt.id;
    }

    return {
      lessonsLearned: fresh.length,
      memorySize: memory.length,
      briefingLines: briefingForMission(input.goal, now),
      strategy: {
        adoptedGen: adopted?.gen ?? 1,
        candidateStatus: candidate?.status ?? null,
        note: candidate?.note ?? adopted?.note ?? "",
      },
      skillsProposed: freshSkills.length,
      learningReceiptId: receiptId,
    };
  } catch {
    return {
      lessonsLearned: 0,
      memorySize: 0,
      briefingLines: [],
      strategy: { adoptedGen: 1, candidateStatus: null, note: "self-evolution settlement skipped" },
      skillsProposed: 0,
      learningReceiptId: null,
    };
  }
}

export type { Lesson, SkillProposal };
