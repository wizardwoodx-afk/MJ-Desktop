import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/mission/webSearch.ts
var WEB_PROVIDERS = [
  {
    id: "wikipedia",
    name: "Wikipedia (opensearch)",
    kind: "secondary",
    needsConfig: false,
    note: "keyless, CORS-open \u2014 primary encyclopedic sources",
    buildUrl: (q) => `https://en.wikipedia.org/w/api.php?action=opensearch&origin=*&format=json&limit=5&search=${encodeURIComponent(q)}`
  },
  {
    id: "hn",
    name: "Hacker News (Algolia)",
    kind: "secondary",
    needsConfig: false,
    note: "keyless, CORS-open \u2014 recent primary discussion + links",
    buildUrl: (q) => `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=5`
  },
  {
    id: "github",
    name: "GitHub repository search",
    kind: "primary",
    needsConfig: false,
    note: "keyless unauthenticated repository search \u2014 first-party code/docs",
    buildUrl: (q) => `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=5`
  },
  {
    id: "searxng",
    name: "SearXNG (self-hosted)",
    kind: "meta",
    needsConfig: true,
    note: "user's own metasearch endpoint \u2014 keeps queries local-first",
    buildUrl: (q, o) => o?.searxngRoot ? `${o.searxngRoot.replace(/\/$/, "")}/search?q=${encodeURIComponent(q)}&format=json` : null
  },
  {
    id: "brave",
    name: "Brave Search (BYO key)",
    kind: "meta",
    needsConfig: true,
    note: "optional key in Providers \u2014 never stored by this module",
    buildUrl: (q, o) => o?.braveKey ? `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5` : null
  }
];
function planQueries(goal, max = 3) {
  const parts = goal.split(/[\n;。]|\. /).map((s) => s.trim()).filter((s) => s.length >= 3).map((s) => s.length > 90 ? `${s.slice(0, 90)}\u2026` : s);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : [goal.trim() || ""];
}
function normalizeWikipedia(json, query) {
  if (!Array.isArray(json) || json.length < 4) return [];
  const [, titles, snippets, urls] = json;
  if (!Array.isArray(titles) || !Array.isArray(urls)) return [];
  return titles.map((title, i) => ({
    url: String(urls[i] ?? ""),
    title: String(title),
    snippet: String(Array.isArray(snippets) ? snippets[i] ?? "" : ""),
    source: "wikipedia",
    kind: "secondary",
    ts: null,
    score: scoreHit({ url: String(urls[i] ?? ""), title: String(title), snippet: String(Array.isArray(snippets) ? snippets[i] ?? "" : ""), source: "wikipedia", kind: "secondary", ts: null }, query)
  })).filter((h) => h.url.length > 0);
}
function normalizeHn(json, query) {
  const hits = json?.hits;
  if (!Array.isArray(hits)) return [];
  return hits.map((h) => {
    const o = h;
    const url = o.url ?? (o.objectID ? `https://news.ycombinator.com/item?id=${o.objectID}` : "");
    return {
      url,
      title: String(o.title ?? ""),
      snippet: String(o.story_text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220),
      source: "hn",
      kind: "secondary",
      ts: o.created_at ?? null,
      score: 0
    };
  }).filter((h) => h.url.length > 0).map((h) => ({ ...h, score: scoreHit(h, query) }));
}
function normalizeGithub(json, query) {
  const items = json?.items;
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const o = it;
    return {
      url: String(o.html_url ?? ""),
      title: String(o.full_name ?? ""),
      snippet: String(o.description ?? "").slice(0, 220),
      source: "github",
      kind: "primary",
      ts: o.pushed_at ?? null,
      score: 0
    };
  }).filter((h) => h.url.length > 0).map((h) => ({ ...h, score: scoreHit(h, query) }));
}
var SOURCE_PRIOR = {
  wikipedia: 0.55,
  hn: 0.45,
  github: 0.45,
  searxng: 0.4,
  brave: 0.4
};
function scoreHit(hit, query) {
  const qTokens = new Set(
    query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
  );
  if (qTokens.size === 0) return SOURCE_PRIOR[hit.source] * 0.8;
  const text = `${hit.title} ${hit.snippet}`.toLowerCase();
  let matched = 0;
  for (const t of qTokens) if (text.includes(t)) matched += 1;
  const overlap = matched / qTokens.size;
  let recency = 0;
  if (hit.ts) {
    const ageDays = (Date.now() - Date.parse(hit.ts)) / 864e5;
    if (Number.isFinite(ageDays)) recency = ageDays < 7 ? 0.1 : ageDays < 90 ? 0.05 : 0;
  }
  return Math.min(1, 0.35 * overlap + 0.55 * overlap * SOURCE_PRIOR[hit.source] + recency + 0.1 * SOURCE_PRIOR[hit.source]);
}
function dedupeHits(hits) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const h of hits) {
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    out.push(h);
  }
  return out.sort((a, b) => b.score - a.score);
}
function toTriples(hits) {
  return hits.map((h) => ({
    claim: `${h.title}${h.snippet ? ` \u2014 ${h.snippet}` : ""}`.slice(0, 280),
    source: h.url,
    confidence: h.score >= 0.55 ? "high" : h.score >= 0.3 ? "medium" : "low",
    kind: h.kind
  }));
}
async function searchWeb(query, opts = {}) {
  const doFetch = opts.fetchImpl ?? (opts.useGlobalFetch === false ? void 0 : typeof fetch === "function" ? fetch : void 0);
  const timeoutMs = opts.timeoutMs ?? 6e3;
  const outcomes = [];
  const hits = [];
  if (!doFetch) {
    return {
      query,
      hits: [],
      providers: WEB_PROVIDERS.map((p) => ({ id: p.id, ok: false, hits: 0, note: "no fetch available in this host" })),
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
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
        const res = await doFetch(url, { signal: ctl.signal, headers: p.id === "github" ? { Accept: "application/vnd.github+json" } : void 0 });
        if (!res.ok) {
          outcomes.push({ id: p.id, ok: false, hits: 0, note: `http ${res.status}` });
          return;
        }
        const json = await res.json();
        const norm = p.id === "wikipedia" ? normalizeWikipedia(json, query) : p.id === "hn" ? normalizeHn(json, query) : p.id === "github" ? normalizeGithub(json, query) : [];
        hits.push(...norm);
        outcomes.push({ id: p.id, ok: true, hits: norm.length, note: "ok" });
      } catch (e) {
        const msg = e instanceof Error && e.name === "AbortError" ? `timeout ${timeoutMs}ms` : "network/cors";
        outcomes.push({ id: p.id, ok: false, hits: 0, note: msg });
      } finally {
        clearTimeout(timer);
      }
    })
  );
  return { query, hits: dedupeHits(hits), providers: outcomes, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() };
}

// probe/webSearch.test.ts
var pass = 0;
var fail = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (s) => console.log(`
== ${s}`);
section("1. query planning is pure and bounded");
ok("splits a multi-part goal", planQueries("Research X. Then Y; and Z").length === 3, JSON.stringify(planQueries("Research X. Then Y; and Z")));
ok("caps at max", planQueries("alpha one. beta two. gamma three. delta four.", 3).length === 3, String(planQueries("alpha one. beta two. gamma three. delta four.", 3).length));
ok("empty goal still yields one query", planQueries("").length === 1, JSON.stringify(planQueries("")));
ok("dedupes repeated clauses", planQueries("X. X. X.").length === 1, JSON.stringify(planQueries("X. X. X.")));
section("2. normalizers parse provider shapes");
var wiki = normalizeWikipedia(["q", ["Tauri", "Vite"], ["Native apps", "Build tool"], ["https://a", "https://b"]], "tauri desktop");
ok("wikipedia -> 2 hits with urls", wiki.length === 2 && wiki.every((h) => h.url.startsWith("https://")), JSON.stringify(wiki));
ok("wikipedia hits are scored > 0", wiki.every((h) => h.score > 0), JSON.stringify(wiki.map((h) => h.score)));
var hn = normalizeHn({ hits: [{ title: "Tauri v2", url: "https://x", story_text: "<p>desktop</p>", created_at: "2026-09-01T00:00:00Z" }, { title: "no url", objectID: "1" }] }, "tauri");
ok("hn -> urls kept, missing url falls back to item link", hn.length === 2 && hn[1].url.includes("news.ycombinator.com"), JSON.stringify(hn.map((h) => h.url)));
ok("hn strips html from snippets", hn[0].snippet === "desktop", hn[0].snippet);
var gh = normalizeGithub({ items: [{ html_url: "https://github.com/t/t", full_name: "t/t", description: "tauri apps", pushed_at: "2026-08-01T00:00:00Z" }] }, "tauri");
ok("github -> 1 hit", gh.length === 1 && gh[0].source === "github", JSON.stringify(gh));
section("3. scoring is measured, not vibes");
var base = { url: "https://e", title: "", snippet: "", source: "wikipedia", kind: "secondary", ts: null };
var hi = scoreHit({ ...base, title: "tauri desktop apps", snippet: "tauri webview rust" }, "tauri desktop");
var lo = scoreHit({ ...base, title: "cooking pasta", snippet: "boil water" }, "tauri desktop");
ok("overlap beats non-overlap", hi > lo, `${hi} vs ${lo}`);
var fresh = scoreHit({ ...base, title: "tauri release", snippet: "", ts: new Date(Date.now() - 864e5 * 2).toISOString() }, "tauri");
var stale = scoreHit({ ...base, title: "tauri release", snippet: "", ts: "2020-01-01T00:00:00Z" }, "tauri");
ok("recency boosts within a week", fresh > stale, `${fresh} vs ${stale}`);
ok("scores stay in [0,1]", [hi, lo, fresh, stale].every((s) => s >= 0 && s <= 1), JSON.stringify([hi, lo, fresh, stale]));
section("4. dedupe + triples keep the Researcher contract");
var dups = [
  { url: "https://same", title: "A", snippet: "", source: "hn", kind: "secondary", ts: null, score: 0.4 },
  { url: "https://same", title: "A dup", snippet: "", source: "wikipedia", kind: "secondary", ts: null, score: 0.9 },
  { url: "https://other", title: "B", snippet: "", source: "github", kind: "primary", ts: null, score: 0.7 }
];
var dedup = dedupeHits(dups);
ok("same url survives once (first seen wins)", dedup.length === 2 && dedup.some((h) => h.title === "A") && !dedup.some((h) => h.title === "A dup"), JSON.stringify(dedup.map((h) => h.title)));
ok("sorted by score desc", dedup[0].score >= dedup[1].score, JSON.stringify(dedup.map((h) => h.score)));
var triples = toTriples(dedup);
ok("triples are (claim, source, confidence)", triples.every((t) => t.claim.length > 0 && t.source.startsWith("http") && ["high", "medium", "low"].includes(t.confidence)), JSON.stringify(triples));
ok("0.7 scores medium-or-high, 0.4 medium", triples[0].confidence !== "low" && triples[1].confidence === "medium", JSON.stringify(triples.map((t) => t.confidence)));
section("5. provider registry honesty");
var byId = Object.fromEntries(WEB_PROVIDERS.map((p) => [p.id, p]));
ok("three keyless providers ship", ["wikipedia", "hn", "github"].every((id) => byId[id] && !byId[id].needsConfig), "");
ok("github is repository search and labelled primary", byId.github.name === "GitHub repository search" && byId.github.kind === "primary", byId.github.name);
ok("wikipedia/hn are honestly labelled secondary", byId.wikipedia.kind === "secondary" && byId.hn.kind === "secondary", "");
ok("triples carry the source kind", toTriples(dedup).every((t) => ["primary", "secondary", "meta"].includes(t.kind)), JSON.stringify(toTriples(dedup).map((t) => t.kind)));
ok("searxng/brave need config and refuse without it", byId.searxng.buildUrl("q", {}) === null && byId.brave.buildUrl("q", {}) === null, "");
ok("searxng builds against the user's root", (byId.searxng.buildUrl("q", { searxngRoot: "http://127.0.0.1:8888/" }) ?? "").startsWith("http://127.0.0.1:8888/search?q=q"), "");
section("6. the orchestrator with an injected fetch double");
var fakeFetch = (async (url) => {
  const u = String(url);
  if (u.includes("wikipedia.org")) {
    return { ok: true, status: 200, json: async () => ["q", ["Tauri"], ["native apps"], ["https://w"]] };
  }
  if (u.includes("hn.algolia")) {
    return { ok: true, status: 200, json: async () => ({ hits: [{ title: "Tauri v2", url: "https://w", created_at: "2026-09-01T00:00:00Z" }] }) };
  }
  if (u.includes("github.com")) {
    throw new Error("cors");
  }
  return { ok: false, status: 500, json: async () => ({}) };
});
void (async () => {
  const rep = await searchWeb("tauri desktop", { fetchImpl: fakeFetch, timeoutMs: 500 });
  ok("keyless providers that answered are ok", rep.providers.find((p) => p.id === "wikipedia")?.ok === true && rep.providers.find((p) => p.id === "hn")?.ok === true, JSON.stringify(rep.providers));
  ok("github failure is reported, not dropped", rep.providers.find((p) => p.id === "github")?.ok === false && /network|cors/.test(rep.providers.find((p) => p.id === "github")?.note ?? ""), JSON.stringify(rep.providers));
  ok("unconfigured providers say 'not configured'", rep.providers.filter((p) => ["searxng", "brave"].includes(p.id)).every((p) => p.note === "not configured"), JSON.stringify(rep.providers));
  ok("same url from two providers dedupes to one hit", rep.hits.filter((h) => h.url === "https://w").length === 1, JSON.stringify(rep.hits.map((h) => h.url)));
  ok("hits carry measured scores", rep.hits.every((h) => h.score > 0 && h.score <= 1), JSON.stringify(rep.hits.map((h) => h.score)));
  const noFetch = await searchWeb("tauri", { fetchImpl: void 0, useGlobalFetch: false });
  ok("no fetch host -> every provider reports honestly", noFetch.hits.length === 0 && noFetch.providers.every((p) => !p.ok), JSON.stringify(noFetch.providers));
  console.log(`
${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})();
