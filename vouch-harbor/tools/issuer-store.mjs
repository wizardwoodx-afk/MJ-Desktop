/**
 * A file-backed stand-in for the host's secret store.
 *
 * The real app keeps the issuer key in localStorage (browser) or the OS keychain
 * (Tauri). Under Node there is neither, so without this every run would mint a
 * fresh identity — and a receipt signed by yesterday's key would fail against
 * today's pinned key. That is correct verifier behaviour, and a broken test.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".issuer-store.json");

export function installLocalStorageShim() {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* first run */ }
  const persist = () => { try { fs.writeFileSync(file, JSON.stringify(data)); } catch { /* read-only */ } };
  globalThis.localStorage = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); persist(); },
    removeItem: (k) => { delete data[k]; persist(); },
  };
  return file;
}
