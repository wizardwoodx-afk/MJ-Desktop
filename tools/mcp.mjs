#!/usr/bin/env node
/**
 * Vouch Harbor — MCP capability router, stdio transport (16.2.0).
 *
 *   node tools/mcp.mjs          (or: npm run mcp)
 *
 * Speaks MCP (JSON-RPC 2.0, newline-delimited) on stdin/stdout. Wire the
 * server into any MCP client (Claude Desktop, an agent harness, your own
 * tooling) with stdio transport.
 *
 * EVERY capability call is routed through the product's governed pipeline
 * (risk classification → human gate on risky calls → signed receipt per
 * completed call). This entry point is a transport, not a back door: the
 * engine's single governed executor (runVouchToolCall) is the only route
 * to the tools. Risky calls return pending with an approval id — approve
 * or deny through this server's own approve_action / deny_action tools,
 * then poll call_status.
 *
 * The engine ships as the committed bundle tools/mcp-engine.mjs (rebuild +
 * byte-pin with: npm run mcp:build — same discipline as the offline pack).
 */
import { createInterface } from "node:readline";
import { serveMcpStdio } from "./mcp-engine.mjs";

const rl = createInterface({ input: process.stdin, terminal: false });
/* Event + promise-queue reader. (Deliberately NOT `for await (const line of rl)`:
 * returning from that loop destroys readline's line subscription, so the second
 * and later requests — which arrive as separate writes — would hang forever.
 * Observed live: initialize answers, tools/list never does.) */
const queue = [];
let waiter = null;
let ended = false;
rl.on("line", (line) => {
  if (waiter) {
    const w = waiter;
    waiter = null;
    w(line);
  } else {
    queue.push(line);
  }
});
rl.on("close", () => {
  ended = true;
  if (waiter) {
    const w = waiter;
    waiter = null;
    w(null);
  }
});

await serveMcpStdio(
  () =>
    queue.length > 0
      ? Promise.resolve(queue.shift())
      : ended
        ? Promise.resolve(null)
        : new Promise((resolve) => {
            waiter = resolve;
          }),
);
