import { create } from "zustand";
import { useSyncExternalStore } from "react";
import type { Connection, GraphNote, GraphViewport, NodeInstance, PortDefinition, WorkflowGraph } from "../domain/types";
import { GRAPH_SCHEMA_VERSION } from "../domain/types";
import { DEFINITIONS_BY_ID } from "../domain/nodeLibrary";
import { portsCompatible } from "../domain/dataTypes";
import { ipc } from "../ipc/client";
import { uid } from "../app/id";
import { createNodeFromDef } from "./factory";

interface HistoryEntry {
  graph: WorkflowGraph;
  label: string;
}

export type ThemeId = "inscribed" | "chalk" | "carbon" | "bone" | "indigo" | "sage" | "hazard" | "orchid" | "porcelain";

/** One list of themes, owned here. SettingsPage renders it; the theme probe cross-checks CSS. */
export const THEME_IDS: ThemeId[] = ["inscribed", "chalk", "carbon", "bone", "indigo", "sage", "hazard", "orchid", "porcelain"];

export interface EditorPrefs {
  snap: number;
  autosaveMs: number;
  theme: ThemeId;
  showMinimap: boolean;
  showGrid: boolean;
  reducedMotion: boolean;
}

/**
 * V11.2 — the theme set was replaced. Old saved preferences are migrated to the closest
 * palette instead of being silently coerced to a default (that was the V10.1 bug: an
 * unknown theme vanished without a trace). Every old name maps deliberately:
 *   nothing/nothing-light            → inscribed/chalk   (the renamed family)
 *   void/monochrome                  → inscribed         (minimal dark)
 *   graphite/terminal                → carbon            (industrial dark)
 *   paper/hermes                     → bone              (warm light)
 *   tokyo-night/nord/cyber-matrix    → indigo            (blue dark)
 *   solar                            → chalk             (light)
 */
const THEME_ALIASES: Record<string, ThemeId> = {
  nothing: "inscribed",
  "nothing-light": "chalk",
  void: "inscribed",
  monochrome: "inscribed",
  graphite: "carbon",
  terminal: "carbon",
  paper: "bone",
  hermes: "bone",
  "tokyo-night": "indigo",
  nord: "indigo",
  "cyber-matrix": "indigo",
  solar: "chalk",
};

const PREFS_KEY = "mj.editor.prefs";
export function getEditorPrefs(): EditorPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<EditorPrefs>;
      const stored = typeof p.theme === "string" ? p.theme : "";
      const theme: ThemeId = THEME_IDS.includes(stored as ThemeId)
        ? (stored as ThemeId)
        : THEME_ALIASES[stored] ?? "inscribed";
      return {
        snap: typeof p.snap === "number" && p.snap >= 0 ? p.snap : 16,
        autosaveMs: typeof p.autosaveMs === "number" && p.autosaveMs >= 0 ? p.autosaveMs : 1200,
        theme,
        showMinimap: p.showMinimap !== false,
        showGrid: p.showGrid !== false,
        reducedMotion: Boolean(p.reducedMotion),
      };
    }
  } catch {
    /* ignore */
  }
  return { snap: 16, autosaveMs: 1200, theme: "inscribed", showMinimap: true, showGrid: true, reducedMotion: false };
}
export function saveEditorPrefs(p: EditorPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export interface GraphState {
  workflowId: string;
  workflowName: string;
  description: string;
  graph: WorkflowGraph;
  dirty: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  selectedNodeId: string | null;
  selectedIds: string[];
  lastSavedAt: string | null;

  loadWorkflow: (wf: { id: string; name: string; description: string; graph: WorkflowGraph }) => void;
  newWorkflow: (id: string, name: string) => void;
  selectNode: (id: string | null) => void;
  selectMany: (ids: string[]) => void;

  addNode: (definitionId: string, x: number, y: number) => string | null;
  addNote: (x: number, y: number, text?: string) => string;
  updateNote: (id: string, patch: Partial<GraphNote>) => void;
  deleteNotes: (ids: string[]) => void;
  insertTemplate: (instances: NodeInstance[], wires: Array<[string, string, string, string]>) => number;
  updateNode: (id: string, patch: Partial<NodeInstance>) => void;
  updateNodeLive: (id: string, patch: Partial<NodeInstance>) => void;
  moveNodes: (deltas: Array<{ id: string; x: number; y: number }>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  deleteNodes: (ids: string[]) => void;
  duplicateNode: (id: string) => string | null;
  pasteNodes: () => string[];
  alignSelection: (mode: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter" | "hdist" | "vdist") => void;
  autoLayout: () => void;

  canConnect: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => boolean;
  connect: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => boolean;
  disconnect: (connectionId: string) => void;
  setConnectionStatus: (connectionId: string, status: Connection["status"]) => void;
  setNodeStatus: (nodeId: string, status: string) => void;
  setViewport: (vp: Partial<GraphViewport>) => void;

  undo: () => void;
  redo: () => void;
  checkpoint: (label: string) => void;
  save: () => Promise<void>;
  rename: (name: string) => void;
}

const emptyGraph = (id: string, name: string): WorkflowGraph => ({
  schemaVersion: GRAPH_SCHEMA_VERSION,
  id,
  name,
  nodes: [],
  connections: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  groups: [],
  notes: [],
});

function sanitizeGraph(g: WorkflowGraph): WorkflowGraph {
  const vp = g.viewport ?? { x: 0, y: 0, zoom: 1 };
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    ...g,
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes: Array.isArray(g.nodes)
      ? g.nodes.map((n) => ({
          ...n,
          x: num(n.x, 80),
          y: num(n.y, 80),
          inputs: Array.isArray(n.inputs) ? n.inputs : [],
          outputs: Array.isArray(n.outputs) ? n.outputs : [],
          reflection:
            n.reflection && typeof n.reflection === "object"
              ? {
                  enabled: Boolean(n.reflection.enabled),
                  maxAttempts: Math.min(2, Math.max(1, Number(n.reflection.maxAttempts) || 2)),
                  passThreshold: Math.min(10, Math.max(1, Number(n.reflection.passThreshold) || 7)),
                }
              : { enabled: false, maxAttempts: 2, passThreshold: 7 },
        }))
      : [],
    connections: Array.isArray(g.connections) ? g.connections : [],
    viewport: { x: num(vp.x, 0), y: num(vp.y, 0), zoom: Math.min(2.4, Math.max(0.2, num(vp.zoom, 1))) },
    groups: Array.isArray(g.groups) ? g.groups : [],
    notes: Array.isArray(g.notes) ? g.notes : [],
  };
}

const runtimeStatus = new Map<string, string>();
const runtimeOutput = new Map<string, string>();

let nodeClipboard: NodeInstance[] = [];

export function copyNodesToClipboard(ids: string[]): void {
  const g = useGraphStore.getState().graph;
  nodeClipboard = ids
    .map((id) => g.nodes.find((n) => n.id === id))
    .filter((n): n is NodeInstance => Boolean(n))
    .map((n) => structuredClone(n));
}

export function clipboardHasNodes(): boolean {
  return nodeClipboard.length > 0;
}

export const useGraphStore = create<GraphState>((set, get) => {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleAutosave = () => {
    const { autosaveMs } = getEditorPrefs();
    if (autosaveMs <= 0) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void get().save();
    }, autosaveMs);
  };

  const withHistory = (label: string, mutate: (g: WorkflowGraph) => void) => {
    const s = get();
    const next: WorkflowGraph = structuredClone(s.graph);
    mutate(next);
    set({
      graph: next,
      dirty: true,
      past: [...s.past.slice(-99), { graph: s.graph, label }],
      future: [],
    });
    scheduleAutosave();
  };

  return {
    workflowId: "",
    workflowName: "",
    description: "",
    graph: emptyGraph("", ""),
    dirty: false,
    past: [],
    future: [],
    selectedNodeId: null,
    selectedIds: [],
    lastSavedAt: null,

    loadWorkflow: (wf) =>
      set({
        workflowId: wf.id,
        workflowName: wf.name,
        description: wf.description ?? "",
        graph: sanitizeGraph(wf.graph?.nodes ? wf.graph : emptyGraph(wf.id, wf.name)),
        dirty: false,
        past: [],
        future: [],
        selectedNodeId: null,
        selectedIds: [],
      }),

    newWorkflow: (id, name) =>
      set({
        workflowId: id,
        workflowName: name,
        description: "",
        graph: emptyGraph(id, name),
        dirty: false,
        past: [],
        future: [],
        selectedNodeId: null,
        selectedIds: [],
      }),

    selectNode: (id) => set({ selectedNodeId: id, selectedIds: id ? [id] : [] }),

    selectMany: (ids) =>
      set({
        selectedIds: ids,
        selectedNodeId:
          ids.length === 1
            ? ids[0]
            : ids.length > 0
              ? get().selectedNodeId && ids.includes(get().selectedNodeId!)
                ? get().selectedNodeId
                : ids[ids.length - 1]
              : null,
      }),

    addNode: (definitionId, x, y) => {
      const def = DEFINITIONS_BY_ID.get(definitionId);
      if (!def) return null;
      const node = createNodeFromDef(def, uid("n"), x, y);
      withHistory(`Add ${def.title}`, (g) => g.nodes.push(node));
      set({ selectedNodeId: node.id, selectedIds: [node.id] });
      return node.id;
    },

    addNote: (x, y, text = "Note") => {
      const id = uid("note");
      withHistory("Add note", (g) => {
        g.notes = [...(g.notes ?? []), { id, x, y, w: 200, h: 120, text, color: "#C9A66B" }];
      });
      return id;
    },

    updateNote: (id, patch) => {
      set((s) => ({
        graph: {
          ...s.graph,
          notes: (s.graph.notes ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)),
        },
        dirty: true,
      }));
      scheduleAutosave();
    },

    deleteNotes: (ids) =>
      withHistory("Delete notes", (g) => {
        g.notes = (g.notes ?? []).filter((n) => !ids.includes(n.id));
      }),

    insertTemplate: (instances, wires) => {
      if (instances.length === 0) return 0;
      const byKey = new Map(instances.map((n) => [n.templateKey as string, n]));
      let connected = 0;
      withHistory("Load template", (g) => {
        for (const n of instances) g.nodes.push({ ...n });
        for (const [sk, sp, tk, tp] of wires) {
          const src = byKey.get(sk);
          const tgt = byKey.get(tk);
          if (!src || !tgt) continue;
          const findPort = (node: NodeInstance, dir: "input" | "output", key: string) =>
            (dir === "input" ? node.inputs : node.outputs).find(
              (p) => p.id.toLowerCase() === key.toLowerCase() || p.label.toLowerCase() === key.toLowerCase(),
            );
          const spDef = findPort(src, "output", sp);
          const tpDef = findPort(tgt, "input", tp);
          if (!spDef || !tpDef) continue;
          if (!portsCompatible(spDef.dataType, tpDef.dataType)) continue;
          g.connections.push({
            id: uid("c"),
            sourceNodeId: src.id,
            sourcePortId: spDef.id,
            targetNodeId: tgt.id,
            targetPortId: tpDef.id,
            dataType: spDef.dataType,
            status: "idle",
          });
          connected += 1;
        }
      });
      return connected;
    },

    updateNode: (id, patch) =>
      withHistory("Edit node", (g) => {
        const n = g.nodes.find((x) => x.id === id);
        if (n) Object.assign(n, patch);
      }),

    updateNodeLive: (id, patch) => {
      set((s) => ({
        graph: {
          ...s.graph,
          nodes: s.graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        },
        dirty: true,
      }));
      scheduleAutosave();
    },

    moveNodes: (deltas) => {
      const byId = new Map(deltas.map((d) => [d.id, d]));
      set((s) => ({
        graph: {
          ...s.graph,
          nodes: s.graph.nodes.map((n) => {
            const d = byId.get(n.id);
            return d ? { ...n, x: d.x, y: d.y } : n;
          }),
        },
        dirty: true,
      }));
      scheduleAutosave();
    },

    moveNode: (id, x, y) => {
      get().moveNodes([{ id, x, y }]);
    },

    deleteNodes: (ids) =>
      withHistory("Delete nodes", (g) => {
        g.nodes = g.nodes.filter((n) => !ids.includes(n.id));
        g.connections = g.connections.filter((c) => !ids.includes(c.sourceNodeId) && !ids.includes(c.targetNodeId));
      }),

    duplicateNode: (id) => {
      const src = get().graph.nodes.find((n) => n.id === id);
      if (!src) return null;
      const copy: NodeInstance = structuredClone(src);
      copy.id = uid("n");
      copy.title = `${src.title} copy`;
      copy.x += 40;
      copy.y += 40;
      withHistory("Duplicate node", (g) => g.nodes.push(copy));
      set({ selectedNodeId: copy.id, selectedIds: [copy.id] });
      return copy.id;
    },

    canConnect: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
      const g = get().graph;
      if (sourceNodeId === targetNodeId) return false;
      const src = g.nodes.find((n) => n.id === sourceNodeId);
      const tgt = g.nodes.find((n) => n.id === targetNodeId);
      if (!src || !tgt) return false;
      const sp = src.outputs.find((p) => p.id === sourcePortId);
      const tp = tgt.inputs.find((p) => p.id === targetPortId);
      if (!sp || !tp) return false;
      if (!portsCompatible(sp.dataType, tp.dataType)) return false;
      if (!tp.multiple && g.connections.some((c) => c.targetNodeId === targetNodeId && c.targetPortId === targetPortId)) {
        return false;
      }
      const adj = new Map<string, string[]>(g.nodes.map((n) => [n.id, []]));
      for (const c of g.connections) adj.get(c.sourceNodeId)?.push(c.targetNodeId);
      const stack = [targetNodeId];
      const seen = new Set<string>();
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === sourceNodeId) return false;
        for (const nx of adj.get(cur) ?? []) {
          if (!seen.has(nx)) {
            seen.add(nx);
            stack.push(nx);
          }
        }
      }
      return true;
    },

    connect: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
      if (!get().canConnect(sourceNodeId, sourcePortId, targetNodeId, targetPortId)) return false;
      const src = get().graph.nodes.find((n) => n.id === sourceNodeId)!;
      const sp = src.outputs.find((p: PortDefinition) => p.id === sourcePortId)!;
      const conn: Connection = {
        id: uid("c"),
        sourceNodeId,
        sourcePortId,
        targetNodeId,
        targetPortId,
        dataType: sp.dataType,
        status: "idle",
      };
      withHistory("Connect", (g) => g.connections.push(conn));
      return true;
    },

    disconnect: (connectionId) =>
      withHistory("Disconnect", (g) => {
        g.connections = g.connections.filter((c) => c.id !== connectionId);
      }),

    setConnectionStatus: (connectionId, status) =>
      set((s) => {
        const g = structuredClone(s.graph);
        const c = g.connections.find((x) => x.id === connectionId);
        if (c) c.status = status;
        return { graph: g };
      }),

    setNodeStatus: (nodeId: string, status: string) => {
      runtimeStatus.set(nodeId, status);
      window.dispatchEvent(new CustomEvent(`mj:status:${nodeId}`));
    },

    setViewport: (vp) => {
      set((s) => ({ graph: { ...s.graph, viewport: { ...s.graph.viewport, ...vp } }, dirty: true }));
      scheduleAutosave();
    },

    undo: () => {
      const s = get();
      const prev = s.past.at(-1);
      if (!prev) return;
      set({
        graph: prev.graph,
        past: s.past.slice(0, -1),
        future: [{ graph: s.graph, label: prev.label }, ...s.future].slice(0, 100),
        dirty: true,
      });
      scheduleAutosave();
    },

    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({
        graph: next.graph,
        past: [...s.past, { graph: s.graph, label: next.label }],
        future: s.future.slice(1),
        dirty: true,
      });
      scheduleAutosave();
    },

    pasteNodes: () => {
      if (nodeClipboard.length === 0) return [];
      const created: string[] = [];
      withHistory("Paste nodes", (g) => {
        for (const src of nodeClipboard) {
          const copy: NodeInstance = structuredClone(src);
          copy.id = uid("n");
          copy.title = `${copy.title} copy`;
          copy.x += 40;
          copy.y += 40;
          g.nodes.push(copy);
          created.push(copy.id);
        }
      });
      if (created.length > 0) set({ selectedNodeId: created[created.length - 1], selectedIds: [...created] });
      return created;
    },

    alignSelection: (mode) => {
      const ids = get().selectedIds;
      const nodes = get().graph.nodes.filter((n) => ids.includes(n.id));
      if (nodes.length < 2) return;
      const xs = nodes.map((n) => n.x);
      const ys = nodes.map((n) => n.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const sortedX = [...nodes].sort((a, b) => a.x - b.x);
      const sortedY = [...nodes].sort((a, b) => a.y - b.y);
      withHistory(`Align ${mode}`, (g) => {
        for (const n of g.nodes) {
          if (!ids.includes(n.id)) continue;
          if (mode === "left") n.x = minX;
          if (mode === "right") n.x = maxX;
          if (mode === "top") n.y = minY;
          if (mode === "bottom") n.y = maxY;
          if (mode === "hcenter") n.x = cx;
          if (mode === "vcenter") n.y = cy;
        }
        if (mode === "hdist" && sortedX.length > 2) {
          const span = sortedX[sortedX.length - 1].x - sortedX[0].x;
          const step = span / (sortedX.length - 1);
          sortedX.forEach((n, i) => {
            const t = g.nodes.find((x) => x.id === n.id);
            if (t) t.x = sortedX[0].x + step * i;
          });
        }
        if (mode === "vdist" && sortedY.length > 2) {
          const span = sortedY[sortedY.length - 1].y - sortedY[0].y;
          const step = span / (sortedY.length - 1);
          sortedY.forEach((n, i) => {
            const t = g.nodes.find((x) => x.id === n.id);
            if (t) t.y = sortedY[0].y + step * i;
          });
        }
      });
    },

    autoLayout: () => {
      const g = get().graph;
      const indeg = new Map(g.nodes.map((n) => [n.id, 0]));
      const adj = new Map(g.nodes.map((n) => [n.id, [] as string[]]));
      for (const c of g.connections) {
        adj.get(c.sourceNodeId)?.push(c.targetNodeId);
        indeg.set(c.targetNodeId, (indeg.get(c.targetNodeId) ?? 0) + 1);
      }
      const layers: string[][] = [];
      let frontier = g.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
      const placed = new Set<string>();
      while (frontier.length) {
        layers.push(frontier);
        frontier.forEach((id) => placed.add(id));
        const next: string[] = [];
        for (const id of layers[layers.length - 1]) {
          for (const nx of adj.get(id) ?? []) {
            if (placed.has(nx)) continue;
            const left = (indeg.get(nx) ?? 0) - 1;
            indeg.set(nx, left);
            if (left <= 0) next.push(nx);
          }
        }
        frontier = next.filter((id, i, a) => a.indexOf(id) === i);
        if (layers.length > 40) break;
      }
      for (const n of g.nodes) if (!placed.has(n.id)) layers.push([n.id]);
      withHistory("Auto layout", (graph) => {
        layers.forEach((layer, i) => {
          layer.forEach((id, j) => {
            const n = graph.nodes.find((x) => x.id === id);
            if (n) {
              n.x = 80 + i * 320;
              n.y = 80 + j * 200;
            }
          });
        });
      });
    },

    checkpoint: (label) => {
      const s = get();
      set({ past: [...s.past.slice(-99), { graph: structuredClone(s.graph), label }], future: [], dirty: true });
    },

    rename: (name) => {
      set((s) => ({
        workflowName: name,
        graph: { ...s.graph, name },
        dirty: true,
      }));
      scheduleAutosave();
    },

    save: async () => {
      const s = get();
      if (!s.workflowId) return;
      try {
        await ipc.workflowSave(s.workflowId, s.workflowName, s.description, s.graph);
        set({ dirty: false, lastSavedAt: new Date().toISOString() });
      } catch (e) {
        console.error("autosave failed", e);
      }
    },
  };
});

export function getNodeRuntimeStatus(nodeId: string): string {
  return runtimeStatus.get(nodeId) ?? "";
}

export function setNodeRuntimeOutput(nodeId: string, text: string) {
  runtimeOutput.set(nodeId, text);
  window.dispatchEvent(new CustomEvent(`mj:out:${nodeId}`));
}

export function getNodeRuntimeOutput(nodeId: string): string {
  return runtimeOutput.get(nodeId) ?? "";
}

export function useNodeRuntimeStatus(nodeId: string): string {
  return useSyncExternalStore(
    (cb) => {
      const handler = () => cb();
      window.addEventListener(`mj:status:${nodeId}`, handler);
      return () => window.removeEventListener(`mj:status:${nodeId}`, handler);
    },
    () => runtimeStatus.get(nodeId) ?? "",
  );
}

export function useNodeRuntimeOutput(nodeId: string): string {
  return useSyncExternalStore(
    (cb) => {
      const handler = () => cb();
      window.addEventListener(`mj:out:${nodeId}`, handler);
      return () => window.removeEventListener(`mj:out:${nodeId}`, handler);
    },
    () => runtimeOutput.get(nodeId) ?? "",
  );
}
