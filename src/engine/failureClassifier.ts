/**
 * Pure Failure Classification & Detection Logic (MAST Taxonomy).
 */

import type { Organization } from "../domain/organization";

export type FailureClass =
  | "HARNESS_UNAVAILABLE"
  | "PERMISSION_DENIAL"
  | "TIMEOUT_LOOP"
  | "TOOL_FAILURE_LOOP"
  | "BUDGET_EXHAUSTION"
  | "REPEATED_FAILURE"
  | "STEP_REPETITION"
  | "PREMATURE_TERMINATION"
  | "AGENT_STARVATION"
  | "REGRESSION"
  | "DEADLOCK"
  | "SCHEMA_VIOLATION"
  | "UNKNOWN";

export const FAILURE_CLASSES: FailureClass[] = [
  "HARNESS_UNAVAILABLE",
  "PERMISSION_DENIAL",
  "TIMEOUT_LOOP",
  "TOOL_FAILURE_LOOP",
  "BUDGET_EXHAUSTION",
  "REPEATED_FAILURE",
  "STEP_REPETITION",
  "PREMATURE_TERMINATION",
  "AGENT_STARVATION",
  "REGRESSION",
  "DEADLOCK",
  "SCHEMA_VIOLATION",
  "UNKNOWN",
];

export const FAILURE_CLASS_LABEL: Record<FailureClass, string> = {
  HARNESS_UNAVAILABLE: "Harness Unavailable or Auth Failed",
  PERMISSION_DENIAL: "Permission Denied by Safety Policy",
  TIMEOUT_LOOP: "Repeated Request Timeout Loop",
  TOOL_FAILURE_LOOP: "Repeated Tool Invocation Failure",
  BUDGET_EXHAUSTION: "Mission Budget Ceiling Exhausted",
  REPEATED_FAILURE: "Repeated Execution Failure",
  STEP_REPETITION: "MAST Step Repetition / Stuck in Loop",
  PREMATURE_TERMINATION: "MAST Premature Task Termination Without Artifact",
  AGENT_STARVATION: "Agent Starvation / Blocked Upstream",
  REGRESSION: "Test Regression Detected",
  DEADLOCK: "Dependency Deadlock",
  SCHEMA_VIOLATION: "Blackboard Schema Violation",
  UNKNOWN: "Unclassified Error",
};

export interface SupervisorInput {
  org: Organization;
  busySlotIds: string[];
  lastOutputAgoMs: Record<string, number>;
  toolErrors: Record<string, string[]>;
  invalidArtifactIds: string[];
  regressions: string[];
  conflictingTopics: string[];
  budgetUtilization: number;
  deadlockedTaskIds: string[];
}

export interface FailureSignal {
  id: string;
  class: FailureClass;
  severity: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  subjectId: string;
  message: string;
}

export function classifyError(errorMsg: string, attempts = 1): FailureClass {
  const lower = (errorMsg || "").toLowerCase();

  if (lower.includes("command not found") || lower.includes("401 unauthorized") || lower.includes("not installed")) {
    return "HARNESS_UNAVAILABLE";
  }
  if (lower.includes("permission denied") || lower.includes("eacces") || lower.includes("unauthorized access")) {
    return "PERMISSION_DENIAL";
  }
  if (lower.includes("budget ceiling exhausted") || lower.includes("budget limit")) {
    return "BUDGET_EXHAUSTION";
  }
  if (lower.includes("tool failed")) {
    return attempts >= 2 ? "TOOL_FAILURE_LOOP" : "UNKNOWN";
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return attempts >= 2 ? "TIMEOUT_LOOP" : "UNKNOWN";
  }
  if (attempts >= 5) {
    return "REPEATED_FAILURE";
  }

  return "UNKNOWN";
}

export function detectFailures(input: SupervisorInput): FailureSignal[] {
  const signals: FailureSignal[] = [];

  for (const task of input.org.tasks) {
    // 1. STEP_REPETITION detection: check if last 2 attempt hashes are identical
    if (task.attemptHashes && task.attemptHashes.length >= 2) {
      const len = task.attemptHashes.length;
      if (task.attemptHashes[len - 1] === task.attemptHashes[len - 2]) {
        signals.push({
          id: `sig-${Date.now()}-${signals.length}`,
          class: "STEP_REPETITION",
          severity: "ERROR",
          subjectId: task.id,
          message: `Task ${task.id} repeated its exact output across consecutive attempts.`,
        });
      }
    }

    // 2. PREMATURE_TERMINATION detection: completed status with empty output artifacts
    if (task.status === "COMPLETED" && (!task.outputs || task.outputs.length === 0)) {
      signals.push({
        id: `sig-${Date.now()}-${signals.length}`,
        class: "PREMATURE_TERMINATION",
        severity: "WARN",
        subjectId: task.id,
        message: `Task ${task.id} terminated with COMPLETED status without generating any output artifacts.`,
      });
    }
  }

  return signals;
}
