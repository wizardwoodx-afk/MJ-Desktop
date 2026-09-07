/**
 * §LAYOUT — a real layered (Sugiyama) engine for the MJ canvas (MJ 11.9.8).
 *
 * Researched grounding: the Eclipse ELK layered algorithm (Cycle Breaking → Layer Assignment →
 * Crossing Minimization → Node Placement → Edge Routing; LAYER_SWEEP = barycenter heuristic,
 * eclipse.dev/elk 2025), OGDF's SugiyamaLayout (LongestPathRanking + BarycenterHeuristic, runs=1
 * for deterministic behaviour, connected components arranged separately), and the classic
 * Sugiyama/Tagawa/Murata normalization with dummy vertices for long edges.
 *
 * What MJ ships is the dependency-free, DETERMINISTIC core of that pipeline:
 *   1. cycle breaking — greedy DFS back-edge reversal (MJ graphs are DAGs by construction;
 *      this is insurance for imported/hostile graphs, and reversed edges are counted, not hidden)
 *   2. layer assignment — longest-path ranking
 *   3. normalization — virtual nodes for edges spanning more than one layer
 *   4. crossing minimization — two-directional barycenter sweeps, fixed count, tie-breaks by
 *      id/position so the same graph ALWAYS lays out the same way
 *   5. coordinate assignment — layer columns left→right (the direction MJ flows), y from the
 *      minimized ordering with neighbour-centre smoothing that never breaks order or spacing
 *   6. connected components laid out independently and stacked with a gutter
 *
 * Pure: graph in → positions out. No DOM, no store, no randomness. Fully probe-able offline.
 */

export interface LayoutNode {
  id: string;
  w: number;
  h: number;
}

export interface LayoutInput {
  nodes: LayoutNode[];
  edges: Array<[string, string]>;
}

export interface LayoutOptions {
  /** horizontal gutter between layer columns */
  gapX?: number;
  /** vertical gutter between nodes in a layer */
  gapY?: number;
  /** gutter between disconnected components */
  componentGap?: number;
}

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  /** number of layer columns in the widest component */
  layers: number;
  /** crossings remaining after minimization (measured, across adjacent layer pairs) */
  crossings: number;
  /** edges reversed for cycle breaking (honest: MJ DAGs should keep this at 0) */
  reversedEdges: number;
  /** components found (each laid out and stacked) */
  components: number;
}

const DEFAULTS: Required<LayoutOptions> = { gapX: 120, gapY: 48, componentGap: 96 };

/** Undirected connected components, stable order (smallest first-seen id leads). */
function findComponents(ids: string[], edges: Array<[string, string]>): string[][] {
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [a, b] of edges) {
    if (adj.has(a) && adj.has(b) && a !== b) {
      adj.get(a)!.push(b);
      adj.get(b)!.push(a);
    }
  }
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const nx of adj.get(cur) ?? []) {
        if (!seen.has(nx)) {
          seen.add(nx);
          stack.push(nx);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

/** Greedy DFS cycle breaking: returns edges oriented acyclically + how many were flipped. */
function breakCycles(ids: string[], edges: Array<[string, string]>): { acyclic: Array<[string, string]>; reversed: number } {
  const out = new Map<string, Array<[string, number]>>(ids.map((id) => [id, []]));
  edges.forEach(([a, b], i) => {
    if (out.has(a) && out.has(b) && a !== b) out.get(a)!.push([b, i]);
  });
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(ids.map((id) => [id, WHITE]));
  const backEdges = new Set<number>();
  const dfs = (start: string) => {
    const stack: Array<[string, number]> = [[start, 0]];
    color.set(start, GRAY);
    while (stack.length) {
      const [cur, idx] = stack[stack.length - 1];
      const nbrs = out.get(cur) ?? [];
      if (idx < nbrs.length) {
        stack[stack.length - 1] = [cur, idx + 1];
        const [nx, edgeIdx] = nbrs[idx];
        const c = color.get(nx);
        if (c === GRAY) backEdges.add(edgeIdx);
        else if (c === WHITE) {
          color.set(nx, GRAY);
          stack.push([nx, 0]);
        }
      } else {
        color.set(cur, BLACK);
        stack.pop();
      }
    }
  };
  for (const id of ids) if (color.get(id) === WHITE) dfs(id);
  const acyclic = edges.map(([a, b], i) => (backEdges.has(i) ? ([b, a] as [string, string]) : ([a, b] as [string, string])));
  return { acyclic, reversed: backEdges.size };
}

/** Longest-path layering over an acyclic edge set. */
function longestPathLayers(ids: string[], edges: Array<[string, string]>): Map<string, number> {
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [a, b] of edges) {
    if (indeg.has(a) && indeg.has(b)) {
      out.get(a)!.push(b);
      indeg.set(b, (indeg.get(b) ?? 0) + 1);
    }
  }
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const remaining = new Map(indeg);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nx of out.get(cur) ?? []) {
      layer.set(nx, Math.max(layer.get(nx) ?? 0, (layer.get(cur) ?? 0) + 1));
      remaining.set(nx, (remaining.get(nx) ?? 0) - 1);
      if ((remaining.get(nx) ?? 0) === 0) queue.push(nx);
    }
  }
  return layer;
}

interface Slot {
  id: string;
  virtual: boolean;
}

/** Count crossings between two adjacent layers given endpoint order indices. */
export function countCrossings(upper: number[], lower: number[]): number {
  const pairs = upper.map((u, i) => [u, lower[i]] as [number, number]);
  let c = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [u1, l1] = pairs[i];
      const [u2, l2] = pairs[j];
      if ((u1 < u2 && l1 > l2) || (u1 > u2 && l1 < l2)) c += 1;
    }
  }
  return c;
}

interface ComponentLayout {
  positions: Map<string, { x: number; y: number }>;
  layers: number;
  crossings: number;
  reversed: number;
  width: number;
  height: number;
}

function layoutComponent(
  ids: string[],
  nodeById: Map<string, LayoutNode>,
  allEdges: Array<[string, string]>,
  o: Required<LayoutOptions>,
): ComponentLayout {
  const idSet = new Set(ids);
  const rawEdges = allEdges.filter(([a, b]) => idSet.has(a) && idSet.has(b) && a !== b);
  const { acyclic, reversed } = breakCycles(ids, rawEdges);
  const layerOf = longestPathLayers(ids, acyclic);

  /* normalization: virtual slots for long edges */
  const layers: Slot[][] = [];
  const layerIndex = new Map<string, number>();
  const ensureLayer = (i: number) => {
    while (layers.length <= i) layers.push([]);
  };
  for (const id of ids) {
    const li = layerOf.get(id) ?? 0;
    ensureLayer(li);
    layers[li].push({ id, virtual: false });
    layerIndex.set(id, li);
  }
  const virtualEdges: Array<[string, string]> = [];
  let vseq = 0;
  for (const [a, b] of acyclic) {
    const la = layerOf.get(a) ?? 0;
    const lb = layerOf.get(b) ?? 0;
    if (lb - la <= 1) {
      virtualEdges.push([a, b]);
      continue;
    }
    let prev = a;
    for (let li = la + 1; li < lb; li++) {
      const vid = `__virtual_${vseq++}`;
      ensureLayer(li);
      layers[li].push({ id: vid, virtual: true });
      layerIndex.set(vid, li);
      virtualEdges.push([prev, vid]);
      prev = vid;
    }
    virtualEdges.push([prev, b]);
  }

  /* barycenter sweeps — deterministic: fixed iterations, stable tie-break by current index */
  const posInLayer = () => {
    const pos = new Map<string, number>();
    layers.forEach((layer) => layer.forEach((s, i) => pos.set(s.id, i)));
    return pos;
  };
  const neighboursOf = new Map<string, string[]>();
  for (const [a, b] of virtualEdges) {
    if (!neighboursOf.has(a)) neighboursOf.set(a, []);
    if (!neighboursOf.has(b)) neighboursOf.set(b, []);
    neighboursOf.get(a)!.push(b);
    neighboursOf.get(b)!.push(a);
  }
  const SWEEPS = 4;
  for (let s = 0; s < SWEEPS * 2; s++) {
    const down = s % 2 === 0;
    const order = down ? layers.map((_, i) => i) : layers.map((_, i) => layers.length - 1 - i);
    for (const li of order.slice(1)) {
      const fixedLayer = layers[li + (down ? -1 : 1)];
      const fixedPos = new Map(fixedLayer.map((slot, i) => [slot.id, i]));
      const bary = new Map<string, number>();
      for (const slot of layers[li]) {
        const ns = (neighboursOf.get(slot.id) ?? []).filter((n) => fixedPos.has(n));
        if (ns.length > 0) bary.set(slot.id, ns.reduce((acc, n) => acc + (fixedPos.get(n) ?? 0), 0) / ns.length);
      }
      layers[li]
        .map((slot, i) => ({ slot, i }))
        .sort((x, y) => {
          const bx = bary.has(x.slot.id) ? bary.get(x.slot.id)! : x.i;
          const by = bary.has(y.slot.id) ? bary.get(y.slot.id)! : y.i;
          return bx !== by ? bx - by : x.i - y.i;
        })
        .forEach((entry, i) => {
          layers[li][i] = entry.slot;
        });
    }
  }

  /* measured crossings after minimization (real-adjacent layer pairs, virtual slots included) */
  const pos = posInLayer();
  let crossings = 0;
  for (let li = 0; li + 1 < layers.length; li++) {
    const upperIdx: number[] = [];
    const lowerIdx: number[] = [];
    for (const [a, b] of virtualEdges) {
      if ((layerIndex.get(a) ?? -1) === li && (layerIndex.get(b) ?? -1) === li + 1) {
        upperIdx.push(pos.get(a) ?? 0);
        lowerIdx.push(pos.get(b) ?? 0);
      }
    }
    crossings += countCrossings(upperIdx, lowerIdx);
  }

  /* coordinates: columns flow left→right; y stacks by minimized order, smoothed to neighbours */
  const colX: number[] = [];
  let x = 0;
  for (let li = 0; li < layers.length; li++) {
    colX.push(x);
    const w = Math.max(140, ...layers[li].filter((sl) => !sl.virtual).map((sl) => nodeById.get(sl.id)?.w ?? 264));
    x += w + o.gapX;
  }
  const heightOf = (slot: Slot) => (slot.virtual ? 8 : nodeById.get(slot.id)?.h ?? 120);
  const yOf = new Map<string, number>();
  layers.forEach((layer) => {
    let y = 0;
    for (const slot of layer) {
      yOf.set(slot.id, y);
      y += heightOf(slot) + o.gapY;
    }
  });
  /* smoothing: pull y toward neighbour centres — ORDER IS SACRED (it encodes the crossing
     minimum); only coordinates move, and the stack constraint keeps the minimum spacing. */
  for (let pass = 0; pass < 2; pass++) {
    for (let li = 0; li < layers.length; li++) {
      let prevBottom = 0;
      for (const slot of layers[li]) {
        const ns = (neighboursOf.get(slot.id) ?? []).filter((n) => yOf.has(n));
        const current = yOf.get(slot.id) ?? 0;
        const target = ns.length > 0 ? ns.reduce((acc, n) => acc + (yOf.get(n) ?? 0), 0) / ns.length : current;
        const want = Math.max(0, target - heightOf(slot) / 2);
        const yy = Math.max(want, prevBottom);
        yOf.set(slot.id, yy);
        prevBottom = yy + heightOf(slot) + o.gapY;
      }
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  let width = 0;
  let height = 0;
  layers.forEach((layer, li) => {
    for (const slot of layer) {
      if (slot.virtual) continue;
      const n = nodeById.get(slot.id);
      const px = colX[li];
      const py = yOf.get(slot.id) ?? 0;
      positions.set(slot.id, { x: px, y: py });
      width = Math.max(width, px + (n?.w ?? 264));
      height = Math.max(height, py + (n?.h ?? 120));
    }
  });

  return { positions, layers: layers.length, crossings, reversed, width, height };
}

/** The public engine: lay out a whole graph, component by component, stacked with a gutter. */
export function layeredLayout(input: LayoutInput, opts: LayoutOptions = {}): LayoutResult {
  const o = { ...DEFAULTS, ...opts };
  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));
  const comps = findComponents(input.nodes.map((n) => n.id), input.edges);
  const positions = new Map<string, { x: number; y: number }>();
  let yOffset = 0;
  let maxLayers = 0;
  let totalCrossings = 0;
  let totalReversed = 0;
  for (const comp of comps) {
    const r = layoutComponent(comp, nodeById, input.edges, o);
    for (const [id, p] of r.positions) positions.set(id, { x: p.x, y: p.y + yOffset });
    yOffset += r.height + o.componentGap;
    maxLayers = Math.max(maxLayers, r.layers);
    totalCrossings += r.crossings;
    totalReversed += r.reversed;
  }
  return { positions, layers: maxLayers, crossings: totalCrossings, reversedEdges: totalReversed, components: comps.length };
}
