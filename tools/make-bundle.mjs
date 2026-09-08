/**
 * Build V6.0-Source.md — every source file inlined into one Markdown file,
 * matching the MJ 5.0 single-file bundle convention so it drops into the same
 * rebuild workflow.
 *
 *   node tools/make-bundle.mjs
 */
import { readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "target", "out", "build", ".arena",
  ".cache", ".next", ".vite", "coverage",
]);
const SKIP_FILES = new Set(["package-lock.json", "V6.0-Source.md", "V5.0-Source.md"]);
const BINARY_EXT = new Set([
  ".png", ".ico", ".icns", ".woff", ".woff2", ".ttf", ".otf", ".jpg", ".jpeg",
  ".webp", ".exe", ".dll", ".so", ".dylib", ".zip", ".gz", ".wasm",
]);
const LANG = {
  ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".mjs": "javascript",
  ".json": "json", ".rs": "rust", ".toml": "toml", ".md": "markdown",
  ".css": "css", ".html": "html", ".svg": "svg", ".yml": "yaml", ".yaml": "yaml",
  ".py": "python", ".sh": "bash", ".bat": "bat", ".txt": "text", ".gitignore": "text",
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP_DIRS.has(name)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile()) out.push(full);
  }
  return out;
}
import { readdirSync } from "node:fs";

const files = walk(ROOT)
  .map((f) => relative(ROOT, f).split(sep).join("/"))
  .filter((f) => !SKIP_FILES.has(f) && !SKIP_FILES.has(f.split("/").pop()))
  .filter((f) => !f.startsWith("tools/") || f === "tools/acceptance.ts" || f === "tools/make-bundle.mjs")
  .sort();

const textFiles = [];
const binaryFiles = [];
for (const f of files) {
  const ext = f.slice(f.lastIndexOf(".")).toLowerCase();
  (BINARY_EXT.has(ext) ? binaryFiles : textFiles).push(f);
}

const out = [];
out.push("# MJ 6.0 — Complete Source (Single-File Bundle)");
out.push("");
out.push("This is the **complete MJ 6.0 source code** inlined into a single Markdown file.");
out.push("Every file from the canonical `MJ-Desktop-6.0.zip` is reproduced below, with its");
out.push("original path shown as a header. Text files appear as fenced code blocks. Binary");
out.push("files (icons, fonts) are base64-encoded inside fenced blocks.");
out.push("");
out.push("**To rebuild MJ 6.0 from this file:**");
out.push("");
out.push("1. Create an empty folder and `cd` into it");
out.push("2. For each section below, create the file at the path shown in its header and");
out.push("   paste the contents from the matching code block");
out.push("3. For binary files, base64-decode the contents back to the original");
out.push("4. `npm install`, then `cargo check --manifest-path src-tauri/Cargo.toml`");
out.push("   (the Rust layer has never been compiled — see Still honest in WHAT-CHANGED.md)");
out.push("5. `npm run tauri:build`");
out.push("");
out.push("**MJ 6.0 = MJ 5.0 + a Mission/Organization layer above the graph.**");
out.push("V5 architecture is preserved: Hermes, role packs, teams, 35 frameworks, the");
out.push("harness layer, skills, memory, feedback, evolution, MCP, local CLIs, Tauri, Rust,");
out.push("SQLite. Nothing was rewritten.");
out.push("");
out.push(`**File count:** ${textFiles.length} text files + ${binaryFiles.length} binary files`);
out.push("");
out.push("---");
out.push("");

function fence(content, lang) {
  // Choose a fence long enough not to collide with the content.
  let n = 3;
  // Rebuild the pattern each pass — reusing a stale regex loops forever.
  while (new RegExp("^ {0,3}`{" + n + ",}", "m").test(content)) n++;
  const fence = "`".repeat(n);
  return `${fence}${lang}\n${content}\n${fence}`;
}

for (const f of textFiles) {
  const ext = f.slice(f.lastIndexOf(".")).toLowerCase();
  const lang = LANG[ext] ?? LANG[f.split("/").pop()] ?? "";
  let content;
  try {
    content = readFileSync(join(ROOT, f), "utf8");
  } catch {
    continue;
  }
  out.push(`\n## \`${f}\`\n`);
  out.push(fence(content.replace(/\r\n/g, "\n"), lang));
  out.push("");
}

if (binaryFiles.length) {
  out.push("\n---\n");
  out.push("\n# Binary files (base64)\n");
  for (const f of binaryFiles) {
    if (!existsSync(join(ROOT, f))) continue;
    const b64 = readFileSync(join(ROOT, f)).toString("base64");
    out.push(`\n## \`${f}\`\n`);
    out.push(fence(b64, "text"));
    out.push("");
  }
}

const text = out.join("\n");
writeFileSync(join(ROOT, "V6.0-Source.md"), text);
console.log(
  `Wrote V6.0-Source.md — ${textFiles.length} text + ${binaryFiles.length} binary files, ` +
    `${(text.length / 1024).toFixed(0)} KB, ${text.split("\n").length} lines`,
);
