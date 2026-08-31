// MJ headless diagnostics: attaches to the app's WebView2 via CDP and reports
// runtime errors, console output, and whether node cards exist in the DOM.
// Usage: node scripts/diagnose.mjs [--fix]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 9223;
const EXE = String.raw`D:\MJ\src-tauri\target\release\mj-desktop.exe`;

async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function waitForDevtools(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      return await getJson(`http://127.0.0.1:${PORT}/json/list`);
    } catch {
      await sleep(250);
    }
  }
  throw new Error("devtools endpoint never came up");
}

const proc = spawn(EXE, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  stdio: "ignore",
});

try {
  const targets = await waitForDevtools();
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target: " + JSON.stringify(targets.map((t) => t.type)));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const consoleLogs = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ");
      consoleLogs.push(`[${msg.params.type}] ${text}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      consoleLogs.push(`[EXCEPTION] ${d.text} ${d.exception?.description ?? ""}`);
    }
  };

  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send("Runtime.enable");
  await sleep(4000); // give the app time to bootstrap

  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };

  const report = await evalJs(`JSON.stringify({
      title: document.title,
      bodyLen: document.body.innerHTML.length,
      bootErrors: window.__mjErrors ?? [],
      nodeCards: document.querySelectorAll('.node-card').length,
      portAnchors: document.querySelectorAll('.port-anchor').length,
      wires: document.querySelectorAll('path.wire').length,
      navItems: document.querySelectorAll('.nav-item').length,
      hasCanvas: !!document.querySelector('.canvas-wrap'),
      hasTitlebar: !!document.querySelector('.titlebar'),
      rootChildCount: document.getElementById('root')?.children.length ?? -1,
      selectOptions: document.querySelectorAll('.titlebar select option').length,
    })`);

  console.log("=== REPORT ===");
  console.log(report);

  // Probe the zustand store through React fiber if present
  const storeProbe = await evalJs(`
    (() => {
      try {
        const root = document.getElementById('root');
        const key = Object.keys(root).find(k => k.startsWith('__reactContainer'));
        return key ? 'fiber-present' : 'no-fiber';
      } catch (e) { return 'probe-error ' + e.message; }
    })()
  `);
  console.log("=== FIBER ===", storeProbe);
  console.log("=== CONSOLE LOGS ===");
  for (const l of consoleLogs.slice(-30)) console.log(l);

  ws.close();
} finally {
  proc.kill();
}
