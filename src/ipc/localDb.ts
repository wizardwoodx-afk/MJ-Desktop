import { uid, nowIso } from "../app/id";
import type { SecretStatus } from "./client";
import { GRAPH_SCHEMA_VERSION, type ApprovalRecord, type DlqRecord, type EvolutionCandidateRecord, type ExecutionEventRecord, type ExecutionRecord, type ExecutionStats, type FeedbackRecord, type McpServerEntry, type MemoryRecord, type SkillRecord, type WorkflowGraph, type WorkflowRecord } from "../domain/types";

const KEY = "mj.v3.db";

interface DbShape {
  workflows: WorkflowRecord[];
  executions: ExecutionRecord[];
  events: ExecutionEventRecord[];
  memories: MemoryRecord[];
  skills: SkillRecord[];
  feedback: FeedbackRecord[];
  evolution: EvolutionCandidateRecord[];
  mcp: McpServerEntry[];
  approvals: ApprovalRecord[];
  dlq: DlqRecord[];
  secrets: Record<string, string>;
  runQueue: string[];
}

function empty(): DbShape {
  return {
    workflows: [],
    executions: [],
    events: [],
    memories: [],
    skills: [],
    feedback: [],
    evolution: [],
    mcp: seedMcp(),
    approvals: [],
    dlq: [],
    secrets: {},
    runQueue: [],
  };
}

function seedMcp(): McpServerEntry[] {
  const now = nowIso();
  const rows: Array<[string, string, string, string[]]> = [
    ["mcp.filesystem", "Filesystem", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/filesystem/index.ts"]],
    ["mcp.git", "Git", "python", ["-m", "mcp_server_git"]],
    ["mcp.memory", "Memory", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/memory/index.ts"]],
    ["mcp.sequential-thinking", "Sequential Thinking", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/sequentialthinking/index.ts"]],
    ["mcp.time", "Time", "python", ["-m", "mcp_server_time"]],
    ["mcp.github", "GitHub", "github-mcp-server", ["stdio"]],
    ["mcp.control", "Control MCP", "mj-control-mcp", ["stdio"]],
  ];
  return rows.map(([id, name, command, args]) => ({
    id,
    name,
    transport: "stdio" as const,
    config: { transport: "stdio", command, args, enabled: id === "mcp.control", pinned: true },
    state: "AVAILABLE" as const,
    createdAt: now,
    updatedAt: now,
  }));
}

function load(): DbShape {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

function save(db: DbShape) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export const localDb = {
  load,
  save,
  reset() {
    localStorage.removeItem(KEY);
  },

  workflowList(): WorkflowRecord[] {
    return load().workflows.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  workflowGet(id: string): WorkflowRecord {
    const w = load().workflows.find((x) => x.id === id);
    if (!w) throw new Error(`workflow not found: ${id}`);
    return w;
  },
  workflowCreate(name: string, description: string): { id: string } {
    const db = load();
    const id = uid("wf");
    const now = nowIso();
    const graph: WorkflowGraph = {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      id,
      name,
      nodes: [],
      connections: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      groups: [],
      notes: [],
    };
    db.workflows.unshift({ id, name, description, graph, createdAt: now, updatedAt: now, tags: [] });
    save(db);
    return { id };
  },
  workflowSave(id: string, name: string, description: string, graph: WorkflowGraph) {
    const db = load();
    const w = db.workflows.find((x) => x.id === id);
    if (!w) throw new Error("workflow not found");
    w.name = name;
    w.description = description;
    w.graph = graph;
    w.updatedAt = nowIso();
    save(db);
  },
  workflowDelete(id: string) {
    const db = load();
    db.workflows = db.workflows.filter((w) => w.id !== id);
    save(db);
  },

  executionCreate(workflowId: string, workflowVersion: number): { id: string } {
    const db = load();
    const id = uid("exec");
    db.executions.unshift({
      id,
      workflowId,
      workflowVersion,
      status: "RUNNING",
      startedAt: nowIso(),
      endedAt: null,
      error: null,
      stats: { nodesRun: 0, nodesFailed: 0, retries: 0, inputTokens: 0, outputTokens: 0, durationMs: 0, costUsd: 0, evaluationScores: [] },
    });
    save(db);
    return { id };
  },
  executionFinish(id: string, status: string, error: string | null, stats: ExecutionStats) {
    const db = load();
    const e = db.executions.find((x) => x.id === id);
    if (!e) return;
    e.status = status as ExecutionRecord["status"];
    e.error = error;
    e.stats = stats;
    e.endedAt = nowIso();
    save(db);
  },
  executionList(): ExecutionRecord[] {
    return load().executions;
  },
  eventEmit(executionId: string, kind: string, level: string, nodeId: string | null, data: Record<string, unknown>) {
    const db = load();
    const rec: ExecutionEventRecord = {
      seq: db.events.length + 1,
      ts: nowIso(),
      kind,
      level: level as ExecutionEventRecord["level"],
      nodeId,
      executionId,
      data,
    };
    db.events.push(rec);
    if (db.events.length > 4000) db.events = db.events.slice(-3000);
    save(db);
    window.dispatchEvent(new CustomEvent("mj://event", { detail: rec }));
    return rec;
  },
  executionEvents(executionId: string) {
    return load().events.filter((e) => e.executionId === executionId);
  },

  secretSet(ref: string, value: string) {
    const db = load();
    db.secrets[ref] = value;
    save(db);
  },
  secretDelete(ref: string) {
    const db = load();
    delete db.secrets[ref];
    save(db);
  },
  secretExists(refs: string[]): Record<string, SecretStatus> {
    const db = load();
    // V7 fix (bug W): matches the native shape. In the browser these live in localStorage, which
    // does survive a reload but is not an OS keychain and is readable by anything in this origin.
    return Object.fromEntries(
      refs.map((r) => [
        r,
        db.secrets[r]
          ? { exists: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain. Readable by anything in this origin." }
          : { exists: false, location: "absent", survivesRestart: false },
      ]),
    );
  },
  secretGet(ref: string): string | null {
    return load().secrets[ref] ?? null;
  },

  mcpList() {
    return load().mcp;
  },
  mcpSave(cfg: Partial<McpServerEntry> & { name: string }): { id: string } {
    const db = load();
    const id = cfg.id || uid("mcp");
    const now = nowIso();
    const existing = db.mcp.find((m) => m.id === id);
    if (existing) {
      Object.assign(existing, cfg, { updatedAt: now });
    } else {
      db.mcp.push({
        id,
        name: cfg.name,
        transport: cfg.transport ?? "stdio",
        config: cfg.config ?? { transport: "stdio", enabled: true },
        state: "AVAILABLE",
        createdAt: now,
        updatedAt: now,
      });
    }
    save(db);
    return { id };
  },
  mcpRemove(id: string) {
    const db = load();
    db.mcp = db.mcp.filter((m) => m.id !== id);
    save(db);
  },

  memoryAdd(nodeKey: string, kind: string, content: string, tags: string[], importance: number) {
    const db = load();
    const rec: MemoryRecord = { id: uid("mem"), nodeKey, kind: kind as MemoryRecord["kind"], content, tags, importance, createdAt: nowIso() };
    db.memories.unshift(rec);
    save(db);
    return { id: rec.id };
  },
  memorySearch(nodeKey: string, query: string, limit = 12) {
    const q = query.toLowerCase();
    return load()
      .memories.filter((m) => m.nodeKey === nodeKey && (!q || m.content.toLowerCase().includes(q)))
      .slice(0, limit);
  },
  memoryDelete(id: string) {
    const db = load();
    db.memories = db.memories.filter((m) => m.id !== id);
    save(db);
  },

  skillsList(nodeKey: string) {
    const all = load().skills.filter((s) => s.nodeKey === nodeKey);
    return { skills: all.filter((s) => s.active), all };
  },
  skillUpsert(args: { nodeKey: string; name: string; description: string; procedure: string; origin: string }) {
    const db = load();
    const rec: SkillRecord = {
      id: uid("skill"),
      nodeKey: args.nodeKey,
      name: args.name,
      description: args.description,
      procedure: args.procedure,
      preconditions: "",
      toolStrategy: "",
      verificationStrategy: "",
      knownFailureModes: "",
      version: 1,
      score: null,
      origin: args.origin as SkillRecord["origin"],
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      applications: 0,
    };
    db.skills.push(rec);
    save(db);
    return { id: rec.id, version: 1 };
  },

  feedbackAdd(executionId: string, nodeKey: string, rating: number, comment: string) {
    const db = load();
    const rec: FeedbackRecord = { id: uid("fb"), executionId, nodeKey, rating, comment, createdAt: nowIso() };
    db.feedback.unshift(rec);
    save(db);
    return { id: rec.id };
  },
  feedbackList() {
    return load().feedback;
  },

  evolutionList() {
    return load().evolution;
  },
  evolutionPropose(cand: Partial<EvolutionCandidateRecord>) {
    const db = load();
    const rec: EvolutionCandidateRecord = {
      id: uid("evo"),
      nodeKey: cand.nodeKey ?? "",
      parentVersion: cand.parentVersion ?? 1,
      candidateVersion: cand.candidateVersion ?? 2,
      trigger: cand.trigger ?? "manual",
      evidence: cand.evidence ?? [],
      changes: cand.changes ?? {},
      baselineScore: cand.baselineScore ?? null,
      candidateScore: cand.candidateScore ?? null,
      holdoutPassed: cand.holdoutPassed ?? null,
      regressionPassed: cand.regressionPassed ?? null,
      status: "PROPOSED",
      decision: "PENDING",
      createdAt: nowIso(),
      decidedAt: null,
    };
    db.evolution.unshift(rec);
    save(db);
    return { id: rec.id };
  },
  evolutionDecide(id: string, decision: "ACCEPTED" | "REJECTED") {
    const db = load();
    const c = db.evolution.find((x) => x.id === id);
    if (c) {
      c.decision = decision;
      c.status = "DECIDED";
      c.decidedAt = nowIso();
      save(db);
    }
    return { ok: true };
  },

  approvalList() {
    return load().approvals.filter((a) => a.status === "OPEN");
  },
  approvalRequest(executionId: string, nodeKey: string, summary: string, payload: Record<string, unknown>) {
    const db = load();
    const rec: ApprovalRecord = { id: uid("appr"), executionId, nodeKey, summary, payload, status: "OPEN", createdAt: nowIso() };
    db.approvals.unshift(rec);
    save(db);
    window.dispatchEvent(new CustomEvent("mj://approval", { detail: rec }));
    return { id: rec.id };
  },
  approvalDecide(id: string, decision: "APPROVED" | "REJECTED") {
    const db = load();
    const a = db.approvals.find((x) => x.id === id);
    if (a) {
      a.status = decision;
      save(db);
    }
  },
  approvalGet(executionId: string, nodeKey: string) {
    const a = load().approvals.find((x) => x.executionId === executionId && x.nodeKey === nodeKey && x.status !== "OPEN");
    return a ? { decided: true, status: a.status } : { decided: false };
  },

  dlqList() {
    return load().dlq.filter((d) => d.status === "OPEN");
  },
  dlqAdd(executionId: string, nodeKey: string, error: string, payload: Record<string, unknown>, suggestedCause: string, candidateFix: string) {
    const db = load();
    const rec: DlqRecord = {
      id: uid("dlq"),
      executionId,
      nodeKey,
      error,
      payload,
      status: "OPEN",
      suggestedCause,
      candidateFix,
      createdAt: nowIso(),
    };
    db.dlq.unshift(rec);
    save(db);
    return { id: rec.id };
  },
  dlqResolve(id: string) {
    const db = load();
    const d = db.dlq.find((x) => x.id === id);
    if (d) d.status = "RESOLVED";
    save(db);
  },

  runEnqueue(workflowId: string) {
    const db = load();
    db.runQueue.push(workflowId);
    save(db);
  },
  runTake(): string[] {
    const db = load();
    const items = db.runQueue.splice(0);
    save(db);
    return items;
  },
};
