/**
 * MJ 11.14.3 — the code-hygiene floor (external hardening pass).
 *
 * MJ's guardrail philosophy applied to the source itself: the tree already
 * ships zero TODO markers, zero `as any`, zero `@ts-ignore` and zero stray
 * console output — but until now those were FACTS, not GATES. This suite
 * makes them mechanical, the same way guardrailAlign makes governance
 * mechanical: any future edit that reintroduces a type escape hatch, a
 * debug leftover, an un-sandboxed eval, a widened script CSP, or an orphaned
 * permission fails CI with the file named.
 *
 * Also pinned here: the one eval surface in the product (the expression
 * sandbox in src/engine/expression.ts) stays the ONLY one, and the desktop
 * CSP keeps allowing exactly the web-evidence providers MJ's Researcher is
 * documented to fetch from the renderer (webSearch.ts) — so a future CSP
 * tightening cannot silently break live search in the packaged app.
 */
import * as fs from "node:fs";
import * as path from "node:path";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

declare const MJ_ROOT: string | undefined;
const ROOT = typeof MJ_ROOT === "string" && MJ_ROOT.length > 0 ? MJ_ROOT : path.resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** All source files under a dir with the given extensions, deepest-first, sorted. */
function sourceFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
    }
  };
  walk(path.join(ROOT, dir));
  return out.sort();
}

const tsFiles = sourceFiles("src", [".ts", ".tsx"]);
const tsSrc = tsFiles.map((f) => read(path.relative(ROOT, f)));
const rustFiles = sourceFiles("src-tauri/src", [".rs"]);
const rustSrc = rustFiles.map((f) => read(path.relative(ROOT, f)));
const allSrc = tsSrc.join("\n");

/* ── 1. type-escape hatches ─────────────────────────────────────────────── */
const asAnyFiles = tsFiles.filter((f) => /\bas any\b/.test(read(path.relative(ROOT, f))));
ok("hygiene 1 — zero `as any` type escapes in src", asAnyFiles.length === 0,
  asAnyFiles.length ? asAnyFiles.join(", ") : "");

const tsIgnoreFiles = tsFiles.filter((f) => /@ts-ignore|@ts-nocheck/.test(read(path.relative(ROOT, f))));
ok("hygiene 2 — zero @ts-ignore / @ts-nocheck suppressions", tsIgnoreFiles.length === 0,
  tsIgnoreFiles.length ? tsIgnoreFiles.join(", ") : "");

/* ── 2. leftover markers ────────────────────────────────────────────────── */
const markerFiles = [...tsFiles, ...rustFiles].filter((f) =>
  /\b(TODO|FIXME|HACK|XXX)\b/.test(read(path.relative(ROOT, f))));
ok("hygiene 3 — zero TODO/FIXME/HACK/XXX markers in src and src-tauri/src", markerFiles.length === 0,
  markerFiles.length ? markerFiles.join(", ") : "");

/* ── 3. debug output in core ────────────────────────────────────────────── */
const consoleFiles = tsFiles.filter((f) => /\bconsole\.(log|debug)\(/.test(read(path.relative(ROOT, f))));
ok("hygiene 4 — zero stray console.log / console.debug in src", consoleFiles.length === 0,
  consoleFiles.length ? consoleFiles.join(", ") : "");

/* ── 4. the eval surface stays singular and sandboxed ───────────────────── */
const evalFiles = tsFiles.filter((f) => /\beval\(|\bnew Function\(/.test(read(path.relative(ROOT, f))));
ok("hygiene 5 — the ONLY eval/new Function surface is the expression sandbox",
  evalFiles.length === 1 && path.relative(ROOT, evalFiles[0]) === path.join("src", "engine", "expression.ts"),
  evalFiles.length ? evalFiles.map((f) => path.relative(ROOT, f)).join(", ") : "none found — sandbox removed?");

const expr = read("src/engine/expression.ts");
ok("hygiene 6 — expression sandbox blocks prototype chain identifiers",
  expr.includes("\"constructor\"") && expr.includes("\"__proto__\"") && expr.includes("\"prototype\""));
ok("hygiene 7 — expression sandbox caps length and rejects statement characters",
  expr.includes("src.length > 600") && expr.includes("illegal character") && expr.includes("blocked property"));

/* ── 5. desktop CSP: tight scripts, deliberate connect-src ──────────────── */
const tauriConf = JSON.parse(read("src-tauri/tauri.conf.json"));
const csp = String(tauriConf?.app?.security?.csp ?? "");
ok("hygiene 8 — desktop CSP is set", csp.length > 0 && csp.includes("default-src 'self'"));
ok("hygiene 9 — script-src allows only 'self' (no unsafe-inline / unsafe-eval)",
  csp.includes("script-src 'self'") && !csp.includes("unsafe-eval") && !/script-src[^;]*unsafe-inline/.test(csp));
ok("hygiene 10 — CSP connect-src keeps the local services (IPC + local LLM/SearXNG)",
  csp.includes("ipc:") && csp.includes("http://ipc.localhost") && csp.includes("http://127.0.0.1:*"));
ok("hygiene 11 — CSP connect-src allows every web-evidence provider the Researcher fetches",
  ["https://api.github.com", "https://en.wikipedia.org", "https://hn.algolia.com", "https://api.search.brave.com"]
    .every((host) => csp.includes(host)),
  "webSearch.ts documents wikipedia / hn / github / brave as renderer-fetched providers");

/* ── 6. Rust: no unsafe, no orphaned plugin permission ──────────────────── */
const unsafeFiles = rustFiles.filter((f) => /\bunsafe\b/.test(read(path.relative(ROOT, f))));
ok("hygiene 12 — zero `unsafe` blocks in src-tauri/src", unsafeFiles.length === 0,
  unsafeFiles.length ? unsafeFiles.join(", ") : "");

const caps = sourceFiles("src-tauri/capabilities", [".json"]).map((f) => read(path.relative(ROOT, f))).join("\n");
const cargo = read("src-tauri/Cargo.toml");
const updaterPermitted = caps.includes("updater:default");
const updaterPlugged = /tauri-plugin-updater/.test(cargo);
ok("hygiene 13 — no orphaned permissions: updater:default implies the updater plugin is wired in Cargo.toml",
  !updaterPermitted || updaterPlugged,
  updaterPermitted && !updaterPlugged ? "updater:default granted but tauri-plugin-updater absent from Cargo.toml" : "");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
