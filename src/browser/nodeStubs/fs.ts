/**
 * Browser stand-in for `node:fs` — MJ 11.8.5.
 *
 * WHY THIS IS A THROWING STUB AND NOT AN EMPTY OBJECT
 *
 * 11.8.1 shipped `require('fs')` inside a `try { } catch { }` that replaced the module with `{}`.
 * Two things went wrong, and they compound:
 *
 *   1. In an ESM bundle `require` is not in scope, so the `try` ALWAYS threw — in Node too. The
 *      probe suites silently tested a stub (`fsSync.mkdirSync is not a function`) and the gate
 *      went 38/40 without anyone noticing the runtime had been amputated.
 *   2. `{}` fails *quietly*. `collectAgentsContext` wraps its `statSync` in a catch whose comment
 *      says "no file here — that is the normal case", so a systematic failure and an empty
 *      workspace became indistinguishable. MJ then planned a mission on missing ground truth and
 *      reported it as a clean result.
 *
 * MJ's honesty rules forbid that. There is no filesystem in a WebView: MJ does not bundle one and
 * will not pretend to. So every entry point here throws an error that names itself, and the
 * caller's own catch surfaces it as "AGENTS.md scan failed: …" — a visible reason instead of a
 * silent zero. The desktop build never sees this file; it gets the real `node:fs`, and the probe
 * suites exercise the real module.
 *
 * If a capability is genuinely needed in the WebView, the correct fix is a Tauri IPC command
 * (`fs_read` / `fs_write` / `fs_list` / `fs_mkdir` already exist), not a silent fallback here.
 */

const unavailable = (fn: string): never => {
  throw new Error(
    `node:fs.${fn} is not available in the MJ web build — the WebView has no filesystem. ` +
      `Use the Tauri desktop build, or route this call through the fs_* IPC commands.`,
  );
};

export function readFileSync(..._args: unknown[]): never {
  return unavailable("readFileSync");
}
export function writeFileSync(..._args: unknown[]): never {
  return unavailable("writeFileSync");
}
export function statSync(..._args: unknown[]): never {
  return unavailable("statSync");
}
export function readdirSync(..._args: unknown[]): never {
  return unavailable("readdirSync");
}
export function mkdirSync(..._args: unknown[]): never {
  return unavailable("mkdirSync");
}
export function mkdtempSync(..._args: unknown[]): never {
  return unavailable("mkdtempSync");
}
export function existsSync(_p: unknown): boolean {
  // Deliberately false, not a throw: existence checks are usually guards, and a thrown error in a
  // guard turns a soft "not here" into a hard failure. "Nothing exists" is the truthful answer for
  // a WebView — there is no filesystem to exist within.
  return false;
}
export function rmSync(..._args: unknown[]): never {
  return unavailable("rmSync");
}
export function renameSync(..._args: unknown[]): never {
  return unavailable("renameSync");
}

export default {
  readFileSync,
  writeFileSync,
  statSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  existsSync,
  rmSync,
  renameSync,
};
