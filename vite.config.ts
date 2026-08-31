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
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
