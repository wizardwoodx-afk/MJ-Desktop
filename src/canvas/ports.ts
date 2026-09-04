/**
 * Port anchor geometry, measured from the DOM.
 *
 * V8 fix (bug X). Wires used to be anchored by a hard-coded model of the card:
 *
 *     top = 86 + portIndex * 19 + 10
 *
 * That model assumed a fixed header height and no optional content. In reality the card contains
 * `purpose-preview` (min-height 15px, max-height 36px — so it grows when the text wraps) and
 * `stream-preview` (up to ~50px, which appears and disappears as the node runs). Both sit ABOVE the
 * port grid, so every wire below them drifted — by ~10px at rest, by ~30px on a wrapped description,
 * and by ~70px while the node was streaming. The wire visibly detached from the port.
 *
 * There is no correct constant. The only truthful source is the rendered position of the anchor
 * element itself, so that is what we read.
 */

/** Local position of a port anchor's centre, relative to its node card's top-left, unscaled. */
export interface PortPoint {
  x: number;
  y: number;
}

export const portRegistry = new Map<string, HTMLElement>();

export function registerPortAnchor(key: string | null, el: HTMLElement | null) {
  if (key && el) portRegistry.set(key, el);
  else if (key) portRegistry.delete(key);
}

/**
 * Local (unscaled) position of a port anchor's centre within its node card.
 *
 * 11.9 (bug fix): the old implementation walked `offsetTop` up the offsetParent chain and added
 * `el.offsetHeight / 2`. That is wrong here because the anchor is absolutely positioned with
 * `top: 50%; translateY(-50%)` — its layout-box top is not its visual centre, so every measured
 * port drifted ~6px down (and the drift grew for each row below the first), which is exactly why
 * wires detached from the ports the user could see.
 *
 * The truthful source is the rendered bounding box: (anchorRect − cardRect). Both are in the same
 * (zoomed) screen space, so the difference is the *world* offset once divided by the canvas zoom.
 * The wires layer and the node cards share the same transform, so the same unscaled offset applies
 * to both — no double-scaling, no constant guesswork, and it stays correct however the card grows
 * or the description wraps.
 */
function offsetWithinCard(el: HTMLElement): { x: number; y: number } | null {
  const card = offsetParentCard(el);
  if (!card) return null;
  const er = el.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  const zoom = canvasZoom(card);
  return {
    x: (er.left + er.width / 2 - cr.left) / zoom,
    y: (er.top + er.height / 2 - cr.top) / zoom,
  };
}

/** The nearest `.node-card` ancestor, or null. */
function offsetParentCard(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (cur.classList.contains("node-card")) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/** The canvas zoom from the node's own layer transform (nodes and wires share it). */
function canvasZoom(card: HTMLElement): number {
  const layer = card.closest(".nodes-layer") as HTMLElement | null;
  if (!layer) return 1;
  const t = getComputedStyle(layer).transform;
  if (!t || t === "none") return 1;
  const m = t.match(/matrix\(([^)]+)\)/);
  return m ? parseFloat(m[1].split(",")[0]) || 1 : 1;
}

/** Measure one port anchor. Returns null if it is not mounted yet. */
export function measurePort(nodeId: string, portId: string, dir: "in" | "out"): PortPoint | null {
  const el = portRegistry.get(`${nodeId}:${dir}:${portId}`);
  if (!el) return null;
  return offsetWithinCard(el);
}

/** Measured card height, so marquee selection and fit-to-view stop guessing too. */
export function measureCardHeight(nodeId: string): number | null {
  const el = document.querySelector<HTMLElement>(`.node-card[data-node-id="${cssEscape(nodeId)}"]`);
  return el ? el.offsetHeight : null;
}

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
}

/**
 * Port metrics invalidation bus (V11.2).
 *
 * The wire layer's geometry depends on DOM measurements (card height, anchor offsets), so it has
 * to re-derive them when the DOM changes — a node's status flips and the `stream-preview` appears
 * or disappears, a description wraps to a new line, fonts load and change every row height.
 * Relying on React's memo deps for this was the original bug X regression: the memo re-ran, but
 * the values it read were stale, because nothing told the graph that the DOM had moved.
 *
 * Components that DRAW wires subscribe; components that KNOW (NodeCard's ResizeObserver, port ref
 * callbacks, runtime status effects) publish. `invalidatePortMetrics()` is cheap: it bumps a
 * version counter and subscribers re-read whatever they need on the next draw.
 */
let metricsVersion = 0;
const metricsListeners = new Set<() => void>();

export function getMetricsVersion(): number {
  return metricsVersion;
}

export function subscribePortMetrics(fn: () => void): () => void {
  metricsListeners.add(fn);
  return () => {
    metricsListeners.delete(fn);
  };
}

export function invalidatePortMetrics(): void {
  metricsVersion += 1;
  for (const fn of metricsListeners) fn();
}
