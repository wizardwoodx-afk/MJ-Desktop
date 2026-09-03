import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DATA_TYPE_COLORS } from "../domain/dataTypes";
import { DEFINITIONS_BY_ID } from "../domain/nodeLibrary";
import { getEditorPrefs, useGraphStore, useNodeRuntimeOutput, useNodeRuntimeStatus } from "../graph/store";
import { iconFor } from "./icons";
import { bezier, edgeMidpoint, NODE_W, nodeH as geomNodeH, nodeHitRect, portPos as geomPortPos, zoomAt, type NodeMetrics } from "./geometry";
import { getMetricsVersion, invalidatePortMetrics, measureCardHeight, measurePort, registerPortAnchor, subscribePortMetrics, type PortPoint } from "./ports";
import type { NodeInstance } from "../domain/types";

export { iconFor };

/**
 * V11.2 (bug X, the real fix): wire geometry comes from MEASURED port anchors, not from a model
 * of the card. The old hard-coded model (top = 86 + portIndex*19 + 10) assumed a fixed header and
 * no optional content, so wires drifted every time a description wrapped or the stream preview
 * appeared. `measurePort` reads the rendered anchors; the model below only covers the first paint,
 * before the DOM has laid out.
 */
function cardHeight(nodeId: string, n: NodeInstance): number {
  return measureCardHeight(nodeId) ?? geomNodeH(n);
}

/** Snapshot of the rendered port geometry, keyed by node id. Rebuilt when the DOM invalidates it. */
function measuredMetrics(nodes: NodeInstance[]): Map<string, NodeMetrics> {
  const metrics = new Map<string, NodeMetrics>();
  for (const n of nodes) {
    const ports = new Map<string, PortPoint>();
    let any = false;
    for (const p of n.inputs) {
      const m = measurePort(n.id, p.id, "in");
      if (m) {
        ports.set(`in:${p.id}`, m);
        any = true;
      }
    }
    for (const p of n.outputs) {
      const m = measurePort(n.id, p.id, "out");
      if (m) {
        ports.set(`out:${p.id}`, m);
        any = true;
      }
    }
    if (any) metrics.set(n.id, { ports, h: measureCardHeight(n.id) ?? geomNodeH(n) });
  }
  return metrics;
}

export function Canvas({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const store = useGraphStore();
  const wrap = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<{ nodeId: string; portId: string; x: number; y: number } | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId?: string; connId?: string } | null>(null);
  /** The input port the cursor is currently over while linking, so the ghost wire snaps to it. */
  const [hoverPort, setHoverPort] = useState<{ nodeId: string; portId: string } | null>(null);
  const drag = useRef<{ ids: string[]; ox: number; oy: number; start: { id: string; x: number; y: number }[] } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const space = useRef(false);

  /** Re-render the wire layer whenever the DOM invalidates a port measurement. */
  const metricsVersion = useSyncExternalStore(subscribePortMetrics, getMetricsVersion);

  const vp = store.graph.viewport;
  const toWorld = useCallback(
    (cx: number, cy: number) => {
      const r = wrap.current!.getBoundingClientRect();
      return { x: (cx - r.left - vp.x) / vp.zoom, y: (cy - r.top - vp.y) / vp.zoom };
    },
    [vp],
  );

  /**
   * Editor snap, read live so the Settings field applies without a remount.
   * 0 means free placement (bug fix: this used to be hardcoded to 16, which made
   * the "Grid snap" preference in Settings a no-op).
   */
  const snapCoord = useCallback((v: number) => {
    const snap = getEditorPrefs().snap;
    return snap > 0 ? Math.round(v / snap) * snap : Math.round(v);
  }, []);

  const fitView = useCallback(() => {
    const nodes = store.graph.nodes;
    const el = wrap.current;
    if (!el || nodes.length === 0) {
      store.setViewport({ x: 40, y: 40, zoom: 1 });
      return;
    }
    const minX = Math.min(...nodes.map((n) => n.x)) - 40;
    const minY = Math.min(...nodes.map((n) => n.y)) - 40;
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + 40;
    const maxY = Math.max(...nodes.map((n) => n.y + cardHeight(n.id, n))) + 40;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const zoom = Math.min(1.4, Math.max(0.3, Math.min(w / (maxX - minX), h / (maxY - minY))));
    store.setViewport({ zoom, x: (w - (maxX - minX) * zoom) / 2 - minX * zoom, y: (h - (maxY - minY) * zoom) / 2 - minY * zoom });
  }, [store]);

  useEffect(() => {
    window.__mjCanvas = {
      fitView,
      zoomIn: () => store.setViewport({ zoom: Math.min(2.4, vp.zoom * 1.12) }),
      zoomOut: () => store.setViewport({ zoom: Math.max(0.2, vp.zoom / 1.12) }),
      autoLayout: () => {
        store.autoLayout();
        setTimeout(fitView, 30);
      },
      focusNode: (id) => {
        const n = store.graph.nodes.find((x) => x.id === id);
        if (!n || !wrap.current) return;
        store.selectNode(id);
        store.setViewport({
          x: wrap.current.clientWidth / 2 - (n.x + 124) * vp.zoom,
          y: wrap.current.clientHeight / 2 - (n.y + 40) * vp.zoom,
        });
      },
    };
  }, [fitView, store, vp.zoom]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /**
   * Wheel gestures over a native NON-passive listener.
   *
   * V11.2 (bug Y, the real fix — geometry.ts shipped `zoomAt` in V8 but Canvas never used it):
   *
   *   BUG   plain wheel panned the viewport (vp.y changed), so scrolling the mouse moved the
   *         nodes up and down instead of zooming — the exact inversion of every node editor.
   *   FIX   plain wheel = cursor-anchored zoom via `zoomAt` (the point under the cursor stays
   *         exactly under the cursor); Shift+wheel = horizontal pan (trackpads put deltaX
   *         here); Ctrl/Cmd+wheel also zooms (browser-style pinch / page zoom).
   *
   * The listener is registered natively with { passive: false } because React's delegated `wheel`
   * listeners are passive — the old `onWheel` + preventDefault never prevented anything and the
   * host page scrolled alongside the canvas (Chromium logged that on every gesture).
   */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const vpNow = useGraphStore.getState().graph.viewport;
      const r = el.getBoundingClientRect();
      const cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.shiftKey) {
        useGraphStore
          .getState()
          .setViewport({ x: vpNow.x - (e.deltaX || e.deltaY), y: vpNow.y - (e.deltaX ? e.deltaY : 0) });
      } else {
        useGraphStore.getState().setViewport(zoomAt(vpNow, cursor, e.deltaY, e.deltaMode));
      }
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  /** Escape dismisses the canvas context menu (the app-level Escape only closes panels). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".node-card, .port-anchor, .sticky-note, .canvas-toolbar, .minimap, .lib-handle")) return;
    setCtxMenu(null);
    if (e.button === 1 || e.button === 2 || space.current || e.altKey) {
      pan.current = { x: e.clientX, y: e.clientY, vx: vp.x, vy: vp.y };
      wrap.current?.classList.add("panning");
      return;
    }
    if (e.button === 0) {
      const w = toWorld(e.clientX, e.clientY);
      setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
      store.selectNode(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const w = toWorld(e.clientX, e.clientY);
    setMouse(w);
    if (pan.current) {
      store.setViewport({ x: pan.current.vx + (e.clientX - pan.current.x), y: pan.current.vy + (e.clientY - pan.current.y) });
    }
    if (drag.current) {
      const dx = w.x - drag.current.ox;
      const dy = w.y - drag.current.oy;
      store.moveNodes(
        drag.current.start.map((s) => ({
          id: s.id,
          x: snapCoord(s.x + dx),
          y: snapCoord(s.y + dy),
        })),
      );
    }
    if (marquee) {
      setMarquee({ x: marquee.x, y: marquee.y, w: w.x - marquee.x, h: w.y - marquee.y });
    }
  };

  const onPointerUp = () => {
    wrap.current?.classList.remove("panning");
    pan.current = null;
    drag.current = null;
    setHoverPort(null);
    if (marquee) {
      const x1 = Math.min(marquee.x, marquee.x + marquee.w);
      const y1 = Math.min(marquee.y, marquee.y + marquee.h);
      const x2 = Math.max(marquee.x, marquee.x + marquee.w);
      const y2 = Math.max(marquee.y, marquee.y + marquee.h);
      if (Math.abs(marquee.w) > 6 || Math.abs(marquee.h) > 6) {
        const ids = store.graph.nodes.filter((n) => n.x < x2 && n.x + NODE_W > x1 && n.y < y2 && n.y + cardHeight(n.id, n) > y1).map((n) => n.id);
        store.selectMany(ids);
      }
      setMarquee(null);
    }
    if (link) setLink(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const defId = e.dataTransfer.getData("application/mj-node") || e.dataTransfer.getData("text/plain");
    if (!defId) return;
    const w = toWorld(e.clientX, e.clientY);
    store.addNode(defId, snapCoord(w.x), snapCoord(w.y));
  };

  /**
   * V11.2 (bug X): rebuilt measured geometry every time the DOM invalidates it, and the wire
   * endpoints come from `geometry.portPos` with those measurements — so a wire attaches to the
   * anchor a human can see, not to the anchor a hard-coded model predicted.
   */
  const metrics = useMemo(() => measuredMetrics(store.graph.nodes), [store.graph.nodes, metricsVersion]);
  const wires = useMemo(() => {
    return store.graph.connections.map((c) => {
      const sn = store.graph.nodes.find((n) => n.id === c.sourceNodeId);
      const tn = store.graph.nodes.find((n) => n.id === c.targetNodeId);
      if (!sn || !tn) return null;
      const a = geomPortPos(sn, c.sourcePortId, "out", metrics);
      const b = geomPortPos(tn, c.targetPortId, "in", metrics);
      const mid = edgeMidpoint(a, b);
      return { c, d: bezier(a, b), mid, color: DATA_TYPE_COLORS[c.dataType] ?? "#aaa" };
    }).filter(Boolean) as Array<{ c: (typeof store.graph.connections)[0]; d: string; mid: { x: number; y: number }; color: string }>;
  }, [store.graph, metrics]);

  return (
    <div
      className="canvas-wrap"
      ref={wrap}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="canvas-grid" style={{ backgroundPosition: `${vp.x}px ${vp.y}px` }} />
      <svg className="wires-layer" style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`, transformOrigin: "0 0", width: "100%", height: "100%" }}>
        <defs>
          <filter id="mj-glow"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {wires.map(({ c, d, mid, color }) => (
          <g key={c.id} className="wire-group" onClick={() => store.disconnect(c.id)}>
            <path className="wire-hit" d={d} />
            <path className={`wire ${c.status}`} d={d} style={{ stroke: color }} />
            {/* V11.5: a midpoint dot on the curve — the Meridian junction-dot, on wires too. */}
            <circle className="wire-mid" cx={mid.x} cy={mid.y} r="2.6" fill={color} stroke="none" />
          </g>
        ))}
        {link && (() => {
          const n = store.graph.nodes.find((x) => x.id === link.nodeId);
          if (!n) return null;
          const a = geomPortPos(n, link.portId, "out", metrics);
          // The ghost wire snaps to the input port under the cursor when it is a valid target,
          // so connecting ends on the anchor a human can see — not at the cursor's pixel.
          let end = mouse;
          if (hoverPort) {
            const hn = store.graph.nodes.find((x) => x.id === hoverPort.nodeId);
            if (hn && useGraphStore.getState().canConnect(link.nodeId, link.portId, hn.id, hoverPort.portId)) {
              end = geomPortPos(hn, hoverPort.portId, "in", metrics);
            } else {
              end = mouse;
            }
          }
          return <path className="wire active" d={bezier(a, end)} />;
        })()}
      </svg>
      <div className="nodes-layer" style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }}>
        {(store.graph.notes ?? []).map((note) => (
          <div key={note.id} className="sticky-note" style={{ left: note.x, top: note.y, width: note.w }}
            onDoubleClick={() => {
              const t = prompt("Note", note.text);
              if (t !== null) store.updateNote(note.id, { text: t });
            }}>
            {note.text}
          </div>
        ))}
        {store.graph.nodes.map((n) => (
          <NodeCard
            key={n.id}
            node={n}
            selected={store.selectedIds.includes(n.id)}
            linking={link}
            onHoverPort={(p) => setHoverPort(p)}
            onDragStart={(e) => {
              const ids = store.selectedIds.includes(n.id) ? store.selectedIds : [n.id];
              store.selectMany(ids);
              const w = toWorld(e.clientX, e.clientY);
              drag.current = {
                ids,
                ox: w.x,
                oy: w.y,
                start: store.graph.nodes.filter((x) => ids.includes(x.id)).map((x) => ({ id: x.id, x: x.x, y: x.y })),
              };
            }}
            onPortDown={(portId, dir, ev) => {
              ev.stopPropagation();
              if (dir === "out") setLink({ nodeId: n.id, portId, x: n.x, y: n.y });
              else if (link) {
                store.connect(link.nodeId, link.portId, n.id, portId);
                setLink(null);
              }
            }}
            onContext={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: n.id });
            }}
          />
        ))}
        {marquee && (
          <div className="marquee-rect" style={{
            left: Math.min(marquee.x, marquee.x + marquee.w),
            top: Math.min(marquee.y, marquee.y + marquee.h),
            width: Math.abs(marquee.w),
            height: Math.abs(marquee.h),
          }} />
        )}
      </div>

      {store.graph.nodes.length === 0 && (
        <div className="canvas-empty">
          <div className="ce-mark">MJ</div>
          <div className="ce-title">Empty canvas</div>
          <div className="ce-sub">Drop a node from the library, load a template, or add one custom node.</div>
          <button className="primary ce-cta" onClick={onOpenLibrary}>Open library</button>
        </div>
      )}

      <button className="lib-handle" onClick={onOpenLibrary}>LIBRARY</button>

      <div className="canvas-toolbar">
        <button onClick={() => store.setViewport({ zoom: Math.max(0.2, vp.zoom / 1.12) })}>−</button>
        <span className="zoom-pct muted" style={{ padding: "0 6px" }}>{Math.round(vp.zoom * 100)}%</span>
        <button onClick={() => store.setViewport({ zoom: Math.min(2.4, vp.zoom * 1.12) })}>+</button>
        <div className="tb-sep" />
        <button onClick={fitView}>Fit</button>
        <button onClick={() => { store.autoLayout(); setTimeout(fitView, 20); }}>Layout</button>
        <button onClick={() => store.addNote(-vp.x / vp.zoom + 80, -vp.y / vp.zoom + 80)}>Note</button>
      </div>

      <Minimap />

      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onMouseLeave={() => setCtxMenu(null)}>
          {ctxMenu.nodeId ? (
            <>
              <button onClick={() => { store.duplicateNode(ctxMenu.nodeId!); setCtxMenu(null); }}>Duplicate <span className="kbd">Ctrl+D</span></button>
              <button onClick={() => { store.deleteNodes([ctxMenu.nodeId!]); setCtxMenu(null); }} className="danger">Delete <span className="kbd">Del</span></button>
            </>
          ) : (
            <>
              <button onClick={() => { onOpenLibrary(); setCtxMenu(null); }}>Add node</button>
              <button onClick={() => { const w = toWorld(ctxMenu.x, ctxMenu.y); store.addNote(w.x, w.y); setCtxMenu(null); }}>Add note</button>
              <button onClick={() => { fitView(); setCtxMenu(null); }}>Fit view</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * V11.2 (bug X): the wire-layer geometry depends on the card's rendered height. A status flip or
 * a stream output makes the preview block appear/disappear and reflows the card; the ResizeObserver
 * catches every layout change and invalidates the port metrics, and the effect keyed on
 * [status, out] catches the changes that happen between renders, before layout settles.
 */
function useNodeCardWatch(nodeId: string, cardRef: React.RefObject<HTMLDivElement | null>) {
  const status = useNodeRuntimeStatus(nodeId);
  const out = useNodeRuntimeOutput(nodeId);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    invalidatePortMetrics();
    const ro = new ResizeObserver(() => invalidatePortMetrics());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, cardRef, status, out]);
}

function NodeCard({
  node, selected, linking, onDragStart, onPortDown, onContext, onHoverPort,
}: {
  node: NodeInstance;
  selected: boolean;
  linking: { nodeId: string; portId: string } | null;
  onDragStart: (e: React.PointerEvent) => void;
  onPortDown: (portId: string, dir: "in" | "out", e: React.PointerEvent) => void;
  onContext: (e: React.MouseEvent) => void;
  onHoverPort: (p: { nodeId: string; portId: string } | null) => void;
}) {
  const status = useNodeRuntimeStatus(node.id);
  const out = useNodeRuntimeOutput(node.id);
  const def = DEFINITIONS_BY_ID.get(node.definitionId);
  const cat = def?.category ?? "agent";
  const cardRef = useRef<HTMLDivElement>(null);
  const glyph = status === "failed" ? "err" : status === "succeeded" ? "done" : status === "running" || status === "streaming" ? "on" : "";
  // Subscribe (not getState()) so the fill dots repaint when connections change even if this
  // card's own props did not.
  const connections = useGraphStore((s) => s.graph.connections);
  const filledIn = new Set(connections.filter((c) => c.targetNodeId === node.id).map((c) => c.targetPortId));
  const filledOut = new Set(connections.filter((c) => c.sourceNodeId === node.id).map((c) => c.sourcePortId));

  useNodeCardWatch(node.id, cardRef);

  return (
    <div
      ref={cardRef}
      data-node-id={node.id}
      className={`node-card ${cat} ${selected ? "selected" : ""}`}
      style={{ left: node.x, top: node.y, width: cat === "control" ? undefined : NODE_W }}
      onPointerDown={onDragStart}
      onClick={() => useGraphStore.getState().selectNode(node.id)}
      onDoubleClick={() => useGraphStore.getState().openDetails(node.id)}
      onContextMenu={onContext}
    >
      <div className="head">
        <span className="icon">{iconFor(def?.icon)}</span>
        <span className="title">{node.title}</span>
        <span className={`glyph-light ${glyph}`} />
      </div>
      {cat !== "control" && <div className="purpose-preview">{node.purpose || def?.description}</div>}
      {out && status && status !== "idle" && cat !== "control" && <div className="stream-preview">{out.slice(-180)}</div>}
      <div className="port-grid">
        <div className="port-col">
          {node.inputs.map((p) => (
            <div key={p.id} className="port-row input">
              <span
                ref={(el) => registerPortAnchor(`${node.id}:in:${p.id}`, el)}
                className={`port-anchor ${filledIn.has(p.id) ? "filled" : ""} ${linking && !useGraphStore.getState().canConnect(linking.nodeId, linking.portId, node.id, p.id) ? "dimmed" : ""} ${linking && useGraphStore.getState().canConnect(linking.nodeId, linking.portId, node.id, p.id) ? "valid-target" : ""}`}
                style={{ borderColor: DATA_TYPE_COLORS[p.dataType] }}
                onPointerDown={(e) => onPortDown(p.id, "in", e)}
                onPointerEnter={() => onHoverPort({ nodeId: node.id, portId: p.id })}
                onPointerLeave={() => onHoverPort(null)}
              />
              <span className="port-name">{p.label}</span>
            </div>
          ))}
        </div>
        <div className="port-col">
          {node.outputs.map((p) => (
            <div key={p.id} className="port-row output">
              <span className="port-name">{p.label}</span>
              <span
                ref={(el) => registerPortAnchor(`${node.id}:out:${p.id}`, el)}
                className={`port-anchor ${filledOut.has(p.id) ? "filled" : ""}`}
                style={{ borderColor: DATA_TYPE_COLORS[p.dataType] }}
                onPointerDown={(e) => onPortDown(p.id, "out", e)}
              />
            </div>
          ))}
        </div>
      </div>
      {cat !== "control" && (
        <div className="meta">
          <span>{node.definitionId.split(".").slice(-1)[0]}</span>
          {status && <span>{status}</span>}
          {node.providers[0] && <span>{node.providers[0].kind}</span>}
          {typeof node.config.harness === "string" ? <span>{node.config.harness}</span> : null}
        </div>
      )}
    </div>
  );
}

function Minimap() {
  const g = useGraphStore((s) => s.graph);
  if (g.nodes.length === 0) return null;
  const minX = Math.min(...g.nodes.map((n) => n.x));
  const minY = Math.min(...g.nodes.map((n) => n.y));
  const maxX = Math.max(...g.nodes.map((n) => n.x + NODE_W));
  const maxY = Math.max(...g.nodes.map((n) => n.y + 120));
  const sx = 176 / Math.max(1, maxX - minX);
  const sy = 118 / Math.max(1, maxY - minY);
  const s = Math.min(sx, sy) * 0.86;
  return (
    <div className="minimap" onClick={() => window.__mjCanvas?.fitView()}>
      {g.nodes.map((n) => (
        <div key={n.id} style={{
          position: "absolute",
          left: 8 + (n.x - minX) * s,
          top: 16 + (n.y - minY) * s,
          /* V11.5 owner rule: minimap rects are the normal/small node-rect sizes
             (46×32 / 28×20, from geometry.nodeHitRect) — not squashed card ghosts. */
          width: Math.max(3, nodeHitRect(n, n.definitionId.startsWith("control.")).w * s),
          height: Math.max(2, nodeHitRect(n, n.definitionId.startsWith("control.")).h * s),
          // Theme tokens, not hardcoded hex — this used to paint default-theme amber in every theme.
          background: n.definitionId.startsWith("agent.") ? "var(--amber)" : "var(--text-4)",
          opacity: 0.7,
        }} />
      ))}
    </div>
  );
}
