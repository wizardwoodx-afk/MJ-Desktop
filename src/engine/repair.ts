/**
 * Deterministic Repair Ladder (§16, §17).
 *
 * Enforces systematic multi-stage repair progression without blind retries,
 * always terminating with escalation to human authority.
 */

import type { FailureClass } from "./failureClassifier";

export type RepairAction =
  | "MODIFY_CONTEXT"
  | "REASSIGN_AGENT"
  | "SPLIT_TASK"
  | "ADD_VERIFIER"
  | "SWITCH_HARNESS"
  | "INCREASE_BUDGET"
  | "RETRY_SAME"
  | "ESCALATE_HUMAN";

export function fullLadder(failureClass: FailureClass): RepairAction[] {
  switch (failureClass) {
    case "STEP_REPETITION":
      return ["MODIFY_CONTEXT", "REASSIGN_AGENT", "SPLIT_TASK", "ESCALATE_HUMAN"];

    case "PREMATURE_TERMINATION":
      return ["ADD_VERIFIER", "MODIFY_CONTEXT", "REASSIGN_AGENT", "ESCALATE_HUMAN"];

    case "HARNESS_UNAVAILABLE":
      return ["SWITCH_HARNESS", "REASSIGN_AGENT", "ESCALATE_HUMAN"];

    case "PERMISSION_DENIAL":
      return ["MODIFY_CONTEXT", "ESCALATE_HUMAN"];

    case "TIMEOUT_LOOP":
      return ["MODIFY_CONTEXT", "SPLIT_TASK", "SWITCH_HARNESS", "ESCALATE_HUMAN"];

    case "TOOL_FAILURE_LOOP":
      return ["MODIFY_CONTEXT", "REASSIGN_AGENT", "ESCALATE_HUMAN"];

    case "BUDGET_EXHAUSTION":
      return ["INCREASE_BUDGET", "ESCALATE_HUMAN"];

    case "REPEATED_FAILURE":
      return ["MODIFY_CONTEXT", "REASSIGN_AGENT", "SPLIT_TASK", "ESCALATE_HUMAN"];

    case "AGENT_STARVATION":
      return ["REASSIGN_AGENT", "MODIFY_CONTEXT", "ESCALATE_HUMAN"];

    case "REGRESSION":
      return ["ADD_VERIFIER", "MODIFY_CONTEXT", "REASSIGN_AGENT", "ESCALATE_HUMAN"];

    case "DEADLOCK":
      return ["SPLIT_TASK", "MODIFY_CONTEXT", "ESCALATE_HUMAN"];

    case "SCHEMA_VIOLATION":
      return ["MODIFY_CONTEXT", "ADD_VERIFIER", "ESCALATE_HUMAN"];

    case "UNKNOWN":
    default:
      return ["MODIFY_CONTEXT", "REASSIGN_AGENT", "ESCALATE_HUMAN"];
  }
}
