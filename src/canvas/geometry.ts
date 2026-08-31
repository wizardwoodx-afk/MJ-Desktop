/**
 * Canvas geometry, kept free of React so it can be unit-tested on its own.
 *
 * Extracted from Canvas.tsx in V8 so the wire-anchor maths has a real test instead of being
 * verified by looking at it.
 */

import type { NodeInstance } from "../domain/types";
import type { PortPoint } from "./ports";

export const NODE_W = 248;

/** Fallback card height used before the DOM has been measured. */
export function nodeH(n: NodeInstance): number {
  const ports = Math.max(n.inputs.length, n.outputs.length);
  const isControl = n.definitionId.startsWith("control.");
  return isControl ? 52 : 86 + ports * 19;
}

/** Measured port geometry per node: local anchor centres plus the real card height. */
export interface NodeMetrics {
  ports: Map<string, PortPoint>;
  h: number;
}

/**
 * World position of a port anchor.
 *
 * V8 fix (bug X): the measured anchor position is authoritative. The hard-coded fallback below is
 * only for the first paint, before layout has happened, and it is wrong by design — it assumes a
 * fixed header and no optional content, so it cannot know how tall the description wrapped to or
 * whether the stream preview is showing. Both of those sit above the port grid and push it down.
 */
export function portPos(
  n: NodeInstance,
  portId: string,
  dir: "in" | "out",
  metrics?: Map<string, NodeMetrics>,
): { x: number; y: number } {
  const local = metrics?.get(n.id)?.ports.get(`${dir}:${portId}`);
  if (local) return { x: n.x + local.x, y: n.y + local.y };

  const list = dir === "in" ? n.inputs : n.outputs;
  const i = Math.max(0, list.findIndex((p) => p.id === portId));
  const isControl = n.definitionId.startsWith("control.");
  const top = isControl ? 26 : 86 + i * 19 + 10;
  return { x: n.x + (dir === "out" ? (isControl ? 118 : NODE_W) : 0), y: n.y + top };
}

/** Cubic bezier between two anchors, bowing horizontally like a patch cable. */
export function bezier(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(60, Math.abs(b.x - a.x) * 0.45);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.4;

/**
 * Cursor-anchored zoom.
 *
 * V8 fix (bug Y): plain wheel now zooms instead of panning. Returns the next viewport so the point
 * under the cursor stays exactly under the cursor — the property that makes zoom feel attached to
 * the thing you are pointing at rather than sliding away from it.
 *
 * `deltaMode` is normalised because browsers report the same physical notch as 100 (pixels),
 * ~3 (lines) or ~1 (pages); without this a Firefox wheel would zoom 30x faster than Chrome.
 */
export function zoomAt(
  vp: { x: number; y: number; zoom: number },
  cursor: { x: number; y: number },
  deltaY: number,
  deltaMode = 0,
): { x: number; y: number; zoom: number } {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
  const factor = Math.exp(-deltaY * unit * 0.0022);
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vp.zoom * factor));
  const k = zoom / vp.zoom;
  return { zoom, x: cursor.x - (cursor.x - vp.x) * k, y: cursor.y - (cursor.y - vp.y) * k };
}
