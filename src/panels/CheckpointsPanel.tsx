/**
 * §CHECKPOINTS PANEL — named time-travel for the graph (MJ 11.9.5).
 *
 * LangGraph-shaped idea applied to design time: name a moment of the graph, keep it, restore it.
 * Restore rides the undo stack (store.restoreGraph), so even "go back to the checkpoint" can be
 * undone — time travel with a safety rope.
 */
import { useEffect, useState } from "react";
import { addCheckpoint, createCheckpoint, loadCheckpoints, restoreGraph, saveCheckpoints, type GraphCheckpoint } from "../graph/checkpoints";
import { useGraphStore } from "../graph/store";
import { toast } from "./Toast";

export function CheckpointsPanel({ onClose }: { onClose: () => void }) {
  const workflowId = useGraphStore((s) => s.workflowId);
  const [name, setName] = useState("");
  const [list, setList] = useState<GraphCheckpoint[]>([]);

  useEffect(() => {
    setList(loadCheckpoints().filter((c) => c.workflowId === workflowId));
  }, [workflowId]);

  const save = () => {
    const store = useGraphStore.getState();
    const cp = createCheckpoint(name, store.graph);
    const { list: next, skipped } = addCheckpoint(loadCheckpoints(), cp);
    if (skipped) {
      toast("Nothing changed since the last checkpoint — not saving a duplicate.");
      return;
    }
    saveCheckpoints(next);
    setList(next.filter((c) => c.workflowId === workflowId));
    setName("");
    toast(`Checkpoint saved: ${cp.name}`);
  };

  const restore = (cp: GraphCheckpoint) => {
    const store = useGraphStore.getState();
    store.restoreGraph(restoreGraph(store.graph, cp), `Restore checkpoint "${cp.name}"`);
    void store.save();
    toast(`Restored "${cp.name}" — Ctrl+Z undoes even this.`);
    onClose();
  };

  const remove = (cp: GraphCheckpoint) => {
    const next = loadCheckpoints().filter((c) => c.id !== cp.id);
    saveCheckpoints(next);
    setList(next.filter((c) => c.workflowId === workflowId));
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal checkpoints-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="inspector-head" style={{ marginBottom: 8 }}>Checkpoints — time travel for this workflow</div>
        <div className="row" style={{ gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Name this moment (e.g. before the big rewire)"
            style={{ flex: 1 }}
            autoFocus
          />
          <button className="primary" onClick={save}>Save checkpoint</button>
        </div>
        <div className="checkpoints-list">
          {list.length === 0 && <div className="muted" style={{ padding: "14px 2px" }}>No checkpoints yet. Save one before a risky rewire — restore is one click, and undoable.</div>}
          {list.map((cp) => (
            <div key={cp.id} className="checkpoint-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{cp.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {new Date(cp.ts).toLocaleString()} · {cp.counts.nodes} nodes · {cp.counts.connections} wires
                </div>
              </div>
              <button onClick={() => restore(cp)}>Restore</button>
              <button className="ghost" title="Delete checkpoint" onClick={() => remove(cp)}>✕</button>
            </div>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Stored locally per workflow · newest first · duplicates of the latest state are refused, not stored
        </div>
      </div>
    </div>
  );
}
