/**
 * Vouch — minimal Tauri IPC client (the native seam).
 *
 * Present ONLY in the Tauri host: the webview exposes
 * `window.__TAURI_INTERNALS__.invoke`. The web edition never sees it, so
 * every call is guarded and the engine degrades honestly to browser
 * storage / no notification — the same code, two hosts.
 *
 * The native host gives Vouch three things (see src-tauri/src/commands.rs):
 *   • secret_get / secret_set — the OS keychain for the Ed25519 issuer key
 *     (service "vouch", ref "vouch.issuerkey.v1"); the key never leaves the
 *     machine, and a memory-only fallback is reported as such
 *   • notify_approval — an OS notification when a run pauses at the human
 *     gate (the desktop says so even if the window is unfocused)
 *   • app_info — platform facts for the UI
 */

interface TauriInternals {
  invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>;
}


export interface SecretGetResult {
  present: boolean;
  value: string | null;
  /** true only when sealed in the OS keychain; false = process memory (lost at exit) */
  keychain: boolean;
}

export interface SecretSetResult {
  stored: boolean;
  keychain: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  native: boolean;
}

/** True when running inside the Tauri host (native desktop). */
export function isNativeHost(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

/* The host's internals are declared app-wide as `unknown` (src/vite-env.d.ts);
 * we narrow at the boundary instead of re-declaring the global. */
const invoke = (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  if (!internals) throw new Error("not in the native host — no __TAURI_INTERNALS__");
  return internals.invoke(cmd, args);
};

export const ipc = {
  async secretGet(secretRef: string): Promise<SecretGetResult> {
    return (await invoke("secret_get", { secretRef })) as SecretGetResult;
  },
  async secretSet(secretRef: string, value: string): Promise<SecretSetResult> {
    return (await invoke("secret_set", { secretRef, value })) as SecretSetResult;
  },
  async notifyApproval(title: string, body: string): Promise<void> {
    await invoke("notify_approval", { title, body });
  },
  async appInfo(): Promise<AppInfo> {
    return (await invoke("app_info")) as AppInfo;
  },
};

export {};
