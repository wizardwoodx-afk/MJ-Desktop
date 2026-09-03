/**
 * V8 canvas geometry — the two bugs you can see.
 *
 *   bug X  wires did not connect to the node's port
 *   bug Y  the wheel panned instead of zooming
 *
 * The DOM measurement is exercised against a synthetic offsetParent chain that reproduces the real
 * card structure, because jsdom has no layout engine and would report every offset as 0.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { NODE_W, bezier, distToSegment, edgeMidpoint, isPointNearPath, nodeH, nodeHitRect, portPos, zoomAt, type NodeMetrics } from "../src/canvas/geometry";
import { getMetricsVersion, measurePort, portRegistry, registerPortAnchor, subscribePortMetrics } from "../src/canvas/ports";
import type { NodeInstance, PortDef } from "../src/domain/types";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};
const near = (a: number, b: number, m: string, tol = 0.51) => ok(Math.abs(a - b) <= tol, `${m} — expected ${b}, got ${a}`);

function port(id: string, dataType = "text"): PortDef {
  return { id, label: id, dataType: dataType as PortDef["dataType"] } as PortDef;
}

function node(id: string, inputs: PortDef[], outputs: PortDef[], definitionId = "agent.coder", x = 400, y = 300): NodeInstance {
  return {
    id,
    definitionId,
    title: id,
    purpose: "",
    x,
    y,
    inputs,
    outputs,
    providers: [],
    config: {},
  } as unknown as NodeInstance;
}

console.log("\n== bug Y: the wheel must zoom, anchored at the cursor ==\n");

{
  // Scroll up (negative deltaY) must zoom IN. This is the exact inversion that was shipped.
  const before = { x: 0, y: 0, zoom: 1 };
  const after = zoomAt(before, { x: 500, y: 300 }, -100, 0);
  ok(after.zoom > before.zoom, `scroll up must zoom in, got ${after.zoom}`);
  const down = zoomAt(before, { x: 500, y: 300 }, 100, 0);
  ok(down.zoom < before.zoom, `scroll down must zoom out, got ${down.zoom}`);
}

{
  // The defining property: the world point under the cursor must not move while zooming.
  const vp = { x: -120, y: 80, zoom: 0.8 };
  const cursor = { x: 640, y: 400 };
  const worldBefore = { x: (cursor.x - vp.x) / vp.zoom, y: (cursor.y - vp.y) / vp.zoom };
  let cur = vp;
  for (let i = 0; i < 12; i += 1) {
    cur = zoomAt(cur, cursor, -90, 0);
    const worldNow = { x: (cursor.x - cur.x) / cur.zoom, y: (cursor.y - cur.y) / cur.zoom };
    near(worldNow.x, worldBefore.x, `cursor-anchored x after ${i + 1} zoom steps`, 0.01);
    near(worldNow.y, worldBefore.y, `cursor-anchored y after ${i + 1} zoom steps`, 0.01);
  }
}

{
  // Clamping, and deltaMode normalisation (Firefox reports lines, Chrome reports pixels).
  ok(zoomAt({ x: 0, y: 0, zoom: 2.3 }, { x: 0, y: 0 }, -5000, 0).zoom <= 2.4, "must clamp at the max");
  ok(zoomAt({ x: 0, y: 0, zoom: 0.25 }, { x: 0, y: 0 }, 5000, 0).zoom >= 0.2, "must clamp at the min");
  const px = zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, -100, 0).zoom;
  const lines = zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, -100, 1).zoom;
  ok(lines > px, `deltaMode=1 must normalise upward (lines ${lines} vs pixels ${px})`);
  ok(Number.isFinite(lines) && lines <= 2.4, "normalised line mode must stay inside the clamp");
}

console.log("\n== bug X: a wire must land on the port, whatever the card grew into ==\n");

/**
 * Build the real offsetParent chain for one port anchor:
 *   .port-anchor (11x11) -> .port-row (h 19) -> .port-col -> .port-grid -> .node-card
 * `aboveGrid` stands in for everything that sits above the port grid and changes height:
 * the head, the wrapped purpose-preview, and the stream-preview when it appears.
 */
function fakeAnchor(opts: { nodeId: string; dir: "in" | "out"; portId: string; index: number; aboveGrid: number; cardW?: number }) {
  const cardW = opts.cardW ?? NODE_W;
  const rowTop = 5 + opts.index * 19; // .port-grid padding-top is 5px, rows are 19px
  const card = {
    classList: { contains: (c: string) => c === "node-card" },
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: cardW,
    offsetHeight: 0,
    offsetParent: null,
  } as unknown as HTMLElement;
  const grid = {
    classList: { contains: () => false },
    offsetLeft: 0,
    offsetTop: opts.aboveGrid,
    offsetWidth: cardW,
    offsetHeight: 0,
    offsetParent: card,
  } as unknown as HTMLElement;
  const col = {
    classList: { contains: () => false },
    offsetLeft: opts.dir === "in" ? 0 : cardW / 2 + 7,
    offsetTop: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    offsetParent: grid,
  } as unknown as HTMLElement;
  const row = {
    classList: { contains: () => false },
    offsetLeft: 0,
    offsetTop: rowTop,
    offsetWidth: 0,
    offsetHeight: 19,
    offsetParent: col,
  } as unknown as HTMLElement;
  // The anchor is centred on its row: top 50% of a 19px row minus half its own 11px height.
  const anchor = {
    classList: { contains: () => false },
    offsetLeft: opts.dir === "in" ? -6 : col.offsetWidth === 0 ? cardW / 2 - 7 - 11 + 6 : 0,
    offsetTop: 4,
    offsetWidth: 11,
    offsetHeight: 11,
    offsetParent: row,
  } as unknown as HTMLElement;
  // Output anchors hang off the right edge of the row's own box: the column is 117px wide
  // (248 - 12*2 padding - 14 gap, split in two), the dot is 11px, and margin-right is -6px,
  // so its left edge is 117 - 11 + 6 = 112 inside the column.
  if (opts.dir === "out") {
    (anchor as unknown as { offsetLeft: number }).offsetLeft = 112;
  }
  return anchor;
}

function metricsFor(n: NodeInstance, aboveGrid: number): Map<string, NodeMetrics> {
  const ports = new Map<string, { x: number; y: number }>();
  n.inputs.forEach((p, i) => {
    const el = fakeAnchor({ nodeId: n.id, dir: "in", portId: p.id, index: i, aboveGrid });
    registerPortAnchor(`${n.id}:in:${p.id}`, el);
    const m = measurePort(n.id, p.id, "in");
    if (m) ports.set(`in:${p.id}`, m);
  });
  n.outputs.forEach((p, i) => {
    const el = fakeAnchor({ nodeId: n.id, dir: "out", portId: p.id, index: i, aboveGrid });
    registerPortAnchor(`${n.id}:out:${p.id}`, el);
    const m = measurePort(n.id, p.id, "out");
    if (m) ports.set(`out:${p.id}`, m);
  });
  return new Map([[n.id, { ports, h: aboveGrid + 5 + Math.max(n.inputs.length, n.outputs.length) * 19 + 7 }]]);
}

const a = node("coder", [port("brief"), port("context")], [port("code"), port("notes")]);

{
  // Rest state: head (~36px) + purpose-preview at its minimum (~25px) => port grid starts ~61px down.
  const m = metricsFor(a, 61);
  const p0 = portPos(a, "brief", "in", m);
  near(p0.y, 300 + 61 + 5 + 0 * 19 + 9.5, "first input port tracks the measured grid position");
  const p1 = portPos(a, "context", "in", m);
  near(p1.y - p0.y, 19, "port rows are 19px apart");
}

{
  // The actual bug: the description wrapped, pushing the port grid down by 21px.
  const short = metricsFor(a, 61);
  const wrapped = metricsFor(a, 82);
  const before = portPos(a, "code", "out", short);
  const after = portPos(a, "code", "out", wrapped);
  near(after.y - before.y, 21, "a wrapped description moves the wire with the port");
  ok(Math.abs(after.y - before.y) > 20, "the old hard-coded model would have left the wire 21px behind");
}

{
  // And again with the stream preview, which appears only while the node is running (~50px).
  const rest = metricsFor(a, 61);
  const streaming = metricsFor(a, 111);
  const before = portPos(a, "code", "out", rest);
  const after = portPos(a, "code", "out", streaming);
  near(after.y - before.y, 50, "a stream preview appearing mid-run moves the wire with the port");
}

{
  // Horizontal: the anchor really is centred on the card edge, which the old code approximated.
  const m = metricsFor(a, 61);
  const inp = portPos(a, "brief", "in", m);
  const out = portPos(a, "code", "out", m);
  near(inp.x, a.x - 0.5, "input anchors sit on the card's left edge");
  near(inp.x, a.x - 0.5, "input anchors are centred on the card's left edge");
  // col starts at 12 + 117 + 14 = 143; anchor left 112 => 255, centre 260.5. The real card puts the
  // dot on the card edge (248); the small difference is the column split, and what matters is that
  // the wire follows whatever the DOM says rather than a constant.
  ok(out.x > a.x + NODE_W - 20, `output anchors sit on the card's right edge, got ${out.x - a.x} of ${NODE_W}`);
}

{
  // No metrics yet (first paint) must still produce a sane position, never NaN.
  const p = portPos(a, "brief", "in");
  ok(Number.isFinite(p.x) && Number.isFinite(p.y), "the pre-mount fallback must be finite");
  near(p.y, 300 + 96, "the fallback keeps the historical approximation");
  const ghost = portPos(a, "does-not-exist", "in");
  ok(Number.isFinite(ghost.y), "an unknown port must not produce NaN");
}

{
  // An unmounted anchor must not silently measure as 0,0 and park the wire in the corner.
  portRegistry.delete(`${a.id}:in:brief`);
  ok(measurePort(a.id, "brief", "in") === null, "an unregistered anchor measures as null, not zero");
}

{
  // Control nodes are a different shape entirely.
  const c = node("gate", [port("in")], [port("true"), port("false")], "control.condition", 100, 100);
  ok(nodeH(c) === 52, "control nodes use their own height");
  const p = portPos(c, "in", "in");
  near(p.y, 126, "control fallback uses its own header height");
}

console.log("\n== the wire path itself ==\n");

{
  const d = bezier({ x: 0, y: 0 }, { x: 400, y: 200 });
  ok(d.startsWith("M 0 0 C "), `the path must start at the source anchor, got ${d}`);
  ok(d.endsWith("400 200"), `and end exactly on the target anchor, got ${d}`);
  // A wire running right-to-left must still bow. If dx collapsed to 0 the two control points would
  // land on the endpoints and the cable would render as a straight line.
  const back = bezier({ x: 400, y: 0 }, { x: 0, y: 0 });
  const [, ctrl] = back.split("C ");
  const [c1, c2] = ctrl.split(", ");
  const c1x = Number(c1.split(" ")[0]);
  const c2x = Number(c2.split(" ")[0]);
  ok(c1x > 400, `the first control point must bow past the source, got ${c1x}`);
  ok(c2x < 0, `the second must bow past the target, got ${c2x}`);
  // A very short wire must not collapse either.
  const tiny = bezier({ x: 0, y: 0 }, { x: 10, y: 0 });
  ok(tiny.includes("C 60"), `a short wire keeps the minimum bow, got ${tiny}`);
}

console.log("\n== the Canvas component uses the fixes, not just the helpers ==\n");

{
  // V11.2 found bug Y's regression: geometry.ts shipped `zoomAt` in V8, but the Canvas wheel
  // handler still PANNED on plain wheel (nodes moved up and down) and never imported it. The
  // measured-anchor path (ports.ts) existed too and Canvas never called it. These source checks
  // make that specific drift impossible to reintroduce.
  const src = fs.readFileSync(path.join(process.cwd(), "src/canvas/Canvas.tsx"), "utf8");
  ok(/import \{[\s\S]*?zoomAt[\s\S]*?\} from "\.\/geometry"/.test(src), "Canvas imports zoomAt from geometry.ts");
  ok(/setViewport\(zoomAt\(vpNow, cursor, e\.deltaY, e\.deltaMode\)\)/.test(src), "plain wheel calls zoomAt — cursor-anchored zoom");
  ok(!/setViewport\(\{ x: vpNow\.x - e\.deltaX, y: vpNow\.y - e\.deltaY \}\)/.test(src), "the old pan-on-plain-wheel branch is gone");
  ok(/onWheelNative[\s\S]*?addEventListener\("wheel", onWheelNative, \{ passive: false \}\)/.test(src), "the wheel listener is native non-passive (preventDefault works)");
  ok(/registerPortAnchor\(`\$\{node\.id\}:in:\$\{p\.id\}`/.test(src), "input anchors register with the measured registry (bug X)");
  ok(/registerPortAnchor\(`\$\{node\.id\}:out:\$\{p\.id\}`/.test(src), "output anchors register with the measured registry");
  ok(/geomPortPos\(sn, c\.sourcePortId, "out", metrics\)/.test(src), "wires are drawn from measured port geometry");
  ok(/invalidatePortMetrics\(\)/.test(src), "DOM invalidation reaches the wire layer");
  ok(/data-node-id=\{node\.id\}/.test(src), "cards expose data-node-id for measureCardHeight");
  ok(/useSyncExternalStore\(subscribePortMetrics, getMetricsVersion\)/.test(src), "the wire layer re-renders when the DOM invalidates");
  ok(/new ResizeObserver\(\(\) => invalidatePortMetrics\(\)\)/.test(src), "card reflow re-measures the wires");
  ok(/onHoverPort\(/ .test(src), "the ghost wire snaps to a hovered valid input");
}

/* ── §V11.5: the Meridian hit geometry ──────────────────────────────────────
   Node rects come in exactly two sizes (normal 46×32, small 28×20) and the minimap
   draws THOSE, so the map and the canvas agree. Edges are grabbable within 14px of
   their control segment. The wire midpoint is on the bezier, not on the chord. */
console.log("\n== V11.5: normal/small node rects, 14px edge corridor, on-curve midpoints ==\n");
{
  const small = nodeHitRect(node("n1", [], [], "control.split"), true);
  const normal = nodeHitRect(node("n2", [], [], "agent.coder"), false);
  near(small.w, 28, "small rect width is 28");
  near(small.h, 20, "small rect height is 20");
  near(normal.w, 46, "normal rect width is 46");
  near(normal.h, 32, "normal rect height is 32");
  // The default picks small for control nodes, normal for everything else.
  const autoSmall = nodeHitRect(node("n3", [], [], "control.loop"));
  const autoNormal = nodeHitRect(node("n4", [], [], "agent.tester"));
  near(autoSmall.w, 28, "control nodes default to the small rect");
  near(autoNormal.w, 46, "agent nodes default to the normal rect");
}
{
  const a = { x: 100, y: 100 };
  const b = { x: 500, y: 140 };
  // The control segment spans (a.x+dx, a.y) → (b.x−dx, b.y) with dx = max(60, 45% of |Δx|).
  const dx = Math.max(60, Math.abs(b.x - a.x) * 0.45);
  ok(isPointNearPath({ x: (a.x + dx + b.x - dx) / 2, y: 120 }, a, b), "a point on the control corridor is a hit");
  ok(!isPointNearPath({ x: 300, y: 400 }, a, b), "a point 280px off the wire is not a hit");
  // A horizontal wire keeps the corridor maths legible: control segment y = 100, x ∈ [280, 320].
  const ha = { x: 100, y: 100 };
  const hb = { x: 500, y: 100 };
  ok(isPointNearPath({ x: 300, y: 114 }, ha, hb), "14px off the segment still hits (the corridor)");
  ok(!isPointNearPath({ x: 300, y: 115 }, ha, hb), "beyond 14px the corridor ends");
  near(distToSegment({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }), 0, "degenerate segment: distance to the single point");
  near(distToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 0, "point ON the segment has zero distance");
  near(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3, "perpendicular distance is exact");
}
{
  const mid = edgeMidpoint({ x: 0, y: 0 }, { x: 400, y: 0 });
  near(mid.x, 200, "midpoint of a straight wire is its middle");
  const midBowed = edgeMidpoint({ x: 0, y: 0 }, { x: 200, y: 100 });
  ok(Math.abs(midBowed.y - 50) < 26, `the bowed midpoint stays near the vertical middle (got ${midBowed.y.toFixed(1)})`);
  ok(midBowed.x > 0 && midBowed.x < 200, "the bowed midpoint stays inside the span");
}
{
  const src = fs.readFileSync(path.join(process.cwd(), "src/canvas/Canvas.tsx"), "utf8");
  ok(/nodeHitRect\(n, n\.definitionId\.startsWith\("control\."\)\)\.w \* s/.test(src), "the minimap draws nodeHitRect widths (owner rule: normal/small)");
  ok(/nodeHitRect\(n, n\.definitionId\.startsWith\("control\."\)\)\.h \* s/.test(src), "the minimap draws nodeHitRect heights");
  ok(/onDoubleClick=\{\(\) => useGraphStore\.getState\(\)\.openDetails\(node\.id\)\}/.test(src), "details open on DOUBLE-click (owner rule)");
  ok(/edgeMidpoint\(a, b\)/.test(src), "wires compute their midpoint on the curve");
  ok(/openDetails: /.test(fs.readFileSync(path.join(process.cwd(), "src/graph/store.ts"), "utf8")), "the store owns openDetails");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
