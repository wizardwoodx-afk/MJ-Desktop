/**
 * Browser stand-in for `node:crypto` — VH 16.4.
 *
 * Same story as `./fs.ts` and `./child_process.ts`: the engine's Node-side modules
 * (the drill, the mission loop) use the real builtin under Node/Tauri, and the
 * probe suites run the real modules — never a double. The WebView has no
 * `node:crypto`; the proof layer itself already uses the Web Crypto API
 * (`crypto.subtle`) where browser-native hashing is possible. The only member
 * reached through this module is `createHash` (the drill's attestation digest),
 * and it throws, naming itself, so a browser-side drill attempt degrades to a
 * stated cause instead of a silent hash. The desktop build never sees this
 * file.
 */

export function createHash(): never {
  throw new Error(
    "node:crypto is not available in the WebView — the drill runs on the Node/Tauri engine; " +
      "this is a browser stub, not a crypto implementation"
  );
}

export function randomBytes(): never {
  throw new Error(
    "node:crypto.randomBytes is not available in the WebView — browser stub; use the Web Crypto API"
  );
}
