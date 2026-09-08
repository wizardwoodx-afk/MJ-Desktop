import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/codeHygiene.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var ROOT = ".".length > 0 ? "." : path.resolve(import.meta.dirname ?? ".", "..");
var read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
function sourceFiles(dir, exts) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
    }
  };
  walk(path.join(ROOT, dir));
  return out.sort();
}
var tsFiles = sourceFiles("src", [".ts", ".tsx"]);
var tsSrc = tsFiles.map((f) => read(path.relative(ROOT, f)));
var rustFiles = sourceFiles("src-tauri/src", [".rs"]);
var rustSrc = rustFiles.map((f) => read(path.relative(ROOT, f)));
var allSrc = tsSrc.join("\n");
var asAnyFiles = tsFiles.filter((f) => /\bas any\b/.test(read(path.relative(ROOT, f))));
ok(
  "hygiene 1 \u2014 zero `as any` type escapes in src",
  asAnyFiles.length === 0,
  asAnyFiles.length ? asAnyFiles.join(", ") : ""
);
var tsIgnoreFiles = tsFiles.filter((f) => /@ts-ignore|@ts-nocheck/.test(read(path.relative(ROOT, f))));
ok(
  "hygiene 2 \u2014 zero @ts-ignore / @ts-nocheck suppressions",
  tsIgnoreFiles.length === 0,
  tsIgnoreFiles.length ? tsIgnoreFiles.join(", ") : ""
);
var markerFiles = [...tsFiles, ...rustFiles].filter((f) => /\b(TODO|FIXME|HACK|XXX)\b/.test(read(path.relative(ROOT, f))));
ok(
  "hygiene 3 \u2014 zero TODO/FIXME/HACK/XXX markers in src and src-tauri/src",
  markerFiles.length === 0,
  markerFiles.length ? markerFiles.join(", ") : ""
);
var consoleFiles = tsFiles.filter((f) => /\bconsole\.(log|debug)\(/.test(read(path.relative(ROOT, f))));
ok(
  "hygiene 4 \u2014 zero stray console.log / console.debug in src",
  consoleFiles.length === 0,
  consoleFiles.length ? consoleFiles.join(", ") : ""
);
var evalFiles = tsFiles.filter((f) => /\beval\(|\bnew Function\(/.test(read(path.relative(ROOT, f))));
ok(
  "hygiene 5 \u2014 the ONLY eval/new Function surface is the expression sandbox",
  evalFiles.length === 1 && path.relative(ROOT, evalFiles[0]) === path.join("src", "engine", "expression.ts"),
  evalFiles.length ? evalFiles.map((f) => path.relative(ROOT, f)).join(", ") : "none found \u2014 sandbox removed?"
);
var expr = read("src/engine/expression.ts");
ok(
  "hygiene 6 \u2014 expression sandbox blocks prototype chain identifiers",
  expr.includes('"constructor"') && expr.includes('"__proto__"') && expr.includes('"prototype"')
);
ok(
  "hygiene 7 \u2014 expression sandbox caps length and rejects statement characters",
  expr.includes("src.length > 600") && expr.includes("illegal character") && expr.includes("blocked property")
);
var tauriConf = JSON.parse(read("src-tauri/tauri.conf.json"));
var csp = String(tauriConf?.app?.security?.csp ?? "");
ok("hygiene 8 \u2014 desktop CSP is set", csp.length > 0 && csp.includes("default-src 'self'"));
ok(
  "hygiene 9 \u2014 script-src allows only 'self' (no unsafe-inline / unsafe-eval)",
  csp.includes("script-src 'self'") && !csp.includes("unsafe-eval") && !/script-src[^;]*unsafe-inline/.test(csp)
);
ok(
  "hygiene 10 \u2014 CSP connect-src keeps the local services (IPC + local LLM/SearXNG)",
  csp.includes("ipc:") && csp.includes("http://ipc.localhost") && csp.includes("http://127.0.0.1:*")
);
ok(
  "hygiene 11 \u2014 CSP connect-src allows every web-evidence provider the Researcher fetches",
  ["https://api.github.com", "https://en.wikipedia.org", "https://hn.algolia.com", "https://api.search.brave.com"].every((host) => csp.includes(host)),
  "webSearch.ts documents wikipedia / hn / github / brave as renderer-fetched providers"
);
var unsafeFiles = rustFiles.filter((f) => /\bunsafe\b/.test(read(path.relative(ROOT, f))));
ok(
  "hygiene 12 \u2014 zero `unsafe` blocks in src-tauri/src",
  unsafeFiles.length === 0,
  unsafeFiles.length ? unsafeFiles.join(", ") : ""
);
var caps = sourceFiles("src-tauri/capabilities", [".json"]).map((f) => read(path.relative(ROOT, f))).join("\n");
var cargo = read("src-tauri/Cargo.toml");
var updaterPermitted = caps.includes("updater:default");
var updaterPlugged = /tauri-plugin-updater/.test(cargo);
ok(
  "hygiene 13 \u2014 no orphaned permissions: updater:default implies the updater plugin is wired in Cargo.toml",
  !updaterPermitted || updaterPlugged,
  updaterPermitted && !updaterPlugged ? "updater:default granted but tauri-plugin-updater absent from Cargo.toml" : ""
);
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
