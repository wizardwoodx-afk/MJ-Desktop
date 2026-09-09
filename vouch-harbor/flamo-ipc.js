/* FLAMO — host bridge.
 *
 * One rule: the app must behave identically in the Tauri shell and in a plain
 * browser, and it must never pretend a native capability exists when it does
 * not. `withGlobalTauri: true` in tauri.conf.json exposes window.__TAURI__,
 * so there is no build step and no npm dependency.
 */

const T = globalThis.__TAURI__;
const isNative = Boolean(T?.core?.invoke);

async function invoke(cmd, args) {
  if (!isNative) return { ok: false, native: false, reason: "browser host — no Tauri bridge" };
  try {
    return { ok: true, native: true, value: await T.core.invoke(cmd, args) };
  } catch (e) {
    // A failed command is reported, never swallowed into a fake success.
    return { ok: false, native: true, reason: String(e) };
  }
}

/* The vouch ledger: native = a JSON file in the app data dir, browser = localStorage.
 * Both paths are honest about where the data actually lives. */
const KEY = "flamo.ledger.v1";

const Ledger = {
  where: isNative ? "app data dir (vouch-ledger.json)" : "browser localStorage",

  async load() {
    if (isNative) {
      const r = await invoke("ledger_load");
      if (r.ok && Array.isArray(r.value)) return r.value;
    }
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  },

  async save(rows) {
    if (isNative) {
      const r = await invoke("ledger_save", { rows });
      if (r.ok) return r.value;
    }
    try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* private mode */ }
    return { saved: rows.length, path: "localStorage" };
  },
};

async function appInfo() {
  if (isNative) {
    const r = await invoke("app_info");
    if (r.ok) return r.value;
  }
  return { name: "FLAMO", version: "0.1.0", native: false, cycle: "Vouch Cycle 2.0" };
}

window.FLAMO = { isNative, invoke, Ledger, appInfo };
