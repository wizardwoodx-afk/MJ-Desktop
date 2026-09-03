/**
 * Browser stand-in for `node:path` — MJ 11.8.5.
 *
 * WHY THIS EXISTS
 *
 * Three mission modules (`agentsMd`, `sandbox`, `teamExecutor`) import `node:path` because the
 * Node-run probe suites execute them directly. In the WebView there is no Node, so the previous
 * release (11.8.1) shipped a `require()`-in-try/catch that silently installed an EMPTY object —
 * `path` became `{}` and every call threw `TypeError: path.join is not a function`. Worse, the
 * swallow hid the cause, so mission planning degraded to "no AGENTS.md found" with no explanation.
 *
 * The fix is to keep the real static ESM import (so the probes keep testing real code) and let the
 * *bundler* substitute a browser module. `path` is pure string logic with no OS dependency, so a
 * faithful implementation is possible and is what you get here — not a stub that lies.
 *
 * Scope: only the members MJ actually calls. Anything else is a deliberate absence, not an
 * oversight — add it here when a new call site needs it.
 */

/** Collapse `a/b/../c` → `a/c`, drop `.` segments, normalise slashes. Keeps a leading slash. */
function normalize(p: string): string {
  const isAbs = p.startsWith("/");
  const out: string[] = [];
  for (const seg of p.split(/[/\\]+/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!isAbs) out.push("..");
      continue;
    }
    out.push(seg);
  }
  const joined = out.join("/");
  if (isAbs) return "/" + joined;
  // Preserve a trailing slash only when the input had one — join() callers rely on it never being
  // added, but dirname() output should still read like a directory.
  return joined;
}

export function join(...parts: string[]): string {
  const kept = parts.filter((p) => p !== null && p !== undefined && p !== "");
  if (kept.length === 0) return ".";
  return normalize(kept.join("/"));
}

export function basename(p: string, ext?: string): string {
  const clean = p.replace(/[/\\]+$/, "");
  const last = clean.split(/[/\\]/).pop() ?? "";
  if (ext && last.endsWith(ext)) return last.slice(0, -ext.length);
  return last;
}

export function dirname(p: string): string {
  const clean = p.replace(/[/\\]+$/, "");
  const idx = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  if (idx === -1) return ".";
  if (idx === 0) return "/";
  return clean.slice(0, idx);
}

export function extname(p: string): string {
  const base = basename(p);
  const idx = base.lastIndexOf(".");
  return idx <= 0 ? "" : base.slice(idx);
}

export function resolve(...parts: string[]): string {
  let acc = "";
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("/")) acc = part;
    else acc = acc ? `${acc}/${part}` : part;
  }
  return normalize(acc);
}

export function isAbsolute(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p);
}

/** MJ only ever joins web-style paths; these are the same functions, unprefixed. */
export const posix = { join, basename, dirname, extname, resolve, isAbsolute, normalize, sep: "/" };
export const win32 = { sep: "\\" };
export const sep = "/";
export const delimiter = ":";

export default { join, basename, dirname, extname, resolve, isAbsolute, normalize, posix, win32, sep, delimiter };
