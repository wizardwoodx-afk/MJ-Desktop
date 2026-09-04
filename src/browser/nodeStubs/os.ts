/**
 * Browser stand-in for `node:os` — MJ 11.9.
 *
 * Same story as `./fs.ts`: 11.8.1 installed `{}` via a silently-swallowing `require()` catch, so
 * `os.tmpdir()` threw an opaque `TypeError` deep inside sandbox probing.
 *
 * `tmpdir` is the one member `src/mission/sandbox.ts` uses, and it has no honest browser answer —
 * there is no temp directory to hand out, and inventing "/tmp" would be a fabricated path that a
 * later caller might try to write to. So it throws, naming itself, and the sandbox probe's own
 * guard classifies the environment as UNMEASURED (the honest verdict) rather than ENFORCED.
 *
 * `platform` and `arch` are safe to answer: they describe the WebView host, which is knowable.
 */

export function tmpdir(): never {
  throw new Error(
    "node:os.tmpdir is not available in the MJ web build — the WebView exposes no temp directory. " +
      "Sandbox probing is a desktop capability; treat this environment as UNMEASURED.",
  );
}

export function platform(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Windows/i.test(ua)) return "win32";
  if (/Mac OS X|Macintosh/i.test(ua)) return "darwin";
  if (/Android/i.test(ua)) return "android";
  return "linux";
}

export function arch(): string {
  return "x64";
}

export function hostname(): string {
  return "mj-webview";
}

export const EOL = "\n";
export const type = () => "Browser";

export default { tmpdir, platform, arch, hostname, EOL, type };
