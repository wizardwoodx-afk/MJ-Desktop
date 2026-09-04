/**
 * Canvas geometry, kept free of React so it can be unit-tested on its own.
 *
 * Extracted from Canvas.tsx in V8 so the wire-anchor maths has a real test instead of being
 * verified by looking at it.
 */

import type { NodeInstance } from "../domain/types";
import type { PortPoint } from "./ports";

/** One source of truth for the agent-card width (px). The canvas and wires both read this. */
export const NODE_W = 264;

/**
 * Fallback card height used before the DOM has been measured.
 *
 * 11.9: the constants now reflect the real rendered layout (measured on a built
 * card): a non-control agent card is ~68px of header + purpose, minus the
 * unmeasured span, plus `ports` rows at 19px and the port-grid padding. Kept as
 * a first-paint fallback only — the measured path is authoritative.
 */
export function nodeH(n: NodeInstance): number {
  const ports = Math.max(n.inputs.length, n.outputs.length);
  const isControl = n.definitionId.startsWith("control.");
  return isControl ? 52 : 85 + ports * 19;
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
  // 11.9: first port sits ~94px below a control-light agent card top (not 96), and
  // input anchors hang just inside the left edge (~24px), outputs on the right edge.
  const top = isControl ? 26 : 94 + i * 19;
  const x = dir === "out" ? (isControl ? 118 : NODE_W) : (isControl ? 0 : 24);
  return { x: n.x + x, y: n.y + top };
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

/**
 * §V11.5 hit geometry — generous, honest hit targets.
 *
 * The Meridian pass made the canvas FEEL right: edges are grabbable within 14px of their
 * control segment (not just on the 2px stroke), node rects come in exactly two sizes
 * (normal 46×32, small 28×20 — the minimap draws the same rects, so map and canvas agree),
 * and the wire midpoint is computable so the dot lands on the curve, not on a chord.
 */
export const NODE_RECT = { normal: { w: 46, h: 32 }, small: { w: 28, h: 20 } };

/** The node's hit rectangle. Control nodes draw small; everything else normal. */
export function nodeHitRect(n: { definitionId: string }, small = n.definitionId.startsWith("control.")): { x: number; y: number; w: number; h: number } {
  const { w, h } = small ? NODE_RECT.small : NODE_RECT.normal;
  return { x: 0, y: 0, w, h };
}

/** Point-to-segment distance, the primitive under the edge hit test. */
export function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const ex = a.x + t * dx;
  const ey = a.y + t * dy;
  return Math.hypot(p.x - ex, p.y - ey);
}

/**
 * Is the point within `radius` (default 14) of the wire's control segment?
 * The bezier bows horizontally, so its straight-ish middle — the control segment between
 * (a.x+dx, a.y) and (b.x−dx, b.y) — is what the hand aims at. That is what we hit-test.
 */
export function isPointNearPath(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius = 14,
): boolean {
  const dx = Math.max(60, Math.abs(b.x - a.x) * 0.45);
  return distToSegment(p, { x: a.x + dx, y: a.y }, { x: b.x - dx, y: b.y }) <= radius;
}

/** The visual midpoint of a wire's bezier (t = 0.5) — where the midpoint dot is drawn. */
export function edgeMidpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  const dx = Math.max(60, Math.abs(b.x - a.x) * 0.45);
  const c1 = { x: a.x + dx, y: a.y };
  const c2 = { x: b.x - dx, y: b.y };
  const t = 0.5;
  const mt = 1 - t;
  return {
    x: mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x,
    y: mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y,
  };
}
