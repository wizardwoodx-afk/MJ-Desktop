#!/usr/bin/env node
/**
 * Build the MCP router engine bundle (tools/mcp-engine.mjs).
 *
 * Same discipline as the offline verification pack: one committed,
 * self-contained bundle that the stdio entry (tools/mcp.mjs) loads — no
 * build step needed at runtime, only Node. `probe/mcpRouter.test.ts`
 * rebuilds this bundle in a temp dir and byte-compares it against the
 * shipped one, so a stale bundle fails the gate.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const esbuild = path.join(root, "node_modules", ".bin", "esbuild");
execFileSync(esbuild, [
  "src/vouch/engine/mcpRouter.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  "--outfile=tools/mcp-engine.mjs",
  "--log-level=warning",
], { cwd: root, stdio: "inherit" });
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const bundlePath = path.join(root, "tools", "mcp-engine.mjs");
const sha = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");
writeFileSync(path.join(root, "tools", "mcp-engine.sha256"), `${sha}  tools/mcp-engine.mjs\n`);
console.log("mcp engine bundle: tools/mcp-engine.mjs + tools/mcp-engine.sha256 (commit both; probe/mcpRouter pins them)");
