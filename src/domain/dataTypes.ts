import type { DataType } from "./types";

const COMPAT: Record<DataType, DataType[]> = {
  any: [],
  Text: ["Text", "Markdown", "JSON", "URL", "Number", "Boolean"],
  Markdown: ["Markdown", "Text"],
  JSON: ["JSON", "Object", "Array", "Text"],
  Object: ["Object", "JSON", "WorkflowContext", "RepositoryContext", "AgentResult"],
  Array: ["Array", "JSON"],
  Image: ["Image", "File"],
  File: ["File", "Image"],
  URL: ["URL", "Text"],
  BrowserSession: ["BrowserSession"],
  AgentResult: ["AgentResult", "Text", "Markdown", "Object"],
  Evaluation: ["Evaluation", "JSON", "Object", "Text", "Markdown", "AgentResult"],
  Boolean: ["Boolean", "Text", "Number"],
  Number: ["Number", "Text"],
  Stream: ["Stream", "Text"],
  Event: ["Event", "JSON"],
  // V6 fix: a mission/workflow payload is routinely handed to an agent as its brief.
  // Without Text/Markdown/JSON here, every Start -> Agent wire was silently dropped.
  WorkflowContext: ["WorkflowContext", "Object", "Text", "Markdown", "JSON", "URL", "any"],
  RepositoryContext: ["RepositoryContext", "Object"],
  Error: ["Error", "Text"],
};

export function portsCompatible(source: DataType, target: DataType): boolean {
  if (source === "any" || target === "any") return true;
  if (source === target) return true;
  return (COMPAT[source] ?? []).includes(target);
}

export const DATA_TYPE_COLORS: Record<DataType, string> = {
  any: "#8a8a8a",
  Text: "#8AA3B3",
  Markdown: "#8AA3B3",
  JSON: "#7EB38A",
  Object: "#7EB38A",
  Array: "#7EB38A",
  Image: "#C4A16A",
  File: "#C4A16A",
  URL: "#8AA3B3",
  BrowserSession: "#D4A853",
  AgentResult: "#E8ECF2",
  Evaluation: "#C4A16A",
  Boolean: "#9B8EC4",
  Number: "#9B8EC4",
  Stream: "#E8ECF2",
  Event: "#7EB38A",
  WorkflowContext: "#8AA3B3",
  RepositoryContext: "#8AA3B3",
  Error: "#E8341C",
};
