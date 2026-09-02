import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
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
