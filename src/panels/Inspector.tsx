import { useState } from "react";
import { DEFINITIONS_BY_ID } from "../domain/nodeLibrary";
import { useGraphStore, useNodeRuntimeOutput } from "../graph/store";
import { ipc, nodeKeyOf } from "../ipc/client";
import { toast } from "./Toast";
import { iconFor } from "../canvas/icons";
import { composeNodePrompt } from "../domain/composer";
import { composeAssignment, methodFor, NODE_FIELDS } from "../domain/nodeMethods";
import { HARNESSES, listCustomHarnesses } from "../domain/harness";
import type { EvolutionMode, FeedbackLoop } from "../domain/types";

const ROLE_KEYS: Array<keyof ReturnType<typeof identityKeys>> = [
  "identity", "mission", "operatingPrinciples", "procedures",
  "toolStrategy", "verificationStrategy", "collaborationRules", "learningRules", "invariants",
];
function identityKeys() {
  return {
    identity: "",
    mission: "",
    operatingPrinciples: "",
    procedures: "",
    toolStrategy: "",
    verificationStrategy: "",
    collaborationRules: "",
    learningRules: "",
    invariants: "",
  };
}

export function Inspector({ onClose }: { onClose: () => void }) {
  const store = useGraphStore();
  const node = store.graph.nodes.find((n) => n.id === store.selectedNodeId);
  const [open, setOpen] = useState<Record<string, boolean>>({
    purpose: true, harness: true, role: false, config: true, policy: true, contract: false, permissions: false, runtime: true, why: false,
  });
  const out = useNodeRuntimeOutput(node?.id ?? "");
  const def = node ? DEFINITIONS_BY_ID.get(node.definitionId) : undefined;
  const cat = def?.category ?? "agent";
  if (!node) return null;
  const toggle = (k: string) => setOpen((s) => ({ ...s, [k]: !s[k] }));
  const composed = composeNodePrompt(node, {});

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <span className="icon">{iconFor(def?.icon)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title" style={{ fontFamily: "var(--font-ui)", fontWeight: 600 }}>{node.title}</div>
          <div className="muted">{node.definitionId}</div>
        </div>
        <button className="ghost" onClick={onClose}>Close</button>
      </div>

      {/* V11.5: the node's METHOD is in-built and non-changeable (owner rule). Shown as a
          read-only contract — the user edits what/where inputs, never the verb. */}
      <div className="method-contract mono" title="Method — built in, not editable">
        {methodFor(def ?? ({ category: cat } as never))}
      </div>

      <Section k="purpose" title="Purpose · this run" open={open} toggle={toggle}>
        <div className="muted">Purpose is the job. It is not identity. Role prompt stays durable.</div>
        <textarea
          value={node.purpose}
          onChange={(e) => store.updateNodeLive(node.id, { purpose: e.target.value })}
          onBlur={() => store.checkpoint("Edit purpose")}
          placeholder="What should this node accomplish on this run?"
        />
      </Section>

      {node.definitionId.startsWith("agent.") && (
        <Section k="harness" title="Real agent harness" open={open} toggle={toggle}>
          <div className="muted">This node is a coding agent, not an n8n step. It execs a local CLI from the V11.6 registry (Connect tab in Teams installs and smoke-tests them) or a direct LLM.</div>
          <label className="field">Harness
            <select
              value={String(node.config.harness ?? "claude")}
              onChange={(e) => store.updateNode(node.id, { config: { ...node.config, harness: e.target.value } })}
            >
              {HARNESSES.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
              {listCustomHarnesses().map((c) => (
                <option key={c.id} value={c.id}>{"Custom · " + c.name}</option>
              ))}
            </select>
          </label>
        </Section>
      )}

      {def?.configSchema && def.configSchema.length > 0 && (
        <Section k="config" title="Config" open={open} toggle={toggle}>
          {def.configSchema.map((c) => (
            <label key={c.key} className="field">
              {c.label}{NODE_FIELDS[c.key]?.fold ? <span className="fold-tag" title="config key that predates V11.5">·</span> : null}
              {NODE_FIELDS[c.key]?.def ? <span className="field-hint">{NODE_FIELDS[c.key].def}</span> : null}
              {c.type === "textarea" ? (
                <textarea value={String(node.config[c.key] ?? "")} onChange={(e) => store.updateNodeLive(node.id, { config: { ...node.config, [c.key]: e.target.value } })} />
              ) : c.type === "boolean" ? (
                <input type="checkbox" checked={Boolean(node.config[c.key])} onChange={(e) => store.updateNode(node.id, { config: { ...node.config, [c.key]: e.target.checked } })} />
              ) : c.type === "select" ? (
                <select value={String(node.config[c.key] ?? "")} onChange={(e) => store.updateNode(node.id, { config: { ...node.config, [c.key]: e.target.value } })}>
                  {(c.options ?? []).map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input type={c.type === "number" ? "number" : "text"} value={String(node.config[c.key] ?? "")} onChange={(e) => store.updateNodeLive(node.id, { config: { ...node.config, [c.key]: c.type === "number" ? Number(e.target.value) : e.target.value } })} />
              )}
            </label>
          ))}
        </Section>
      )}

      {node.definitionId.startsWith("agent.") && (
        <Section k="role" title="Role prompt · identity" open={open} toggle={toggle}>
          <div className="muted">Role prompt ≠ purpose. Invariants are protected from evolution.</div>
          {ROLE_KEYS.map((k) => (
            <label key={k} className="field">
              {k}{k === "invariants" ? " · protected" : ""}
              <textarea
                value={node.rolePrompt.sections[k]}
                disabled={k === "invariants"}
                onChange={(e) => store.updateNodeLive(node.id, { rolePrompt: { ...node.rolePrompt, sections: { ...node.rolePrompt.sections, [k]: e.target.value } } })}
              />
            </label>
          ))}
        </Section>
      )}

      <Section k="policy" title="Feedback · Evolution · Reflection" open={open} toggle={toggle}>
        <div className="toggle-row">Feedback loop
          <select value={node.feedbackLoop} onChange={(e) => store.updateNode(node.id, { feedbackLoop: e.target.value as FeedbackLoop })}>
            <option>OFF</option><option>ON</option>
          </select>
        </div>
        <div className="muted">ON writes SKILL.md after a successful run. Never stores secrets.</div>
        <div className="toggle-row">Evolution
          <select value={node.evolutionMode} onChange={(e) => store.updateNode(node.id, { evolutionMode: e.target.value as EvolutionMode })}>
            <option>OFF</option><option>SUGGEST</option><option>AUTONOMOUS</option>
          </select>
        </div>
        <div className="muted">OFF does nothing. SUGGEST proposes. AUTONOMOUS accepts only if vendored gates pass.</div>
        <div className="toggle-row">Reflection
          <input type="checkbox" checked={node.reflection.enabled} onChange={(e) => store.updateNode(node.id, { reflection: { ...node.reflection, enabled: e.target.checked } })} />
        </div>
        <div className="toggle-row">Memory
          <input type="checkbox" checked={node.memoryEnabled} onChange={(e) => store.updateNode(node.id, { memoryEnabled: e.target.checked })} />
        </div>
      </Section>

      <Section k="contract" title="Contract" open={open} toggle={toggle}>
        <label className="field">Success criteria
          <textarea value={node.contract.successCriteria} onChange={(e) => store.updateNodeLive(node.id, { contract: { ...node.contract, successCriteria: e.target.value } })} />
        </label>
        <label className="field">Failure criteria
          <textarea value={node.contract.failureCriteria} onChange={(e) => store.updateNodeLive(node.id, { contract: { ...node.contract, failureCriteria: e.target.value } })} />
        </label>
        <label className="field">Timeout ms
          <input type="number" value={node.contract.timeoutMs} onChange={(e) => store.updateNode(node.id, { contract: { ...node.contract, timeoutMs: Number(e.target.value) } })} />
        </label>
      </Section>

      <Section k="permissions" title="Permissions" open={open} toggle={toggle}>
        {(Object.keys(node.permissions) as Array<keyof typeof node.permissions>).map((k) => (
          <div className="toggle-row" key={k}>
            {k}
            <input type="checkbox" checked={node.permissions[k]} onChange={(e) => store.updateNode(node.id, { permissions: { ...node.permissions, [k]: e.target.checked } })} />
          </div>
        ))}
      </Section>

      <Section k="why" title="Why did this change" open={open} toggle={toggle}>
        <div className="why-card">
          Composer attaches role, purpose, skills, memory, contract, and permissions as separate blocks.
          Last compose length: {composed.system.length + composed.user.length} chars.
        </div>
        <div className="muted" style={{ marginTop: 8 }}>Assignment as the runtime sees it:</div>
        <pre className="mono assignment-preview">{composeAssignment(def ?? ({ id: node.definitionId, title: node.title, description: node.purpose ?? "", category: cat } as never), node.config)}</pre>
      </Section>

      <Section k="runtime" title="Last output" open={open} toggle={toggle}>
        <pre className="mono" style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}>{out || "— idle —"}</pre>
        <div className="row">
          <button onClick={async () => {
            const exec = window.__mjLastNodeExec?.[node.id] ?? "";
            await ipc.feedbackAdd(exec, nodeKeyOf(store.workflowId, node.id), 5, "good");
            toast("Rated +5");
          }}>+ rate</button>
          <button onClick={async () => {
            const exec = window.__mjLastNodeExec?.[node.id] ?? "";
            await ipc.feedbackAdd(exec, nodeKeyOf(store.workflowId, node.id), -1, "needs work");
            toast("Rated −1");
          }}>− rate</button>
        </div>
      </Section>
    </aside>
  );
}

function Section({ k, title, open, toggle, children }: { k: string; title: string; open: Record<string, boolean>; toggle: (k: string) => void; children: React.ReactNode }) {
  return (
    <div className="inspector-section">
      <button className="section-head" onClick={() => toggle(k)}>{open[k] ? "▾" : "▸"} {title}</button>
      {open[k] && <div className="section-body">{children}</div>}
    </div>
  );
}
