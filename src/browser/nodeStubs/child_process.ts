/**
 * Browser stand-in for `node:child_process` — MJ 11.8.5.
 *
 * `sandbox.ts`, `checkRunner.ts` and `acp.ts` spawn real processes: the sandbox canaries, the
 * mission's own test commands, and ACP agents over stdio. None of that is possible in a WebView,
 * and none of it should be faked — a "successful" spawn that never ran would manufacture the exact
 * false success MJ's rules exist to prevent.
 *
 * Before this stub existed, Vite externalized the module and the browser build threw
 * "Module 'node:child_process' has been externalized for browser compatibility" at call time —
 * accurate, but it names a bundler detail instead of the capability that is missing. These throw
 * the reason instead: no process can be spawned here, so say so.
 *
 * `spawnSync`/`execFileSync` reject or throw rather than returning a plausible `{ code: 0 }`.
 * A fabricated exit code 0 is how an unrun check becomes a passing check.
 */

const unavailable = (fn: string): never => {
  throw new Error(
    `node:child_process.${fn} is not available in the MJ web build — a WebView cannot spawn ` +
      `processes. Sandbox probing, checkRunner and ACP agents are desktop capabilities. ` +
      `In the desktop build this call reaches the Tauri shell_exec / cli_invoke commands.`,
  );
};

export function spawn(..._args: unknown[]): never {
  return unavailable("spawn");
}
export function spawnSync(..._args: unknown[]): never {
  return unavailable("spawnSync");
}
export function exec(..._args: unknown[]): never {
  return unavailable("exec");
}
export function execSync(..._args: unknown[]): never {
  return unavailable("execSync");
}
export function execFile(..._args: unknown[]): never {
  return unavailable("execFile");
}
export function execFileSync(..._args: unknown[]): never {
  return unavailable("execFileSync");
}
export function fork(..._args: unknown[]): never {
  return unavailable("fork");
}

export default { spawn, spawnSync, exec, execSync, execFile, execFileSync, fork };
