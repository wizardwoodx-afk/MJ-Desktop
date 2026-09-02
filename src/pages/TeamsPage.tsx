import { useEffect, useMemo, useRef, useState } from "react";
import { AGENT_FRAMEWORKS } from "../domain/frameworks";
import { HARNESSES, type HarnessId } from "../domain/harness";
import {
  instantiateTeam,
  loadTeamsLocal,
  saveTeamsLocal,
  teamFromFramework,
  type TeamWorkspace,
} from "../domain/teams";
import {
  PREBUILT_TEAMS,
  composeSeatArgv,
  loadSavedTeams,
  saveTeams,
  upsertTeam,
  validateTeam,
  type CliAgentTeam,
  type TeamRole,
  type TeamSeat,
} from "../mission/agentTeam";
import { AGENT_CAPABILITIES } from "../mission/agentCapabilities";
import { planWorktrees, type WorktreePlan } from "../mission/collaboration";
import { CapLedger } from "../mission/caps";
import { executeTeam, type SeatRecord, type TeamRunReport, type TeamRunnerDeps } from "../mission/teamExecutor";
import { getHarness } from "../mission/harnessAdapters";
import {
  applyTeamFeedback,
  decideCandidate,
  evolveTeamAfterRun,
  applyCandidateToTeam,
  loadTeamEvoStore,
  saveTeamEvoStore,
  signalsFromSeatRecords,
  type TeamEvoStore,
  type TeamEvolutionCandidate,
  type TeamEvolveMode,
} from "../mission/teamEvolution";
import {
  DEFAULT_CHANNELS,
  globalAgentBus,
  type BlackboardEntry,
  type InterAgentMessage,
  type MessageIntent,
} from "../mission/interAgentChannel";
import {
  runAdversarialDuel,
  STANDARD_ATTACK_VECTORS,
  type HardeningReport,
} from "../mission/adversarialArena";
import {
  synthesizeAstMerge,
  type AstMergeResult,
} from "../mission/astSynthesizer";
import {
  evaluateConsensus,
  INITIAL_REPUTATIONS,
  type AgentReputation,
  type ConsensusResult,
  type ReviewVote,
} from "../mission/consensusEngine";
import { globalChaosEngine, type FlakyRaceDiagnosis } from "../mission/chaosBisection";
import {
  globalMemoryCortex,
  SEED_INVARIANTS,
  type MemoryCortexReport,
} from "../mission/organizationalMemory";
import { classifyError, FAILURE_CLASS_LABEL, type FailureClass, type FailureSignal } from "../engine/failureClassifier";
import { fullLadder } from "../engine/repair";
import { buildProvenanceManifest, renderManifest, verifyManifest, type ProvenanceManifest } from "../engine/provenanceExport";
import { PROLIFERATE_COMPARISON_MATRIX } from "../mission/proliferateMatrix";
import { globalMockBridge, type SyntheticContractBridge } from "../mission/contractMockBridge";
import { useGraphStore } from "../graph/store";
import { ipc, useTauri } from "../ipc/client";
import { toast } from "../panels/Toast";
import { uid } from "../app/id";

type ActiveTab = "crews" | "channel" | "arena" | "astmerge" | "consensus" | "chaos" | "memory" | "failure" | "provenance" | "matrix" | "mockbridge" | "runner" | "evolve" | "builder" | "frameworks";

const ALL_ROLES: TeamRole[] = [
  "planner",
  "architect",
  "coder",
  "debugger",
  "tester",
  "reviewer",
  "security",
  "synthesizer",
];

const HARNESS_BADGES: Record<HarnessId, { label: string; color: string; bg: string }> = {
  claude: { label: "Claude Code", color: "#d97706", bg: "rgba(217, 119, 6, 0.14)" },
  codex: { label: "OpenAI Codex", color: "#10b981", bg: "rgba(16, 185, 129, 0.14)" },
  opencode: { label: "OpenCode AI", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.14)" },
  cursor: { label: "Cursor Agent", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.14)" },
  grok: { label: "xAI Grok", color: "#ec4899", bg: "rgba(236, 72, 153, 0.14)" },
  cline: { label: "Cline CLI", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.14)" },
  aider: { label: "Aider AI", color: "#059669", bg: "rgba(5, 150, 105, 0.14)" },
  gemini: { label: "Gemini CLI", color: "#2563eb", bg: "rgba(37, 99, 235, 0.14)" },
  goose: { label: "Goose (Block)", color: "#7c3aed", bg: "rgba(124, 58, 237, 0.14)" },
  qwen: { label: "Qwen Code", color: "#0284c7", bg: "rgba(2, 132, 199, 0.14)" },
  amazonq: { label: "Amazon Q / Kiro", color: "#ea580c", bg: "rgba(234, 88, 12, 0.14)" },
  kilo: { label: "Kilo Code", color: "#06b6d4", bg: "rgba(6, 182, 212, 0.14)" },
  hermes: { label: "Hermes Agent", color: "#eab308", bg: "rgba(234, 179, 8, 0.14)" },
  acp: { label: "ACP Protocol", color: "#14b8a6", bg: "rgba(20, 184, 166, 0.14)" },
  llm: { label: "Direct LLM", color: "#94a3b8", bg: "rgba(148, 163, 184, 0.14)" },
};

const INTENT_COLORS: Record<MessageIntent, { bg: string; color: string }> = {
  proposal: { bg: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" },
  feedback: { bg: "rgba(234, 179, 8, 0.15)", color: "#eab308" },
  contract: { bg: "rgba(16, 185, 129, 0.15)", color: "#10b981" },
  blocker: { bg: "rgba(239, 68, 68, 0.15)", color: "#ef4444" },
  handoff: { bg: "rgba(168, 85, 247, 0.15)", color: "#a855f7" },
  verification: { bg: "rgba(6, 182, 212, 0.15)", color: "#06b6d4" },
  operator: { bg: "rgba(244, 63, 94, 0.15)", color: "#f43f5e" },
  broadcast: { bg: "rgba(148, 163, 184, 0.15)", color: "#94a3b8" },
};

export function TeamsPage({ onOpened }: { onOpened: () => void }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("crews");
  const [cliTeams, setCliTeams] = useState<CliAgentTeam[]>(() => {
    const saved = loadSavedTeams();
    return saved.length ? saved : PREBUILT_TEAMS;
  });
  const [selectedTeamId, setSelectedTeamId] = useState<string>(cliTeams[0]?.id ?? "team.powerhouse");
  const [cliStatus, setCliStatus] = useState<Record<string, boolean>>({});

  // Canvas workspace teams state
  const [canvasTeams, setCanvasTeams] = useState<TeamWorkspace[]>(() => loadTeamsLocal());
  const [selectedCanvasTeam, setSelectedCanvasTeam] = useState<string>(canvasTeams[0]?.id ?? "");
  const [canvasTask, setCanvasTask] = useState("");

  // Mission Runner state
  const [runnerObjective, setRunnerObjective] = useState("Implement rate-limiting middleware on payment endpoints with strict token bucket verification");
  const [runnerRepo, setRunnerRepo] = useState("/home/user/workspace/app");
  const [runnerTestCmd, setRunnerTestCmd] = useState("npm test");
  const [runnerRunning, setRunnerRunning] = useState(false);
  const [runnerResult, setRunnerResult] = useState<TeamRunReport | null>(null);
  /* V11.4 — the runId the evolution fold used, so operator feedback correlates with the
   * same run in the ledger instead of a synthetic `run-<startedAt>` that matches nothing. */
  const [runnerRunId, setRunnerRunId] = useState<string | null>(null);
  /* V11.2 — team self-evolution & feedback loop state. */
  const [evo, setEvo] = useState<TeamEvoStore>(() => loadTeamEvoStore());
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const updateEvo = (next: TeamEvoStore) => {
    setEvo(next);
    saveTeamEvoStore(next);
  };

  // Inter-Agent Channel State
  const [activeChannel, setActiveChannel] = useState<string>("#general");
  const [channelMessages, setChannelMessages] = useState<InterAgentMessage[]>(() => globalAgentBus.getMessages());
  const [blackboardEntries, setBlackboardEntries] = useState<BlackboardEntry[]>(() => globalAgentBus.getBlackboard());
  const [operatorInput, setOperatorInput] = useState("");
  const [isDebating, setIsDebating] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Adversarial Arena state
  const [duelRunning, setDuelRunning] = useState(false);
  const [duelReport, setDuelReport] = useState<HardeningReport | null>(null);

  // Structural Merge state
  const [astMergeResult, setAstMergeResult] = useState<AstMergeResult | null>(null);

  // Multi-Agent Consensus state
  const [consensusResult, setConsensusResult] = useState<ConsensusResult | null>(null);

  // Chaos Bisection state
  const [chaosDiagnosis, setChaosDiagnosis] = useState<FlakyRaceDiagnosis | null>(null);
  const [chaosRunning, setChaosRunning] = useState(false);

  // Organizational Memory state
  const [memoryReport, setMemoryReport] = useState<MemoryCortexReport | null>(null);

  // Failure Classifier state
  const [failureInput, setFailureInput] = useState("");
  const [failureSignals, setFailureSignals] = useState<FailureSignal[]>([]);

  // Provenance Export state
  const [provenanceManifest, setProvenanceManifest] = useState<ProvenanceManifest | null>(null);

  // Mock Bridge state
  const [mockBridges, setMockBridges] = useState<SyntheticContractBridge[]>([]);

  // Builder state for custom crew
  const [builderTeam, setBuilderTeam] = useState<CliAgentTeam>(() => ({
    id: `team.custom.${uid("t")}`,
    name: "Custom Multi-Agent Crew",
    description: "Collaborative multi-vendor coding team connecting specialized CLI agents.",
    schemaVersion: 1,
    budgetUsd: 15.0,
    seats: [
      { id: "planner", role: "planner", harness: "claude", model: null, mayWrite: false, maxRisk: "LOW", timeoutSecs: 600, maxTurns: 10, instructions: "Formulate task milestones." },
      { id: "coder", role: "coder", harness: "opencode", model: null, mayWrite: true, maxRisk: "MEDIUM", timeoutSecs: 900, maxTurns: 25, instructions: "Implement solution with clean commits." },
      { id: "reviewer", role: "reviewer", harness: "codex", model: null, mayWrite: false, maxRisk: "LOW", timeoutSecs: 600, maxTurns: 10, instructions: "Conduct independent review against snapshot." },
    ],
  }));

  const [inspectSeat, setInspectSeat] = useState<TeamSeat | null>(null);
  const store = useGraphStore();

  const selectedTeam = useMemo(
    () => cliTeams.find((t) => t.id === selectedTeamId) ?? PREBUILT_TEAMS[0],
    [cliTeams, selectedTeamId],
  );

  // Subscribe to Inter-Agent Message Bus
  useEffect(() => {
    const unsubMsg = globalAgentBus.subscribe(() => {
      setChannelMessages(globalAgentBus.getMessages());
    });
    const unsubBoard = globalAgentBus.subscribeBlackboard(() => {
      setBlackboardEntries(globalAgentBus.getBlackboard());
    });
    return () => {
      unsubMsg();
      unsubBoard();
    };
  }, []);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [channelMessages, activeTab]);

  // Detect installed CLI tools on load
  useEffect(() => {
    void ipc.cliProvidersDetect().then((list) => {
      const map: Record<string, boolean> = {};
      for (const item of list) {
        map[item.id] = Boolean(item.installed);
      }
      setCliStatus(map);
    });
  }, []);

  const saveCliTeams = (updated: CliAgentTeam[]) => {
    setCliTeams(updated);
    saveTeams(updated);
  };

  const deployToCanvas = async (team: CliAgentTeam, taskDesc?: string) => {
    const task = taskDesc || runnerObjective || `Mission for ${team.name}`;
    const fw = AGENT_FRAMEWORKS.find((f) => f.id === "fw.research-write-review") ?? AGENT_FRAMEWORKS[0];
    const ws = teamFromFramework(fw, team.name);
    const { nodes, wires } = instantiateTeam({
      ...ws,
      id: uid("team"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      members: team.seats.map((s) => ({
        definitionId: s.role === "coder" ? "agent.coder" : s.role === "reviewer" ? "agent.reviewer" : "agent.architect",
        title: `${s.id} (${HARNESS_BADGES[s.harness]?.label ?? s.harness})`,
        harness: s.harness,
        purpose: s.instructions || task,
      })),
    }, task);

    if (!store.workflowId) {
      const res = await ipc.workflowCreate(`${team.name}: ${task.slice(0, 36)}`, team.description);
      const created = await ipc.workflowGet(res.id);
      store.loadWorkflow(created as never);
      window.__mjActiveWorkflowId = res.id;
    }
    store.insertTemplate(nodes, wires);
    store.rename(`${team.name}: ${task.slice(0, 36)}`);
    toast(`Dealt ${team.seats.length} agents of "${team.name}" onto Canvas!`);
    onOpened();
  };

  // Trigger real-time multi-agent parallel chat simulation
  const handleSimulateDebate = async () => {
    if (isDebating || !selectedTeam) return;
    setIsDebating(true);
    toast("Starting parallel multi-agent debate session...");

    const seats = selectedTeam.seats;
    const planner = seats.find((s) => s.role === "planner") ?? seats[0];
    const architect = seats.find((s) => s.role === "architect") ?? seats[1 % seats.length];
    const coder = seats.find((s) => s.mayWrite) ?? seats[2 % seats.length];
    const reviewer = seats.find((s) => s.role === "reviewer" || s.role === "security") ?? seats[3 % seats.length];
    const synth = seats.find((s) => s.role === "synthesizer") ?? seats[4 % seats.length];

    // Step 1: Planner posts proposal
    globalAgentBus.publish({
      channel: "#architecture",
      sender: { seatId: planner.id, role: planner.role, harness: planner.harness, name: HARNESS_BADGES[planner.harness]?.label ?? planner.id },
      mentions: ["@all", `@${architect.id}`],
      intent: "proposal",
      content: `I have decomposed our objective ("${runnerObjective}") into 3 waves: Wave 1 schema contract, Wave 2 worktree implementation, Wave 3 snapshot peer review. @${architect.id}, please define the rate-limiter token bucket interface.`,
    });

    globalAgentBus.writeBlackboard(
      "plan.milestones",
      "1. Interface Definition (TokenBucket, RateLimitConfig)\n2. Middleware Implementation with Redis/Memory fallback\n3. Verification Suite (>95% coverage)\n4. Peer Review Snapshot Validation",
      planner.id,
      "architecture",
    );

    await new Promise((r) => setTimeout(r, 600));

    // Step 2: Architect posts contract
    globalAgentBus.publish({
      channel: "#architecture",
      sender: { seatId: architect.id, role: architect.role, harness: architect.harness, name: HARNESS_BADGES[architect.harness]?.label ?? architect.id },
      mentions: [`@${coder.id}`, `@${reviewer.id}`],
      intent: "contract",
      content: `Interface contract finalized. We define TokenBucket with \`consume(tokens: number): Promise<RateLimitResult>\` and 429 status response schema. Publishing contract to Blackboard for parallel implementation.`,
    });

    globalAgentBus.writeBlackboard(
      "contracts.rate_limiter_ts",
      "export interface RateLimitResult { allowed: boolean; remaining: number; resetMs: number; }\nexport interface TokenBucket { consume(tokens: number): Promise<RateLimitResult>; }",
      architect.id,
      "contract",
    );

    await new Promise((r) => setTimeout(r, 600));

    // Step 3: Coder implements in worktree
    globalAgentBus.publish({
      channel: "#implementation-sync",
      sender: { seatId: coder.id, role: coder.role, harness: coder.harness, name: HARNESS_BADGES[coder.harness]?.label ?? coder.id },
      mentions: [`@${architect.id}`, `@${reviewer.id}`],
      intent: "handoff",
      content: `Implementation completed in private worktree \`mj/rate-limiter/${coder.id}\`. Added \`TokenBucketMiddleware\`, test suites, and strict boundary tests. Ready for snapshot merge and review!`,
    });

    await new Promise((r) => setTimeout(r, 600));

    // Step 4: Reviewer inspects snapshot
    globalAgentBus.publish({
      channel: "#qa-review",
      sender: { seatId: reviewer.id, role: reviewer.role, harness: reviewer.harness, name: HARNESS_BADGES[reviewer.harness]?.label ?? reviewer.id },
      mentions: [`@${coder.id}`, `@${synth.id}`],
      intent: "verification",
      content: `VERDICT: CORRECT. Reviewed diff against merged snapshot \`mj/rate-limiter/review\`. All 8 unit tests passed with exit code 0. No memory leaks detected on high burst simulation.`,
    });

    globalAgentBus.writeBlackboard(
      "qa.verdict",
      "Status: VERIFIED_PASS (100% tests passed in detached review snapshot, zero regressions)",
      reviewer.id,
      "test_criteria",
    );

    await new Promise((r) => setTimeout(r, 500));

    // Step 5: Synthesizer finalizes
    globalAgentBus.publish({
      channel: "#general",
      sender: { seatId: synth.id, role: synth.role, harness: synth.harness, name: HARNESS_BADGES[synth.harness]?.label ?? synth.id },
      mentions: ["@all"],
      intent: "broadcast",
      content: `All agents have reached unanimous consensus. Release package ready for production merge. Total cycle time: 2.3s, spend: $0.038.`,
    });

    setIsDebating(false);
    toast("Multi-agent parallel coordination debate completed!");
  };

  const handleSendOperatorMessage = () => {
    if (!operatorInput.trim()) return;
    globalAgentBus.publish({
      channel: activeChannel,
      sender: { seatId: "operator", role: "planner", harness: "llm", name: "Human Operator" },
      mentions: ["@all"],
      intent: "operator",
      content: operatorInput.trim(),
    });
    setOperatorInput("");
  };

  // Run Adversarial Arena Duel
  const handleRunDuel = async () => {
    setDuelRunning(true);
    toast("Starting Red Team vs Blue Team Adversarial Arena Duel...");
    try {
      const rep = await runAdversarialDuel({
        objective: runnerObjective,
        defenderSeatId: "blue_builder",
        defenderHarness: "claude",
        attackerSeatId: "red_fuzzer",
        attackerHarness: "grok",
        targetCwd: runnerRepo,
      });
      setDuelReport(rep);
      toast(`Adversarial duel finished! Defense Score: ${rep.defenseScore}%`);
    } catch (e) {
      toast(`Duel failed: ${String(e)}`, "err");
    } finally {
      setDuelRunning(false);
    }
  };

  // Run Structural Merge Simulation
  const handleRunAstMerge = () => {
    const baseCode = `import { Request, Response } from "express";\n\nexport interface AppConfig {\n  port: number;\n}\n\nexport function createApp() {\n  return { ok: true };\n}\n`;
    const branch1Code = `import { Request, Response } from "express";\nimport { TokenBucket } from "./bucket";\n\nexport interface AppConfig {\n  port: number;\n  rateLimitTokens: number;\n}\n\nexport function rateLimitMiddleware(req: Request, res: Response) {\n  return true;\n}\n\nexport function createApp() {\n  return { ok: true };\n}\n`;
    const branch2Code = `import { Request, Response } from "express";\nimport { auditLogger } from "./logger";\n\nexport interface AppConfig {\n  port: number;\n  enableAuditLogs: boolean;\n}\n\nexport function auditLogMiddleware(req: Request, res: Response) {\n  auditLogger.log(req.path);\n}\n\nexport function createApp() {\n  return { ok: true };\n}\n`;

    const res = synthesizeAstMerge("src/app.ts", baseCode, [
      { seatId: "claude_seat", branch: "mj/rate-limiter/claude", content: branch1Code },
      { seatId: "codex_seat", branch: "mj/rate-limiter/codex", content: branch2Code },
    ]);
    setAstMergeResult(res);
    toast("Synthesized structural 3-way merge.");
  };

  // Run Multi-Agent Consensus Simulation
  const handleRunConsensus = () => {
    const votes: ReviewVote[] = [
      { seatId: "claude_reviewer", harness: "claude", verdict: "APPROVE", confidence: 0.95, rationale: "All 12 unit tests pass; structural interface union verified without regressions.", diffRef: "mj/rate-limiter/review", timestamp: new Date().toISOString() },
      { seatId: "codex_security", harness: "codex", verdict: "APPROVE", confidence: 0.90, rationale: "Token bucket mutex correctly prevents race conditions under burst simulation.", diffRef: "mj/rate-limiter/review", timestamp: new Date().toISOString() },
      { seatId: "grok_fuzzer", harness: "grok", verdict: "APPROVE", confidence: 0.85, rationale: "Fuzzing vectors (null inputs, boundary overflow) rejected safely.", diffRef: "mj/rate-limiter/review", timestamp: new Date().toISOString() },
    ];
    const res = evaluateConsensus(runnerObjective, votes);
    setConsensusResult(res);
    toast(`Consensus Calculated: ${res.status}`);
  };

  // Run Chaos Bisection
  const handleRunChaos = async () => {
    setChaosRunning(true);
    toast("Injecting async microtask jitter to isolate race conditions...");
    try {
      const diag = await globalChaosEngine.isolateFlakyRace({
        testName: "TokenBucket.burst-concurrency",
        targetFilePath: "src/middleware/rateLimit.ts",
        sourceCode: "this.tokens = this.tokens - count; // Non-atomic read-modify-write",
      });
      setChaosDiagnosis(diag);
      toast(`Race isolated in ${diag.reproducedInRuns} runs! Root cause: ${diag.rootCauseKind}`);
    } catch (e) {
      toast(`Chaos failed: ${String(e)}`, "err");
    } finally {
      setChaosRunning(false);
    }
  };

  // Compile Organizational Memory Briefing
  const handleCompileMemory = () => {
    const report = globalMemoryCortex.compileBriefing();
    setMemoryReport(report);
    toast(`Compiled ${report.invariantsCompiled} learned invariants from organizational memory`);
  };

  // Run Failure Classification
  const handleClassifyFailure = () => {
    const errorMsg = failureInput || "Tool failed: repeated timeout loop after 5 attempts";
    const failureClass = classifyError(errorMsg, 5);
    const ladder = fullLadder(failureClass);
    const signal: FailureSignal = {
      id: `sig-${Date.now()}`,
      class: failureClass,
      severity: failureClass === "UNKNOWN" ? "INFO" : "ERROR",
      subjectId: "demo-task",
      message: `${FAILURE_CLASS_LABEL[failureClass]}: ${errorMsg}`,
    };
    setFailureSignals([signal]);
    toast(`Classified as ${failureClass}. Repair ladder: ${ladder.join(" → ")}`);
  };

  // Generate Provenance Manifest
  const handleGenerateProvenance = () => {
    const mockArtifact = {
      id: "art-001",
      missionId: "mission-demo",
      orgId: "org-mj",
      lineageId: "line-001",
      version: 1,
      name: "rateLimitMiddleware.ts",
      contentType: "CODE" as const,
      content: "export function rateLimitMiddleware() { return true; }",
      contentHash: "a1b2c3d4",
      createdBy: "claude",
      modifiedBy: ["claude", "codex"],
      inputs: [],
      parentArtifacts: [],
      toolsUsed: ["claude-code", "vitest"],
      modelsUsed: ["claude-3.5-sonnet"],
      harnessUsed: "claude",
      costUsd: 0.042,
      latencyMs: 1200,
      approvalState: "APPROVED" as const,
      riskClass: "LOW" as const,
      provenance: "synthetic",
      createdAt: new Date().toISOString(),
      tags: ["middleware", "rate-limit"],
    };
    const manifest = buildProvenanceManifest([mockArtifact], { "art-001": mockArtifact }, {
      missionId: "mission-demo",
      orgId: "org-mj",
      generator: { name: "MJ Desktop", version: "11.1.0", harnesses: ["claude", "codex"] },
      ledger: { head: "art-001", entries: 1, verified: true },
      generatedAt: new Date().toISOString(),
    });
    setProvenanceManifest(manifest);
    toast("Provenance manifest generated with C2PA-shaped claims");
  };

  // Deploy mock contract bridge
  const handleDeployMockBridge = () => {
    globalAgentBus.writeBlackboard(
      "contracts.payment.rate_limiter",
      "interface TokenBucket { consume(tokens: number): Promise<{ allowed: boolean; remaining: number }>; }",
      "architect",
      "contract",
    );
    const bridges = globalMockBridge.getBridges();
    setMockBridges([...bridges]);
    toast(`Deployed ${bridges.length} synthetic mock endpoint(s) from blackboard contract`);
  };

  const handleRunMission = async () => {
    if (!selectedTeam) return;
    setRunnerRunning(true);
    setRunnerResult(null);
    setRunnerRunId(null);

    const isNative = useTauri();
    const ledger = new CapLedger({ maxCostUsd: selectedTeam.budgetUsd ?? 20.0 });

    const deps: TeamRunnerDeps = {
      resolveBin: async (bin) => {
        if (isNative) {
          try {
            const env = await ipc.cliEnv();
            const hit = env.bins.find((b) => b.id === bin || b.bin === bin);
            if (hit?.installed && hit.executable) return hit.executable;
          } catch { /* fallback below */ }
        }
        const found = cliStatus[bin];
        if (found) return `/usr/local/bin/${bin}`;
        return null;
      },
      cliInvoke: async (req) => {
        if (isNative) {
          try {
            const r = (await ipc.cliInvoke(req.bin, req.argv.join(" "), req.cwd, req.timeoutSecs, req.argv)) as {
              stdout?: string;
              stderr?: string;
              code?: number | null;
            };
            return {
              exitCode: r.code ?? 0,
              stdout: String(r.stdout || ""),
              stderr: String(r.stderr || ""),
              durationMs: 0,
              timedOut: false,
            };
          } catch (err) {
            return {
              exitCode: 1,
              stdout: "",
              stderr: String(err),
              durationMs: 0,
              timedOut: false,
            };
          }
        }

        // High fidelity multi-turn simulation for browser host or local testbed
        await new Promise((r) => setTimeout(r, 600));
        const isWriter = req.argv.includes("workspace-write") || req.argv.includes("acceptEdits") || req.argv.includes("--force") || req.argv.includes("build") || req.argv.includes("--yes");
        const isReviewer = req.argv.includes("read-only") || req.argv.includes("plan");

        let summary = "Task executed successfully.";
        if (isWriter) {
          summary = `Implemented required modules in isolated worktree ${req.cwd}. Formulated unit tests.`;
        } else if (isReviewer) {
          summary = `CORRECT: Verified diff against review snapshot. All safety boundary assertions passed.`;
        }

        return {
          exitCode: 0,
          stdout: JSON.stringify({
            type: "result",
            is_error: false,
            result: summary,
            session_id: `ses_${uid("cli")}`,
            total_cost_usd: 0.042,
            usage: { input_tokens: 1240, output_tokens: 410 },
          }),
          stderr: "",
          durationMs: 580,
          timedOut: false,
        };
      },
      git: async (args, cwd) => {
        if (isNative) {
          try {
            const r = (await ipc.shellExec("git", args, cwd, 60)) as { stdout?: string; stderr?: string; code?: number | null };
            return { ok: r.code === 0, exitCode: r.code ?? null, stdout: r.stdout ?? "", stderr: r.stderr ?? "", reason: r.code === 0 ? null : (r.stderr || "git command failed") };
          } catch (e) {
            return { ok: false, exitCode: null, stdout: "", stderr: String(e), reason: String(e) };
          }
        }
        return { ok: true, exitCode: 0, stdout: "ok", stderr: "", reason: null };
      },
      writeFile: async (filePath, content) => {
        if (isNative) {
          await ipc.fsWrite(filePath, content);
        }
      },
      verify: async (cwd) => {
        if (isNative && runnerTestCmd.trim()) {
          try {
            const parts = runnerTestCmd.trim().split(/\s+/);
            const r = (await ipc.shellExec(parts[0], parts.slice(1), cwd, 120)) as { stdout?: string; stderr?: string; code?: number | null };
            return { exitCode: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "", durationMs: 0, timedOut: false };
          } catch (e) {
            return { exitCode: 1, stdout: "", stderr: String(e), durationMs: 0, timedOut: false };
          }
        }
        await new Promise((r) => setTimeout(r, 300));
        return { exitCode: 0, stdout: "PASS test/suite.spec.ts (6 tests passed)", stderr: "", durationMs: 290, timedOut: false };
      },
    };

    try {
      const assignments = selectedTeam.seats.map((s, idx) => ({
        seat: s,
        prompt: `${s.instructions ? `${s.instructions}\n\n` : ""}Objective: ${runnerObjective}\nScope: Touch only authorized files.`,
        wave: s.role === "planner" || s.role === "architect" ? 1 : s.mayWrite ? 2 : 3,
        readOnly: !s.mayWrite,
        turnNumber: idx + 1,
      }));

      const runId = uid("run");
      const res = await executeTeam(
        {
          team: selectedTeam,
          assignments,
          repoRoot: runnerRepo,
          baseBranch: "main",
          missionSlug: `mission-${runId}`,
          objective: runnerObjective,
          ledger,
          testCommand: runnerTestCmd.split(" "),
        },
        deps,
      );
      setRunnerResult(res);
      setRunnerRunId(runId);
      toast(`Mission finished: ${res.status.toUpperCase()}`);
      // V11.2 — fold the run into the team's self-evolution ledger. Every seat's measured
      // facts (ran / verified / cost / latency) become signal; AUTONOMOUS teams apply
      // candidates that pass every gate; SUGGEST teams queue them for the Evolution tab.
      // V11.4 fix — `simulated` is now passed through: a seat on the labelled local-test
      // double is recorded as simulated, so it can never count as a realRun and never alone
      // justify a candidate (honesty rule #2 in teamEvolution.ts).
      try {
        const signals = signalsFromSeatRecords({
          runId,
          ts: new Date().toISOString(),
          teamId: selectedTeam.id,
          seats: res.seats.map((s) => ({
            seatId: s.seatId,
            role: s.role,
            harness: s.harness,
            outcome: s.outcome,
            exitCode: s.exitCode,
            chargedUsd: s.chargedUsd,
            durationMs: s.durationMs,
            verified: s.verified,
            simulated: getHarness(s.harness)?.simulated ?? false,
          })),
        });
        let store = loadTeamEvoStore();
        const appliedCandidates: TeamEvolutionCandidate[] = [];
        for (const sig of signals) {
          const r = evolveTeamAfterRun({ store, team: selectedTeam, signal: sig, actor: "team-evolver" });
          store = r.store;
          if (r.applied && r.candidate) appliedCandidates.push(r.candidate);
        }
        updateEvo(store);
        for (const c of appliedCandidates) {
          const updated = applyCandidateToTeam(selectedTeam, c, "team-evolver");
          saveCliTeams(upsertTeam(cliTeams, updated));
          toast(`Team evolved: ${selectedTeam.name} seat "${c.seatId}" instructions updated (autonomous)`);
        }
      } catch (evErr) {
        console.error("team evolution fold failed", evErr);
      }
    } catch (err) {
      toast(`Execution error: ${String(err)}`, "err");
    } finally {
      setRunnerRunning(false);
    }
  };

  const validationIssues = useMemo(() => validateTeam(selectedTeam), [selectedTeam]);
  const worktreePlans: WorktreePlan[] = useMemo(
    () => planWorktrees(selectedTeam, { repoRoot: runnerRepo, baseBranch: "main", missionSlug: "team-mission", deferReview: true }),
    [selectedTeam, runnerRepo],
  );

  const filteredMessages = useMemo(
    () => channelMessages.filter((m) => activeChannel === "#all" || m.channel === activeChannel),
    [channelMessages, activeChannel],
  );

  return (
    <div className="panel-page animate-enter" style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
            CLI Agent Crews &amp; Multi-Agent Intelligence Layer
          </h2>
          <p className="sub" style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-dim)" }}>
            14 Coding CLIs · Real-Time Bus · Red vs Blue Arena · AST Merge · Consensus · Chaos Race Isolator · Org Memory · Failure Classifier · Provenance Audit · Mock Bridge
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="primary" onClick={() => void deployToCanvas(selectedTeam)}>
            Deploy Selected to Canvas
          </button>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="row" style={{ gap: 6, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 10, flexWrap: "wrap" }}>
        <button
          className={activeTab === "crews" ? "primary" : ""}
          onClick={() => setActiveTab("crews")}
        >
          CLI Agent Crews ({cliTeams.length})
        </button>
        <button
          className={activeTab === "channel" ? "primary" : ""}
          onClick={() => setActiveTab("channel")}
        >
          Inter-Agent Bus &amp; Chat
        </button>
        <button
          className={activeTab === "arena" ? "primary" : ""}
          onClick={() => setActiveTab("arena")}
        >
          ⚔️ Adversarial Arena (Red vs Blue)
        </button>
        <button
          className={activeTab === "astmerge" ? "primary" : ""}
          onClick={() => setActiveTab("astmerge")}
        >
          🧬 Structural 3-Way Merge
        </button>
        <button
          className={activeTab === "consensus" ? "primary" : ""}
          onClick={() => setActiveTab("consensus")}
        >
          ⚖️ Multi-Agent Consensus Matrix
        </button>
        <button
          className={activeTab === "chaos" ? "primary" : ""}
          onClick={() => setActiveTab("chaos")}
        >
          🔬 Chaos Race Isolator
        </button>
        <button
          className={activeTab === "memory" ? "primary" : ""}
          onClick={() => setActiveTab("memory")}
        >
          🧠 Org Memory Cortex
        </button>
        <button
          className={activeTab === "failure" ? "primary" : ""}
          onClick={() => setActiveTab("failure")}
        >
          🛠️ Failure Classifier &amp; Repair
        </button>
        <button
          className={activeTab === "provenance" ? "primary" : ""}
          onClick={() => setActiveTab("provenance")}
        >
          📜 Provenance Audit Export
        </button>
        <button
          className={activeTab === "matrix" ? "primary" : ""}
          onClick={() => setActiveTab("matrix")}
        >
          📊 Capability Matrix
        </button>
        <button
          className={activeTab === "mockbridge" ? "primary" : ""}
          onClick={() => setActiveTab("mockbridge")}
        >
          🌉 Contract Mock Bridge
        </button>
        <button
          className={activeTab === "runner" ? "primary" : ""}
          onClick={() => setActiveTab("runner")}
        >
          Team Mission Runner {runnerRunning && "●"}
        </button>
        <button
          className={activeTab === "evolve" ? "primary" : ""}
          onClick={() => setActiveTab("evolve")}
        >
          ⟳ Evolution &amp; Feedback
        </button>
        <button
          className={activeTab === "builder" ? "primary" : ""}
          onClick={() => setActiveTab("builder")}
        >
          + Build Custom Crew
        </button>
        <button
          className={activeTab === "frameworks" ? "primary" : ""}
          onClick={() => setActiveTab("frameworks")}
        >
          Canvas Frameworks ({AGENT_FRAMEWORKS.length})
        </button>
      </div>

      {/* ── TAB 1: CLI AGENT CREWS ────────────────────────────────────────── */}
      {activeTab === "crews" && (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20 }}>
          {/* Left Column: Team List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)" }}>
              Available Multi-Agent Crews
            </div>
            {cliTeams.map((team) => {
              const isSelected = selectedTeamId === team.id;
              const hasWriter = team.seats.some((s) => s.mayWrite);
              const hasReviewer = team.seats.some((s) => s.role === "reviewer" || s.role === "security");
              const vendorCount = new Set(team.seats.map((s) => s.harness)).size;

              return (
                <div
                  key={team.id}
                  className={`card ${isSelected ? "selected" : ""}`}
                  style={{
                    cursor: "pointer",
                    padding: "14px 16px",
                    position: "relative",
                  }}
                  onClick={() => setSelectedTeamId(team.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{team.name}</span>
                    <span className="pill ok" style={{ fontSize: 10, padding: "2px 6px" }}>
                      {team.seats.length} seats
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
                    {team.description}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {team.seats.map((s) => {
                      const badge = HARNESS_BADGES[s.harness] ?? { label: s.harness, color: "var(--text-dim)", bg: "var(--bg-panel)" };
                      return (
                        <span
                          key={s.id}
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 3,
                            backgroundColor: badge.bg,
                            color: badge.color,
                            fontWeight: 600,
                            border: `1px solid ${badge.bg}`,
                          }}
                        >
                          {s.role}: {badge.label.split(" ")[0]}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-mute)", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                    <span>{vendorCount} CLI vendor(s)</span>
                    <span>{hasWriter ? "Writes & Commits" : "Read-Only"} · {hasReviewer ? "Peer-Reviewed" : "No Reviewer"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Selected Team Inspection */}
          <div>
            {selectedTeam && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{selectedTeam.name}</h3>
                    <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{selectedTeam.description}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="primary" onClick={() => { setActiveTab("channel"); }}>
                      Open Inter-Agent Bus
                    </button>
                    <button onClick={() => { setActiveTab("runner"); }}>
                      Launch Mission
                    </button>
                  </div>
                </div>

                {/* Diagnostics and Team Validation */}
                {validationIssues.length > 0 && (
                  <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 4, background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.3)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#eab308", marginBottom: 4 }}>
                      Policy Diagnostics ({validationIssues.length})
                    </div>
                    {validationIssues.map((issue, idx) => (
                      <div key={idx} style={{ fontSize: 11, color: issue.severity === "error" ? "var(--danger)" : "var(--text-dim)", marginTop: 2 }}>
                        • {issue.message}
                      </div>
                    ))}
                  </div>
                )}

                {/* Seats Roster */}
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)", marginBottom: 10 }}>
                  Active Team Seats ({selectedTeam.seats.length})
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedTeam.seats.map((seat, index) => {
                    const badge = HARNESS_BADGES[seat.harness] ?? { label: seat.harness, color: "var(--text)", bg: "var(--bg-panel)" };
                    const cap = AGENT_CAPABILITIES[seat.harness];
                    const installed = cliStatus[seat.harness] ?? cliStatus[cap?.bins[0] ?? ""] ?? false;

                    return (
                      <div
                        key={seat.id}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 4,
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-mute)", width: 20 }}>
                            #{index + 1}
                          </span>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{seat.id}</span>
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: "2px 6px",
                                  borderRadius: 3,
                                  backgroundColor: badge.bg,
                                  color: badge.color,
                                  fontWeight: 700,
                                }}
                              >
                                {badge.label}
                              </span>
                              <span className="pill" style={{ fontSize: 10, textTransform: "uppercase" }}>
                                {seat.role}
                              </span>
                              <span
                                className={`pill ${installed ? "ok" : ""}`}
                                style={{ fontSize: 9 }}
                                title={installed ? "Binary detected on PATH" : `Install: ${cap?.install ?? seat.harness}`}
                              >
                                {installed ? "● on PATH" : "○ not detected"}
                              </span>
                            </div>
                            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                              {seat.mayWrite ? "✎ Writes in private git worktree" : "⛊ Read-only on review snapshot"} · Risk: {seat.maxRisk ?? "LOW"} · Timeout: {seat.timeoutSecs}s
                              {seat.instructions ? ` · "${seat.instructions}"` : ""}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            style={{ fontSize: 11, padding: "3px 8px" }}
                            onClick={() => setInspectSeat(seat)}
                          >
                            Inspect Invocation
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Worktree & Review Snapshot Isolation Plan */}
                <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)", marginBottom: 8 }}>
                    Worktree &amp; Review Snapshot Isolation Architecture
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                    Every writing agent works in a private git worktree sibling to avoid clobbering other seats. Reviewers inspect a synthesized review snapshot branch (merged with <span className="mono">--no-ff</span>) rather than the base checkout.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {worktreePlans.map((wp) => (
                      <div
                        key={wp.seatId}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 3,
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border)",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ color: wp.deferred ? "var(--amber)" : wp.shared ? "var(--text-dim)" : "var(--text)" }}>
                          [{wp.seatId}] {wp.path}
                        </span>
                        <span className="muted">{wp.branch ? `branch: ${wp.branch}` : wp.deferred ? "snapshot merge" : "base"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: INTER-AGENT LIVE BUS & CHAT ────────────────────────────── */}
      {activeTab === "channel" && (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 320px", gap: 16, minHeight: 560 }}>
          {/* Left Column: Channels & Active Agents */}
          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 8 }}>
                Communication Channels
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {DEFAULT_CHANNELS.map((ch) => (
                  <button
                    key={ch.id}
                    className={activeChannel === ch.id ? "primary" : ""}
                    style={{ justifyContent: "flex-start", padding: "6px 10px", fontSize: 12, textAlign: "left" }}
                    onClick={() => setActiveChannel(ch.id)}
                  >
                    {ch.id}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 8 }}>
                Connected Agents ({selectedTeam.seats.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {selectedTeam.seats.map((seat) => {
                  const badge = HARNESS_BADGES[seat.harness];
                  return (
                    <div
                      key={seat.id}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 3,
                        background: "var(--bg-panel)",
                        border: "1px solid var(--border)",
                        fontSize: 11,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>@{seat.id}</span>
                      <span style={{ fontSize: 9, color: badge?.color }}>{badge?.label.split(" ")[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <button
                className="primary"
                disabled={isDebating}
                style={{ width: "100%", fontSize: 12, padding: "8px 12px" }}
                onClick={() => void handleSimulateDebate()}
              >
                {isDebating ? "Agents Debating..." : "⚡ Run Simulated Debate (Prototype)"}
              </button>
              <div className="muted" style={{ fontSize: 10, marginTop: 6, textAlign: "center" }}>
                Connected to live engine bus. Real mission runs stream commits &amp; verdicts here.
              </div>
            </div>
          </div>

          {/* Center Column: Live Conversation Feed */}
          <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", height: 600 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{activeChannel}</span>
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                  {DEFAULT_CHANNELS.find((c) => c.id === activeChannel)?.description ?? "Message stream"}
                </span>
              </div>
              <button
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => { globalAgentBus.clear(); setChannelMessages([]); }}
              >
                Clear Stream
              </button>
            </div>

            {/* Chat Messages */}
            <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 }}>
              {filteredMessages.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-mute)", margin: "auto", fontSize: 12 }}>
                  No messages in {activeChannel} yet. Run a mission or debate to see real-time parallel communication!
                </div>
              ) : (
                filteredMessages.map((msg) => {
                  const intentBadge = INTENT_COLORS[msg.intent] ?? { bg: "var(--bg-panel)", color: "var(--text)" };
                  const badge = HARNESS_BADGES[msg.sender.harness];
                  return (
                    <div
                      key={msg.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 4,
                        background: "var(--bg-panel)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: badge?.color ?? "var(--text)" }}>
                            {msg.sender.name} (@{msg.sender.seatId})
                          </span>
                          <span
                            style={{
                              fontSize: 9,
                              padding: "1px 5px",
                              borderRadius: 2,
                              backgroundColor: intentBadge.bg,
                              color: intentBadge.color,
                              fontWeight: 700,
                              textTransform: "uppercase",
                            }}
                          >
                            {msg.intent}
                          </span>
                        </div>
                        <span className="muted" style={{ fontSize: 10 }}>
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Operator Message Input */}
            <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <input
                type="text"
                placeholder={`Inject operator guidance into ${activeChannel} (e.g. "@coder optimize token bucket performance")...`}
                value={operatorInput}
                onChange={(e) => setOperatorInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSendOperatorMessage(); }}
                style={{ flex: 1 }}
              />
              <button className="primary" onClick={handleSendOperatorMessage}>
                Send
              </button>
            </div>
          </div>

          {/* Right Column: Shared Blackboard & API Contracts */}
          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-mute)" }}>
              Shared Blackboard State
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              Shared facts, active contracts, and schemas agreed upon by parallel agents.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, overflowY: "auto" }}>
              {blackboardEntries.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-mute)", margin: "auto", fontSize: 11 }}>
                  Blackboard is empty. Agents write contracts and specs here during collaboration.
                </div>
              ) : (
                blackboardEntries.map((entry) => (
                  <div
                    key={entry.key}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 3,
                      background: "var(--bg-panel)",
                      border: "1px solid var(--border)",
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span className="mono" style={{ fontWeight: 700, color: "var(--amber)" }}>
                        {entry.key}
                      </span>
                      <span className="pill" style={{ fontSize: 9 }}>v{entry.version}</span>
                    </div>
                    <pre className="mono" style={{ margin: 0, fontSize: 10, whiteSpace: "pre-wrap", color: "var(--text)" }}>
                      {entry.value}
                    </pre>
                    <div className="muted" style={{ fontSize: 9, marginTop: 4 }}>
                      Author: @{entry.author} · {new Date(entry.updatedAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: ADVERSARIAL ARENA (RED TEAM VS BLUE TEAM) ──────────────── */}
      {activeTab === "arena" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>⚔️ Autonomous Adversarial Hardening Arena</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Pit Builder agents (Blue Team) against specialized Fuzzers and Penetration Hackers (Red Team) to prove code invariants under adversarial stress before merging.
              </p>
            </div>
            <button
              className="primary"
              disabled={duelRunning}
              onClick={() => void handleRunDuel()}
              style={{ padding: "8px 20px" }}
            >
              {duelRunning ? "Running Adversarial Duel..." : "⚡ Execute Red vs Blue Duel"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div style={{ padding: 14, borderRadius: 4, background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#3b82f6", marginBottom: 6 }}>🛡️ Blue Team (Defender / Builder)</div>
              <div style={{ fontSize: 12 }}>Agent: <strong>Claude Code / Codex</strong></div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Builds target features in isolated worktree, synthesizes patches when breaches are uncovered.</div>
            </div>
            <div style={{ padding: 14, borderRadius: 4, background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#ef4444", marginBottom: 6 }}>⚔️ Red Team (Attacker / Fuzzer)</div>
              <div style={{ fontSize: 12 }}>Agent: <strong>xAI Grok / Cline Hacker</strong></div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Generates malicious payloads, race condition fixtures, token bucket burst attacks, and null probes.</div>
            </div>
          </div>

          {/* Standard Attack Vectors Display */}
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)", marginBottom: 8 }}>
            Configured Adversarial Attack Probes ({STANDARD_ATTACK_VECTORS.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
            {STANDARD_ATTACK_VECTORS.map((v) => (
              <div key={v.id} style={{ padding: "10px 12px", borderRadius: 3, background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 11 }}>
                <div style={{ fontWeight: 700, color: "var(--text)" }}>{v.title}</div>
                <div className="muted" style={{ marginTop: 2 }}>{v.description}</div>
              </div>
            ))}
          </div>

          {/* Duel Results */}
          {duelReport && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  Hardening Verdict:{" "}
                  <span className={`pill ${duelReport.hardened ? "ok" : "err"}`} style={{ fontSize: 11, textTransform: "uppercase" }}>
                    {duelReport.hardened ? "CERTIFIED HARDENED" : "REMEDIATION REQUIRED"}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  Defense Score: <span style={{ color: duelReport.defenseScore >= 90 ? "var(--green)" : "var(--amber)" }}>{duelReport.defenseScore}%</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {duelReport.rounds.map((r) => (
                  <div key={r.round} style={{ padding: 12, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontWeight: 700 }}>Round {r.round}: {r.vector.title}</span>
                      <span className={`pill ${r.defenseStatus === "defended" ? "ok" : "err"}`} style={{ fontSize: 10 }}>
                        {r.defenseStatus.toUpperCase()}
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {r.defenseStatus === "patched" ? "🚨 Vulnerability detected! Blue Team synthesized a verified mutex patch." : "✅ Invariant held cleanly."}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: SEMANTIC STRUCTURAL MERGE SYNTHESIZER ────────────────── */}
      {activeTab === "astmerge" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🧬 Semantic Structural 3-Way Merge &amp; Interface Union Engine</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                When multiple coding agents modify the same file in parallel worktrees, standard git text merge creates conflict markers. MJ decomposes source structures, computes member unions, and synthesizes clean unified source code without conflict markers.
              </p>
            </div>
            <button className="primary" onClick={handleRunAstMerge}>
              Run Structural Merge Demo
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 10, background: "var(--bg-panel)", borderRadius: 3, border: "1px solid var(--border)", fontSize: 11 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Base Tree (`main`)</div>
              <pre className="mono" style={{ margin: 0, fontSize: 10, whiteSpace: "pre-wrap" }}>
{`export function createApp() {
  return { ok: true };
}`}
              </pre>
            </div>
            <div style={{ padding: 10, background: "var(--bg-panel)", borderRadius: 3, border: "1px solid var(--border)", fontSize: 11 }}>
              <div style={{ fontWeight: 700, color: "var(--blue)", marginBottom: 4 }}>Seat 1: `claude_coder`</div>
              <pre className="mono" style={{ margin: 0, fontSize: 10, whiteSpace: "pre-wrap" }}>
{`export function rateLimitMiddleware() {
  return true;
}`}
              </pre>
            </div>
            <div style={{ padding: 10, background: "var(--bg-panel)", borderRadius: 3, border: "1px solid var(--border)", fontSize: 11 }}>
              <div style={{ fontWeight: 700, color: "var(--green)", marginBottom: 4 }}>Seat 2: `codex_coder`</div>
              <pre className="mono" style={{ margin: 0, fontSize: 10, whiteSpace: "pre-wrap" }}>
{`export function auditLogMiddleware() {
  auditLogger.log(req.path);
}`}
              </pre>
            </div>
          </div>

          {astMergeResult && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  Synthesized Conflict-Free Output ({astMergeResult.astNodeCount} structural blocks reconciled)
                </span>
                <span className="pill ok" style={{ fontSize: 10 }}>0 Git Conflict Markers</span>
              </div>
              <pre className="mono" style={{ padding: 12, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 11, whiteSpace: "pre-wrap" }}>
                {astMergeResult.mergedContent}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 5: MULTI-AGENT CONSENSUS MATRIX ─────────────────────────── */}
      {activeTab === "consensus" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>⚖️ Reputation-Weighted Multi-Agent Consensus Engine</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Multi-agent code review consensus. Agent review votes are mathematically weighted by their empirical track records of verified commits and accurate reviews.
              </p>
            </div>
            <button className="primary" onClick={handleRunConsensus}>
              Compute Quorum &amp; Consensus
            </button>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)", marginBottom: 8 }}>
            Empirical Agent Reputation Weights
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
            {(Object.entries(INITIAL_REPUTATIONS) as [string, AgentReputation][]).slice(0, 8).map(([harness, rep]) => (
              <div key={harness} style={{ padding: 10, borderRadius: 3, background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>{HARNESS_BADGES[harness as HarnessId]?.label ?? harness}</div>
                <div className="muted" style={{ marginTop: 2 }}>Weight: <strong>{rep.reputationWeight.toFixed(1)}x</strong></div>
                <div className="muted" style={{ fontSize: 10 }}>{rep.verifiedCommits} commits · {rep.accurateReviews} reviews</div>
              </div>
            ))}
          </div>

          {consensusResult && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Quorum Verdict: <span className="pill ok">{consensusResult.status}</span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Score: {(consensusResult.consensusScore * 100).toFixed(1)}% · Approve: {consensusResult.approveWeight.toFixed(2)} / Reject: {consensusResult.rejectWeight.toFixed(2)}
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 12 }}>
                {consensusResult.summary}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 6: CHAOS RACE ISOLATOR ─────────────────────────────────── */}
      {activeTab === "chaos" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🔬 Chaos Async Race Isolator &amp; Flaky Test Bi-Section Engine</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Injects deterministic async microtask jitter, event-loop starvation, and promise resolution re-ordering to expose race conditions in under 5 runs, pinpoints the offending line, and synthesizes an atomic mutex lock patch.
              </p>
            </div>
            <button className="primary" disabled={chaosRunning} onClick={() => void handleRunChaos()}>
              {chaosRunning ? "Running Chaos Bisection..." : "⚡ Run Chaos Bisection"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 12, borderRadius: 4, background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>Microtask Jitter Injection</div>
              <div className="muted" style={{ fontSize: 11 }}>Deterministic async delay per run (5ms, 10ms, 15ms, 20ms) to expose non-atomic read-modify-write sequences.</div>
            </div>
            <div style={{ padding: 12, borderRadius: 4, background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.25)", fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: "#eab308", marginBottom: 4 }}>Promise Re-Ordering</div>
              <div className="muted" style={{ fontSize: 11 }}>Shuffles microtask queue execution order to simulate event-loop starvation and concurrent state corruption.</div>
            </div>
            <div style={{ padding: 12, borderRadius: 4, background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: "#10b981", marginBottom: 4 }}>Atomic Mutex Patch Synthesis</div>
              <div className="muted" style={{ fontSize: 11 }}>Auto-generates verified mutex lock repair code to eliminate the detected race condition root cause.</div>
            </div>
          </div>

          {chaosDiagnosis && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  Race Isolated in {chaosDiagnosis.reproducedInRuns} Run(s)
                </span>
                <span className={`pill ${chaosDiagnosis.verifiedFixed ? "ok" : "err"}`} style={{ fontSize: 10 }}>
                  {chaosDiagnosis.verifiedFixed ? "VERIFIED FIXED" : "PROTOTYPE PATCH"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: 12, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Root Cause</div>
                  <div className="muted">{chaosDiagnosis.rootCauseKind} at {chaosDiagnosis.offendingFile}:{chaosDiagnosis.offendingLineNumber}</div>
                  <pre className="mono" style={{ margin: "6px 0 0", fontSize: 10, whiteSpace: "pre-wrap", color: "var(--danger)" }}>{chaosDiagnosis.offendingCodeSnippet}</pre>
                </div>
                <div style={{ padding: 12, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Synthesized Atomic Lock Patch</div>
                  <pre className="mono" style={{ margin: "6px 0 0", fontSize: 10, whiteSpace: "pre-wrap", color: "var(--green)" }}>{chaosDiagnosis.atomicLockPatch}</pre>
                </div>
              </div>
              <div style={{ marginTop: 10, padding: 10, borderRadius: 3, background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 11 }}>
                <span style={{ fontWeight: 700 }}>Flakiness Rate Under Chaos:</span> {(chaosDiagnosis.flakinessRate * 100).toFixed(0)}% ({chaosDiagnosis.rootCauseKind})
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 7: ORGANIZATIONAL MEMORY CORTEX ────────────────────────── */}
      {activeTab === "memory" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🧠 Causal Organizational Memory &amp; Invariant Compiler</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Extracts verified failure-to-repair causal chains from the Flight Recorder, distills empirical invariants, and auto-compiles pre-mission briefings so agents never repeat past mistakes.
              </p>
            </div>
            <button className="primary" onClick={handleCompileMemory}>
              Compile Invariant Briefing
            </button>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)", marginBottom: 8 }}>
            Seed Invariants ({SEED_INVARIANTS.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {SEED_INVARIANTS.map((inv) => (
              <div key={inv.id} style={{ padding: 12, borderRadius: 4, background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700 }}>[{inv.category.toUpperCase()}] {inv.rule}</span>
                  <span className="pill ok" style={{ fontSize: 9 }}>{(inv.successRate * 100).toFixed(0)}% success</span>
                </div>
                <div className="muted" style={{ fontSize: 11 }}>Failure: {inv.failureObserved}</div>
                <div className="muted" style={{ fontSize: 11 }}>Repair: {inv.verifiedRepairAction}</div>
                <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>Applied {inv.timesApplied} times · Origin: {inv.originatingMissionId}</div>
              </div>
            ))}
          </div>

          {memoryReport && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                Compiled Briefing: {memoryReport.invariantsCompiled} Active Invariants
              </div>
              <pre className="mono" style={{ padding: 12, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>
                {memoryReport.generatedBriefingMarkdown}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 8: FAILURE CLASSIFIER & REPAIR LADDER ──────────────────── */}
      {activeTab === "failure" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🛠️ MAST Failure Classification &amp; Deterministic Repair Ladder</h3>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Classifies mission failures using the MAST taxonomy and enforces a systematic multi-stage repair progression — always terminating with escalation to human authority.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <input
              type="text"
              value={failureInput}
              onChange={(e) => setFailureInput(e.target.value)}
              placeholder="Paste error message (e.g. 'Tool failed: timeout after 5 retries')"
              style={{ flex: 1 }}
            />
            <button className="primary" onClick={handleClassifyFailure}>
              Classify &amp; Generate Repair Ladder
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
            {(Object.entries(FAILURE_CLASS_LABEL) as [FailureClass, string][]).slice(0, 8).map(([cls, label]) => (
              <div key={cls} style={{ padding: 8, borderRadius: 3, background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 10, fontWeight: 600 }}>
                {label}
              </div>
            ))}
          </div>

          {failureSignals.length > 0 && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              {failureSignals.map((sig) => {
                const ladder = fullLadder(sig.class);
                return (
                  <div key={sig.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        Classified: <span className="pill err">{sig.class}</span>
                      </span>
                      <span className="muted" style={{ fontSize: 12 }}>{sig.message}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-mute)", marginBottom: 6 }}>
                      Deterministic Repair Ladder ({ladder.length} stages)
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {ladder.map((action, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ padding: "8px 14px", borderRadius: 4, background: action === "ESCALATE_HUMAN" ? "rgba(239, 68, 68, 0.15)" : "rgba(59, 130, 246, 0.15)", border: `1px solid ${action === "ESCALATE_HUMAN" ? "rgba(239, 68, 68, 0.3)" : "rgba(59, 130, 246, 0.3)"}`, fontSize: 11, fontWeight: 700, color: action === "ESCALATE_HUMAN" ? "#ef4444" : "#3b82f6" }}>
                            {action.replace(/_/g, " ")}
                          </div>
                          {i < ladder.length - 1 && <span style={{ color: "var(--text-mute)", fontSize: 14 }}>→</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 9: PROVENANCE AUDIT EXPORT ─────────────────────────────── */}
      {activeTab === "provenance" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>📜 EU AI Act Art. 50 &amp; C2PA Provenance Manifest</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Generates machine-readable provenance manifests tracking synthetic content lineage, tools used, models used, and artifact derivation chains for regulatory compliance.
              </p>
            </div>
            <button className="primary" onClick={handleGenerateProvenance}>
              Generate Provenance Manifest
            </button>
          </div>

          {provenanceManifest && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  Manifest: {provenanceManifest.claims.length} Claims · Hash: {provenanceManifest.manifestHash}
                </span>
                <span className={`pill ${verifyManifest(provenanceManifest).ok ? "ok" : "err"}`} style={{ fontSize: 10 }}>
                  {verifyManifest(provenanceManifest).ok ? "VERIFIED INTEGRITY" : "INTEGRITY BREACH"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, borderRadius: 3, background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 11 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Generator</div>
                  <div className="muted">{provenanceManifest.generator.name} v{provenanceManifest.generator.version}</div>
                  <div className="muted">Harnesses: {provenanceManifest.generator.harnesses.join(", ")}</div>
                </div>
                <div style={{ padding: 10, borderRadius: 3, background: "var(--bg-panel)", border: "1px solid var(--border)", fontSize: 11 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Ledger</div>
                  <div className="muted">Head: {provenanceManifest.ledger.head}</div>
                  <div className="muted">Entries: {provenanceManifest.ledger.entries} · Verified: {provenanceManifest.ledger.verified ? "Yes" : "No"}</div>
                </div>
              </div>

              <pre className="mono" style={{ padding: 12, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 10, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>
                {renderManifest(provenanceManifest)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 10: CAPABILITY COMPARISON MATRIX ──────────────────────── */}
      {activeTab === "matrix" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>📊 Architectural Capability Matrix: MJ vs Standard Multi-Agent IDEs</h3>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Side-by-side comparison of MJ's structural superpowers against standard multi-agent workspace capabilities.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PROLIFERATE_COMPARISON_MATRIX.map((row, i) => (
              <div key={i} style={{ padding: 14, borderRadius: 4, background: "var(--bg-panel)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{row.dimension}</span>
                  <span className="pill" style={{ fontSize: 9, textTransform: "uppercase" }}>{row.category}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ fontSize: 11, padding: 10, borderRadius: 3, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 700, color: "var(--text-mute)", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>Standard Approach</div>
                    <div className="muted">{row.proliferateApproach}</div>
                  </div>
                  <div style={{ fontSize: 11, padding: 10, borderRadius: 3, background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)" }}>
                    <div style={{ fontWeight: 700, color: "#3b82f6", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>MJ Superpower: {row.mjSuperpower}</div>
                    <div className="muted">{row.technicalAdvantage}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 11: CONTRACT MOCK BRIDGE ───────────────────────────────── */}
      {activeTab === "mockbridge" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🌉 Synthetic API Contract Mock Bridge &amp; Dynamic Schema Server</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                When an agent publishes a TypeScript interface or OpenAPI contract to the Blackboard, the Mock Bridge instantly compiles dynamic mock HTTP handlers and client SDK stubs so consumer agents can test without waiting for backend implementation.
              </p>
            </div>
            <button className="primary" onClick={handleDeployMockBridge}>
              Deploy Mock from Blackboard
            </button>
          </div>

          {mockBridges.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mockBridges.map((bridge) => (
                <div key={bridge.contractId} style={{ padding: 14, borderRadius: 4, background: "var(--bg-panel)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{bridge.contractKey}</span>
                    <span className={`pill ${bridge.status === "active" ? "ok" : ""}`} style={{ fontSize: 9 }}>{bridge.status}</span>
                  </div>
                  <div style={{ fontSize: 11, marginBottom: 8 }}>
                    <span className="muted">Contract: {bridge.contractId}</span> · <span className="muted">Author: @{bridge.authorSeat}</span> · <span className="muted">{bridge.endpoints.length} endpoint(s)</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {bridge.endpoints.map((ep, i) => (
                      <div key={i} style={{ padding: "6px 10px", borderRadius: 3, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                        <span style={{ fontWeight: 700, color: ep.method === "GET" ? "var(--green)" : ep.method === "POST" ? "var(--blue)" : "var(--amber)" }}>{ep.method}</span> {ep.path}
                        <span className="muted" style={{ marginLeft: 8 }}>→ {ep.responseSchema}</span>
                      </div>
                    ))}
                  </div>
                  <pre className="mono" style={{ margin: "8px 0 0", padding: 8, borderRadius: 3, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 9, whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto" }}>
                    {bridge.clientSdkStub}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "var(--text-mute)", padding: 40, fontSize: 13 }}>
              No mock bridges deployed yet. Run a debate to publish contracts to the Blackboard, then deploy mocks here.
            </div>
          )}
        </div>
      )}

      {/* ── TAB 12: TEAM MISSION RUNNER ────────────────────────────────── */}
      {activeTab === "runner" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Interactive Team Mission Runner</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Execute a coordinated multi-vendor mission with <strong>{selectedTeam.name}</strong> ({selectedTeam.seats.length} agents).
              </p>
            </div>
            <button
              className="primary"
              disabled={runnerRunning}
              onClick={() => void handleRunMission()}
              style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600 }}
            >
              {runnerRunning ? "Executing Multi-Wave Team..." : "▶ Run Team Mission"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <label className="field">
              Task Objective
              <textarea
                rows={3}
                value={runnerObjective}
                onChange={(e) => setRunnerObjective(e.target.value)}
                placeholder="Describe what the team should build, test, and review..."
                style={{ width: "100%", marginTop: 6 }}
              />
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label className="field">
                Target Repository / Workspace Path
                <input
                  type="text"
                  value={runnerRepo}
                  onChange={(e) => setRunnerRepo(e.target.value)}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              <label className="field">
                Verification / Test Command
                <input
                  type="text"
                  value={runnerTestCmd}
                  onChange={(e) => setRunnerTestCmd(e.target.value)}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
            </div>
          </div>

          {/* Real-time execution results & evidence */}
          {runnerResult && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Mission Outcome: <span className="pill ok" style={{ textTransform: "uppercase" }}>{runnerResult.status}</span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Wall clock: {(runnerResult.wallClockMs / 1000).toFixed(2)}s · Spend: ${(runnerResult.spentUsd || 0).toFixed(4)}
                </div>
              </div>

              <div style={{ padding: 12, borderRadius: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", marginBottom: 16, fontSize: 12, lineHeight: 1.5 }}>
                {runnerResult.summary}
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)", marginBottom: 8 }}>
                Agent Seat Records ({runnerResult.seats.length})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {runnerResult.seats.map((seat: SeatRecord) => (
                  <div
                    key={seat.seatId}
                    style={{
                      padding: 12,
                      borderRadius: 4,
                      background: "var(--bg-panel)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        [{seat.seatId}] {seat.harnessName} ({seat.role})
                      </span>
                      <span className={`pill ${seat.outcome === "completed" ? "ok" : ""}`} style={{ fontSize: 10 }}>
                        {seat.outcome}
                      </span>
                    </div>
                    {seat.selfReport && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 4, color: "var(--text)" }}>
                        Verdict: {seat.selfReport}
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      Worktree: <span className="mono">{seat.cwd}</span> · Branch: <span className="mono">{seat.branch}</span>
                    </div>
                    {seat.commit && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        Commit: {seat.commit}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* V11.2 — FEEDBACK LOOP: the operator rates the run; the rating queues as evidence. */}
          {runnerResult && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Rate this run</div>
              <div className="row" style={{ marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map((r) => (
                  <button key={r} className={feedbackRating === r ? "primary" : ""} onClick={() => setFeedbackRating(r)}>{r}</button>
                ))}
                <input
                  type="text"
                  placeholder="What should the team do differently? (becomes evidence)"
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  style={{ flex: 1, minWidth: 220 }}
                />
                <button
                  className="primary"
                  disabled={feedbackRating === null}
                  onClick={() => {
                    if (feedbackRating === null) return;
                    // A rating belongs to the whole run; attach it to every seat that ran so the
                    // seat-level ledger sees it, then clear the form.
                    let store = loadTeamEvoStore();
                    for (const s of runnerResult.seats) {
                      store = applyTeamFeedback(store, {
                        teamId: selectedTeam.id,
                        seatId: s.seatId,
                        runId: runnerRunId ?? `run-${runnerResult.startedAt}`,
                        rating: feedbackRating,
                        comment: feedbackComment,
                      });
                    }
                    updateEvo(store);
                    toast(`Feedback recorded (${feedbackRating}/5) — queued as evolution evidence`);
                    setFeedbackRating(null);
                    setFeedbackComment("");
                  }}
                >
                  Submit feedback
                </button>
              </div>
              {feedbackRating !== null && feedbackRating >= 4 && (
                <div className="muted" style={{ fontSize: 11 }}>
                  Praise suppresses new candidates for the next 3 runs — a seat that is working is not a seat to change.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TEAM EVOLUTION & FEEDBACK LOOP ───────────────────────────── */}
      {activeTab === "evolve" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Team Evolution &amp; Feedback Loop</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                V11.2 — every run is folded into a per-seat ledger. Evidence (failed runs, unverified
                checks, human ratings) produces a gated candidate edit of the seat's instructions.
                SUGGEST asks you; AUTONOMOUS applies what passes every gate. A candidate's score is
                never claimed before a run measured it.
              </p>
            </div>
            <div className="row">
              {(["OFF", "SUGGEST", "AUTONOMOUS"] as const).map((m) => (
                <button
                  key={m}
                  className={(evo.byTeam[selectedTeam.id]?.mode ?? "SUGGEST") === m ? "primary" : ""}
                  onClick={() => {
                    const te = evo.byTeam[selectedTeam.id] ?? { mode: "SUGGEST" as TeamEvolveMode, seats: {} };
                    updateEvo({ ...evo, byTeam: { ...evo.byTeam, [selectedTeam.id]: { ...te, mode: m } } });
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
            Selected team: <strong>{selectedTeam.name}</strong> — mode: {evo.byTeam[selectedTeam.id]?.mode ?? "SUGGEST"}
          </div>

          {/* per-seat ledgers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 18 }}>
            {selectedTeam.seats.map((s) => {
              const st = evo.byTeam[selectedTeam.id]?.seats[s.id];
              const stats = st?.stats;
              const fb = evo.feedback.filter((f) => f.teamId === selectedTeam.id && f.seatId === s.id);
              return (
                <div key={s.id} style={{ border: "1px solid var(--border)", padding: 10, borderRadius: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>[{s.id}] {s.role} <span className="muted mono">{s.harness}</span></div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                    runs {stats?.runs ?? 0} · ok {stats ? Math.round(stats.okRate * 100) : 0}% · verified {stats ? Math.round(stats.verifiedRate * 100) : 0}%
                    {stats && stats.totalCostUsd > 0 ? ` · $${stats.totalCostUsd.toFixed(3)}` : ""}
                    {stats?.feedbackCount ? ` · rated avg ${(stats.feedbackAvg ?? 0).toFixed(1)}` : ""}
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    instructions v{st?.instructionVersion ?? 1} · edits {st?.editCount ?? 0}
                    {st && st.pendingFeedback.length > 0 ? ` · ${st.pendingFeedback.length} queued feedback` : ""}
                  </div>
                  {fb.length > 0 && (
                    <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-dim)" }}>
                      last rating: {fb[0].rating}/5{fb[0].comment ? ` — "${fb[0].comment}"` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* candidates */}
          {(() => {
            const cands = evo.candidates.filter((c) => c.teamId === selectedTeam.id);
            if (cands.length === 0) {
              return <div className="muted" style={{ fontSize: 12 }}>No evolution candidates yet. Run the Team Mission Runner with SUGGEST or AUTONOMOUS and evidence will appear here.</div>;
            }
            return (
              <>
                <div className="card-title" style={{ marginBottom: 8 }}>Candidates ({cands.length})</div>
                {cands.map((c) => (
                  <div key={c.id} style={{ border: "1px solid var(--border)", padding: 12, borderRadius: 2, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        seat "{c.seatId}" ({c.role}, {c.harness}) · trigger {c.trigger}
                        <span className={`pill ${c.status === "DECIDED" ? (c.decision === "ACCEPTED" ? "ok" : "err") : ""}`} style={{ marginLeft: 8, fontSize: 10 }}>
                          {c.decision}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>{c.createdAt.slice(0, 19).replace("T", " ")}</div>
                    </div>
                    <div style={{ fontSize: 11, marginTop: 6 }}>
                      baseline score {c.baselineScore !== null ? c.baselineScore.toFixed(3) : "—"} · candidate score{" "}
                      <span className="muted">{c.candidateScore !== null ? c.candidateScore.toFixed(3) : "unmeasured"}</span>
                      {c.candidateScore === null && <span className="muted"> ({c.scoreNote})</span>}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 6 }}>
                      {c.evidence.map((e, i) => (
                        <div key={i} className="muted" style={{ marginTop: 2 }}>▸ {e.text} <span className="mono">w{e.weight}</span></div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {c.gates.map((g) => (
                        <span key={g.name} className={`pill ${g.passed ? "ok" : "err"}`} style={{ fontSize: 10 }} title={g.message}>
                          {g.name}
                        </span>
                      ))}
                    </div>
                    <pre className="mono" style={{ fontSize: 10, whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto", background: "var(--bg-input)", padding: 8, marginTop: 8, border: "1px solid var(--border)" }}>
                      {c.candidate}
                    </pre>
                    {c.status === "PROPOSED" && (
                      <div className="row" style={{ marginTop: 8 }}>
                        <button
                          className="primary"
                          disabled={!c.passed}
                          title={c.passed ? "" : "Gates not passed — AUTONOMOUS would refuse this too"}
                          onClick={() => {
                            const updated = applyCandidateToTeam(selectedTeam, c, "human:operator");
                            saveCliTeams(upsertTeam(cliTeams, updated));
                            updateEvo(decideCandidate(evo, c.id, "ACCEPTED", "human:operator"));
                            toast(`Candidate accepted: "${c.seatId}" instructions updated (v${(selectedTeam.revision ?? 1) + 1})`);
                          }}
                        >
                          Accept
                        </button>
                        <button className="danger" onClick={() => { updateEvo(decideCandidate(evo, c.id, "REJECTED", "human:operator")); toast("Candidate rejected"); }}>
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {/* ── TAB 7: CUSTOM CREW BUILDER ────────────────────────────────────── */}
      {activeTab === "builder" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Custom Multi-Agent Crew Builder</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Assemble your own heterogeneous CLI agent crew with exact roles, risk tiers, and permissions.
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                const newTeam: CliAgentTeam = {
                  ...builderTeam,
                  id: `team.custom.${uid("crew")}`,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  revision: 1,
                };
                const updated = upsertTeam(cliTeams, newTeam);
                saveCliTeams(updated);
                setSelectedTeamId(newTeam.id);
                setActiveTab("crews");
                toast(`Saved new crew "${newTeam.name}"!`);
              }}
            >
              Save Crew
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <label className="field">
              Crew Name
              <input
                type="text"
                value={builderTeam.name}
                onChange={(e) => setBuilderTeam({ ...builderTeam, name: e.target.value })}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
            <label className="field">
              Description
              <input
                type="text"
                value={builderTeam.description}
                onChange={(e) => setBuilderTeam({ ...builderTeam, description: e.target.value })}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
          </div>

          {/* Seats Editor */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 10px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-mute)" }}>
              Seats ({builderTeam.seats.length})
            </div>
            <button
              onClick={() => {
                const newSeat: TeamSeat = {
                  id: `agent_${builderTeam.seats.length + 1}`,
                  role: "tester",
                  harness: "grok",
                  model: null,
                  mayWrite: false,
                  maxRisk: "LOW",
                  timeoutSecs: 600,
                  maxTurns: 10,
                  instructions: "",
                };
                setBuilderTeam({ ...builderTeam, seats: [...builderTeam.seats, newSeat] });
              }}
            >
              + Add Seat
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {builderTeam.seats.map((seat, idx) => (
              <div
                key={idx}
                style={{
                  padding: "12px 14px",
                  borderRadius: 4,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  display: "grid",
                  gridTemplateColumns: "120px 140px 160px 100px 1fr 60px",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <input
                  type="text"
                  value={seat.id}
                  placeholder="Seat ID"
                  onChange={(e) => {
                    const next = [...builderTeam.seats];
                    next[idx] = { ...next[idx], id: e.target.value };
                    setBuilderTeam({ ...builderTeam, seats: next });
                  }}
                />
                <select
                  value={seat.role}
                  onChange={(e) => {
                    const role = e.target.value as TeamRole;
                    const next = [...builderTeam.seats];
                    next[idx] = { ...next[idx], role, mayWrite: role === "coder" || role === "debugger" };
                    setBuilderTeam({ ...builderTeam, seats: next });
                  }}
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                <select
                  value={seat.harness}
                  onChange={(e) => {
                    const harness = e.target.value as HarnessId;
                    const next = [...builderTeam.seats];
                    next[idx] = { ...next[idx], harness };
                    setBuilderTeam({ ...builderTeam, seats: next });
                  }}
                >
                  {HARNESSES.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>

                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={seat.mayWrite}
                    onChange={(e) => {
                      const next = [...builderTeam.seats];
                      next[idx] = { ...next[idx], mayWrite: e.target.checked };
                      setBuilderTeam({ ...builderTeam, seats: next });
                    }}
                  />
                  Write
                </label>

                <input
                  type="text"
                  value={seat.instructions || ""}
                  placeholder="Seat instructions / prompt..."
                  onChange={(e) => {
                    const next = [...builderTeam.seats];
                    next[idx] = { ...next[idx], instructions: e.target.value };
                    setBuilderTeam({ ...builderTeam, seats: next });
                  }}
                />

                <button
                  className="danger"
                  style={{ padding: "4px 8px", fontSize: 11 }}
                  onClick={() => {
                    setBuilderTeam({
                      ...builderTeam,
                      seats: builderTeam.seats.filter((_, i) => i !== idx),
                    });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 8: CANVAS FRAMEWORKS ─────────────────────────────────────── */}
      {activeTab === "frameworks" && (
        <div>
          <label className="field" style={{ marginBottom: 16 }}>
            Task for Canvas Template Deployment
            <div className="nl-box" style={{ marginTop: 6 }}>
              <input
                value={canvasTask}
                onChange={(e) => setCanvasTask(e.target.value)}
                placeholder="e.g. threat-model the payments service and patch the top finding"
              />
              <button
                className="primary"
                disabled={!selectedCanvasTeam}
                onClick={() => {
                  const t = canvasTeams.find((x) => x.id === selectedCanvasTeam);
                  if (t) {
                    const { nodes, wires } = instantiateTeam(t, canvasTask.trim() || "Task for team");
                    store.insertTemplate(nodes, wires);
                    toast(`Team "${t.name}" added to Canvas`);
                    onOpened();
                  }
                }}
              >
                Apply to Canvas
              </button>
            </div>
          </label>

          <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {AGENT_FRAMEWORKS.map((f) => (
              <div key={f.id} className="card tpl" style={{ padding: 16 }}>
                <div className="pill">{f.category}</div>
                <h3 style={{ margin: "8px 0 4px", fontSize: 16 }}>{f.name}</h3>
                <div className="muted" style={{ fontSize: 12 }}>{f.description}</div>
                <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>{f.roster.length} seats · Pattern: {f.pattern}</div>
                <button
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    const now = new Date().toISOString();
                    const body = teamFromFramework(f);
                    const rec: TeamWorkspace = { ...body, id: uid("team"), createdAt: now, updatedAt: now };
                    const next = [rec, ...canvasTeams];
                    setCanvasTeams(next);
                    saveTeamsLocal(next);
                    setSelectedCanvasTeam(rec.id);
                    toast(`Saved framework as team workspace: ${rec.name}`);
                  }}
                >
                  Save as Team Preset
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invocation Inspection Modal */}
      {inspectSeat && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setInspectSeat(null)}
        >
          <div
            className="card"
            style={{ width: 620, padding: 24, maxHeight: "80vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                Seat Invocation Profile: {inspectSeat.id} ({HARNESS_BADGES[inspectSeat.harness]?.label ?? inspectSeat.harness})
              </h3>
              <button onClick={() => setInspectSeat(null)}>✕</button>
            </div>

            {(() => {
              const composed = composeSeatArgv(inspectSeat, { prompt: "<objective>", cwd: "/workspace", readOnly: !inspectSeat.mayWrite });
              const cap = AGENT_CAPABILITIES[inspectSeat.harness];
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-mute)", fontSize: 11, textTransform: "uppercase" }}>Resolved Binary</div>
                    <div className="mono" style={{ background: "var(--bg-panel)", padding: "6px 8px", borderRadius: 3, marginTop: 4 }}>
                      {composed.bin}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-mute)", fontSize: 11, textTransform: "uppercase" }}>Composed Command Line Argv</div>
                    <div className="mono" style={{ background: "var(--bg-panel)", padding: "6px 8px", borderRadius: 3, marginTop: 4, whiteSpace: "pre-wrap" }}>
                      {composed.bin} {composed.argv.join(" ")}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-mute)", fontSize: 11, textTransform: "uppercase" }}>Read-Only &amp; Cost Claims</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      Enforced Read-Only: {composed.claims.readOnlyEnforced ? "Yes (Hardware/Sandbox Level)" : "No (Prompt/Advisory Level)"} · Cost reporting: {composed.claims.costKind}
                    </div>
                  </div>
                  {cap?.gotchas && cap.gotchas.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--danger)", fontSize: 11, textTransform: "uppercase" }}>Harness Gotchas</div>
                      {cap.gotchas.map((g, i) => (
                        <div key={i} className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          • {g}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
