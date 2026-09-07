/**
 * Organization Domain Model & Agent Slot Structures.
 */

import type { PermissionSet } from "./types";

export type TaskStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED" | "SKIPPED";

export interface AgentScorecard {
  tasksCompleted: number;
  tasksFailed: number;
  tokensConsumed: number;
  costUsd: number;
  latencyMs: number;
  reputation: number;
}

export function emptyScorecard(): AgentScorecard {
  return {
    tasksCompleted: 0,
    tasksFailed: 0,
    tokensConsumed: 0,
    costUsd: 0,
    latencyMs: 0,
    reputation: 1.0,
  };
}

export interface OrgMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalCostUsd: number;
  wallClockMs: number;
}

export function emptyOrgMetrics(): OrgMetrics {
  return {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    totalCostUsd: 0,
    wallClockMs: 0,
  };
}

export interface AgentContract {
  identity: string;
  purpose: string;
  capabilities: string[];
  inputs: string[];
  outputs: string[];
  permissions: PermissionSet;
  budget: {
    maxCostUsd: number;
    maxTokens: number;
    timeoutMs: number;
    maxToolSteps: number;
    maxRetries: number;
  };
  successCriteria: string[];
  failurePolicy: string;
  escalationPolicy: {
    onRiskClass: string;
    afterAttempts: number;
    onBudgetUtilization: number;
  };
}

export interface AgentSlot {
  id: string;
  orgId: string;
  roleKey: string;
  title: string;
  definitionId: string;
  harness: string;
  status: "IDLE" | "BUSY" | "FAILED" | "TERMINATED";
  contract: AgentContract;
  scorecard: AgentScorecard;
  active: boolean;
  spawnedReason: string;
  spawnedAt: string;
}

export interface MissionTask {
  id: string;
  orgId: string;
  missionId: string;
  phaseId: string;
  title: string;
  instruction: string;
  assigneeId: string;
  assigneeHistory: string[];
  status: TaskStatus;
  parallelism: "SEQUENTIAL" | "PARALLEL";
  dependsOn: string[];
  inputs: string[];
  outputs: string[];
  riskClass: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  attempts: number;
  maxAttempts: number;
  attemptHashes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  missionId: string;
  charterId: string;
  frameworkId: string;
  topology: "hierarchical" | "mesh" | "pipeline" | "round_robin";
  candidatePool: AgentSlot[];
  active: string[];
  teams: unknown[];
  phases: unknown[];
  tasks: MissionTask[];
  blackboardKey: string;
  constitutionId: string;
  generation: number;
  metrics: OrgMetrics;
  status: "ACTIVE" | "PAUSED" | "TERMINATED";
  createdAt: string;
  updatedAt: string;
}
