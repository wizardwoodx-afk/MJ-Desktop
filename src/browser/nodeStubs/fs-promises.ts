/**
 * Browser stand-in for `node:fs/promises` — MJ 11.9.
 *
 * `src/mission/checkRunner.ts` reaches for the async filesystem lazily:
 *
 *     const { readFile } = await import("node:fs/promises");
 *
 * which is the right instinct — it keeps the Node dependency out of the module graph until a check
 * actually runs. It did mean the 11.8.1 `require()`-in-a-catch fix could never have covered it, and
 * it means the Vite alias has to exist for this specifier too (an anchored one, or `node:fs/promises`
 * would be rewritten into `…/fs.ts/promises`).
 *
 * Every export REJECTS rather than throwing synchronously: callers `await` these, so a rejected
 * promise is what their own `try { } catch { }` is shaped to receive. A synchronous throw inside an
 * async function rejects too, but being explicit keeps the failure mode obvious when reading this.
 *
 * Same rule as `./fs.ts`: name the capability in the error, never return a plausible empty value.
 */

const unavailable = (fn: string): Promise<never> =>
  Promise.reject(
    new Error(
      `node:fs/promises.${fn} is not available in the MJ web build — the WebView has no filesystem. ` +
        `Run checkRunner from the Tauri desktop build, where it executes real commands.`,
    ),
  );

export function readFile(..._args: unknown[]): Promise<never> {
  return unavailable("readFile");
}
export function writeFile(..._args: unknown[]): Promise<never> {
  return unavailable("writeFile");
}
export function stat(..._args: unknown[]): Promise<never> {
  return unavailable("stat");
}
export function readdir(..._args: unknown[]): Promise<never> {
  return unavailable("readdir");
}
export function mkdir(..._args: unknown[]): Promise<never> {
  return unavailable("mkdir");
}
export function rm(..._args: unknown[]): Promise<never> {
  return unavailable("rm");
}
export function access(..._args: unknown[]): Promise<never> {
  return unavailable("access");
}

export default { readFile, writeFile, stat, readdir, mkdir, rm, access };
