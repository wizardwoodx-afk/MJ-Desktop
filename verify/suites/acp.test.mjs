import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/version.ts
var MJ_VERSION, MJ_VERSION_SHORT, MJ_TITLE;
var init_version = __esm({
  "src/version.ts"() {
    "use strict";
    MJ_VERSION = "11.9.0";
    MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");
    MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;
  }
});

// src/mission/sandbox.ts
var sandbox_exports = {};
__export(sandbox_exports, {
  detectPlatform: () => detectPlatform,
  sandboxProfileFor: () => sandboxProfileFor,
  scratchWorkspace: () => scratchWorkspace,
  scrubEnv: () => scrubEnv,
  verifyEnforcement: () => verifyEnforcement,
  wrapForSeat: () => wrapForSeat
});
import * as fsSync from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
function scrubEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    const upper = k.toUpperCase();
    const shaped = SCRUB_EXACT.has(upper) || SCRUB_SUFFIX.some((s) => upper.endsWith(s)) || // Token-shaped values (JWT / long opaque secrets) under innocent names.
    v.length >= 40 && /^[A-Za-z0-9_\-.=+/]+$/.test(v) || /^[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{12,}/.test(v);
    if (!shaped) out[k] = v;
  }
  return out;
}
function detectPlatform() {
  if (typeof process === "undefined" || !process.platform) return typeof navigator !== "undefined" ? "unknown" : "unknown";
  const p = process.platform;
  return p === "darwin" ? "macos" : p === "win32" ? "windows" : p === "linux" ? "linux" : "unknown";
}
function sandboxProfileFor(risk, workspace, platform = detectPlatform()) {
  const tier = risk === "LOW" ? "none" : risk === "MEDIUM" ? "fs" : "fs+net";
  const scrubbed = [...SCRUB_EXACT].sort();
  const base = {
    tier,
    platform,
    wrapper: [],
    scrubbedEnvKeys: scrubbed,
    canaries: [],
    note: ""
  };
  if (tier === "none") {
    return { ...base, note: "read-class task: no filesystem wrapper; credentials are still scrubbed from the child environment" };
  }
  if (platform === "linux") {
    const canaryPath = path.posix.join("/", "mj-sandbox-canary.txt");
    const wrapper = [
      "bwrap",
      "--ro-bind",
      "/",
      "/",
      "--bind",
      workspace,
      workspace,
      "--bind",
      os.tmpdir(),
      os.tmpdir(),
      "--dev",
      "/dev",
      "--proc",
      "/proc"
    ];
    if (tier === "fs+net") wrapper.push("--unshare-net");
    wrapper.push("--");
    return {
      ...base,
      wrapper,
      canaries: [
        {
          name: "write outside the workspace must fail",
          argv: [...wrapper, "sh", "-c", `echo mj-canary > ${canaryPath}`],
          mustFail: true
        },
        ...tier === "fs+net" ? [{ name: "network must be unreachable", argv: [...wrapper, "sh", "-c", "command -v curl >/dev/null && curl -m 2 -s https://example.com >/dev/null || false"], mustFail: true }] : []
      ],
      note: "bubblewrap profile: root read-only, workspace+tmp writable" + (tier === "fs+net" ? ", network namespace isolated" : "")
    };
  }
  if (platform === "macos") {
    const canaryPath = path.posix.join("/", "mj-sandbox-canary.txt");
    const profile = tier === "fs+net" ? `(version 1)(deny default)(allow process*)(allow file-read*)(allow file-write* (subpath "${workspace}") (subpath "${os.tmpdir()}"))(deny network*)` : `(version 1)(deny default)(allow process*)(allow file-read*)(allow file-write* (subpath "${workspace}") (subpath "${os.tmpdir()}"))`;
    return {
      ...base,
      wrapper: ["sandbox-exec", "-p", profile],
      canaries: [
        {
          name: "write outside the workspace must fail",
          argv: ["sandbox-exec", "-p", profile, "sh", "-c", `echo mj-canary > ${canaryPath}`],
          mustFail: true
        }
      ],
      note: "Seatbelt profile: workspace-only writes" + (tier === "fs+net" ? ", network denied" : "")
    };
  }
  return {
    ...base,
    note: platform === "windows" ? "no native Windows wrapper is shipped; run missions under WSL2 where the Linux profiles apply \u2014 this seat runs UNSANDBOXED and the UI labels it" : "no wrapper available for this platform; credentials are still scrubbed"
  };
}
async function verifyEnforcement(profile, timeoutMs = 8e3) {
  const evidence = [];
  if (profile.canaries.length === 0) {
    return { enforced: false, measured: false, evidence, note: profile.note };
  }
  const { execFile } = await import("node:child_process");
  let wrapperAbsent = false;
  for (const canary of profile.canaries) {
    const ran = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ failed: true, absent: false, detail: "timeout (treated as blocked)" }), timeoutMs);
      execFile(canary.argv[0], canary.argv.slice(1), { timeout: timeoutMs }, (err) => {
        clearTimeout(timer);
        const code = err?.code;
        const absent = Boolean(err) && typeof code === "string" && WRAPPER_UNAVAILABLE.has(code);
        resolve({
          failed: Boolean(err),
          absent,
          detail: absent ? `wrapper '${canary.argv[0]}' is not installed or not executable (${code}) \u2014 the canary never ran` : err ? (err.message.split("\n")[0] ?? "").slice(0, 120) : "exited 0"
        });
      });
    });
    if (ran.absent) wrapperAbsent = true;
    evidence.push({ name: canary.name, ran: !ran.absent, failedAsExpected: !ran.absent && ran.failed === canary.mustFail, detail: ran.detail });
  }
  const enforced = !wrapperAbsent && evidence.length > 0 && evidence.every((e) => e.ran && e.failedAsExpected);
  return {
    enforced,
    measured: !wrapperAbsent,
    evidence,
    note: wrapperAbsent ? `${profile.note}; wrapper unavailable on this machine (not installed or not executable) \u2014 enforcement UNMEASURED` : profile.note
  };
}
function wrapForSeat(risk, workspace, program, args, platform) {
  const profile = sandboxProfileFor(risk, workspace, platform);
  return { argv: profile.wrapper.length > 0 ? [...profile.wrapper, program, ...args] : [program, ...args], profile };
}
function scratchWorkspace() {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "mj-seat-"));
  return dir;
}
var SCRUB_EXACT, SCRUB_SUFFIX, WRAPPER_UNAVAILABLE;
var init_sandbox = __esm({
  "src/mission/sandbox.ts"() {
    "use strict";
    SCRUB_EXACT = /* @__PURE__ */ new Set([
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "GH_ENTERPRISE_TOKEN",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GOOGLE_API_KEY",
      "GEMINI_API_KEY",
      "XAI_API_KEY",
      "GROK_API_KEY",
      "OPENROUTER_API_KEY",
      "SLACK_BOT_TOKEN",
      "STRIPE_API_KEY",
      "NPM_TOKEN",
      "NODE_AUTH_TOKEN",
      "PYPI_TOKEN",
      "CARGO_REGISTRY_TOKEN",
      "HF_TOKEN",
      "VERCEL_TOKEN",
      "NETLIFY_AUTH_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "FIREBASE_TOKEN",
      "SSH_AUTH_SOCK",
      "GPG_PASSPHRASE",
      "MJ_UPDATER_KEY"
    ]);
    SCRUB_SUFFIX = ["_TOKEN", "_SECRET", "_API_KEY", "_APIKEY", "_PASSWORD", "_PRIVATE_KEY"];
    WRAPPER_UNAVAILABLE = /* @__PURE__ */ new Set(["ENOENT", "EACCES", "EPERM", "ENOEXEC"]);
  }
});

// node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var init_tslib_es6 = __esm({
  "node_modules/@tauri-apps/api/external/tslib/tslib.es6.js"() {
  }
});

// node_modules/@tauri-apps/api/core.js
var core_exports = {};
__export(core_exports, {
  Channel: () => Channel,
  PluginListener: () => PluginListener,
  Resource: () => Resource,
  SERIALIZE_TO_IPC_FN: () => SERIALIZE_TO_IPC_FN,
  addPluginListener: () => addPluginListener,
  checkPermissions: () => checkPermissions,
  convertFileSrc: () => convertFileSrc,
  invoke: () => invoke,
  isTauri: () => isTauri,
  requestPermissions: () => requestPermissions,
  transformCallback: () => transformCallback
});
function transformCallback(callback, once2 = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once2);
}
async function addPluginListener(plugin, event, cb) {
  const handler = new Channel(cb);
  try {
    await invoke(`plugin:${plugin}|register_listener`, {
      event,
      handler
    });
    return new PluginListener(plugin, event, handler.id);
  } catch {
    await invoke(`plugin:${plugin}|registerListener`, { event, handler });
    return new PluginListener(plugin, event, handler.id);
  }
}
async function checkPermissions(plugin) {
  return invoke(`plugin:${plugin}|check_permissions`);
}
async function requestPermissions(plugin) {
  return invoke(`plugin:${plugin}|request_permissions`);
}
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
function convertFileSrc(filePath, protocol = "asset") {
  return window.__TAURI_INTERNALS__.convertFileSrc(filePath, protocol);
}
function isTauri() {
  return !!(globalThis || window).isTauri;
}
var _Channel_onmessage, _Channel_nextMessageIndex, _Channel_pendingMessages, _Channel_messageEndIndex, _Resource_rid, SERIALIZE_TO_IPC_FN, Channel, PluginListener, Resource;
var init_core = __esm({
  "node_modules/@tauri-apps/api/core.js"() {
    init_tslib_es6();
    SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
    Channel = class {
      constructor(onmessage) {
        _Channel_onmessage.set(this, void 0);
        _Channel_nextMessageIndex.set(this, 0);
        _Channel_pendingMessages.set(this, []);
        _Channel_messageEndIndex.set(this, void 0);
        __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
        }), "f");
        this.id = transformCallback((rawMessage) => {
          const index = rawMessage.index;
          if ("end" in rawMessage) {
            if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
              this.cleanupCallback();
            } else {
              __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
            }
            return;
          }
          const message = rawMessage.message;
          if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
            __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
            __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
              const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
              delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            }
            if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
              this.cleanupCallback();
            }
          } else {
            __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
          }
        });
      }
      cleanupCallback() {
        window.__TAURI_INTERNALS__.unregisterCallback(this.id);
      }
      set onmessage(handler) {
        __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
      }
      get onmessage() {
        return __classPrivateFieldGet(this, _Channel_onmessage, "f");
      }
      [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
        return `__CHANNEL__:${this.id}`;
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    PluginListener = class {
      constructor(plugin, event, channelId) {
        this.plugin = plugin;
        this.event = event;
        this.channelId = channelId;
      }
      async unregister() {
        return invoke(`plugin:${this.plugin}|remove_listener`, {
          event: this.event,
          channelId: this.channelId
        });
      }
    };
    Resource = class {
      get rid() {
        return __classPrivateFieldGet(this, _Resource_rid, "f");
      }
      constructor(rid) {
        _Resource_rid.set(this, void 0);
        __classPrivateFieldSet(this, _Resource_rid, rid, "f");
      }
      /**
       * Destroys and cleans up this resource from memory.
       * **You should not call any method on this object anymore and should drop any reference to it.**
       */
      async close() {
        return invoke("plugin:resources|close", {
          rid: this.rid
        });
      }
    };
    _Resource_rid = /* @__PURE__ */ new WeakMap();
  }
});

// src/mission/acpTauri.ts
var acpTauri_exports = {};
__export(acpTauri_exports, {
  TauriAcpTransport: () => TauriAcpTransport
});
async function invoke2(cmd, args) {
  const { invoke: invoke3 } = await Promise.resolve().then(() => (init_core(), core_exports));
  return invoke3(cmd, args ?? {});
}
var sleep, TauriAcpTransport;
var init_acpTauri = __esm({
  "src/mission/acpTauri.ts"() {
    "use strict";
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    TauriAcpTransport = class {
      constructor(program, args, cwd) {
        this.program = program;
        this.args = args;
        this.cwd = cwd;
      }
      handle = null;
      running = false;
      async start(onLine, onExit) {
        this.handle = await invoke2("acp_open", {
          program: this.program,
          args: this.args,
          cwd: this.cwd ?? null
        });
        this.running = true;
        void this.pump(onLine, onExit);
      }
      async pump(onLine, onExit) {
        while (this.running && this.handle !== null) {
          const r = await invoke2("acp_recv", { handle: this.handle });
          if (r.line !== null) {
            onLine(r.line);
            continue;
          }
          if (r.exitCode !== null) {
            onExit(r.exitCode);
            return;
          }
          await sleep(15);
        }
      }
      send(line) {
        if (this.handle === null) throw new Error("acp: transport not started");
        void invoke2("acp_send", { handle: this.handle, line });
      }
      async stop() {
        this.running = false;
        if (this.handle !== null) {
          try {
            await invoke2("acp_close", { handle: this.handle });
          } catch {
          }
          this.handle = null;
        }
      }
    };
  }
});

// src/mission/acp.ts
var acp_exports = {};
__export(acp_exports, {
  AcpClient: () => AcpClient,
  AcpHarness: () => AcpHarness,
  NodeAcpTransport: () => NodeAcpTransport,
  acpInvocation: () => acpInvocation
});
function acpInvocation() {
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const program = env.MJ_ACP_BIN ?? "claude-code-acp";
  const args = (env.MJ_ACP_ARGS ?? "--stdio").split(" ").filter(Boolean);
  return { program, args };
}
async function defaultMissionDeny(task) {
  return !(task.mayRunShell || task.mayWriteFiles);
}
var NodeAcpTransport, PROTOCOL_VERSION, AcpClient, AcpHarness;
var init_acp = __esm({
  "src/mission/acp.ts"() {
    "use strict";
    init_version();
    NodeAcpTransport = class {
      constructor(program, args, cwd, env) {
        this.program = program;
        this.args = args;
        this.cwd = cwd;
        this.env = env;
      }
      child = null;
      async start(onLine, onExit) {
        const { spawn } = await import("node:child_process");
        const { createInterface } = await import("node:readline");
        const child = spawn(this.program, this.args, {
          cwd: this.cwd,
          stdio: ["pipe", "pipe", "pipe"],
          ...this.env ? { env: this.env } : {}
        });
        this.child = child;
        createInterface({ input: child.stdout }).on("line", onLine);
        createInterface({ input: child.stderr }).on("line", () => {
        });
        child.on("exit", (code) => onExit(code));
      }
      send(line) {
        this.child?.stdin.write(line + "\n");
      }
      async stop() {
        this.child?.stdin.end();
        this.child?.kill();
        this.child = null;
      }
    };
    PROTOCOL_VERSION = 1;
    AcpClient = class {
      constructor(transport, opts = {}) {
        this.transport = transport;
        this.opts = opts;
      }
      nextId = 1;
      pending = /* @__PURE__ */ new Map();
      exited = null;
      initialized = false;
      exitCode = null;
      events = [];
      emit(e) {
        this.events.push(e);
        this.opts.onEvent?.(e);
      }
      rawSend(obj) {
        this.transport.send(JSON.stringify(obj));
      }
      request(method, params) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`acp: ${method} timed out after ${this.opts.timeoutMs ?? 12e4}ms`));
          }, this.opts.timeoutMs ?? 12e4);
          this.pending.set(id, {
            resolve: (v) => resolve(v),
            reject,
            timer
          });
          this.rawSend({ jsonrpc: "2.0", id, method, params });
        });
      }
      /** Wire the transport and perform the initialize handshake. */
      async connect() {
        await this.transport.start(
          (line) => this.onLine(line),
          (code) => {
            this.exitCode = code;
            this.exited?.(code);
          }
        );
        const result = await this.request("initialize", {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
          clientInfo: this.opts.clientInfo ?? { name: "MJ", version: MJ_VERSION }
        });
        this.initialized = true;
        const agent = result.agentInfo;
        return {
          protocolVersion: Number(result.protocolVersion ?? PROTOCOL_VERSION),
          agentName: agent?.name,
          agentVersion: agent?.version
        };
      }
      async newSession(cwd) {
        if (!this.initialized) throw new Error("acp: connect() must run before newSession()");
        const result = await this.request("session/new", { cwd, mcpServers: [] });
        if (!result?.sessionId) throw new Error("acp: session/new returned no sessionId");
        return result.sessionId;
      }
      cancel(sessionId) {
        this.rawSend({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
      }
      /** Drive one turn. Resolves with the agent's final text and the stop reason. */
      async prompt(sessionId, text) {
        const chunks = [];
        const saved = this.opts.onEvent;
        this.opts.onEvent = (e) => {
          if (e.type === "message") chunks.push(e.text);
          saved?.(e);
        };
        try {
          const result = await this.request("session/prompt", {
            sessionId,
            prompt: [{ type: "text", text }]
          });
          return { stopReason: String(result.stopReason ?? "end_turn"), text: chunks.join("") };
        } finally {
          this.opts.onEvent = saved;
        }
      }
      async shutdown() {
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error("acp: client shut down"));
        }
        this.pending.clear();
        await this.transport.stop();
      }
      get exitWith() {
        return this.exitCode;
      }
      /* -------------------------------------------------------------- inbound */
      onLine(line) {
        const trimmed = line.trim();
        if (!trimmed) return;
        let msg;
        try {
          msg = JSON.parse(trimmed);
        } catch {
          this.emit({ type: "protocol_error", detail: `unparseable line ignored (${trimmed.slice(0, 40)}\u2026)` });
          return;
        }
        if (msg.id !== void 0 && typeof msg.id !== "object" && (msg.result !== void 0 || msg.error !== void 0)) {
          const p = this.pending.get(msg.id);
          if (!p) return;
          this.pending.delete(msg.id);
          clearTimeout(p.timer);
          if (msg.error !== void 0) {
            const err = msg.error;
            p.reject(new Error(`acp: ${err.message ?? "protocol error"}`));
          } else {
            p.resolve(msg.result);
          }
          return;
        }
        const method = String(msg.method ?? "");
        const params = msg.params ?? {};
        if (method === "session/update") {
          this.onUpdate(params);
          return;
        }
        if (method === "session/request_permission") {
          void this.onPermission(params, msg.id);
          return;
        }
        if (method === "fs/read_text_file" || method === "fs/write_text_file" || method.startsWith("terminal/")) {
          void this.onAgentRequest(method, params, msg.id);
          return;
        }
        if (msg.id !== void 0) {
          this.rawSend({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `MJ does not implement ${method}` } });
        }
      }
      onUpdate(params) {
        const update = params.update;
        const kind = String(update?.sessionUpdate ?? update ?? "");
        const content = update?.content;
        switch (kind) {
          case "agent_message_chunk":
            if (content?.text) this.emit({ type: "message", text: content.text });
            break;
          case "agent_thought_chunk":
          case "thought_message_chunk":
            if (content?.text) this.emit({ type: "thought", text: content.text });
            break;
          case "tool_call":
            this.emit({
              type: "tool_call",
              toolCallId: String(update?.toolCallId ?? ""),
              title: String(update?.title ?? ""),
              kind: update?.kind,
              status: update?.status
            });
            break;
          case "tool_call_update":
            this.emit({
              type: "tool_call_update",
              toolCallId: String(update?.toolCallId ?? ""),
              status: update?.status
            });
            break;
          case "plan":
            this.emit({
              type: "plan",
              entries: Array.isArray(update?.entries) ? update.entries.map((e) => ({
                content: String(e.content ?? ""),
                status: e.status
              })) : []
            });
            break;
          default:
            this.emit({ type: "protocol_error", detail: `unknown session/update kind: ${kind || "(none)"}` });
        }
      }
      async onPermission(params, requestId) {
        const options = params.options ?? [];
        const toolCall = params.toolCall;
        const sessionId = String(params.sessionId ?? "");
        const respond = (outcome) => {
          if (requestId !== void 0) {
            this.rawSend({ jsonrpc: "2.0", id: requestId, result: { outcome } });
          }
        };
        const decided = await this.opts.decidePermission?.({ sessionId, options, toolCall, respond }) ?? "deny";
        const allow = decided === "allow";
        const pick = options.find((o) => o.kind === (allow ? "allow_once" : "reject_once")) ?? options.find((o) => allow ? o.kind?.startsWith("allow") : o.kind?.startsWith("reject")) ?? null;
        this.emit({
          type: "permission_request",
          toolCallTitle: toolCall?.title,
          decided,
          by: this.opts.decidePermission ? "mission-approval" : "default-deny"
        });
        respond(pick ? { outcome: "selected", optionId: pick.optionId } : { outcome: "cancelled" });
      }
      async onAgentRequest(method, params, id) {
        try {
          if (method === "fs/read_text_file" && this.opts.readTextFile) {
            const content = await this.opts.readTextFile(String(params.sessionId ?? ""), String(params.path ?? ""));
            if (content !== null) {
              this.rawSend({ jsonrpc: "2.0", id, result: { content } });
              return;
            }
          }
          if (method === "fs/write_text_file" && this.opts.writeTextFile) {
            const okWrite = await this.opts.writeTextFile(
              String(params.sessionId ?? ""),
              String(params.path ?? ""),
              String(params.content ?? "")
            );
            this.rawSend({ jsonrpc: "2.0", id, result: {} });
            if (!okWrite) this.emit({ type: "agent_request_refused", method, reason: "handler returned false" });
            return;
          }
          this.emit({
            type: "agent_request_refused",
            method,
            reason: "no handler attached \u2014 MJ does not grant unconfigured capability"
          });
          this.rawSend({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `MJ does not grant ${method} in this session` }
          });
        } catch (e) {
          this.rawSend({
            jsonrpc: "2.0",
            id,
            error: { code: -32e3, message: e instanceof Error ? e.message : "handler failed" }
          });
        }
      }
    };
    AcpHarness = class _AcpHarness {
      simulated = false;
      id = "acp";
      name = "ACP agent (Agent Client Protocol)";
      installHint = "Provide any ACP-compliant agent: set MJ_ACP_BIN (e.g. claude-code-acp, or gemini with --experimental-acp). npm i -g @zed-industries/claude-code-acp is a common bridge.";
      languages = ["*"];
      strengths = ["streaming", "permission gating", "plan visibility", "one protocol for many agents"];
      canEditFiles = true;
      canRunTests = true;
      capabilities = ["acp", "streaming", "permission-requests", "plan", "tool-call-events"];
      supports(_task) {
        return true;
      }
      prepare(task) {
        void task;
        return acpInvocation();
      }
      /** Optional event sink — missions attach the flight recorder here. */
      static eventSink = null;
      async invoke(task) {
        const started = Date.now();
        const nodeHost = typeof window === "undefined";
        const tauriHost = typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
        if (!nodeHost && !tauriHost) {
          return {
            ok: false,
            text: "",
            exitCode: null,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: false,
            detail: "not-executed",
            error: "ACP agents are spawned as processes; the browser preview cannot host them. Run the native desktop build (npm run tauri)."
          };
        }
        const { program, args } = this.prepare(task);
        let client = null;
        try {
          const seatProgram = program;
          const { scrubEnv: scrubEnv2 } = await Promise.resolve().then(() => (init_sandbox(), sandbox_exports));
          const scrubbedEnv = nodeHost ? scrubEnv2(process.env) : void 0;
          const transport = nodeHost ? new NodeAcpTransport(seatProgram, args, task.cwd, scrubbedEnv) : await (async () => {
            const { TauriAcpTransport: TauriAcpTransport2 } = await Promise.resolve().then(() => (init_acpTauri(), acpTauri_exports));
            return new TauriAcpTransport2(seatProgram, args, task.cwd);
          })();
          client = new AcpClient(transport, {
            decidePermission: async () => {
              const denied2 = await defaultMissionDeny(task);
              return denied2 ? "deny" : "allow";
            },
            onEvent: (e) => _AcpHarness.eventSink?.(e)
          });
          await client.connect();
          const sessionId = await client.newSession(task.cwd ?? ".");
          const preamble = task.grantedPermissions ? Object.entries(task.grantedPermissions).filter(([, v]) => v).map(([k]) => `- may ${k}`).join("\n") : "- workspace-only; everything else is denied by default";
          const turn = await client.prompt(sessionId, `${task.prompt}

[Permissions granted for this task]
${preamble}`);
          const tools = client.events.filter((e) => e.type === "tool_call").length;
          const perms = client.events.filter((e) => e.type === "permission_request");
          const denied = perms.filter((p) => p.decided === "deny").length;
          const okTurn = turn.stopReason === "end_turn" && turn.text.trim().length > 0;
          return {
            ok: okTurn,
            text: turn.text,
            exitCode: okTurn ? 0 : client.exitWith ?? 1,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: false,
            detail: `acp stop=${turn.stopReason} tools=${tools} perms=${denied}/${perms.length} cost=unmeasured`,
            error: okTurn ? null : `agent stopped with ${turn.stopReason} and no text`
          };
        } catch (e) {
          return {
            ok: false,
            text: "",
            exitCode: client?.exitWith ?? null,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: false,
            detail: "spawn-failed",
            error: e instanceof Error ? e.message : String(e)
          };
        } finally {
          await client?.shutdown();
        }
      }
    };
  }
});

// src/domain/harness.ts
function isCustomHarness(id) {
  return id.startsWith("custom:");
}
function getCustomHarness(id) {
  return customRegistry.get(id);
}
var HARNESSES, HARNESS_BY_ID, HARNESS_OPTIONS, customRegistry;
var init_harness = __esm({
  "src/domain/harness.ts"() {
    "use strict";
    HARNESSES = [
      {
        id: "acp",
        name: "ACP agent (one wire, many agents)",
        bins: ["claude-code-acp"],
        argv: ["--stdio"],
        install: "Set MJ_ACP_BIN to any ACP-compliant agent (e.g. claude-code-acp, or gemini --experimental-acp). npm i -g @zed-industries/claude-code-acp bridges Claude Code.",
        notes: "Agent Client Protocol (Zed + JetBrains): JSON-RPC over stdio with streaming, tool-call events and permission requests. One adapter instead of one parser per CLI. Grok Build also speaks ACP natively.",
        source: "agentclientprotocol.com; exercised by probe/acp.test.ts"
      },
      {
        id: "hermes",
        name: "Hermes Agent (vendored)",
        bins: ["hermes"],
        argv: ["--print", "$PROMPT"],
        install: "Install Hermes Agent (Nous) so `hermes` is on PATH, or use the in-process MJ Hermes loop (default).",
        notes: "Each MJ agent node is a Hermes-class session. If the CLI is missing, MJ runs the in-process tool loop against a provider key / Ollama."
      },
      {
        id: "claude",
        name: "Claude Code",
        bins: ["claude"],
        argv: ["-p", "$PROMPT", "--output-format", "text"],
        install: "npm install -g @anthropic-ai/claude-code   then   claude  (login)",
        notes: "Native Anthropic coding agent. Uses your Claude Code subscription (Pro/Max).",
        source: "docs.anthropic.com \u2014 checked 2026-09"
      },
      {
        id: "codex",
        name: "OpenAI Codex CLI",
        bins: ["codex"],
        argv: ["exec", "--skip-git-repo-check", "$PROMPT"],
        install: "npm install -g @openai/codex   then   codex login",
        notes: "OpenAI Codex harness. Uses your ChatGPT/Codex auth; --oss runs local Ollama models.",
        source: "github.com/openai/codex \u2014 checked 2026-09"
      },
      {
        id: "opencode",
        name: "OpenCode",
        bins: ["opencode"],
        argv: ["run", "$PROMPT"],
        install: "npm install -g opencode-ai   then   opencode",
        notes: "Open-source coding agent. 75+ providers, bring your own keys, fully offline. Plan/Build agent modes map onto MJ's read/write policies.",
        source: "opencode.ai docs \u2014 checked 2026-09"
      },
      {
        id: "openclaude",
        name: "OpenClaude",
        bins: ["openclaude"],
        argv: ["-p", "$PROMPT"],
        install: "npm install -g @gitlawb/openclaude@latest   then   openclaude   (/provider to set up a backend)",
        notes: "Open-source Claude-Code-shaped CLI that runs on OpenAI-compatible APIs, Gemini, GitHub Models, Codex OAuth or local Ollama \u2014 no Claude subscription needed. Config lives in ~/.openclaude, never reads ~/.claude.",
        source: "github.com/Gitlawb/openclaude \u2014 checked 2026-09 (30.9k stars; -p headless is community-verified, --bg for detached runs)"
      },
      {
        id: "copilot",
        name: "GitHub Copilot CLI",
        bins: ["copilot"],
        argv: ["-p", "$PROMPT", "-s"],
        install: "npm install -g @github/copilot   (or winget install GitHub.Copilot / brew install --cask copilot-cli)   then   copilot login",
        notes: "GitHub's terminal-first Copilot agent. -p runs one prompt non-interactively; -s prints only the response. Uses Copilot plan credits; COPILOT_GITHUB_TOKEN authenticates headless CI.",
        source: "docs.github.com/en/copilot/get-started/cli-quickstart \u2014 checked 2026-09"
      },
      {
        id: "cursor",
        name: "Cursor Agent",
        bins: ["cursor-agent", "agent"],
        argv: ["-p", "$PROMPT"],
        install: "Install Cursor, then enable the agent CLI (cursor-agent on PATH)",
        notes: "Cursor's agent CLI. Uses Cursor auth."
      },
      {
        id: "grok",
        name: "Grok Build (xAI)",
        bins: ["grok"],
        argv: ["exec", "$PROMPT"],
        install: "curl -fsSL https://x.ai/cli/install.sh | bash   (Windows: irm https://x.ai/cli/install.ps1 | iex)   then   grok   (SuperGrok Heavy login, or GROK_CODE_XAI_API_KEY for headless)",
        notes: "xAI's terminal coding agent: up to 8 parallel subagents, Plan Mode, ACP support, AGENTS.md/hooks/skills compatibility. `grok exec` is the documented non-interactive mode; `-p` also runs headless.",
        source: "x.ai/build + docs.x.ai \u2014 checked 2026-09 (Grok 4.6 default since 2026-08-12)"
      },
      {
        id: "cline",
        name: "Cline",
        bins: ["cline"],
        argv: ["$PROMPT"],
        install: "Install the Cline CLI binary on PATH (the VS Code extension alone cannot be spawned from MJ)",
        notes: "Cline's autonomous plan/act agent. BYO model. Only the CLI binary is spawnable; the VS Code extension is not.",
        source: "cline.bot \u2014 CLI availability is community-reported"
      },
      {
        id: "kilo",
        name: "Kilo Code",
        bins: ["kilo"],
        argv: ["run", "$PROMPT"],
        install: "Install Kilo Code CLI (npm i -g kilocode-cli or from kilo.ai)   then   kilo",
        notes: "Kilo CLI: 500+ models via Kilo Gateway, direct provider keys, BYOK and local/offline models. `kilo run` is the headless one-shot mode; `kilo serve` exposes it as a service.",
        source: "kilo.ai/docs \u2014 checked 2026-09"
      },
      {
        id: "aider",
        name: "Aider AI Pair Programmer",
        bins: ["aider"],
        argv: ["--yes", "--no-auto-commits", "--message", "$PROMPT"],
        install: "pip install aider-chat   then   aider",
        notes: "Git-integrated AI pair programmer. Edits directly in git worktrees."
      },
      {
        id: "gemini",
        name: "Google Gemini CLI",
        bins: ["gemini"],
        argv: ["-p", "$PROMPT"],
        install: "npm install -g @google/gemini-cli   then   gemini   (Google account auth)",
        notes: "Gemini 3.x with 1M-token context. Paid/Code Assist tiers keep Gemini CLI after the Antigravity cutover (2026-06-18); unpaid tiers move to Antigravity.",
        source: "github.com/google-gemini/gemini-cli \u2014 checked 2026-09"
      },
      {
        id: "antigravity",
        name: "Google Antigravity CLI (agy)",
        bins: ["agy"],
        argv: ["-p", "$PROMPT"],
        install: "curl -fsSL https://antigravity.google/cli/install.sh | bash   (Windows: irm https://antigravity.google/cli/install.ps1 | iex)",
        notes: "V11.6.1: the shipped binary is `agy` \u2014 a closed-source Go executable from Antigravity 2.0 (2026-05-19), not `antigravity`. Individual-tier replacement for Gemini CLI since the 2026-06-18 cutover; paid Code Assist keeps `gemini`. Headless prompt flag is community-graded (Gemini heritage) \u2014 `agy --help` decides.",
        source: "antigravity.google/docs/gcli-migration + 2026 cutover coverage (checked 2026-09); binary verified, flags community-graded"
      },
      {
        id: "amp",
        name: "Amp (Sourcegraph)",
        bins: ["amp"],
        argv: ["-x", "$PROMPT"],
        install: "npm install -g @sourcegraph/amp   then   amp login",
        notes: 'V11.6.1: execute mode is `amp -x "<prompt>"` \u2014 the documented non-interactive single-shot mode (ampcode.com/docs/cli/execute-mode). Piping `command | amp` also works. The old `--headless` mapping conflated runner mode (`--no-tui`) with execute mode.',
        source: "ampcode.com/docs + sourcegraph/amp-examples-and-guides CLI guide (checked 2026-09)"
      },
      {
        id: "crush",
        name: "Crush (Charm)",
        bins: ["crush"],
        argv: ["run", "$PROMPT"],
        install: "npm install -g @charmbracelet/crush   (or brew install charmbracelet/crush/crush)   then   crush",
        notes: "Charm's beautiful TUI coding agent, LSP-aware, multi-provider. `crush run` executes a prompt non-interactively.",
        source: "github.com/charmbracelet/crush \u2014 community-graded flags"
      },
      {
        id: "openhands",
        name: "OpenHands",
        bins: ["openhands"],
        argv: ["--headless", "-t", "$PROMPT"],
        install: "pip install openhands   then   openhands login   (or configure any LLM)",
        notes: 'V11.6.1: the V1 CLI headless mode is `openhands --headless -t "<task>"` (pypi.org/project/openhands, docs.openhands.dev). `--json` streams JSONL events; `-f` takes a task file. The old `solve` mapping was a pre-V1 design.',
        source: "github.com/All-Hands-AI/OpenHands \u2014 checked 2026-09"
      },
      {
        id: "goose",
        name: "Goose (Block)",
        bins: ["goose"],
        argv: ["run", "--text", "$PROMPT"],
        install: "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash",
        notes: "Block's open-source extensible AI developer agent with 70+ MCP extensions."
      },
      {
        id: "qwen",
        name: "Qwen Code",
        bins: ["qwen"],
        argv: ["-p", "$PROMPT"],
        install: "npm install -g @qwen-ai/qwen-code   then   qwen   (API key or Coding Plan)",
        notes: "Alibaba Qwen3-Coder terminal agent: OpenAI-compatible endpoints, Anthropic, Gemini, Ollama, vLLM. Note: the free OAuth tier ended 2026-04-15.",
        source: "github.com/QwenLM/qwen-code \u2014 checked 2026-09"
      },
      {
        id: "amazonq",
        name: "Amazon Q / Kiro CLI",
        bins: ["kiro-cli", "q"],
        argv: ["chat", "--no-interactive", "$PROMPT"],
        install: "Install Amazon Q Developer CLI via Homebrew/WinGet or AWS CLI",
        notes: "AWS enterprise terminal coding agent with Bedrock model routing."
      },
      {
        id: "droid",
        name: "Droid (Factory)",
        bins: ["droid"],
        argv: ["exec", "$PROMPT"],
        install: "curl -fsSL https://app.factory.ai/cli | sh   (Linux also needs xdg-utils)",
        notes: "V11.7.1: `droid exec \"<prompt>\"` is the vendor-documented non-interactive single-pass mode. The DEFAULT is spec-mode \u2014 read-only operations only \u2014 so MJ's read-only policy needs no flag at all; writes compose `--auto low` (the vendor's example tier; risk tiers gate what may run). `-f <file>` reads the prompt from a file, `-o` sets the output format.",
        source: "docs.factory.ai/droid-exec/overview (checked 2026-09) \u2014 vendor-documented headless mode"
      },
      {
        id: "kimi",
        name: "Kimi Code (Moonshot)",
        bins: ["kimi"],
        argv: ["-p", "$PROMPT"],
        install: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash   (or: npm install -g @moonshot-ai/kimi-code)",
        notes: 'V11.7.1: `kimi -p "<prompt>"` runs a single prompt non-interactively (the CLI\'s finalizeHeadlessRun exits the process after completion). `--output-format stream-json` emits JSONL events; `--yolo` auto-approves regular tool calls; `--auto` is the no-questions permission mode; `-S <id>` resumes a session by id. Swarm/goal modes are interactive concepts MJ does not compose.',
        source: "kimi.ai/resources/kimi-code-cheat-sheet + moonshotai/kimi-code (checked 2026-09) \u2014 vendor-documented prompt mode"
      },
      {
        id: "auggie",
        name: "Auggie (Augment Code)",
        bins: ["auggie"],
        argv: ["--print", "$PROMPT"],
        install: "npm install -g @augmentcode/auggie   then   auggie login",
        notes: 'V11.7.1: `auggie --print "<instruction>"` is print mode \u2014 one instruction, no UI, exits (the vendor\'s own automation workflow). `--quiet` shows only the final message, `--output-format json` structures the response, `--ask` is a genuine read-only mode (retrieval and non-editing tools only) that is documented as its own mode rather than a --print modifier. Non-interactive mode can be disabled by enterprise agreement. `--acp` exposes Auggie as an ACP agent.',
        source: "docs.augmentcode.com/cli/reference (checked 2026-09) \u2014 vendor-documented print mode"
      },
      {
        id: "warp",
        name: "Warp Oz Agent CLI",
        bins: ["oz"],
        argv: ["agent", "run", "--prompt", "$PROMPT"],
        install: "Ships with Warp 2026 (Command Palette \u2192 Install Warp CLI), or: brew tap warpdotdev/warp && brew install --cask warp-cli   then   oz login",
        notes: "V11.7.1: Warp's agent infrastructure has its own CLI, `oz`. `oz agent run --prompt` starts a LOCAL agent run \u2014 that is what MJ spawns. `oz agent run-cloud` is Warp cloud infrastructure (needs --environment) and is deliberately NOT composed. WARP_API_KEY authenticates headless servers/CI. The 2025-era `warp agent run --prompt` surface still exists on the `warp` binary; the Linux desktop launcher is `warp-terminal` \u2014 neither is the agent CLI MJ detects.",
        source: "docs.warp.dev/reference/cli (checked 2026-09) \u2014 vendor-documented local agent run"
      },
      {
        id: "llm",
        name: "Direct LLM (API / Ollama)",
        bins: [],
        argv: [],
        install: "Save a provider key in MJ \u2192 Providers, or run Ollama locally",
        notes: "Not a coding harness. Calls the chat API with the composed agent prompt."
      }
    ];
    HARNESS_BY_ID = new Map(HARNESSES.map((h) => [h.id, h]));
    HARNESS_OPTIONS = HARNESSES.map((h) => h.id);
    customRegistry = /* @__PURE__ */ new Map();
  }
});

// src/mission/agentCapabilities.ts
function syntheticCustomCaps(id, spec) {
  return {
    id,
    name: `${spec.name} (custom)`,
    bins: [spec.bin],
    install: "Teams -> Connect -> Custom harnesses",
    prompt: { argv: spec.argv, confidence: "community", source: "user-registered harness \u2014 MJ verified none of its flags" },
    json: null,
    readOnly: null,
    write: null,
    fullAuto: null,
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: null,
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["User-registered harness: MJ verified none of its flags. Read-only is advisory."]
  };
}
function unregisteredCustomCaps(id) {
  return {
    id,
    name: `Custom harness "${id}"`,
    bins: [],
    install: "Teams -> Connect -> Custom harnesses (re-add it, then recompile)",
    prompt: { argv: [], confidence: "unverified", source: "not registered (anymore)" },
    json: null,
    readOnly: null,
    write: null,
    fullAuto: null,
    maxTurns: null,
    timeout: null,
    outputSchema: null,
    worktree: null,
    cwd: null,
    model: null,
    resume: null,
    sessionStart: null,
    noAutoUpdate: null,
    filters: null,
    cost: null,
    enforcedReadOnly: false,
    gotchas: ["This harness is not registered (anymore); it cannot run until re-added in Teams -> Connect."]
  };
}
function resolveCaps(harness) {
  if (isCustomHarness(harness)) {
    const spec = getCustomHarness(harness);
    return spec ? { caps: syntheticCustomCaps(harness, spec), custom: true, registered: true } : { caps: unregisteredCustomCaps(harness), custom: true, registered: false };
  }
  const caps = AGENT_CAPABILITIES[harness];
  return caps ? { caps, custom: false, registered: true } : { caps: unregisteredCustomCaps(harness), custom: false, registered: false };
}
function enforcedReadOnly(id) {
  const caps = AGENT_CAPABILITIES[id];
  return caps ? caps.enforcedReadOnly : false;
}
var AGENT_CAPABILITIES, EXECUTABLE_HARNESSES;
var init_agentCapabilities = __esm({
  "src/mission/agentCapabilities.ts"() {
    "use strict";
    init_harness();
    AGENT_CAPABILITIES = {
      acp: {
        id: "acp",
        name: "ACP agent (Agent Client Protocol)",
        bins: ["claude-code-acp"],
        install: "Set MJ_ACP_BIN to any ACP-compliant agent binary (claude-code-acp bridges Claude Code; gemini --experimental-acp bridges Gemini).",
        prompt: { argv: null, confidence: "docs", source: "ACP spec (agentclientprotocol.com): the prompt travels as session/prompt ContentBlock[], not argv. Conformance exercised by probe/acp.test.ts against a scripted agent." },
        json: { argv: null, kind: "ndjson", confidence: "docs", source: "ACP streams structured session/update events (agent_message_chunk, tool_call, plan) over newline-delimited JSON \u2014 there is no JSON output flag to pass." },
        readOnly: { argv: null, confidence: "docs", source: "ACP models permissions natively: session/request_permission. MJ's mission policy answers it (default: deny) instead of passing a CLI flag." },
        write: { argv: null, confidence: "docs", source: "Writes happen through fs/write_text_file or the agent's own tools, each gated by session/request_permission." },
        fullAuto: { argv: null, confidence: "unverified", source: "ACP has no skip-permissions primitive and MJ will not emulate one. Autonomy comes from the mission policy, not the wire." },
        maxTurns: { argv: null, confidence: "docs", source: "No turn-cap in the protocol; MJ's CapLedger enforces the wall clock and MJ cancels via session/cancel." },
        timeout: { argv: null, confidence: "docs", source: "Protocol-level: client-side request timeout + session/cancel. Verified in probe/acp.test.ts." },
        outputSchema: { argv: null, confidence: "unverified", source: "No schema primitive in ACP v1; structured output is the mission's job, not the transport's." },
        worktree: { argv: null, confidence: "docs", source: "session/new takes cwd \u2014 MJ points the session at its prepared worktree, as with any CLI." },
        cwd: { argv: null, confidence: "docs", source: "session/new { cwd, mcpServers } \u2014 first-class in the protocol, unlike most CLIs." },
        model: { argv: null, confidence: "docs", source: "session/new may return models/modes; session/set_mode switches. Not required for a first turn." },
        resume: { argv: ["session/load"], confidence: "docs", source: "session/load resumes a session by id \u2014 MJ does not use it yet; every mission seat is a fresh session." },
        sessionStart: { argv: null, confidence: "docs", source: "Sessions are created per seat via session/new; there is nothing to pre-create." },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "Update behavior belongs to the agent binary, not the protocol." },
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: [
          "ACP is a protocol, not a binary: what is verified is MJ's client (probe/acp.test.ts), not any particular agent's server. Per-agent verification stays on the Proof page's live-binary ledger.",
          "Newline-delimited JSON: a chatty stderr is fine, but any agent that prints non-JSON to stdout breaks the stream \u2014 MJ counts such lines as protocol_error events instead of crashing."
        ]
      },
      claude: {
        id: "claude",
        name: "Claude Code",
        bins: ["claude"],
        install: "npm install -g @anthropic-ai/claude-code   then   claude",
        prompt: { argv: ["-p", "$PROMPT"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 (--help); -p, --print" },
        json: { argv: ["--output-format", "json"], kind: "json", confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; choices text|json|stream-json" },
        readOnly: { argv: ["--permission-mode", "plan"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; permission-mode choices acceptEdits|auto|bypassPermissions|default|dontAsk|plan" },
        write: { argv: ["--permission-mode", "acceptEdits"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; acceptEdits is a real choice" },
        fullAuto: { argv: ["--dangerously-skip-permissions"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 --help" },
        // V11.8.0: the turn cap is real after all — but the story matters. The 2.1.197 --help scan
        // (which once removed this flag) found no match, and the 11.7.x review then caught the
        // registry and the policy layer DISAGREEING: caps said absent while policyFor still
        // emitted it. The 2026 vendor CLI reference documents --max-turns for print mode (no
        // default; exits with an error at the cap) and five independent 2026 sources cite it —
        // so the flag is restored at DOCS grade, the old scan is recorded in the source line,
        // and probe §10 pins registry↔policy agreement so the two layers can never split again.
        maxTurns: { argv: ["--max-turns", "$N"], confidence: "docs", source: "code.claude.com CLI reference (2026): print-mode only, no default, exits with an error at the cap. Supersedes the 2.1.197 --help scan that found no match \u2014 the flag is not listed in --help." },
        timeout: { argv: null, confidence: "binary", source: "VERIFIED ABSENT against the real binary: claude 2.1.197 \u2014 no timeout flag; MJ enforces its own wall clock" },
        outputSchema: { argv: ["--json-schema"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 --help" },
        worktree: { argv: ["-w"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; -w, --worktree [name]" },
        cwd: { argv: null, confidence: "binary", source: "VERIFIED ABSENT against the real binary: claude 2.1.197 \u2014 no cwd flag; MJ sets the child process cwd instead" },
        model: { argv: ["--model", "$MODEL"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; --model <model>" },
        resume: { argv: ["--resume", "$SESSION"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197; -r, --resume [value]" },
        sessionStart: { argv: ["--session-id", "$SESSION"], confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 --help \u2014 `--session-id <uuid>` CREATES a session under the id you pass, so MJ can pick the id. `--resume` loads one; passing both is a conflict, so MJ emits exactly one per turn." },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: { allowFlag: "--allowedTools", denyFlag: "--disallowedTools", confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 \u2014 note --allowedTools PRE-APPROVES, it does not restrict. --tools restricts which tools exist." },
        cost: { kind: "usd", path: "total_cost_usd", confidence: "binary", source: "VERIFIED against the real binary: claude 2.1.197 \u2014 total_cost_usd, num_turns and session_id all present in the shipped executable, and a live run returned them" },
        enforcedReadOnly: true,
        gotchas: [
          '--allowedTools pre-approves (skips the prompt) but does NOT restrict. --tools restricts which tools exist; --tools "" is pure text. Conflating them is the classic bug.',
          "--max-turns exists in print mode only (docs-graded; --help does not list it). The CapLedger stays the authoritative ceiling \u2014 the CLI-side cap is defence in depth that fails fast. The vendor also documents --max-budget-usd (print-mode spend cap); MJ deliberately does not compose it: the CapLedger is the spend authority.",
          'Without credentials it still exits 0 and returns a full result object with is_error:true and result:"Not logged in \xB7 Please run /login". Exit code alone would read that as success.'
        ]
      },
      codex: {
        id: "codex",
        name: "Codex CLI",
        bins: ["codex"],
        install: "npm install -g @openai/codex   then   codex",
        // `exec` is the subcommand, so it must precede every flag.
        prompt: { argv: ["exec", "$PROMPT"], confidence: "docs", source: "codex exec" },
        json: { argv: ["--json"], kind: "ndjson", confidence: "docs", source: "NDJSON event stream" },
        readOnly: { argv: ["--sandbox", "read-only"], confidence: "docs", source: "read-only is ALSO the default, so this is belt-and-braces rather than a behaviour change" },
        write: { argv: ["--sandbox", "workspace-write"], confidence: "docs", source: "--full-auto is DEPRECATED; use --sandbox workspace-write" },
        fullAuto: { argv: ["--sandbox", "danger-full-access"], confidence: "docs", source: "the documented escape hatch" },
        maxTurns: { argv: null, confidence: "unverified", source: "no documented turn flag" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: ["--output-schema"], confidence: "docs", source: "codex exec --output-schema" },
        worktree: { argv: null, confidence: "unverified", source: "not documented" },
        cwd: { argv: ["--cd", "$CWD"], confidence: "docs", source: "alias -C" },
        model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "OpenAI Codex docs" },
        resume: { argv: ["resume"], confidence: "docs", source: "codex exec resume \u2014 takes no session id, so MJ cannot say WHICH conversation to continue" },
        sessionStart: { argv: null, confidence: "unverified", source: "codex names its own sessions and there is no documented way to choose the id, so MJ must capture it from the output" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: null,
        cost: { kind: "tokens-only", confidence: "docs", source: "reports tokens but NOT cost. MJ must leave costUsd null rather than guess a price." },
        enforcedReadOnly: true,
        gotchas: [
          "--full-auto is DEPRECATED. Use --sandbox workspace-write.",
          "Reports tokens with no price, so a cost figure for a codex seat would be invented. MJ records tokens and says the spend is unknown."
        ]
      },
      opencode: {
        id: "opencode",
        name: "OpenCode",
        bins: ["opencode"],
        install: "npm install -g opencode-ai   then   opencode",
        prompt: { argv: ["run", "$PROMPT"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 `run [message..]`; a real run executed bash and returned NDJSON" },
        json: { argv: ["--format", "json"], kind: "ndjson", confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 choices default|json; json emits NDJSON events step_start/text/tool_use/step_finish" },
        readOnly: { argv: ["--agent", "plan"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 asked to create a file, the plan agent made ZERO tool calls and created nothing, while the default agent created it. Read-only is enforced, not advisory." },
        // The DEFAULT agent is the writing one — proven by a real write. `--agent build` is not what the
        // binary expects, so MJ emits no agent flag when it wants writes.
        write: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 the default agent wrote proof-default.txt. No agent flag is needed to write; do NOT pass --agent build." },
        // There is no --dangerously-skip-permissions in this CLI (0 matches in `run --help`). That flag
        // belongs to Claude Code; the OpenCode equivalent is --auto, which is far more dangerous than it
        // sounds, so MJ never emits it without an explicit human decision.
        fullAuto: { argv: ["--auto"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 `--auto  auto-approve permissions that are not explicitly denied (dangerous!)`. --dangerously-skip-permissions does NOT exist here." },
        maxTurns: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 no turn-cap flag exists in `run --help`, so MJ's own CapLedger is the only turn limit" },
        timeout: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 no timeout flag; MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 no output-schema flag in `run --help`" },
        worktree: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 no worktree flag; MJ uses git worktree itself" },
        cwd: { argv: ["--dir", "$CWD"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 `--dir  directory to run in, path on remote server if attaching`" },
        model: { argv: ["--model", "$MODEL"], confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 `-m, --model` in provider/model format" },
        resume: { argv: ["--session", "$SESSION"], confidence: "binary", source: "VERIFIED END-TO-END against the real binary: opencode 1.18.25 \u2014 turn 1 planted a codeword, a FRESH process resumed with --session <id> and recalled it exactly. -c/--continue resumes the latest session; --fork copies before continuing." },
        sessionStart: { argv: null, confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 `--session <unknown-id>` exits 1 with `Error: Session not found`. It LOADS, it does not create, so MJ must NOT pass a session id on turn one. Run turn one bare, capture the sessionID from the NDJSON, and resume with it afterwards." },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented; `opencode upgrade` is a separate command" },
        filters: null,
        cost: { kind: "usd", path: "step_finish.part.cost", confidence: "binary", source: "VERIFIED against the real binary: opencode 1.18.25 \u2014 each step_finish carries .part.cost and .part.tokens{total,input,output,reasoning,cache}. tokens.total is CUMULATIVE (8019 then 8038 across two steps), so take the LAST value; summing would multiply-count." },
        enforcedReadOnly: true,
        gotchas: [
          "CORRECTION: the widely-quoted issue anomalyco/opencode#13851 claimed non-interactive sessions get a restrictive preset that blocks writes. On the real 1.18.25 binary the DEFAULT agent wrote a file without any flag, so that no longer holds. MJ no longer warns about it \u2014 a stale warning would push every seat to read-only for no reason.",
          "There is NO --dangerously-skip-permissions here. The escape hatch is --auto, whose own help text says '(dangerous!)' because it approves everything not explicitly denied. MJ treats it as requiring an explicit human decision, never a default.",
          "Sessions are real and resumable by id: --session <id>, -c/--continue for the latest, --fork to branch without polluting the original. Every NDJSON event carries sessionID, so MJ can capture it from turn one.",
          "opencode ships credential-free models (opencode/mimo-v2.5-free, opencode/nemotron-3.5-lightning-free, opencode/big-pickle and others). With zero credentials configured these still run and report cost 0 \u2014 useful for proving the plumbing before any API key exists.",
          "opencode.json supports permission: [{permission, pattern, action}] and tools: {write:false, bash:false} \u2014 MJ can write this file into the mission workspace to express its risk class."
        ]
      },
      grok: {
        id: "grok",
        name: "Grok Build",
        bins: ["grok"],
        install: "curl -fsSL https://x.ai/cli/install.sh | bash    (Windows: irm https://x.ai/cli/install.ps1 | iex)",
        // V11.6: `grok exec` is the documented one-shot mode (developersdigest/x.ai guides,
        // 2026-09); -p also runs headless but exec is the canonical scripting surface.
        prompt: { argv: ["exec", "$PROMPT"], confidence: "docs", source: "docs.x.ai \u2014 grok exec is non-interactive; -p is the headless alias" },
        json: { argv: ["--output-format", "json"], kind: "json", confidence: "docs", source: "plain|json|streaming-json" },
        readOnly: { argv: ["--permission-mode", "plan", "--sandbox", "read-only"], confidence: "docs", source: "permission vocabulary is deliberately Claude-compatible" },
        write: { argv: ["--permission-mode", "acceptEdits", "--sandbox", "workspace"], confidence: "docs", source: "sandbox off|workspace|read-only|strict|devbox" },
        fullAuto: { argv: ["--permission-mode", "bypassPermissions", "--sandbox", "off"], confidence: "docs", source: "the documented escape hatch" },
        // V11.8.0: --max-turns is real here AND in Claude Code's print mode (docs-graded there).
        // Same name, two CLIs — graded differently, which is exactly why per-harness evidence
        // matters. V11.8.0 also fixed the policy layer ignoring this flag (withTurnLimit
        // special-cased claude only); it is capability-driven now, so grok seats get their
        // documented turn cap on the policyFor path too.
        maxTurns: { argv: ["--max-turns", "$N"], confidence: "docs", source: "docs.x.ai \u2014 a real flag here; Claude Code documents the same name for print mode (docs-graded, see the claude entry)" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: ["-w", "$NAME"], confidence: "docs", source: "--worktree [NAME], with --ref to choose the base" },
        cwd: { argv: ["--cwd", "$CWD"], confidence: "docs", source: "docs.x.ai" },
        model: { argv: ["-m", "$MODEL"], confidence: "docs", source: "docs.x.ai" },
        resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "-r; -c continues the latest, --fork-session copies context" },
        sessionStart: { argv: null, confidence: "unverified", source: "not documented; MJ captures the id from the output instead" },
        noAutoUpdate: { argv: ["--no-auto-update"], confidence: "docs", source: "REQUIRED in CI, or a background update check can stall the run" },
        filters: { allowFlag: "--allow", denyFlag: "--deny", confidence: "docs", source: "Bash | Edit | Read | Grep | MCPTool | WebFetch. Deny wins over allow." },
        cost: { kind: "tokens-only", confidence: "unverified", source: "not documented as reporting USD" },
        enforcedReadOnly: true,
        gotchas: [
          "Permission vocabulary is deliberately Claude-compatible (default | dontAsk | acceptEdits | bypassPermissions | plan), so one risk mapping covers both.",
          "--no-auto-update is REQUIRED in CI: a background update check can stall the run indefinitely.",
          "Deny wins over allow, so an allowlist alone does not grant anything the deny list touches."
        ]
      },
      cursor: {
        id: "cursor",
        name: "Cursor Agent",
        bins: ["cursor-agent"],
        install: "curl https://cursor.com/install -fsS | bash",
        // `-p` IS the prompt flag, so it cannot be emitted twice — see the `implicit` note on readOnly.
        prompt: { argv: ["-p", "$PROMPT"], confidence: "docs", source: "cursor-agent -p" },
        json: { argv: ["--output-format", "json"], kind: "json", confidence: "community", source: "verify with --help" },
        // Writes require --force, so plain -p cannot modify anything. Emitting a flag here would produce
        // `cursor-agent -p <task> -p`, which does not parse.
        readOnly: { argv: null, implicit: true, confidence: "docs", source: "writes require --force, so plain -p is read-only by construction" },
        write: { argv: ["--force"], confidence: "docs", source: "--force is what permits writes" },
        fullAuto: { argv: ["--force"], confidence: "docs", source: "same flag; there is no separate bypass" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock \u2014 see the no-exit bug below" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "not documented" },
        cwd: { argv: ["--workspace", "$CWD"], confidence: "community", source: "verify with --help" },
        model: { argv: ["--model", "$MODEL"], confidence: "community", source: "-m" },
        resume: { argv: ["--resume", "$SESSION"], confidence: "community", source: "--resume [session_id]" },
        sessionStart: { argv: null, confidence: "unverified", source: "not documented; MJ captures the id from the output instead" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: { allowFlag: "", denyFlag: "", confidence: "community", source: 'permissions live in .cursor/cli-config.json as {permissions:{allow:["Shell(git)","Read(*)"],deny:["Read(.env*)"]}}, not on the command line' },
        cost: null,
        enforcedReadOnly: true,
        gotchas: [
          "KNOWN BUG: under -p the process may not exit after the result is emitted, so CI runs hang until killed. MJ MUST apply a wall-clock timeout and parse the result from the stream rather than waiting for exit. Reported repeatedly on the Cursor forum.",
          "Reports no cost at all, so a cursor seat's spend is unknown rather than zero."
        ]
      },
      cline: {
        id: "cline",
        name: "Cline CLI",
        bins: ["cline"],
        install: "npm install -g @cline/cli   then   cline",
        prompt: { argv: ["$PROMPT"], confidence: "docs", source: "a bare prompt is a one-shot run" },
        json: { argv: ["--json"], kind: "ndjson", confidence: "docs", source: "NDJSON of agent_event" },
        readOnly: { argv: ["-p"], confidence: "docs", source: "-p/--plan is read-only; act is the default" },
        write: { argv: null, confidence: "docs", source: "act mode is the default, so no flag is needed" },
        fullAuto: { argv: ["-y"], confidence: "docs", source: "-y/--yolo; --auto-approve is the narrower form" },
        // --retries is a consecutive-mistake limit, NOT a turn cap. Treating it as one would silently
        // allow unbounded turns.
        maxTurns: { argv: null, confidence: "docs", source: "--retries N is a consecutive-mistake limit, not a turn cap, so MJ does not use it as one" },
        timeout: { argv: ["--timeout", "$SECS"], confidence: "docs", source: "-t/--timeout" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "not documented, but instances are fully isolated so parallel branches are safe" },
        cwd: { argv: ["--cwd", "$CWD"], confidence: "docs", source: "-c" },
        model: { argv: ["-m", "$MODEL"], confidence: "docs", source: "with -P provider and -k key for a single run" },
        resume: { argv: null, confidence: "unverified", source: "cline history lists sessions; no documented resume flag" },
        sessionStart: { argv: null, confidence: "unverified", source: "no session control at all, so every cline turn starts from scratch" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: { allowFlag: "", denyFlag: "", confidence: "docs", source: 'CLINE_COMMAND_PERMISSIONS env var: {"allow":["npm *","git *"],"deny":["rm -rf *"]}' },
        cost: { kind: "usd", path: "verbose stats", confidence: "community", source: "-v prints elapsed time, tokens and estimated cost when available \u2014 parse, do not assume" },
        enforcedReadOnly: true,
        gotchas: [
          "--data-dir <path> uses isolated state instead of ~/.cline/data and AUTOMATICALLY enables sandbox mode. That is the strongest isolation available here, so MJ uses it for untrusted repos.",
          "--zen/-z returns immediately with no result. MJ must NEVER use it: it looks like a fast success and delivers nothing."
        ]
      },
      kilo: {
        id: "kilo",
        name: "Kilo Code",
        bins: ["kilo"],
        install: "npm install -g kilocode-cli   then   kilo   (kilo.ai)",
        prompt: { argv: ["run", "$PROMPT"], confidence: "docs", source: "kilo run" },
        json: { argv: ["--format", "json"], kind: "ndjson", confidence: "docs", source: "--format json" },
        // Read-only is per-AGENT only, expressed in .kilo/agents/*.md. There is no flag, so MJ has to
        // author the agent file — and cannot claim enforcement it did not verify.
        readOnly: { argv: ["--agent", "mj-readonly"], confidence: "docs", source: "read-only is expressed per agent in .kilo/agents/*.md, not by a flag" },
        write: { argv: ["--auto"], confidence: "docs", source: "--auto approves automatically" },
        fullAuto: { argv: ["--auto"], confidence: "docs", source: "same flag" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "kilo pr <number> checks out a PR branch instead" },
        cwd: { argv: ["--workspace", "$CWD"], confidence: "community", source: "verify with kilo --help" },
        model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "provider/model format, e.g. openai/gpt-5" },
        resume: { argv: ["--continue"], confidence: "docs", source: "-c; also --session, --fork" },
        sessionStart: { argv: null, confidence: "unverified", source: "--session exists but whether it can create an id MJ chose is not documented; MJ captures the id instead" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: { allowFlag: "", denyFlag: "", confidence: "community", source: "per-agent permission block in the agent markdown" },
        cost: { kind: "tokens-only", confidence: "unverified", source: "not documented as reporting USD" },
        // Deliberately false: MJ authors the agent file, but has never verified kilo honours it.
        enforcedReadOnly: false,
        gotchas: [
          "Read-only is per-agent ONLY (.kilo/agents/*.md), so MJ authors the file and says the guarantee is advisory until verified. enforcedReadOnly is false on purpose."
        ]
      },
      hermes: {
        id: "hermes",
        name: "Hermes Runtime",
        bins: ["hermes"],
        install: "bundled with MJ; runs as a stdio child process",
        prompt: { argv: ["$PROMPT"], confidence: "docs", source: "MJ's own runtime" },
        json: null,
        readOnly: null,
        write: null,
        fullAuto: null,
        maxTurns: null,
        timeout: null,
        outputSchema: null,
        worktree: null,
        cwd: null,
        model: null,
        resume: null,
        sessionStart: null,
        noAutoUpdate: null,
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: ["No enforced sandbox, so a hermes seat must never be assigned HIGH or CRITICAL risk."]
      },
      aider: {
        id: "aider",
        name: "Aider AI Pair Programmer",
        bins: ["aider"],
        install: "pip install aider-chat   then   aider",
        prompt: { argv: ["--message", "$PROMPT"], confidence: "docs", source: "aider --message <prompt>" },
        json: null,
        readOnly: { argv: ["--read-only"], implicit: false, confidence: "docs", source: "--read-only" },
        write: { argv: ["--yes", "--no-auto-commits"], confidence: "docs", source: "--yes --no-auto-commits" },
        fullAuto: { argv: ["--yes"], confidence: "docs", source: "--yes" },
        maxTurns: null,
        timeout: null,
        outputSchema: null,
        worktree: null,
        cwd: null,
        model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "--model" },
        resume: null,
        sessionStart: null,
        noAutoUpdate: null,
        filters: null,
        cost: null,
        enforcedReadOnly: true,
        gotchas: ["Pass --no-auto-commits so MJ manages worktree commits deterministically."]
      },
      gemini: {
        id: "gemini",
        name: "Google Gemini CLI",
        bins: ["gemini"],
        install: "npm install -g @google/gemini-cli   or   gemini auth",
        prompt: { argv: ["-p", "$PROMPT"], confidence: "docs", source: "gemini -p <prompt>" },
        json: { argv: ["--output-format", "json"], kind: "json", confidence: "docs", source: "--output-format json" },
        readOnly: { argv: ["--approval-mode", "plan"], implicit: false, confidence: "docs", source: "--approval-mode plan" },
        write: { argv: [], confidence: "docs", source: "default" },
        fullAuto: { argv: ["--full-auto"], confidence: "docs", source: "--full-auto" },
        maxTurns: null,
        timeout: null,
        outputSchema: null,
        worktree: null,
        cwd: { argv: ["--workspace", "$CWD"], confidence: "docs", source: "--workspace" },
        model: { argv: ["-m", "$MODEL"], confidence: "docs", source: "-m" },
        resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "--resume" },
        sessionStart: null,
        noAutoUpdate: null,
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: ["Documentation-level integration; uses --approval-mode plan for Plan Mode."]
      },
      goose: {
        id: "goose",
        name: "Goose Developer Agent",
        bins: ["goose"],
        install: "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash",
        prompt: { argv: ["run", "--text", "$PROMPT"], confidence: "docs", source: "goose run --text <prompt>" },
        json: { argv: ["--format", "json"], kind: "json", confidence: "docs", source: "--format json" },
        readOnly: { argv: ["--plan"], implicit: false, confidence: "docs", source: "--plan" },
        write: { argv: [], confidence: "docs", source: "default" },
        fullAuto: { argv: [], confidence: "docs", source: "default" },
        maxTurns: null,
        timeout: null,
        outputSchema: null,
        worktree: null,
        cwd: { argv: ["--dir", "$CWD"], confidence: "docs", source: "--dir" },
        model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "--model" },
        resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "--resume" },
        sessionStart: null,
        noAutoUpdate: null,
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: ["Open-source agent by Block with extensive MCP extension ecosystem."]
      },
      qwen: {
        id: "qwen",
        name: "Qwen Code",
        bins: ["qwen"],
        install: "npm install -g @qwen/code-cli   then   qwen login",
        prompt: { argv: ["-p", "$PROMPT"], confidence: "docs", source: "qwen -p <prompt>" },
        json: { argv: ["--output-format", "json"], kind: "json", confidence: "docs", source: "--output-format json" },
        readOnly: { argv: ["--read-only"], implicit: false, confidence: "docs", source: "--read-only" },
        write: { argv: [], confidence: "docs", source: "default" },
        fullAuto: { argv: ["--yes"], confidence: "docs", source: "--yes" },
        maxTurns: null,
        timeout: null,
        outputSchema: null,
        worktree: null,
        cwd: { argv: ["--cwd", "$CWD"], confidence: "docs", source: "--cwd" },
        model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "--model" },
        resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "--resume" },
        sessionStart: null,
        noAutoUpdate: null,
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: ["Alibaba open-source terminal agent tuned for Qwen3-Coder models."]
      },
      amazonq: {
        id: "amazonq",
        name: "Amazon Q / Kiro CLI",
        bins: ["kiro-cli", "q", "amazonq"],
        install: "Install Kiro CLI (Amazon Q Developer CLI) via AWS / Homebrew",
        prompt: { argv: ["chat", "--no-interactive", "$PROMPT"], confidence: "docs", source: "kiro-cli chat --no-interactive <prompt>" },
        json: { argv: ["--json"], kind: "json", confidence: "docs", source: "--json" },
        readOnly: { argv: ["--read-only"], implicit: false, confidence: "docs", source: "--read-only" },
        write: { argv: [], confidence: "docs", source: "default" },
        fullAuto: { argv: ["--trust-all"], confidence: "docs", source: "--trust-all" },
        maxTurns: null,
        timeout: null,
        outputSchema: null,
        worktree: null,
        cwd: { argv: ["--workspace", "$CWD"], confidence: "docs", source: "--workspace" },
        model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "--model" },
        resume: null,
        sessionStart: null,
        noAutoUpdate: null,
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: ["AWS developer CLI transitioning to Kiro CLI; enterprise Bedrock integration."]
      },
      openclaude: {
        id: "openclaude",
        name: "OpenClaude",
        bins: ["openclaude"],
        install: "npm install -g @gitlawb/openclaude@latest   then   openclaude   (/provider for guided setup)",
        // Claude-Code-shaped CLI (github.com/Gitlawb/openclaude, 30.9k stars, checked 2026-09).
        prompt: { argv: ["-p", "$PROMPT"], confidence: "community", source: "Claude-Code-compatible surface; --bg exists for detached runs. -p is reported by users, not yet by vendor docs." },
        json: { argv: null, kind: "text", confidence: "unverified", source: "no documented --output-format flag" },
        readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag; treat as advisory" },
        write: { argv: null, confidence: "unverified", source: "writes via its file tools; no flag to gate them" },
        fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "not documented" },
        cwd: { argv: null, confidence: "unverified", source: "run it from the repo directory (MJ sets cwd on the process)" },
        model: { argv: null, confidence: "docs", source: "OPENAI_MODEL / OPENAI_BASE_URL env or /provider profiles \u2014 config is env/profile driven, not argv" },
        resume: { argv: ["--resume", "$SESSION"], confidence: "docs", source: "github README: --resume <id>, --continue for latest" },
        sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: [
          "Open-source Claude-Code-shaped CLI for OpenAI-compatible/Gemini/Ollama backends \u2014 no Claude subscription needed.",
          "Config lives in ~/.openclaude and ~/.openclaude-profile.json; it deliberately never reads ~/.claude.",
          "Background sessions (--bg) return immediately \u2014 MJ needs the synchronous -p shape, so -p is the registered invocation.",
          "No verified read-only mode: an OpenClaude seat marked no-write is advisory, not enforced."
        ]
      },
      copilot: {
        id: "copilot",
        name: "GitHub Copilot CLI",
        bins: ["copilot"],
        install: "npm install -g @github/copilot   (winget install GitHub.Copilot / brew install --cask copilot-cli)   then   copilot login",
        // GitHub Docs, checked 2026-09: -p is the documented programmatic prompt; -s silences usage info.
        prompt: { argv: ["-p", "$PROMPT", "-s"], confidence: "docs", source: "docs.github.com/en/copilot/get-started/cli-quickstart \u2014 'pass a prompt to the CLI with the -p flag'; -s outputs only the response" },
        json: { argv: null, kind: "text", confidence: "unverified", source: "no documented JSON output flag" },
        readOnly: { argv: ["--available-tools", "read"], confidence: "docs", source: "--available-tools=LIST exposes only selected tools; --deny-tool wins over --allow-tool" },
        write: { argv: ["--allow-tool", "edit"], confidence: "docs", source: "permission patterns: --allow-tool / --deny-tool / --add-dir" },
        fullAuto: { argv: ["--allow-all"], confidence: "docs", source: "--allow-all (tools+paths+urls); the docs themselves call the yolo posture high-risk" },
        maxTurns: { argv: null, confidence: "unverified", source: "no documented turn flag" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "not documented" },
        cwd: { argv: ["-C", "$CWD"], confidence: "docs", source: "-C DIRECTORY changes directory before startup" },
        model: { argv: ["--model", "$MODEL"], confidence: "docs", source: "--model=MODEL or auto; default was Claude Sonnet 4.5 as of mid-2026" },
        resume: { argv: ["--resume"], confidence: "docs", source: "-r/--resume[=VALUE] by ID, prefix or name; --continue resumes newest" },
        sessionStart: { argv: ["--session-id", "$ID"], confidence: "docs", source: "--session-id ID addresses or creates an exact session UUID" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: { allowFlag: "--allow-tool", denyFlag: "--deny-tool", confidence: "docs", source: "deny rules win over allow rules; also --allow-url/--deny-url and --add-dir PATH" },
        cost: { kind: "tokens-only", confidence: "unverified", source: "consumes GitHub AI Credits; no per-run USD figure reported" },
        enforcedReadOnly: true,
        gotchas: [
          "Uses Copilot plan credits; COPILOT_GITHUB_TOKEN (fine-grained PAT) authenticates headless/CI runs.",
          "-s matters in scripts: without it the response is wrapped in usage information.",
          "Read-only is real when constructed via --available-tools read + --deny-tool write families \u2014 but deny patterns must actually cover the write tools."
        ]
      },
      antigravity: {
        id: "antigravity",
        name: "Antigravity CLI (agy)",
        bins: ["agy"],
        install: "curl -fsSL https://antigravity.google/cli/install.sh | bash   (Windows: irm https://antigravity.google/cli/install.ps1 | iex)",
        // V11.6.1 correction: the shipped binary is `agy` — a closed-source Go executable that
        // came with Antigravity 2.0 (2026-05-19), NOT an `antigravity` binary. The headless
        // prompt flag is still community-graded (Gemini-CLI heritage); `agy --help` decides.
        prompt: { argv: ["-p", "$PROMPT"], confidence: "community", source: "binary `agy` verified (antigravity.google/docs/gcli-migration, 2026 cutover coverage); headless flag not vendor-documented" },
        json: { argv: null, kind: "text", confidence: "unverified", source: "not re-verified for Antigravity" },
        readOnly: { argv: ["--approval-mode", "plan"], confidence: "community", source: "inherited Gemini vocabulary; re-verify on the shipped binary" },
        write: { argv: null, confidence: "unverified", source: "not re-verified" },
        fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "not documented" },
        cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
        model: { argv: ["-m", "$MODEL"], confidence: "community", source: "Gemini-lineage -m flag" },
        resume: { argv: null, confidence: "unverified", source: "not re-verified" },
        sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: [
          "Google moved unpaid-tier and Google One users from Gemini CLI to Antigravity CLI on 2026-06-18; paid Code Assist tiers keep `gemini`.",
          "Everything here is community-graded: the cutover was recent and the binary disagrees with guides sometimes. Run the Teams test before relying on a flag."
        ]
      },
      amp: {
        id: "amp",
        name: "Amp (Sourcegraph)",
        bins: ["amp"],
        install: "npm install -g @sourcegraph/amp   then   amp login",
        // V11.6.1 correction: execute mode is `amp -x "<prompt>"` (non-interactive single-shot),
        // documented in Sourcegraph's own CLI guide. The old `--headless` mapping was wrong —
        // that conflated runner mode (`--no-tui`) with execute mode.
        prompt: { argv: ["-x", "$PROMPT"], confidence: "docs", source: "ampcode.com/docs/cli/execute-mode + sourcegraph/amp-examples-and-guides \u2014 execute mode is documented" },
        json: { argv: null, kind: "text", confidence: "unverified", source: "not documented" },
        readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag" },
        write: { argv: null, confidence: "unverified", source: "not documented" },
        fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "not documented" },
        cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
        model: { argv: ["--model", "$MODEL"], confidence: "community", source: "model selection reported in amp config rather than argv" },
        resume: { argv: null, confidence: "unverified", source: "not documented" },
        sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: [
          "Sourcegraph's agent; strongest when your repo is indexed by Sourcegraph.",
          "No verified read-only enforcement: an Amp seat marked no-write is advisory."
        ]
      },
      crush: {
        id: "crush",
        name: "Crush (Charm)",
        bins: ["crush"],
        install: "npm install -g @charmbracelet/crush   (or brew install charmbracelet/crush/crush)   then   crush",
        prompt: { argv: ["run", "$PROMPT"], confidence: "community", source: "crush run executes a prompt non-interactively; verify on the shipped binary" },
        json: { argv: null, kind: "text", confidence: "unverified", source: "not documented" },
        readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag" },
        write: { argv: null, confidence: "unverified", source: "not documented" },
        fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "not documented" },
        cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
        model: { argv: ["-m", "$MODEL"], confidence: "community", source: "Charm's config-driven model selection" },
        resume: { argv: null, confidence: "unverified", source: "not documented" },
        sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: [
          "Charm's TUI agent \u2014 LSP-aware, multi-provider.",
          "No verified read-only enforcement: a Crush seat marked no-write is advisory."
        ]
      },
      openhands: {
        id: "openhands",
        name: "OpenHands",
        bins: ["openhands"],
        // V11.6.1 correction: the V1 CLI's headless mode is `openhands --headless -t "<task>"`
        // (documented on PyPI + docs.openhands.dev); the earlier `solve` subcommand was a
        // pre-V1 design. --json streams JSONL events; -f takes a task file.
        install: "pip install openhands   then   openhands login   (or configure any LLM)",
        prompt: { argv: ["--headless", "-t", "$PROMPT"], confidence: "docs", source: "pypi.org/project/openhands + docs.openhands.dev \u2014 headless mode documented" },
        json: { argv: ["--json"], kind: "ndjson", confidence: "docs", source: "docs.openhands.dev CLI headless \u2014 JSONL event stream" },
        readOnly: { argv: null, confidence: "unverified", source: "sandboxing is config-level (docker/local), not an argv flag" },
        write: { argv: null, confidence: "unverified", source: "writes via its own tools inside its runtime" },
        fullAuto: { argv: null, confidence: "unverified", source: "it is autonomous by design; containment is the sandbox config" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented as argv" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "workspace config, not argv" },
        cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
        model: { argv: null, confidence: "unverified", source: "LLM config file, not argv" },
        resume: { argv: null, confidence: "unverified", source: "not documented as argv" },
        sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: [
          "Formerly OpenDevin. The open-source autonomous software engineer.",
          "Containment comes from its runtime sandbox config, not from an argv flag MJ can pass \u2014 treat read-only seats as advisory."
        ]
      },
      droid: {
        id: "droid",
        name: "Droid (Factory)",
        bins: ["droid"],
        install: "curl -fsSL https://app.factory.ai/cli | sh   (Linux also needs xdg-utils)",
        // V11.7.1: vendor-documented headless mode (docs.factory.ai/droid-exec). `droid exec` is
        // a single non-interactive pass whose DEFAULT is spec-mode — read-only operations only —
        // so the derived READ_ONLY shape needs no flag at all. Writes are tiered: --auto low is
        // the vendor's example tier for "enable edits and commands".
        prompt: { argv: ["exec", "$PROMPT"], confidence: "docs", source: "docs.factory.ai/droid-exec \u2014 'Execute a single command (non-interactive mode)'" },
        json: { argv: null, kind: "text", confidence: "unverified", source: "-o/--output-format exists but the documented values were not verified" },
        readOnly: { argv: [], confidence: "docs", source: "spec-mode default: exec only executes read-only operations (docs.factory.ai/droid-exec)" },
        write: { argv: ["--auto", "low"], confidence: "docs", source: "'add --auto to enable edits and commands, with risk tiers gating what can run' \u2014 low is the vendor's example tier" },
        fullAuto: { argv: null, confidence: "unverified", source: "tier semantics (--auto low|medium shown in docs) not mapped to a full-auto shape" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "droid has git-worktree machinery but no documented argv flag" },
        cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
        model: { argv: null, confidence: "unverified", source: "not verified on the exec flag table" },
        resume: { argv: null, confidence: "unverified", source: "stream-json multi-turn sessions exist; no resume-by-id flag documented" },
        sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: [
          "Exec defaults to SPEC MODE: read-only operations only. A write seat composes --auto low; raise the tier in the argv only if a team explicitly trusts it.",
          "Factory's agent: honours AGENTS.md conventions at the repo root."
        ]
      },
      kimi: {
        id: "kimi",
        name: "Kimi Code (Moonshot)",
        bins: ["kimi"],
        install: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash   (or: npm install -g @moonshot-ai/kimi-code)",
        // V11.7.1: vendor-documented prompt mode (kimi.ai cheat sheet + moonshotai/kimi-code
        // sources): -p runs a single prompt non-interactively and finalizeHeadlessRun exits
        // cleanly. stream-json output and -S session resume are both on the vendor flag table.
        prompt: { argv: ["-p", "$PROMPT"], confidence: "docs", source: "kimi.ai/resources/kimi-code-cheat-sheet \u2014 'Run a single non-interactive prompt without opening the TUI'" },
        json: { argv: ["--output-format", "stream-json"], kind: "ndjson", confidence: "docs", source: "'--output-format stream-json \u2014 emit JSONL events for scripting; only works with --prompt'" },
        readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag; a no-write seat is advisory" },
        write: { argv: [], confidence: "docs", source: "default: prompt mode edits files when the agent decides" },
        fullAuto: { argv: ["--yolo"], confidence: "docs", source: "'--yolo (-y) \u2014 auto-approve regular tool calls; use only in trusted directories'" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "not documented" },
        cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process (-w reported in community wrappers)" },
        model: { argv: ["-m", "$MODEL"], confidence: "docs", source: "'--model <model> (-m) \u2014 specify a model alias for this launch'" },
        resume: { argv: ["--session", "$SESSION"], confidence: "docs", source: "'--session [id] (-S) \u2014 resume a session by ID'" },
        sessionStart: { argv: null, confidence: "unverified", source: "no documented create-under-chosen-id flag; Kimi assigns its own session ids" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: [
          "Single native binary via the install script; the npm route needs Node 22.19+.",
          "--auto is the no-questions permission mode; --yolo additionally skips regular tool approvals."
        ]
      },
      auggie: {
        id: "auggie",
        name: "Auggie (Augment Code)",
        bins: ["auggie"],
        install: "npm install -g @augmentcode/auggie   then   auggie login",
        // V11.7.1: vendor-documented print mode (docs.augmentcode.com/cli/reference): --print
        // runs one instruction and exits. Ask mode (--ask) is a real read-only mode but is
        // documented as a mode of its own — combining it with --print is not shown, so the
        // capability registry does not claim that composition.
        prompt: { argv: ["--print", "$PROMPT"], confidence: "docs", source: "docs.augmentcode.com/cli/reference \u2014 'Run one instruction in print mode and exit' (-p)" },
        json: { argv: ["--output-format", "json"], kind: "json", confidence: "docs", source: "'--print --output-format json \u2014 output the response in structured JSON format for automation workflows'" },
        readOnly: { argv: null, confidence: "unverified", source: "ask mode (--ask: retrieval and non-editing tools only) is documented as its own mode; combining with --print is not shown" },
        write: { argv: [], confidence: "docs", source: "default: print mode edits when the agent decides" },
        fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "not documented" },
        cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process" },
        model: { argv: ["--model", "$MODEL"], confidence: "community", source: "github/gh-aw's auggie engine appends --model; not on the vendor flag table" },
        resume: { argv: null, confidence: "unverified", source: "not documented" },
        sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: [
          "Non-interactive mode may be DISABLED by enterprise agreement (vendor docs) \u2014 a headless Auggie seat can fail for licensing, not technical, reasons.",
          "--augment-session-json <json-or-path> authenticates automation without auggie login.",
          "--acp runs Auggie as an ACP agent for compatible editors; --mcp runs it as an MCP tool server."
        ]
      },
      warp: {
        id: "warp",
        name: "Warp Oz Agent CLI",
        bins: ["oz"],
        install: "Ships with Warp 2026 (Command Palette \u2192 Install Warp CLI), or: brew tap warpdotdev/warp && brew install --cask warp-cli   then   oz login",
        // V11.7.1: Warp's agent infrastructure has its own CLI (docs.warp.dev/reference/cli).
        // oz agent run --prompt starts a LOCAL agent run; WARP_API_KEY authenticates headless
        // (CI pipelines, headless servers). run-cloud is cloud infrastructure — not composed.
        prompt: { argv: ["agent", "run", "--prompt", "$PROMPT"], confidence: "docs", source: "docs.warp.dev/reference/cli \u2014 'oz agent run --prompt ...' quickstart; API keys 'let the CLI authenticate non-interactively'" },
        json: { argv: null, kind: "text", confidence: "unverified", source: "not documented on the CLI reference" },
        readOnly: { argv: null, confidence: "unverified", source: "no documented read-only flag; a no-write seat is advisory" },
        write: { argv: [], confidence: "docs", source: "default: the local agent run can edit" },
        fullAuto: { argv: null, confidence: "unverified", source: "not documented" },
        maxTurns: { argv: null, confidence: "unverified", source: "not documented" },
        timeout: { argv: null, confidence: "unverified", source: "MJ enforces its own wall clock" },
        outputSchema: { argv: null, confidence: "unverified", source: "not documented" },
        worktree: { argv: null, confidence: "unverified", source: "not documented" },
        cwd: { argv: null, confidence: "unverified", source: "MJ sets cwd on the process (--cwd existed on the 2025 warp surface)" },
        model: { argv: null, confidence: "unverified", source: "not documented" },
        resume: { argv: null, confidence: "unverified", source: "local runs are one-shot; run-cloud has --attach, not resume-by-id" },
        sessionStart: { argv: null, confidence: "unverified", source: "not documented" },
        noAutoUpdate: { argv: null, confidence: "unverified", source: "not documented" },
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: [
          "MJ spawns LOCAL runs (oz agent run). oz agent run-cloud needs --environment and is deliberately NOT composed.",
          "WARP_API_KEY (wk-...) authenticates CI/headless servers; otherwise `oz login`.",
          "The 2025-era `warp agent run --prompt` surface still exists on the warp binary, and the Linux desktop launcher is warp-terminal \u2014 neither is the agent CLI MJ detects."
        ]
      },
      llm: {
        id: "llm",
        name: "Direct LLM",
        bins: [],
        install: "no binary; MJ calls the provider API directly",
        prompt: { argv: ["$PROMPT"], confidence: "docs", source: "MJ's own call path" },
        json: null,
        readOnly: null,
        write: null,
        fullAuto: null,
        maxTurns: null,
        timeout: null,
        outputSchema: null,
        worktree: null,
        cwd: null,
        model: null,
        resume: null,
        sessionStart: null,
        noAutoUpdate: null,
        filters: null,
        cost: null,
        enforcedReadOnly: false,
        gotchas: ["No filesystem access and no enforced sandbox. Useful for reasoning, useless for edits."]
      }
    };
    EXECUTABLE_HARNESSES = Object.keys(AGENT_CAPABILITIES).filter(
      (id) => AGENT_CAPABILITIES[id].bins.length > 0
    );
  }
});

// src/mission/harnessPolicy.ts
function registryArgv(id, kind) {
  const caps = AGENT_CAPABILITIES[id];
  const base = caps?.prompt?.argv?.length ? [...caps.prompt.argv] : ["$PROMPT"];
  const extra = kind === "readOnly" ? caps?.readOnly?.argv : caps?.write?.argv;
  return extra && extra.length > 0 ? [...base, ...extra] : base;
}
function policyFor(id, req) {
  const writeShape = WRITE[id];
  const readShape = READ_ONLY[id];
  const enforced = ENFORCED_SANDBOX[id] === true;
  const wantsReadOnly = !req.mayWriteFiles || REVIEW_KINDS.has(req.kind) || req.risk === "LOW";
  if (req.risk === "CRITICAL") {
    return {
      argv: readShape ?? ["$PROMPT"],
      grant: "Read-only. A CRITICAL task is escalated to a human; no harness runs it autonomously.",
      canWrite: false,
      readOnly: true,
      refused: "CRITICAL risk requires human approval before any harness executes it.",
      outputFormat: outputFormatFor(id)
    };
  }
  if (wantsReadOnly) {
    return {
      argv: readShape ?? ["$PROMPT"],
      grant: enforced ? "Read-only, enforced by the harness (no file writes, no shell)." : "Read-only requested. This harness has no enforced sandbox, so MJ additionally withholds write permission in the prompt and records that the control is advisory.",
      canWrite: false,
      readOnly: true,
      refused: null,
      outputFormat: outputFormatFor(id)
    };
  }
  if (!writeShape) {
    return {
      argv: readShape ?? ["$PROMPT"],
      grant: "Read-only fallback: this harness has no workspace-write mode MJ can request.",
      canWrite: false,
      readOnly: true,
      refused: null,
      outputFormat: outputFormatFor(id)
    };
  }
  const argv = withTurnLimit(id, [...writeShape], req.maxTurns);
  return {
    argv,
    grant: enforced ? "Write inside the mission workspace only, enforced by the harness sandbox." : "Write requested. This harness has no enforced sandbox; MJ records the control as advisory.",
    canWrite: true,
    readOnly: false,
    refused: null,
    outputFormat: outputFormatFor(id)
  };
}
function withTurnLimit(id, argv, maxTurns) {
  if (!Number.isFinite(maxTurns) || maxTurns <= 0) return argv;
  const shape = AGENT_CAPABILITIES[id]?.maxTurns?.argv;
  if (!shape?.length) return argv;
  const at = argv.indexOf("$PROMPT");
  const filled = shape.map((t) => t === "$N" ? String(Math.max(1, Math.round(maxTurns))) : t);
  if (at < 0) return [...argv, ...filled];
  return [...argv.slice(0, at), ...filled, ...argv.slice(at)];
}
function outputFormatFor(id) {
  if (id === "codex" || id === "opencode") return "ndjson";
  if (id === "claude") return "json";
  return "text";
}
function parseUsage(id, stdout) {
  const raw = stdout ?? "";
  if (id === "claude") {
    const obj = lastJsonObject(raw);
    if (!obj) return { costUsd: null, tokens: null, source: "claude: no JSON object in stdout", text: raw };
    const cost = num(obj.total_cost_usd);
    const usage = obj.usage ?? {};
    const input = num(usage.input_tokens) ?? 0;
    const output = num(usage.output_tokens) ?? 0;
    const tokens = input + output > 0 ? input + output : null;
    const text = typeof obj.result === "string" ? obj.result : raw;
    return { costUsd: cost, tokens, source: `claude: total_cost_usd=${cost ?? "n/a"}, turns=${num(obj.num_turns) ?? "n/a"}`, text };
  }
  if (id === "codex") {
    const events = jsonLines(raw);
    let tokens = null;
    let text = "";
    for (const e of events) {
      const payload = e.payload ?? e;
      const info = payload.info ?? payload;
      const usage = firstObject(
        info.last_token_usage,
        info.total_token_usage,
        info.token_usage,
        info.usage,
        payload.usage,
        e.usage
      );
      if (usage) {
        const total = num(usage.total_tokens) ?? (num(usage.input_tokens) ?? 0) + (num(usage.output_tokens) ?? 0);
        if (total > 0) tokens = total;
      }
      const t = payload.type ?? e.type;
      if (typeof t === "string" && t.includes("completed")) {
        const last = info.last_agent_message ?? payload.text ?? null;
        if (typeof last === "string" && last) text = last;
      }
    }
    return {
      costUsd: null,
      // Codex reports tokens, not dollars; MJ will not convert with a guessed price.
      tokens,
      source: `codex: ${events.length} NDJSON event(s), tokens=${tokens ?? "n/a"}`,
      text: text || raw
    };
  }
  if (id === "opencode") {
    const events = jsonLines(raw);
    let cost = null;
    let tokens = null;
    const parts = [];
    for (const e of events) {
      const type = String(e.type ?? "");
      const part = e.part ?? {};
      if (type === "text" && typeof part.text === "string") parts.push(part.text);
      if (type === "step_finish" || part.type === "step-finish") {
        const c = num(part.cost) ?? num(part.tokens?.cost);
        if (c != null) cost = c;
        const tk = part.tokens ?? {};
        const t = (num(tk.input) ?? 0) + (num(tk.output) ?? 0) + (num(tk.reasoning) ?? 0);
        if (t > 0) tokens = t;
      }
    }
    return {
      costUsd: cost,
      tokens,
      source: `opencode: ${events.length} event(s), cost=${cost ?? "n/a"}, tokens=${tokens ?? "n/a"}`,
      text: parts.join("\n").trim() || raw
    };
  }
  return { costUsd: null, tokens: null, source: `${id}: no machine-readable usage in output`, text: raw };
}
function firstObject(...vals) {
  for (const v of vals) if (v && typeof v === "object") return v;
  return null;
}
function jsonLines(raw) {
  const out = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object") out.push(v);
    } catch {
    }
  }
  return out;
}
function lastJsonObject(raw) {
  const lines = jsonLines(raw);
  if (lines.length) return lines[lines.length - 1];
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object") return v;
  } catch {
  }
  return null;
}
function permissionPreamble(granted, policy) {
  const allowed = Object.entries(granted).filter(([, v]) => v).map(([k]) => k);
  const denied = Object.entries(granted).filter(([, v]) => !v).map(([k]) => k);
  return [
    `# Permissions for this run`,
    `Allowed: ${allowed.join(", ") || "none"}`,
    `Denied: ${denied.join(", ") || "none"}`,
    `Sandbox: ${policy.grant}`,
    ``,
    `If the task needs something denied here, stop and say what you needed. Do not work around it.`
  ].join("\n");
}
var ENFORCED_SANDBOX, READ_ONLY, WRITE, REVIEW_KINDS, num;
var init_harnessPolicy = __esm({
  "src/mission/harnessPolicy.ts"() {
    "use strict";
    init_agentCapabilities();
    ENFORCED_SANDBOX = {
      acp: enforcedReadOnly("acp"),
      claude: enforcedReadOnly("claude"),
      codex: enforcedReadOnly("codex"),
      opencode: enforcedReadOnly("opencode"),
      openclaude: enforcedReadOnly("openclaude"),
      copilot: enforcedReadOnly("copilot"),
      cursor: enforcedReadOnly("cursor"),
      grok: enforcedReadOnly("grok"),
      cline: enforcedReadOnly("cline"),
      kilo: enforcedReadOnly("kilo"),
      aider: enforcedReadOnly("aider"),
      gemini: false,
      antigravity: false,
      amp: false,
      crush: false,
      openhands: false,
      goose: false,
      qwen: false,
      amazonq: false,
      droid: false,
      kimi: false,
      auggie: false,
      warp: false,
      hermes: enforcedReadOnly("hermes"),
      llm: enforcedReadOnly("llm")
    };
    READ_ONLY = {
      claude: ["-p", "$PROMPT", "--permission-mode", "plan", "--tools", "", "--output-format", "json"],
      codex: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--json", "$PROMPT"],
      opencode: ["run", "--agent", "plan", "--format", "json", "$PROMPT"],
      cursor: registryArgv("cursor", "readOnly"),
      grok: registryArgv("grok", "readOnly"),
      cline: ["$PROMPT"],
      kilo: ["run", "$PROMPT"],
      aider: ["--message", "$PROMPT", "--yes", "--no-auto-commits", "--read-only"],
      gemini: registryArgv("gemini", "readOnly"),
      antigravity: registryArgv("antigravity", "readOnly"),
      amp: registryArgv("amp", "readOnly"),
      crush: registryArgv("crush", "readOnly"),
      openhands: registryArgv("openhands", "readOnly"),
      openclaude: registryArgv("openclaude", "readOnly"),
      copilot: registryArgv("copilot", "readOnly"),
      goose: registryArgv("goose", "readOnly"),
      qwen: registryArgv("qwen", "readOnly"),
      amazonq: registryArgv("amazonq", "readOnly"),
      droid: registryArgv("droid", "readOnly"),
      kimi: registryArgv("kimi", "readOnly"),
      auggie: registryArgv("auggie", "readOnly"),
      warp: registryArgv("warp", "readOnly"),
      // Hand-tuned (CLI-shim shape): the in-process Hermes runtime takes the bare prompt;
      // the spawned CLI takes --print. The registry models the runtime; policy models the shim.
      hermes: ["--print", "$PROMPT"]
    };
    WRITE = {
      claude: ["-p", "$PROMPT", "--permission-mode", "acceptEdits", "--output-format", "json"],
      codex: ["exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--json", "$PROMPT"],
      opencode: ["run", "--agent", "build", "--format", "json", "$PROMPT"],
      cursor: registryArgv("cursor", "write"),
      grok: registryArgv("grok", "write"),
      cline: ["$PROMPT"],
      kilo: ["run", "$PROMPT"],
      aider: ["--message", "$PROMPT", "--yes", "--no-auto-commits"],
      gemini: registryArgv("gemini", "write"),
      antigravity: registryArgv("antigravity", "write"),
      amp: registryArgv("amp", "write"),
      crush: registryArgv("crush", "write"),
      openhands: registryArgv("openhands", "write"),
      openclaude: registryArgv("openclaude", "write"),
      copilot: registryArgv("copilot", "write"),
      goose: registryArgv("goose", "write"),
      qwen: registryArgv("qwen", "write"),
      amazonq: registryArgv("amazonq", "write"),
      // V11.7.1 — the one hand-tuned WRITE among the new four: droid exec defaults to
      // spec-mode (read-only operations only), so a write mission MUST compose --auto or the
      // agent would honestly refuse to edit. `low` is the vendor's documented example tier
      // (docs.factory.ai/droid-exec: "add --auto to enable edits and commands, with risk
      // tiers gating what can run"). kimi/auggie/warp write exactly what their registry
      // prompt mode writes, so they stay derived.
      droid: ["exec", "--auto", "low", "$PROMPT"],
      kimi: registryArgv("kimi", "write"),
      auggie: registryArgv("auggie", "write"),
      warp: registryArgv("warp", "write"),
      // Hand-tuned (CLI-shim shape): see the READ_ONLY note.
      hermes: ["--print", "$PROMPT"]
    };
    REVIEW_KINDS = /* @__PURE__ */ new Set(["review", "security", "architecture", "synthesis"]);
    num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
  }
});

// node_modules/@tauri-apps/api/dpi.js
var LogicalSize, PhysicalSize, Size, LogicalPosition, PhysicalPosition, Position;
var init_dpi = __esm({
  "node_modules/@tauri-apps/api/dpi.js"() {
    init_core();
    LogicalSize = class {
      constructor(...args) {
        this.type = "Logical";
        if (args.length === 1) {
          if ("Logical" in args[0]) {
            this.width = args[0].Logical.width;
            this.height = args[0].Logical.height;
          } else {
            this.width = args[0].width;
            this.height = args[0].height;
          }
        } else {
          this.width = args[0];
          this.height = args[1];
        }
      }
      /**
       * Converts the logical size to a physical one.
       * @example
       * ```typescript
       * import { LogicalSize } from '@tauri-apps/api/dpi';
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       *
       * const appWindow = getCurrentWindow();
       * const factor = await appWindow.scaleFactor();
       * const size = new LogicalSize(400, 500);
       * const physical = size.toPhysical(factor);
       * ```
       *
       * @since 2.0.0
       */
      toPhysical(scaleFactor) {
        return new PhysicalSize(this.width * scaleFactor, this.height * scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          width: this.width,
          height: this.height
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    PhysicalSize = class {
      constructor(...args) {
        this.type = "Physical";
        if (args.length === 1) {
          if ("Physical" in args[0]) {
            this.width = args[0].Physical.width;
            this.height = args[0].Physical.height;
          } else {
            this.width = args[0].width;
            this.height = args[0].height;
          }
        } else {
          this.width = args[0];
          this.height = args[1];
        }
      }
      /**
       * Converts the physical size to a logical one.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const appWindow = getCurrentWindow();
       * const factor = await appWindow.scaleFactor();
       * const size = await appWindow.innerSize(); // PhysicalSize
       * const logical = size.toLogical(factor);
       * ```
       */
      toLogical(scaleFactor) {
        return new LogicalSize(this.width / scaleFactor, this.height / scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          width: this.width,
          height: this.height
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    Size = class {
      constructor(size) {
        this.size = size;
      }
      toLogical(scaleFactor) {
        return this.size instanceof LogicalSize ? this.size : this.size.toLogical(scaleFactor);
      }
      toPhysical(scaleFactor) {
        return this.size instanceof PhysicalSize ? this.size : this.size.toPhysical(scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          [`${this.size.type}`]: {
            width: this.size.width,
            height: this.size.height
          }
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    LogicalPosition = class {
      constructor(...args) {
        this.type = "Logical";
        if (args.length === 1) {
          if ("Logical" in args[0]) {
            this.x = args[0].Logical.x;
            this.y = args[0].Logical.y;
          } else {
            this.x = args[0].x;
            this.y = args[0].y;
          }
        } else {
          this.x = args[0];
          this.y = args[1];
        }
      }
      /**
       * Converts the logical position to a physical one.
       * @example
       * ```typescript
       * import { LogicalPosition } from '@tauri-apps/api/dpi';
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       *
       * const appWindow = getCurrentWindow();
       * const factor = await appWindow.scaleFactor();
       * const position = new LogicalPosition(400, 500);
       * const physical = position.toPhysical(factor);
       * ```
       *
       * @since 2.0.0
       */
      toPhysical(scaleFactor) {
        return new PhysicalPosition(this.x * scaleFactor, this.y * scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          x: this.x,
          y: this.y
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    PhysicalPosition = class {
      constructor(...args) {
        this.type = "Physical";
        if (args.length === 1) {
          if ("Physical" in args[0]) {
            this.x = args[0].Physical.x;
            this.y = args[0].Physical.y;
          } else {
            this.x = args[0].x;
            this.y = args[0].y;
          }
        } else {
          this.x = args[0];
          this.y = args[1];
        }
      }
      /**
       * Converts the physical position to a logical one.
       * @example
       * ```typescript
       * import { PhysicalPosition } from '@tauri-apps/api/dpi';
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       *
       * const appWindow = getCurrentWindow();
       * const factor = await appWindow.scaleFactor();
       * const position = new PhysicalPosition(400, 500);
       * const physical = position.toLogical(factor);
       * ```
       *
       * @since 2.0.0
       */
      toLogical(scaleFactor) {
        return new LogicalPosition(this.x / scaleFactor, this.y / scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          x: this.x,
          y: this.y
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    Position = class {
      constructor(position) {
        this.position = position;
      }
      toLogical(scaleFactor) {
        return this.position instanceof LogicalPosition ? this.position : this.position.toLogical(scaleFactor);
      }
      toPhysical(scaleFactor) {
        return this.position instanceof PhysicalPosition ? this.position : this.position.toPhysical(scaleFactor);
      }
      [SERIALIZE_TO_IPC_FN]() {
        return {
          [`${this.position.type}`]: {
            x: this.position.x,
            y: this.position.y
          }
        };
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
  }
});

// node_modules/@tauri-apps/api/event.js
async function _unlisten(event, eventId) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, eventId);
  await invoke("plugin:event|unlisten", {
    event,
    eventId
  });
}
async function listen(event, handler, options) {
  var _a;
  const target = typeof (options === null || options === void 0 ? void 0 : options.target) === "string" ? { kind: "AnyLabel", label: options.target } : (_a = options === null || options === void 0 ? void 0 : options.target) !== null && _a !== void 0 ? _a : { kind: "Any" };
  return invoke("plugin:event|listen", {
    event,
    target,
    handler: transformCallback(handler)
  }).then((eventId) => {
    return async () => _unlisten(event, eventId);
  });
}
async function once(event, handler, options) {
  return listen(event, (eventData) => {
    void _unlisten(event, eventData.id);
    handler(eventData);
  }, options);
}
async function emit(event, payload) {
  await invoke("plugin:event|emit", {
    event,
    payload
  });
}
async function emitTo(target, event, payload) {
  const eventTarget = typeof target === "string" ? { kind: "AnyLabel", label: target } : target;
  await invoke("plugin:event|emit_to", {
    target: eventTarget,
    event,
    payload
  });
}
var TauriEvent;
var init_event = __esm({
  "node_modules/@tauri-apps/api/event.js"() {
    init_core();
    (function(TauriEvent2) {
      TauriEvent2["WINDOW_RESIZED"] = "tauri://resize";
      TauriEvent2["WINDOW_MOVED"] = "tauri://move";
      TauriEvent2["WINDOW_CLOSE_REQUESTED"] = "tauri://close-requested";
      TauriEvent2["WINDOW_DESTROYED"] = "tauri://destroyed";
      TauriEvent2["WINDOW_FOCUS"] = "tauri://focus";
      TauriEvent2["WINDOW_BLUR"] = "tauri://blur";
      TauriEvent2["WINDOW_SCALE_FACTOR_CHANGED"] = "tauri://scale-change";
      TauriEvent2["WINDOW_THEME_CHANGED"] = "tauri://theme-changed";
      TauriEvent2["WINDOW_CREATED"] = "tauri://window-created";
      TauriEvent2["WINDOW_SUSPENDED"] = "tauri://suspended";
      TauriEvent2["WINDOW_RESUMED"] = "tauri://resumed";
      TauriEvent2["WEBVIEW_CREATED"] = "tauri://webview-created";
      TauriEvent2["DRAG_ENTER"] = "tauri://drag-enter";
      TauriEvent2["DRAG_OVER"] = "tauri://drag-over";
      TauriEvent2["DRAG_DROP"] = "tauri://drag-drop";
      TauriEvent2["DRAG_LEAVE"] = "tauri://drag-leave";
    })(TauriEvent || (TauriEvent = {}));
  }
});

// node_modules/@tauri-apps/api/image.js
function transformImage(image) {
  const ret = image == null ? null : typeof image === "string" ? image : image instanceof Image ? image.rid : image;
  return ret;
}
var Image;
var init_image = __esm({
  "node_modules/@tauri-apps/api/image.js"() {
    init_core();
    Image = class _Image extends Resource {
      /**
       * Creates an Image from a resource ID. For internal use only.
       *
       * @ignore
       */
      constructor(rid) {
        super(rid);
      }
      /** Creates a new Image using RGBA data, in row-major order from top to bottom, and with specified width and height. */
      static async new(rgba, width, height) {
        return invoke("plugin:image|new", {
          rgba: transformImage(rgba),
          width,
          height
        }).then((rid) => new _Image(rid));
      }
      /**
       * Creates a new image using the provided bytes by inferring the file format.
       * If the format is known, prefer [@link Image.fromPngBytes] or [@link Image.fromIcoBytes].
       *
       * Only `ico` and `png` are supported (based on activated feature flag).
       *
       * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
       * To enable it, change your Cargo.toml file:
       * ```toml
       * [dependencies]
       * tauri = { version = "...", features = ["...", "image-png"] }
       * ```
       */
      static async fromBytes(bytes) {
        return invoke("plugin:image|from_bytes", {
          bytes: transformImage(bytes)
        }).then((rid) => new _Image(rid));
      }
      /**
       * Creates a new image using the provided path.
       *
       * Only `ico` and `png` are supported (based on activated feature flag).
       *
       * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
       * To enable it, change your Cargo.toml file:
       * ```toml
       * [dependencies]
       * tauri = { version = "...", features = ["...", "image-png"] }
       * ```
       */
      static async fromPath(path3) {
        return invoke("plugin:image|from_path", { path: path3 }).then((rid) => new _Image(rid));
      }
      /** Returns the RGBA data for this image, in row-major order from top to bottom.  */
      async rgba() {
        return invoke("plugin:image|rgba", {
          rid: this.rid
        }).then((buffer) => new Uint8Array(buffer));
      }
      /** Returns the size of this image.  */
      async size() {
        return invoke("plugin:image|size", { rid: this.rid });
      }
    };
  }
});

// node_modules/@tauri-apps/api/window.js
var window_exports = {};
__export(window_exports, {
  CloseRequestedEvent: () => CloseRequestedEvent,
  Effect: () => Effect,
  EffectState: () => EffectState,
  LogicalPosition: () => LogicalPosition,
  LogicalSize: () => LogicalSize,
  PhysicalPosition: () => PhysicalPosition,
  PhysicalSize: () => PhysicalSize,
  ProgressBarStatus: () => ProgressBarStatus,
  UserAttentionType: () => UserAttentionType,
  Window: () => Window,
  availableMonitors: () => availableMonitors,
  currentMonitor: () => currentMonitor,
  cursorPosition: () => cursorPosition,
  getAllWindows: () => getAllWindows,
  getCurrentWindow: () => getCurrentWindow,
  monitorFromPoint: () => monitorFromPoint,
  primaryMonitor: () => primaryMonitor
});
function getCurrentWindow() {
  return new Window(window.__TAURI_INTERNALS__.metadata.currentWindow.label, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  });
}
async function getAllWindows() {
  return invoke("plugin:window|get_all_windows").then((windows) => windows.map((w) => new Window(w, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  })));
}
function mapMonitor(m) {
  return m === null ? null : {
    name: m.name,
    scaleFactor: m.scaleFactor,
    position: new PhysicalPosition(m.position),
    size: new PhysicalSize(m.size),
    workArea: {
      position: new PhysicalPosition(m.workArea.position),
      size: new PhysicalSize(m.workArea.size)
    }
  };
}
async function currentMonitor() {
  return invoke("plugin:window|current_monitor").then(mapMonitor);
}
async function primaryMonitor() {
  return invoke("plugin:window|primary_monitor").then(mapMonitor);
}
async function monitorFromPoint(x, y) {
  return invoke("plugin:window|monitor_from_point", {
    x,
    y
  }).then(mapMonitor);
}
async function availableMonitors() {
  return invoke("plugin:window|available_monitors").then((ms) => ms.map(mapMonitor));
}
async function cursorPosition() {
  return invoke("plugin:window|cursor_position").then((v) => new PhysicalPosition(v));
}
var UserAttentionType, CloseRequestedEvent, ProgressBarStatus, localTauriEvents, Window, BackgroundThrottlingPolicy, ScrollBarStyle, Effect, EffectState;
var init_window = __esm({
  "node_modules/@tauri-apps/api/window.js"() {
    init_dpi();
    init_dpi();
    init_event();
    init_core();
    init_image();
    (function(UserAttentionType2) {
      UserAttentionType2[UserAttentionType2["Critical"] = 1] = "Critical";
      UserAttentionType2[UserAttentionType2["Informational"] = 2] = "Informational";
    })(UserAttentionType || (UserAttentionType = {}));
    CloseRequestedEvent = class {
      constructor(event) {
        this._preventDefault = false;
        this.event = event.event;
        this.id = event.id;
      }
      preventDefault() {
        this._preventDefault = true;
      }
      isPreventDefault() {
        return this._preventDefault;
      }
    };
    (function(ProgressBarStatus2) {
      ProgressBarStatus2["None"] = "none";
      ProgressBarStatus2["Normal"] = "normal";
      ProgressBarStatus2["Indeterminate"] = "indeterminate";
      ProgressBarStatus2["Paused"] = "paused";
      ProgressBarStatus2["Error"] = "error";
    })(ProgressBarStatus || (ProgressBarStatus = {}));
    localTauriEvents = ["tauri://created", "tauri://error"];
    Window = class {
      /**
       * Creates a new Window.
       * @example
       * ```typescript
       * import { Window } from '@tauri-apps/api/window';
       * const appWindow = new Window('my-label');
       * appWindow.once('tauri://created', function () {
       *  // window successfully created
       * });
       * appWindow.once('tauri://error', function (e) {
       *  // an error happened creating the window
       * });
       * ```
       *
       * @param label The unique window label. Must be alphanumeric: `a-zA-Z-/:_`.
       * @returns The {@link Window} instance to communicate with the window.
       */
      constructor(label, options = {}) {
        var _a;
        this.label = label;
        this.listeners = /* @__PURE__ */ Object.create(null);
        if (!(options === null || options === void 0 ? void 0 : options.skip)) {
          invoke("plugin:window|create", {
            options: {
              ...options,
              parent: typeof options.parent === "string" ? options.parent : (_a = options.parent) === null || _a === void 0 ? void 0 : _a.label,
              label
            }
          }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
        }
      }
      /**
       * Gets the Window associated with the given label.
       * @example
       * ```typescript
       * import { Window } from '@tauri-apps/api/window';
       * const mainWindow = Window.getByLabel('main');
       * ```
       *
       * @param label The window label.
       * @returns The Window instance to communicate with the window or null if the window doesn't exist.
       */
      static async getByLabel(label) {
        var _a;
        return (_a = (await getAllWindows()).find((w) => w.label === label)) !== null && _a !== void 0 ? _a : null;
      }
      /**
       * Get an instance of `Window` for the current window.
       */
      static getCurrent() {
        return getCurrentWindow();
      }
      /**
       * Gets a list of instances of `Window` for all available windows.
       */
      static async getAll() {
        return getAllWindows();
      }
      /**
       *  Gets the focused window.
       * @example
       * ```typescript
       * import { Window } from '@tauri-apps/api/window';
       * const focusedWindow = Window.getFocusedWindow();
       * ```
       *
       * @returns The Window instance or `undefined` if there is not any focused window.
       */
      static async getFocusedWindow() {
        for (const w of await getAllWindows()) {
          if (await w.isFocused()) {
            return w;
          }
        }
        return null;
      }
      /**
       * Listen to an emitted event on this window.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const unlisten = await getCurrentWindow().listen<string>('state-changed', (event) => {
       *   console.log(`Got error: ${payload}`);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
       * @param handler Event handler.
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async listen(event, handler) {
        if (this._handleTauriEvent(event, handler)) {
          return () => {
            const listeners = this.listeners[event];
            listeners.splice(listeners.indexOf(handler), 1);
          };
        }
        return listen(event, handler, {
          target: { kind: "Window", label: this.label }
        });
      }
      /**
       * Listen to an emitted event on this window only once.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const unlisten = await getCurrentWindow().once<null>('initialized', (event) => {
       *   console.log(`Window initialized!`);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
       * @param handler Event handler.
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async once(event, handler) {
        if (this._handleTauriEvent(event, handler)) {
          return () => {
            const listeners = this.listeners[event];
            listeners.splice(listeners.indexOf(handler), 1);
          };
        }
        return once(event, handler, {
          target: { kind: "Window", label: this.label }
        });
      }
      /**
       * Emits an event to all {@link EventTarget|targets}.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().emit('window-loaded', { loggedIn: true, token: 'authToken' });
       * ```
       *
       * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
       * @param payload Event payload.
       */
      async emit(event, payload) {
        if (localTauriEvents.includes(event)) {
          for (const handler of this.listeners[event] || []) {
            handler({
              event,
              id: -1,
              payload
            });
          }
          return;
        }
        return emit(event, payload);
      }
      /**
       * Emits an event to all {@link EventTarget|targets} matching the given target.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().emit('main', 'window-loaded', { loggedIn: true, token: 'authToken' });
       * ```
       * @param target Label of the target Window/Webview/WebviewWindow or raw {@link EventTarget} object.
       * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
       * @param payload Event payload.
       */
      async emitTo(target, event, payload) {
        if (localTauriEvents.includes(event)) {
          for (const handler of this.listeners[event] || []) {
            handler({
              event,
              id: -1,
              payload
            });
          }
          return;
        }
        return emitTo(target, event, payload);
      }
      /** @ignore */
      _handleTauriEvent(event, handler) {
        if (localTauriEvents.includes(event)) {
          if (!(event in this.listeners)) {
            this.listeners[event] = [handler];
          } else {
            this.listeners[event].push(handler);
          }
          return true;
        }
        return false;
      }
      // Getters
      /**
       * The scale factor that can be used to map physical pixels to logical pixels.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const factor = await getCurrentWindow().scaleFactor();
       * ```
       *
       * @returns The window's monitor scale factor.
       */
      async scaleFactor() {
        return invoke("plugin:window|scale_factor", {
          label: this.label
        });
      }
      /**
       * The position of the top-left hand corner of the window's client area relative to the top-left hand corner of the desktop.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const position = await getCurrentWindow().innerPosition();
       * ```
       *
       * @returns The window's inner position.
       */
      async innerPosition() {
        return invoke("plugin:window|inner_position", {
          label: this.label
        }).then((p) => new PhysicalPosition(p));
      }
      /**
       * The position of the top-left hand corner of the window relative to the top-left hand corner of the desktop.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const position = await getCurrentWindow().outerPosition();
       * ```
       *
       * @returns The window's outer position.
       */
      async outerPosition() {
        return invoke("plugin:window|outer_position", {
          label: this.label
        }).then((p) => new PhysicalPosition(p));
      }
      /**
       * The physical size of the window's client area.
       * The client area is the content of the window, excluding the title bar and borders.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const size = await getCurrentWindow().innerSize();
       * ```
       *
       * @returns The window's inner size.
       */
      async innerSize() {
        return invoke("plugin:window|inner_size", {
          label: this.label
        }).then((s) => new PhysicalSize(s));
      }
      /**
       * The physical size of the entire window.
       * These dimensions include the title bar and borders. If you don't want that (and you usually don't), use inner_size instead.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const size = await getCurrentWindow().outerSize();
       * ```
       *
       * @returns The window's outer size.
       */
      async outerSize() {
        return invoke("plugin:window|outer_size", {
          label: this.label
        }).then((s) => new PhysicalSize(s));
      }
      /**
       * Gets the window's current fullscreen state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const fullscreen = await getCurrentWindow().isFullscreen();
       * ```
       *
       * @returns Whether the window is in fullscreen mode or not.
       */
      async isFullscreen() {
        return invoke("plugin:window|is_fullscreen", {
          label: this.label
        });
      }
      /**
       * Gets the window's current minimized state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const minimized = await getCurrentWindow().isMinimized();
       * ```
       */
      async isMinimized() {
        return invoke("plugin:window|is_minimized", {
          label: this.label
        });
      }
      /**
       * Gets the window's current maximized state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const maximized = await getCurrentWindow().isMaximized();
       * ```
       *
       * @returns Whether the window is maximized or not.
       */
      async isMaximized() {
        return invoke("plugin:window|is_maximized", {
          label: this.label
        });
      }
      /**
       * Gets the window's current focus state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const focused = await getCurrentWindow().isFocused();
       * ```
       *
       * @returns Whether the window is focused or not.
       */
      async isFocused() {
        return invoke("plugin:window|is_focused", {
          label: this.label
        });
      }
      /**
       * Gets the window's current decorated state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const decorated = await getCurrentWindow().isDecorated();
       * ```
       *
       * @returns Whether the window is decorated or not.
       */
      async isDecorated() {
        return invoke("plugin:window|is_decorated", {
          label: this.label
        });
      }
      /**
       * Gets the window's current resizable state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const resizable = await getCurrentWindow().isResizable();
       * ```
       *
       * @returns Whether the window is resizable or not.
       */
      async isResizable() {
        return invoke("plugin:window|is_resizable", {
          label: this.label
        });
      }
      /**
       * Gets the window's native maximize button state.
       *
       * #### Platform-specific
       *
       * - **Linux / iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const maximizable = await getCurrentWindow().isMaximizable();
       * ```
       *
       * @returns Whether the window's native maximize button is enabled or not.
       */
      async isMaximizable() {
        return invoke("plugin:window|is_maximizable", {
          label: this.label
        });
      }
      /**
       * Gets the window's native minimize button state.
       *
       * #### Platform-specific
       *
       * - **Linux / iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const minimizable = await getCurrentWindow().isMinimizable();
       * ```
       *
       * @returns Whether the window's native minimize button is enabled or not.
       */
      async isMinimizable() {
        return invoke("plugin:window|is_minimizable", {
          label: this.label
        });
      }
      /**
       * Gets the window's native close button state.
       *
       * #### Platform-specific
       *
       * - **iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const closable = await getCurrentWindow().isClosable();
       * ```
       *
       * @returns Whether the window's native close button is enabled or not.
       */
      async isClosable() {
        return invoke("plugin:window|is_closable", {
          label: this.label
        });
      }
      /**
       * Gets the window's current visible state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const visible = await getCurrentWindow().isVisible();
       * ```
       *
       * @returns Whether the window is visible or not.
       */
      async isVisible() {
        return invoke("plugin:window|is_visible", {
          label: this.label
        });
      }
      /**
       * Gets the window's current title.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const title = await getCurrentWindow().title();
       * ```
       */
      async title() {
        return invoke("plugin:window|title", {
          label: this.label
        });
      }
      /**
       * Gets the window's current theme.
       *
       * #### Platform-specific
       *
       * - **macOS:** Theme was introduced on macOS 10.14. Returns `light` on macOS 10.13 and below.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const theme = await getCurrentWindow().theme();
       * ```
       *
       * @returns The window theme.
       */
      async theme() {
        return invoke("plugin:window|theme", {
          label: this.label
        });
      }
      /**
       * Whether the window is configured to be always on top of other windows or not.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * const alwaysOnTop = await getCurrentWindow().isAlwaysOnTop();
       * ```
       *
       * @returns Whether the window is visible or not.
       */
      async isAlwaysOnTop() {
        return invoke("plugin:window|is_always_on_top", {
          label: this.label
        });
      }
      async activityName() {
        return invoke("plugin:window|activity_name", {
          label: this.label
        });
      }
      async sceneIdentifier() {
        return invoke("plugin:window|scene_identifier", {
          label: this.label
        });
      }
      // Setters
      /**
       * Centers the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().center();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async center() {
        return invoke("plugin:window|center", {
          label: this.label
        });
      }
      /**
       *  Requests user attention to the window, this has no effect if the application
       * is already focused. How requesting for user attention manifests is platform dependent,
       * see `UserAttentionType` for details.
       *
       * Providing `null` will unset the request for user attention. Unsetting the request for
       * user attention might not be done automatically by the WM when the window receives input.
       *
       * #### Platform-specific
       *
       * - **macOS:** `null` has no effect.
       * - **Linux:** Urgency levels have the same effect.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().requestUserAttention();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async requestUserAttention(requestType) {
        let requestType_ = null;
        if (requestType) {
          if (requestType === UserAttentionType.Critical) {
            requestType_ = { type: "Critical" };
          } else {
            requestType_ = { type: "Informational" };
          }
        }
        return invoke("plugin:window|request_user_attention", {
          label: this.label,
          value: requestType_
        });
      }
      /**
       * Updates the window resizable flag.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setResizable(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setResizable(resizable) {
        return invoke("plugin:window|set_resizable", {
          label: this.label,
          value: resizable
        });
      }
      /**
       * Enable or disable the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setEnabled(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       *
       * @since 2.0.0
       */
      async setEnabled(enabled) {
        return invoke("plugin:window|set_enabled", {
          label: this.label,
          value: enabled
        });
      }
      /**
       * Whether the window is enabled or disabled.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setEnabled(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       *
       * @since 2.0.0
       */
      async isEnabled() {
        return invoke("plugin:window|is_enabled", {
          label: this.label
        });
      }
      /**
       * Sets whether the window's native maximize button is enabled or not.
       * If resizable is set to false, this setting is ignored.
       *
       * #### Platform-specific
       *
       * - **macOS:** Disables the "zoom" button in the window titlebar, which is also used to enter fullscreen mode.
       * - **Linux / iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setMaximizable(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setMaximizable(maximizable) {
        return invoke("plugin:window|set_maximizable", {
          label: this.label,
          value: maximizable
        });
      }
      /**
       * Sets whether the window's native minimize button is enabled or not.
       *
       * #### Platform-specific
       *
       * - **Linux / iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setMinimizable(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setMinimizable(minimizable) {
        return invoke("plugin:window|set_minimizable", {
          label: this.label,
          value: minimizable
        });
      }
      /**
       * Sets whether the window's native close button is enabled or not.
       *
       * #### Platform-specific
       *
       * - **Linux:** GTK+ will do its best to convince the window manager not to show a close button. Depending on the system, this function may not have any effect when called on a window that is already visible
       * - **iOS / Android:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setClosable(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setClosable(closable) {
        return invoke("plugin:window|set_closable", {
          label: this.label,
          value: closable
        });
      }
      /**
       * Sets the window title.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setTitle('Tauri');
       * ```
       *
       * @param title The new title
       * @returns A promise indicating the success or failure of the operation.
       */
      async setTitle(title) {
        return invoke("plugin:window|set_title", {
          label: this.label,
          value: title
        });
      }
      /**
       * Maximizes the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().maximize();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async maximize() {
        return invoke("plugin:window|maximize", {
          label: this.label
        });
      }
      /**
       * Unmaximizes the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().unmaximize();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async unmaximize() {
        return invoke("plugin:window|unmaximize", {
          label: this.label
        });
      }
      /**
       * Toggles the window maximized state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().toggleMaximize();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async toggleMaximize() {
        return invoke("plugin:window|toggle_maximize", {
          label: this.label
        });
      }
      /**
       * Minimizes the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().minimize();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async minimize() {
        return invoke("plugin:window|minimize", {
          label: this.label
        });
      }
      /**
       * Unminimizes the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().unminimize();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async unminimize() {
        return invoke("plugin:window|unminimize", {
          label: this.label
        });
      }
      /**
       * Sets the window visibility to true.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().show();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async show() {
        return invoke("plugin:window|show", {
          label: this.label
        });
      }
      /**
       * Sets the window visibility to false.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().hide();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async hide() {
        return invoke("plugin:window|hide", {
          label: this.label
        });
      }
      /**
       * Closes the window.
       *
       * Note this emits a closeRequested event so you can intercept it. To force window close, use {@link Window.destroy}.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().close();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async close() {
        return invoke("plugin:window|close", {
          label: this.label
        });
      }
      /**
       * Destroys the window. Behaves like {@link Window.close} but forces the window close instead of emitting a closeRequested event.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().destroy();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async destroy() {
        return invoke("plugin:window|destroy", {
          label: this.label
        });
      }
      /**
       * Whether the window should have borders and bars.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setDecorations(false);
       * ```
       *
       * @param decorations Whether the window should have borders and bars.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setDecorations(decorations) {
        return invoke("plugin:window|set_decorations", {
          label: this.label,
          value: decorations
        });
      }
      /**
       * Whether or not the window should have shadow.
       *
       * #### Platform-specific
       *
       * - **Windows:**
       *   - `false` has no effect on decorated window, shadows are always ON.
       *   - `true` will make undecorated window have a 1px white border,
       * and on Windows 11, it will have a rounded corners.
       * - **Linux:** Unsupported.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setShadow(false);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setShadow(enable) {
        return invoke("plugin:window|set_shadow", {
          label: this.label,
          value: enable
        });
      }
      /**
       * Set window effects.
       */
      async setEffects(effects) {
        return invoke("plugin:window|set_effects", {
          label: this.label,
          value: effects
        });
      }
      /**
       * Clear any applied effects if possible.
       */
      async clearEffects() {
        return invoke("plugin:window|set_effects", {
          label: this.label,
          value: null
        });
      }
      /**
       * Whether the window should always be on top of other windows.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setAlwaysOnTop(true);
       * ```
       *
       * @param alwaysOnTop Whether the window should always be on top of other windows or not.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setAlwaysOnTop(alwaysOnTop) {
        return invoke("plugin:window|set_always_on_top", {
          label: this.label,
          value: alwaysOnTop
        });
      }
      /**
       * Whether the window should always be below other windows.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setAlwaysOnBottom(true);
       * ```
       *
       * @param alwaysOnBottom Whether the window should always be below other windows or not.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setAlwaysOnBottom(alwaysOnBottom) {
        return invoke("plugin:window|set_always_on_bottom", {
          label: this.label,
          value: alwaysOnBottom
        });
      }
      /**
       * Prevents the window contents from being captured by other apps.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setContentProtected(true);
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setContentProtected(protected_) {
        return invoke("plugin:window|set_content_protected", {
          label: this.label,
          value: protected_
        });
      }
      /**
       * Resizes the window with a new inner size.
       * @example
       * ```typescript
       * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
       * await getCurrentWindow().setSize(new LogicalSize(600, 500));
       * ```
       *
       * @param size The logical or physical inner size.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setSize(size) {
        return invoke("plugin:window|set_size", {
          label: this.label,
          value: size instanceof Size ? size : new Size(size)
        });
      }
      /**
       * Sets the window minimum inner size. If the `size` argument is not provided, the constraint is unset.
       * @example
       * ```typescript
       * import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
       * await getCurrentWindow().setMinSize(new PhysicalSize(600, 500));
       * ```
       *
       * @param size The logical or physical inner size, or `null` to unset the constraint.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setMinSize(size) {
        return invoke("plugin:window|set_min_size", {
          label: this.label,
          value: size instanceof Size ? size : size ? new Size(size) : null
        });
      }
      /**
       * Sets the window maximum inner size. If the `size` argument is undefined, the constraint is unset.
       * @example
       * ```typescript
       * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
       * await getCurrentWindow().setMaxSize(new LogicalSize(600, 500));
       * ```
       *
       * @param size The logical or physical inner size, or `null` to unset the constraint.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setMaxSize(size) {
        return invoke("plugin:window|set_max_size", {
          label: this.label,
          value: size instanceof Size ? size : size ? new Size(size) : null
        });
      }
      /**
       * Sets the window inner size constraints.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setSizeConstraints({ minWidth: 300 });
       * ```
       *
       * @param constraints The logical or physical inner size, or `null` to unset the constraint.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setSizeConstraints(constraints) {
        function logical(pixel) {
          return pixel ? { Logical: pixel } : null;
        }
        return invoke("plugin:window|set_size_constraints", {
          label: this.label,
          value: {
            minWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minWidth),
            minHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minHeight),
            maxWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxWidth),
            maxHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxHeight)
          }
        });
      }
      /**
       * Sets the window outer position.
       * @example
       * ```typescript
       * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
       * await getCurrentWindow().setPosition(new LogicalPosition(600, 500));
       * ```
       *
       * @param position The new position, in logical or physical pixels.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setPosition(position) {
        return invoke("plugin:window|set_position", {
          label: this.label,
          value: position instanceof Position ? position : new Position(position)
        });
      }
      /**
       * Sets the window fullscreen state.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setFullscreen(true);
       * ```
       *
       * @param fullscreen Whether the window should go to fullscreen or not.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setFullscreen(fullscreen) {
        return invoke("plugin:window|set_fullscreen", {
          label: this.label,
          value: fullscreen
        });
      }
      /**
       * On macOS, Toggles a fullscreen mode that doesn’t require a new macOS space. Returns a boolean indicating whether the transition was successful (this won’t work if the window was already in the native fullscreen).
       * This is how fullscreen used to work on macOS in versions before Lion. And allows the user to have a fullscreen window without using another space or taking control over the entire monitor.
       *
       * On other platforms, this is the same as {@link Window.setFullscreen}.
       *
       * @param fullscreen Whether the window should go to simple fullscreen or not.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setSimpleFullscreen(fullscreen) {
        return invoke("plugin:window|set_simple_fullscreen", {
          label: this.label,
          value: fullscreen
        });
      }
      /**
       * Bring the window to front and focus.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setFocus();
       * ```
       *
       * @returns A promise indicating the success or failure of the operation.
       */
      async setFocus() {
        return invoke("plugin:window|set_focus", {
          label: this.label
        });
      }
      /**
       * Sets whether the window can be focused.
       *
       * #### Platform-specific
       *
       * - **macOS**: If the window is already focused, it is not possible to unfocus it after calling `set_focusable(false)`.
       *   In this case, you might consider calling {@link Window.setFocus} but it will move the window to the back i.e. at the bottom in terms of z-order.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setFocusable(true);
       * ```
       *
       * @param focusable Whether the window can be focused.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setFocusable(focusable) {
        return invoke("plugin:window|set_focusable", {
          label: this.label,
          value: focusable
        });
      }
      /**
       * Sets the window icon.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setIcon('/tauri/awesome.png');
       * ```
       *
       * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
       * To enable it, change your Cargo.toml file:
       * ```toml
       * [dependencies]
       * tauri = { version = "...", features = ["...", "image-png"] }
       * ```
       *
       * @param icon Icon bytes or path to the icon file.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setIcon(icon) {
        return invoke("plugin:window|set_icon", {
          label: this.label,
          value: transformImage(icon)
        });
      }
      /**
       * Whether the window icon should be hidden from the taskbar or not.
       *
       * #### Platform-specific
       *
       * - **macOS:** Unsupported.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setSkipTaskbar(true);
       * ```
       *
       * @param skip true to hide window icon, false to show it.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setSkipTaskbar(skip) {
        return invoke("plugin:window|set_skip_taskbar", {
          label: this.label,
          value: skip
        });
      }
      /**
       * Grabs the cursor, preventing it from leaving the window.
       *
       * There's no guarantee that the cursor will be hidden. You should
       * hide it by yourself if you want so.
       *
       * #### Platform-specific
       *
       * - **Linux:** Unsupported.
       * - **macOS:** This locks the cursor in a fixed location, which looks visually awkward.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setCursorGrab(true);
       * ```
       *
       * @param grab `true` to grab the cursor icon, `false` to release it.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setCursorGrab(grab) {
        return invoke("plugin:window|set_cursor_grab", {
          label: this.label,
          value: grab
        });
      }
      /**
       * Modifies the cursor's visibility.
       *
       * #### Platform-specific
       *
       * - **Windows:** The cursor is only hidden within the confines of the window.
       * - **macOS:** The cursor is hidden as long as the window has input focus, even if the cursor is
       *   outside of the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setCursorVisible(false);
       * ```
       *
       * @param visible If `false`, this will hide the cursor. If `true`, this will show the cursor.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setCursorVisible(visible) {
        return invoke("plugin:window|set_cursor_visible", {
          label: this.label,
          value: visible
        });
      }
      /**
       * Modifies the cursor icon of the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setCursorIcon('help');
       * ```
       *
       * @param icon The new cursor icon.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setCursorIcon(icon) {
        return invoke("plugin:window|set_cursor_icon", {
          label: this.label,
          value: icon
        });
      }
      /**
       * Sets the window background color.
       *
       * #### Platform-specific:
       *
       * - **Windows:** alpha channel is ignored.
       * - **iOS / Android:** Unsupported.
       *
       * @returns A promise indicating the success or failure of the operation.
       *
       * @since 2.1.0
       */
      async setBackgroundColor(color) {
        return invoke("plugin:window|set_background_color", { color });
      }
      /**
       * Changes the position of the cursor in window coordinates.
       * @example
       * ```typescript
       * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
       * await getCurrentWindow().setCursorPosition(new LogicalPosition(600, 300));
       * ```
       *
       * @param position The new cursor position.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setCursorPosition(position) {
        return invoke("plugin:window|set_cursor_position", {
          label: this.label,
          value: position instanceof Position ? position : new Position(position)
        });
      }
      /**
       * Changes the cursor events behavior.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setIgnoreCursorEvents(true);
       * ```
       *
       * @param ignore `true` to ignore the cursor events; `false` to process them as usual.
       * @returns A promise indicating the success or failure of the operation.
       */
      async setIgnoreCursorEvents(ignore) {
        return invoke("plugin:window|set_ignore_cursor_events", {
          label: this.label,
          value: ignore
        });
      }
      /**
       * Starts dragging the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().startDragging();
       * ```
       *
       * @return A promise indicating the success or failure of the operation.
       */
      async startDragging() {
        return invoke("plugin:window|start_dragging", {
          label: this.label
        });
      }
      /**
       * Starts resize-dragging the window.
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().startResizeDragging();
       * ```
       *
       * @return A promise indicating the success or failure of the operation.
       */
      async startResizeDragging(direction) {
        return invoke("plugin:window|start_resize_dragging", {
          label: this.label,
          value: direction
        });
      }
      /**
       * Sets the badge count. It is app wide and not specific to this window.
       *
       * #### Platform-specific
       *
       * - **Windows**: Unsupported. Use @{linkcode Window.setOverlayIcon} instead.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setBadgeCount(5);
       * ```
       *
       * @param count The badge count. Use `undefined` to remove the badge.
       * @return A promise indicating the success or failure of the operation.
       */
      async setBadgeCount(count) {
        return invoke("plugin:window|set_badge_count", {
          label: this.label,
          value: count
        });
      }
      /**
       * Sets the badge cont **macOS only**.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setBadgeLabel("Hello");
       * ```
       *
       * @param label The badge label. Use `undefined` to remove the badge.
       * @return A promise indicating the success or failure of the operation.
       */
      async setBadgeLabel(label) {
        return invoke("plugin:window|set_badge_label", {
          label: this.label,
          value: label
        });
      }
      /**
       * Sets the overlay icon. **Windows only**
       * The overlay icon can be set for every window.
       *
       *
       * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
       * To enable it, change your Cargo.toml file:
       *
       * ```toml
       * [dependencies]
       * tauri = { version = "...", features = ["...", "image-png"] }
       * ```
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from '@tauri-apps/api/window';
       * await getCurrentWindow().setOverlayIcon("/tauri/awesome.png");
       * ```
       *
       * @param icon Icon bytes or path to the icon file. Use `undefined` to remove the overlay icon.
       * @return A promise indicating the success or failure of the operation.
       */
      async setOverlayIcon(icon) {
        return invoke("plugin:window|set_overlay_icon", {
          label: this.label,
          value: icon ? transformImage(icon) : void 0
        });
      }
      /**
       * Sets the taskbar progress state.
       *
       * #### Platform-specific
       *
       * - **Linux / macOS**: Progress bar is app-wide and not specific to this window.
       * - **Linux**: Only supported desktop environments with `libunity` (e.g. GNOME).
       *
       * @example
       * ```typescript
       * import { getCurrentWindow, ProgressBarStatus } from '@tauri-apps/api/window';
       * await getCurrentWindow().setProgressBar({
       *   status: ProgressBarStatus.Normal,
       *   progress: 50,
       * });
       * ```
       *
       * @return A promise indicating the success or failure of the operation.
       */
      async setProgressBar(state) {
        return invoke("plugin:window|set_progress_bar", {
          label: this.label,
          value: state
        });
      }
      /**
       * Sets whether the window should be visible on all workspaces or virtual desktops.
       *
       * #### Platform-specific
       *
       * - **Windows / iOS / Android:** Unsupported.
       *
       * @since 2.0.0
       */
      async setVisibleOnAllWorkspaces(visible) {
        return invoke("plugin:window|set_visible_on_all_workspaces", {
          label: this.label,
          value: visible
        });
      }
      /**
       * Sets the title bar style. **macOS only**.
       *
       * @since 2.0.0
       */
      async setTitleBarStyle(style) {
        return invoke("plugin:window|set_title_bar_style", {
          label: this.label,
          value: style
        });
      }
      /**
       * Set window theme, pass in `null` or `undefined` to follow system theme
       *
       * #### Platform-specific
       *
       * - **Linux / macOS**: Theme is app-wide and not specific to this window.
       * - **iOS / Android:** Unsupported.
       *
       * @since 2.0.0
       */
      async setTheme(theme) {
        return invoke("plugin:window|set_theme", {
          label: this.label,
          value: theme
        });
      }
      // Listeners
      /**
       * Listen to window resize.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * const unlisten = await getCurrentWindow().onResized(({ payload: size }) => {
       *  console.log('Window resized', size);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onResized(handler) {
        return this.listen(TauriEvent.WINDOW_RESIZED, (e) => {
          e.payload = new PhysicalSize(e.payload);
          handler(e);
        });
      }
      /**
       * Listen to window move.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * const unlisten = await getCurrentWindow().onMoved(({ payload: position }) => {
       *  console.log('Window moved', position);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onMoved(handler) {
        return this.listen(TauriEvent.WINDOW_MOVED, (e) => {
          e.payload = new PhysicalPosition(e.payload);
          handler(e);
        });
      }
      /**
       * Listen to window close requested. Emitted when the user requests to closes the window.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * import { confirm } from '@tauri-apps/api/dialog';
       * const unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
       *   const confirmed = await confirm('Are you sure?');
       *   if (!confirmed) {
       *     // user did not confirm closing the window; let's prevent it
       *     event.preventDefault();
       *   }
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onCloseRequested(handler) {
        return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async (event) => {
          const evt = new CloseRequestedEvent(event);
          await handler(evt);
          if (!evt.isPreventDefault()) {
            await this.destroy();
          }
        });
      }
      /**
       * Listen to a file drop event.
       * The listener is triggered when the user hovers the selected files on the webview,
       * drops the files or cancels the operation.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/webview";
       * const unlisten = await getCurrentWindow().onDragDropEvent((event) => {
       *  if (event.payload.type === 'over') {
       *    console.log('User hovering', event.payload.position);
       *  } else if (event.payload.type === 'drop') {
       *    console.log('User dropped', event.payload.paths);
       *  } else {
       *    console.log('File drop cancelled');
       *  }
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onDragDropEvent(handler) {
        const unlistenDrag = await this.listen(TauriEvent.DRAG_ENTER, (event) => {
          handler({
            ...event,
            payload: {
              type: "enter",
              paths: event.payload.paths,
              position: new PhysicalPosition(event.payload.position)
            }
          });
        });
        const unlistenDragOver = await this.listen(TauriEvent.DRAG_OVER, (event) => {
          handler({
            ...event,
            payload: {
              type: "over",
              position: new PhysicalPosition(event.payload.position)
            }
          });
        });
        const unlistenDrop = await this.listen(TauriEvent.DRAG_DROP, (event) => {
          handler({
            ...event,
            payload: {
              type: "drop",
              paths: event.payload.paths,
              position: new PhysicalPosition(event.payload.position)
            }
          });
        });
        const unlistenCancel = await this.listen(TauriEvent.DRAG_LEAVE, (event) => {
          handler({ ...event, payload: { type: "leave" } });
        });
        return () => {
          unlistenDrag();
          unlistenDrop();
          unlistenDragOver();
          unlistenCancel();
        };
      }
      /**
       * Listen to window focus change.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * const unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
       *  console.log('Focus changed, window is focused? ' + focused);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onFocusChanged(handler) {
        const unlistenFocus = await this.listen(TauriEvent.WINDOW_FOCUS, (event) => {
          handler({ ...event, payload: true });
        });
        const unlistenBlur = await this.listen(TauriEvent.WINDOW_BLUR, (event) => {
          handler({ ...event, payload: false });
        });
        return () => {
          unlistenFocus();
          unlistenBlur();
        };
      }
      /**
       * Listen to window scale change. Emitted when the window's scale factor has changed.
       * The following user actions can cause DPI changes:
       * - Changing the display's resolution.
       * - Changing the display's scale factor (e.g. in Control Panel on Windows).
       * - Moving the window to a display with a different scale factor.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * const unlisten = await getCurrentWindow().onScaleChanged(({ payload }) => {
       *  console.log('Scale changed', payload.scaleFactor, payload.size);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onScaleChanged(handler) {
        return this.listen(TauriEvent.WINDOW_SCALE_FACTOR_CHANGED, handler);
      }
      /**
       * Listen to the system theme change.
       *
       * @example
       * ```typescript
       * import { getCurrentWindow } from "@tauri-apps/api/window";
       * const unlisten = await getCurrentWindow().onThemeChanged(({ payload: theme }) => {
       *  console.log('New theme: ' + theme);
       * });
       *
       * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
       * unlisten();
       * ```
       *
       * @returns A promise resolving to a function to unlisten to the event.
       * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
       */
      async onThemeChanged(handler) {
        return this.listen(TauriEvent.WINDOW_THEME_CHANGED, handler);
      }
    };
    (function(BackgroundThrottlingPolicy2) {
      BackgroundThrottlingPolicy2["Disabled"] = "disabled";
      BackgroundThrottlingPolicy2["Throttle"] = "throttle";
      BackgroundThrottlingPolicy2["Suspend"] = "suspend";
    })(BackgroundThrottlingPolicy || (BackgroundThrottlingPolicy = {}));
    (function(ScrollBarStyle2) {
      ScrollBarStyle2["Default"] = "default";
      ScrollBarStyle2["FluentOverlay"] = "fluentOverlay";
    })(ScrollBarStyle || (ScrollBarStyle = {}));
    (function(Effect2) {
      Effect2["AppearanceBased"] = "appearanceBased";
      Effect2["Light"] = "light";
      Effect2["Dark"] = "dark";
      Effect2["MediumLight"] = "mediumLight";
      Effect2["UltraDark"] = "ultraDark";
      Effect2["Titlebar"] = "titlebar";
      Effect2["Selection"] = "selection";
      Effect2["Menu"] = "menu";
      Effect2["Popover"] = "popover";
      Effect2["Sidebar"] = "sidebar";
      Effect2["HeaderView"] = "headerView";
      Effect2["Sheet"] = "sheet";
      Effect2["WindowBackground"] = "windowBackground";
      Effect2["HudWindow"] = "hudWindow";
      Effect2["FullScreenUI"] = "fullScreenUI";
      Effect2["Tooltip"] = "tooltip";
      Effect2["ContentBackground"] = "contentBackground";
      Effect2["UnderWindowBackground"] = "underWindowBackground";
      Effect2["UnderPageBackground"] = "underPageBackground";
      Effect2["Mica"] = "mica";
      Effect2["Blur"] = "blur";
      Effect2["Acrylic"] = "acrylic";
      Effect2["Tabbed"] = "tabbed";
      Effect2["TabbedDark"] = "tabbedDark";
      Effect2["TabbedLight"] = "tabbedLight";
    })(Effect || (Effect = {}));
    (function(EffectState2) {
      EffectState2["FollowsWindowActiveState"] = "followsWindowActiveState";
      EffectState2["Active"] = "active";
      EffectState2["Inactive"] = "inactive";
    })(EffectState || (EffectState = {}));
  }
});

// src/app/desktop.ts
var desktop_exports = {};
__export(desktop_exports, {
  detectHost: () => detectHost,
  detectPlatform: () => detectPlatform2,
  downloadText: () => downloadText,
  getWindowApi: () => getWindowApi,
  notifyNative: () => notifyNative,
  pickJsonFile: () => pickJsonFile
});
function detectHost() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__) ? "tauri" : "web";
}
function detectPlatform2() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "win";
  return "linux";
}
async function getWindowApi() {
  if (detectHost() === "tauri") {
    try {
      const { getCurrentWindow: getCurrentWindow2 } = await Promise.resolve().then(() => (init_window(), window_exports));
      const w = getCurrentWindow2();
      return {
        minimize: () => w.minimize(),
        toggleMaximize: () => w.toggleMaximize(),
        close: () => w.close(),
        startDragging: () => w.startDragging(),
        isFullscreen: () => w.isFullscreen(),
        setFullscreen: (v) => w.setFullscreen(v),
        setAlwaysOnTop: (v) => w.setAlwaysOnTop(v)
      };
    } catch {
    }
  }
  return {
    minimize: async () => {
      document.body.classList.toggle("desk-min", true);
    },
    toggleMaximize: async () => {
      document.body.classList.toggle("desk-max");
    },
    close: async () => {
      window.close();
    },
    startDragging: async () => {
    },
    isFullscreen: async () => Boolean(document.fullscreenElement),
    setFullscreen: async (v) => {
      if (v) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    },
    setAlwaysOnTop: async () => {
    }
  };
}
function notifyNative(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    } else if ("Notification" in window && Notification.permission !== "denied") {
      void Notification.requestPermission().then((p) => {
        if (p === "granted") new Notification(title, { body });
      });
    }
  } catch {
  }
}
function downloadText(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
async function pickJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.mj.json,.mjpack";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result)));
        } catch {
          resolve(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
var init_desktop = __esm({
  "src/app/desktop.ts"() {
    "use strict";
  }
});

// src/app/id.ts
function uid(prefix) {
  n += 1;
  return `${prefix}-${Date.now().toString(36)}-${n.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var n;
var init_id = __esm({
  "src/app/id.ts"() {
    "use strict";
    n = 0;
  }
});

// src/domain/types.ts
var GRAPH_SCHEMA_VERSION;
var init_types = __esm({
  "src/domain/types.ts"() {
    "use strict";
    GRAPH_SCHEMA_VERSION = 2;
  }
});

// src/ipc/localDb.ts
function empty() {
  return {
    workflows: [],
    executions: [],
    events: [],
    memories: [],
    skills: [],
    feedback: [],
    evolution: [],
    mcp: seedMcp(),
    approvals: [],
    dlq: [],
    secrets: {},
    runQueue: []
  };
}
function seedMcp() {
  const now = nowIso();
  const rows = [
    ["mcp.filesystem", "Filesystem", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/filesystem/index.ts"]],
    ["mcp.git", "Git", "python", ["-m", "mcp_server_git"]],
    ["mcp.memory", "Memory", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/memory/index.ts"]],
    ["mcp.sequential-thinking", "Sequential Thinking", "npx", ["-y", "tsx", "vendor/mcp-servers-reference/src/sequentialthinking/index.ts"]],
    ["mcp.time", "Time", "python", ["-m", "mcp_server_time"]],
    ["mcp.github", "GitHub", "github-mcp-server", ["stdio"]],
    ["mcp.control", "Control MCP", "mj-control-mcp", ["stdio"]]
  ];
  return rows.map(([id, name, command, args]) => ({
    id,
    name,
    transport: "stdio",
    config: { transport: "stdio", command, args, enabled: id === "mcp.control", pinned: true },
    state: "AVAILABLE",
    createdAt: now,
    updatedAt: now
  }));
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}
function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}
var KEY, localDb;
var init_localDb = __esm({
  "src/ipc/localDb.ts"() {
    "use strict";
    init_id();
    init_types();
    KEY = "mj.v3.db";
    localDb = {
      load,
      save,
      reset() {
        localStorage.removeItem(KEY);
      },
      workflowList() {
        return load().workflows.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      workflowGet(id) {
        const w = load().workflows.find((x) => x.id === id);
        if (!w) throw new Error(`workflow not found: ${id}`);
        return w;
      },
      workflowCreate(name, description) {
        const db = load();
        const id = uid("wf");
        const now = nowIso();
        const graph = {
          schemaVersion: GRAPH_SCHEMA_VERSION,
          id,
          name,
          nodes: [],
          connections: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          groups: [],
          notes: []
        };
        db.workflows.unshift({ id, name, description, graph, createdAt: now, updatedAt: now, tags: [] });
        save(db);
        return { id };
      },
      workflowSave(id, name, description, graph) {
        const db = load();
        const w = db.workflows.find((x) => x.id === id);
        if (!w) throw new Error("workflow not found");
        w.name = name;
        w.description = description;
        w.graph = graph;
        w.updatedAt = nowIso();
        save(db);
      },
      workflowDelete(id) {
        const db = load();
        db.workflows = db.workflows.filter((w) => w.id !== id);
        save(db);
      },
      executionCreate(workflowId, workflowVersion) {
        const db = load();
        const id = uid("exec");
        db.executions.unshift({
          id,
          workflowId,
          workflowVersion,
          status: "RUNNING",
          startedAt: nowIso(),
          endedAt: null,
          error: null,
          stats: { nodesRun: 0, nodesFailed: 0, retries: 0, inputTokens: 0, outputTokens: 0, durationMs: 0, costUsd: 0, evaluationScores: [] }
        });
        save(db);
        return { id };
      },
      executionFinish(id, status, error, stats) {
        const db = load();
        const e = db.executions.find((x) => x.id === id);
        if (!e) return;
        e.status = status;
        e.error = error;
        e.stats = stats;
        e.endedAt = nowIso();
        save(db);
      },
      executionList() {
        return load().executions;
      },
      eventEmit(executionId, kind, level, nodeId, data) {
        const db = load();
        const rec = {
          seq: db.events.length + 1,
          ts: nowIso(),
          kind,
          level,
          nodeId,
          executionId,
          data
        };
        db.events.push(rec);
        if (db.events.length > 4e3) db.events = db.events.slice(-3e3);
        save(db);
        window.dispatchEvent(new CustomEvent("mj://event", { detail: rec }));
        return rec;
      },
      executionEvents(executionId) {
        return load().events.filter((e) => e.executionId === executionId);
      },
      secretSet(ref, value) {
        const db = load();
        db.secrets[ref] = value;
        save(db);
      },
      secretDelete(ref) {
        const db = load();
        delete db.secrets[ref];
        save(db);
      },
      secretExists(refs) {
        const db = load();
        return Object.fromEntries(
          refs.map((r) => [
            r,
            db.secrets[r] ? { exists: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain. Readable by anything in this origin." } : { exists: false, location: "absent", survivesRestart: false }
          ])
        );
      },
      secretGet(ref) {
        return load().secrets[ref] ?? null;
      },
      mcpList() {
        return load().mcp;
      },
      mcpSave(cfg) {
        const db = load();
        const id = cfg.id || uid("mcp");
        const now = nowIso();
        const existing = db.mcp.find((m) => m.id === id);
        if (existing) {
          Object.assign(existing, cfg, { updatedAt: now });
        } else {
          db.mcp.push({
            id,
            name: cfg.name,
            transport: cfg.transport ?? "stdio",
            config: cfg.config ?? { transport: "stdio", enabled: true },
            state: "AVAILABLE",
            createdAt: now,
            updatedAt: now
          });
        }
        save(db);
        return { id };
      },
      mcpRemove(id) {
        const db = load();
        db.mcp = db.mcp.filter((m) => m.id !== id);
        save(db);
      },
      memoryAdd(nodeKey, kind, content, tags, importance) {
        const db = load();
        const rec = { id: uid("mem"), nodeKey, kind, content, tags, importance, createdAt: nowIso() };
        db.memories.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      memorySearch(nodeKey, query, limit = 12) {
        const q = query.toLowerCase();
        return load().memories.filter((m) => m.nodeKey === nodeKey && (!q || m.content.toLowerCase().includes(q))).slice(0, limit);
      },
      memoryDelete(id) {
        const db = load();
        db.memories = db.memories.filter((m) => m.id !== id);
        save(db);
      },
      skillsList(nodeKey) {
        const all = load().skills.filter((s) => s.nodeKey === nodeKey);
        return { skills: all.filter((s) => s.active), all };
      },
      skillUpsert(args) {
        const db = load();
        const rec = {
          id: uid("skill"),
          nodeKey: args.nodeKey,
          name: args.name,
          description: args.description,
          procedure: args.procedure,
          preconditions: "",
          toolStrategy: "",
          verificationStrategy: "",
          knownFailureModes: "",
          version: 1,
          score: null,
          origin: args.origin,
          active: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          applications: 0
        };
        db.skills.push(rec);
        save(db);
        return { id: rec.id, version: 1 };
      },
      feedbackAdd(executionId, nodeKey, rating, comment) {
        const db = load();
        const rec = { id: uid("fb"), executionId, nodeKey, rating, comment, createdAt: nowIso() };
        db.feedback.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      feedbackList() {
        return load().feedback;
      },
      evolutionList() {
        return load().evolution;
      },
      evolutionPropose(cand) {
        const db = load();
        const rec = {
          id: uid("evo"),
          nodeKey: cand.nodeKey ?? "",
          parentVersion: cand.parentVersion ?? 1,
          candidateVersion: cand.candidateVersion ?? 2,
          trigger: cand.trigger ?? "manual",
          evidence: cand.evidence ?? [],
          changes: cand.changes ?? {},
          baselineScore: cand.baselineScore ?? null,
          candidateScore: cand.candidateScore ?? null,
          holdoutPassed: cand.holdoutPassed ?? null,
          regressionPassed: cand.regressionPassed ?? null,
          status: "PROPOSED",
          decision: "PENDING",
          createdAt: nowIso(),
          decidedAt: null
        };
        db.evolution.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      evolutionDecide(id, decision) {
        const db = load();
        const c = db.evolution.find((x) => x.id === id);
        if (c) {
          c.decision = decision;
          c.status = "DECIDED";
          c.decidedAt = nowIso();
          save(db);
        }
        return { ok: true };
      },
      approvalList() {
        return load().approvals.filter((a) => a.status === "OPEN");
      },
      approvalRequest(executionId, nodeKey, summary, payload) {
        const db = load();
        const rec = { id: uid("appr"), executionId, nodeKey, summary, payload, status: "OPEN", createdAt: nowIso() };
        db.approvals.unshift(rec);
        save(db);
        window.dispatchEvent(new CustomEvent("mj://approval", { detail: rec }));
        return { id: rec.id };
      },
      approvalDecide(id, decision) {
        const db = load();
        const a = db.approvals.find((x) => x.id === id);
        if (a) {
          a.status = decision;
          save(db);
        }
      },
      approvalGet(executionId, nodeKey) {
        const a = load().approvals.find((x) => x.executionId === executionId && x.nodeKey === nodeKey && x.status !== "OPEN");
        return a ? { decided: true, status: a.status } : { decided: false };
      },
      dlqList() {
        return load().dlq.filter((d) => d.status === "OPEN");
      },
      dlqAdd(executionId, nodeKey, error, payload, suggestedCause, candidateFix) {
        const db = load();
        const rec = {
          id: uid("dlq"),
          executionId,
          nodeKey,
          error,
          payload,
          status: "OPEN",
          suggestedCause,
          candidateFix,
          createdAt: nowIso()
        };
        db.dlq.unshift(rec);
        save(db);
        return { id: rec.id };
      },
      dlqResolve(id) {
        const db = load();
        const d = db.dlq.find((x) => x.id === id);
        if (d) d.status = "RESOLVED";
        save(db);
      },
      runEnqueue(workflowId) {
        const db = load();
        db.runQueue.push(workflowId);
        save(db);
      },
      runTake() {
        const db = load();
        const items = db.runQueue.splice(0);
        save(db);
        return items;
      }
    };
  }
});

// src/ipc/client.ts
var client_exports = {};
__export(client_exports, {
  ipc: () => ipc,
  nodeKeyOf: () => nodeKeyOf,
  useTauri: () => useTauri
});
async function tauriInvoke(cmd, args) {
  const { invoke: invoke3 } = await Promise.resolve().then(() => (init_core(), core_exports));
  return invoke3(cmd, args ?? {});
}
function nodeKeyOf(workflowId, nodeId) {
  return `${workflowId}:${nodeId}`;
}
var useTauri, browserReason, ipc;
var init_client = __esm({
  "src/ipc/client.ts"() {
    "use strict";
    init_desktop();
    init_version();
    init_localDb();
    useTauri = () => detectHost() === "tauri";
    browserReason = "No browser is attached in this build: MJ does not bundle or launch Chromium, so there is no session, no page and no DOM. Nothing was fetched.";
    ipc = {
      appInfo: async () => {
        if (useTauri()) return tauriInvoke("app_info");
        return {
          version: MJ_VERSION,
          platform: navigator.platform,
          workspaceRoot: "(browser workspace)",
          artifactsDir: "(memory)",
          dbHealthy: true,
          controlMcpPort: 0,
          controlMcpTransport: "stdio",
          controlMcpRunning: true,
          startupMs: 0,
          host: "webview-host",
          vendors: ["mcp-servers-reference", "mcp-github"]
        };
      },
      dbMaintenance: async (vacuum) => {
        if (useTauri()) return tauriInvoke("db_maintenance", { vacuum });
        if (vacuum) {
        }
        const raw = localStorage.getItem("mj.v3.db") ?? "";
        return { vacuumed: vacuum, sizeBytes: raw.length };
      },
      workflowList: async () => {
        if (useTauri()) return tauriInvoke("workflow_list");
        return localDb.workflowList();
      },
      workflowGet: async (workflowId) => {
        if (useTauri()) return tauriInvoke("workflow_get", { workflowId });
        return localDb.workflowGet(workflowId);
      },
      workflowCreate: async (name, description) => {
        if (useTauri()) return tauriInvoke("workflow_create", { name, description });
        return localDb.workflowCreate(name, description);
      },
      workflowDelete: async (workflowId) => {
        if (useTauri()) return tauriInvoke("workflow_delete", { workflowId });
        localDb.workflowDelete(workflowId);
      },
      workflowSave: async (workflowId, name, description, graph) => {
        if (useTauri()) return tauriInvoke("workflow_save", { workflowId, name, description, graph });
        localDb.workflowSave(workflowId, name, description, graph);
      },
      // V7 fix (bug T): the browser fallbacks for versioning fabricated an id and a constant
      // `version: 1`, so the version history UI showed a plausible list of versions that were never
      // stored and could not be restored. These now fail loudly. The Tauri side is real.
      versionCreate: async (workflowId, label) => {
        if (useTauri()) return tauriInvoke("workflow_version_create", { workflowId, label });
        throw new Error("Workflow versions are only stored by the native build; nothing was saved in this browser session.");
      },
      versionList: async (_workflowId) => {
        if (useTauri()) return tauriInvoke("workflow_versions", { workflowId: _workflowId });
        throw new Error("Workflow versions are only stored by the native build; this browser session has no version history to show.");
      },
      versionRestore: async (versionRecordId) => {
        if (useTauri()) return tauriInvoke("workflow_version_restore", { versionRecordId });
        throw new Error("Cannot restore a version in the browser: nothing was ever stored, so nothing was changed.");
      },
      nodeStateLoad: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("node_state_load", { nodeKey });
        return {};
      },
      nodeStateSave: async (nodeKey, rolePrompt) => {
        if (useTauri()) return tauriInvoke("node_state_save", { nodeKey, rolePrompt });
      },
      memoryAdd: async (nodeKey, kind, content, tags, importance, executionId) => {
        if (useTauri()) return tauriInvoke("memory_add", { nodeKey, kind, content, tags, importance, executionId });
        return localDb.memoryAdd(nodeKey, kind, content, tags, importance);
      },
      memorySearch: async (nodeKey, query, limit = 12) => {
        if (useTauri()) return tauriInvoke("memory_search", { nodeKey, query, limit, kinds: null });
        return localDb.memorySearch(nodeKey, query, limit);
      },
      memoryDelete: async (memoryId) => {
        if (useTauri()) return tauriInvoke("memory_delete", { memoryId });
        localDb.memoryDelete(memoryId);
      },
      skillsList: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("skills_list", { nodeKey });
        return localDb.skillsList(nodeKey);
      },
      skillTouch: async (skillIds) => {
        if (useTauri()) return tauriInvoke("skill_touch", { skill_ids: skillIds });
        throw new Error("Skill usage counts live in the native build's SQLite store; the browser preview has no skill store to update.");
      },
      skillDeactivate: async (skillId) => {
        if (useTauri()) return tauriInvoke("skill_deactivate", { skill_id: skillId });
      },
      skillUpsert: async (args) => {
        if (useTauri()) return tauriInvoke("skill_upsert", args);
        return localDb.skillUpsert(args);
      },
      feedbackAdd: async (executionId, nodeKey, rating, comment) => {
        if (useTauri()) return tauriInvoke("feedback_add", { executionId, nodeKey, rating, comment });
        return localDb.feedbackAdd(executionId, nodeKey, rating, comment);
      },
      feedbackList: async () => {
        if (useTauri()) return tauriInvoke("feedback_list");
        return localDb.feedbackList();
      },
      // V7 fix (bug T): these returned fabricated ids and empty lists. A fabricated evaluation id
      // implies a stored result that does not exist, and an empty list is indistinguishable from
      // "no evaluations have ever run" — both read as success while nothing happened.
      evaluationSave: async (nodeKey, executionId, suite, score, details) => {
        if (useTauri()) return tauriInvoke("evaluation_save", { nodeKey, executionId, suite, score, details });
        throw new Error("Evaluation results live in the native build's SQLite database; the browser preview has no database to write.");
      },
      evaluationHistory: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("evaluation_history", { nodeKey });
        throw new Error("Evaluation history lives in the native build's SQLite database; the browser preview has no database to read.");
      },
      suiteList: async () => {
        if (useTauri()) return tauriInvoke("suite_list");
        throw new Error("Test suites live in the native build's SQLite database; the browser preview has no database to read.");
      },
      suiteSave: async (args) => {
        if (useTauri()) return tauriInvoke("suite_save", args);
        throw new Error("Test suites live in the native build's SQLite database; the browser preview has no database to write.");
      },
      evolutionProposeSave: async (cand) => {
        if (useTauri()) return tauriInvoke("evolution_propose_save", { cand });
        return localDb.evolutionPropose(cand);
      },
      evolutionList: async (nodeKey) => {
        if (useTauri()) return tauriInvoke("evolution_list", { nodeKey: nodeKey ?? null });
        return localDb.evolutionList();
      },
      evolutionDecide: async (candidateId, decision) => {
        if (useTauri()) return tauriInvoke("evolution_decide", { candidateId, decision });
        return localDb.evolutionDecide(candidateId, decision);
      },
      evolutionRollback: async (candidateId, restoreRolePrompt) => {
        if (useTauri()) return tauriInvoke("evolution_rollback", { candidateId, restoreRolePrompt: restoreRolePrompt ?? null });
      },
      approvalRequest: async (executionId, nodeKey, summary, payload) => {
        if (useTauri()) return tauriInvoke("approval_request", { executionId, nodeKey, summary, payload });
        return localDb.approvalRequest(executionId, nodeKey, summary, payload);
      },
      approvalGet: async (executionId, nodeKey) => {
        if (useTauri()) return tauriInvoke("approval_get", { executionId, nodeKey });
        return localDb.approvalGet(executionId, nodeKey);
      },
      approvalList: async () => {
        if (useTauri()) return tauriInvoke("approval_list");
        return localDb.approvalList();
      },
      approvalDecide: async (approvalId, decision) => {
        if (useTauri()) return tauriInvoke("approval_decide", { approvalId, decision });
        localDb.approvalDecide(approvalId, decision);
      },
      executionCreate: async (workflowId, workflowVersion) => {
        if (useTauri()) return tauriInvoke("execution_create", { workflowId, workflowVersion });
        return localDb.executionCreate(workflowId, workflowVersion);
      },
      executionFinish: async (executionId, status, error, stats) => {
        if (useTauri()) return tauriInvoke("execution_finish", { executionId, status, error, stats });
        localDb.executionFinish(executionId, status, error, stats);
      },
      eventEmit: async (executionId, kind, level, nodeId, data) => {
        if (useTauri()) {
          const rec = await tauriInvoke("event_emit", { executionId, kind, level, nodeId, data });
          window.dispatchEvent(new CustomEvent("mj://event", { detail: rec }));
          return rec;
        }
        return localDb.eventEmit(executionId, kind, level, nodeId, data);
      },
      executionEvents: async (executionId) => {
        if (useTauri()) return tauriInvoke("execution_events", { executionId });
        return localDb.executionEvents(executionId);
      },
      executionTrace: async (executionId) => {
        if (useTauri()) return tauriInvoke("execution_trace", { executionId });
        return { events: localDb.executionEvents(executionId), status: "COMPLETED" };
      },
      executionList: async () => {
        if (useTauri()) return tauriInvoke("execution_list");
        return localDb.executionList();
      },
      dlqAdd: async (executionId, nodeKey, error, payload, suggestedCause, candidateFix) => {
        if (useTauri()) return tauriInvoke("dlq_add", { executionId, nodeKey, error, payload, suggestedCause, candidateFix });
        return localDb.dlqAdd(executionId, nodeKey, error, payload, suggestedCause, candidateFix);
      },
      dlqList: async () => {
        if (useTauri()) return tauriInvoke("dlq_list");
        return localDb.dlqList();
      },
      dlqResolve: async (dlqId) => {
        if (useTauri()) return tauriInvoke("dlq_resolve", { dlqId });
        localDb.dlqResolve(dlqId);
      },
      runRequestTake: async () => {
        if (useTauri()) return tauriInvoke("run_request_take");
        return localDb.runTake();
      },
      evolutionServiceHealth: async () => {
        if (useTauri()) return tauriInvoke("evolution_service_health");
        return {
          available: false,
          transport: "stdio",
          reason: "The evolution service is a stdio child process of the native host. Build the desktop app (npm run tauri:build).",
          engine: "mj_evolution.stdio_server",
          hooks: ["on_session_start", "pre_llm_call", "post_llm_call", "on_session_end"]
        };
      },
      hermesBridge: async (msg) => {
        if (useTauri()) return tauriInvoke("hermes_bridge", { msg });
        return { ok: true, transport: "in-process", echo: msg };
      },
      evolutionServicePropose: async (args) => {
        if (useTauri()) return tauriInvoke("evolution_service_propose", { args });
        return null;
      },
      secretSet: async (secretRef, value) => {
        if (useTauri()) return tauriInvoke("secret_set", { secretRef, value });
        localDb.secretSet(secretRef, value);
        return { stored: true, location: "browser-localStorage", survivesRestart: true, warning: "Stored in browser localStorage, not an OS keychain." };
      },
      secretDelete: async (secretRef) => {
        if (useTauri()) return tauriInvoke("secret_delete", { secretRef });
        localDb.secretDelete(secretRef);
      },
      secretExists: async (refs) => {
        if (useTauri()) return tauriInvoke("secret_exists", { secretRefs: refs });
        return localDb.secretExists(refs);
      },
      llmChat: async (req) => {
        if (useTauri()) return tauriInvoke("llm_chat", { req });
        const key = localDb.secretGet(req.secret_ref);
        if (req.provider === "ollama" || req.base_url?.includes("11434")) {
          try {
            const r = await fetch(`${req.base_url || "http://127.0.0.1:11434"}/api/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: req.model,
                stream: false,
                messages: [
                  ...req.system ? [{ role: "system", content: req.system }] : [],
                  ...req.messages
                ]
              })
            });
            const j = await r.json();
            return {
              content: j.message?.content ?? "",
              model: req.model,
              usage: { input_tokens: 0, output_tokens: 0 },
              duration_ms: 0
            };
          } catch (e) {
            throw new Error(`ollama unreachable: ${e}`);
          }
        }
        if (!key) throw new Error(`secret not found: ${req.secret_ref}`);
        throw new Error("Cloud LLM calls from the web host require the native desktop build (CORS). Use Local LLM / Ollama or run `npm run tauri`.");
      },
      fsRead: async (path3) => {
        if (useTauri()) return tauriInvoke("fs_read", { path: path3 });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsWrite: async (path3, content) => {
        if (useTauri()) return tauriInvoke("fs_write", { path: path3, content });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsList: async (path3) => {
        if (useTauri()) return tauriInvoke("fs_list", { path: path3 });
        return [];
      },
      fsMkdir: async (path3) => {
        if (useTauri()) return tauriInvoke("fs_mkdir", { path: path3 });
      },
      fsRemove: async (path3, recursive) => {
        if (useTauri()) return tauriInvoke("fs_remove", { path: path3, recursive });
      },
      shellExec: async (program, args, cwd, timeoutSecs) => {
        if (useTauri()) return tauriInvoke("shell_exec", { program, args, cwd, timeoutSecs });
        throw new Error("Terminal is available in the native desktop build.");
      },
      mcpServerList: async () => {
        if (useTauri()) return tauriInvoke("mcp_server_list");
        return localDb.mcpList();
      },
      mcpServerSave: async (cfg) => {
        if (useTauri()) return tauriInvoke("mcp_server_save", { cfg });
        return localDb.mcpSave(cfg);
      },
      mcpServerRemove: async (serverId) => {
        if (useTauri()) return tauriInvoke("mcp_server_remove", { serverId });
        localDb.mcpRemove(serverId);
      },
      mcpConnectTest: async (serverId) => {
        if (useTauri()) return tauriInvoke("mcp_connect_test", { serverId });
        const s = localDb.mcpList().find((m) => m.id === serverId);
        return {
          serverId,
          connected: false,
          lastError: "Connect from the native desktop build (stdio MCP).",
          toolCount: 0,
          name: s?.name
        };
      },
      mcpCall: async (serverId, tool, args) => {
        if (useTauri()) return tauriInvoke("mcp_call", { serverId, tool, arguments: args });
        throw new Error("MCP calls require the native desktop build.");
      },
      // V7 fix (bug V): these browser fallbacks invented a session id, a page title and an engine
      // name. An agent or a page reading them would conclude a real navigation had happened. Every
      // one of them now reports the same notAttached shape the Rust side does.
      /**
       * `key` is what makes browser use autonomous: pass a stable key (a node key, a workflow id) and
       * the same session comes back, so a loop that navigates repeatedly drives one tab with its
       * history and cookies intact instead of leaking a fresh browser context on every call.
       */
      browserSessionCreate: async (key) => {
        if (useTauri()) return tauriInvoke("browser_session_create", { key });
        return { ok: false, notAttached: true, engine: null, sessionId: null, reason: browserReason };
      },
      browserSessionClose: async (sessionId) => {
        if (useTauri()) return tauriInvoke("browser_session_close", { sessionId });
      },
      browserSessions: async () => {
        if (useTauri()) return tauriInvoke("browser_sessions");
        return [];
      },
      browserNavigate: async (sessionId, url, timeoutMs = 3e4) => {
        if (useTauri()) return tauriInvoke("browser_navigate", { sessionId, url, timeoutMs });
        return { ok: false, notAttached: true, url, title: null, engine: null, reason: browserReason };
      },
      browserAct: async (args) => {
        if (useTauri()) return tauriInvoke("browser_act", args);
        return { ok: false, notAttached: true, reason: browserReason };
      },
      browserScreenshot: async (sessionId, fullPage = false) => {
        if (useTauri()) return tauriInvoke("browser_screenshot", { sessionId, fullPage });
        return { ok: false, notAttached: true, path: null, reason: browserReason };
      },
      browserConsole: async (sessionId) => {
        if (useTauri()) return tauriInvoke("browser_console", { sessionId });
        return { ok: false, notAttached: true, console: [], networkFailures: [], reason: browserReason };
      },
      cliProvidersDetect: async () => {
        if (useTauri()) return tauriInvoke("cli_providers_detect");
        return [
          { id: "claude", name: "Claude Code", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "claude" },
          { id: "codex", name: "OpenAI Codex CLI", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "codex" },
          { id: "opencode", name: "OpenCode", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "opencode" },
          { id: "openclaude", name: "OpenClaude", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "openclaude" },
          { id: "copilot", name: "GitHub Copilot CLI", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "copilot" },
          { id: "grok", name: "Grok Build (xAI)", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "grok" },
          { id: "kilo", name: "Kilo Code", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "kilo" },
          { id: "gemini", name: "Gemini CLI", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "gemini" },
          { id: "qwen", name: "Qwen Code", executable: null, installed: false, version: null, auth_state: "unknown", capabilities: ["agent"], invocation: "qwen" }
        ];
      },
      /**
       * §6 Diagnostics: where MJ searched for each coding-agent binary, what it resolved to, and the
       * version it reported. "Not installed" without this is unactionable — a packaged app does not
       * inherit your shell's PATH, so the CLI can exist and still be invisible.
       */
      cliEnv: async () => {
        if (useTauri()) return tauriInvoke("cli_env", {});
        throw new Error("CLI diagnostics require the native desktop build.");
      },
      /**
       * `argv`, when supplied, is the exact argument vector to run — MJ 6 builds it in
       * `src/mission/harnessPolicy.ts` so the risk -> sandbox mapping lives in one typed place
       * instead of being duplicated in Rust. Omit it and the Rust side falls back to its own table
       * (the V5 path, kept for the Providers page).
       */
      cliInvoke: async (providerId, prompt, cwd, timeoutSecs = 600, argv) => {
        if (useTauri()) return tauriInvoke("cli_invoke", { providerId, prompt, cwd, timeoutSecs, argv: argv ?? null });
        throw new Error("CLI providers require the native desktop build.");
      },
      /* -------------------------------------------- custom harnesses (V11.6)
       * User-registered harnesses: name + binary + argv template ($PROMPT). In the native
       * app the Rust side owns the registry (custom-harnesses.json in the app data dir)
       * and re-validates every save — cli_invoke only ever runs a bin that is either in
       * the built-in allowlist or in this saved registry. In the web preview the list
       * lives in localStorage so the Teams connect panel stays manageable; running
       * still requires the native build (a browser cannot spawn processes).
       */
      customHarnessList: async () => {
        if (useTauri()) return tauriInvoke("custom_harness_list");
        try {
          const raw = JSON.parse(localStorage.getItem("mj.customHarnesses") ?? "[]");
          return Array.isArray(raw) ? raw : [];
        } catch {
          return [];
        }
      },
      customHarnessSave: async (harness) => {
        if (useTauri()) return tauriInvoke("custom_harness_save", { harness });
        const list = await ipc.customHarnessList();
        const i = list.findIndex((h) => h.id === harness.id);
        if (i >= 0) list[i] = harness;
        else list.push(harness);
        localStorage.setItem("mj.customHarnesses", JSON.stringify(list));
        return { saved: true, created: i < 0, count: list.length };
      },
      customHarnessDelete: async (id) => {
        if (useTauri()) return tauriInvoke("custom_harness_delete", { id });
        const list = (await ipc.customHarnessList()).filter((h) => h.id !== id);
        localStorage.setItem("mj.customHarnesses", JSON.stringify(list));
        return { deleted: true, count: list.length };
      },
      /* -------------------------------------------------------------- git
       * Every one of these throws in a browser build rather than returning an empty result. A git panel
       * that renders "no changes" when it never spoke to git is the exact false-success pattern MJ forbids:
       * the user cannot tell "clean tree" from "never checked". The thrown message is the label.
       */
      gitIsRepo: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_is_repo", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitStatus: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_status", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitDiff: async (cwd, staged = false, budget) => {
        if (useTauri()) return tauriInvoke("git_diff", { cwd, staged, budget: budget ?? null });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitHead: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_head", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      gitBranch: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_branch", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      /**
       * Did a seat that was told to be read-only actually refrain from writing?
       * A harness flag is a promise; this is the check. Three-way on purpose — see `git.rs`.
       */
      gitReadOnlyCheck: async (cwd) => {
        if (useTauri()) return tauriInvoke("git_read_only_check", { cwd });
        throw new Error("git needs the native desktop build: a browser cannot see your repository.");
      },
      packageExport: async (workflowId, includeHistory) => {
        if (useTauri()) return tauriInvoke("package_export", { workflowId, includeHistory });
        const wf = localDb.workflowGet(workflowId);
        return {
          packageFormat: 1,
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          application: "MJ",
          version: MJ_VERSION,
          workflow: { name: wf.name, description: wf.description, graph: wf.graph },
          history: [],
          secretsIncluded: false
        };
      },
      packageImport: async (pkg) => {
        if (useTauri()) return tauriInvoke("package_import", { pkg });
        const p = pkg;
        if (p.application !== "MJ" || !p.workflow) throw new Error("package rejected");
        const created = localDb.workflowCreate(`${p.workflow.name} (imported)`, p.workflow.description ?? "");
        localDb.workflowSave(created.id, `${p.workflow.name} (imported)`, p.workflow.description ?? "", p.workflow.graph);
        return { id: created.id, validated: true };
      },
      controlValidate: async (workflowId) => {
        if (useTauri()) return tauriInvoke("control_validate_graph", { workflowId });
        return { valid: true, errors: [] };
      },
      controlConnectPorts: async (args) => {
        if (useTauri()) return tauriInvoke("control_connect_ports", args);
        throw new Error("use graph store connect");
      }
    };
  }
});

// src/mission/harnessAdapters.ts
var harnessAdapters_exports = {};
__export(harnessAdapters_exports, {
  HARNESSES: () => HARNESSES,
  LocalTestHarness: () => LocalTestHarness,
  allHarnesses: () => allHarnesses,
  describeHarnesses: () => describeHarnesses,
  getHarness: () => getHarness,
  isHarnessId: () => isHarnessId,
  localTestHarness: () => localTestHarness,
  preambleFor: () => preambleFor,
  realHarnesses: () => realHarnesses,
  registerHarness: () => registerHarness
});
function policyRequestFor(task) {
  return {
    risk: task.risk ?? "MEDIUM",
    mayWriteFiles: task.mayWriteFiles ?? false,
    mayRunShell: task.mayRunShell ?? false,
    mayUseBrowser: task.mayUseBrowser ?? false,
    maxTurns: Math.max(1, Math.round(task.timeoutMs / 6e4)),
    kind: task.kind
  };
}
function preambleFor(task, policy) {
  return permissionPreamble(task.grantedPermissions ?? {}, policy);
}
function getHarness(id) {
  const hit = registry.get(id);
  if (hit) return hit;
  if (typeof id === "string" && isCustomHarness(id)) {
    const { caps, registered } = resolveCaps(id);
    if (!registered) return null;
    let a = customAdapters.get(id);
    if (!a) {
      a = new CustomCliHarness(id, caps.name, "Teams -> Connect -> Custom harnesses");
      customAdapters.set(id, a);
    }
    return a;
  }
  return null;
}
function allHarnesses() {
  return [...registry.values()];
}
function realHarnesses() {
  return [...registry.values()].filter((h) => !h.simulated);
}
function registerHarness(h) {
  registry.set(h.id, h);
}
function isHarnessId(id) {
  return registry.has(id);
}
function describeHarnesses() {
  return [...registry.values()].map((h) => ({
    id: h.id,
    name: h.name,
    simulated: h.simulated,
    install: h.installHint,
    languages: h.languages,
    strengths: h.strengths
  }));
}
var CliHarness, LocalTestHarness, PROFILES, localTestHarness, CustomCliHarness, registry, customAdapters;
var init_harnessAdapters = __esm({
  "src/mission/harnessAdapters.ts"() {
    "use strict";
    init_harness();
    init_agentCapabilities();
    init_harnessPolicy();
    init_acp();
    CliHarness = class {
      constructor(id, name, installHint, languages, strengths, canEditFiles, canRunTests, capabilities) {
        this.id = id;
        this.name = name;
        this.installHint = installHint;
        this.languages = languages;
        this.strengths = strengths;
        this.canEditFiles = canEditFiles;
        this.canRunTests = canRunTests;
        this.capabilities = capabilities;
      }
      simulated = false;
      supports(_task) {
        return true;
      }
      prepare(task) {
        const spec = HARNESS_BY_ID.get(this.id);
        const program = spec?.bins[0] ?? this.id;
        const policy = policyFor(this.id, policyRequestFor(task));
        return { program, args: policy.argv.map((a) => a === "$PROMPT" ? task.prompt : a) };
      }
      /** The sandbox/write policy this task will run under, for the flight recorder and the UI. */
      policy(task) {
        return policyFor(this.id, policyRequestFor(task));
      }
      async invoke(task) {
        const started = Date.now();
        const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
        const { detectHost: detectHost2 } = await Promise.resolve().then(() => (init_desktop(), desktop_exports));
        if (detectHost2() !== "tauri") {
          return {
            ok: false,
            text: "",
            exitCode: null,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: false,
            detail: "not-executed",
            error: `${this.name} requires the native desktop build. Run \`npm run tauri\` (see INSTALL-ON-LAPTOP.md).`
          };
        }
        const spec = HARNESS_BY_ID.get(this.id);
        const detected = await ipc2.cliProvidersDetect();
        const hit = detected.find((d) => d.id === this.id || spec.bins.includes(d.invocation) || spec.bins.includes(d.id));
        if (!hit?.installed) {
          return {
            ok: false,
            text: "",
            exitCode: null,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: false,
            detail: "not-installed",
            error: `${this.name} is not on PATH. ${this.installHint}`
          };
        }
        const policy = policyFor(this.id, policyRequestFor(task));
        if (policy.refused) {
          return {
            ok: false,
            text: "",
            exitCode: null,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: false,
            detail: "refused-by-policy",
            error: `${this.name} was not run: ${policy.refused}`
          };
        }
        try {
          const argv = policy.argv.map((a) => a === "$PROMPT" ? task.prompt : a);
          const r = await ipc2.cliInvoke(this.id, task.prompt, task.cwd, Math.max(60, Math.round(task.timeoutMs / 1e3)), argv);
          const stdout = String(r.stdout ?? "");
          const usage = parseUsage(this.id, stdout);
          const text = (usage.text || stdout || String(r.stderr ?? "")).trim();
          return {
            ok: Boolean(text) && (r.code == null || r.code === 0),
            text,
            exitCode: r.code ?? null,
            latencyMs: Date.now() - started,
            // Real spend when the harness reports it. Null-equivalent 0 with the source recorded,
            // because MJ does not convert tokens to dollars at a guessed price.
            costUsd: usage.costUsd ?? 0,
            simulated: false,
            detail: `exit=${r.code ?? "?"} bytes=${text.length}; ${usage.source}; sandbox=${policy.readOnly ? "read-only" : "workspace-write"}`,
            error: text ? null : `${this.name} returned no output (exit ${r.code ?? "?"}). ${usage.source}`
          };
        } catch (e) {
          return {
            ok: false,
            text: "",
            exitCode: null,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: false,
            detail: "spawn-failed",
            error: e instanceof Error ? e.message : String(e)
          };
        }
      }
    };
    LocalTestHarness = class {
      id = "local-test";
      name = "Local Test Harness (simulated \u2014 not a real coding agent)";
      simulated = true;
      installHint = "Built in. Used only when a mission explicitly allows simulated execution.";
      languages = ["any"];
      strengths = ["deterministic-offline-testing"];
      canEditFiles = false;
      canRunTests = false;
      capabilities = ["simulation"];
      /** Task titles matching this fail on the first attempt, to exercise the repair path. */
      failFirstAttemptFor = /implement|build|code/i;
      attempts = /* @__PURE__ */ new Map();
      supports(_task) {
        return true;
      }
      prepare(task) {
        return { program: "(in-process simulation)", args: [task.taskId] };
      }
      async invoke(task) {
        const started = Date.now();
        const n2 = (this.attempts.get(task.taskId) ?? 0) + 1;
        this.attempts.set(task.taskId, n2);
        const shouldFail = this.failFirstAttemptFor.test(task.title) && n2 === 1;
        await new Promise((r) => setTimeout(r, 5));
        if (shouldFail) {
          return {
            ok: false,
            text: "",
            exitCode: 1,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: true,
            detail: "simulated-failure",
            error: `[local-test] Simulated failure on first attempt at "${task.title}" so the repair path is exercised. This is not real work.`
          };
        }
        return {
          ok: true,
          text: [
            `[local-test simulation \u2014 attempt ${n2}]`,
            `Task: ${task.title}`,
            `Kind: ${task.kind}`,
            `Languages: ${task.languages.join(", ") || "n/a"}`,
            "",
            "This output was produced by MJ's labelled test double, not by a coding agent.",
            "It is recorded as simulated and is NOT counted as independently verified."
          ].join("\n"),
          exitCode: 0,
          latencyMs: Date.now() - started,
          costUsd: 0,
          simulated: true,
          detail: `simulated attempt=${n2}`,
          error: null
        };
      }
      reset() {
        this.attempts.clear();
      }
    };
    PROFILES = [
      { id: "claude", name: "Claude Code", installHint: "npm install -g @anthropic-ai/claude-code, then `claude` to log in.", languages: ["TypeScript", "Python", "Rust", "Go"], strengths: ["coding", "refactor", "security-review", "review"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "refactor", "review", "security-review", "testing"] },
      { id: "codex", name: "OpenAI Codex CLI", installHint: "npm install -g @openai/codex, then `codex login`.", languages: ["TypeScript", "Python", "Rust", "Go"], strengths: ["coding", "testing", "migration"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "testing", "migration", "review"] },
      { id: "opencode", name: "OpenCode", installHint: "npm install -g opencode-ai.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "testing"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "testing", "review"] },
      { id: "cursor", name: "Cursor Agent", installHint: "Install Cursor and enable the agent CLI (cursor-agent on PATH).", languages: ["TypeScript", "Python"], strengths: ["coding", "ui"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "ui", "review"] },
      { id: "grok", name: "Grok CLI", installHint: "Install the xAI Grok CLI and authenticate.", languages: ["TypeScript", "Python"], strengths: ["coding", "research"], canEditFiles: true, canRunTests: false, capabilities: ["coding", "research"] },
      { id: "cline", name: "Cline", installHint: "Install the Cline CLI (the VS Code extension cannot be spawned).", languages: ["TypeScript", "Python"], strengths: ["coding"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] },
      { id: "kilo", name: "Kilo Code", installHint: "Install the Kilo Code CLI on PATH.", languages: ["TypeScript", "Python"], strengths: ["coding"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] },
      { id: "hermes", name: "Hermes Agent", installHint: "Install Hermes Agent (Nous) so `hermes` is on PATH, or use the in-process MJ Hermes loop.", languages: ["any"], strengths: ["general", "tool-use"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "research", "review", "testing", "synthesis"] },
      // ── V11.6.2: the registry's remaining CLIs, profiled honestly (researched 2026-09) ──
      { id: "openclaude", name: "OpenClaude", installHint: "npm install -g @gitlawb/openclaude@latest, then openclaude /provider.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "byok"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] },
      { id: "copilot", name: "GitHub Copilot CLI", installHint: "npm install -g @github/copilot, then copilot login.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "review"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] },
      { id: "aider", name: "Aider", installHint: "python -m pip install aider-install && aider-install.", languages: ["Python", "TypeScript", "Go", "Rust"], strengths: ["coding", "refactor", "git-native-edits"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "refactor", "review"] },
      { id: "gemini", name: "Gemini CLI", installHint: "npm install -g @google/gemini-cli (paid Code Assist tiers; individuals moved to agy).", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "research"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "research", "review"] },
      { id: "antigravity", name: "Antigravity CLI (agy)", installHint: "curl -fsSL https://antigravity.google/cli/install.sh | bash.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "research", "multi-model"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "research", "review"] },
      { id: "amp", name: "Amp (Sourcegraph)", installHint: "npm install -g @sourcegraph/amp, then amp login.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "review", "code-search-context"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] },
      { id: "crush", name: "Crush (Charm)", installHint: "npm install -g @charmbracelet/crush.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "llm-agnostic"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] },
      { id: "openhands", name: "OpenHands", installHint: "pip install openhands, then openhands login.", languages: ["Python", "TypeScript"], strengths: ["coding", "autonomous-tasks", "sandboxed"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "testing"] },
      { id: "goose", name: "Goose (Block)", installHint: "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash.", languages: ["TypeScript", "Python", "Rust"], strengths: ["coding", "automation", "mcp-native"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] },
      { id: "qwen", name: "Qwen Code", installHint: "npm install -g @qwen-code/qwen-code, then qwen (API key or Coding Plan).", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "multi-provider"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] },
      { id: "amazonq", name: "Amazon Q / Kiro CLI", installHint: "Install the AWS Q or Kiro CLI (kiro-cli on PATH) and authenticate.", languages: ["TypeScript", "Python"], strengths: ["coding", "aws"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] },
      // ── V11.7.1: the researched September-2026 additions (vendor-documented headless modes) ──
      { id: "droid", name: "Droid (Factory)", installHint: "curl -fsSL https://app.factory.ai/cli | sh, then droid.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "read-only-default", "tiered-autonomy"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] },
      { id: "kimi", name: "Kimi Code (Moonshot)", installHint: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash, then kimi.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "byok", "session-resume"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] },
      { id: "auggie", name: "Auggie (Augment Code)", installHint: "npm install -g @augmentcode/auggie, then auggie login.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "context-engine", "acp-native"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review", "testing"] },
      { id: "warp", name: "Warp Oz Agent CLI", installHint: "Install Warp 2026 (the CLI ships with it) or brew install --cask warp-cli, then oz login.", languages: ["TypeScript", "Python", "Go"], strengths: ["coding", "agent-infrastructure", "mcp-native"], canEditFiles: true, canRunTests: true, capabilities: ["coding", "review"] }
    ];
    localTestHarness = new LocalTestHarness();
    CustomCliHarness = class {
      constructor(id, name, installHint) {
        this.id = id;
        this.name = name;
        this.installHint = installHint;
      }
      simulated = false;
      canEditFiles = true;
      canRunTests = true;
      languages = ["any"];
      strengths = ["user-registered"];
      capabilities = ["coding"];
      supports(_task) {
        return true;
      }
      prepare(task) {
        const { caps } = resolveCaps(this.id);
        return {
          program: caps.bins[0] ?? this.id,
          args: (caps.prompt.argv ?? ["$PROMPT"]).map((a) => a === "$PROMPT" ? task.prompt : a)
        };
      }
      async invoke(task) {
        const started = Date.now();
        const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
        const { detectHost: detectHost2 } = await Promise.resolve().then(() => (init_desktop(), desktop_exports));
        if (detectHost2() !== "tauri") {
          return {
            ok: false,
            text: "",
            exitCode: null,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: false,
            detail: "web-preview",
            error: "Custom harnesses spawn through the native shell only."
          };
        }
        try {
          const r = await ipc2.cliInvoke(this.id, task.prompt, task.cwd, Math.max(60, Math.round(task.timeoutMs / 1e3)));
          const text = (String(r.stdout ?? "") || String(r.stderr ?? "")).trim();
          return {
            ok: Boolean(text) && (r.code == null || r.code === 0),
            text,
            exitCode: r.code ?? null,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: false,
            detail: `exit=${r.code ?? "?"} bytes=${text.length}; custom harness (advisory read-only)`,
            error: text ? null : `${this.name} returned no output (exit ${r.code ?? "?"}).`
          };
        } catch (e) {
          return {
            ok: false,
            text: "",
            exitCode: null,
            latencyMs: Date.now() - started,
            costUsd: 0,
            simulated: false,
            detail: "spawn-failed",
            error: e instanceof Error ? e.message : String(e)
          };
        }
      }
    };
    registry = /* @__PURE__ */ new Map();
    for (const p of PROFILES) {
      const h = new CliHarness(p.id, p.name, p.installHint, p.languages, p.strengths, p.canEditFiles, p.canRunTests, p.capabilities);
      registry.set(h.id, h);
    }
    registry.set("local-test", localTestHarness);
    registry.set("acp", new AcpHarness());
    customAdapters = /* @__PURE__ */ new Map();
  }
});

// probe/acp.test.ts
init_acp();
import * as fs from "node:fs";
import * as os2 from "node:os";
import * as path2 from "node:path";
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
var FAKE_AGENT = `
const rl = require("node:readline").createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
if (process.argv.includes("--crash")) { process.exit(3); }
let promptId = null;
rl.on("line", (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params, result } = msg;
  // Responses from the client: the permission decision arrives as a response to our request.
  if (method === undefined && result !== undefined && id === "perm-1") {
    const outcome = result.outcome || {};
    if (outcome.outcome === "selected" && outcome.optionId === "opt-allow") {
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" } } });
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " \u2014 check ran" } } } });
    } else {
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "cancelled" } } });
      send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " \u2014 check skipped" } } } });
    }
    // Answer the client's session/prompt with the id it actually used.
    send({ jsonrpc: "2.0", id: promptId, result: { stopReason: "end_turn" } });
    return;
  }
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: { protocolVersion: params.protocolVersion, agentInfo: { name: "fake-acp", version: "1.0.0" } } });
  } else if (method === "session/new") {
    send({ jsonrpc: "2.0", id, result: { sessionId: "sess-1" } });
  } else if (method === "session/prompt") {
    promptId = id;
    const sid = params.sessionId;
    const upd = (sessionUpdate, extra = {}) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: sid, update: { sessionUpdate, ...extra } } });
    upd("agent_message_chunk", { content: { type: "text", text: "Hello " } });
    upd("agent_message_chunk", { content: { type: "text", text: "world" } });
    upd("tool_call", { toolCallId: "t1", title: "Run safe check", kind: "execute", status: "pending" });
    send({ jsonrpc: "2.0", id: "perm-1", method: "session/request_permission", params: {
      sessionId: sid,
      options: [
        { optionId: "opt-allow", name: "Allow", kind: "allow_once" },
        { optionId: "opt-deny", name: "Deny", kind: "reject_once" },
      ],
      toolCall: { toolCallId: "t1", title: "Run safe check", kind: "execute" },
    } });
  } else if (method.startsWith("fs/") || method.startsWith("terminal/")) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "no handler" } });
  }
});
`;
async function makeClient(agentPath, opts = {}) {
  const events = [];
  const client = new AcpClient(new NodeAcpTransport(process.execPath, [agentPath], os2.tmpdir()), {
    timeoutMs: 1e4,
    // No decider attached unless the scenario supplies one — section 1 exists to prove the
    // client's built-in default deny, so it must run exactly that path.
    ...opts.decide ? { decidePermission: opts.decide } : {},
    onEvent: (e) => events.push(e)
  });
  return { client, events };
}
async function main() {
  const dir = fs.mkdtempSync(path2.join(os2.tmpdir(), "mj-acp-"));
  const agentPath = path2.join(dir, "fake-acp-agent.cjs");
  fs.writeFileSync(agentPath, FAKE_AGENT);
  section("0. handshake and session");
  {
    const { client } = await makeClient(agentPath);
    const hello = await client.connect();
    ok("initialize negotiates protocol version 1", hello.protocolVersion === 1, JSON.stringify(hello));
    ok("the agent identifies itself", hello.agentName === "fake-acp", `${hello.agentName}`);
    const sessionId = await client.newSession(process.cwd());
    ok("session/new returns the agent's session id", sessionId === "sess-1", sessionId);
    section("1. a streamed turn with tool events and a DENIED permission (default-deny path)");
    const turn = await client.prompt(sessionId, "run the safe check");
    ok("stop reason is end_turn", turn.stopReason === "end_turn", turn.stopReason);
    ok("message chunks stream in order", turn.text === "Hello world \u2014 check skipped", JSON.stringify(turn.text));
    const toolCall = client.events.find((e) => e.type === "tool_call");
    ok("tool_call event captured", Boolean(toolCall) && toolCall.title === "Run safe check");
    const toolUpdate = client.events.find((e) => e.type === "tool_call_update");
    ok("the denied tool call ends cancelled", toolUpdate?.status === "cancelled");
    const perm = client.events.find((e) => e.type === "permission_request");
    ok("the permission request was recorded", Boolean(perm));
    ok("the default decision is deny", perm?.decided === "deny");
    ok("the deny came from the default, not an attached approver", perm?.by === "default-deny");
    await client.shutdown();
  }
  section("2. an ALLOWED permission flows back through the wire");
  {
    const { client, events } = await makeClient(agentPath, { decide: async () => "allow" });
    await client.connect();
    const sessionId = await client.newSession(process.cwd());
    const turn = await client.prompt(sessionId, "run the safe check");
    ok("the allowed tool completed", events.some((e) => e.type === "tool_call_update" && e.status === "completed"));
    ok("the post-permission chunk arrived", turn.text === "Hello world \u2014 check ran", JSON.stringify(turn.text));
    const perm = events.find((e) => e.type === "permission_request");
    ok("allow recorded with its decider", perm?.decided === "allow");
    await client.shutdown();
  }
  section("3. hostile wires do not crash the client");
  {
    const dir2 = fs.mkdtempSync(path2.join(os2.tmpdir(), "mj-acp-noise-"));
    const noisy = path2.join(dir2, "noisy-agent.cjs");
    fs.writeFileSync(noisy, `
const rl = require("node:readline").createInterface({ input: process.stdin });
process.stdout.write("this is not json\\n");
process.stdout.write("{broken json\\n");
rl.on("line", (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    process.stdout.write("garbage before the result\\n");
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1, agentInfo: { name: "noisy", version: "0" } } }) + "\\n");
  } else if (msg.method === "session/new") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 424242, result: { note: "response to an id we never sent" } }) + "\\n");
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "s-noise" } }) + "\\n");
  } else if (msg.method === "session/prompt") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn" } }) + "\\n");
  }
});
`);
    const events = [];
    const client = new AcpClient(new NodeAcpTransport(process.execPath, [noisy]), {
      timeoutMs: 1e4,
      onEvent: (e) => events.push(e)
    });
    const hello = await client.connect();
    ok("initialize survives garbage interleaved on the wire", hello.protocolVersion === 1);
    const sessionId = await client.newSession(process.cwd());
    ok("unsolicited responses are ignored, not matched", sessionId === "s-noise", sessionId);
    const turn = await client.prompt(sessionId, "hi");
    ok("the turn still completes", turn.stopReason === "end_turn");
    ok(
      "garbage lines were counted as protocol errors, not swallowed",
      events.filter((e) => e.type === "protocol_error").length >= 2,
      `${events.filter((e) => e.type === "protocol_error").length} protocol errors`
    );
    await client.shutdown();
  }
  section("4. a crashing agent produces an honest failure, never fabricated text");
  {
    const crashPath = path2.join(dir, "crash-acp-agent.cjs");
    fs.writeFileSync(crashPath, FAKE_AGENT);
    const client = new AcpClient(new NodeAcpTransport(process.execPath, [crashPath, "--crash"]), { timeoutMs: 1500 });
    let err = null;
    try {
      await client.connect();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    ok("initialize against a crasher fails loudly", err !== null, err ?? "no error");
    await client.shutdown();
  }
  section("5. the harness resolves and reports like a first-class adapter");
  {
    const { AcpHarness: AcpHarness2 } = await Promise.resolve().then(() => (init_acp(), acp_exports));
    const { getHarness: getHarness2 } = await Promise.resolve().then(() => (init_harnessAdapters(), harnessAdapters_exports));
    const h = getHarness2("acp");
    ok("the acp harness is in the registry", Boolean(h) && h?.id === "acp");
    ok("it is a real adapter (not the test double)", h?.simulated === false);
    const prep = new AcpHarness2().prepare({});
    ok("prepare names a program and args", prep.program.length > 0 && prep.args.length > 0, JSON.stringify(prep));
    process.env.MJ_ACP_BIN = process.execPath;
    process.env.MJ_ACP_ARGS = `${agentPath}`;
    const outcome = await new AcpHarness2().invoke({
      taskId: "t",
      title: "probe",
      prompt: "run the safe check",
      kind: "implement",
      languages: [],
      timeoutMs: 15e3,
      requiredCapabilities: [],
      cwd: process.cwd()
    });
    ok("harness invoke returns a real outcome", outcome.ok === true, outcome.error ?? "");
    ok("the outcome text is the agent's streamed text", outcome.text === "Hello world \u2014 check skipped", JSON.stringify(outcome.text));
    ok(
      "the outcome detail names stop/tools/perms and honest cost",
      /acp stop=end_turn tools=1 perms=1\/1 cost=unmeasured/.test(outcome.detail),
      outcome.detail
    );
    delete process.env.MJ_ACP_BIN;
    delete process.env.MJ_ACP_ARGS;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`
${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}
void main();
