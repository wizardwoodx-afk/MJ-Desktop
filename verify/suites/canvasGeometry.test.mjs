import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/canvasGeometry.test.ts
import * as fs from "node:fs";
import * as path from "node:path";

// src/canvas/geometry.ts
var NODE_W = 264;
function nodeH(n) {
  const ports = Math.max(n.inputs.length, n.outputs.length);
  const isControl = n.definitionId.startsWith("control.");
  return isControl ? 52 : 85 + ports * 19;
}
function portPos(n, portId, dir, metrics) {
  const local = metrics?.get(n.id)?.ports.get(`${dir}:${portId}`);
  if (local) return { x: n.x + local.x, y: n.y + local.y };
  const list = dir === "in" ? n.inputs : n.outputs;
  const i = Math.max(0, list.findIndex((p) => p.id === portId));
  const isControl = n.definitionId.startsWith("control.");
  const top = isControl ? 26 : 94 + i * 19;
  const x = dir === "out" ? isControl ? 118 : NODE_W : isControl ? 0 : 24;
  return { x: n.x + x, y: n.y + top };
}
function bezier(a2, b) {
  const dx = Math.max(60, Math.abs(b.x - a2.x) * 0.45);
  return `M ${a2.x} ${a2.y} C ${a2.x + dx} ${a2.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}
var ZOOM_MIN = 0.2;
var ZOOM_MAX = 2.4;
function zoomAt(vp, cursor, deltaY, deltaMode = 0) {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
  const factor = Math.exp(-deltaY * unit * 22e-4);
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vp.zoom * factor));
  const k = zoom / vp.zoom;
  return { zoom, x: cursor.x - (cursor.x - vp.x) * k, y: cursor.y - (cursor.y - vp.y) * k };
}
var NODE_RECT = { normal: { w: 46, h: 32 }, small: { w: 28, h: 20 } };
function nodeHitRect(n, small = n.definitionId.startsWith("control.")) {
  const { w, h } = small ? NODE_RECT.small : NODE_RECT.normal;
  return { x: 0, y: 0, w, h };
}
function distToSegment(p, a2, b) {
  const dx = b.x - a2.x;
  const dy = b.y - a2.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a2.x) * dx + (p.y - a2.y) * dy) / len2));
  const ex = a2.x + t * dx;
  const ey = a2.y + t * dy;
  return Math.hypot(p.x - ex, p.y - ey);
}
function isPointNearPath(p, a2, b, radius = 14) {
  const dx = Math.max(60, Math.abs(b.x - a2.x) * 0.45);
  return distToSegment(p, { x: a2.x + dx, y: a2.y }, { x: b.x - dx, y: b.y }) <= radius;
}
function edgeMidpoint(a2, b) {
  const dx = Math.max(60, Math.abs(b.x - a2.x) * 0.45);
  const c1 = { x: a2.x + dx, y: a2.y };
  const c2 = { x: b.x - dx, y: b.y };
  const t = 0.5;
  const mt = 1 - t;
  return {
    x: mt * mt * mt * a2.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x,
    y: mt * mt * mt * a2.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y
  };
}

// src/canvas/ports.ts
var portRegistry = /* @__PURE__ */ new Map();
function registerPortAnchor(key, el) {
  if (key && el) portRegistry.set(key, el);
  else if (key) portRegistry.delete(key);
}
function offsetWithinCard(el) {
  const card = offsetParentCard(el);
  if (!card) return null;
  const er = el.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  const zoom = canvasZoom(card);
  return {
    x: (er.left + er.width / 2 - cr.left) / zoom,
    y: (er.top + er.height / 2 - cr.top) / zoom
  };
}
function offsetParentCard(el) {
  let cur = el;
  while (cur) {
    if (cur.classList.contains("node-card")) return cur;
    cur = cur.parentElement;
  }
  return null;
}
function canvasZoom(card) {
  const layer2 = card.closest(".nodes-layer");
  if (!layer2) return 1;
  const t = getComputedStyle(layer2).transform;
  if (!t || t === "none") return 1;
  const m = t.match(/matrix\(([^)]+)\)/);
  return m ? parseFloat(m[1].split(",")[0]) || 1 : 1;
}
function measurePort(nodeId, portId, dir) {
  const el = portRegistry.get(`${nodeId}:${dir}:${portId}`);
  if (!el) return null;
  return offsetWithinCard(el);
}

// probe/canvasGeometry.test.ts
var pass = 0;
var fail = 0;
var ok = (c, m) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};
var near = (a2, b, m, tol = 0.51) => ok(Math.abs(a2 - b) <= tol, `${m} \u2014 expected ${b}, got ${a2}`);
function port(id, dataType = "text") {
  return { id, label: id, dataType };
}
function node(id, inputs, outputs, definitionId = "agent.coder", x = 400, y = 300) {
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
    config: {}
  };
}
console.log("\n== bug Y: the wheel must zoom, anchored at the cursor ==\n");
{
  const before = { x: 0, y: 0, zoom: 1 };
  const after = zoomAt(before, { x: 500, y: 300 }, -100, 0);
  ok(after.zoom > before.zoom, `scroll up must zoom in, got ${after.zoom}`);
  const down = zoomAt(before, { x: 500, y: 300 }, 100, 0);
  ok(down.zoom < before.zoom, `scroll down must zoom out, got ${down.zoom}`);
}
{
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
  ok(zoomAt({ x: 0, y: 0, zoom: 2.3 }, { x: 0, y: 0 }, -5e3, 0).zoom <= 2.4, "must clamp at the max");
  ok(zoomAt({ x: 0, y: 0, zoom: 0.25 }, { x: 0, y: 0 }, 5e3, 0).zoom >= 0.2, "must clamp at the min");
  const px = zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, -100, 0).zoom;
  const lines = zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, -100, 1).zoom;
  ok(lines > px, `deltaMode=1 must normalise upward (lines ${lines} vs pixels ${px})`);
  ok(Number.isFinite(lines) && lines <= 2.4, "normalised line mode must stay inside the clamp");
}
console.log("\n== bug X: a wire must land on the port, whatever the card grew into ==\n");
var ZOOM = 1;
var layer = {
  parentElement: null,
  classList: { contains: () => false },
  closest: (sel) => sel === ".nodes-layer" ? layer : null,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 })
};
var origGetComputedStyle = globalThis.getComputedStyle;
globalThis.getComputedStyle = (el) => {
  const t = el === layer ? `matrix(${ZOOM},0,0,${ZOOM},0,0)` : "none";
  return { transform: t };
};
function box(x, y, w, h) {
  return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
}
function makeEl(parent, isCard = false) {
  const e = {
    parentElement: parent,
    classList: { contains: (c) => isCard ? c === "node-card" : false },
    getBoundingClientRect: () => box(0, 0, 0, 0),
    closest: (sel) => sel === ".nodes-layer" ? layer : null,
    // offset* fields are retained so this keeps compiling as an HTMLElement, but they are
    // deliberately NOT measured any more — boxes are the truth.
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    offsetParent: null
  };
  return e;
}
function fakeAnchor(opts) {
  const cardW = opts.cardW ?? NODE_W;
  const cardH = opts.cardH ?? opts.aboveGrid + 5 + opts.index * 19 + 26;
  const localY = opts.aboveGrid + 5 + opts.index * 19 + 9.5;
  const localX = opts.dir === "in" ? -0.5 : cardW;
  const card = makeEl(layer, true);
  card.getBoundingClientRect = () => box(opts.cardLeft, opts.cardTop, cardW, cardH);
  const grid = makeEl(card);
  const col = makeEl(grid);
  const row = makeEl(col);
  const anchor = makeEl(row);
  anchor.getBoundingClientRect = () => {
    const cx = opts.cardLeft + localX;
    const cy = opts.cardTop + localY;
    return box(cx - 6, cy - 6, 12, 12);
  };
  return anchor;
}
function metricsFor(n, aboveGrid) {
  const cardW = NODE_W;
  const ports = /* @__PURE__ */ new Map();
  const rows = Math.max(n.inputs.length, n.outputs.length);
  const cardH = aboveGrid + 5 + rows * 19 + 7;
  n.inputs.forEach((p, i) => {
    registerPortAnchor(`${n.id}:in:${p.id}`, fakeAnchor({
      nodeId: n.id,
      dir: "in",
      portId: p.id,
      index: i,
      aboveGrid,
      cardLeft: n.x,
      cardTop: n.y,
      cardW,
      cardH
    }));
    const m = measurePort(n.id, p.id, "in");
    if (m) ports.set(`in:${p.id}`, m);
  });
  n.outputs.forEach((p, i) => {
    registerPortAnchor(`${n.id}:out:${p.id}`, fakeAnchor({
      nodeId: n.id,
      dir: "out",
      portId: p.id,
      index: i,
      aboveGrid,
      cardLeft: n.x,
      cardTop: n.y,
      cardW,
      cardH
    }));
    const m = measurePort(n.id, p.id, "out");
    if (m) ports.set(`out:${p.id}`, m);
  });
  return /* @__PURE__ */ new Map([[n.id, { ports, h: cardH }]]);
}
var a = node("coder", [port("brief"), port("context")], [port("code"), port("notes")]);
{
  const m = metricsFor(a, 61);
  const p0 = portPos(a, "brief", "in", m);
  near(p0.y, 300 + 61 + 5 + 0 * 19 + 9.5, "first input port tracks the measured grid position");
  const p1 = portPos(a, "context", "in", m);
  near(p1.y - p0.y, 19, "port rows are 19px apart");
}
{
  const short = metricsFor(a, 61);
  const wrapped = metricsFor(a, 82);
  const before = portPos(a, "code", "out", short);
  const after = portPos(a, "code", "out", wrapped);
  near(after.y - before.y, 21, "a wrapped description moves the wire with the port");
  ok(Math.abs(after.y - before.y) > 20, "the old hard-coded model would have left the wire 21px behind");
}
{
  const rest = metricsFor(a, 61);
  const streaming = metricsFor(a, 111);
  const before = portPos(a, "code", "out", rest);
  const after = portPos(a, "code", "out", streaming);
  near(after.y - before.y, 50, "a stream preview appearing mid-run moves the wire with the port");
}
{
  const m = metricsFor(a, 61);
  const inp = portPos(a, "brief", "in", m);
  const out = portPos(a, "code", "out", m);
  near(inp.x, a.x - 0.5, "input anchors sit on the card's left edge");
  near(inp.x, a.x - 0.5, "input anchors are centred on the card's left edge");
  ok(out.x > a.x + NODE_W - 20, `output anchors sit on the card's right edge, got ${out.x - a.x} of ${NODE_W}`);
}
{
  const p = portPos(a, "brief", "in");
  ok(Number.isFinite(p.x) && Number.isFinite(p.y), "the pre-mount fallback must be finite");
  near(p.y, 300 + 94, "the fallback tracks the measured first-port offset (~94px between the card top and the first port row)");
  const ghost = portPos(a, "does-not-exist", "in");
  ok(Number.isFinite(ghost.y), "an unknown port must not produce NaN");
}
{
  portRegistry.delete(`${a.id}:in:brief`);
  ok(measurePort(a.id, "brief", "in") === null, "an unregistered anchor measures as null, not zero");
}
{
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
  const back = bezier({ x: 400, y: 0 }, { x: 0, y: 0 });
  const [, ctrl] = back.split("C ");
  const [c1, c2] = ctrl.split(", ");
  const c1x = Number(c1.split(" ")[0]);
  const c2x = Number(c2.split(" ")[0]);
  ok(c1x > 400, `the first control point must bow past the source, got ${c1x}`);
  ok(c2x < 0, `the second must bow past the target, got ${c2x}`);
  const tiny = bezier({ x: 0, y: 0 }, { x: 10, y: 0 });
  ok(tiny.includes("C 60"), `a short wire keeps the minimum bow, got ${tiny}`);
}
console.log("\n== the Canvas component uses the fixes, not just the helpers ==\n");
{
  const src = fs.readFileSync(path.join(process.cwd(), "src/canvas/Canvas.tsx"), "utf8");
  ok(/import \{[\s\S]*?zoomAt[\s\S]*?\} from "\.\/geometry"/.test(src), "Canvas imports zoomAt from geometry.ts");
  ok(/setViewport\(zoomAt\(vpNow, cursor, e\.deltaY, e\.deltaMode\)\)/.test(src), "plain wheel calls zoomAt \u2014 cursor-anchored zoom");
  ok(!/setViewport\(\{ x: vpNow\.x - e\.deltaX, y: vpNow\.y - e\.deltaY \}\)/.test(src), "the old pan-on-plain-wheel branch is gone");
  ok(/onWheelNative[\s\S]*?addEventListener\("wheel", onWheelNative, \{ passive: false \}\)/.test(src), "the wheel listener is native non-passive (preventDefault works)");
  ok(/registerPortAnchor\(`\$\{node\.id\}:in:\$\{p\.id\}`/.test(src), "input anchors register with the measured registry (bug X)");
  ok(/registerPortAnchor\(`\$\{node\.id\}:out:\$\{p\.id\}`/.test(src), "output anchors register with the measured registry");
  ok(/geomPortPos\(sn, c\.sourcePortId, "out", metrics\)/.test(src), "wires are drawn from measured port geometry");
  ok(/invalidatePortMetrics\(\)/.test(src), "DOM invalidation reaches the wire layer");
  ok(/data-node-id=\{node\.id\}/.test(src), "cards expose data-node-id for measureCardHeight");
  ok(/useSyncExternalStore\(subscribePortMetrics, getMetricsVersion\)/.test(src), "the wire layer re-renders when the DOM invalidates");
  ok(/new ResizeObserver\(\(\) => invalidatePortMetrics\(\)\)/.test(src), "card reflow re-measures the wires");
  ok(/onHoverPort\(/.test(src), "the ghost wire snaps to a hovered valid input");
}
console.log("\n== V11.5: normal/small node rects, 14px edge corridor, on-curve midpoints ==\n");
{
  const small = nodeHitRect(node("n1", [], [], "control.split"), true);
  const normal = nodeHitRect(node("n2", [], [], "agent.coder"), false);
  near(small.w, 28, "small rect width is 28");
  near(small.h, 20, "small rect height is 20");
  near(normal.w, 46, "normal rect width is 46");
  near(normal.h, 32, "normal rect height is 32");
  const autoSmall = nodeHitRect(node("n3", [], [], "control.loop"));
  const autoNormal = nodeHitRect(node("n4", [], [], "agent.tester"));
  near(autoSmall.w, 28, "control nodes default to the small rect");
  near(autoNormal.w, 46, "agent nodes default to the normal rect");
}
{
  const a2 = { x: 100, y: 100 };
  const b = { x: 500, y: 140 };
  const dx = Math.max(60, Math.abs(b.x - a2.x) * 0.45);
  ok(isPointNearPath({ x: (a2.x + dx + b.x - dx) / 2, y: 120 }, a2, b), "a point on the control corridor is a hit");
  ok(!isPointNearPath({ x: 300, y: 400 }, a2, b), "a point 280px off the wire is not a hit");
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
console.log(`
${pass} passed, ${fail} failed
`);
process.exit(fail ? 1 : 0);
