/**
 * §FUZZY — the palette's ranking brain.
 * Provenance: subsequence core shipped in MJ 11.9.5; the label-first composition
 * score (paletteScore) is the 11.9.6 review fix. Both facts stay true forever.
 *
 * Researched grounding: every keyboard-first tool (Raycast, Linear, VS Code) reduces to the same
 * machine — subsequence match + bonuses for word boundaries, runs, and prefix alignment — done
 * locally with zero dependencies. Pure, so the probe suite can pin the ranking behaviour.
 */

/**
 * Score `query` against `text`. Returns a NEGATIVE number when the query is not a subsequence
 * (i.e. no match at all); higher is better. Case-insensitive.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 + (10 - Math.min(10, t.length - q.length));

  let score = 0;
  let ti = 0;
  let prevFound = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    for (let i = ti; i < t.length; i++) {
      if (t[i] === ch) {
        found = i;
        break;
      }
    }
    if (found === -1) return -1; // not a subsequence → not a match
    const atWordStart = found === 0 || /[^a-z0-9]/i.test(t[found - 1]);
    score += atWordStart ? 24 : 8; // word-boundary bonus
    if (found === prevFound + 1) score += 10; // contiguous run bonus
    ti = found + 1;
    prevFound = found;
  }
  // shorter targets win ties — "run" should surface "Run workflow" above "Run and verify everything"
  score -= Math.min(30, Math.floor(t.length / 8));
  return score;
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/**
 * Palette composition score (11.9.6 review fix): the VISIBLE LABEL is primary. The group name
 * is only a damped recall hint (×0.35) for queries like "canvas" — it can surface a command the
 * label alone misses, but it can NEVER out-rank a real label match. Matches label-first ranking
 * in Raycast/Linear, where category text is chrome, not content.
 */
export function paletteScore(query: string, label: string, group?: string): number {
  const ls = fuzzyScore(query, label);
  if (ls >= 0) return ls + 1000; // label bucket — ALWAYS above any group-only hit
  const gs = group ? fuzzyScore(query, group) : -1;
  return gs >= 0 ? Math.floor(gs * 0.35) : -1; // group bucket — damped recall only
}

/** Rank items by fuzzy score against `label(item)`, dropping non-matches. Empty query keeps order. */
export function rankFuzzy<T>(items: T[], query: string, label: (t: T) => string): Ranked<T>[] {
  if (!query.trim()) return items.map((item) => ({ item, score: 0 }));
  const scored = items
    .map((item) => ({ item, score: fuzzyScore(query, label(item)) }))
    .filter((r) => r.score >= 0);
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
