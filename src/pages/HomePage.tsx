import { WORKFLOW_TEMPLATES, loadTemplate } from "../domain/templates";
import { ROLE_PACK_COUNT } from "../domain/rolePacks";
import { FRAMEWORK_COUNT } from "../domain/frameworks";
import { generateCustomNode } from "../domain/customNode";
import { useGraphStore } from "../graph/store";
import { ipc } from "../ipc/client";
import type { WorkflowRecord } from "../domain/types";
import { toast } from "../panels/Toast";
import { useState } from "react";

export function HomePage({
  workflows,
  onOpen,
  onCreated,
}: {
  workflows: WorkflowRecord[];
  onOpen: (id: string) => void;
  onCreated: () => void;
}) {
  const [customText, setCustomText] = useState("");
  const store = useGraphStore();

  const applyTemplate = async (instances: ReturnType<typeof loadTemplate>["instances"], wires: ReturnType<typeof loadTemplate>["wires"], name: string) => {
    if (!store.workflowId) {
      const res = await ipc.workflowCreate(name, "");
      const created = await ipc.workflowGet(res.id);
      store.loadWorkflow(created);
      window.__mjActiveWorkflowId = res.id;
    }
    store.insertTemplate(instances, wires);
    store.rename(name);
    toast(`Loaded ${name}`);
    onCreated();
  };

  return (
    <div className="home">
      <div className="home-hero">
        <div>
          <h1>MJ<span>.</span></h1>
          <p>
            Native visual workstation. The graph is the source of truth. Hermes skills are SKILL.md.
            Official MCP servers run over stdio. Assist may generate one custom node — never a full workflow.
          </p>
        </div>
        <button className="primary" onClick={async () => {
          const res = await ipc.workflowCreate(`Workflow ${workflows.length + 1}`, "");
          const created = await ipc.workflowGet(res.id);
          store.loadWorkflow(created);
          window.__mjActiveWorkflowId = res.id;
          onCreated();
        }}>New workflow</button>
      </div>

      <label className="field">v1 assist · one custom node
        <div className="nl-box">
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="e.g. a custom node that redacts PII from meeting notes"
            onKeyDown={(e) => {
              if (e.key === "Enter" && customText.trim()) {
                void addCustom(customText.trim());
              }
            }}
          />
          <button className="primary" onClick={() => customText.trim() && void addCustom(customText.trim())}>Add node</button>
        </div>
      </label>

      <div className="stat-row">
        <div className="stat"><div className="n">{workflows.length}</div><div className="l">Workflows</div></div>
        <div className="stat"><div className="n">{store.graph.nodes.length}</div><div className="l">Nodes on canvas</div></div>
        <div className="stat"><div className="n">{WORKFLOW_TEMPLATES.length}</div><div className="l">Templates</div></div>
        <div className="stat"><div className="n">{ROLE_PACK_COUNT}</div><div className="l">Hermes agents</div></div>
        <div className="stat"><div className="n">{FRAMEWORK_COUNT}</div><div className="l">Frameworks</div></div>
      </div>

      <h3 style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 11, color: "var(--text-3)" }}>Recent</h3>
      {workflows.length === 0 && <p className="muted">No workflows yet.</p>}
      {workflows.slice(0, 6).map((w) => (
        <div key={w.id} className="card wf-row" onClick={() => onOpen(w.id)}>
          <div>
            <div className="card-title">{w.name}</div>
            <div className="muted">{w.graph.nodes?.length ?? 0} nodes · updated {new Date(w.updatedAt).toLocaleString()}</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onOpen(w.id); }}>Open</button>
        </div>
      ))}

      <h3 style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 11, color: "var(--text-3)", marginTop: 28 }}>Templates (hand-authored)</h3>
      <div className="grid-2">
        {WORKFLOW_TEMPLATES.map((t) => (
          <div key={t.id} className="card tpl" onClick={() => {
            const { instances, wires } = loadTemplate(t.id);
            void applyTemplate(instances, wires, t.name);
          }}>
            <div className="pill">{t.category}</div>
            <h3>{t.name}</h3>
            <div className="muted">{t.description}</div>
            <div className="muted" style={{ marginTop: 8 }}>{t.steps.length} nodes</div>
          </div>
        ))}
      </div>
    </div>
  );

  async function addCustom(text: string) {
    if (!store.workflowId) {
      const res = await ipc.workflowCreate("Untitled", "");
      const created = await ipc.workflowGet(res.id);
      store.loadWorkflow(created);
      window.__mjActiveWorkflowId = res.id;
    }
    const node = generateCustomNode(text);
    store.insertTemplate([node], []);
    store.selectNode(node.id);
    toast(`Custom node: ${node.title}`);
    setCustomText("");
    onCreated();
  }
}
