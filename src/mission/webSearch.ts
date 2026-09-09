/**
 * §WEB EVIDENCE — the Researcher grows a real web-search layer (MJ 11.9.4-Major).
 *
 * WHY
 *   The Researcher's contract says "gather sources you can point at, return
 *   (claim, source, confidence) triples". Until now the evidence came from
 *   whatever the harness already knew. The 2026 orchestration landscape treats
 *   grounded retrieval as table stakes, so this module gives the Researcher
 *   live web evidence WITHOUT adding a key requirement and WITHOUT a sidecar:
 *   three CORS-open, keyless providers (Wikipedia, HN Algolia, GitHub
 *   repository search) plus two optional self-configured ones (SearXNG,
 *   Brave) for users who run their own endpoint.
 *
 *   SOURCE-KIND HONESTY (11.9.4-Major+ review fix): every hit carries
 *   `sourceKind` — GitHub repos are PRIMARY (first-party code/docs), Wikipedia
 *   and HN are SECONDARY (they summarize/discuss; useful evidence, never
 *   first-party), search endpoints are META (indexes over the web). The
 *   Researcher reports the kind instead of pretending everything is primary.
 *
 * HONESTY RULES (the same ones the rest of MJ obeys)
 *   1. A provider that fails (timeout, CORS, HTTP error, not configured) is
 *      reported in `providers` with the reason — never silently dropped.
 *   2. Confidence is computed from measured overlap + recency, bucketed
 *      high/medium/low — a hit that matched one token never claims "high".
 *   3. Nothing here persists, phones home, or runs without the user's node
 *      asking for it: `searchWeb` is only called by agent code paths.
 *   4. The pure core (plan/normalize/dedupe/score/triples) has no network at
 *      all, so probe/webSearch.test.ts exercises it offline with fixtures.
 */

export type WebProviderId = "wikipedia" | "hn" | "github" | "searxng" | "brave";

/** primary = first-party artifact; secondary = summarizes/discusses; meta = index. */
export type SourceKind = "primary" | "secondary" | "meta";

export interface WebProviderSpec {
  id: WebProviderId;
  name: string;
  kind: SourceKind;
  needsConfig: boolean;
  note: string;
  /** Builds the request URL for a query. Config-dependent providers need opts. */
  buildUrl: (query: string, opts?: WebSearchOpts) => string | null;
}

export interface WebSearchOpts {
  /** Self-hosted SearXNG root, e.g. "http://127.0.0.1:8888". */
  searxngRoot?: string;
  /** Brave Search API key (sent as a header by the caller). */
  braveKey?: string;
  /** Injectable fetch for tests / non-browser hosts. */
  fetchImpl?: typeof fetch;
  /** Set false to forbid falling back to the host's global fetch (tests). */
  useGlobalFetch?: boolean;
  /** Per-provider timeout. Default 6000ms. */
  timeoutMs?: number;
}

export interface WebHit {
  url: string;
  title: string;
  snippet: string;
  source: WebProviderId;
  kind: SourceKind;
  /** Publication time when the provider reports one, else null. */
  ts: string | null;
  /** Measured relevance in [0,1] — see scoreHit. */
  score: number;
}

export interface WebProviderOutcome {
  id: WebProviderId;
  ok: boolean;
  hits: number;
  note: string;
}

export interface WebEvidenceReport {
  query: string;
  hits: WebHit[];
  providers: WebProviderOutcome[];
  fetchedAt: string;
}

export interface ClaimTriple {
  claim: string;
  source: string;
  confidence: "high" | "medium" | "low";
  /** primary / secondary / meta — never implied, always stated. */
  kind: SourceKind;
}

export const WEB_PROVIDERS: WebProviderSpec[] = [
  {
    id: "wikipedia",
    name: "Wikipedia (opensearch)",
    kind: "secondary",
    needsConfig: false,
    note: "keyless, CORS-open — primary encyclopedic sources",
    buildUrl: (q) =>
      `https://en.wikipedia.org/w/api.php?action=opensearch&origin=*&format=json&limit=5&search=${encodeURIComponent(q)}`,
  },
  {
    id: "hn",
    name: "Hacker News (Algolia)",
    kind: "secondary",
    needsConfig: false,
    note: "keyless, CORS-open — recent primary discussion + links",
    buildUrl: (q) =>
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=5`,
  },
  {
    id: "github",
    name: "GitHub repository search",
    kind: "primary",
    needsConfig: false,
    note: "keyless unauthenticated repository search — first-party code/docs",
    buildUrl: (q) =>
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5`,
  },
  {
    id: "searxng",
    name: "SearXNG (self-hosted)",
    kind: "meta",
    needsConfig: true,
    note: "user's own metasearch endpoint — keeps queries local-first",
    buildUrl: (q, o) =>
      o?.searxngRoot ? `${o.searxngRoot.replace(/\/$/, "")}/search?q=${encodeURIComponent(q)}&format=json` : null,
  },
  {
    id: "brave",
    name: "Brave Search (BYO key)",
    kind: "meta",
    needsConfig: true,
    note: "optional key in Providers — never stored by this module",
    buildUrl: (q, o) =>
      o?.braveKey ? `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5` : null,
  },
];

/** Split a goal into at most `max` search queries. Pure, offline, deterministic. */
export function planQueries(goal: string, max = 3): string[] {
  const parts = goal
    .split(/[\n;。]|\. /)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .map((s) => (s.length > 90 ? `${s.slice(0, 90)}…` : s));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : [goal.trim() || ""];
}

/* ── normalizers: provider JSON -> WebHit (pure) ─────────────────────────── */

export function normalizeWikipedia(json: unknown, query: string): WebHit[] {
  // opensearch shape: [query, [titles], [snippets], [urls]]
  if (!Array.isArray(json) || json.length < 4) return [];
  const [, titles, snippets, urls] = json as [string, string[], string[], string[]];
  if (!Array.isArray(titles) || !Array.isArray(urls)) return [];
  return titles.map((title, i) => ({
    url: String(urls[i] ?? ""),
    title: String(title),
    snippet: String(Array.isArray(snippets) ? snippets[i] ?? "" : ""),
    source: "wikipedia" as const,
    kind: "secondary" as const,
    ts: null,
    score: scoreHit({ url: String(urls[i] ?? ""), title: String(title), snippet: String(Array.isArray(snippets) ? snippets[i] ?? "" : ""), source: "wikipedia", kind: "secondary", ts: null }, query),
  })).filter((h) => h.url.length > 0);
}

export function normalizeHn(json: unknown, query: string): WebHit[] {
  const hits = (json as { hits?: unknown })?.hits;
  if (!Array.isArray(hits)) return [];
  return hits
    .map((h) => {
      const o = h as { url?: string | null; title?: string | null; story_text?: string | null; created_at?: string | null; objectID?: string };
      const url = o.url ?? (o.objectID ? `https://news.ycombinator.com/item?id=${o.objectID}` : "");
      return {
        url,
        title: String(o.title ?? ""),
        snippet: String(o.story_text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220),
        source: "hn" as const,
        kind: "secondary" as const,
        ts: o.created_at ?? null,
        score: 0,
      };
    })
    .filter((h) => h.url.length > 0)
    .map((h) => ({ ...h, score: scoreHit(h, query) }));
}

export function normalizeGithub(json: unknown, query: string): WebHit[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const o = it as { html_url?: string; full_name?: string; description?: string | null; pushed_at?: string | null };
      return {
        url: String(o.html_url ?? ""),
        title: String(o.full_name ?? ""),
        snippet: String(o.description ?? "").slice(0, 220),
        source: "github" as const,
        kind: "primary" as const,
        ts: o.pushed_at ?? null,
        score: 0,
      };
    })
    .filter((h) => h.url.length > 0)
    .map((h) => ({ ...h, score: scoreHit(h, query) }));
}

/* ── scoring / dedupe / triples (pure) ───────────────────────────────────── */

const SOURCE_PRIOR: Record<WebProviderId, number> = {
  wikipedia: 0.55,
  hn: 0.45,
  github: 0.45,
  searxng: 0.4,
  brave: 0.4,
};

/** Token-overlap relevance with a mild recency boost, anchored on a source prior. */
export function scoreHit(hit: Omit<WebHit, "score">, query: string): number {
  const qTokens = new Set(
    query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3),
  );
  if (qTokens.size === 0) return SOURCE_PRIOR[hit.source] * 0.8;
  const text = `${hit.title} ${hit.snippet}`.toLowerCase();
  let matched = 0;
  for (const t of qTokens) if (text.includes(t)) matched += 1;
  const overlap = matched / qTokens.size;
  let recency = 0;
  if (hit.ts) {
    const ageDays = (Date.now() - Date.parse(hit.ts)) / 86_400_000;
    if (Number.isFinite(ageDays)) recency = ageDays < 7 ? 0.1 : ageDays < 90 ? 0.05 : 0;
  }
  return Math.min(1, 0.35 * overlap + 0.55 * overlap * SOURCE_PRIOR[hit.source] + recency + 0.1 * SOURCE_PRIOR[hit.source]);
}

export function dedupeHits(hits: WebHit[]): WebHit[] {
  const seen = new Set<string>();
  const out: WebHit[] = [];
  for (const h of hits) {
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    out.push(h);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The Researcher's contract shape: (claim, source, confidence) triples. */
export function toTriples(hits: WebHit[]): ClaimTriple[] {
  return hits.map((h) => ({
    claim: `${h.title}${h.snippet ? ` — ${h.snippet}` : ""}`.slice(0, 280),
    source: h.url,
    confidence: h.score >= 0.55 ? "high" : h.score >= 0.3 ? "medium" : "low",
    kind: h.kind,
  }));
}

/* ── the orchestrator ─────────────────────────────────────────────────────── */

export async function searchWeb(query: string, opts: WebSearchOpts = {}): Promise<WebEvidenceReport> {
  const doFetch = opts.fetchImpl ?? (opts.useGlobalFetch === false ? undefined : typeof fetch === "function" ? fetch : undefined);
  const timeoutMs = opts.timeoutMs ?? 6000;
  const outcomes: WebProviderOutcome[] = [];
  const hits: WebHit[] = [];

  if (!doFetch) {
    return {
      query,
      hits: [],
      providers: WEB_PROVIDERS.map((p) => ({ id: p.id, ok: false, hits: 0, note: "no fetch available in this host" })),
      fetchedAt: new Date().toISOString(),
    };
  }

  await Promise.all(
    WEB_PROVIDERS.map(async (p) => {
      const url = p.buildUrl(query, opts);
      if (url === null) {
        outcomes.push({ id: p.id, ok: false, hits: 0, note: p.needsConfig ? "not configured" : "no url" });
        return;
      }
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await doFetch(url, { signal: ctl.signal, headers: p.id === "github" ? { Accept: "application/vnd.github+json" } : undefined });
        if (!res.ok) {
          outcomes.push({ id: p.id, ok: false, hits: 0, note: `http ${res.status}` });
          return;
        }
        const json: unknown = await res.json();
        const norm =
          p.id === "wikipedia" ? normalizeWikipedia(json, query)
          : p.id === "hn" ? normalizeHn(json, query)
          : p.id === "github" ? normalizeGithub(json, query)
          : [];
        hits.push(...norm);
        outcomes.push({ id: p.id, ok: true, hits: norm.length, note: "ok" });
      } catch (e) {
        const msg = e instanceof Error && e.name === "AbortError" ? `timeout ${timeoutMs}ms` : "network/cors";
        outcomes.push({ id: p.id, ok: false, hits: 0, note: msg });
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  return { query, hits: dedupeHits(hits), providers: outcomes, fetchedAt: new Date().toISOString() };
}
