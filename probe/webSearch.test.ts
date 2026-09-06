/**
 * §Web evidence probe (MJ 11.9.4-Major, suite added with the feature).
 *
 * Holds the Web Evidence contract: the pure core (plan / normalize / score /
 * dedupe / triples) is exercised offline with fixtures, the orchestrator is
 * exercised with an injected fetch double (never the network), and the
 * honesty rules are pinned: failed providers are reported with reasons,
 * unconfigured providers say "not configured", confidence is measured.
 */
import {
  WEB_PROVIDERS,
  planQueries,
  normalizeWikipedia,
  normalizeHn,
  normalizeGithub,
  scoreHit,
  dedupeHits,
  toTriples,
  searchWeb,
  type WebHit,
} from "../src/mission/webSearch";

let pass = 0;
let fail = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (s: string) => console.log(`\n== ${s}`);

section("1. query planning is pure and bounded");
ok("splits a multi-part goal", planQueries("Research X. Then Y; and Z").length === 3, JSON.stringify(planQueries("Research X. Then Y; and Z")));
ok("caps at max", planQueries("alpha one. beta two. gamma three. delta four.", 3).length === 3, String(planQueries("alpha one. beta two. gamma three. delta four.", 3).length));
ok("empty goal still yields one query", planQueries("").length === 1, JSON.stringify(planQueries("")));
ok("dedupes repeated clauses", planQueries("X. X. X.").length === 1, JSON.stringify(planQueries("X. X. X.")));

section("2. normalizers parse provider shapes");
const wiki = normalizeWikipedia(["q", ["Tauri", "Vite"], ["Native apps", "Build tool"], ["https://a", "https://b"]], "tauri desktop");
ok("wikipedia -> 2 hits with urls", wiki.length === 2 && wiki.every((h) => h.url.startsWith("https://")), JSON.stringify(wiki));
ok("wikipedia hits are scored > 0", wiki.every((h) => h.score > 0), JSON.stringify(wiki.map((h) => h.score)));
const hn = normalizeHn({ hits: [{ title: "Tauri v2", url: "https://x", story_text: "<p>desktop</p>", created_at: "2026-09-01T00:00:00Z" }, { title: "no url", objectID: "1" }] }, "tauri");
ok("hn -> urls kept, missing url falls back to item link", hn.length === 2 && hn[1].url.includes("news.ycombinator.com"), JSON.stringify(hn.map((h) => h.url)));
ok("hn strips html from snippets", hn[0].snippet === "desktop", hn[0].snippet);
const gh = normalizeGithub({ items: [{ html_url: "https://github.com/t/t", full_name: "t/t", description: "tauri apps", pushed_at: "2026-08-01T00:00:00Z" }] }, "tauri");
ok("github -> 1 hit", gh.length === 1 && gh[0].source === "github", JSON.stringify(gh));

section("3. scoring is measured, not vibes");
const base = { url: "https://e", title: "", snippet: "", source: "wikipedia" as const, kind: "secondary" as const, ts: null };
const hi = scoreHit({ ...base, title: "tauri desktop apps", snippet: "tauri webview rust" }, "tauri desktop");
const lo = scoreHit({ ...base, title: "cooking pasta", snippet: "boil water" }, "tauri desktop");
ok("overlap beats non-overlap", hi > lo, `${hi} vs ${lo}`);
const fresh = scoreHit({ ...base, title: "tauri release", snippet: "", ts: new Date(Date.now() - 86_400_000 * 2).toISOString() }, "tauri");
const stale = scoreHit({ ...base, title: "tauri release", snippet: "", ts: "2020-01-01T00:00:00Z" }, "tauri");
ok("recency boosts within a week", fresh > stale, `${fresh} vs ${stale}`);
ok("scores stay in [0,1]", [hi, lo, fresh, stale].every((s) => s >= 0 && s <= 1), JSON.stringify([hi, lo, fresh, stale]));

section("4. dedupe + triples keep the Researcher contract");
const dups: WebHit[] = [
  { url: "https://same", title: "A", snippet: "", source: "hn", kind: "secondary", ts: null, score: 0.4 },
  { url: "https://same", title: "A dup", snippet: "", source: "wikipedia", kind: "secondary", ts: null, score: 0.9 },
  { url: "https://other", title: "B", snippet: "", source: "github", kind: "primary", ts: null, score: 0.7 },
];
const dedup = dedupeHits(dups);
ok("same url survives once (first seen wins)", dedup.length === 2 && dedup.some((h) => h.title === "A") && !dedup.some((h) => h.title === "A dup"), JSON.stringify(dedup.map((h) => h.title)));
ok("sorted by score desc", dedup[0].score >= dedup[1].score, JSON.stringify(dedup.map((h) => h.score)));
const triples = toTriples(dedup);
ok("triples are (claim, source, confidence)", triples.every((t) => t.claim.length > 0 && t.source.startsWith("http") && ["high", "medium", "low"].includes(t.confidence)), JSON.stringify(triples));
ok("0.7 scores medium-or-high, 0.4 medium", triples[0].confidence !== "low" && triples[1].confidence === "medium", JSON.stringify(triples.map((t) => t.confidence)));

section("5. provider registry honesty");
const byId = Object.fromEntries(WEB_PROVIDERS.map((p) => [p.id, p]));
ok("three keyless providers ship", ["wikipedia", "hn", "github"].every((id) => byId[id] && !byId[id].needsConfig), "");
ok("github is repository search and labelled primary", byId.github.name === "GitHub repository search" && byId.github.kind === "primary", byId.github.name);
ok("wikipedia/hn are honestly labelled secondary", byId.wikipedia.kind === "secondary" && byId.hn.kind === "secondary", "");
ok("triples carry the source kind", toTriples(dedup).every((t) => ["primary", "secondary", "meta"].includes(t.kind)), JSON.stringify(toTriples(dedup).map((t) => t.kind)));
ok("searxng/brave need config and refuse without it", byId.searxng.buildUrl("q", {}) === null && byId.brave.buildUrl("q", {}) === null, "");
ok("searxng builds against the user's root", (byId.searxng.buildUrl("q", { searxngRoot: "http://127.0.0.1:8888/" }) ?? "").startsWith("http://127.0.0.1:8888/search?q=q"), "");

section("6. the orchestrator with an injected fetch double");
const fakeFetch = (async (url: string | URL | Request) => {
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
}) as typeof fetch;

void (async () => {
  const rep = await searchWeb("tauri desktop", { fetchImpl: fakeFetch, timeoutMs: 500 });
  ok("keyless providers that answered are ok", rep.providers.find((p) => p.id === "wikipedia")?.ok === true && rep.providers.find((p) => p.id === "hn")?.ok === true, JSON.stringify(rep.providers));
  ok("github failure is reported, not dropped", rep.providers.find((p) => p.id === "github")?.ok === false && /network|cors/.test(rep.providers.find((p) => p.id === "github")?.note ?? ""), JSON.stringify(rep.providers));
  ok("unconfigured providers say 'not configured'", rep.providers.filter((p) => ["searxng", "brave"].includes(p.id)).every((p) => p.note === "not configured"), JSON.stringify(rep.providers));
  ok("same url from two providers dedupes to one hit", rep.hits.filter((h) => h.url === "https://w").length === 1, JSON.stringify(rep.hits.map((h) => h.url)));
  ok("hits carry measured scores", rep.hits.every((h) => h.score > 0 && h.score <= 1), JSON.stringify(rep.hits.map((h) => h.score)));

  const noFetch = await searchWeb("tauri", { fetchImpl: undefined, useGlobalFetch: false });
  ok("no fetch host -> every provider reports honestly", noFetch.hits.length === 0 && noFetch.providers.every((p) => !p.ok), JSON.stringify(noFetch.providers));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
})();
