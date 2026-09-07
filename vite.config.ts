import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

/**
 * MJ 11.8.5 — how the Node builtins used by `src/mission/*` reach the WebView.
 *
 * `agentsMd`, `sandbox` and `teamExecutor` import `node:fs` / `node:os` / `node:path` because the
 * probe suites run them directly under Node, and they must test the real modules — never a double.
 *
 * 11.8.1 tried to solve the browser half at runtime with `require()` inside `try {} catch {}`. That
 * was wrong twice over: `require` is not in scope in ESM, so the catch fired under Node too (the
 * probes silently tested an empty object and the gate fell to 38/40), and the empty fallback let a
 * dead filesystem masquerade as an empty workspace.
 *
 * The correct seam is the bundler, not the runtime. These three aliases apply to the browser build
 * only — the probe runner invokes esbuild directly and never reads this file, so Node keeps the
 * genuine builtins. `path` is pure string logic and gets a faithful implementation; `fs` and `os`
 * cannot exist in a WebView and get stubs that THROW with a reason, so any degradation surfaces as
 * a stated cause instead of a silent zero.
 */
const browserBuiltin = (name: string): string =>
  fileURLToPath(new URL(`./src/browser/nodeStubs/${name}.ts`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Anchored regexes, deliberately: a bare string key like "node:fs" is a PREFIX match, so
  // `checkRunner.ts`'s `await import("node:fs/promises")` was being rewritten to
  // `…/nodeStubs/fs.ts/promises` and the build died on ENOTDIR. `$` pins each alias to the exact
  // specifier, and `fs/promises` is listed first so the intent reads top-down.
  // Every builtin `src/` reaches for, not just the three the first pass covered: `sandbox.ts`,
  // `checkRunner.ts` and `acp.ts` spawn processes and read their stdout, and an unaliased
  // `node:child_process` was being externalised into a message about the bundler rather than a
  // statement about the missing capability.
  resolve: {
    alias: [
      { find: /^node:fs\/promises$/, replacement: browserBuiltin("fs-promises") },
      { find: /^node:fs$/, replacement: browserBuiltin("fs") },
      { find: /^node:os$/, replacement: browserBuiltin("os") },
      { find: /^node:path$/, replacement: browserBuiltin("path") },
      { find: /^node:child_process$/, replacement: browserBuiltin("child_process") },
      { find: /^node:readline$/, replacement: browserBuiltin("readline") },
    ],
  },
  server: {
    port: 5173,
    strictPort: false,
    host: host || "0.0.0.0",
    allowedHosts: true,
    hmr: host ? { protocol: "ws", host, port: 5174 } : true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM == "windows" ? "chrome105" : "safari14",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // V10.1: the framework is now its own chunk. The single 596 kB bundle tripped Rollup's
    // warning on every build and forced a full re-download of React on every app release;
    // vendor code changes far less often than app code.
    //
    // V11.4.1: mission modules import node builtins (fs/path/…) behind typeof-guards — they
    // are dual-used by the node-run probes. The browser bundle externalizes those imports by
    // design, and Vite warned about each one on every build. The pattern is deliberate and
    // guarded, so the warning is acknowledged once here instead of spammed 40× per build.
    rollupOptions: {
      onwarn(warning, warn) {
        if (/has been externalized for browser compatibility/.test(String(warning?.message ?? ""))) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
