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
 * Sum `offsetLeft`/`offsetTop` up to (but excluding) the node card.
 *
 * These are layout values, so they are unaffected by the canvas zoom transform — which is what we
 * want, because the wires layer is scaled by that same transform. Using getBoundingClientRect here
 * would bake the zoom in twice.
 */
function offsetWithinCard(el: HTMLElement): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = el;
  while (cur && !cur.classList.contains("node-card")) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    const parent = cur.offsetParent as HTMLElement | null;
    if (!parent || parent === cur) return null;
    cur = parent;
  }
  if (!cur) return null;
  // The anchor is centred on the row via `top: 50%; translateY(-50%)`, so its layout box top is
  // where it renders. Add half its own height to land on the visible centre of the dot.
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
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
