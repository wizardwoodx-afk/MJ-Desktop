import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res2) => function __init() {
  return fn && (res2 = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res2;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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

// src/version.ts
var MJ_VERSION, MJ_VERSION_SHORT, MJ_TITLE;
var init_version = __esm({
  "src/version.ts"() {
    "use strict";
    MJ_VERSION = "11.8.5";
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
import * as fsSync2 from "node:fs";
import * as os from "node:os";
import * as path2 from "node:path";
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
  const p2 = process.platform;
  return p2 === "darwin" ? "macos" : p2 === "win32" ? "windows" : p2 === "linux" ? "linux" : "unknown";
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
    const canaryPath = path2.posix.join("/", "mj-sandbox-canary.txt");
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
    const canaryPath = path2.posix.join("/", "mj-sandbox-canary.txt");
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
function wrapForSeat(risk, workspace, program, args) {
  const profile = sandboxProfileFor(risk, workspace);
  return { argv: profile.wrapper.length > 0 ? [...profile.wrapper, program, ...args] : [program, ...args], profile };
}
function scratchWorkspace() {
  const dir = fsSync2.mkdtempSync(path2.join(os.tmpdir(), "mj-seat-"));
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
function mapMonitor(m2) {
  return m2 === null ? null : {
    name: m2.name,
    scaleFactor: m2.scaleFactor,
    position: new PhysicalPosition(m2.position),
    size: new PhysicalSize(m2.size),
    workArea: {
      position: new PhysicalPosition(m2.workArea.position),
      size: new PhysicalSize(m2.workArea.size)
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
            const listeners2 = this.listeners[event];
            listeners2.splice(listeners2.indexOf(handler), 1);
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
            const listeners2 = this.listeners[event];
            listeners2.splice(listeners2.indexOf(handler), 1);
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
        }).then((p2) => new PhysicalPosition(p2));
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
        }).then((p2) => new PhysicalPosition(p2));
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
      async setBadgeCount(count2) {
        return invoke("plugin:window|set_badge_count", {
          label: this.label,
          value: count2
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
      void Notification.requestPermission().then((p2) => {
        if (p2 === "granted") new Notification(title, { body });
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
        const existing = db.mcp.find((m2) => m2.id === id);
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
        db.mcp = db.mcp.filter((m2) => m2.id !== id);
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
        return load().memories.filter((m2) => m2.nodeKey === nodeKey && (!q || m2.content.toLowerCase().includes(q))).slice(0, limit);
      },
      memoryDelete(id) {
        const db = load();
        db.memories = db.memories.filter((m2) => m2.id !== id);
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
          vendors: ["hermes-agent", "hermes-agent-self-evolution", "mcp-servers-reference", "mcp-github"]
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
        const s = localDb.mcpList().find((m2) => m2.id === serverId);
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
        const p2 = pkg;
        if (p2.application !== "MJ" || !p2.workflow) throw new Error("package rejected");
        const created = localDb.workflowCreate(`${p2.workflow.name} (imported)`, p2.workflow.description ?? "");
        localDb.workflowSave(created.id, `${p2.workflow.name} (imported)`, p2.workflow.description ?? "", p2.workflow.graph);
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

// src/mission/missionRuntime.ts
init_id();

// src/domain/rolePacks.ts
var ROLE_PACKS = [
  { slug: "backend-engineer", title: "Backend Engineer", industry: "engineering", icon: "code", mission: "Design and implement reliable services, APIs, and data stores." },
  { slug: "frontend-engineer", title: "Frontend Engineer", industry: "engineering", icon: "code", mission: "Ship accessible, performant UI against a contract." },
  { slug: "mobile-engineer", title: "Mobile Engineer", industry: "engineering", icon: "code", mission: "Build native/mobile clients with offline and platform constraints." },
  { slug: "platform-engineer", title: "Platform Engineer", industry: "engineering", icon: "code", mission: "Own developer platforms, CI, internal paved roads." },
  { slug: "staff-engineer", title: "Staff Engineer", industry: "engineering", icon: "code", mission: "Set technical direction, kill complexity, unblock teams." },
  { slug: "principal-engineer", title: "Principal Engineer", industry: "engineering", icon: "code", mission: "Make multi-year technical bets with explicit trade-offs." },
  { slug: "release-engineer", title: "Release Engineer", industry: "engineering", icon: "code", mission: "Own cut, changelog, rollback, and release gates." },
  { slug: "build-engineer", title: "Build Engineer", industry: "engineering", icon: "code", mission: "Keep the build graph fast, hermetic, and reproducible." },
  { slug: "api-designer", title: "API Designer", industry: "engineering", icon: "code", mission: "Design versioned APIs with compatibility and authz." },
  { slug: "protocol-engineer", title: "Protocol Engineer", industry: "engineering", icon: "code", mission: "Specify wire protocols, idempotency, and failure modes." },
  { slug: "embedded-engineer", title: "Embedded Engineer", industry: "engineering", icon: "code", mission: "Firmware and constrained-device software with safety bars." },
  { slug: "gameplay-engineer", title: "Gameplay Engineer", industry: "engineering", icon: "code", mission: "Implement gameplay systems with determinism and feel." },
  { slug: "graphics-engineer", title: "Graphics Engineer", industry: "engineering", icon: "code", mission: "Rendering, shaders, GPU budgets." },
  { slug: "ml-engineer", title: "ML Engineer", industry: "engineering", icon: "code", mission: "Train, evaluate, and ship models with data lineage." },
  { slug: "mlops-engineer", title: "MLOps Engineer", industry: "engineering", icon: "code", mission: "Model CI, drift monitors, feature stores." },
  { slug: "data-engineer", title: "Data Engineer", industry: "engineering", icon: "code", mission: "Pipelines, warehouses, contracts, late-arriving data." },
  { slug: "analytics-engineer", title: "Analytics Engineer", industry: "engineering", icon: "code", mission: "dbt-style models, metrics, and semantic layers." },
  { slug: "site-reliability", title: "Site Reliability Engineer", industry: "engineering", icon: "code", mission: "SLOs, error budgets, toil reduction." },
  { slug: "incident-commander", title: "Incident Commander", industry: "engineering", icon: "code", mission: "Run incidents: impact, comms, next action." },
  { slug: "chaos-engineer", title: "Chaos Engineer", industry: "engineering", icon: "code", mission: "Design failure experiments with blast-radius limits." },
  { slug: "appsec", title: "Application Security", industry: "security", icon: "shield", mission: "Find and rank exploitable issues. No exploit payloads." },
  { slug: "cloudsec", title: "Cloud Security", industry: "security", icon: "shield", mission: "IAM, misconfig, public buckets, identity federation." },
  { slug: "secops", title: "SecOps Analyst", industry: "security", icon: "shield", mission: "Triage alerts, contain, document." },
  { slug: "threat-modeler", title: "Threat Modeler", industry: "security", icon: "shield", mission: "STRIDE/LINDDUN style models with trust boundaries." },
  { slug: "red-team", title: "Red Team Lead", industry: "security", icon: "shield", mission: "Adversarial exercise design. No live exploitation." },
  { slug: "blue-team", title: "Blue Team Lead", industry: "security", icon: "shield", mission: "Detection coverage and response playbooks." },
  { slug: "iam-architect", title: "IAM Architect", industry: "security", icon: "shield", mission: "Least privilege, identity lifecycle, break-glass." },
  { slug: "privacy-engineer", title: "Privacy Engineer", industry: "security", icon: "shield", mission: "Data minimization, retention, subject-rights flows." },
  { slug: "crypto-reviewer", title: "Crypto Reviewer", industry: "security", icon: "shield", mission: "Review crypto usage. Flag homemade crypto." },
  { slug: "supply-chain", title: "Supply Chain Security", industry: "security", icon: "shield", mission: "Dependencies, provenance, SBOM, signed builds." },
  { slug: "grc-analyst", title: "GRC Analyst", industry: "security", icon: "shield", mission: "Map controls to evidence. Not legal advice." },
  { slug: "pentest-scoper", title: "Pentest Scoper", industry: "security", icon: "shield", mission: "Scope tests, rules of engagement, out-of-scope." },
  { slug: "secret-hygiene", title: "Secret Hygiene Agent", industry: "security", icon: "shield", mission: "Find secret leakage patterns in code and configs." },
  { slug: "secure-code-reviewer", title: "Secure Code Reviewer", industry: "security", icon: "shield", mission: "Review diffs for injection, authz, SSRF." },
  { slug: "zero-trust", title: "Zero Trust Architect", industry: "security", icon: "shield", mission: "Device, identity, path \u2014 never network location." },
  { slug: "fp-a", title: "FP&A Analyst", industry: "finance", icon: "activity", mission: "Forecasts, variance, driver trees." },
  { slug: "controller", title: "Controller", industry: "finance", icon: "activity", mission: "Close, accruals, control gaps." },
  { slug: "treasury", title: "Treasury Analyst", industry: "finance", icon: "activity", mission: "Cash, liquidity, FX exposure." },
  { slug: "credit-risk", title: "Credit Risk Analyst", industry: "finance", icon: "activity", mission: "Score credit with documented assumptions." },
  { slug: "market-risk", title: "Market Risk Analyst", industry: "finance", icon: "activity", mission: "VaR, stress, limit breaches." },
  { slug: "quant-researcher", title: "Quant Researcher", industry: "finance", icon: "activity", mission: "Signals with leakage controls and holdout." },
  { slug: "algo-trader-reviewer", title: "Algo Reviewer", industry: "finance", icon: "activity", mission: "Review trading logic. No live orders." },
  { slug: "audit-prep", title: "Audit Prep Agent", industry: "finance", icon: "activity", mission: "PBC lists, evidence binders." },
  { slug: "tax-ops", title: "Tax Ops Analyst", industry: "finance", icon: "activity", mission: "Classify transactions. Not tax advice." },
  { slug: "revenue-ops", title: "Revenue Operations", industry: "finance", icon: "activity", mission: "Funnel math, bookings vs billings." },
  { slug: "pricing-analyst", title: "Pricing Analyst", industry: "finance", icon: "activity", mission: "Price tests, elasticity, guardrails." },
  { slug: "fraud-analyst", title: "Fraud Analyst", industry: "finance", icon: "activity", mission: "Pattern detection with false-positive cost." },
  { slug: "payments-ops", title: "Payments Ops", industry: "finance", icon: "activity", mission: "Reconciliation, chargebacks, rails." },
  { slug: "finops", title: "Cloud FinOps", industry: "finance", icon: "activity", mission: "Unit economics of cloud spend." },
  { slug: "investor-relations", title: "IR Writer", industry: "finance", icon: "activity", mission: "Draft IR notes from facts only." },
  { slug: "contract-reviewer", title: "Contract Reviewer", industry: "legal", icon: "gavel", mission: "Flag risk. Not legal advice." },
  { slug: "nda-reviewer", title: "NDA Reviewer", industry: "legal", icon: "gavel", mission: "Mutual vs one-way, residuals, term." },
  { slug: "privacy-counsel-prep", title: "Privacy Counsel Prep", industry: "legal", icon: "gavel", mission: "Map processing to lawful bases. Not advice." },
  { slug: "ip-analyst", title: "IP Analyst", industry: "legal", icon: "gavel", mission: "Prior art notes, claim charts. Not advice." },
  { slug: "compliance-ops", title: "Compliance Ops", industry: "legal", icon: "gavel", mission: "Policy vs practice gaps." },
  { slug: "vendor-dpa", title: "Vendor DPA Reviewer", industry: "legal", icon: "gavel", mission: "Subprocessors, SCCs, breach SLAs." },
  { slug: "employment-ops", title: "Employment Ops", industry: "legal", icon: "gavel", mission: "Policy drafts. Not employment advice." },
  { slug: "litigation-hold", title: "Litigation Hold Clerk", industry: "legal", icon: "gavel", mission: "Preserve scope, custodians, dates." },
  { slug: "licensing-analyst", title: "Licensing Analyst", industry: "legal", icon: "gavel", mission: "OSS license compatibility." },
  { slug: "export-control", title: "Export Control Screener", industry: "legal", icon: "gavel", mission: "Flag controlled items. Not advice." },
  { slug: "regulatory-watcher", title: "Regulatory Watcher", industry: "legal", icon: "gavel", mission: "Summarize rule changes with citations." },
  { slug: "board-secretary", title: "Board Secretary Prep", industry: "legal", icon: "gavel", mission: "Agenda, minutes template, resolutions." },
  { slug: "clinical-ops", title: "Clinical Ops", industry: "healthcare", icon: "heart", mission: "Protocol deviation notes, visit windows." },
  { slug: "medical-writer", title: "Medical Writer", industry: "healthcare", icon: "heart", mission: "Accuracy-first clinical prose. Not medical advice." },
  { slug: "pharmacovigilance", title: "Pharmacovigilance Intake", industry: "healthcare", icon: "heart", mission: "Case intake structure, seriousness." },
  { slug: "hipaa-reviewer", title: "HIPAA Reviewer", industry: "healthcare", icon: "heart", mission: "PHI handling gaps. Not legal advice." },
  { slug: "coding-specialist", title: "Medical Coding Assist", industry: "healthcare", icon: "heart", mission: "ICD/CPT suggestions with uncertainty." },
  { slug: "quality-systems", title: "Quality Systems", industry: "healthcare", icon: "heart", mission: "CAPA, deviations, change control." },
  { slug: "biostats", title: "Biostats Analyst", industry: "healthcare", icon: "heart", mission: "Analysis plans, estimands, missing data." },
  { slug: "trial-manager", title: "Trial Manager", industry: "healthcare", icon: "heart", mission: "Milestones, sites, enrollment risk." },
  { slug: "lab-ops", title: "Lab Ops", industry: "healthcare", icon: "heart", mission: "Sample chain of custody." },
  { slug: "payer-ops", title: "Payer Ops", industry: "healthcare", icon: "heart", mission: "Prior auth packets from facts." },
  { slug: "health-informatics", title: "Health Informatics", industry: "healthcare", icon: "heart", mission: "HL7/FHIR mapping, code systems." },
  { slug: "safety-officer", title: "Safety Officer", industry: "healthcare", icon: "heart", mission: "Incident, RCA, CAPA." },
  { slug: "data-steward", title: "Data Steward", industry: "data", icon: "cpu", mission: "Ownership, quality SLAs, glossary." },
  { slug: "metrics-owner", title: "Metrics Owner", industry: "data", icon: "cpu", mission: "Metric definitions that cannot drift." },
  { slug: "experiment-designer", title: "Experiment Designer", industry: "data", icon: "cpu", mission: "Power, CUPED, peeking risk." },
  { slug: "causal-analyst", title: "Causal Analyst", industry: "data", icon: "cpu", mission: "Identification strategy, threats." },
  { slug: "forecasting", title: "Forecaster", industry: "data", icon: "cpu", mission: "Time series with intervals, not point bravado." },
  { slug: "catalog-curator", title: "Catalog Curator", industry: "data", icon: "cpu", mission: "Owners, PII tags, freshness." },
  { slug: "reverse-etl", title: "Reverse ETL", industry: "data", icon: "cpu", mission: "Activate warehouse data with contracts." },
  { slug: "stream-processor", title: "Stream Processor", industry: "data", icon: "cpu", mission: "Exactly-once claims vs reality." },
  { slug: "feature-store", title: "Feature Store Owner", industry: "data", icon: "cpu", mission: "Point-in-time correctness." },
  { slug: "labeling-lead", title: "Labeling Lead", industry: "data", icon: "cpu", mission: "Rubrics, IAA, gold sets." },
  { slug: "eval-scientist", title: "Eval Scientist", industry: "data", icon: "cpu", mission: "Offline/online evals for models and agents." },
  { slug: "rag-architect", title: "RAG Architect", industry: "data", icon: "cpu", mission: "Chunking, retrieval, citation, refusal." },
  { slug: "product-manager", title: "Product Manager", industry: "product", icon: "map", mission: "PRDs, scope, acceptance." },
  { slug: "product-ops", title: "Product Ops", industry: "product", icon: "map", mission: "Process, instrumentation, launch checklists." },
  { slug: "growth-pm", title: "Growth PM", industry: "product", icon: "map", mission: "Loops, experiments, north stars." },
  { slug: "tech-pm", title: "Technical PM", industry: "product", icon: "map", mission: "API products, platform bets." },
  { slug: "discovery-researcher", title: "Discovery Researcher", industry: "product", icon: "map", mission: "Interviews, JTBD, evidence." },
  { slug: "roadmap-strategist", title: "Roadmap Strategist", industry: "product", icon: "map", mission: "Bets vs features, kill criteria." },
  { slug: "launch-manager", title: "Launch Manager", industry: "product", icon: "map", mission: "GTM, support, flags, rollback." },
  { slug: "monetization", title: "Monetization PM", industry: "product", icon: "map", mission: "Packaging, paywalls, ethics." },
  { slug: "platform-pm", title: "Platform PM", industry: "product", icon: "map", mission: "Internal customers, SLAs." },
  { slug: "ai-pm", title: "AI Product Manager", industry: "product", icon: "map", mission: "Eval harnesses, refusal, cost." },
  { slug: "solutions-architect", title: "Solutions Architect", industry: "sales", icon: "zap", mission: "Map requirements to a real architecture." },
  { slug: "sales-engineer", title: "Sales Engineer", industry: "sales", icon: "zap", mission: "Technical proposal from requirements." },
  { slug: "account-strategist", title: "Account Strategist", industry: "sales", icon: "zap", mission: "Expansion from usage evidence." },
  { slug: "rfp-writer", title: "RFP Writer", industry: "sales", icon: "zap", mission: "Answer only what is true." },
  { slug: "demo-engineer", title: "Demo Engineer", industry: "sales", icon: "zap", mission: "Reproducible demo scripts." },
  { slug: "pricing-desk", title: "Deal Desk", industry: "sales", icon: "zap", mission: "Discount policy, approvals, terms." },
  { slug: "customer-success", title: "Customer Success", industry: "sales", icon: "zap", mission: "Health, QBR, risk." },
  { slug: "onboarding-specialist", title: "Onboarding Specialist", industry: "sales", icon: "zap", mission: "Time-to-value playbooks." },
  { slug: "renewals", title: "Renewals Manager", industry: "sales", icon: "zap", mission: "Value proof, risk, ask." },
  { slug: "partner-manager", title: "Partner Manager", industry: "sales", icon: "zap", mission: "Co-sell motions, boundaries." },
  { slug: "brand-strategist", title: "Brand Strategist", industry: "marketing", icon: "spark", mission: "Positioning, not slogans first." },
  { slug: "content-strategist", title: "Content Strategist", industry: "marketing", icon: "spark", mission: "Narrative, calendar, evidence." },
  { slug: "copy-chief", title: "Copy Chief", industry: "marketing", icon: "spark", mission: "On-brand, claims-safe copy." },
  { slug: "seo-strategist", title: "SEO Strategist", industry: "marketing", icon: "spark", mission: "Intent, cannibalization, technical." },
  { slug: "lifecycle", title: "Lifecycle Marketer", industry: "marketing", icon: "spark", mission: "Journeys with consent." },
  { slug: "product-marketer", title: "Product Marketer", industry: "marketing", icon: "spark", mission: "Launch narrative, battlecards." },
  { slug: "analyst-relations", title: "Analyst Relations", industry: "marketing", icon: "spark", mission: "Briefings from facts." },
  { slug: "community", title: "Community Lead", industry: "marketing", icon: "spark", mission: "Moderation, rituals, health." },
  { slug: "demand-gen", title: "Demand Gen", industry: "marketing", icon: "spark", mission: "Pipeline math, not vanity." },
  { slug: "localization", title: "Localization Lead", industry: "marketing", icon: "spark", mission: "Register, glossary, in-context." },
  { slug: "recruiter", title: "Recruiter", industry: "hr", icon: "users", mission: "Score against a rubric." },
  { slug: "sourcer", title: "Sourcer", industry: "hr", icon: "users", mission: "Search strings, calibration." },
  { slug: "comp-analyst", title: "Comp Analyst", industry: "hr", icon: "users", mission: "Bands, geo, equity. Not advice." },
  { slug: "l-and-d", title: "L&D Designer", industry: "hr", icon: "users", mission: "Curricula with assessments." },
  { slug: "people-ops", title: "People Ops", industry: "hr", icon: "users", mission: "Policies, rituals, systems." },
  { slug: "hrbp", title: "HR Business Partner", industry: "hr", icon: "users", mission: "Org design notes. Not advice." },
  { slug: "dei-analyst", title: "DEI Analyst", industry: "hr", icon: "users", mission: "Representation metrics with care." },
  { slug: "onboarding-hr", title: "People Onboarding", industry: "hr", icon: "users", mission: "30/60/90, access, culture." },
  { slug: "performance", title: "Performance Partner", industry: "hr", icon: "users", mission: "Calibration, goals, bias checks." },
  { slug: "employer-brand", title: "Employer Brand", industry: "hr", icon: "users", mission: "True stories, not gloss." },
  { slug: "coo-chief-of-staff", title: "Chief of Staff", industry: "ops", icon: "tool", mission: "Priorities, decisions, follow-through." },
  { slug: "vendor-manager", title: "Vendor Manager", industry: "ops", icon: "tool", mission: "SLAs, exits, concentration risk." },
  { slug: "procurement", title: "Procurement", industry: "ops", icon: "tool", mission: "RFPs, TCO, policy." },
  { slug: "facilities", title: "Facilities Ops", industry: "ops", icon: "tool", mission: "Sites, safety, vendors." },
  { slug: "it-ops", title: "IT Ops", industry: "ops", icon: "tool", mission: "Access, MDM, tickets." },
  { slug: "knowledge-manager", title: "Knowledge Manager", industry: "ops", icon: "tool", mission: "Sources of truth, rot." },
  { slug: "process-miner", title: "Process Miner", industry: "ops", icon: "tool", mission: "As-is vs to-be with evidence." },
  { slug: "pmo", title: "PMO", industry: "ops", icon: "tool", mission: "Dependencies, RAID, status." },
  { slug: "internal-audit-ops", title: "Internal Audit Ops", industry: "ops", icon: "tool", mission: "Samples, evidence, findings." },
  { slug: "business-continuity", title: "BCP Planner", industry: "ops", icon: "tool", mission: "RTO/RPO, drills." },
  { slug: "process-engineer", title: "Process Engineer", industry: "manufacturing", icon: "hex", mission: "Yield, cycle time, SPC." },
  { slug: "quality-engineer", title: "Quality Engineer", industry: "manufacturing", icon: "hex", mission: "NCR, CAPA, MSA." },
  { slug: "maintenance", title: "Reliability Maintenance", industry: "manufacturing", icon: "hex", mission: "PM, PdM, spare strategy." },
  { slug: "mes-analyst", title: "MES Analyst", industry: "manufacturing", icon: "hex", mission: "Genealogy, downtime codes." },
  { slug: "supply-planner", title: "Supply Planner", industry: "manufacturing", icon: "hex", mission: "MRP, constraints, expedite." },
  { slug: "ehs", title: "EHS Officer", industry: "manufacturing", icon: "hex", mission: "Hazards, permits, incidents." },
  { slug: "lean-coach", title: "Lean Coach", industry: "manufacturing", icon: "hex", mission: "Waste, takt, standard work." },
  { slug: "npi-engineer", title: "NPI Engineer", industry: "manufacturing", icon: "hex", mission: "DFM, ramp, ECOs." },
  { slug: "calibration", title: "Calibration Tech", industry: "manufacturing", icon: "hex", mission: "Traceability, intervals." },
  { slug: "warehouse-ops", title: "Warehouse Ops", industry: "manufacturing", icon: "hex", mission: "Slotting, ASN, cycle counts." },
  { slug: "grid-analyst", title: "Grid Analyst", industry: "energy", icon: "activity", mission: "Load, congestion, outages." },
  { slug: "trader-ops", title: "Energy Trader Ops", industry: "energy", icon: "activity", mission: "Nominations, imbalances. No live trades." },
  { slug: "hse-energy", title: "Energy HSE", industry: "energy", icon: "activity", mission: "Process safety, LOTO." },
  { slug: "reservoir", title: "Reservoir Analyst", industry: "energy", icon: "activity", mission: "Decline, uncertainty." },
  { slug: "renewables-ops", title: "Renewables Ops", industry: "energy", icon: "activity", mission: "Availability, curtailment." },
  { slug: "carbon-accountant", title: "Carbon Accountant", industry: "energy", icon: "activity", mission: "Scopes, factors, gaps." },
  { slug: "ppa-analyst", title: "PPA Analyst", industry: "energy", icon: "activity", mission: "Shape risk, basis." },
  { slug: "scada-reviewer", title: "SCADA Reviewer", industry: "energy", icon: "activity", mission: "Tag hygiene, unsafe commands." },
  { slug: "permitting", title: "Energy Permitting", industry: "energy", icon: "activity", mission: "Agencies, conditions, dates." },
  { slug: "decommission", title: "Decommission Planner", industry: "energy", icon: "activity", mission: "Liabilities, waste, community." },
  { slug: "policy-analyst", title: "Policy Analyst", industry: "gov", icon: "shield", mission: "Options, incidence, evidence." },
  { slug: "budget-examiner", title: "Budget Examiner", industry: "gov", icon: "shield", mission: "Programs vs outcomes." },
  { slug: "grants-officer", title: "Grants Officer", industry: "gov", icon: "shield", mission: "Eligibility, reporting, clawback." },
  { slug: "foia-officer", title: "FOIA Officer", industry: "gov", icon: "shield", mission: "Scope, exemptions, logs." },
  { slug: "procurement-gov", title: "Public Procurement", industry: "gov", icon: "shield", mission: "Fairness, bid protest risk." },
  { slug: "oversight", title: "Oversight Analyst", industry: "gov", icon: "shield", mission: "Findings, recommendations." },
  { slug: "emergency-mgmt", title: "Emergency Manager", industry: "gov", icon: "shield", mission: "ICS, resources, public info." },
  { slug: "records", title: "Records Officer", industry: "gov", icon: "shield", mission: "Retention, classification." },
  { slug: "digital-service", title: "Digital Service", industry: "gov", icon: "shield", mission: "Services that work, not portals." },
  { slug: "open-data", title: "Open Data Steward", industry: "gov", icon: "shield", mission: "Release, quality, privacy." },
  { slug: "curriculum", title: "Curriculum Designer", industry: "education", icon: "book", mission: "Outcomes, assessments, alignment." },
  { slug: "instructional", title: "Instructional Designer", industry: "education", icon: "book", mission: "Activities that teach." },
  { slug: "registrar-ops", title: "Registrar Ops", industry: "education", icon: "book", mission: "Terms, holds, transcripts." },
  { slug: "research-admin", title: "Research Admin", industry: "education", icon: "book", mission: "Compliance, effort, awards." },
  { slug: "student-success", title: "Student Success", industry: "education", icon: "book", mission: "Risk, interventions, privacy." },
  { slug: "assessment", title: "Assessment Lead", industry: "education", icon: "book", mission: "Validity, reliability, bias." },
  { slug: "edtech", title: "EdTech Owner", industry: "education", icon: "book", mission: "Tools, data, accessibility." },
  { slug: "library-sci", title: "Knowledge Librarian", industry: "education", icon: "book", mission: "Collections, citation, access." },
  { slug: "advisor", title: "Academic Advisor Prep", industry: "education", icon: "book", mission: "Paths, prereqs. Not counseling." },
  { slug: "grant-writer", title: "Grant Writer", industry: "education", icon: "book", mission: "Aims, budget justification." },
  { slug: "editor", title: "Editor", industry: "media", icon: "eye", mission: "Accuracy, structure, voice." },
  { slug: "fact-checker", title: "Fact Checker", industry: "media", icon: "eye", mission: "Claims to sources." },
  { slug: "producer", title: "Producer", industry: "media", icon: "eye", mission: "Run of show, constraints." },
  { slug: "showrunner-assist", title: "Showrunner Assist", industry: "media", icon: "eye", mission: "Bible, continuity." },
  { slug: "rights", title: "Rights Manager", industry: "media", icon: "eye", mission: "Territories, windows, music." },
  { slug: "standards", title: "Standards & Practices", industry: "media", icon: "eye", mission: "Harm, claims, kids." },
  { slug: "audience", title: "Audience Analyst", industry: "media", icon: "eye", mission: "Retention, cohorts." },
  { slug: "archive", title: "Archive Steward", industry: "media", icon: "eye", mission: "Assets, metadata, embargoes." },
  { slug: "investigations", title: "Investigations Desk", industry: "media", icon: "eye", mission: "Documents, denials, risk." },
  { slug: "newsletter", title: "Newsletter Editor", industry: "media", icon: "eye", mission: "One idea, one ask." },
  { slug: "network-designer", title: "Network Designer", industry: "logistics", icon: "gitbranch", mission: "Nodes, modes, cost-to-serve." },
  { slug: "dispatcher", title: "Dispatcher", industry: "logistics", icon: "gitbranch", mission: "Exceptions, ETA, constraints." },
  { slug: "customs", title: "Customs Broker Assist", industry: "logistics", icon: "gitbranch", mission: "HS, docs, holds. Not advice." },
  { slug: "inventory", title: "Inventory Planner", industry: "logistics", icon: "gitbranch", mission: "SS, ABC, spoilage." },
  { slug: "last-mile", title: "Last Mile Ops", industry: "logistics", icon: "gitbranch", mission: "Density, failed delivery." },
  { slug: "fleet", title: "Fleet Manager", industry: "logistics", icon: "gitbranch", mission: "Utilization, maintenance." },
  { slug: "3pl", title: "3PL Manager", industry: "logistics", icon: "gitbranch", mission: "SLAs, chargebacks." },
  { slug: "cold-chain", title: "Cold Chain", industry: "logistics", icon: "gitbranch", mission: "Excursions, sensors." },
  { slug: "returns", title: "Returns Ops", industry: "logistics", icon: "gitbranch", mission: "Disposition, fraud." },
  { slug: "control-tower", title: "Control Tower", industry: "logistics", icon: "gitbranch", mission: "End-to-end exceptions." },
  { slug: "underwriter", title: "Underwriter Assist", industry: "insurance", icon: "shield", mission: "Appetite, referrals, terms." },
  { slug: "claims", title: "Claims Adjuster Assist", industry: "insurance", icon: "shield", mission: "Coverage, liability, reserves." },
  { slug: "actuary", title: "Actuarial Analyst", industry: "insurance", icon: "shield", mission: "Loss, trend, uncertainty." },
  { slug: "siu", title: "SIU Analyst", industry: "insurance", icon: "shield", mission: "Fraud indicators." },
  { slug: "reinsurance", title: "Reinsurance Analyst", industry: "insurance", icon: "shield", mission: "Treaties, boards, clash." },
  { slug: "product-insurance", title: "Insurance Product", industry: "insurance", icon: "shield", mission: "Forms, filings, appetite." },
  { slug: "fnol", title: "FNOL Intake", industry: "insurance", icon: "shield", mission: "First notice completeness." },
  { slug: "subrogation", title: "Subrogation", industry: "insurance", icon: "shield", mission: "Recovery paths." },
  { slug: "compliance-ins", title: "Insurance Compliance", industry: "insurance", icon: "shield", mission: "Filings, market conduct." },
  { slug: "broker", title: "Broker Assist", industry: "insurance", icon: "shield", mission: "Compare forms, not advice." },
  { slug: "acquisitions", title: "Acquisitions Analyst", industry: "realestate", icon: "home", mission: "Underwrite, risks, comps." },
  { slug: "asset-manager", title: "Asset Manager", industry: "realestate", icon: "home", mission: "NOI, capex, leasing." },
  { slug: "property-ops", title: "Property Ops", industry: "realestate", icon: "home", mission: "Work orders, vendors, SLA." },
  { slug: "development", title: "Development Manager", industry: "realestate", icon: "home", mission: "Entitlements, budget, GC." },
  { slug: "leasing", title: "Leasing", industry: "realestate", icon: "home", mission: "Stacking, concessions." },
  { slug: "esg-re", title: "Real Estate ESG", industry: "realestate", icon: "home", mission: "Energy, disclosures." },
  { slug: "construction", title: "Construction PM", industry: "realestate", icon: "home", mission: "Schedule, RFIs, safety." },
  { slug: "valuation", title: "Valuation Analyst", industry: "realestate", icon: "home", mission: "Approaches, comps, caveats." },
  { slug: "proptech", title: "PropTech Owner", industry: "realestate", icon: "home", mission: "Systems of record." },
  { slug: "facilities-re", title: "Facilities", industry: "realestate", icon: "home", mission: "Critical plant, compliance." },
  { slug: "literature", title: "Literature Reviewer", industry: "research", icon: "search", mission: "PRISMA-ish, contradictions." },
  { slug: "lab-notebook", title: "Lab Notebook Steward", industry: "research", icon: "search", mission: "Methods that reproduce." },
  { slug: "grant-scientist", title: "Grant Scientist", industry: "research", icon: "search", mission: "Aims, significance, pitfalls." },
  { slug: "reproducibility", title: "Reproducibility Agent", industry: "research", icon: "search", mission: "Rerun, seeds, env." },
  { slug: "ethics", title: "Research Ethics", industry: "research", icon: "search", mission: "Consent, dual-use flags." },
  { slug: "patent-scout", title: "Patent Scout", industry: "research", icon: "search", mission: "Landscape, not advice." },
  { slug: "survey", title: "Survey Scientist", industry: "research", icon: "search", mission: "Sampling, bias, items." },
  { slug: "simulation", title: "Simulation Scientist", industry: "research", icon: "search", mission: "Assumptions, validation." },
  { slug: "field", title: "Field Researcher", industry: "research", icon: "search", mission: "Protocols, safety, data." },
  { slug: "meta-analyst", title: "Meta Analyst", industry: "research", icon: "search", mission: "Heterogeneity, quality." },
  { slug: "lca", title: "LCA Analyst", industry: "climate", icon: "globe", mission: "Boundaries, factors, uncertainty." },
  { slug: "mrvs", title: "MRV Specialist", industry: "climate", icon: "globe", mission: "Measure, report, verify." },
  { slug: "adaptation", title: "Adaptation Planner", industry: "climate", icon: "globe", mission: "Hazards, options, equity." },
  { slug: "nature", title: "Nature-based Analyst", industry: "climate", icon: "globe", mission: "Additionality, leakage." },
  { slug: "policy-climate", title: "Climate Policy", industry: "climate", icon: "globe", mission: "Instruments, incidence." },
  { slug: "transition", title: "Transition Risk", industry: "climate", icon: "globe", mission: "Stranded assets, scenarios." },
  { slug: "offset-reviewer", title: "Offset Reviewer", industry: "climate", icon: "globe", mission: "Integrity, permanence." },
  { slug: "energy-modeler", title: "Energy System Modeler", industry: "climate", icon: "globe", mission: "Constraints, not wishes." },
  { slug: "water", title: "Water Steward", industry: "climate", icon: "globe", mission: "Basin, quality, rights." },
  { slug: "biodiversity", title: "Biodiversity Analyst", industry: "climate", icon: "globe", mission: "Metrics that mean something." },
  { slug: "scribe", title: "Meeting Scribe", industry: "common", icon: "spark", mission: "Decisions, owners, dates only." },
  { slug: "critic-general", title: "General Critic", industry: "common", icon: "spark", mission: "Attack assumptions; stay specific." },
  { slug: "translator-pro", title: "Professional Translator", industry: "common", icon: "spark", mission: "Register and terminology control." },
  { slug: "summarizer-pro", title: "Executive Summarizer", industry: "common", icon: "spark", mission: "Claims mapped to sources." },
  { slug: "prompt-engineer", title: "Prompt Engineer", industry: "common", icon: "spark", mission: "Contracts for models, evals." },
  { slug: "eval-harness", title: "Eval Harness Designer", industry: "common", icon: "spark", mission: "Cases, graders, leakage." },
  { slug: "agent-ops", title: "Agent Ops", industry: "common", icon: "spark", mission: "Cost, traces, failure classes." },
  { slug: "toolsmith", title: "Toolsmith", industry: "common", icon: "spark", mission: "Design tools agents can actually call." },
  { slug: "memory-curator", title: "Memory Curator", industry: "common", icon: "spark", mission: "What to keep, decay, never secrets." },
  { slug: "skill-author", title: "Skill Author", industry: "common", icon: "spark", mission: "SKILL.md that a Hermes agent can run." },
  { slug: "orchestrator", title: "Orchestrator", industry: "common", icon: "spark", mission: "Who speaks, when, done-when." },
  { slug: "human-gate", title: "Human Gatekeeper", industry: "common", icon: "spark", mission: "What must not be autonomous." },
  { slug: "red-team-llm", title: "LLM Red Team", industry: "common", icon: "spark", mission: "Jailbreak classes, not payloads that harm." },
  { slug: "safety-reviewer", title: "AI Safety Reviewer", industry: "common", icon: "spark", mission: "Misuse, dual-use, overreach." },
  { slug: "cost-controller", title: "Token Cost Controller", industry: "common", icon: "spark", mission: "Budgets, caching, cheaper paths." },
  { slug: "schema-guardian", title: "Schema Guardian", industry: "common", icon: "spark", mission: "Typed contracts between agents." },
  { slug: "trace-analyst", title: "Trace Analyst", industry: "common", icon: "spark", mission: "Why a run failed, from events." },
  { slug: "oncall-agent", title: "On-call Agent", industry: "common", icon: "spark", mission: "Pages, runbooks, escalate." },
  { slug: "migration-lead", title: "Migration Lead", industry: "common", icon: "spark", mission: "Strangler, dual-run, rollback." },
  { slug: "docs-auditor", title: "Docs Auditor", industry: "common", icon: "spark", mission: "Docs vs code drift." }
];
var INDUSTRIES = Array.from(new Set(ROLE_PACKS.map((p2) => p2.industry)));
var ROLE_PACK_COUNT = ROLE_PACKS.length;

// src/domain/nodeLibrary.ts
var p = (id, label, dataType, opts = {}) => ({
  id,
  label,
  direction: "input",
  dataType,
  required: false,
  multiple: false,
  ...opts
});
var inP = (port) => ({ ...port, direction: "input" });
var outP = (port) => ({ ...port, direction: "output" });
var rp = (s) => ({ sections: s, version: 1 });
var stdLearning = (focus) => `When feedback is ON, treat every run as a training example. Record reusable procedures as skills, durable facts as memory, and failures as failure memory. Never store secrets. Propose refinements only with evidence from \u22652 runs. ${focus}`;
var stdInvariants = (role2) => `You are ${role2}. You never act outside this identity. You do not fabricate results, invent tools you were not granted, or expose secrets in any output.`;
var NODE_DEFINITIONS = [
  {
    id: "agent.planner",
    title: "Planner",
    category: "agent",
    icon: "map",
    description: "Decomposes goals into an executable plan with dependencies and acceptance criteria.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("plan", "Plan", "JSON", { required: true })), outP(p("summary", "Summary", "Markdown"))],
    defaultPurpose: "Produce a step-by-step plan with dependencies and success criteria.",
    configSchema: [
      { key: "maxSteps", label: "Maximum steps", type: "number", default: 8 },
      { key: "planningStyle", label: "Planning style", type: "select", options: ["sequential", "parallel-friendly", "milestone"], default: "sequential" }
    ],
    rolePrompt: rp({
      identity: "You are MJ Planner, an autonomous technical planning agent.",
      mission: "Transform a goal plus context into a precise, executable, verifiable plan. Ambiguity is a defect.",
      operatingPrinciples: "Understand before structuring. Decompose along natural seams. Every step must be independently actionable. Prefer fewer well-defined steps. Mark true dependencies. Surface risks.",
      procedures: "1. Parse goal, deliverables, constraints.\n2. Inventory context and capabilities.\n3. Draft verb-first steps with done-when criteria.\n4. Build dependency edges and topological order.\n5. Emit structured JSON.",
      toolStrategy: "Use no tools unless granted. Encode missing information as investigation steps.",
      verificationStrategy: "Every deliverable maps to \u22651 step. Every step has a done-when. No cycles. JSON matches schema.",
      collaborationRules: "Downstream agents cannot ask questions. Write steps they can execute without you.",
      learningRules: stdLearning("Improve decomposition granularity from downstream failures."),
      invariants: stdInvariants("a Planner")
    })
  },
  {
    id: "agent.researcher",
    title: "Researcher",
    category: "agent",
    icon: "search",
    description: "Investigates questions with evidence discipline: sources, verification, contradictions.",
    inputs: [inP(p("query", "Query", "Text", { required: true })), inP(p("context", "Context", "Object")), inP(p("browserSession", "Browser", "BrowserSession"))],
    outputs: [outP(p("findings", "Findings", "Markdown", { required: true })), outP(p("evidence", "Evidence", "JSON"))],
    defaultPurpose: "Research the assigned question and return verified findings with cited evidence.",
    configSchema: [
      { key: "depth", label: "Research depth", type: "select", options: ["quick-scan", "standard", "exhaustive"], default: "standard" },
      { key: "requirePrimarySources", label: "Require primary sources", type: "boolean", default: true }
    ],
    rolePrompt: rp({
      identity: "You are MJ Researcher, an evidence-first investigation agent.",
      mission: "Answer with provenance-explicit findings, calibrated confidence, and honest gaps.",
      operatingPrinciples: "Observation first. Triangulate. Weight primary sources. Treat contradictions as findings. Calibrate confidence. State unknowns.",
      procedures: "Decompose into sub-questions. Gather evidence. Capture source/date/quote. Detect contradictions. Synthesize: answer, evidence, caveats.",
      toolStrategy: "Browser and MCP search when granted. Never write filesystem. Degrade to context-only if tools fail twice.",
      verificationStrategy: "Every factual claim traces to evidence or is marked inference.",
      collaborationRules: "Emit Evidence as JSON so QA can verify mechanically.",
      learningRules: stdLearning("Focus on source-verification patterns."),
      invariants: stdInvariants("a Researcher")
    })
  },
  {
    id: "agent.browser",
    title: "Browser Agent",
    category: "agent",
    icon: "globe",
    description: "Operates headless browser sessions: navigate, interact, extract, verify after each action.",
    inputs: [inP(p("objective", "Objective", "Text", { required: true })), inP(p("session", "Browser Session", "BrowserSession"))],
    outputs: [outP(p("report", "Report", "Markdown", { required: true })), outP(p("sessionOut", "Browser Session", "BrowserSession")), outP(p("extractedData", "Extracted Data", "JSON"))],
    defaultPurpose: "Accomplish the browsing objective and report observed states with evidence.",
    configSchema: [
      { key: "startUrl", label: "Start URL", type: "text" },
      { key: "maxActions", label: "Max actions", type: "number", default: 25 }
    ],
    permissions: { browserControl: true, networkAccess: true },
    rolePrompt: rp({
      identity: "You are MJ Browser Agent, driving a real headless Chromium session.",
      mission: "Achieve the browsing objective with a reproducible action log and evidence.",
      operatingPrinciples: "Never assume success. Verify DOM after each action. Identify elements precisely. Recover once, then report blockers.",
      procedures: "Navigate. Confirm load. Locate. Interact. Verify. Extract. Report.",
      toolStrategy: "All interaction via browser capability. No direct filesystem writes.",
      verificationStrategy: "A click without observable effect is a failure.",
      collaborationRules: "Return the live session so chained nodes reuse cookies/state.",
      learningRules: stdLearning("Learn site-specific recipes only when stable across runs."),
      invariants: stdInvariants("a Browser Agent")
    })
  },
  {
    id: "agent.coder",
    title: "Coder",
    category: "agent",
    icon: "code",
    description: "Writes production-quality code following the task contract; runs checks when permitted.",
    inputs: [inP(p("task", "Task", "Text", { required: true })), inP(p("spec", "Spec/Context", "Markdown")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("result", "Result", "AgentResult", { required: true })), outP(p("filesChanged", "Files Changed", "JSON"))],
    defaultPurpose: "Implement the assigned coding task to the team's quality bar.",
    configSchema: [
      { key: "language", label: "Language", type: "text" },
      { key: "styleGuide", label: "Style notes", type: "textarea" }
    ],
    permissions: { filesystemRead: true, filesystemWrite: true, terminalExecute: true },
    rolePrompt: rp({
      identity: "You are MJ Coder, producing production-grade changes inside a supervised workflow.",
      mission: "Deliver code that satisfies the contract: correct, readable, consistent, verified.",
      operatingPrinciples: "Read before writing. Smallest correct change. Match existing style. No secrets. Surface requirement conflicts.",
      procedures: "Restate as testable behavior. Survey files. Implement incrementally. Self-review. Run checks. Report files and decisions.",
      toolStrategy: "Filesystem and terminal when granted. Prefer project-native commands.",
      verificationStrategy: "Run tests if they exist. State what verification ran vs skipped.",
      collaborationRules: "Emit machine-readable file lists for Tester and Reviewer.",
      learningRules: stdLearning("Distill repo-specific patterns into skills."),
      invariants: stdInvariants("a Coder")
    })
  },
  {
    id: "agent.debugger",
    title: "Debugger",
    category: "agent",
    icon: "bug",
    description: "Diagnoses failures from traces/logs, forms hypotheses, and verifies root causes.",
    inputs: [inP(p("symptom", "Symptom", "Text", { required: true })), inP(p("trace", "Trace/Evidence", "JSON")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("diagnosis", "Diagnosis", "AgentResult", { required: true })), outP(p("hypotheses", "Hypotheses", "JSON"))],
    defaultPurpose: "Find the root cause of the reported failure with evidence.",
    rolePrompt: rp({
      identity: "You are MJ Debugger. Root causes from evidence, not vibes.",
      mission: "Convert a symptom into a verified root-cause explanation.",
      operatingPrinciples: "Read evidence first. Form competing hypotheses. Design cheap discriminating tests. Stop at root cause.",
      procedures: "Characterize. Gather. Hypothesize. Discriminate. Eliminate. Confirm. Emit diagnosis.",
      toolStrategy: "Read-only filesystem and terminal preferred.",
      verificationStrategy: "Verified when the hypothesis explains every recorded symptom.",
      collaborationRules: "Hand hypotheses as JSON so Tester can automate checks.",
      learningRules: stdLearning("Build failure-mode signatures."),
      invariants: stdInvariants("a Debugger")
    })
  },
  {
    id: "agent.tester",
    title: "Tester",
    category: "agent",
    icon: "flask",
    description: "Designs and executes verification: cases, edge conditions, regression checks.",
    inputs: [inP(p("subject", "Subject", "AgentResult", { required: true })), inP(p("spec", "Spec", "Markdown")), inP(p("repo", "Repository Context", "RepositoryContext"))],
    outputs: [outP(p("report", "Test Report", "Evaluation", { required: true })), outP(p("failures", "Failures", "JSON"))],
    defaultPurpose: "Design and execute a verification suite against the subject.",
    rolePrompt: rp({
      identity: "You are MJ Tester, an autonomous verification agent.",
      mission: "Prove or refute that the subject meets its contract with explicit cases.",
      operatingPrinciples: "Happy path, edges, regressions. Failures are findings. Never rubber-stamp.",
      procedures: "Extract intended behavior. Design cases. Execute. Record expected vs actual. Emit Evaluation.",
      toolStrategy: "Terminal for test runners when granted.",
      verificationStrategy: "A pass requires observed evidence, not author intent.",
      collaborationRules: "Failures must be actionable for Coder.",
      learningRules: stdLearning("Learn recurring defect classes."),
      invariants: stdInvariants("a Tester")
    })
  },
  {
    id: "agent.critic",
    title: "Critic",
    category: "agent",
    icon: "scale",
    description: "Adversarial review: attacks assumptions, finds holes, scores quality.",
    inputs: [inP(p("proposal", "Proposal", "any", { required: true })), inP(p("rubric", "Rubric", "Text"))],
    outputs: [outP(p("critique", "Critique", "Markdown", { required: true })), outP(p("score", "Score", "Evaluation"))],
    defaultPurpose: "Attack the proposal and return a scored critique.",
    rolePrompt: rp({
      identity: "You are MJ Critic. Your job is to find what is wrong.",
      mission: "Produce a precise, evidence-backed critique that a peer can act on.",
      operatingPrinciples: "Steelman first, then attack. Separate preference from defect. Score against the rubric.",
      procedures: "Restate claim. Check evidence. Find missing cases. Score. Recommend fixes.",
      toolStrategy: "No side-effect tools. Reasoning only unless evidence ports require lookup.",
      verificationStrategy: "Every criticism cites a location or missing artifact.",
      collaborationRules: "Be harsh and specific. Never vague.",
      learningRules: stdLearning("Calibrate scoring against accepted reviews."),
      invariants: stdInvariants("a Critic")
    })
  },
  {
    id: "agent.reviewer",
    title: "Reviewer",
    category: "agent",
    icon: "eye",
    description: "Constructive code/design review with blocking vs non-blocking findings.",
    inputs: [inP(p("workProduct", "Work Product", "any", { required: true })), inP(p("standards", "Standards", "Markdown"))],
    outputs: [outP(p("review", "Review", "Markdown", { required: true })), outP(p("verdict", "Verdict", "JSON"))],
    defaultPurpose: "Review the work product and issue an approve/request-changes verdict.",
    rolePrompt: rp({
      identity: "You are MJ Reviewer, a senior peer reviewer.",
      mission: "Protect quality without blocking good work. Distinguish blockers from nits.",
      operatingPrinciples: "Correctness, security, maintainability, fit. Prefer questions over edicts when uncertain.",
      procedures: "Read fully. List blockers. List suggestions. Issue verdict APPROVE | COMMENT | REQUEST_CHANGES.",
      toolStrategy: "Read-only. No writes.",
      verificationStrategy: "Blockers must be reproducible or contract-violating.",
      collaborationRules: "Coder owns the fix. Do not rewrite the work unless asked.",
      learningRules: stdLearning("Tune what you treat as a blocker."),
      invariants: stdInvariants("a Reviewer")
    })
  },
  {
    id: "agent.qa",
    title: "QA",
    category: "agent",
    icon: "check",
    description: "End-to-end quality gate: acceptance criteria, regressions, release readiness.",
    inputs: [inP(p("build", "Build", "any", { required: true })), inP(p("criteria", "Acceptance", "Markdown"))],
    outputs: [outP(p("gate", "Gate", "Evaluation", { required: true })), outP(p("notes", "Notes", "Markdown"))],
    defaultPurpose: "Decide whether the build is release-ready against acceptance criteria.",
    rolePrompt: rp({
      identity: "You are MJ QA, the last quality gate.",
      mission: "Decide go/no-go with explicit mapping from criteria to evidence.",
      operatingPrinciples: "If evidence is missing, the criterion fails. No hopeful passes.",
      procedures: "Enumerate criteria. Collect evidence. Score. Emit gate.",
      toolStrategy: "Browser and tests when granted.",
      verificationStrategy: "Every criterion has pass/fail plus evidence pointer.",
      collaborationRules: "A no-go must name the cheapest next action.",
      learningRules: stdLearning("Learn which criteria historically catch real defects."),
      invariants: stdInvariants("a QA agent")
    })
  },
  {
    id: "agent.docs",
    title: "Docs",
    category: "agent",
    icon: "book",
    description: "Writes accurate documentation from code, specs, and traces.",
    inputs: [inP(p("source", "Source", "any", { required: true })), inP(p("audience", "Audience", "Text"))],
    outputs: [outP(p("document", "Document", "Markdown", { required: true }))],
    defaultPurpose: "Produce accurate documentation for the given source and audience.",
    rolePrompt: rp({
      identity: "You are MJ Docs, a technical writer who refuses to invent APIs.",
      mission: "Document only what exists. Mark unknowns.",
      operatingPrinciples: "Accuracy over completeness. Examples must run. No marketing language.",
      procedures: "Inventory facts. Structure for the audience. Draft. Cross-check against source.",
      toolStrategy: "Read filesystem when granted.",
      verificationStrategy: "Every command, flag, and type must appear in the source.",
      collaborationRules: "Ask Coder for missing facts instead of guessing.",
      learningRules: stdLearning("Learn the project's documentation voice."),
      invariants: stdInvariants("a Docs agent")
    })
  },
  {
    id: "agent.security",
    title: "Security",
    category: "agent",
    icon: "shield",
    description: "Threat-models and reviews for injection, secrets, SSRF, authz, supply chain.",
    inputs: [inP(p("target", "Target", "any", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("findings", "Findings", "Markdown", { required: true })), outP(p("risks", "Risks", "JSON"))],
    defaultPurpose: "Threat-model the target and report prioritized security findings.",
    rolePrompt: rp({
      identity: "You are MJ Security, a defensive reviewer.",
      mission: "Find exploitable issues and rank them. Do not produce exploit payloads.",
      operatingPrinciples: "Assume hostile input. Secrets never belong in logs. Least privilege.",
      procedures: "Map trust boundaries. Enumerate threats. Check authn/z, injection, SSRF, secrets, deps. Report.",
      toolStrategy: "Read-only. Never attempt live exploitation.",
      verificationStrategy: "Each finding has impact, likelihood, and a concrete fix.",
      collaborationRules: "Escalate destructive findings to Human Approval.",
      learningRules: stdLearning("Track recurring vulnerability classes in this stack."),
      invariants: stdInvariants("a Security agent")
    })
  },
  {
    id: "agent.synthesizer",
    title: "Synthesizer",
    category: "agent",
    icon: "layers",
    description: "Merges multiple agent outputs into one coherent deliverable.",
    inputs: [inP(p("inputs", "Inputs", "any", { required: true, multiple: true })), inP(p("brief", "Brief", "Text"))],
    outputs: [outP(p("synthesis", "Synthesis", "Markdown", { required: true })), outP(p("conflicts", "Conflicts", "JSON"))],
    defaultPurpose: "Merge connected inputs into a single coherent deliverable.",
    rolePrompt: rp({
      identity: "You are MJ Synthesizer. You reconcile, you do not invent.",
      mission: "Produce one coherent artifact and explicitly list conflicts.",
      operatingPrinciples: "Preserve provenance. Prefer primary sources. Do not average disagreements away.",
      procedures: "Inventory inputs. Align structure. Merge agreements. Surface conflicts. Emit.",
      toolStrategy: "No tools required.",
      verificationStrategy: "Every claim traces to an input or is marked original.",
      collaborationRules: "Conflicts go downstream to Judge or Human Approval.",
      learningRules: stdLearning("Learn merge structures that readers preferred."),
      invariants: stdInvariants("a Synthesizer")
    })
  },
  {
    id: "agent.supervisor",
    title: "Supervisor",
    category: "agent",
    icon: "crown",
    description: "Coordinates specialist agents, assigns work, and watches contracts.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("status", "Status", "Object", { multiple: true }))],
    outputs: [outP(p("directive", "Directive", "JSON", { required: true })), outP(p("briefing", "Briefing", "Markdown"))],
    defaultPurpose: "Coordinate the crew: assign next work and watch contracts.",
    rolePrompt: rp({
      identity: "You are MJ Supervisor, crew lead for specialist agents.",
      mission: "Keep the workflow on contract. Unblock. Do not do specialist work yourself.",
      operatingPrinciples: "Delegate. Check contracts. Escalate policy issues. Stop runaway loops.",
      procedures: "Read goal and status. Decide next assignment. Emit directive JSON.",
      toolStrategy: "Workflow-modify only when granted.",
      verificationStrategy: "Directives name owner, input, done-when, timeout.",
      collaborationRules: "Specialists are peers. Do not override their identity.",
      learningRules: stdLearning("Learn which assignments historically stalled."),
      invariants: stdInvariants("a Supervisor")
    })
  },
  {
    id: "agent.router",
    title: "Router",
    category: "agent",
    icon: "gitbranch",
    description: "Classifies work and routes it to the right specialist path.",
    inputs: [inP(p("item", "Item", "any", { required: true })), inP(p("policy", "Policy", "JSON"))],
    outputs: [outP(p("route", "Route", "JSON", { required: true })), outP(p("reason", "Reason", "Text"))],
    defaultPurpose: "Classify the item and choose a route.",
    rolePrompt: rp({
      identity: "You are MJ Router. You classify, you do not solve.",
      mission: "Pick the single best route with a short reason.",
      operatingPrinciples: "Deterministic when policy exists. Conservative default otherwise.",
      procedures: "Read item. Apply policy. Choose route id. Explain in one sentence.",
      toolStrategy: "No tools.",
      verificationStrategy: "Route id must exist in policy.",
      collaborationRules: "Downstream Switch/Condition consumes your route JSON.",
      learningRules: stdLearning("Track misroutes from feedback."),
      invariants: stdInvariants("a Router")
    })
  },
  {
    id: "agent.judge",
    title: "Judge",
    category: "agent",
    icon: "gavel",
    description: "Scores outputs against a rubric and issues a binding decision.",
    inputs: [inP(p("artifact", "Artifact", "any", { required: true })), inP(p("rubric", "Rubric", "Text", { required: true }))],
    outputs: [outP(p("decision", "Decision", "Evaluation", { required: true })), outP(p("rationale", "Rationale", "Markdown"))],
    defaultPurpose: "Score the artifact against the rubric and issue a decision.",
    rolePrompt: rp({
      identity: "You are MJ Judge. Binding, calibrated, explainable.",
      mission: "Apply the rubric literally. Do not add hidden criteria.",
      operatingPrinciples: "Score each criterion. Average only if the rubric says so. Explain dissent.",
      procedures: "Parse rubric. Score each line 0-10. Compute total. Decide PASS/FAIL.",
      toolStrategy: "No tools.",
      verificationStrategy: "Rationale quotes the rubric language used.",
      collaborationRules: "Evolution and QA consume your scores.",
      learningRules: stdLearning("Calibrate against human feedback."),
      invariants: stdInvariants("a Judge")
    })
  },
  {
    id: "agent.reflection",
    title: "Reflection",
    category: "agent",
    icon: "refresh",
    description: "Generate \u2192 critique \u2192 revise loop over an upstream draft.",
    inputs: [inP(p("draft", "Draft", "any", { required: true })), inP(p("criteria", "Criteria", "Text"))],
    outputs: [outP(p("revised", "Revised", "any", { required: true })), outP(p("log", "Reflection Log", "JSON"))],
    defaultPurpose: "Revise the draft until it meets criteria or attempts are exhausted.",
    configSchema: [
      { key: "maxAttempts", label: "Max revisions", type: "number", default: 2 },
      { key: "passThreshold", label: "Pass threshold", type: "number", default: 7 }
    ],
    rolePrompt: rp({
      identity: "You are MJ Reflection, a bounded self-critique loop.",
      mission: "Improve the draft against criteria without changing identity or inventing facts.",
      operatingPrinciples: "Bounded attempts. Keep what works. Fix only failed checks.",
      procedures: "Score draft. If below threshold, revise targeting failed checks. Repeat.",
      toolStrategy: "No side effects.",
      verificationStrategy: "Log every attempt with score and changed spans.",
      collaborationRules: "Never weaken invariants of the upstream agent.",
      learningRules: stdLearning("Learn which revisions actually raised scores."),
      invariants: stdInvariants("a Reflection agent")
    })
  },
  {
    id: "agent.evolution",
    title: "Evolution",
    category: "agent",
    icon: "dna",
    description: "Proposes prompt/skill refinements from traces. Never auto-applies invariants.",
    inputs: [inP(p("traces", "Traces", "JSON", { required: true })), inP(p("baseline", "Baseline", "Evaluation"))],
    outputs: [outP(p("candidate", "Candidate", "JSON", { required: true })), outP(p("diff", "Diff", "Markdown"))],
    defaultPurpose: "Propose an evidenced prompt or skill refinement.",
    evolutionModeDefault: "SUGGEST",
    rolePrompt: rp({
      identity: "You are MJ Evolution. You propose. Humans or gates accept.",
      mission: "Turn traces into a small, evidenced candidate change.",
      operatingPrinciples: "Never touch invariants. Prefer the smallest change that would have prevented a failure.",
      procedures: "Read traces. Isolate failure class. Draft candidate. Produce unified diff. Emit.",
      toolStrategy: "Evolution sidecar if available, else single-shot refine.",
      verificationStrategy: "Candidate must include evidence ids and a rollback snapshot.",
      collaborationRules: "Protected invariants are sacred.",
      learningRules: stdLearning("Track which proposals were accepted."),
      invariants: stdInvariants("an Evolution agent")
    })
  },
  {
    id: "agent.crew",
    title: "Agent Crew",
    category: "agent",
    icon: "crown",
    description: "A working team: one supervisor plus the local CLIs you name (Claude Code, Codex, OpenCode, Cursor, Grok, Cline, Kilo). Not a Zapier router.",
    inputs: [inP(p("goal", "Goal", "Text", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("result", "Crew Result", "AgentResult", { required: true })), outP(p("log", "Crew Log", "JSON"))],
    defaultPurpose: "Coordinate the named coding agents as a team against this goal.",
    configSchema: [
      { key: "harness", label: "Lead harness", type: "select", options: ["claude", "codex", "opencode", "cursor", "grok", "cline", "kilo", "llm"], default: "claude" },
      { key: "crew", label: "Crew (comma ids)", type: "text", default: "claude,codex,opencode" }
    ],
    permissions: { terminalExecute: true, filesystemRead: true, filesystemWrite: true, mcpUse: true },
    rolePrompt: rp({
      identity: "You are MJ Crew Lead. You coordinate real coding-agent CLIs. You do not pretend to be those agents.",
      mission: "Assign work to the crew, merge their outputs, surface conflicts.",
      operatingPrinciples: "Delegate. Never fake a CLI that is not installed. Fail closed.",
      procedures: "1. Restate the goal.\n2. Split work across the crew ids.\n3. Ask each harness to execute.\n4. Merge. Name disagreements.",
      toolStrategy: "Spawn only installed harnesses.",
      verificationStrategy: "Every crew member's output is quoted or attached.",
      collaborationRules: "Specialists keep their identity. You do not rewrite their diffs.",
      learningRules: stdLearning("Track which harness pairs worked."),
      invariants: stdInvariants("a Crew Lead")
    })
  },
  {
    id: "agent.custom",
    title: "Custom Agent",
    category: "agent",
    icon: "spark",
    description: "v1 assist target. One job, one identity. Purpose is not the role prompt.",
    inputs: [inP(p("input", "Input", "any", { required: true })), inP(p("context", "Context", "Object"))],
    outputs: [outP(p("output", "Output", "AgentResult", { required: true })), outP(p("notes", "Notes", "JSON"))],
    defaultPurpose: "Accomplish the assigned job.",
    feedbackLoopDefault: "OFF",
    evolutionModeDefault: "OFF",
    rolePrompt: rp({
      identity: "You are a custom MJ specialist. Identity is set when the node is created.",
      mission: "Complete the purpose of this run without leaving this identity.",
      operatingPrinciples: "Stay in role. Prefer evidence. Mark unknowns. No secrets.",
      procedures: "1. Restate the job as a testable outcome.\n2. Use only granted tools.\n3. Verify against the purpose.\n4. Emit the deliverable.",
      toolStrategy: "Use only granted tools and allowed MCP servers.",
      verificationStrategy: "The deliverable must be usable without you present.",
      collaborationRules: "Peers consume the output port. Do not rewrite the graph.",
      learningRules: stdLearning("Only when Feedback Loop is ON."),
      invariants: stdInvariants("a Custom Agent")
    })
  },
  {
    id: "agent.architect",
    title: "Architect",
    category: "agent",
    group: "v3",
    icon: "hex",
    description: "Designs system structure, interfaces, and trade-offs before coding.",
    inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("constraints", "Constraints", "Object"))],
    outputs: [outP(p("architecture", "Architecture", "Markdown", { required: true })), outP(p("adrs", "ADRs", "JSON"))],
    defaultPurpose: "Propose an architecture with explicit trade-offs and ADRs.",
    rolePrompt: rp({
      identity: "You are MJ Architect.",
      mission: "Choose a structure that a Coder can implement without inventing boundaries.",
      operatingPrinciples: "Yagni. Make trade-offs explicit. Prefer boring technology.",
      procedures: "Restate forces. Sketch 2 options. Pick one. Write ADRs. Define interfaces.",
      toolStrategy: "Read repo when granted.",
      verificationStrategy: "Every component has an owner and an interface.",
      collaborationRules: "Do not write implementation code.",
      learningRules: stdLearning("Learn which ADRs aged well."),
      invariants: stdInvariants("an Architect")
    })
  },
  {
    id: "agent.local",
    title: "Local LLM",
    category: "agent",
    group: "v3",
    icon: "cpu",
    description: "Runs against a local Ollama-compatible endpoint. No cloud keys required.",
    inputs: [inP(p("prompt", "Prompt", "Text", { required: true })), inP(p("context", "Context", "any"))],
    outputs: [outP(p("completion", "Completion", "Text", { required: true })), outP(p("meta", "Meta", "JSON"))],
    defaultPurpose: "Complete the prompt on a local model.",
    configSchema: [
      { key: "endpoint", label: "Endpoint", type: "text", default: "http://127.0.0.1:11434" },
      { key: "model", label: "Model", type: "text", default: "llama3.1" }
    ],
    providers: [{ kind: "ollama", model: "llama3.1" }],
    rolePrompt: rp({
      identity: "You are a local model worker hosted inside MJ.",
      mission: "Follow the prompt exactly. Stay offline.",
      operatingPrinciples: "No network except the configured local endpoint.",
      procedures: "Compose prompt. Call local endpoint. Return text and token meta.",
      toolStrategy: "Local HTTP only.",
      verificationStrategy: "Fail closed if the endpoint is down.",
      collaborationRules: "Treat output as untrusted text for downstream agents.",
      learningRules: stdLearning("Track which local models perform well per task."),
      invariants: stdInvariants("a Local LLM worker")
    })
  },
  // ============================ CONTROL ============================
  {
    id: "control.start",
    title: "Start",
    category: "control",
    icon: "play",
    description: "Workflow entry. Emits the initial payload.",
    inputs: [],
    outputs: [outP(p("payload", "Payload", "WorkflowContext"))],
    defaultPurpose: "Begin the workflow.",
    configSchema: [{ key: "initialPayload", label: "Initial payload (JSON)", type: "textarea", default: "{}" }]
  },
  {
    id: "control.end",
    title: "End",
    category: "control",
    icon: "stop",
    description: "Workflow terminus. Collects the final result.",
    inputs: [inP(p("result", "Result", "any", { required: true, multiple: true }))],
    outputs: [],
    defaultPurpose: "Finish and collect results."
  },
  {
    id: "control.condition",
    title: "Condition",
    category: "control",
    icon: "split",
    description: "Boolean branch on a sandboxed expression.",
    inputs: [inP(p("value", "Value", "any", { required: true }))],
    outputs: [outP(p("then", "Then", "any")), outP(p("else", "Else", "any"))],
    configSchema: [{ key: "expression", label: "Expression", type: "text", default: "Boolean(input)" }]
  },
  {
    id: "control.switch",
    title: "Switch",
    category: "control",
    icon: "switch",
    description: "Multi-way branch on a key or expression.",
    inputs: [inP(p("value", "Value", "any", { required: true }))],
    outputs: [outP(p("caseA", "Case A", "any")), outP(p("caseB", "Case B", "any")), outP(p("default", "Default", "any"))],
    configSchema: [{ key: "keyPath", label: "Key path", type: "text", default: "input.route" }]
  },
  {
    id: "control.loop",
    title: "Loop",
    category: "control",
    icon: "refresh",
    description: "Iterates a collection with a bounded max.",
    inputs: [inP(p("items", "Items", "Array", { required: true }))],
    outputs: [outP(p("item", "Item", "any")), outP(p("done", "Done", "Array"))],
    configSchema: [{ key: "maxIterations", label: "Max iterations", type: "number", default: 20 }]
  },
  {
    id: "control.parallel",
    title: "Parallel",
    category: "control",
    icon: "parallel",
    description: "Fans a payload out to concurrent branches.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("branch", "Branch", "any", { multiple: true }))]
  },
  {
    id: "control.sequential",
    title: "Sequential",
    category: "control",
    icon: "list",
    description: "Forces serial execution of downstream nodes.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "any"))]
  },
  {
    id: "control.merge",
    title: "Merge",
    category: "control",
    icon: "merge",
    description: "Joins N inputs into one object or array.",
    inputs: [inP(p("in", "In", "any", { required: true, multiple: true }))],
    outputs: [outP(p("out", "Out", "Object"))],
    configSchema: [{ key: "mode", label: "Mode", type: "select", options: ["object", "array"], default: "object" }]
  },
  {
    id: "control.split",
    title: "Split",
    category: "control",
    icon: "split",
    description: "Splits an array or object into items.",
    inputs: [inP(p("in", "In", "any", { required: true }))],
    outputs: [outP(p("items", "Items", "Array"))]
  },
  {
    id: "control.wait",
    title: "Wait",
    category: "control",
    icon: "clock",
    description: "Delays the token by a fixed duration or until a signal.",
    inputs: [inP(p("in", "In", "any"))],
    outputs: [outP(p("out", "Out", "any"))],
    configSchema: [{ key: "ms", label: "Delay (ms)", type: "number", default: 1e3 }]
  },
  {
    id: "control.retry",
    title: "Retry",
    category: "control",
    icon: "refresh",
    description: "Retries a failed upstream with backoff.",
    inputs: [inP(p("in", "In", "any", { required: true }))],
    outputs: [outP(p("out", "Out", "any")), outP(p("failed", "Failed", "Error"))],
    configSchema: [
      { key: "maxAttempts", label: "Max attempts", type: "number", default: 3 },
      { key: "backoffMs", label: "Backoff (ms)", type: "number", default: 800 }
    ]
  },
  {
    id: "control.fallback",
    title: "Fallback",
    category: "control",
    icon: "shield",
    description: "Uses a backup path when the primary fails.",
    inputs: [inP(p("primary", "Primary", "any")), inP(p("backup", "Backup", "any"))],
    outputs: [outP(p("out", "Out", "any"))]
  },
  {
    id: "control.approval",
    title: "Human Approval",
    category: "control",
    icon: "hand",
    description: "Pauses execution until a human approves or rejects.",
    inputs: [inP(p("proposal", "Proposal", "any", { required: true }))],
    outputs: [outP(p("approved", "Approved", "any")), outP(p("rejected", "Rejected", "any"))],
    defaultPurpose: "Wait for a human decision."
  },
  // ============================ CAPABILITY ============================
  {
    id: "cap.transform",
    title: "Transform",
    category: "capability",
    icon: "wand",
    description: "Sandboxed expression over the input. No eval, no this, no globals.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "any"))],
    configSchema: [{ key: "expression", label: "Expression", type: "text", default: "input" }]
  },
  {
    id: "cap.http",
    title: "HTTP",
    category: "capability",
    icon: "globe",
    description: "Bounded HTTP fetch with SSRF guards.",
    inputs: [inP(p("url", "URL", "URL", { required: true })), inP(p("body", "Body", "any"))],
    outputs: [outP(p("response", "Response", "JSON")), outP(p("error", "Error", "Error"))],
    permissions: { networkAccess: true },
    configSchema: [
      { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "DELETE"], default: "GET" },
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", default: 15e3 }
    ]
  },
  {
    id: "cap.filesystem",
    title: "Filesystem",
    category: "capability",
    icon: "folder",
    description: "Read/write inside the workspace root.",
    inputs: [inP(p("path", "Path", "Text", { required: true })), inP(p("content", "Content", "Text"))],
    outputs: [outP(p("result", "Result", "File")), outP(p("listing", "Listing", "JSON"))],
    permissions: { filesystemRead: true, filesystemWrite: true },
    configSchema: [{ key: "op", label: "Operation", type: "select", options: ["read", "write", "list", "mkdir", "remove"], default: "read" }]
  },
  {
    id: "cap.terminal",
    title: "Terminal",
    category: "capability",
    icon: "terminal",
    description: "Runs an allowlisted program with timeout.",
    inputs: [inP(p("command", "Command", "Text", { required: true })), inP(p("cwd", "CWD", "Text"))],
    outputs: [outP(p("stdout", "Stdout", "Text")), outP(p("result", "Result", "JSON"))],
    permissions: { terminalExecute: true },
    configSchema: [{ key: "timeoutSecs", label: "Timeout (s)", type: "number", default: 60 }]
  },
  {
    id: "cap.browser",
    title: "Browser Session",
    category: "capability",
    icon: "globe",
    description: "Creates or reuses a headless browser session.",
    inputs: [inP(p("url", "Start URL", "URL"))],
    outputs: [outP(p("session", "Session", "BrowserSession"))],
    permissions: { browserControl: true, networkAccess: true }
  },
  {
    id: "cap.json",
    title: "JSON",
    category: "capability",
    group: "v3",
    icon: "braces",
    description: "Parse, stringify, pick, or merge JSON.",
    inputs: [inP(p("input", "Input", "any", { required: true }))],
    outputs: [outP(p("output", "Output", "JSON"))],
    configSchema: [
      { key: "op", label: "Operation", type: "select", options: ["parse", "stringify", "pick", "merge"], default: "parse" },
      { key: "path", label: "Path", type: "text", default: "" }
    ]
  },
  {
    id: "cap.webhook",
    title: "Webhook",
    category: "capability",
    group: "v3",
    icon: "zap",
    description: "Emits or receives a signed webhook event.",
    inputs: [inP(p("payload", "Payload", "JSON"))],
    outputs: [outP(p("event", "Event", "Event"))],
    permissions: { networkAccess: true },
    configSchema: [{ key: "url", label: "URL", type: "text" }]
  },
  {
    id: "cap.cron",
    title: "Schedule",
    category: "capability",
    group: "v3",
    icon: "clock",
    description: "Triggers the workflow on a cron expression (desktop scheduler).",
    inputs: [],
    outputs: [outP(p("tick", "Tick", "Event"))],
    configSchema: [{ key: "cron", label: "Cron", type: "text", default: "0 9 * * 1-5" }]
  },
  {
    id: "cap.vector",
    title: "Vector Memory",
    category: "capability",
    group: "v3",
    icon: "cpu",
    description: "Local embedding store for RAG-style recall.",
    inputs: [inP(p("query", "Query", "Text", { required: true })), inP(p("doc", "Document", "Text"))],
    outputs: [outP(p("hits", "Hits", "JSON"))],
    configSchema: [{ key: "k", label: "Top K", type: "number", default: 5 }]
  },
  // ============================ PRESETS ============================
  ...preset("copywriter", "Copywriter", "Writes on-brand marketing copy.", "Write persuasive copy that matches the brief."),
  ...preset("seo", "SEO Analyst", "Audits and improves search visibility.", "Audit SEO and propose concrete fixes."),
  ...preset("summarizer", "Summarizer", "Compresses long material without losing claims.", "Summarize faithfully with source mapping."),
  ...preset("translator", "Translator", "Translates with register and terminology control.", "Translate accurately; keep terms consistent."),
  ...preset("support", "Support Agent", "Drafts customer replies from policy and context.", "Draft a policy-faithful support reply."),
  ...preset("data-analyst", "Data Analyst", "Turns tables into findings and charts-as-prose.", "Analyze the data and report findings."),
  ...preset("pm", "Product Manager", "Writes PRDs, scopes, and acceptance criteria.", "Turn the brief into a PRD."),
  ...preset("sre", "SRE", "Incident commander: impact, blast radius, next actions.", "Triage the incident and propose next actions."),
  ...preset("legal", "Legal Reviewer", "Flags contractual and compliance risk. Not legal advice.", "Flag legal/compliance risks. Do not give advice."),
  ...preset("ux", "UX Writer", "Microcopy, empty states, error language.", "Write precise UX copy for the surface."),
  ...preset("recruiter", "Recruiter", "Screens candidates against a rubric.", "Score the candidate against the rubric."),
  ...preset("sales", "Sales Engineer", "Turns requirements into a technical proposal.", "Draft a technical proposal from the requirements."),
  ...ROLE_PACKS.map(packToDef)
];
function packToDef(pack) {
  return {
    id: `agent.pack.${pack.industry}.${pack.slug}`,
    title: pack.title,
    category: "agent",
    group: pack.industry,
    icon: pack.icon,
    description: `${pack.mission} Hermes-class agent. Not a Zapier step.`,
    inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("context", "Context", "any"))],
    outputs: [outP(p("deliverable", "Deliverable", "AgentResult", { required: true })), outP(p("notes", "Notes", "JSON"))],
    defaultPurpose: pack.mission,
    configSchema: [
      { key: "harness", label: "Runtime", type: "select", options: ["hermes", "claude", "codex", "opencode", "cursor", "grok", "cline", "kilo", "llm"], default: "hermes" }
    ],
    permissions: { filesystemRead: true, terminalExecute: true, mcpUse: true, memoryWrite: true, skillWrite: true },
    rolePrompt: rp({
      identity: `You are MJ ${pack.title}, a Hermes-class specialist (${pack.industry}).`,
      mission: pack.mission,
      operatingPrinciples: "Stay in this identity. Prefer evidence. Mark unknowns. Never invent tools. Fail closed. You are an autonomous worker, not an n8n step.",
      procedures: `1. Restate the brief as a testable outcome.
2. Use Hermes tools when granted.
3. Verify against: ${pack.mission}
4. Emit the deliverable. Call finish.`,
      toolStrategy: "Use only granted tools. Coding CLIs (Claude/Codex/OpenCode) if harness is set to them.",
      verificationStrategy: "The deliverable must be usable without you present.",
      collaborationRules: "Peers consume deliverable + notes. Shared team memory if teamMemoryKey is set.",
      learningRules: stdLearning(`Improve ${pack.title} craft from ratings.`),
      invariants: stdInvariants(`a ${pack.title}`)
    })
  };
}
function preset(slug, title, description, purpose) {
  return [
    {
      id: `agent.preset.${slug}`,
      title,
      category: "agent",
      group: "presets",
      icon: "spark",
      description,
      inputs: [inP(p("brief", "Brief", "Text", { required: true })), inP(p("context", "Context", "any"))],
      outputs: [outP(p("deliverable", "Deliverable", "Markdown", { required: true })), outP(p("notes", "Notes", "JSON"))],
      defaultPurpose: purpose,
      rolePrompt: rp({
        identity: `You are MJ ${title}, a specialist agent.`,
        mission: purpose,
        operatingPrinciples: "Stay in role. Prefer evidence. Mark unknowns. No secrets.",
        procedures: `PROCEDURE
1. Parse the brief.
2. Apply ${title.toLowerCase()} craft.
3. Verify against the brief.
4. Emit the deliverable.`,
        toolStrategy: "Use only granted tools.",
        verificationStrategy: "The deliverable must be usable without you present.",
        collaborationRules: "Peers consume Markdown + notes JSON.",
        learningRules: stdLearning(`Improve ${title.toLowerCase()} craft from ratings.`),
        invariants: stdInvariants(`a ${title}`)
      })
    }
  ];
}
var DEFINITIONS_BY_ID = new Map(NODE_DEFINITIONS.map((d) => [d.id, d]));
function cloneRolePrompt(src) {
  return { version: src.version, sections: { ...src.sections } };
}

// src/graph/factory.ts
function createNodeFromDef(def, id, x, y) {
  const node = {
    id,
    definitionId: def.id,
    title: def.title,
    x,
    y,
    purpose: def.defaultPurpose ?? "",
    inputs: def.inputs.map((p2) => ({ ...p2 })),
    outputs: def.outputs.map((p2) => ({ ...p2 })),
    config: Object.fromEntries((def.configSchema ?? []).map((c) => [c.key, c.default ?? ""])),
    rolePrompt: def.rolePrompt ? cloneRolePrompt(def.rolePrompt) : {
      sections: {
        identity: def.title,
        mission: "",
        operatingPrinciples: "",
        procedures: "",
        toolStrategy: "",
        verificationStrategy: "",
        collaborationRules: "",
        learningRules: "",
        invariants: `You are a ${def.title}. You never act outside this identity.`
      },
      version: 1
    },
    feedbackLoop: def.feedbackLoopDefault ?? "OFF",
    evolutionMode: def.evolutionModeDefault ?? "OFF",
    reflection: { enabled: false, maxAttempts: 2, passThreshold: 7 },
    permissions: {
      filesystemRead: false,
      filesystemWrite: false,
      terminalExecute: false,
      networkAccess: false,
      browserControl: false,
      mcpUse: false,
      providerExecute: def.category === "agent",
      workflowModify: false,
      memoryWrite: true,
      skillWrite: true,
      evolutionPropose: true,
      evolutionAccept: false,
      secretResolve: false,
      ...def.permissions ?? {}
    },
    contract: {
      requiredCapabilities: def.requiredPermissions ?? [],
      sideEffects: [],
      successCriteria: "Output satisfies the declared output schema and the stated success criteria.",
      failureCriteria: "Output cannot be produced within timeout or fails validation.",
      timeoutMs: def.contractTimeoutMs ?? 18e4,
      retryPolicy: { maxAttempts: 2, backoffMs: 1500 }
    },
    providers: def.providers ? structuredClone(def.providers) : def.category === "agent" ? [{ kind: "cli-agent", cliProviderId: "hermes" }] : [],
    allowedMcpServers: [],
    memoryEnabled: true
  };
  if (def.category === "agent") {
    node.config.harness = node.config.harness || "claude";
    node.permissions.terminalExecute = true;
    node.permissions.filesystemRead = true;
    node.permissions.mcpUse = true;
    node.permissions.providerExecute = true;
  }
  return node;
}

// src/mission/missionRuntime.ts
init_types();

// src/mission/types.ts
var MISSION_TRANSITIONS = {
  DRAFT: ["PLANNING", "FAILED"],
  PLANNING: ["READY", "BLOCKED", "FAILED"],
  READY: ["RUNNING", "DRAFT", "FAILED"],
  RUNNING: ["PAUSED", "BLOCKED", "REPAIRING", "VERIFYING", "COMPLETED", "FAILED"],
  PAUSED: ["RUNNING", "BLOCKED", "FAILED"],
  BLOCKED: ["REPAIRING", "RUNNING", "PAUSED", "FAILED"],
  REPAIRING: ["RUNNING", "BLOCKED", "VERIFYING", "FAILED"],
  VERIFYING: ["COMPLETED", "REPAIRING", "BLOCKED", "FAILED"],
  COMPLETED: [],
  FAILED: ["DRAFT"]
};
function canTransition(from, to) {
  return MISSION_TRANSITIONS[from].includes(to);
}
var DEFAULT_BUDGET = {
  maxCostUsd: 10,
  maxTokens: 2e6,
  maxWallClockMs: 60 * 60 * 1e3,
  maxConcurrentAgents: 4,
  maxRetriesPerTask: 3,
  maxBrowserSessions: 2,
  maxGraphMutations: 8
};
var DEFAULT_POLICY = {
  autonomy: "SUPERVISED",
  approvalThreshold: "HIGH",
  allowGraphMutation: true,
  allowReorganization: true,
  allowHarnessSwitch: true,
  measureCandidates: true
};
var DEFAULT_BOUNDARY = {
  filesystemRead: true,
  filesystemWrite: true,
  shell: true,
  network: true,
  browser: false,
  mcp: true,
  codingAgents: true,
  credentials: false,
  repositories: [],
  deploymentTargets: [],
  allowedPaths: [],
  deniedPaths: []
};

// src/mission/flightRecorder.ts
init_id();
var listeners = /* @__PURE__ */ new Set();
var FlightRecorder = class {
  events = [];
  nextSeq = 1;
  missionId;
  constructor(missionId, seed = []) {
    this.missionId = missionId;
    this.events = [...seed];
    this.nextSeq = seed.length ? Math.max(...seed.map((e) => e.seq)) + 1 : 1;
  }
  /**
   * §25 Merge persisted history back in on resume. Existing sequence numbers are kept so a
   * restored mission's trace stays contiguous, and events already present are not duplicated.
   */
  seedHistory(events) {
    if (!events.length) return 0;
    const seen = new Set(this.events.map((e) => e.seq));
    let added = 0;
    for (const e of events) {
      if (seen.has(e.seq)) continue;
      this.events.push(e);
      seen.add(e.seq);
      added += 1;
    }
    this.events.sort((a, b) => a.seq - b.seq);
    this.nextSeq = this.events.length ? this.events[this.events.length - 1].seq + 1 : 1;
    return added;
  }
  record(input) {
    if (!input.actor) throw new Error("governance: every event needs an actor");
    if (!input.authority) throw new Error("governance: every event needs an authority");
    if (!input.reason) throw new Error("governance: every event needs a reason");
    const event = {
      seq: this.nextSeq++,
      missionId: input.missionId ?? this.missionId,
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      kind: input.kind,
      actor: input.actor,
      authority: input.authority,
      policy: input.policy || "none-required",
      reason: input.reason,
      evidence: input.evidence ?? [],
      subjectId: input.subjectId ?? null,
      data: input.data ?? {}
    };
    this.events.push(event);
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
      }
    }
    return event;
  }
  all() {
    return [...this.events];
  }
  ofKind(...kinds) {
    const set = new Set(kinds);
    return this.events.filter((e) => set.has(e.kind));
  }
  forSubject(subjectId) {
    return this.events.filter((e) => e.subjectId === subjectId);
  }
  last(kind) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].kind === kind) return this.events[i];
    }
    return null;
  }
  count(kind) {
    return this.events.filter((e) => e.kind === kind).length;
  }
  /**
   * §14 Replay. Returns the recorder state as it was after `uptoSeq` events.
   * Used by the flight-recorder UI to scrub the mission timeline.
   */
  replay(uptoSeq) {
    return this.events.filter((e) => e.seq <= uptoSeq);
  }
  /** Distinct sequence numbers, for the scrubber. */
  seqRange() {
    if (!this.events.length) return { min: 0, max: 0 };
    return { min: this.events[0].seq, max: this.events[this.events.length - 1].seq };
  }
  snapshot() {
    return { events: this.all(), nextSeq: this.nextSeq };
  }
  /**
   * Truncate everything after `uptoSeq` — used when rolling a mission back to a checkpoint
   * so the trace does not claim things that are no longer true. The truncation is itself
   * recorded first, so the rollback is visible.
   */
  truncateAfter(uptoSeq, reason) {
    const removed = this.events.filter((e) => e.seq > uptoSeq).length;
    this.events = this.events.filter((e) => e.seq <= uptoSeq);
    this.nextSeq = uptoSeq + 1;
    if (removed > 0) {
      this.record({
        kind: "MISSION_ROLLED_BACK",
        actor: "flight-recorder",
        authority: "runtime",
        policy: "checkpoint.rollback",
        reason,
        data: { removedEvents: removed, uptoSeq }
      });
    }
    return removed;
  }
  get length() {
    return this.events.length;
  }
};
var recorders = /* @__PURE__ */ new Map();
function recorderFor(missionId, seed) {
  let r = recorders.get(missionId);
  if (!r) {
    r = new FlightRecorder(missionId, seed);
    recorders.set(missionId, r);
  }
  return r;
}

// src/mission/agentsMd.ts
import * as fsSync from "node:fs";
import * as path from "node:path";
function parseAgentsMd(raw, file) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = { heading: null, lines: [] };
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      if (current.heading !== null || current.lines.some((l) => l.trim())) sections.push(current);
      current = { heading: h[2].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading !== null || current.lines.some((l) => l.trim())) sections.push(current);
  const title = sections.find((s) => s.heading !== null)?.heading ?? path.basename(file);
  return { file, title, sections, raw };
}
function collectAgentsContext(root, maxDepth = 3) {
  const docs = [];
  const walk = (dir, depth, rel) => {
    if (depth > maxDepth) return;
    const file = path.join(dir, "AGENTS.md");
    try {
      if (fsSync.statSync(file).isFile()) {
        docs.push(parseAgentsMd(fsSync.readFileSync(file, "utf8"), rel ? `${rel}/AGENTS.md` : "AGENTS.md"));
      }
    } catch {
    }
    if (depth === maxDepth) return;
    let entries;
    try {
      entries = fsSync.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "target") {
        walk(path.join(dir, e.name), depth + 1, rel ? `${rel}/${e.name}` : e.name);
      }
    }
  };
  walk(root, 0, "");
  const composed = docs.map((d) => `### from ${d.file}
${d.raw.trim()}`).join("\n\n");
  return { docs, composed };
}
function agentsMdForMission(m2) {
  const lines = [];
  lines.push(`# ${m2.objective}`);
  lines.push("");
  lines.push("<!-- generated by MJ for mission ");
  lines.push(`${m2.missionId} --`);
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push(`This workspace is being worked on by MJ mission \`${m2.missionId}\`.`);
  lines.push("Follow the instructions in this file. They are the contract for every agent in this mission.");
  lines.push("");
  lines.push("## Done when");
  lines.push("");
  for (const d of m2.doneWhen) lines.push(`- ${d}`);
  lines.push("");
  lines.push("## Boundaries");
  lines.push("");
  for (const b of m2.boundaries) lines.push(`- ${b}`);
  lines.push("");
  lines.push("## Tasks");
  lines.push("");
  for (const t of m2.tasks) {
    const via = t.harness ? ` (via ${t.harness})` : "";
    lines.push(`### ${t.title}${via}`);
    lines.push(`- kind: ${t.kind}`);
    if (t.checks.length > 0) {
      lines.push(`- verify with: ${t.checks.map((c) => `\`${c}\``).join(", ")}`);
    }
    lines.push("");
  }
  lines.push("## Ground rules");
  lines.push("");
  lines.push("- Never invent tools, APIs, or secrets. Mark unknowns as unknown.");
  lines.push("- Run the verification commands before claiming a task is done.");
  lines.push("- Leave the workspace in a state where those commands pass.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("This file is regenerated by MJ on plan changes. Edit freely \u2014 your edits are read by the next seat that starts.");
  lines.push("");
  return lines.join("\n");
}
function writeAgentsMd(root, m2) {
  const file = path.join(root, "AGENTS.md");
  fsSync.mkdirSync(root, { recursive: true });
  fsSync.writeFileSync(file, agentsMdForMission(m2), "utf8");
  return file;
}

// src/mission/artifactStore.ts
init_id();
var ArtifactStore = class {
  artifacts = /* @__PURE__ */ new Map();
  /** lineageRoot -> artifactIds, ordered by version. */
  lineage = /* @__PURE__ */ new Map();
  create(input, recorder) {
    const artifactId = uid("art");
    const parents = input.parentArtifactIds ?? [];
    const root = parents.length ? this.artifacts.get(parents[0])?.lineageRoot ?? artifactId : artifactId;
    const siblings = this.lineage.get(root) ?? [];
    const artifact = {
      artifactId,
      missionId: input.missionId,
      version: siblings.length + 1,
      lineageRoot: root,
      name: input.name,
      content: input.content,
      contentType: input.contentType,
      createdBy: input.createdBy,
      modifiedBy: input.createdBy,
      parentArtifactIds: parents,
      inputs: input.inputs ?? [],
      provenance: input.provenance,
      evaluation: null,
      approvalState: "NONE",
      approvalId: null,
      rollbackTargetVersion: siblings.length ? siblings.length : null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.artifacts.set(artifactId, artifact);
    this.lineage.set(root, [...siblings, artifactId]);
    recorder.record({
      kind: siblings.length ? "ARTIFACT_VERSIONED" : "ARTIFACT_CREATED",
      actor: input.createdBy,
      authority: "runtime",
      policy: "artifact.immutable-versioning",
      reason: siblings.length ? `Version ${artifact.version} of ${input.name}; previous version preserved.` : `Created ${input.name}.`,
      evidence: input.inputs ?? [],
      subjectId: artifactId,
      data: {
        version: artifact.version,
        lineageRoot: root,
        contentType: artifact.contentType,
        bytes: artifact.content.length,
        parents,
        harness: artifact.provenance.harness,
        costUsd: artifact.provenance.costUsd
      }
    });
    return artifact;
  }
  /**
   * Record a new version of an existing artifact. The previous version is untouched.
   */
  revise(parentArtifactId, content, modifiedBy, provenance, recorder, reason) {
    const parent = this.artifacts.get(parentArtifactId);
    if (!parent) throw new Error(`unknown artifact ${parentArtifactId}`);
    if (parent.content === content) {
      return parent;
    }
    const next = this.create(
      {
        missionId: parent.missionId,
        name: parent.name,
        content,
        contentType: parent.contentType,
        createdBy: modifiedBy,
        parentArtifactIds: [parentArtifactId],
        inputs: [parentArtifactId],
        provenance
      },
      recorder
    );
    recorder.record({
      kind: "ARTIFACT_VERSIONED",
      actor: modifiedBy,
      authority: "runtime",
      policy: "artifact.immutable-versioning",
      reason,
      subjectId: next.artifactId,
      data: { previousVersion: parent.version, newVersion: next.version, lineageRoot: parent.lineageRoot }
    });
    return next;
  }
  get(artifactId) {
    return this.artifacts.get(artifactId) ?? null;
  }
  latestOf(lineageRoot) {
    const ids = this.lineage.get(lineageRoot);
    if (!ids || !ids.length) return null;
    return this.artifacts.get(ids[ids.length - 1]) ?? null;
  }
  versionsOf(lineageRoot) {
    return (this.lineage.get(lineageRoot) ?? []).map((id) => this.artifacts.get(id)).filter((a) => Boolean(a));
  }
  forMission(missionId) {
    return [...this.artifacts.values()].filter((a) => a.missionId === missionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  setEvaluation(artifactId, evaluation) {
    const a = this.artifacts.get(artifactId);
    if (a) a.evaluation = evaluation;
  }
  setApprovalState(artifactId, state, approvalId) {
    const a = this.artifacts.get(artifactId);
    if (!a) return;
    a.approvalState = state;
    a.approvalId = approvalId;
  }
  /**
   * §13 Explain lineage. Breadth-first walk backwards through parents, deduplicated,
   * returned oldest-first so the UI can render it top-down.
   */
  explainLineage(artifactId, recorder) {
    const visited = /* @__PURE__ */ new Map();
    const queue = [{ id: artifactId, depth: 0 }];
    const inQueue = /* @__PURE__ */ new Set([artifactId]);
    while (queue.length) {
      const { id, depth } = queue.shift();
      const a = this.artifacts.get(id);
      if (!a || visited.has(id)) continue;
      visited.set(id, {
        artifactId: a.artifactId,
        version: a.version,
        name: a.name,
        contentType: a.contentType,
        createdBy: a.createdBy,
        harness: a.provenance.harness,
        model: a.provenance.model,
        toolsUsed: a.provenance.toolsUsed,
        evaluation: a.evaluation ? a.evaluation.passed ? a.evaluation.fullyMeasured ? "passed (measured)" : `passed with ${a.evaluation.unmeasured.length} unmeasured check(s)` : "failed" : "not evaluated",
        approvalState: a.approvalState,
        costUsd: a.provenance.costUsd,
        latencyMs: a.provenance.latencyMs,
        at: a.createdAt,
        depth,
        parentArtifactIds: a.parentArtifactIds
      });
      for (const p2 of a.parentArtifactIds) {
        if (!inQueue.has(p2)) {
          inQueue.add(p2);
          queue.push({ id: p2, depth: depth + 1 });
        }
      }
    }
    const chain = [...visited.values()].sort((a, b) => a.at.localeCompare(b.at) || a.depth - b.depth);
    const ids = new Set(visited.keys());
    const decisions = recorder ? recorder.all().filter((e) => e.subjectId && ids.has(e.subjectId)) : [];
    const unverified = chain.filter((n2) => n2.evaluation === "not evaluated").map((n2) => n2.name);
    return {
      artifactId,
      chain,
      decisions,
      totalCostUsd: chain.reduce((s, n2) => s + n2.costUsd, 0),
      totalLatencyMs: chain.reduce((s, n2) => s + n2.latencyMs, 0),
      versions: chain.length,
      hasUnverifiedAncestor: unverified.length > 0,
      unverified
    };
  }
  /**
   * §26 Rollback: produce the artifact that a given version should revert to, without
   * destroying anything. Returns the restored artifact as a NEW version so history stays
   * append-only.
   */
  rollback(artifactId, recorder, actor, reason) {
    const a = this.artifacts.get(artifactId);
    if (!a || a.rollbackTargetVersion == null) return null;
    const target = this.versionsOf(a.lineageRoot).find((v) => v.version === a.rollbackTargetVersion);
    if (!target) return null;
    const restored = this.create(
      {
        missionId: a.missionId,
        name: a.name,
        content: target.content,
        contentType: a.contentType,
        createdBy: actor,
        parentArtifactIds: [artifactId],
        inputs: [target.artifactId],
        provenance: {
          ...target.provenance,
          startedAt: (/* @__PURE__ */ new Date()).toISOString(),
          finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
          toolsUsed: ["checkpoint.rollback"]
        }
      },
      recorder
    );
    recorder.record({
      kind: "MISSION_ROLLED_BACK",
      actor,
      authority: "human",
      policy: "artifact.rollback",
      reason,
      subjectId: restored.artifactId,
      data: { fromVersion: a.version, toVersion: target.version, lineageRoot: a.lineageRoot }
    });
    return restored;
  }
  hydrate(artifacts) {
    for (const a of artifacts) {
      this.artifacts.set(a.artifactId, a);
      const list = this.lineage.get(a.lineageRoot) ?? [];
      if (!list.includes(a.artifactId)) this.lineage.set(a.lineageRoot, [...list, a.artifactId]);
    }
    for (const [k, v] of this.lineage) {
      this.lineage.set(
        k,
        v.sort((x, y) => (this.artifacts.get(x)?.version ?? 0) - (this.artifacts.get(y)?.version ?? 0))
      );
    }
  }
  export() {
    return [...this.artifacts.values()];
  }
};

// src/domain/harness.ts
var HARNESSES = [
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
var HARNESS_BY_ID = new Map(HARNESSES.map((h) => [h.id, h]));
var HARNESS_OPTIONS = HARNESSES.map((h) => h.id);
function isCustomHarness(id) {
  return id.startsWith("custom:");
}
var customRegistry = /* @__PURE__ */ new Map();
function getCustomHarness(id) {
  return customRegistry.get(id);
}

// src/mission/agentCapabilities.ts
var AGENT_CAPABILITIES = {
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
var EXECUTABLE_HARNESSES = Object.keys(AGENT_CAPABILITIES).filter(
  (id) => AGENT_CAPABILITIES[id].bins.length > 0
);

// src/mission/agentTeam.ts
var SCHEMA_VERSION = 1;
var seat = (id, role2, harness, over = {}) => ({
  id,
  role: role2,
  harness,
  model: null,
  mayWrite: role2 === "coder" || role2 === "debugger",
  maxRisk: role2 === "coder" || role2 === "debugger" ? "MEDIUM" : "LOW",
  timeoutSecs: 900,
  maxTurns: null,
  instructions: "",
  ...over
});
var PREBUILT_TEAMS = [
  {
    id: "team.balanced",
    name: "Balanced",
    description: "Plan, build, test, review. One vendor writes, a second reviews \u2014 so the review is not the author grading its own work.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "claude", { mayWrite: false, maxRisk: "LOW", instructions: "Break the objective into steps small enough to verify individually." }),
      seat("architect", "architect", "claude", { mayWrite: false, maxRisk: "LOW" }),
      seat("impl", "coder", "claude", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement the change. Touch only what the task requires." }),
      seat("synthesizer", "synthesizer", "grok", { mayWrite: false, maxRisk: "LOW" }),
      seat("test", "tester", "opencode", { mayWrite: false, maxRisk: "LOW", instructions: "Run the repository's own checks and report what failed." }),
      seat("reviewer", "reviewer", "codex", { mayWrite: false, maxRisk: "LOW", instructions: "Review the diff. Say what is wrong, not what is fine." }),
      seat("security", "security", "codex", { mayWrite: false, maxRisk: "LOW", instructions: "Check for security vulnerabilities." })
    ]
  },
  {
    id: "team.adversarial",
    name: "Adversarial",
    description: "Deliberately cross-vendor. Every writer is reviewed by a different vendor, because agreement across vendors is weaker evidence than agreement with itself.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "claude", { mayWrite: false, maxRisk: "LOW" }),
      seat("impl", "coder", "claude", { mayWrite: true, maxRisk: "MEDIUM" }),
      seat("test", "tester", "cline", { mayWrite: false, maxRisk: "LOW", instructions: "Prove the change works or find the case where it does not." }),
      seat("reviewer", "reviewer", "grok", { mayWrite: false, maxRisk: "LOW" }),
      seat("security", "security", "codex", { mayWrite: false, maxRisk: "LOW", instructions: "Look only for injection, secret leakage and unsafe deserialisation." }),
      seat("synthesizer", "synthesizer", "opencode", { mayWrite: false, maxRisk: "LOW", instructions: "Reconcile the verdicts into one decision." })
    ]
  },
  {
    id: "team.powerhouse",
    name: "Cross-Vendor Powerhouse",
    description: "Connects the most popular CLI agents into one unified team: Claude plans, Codex architectures, OpenCode builds, Cursor debugs, Grok tests, Cline reviews, and Hermes synthesizes.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("planner", "planner", "claude", { mayWrite: false, maxRisk: "LOW", instructions: "Formulate the execution plan and criteria." }),
      seat("architect", "architect", "codex", { mayWrite: false, maxRisk: "LOW", instructions: "Design component interfaces and data schemas." }),
      seat("coder", "coder", "opencode", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement core logic and tests in isolated worktree." }),
      seat("debugger", "debugger", "cursor", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Diagnose edge cases and optimize performance." }),
      seat("tester", "tester", "grok", { mayWrite: false, maxRisk: "LOW", instructions: "Run test suites and fuzz edge cases." }),
      seat("reviewer", "reviewer", "cline", { mayWrite: false, maxRisk: "LOW", instructions: "Conduct independent peer review against the snapshot merge." }),
      seat("synthesizer", "synthesizer", "hermes", { mayWrite: false, maxRisk: "LOW", instructions: "Reconcile findings into final release notes." })
    ]
  },
  {
    id: "team.solo",
    name: "Solo",
    description: "One seat. Cheap, fast, and the review is advisory only \u2014 an author grading its own work is not a review.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [seat("impl", "coder", "opencode", { mayWrite: true, maxRisk: "MEDIUM", instructions: "Implement and self-check." })]
  },
  {
    id: "team.audit",
    name: "Read-only audit",
    description: "No seat may write. For answering 'what is wrong with this code?' without risking a change.",
    schemaVersion: SCHEMA_VERSION,
    budgetUsd: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    revision: 1,
    seats: [
      seat("reviewer", "reviewer", "claude", { mayWrite: false, maxRisk: "LOW" }),
      seat("security", "security", "codex", { mayWrite: false, maxRisk: "LOW" })
    ]
  }
];
var TEAM_BY_ID = new Map(PREBUILT_TEAMS.map((t) => [t.id, t]));
var RISK_LEVELS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};
function seatForTask(team, role2, risk) {
  if (risk === "CRITICAL") {
    return { seat: null, reason: "CRITICAL risk tasks are refused for agent execution and escalated to a human. No sandbox makes an irreversible action safe to delegate." };
  }
  const candidates = team.seats.filter((s) => s.role === role2);
  if (candidates.length === 0) return { seat: null, reason: `This team has no ${role2} seat.` };
  const taskLevel = RISK_LEVELS[risk] ?? 2;
  const eligible = candidates.filter((s) => {
    const maxLevel = RISK_LEVELS[s.maxRisk ?? "MEDIUM"] ?? 2;
    return maxLevel >= taskLevel;
  });
  if (eligible.length === 0) {
    return { seat: null, reason: `A ${risk} risk task exceeds every available ${role2}'s maxRisk ceiling \u2014 escalate to a human.` };
  }
  return { seat: eligible[0] ?? null, reason: null };
}
var STEP_KIND_TO_ROLE = {
  research: "planner",
  architecture: "architect",
  implementation: "coder",
  test: "tester",
  security: "security",
  review: "reviewer",
  synthesis: "synthesizer",
  release: "coder",
  approval: null
};
function bindTeamToPlan(team, steps) {
  const bindings = [];
  let bound = 0;
  let unbound = 0;
  const refused = [];
  for (const step of steps) {
    const role2 = STEP_KIND_TO_ROLE[step.kind];
    if (role2 === void 0 || role2 === null) {
      unbound += 1;
      bindings.push({ stepId: step.id, seatId: null, harness: null, reason: role2 === null ? "An approval step belongs to a human, not a seat." : `No role maps to step kind "${step.kind}".` });
      continue;
    }
    const { seat: seat2, reason } = seatForTask(team, role2, step.risk);
    if (seat2) {
      bound += 1;
      bindings.push({ stepId: step.id, seatId: seat2.id, harness: seat2.harness, reason: null });
    } else if (step.risk === "CRITICAL") {
      refused.push(step.id);
      unbound += 1;
      bindings.push({ stepId: step.id, seatId: null, harness: null, reason });
    } else {
      unbound += 1;
      bindings.push({ stepId: step.id, seatId: null, harness: null, reason });
    }
  }
  return { bindings, bound, unbound, refused };
}
function applyTeamToSteps(steps, result) {
  let changed = 0;
  const byId = new Map(result.bindings.map((b) => [b.stepId, b]));
  for (const s of steps) {
    const b = byId.get(s.id);
    if (b?.harness && s.preferredHarness !== b.harness) {
      s.preferredHarness = b.harness;
      changed += 1;
    }
  }
  return changed;
}

// src/mission/approvals.ts
init_id();

// src/mission/riskPolicy.ts
var RISK_RULES = [
  // ---- CRITICAL -------------------------------------------------------------
  { match: /\bdeploy\b.*\b(prod|production)\b|\b(prod|production)\b.*\bdeploy\b/i, risk: "CRITICAL", why: "Production deployment is irreversible for end users." },
  { match: /\bdelete\b.*\b(data|database|volume|bucket|table)\b|\bdrop\s+(table|database)\b|\btruncate\b/i, risk: "CRITICAL", why: "Data destruction." },
  { match: /\b(rotate|revoke|modify|create|delete)\b.*\b(credential|secret|api[- ]?key|token|password)\b/i, risk: "CRITICAL", why: "Credential material." },
  { match: /\b(iam|rbac|role|policy)\b.*\b(grant|attach|modify|delete|create)\b|\bmodify\b.*\b(access policy|identity)\b/i, risk: "CRITICAL", why: "Identity and access policy." },
  { match: /\bgit\s+push\b.*(--force|-f)\b|\bforce[- ]push\b/i, risk: "CRITICAL", why: "Force push rewrites shared history." },
  { match: /\brm\s+-rf\s+\/(?!\w)|\bformat\b.*\bdisk\b|\bmkfs\b/i, risk: "CRITICAL", why: "Destructive filesystem operation." },
  { match: /\b(drop|migrate)\b.*\bproduction\b/i, risk: "CRITICAL", why: "Production schema change." },
  // ---- HIGH -----------------------------------------------------------------
  { match: /\bgit\s+push\b|\bpublish\b.*\b(package|release|npm|crate)\b|\btag\b.*\brelease\b/i, risk: "HIGH", why: "Publishes work outside the workspace." },
  { match: /\b(terraform|pulumi|cloudformation|kubectl|helm)\b.*\b(apply|destroy|delete|scale)\b/i, risk: "HIGH", why: "Infrastructure mutation." },
  { match: /\bmodify\b.*\b(deployment|ci|cd|pipeline)\s*config|\bedit\b.*\.github\/workflows/i, risk: "HIGH", why: "Deployment configuration." },
  { match: /\bnpm\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b/i, risk: "HIGH", why: "Publishes an artifact to a public registry." },
  { match: /\bALTER\s+TABLE\b|\bCREATE\s+INDEX\b.*\bCONCURRENTLY\b/i, risk: "HIGH", why: "Schema migration." },
  // ---- MEDIUM ---------------------------------------------------------------
  { match: /\b(npm|pnpm|yarn)\s+(install|add|remove)\b|\bpip\s+install\b|\bcargo\s+add\b|\bapt(-get)?\s+install\b|\bbrew\s+install\b/i, risk: "MEDIUM", why: "Installs packages, changing the dependency set." },
  { match: /\b(edit|write|modify|patch|refactor|implement|fix)\b.*\b(file|code|source|config)\b|\bapply\s+diff\b/i, risk: "MEDIUM", why: "Edits code or configuration." },
  { match: /\bgit\s+(commit|checkout|branch|merge|rebase|reset)\b/i, risk: "MEDIUM", why: "Mutates repository state." },
  { match: /\b(set|export)\b.*\b(env|environment variable)\b|\bedit\b.*\.(env|toml|ya?ml|ini)\b/i, risk: "MEDIUM", why: "Configuration change." },
  { match: /\bmigration\b|\bscaffold\b|\bgenerate\b.*\b(scaffold|boilerplate)\b/i, risk: "MEDIUM", why: "Bulk file creation." },
  // ---- LOW ------------------------------------------------------------------
  { match: /\b(read|view|cat|inspect|list|show)\b.*\b(file|log|output|diff|state)\b/i, risk: "LOW", why: "Read-only inspection." },
  { match: /\b(run|execute)\b.*\b(test|tests|test suite|lint|typecheck|build)\b/i, risk: "LOW", why: "Local verification with no side effects outside the workspace." },
  { match: /\b(research|search|summarise|summarize|analyse|analyze|explain|review|plan|draft)\b/i, risk: "LOW", why: "Analysis produces no external change." }
];
function classifyRisk(action, toolName) {
  const haystack = [toolName ?? "", action].join(" :: ");
  for (const rule of RISK_RULES) {
    if (rule.match.test(haystack)) {
      return { risk: rule.risk, why: rule.why, matchedRule: String(rule.match) };
    }
  }
  return {
    risk: "MEDIUM",
    why: "Unrecognised action. Unknown actions are treated as MEDIUM, not LOW.",
    matchedRule: null
  };
}
function requiresHuman(risk, approvalThreshold, autonomy) {
  if (autonomy === "HUMAN_ONLY") return true;
  if (risk === "CRITICAL") return true;
  if (autonomy === "AUTONOMOUS") return false;
  const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  return order.indexOf(risk) >= order.indexOf(approvalThreshold);
}

// src/mission/approvals.ts
var ApprovalGateService = class {
  requests = /* @__PURE__ */ new Map();
  waiters = /* @__PURE__ */ new Map();
  list() {
    return [...this.requests.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  pending() {
    return this.list().filter((r) => r.status === "PENDING");
  }
  get(id) {
    return this.requests.get(id) ?? null;
  }
  forMission(missionId) {
    return this.list().filter((r) => r.missionId === missionId);
  }
  pendingForMission(missionId) {
    return this.forMission(missionId).filter((r) => r.status === "PENDING");
  }
  /**
   * Decide the risk class and whether a human is needed. The risk class is derived from the
   * action by `classifyRisk`; an override must justify itself and can only ever be recorded,
   * never applied silently.
   */
  evaluate(input) {
    const derived = classifyRisk(input.action, input.toolName);
    let risk = derived.risk;
    let why = derived.why;
    if (input.riskOverride) {
      const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
      if (order.indexOf(input.riskOverride.risk) > order.indexOf(derived.risk)) {
        risk = input.riskOverride.risk;
        why = `${input.riskOverride.reason} (derived: ${derived.why})`;
      } else {
        why = `${derived.why} (requested downgrade to ${input.riskOverride.risk} refused: overrides may only raise risk)`;
      }
    }
    const autonomy = input.mission.riskPolicy.autonomy;
    const needsHuman = requiresHuman(risk, input.mission.riskPolicy.approvalThreshold, autonomy);
    if (!needsHuman) {
      return { autonomous: true, request: null, risk, why };
    }
    const request = {
      id: uid("apr"),
      missionId: input.mission.missionId,
      requestedBy: input.requestedBy,
      agentId: input.agentId ?? null,
      action: input.action,
      risk,
      summary: input.action,
      justification: why,
      changes: input.changes ?? [],
      evidence: input.evidence ?? [],
      expectedOutcome: input.expectedOutcome ?? "No stated expected outcome.",
      reversible: input.reversible ?? true,
      status: "PENDING",
      decidedBy: null,
      reason: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      decidedAt: null
    };
    this.requests.set(request.id, request);
    return { autonomous: false, request, risk, why };
  }
  /** Open a gate and record it in the flight recorder. */
  open(input, recorder) {
    const decision = this.evaluate(input);
    if (decision.request) {
      recorder.record({
        kind: "APPROVAL_REQUIRED",
        actor: input.requestedBy,
        authority: "policy:risk-gate",
        policy: `autonomy=${input.mission.riskPolicy.autonomy};threshold=${input.mission.riskPolicy.approvalThreshold}`,
        reason: decision.why,
        evidence: decision.request.evidence,
        subjectId: decision.request.id,
        data: {
          risk: decision.risk,
          action: input.action,
          changes: decision.request.changes,
          expectedOutcome: decision.request.expectedOutcome,
          reversible: decision.request.reversible
        }
      });
    }
    return decision;
  }
  decide(id, decision, decidedBy, reason, recorder) {
    const req = this.requests.get(id);
    if (!req) throw new Error(`unknown approval ${id}`);
    if (req.status !== "PENDING") throw new Error(`approval ${id} is already ${req.status}`);
    req.status = decision;
    req.decidedBy = decidedBy;
    req.reason = reason;
    req.decidedAt = (/* @__PURE__ */ new Date()).toISOString();
    const rec = recorder ?? recorderFor(req.missionId);
    rec.record({
      kind: decision === "APPROVED" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
      actor: decidedBy,
      authority: "human",
      policy: "approval.gate",
      reason,
      evidence: req.evidence,
      subjectId: req.id,
      data: { risk: req.risk, action: req.action }
    });
    const waiting = this.waiters.get(id);
    if (waiting) {
      this.waiters.delete(id);
      for (const fn of waiting) fn(decision);
    }
    return req;
  }
  /**
   * Block until a human decides. Returns TIMED_OUT rather than defaulting to approval —
   * silence is never consent.
   */
  waitFor(id, timeoutMs, isCancelled = () => false) {
    const existing = this.requests.get(id);
    if (!existing) return Promise.resolve("TIMED_OUT");
    if (existing.status !== "PENDING") return Promise.resolve(existing.status);
    return new Promise((resolve) => {
      const list = this.waiters.get(id) ?? [];
      list.push(resolve);
      this.waiters.set(id, list);
      const started = Date.now();
      const tick = setInterval(() => {
        const req = this.requests.get(id);
        if (!req || req.status !== "PENDING") {
          clearInterval(tick);
          resolve(req?.status ?? "TIMED_OUT");
          return;
        }
        if (isCancelled()) {
          clearInterval(tick);
          resolve("TIMED_OUT");
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(tick);
          req.status = "TIMED_OUT";
          req.decidedAt = (/* @__PURE__ */ new Date()).toISOString();
          req.reason = `No decision within ${Math.round(timeoutMs / 1e3)}s. Timed out rather than auto-approved.`;
          resolve("TIMED_OUT");
        }
      }, 150);
    });
  }
  /** Restore from persisted state (pause/resume, §25). */
  hydrate(requests) {
    for (const r of requests) this.requests.set(r.id, r);
  }
  export() {
    return this.list();
  }
};

// src/mission/organization.ts
init_id();
var ROLE_REQUIREMENTS = {
  "agent.coder": { filesystemRead: true, filesystemWrite: true, shell: true, codingAgents: true, memoryWrite: true },
  "agent.tester": { filesystemRead: true, shell: true, memoryWrite: true },
  "agent.security": { filesystemRead: true, shell: false, network: true, memoryWrite: true },
  "agent.reviewer": { filesystemRead: true, memoryWrite: true },
  "agent.researcher": { filesystemRead: true, network: true, browser: true, memoryWrite: true },
  "agent.architect": { filesystemRead: true, memoryWrite: true, skillWrite: true },
  "agent.planner": { filesystemRead: true, memoryWrite: true, proposeGraphMutation: true },
  "agent.browser": { network: true, browser: true },
  "agent.debugger": { filesystemRead: true, shell: true },
  "agent.docs": { filesystemRead: true, filesystemWrite: true, memoryWrite: true },
  "agent.supervisor": { filesystemRead: true, memoryWrite: true, proposeGraphMutation: true }
};
var DEFAULT_REQUIREMENTS = { filesystemRead: true, memoryWrite: true };
function grantPermissions(boundary, definitionId, requested) {
  const role2 = ROLE_REQUIREMENTS[definitionId] ?? DEFAULT_REQUIREMENTS;
  const want = { ...role2, ...requested ?? {} };
  const denied = [];
  const map = [
    ["filesystemRead", "filesystemRead"],
    ["filesystemWrite", "filesystemWrite"],
    ["shell", "shell"],
    ["network", "network"],
    ["browser", "browser"],
    ["mcp", "mcp"],
    ["codingAgents", "codingAgents"],
    ["credentials", "credentials"],
    ["memoryWrite", null],
    ["skillWrite", null],
    ["proposeGraphMutation", null]
  ];
  const granted = {};
  for (const [perm, bound] of map) {
    const wanted = Boolean(want[perm]);
    const allowed = bound ? Boolean(boundary[bound]) : true;
    granted[perm] = wanted && allowed;
    if (wanted && !allowed) denied.push(`${perm} (mission boundary denies ${bound})`);
  }
  return { granted, denied };
}
function buildContract(mission, definitionId, purpose, requested, budgetUsd, timeoutMs) {
  const def = DEFINITIONS_BY_ID.get(definitionId);
  const { granted } = grantPermissions(mission.boundary, definitionId, requested);
  const isControl = definitionId.startsWith("control.");
  return {
    identity: def?.rolePrompt?.sections.identity ?? `MJ ${def?.title ?? definitionId}`,
    purpose: purpose || def?.defaultPurpose || "Accomplish the assigned task.",
    capabilities: capabilitiesFor(definitionId),
    inputs: def?.inputs.map((p2) => `${p2.id}:${p2.dataType}`) ?? [],
    outputs: def?.outputs.map((p2) => `${p2.id}:${p2.dataType}`) ?? [],
    permissions: granted,
    budgetUsd: budgetUsd ?? Math.max(0.01, mission.budget.maxCostUsd / 8),
    timeoutMs: timeoutMs ?? def?.contractTimeoutMs ?? 3e5,
    successCriteria: def?.rolePrompt?.sections.verificationStrategy ? [def.rolePrompt.sections.verificationStrategy] : ["The deliverable is usable without the author present."],
    failurePolicy: isControl ? "ESCALATE" : definitionId === "agent.coder" ? "SWITCH_HARNESS" : "RETRY",
    escalationPolicy: mission.riskPolicy.autonomy === "AUTONOMOUS" ? "SUPERVISOR" : "HUMAN"
  };
}
function capabilitiesFor(definitionId) {
  const table = {
    "agent.coder": ["coding", "refactor", "implementation"],
    "agent.tester": ["testing", "verification"],
    "agent.security": ["security-review", "threat-modelling"],
    "agent.reviewer": ["review"],
    "agent.researcher": ["research", "synthesis"],
    "agent.architect": ["architecture", "design"],
    "agent.planner": ["planning", "decomposition"],
    "agent.synthesizer": ["synthesis"],
    "agent.critic": ["critique"],
    "agent.judge": ["adjudication"],
    "agent.docs": ["documentation"],
    "agent.qa": ["quality-assurance"],
    "agent.debugger": ["debugging", "root-cause"],
    "agent.browser": ["browser-automation"],
    "agent.supervisor": ["coordination"],
    "agent.router": ["routing"],
    "agent.reflection": ["reflection"],
    "agent.evolution": ["evolution"],
    "agent.local": ["local-inference"],
    "agent.crew": ["coding", "testing", "review"]
  };
  return table[definitionId] ?? ["general"];
}
function classifyTask(step, dependsOn, risk) {
  if (risk === "CRITICAL" || step?.requiresApproval) return "APPROVAL_GATED";
  if (step?.kind === "implementation") return "EXCLUSIVE";
  if (dependsOn.length) return "DEPENDENCY_BOUND";
  if (step?.kind === "research") return "PARALLEL_SAFE";
  return "SEQUENTIAL";
}
var OrganizationRuntime = class {
  missionId;
  agentMap = /* @__PURE__ */ new Map();
  taskMap = /* @__PURE__ */ new Map();
  taskUpdatedAt = /* @__PURE__ */ new Map();
  recorder;
  boundary;
  mission;
  constructor(mission, recorder) {
    this.mission = mission;
    this.missionId = mission.missionId;
    this.recorder = recorder;
    this.boundary = mission.boundary;
  }
  /* ------------------------------------------------------------------ agents */
  spawn(input) {
    const def = DEFINITIONS_BY_ID.get(input.definitionId);
    if (!def) throw new Error(`cannot spawn: no node definition "${input.definitionId}"`);
    const live = this.agentsInState("ACTIVE", "IDLE").length;
    if (live >= this.mission.budget.maxConcurrentAgents) {
      throw new Error(
        `concurrency limit: ${live} agents live, budget allows ${this.mission.budget.maxConcurrentAgents}. Pause or replace one first.`
      );
    }
    const { granted, denied } = grantPermissions(this.boundary, input.definitionId, input.requested);
    const contract = buildContract(this.mission, input.definitionId, input.purpose ?? "", input.requested, input.budgetUsd, input.timeoutMs);
    contract.permissions = granted;
    const agent = {
      agentId: uid("agt"),
      missionId: this.missionId,
      definitionId: input.definitionId,
      title: input.title ?? def.title,
      contract,
      harness: input.harness ?? null,
      state: "IDLE",
      nodeId: input.nodeId ?? null,
      spawnedAt: (/* @__PURE__ */ new Date()).toISOString(),
      replacedBy: null,
      spawnedBy: input.spawnedBy ?? "planner",
      spawnReason: input.spawnReason,
      taskIds: [],
      stats: { tasksDone: 0, tasksFailed: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, medianMs: 0 }
    };
    this.agentMap.set(agent.agentId, agent);
    this.recorder.record({
      kind: "AGENT_SPAWNED",
      actor: agent.spawnedBy,
      authority: `policy:organization.spawn;autonomy=${this.mission.riskPolicy.autonomy}`,
      policy: this.mission.riskPolicy.allowReorganization ? "organization.dynamic-roster" : "organization.fixed-roster",
      reason: input.spawnReason,
      evidence: denied.map((d) => `denied: ${d}`),
      subjectId: agent.agentId,
      data: {
        definitionId: agent.definitionId,
        title: agent.title,
        harness: agent.harness,
        capabilities: contract.capabilities,
        permissions: Object.entries(granted).filter(([, v]) => v).map(([k]) => k),
        denied,
        budgetUsd: contract.budgetUsd,
        timeoutMs: contract.timeoutMs
      }
    });
    return agent;
  }
  replace(agentId, replacement, reason, evidence, actor) {
    const old = this.agentMap.get(agentId);
    if (!old) throw new Error(`unknown agent ${agentId}`);
    const created = this.spawn({ ...replacement, spawnedBy: "supervisor", spawnReason: reason });
    old.state = "REPLACED";
    old.replacedBy = created.agentId;
    for (const taskId of old.taskIds) {
      const task = this.taskMap.get(taskId);
      if (task && (task.state === "ASSIGNED" || task.state === "RUNNING" || task.state === "BLOCKED")) {
        this.reassign(taskId, created.agentId, `Inherited from replaced ${old.title}`, actor);
      }
    }
    this.recorder.record({
      kind: "AGENT_REPLACED",
      actor,
      authority: "supervisor",
      policy: "organization.replace",
      reason,
      evidence,
      subjectId: created.agentId,
      data: { replacedAgentId: agentId, replacedTitle: old.title, newTitle: created.title }
    });
    return created;
  }
  pause(agentId, reason, actor) {
    const a = this.require(agentId);
    if (a.state === "PAUSED") return;
    a.state = "PAUSED";
    this.recorder.record({
      kind: "AGENT_PAUSED",
      actor,
      authority: "supervisor",
      policy: "organization.pause",
      reason,
      subjectId: agentId
    });
  }
  resume(agentId, reason, actor) {
    const a = this.require(agentId);
    if (a.state !== "PAUSED") return;
    a.state = "IDLE";
    this.recorder.record({
      kind: "AGENT_RESUMED",
      actor,
      authority: "supervisor",
      policy: "organization.resume",
      reason,
      subjectId: agentId
    });
  }
  remove(agentId, reason, actor) {
    const a = this.require(agentId);
    a.state = "REMOVED";
    for (const taskId of a.taskIds) {
      const t = this.taskMap.get(taskId);
      if (t && (t.state === "ASSIGNED" || t.state === "RUNNING")) {
        t.agentId = null;
        t.state = "PENDING";
        this.touch(t.taskId);
      }
    }
    this.recorder.record({
      kind: "AGENT_REPLACED",
      actor,
      authority: "supervisor",
      policy: "organization.remove",
      reason,
      subjectId: agentId,
      data: { removed: true }
    });
  }
  setHarness(agentId, harness, reason, actor, rationale) {
    const a = this.require(agentId);
    const previous = a.harness;
    a.harness = harness;
    this.recorder.record({
      kind: previous ? "HARNESS_SWITCHED" : "HARNESS_SELECTED",
      actor,
      authority: this.mission.riskPolicy.allowHarnessSwitch ? "policy:arbitration" : "human",
      policy: "arbitration.selection",
      reason,
      evidence: rationale,
      subjectId: agentId,
      data: { from: previous, to: harness }
    });
  }
  recordWork(agentId, outcome) {
    const a = this.agentMap.get(agentId);
    if (!a) return;
    const s = a.stats;
    if (outcome.success) s.tasksDone += 1;
    else s.tasksFailed += 1;
    s.tokensIn += outcome.tokensIn;
    s.tokensOut += outcome.tokensOut;
    s.costUsd += outcome.costUsd;
    const total = s.tasksDone + s.tasksFailed;
    s.medianMs = total ? Math.round((s.medianMs * (total - 1) + outcome.latencyMs) / total) : outcome.latencyMs;
  }
  /* ------------------------------------------------------------------ tasks */
  createTask(input) {
    const risk = input.risk ?? classifyRisk(`${input.title} ${input.description}`).risk;
    const task = {
      taskId: uid("task"),
      missionId: this.missionId,
      title: input.title,
      description: input.description,
      agentId: null,
      state: "PENDING",
      cls: input.cls ?? classifyTask(null, input.dependsOn ?? [], risk),
      dependsOn: input.dependsOn ?? [],
      blockedBy: null,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? this.mission.budget.maxRetriesPerTask,
      risk,
      planStepId: input.planStepId ?? null,
      nodeId: input.nodeId ?? null,
      inputArtifactIds: input.inputArtifactIds ?? [],
      outputArtifactIds: [],
      parentTaskId: input.parentTaskId ?? null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      error: null
    };
    this.taskMap.set(task.taskId, task);
    this.touch(task.taskId);
    return task;
  }
  delegate(taskId, agentId, reason, actor) {
    const task = this.requireTask(taskId);
    const agent = this.require(agentId);
    if (agent.state === "PAUSED" || agent.state === "REMOVED" || agent.state === "REPLACED") {
      throw new Error(`cannot delegate to ${agent.title}: state is ${agent.state}`);
    }
    if (!this.dependenciesMet(task)) {
      throw new Error(
        `cannot delegate "${task.title}": unmet dependencies ${task.dependsOn.filter((d) => this.taskMap.get(d)?.state !== "DONE").join(", ")}`
      );
    }
    task.agentId = agentId;
    task.state = "ASSIGNED";
    task.error = null;
    agent.taskIds.push(taskId);
    agent.state = "ACTIVE";
    this.touch(taskId);
    this.recorder.record({
      kind: "TASK_DELEGATED",
      actor,
      authority: "supervisor",
      policy: "organization.delegate",
      reason,
      subjectId: taskId,
      data: { agentId, agentTitle: agent.title, risk: task.risk, cls: task.cls }
    });
    return task;
  }
  reassign(taskId, agentId, reason, actor) {
    const task = this.requireTask(taskId);
    const previous = task.agentId;
    if (previous) {
      const old = this.agentMap.get(previous);
      if (old) old.taskIds = old.taskIds.filter((t) => t !== taskId);
    }
    task.agentId = null;
    task.state = "PENDING";
    this.touch(taskId);
    const delegated = this.delegate(taskId, agentId, reason, actor);
    this.recorder.record({
      kind: "TASK_REASSIGNED",
      actor,
      authority: "supervisor",
      policy: "organization.reassign",
      reason,
      subjectId: taskId,
      data: { from: previous, to: agentId }
    });
    return delegated;
  }
  /** §3 Split a task. Children inherit the parent's dependencies; the parent becomes a join. */
  split(taskId, parts, reason, actor) {
    const parent = this.requireTask(taskId);
    if (parts.length < 2) throw new Error("split needs at least two parts");
    const children = parts.map(
      (p2) => this.createTask({
        title: p2.title,
        description: p2.description,
        planStepId: parent.planStepId,
        dependsOn: [...parent.dependsOn],
        risk: parent.risk,
        maxAttempts: parent.maxAttempts,
        parentTaskId: parent.taskId
      })
    );
    parent.dependsOn = children.map((c) => c.taskId);
    parent.cls = "DEPENDENCY_BOUND";
    parent.title = `${parent.title} (join)`;
    this.touch(parent.taskId);
    this.recorder.record({
      kind: "TASK_SPLIT",
      actor,
      authority: this.mission.riskPolicy.allowReorganization ? "supervisor" : "human",
      policy: "organization.split",
      reason,
      subjectId: taskId,
      data: { children: children.map((c) => c.taskId), parts: parts.map((p2) => p2.title) }
    });
    return children;
  }
  /** Merge sibling tasks back into one. */
  merge(taskIds, title, reason, actor) {
    const tasks = taskIds.map((id) => this.requireTask(id));
    if (tasks.length < 2) throw new Error("merge needs at least two tasks");
    const deps = [...new Set(tasks.flatMap((t) => t.dependsOn))].filter((d) => !taskIds.includes(d));
    const merged = this.createTask({
      title,
      description: tasks.map((t) => `- ${t.title}: ${t.description}`).join("\n"),
      dependsOn: deps,
      risk: tasks.reduce((max, t) => rank(t.risk) > rank(max) ? t.risk : max, "LOW")
    });
    for (const t of tasks) {
      t.state = "CANCELLED";
      this.touch(t.taskId);
    }
    this.recorder.record({
      kind: "TASK_MERGED",
      actor,
      authority: this.mission.riskPolicy.allowReorganization ? "supervisor" : "human",
      policy: "organization.merge",
      reason,
      subjectId: merged.taskId,
      data: { mergedFrom: taskIds }
    });
    return merged;
  }
  setState(taskId, state, detail) {
    const task = this.requireTask(taskId);
    const previous = task.state;
    task.state = state;
    if (detail?.error !== void 0) task.error = detail.error;
    if (state === "FAILED") task.attempts += 1;
    this.touch(taskId);
    if (state === "DONE") {
      const agent = task.agentId ? this.agentMap.get(task.agentId) : null;
      if (agent) {
        agent.taskIds = agent.taskIds.filter((t) => t !== taskId);
        if (!agent.taskIds.some((t) => ["ASSIGNED", "RUNNING"].includes(this.taskMap.get(t)?.state ?? ""))) agent.state = "IDLE";
      }
      this.recorder.record({
        kind: "TASK_COMPLETED",
        actor: detail?.actor ?? task.agentId ?? "runtime",
        authority: "runtime",
        policy: "task.complete",
        reason: detail?.reason ?? `Task finished after ${task.attempts + 1} attempt(s).`,
        subjectId: taskId,
        data: { previous, outputs: task.outputArtifactIds }
      });
    }
    return task;
  }
  addOutput(taskId, artifactId) {
    const task = this.requireTask(taskId);
    if (!task.outputArtifactIds.includes(artifactId)) task.outputArtifactIds.push(artifactId);
  }
  /* ------------------------------------------------------------------ queries */
  agents() {
    return [...this.agentMap.values()];
  }
  agentsInState(...states) {
    const set = new Set(states);
    return this.agents().filter((a) => set.has(a.state));
  }
  agent(id) {
    return this.agentMap.get(id) ?? null;
  }
  byDefinition(definitionId) {
    return this.agents().find((a) => a.definitionId === definitionId && a.state !== "REPLACED" && a.state !== "REMOVED") ?? null;
  }
  tasks_() {
    return [...this.taskMap.values()];
  }
  task(id) {
    return this.taskMap.get(id) ?? null;
  }
  tasksInState(...states) {
    const set = new Set(states);
    return this.tasks_().filter((t) => set.has(t.state));
  }
  /** §24 Tasks whose dependencies are all DONE and which are not approval-gated. */
  readyTasks() {
    return this.tasksInState("PENDING").filter((t) => this.dependenciesMet(t) && t.cls !== "APPROVAL_GATED");
  }
  /**
   * §24/§11 Tasks the runtime may dispatch right now: dependencies met, still PENDING.
   * Unlike `readyTasks()` this *includes* approval-gated tasks — the gate is the runtime's
   * job to run, and excluding them here made gated tasks permanently undispatchable.
   */
  dispatchableWave() {
    return this.tasksInState("PENDING").filter((t) => this.dependenciesMet(t));
  }
  /** §24 Group ready tasks into parallel waves, respecting EXCLUSIVE tasks. */
  nextWave() {
    const ready = this.dispatchableWave();
    if (!ready.length) return [];
    const exclusive = ready.filter((t) => t.cls === "EXCLUSIVE");
    if (exclusive.length) return [exclusive[0]];
    const liveAgents = this.agentsInState("ACTIVE", "IDLE").length || 1;
    return ready.slice(0, Math.max(1, this.mission.budget.maxConcurrentAgents - Math.max(0, liveAgents - this.agentsInState("IDLE").length)));
  }
  dependenciesMet(task) {
    return task.dependsOn.every((d) => this.taskMap.get(d)?.state === "DONE" || this.taskMap.get(d)?.state === "CANCELLED");
  }
  /** Wall-clock ms since each task last changed state — feeds the stall/timeout detectors. */
  taskAges(now = Date.now()) {
    const out = {};
    for (const [id, at] of this.taskUpdatedAt) out[id] = now - at;
    return out;
  }
  isDone() {
    const tasks = this.tasks_();
    if (!tasks.length) return false;
    return tasks.every((t) => t.state === "DONE" || t.state === "CANCELLED");
  }
  hasUnrecoverable() {
    return this.tasks_().some((t) => t.state === "FAILED" && t.attempts >= t.maxAttempts);
  }
  /* ------------------------------------------------------------------ persistence (§25) */
  exportState() {
    return {
      agents: this.agents(),
      tasks: this.tasks_(),
      taskUpdatedAt: Object.fromEntries(this.taskUpdatedAt)
    };
  }
  hydrate(state) {
    for (const a of state.agents) this.agentMap.set(a.agentId, a);
    for (const t of state.tasks) this.taskMap.set(t.taskId, t);
    if (state.taskUpdatedAt) for (const [k, v] of Object.entries(state.taskUpdatedAt)) this.taskUpdatedAt.set(k, v);
  }
  updateBoundary(boundary, reason, actor) {
    const previous = this.boundary;
    this.boundary = boundary;
    this.mission = { ...this.mission, boundary };
    const notes = [];
    for (const a of this.agents()) {
      const { granted, denied } = grantPermissions(boundary, a.definitionId);
      const lost = Object.keys(a.contract.permissions).filter(
        (k) => a.contract.permissions[k] && !granted[k]
      );
      a.contract.permissions = granted;
      if (lost.length) notes.push(`${a.title} lost ${lost.join(", ")}`);
      if (denied.length) notes.push(`${a.title} denied ${denied.join(", ")}`);
    }
    this.recorder.record({
      kind: "POLICY_DENIED",
      actor,
      authority: "human",
      policy: "security.boundary-update",
      reason,
      evidence: notes,
      data: { previous, next: boundary }
    });
    return notes;
  }
  /* ------------------------------------------------------------------ internals */
  touch(taskId) {
    this.taskUpdatedAt.set(taskId, Date.now());
    const t = this.taskMap.get(taskId);
    if (t) t.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  require(agentId) {
    const a = this.agentMap.get(agentId);
    if (!a) throw new Error(`unknown agent ${agentId}`);
    return a;
  }
  requireTask(taskId) {
    const t = this.taskMap.get(taskId);
    if (!t) throw new Error(`unknown task ${taskId}`);
    return t;
  }
};
function rank(r) {
  return ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(r);
}
function tasksFromPlan(org, steps) {
  const byStep = /* @__PURE__ */ new Map();
  const created = /* @__PURE__ */ new Set();
  let pending = [...steps];
  let guard = 0;
  while (pending.length && guard++ < 50) {
    const batch = pending.filter((s) => s.dependsOn.every((d) => created.has(d)));
    if (!batch.length) {
      for (const s of pending) {
        byStep.set(s.id, org.createTask(taskInputFor(s, s.dependsOn)));
        created.add(s.id);
      }
      break;
    }
    for (const s of batch) {
      const deps = s.dependsOn.map((d) => byStep.get(d)?.taskId).filter((x) => Boolean(x));
      byStep.set(s.id, org.createTask(taskInputFor(s, deps)));
      created.add(s.id);
    }
    pending = pending.filter((s) => !created.has(s.id));
  }
  return byStep;
}
function taskInputFor(step, deps) {
  return {
    title: step.title,
    description: step.purpose,
    planStepId: step.id,
    dependsOn: deps,
    cls: classifyTask(step, deps, step.risk),
    risk: step.risk
  };
}

// src/mission/supervisor.ts
init_id();
var OrganizationSupervisor = class {
  constructor(mission, org, recorder) {
    this.mission = mission;
    this.org = org;
    this.recorder = recorder;
  }
  id = "supervisor";
  recommendations = [];
  handled = /* @__PURE__ */ new Set();
  /** `kind::subjectId` of every recommendation already raised, so one condition cannot be
   *  re-diagnosed into a fresh recommendation on every supervision cycle. */
  openRecs = /* @__PURE__ */ new Set();
  /** Shapes already raised AND executed. Never cleared: a condition that keeps recurring after
   *  an executed recommendation gets an escalation, not an infinite stream of identical advice. */
  executedShapes = /* @__PURE__ */ new Set();
  observe(signals) {
    const agents = this.org.agents();
    const tasks = this.org.tasks_();
    const ages = this.org.taskAges();
    const live = tasks.filter((t) => t.state === "RUNNING" || t.state === "ASSIGNED" || t.state === "PENDING");
    const done = tasks.filter((t) => t.state === "DONE" || t.state === "CANCELLED").length;
    return {
      missionId: this.mission.missionId,
      at: (/* @__PURE__ */ new Date()).toISOString(),
      agentsLive: agents.filter((a) => a.state === "ACTIVE" || a.state === "IDLE").length,
      agentsIdle: agents.filter((a) => a.state === "IDLE").length,
      agentsFailed: agents.filter((a) => a.state === "FAILED").length,
      tasksTotal: tasks.length,
      tasksDone: done,
      tasksRunning: tasks.filter((t) => t.state === "RUNNING").length,
      tasksFailed: tasks.filter((t) => t.state === "FAILED").length,
      tasksBlocked: tasks.filter((t) => t.state === "BLOCKED").length,
      oldestLiveTaskMs: live.length ? Math.max(...live.map((t) => ages[t.taskId] ?? 0)) : 0,
      signals,
      progress: tasks.length ? done / tasks.length : 0
    };
  }
  /**
   * Turn failure signals into recommendations. One recommendation per signal, deduplicated
   * by signal id so repeated observation cycles do not spam the same advice.
   */
  recommend(signals) {
    const out = [];
    for (const sig of signals) {
      if (this.handled.has(sig.id)) continue;
      const rec = this.recommendFor(sig);
      if (!rec) continue;
      const fp = `${rec.kind}::${rec.subjectId ?? "mission"}`;
      if (this.openRecs.has(fp) || this.executedShapes.has(fp)) {
        this.handled.add(sig.id);
        this.recorder.record({
          kind: "POLICY_DENIED",
          actor: this.id,
          authority: "supervisor",
          policy: "supervisor.one-recommendation-per-condition",
          reason: `${sig.kind} on "${sig.subject}" is already covered by an open ${rec.kind} recommendation. Not raising a second one.`,
          evidence: sig.evidence,
          subjectId: sig.subject,
          data: { failureKind: sig.kind, recommendation: rec.kind }
        });
        continue;
      }
      this.openRecs.add(fp);
      this.handled.add(sig.id);
      this.recommendations.push(rec);
      out.push(rec);
      this.recorder.record({
        kind: "FAILURE_DETECTED",
        actor: this.id,
        authority: "supervisor",
        policy: `autonomy=${this.mission.riskPolicy.autonomy}`,
        reason: sig.detail,
        evidence: sig.evidence,
        subjectId: sig.subject,
        data: { failureKind: sig.kind, severity: sig.severity, recommendation: rec.kind, autoExecutable: rec.autoExecutable }
      });
    }
    return out;
  }
  recommendFor(sig) {
    const base = {
      id: uid("rec"),
      missionId: this.mission.missionId,
      subjectId: sig.subject,
      evidence: sig.evidence,
      executed: false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const allowReorg = this.mission.riskPolicy.allowReorganization;
    switch (sig.kind) {
      case "REPEATED_FAILURE":
        return {
          ...base,
          kind: "SWITCH_HARNESS",
          reason: `Repeated failure on this task; a different runtime is the cheapest next variable to change.`,
          autoExecutable: this.mission.riskPolicy.allowHarnessSwitch
        };
      case "TOOL_FAILURE_LOOP":
        return {
          ...base,
          kind: "SPAWN_SPECIALIST",
          reason: `Repair attempts of the same shape keep failing; the task needs a different kind of agent, not another retry.`,
          autoExecutable: allowReorg
        };
      case "TIMEOUT_LOOP":
      case "STALL":
        return {
          ...base,
          kind: "PAUSE_MISSION",
          reason: `Nothing is progressing. Pausing preserves state and prevents spending budget on a stuck organization.`,
          autoExecutable: true
        };
      case "DEPENDENCY_DEADLOCK":
        return {
          ...base,
          kind: "REORGANIZE",
          reason: `The dependency structure cannot be satisfied. This is a plan defect, not an agent defect.`,
          autoExecutable: false
          // a human must agree to restructure around a deadlock
        };
      case "BUDGET_EXHAUSTION":
        return {
          ...base,
          kind: "ESCALATE_HUMAN",
          reason: `A budget ceiling was reached. Only a human may raise it.`,
          autoExecutable: false
        };
      case "PERMISSION_DENIAL":
        return {
          ...base,
          kind: "ESCALATE_HUMAN",
          reason: `A permission boundary blocked the work. Widening a boundary is a human decision (\xA733).`,
          autoExecutable: false
        };
      case "MISSING_CAPABILITY":
        return {
          ...base,
          kind: "SPAWN_SPECIALIST",
          reason: `No roster member has the required capability.`,
          autoExecutable: allowReorg
        };
      case "DUPLICATE_WORK":
        return {
          ...base,
          kind: "REORGANIZE",
          reason: `Two live tasks are doing the same work.`,
          autoExecutable: allowReorg
        };
      case "CONTRADICTORY_OUTPUT":
        return {
          ...base,
          kind: "ESCALATE_HUMAN",
          reason: `Agents produced contradictory verdicts on the same artifact. A supervisor should not pick a side without evidence.`,
          autoExecutable: false
        };
      case "REGRESSION":
        return {
          ...base,
          kind: "ROLLBACK_CHECKPOINT",
          reason: `A later version is worse than an earlier one. Roll back to the last known good.`,
          autoExecutable: true
        };
      case "AGENT_STARVATION":
        return {
          ...base,
          kind: "RETRY",
          reason: `Idle agents with unblocked work: re-run the scheduling pass.`,
          autoExecutable: true
        };
      case "INVALID_ARTIFACT_STATE":
        return {
          ...base,
          kind: "ESCALATE_HUMAN",
          reason: `An artifact is in a state the pipeline should not produce (unevaluated, or approved despite failing).`,
          autoExecutable: false
        };
      default:
        return null;
    }
  }
  /**
   * Close a recommendation out. Returns false — and records nothing — when the recommendation
   * does not exist or was already executed, because a completion entry for a repair that never
   * ran is exactly the kind of fake success this system exists to prevent.
   */
  markExecuted(recommendationId, detail) {
    const rec = this.recommendations.find((r) => r.id === recommendationId);
    if (!rec || rec.executed) return false;
    rec.executed = true;
    const fp = `${rec.kind}::${rec.subjectId ?? "mission"}`;
    this.openRecs.delete(fp);
    this.executedShapes.add(fp);
    this.recorder.record({
      kind: "RECOMMENDATION_EXECUTED",
      actor: this.id,
      authority: "supervisor",
      policy: `supervisor.execute:${rec.kind}`,
      reason: `${rec.kind} executed: ${detail}`,
      evidence: rec.evidence,
      subjectId: rec.subjectId ?? rec.id,
      data: { recommendationId, kind: rec.kind }
    });
    return true;
  }
  list() {
    return [...this.recommendations];
  }
  pending() {
    return this.recommendations.filter((r) => !r.executed);
  }
  /**
   * §17 Decide whether repeated failure means the organization itself is wrong.
   * Returns a proposed roster change; `graphMutator` applies it under policy.
   */
  diagnoseOrganization(signals, plan) {
    const implFailures = signals.filter(
      (s) => s.kind === "REPEATED_FAILURE" || s.kind === "TOOL_FAILURE_LOOP" || s.kind === "MISSING_CAPABILITY"
    );
    const structural = signals.filter((s) => s.kind === "DEPENDENCY_DEADLOCK" || s.kind === "CONTRADICTORY_OUTPUT");
    if (structural.length) {
      return {
        reorganize: true,
        reason: `Structural failure (${structural.map((s) => s.kind).join(", ")}): the plan shape cannot deliver this objective.`,
        addSteps: [],
        evidence: structural.flatMap((s) => s.evidence)
      };
    }
    if (implFailures.length >= 1) {
      const hasArchitect = plan?.steps.some((s) => s.kind === "architecture") ?? false;
      const hasTest = plan?.steps.some((s) => s.kind === "test") ?? false;
      const hasReviewer = this.org.agents().some((a) => ["agent.reviewer", "agent.judge", "agent.critic", "agent.qa"].includes(a.definitionId) && a.state !== "REMOVED" && a.state !== "REPLACED");
      const add = [];
      if (!hasArchitect) add.push("architecture");
      if (!hasTest) add.push("test");
      if (!hasReviewer) add.push("review");
      return {
        reorganize: true,
        reason: `${implFailures.length} implementation-side failure(s). The organization is missing ${add.join(", ") || "nothing identifiable"}${hasReviewer ? "" : " \u2014 no roster member can review work independently"}.`,
        addSteps: add,
        evidence: implFailures.flatMap((s) => [`${s.kind}: ${s.detail}`, ...s.evidence])
      };
    }
    return { reorganize: false, reason: "Failure rate does not yet indicate an organizational defect.", addSteps: [], evidence: [] };
  }
  /** Which agent to replace, and with what, given a failure. */
  proposeReplacement(sig) {
    const task = this.org.task(sig.subject);
    if (!task?.agentId) return null;
    const agent = this.org.agent(task.agentId);
    if (!agent) return null;
    const upgrade = {
      "agent.coder": "agent.architect",
      "agent.tester": "agent.qa",
      "agent.reviewer": "agent.judge",
      "agent.researcher": "agent.synthesizer"
    };
    const next = upgrade[agent.definitionId];
    if (!next) {
      return {
        agentId: agent.agentId,
        definitionId: agent.definitionId,
        reason: `Re-run ${agent.title} with enriched context; no stronger role exists for this job.`
      };
    }
    return {
      agentId: agent.agentId,
      definitionId: next,
      reason: `${agent.title} failed ${task.attempts}\xD7; escalating the role to ${next}.`
    };
  }
  /**
   * §16 Choose the next repair strategy for a task, given what has already been tried.
   * The order is deliberate and cheap-first: retry, then change the input, then change the
   * runtime, then change the organization, then a human.
   */
  nextRepairStrategy(task, tried, agent) {
    const ladder = [
      {
        strategy: "RETRY",
        when: !tried.includes("RETRY") && task.attempts < task.maxAttempts,
        rationale: `Cheapest option and this is attempt ${task.attempts + 1} of ${task.maxAttempts}. Transient failure is the most common cause.`
      },
      {
        strategy: "ENRICH_CONTEXT",
        when: !tried.includes("ENRICH_CONTEXT"),
        rationale: "Same agent, better input: attach the failure output and the acceptance criteria it missed."
      },
      {
        strategy: "SWITCH_HARNESS",
        when: !tried.includes("SWITCH_HARNESS") && this.mission.riskPolicy.allowHarnessSwitch && Boolean(agent?.harness),
        rationale: `The task shape is fine but ${agent?.harness} could not deliver it. Change the runtime, not the plan.`
      },
      {
        strategy: "SPLIT_TASK",
        when: !tried.includes("SPLIT_TASK") && task.description.length > 200,
        rationale: "The task is large enough that a smaller unit of work is more likely to succeed and easier to diagnose."
      },
      {
        strategy: "SPAWN_SPECIALIST",
        when: !tried.includes("SPAWN_SPECIALIST") && this.mission.riskPolicy.allowReorganization,
        rationale: "Three cheaper strategies failed. The role itself is probably wrong for this job."
      },
      {
        strategy: "REDUCE_SCOPE",
        when: !tried.includes("REDUCE_SCOPE"),
        rationale: "Deliver a smaller verified increment rather than nothing."
      },
      {
        strategy: "ROLLBACK_CHECKPOINT",
        when: !tried.includes("ROLLBACK_CHECKPOINT"),
        rationale: "Restore the last known-good state before continuing."
      },
      {
        strategy: "ESCALATE_HUMAN",
        when: true,
        rationale: "Every automated strategy has been tried. A human decides next."
      }
    ];
    for (const rung of ladder) {
      if (rung.when) return { strategy: rung.strategy, rationale: rung.rationale };
    }
    return null;
  }
  /** Progress summary for the mission header. */
  summarise() {
    const tasks = this.org.tasks_();
    const done = tasks.filter((t) => t.state === "DONE").length;
    const failed = tasks.filter((t) => t.state === "FAILED").length;
    return `${done}/${tasks.length} tasks done, ${failed} failed, ${this.org.agents().filter((a) => a.state === "ACTIVE").length} agents active`;
  }
  exportState() {
    return this.list();
  }
  hydrate(recs, handledSignals = []) {
    this.recommendations = [...recs];
    for (const h of handledSignals) this.handled.add(h);
  }
};

// src/mission/harnessPolicy.ts
function registryArgv(id, kind) {
  const caps = AGENT_CAPABILITIES[id];
  const base = caps?.prompt?.argv?.length ? [...caps.prompt.argv] : ["$PROMPT"];
  const extra = kind === "readOnly" ? caps?.readOnly?.argv : caps?.write?.argv;
  return extra && extra.length > 0 ? [...base, ...extra] : base;
}
var ENFORCED_SANDBOX = {
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
var READ_ONLY = {
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
var WRITE = {
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
var REVIEW_KINDS = /* @__PURE__ */ new Set(["review", "security", "architecture", "synthesis"]);
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
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
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

// src/mission/acp.ts
init_version();
var NodeAcpTransport = class {
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
var PROTOCOL_VERSION = 1;
var AcpClient = class {
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
    for (const [, p2] of this.pending) {
      clearTimeout(p2.timer);
      p2.reject(new Error("acp: client shut down"));
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
      const p2 = this.pending.get(msg.id);
      if (!p2) return;
      this.pending.delete(msg.id);
      clearTimeout(p2.timer);
      if (msg.error !== void 0) {
        const err = msg.error;
        p2.reject(new Error(`acp: ${err.message ?? "protocol error"}`));
      } else {
        p2.resolve(msg.result);
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
function acpInvocation() {
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const program = env.MJ_ACP_BIN ?? "claude-code-acp";
  const args = (env.MJ_ACP_ARGS ?? "--stdio").split(" ").filter(Boolean);
  return { program, args };
}
var AcpHarness = class _AcpHarness {
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
      const denied = perms.filter((p2) => p2.decided === "deny").length;
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
async function defaultMissionDeny(task) {
  return !(task.mayRunShell || task.mayWriteFiles);
}

// src/mission/harnessAdapters.ts
var CliHarness = class {
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
var LocalTestHarness = class {
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
var PROFILES = [
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
var localTestHarness = new LocalTestHarness();
var CustomCliHarness = class {
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
var registry = /* @__PURE__ */ new Map();
for (const p2 of PROFILES) {
  const h = new CliHarness(p2.id, p2.name, p2.installHint, p2.languages, p2.strengths, p2.canEditFiles, p2.canRunTests, p2.capabilities);
  registry.set(h.id, h);
}
registry.set("local-test", localTestHarness);
registry.set("acp", new AcpHarness());
var customAdapters = /* @__PURE__ */ new Map();
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

// src/mission/arbitration.ts
init_id();
var ARBITRATION_WEIGHTS = {
  capabilityMatch: 0.3,
  languageMatch: 0.15,
  historicalSuccess: 0.25,
  latency: 0.1,
  cost: 0.05,
  permissionFit: 0.1,
  recency: 0.05
};
var EVIDENCE_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1e3;
var HarnessLedger = class {
  records = [];
  record(rec) {
    const full = { ...rec, id: uid("hr"), at: rec.at ?? (/* @__PURE__ */ new Date()).toISOString() };
    this.records.push(full);
    return full;
  }
  all() {
    return [...this.records];
  }
  forHarness(harness) {
    return this.records.filter((r) => r.harness === harness);
  }
  /**
   * §7 Aggregate performance. `verifiedSuccessRate` counts only runs whose outcome an
   * independent check confirmed — an agent saying "done" is not a success.
   */
  stats(harness, scope) {
    let recs = this.forHarness(harness);
    if (scope?.repository) recs = recs.filter((r) => r.repository === scope.repository);
    if (scope?.taskKind) recs = recs.filter((r) => r.taskKind === scope.taskKind);
    if (scope?.language) recs = recs.filter((r) => r.languages.includes(scope.language));
    const kindAcc = /* @__PURE__ */ new Map();
    const langAcc = /* @__PURE__ */ new Map();
    for (const r of recs) {
      const k = kindAcc.get(r.taskKind) ?? { runs: 0, success: 0, ms: [] };
      k.runs += 1;
      if (r.success) k.success += 1;
      k.ms.push(r.latencyMs);
      kindAcc.set(r.taskKind, k);
      for (const lang of r.languages) {
        const l = langAcc.get(lang) ?? { runs: 0, success: 0 };
        l.runs += 1;
        if (r.success) l.success += 1;
        langAcc.set(lang, l);
      }
    }
    const latencies = recs.map((r) => r.latencyMs).sort((a, b) => a - b);
    return {
      harness,
      runs: recs.length,
      successRate: recs.length ? recs.filter((r) => r.success).length / recs.length : 0,
      verifiedSuccessRate: recs.length ? recs.filter((r) => r.independentlyVerified).length / recs.length : 0,
      medianLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0,
      totalCostUsd: recs.reduce((s, r) => s + r.costUsd, 0),
      byTaskKind: Object.fromEntries(
        [...kindAcc.entries()].map(([k, v]) => [
          k,
          { runs: v.runs, successRate: v.runs ? v.success / v.runs : 0, medianLatencyMs: median(v.ms) }
        ])
      ),
      byLanguage: Object.fromEntries(
        [...langAcc.entries()].map(([k, v]) => [k, { runs: v.runs, successRate: v.runs ? v.success / v.runs : 0 }])
      )
    };
  }
  /** Recency-weighted success rate. Old evidence fades instead of ossifying. */
  decayedSuccessRate(harness, now = Date.now()) {
    const recs = this.forHarness(harness);
    if (!recs.length) return { rate: 0, effectiveRuns: 0 };
    let weightedSuccess = 0;
    let weight = 0;
    for (const r of recs) {
      const age = Math.max(0, now - new Date(r.at).getTime());
      const w = Math.pow(0.5, age / EVIDENCE_HALF_LIFE_MS);
      weight += w;
      if (r.independentlyVerified) weightedSuccess += w;
      else if (r.success) weightedSuccess += w * 0.6;
    }
    return { rate: weight ? weightedSuccess / weight : 0, effectiveRuns: weight };
  }
  hydrate(records) {
    this.records = [...records];
  }
  export() {
    return this.all();
  }
};
function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function selectHarness(ctx, ledger) {
  const candidates = allHarnesses().filter((h) => {
    if (h.simulated) return ctx.allowSimulated;
    if (!ctx.mission.allowedHarnesses.length) return true;
    return ctx.mission.allowedHarnesses.includes(h.id);
  });
  const rejected = [];
  const scores = [];
  let usedHistoricalEvidence = false;
  for (const h of candidates) {
    const installState = ctx.installed[h.id] ?? null;
    if (installState === false) {
      rejected.push({ harness: h.id, reason: "not installed on this machine" });
      continue;
    }
    if (!ctx.mission.boundary.codingAgents && !h.simulated) {
      rejected.push({ harness: h.id, reason: "mission boundary disables coding agents" });
      continue;
    }
    const components = {};
    const required = ctx.step.requiredCapabilities;
    components.capabilityMatch = required.length ? required.filter((c) => h.capabilities.includes(c) || h.capabilities.includes("simulation")).length / required.length : 0.5;
    const langs = ctx.step.languages;
    components.languageMatch = langs.length ? langs.filter((l) => h.languages.includes(l) || h.languages.includes("any")).length / langs.length : 0.5;
    const hid = h.id;
    const scoped = ledger.stats(hid, { repository: ctx.repository, taskKind: ctx.step.kind });
    const broad = ledger.stats(hid);
    const decayed = ledger.decayedSuccessRate(hid, ctx.now);
    const basis = scoped.runs >= 3 ? scoped : broad;
    if (basis.runs > 0) {
      usedHistoricalEvidence = true;
      const confidence = Math.min(1, basis.runs / 10);
      components.historicalSuccess = confidence * (0.5 * basis.verifiedSuccessRate + 0.5 * decayed.rate) + (1 - confidence) * 0.5;
    } else {
      components.historicalSuccess = 0.5;
    }
    components.latency = basis.medianLatencyMs > 0 ? Math.max(0, 1 - basis.medianLatencyMs / 3e5) : 0.5;
    components.cost = basis.totalCostUsd > 0 ? Math.max(0, 1 - basis.totalCostUsd / Math.max(0.01, ctx.mission.budget.maxCostUsd)) : 0.5;
    components.permissionFit = h.canEditFiles === ctx.mission.boundary.filesystemWrite ? 1 : 0.6;
    components.recency = installState === true ? 0.7 : 0.4;
    const score = components.capabilityMatch * ARBITRATION_WEIGHTS.capabilityMatch + components.languageMatch * ARBITRATION_WEIGHTS.languageMatch + components.historicalSuccess * ARBITRATION_WEIGHTS.historicalSuccess + components.latency * ARBITRATION_WEIGHTS.latency + components.cost * ARBITRATION_WEIGHTS.cost + components.permissionFit * ARBITRATION_WEIGHTS.permissionFit + components.recency * ARBITRATION_WEIGHTS.recency;
    scores.push({ harness: h.id, score: Number(score.toFixed(4)), components });
  }
  scores.sort((a, b) => b.score - a.score);
  if (!scores.length) {
    if (ctx.allowSimulated) {
      return {
        chosen: "local-test",
        scores: [{ harness: "local-test", score: 0, components: { fallback: 1 } }],
        rationale: ["No eligible harness. Falling back to the labelled simulation because the mission allows it."],
        rejected,
        usedHistoricalEvidence: false,
        simulated: true
      };
    }
    throw new Error(
      `No eligible harness for "${ctx.step.title}". Rejected: ${rejected.map((r) => `${r.harness} (${r.reason})`).join("; ") || "none"}. Install a coding CLI or widen mission.allowedHarnesses.`
    );
  }
  const winner = scores[0];
  const rationale = [];
  const w = mustHarness(winner.harness);
  rationale.push(`${w.name} scored ${winner.score.toFixed(3)} \u2014 the highest of ${scores.length} eligible runtime(s).`);
  const top = Object.entries(winner.components).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [k, v] of top) rationale.push(`${k}: ${v.toFixed(2)} (weight ${ARBITRATION_WEIGHTS[k] ?? 0})`);
  if (!usedHistoricalEvidence) {
    rationale.push("No historical evidence for any candidate; selection rests on capability and language fit. This is a first impression, not a verdict.");
  }
  if (scores.length > 1) {
    rationale.push(`Runner-up ${scores[1].harness} at ${scores[1].score.toFixed(3)} \u2014 margin ${(winner.score - scores[1].score).toFixed(3)}.`);
  }
  if (w.simulated) {
    rationale.push("WARNING: the selected runtime is MJ's labelled simulation. Its output is recorded as simulated and is not independently verified.");
  }
  return { chosen: winner.harness, scores, rationale, rejected, usedHistoricalEvidence, simulated: w.simulated };
}
function selectReplacementHarness(ctx, ledger, tried) {
  const filtered = {
    ...ctx,
    mission: {
      ...ctx.mission,
      allowedHarnesses: ctx.mission.allowedHarnesses.filter((h) => !tried.includes(h))
    }
  };
  try {
    const decision = selectHarness(filtered, ledger);
    if (tried.includes(decision.chosen)) return null;
    return decision;
  } catch {
    return null;
  }
}
function mustHarness(id) {
  const h = getHarness(id);
  if (!h) throw new Error(`unknown harness "${id}"`);
  return h;
}

// src/domain/dataTypes.ts
var COMPAT = {
  any: [],
  Text: ["Text", "Markdown", "JSON", "URL", "Number", "Boolean"],
  Markdown: ["Markdown", "Text"],
  JSON: ["JSON", "Object", "Array", "Text"],
  Object: ["Object", "JSON", "WorkflowContext", "RepositoryContext", "AgentResult"],
  Array: ["Array", "JSON"],
  Image: ["Image", "File"],
  File: ["File", "Image"],
  URL: ["URL", "Text"],
  BrowserSession: ["BrowserSession"],
  AgentResult: ["AgentResult", "Text", "Markdown", "Object"],
  Evaluation: ["Evaluation", "JSON", "Object", "Text", "Markdown", "AgentResult"],
  Boolean: ["Boolean", "Text", "Number"],
  Number: ["Number", "Text"],
  Stream: ["Stream", "Text"],
  Event: ["Event", "JSON"],
  // V6 fix: a mission/workflow payload is routinely handed to an agent as its brief.
  // Without Text/Markdown/JSON here, every Start -> Agent wire was silently dropped.
  WorkflowContext: ["WorkflowContext", "Object", "Text", "Markdown", "JSON", "URL", "any"],
  RepositoryContext: ["RepositoryContext", "Object"],
  Error: ["Error", "Text"]
};
function portsCompatible(source, target) {
  if (source === "any" || target === "any") return true;
  if (source === target) return true;
  return (COMPAT[source] ?? []).includes(target);
}

// src/mission/failureDetection.ts
init_id();
function signal(kind, severity, input, subject, detail, evidence) {
  return {
    id: uid("fail"),
    missionId: input.missionId,
    kind,
    severity,
    subject,
    detail,
    evidence,
    detectedAt: new Date(input.now).toISOString(),
    resolvedBy: null
  };
}
var repeatedFailure = (input) => {
  const out = [];
  for (const t of input.tasks) {
    if (t.attempts >= 2 && (t.state === "FAILED" || t.state === "BLOCKED")) {
      out.push(
        signal(
          "REPEATED_FAILURE",
          t.attempts >= 3 ? "ERROR" : "WARN",
          input,
          t.taskId,
          `Task "${t.title}" has failed ${t.attempts} of ${t.maxAttempts} allowed attempts.`,
          [t.error ?? "no error recorded", `attempts=${t.attempts}`]
        )
      );
    }
  }
  return out;
};
var timeoutLoop = (input) => {
  const out = [];
  const ages = Object.entries(input.taskAgeMs);
  if (ages.length < 2) return out;
  const median2 = medianOf(ages.map(([, ms]) => ms));
  for (const t of input.tasks) {
    if (t.state !== "RUNNING" && t.state !== "ASSIGNED") continue;
    const age = input.taskAgeMs[t.taskId] ?? 0;
    if (median2 > 0 && age > Math.max(5 * median2, 12e4)) {
      out.push(
        signal(
          "TIMEOUT_LOOP",
          "WARN",
          input,
          t.taskId,
          `Task "${t.title}" has been ${Math.round(age / 1e3)}s in ${t.state}, against a mission median of ${Math.round(median2 / 1e3)}s.`,
          [`ageMs=${age}`, `medianMs=${median2}`]
        )
      );
    }
  }
  return out;
};
var toolFailureLoop = (input) => {
  const out = [];
  const byTask = /* @__PURE__ */ new Map();
  for (const r of input.repairs) {
    const list = byTask.get(r.taskId) ?? [];
    list.push(r);
    byTask.set(r.taskId, list);
  }
  for (const [taskId, attempts] of byTask) {
    const failed = attempts.filter((a) => a.result === "FAILURE");
    if (failed.length >= 2) {
      out.push(
        signal(
          "TOOL_FAILURE_LOOP",
          "ERROR",
          input,
          taskId,
          `${failed.length} repair attempts failed on this task (${failed.map((f) => f.strategy).join(", ")}). Further retries of the same shape are unlikely to help.`,
          failed.map((f) => `${f.strategy}: ${f.detail}`)
        )
      );
    }
  }
  return out;
};
var duplicateWork = (input) => {
  const out = [];
  const seen = /* @__PURE__ */ new Map();
  for (const t of input.tasks) {
    if (t.state === "DONE" || t.state === "CANCELLED") continue;
    const key = t.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const list = seen.get(key) ?? [];
    list.push(t);
    seen.set(key, list);
  }
  for (const [key, group] of seen) {
    if (group.length > 1) {
      out.push(
        signal(
          "DUPLICATE_WORK",
          "WARN",
          input,
          group[0].taskId,
          `${group.length} live tasks share the objective "${key}".`,
          group.map((t) => `${t.taskId} -> ${t.agentId ?? "unassigned"}`)
        )
      );
    }
  }
  return out;
};
var contradictoryOutput = (input) => {
  const out = [];
  const byRoot = /* @__PURE__ */ new Map();
  for (const a of input.artifacts) {
    const list = byRoot.get(a.lineageRoot) ?? [];
    list.push(a);
    byRoot.set(a.lineageRoot, list);
  }
  for (const [root, group] of byRoot) {
    if (group.length < 2) continue;
    const passes = group.filter((a) => /\b(verdict|result)\s*:\s*(pass|passed|approved)\b/i.test(a.content));
    const fails = group.filter((a) => /\b(verdict|result)\s*:\s*(fail|failed|rejected)\b/i.test(a.content));
    if (passes.length && fails.length) {
      out.push(
        signal(
          "CONTRADICTORY_OUTPUT",
          "ERROR",
          input,
          root,
          `${passes.length} artifact(s) record a pass and ${fails.length} record a failure for the same lineage.`,
          [...passes.map((a) => `PASS ${a.artifactId} by ${a.createdBy}`), ...fails.map((a) => `FAIL ${a.artifactId} by ${a.createdBy}`)]
        )
      );
    }
  }
  return out;
};
var agentStarvation = (input) => {
  const out = [];
  const waiting = input.tasks.filter((t) => t.state === "PENDING");
  if (!waiting.length) return out;
  for (const a of input.agents) {
    if (a.state !== "IDLE") continue;
    const eligible = waiting.filter(
      (t) => !t.dependsOn.length || t.dependsOn.every((d) => input.tasks.find((x) => x.taskId === d)?.state === "DONE")
    );
    if (eligible.length) {
      out.push(
        signal(
          "AGENT_STARVATION",
          "WARN",
          input,
          a.agentId,
          `${a.title} is idle while ${eligible.length} unblocked task(s) wait.`,
          eligible.map((t) => t.taskId)
        )
      );
    }
  }
  return out;
};
var dependencyDeadlock = (input) => {
  const out = [];
  const live = new Set(input.tasks.filter((t) => t.state !== "DONE" && t.state !== "CANCELLED").map((t) => t.taskId));
  const state = /* @__PURE__ */ new Map();
  const byId = new Map(input.tasks.map((t) => [t.taskId, t]));
  const visit = (id, stack) => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...stack, id];
    state.set(id, "visiting");
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!live.has(dep)) continue;
      const cycle = visit(dep, [...stack, id]);
      if (cycle) return cycle;
    }
    state.set(id, "done");
    return null;
  };
  for (const id of live) {
    const cycle = visit(id, []);
    if (cycle) {
      out.push(
        signal(
          "DEPENDENCY_DEADLOCK",
          "CRITICAL",
          input,
          cycle[cycle.length - 1],
          `Circular dependency among live tasks: ${cycle.join(" -> ")}.`,
          cycle.map((c) => `${c} waits on ${(byId.get(c)?.dependsOn ?? []).join(", ")}`)
        )
      );
      break;
    }
  }
  for (const t of input.tasks) {
    if (!live.has(t.taskId)) continue;
    const missing = t.dependsOn.filter((d) => !byId.has(d));
    if (missing.length) {
      out.push(
        signal(
          "DEPENDENCY_DEADLOCK",
          "ERROR",
          input,
          t.taskId,
          `Task "${t.title}" depends on missing task(s): ${missing.join(", ")}.`,
          [t.taskId, ...missing]
        )
      );
    }
  }
  return out;
};
var budgetExhaustion = (input) => {
  const out = [];
  const check2 = (label, value, ceiling) => {
    if (ceiling <= 0) return;
    const ratio = value / ceiling;
    if (ratio >= 1) {
      out.push(
        signal("BUDGET_EXHAUSTION", "CRITICAL", input, label, `${label} exhausted: ${round(value)} of ${round(ceiling)}.`, [`ratio=${ratio.toFixed(2)}`])
      );
    } else if (ratio >= 0.8) {
      out.push(
        signal("BUDGET_EXHAUSTION", "WARN", input, label, `${label} at ${Math.round(ratio * 100)}%: ${round(value)} of ${round(ceiling)}.`, [`ratio=${ratio.toFixed(2)}`])
      );
    }
  };
  check2("cost", input.usage.costUsd, input.budget.maxCostUsd);
  check2("tokens", input.usage.tokens, input.budget.maxTokens);
  check2("wall clock (ms)", input.usage.wallClockMs, input.budget.maxWallClockMs);
  check2("retries", input.usage.retries, input.budget.maxRetriesPerTask * Math.max(1, input.tasks.length));
  check2("graph mutations", input.usage.graphMutations, input.budget.maxGraphMutations);
  return out;
};
var permissionDenial = (input) => {
  const out = [];
  for (const t of input.tasks) {
    if (!t.error) continue;
    if (/not granted|permission denied|not permitted|forbidden|unauthorised|unauthorized/i.test(t.error)) {
      out.push(
        signal(
          "PERMISSION_DENIAL",
          "WARN",
          input,
          t.taskId,
          `Task "${t.title}" was blocked by a permission boundary. Either grant the permission or replan without it.`,
          [t.error]
        )
      );
    }
  }
  return out;
};
var invalidArtifactState = (input) => {
  const out = [];
  for (const a of input.artifacts) {
    if (!a.evaluation) {
      out.push(
        signal("INVALID_ARTIFACT_STATE", "WARN", input, a.artifactId, `Artifact "${a.name}" v${a.version} was never evaluated.`, [`createdBy=${a.createdBy}`])
      );
    } else if (!a.evaluation.passed && a.approvalState === "APPROVED") {
      out.push(
        signal(
          "INVALID_ARTIFACT_STATE",
          "ERROR",
          input,
          a.artifactId,
          `Artifact "${a.name}" v${a.version} failed evaluation but is marked APPROVED.`,
          a.evaluation.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`)
        )
      );
    }
  }
  return out;
};
var regression = (input) => {
  const out = [];
  const byRoot = /* @__PURE__ */ new Map();
  for (const a of input.artifacts) {
    const list = byRoot.get(a.lineageRoot) ?? [];
    list.push(a);
    byRoot.set(a.lineageRoot, list);
  }
  for (const [, group] of byRoot) {
    const sorted = group.filter((a) => a.evaluation?.fullyMeasured).sort((a, b) => a.version - b.version);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].evaluation;
      const cur = sorted[i].evaluation;
      const score = (e) => e.checks.filter((c) => c.score != null).reduce((s, c) => s + (c.score ?? 0), 0) / Math.max(1, e.checks.filter((c) => c.score != null).length);
      if (prev.passed && !cur.passed) {
        out.push(
          signal(
            "REGRESSION",
            "ERROR",
            input,
            sorted[i].artifactId,
            `"${sorted[i].name}" v${sorted[i].version} fails where v${prev.checks.length ? sorted[i - 1].version : sorted[i - 1].version} passed.`,
            cur.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`)
          )
        );
      } else if (score(cur) + 0.05 < score(prev)) {
        out.push(
          signal(
            "REGRESSION",
            "WARN",
            input,
            sorted[i].artifactId,
            `"${sorted[i].name}" v${sorted[i].version} scores ${score(cur).toFixed(2)} against ${score(prev).toFixed(2)} for v${sorted[i - 1].version}.`,
            [`prev=${score(prev).toFixed(3)}`, `cur=${score(cur).toFixed(3)}`]
          )
        );
      }
    }
  }
  return out;
};
var missingCapability = (input) => {
  const out = [];
  for (const t of input.tasks) {
    if (!t.error) continue;
    const m2 = t.error.match(/missing capabilit(?:y|ies): ([^.;]+)/i);
    if (m2) {
      out.push(
        signal(
          "MISSING_CAPABILITY",
          "ERROR",
          input,
          t.taskId,
          `No agent in the roster can perform "${t.title}": ${m2[1]}.`,
          [t.error, ...input.agents.map((a) => `${a.title}: ${a.contract.capabilities.join(", ") || "none"}`)]
        )
      );
    }
  }
  return out;
};
var stall = (input) => {
  const live = input.tasks.filter((t) => t.state === "RUNNING" || t.state === "ASSIGNED" || t.state === "PENDING");
  if (!live.length) return [];
  const ages = live.map((t) => input.taskAgeMs[t.taskId] ?? 0);
  const youngest = Math.min(...ages);
  if (youngest > 18e4) {
    return [
      signal(
        "STALL",
        "ERROR",
        input,
        input.missionId,
        `No task has changed state for ${Math.round(youngest / 1e3)}s while ${live.length} remain live.`,
        live.map((t) => `${t.taskId} ${t.state} ${Math.round((input.taskAgeMs[t.taskId] ?? 0) / 1e3)}s`)
      )
    ];
  }
  return [];
};
var ALL_DETECTORS = [
  { kind: "REPEATED_FAILURE", fn: repeatedFailure },
  { kind: "TIMEOUT_LOOP", fn: timeoutLoop },
  { kind: "TOOL_FAILURE_LOOP", fn: toolFailureLoop },
  { kind: "DUPLICATE_WORK", fn: duplicateWork },
  { kind: "CONTRADICTORY_OUTPUT", fn: contradictoryOutput },
  { kind: "AGENT_STARVATION", fn: agentStarvation },
  { kind: "DEPENDENCY_DEADLOCK", fn: dependencyDeadlock },
  { kind: "BUDGET_EXHAUSTION", fn: budgetExhaustion },
  { kind: "PERMISSION_DENIAL", fn: permissionDenial },
  { kind: "INVALID_ARTIFACT_STATE", fn: invalidArtifactState },
  { kind: "REGRESSION", fn: regression },
  { kind: "MISSING_CAPABILITY", fn: missingCapability },
  { kind: "STALL", fn: stall }
];
function detectAll(input) {
  const out = [];
  for (const { fn } of ALL_DETECTORS) {
    try {
      out.push(...fn(input));
    } catch (e) {
      out.push(
        signal("INVALID_ARTIFACT_STATE", "WARN", input, "detector", `Detector threw: ${e instanceof Error ? e.message : String(e)}`, [])
      );
    }
  }
  return out;
}
function medianOf(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function round(n2) {
  return Number.isInteger(n2) ? String(n2) : n2.toFixed(4);
}

// src/mission/evaluation.ts
init_id();
var REQUIRED_CHECKS = {
  research: ["INDEPENDENT_REVIEW"],
  architecture: ["INDEPENDENT_REVIEW"],
  implementation: ["TEST_RUN", "STATIC_CHECK", "INDEPENDENT_REVIEW"],
  test: ["INDEPENDENT_REVIEW"],
  security: ["SECURITY_CHECK", "INDEPENDENT_REVIEW"],
  review: ["INDEPENDENT_REVIEW"],
  synthesis: ["INDEPENDENT_REVIEW"],
  approval: [],
  release: ["INDEPENDENT_REVIEW", "REGRESSION_SUITE"]
};
function check(input) {
  return {
    id: uid("chk"),
    name: input.name,
    source: input.source,
    passed: input.measured === false ? false : input.passed,
    score: input.measured === false ? null : input.score,
    detail: input.measured === false ? `NOT MEASURED \u2014 ${input.detail}` : input.detail,
    measured: input.measured !== false,
    evidence: input.evidence ?? []
  };
}
function unmeasuredCheck(name, source, why) {
  return check({ name, source, passed: false, score: null, detail: why, measured: false });
}
function evaluateArtifact(input) {
  const required = REQUIRED_CHECKS[input.kind] ?? [];
  const bySource = /* @__PURE__ */ new Map();
  for (const c of input.checks) {
    const list = bySource.get(c.source) ?? [];
    list.push(c);
    bySource.set(c.source, list);
  }
  const unmeasured = [];
  for (const src of required) {
    const present = bySource.get(src) ?? [];
    if (!present.length) unmeasured.push(`${src} (absent)`);
    else if (present.every((c) => !c.measured)) unmeasured.push(`${src} (present but not measured)`);
  }
  const onlySelfReport = input.checks.length > 0 && input.checks.every((c) => c.source === "AGENT_SELF_REPORT");
  if (onlySelfReport && required.length) {
    unmeasured.push("independent verification (only a self-report was offered)");
  }
  const failed = input.checks.filter((c) => !c.passed);
  const passed = unmeasured.length === 0 && failed.length === 0 && input.checks.length > 0;
  return {
    evaluationId: uid("eval"),
    artifactId: input.artifactId,
    checks: input.checks,
    passed,
    fullyMeasured: unmeasured.length === 0,
    unmeasured,
    decidedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function compositeOfChecks(checks) {
  if (!checks.length) return 0;
  const weights = {
    AGENT_SELF_REPORT: 0.1,
    TEST_RUN: 1,
    STATIC_CHECK: 0.8,
    SECURITY_CHECK: 1,
    INDEPENDENT_REVIEW: 1,
    REGRESSION_SUITE: 1,
    HUMAN: 1.2
  };
  let sum = 0;
  let weight = 0;
  for (const c of checks) {
    const w = weights[c.source] ?? 0.5;
    weight += w;
    if (!c.measured) continue;
    sum += w * (c.score ?? (c.passed ? 1 : 0));
  }
  return weight ? sum / weight : 0;
}
function scoreMission(input) {
  const unmeasured = [];
  const goalCompletion = input.successCriteria.length ? input.criteriaMet.length / input.successCriteria.length : (unmeasured.push("goal completion (no success criteria were declared)"), 0);
  const measuredChecks = input.checks.filter((c) => c.measured);
  if (!measuredChecks.length) unmeasured.push("quality (no measured checks)");
  const quality = measuredChecks.length ? compositeOfChecks(measuredChecks) : 0;
  const measuredTests = input.testChecks.filter((c) => c.measured);
  if (!measuredTests.length) unmeasured.push("tests (none were run)");
  const tests = measuredTests.length ? measuredTests.filter((c) => c.passed).length / measuredTests.length : 0;
  const measuredSec = input.securityChecks.filter((c) => c.measured);
  if (!measuredSec.length) unmeasured.push("security (no security checks were run)");
  const security = measuredSec.length ? measuredSec.filter((c) => c.passed).length / measuredSec.length : 0;
  const costEfficiency = input.budgetUsd > 0 ? clamp01(1 - input.spentUsd / input.budgetUsd) : (unmeasured.push("cost (no budget was set)"), 0);
  let latencyEfficiency = 0;
  if (input.deadlineMs && input.deadlineMs > 0) {
    latencyEfficiency = clamp01(1 - input.elapsedMs / input.deadlineMs);
  } else {
    unmeasured.push("latency (no deadline was set)");
  }
  return {
    goalCompletion: round2(goalCompletion),
    quality: round2(quality),
    tests: round2(tests),
    security: round2(security),
    costEfficiency: round2(costEfficiency),
    latencyEfficiency: round2(latencyEfficiency),
    humanInterventions: input.humanInterventions,
    regressionCount: input.regressionCount,
    unmeasured
  };
}
function testRunCheck(command, output, exitCode) {
  if (!output.trim()) {
    return unmeasuredCheck(`Test run: ${command}`, "TEST_RUN", "the command produced no output, so nothing was verified");
  }
  const failedCounts = [...output.matchAll(/(\d+)[ ,]+fail(?:ed|ing|ures?)?\b/gi)].map((m2) => Number(m2[1]));
  const summaryFailed = failedCounts.some((n2) => n2 > 0) || /^not ok\b/m.test(output) || /^FAILED\b/m.test(output) || /\bpanic:/.test(output);
  const passed = exitCode === 0 && !summaryFailed;
  return check({
    name: `Test run: ${command}`,
    source: "TEST_RUN",
    passed,
    score: passed ? 1 : 0,
    detail: `exit=${exitCode ?? "?"}, ${output.length} bytes of output, ${summaryFailed ? "runner summary reports failures" : "no failure summary"}`,
    evidence: [output.slice(0, 2e3)]
  });
}
function clamp01(n2) {
  return Math.min(1, Math.max(0, n2));
}
function round2(n2) {
  return Math.round(n2 * 1e3) / 1e3;
}

// src/mission/checkpoints.ts
init_id();
var EMPTY_USAGE = {
  costUsd: 0,
  tokens: 0,
  peakConcurrentAgents: 0,
  browserSessions: 0,
  graphMutations: 0,
  retries: 0,
  wallClockMs: 0
};
var ResourceManager = class {
  constructor(budget, startedAt = Date.now()) {
    this.budget = budget;
    this.startedAt = startedAt;
  }
  usage = { ...EMPTY_USAGE };
  violations = [];
  spend(delta) {
    for (const [k, v] of Object.entries(delta)) {
      const key = k;
      this.usage[key] = this.usage[key] + v;
    }
    this.usage.wallClockMs = Date.now() - this.startedAt;
  }
  /** Called before dispatching work. Returns the first ceiling already breached, or null. */
  maySpend(estimatedCostUsd, liveAgents) {
    const projected = { ...this.usage, costUsd: this.usage.costUsd + estimatedCostUsd };
    const checks = [
      ["maxCostUsd", projected.costUsd, this.budget.maxCostUsd],
      ["maxTokens", projected.tokens, this.budget.maxTokens],
      ["maxWallClockMs", Date.now() - this.startedAt, this.budget.maxWallClockMs],
      ["maxConcurrentAgents", liveAgents, this.budget.maxConcurrentAgents],
      ["maxGraphMutations", this.usage.graphMutations, this.budget.maxGraphMutations],
      ["maxBrowserSessions", this.usage.browserSessions, this.budget.maxBrowserSessions]
    ];
    for (const [limit, value, ceiling] of checks) {
      if (ceiling > 0 && value > ceiling) {
        const v = { limit, value, ceiling, at: (/* @__PURE__ */ new Date()).toISOString() };
        this.violations.push(v);
        return v;
      }
    }
    return null;
  }
  /** Ratios for the mission header, so a ceiling is visible before it is hit. */
  ratios() {
    const rows = [
      ["maxCostUsd", this.usage.costUsd, this.budget.maxCostUsd],
      ["maxTokens", this.usage.tokens, this.budget.maxTokens],
      ["maxWallClockMs", Date.now() - this.startedAt, this.budget.maxWallClockMs],
      ["maxConcurrentAgents", this.usage.peakConcurrentAgents, this.budget.maxConcurrentAgents],
      ["maxGraphMutations", this.usage.graphMutations, this.budget.maxGraphMutations],
      ["maxRetriesPerTask", this.usage.retries, this.budget.maxRetriesPerTask * 10]
    ];
    return rows.map(([limit, value, ceiling]) => ({
      limit,
      value,
      ceiling,
      ratio: ceiling > 0 ? value / ceiling : 0
    }));
  }
  violationsList() {
    return [...this.violations];
  }
  remainingCostUsd() {
    return Math.max(0, this.budget.maxCostUsd - this.usage.costUsd);
  }
  hydrate(usage, startedAt) {
    this.usage = { ...usage };
    this.startedAt = startedAt;
  }
  export() {
    return { ...this.usage, wallClockMs: Date.now() - this.startedAt };
  }
};
var CheckpointStore = class {
  checkpoints = [];
  /**
   * Take a checkpoint. The graph is deep-copied: a checkpoint that aliases live state is not
   * a checkpoint, it is a promise that will be broken by the next mutation.
   */
  take(input, recorder) {
    const cp = {
      checkpointId: uid("cp"),
      missionId: input.missionId,
      label: input.label,
      reason: input.reason,
      graphVersion: input.graphVersion,
      graphSnapshot: structuredClone(input.graphSnapshot),
      taskStates: { ...input.taskStates },
      artifactVersions: { ...input.artifactVersions },
      roster: input.roster.map((r) => ({ ...r })),
      pendingApprovalIds: [...input.pendingApprovalIds],
      spentUsd: input.spentUsd,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.checkpoints.push(cp);
    recorder.record({
      kind: "MISSION_CHECKPOINTED",
      actor: "runtime",
      authority: "policy:checkpoint.automatic",
      policy: "checkpoint.after-transition",
      reason: input.reason,
      subjectId: cp.checkpointId,
      data: {
        label: cp.label,
        graphVersion: cp.graphVersion,
        nodes: cp.graphSnapshot.nodes.length,
        tasksDone: Object.values(cp.taskStates).filter((s) => s === "DONE").length,
        spentUsd: cp.spentUsd
      }
    });
    return cp;
  }
  latest(missionId) {
    const list = this.forMission(missionId);
    return list.length ? list[list.length - 1] : null;
  }
  get(checkpointId) {
    return this.checkpoints.find((c) => c.checkpointId === checkpointId) ?? null;
  }
  forMission(missionId) {
    return this.checkpoints.filter((c) => c.missionId === missionId);
  }
  /**
   * §26 Rollback. Returns the checkpoint to restore and records the rollback. Restoring is
   * the caller's job: this store never mutates live mission state behind its back.
   */
  rollbackTo(checkpointId, recorder, actor, reason) {
    const cp = this.get(checkpointId);
    if (!cp) return null;
    recorder.record({
      kind: "MISSION_ROLLED_BACK",
      actor,
      authority: actor === "human" ? "human" : "supervisor",
      policy: "checkpoint.rollback",
      reason,
      subjectId: cp.checkpointId,
      data: {
        label: cp.label,
        graphVersion: cp.graphVersion,
        discardedCheckpoints: this.forMission(cp.missionId).filter((c) => c.createdAt > cp.createdAt).length
      }
    });
    this.checkpoints = this.checkpoints.filter((c) => c.createdAt <= cp.createdAt);
    return cp;
  }
  hydrate(checkpoints) {
    this.checkpoints = [...checkpoints];
  }
  export() {
    return [...this.checkpoints];
  }
};
function validateRestoredState(state) {
  const errors = [];
  if (!state) return { ok: false, errors: ["no saved state"] };
  if (state.version !== 6) errors.push(`unsupported state version ${String(state.version)} (expected 6)`);
  if (!state.missionId) errors.push("missing missionId");
  if (!Array.isArray(state.tasks)) errors.push("missing task states");
  if (!Array.isArray(state.agents)) errors.push("missing agent states");
  if (!Array.isArray(state.flightEvents)) errors.push("missing flight recorder trace");
  if (!state.usage) errors.push("missing resource usage");
  return { ok: errors.length === 0, errors };
}

// src/mission/graphMutator.ts
init_id();

// src/graph/validation.ts
function validateWorkflow(graph) {
  const issues = [];
  const nodes = new Map(graph.nodes.map((n2) => [n2.id, n2]));
  const conns = graph.connections;
  if (graph.nodes.length === 0) {
    issues.push({ severity: "warning", message: "Workflow is empty." });
    return issues;
  }
  for (const node of graph.nodes) {
    for (const port of node.inputs) {
      if (port.required && !conns.some((c) => c.targetNodeId === node.id && c.targetPortId === port.id)) {
        issues.push({
          nodeId: node.id,
          portId: port.id,
          severity: "error",
          message: `Node "${node.title}" is missing required input "${port.label}" (${port.dataType}).`
        });
      }
    }
    if (node.purpose.trim() === "" && node.inputs.length > 0 && node.definitionId.startsWith("agent.")) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: `Agent node "${node.title}" has no Purpose set.`
      });
    }
    if (!node.contract || typeof node.contract.timeoutMs !== "number" || node.contract.timeoutMs <= 0) {
      issues.push({
        nodeId: node.id,
        severity: "error",
        message: `Node "${node.title}" has an invalid execution timeout.`
      });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  for (const conn of conns) {
    const key = `${conn.sourceNodeId}:${conn.sourcePortId}->${conn.targetNodeId}:${conn.targetPortId}`;
    if (seen.has(key)) {
      issues.push({ connectionId: conn.id, severity: "error", message: "Duplicate connection between the same ports." });
    }
    seen.add(key);
    const src = nodes.get(conn.sourceNodeId);
    const tgt = nodes.get(conn.targetNodeId);
    if (!src || !tgt) {
      issues.push({ connectionId: conn.id, severity: "error", message: "Connection references missing nodes." });
      continue;
    }
    const srcPort = src.outputs.find((p2) => p2.id === conn.sourcePortId);
    const tgtPort = tgt.inputs.find((p2) => p2.id === conn.targetPortId);
    if (!srcPort) {
      issues.push({
        nodeId: src.id,
        portId: conn.sourcePortId,
        connectionId: conn.id,
        severity: "error",
        message: `Source port not found on "${src.title}".`
      });
    }
    if (!tgtPort) {
      issues.push({
        nodeId: tgt.id,
        portId: conn.targetPortId,
        connectionId: conn.id,
        severity: "error",
        message: `Target port not found on "${tgt.title}".`
      });
    }
    if (srcPort && tgtPort) {
      if (!portsCompatible(srcPort.dataType, tgtPort.dataType)) {
        issues.push({
          nodeId: tgt.id,
          portId: tgtPort.id,
          connectionId: conn.id,
          severity: "error",
          message: `Type mismatch: "${src.title}.${srcPort.label}" emits ${srcPort.dataType} but "${tgt.title}.${tgtPort.label}" expects ${tgtPort.dataType}.`
        });
      }
      if (!tgtPort.multiple) {
        const duplicates = conns.filter(
          (c) => c !== conn && c.targetNodeId === conn.targetNodeId && c.targetPortId === conn.targetPortId
        );
        if (duplicates.length > 0) {
          issues.push({
            nodeId: tgt.id,
            portId: tgtPort.id,
            severity: "error",
            message: `Input "${tgtPort.label}" on "${tgt.title}" accepts a single connection but receives multiple.`
          });
        }
      }
    }
  }
  const cycle = findCycle(graph.nodes, conns);
  if (cycle) {
    issues.push({
      severity: "error",
      message: `Cycle detected: ${cycle.map((id) => nodes.get(id)?.title ?? id).join(" \u2192 ")}`
    });
  }
  const consumed = /* @__PURE__ */ new Set([...conns.map((c) => c.sourceNodeId), ...conns.map((c) => c.targetNodeId)]);
  for (const node of graph.nodes) {
    if (!consumed.has(node.id) && graph.nodes.length > 1) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: `Node "${node.title}" is isolated (no connections).`
      });
    }
  }
  return issues;
}
function findCycle(nodes, conns) {
  const adj = /* @__PURE__ */ new Map();
  for (const n2 of nodes) adj.set(n2.id, []);
  for (const c of conns) {
    if (adj.has(c.sourceNodeId)) adj.get(c.sourceNodeId).push(c.targetNodeId);
  }
  const state = /* @__PURE__ */ new Map();
  const stack = [];
  const dfs = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const s = state.get(next) ?? 0;
      if (s === 1) {
        stack.push(next);
        return true;
      }
      if (s === 0 && dfs(next)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  };
  for (const n2 of nodes) {
    if ((state.get(n2.id) ?? 0) === 0) {
      stack.length = 0;
      if (dfs(n2.id)) {
        const last = stack[stack.length - 1];
        const at = stack.indexOf(last);
        return stack.slice(at);
      }
    }
  }
  return null;
}

// src/mission/graphMutator.ts
function policyCheck(req) {
  const failures = [];
  const policy = req.mission.riskPolicy;
  if (!policy.allowGraphMutation) failures.push("mission policy disables graph mutation");
  if (req.authority === "SUPERVISOR" && policy.autonomy === "HUMAN_ONLY") {
    failures.push("autonomy is HUMAN_ONLY: only a human may authorise a graph change");
  }
  if (req.mission.graphVersion >= req.mission.budget.maxGraphMutations) {
    failures.push(
      `graph mutation budget exhausted: version ${req.mission.graphVersion} of max ${req.mission.budget.maxGraphMutations}`
    );
  }
  if (!req.evidence.length) failures.push("no evidence supplied \u2014 a graph change must cite what it observed");
  if (!req.reason.trim()) failures.push("no reason supplied");
  return { passed: failures.length === 0, failures };
}
function evaluationCheck(nextGraph) {
  const issues = validateWorkflow(nextGraph);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length) {
    return { passed: false, detail: `${errors.length} structural error(s): ${errors.slice(0, 4).map((e) => e.message).join(" | ")}` };
  }
  if (!nextGraph.nodes.length) return { passed: false, detail: "proposed graph has no nodes" };
  return {
    passed: true,
    detail: `${nextGraph.nodes.length} nodes, ${nextGraph.connections.length} connections, ${issues.filter((i) => i.severity === "warning").length} warning(s)`
  };
}
function regressionCheck(req) {
  const nextTitles = new Set(req.nextGraph.nodes.map((n2) => n2.title));
  const lost = req.completedWork.filter((t) => !nextTitles.has(t));
  if (lost.length) {
    return {
      passed: false,
      detail: `mutation would discard completed work: ${lost.join(", ")}. Roll back to a checkpoint instead of mutating.`
    };
  }
  const before = new Set(req.graph.nodes.map((n2) => n2.title));
  const added = [...nextTitles].filter((t) => !before.has(t));
  const removed = [...before].filter((t) => !nextTitles.has(t));
  return {
    passed: true,
    detail: `adds [${added.join(", ") || "nothing"}], removes [${removed.join(", ") || "nothing"}], preserves ${req.completedWork.length} completed node(s)`
  };
}
function proposeMutation(req, recorder) {
  const policy = policyCheck(req);
  const evaluation = policy.passed ? evaluationCheck(req.nextGraph) : null;
  const regression2 = policy.passed && evaluation?.passed ? regressionCheck(req) : null;
  const mutation = {
    mutationId: uid("mut"),
    missionId: req.mission.missionId,
    fromGraphVersion: req.mission.graphVersion,
    toGraphVersion: req.mission.graphVersion + 1,
    reason: req.reason,
    evidence: req.evidence,
    requestedBy: req.requestedBy,
    authority: req.authority,
    policyCheck: policy,
    evaluation,
    regression: regression2,
    rollbackTargetVersion: req.mission.graphVersion,
    graphSnapshotBefore: req.graph,
    appliedAt: (/* @__PURE__ */ new Date()).toISOString(),
    applied: false
  };
  const blockedBy = !policy.passed ? `policy: ${policy.failures.join("; ")}` : evaluation && !evaluation.passed ? `evaluation: ${evaluation.detail}` : regression2 && !regression2.passed ? `regression: ${regression2.detail}` : null;
  mutation.applied = blockedBy === null;
  recorder.record({
    kind: "GRAPH_MUTATED",
    actor: req.requestedBy,
    authority: req.authority,
    policy: `allowGraphMutation=${req.mission.riskPolicy.allowGraphMutation};autonomy=${req.mission.riskPolicy.autonomy}`,
    reason: req.reason,
    evidence: req.evidence,
    subjectId: mutation.mutationId,
    data: {
      applied: mutation.applied,
      blockedBy,
      fromVersion: mutation.fromGraphVersion,
      toVersion: mutation.toGraphVersion,
      evaluation: evaluation?.detail ?? null,
      regression: regression2?.detail ?? null
    }
  });
  return { mutation, applied: mutation.applied, blockedBy };
}
function completedTitles(graph, completedNodeIds) {
  return graph.nodes.filter((n2) => completedNodeIds.has(n2.id)).map((n2) => n2.title);
}

// src/mission/checkRunner.ts
var join3 = (dir, name) => dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}/${name}`;
async function discoverChecks(repoDir, read, exists = (p2) => existsViaRead(p2, read)) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (spec) => {
    const key = `${spec.command} ${spec.args.join(" ")}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(spec);
  };
  const pkgRaw = await tryRead(join3(repoDir, "package.json"), read);
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw);
      const scripts = pkg.scripts ?? {};
      const allDeps = { ...pkg.dependencies ?? {}, ...pkg.devDependencies ?? {} };
      const typecheck = pickScript(scripts, ["typecheck", "type-check", "tsc"]);
      if (typecheck) {
        add({ id: "typecheck", label: "Typecheck", source: "STATIC_CHECK", command: "npm", args: ["run", typecheck.name], timeoutSecs: 240, discoveredFrom: `package.json scripts.${typecheck.name}` });
      } else if (allDeps.typescript) {
        add({ id: "typecheck", label: "Typecheck", source: "STATIC_CHECK", command: "npm", args: ["exec", "--", "tsc", "--noEmit"], timeoutSecs: 240, discoveredFrom: "package.json dependency: typescript" });
      }
      const lint = pickScript(scripts, ["lint", "eslint", "biome", "check"]);
      if (lint) {
        add({ id: "lint", label: "Lint", source: "STATIC_CHECK", command: "npm", args: ["run", lint.name], timeoutSecs: 180, discoveredFrom: `package.json scripts.${lint.name}` });
      }
      const test = pickScript(scripts, ["test", "test:unit", "test:run"]);
      if (test) {
        add({ id: "test", label: "Test suite", source: "TEST_RUN", command: "npm", args: ["run", test.name], timeoutSecs: 600, discoveredFrom: `package.json scripts.${test.name}` });
      }
    } catch {
    }
  }
  if (await exists(join3(repoDir, "Cargo.toml"))) {
    add({ id: "cargo-check", label: "cargo check", source: "STATIC_CHECK", command: "cargo", args: ["check", "--all-targets"], timeoutSecs: 900, discoveredFrom: "Cargo.toml" });
    add({ id: "cargo-test", label: "cargo test", source: "TEST_RUN", command: "cargo", args: ["test"], timeoutSecs: 900, discoveredFrom: "Cargo.toml" });
  }
  if (await exists(join3(repoDir, "pyproject.toml")) || await exists(join3(repoDir, "pytest.ini"))) {
    add({ id: "pytest", label: "pytest", source: "TEST_RUN", command: "python3", args: ["-m", "pytest", "-q"], timeoutSecs: 600, discoveredFrom: "pyproject.toml / pytest.ini" });
  }
  return out;
}
function pickScript(scripts, names) {
  for (const n2 of names) if (scripts[n2]) return { name: n2 };
  return null;
}
async function tryRead(path3, read) {
  try {
    return await read(path3);
  } catch {
    return null;
  }
}
async function existsViaRead(path3, read) {
  return await tryRead(path3, read) !== null;
}
async function runCheck(spec, repoDir, run, canRun, exists = existsNative) {
  const started = Date.now();
  const finish = (r) => ({ spec, durationMs: Date.now() - started, ...r });
  if (!await canRun()) {
    return finish({ didRun: false, exitCode: null, output: "", reason: "no executor available \u2014 this needs the native desktop build, not the browser preview" });
  }
  if (/^(npm|npx|yarn|pnpm)$/.test(spec.command)) {
    if (!await exists(join3(repoDir, "node_modules"))) {
      return finish({ didRun: false, exitCode: null, output: "", reason: "node_modules is absent; MJ will not run an install for you, so this check was not performed" });
    }
  }
  try {
    const r = await run(spec.command, spec.args, repoDir, spec.timeoutSecs);
    const output = [r.stdout, r.stderr].filter((s) => s && s.trim()).join("\n").trim();
    return finish({
      didRun: true,
      exitCode: r.code,
      output,
      reason: r.code === 0 ? null : `exited ${r.code ?? "with no code (killed or signalled)"}`
    });
  } catch (e) {
    return finish({ didRun: false, exitCode: null, output: "", reason: e instanceof Error ? e.message : String(e) });
  }
}
function isBrowser() {
  return typeof window !== "undefined" && typeof process === "undefined";
}
async function readNative(path3) {
  if (isBrowser()) {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    return ipc2.fsRead(path3);
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(path3, "utf8");
}
async function existsNative(path3) {
  if (isBrowser()) {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    try {
      await ipc2.fsList(path3);
      return true;
    } catch {
      return false;
    }
  }
  const { stat } = await import("node:fs/promises");
  try {
    await stat(path3);
    return true;
  } catch {
    return false;
  }
}
async function runNative(command, args, cwd, timeoutSecs) {
  if (isBrowser()) {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    const r = await ipc2.shellExec(command, args, cwd, timeoutSecs);
    return { stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? ""), code: r.code ?? null };
  }
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, Math.max(1, timeoutSecs) * 1e3);
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}
${e.message}`.trim(), code: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
async function canRunNative() {
  if (isBrowser()) {
    const { detectHost: detectHost2 } = await Promise.resolve().then(() => (init_desktop(), desktop_exports));
    return detectHost2() === "tauri";
  }
  return true;
}
async function runAllChecks(repoDir, opts = {}) {
  const read = opts.read ?? readNative;
  const run = opts.run ?? runNative;
  const canRun = opts.canRun ?? canRunNative;
  const exists = opts.exists ?? ((p2) => existsViaRead(p2, read));
  let specs = await discoverChecks(repoDir, read);
  if (opts.only?.length) specs = specs.filter((s) => opts.only.includes(s.source));
  const out = [];
  for (const spec of specs) out.push(await runCheck(spec, repoDir, run, canRun, exists));
  return out;
}

// src/mission/memory.ts
init_id();
var OrganizationMemory = class {
  entries = [];
  remember(input) {
    if (!input.scopeKey) throw new Error("memory: a scope key is required; unscoped memory is not stored");
    const entry = {
      id: uid("mem"),
      scope: input.scope,
      scopeKey: input.scopeKey,
      missionId: input.missionId,
      kind: input.kind,
      content: input.content,
      evidence: input.evidence ?? [],
      importance: input.importance ?? 0.5,
      tags: input.tags ?? [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.entries.push(entry);
    return entry;
  }
  /**
   * Scoped retrieval. Both `scope` and `scopeKey` are required — there is no "give me
   * everything" path.
   */
  retrieve(scope, scopeKey, limit = 8, query) {
    const pool = this.entries.filter((e) => e.scope === scope && e.scopeKey === scopeKey);
    const scored = pool.map((e) => ({ e, s: rank2(e, query) }));
    scored.sort((a, b) => b.s - a.s || b.e.createdAt.localeCompare(a.e.createdAt));
    return scored.slice(0, Math.max(1, limit)).map((x) => x.e);
  }
  /**
   * Cross-mission retrieval for a new mission: only distilled, high-importance evidence,
   * and only from the scopes that generalise. Never the raw trace of another mission.
   */
  relevantEvidence(query, limit = 6, excludeMissionId) {
    const generalises = /* @__PURE__ */ new Set(["DECISION", "FAILURE", "TEAM", "AGENT"]);
    const kinds = /* @__PURE__ */ new Set([
      "what_worked",
      "what_failed",
      "harness_success",
      "tool_failure",
      "rejected_architecture",
      "repair_strategy"
    ]);
    const pool = this.entries.filter(
      (e) => generalises.has(e.scope) && kinds.has(e.kind) && e.missionId !== excludeMissionId && e.importance >= 0.4
    );
    return pool.map((e) => ({ e, s: rank2(e, query) })).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.e);
  }
  forMission(missionId) {
    return this.entries.filter((e) => e.missionId === missionId);
  }
  byScope(scope) {
    return this.entries.filter((e) => e.scope === scope);
  }
  /** Distil a finished mission into the entries worth carrying forward. */
  distil(missionId, recorder) {
    const out = [];
    for (const e of recorder.ofKind("EVALUATION_PASSED")) {
      out.push(
        this.remember({
          scope: "MISSION",
          scopeKey: missionId,
          missionId,
          kind: "what_worked",
          content: `${String(e.data.artifact ?? e.subjectId ?? "artifact")} passed independent evaluation: ${e.reason}`,
          evidence: e.evidence,
          importance: 0.7,
          tags: ["evaluation"]
        })
      );
    }
    for (const e of recorder.ofKind("REPAIR_COMPLETED")) {
      out.push(
        this.remember({
          scope: "FAILURE",
          scopeKey: String(e.data.strategy ?? "repair"),
          missionId,
          kind: "repair_strategy",
          content: `Repair ${String(e.data.strategy ?? "?")} succeeded: ${e.reason}`,
          evidence: e.evidence,
          importance: 0.8,
          tags: ["repair"]
        })
      );
    }
    for (const e of recorder.ofKind("APPROVAL_REQUIRED")) {
      out.push(
        this.remember({
          scope: "DECISION",
          scopeKey: String(e.data.risk ?? "risk"),
          missionId,
          kind: "approval_required",
          content: `${String(e.data.risk)} action required human approval: ${e.reason}`,
          evidence: e.evidence,
          importance: 0.6,
          tags: ["approval", "governance"]
        })
      );
    }
    for (const e of recorder.ofKind("GRAPH_MUTATED")) {
      out.push(
        this.remember({
          scope: "DECISION",
          scopeKey: String(e.data.reason ?? "reorganization"),
          missionId,
          kind: "decision",
          content: `Organization changed: ${e.reason}`,
          evidence: e.evidence,
          importance: 0.75,
          tags: ["graph", "reorganization"]
        })
      );
    }
    return out;
  }
  hydrate(entries) {
    this.entries = [...entries];
  }
  export() {
    return [...this.entries];
  }
  get size() {
    return this.entries.length;
  }
};
function rank2(entry, query) {
  let score = entry.importance;
  if (query) {
    const q = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    const hay = `${entry.content} ${entry.tags.join(" ")} ${entry.kind}`.toLowerCase();
    let hits = 0;
    for (const w of q) if (hay.includes(w)) hits += 1;
    score += q.size ? 0.5 * (hits / q.size) : 0;
  }
  if (entry.evidence.length) score += 0.1;
  return score;
}
var ReputationLedger = class {
  records = [];
  note(subjectKind, subjectId, dimension, success, ms) {
    let rec = this.records.find((r) => r.subjectKind === subjectKind && r.subjectId === subjectId && r.dimension === dimension);
    if (!rec) {
      rec = { subjectKind, subjectId, dimension, wins: 0, losses: 0, totalMs: 0, runs: 0, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      this.records.push(rec);
    }
    rec.runs += 1;
    if (success) rec.wins += 1;
    else rec.losses += 1;
    rec.totalMs += ms;
    rec.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    return rec;
  }
  view(subjectKind, subjectId) {
    const recs = this.records.filter((r) => r.subjectKind === subjectKind && r.subjectId === subjectId);
    const runs = recs.reduce((s, r) => s + r.runs, 0);
    const wins = recs.reduce((s, r) => s + r.wins, 0);
    const totalMs = recs.reduce((s, r) => s + r.totalMs, 0);
    return {
      subjectId,
      subjectKind,
      runs,
      successRate: runs ? wins / runs : 0,
      medianMs: runs ? Math.round(totalMs / runs) : 0,
      byDimension: recs.map((r) => ({
        dimension: r.dimension,
        runs: r.runs,
        successRate: r.runs ? r.wins / r.runs : 0,
        label: labelFor(r.runs ? r.wins / r.runs : 0, r.runs)
      })),
      confidence: Math.min(1, runs / 20)
    };
  }
  /** Every subject with at least one record, for the reputation page. */
  allViews() {
    const keys = new Set(this.records.map((r) => `${r.subjectKind}::${r.subjectId}`));
    return [...keys].map((k) => {
      const [subjectKind, subjectId] = k.split("::");
      return this.view(subjectKind, subjectId);
    });
  }
  hydrate(records) {
    this.records = [...records];
  }
  export() {
    return [...this.records];
  }
};
function labelFor(rate, runs) {
  if (runs < 3) return `insufficient evidence (${runs} run${runs === 1 ? "" : "s"})`;
  if (rate >= 0.85) return "strong";
  if (rate >= 0.6) return "adequate";
  if (rate >= 0.35) return "weak";
  return "poor";
}

// src/mission/missionPlanner.ts
init_id();

// src/domain/frameworks.ts
var AGENT_FRAMEWORKS = [
  { id: "fw.pipeline", name: "Specialist Pipeline", category: "flow", description: "Plan \u2192 research \u2192 implement \u2192 test \u2192 review.", roster: ["agent.planner", "agent.researcher", "agent.coder", "agent.tester", "agent.reviewer"], pattern: "pipeline", notes: "Default engineering path." },
  { id: "fw.hierarchy", name: "Hierarchical Crew", category: "crew", description: "Supervisor assigns; specialists execute; supervisor merges.", roster: ["agent.supervisor", "agent.planner", "agent.coder", "agent.tester"], pattern: "hierarchy", notes: "Supervisor never does specialist work." },
  { id: "fw.debate", name: "Dialectic Debate", category: "quality", description: "Proposal vs critic vs judge.", roster: ["agent.planner", "agent.critic", "agent.judge"], pattern: "debate", notes: "Steelman then attack." },
  { id: "fw.redblue", name: "Red / Blue", category: "security", description: "Attacker framing vs defender; judge binds.", roster: ["agent.security", "agent.reviewer", "agent.judge"], pattern: "debate", notes: "No exploit payloads." },
  { id: "fw.mapreduce", name: "Map\u2013Reduce Research", category: "knowledge", description: "Fan-out researchers, synthesizer reduces.", roster: ["agent.planner", "agent.researcher", "agent.researcher", "agent.synthesizer"], pattern: "map-reduce", notes: "Conflicts are first-class." },
  { id: "fw.swarm", name: "Peer Swarm", category: "crew", description: "Peers work in parallel; synthesizer only merges.", roster: ["agent.coder", "agent.docs", "agent.security", "agent.synthesizer"], pattern: "swarm", notes: "No supervisor. Merge is explicit." },
  { id: "fw.pair", name: "Pair Programming", category: "engineering", description: "Driver implements, tester verifies, navigator reviews.", roster: ["agent.coder", "agent.tester", "agent.reviewer"], pattern: "pair", notes: "Navigator does not rewrite. Roster is typed: Coder.result(AgentResult) -> Tester.subject, Tester.report(Evaluation) -> Reviewer.workProduct." },
  { id: "fw.council", name: "Council / Jury", category: "quality", description: "Three specialists score; judge binds.", roster: ["agent.critic", "agent.reviewer", "agent.qa", "agent.judge"], pattern: "council", notes: "Majority is not automatic \u2014 judge explains dissent." },
  { id: "fw.shadow", name: "Shadow Harness", category: "eval", description: "Same task on two harnesses; synthesizer diffs.", roster: ["agent.coder", "agent.coder", "agent.synthesizer"], pattern: "shadow", notes: "Set different harnesses on the two coders." },
  { id: "fw.specdriven", name: "Spec-Driven", category: "engineering", description: "Architect \u2192 contract \u2192 implement \u2192 verify.", roster: ["agent.architect", "agent.planner", "agent.coder", "agent.tester", "agent.qa"], pattern: "pipeline", notes: "Code is illegal before the contract." },
  { id: "fw.incident", name: "Incident Command", category: "ops", description: "Commander, debugger, SRE, coder, human gate.", roster: ["agent.supervisor", "agent.debugger", "agent.preset.sre", "agent.coder", "control.approval"], pattern: "hierarchy", notes: "Destructive actions require approval." },
  { id: "fw.socratic", name: "Socratic", category: "quality", description: "Critic only asks; author revises; judge scores.", roster: ["agent.critic", "agent.reflection", "agent.judge"], pattern: "loop", notes: "Bounded revisions." },
  { id: "fw.ensemble", name: "Ensemble Vote", category: "quality", description: "Three independent answers; synthesizer + judge.", roster: ["agent.custom", "agent.custom", "agent.custom", "agent.synthesizer", "agent.judge"], pattern: "council", notes: "Independence is the point \u2014 no shared scratch." },
  { id: "fw.scoutact", name: "Scout then Act", category: "flow", description: "Researcher scouts; planner commits; coder acts.", roster: ["agent.researcher", "agent.planner", "agent.coder"], pattern: "pipeline", notes: "No coding before evidence." },
  { id: "fw.adversarial-review", name: "Adversarial Review", category: "quality", description: "Author, hostile critic, constructive reviewer, judge.", roster: ["agent.coder", "agent.critic", "agent.reviewer", "agent.judge"], pattern: "debate", notes: "Hostile and constructive are different jobs." },
  { id: "fw.contract-net", name: "Contract Net", category: "crew", description: "Router auctions work; specialists bid via plans; supervisor awards.", roster: ["agent.router", "agent.planner", "agent.planner", "agent.supervisor", "agent.coder"], pattern: "hierarchy", notes: "Award is explicit." },
  { id: "fw.blackboard", name: "Blackboard", category: "crew", description: "Shared memory; specialists post; synthesizer reads the board.", roster: ["agent.researcher", "agent.architect", "agent.security", "agent.synthesizer"], pattern: "swarm", notes: "Enable memory on every node. Same team key." },
  { id: "fw.war-room", name: "War Room", category: "ops", description: "Supervisor, security, SRE, debugger, human approval.", roster: ["agent.supervisor", "agent.security", "agent.preset.sre", "agent.debugger", "control.approval"], pattern: "hierarchy", notes: "Time-boxed. No silent changes." },
  { id: "fw.producer-gate", name: "Producer \u2192 Reviewer \u2192 Gate", category: "flow", description: "Make, review, QA gate, optional human.", roster: ["agent.coder", "agent.reviewer", "agent.qa", "control.approval"], pattern: "gate", notes: "QA cannot rewrite the work." },
  { id: "fw.recursive", name: "Recursive Decompose", category: "flow", description: "Planner splits; parallel specialists; synthesizer.", roster: ["agent.planner", "control.parallel", "agent.coder", "agent.docs", "control.merge", "agent.synthesizer"], pattern: "map-reduce", notes: "Control nodes are real traffic." },
  { id: "fw.canary", name: "Canary then Full", category: "engineering", description: "Small coder pass, tester, then full coder.", roster: ["agent.coder", "agent.tester", "agent.coder", "agent.qa"], pattern: "pipeline", notes: "Second coder sees the canary evidence." },
  { id: "fw.dual-control", name: "Dual Control", category: "risk", description: "Two independent agents must agree; else human.", roster: ["agent.security", "agent.reviewer", "agent.judge", "control.approval"], pattern: "gate", notes: "Disagreement is a stop, not a merge." },
  { id: "fw.knowledge-distill", name: "Knowledge Distill", category: "learning", description: "Run \u2192 reflection \u2192 evolution propose. Never auto-invariants.", roster: ["agent.coder", "agent.reflection", "agent.evolution"], pattern: "loop", notes: "Evolution SUGGEST only." },
  { id: "fw.handoff-chain", name: "Handoff Chain", category: "flow", description: "Each agent writes a handoff packet for the next identity.", roster: ["agent.researcher", "agent.architect", "agent.coder", "agent.docs", "agent.qa"], pattern: "pipeline", notes: "Handoff must be executable without the author." },
  { id: "fw.clinic", name: "Specialist Clinic", category: "crew", description: "Router sends to one of several enterprise specialists.", roster: ["agent.router", "agent.preset.legal", "agent.security", "agent.preset.data-analyst"], pattern: "hierarchy", notes: "Router classifies; only one clinic sees the case." },
  { id: "fw.triangulation", name: "Research Triangulation", category: "knowledge", description: "Three researchers, different angles; synthesizer; judge.", roster: ["agent.researcher", "agent.researcher", "agent.researcher", "agent.synthesizer", "agent.judge"], pattern: "map-reduce", notes: "Force independent sources." },
  { id: "fw.moe-router", name: "Mixture of Experts", category: "crew", description: "Router picks expert; expert works; critic checks routing.", roster: ["agent.router", "agent.custom", "agent.critic"], pattern: "hierarchy", notes: "Misroutes are feedback for the router." },
  { id: "fw.staged-approval", name: "Staged Approval", category: "risk", description: "Draft, internal review, human, then execute.", roster: ["agent.planner", "agent.reviewer", "control.approval", "agent.coder"], pattern: "gate", notes: "Coder does not run before approval." },
  { id: "fw.refine-loop", name: "Critic\u2013Refine Loop", category: "quality", description: "Make, attack, revise, bounded.", roster: ["agent.coder", "agent.critic", "agent.reflection", "agent.tester"], pattern: "loop", notes: "maxAttempts on reflection." },
  { id: "fw.docs-from-trace", name: "Docs from Trace", category: "engineering", description: "Coder, tester, docs from what actually ran.", roster: ["agent.coder", "agent.tester", "agent.docs", "agent.reviewer"], pattern: "pipeline", notes: "Docs may not invent APIs." },
  { id: "fw.security-gate", name: "Security Gate", category: "security", description: "Threat model, secure review, judge, human.", roster: ["agent.security", "agent.reviewer", "agent.judge", "control.approval"], pattern: "gate", notes: "Fail closed." },
  { id: "fw.local-offline", name: "Air-gapped Local", category: "local", description: "Planner + local LLM + synthesizer. No cloud.", roster: ["agent.planner", "agent.local", "agent.synthesizer"], pattern: "pipeline", notes: "Harness = llm / Ollama." },
  { id: "fw.enterprise-change", name: "Enterprise Change Advisory", category: "enterprise", description: "PM, architect, security, SRE, legal, CAB human.", roster: ["agent.preset.pm", "agent.architect", "agent.security", "agent.preset.sre", "agent.preset.legal", "control.approval"], pattern: "council", notes: "CAB is the human node." },
  { id: "fw.due-diligence", name: "Due Diligence", category: "enterprise", description: "Research, finance, legal, security, synthesizer, judge.", roster: ["agent.researcher", "agent.preset.data-analyst", "agent.preset.legal", "agent.security", "agent.synthesizer", "agent.judge"], pattern: "map-reduce", notes: "Conflicts stay visible." },
  { id: "fw.crew-cli", name: "Local CLI Crew", category: "engineering", description: "One Agent Crew node over Claude/Codex/OpenCode.", roster: ["agent.crew"], pattern: "swarm", notes: "Requires those CLIs on PATH." }
];
var FRAMEWORK_COUNT = AGENT_FRAMEWORKS.length;

// src/mission/missionPlanner.ts
var DOMAIN_RULES = [
  { domain: "saas-build", match: /\b(saas|web ?app|dashboard|product|platform|mvp)\b/i, why: "Product build" },
  { domain: "security", match: /\b(security|audit|threat|pentest|vulnerab|cve|compliance)\b/i, why: "Security work" },
  { domain: "research", match: /\b(research|investigate|analys|analyz|survey|literature|market)\b/i, why: "Research task" },
  { domain: "migration", match: /\b(migrat|upgrade|port\b|rewrit|modernis|moderniz)\b/i, why: "Migration" },
  { domain: "incident", match: /\b(incident|outage|postmortem|on-?call|rollback)\b/i, why: "Incident response" },
  { domain: "data", match: /\b(pipeline|etl|warehouse|dataset|dbt|streaming)\b/i, why: "Data engineering" },
  { domain: "content", match: /\b(content|copy|blog|documentation|docs|write)\b/i, why: "Content production" },
  { domain: "release", match: /\b(release|deploy|ship|launch|cut)\b/i, why: "Release engineering" }
];
var LANG_RULES = [
  { lang: "TypeScript", match: /\b(typescript|tsx?\b|node|react|next\.?js|vue|svelte)\b/i },
  { lang: "Python", match: /\b(python|django|flask|fastapi|pandas|pytorch)\b/i },
  { lang: "Rust", match: /\b(rust|cargo|tokio)\b/i },
  { lang: "Go", match: /\b(go|golang)\b/i },
  { lang: "SQL", match: /\b(sql|postgres|mysql|sqlite|database|schema)\b/i },
  { lang: "Infrastructure", match: /\b(terraform|kubernetes|docker|aws|gcp|azure|helm)\b/i }
];
function analyseObjective(req) {
  const text = [req.objective, ...req.constraints, ...req.successCriteria].join("\n");
  const evidence = [];
  const domains = [];
  for (const rule of DOMAIN_RULES) {
    if (rule.match.test(text)) {
      domains.push(rule.domain);
      evidence.push(`${rule.why}: matched /${rule.match.source}/`);
    }
  }
  const languages = LANG_RULES.filter((l) => l.match.test(text)).map((l) => l.lang);
  if (req.languages?.length) {
    for (const l of req.languages) if (!languages.includes(l)) languages.push(l);
  }
  if (languages.length) evidence.push(`Languages detected: ${languages.join(", ")}`);
  const hasCode = languages.length > 0 || domains.includes("saas-build") || domains.includes("migration") || /\b(implement|build|code|feature|api|service)\b/i.test(text);
  return {
    domain: domains[0] ?? "general",
    needsArchitecture: hasCode && (domains.includes("saas-build") || domains.includes("migration") || /\b(architect|design|system|scale|schema)\b/i.test(text)),
    needsSecurity: domains.includes("security") || /\b(secur|auth|permission|credential|pii|gdpr|compliance)\b/i.test(text),
    needsTests: hasCode || /\b(test|qa|verif|quality|regression)\b/i.test(text),
    needsResearch: domains.includes("research") || domains.includes("data") || /\b(research|unknown|explore|compare|evaluate options)\b/i.test(text),
    needsBrowser: /\b(browse|scrape|crawl|web page|screenshot|e2e)\b/i.test(text),
    needsData: domains.includes("data") || /\b(dataset|csv|database|query|metrics)\b/i.test(text),
    needsDocs: domains.includes("content") || /\b(document|docs|readme|changelog|report)\b/i.test(text),
    // "production-ready" describes something end users will run: that is release-shaped even
    // when the sentence never uses the word ship/deploy/publish.
    needsRelease: domains.includes("release") || /\b(release|deploy|ship|publish)\b/i.test(text) || /\bproduction[- ]?ready\b|\bgo[- ]?live\b|\bproduction\b/i.test(text),
    languages,
    evidence
  };
}
function selectFramework(req, sig) {
  const text = [req.objective, ...req.constraints].join(" ").toLowerCase();
  const scores = AGENT_FRAMEWORKS.map((fw) => {
    const why = [];
    let score = 0;
    if (req.preferredFramework === fw.id) {
      score += 100;
      why.push("explicitly preferred by the mission");
    }
    if (fw.category === "engineering" && (sig.domain === "saas-build" || sig.domain === "migration")) {
      score += 3;
      why.push(`engineering framework for ${sig.domain}`);
    }
    if (fw.category === "security" && sig.needsSecurity) {
      score += 4;
      why.push("security work required");
    }
    if (fw.category === "knowledge" && sig.needsResearch) {
      score += 4;
      why.push("research required");
    }
    if (fw.category === "risk" && (sig.needsRelease || sig.needsSecurity)) {
      score += 3;
      why.push("risk gating required");
    }
    if (fw.pattern === "gate" && req.autonomy !== "AUTONOMOUS") {
      score += 2;
      why.push(`autonomy=${req.autonomy} benefits from an explicit gate`);
    }
    if (fw.pattern === "map-reduce" && sig.needsResearch) {
      score += 2;
      why.push("fan-out suits independent research");
    }
    if (fw.id === "fw.specdriven" && sig.domain === "saas-build") {
      score += 3;
      why.push("spec-driven suits a product build");
    }
    if (fw.id === "fw.due-diligence" && sig.domain === "research") {
      score += 2;
      why.push("due-diligence shape suits investigation");
    }
    const staffable = fw.roster.filter((r) => DEFINITIONS_BY_ID.has(r)).length;
    if (staffable < fw.roster.length) {
      score -= 10 * (fw.roster.length - staffable);
      why.push(`${fw.roster.length - staffable} roster member(s) unresolvable`);
    }
    if (/\bcrew\b/.test(text) && fw.id === "fw.crew-cli") {
      score += 5;
      why.push("user asked for a CLI crew");
    }
    return { id: fw.id, score, why };
  }).sort((a, b) => b.score - a.score);
  return { frameworkId: scores[0].id, scores };
}
function buildSteps(sig, req) {
  const steps = [];
  let i = 0;
  const idx = () => i++;
  const research = sig.needsResearch ? idx() : -1;
  if (research >= 0) {
    steps[research] = {
      kind: "research",
      agentDefId: "agent.researcher",
      title: "Research",
      purpose: `Establish what is actually known about: ${req.objective}. Cite evidence, mark unknowns, list the options that were rejected and why.`,
      capabilities: ["research", "synthesis"],
      preferredHarness: null,
      dependsOn: [],
      rationale: "The objective contains unknowns; planning without research would guess."
    };
  }
  const arch = sig.needsArchitecture ? idx() : -1;
  if (arch >= 0) {
    steps[arch] = {
      kind: "architecture",
      agentDefId: "agent.architect",
      title: "Architecture",
      purpose: `Produce a concrete architecture for: ${req.objective}. Name the components, the data model, the interfaces, the failure modes and the trade-offs taken.`,
      capabilities: ["architecture", "design"],
      preferredHarness: null,
      dependsOn: research >= 0 ? [research] : [],
      rationale: "A build of this shape needs an explicit design before code, so failures surface as design arguments rather than test failures."
    };
  }
  const impl = idx();
  steps[impl] = {
    kind: "implementation",
    agentDefId: "agent.coder",
    title: "Implementation",
    purpose: `Implement: ${req.objective}. Follow the architecture where one exists. Produce runnable code plus the exact commands used to build it.`,
    capabilities: ["coding", sig.languages[0]?.toLowerCase() ?? "coding"].filter(Boolean),
    // The arbitrator decides the harness; we only express a preference when the language is
    // strongly associated with one.
    preferredHarness: null,
    dependsOn: arch >= 0 ? [arch] : research >= 0 ? [research] : [],
    rationale: "Core delivery step."
  };
  let test = -1;
  if (sig.needsTests) {
    test = idx();
    steps[test] = {
      kind: "test",
      agentDefId: "agent.tester",
      title: "Verification",
      purpose: `Verify the implementation against: ${req.successCriteria.join("; ") || req.objective}. Run the tests, record actual command output, and report failures verbatim.`,
      capabilities: ["testing", "verification"],
      preferredHarness: null,
      dependsOn: [impl],
      rationale: "An agent must never be the sole authority on its own success (\xA718); this is the independent check."
    };
  }
  let sec = -1;
  if (sig.needsSecurity) {
    sec = idx();
    steps[sec] = {
      kind: "security",
      agentDefId: "agent.security",
      title: "Security review",
      purpose: `Review the implementation for injection, authorisation gaps, secret handling and unsafe defaults. No exploit payloads. Rank findings by exploitability.`,
      capabilities: ["security-review"],
      preferredHarness: null,
      dependsOn: test >= 0 ? [test] : [impl],
      rationale: "The objective touches security-sensitive surface."
    };
  }
  let review = -1;
  if (steps.length > 2 || sig.domain === "saas-build") {
    review = idx();
    steps[review] = {
      kind: "review",
      agentDefId: "agent.reviewer",
      title: "Independent review",
      purpose: `Review the produced work against the mission success criteria. Say what is missing. Do not rewrite it.`,
      capabilities: ["review"],
      preferredHarness: null,
      dependsOn: sec >= 0 ? [sec] : test >= 0 ? [test] : [impl],
      rationale: "A reviewer who did not produce the work is the cheapest independent signal available."
    };
  }
  let docs = -1;
  if (sig.needsDocs) {
    docs = idx();
    steps[docs] = {
      kind: "synthesis",
      agentDefId: "agent.docs",
      title: "Documentation",
      purpose: `Document what was actually built, from the trace. Do not invent APIs that were not implemented.`,
      capabilities: ["documentation"],
      preferredHarness: null,
      dependsOn: review >= 0 ? [review] : [impl],
      rationale: "The mission asks for written output."
    };
  }
  let synth = -1;
  if (steps.length >= 4) {
    synth = idx();
    steps[synth] = {
      kind: "synthesis",
      agentDefId: "agent.synthesizer",
      title: "Synthesis",
      purpose: `Merge the artifacts into one deliverable that answers: ${req.objective}. Surface conflicts between agents rather than smoothing them over.`,
      capabilities: ["synthesis"],
      preferredHarness: null,
      dependsOn: [docs >= 0 ? docs : review >= 0 ? review : impl],
      rationale: "More than three contributors produce overlapping output; something has to reconcile it."
    };
  }
  if (sig.needsRelease || req.autonomy === "HUMAN_ONLY") {
    const rel = idx();
    steps[rel] = {
      kind: "release",
      agentDefId: "control.approval",
      title: "Release gate",
      purpose: "Human decision on whether the mission outcome may be released.",
      capabilities: [],
      preferredHarness: null,
      dependsOn: [synth >= 0 ? synth : review >= 0 ? review : impl],
      rationale: sig.needsRelease ? "The objective includes shipping something." : "Mission runs in HUMAN_ONLY autonomy."
    };
  }
  return steps.filter((s) => Boolean(s));
}
function planMission(mission, req) {
  const request = {
    objective: mission.objective,
    constraints: mission.constraints,
    successCriteria: mission.successCriteria,
    budgetUsd: mission.budget.maxCostUsd,
    deadlineMs: mission.deadline ? new Date(mission.deadline).getTime() - Date.now() : null,
    autonomy: mission.riskPolicy.autonomy,
    languages: req?.languages,
    repository: req?.repository,
    preferredFramework: mission.preferredFramework,
    allowedHarnesses: mission.allowedHarnesses
  };
  const signals = analyseObjective(request);
  const { frameworkId, scores } = selectFramework(request, signals);
  const specs = buildSteps(signals, request);
  const warnings = [];
  const perStepUsd = request.budgetUsd > 0 ? request.budgetUsd / Math.max(1, specs.length) : 0;
  const steps = specs.map((s, n2) => {
    const def = DEFINITIONS_BY_ID.get(s.agentDefId);
    if (!def) warnings.push(`No node definition for ${s.agentDefId}; step "${s.title}" will be skipped at instantiation.`);
    const risk = classifyRisk(s.purpose, s.kind).risk;
    const needsHuman = s.kind === "release" || risk === "CRITICAL" || request.autonomy === "HUMAN_ONLY" || request.autonomy === "SUPERVISED" && risk === "HIGH";
    return {
      id: `step-${n2 + 1}`,
      kind: s.kind,
      title: s.title,
      agentDefId: s.agentDefId,
      purpose: s.purpose,
      requiredCapabilities: s.capabilities,
      languages: s.kind === "implementation" || s.kind === "test" ? signals.languages : [],
      preferredHarness: s.preferredHarness,
      dependsOn: s.dependsOn.map((d) => `step-${d + 1}`),
      estimatedCostUsd: Number(perStepUsd.toFixed(4)),
      estimatedMs: estimateMs(s.kind),
      risk: s.kind === "release" ? "HIGH" : risk,
      requiresApproval: needsHuman,
      rationale: s.rationale
    };
  });
  if (!steps.length) warnings.push("The planner produced no steps. The objective may be too vague to plan.");
  if (signals.needsBrowser && !mission.boundary.browser) {
    warnings.push("The objective implies browser use but the mission boundary disables it.");
  }
  if (request.deadlineMs && request.deadlineMs > 0) {
    const total = steps.reduce((s, x) => s + x.estimatedMs, 0);
    if (total > request.deadlineMs) {
      warnings.push(`Estimated ${Math.round(total / 6e4)} min of sequential work against a ${Math.round(request.deadlineMs / 6e4)} min deadline. Parallelise or reduce scope.`);
    }
  }
  const estimatedCostUsd = steps.reduce((s, x) => s + x.estimatedCostUsd, 0);
  if (estimatedCostUsd > request.budgetUsd) {
    warnings.push(`Plan estimates $${estimatedCostUsd.toFixed(2)} against a $${request.budgetUsd.toFixed(2)} budget.`);
  }
  const plan = {
    planId: uid("plan"),
    missionId: mission.missionId,
    version: 1,
    frameworkId,
    steps,
    verificationStrategy: verificationStrategy(signals, steps),
    approvalCheckpoints: steps.filter((s) => s.requiresApproval).map((s) => s.id),
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
    estimatedMs: steps.reduce((s, x) => s + x.estimatedMs, 0),
    requiresBrowser: signals.needsBrowser,
    workspaceRequirements: workspaceRequirements(signals),
    warnings,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { plan, signals, frameworkScores: scores };
}
function estimateMs(kind) {
  switch (kind) {
    case "research":
      return 9e4;
    case "architecture":
      return 12e4;
    case "implementation":
      return 3e5;
    case "test":
      return 12e4;
    case "security":
      return 12e4;
    case "review":
      return 9e4;
    case "synthesis":
      return 6e4;
    case "approval":
      return 0;
    case "release":
      return 0;
  }
}
function verificationStrategy(sig, steps) {
  const out = [];
  out.push("No agent declares its own success: every deliverable is checked by a step that did not produce it.");
  if (steps.some((s) => s.kind === "test")) {
    out.push("Tests are executed, not asserted. Recorded command output is the evidence.");
  }
  if (sig.languages.length) {
    out.push(`Static checks for ${sig.languages.join(", ")} (typecheck/lint) where a toolchain exists.`);
  }
  if (sig.needsSecurity) out.push("Security review with findings ranked by exploitability; no exploit payloads produced.");
  out.push("An independent reviewer states what is missing rather than restating what was done.");
  out.push("Checks that could not be measured are reported as unmeasured, never counted as passes.");
  return out;
}
function workspaceRequirements(sig) {
  const out = [];
  if (sig.languages.length) out.push(`Toolchain for ${sig.languages.join(", ")}`);
  if (sig.needsBrowser) out.push("A browser session with a scoped profile");
  if (sig.needsData) out.push("Readable dataset location");
  if (sig.needsRelease) out.push("Deployment target credentials (mission boundary must grant `credentials`)");
  if (!out.length) out.push("Workspace filesystem access only");
  return out;
}
function parallelWaves(steps) {
  const placed = /* @__PURE__ */ new Set();
  const waves = [];
  let remaining = [...steps];
  let guard = 0;
  while (remaining.length && guard++ < 100) {
    const wave = remaining.filter((s) => s.dependsOn.every((d) => placed.has(d)));
    if (!wave.length) {
      waves.push(remaining);
      break;
    }
    for (const s of wave) placed.add(s.id);
    remaining = remaining.filter((s) => !placed.has(s.id));
    waves.push(wave);
  }
  return waves;
}

// src/mission/negotiation.ts
init_id();
var NegotiationTable = class {
  threads = /* @__PURE__ */ new Map();
  open(input, recorder) {
    const thread = {
      threadId: uid("neg"),
      missionId: input.missionId,
      taskId: input.taskId ?? null,
      topic: input.topic,
      positions: [],
      resolution: null,
      decidedBy: null,
      decisionRationale: null,
      openedAt: (/* @__PURE__ */ new Date()).toISOString(),
      closedAt: null
    };
    this.threads.set(thread.threadId, thread);
    recorder.record({
      kind: "NEGOTIATION_OPENED",
      actor: input.openedBy,
      authority: "runtime",
      policy: "negotiation.open",
      reason: `Disagreement or decision required on: ${input.topic}`,
      subjectId: thread.threadId,
      data: { taskId: thread.taskId }
    });
    return thread;
  }
  /**
   * Record a position. A REJECT or CHALLENGE without evidence is refused: an objection you
   * cannot support does not get to block a mission.
   */
  position(input, recorder) {
    const thread = this.threads.get(input.threadId);
    if (!thread) throw new Error(`unknown negotiation thread ${input.threadId}`);
    if (thread.resolution) throw new Error(`thread ${input.threadId} is already ${thread.resolution}`);
    if ((input.kind === "REJECT" || input.kind === "CHALLENGE") && !input.evidence?.length) {
      throw new Error(
        `negotiation: ${input.agentTitle} cannot ${input.kind.toLowerCase()} without evidence. State what you observed.`
      );
    }
    if (input.kind === "ALTERNATIVE" && !input.proposal) {
      throw new Error(`negotiation: ${input.agentTitle} offered an alternative without stating it.`);
    }
    const pos = {
      positionId: uid("pos"),
      threadId: thread.threadId,
      agentId: input.agentId,
      agentTitle: input.agentTitle,
      kind: input.kind,
      statement: input.statement,
      evidence: input.evidence ?? [],
      proposal: input.proposal ?? null,
      at: (/* @__PURE__ */ new Date()).toISOString()
    };
    thread.positions.push(pos);
    recorder.record({
      kind: "NEGOTIATION_POSITION",
      actor: input.agentTitle,
      authority: `agent:${input.agentId}`,
      policy: "negotiation.position",
      reason: input.statement,
      evidence: pos.evidence,
      subjectId: thread.threadId,
      data: { position: pos.kind, proposal: pos.proposal }
    });
    return pos;
  }
  /** True when every participant who spoke has accepted and nobody has an open objection. */
  consensusReached(threadId) {
    const thread = this.threads.get(threadId);
    if (!thread) return { reached: false, objectors: [] };
    const objectors = [];
    const lastByAgent = /* @__PURE__ */ new Map();
    for (const p2 of thread.positions) lastByAgent.set(p2.agentId, p2);
    for (const p2 of lastByAgent.values()) {
      if (p2.kind === "REJECT" || p2.kind === "CHALLENGE") objectors.push(p2.agentTitle);
    }
    const hasAccept = [...lastByAgent.values()].some((p2) => p2.kind === "ACCEPT");
    return { reached: objectors.length === 0 && hasAccept, objectors };
  }
  resolve(threadId, resolution, decidedBy, rationale, recorder) {
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`unknown negotiation thread ${threadId}`);
    thread.resolution = resolution;
    thread.decidedBy = decidedBy;
    thread.decisionRationale = rationale;
    thread.closedAt = (/* @__PURE__ */ new Date()).toISOString();
    recorder.record({
      kind: "NEGOTIATION_RESOLVED",
      actor: decidedBy,
      authority: resolution === "ESCALATED_HUMAN" ? "human" : resolution === "SUPERVISOR_DECIDED" ? "supervisor" : "consensus",
      policy: "negotiation.resolve",
      reason: rationale,
      subjectId: thread.threadId,
      data: { resolution, positions: thread.positions.length }
    });
    return thread;
  }
  get(threadId) {
    return this.threads.get(threadId) ?? null;
  }
  forMission(missionId) {
    return [...this.threads.values()].filter((t) => t.missionId === missionId);
  }
  openThreads(missionId) {
    return this.forMission(missionId).filter((t) => !t.resolution);
  }
  hydrate(threads) {
    for (const t of threads) this.threads.set(t.threadId, t);
  }
  export() {
    return [...this.threads.values()];
  }
  /** Render a thread the way the UI shows it. */
  static render(thread) {
    const lines = [`Topic: ${thread.topic}`, `Status: ${thread.resolution ?? "OPEN"}`];
    for (const p2 of thread.positions) {
      lines.push(`${p2.agentTitle} [${p2.kind}]: ${p2.statement}`);
      if (p2.proposal) lines.push(`  proposal: ${p2.proposal}`);
      for (const e of p2.evidence) lines.push(`  evidence: ${e}`);
    }
    if (thread.decisionRationale) lines.push(`Decision by ${thread.decidedBy}: ${thread.decisionRationale}`);
    return lines.join("\n");
  }
};

// src/mission/securityBoundary.ts
function auditBoundary(boundary) {
  const warnings = [];
  if (boundary.credentials && !boundary.deploymentTargets.length) {
    warnings.push("Credentials are granted but no deployment target is declared. Narrow this unless the mission really needs secrets.");
  }
  if (boundary.filesystemWrite && !boundary.allowedPaths.length && !boundary.deniedPaths.length) {
    warnings.push("Filesystem writes are allowed with no path scoping. Set allowedPaths to the workspace.");
  }
  if (boundary.shell && boundary.network && boundary.credentials) {
    warnings.push("Shell + network + credentials together allow exfiltration. Confirm the mission needs all three.");
  }
  return warnings;
}

// src/mission/missionRuntime.ts
function boundaryStatements(b) {
  return [
    `MAY${b.filesystemRead ? "" : " NOT"}: read files inside the workspace`,
    `MAY${b.filesystemWrite ? "" : " NOT"}: write files inside the workspace`,
    `MAY${b.shell ? "" : " NOT"}: run shell commands`,
    `MAY${b.network ? "" : " NOT"}: use the network`,
    `MAY${b.browser ? "" : " NOT"}: use a browser`,
    `MAY${b.mcp ? "" : " NOT"}: call MCP tools`,
    `MAY${b.codingAgents ? "" : " NOT"}: spawn coding agents`,
    `MAY${b.credentials ? "" : " NOT"}: touch stored credentials (never read their values)`
  ];
}
function createServices() {
  return {
    artifacts: new ArtifactStore(),
    approvals: new ApprovalGateService(),
    checkpoints: new CheckpointStore(),
    memory: new OrganizationMemory(),
    reputation: new ReputationLedger(),
    ledger: new HarnessLedger(),
    negotiations: new NegotiationTable()
  };
}
var MissionRuntime = class {
  mission;
  recorder;
  org;
  supervisor;
  resources;
  services;
  options;
  plan = null;
  planResult = null;
  teamBinding = null;
  graph;
  mutations = [];
  repairs = [];
  failures = [];
  taskToStep = /* @__PURE__ */ new Map();
  taskToNode = /* @__PURE__ */ new Map();
  completedNodeIds = /* @__PURE__ */ new Set();
  triedHarnesses = /* @__PURE__ */ new Map();
  triedStrategies = /* @__PURE__ */ new Map();
  repairCount = /* @__PURE__ */ new Map();
  /** §18 Real verification results for the target repository, measured once per mission. */
  realChecks = null;
  /** Monotonic id source for steps a repair adds, so a rollback can never recycle an id. */
  addedStepSeq = 0;
  repairInFlight = /* @__PURE__ */ new Set();
  repairExhausted = /* @__PURE__ */ new Set();
  cancelled = false;
  paused = false;
  startedAt = Date.now();
  finalArtifactIds = [];
  simulatedUsed = false;
  constructor(mission, services2, options = {}) {
    this.mission = mission;
    this.services = services2;
    this.options = {
      allowSimulated: false,
      maxRepairAttempts: mission.budget.maxRetriesPerTask,
      approvalTimeoutMs: 5 * 60 * 1e3,
      ...options
    };
    this.recorder = recorderFor(mission.missionId);
    this.org = new OrganizationRuntime(mission, this.recorder);
    this.supervisor = new OrganizationSupervisor(mission, this.org, this.recorder);
    this.resources = new ResourceManager(mission.budget, Date.now());
    this.graph = emptyGraph(mission);
    this.recorder.record({
      kind: "MISSION_CREATED",
      actor: "user",
      authority: "human",
      policy: "mission.create",
      reason: mission.objective,
      subjectId: mission.missionId,
      data: {
        name: mission.name,
        templateId: mission.templateId,
        autonomy: mission.riskPolicy.autonomy,
        budget: mission.budget,
        boundaryWarnings: auditBoundary(mission.boundary)
      }
    });
  }
  /* ------------------------------------------------------------------ §1 lifecycle */
  transition(to, reason, actor = "runtime") {
    if (this.mission.status === to) return;
    if (!canTransition(this.mission.status, to)) {
      throw new Error(`illegal mission transition ${this.mission.status} -> ${to} (${reason})`);
    }
    const from = this.mission.status;
    this.mission.status = to;
    this.mission.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.recorder.record({
      kind: "MISSION_STATUS",
      actor,
      authority: actor === "human" ? "human" : "policy:lifecycle",
      policy: "mission.lifecycle",
      reason,
      subjectId: this.mission.missionId,
      data: { from, to }
    });
  }
  /* ------------------------------------------------------------------ §2 planning */
  /** Plan the mission. Nothing executes. The plan is inspectable before anything runs. */
  prepare() {
    this.transition("PLANNING", "Planning the organization for this objective.");
    let agentsContextSummary = "";
    if (this.options.repository) {
      try {
        const ctx = collectAgentsContext(this.options.repository);
        if (ctx.docs.length > 0) {
          const headings = ctx.docs.flatMap((d) => d.sections.map((s) => `${d.file}#${s.heading ?? d.title}`));
          agentsContextSummary = `${ctx.docs.length} AGENTS.md file(s), ${headings.length} sections: ${headings.slice(0, 6).join(", ")}${headings.length > 6 ? "\u2026" : ""}`;
        } else {
          agentsContextSummary = "no AGENTS.md found in the workspace";
        }
      } catch (e) {
        agentsContextSummary = `AGENTS.md scan failed: ${e.message}`;
      }
    }
    this.planResult = planMission(this.mission, { repository: this.options.repository });
    this.plan = this.planResult.plan;
    this.buildGraphFromPlan(this.plan);
    let agentsMdSeeded = null;
    if (this.options.repository) {
      try {
        const input = {
          missionId: this.mission.missionId,
          objective: this.mission.objective,
          doneWhen: this.mission.successCriteria,
          boundaries: boundaryStatements(this.mission.boundary),
          tasks: (this.plan?.steps ?? []).slice(0, 12).map((step) => ({ title: `${step.id} ${step.title}`, kind: step.kind, checks: step.requiredCapabilities.includes("verify") ? ["run the step's own checks"] : [] }))
        };
        agentsMdSeeded = writeAgentsMd(this.options.repository, input);
      } catch {
        agentsMdSeeded = null;
      }
    }
    this.transition("READY", `Plan produced: ${this.plan.steps.length} steps, framework ${this.plan.frameworkId}.${agentsContextSummary ? ` Conventions: ${agentsContextSummary}.` : ""}`);
    this.recorder.record({
      kind: "MISSION_PLANNED",
      actor: "planner",
      authority: "policy:planning",
      policy: "mission.plan-inspectable",
      reason: `Framework ${this.plan.frameworkId} selected; ${this.plan.steps.length} steps proposed.`,
      evidence: this.planResult.signals.evidence,
      subjectId: this.plan.planId,
      data: {
        frameworkId: this.plan.frameworkId,
        steps: this.plan.steps.map((s) => ({ id: s.id, title: s.title, kind: s.kind, risk: s.risk, requiresApproval: s.requiresApproval, rationale: s.rationale })),
        waves: parallelWaves(this.plan.steps).length,
        estimatedCostUsd: this.plan.estimatedCostUsd,
        warnings: this.plan.warnings,
        frameworkScores: this.planResult.frameworkScores.slice(0, 5),
        agentsContext: agentsContextSummary || "no workspace",
        agentsMdSeeded: agentsMdSeeded ?? null
      }
    });
    if (this.options.team && this.plan) {
      this.teamBinding = bindTeamToPlan(this.options.team, this.plan.steps);
      applyTeamToSteps(this.plan.steps, this.teamBinding);
      this.recorder.record({
        kind: "HARNESS_SELECTED",
        actor: "team",
        authority: `team:${this.options.team.id}`,
        policy: "mission.team-bound",
        reason: `Bound to crew ${this.options.team.name}`,
        subjectId: null,
        data: {
          teamId: this.options.team.id,
          teamName: this.options.team.name,
          bound: this.teamBinding.bound,
          unbound: this.teamBinding.unbound,
          bindings: this.teamBinding.bindings
        }
      });
    }
    this.checkpoint("after planning", "The plan is fixed; this is the rollback point for any reorganization.");
    return this.plan;
  }
  getTeamBinding() {
    return this.teamBinding;
  }
  getPlan() {
    return this.plan;
  }
  getGraph() {
    return this.graph;
  }
  /* ------------------------------------------------------------------ §3 organization */
  /** Instantiate the organization from the plan. */
  buildOrganization() {
    if (!this.plan) throw new Error("call prepare() before buildOrganization()");
    const agents = [];
    for (const step of this.plan.steps) {
      if (step.agentDefId.startsWith("control.")) continue;
      if (this.org.byDefinition(step.agentDefId)) continue;
      if (!DEFINITIONS_BY_ID.has(step.agentDefId)) {
        this.recorder.record({
          kind: "POLICY_DENIED",
          actor: "planner",
          authority: "runtime",
          policy: "organization.spawn",
          reason: `No node definition for ${step.agentDefId}; step "${step.title}" has no agent.`,
          subjectId: step.id
        });
        continue;
      }
      try {
        agents.push(
          this.org.spawn({
            definitionId: step.agentDefId,
            purpose: step.purpose,
            nodeId: this.nodeIdForStep(step.id) ?? null,
            planStepId: step.id,
            spawnedBy: "planner",
            spawnReason: `Plan step "${step.title}" requires this role. ${step.rationale}`
          })
        );
      } catch (e) {
        this.recorder.record({
          kind: "POLICY_DENIED",
          actor: "planner",
          authority: "runtime",
          policy: "organization.concurrency",
          reason: e instanceof Error ? e.message : String(e),
          subjectId: step.id
        });
      }
    }
    tasksFromPlan(this.org, this.plan.steps);
    for (const task of this.org.tasks_()) {
      const step = this.plan.steps.find((s) => s.id === task.planStepId);
      if (step) {
        this.taskToStep.set(task.taskId, step);
        const nodeId = this.nodeIdForStep(step.id);
        if (nodeId) this.taskToNode.set(task.taskId, nodeId);
      }
    }
    return agents;
  }
  /* ------------------------------------------------------------------ §36 execution */
  /** Run to completion (or to a block the runtime cannot resolve). */
  async run() {
    if (!this.plan) this.prepare();
    if (!this.org.agents().length) this.buildOrganization();
    this.transition("RUNNING", "Organization instantiated; executing the plan.");
    this.mission.startedAt = this.mission.startedAt ?? (/* @__PURE__ */ new Date()).toISOString();
    this.startedAt = Date.now();
    let guard = 0;
    while (!this.cancelled && guard++ < 200) {
      while (this.paused && !this.cancelled) await sleep2(50);
      this.resources.spend({ wallClockMs: 0 });
      const violation = this.resources.maySpend(0, this.org.agentsInState("ACTIVE").length);
      if (violation) {
        this.recorder.record({
          kind: "RESOURCE_LIMIT",
          actor: "resource-manager",
          authority: "policy:budget",
          policy: `budget.${violation.limit}`,
          reason: `${violation.limit} ceiling reached: ${violation.value} of ${violation.ceiling}.`,
          subjectId: this.mission.missionId,
          data: { ...violation }
        });
        this.transition("BLOCKED", `Budget ceiling ${violation.limit} reached. A human must raise it or stop the mission.`);
        break;
      }
      const signals = this.detect();
      const recommendations = this.supervisor.recommend(signals);
      for (const rec of recommendations) {
        if (rec.autoExecutable) await this.executeRecommendation(rec.id);
      }
      if (this.org.isDone()) break;
      const wave = this.org.dispatchableWave();
      if (!wave.length) {
        if (this.org.hasUnrecoverable() && !this.services.approvals.pendingForMission(this.mission.missionId).length) {
          const diagnosis = this.supervisor.diagnoseOrganization(this.failures, this.plan);
          if (diagnosis.reorganize && this.mission.riskPolicy.allowReorganization) {
            await this.reorganize(diagnosis.reason, diagnosis.evidence);
            continue;
          }
          this.transition("BLOCKED", "A task exhausted its repair budget and no further automated strategy applies.");
          break;
        }
        if (this.org.tasksInState("PENDING", "ASSIGNED", "RUNNING").length === 0) break;
        if (this.services.approvals.pendingForMission(this.mission.missionId).length) {
          this.transition("BLOCKED", "Waiting on a human approval gate.");
          await this.drainApprovals();
          this.transition("RUNNING", "Approval resolved; resuming.");
          continue;
        }
        const deadlock = this.failures.find((f) => f.kind === "DEPENDENCY_DEADLOCK");
        this.transition("BLOCKED", deadlock ? `Dependency deadlock: ${deadlock.detail}` : "No dispatchable task remains.");
        break;
      }
      for (const task of wave) {
        if (this.cancelled) break;
        await this.executeTask(task.taskId);
      }
    }
    return this.finish();
  }
  /** Execute one task end to end: arbitrate, gate, run, evaluate, repair if needed. */
  async executeTask(taskId) {
    const task = this.org.task(taskId);
    if (!task) return;
    if (task.state === "DONE" || task.state === "CANCELLED") return;
    if (!this.org.dependenciesMet(task)) {
      this.org.setState(taskId, "PENDING", { actor: "runtime", reason: "waiting on dependencies" });
      return;
    }
    const step = this.taskToStep.get(taskId) ?? null;
    if (step?.requiresApproval || task.risk === "CRITICAL" || task.cls === "APPROVAL_GATED") {
      const approved = await this.requestApproval(task, step);
      if (!approved) {
        this.org.setState(taskId, "BLOCKED", { error: "Awaiting or denied by human approval.", actor: "approval-gate" });
        return;
      }
    }
    const agent = this.pickAgentFor(task, step);
    if (!agent) {
      this.org.setState(taskId, "BLOCKED", {
        error: `missing capabilities: no roster member can perform "${task.title}"`,
        actor: "runtime"
      });
      return;
    }
    if (step?.requiresApproval || task.risk === "CRITICAL" || task.cls === "APPROVAL_GATED") {
      this.checkpoint(`before "${task.title}"`, "A human approved this risk-bearing action; this is the rollback point for it.");
    }
    this.org.delegate(taskId, agent.agentId, `Plan step "${step?.title ?? task.title}" assigned to ${agent.title}.`, "runtime");
    this.org.setState(taskId, "RUNNING", { actor: agent.agentId });
    if (!agent.harness) {
      const harness = this.arbitrate(task, step, agent);
      if (!harness) {
        this.org.setState(taskId, "FAILED", { error: "No eligible harness for this task.", actor: "arbitration" });
        await this.repair(taskId);
        return;
      }
    }
    const outcome = await this.invokeHarness(task, agent, step);
    if (outcome.simulated) this.simulatedUsed = true;
    const provenance = this.provenanceFor(agent, task, outcome);
    let artifact = null;
    if (outcome.text || !outcome.ok) {
      artifact = this.services.artifacts.create(
        {
          missionId: this.mission.missionId,
          name: `${task.title} \u2014 ${agent.title}`,
          content: outcome.ok ? outcome.text : `FAILED: ${outcome.error ?? "no output"}`,
          contentType: step?.kind === "test" ? "report" : "markdown",
          createdBy: agent.title,
          parentArtifactIds: task.inputArtifactIds,
          inputs: task.inputArtifactIds,
          provenance,
          taskId
        },
        this.recorder
      );
      this.org.addOutput(taskId, artifact.artifactId);
      this.finalArtifactIds.push(artifact.artifactId);
    }
    const evaluation = await this.evaluate(task, step, agent, outcome, artifact);
    if (artifact) this.services.artifacts.setEvaluation(artifact.artifactId, evaluation);
    this.recorder.record({
      kind: evaluation.passed ? "EVALUATION_PASSED" : "EVALUATION_FAILED",
      actor: "evaluation",
      authority: "policy:independent-evaluation",
      policy: "evaluation.no-self-certification",
      reason: evaluation.passed ? `All ${evaluation.checks.length} check(s) passed.` : evaluation.unmeasured.length ? `Not verified: ${evaluation.unmeasured.join("; ")}` : `Failed: ${evaluation.checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`,
      evidence: evaluation.checks.flatMap((c) => c.evidence).slice(0, 6),
      subjectId: artifact?.artifactId ?? taskId,
      data: { fullyMeasured: evaluation.fullyMeasured, checks: evaluation.checks.map((c) => ({ name: c.name, source: c.source, passed: c.passed, measured: c.measured })) }
    });
    this.services.ledger.record({
      missionId: this.mission.missionId,
      harness: agent.harness ?? "hermes",
      taskId,
      taskKind: step?.kind ?? "implementation",
      languages: step?.languages ?? [],
      repository: this.options.repository ?? this.mission.workspace,
      success: outcome.ok,
      independentlyVerified: evaluation.passed && evaluation.fullyMeasured,
      latencyMs: outcome.latencyMs,
      costUsd: outcome.costUsd,
      failureKind: outcome.ok ? null : "REPEATED_FAILURE"
    });
    this.services.reputation.note("agent", agent.definitionId, step?.kind ?? "general", evaluation.passed && evaluation.fullyMeasured, outcome.latencyMs);
    if (agent.harness) this.services.reputation.note("harness", agent.harness, step?.kind ?? "general", evaluation.passed && evaluation.fullyMeasured, outcome.latencyMs);
    this.org.recordWork(agent.agentId, {
      success: outcome.ok,
      tokensIn: Math.round(task.description.length / 4),
      tokensOut: Math.round((outcome.text?.length ?? 0) / 4),
      costUsd: outcome.costUsd,
      latencyMs: outcome.latencyMs
    });
    this.resources.spend({ costUsd: outcome.costUsd, tokens: Math.round((task.description.length + (outcome.text?.length ?? 0)) / 4) });
    if (outcome.ok && evaluation.passed) {
      this.org.setState(taskId, "DONE", { actor: agent.agentId, reason: `Completed and independently verified (${evaluation.checks.length} checks).` });
      const nodeId = this.taskToNode.get(taskId);
      if (nodeId) this.completedNodeIds.add(nodeId);
      this.services.memory.remember({
        scope: "AGENT",
        scopeKey: agent.definitionId,
        missionId: this.mission.missionId,
        kind: "what_worked",
        content: `${agent.title} delivered "${task.title}" via ${agent.harness ?? "in-process"}; verified by ${evaluation.checks.map((c) => c.name).join(", ")}.`,
        evidence: evaluation.checks.flatMap((c) => c.evidence).slice(0, 3),
        importance: 0.6
      });
      return;
    }
    const failedMeasured = evaluation.checks.filter((c) => c.measured && !c.passed).map((c) => c.name);
    if (outcome.ok && failedMeasured.length === 0) {
      this.org.setState(taskId, "DONE", {
        actor: "evaluation",
        reason: `Delivered but not independently verified \u2014 unmeasured: ${evaluation.unmeasured.join("; ")}.`
      });
      const nodeId = this.taskToNode.get(taskId);
      if (nodeId) this.completedNodeIds.add(nodeId);
      this.services.memory.remember({
        scope: "FAILURE",
        scopeKey: `${step?.kind ?? "task"}:unmeasured`,
        missionId: this.mission.missionId,
        kind: "what_failed",
        content: `"${task.title}" was accepted without independent verification: ${evaluation.unmeasured.join("; ")}. A future mission must run these checks for real.`,
        evidence: [`unmeasured=${evaluation.unmeasured.join("|")}`, `harness=${agent.harness ?? "in-process"}`],
        importance: 0.8
      });
      return;
    }
    this.org.setState(taskId, "FAILED", {
      error: outcome.error ?? (evaluation.unmeasured.length ? `Not independently verified: ${evaluation.unmeasured.join("; ")}` : "Evaluation failed."),
      actor: agent.agentId
    });
    this.recorder.record({
      kind: "AGENT_FAILED",
      actor: agent.agentId,
      authority: "runtime",
      policy: "task.failure",
      reason: outcome.error ?? "Evaluation did not pass.",
      subjectId: taskId,
      data: { attempts: task.attempts, harness: agent.harness }
    });
    await this.repair(taskId);
  }
  /* ------------------------------------------------------------------ §6 arbitration */
  arbitrate(task, step, agent) {
    if (!step) return null;
    try {
      const decision = selectHarness(
        {
          mission: this.mission,
          step,
          installed: this.options.installed ?? {},
          allowSimulated: this.options.allowSimulated,
          repository: this.options.repository
        },
        this.services.ledger
      );
      agent.harness = decision.chosen;
      this.org.setHarness(agent.agentId, agent.harness, `Arbitration selected ${decision.chosen} for "${task.title}".`, "arbitration", decision.rationale);
      return decision.chosen;
    } catch (e) {
      this.recorder.record({
        kind: "POLICY_DENIED",
        actor: "arbitration",
        authority: "policy:arbitration",
        policy: "arbitration.no-eligible-harness",
        reason: e instanceof Error ? e.message : String(e),
        subjectId: task.taskId
      });
      return null;
    }
  }
  async invokeHarness(task, agent, step) {
    const harness = getHarness(agent.harness ?? "hermes");
    if (!harness) {
      return { ok: false, text: "", exitCode: null, latencyMs: 0, costUsd: 0, simulated: false, detail: "unknown harness", error: `unknown harness ${String(agent.harness)}` };
    }
    const prompt = [
      agent.contract.identity,
      "",
      `# Purpose`,
      agent.contract.purpose,
      "",
      `# Task`,
      task.title,
      task.description,
      "",
      `# Success criteria`,
      ...agent.contract.successCriteria.map((c) => `- ${c}`),
      "",
      "Report only what you actually did. If you could not verify something, say so."
    ].join("\n");
    const harnessTask = {
      taskId: task.taskId,
      title: task.title,
      prompt,
      kind: step?.kind ?? "implementation",
      languages: step?.languages ?? [],
      cwd: this.mission.workspace,
      timeoutMs: agent.contract.timeoutMs,
      requiredCapabilities: step?.requiredCapabilities ?? [],
      risk: task.risk,
      mayWriteFiles: agent.contract.permissions.filesystemWrite,
      mayRunShell: agent.contract.permissions.shell,
      mayUseBrowser: agent.contract.permissions.browser,
      grantedPermissions: { ...agent.contract.permissions }
    };
    const policy = "policy" in harness && typeof harness.policy === "function" ? harness.policy(harnessTask) : null;
    if (policy) {
      harnessTask.prompt = `${preambleFor(harnessTask, policy)}

${prompt}`;
      this.recorder.record({
        kind: "HARNESS_SELECTED",
        actor: "runtime",
        authority: `policy:risk-${task.risk}`,
        policy: `sandbox.${policy.readOnly ? "read-only" : "workspace-write"}`,
        reason: `${agent.harness ?? "hermes"} will run "${task.title}" with: ${policy.argv.join(" ")}`,
        evidence: [`risk=${task.risk}`, policy.grant, ...policy.refused ? [`REFUSED: ${policy.refused}`] : []],
        subjectId: task.taskId,
        data: { argv: policy.argv, readOnly: policy.readOnly, canWrite: policy.canWrite, refused: policy.refused }
      });
    }
    return harness.invoke(harnessTask);
  }
  /* ------------------------------------------------------------------ §18 evaluation */
  async evaluate(task, step, agent, outcome, artifact) {
    const checks = [];
    const kind = step?.kind ?? "implementation";
    checks.push(
      check({
        name: `Self-report by ${agent.title}`,
        source: "AGENT_SELF_REPORT",
        passed: outcome.ok,
        score: outcome.ok ? 1 : 0,
        detail: outcome.ok ? "The producing agent reports success. This is not verification." : "The producing agent reports failure.",
        evidence: outcome.text ? [outcome.text.slice(0, 500)] : []
      })
    );
    const real = await this.realCheckResults();
    const realTest = real.find((r) => r.spec.source === "TEST_RUN");
    const realStatic = real.filter((r) => r.spec.source === "STATIC_CHECK");
    if (kind === "test" || kind === "implementation") {
      const cmd = kind === "test" ? "test suite" : "build";
      if (realTest?.didRun) {
        checks.push(testRunCheck(`${realTest.spec.command} ${realTest.spec.args.join(" ")}`, realTest.output, realTest.exitCode));
      } else if (realTest) {
        checks.push(unmeasuredCheck(`Test run: ${cmd}`, "TEST_RUN", `the repository's own test command could not be run: ${realTest.reason}`));
      } else if (outcome.simulated) {
        checks.push(unmeasuredCheck(`Test run: ${cmd}`, "TEST_RUN", "the runtime was MJ's labelled simulation, so no real command was executed"));
      } else {
        checks.push(testRunCheck(cmd, outcome.text, outcome.ok ? 0 : 1));
      }
    }
    if (kind === "implementation" || kind === "security") {
      const hasStaticEvidence = /\b(typecheck|tsc|eslint|ruff|mypy|clippy|lint)\b/i.test(outcome.text);
      if (realStatic.some((r) => r.didRun)) {
        for (const r of realStatic.filter((x) => x.didRun)) {
          checks.push(
            check({
              name: `Static checks: ${r.spec.label}`,
              source: "STATIC_CHECK",
              passed: r.exitCode === 0,
              score: r.exitCode === 0 ? 1 : 0,
              detail: `${r.spec.command} ${r.spec.args.join(" ")} exited ${r.exitCode ?? "?"} (${r.spec.discoveredFrom})`,
              evidence: [r.output.slice(0, 2e3)]
            })
          );
        }
      } else if (realStatic.length) {
        checks.push(unmeasuredCheck("Static checks", "STATIC_CHECK", `the repository's own static checks could not be run: ${realStatic[0].reason}`));
      } else if (!hasStaticEvidence) {
        checks.push(unmeasuredCheck("Static checks", "STATIC_CHECK", "no typecheck or lint output was produced"));
      } else {
        checks.push(check({ name: "Static checks", source: "STATIC_CHECK", passed: outcome.ok, score: outcome.ok ? 1 : 0, detail: "Static analysis output present in the result.", evidence: [outcome.text.slice(0, 500)] }));
      }
    }
    if (kind === "security") {
      const hasFindings = /\b(finding|severity|cve|vulnerab|risk)\b/i.test(outcome.text);
      checks.push(
        hasFindings ? check({ name: "Security review", source: "SECURITY_CHECK", passed: outcome.ok, score: outcome.ok ? 1 : 0, detail: "Findings recorded with severity.", evidence: [outcome.text.slice(0, 500)] }) : unmeasuredCheck("Security review", "SECURITY_CHECK", "no findings were recorded, so nothing was reviewed")
      );
    }
    const reviewer = this.org.agents().find(
      (a) => a.agentId !== agent.agentId && ["agent.reviewer", "agent.judge", "agent.qa", "agent.critic"].includes(a.definitionId) && a.state !== "REMOVED"
    );
    if (reviewer && artifact) {
      const review = this.reviewArtifact(reviewer, artifact);
      checks.push(
        check({
          name: `Independent review by ${reviewer.title}`,
          source: "INDEPENDENT_REVIEW",
          passed: review.passed,
          score: review.score,
          detail: review.detail,
          evidence: review.evidence
        })
      );
    } else if (kind !== "approval" && kind !== "release") {
      checks.push(unmeasuredCheck("Independent review", "INDEPENDENT_REVIEW", "no reviewer role exists in this organization"));
    }
    return evaluateArtifact({
      artifactId: artifact?.artifactId ?? task.taskId,
      kind,
      checks,
      selfReportedBy: agent.agentId
    });
  }
  /**
   * §18 The independent review. The reviewer is a different agent and it looks at the artifact,
   * not at what the producer said about it: substance, coverage of the mission's success
   * criteria, and the absence of any self-declared failure in the work product.
   */
  reviewArtifact(reviewer, artifact) {
    const content = artifact.content;
    const criteria = this.mission.successCriteria.filter((c) => c.trim().length > 0);
    const substantive = content.replace(/\s+/g, " ").trim().length >= 120;
    const concrete = /(```|\bfunction\b|\bclass\b|\bconst\b|\binterface\b|\bimport\b|\|)/.test(content);
    const covered = criteria.filter((c) => content.toLowerCase().includes(c.split(/\s+/).slice(0, 2).join(" ").toLowerCase()));
    const admitsFailure = /\b(failed|failing|error:|exception|cannot find|not implemented|todo:|fixme)\b/i.test(content);
    const findings = [];
    if (!substantive) findings.push("the artifact is too thin to review (under 120 characters of substance)");
    if (admitsFailure) findings.push("the work product itself records a failure or unfinished work");
    const score = Math.max(0, Math.round(((substantive ? 0.6 : 0) + (concrete ? 0.2 : 0) + (criteria.length ? covered.length / criteria.length * 0.2 : 0.2) + (admitsFailure ? 0 : 0)) * 100) / 100);
    return {
      passed: findings.length === 0,
      score,
      detail: findings.length ? `${reviewer.title} reviewed "${artifact.name}" and refused it: ${findings.join("; ")}.` : `${reviewer.title} reviewed "${artifact.name}": substantive (${content.length} chars)${concrete ? ", concrete content present" : ", no code or table present"}, ${covered.length}/${criteria.length} success criteria addressed, no failure admitted in the work product.`,
      evidence: [
        `reviewer=${reviewer.definitionId}`,
        `length=${content.length}`,
        `criteriaAddressed=${covered.length}/${criteria.length}`,
        `admitsFailure=${admitsFailure}`,
        content.slice(0, 240)
      ]
    };
  }
  /**
   * §18 Run the target repository's own verification, once per mission, and remember it. Running
   * a test suite per artifact would be wasteful and would make the evaluation depend on when in
   * the run an artifact happened to be produced.
   */
  async realCheckResults() {
    if (this.realChecks) return this.realChecks;
    const repoDir = this.options.repository ?? this.mission.workspace;
    if (!repoDir || repoDir === ".") {
      this.realChecks = [];
      return this.realChecks;
    }
    try {
      this.realChecks = await runAllChecks(repoDir);
    } catch (e) {
      this.realChecks = [];
      this.recorder.record({
        kind: "POLICY_DENIED",
        actor: "evaluation",
        authority: "policy:real-verification",
        policy: "evaluation.no-invented-results",
        reason: `Could not discover the repository's own verification commands in ${repoDir}: ${e instanceof Error ? e.message : String(e)}. Checks stay unmeasured rather than guessed.`,
        evidence: [`repository=${repoDir}`],
        subjectId: this.mission.missionId
      });
    }
    if (this.realChecks.length) {
      this.recorder.record({
        kind: "EVALUATION_STARTED",
        actor: "evaluation",
        authority: "policy:real-verification",
        policy: "evaluation.repository-own-commands",
        reason: `Ran the repository's own verification: ${this.realChecks.map((r) => `${r.spec.label}=${r.didRun ? `exit ${r.exitCode}` : "not run"}`).join(", ")}`,
        evidence: this.realChecks.map((r) => `${r.spec.discoveredFrom} -> ${r.didRun ? `exit ${r.exitCode}` : r.reason}`),
        subjectId: this.mission.missionId,
        data: { checks: this.realChecks.map((r) => ({ id: r.spec.id, didRun: r.didRun, exitCode: r.exitCode })) }
      });
    }
    return this.realChecks;
  }
  /* ------------------------------------------------------------------ §16 repair */
  async repair(taskId) {
    const task = this.org.task(taskId);
    if (!task) return;
    if (this.repairInFlight.has(taskId)) return;
    if (this.repairExhausted.has(taskId)) return;
    const count2 = (this.repairCount.get(taskId) ?? 0) + 1;
    this.repairCount.set(taskId, count2);
    if (count2 > this.options.maxRepairAttempts || this.repairs.length >= this.options.maxRepairAttempts * Math.max(1, this.org.tasks_().length)) {
      this.repairExhausted.add(taskId);
      this.recorder.record({
        kind: "FAILURE_DETECTED",
        actor: "supervisor",
        authority: "policy:repair-budget",
        policy: `budget.maxRetriesPerTask=${this.options.maxRepairAttempts}`,
        reason: `Repair budget exhausted for "${task.title}" after ${count2 - 1} attempt(s). Escalating instead of retrying.`,
        evidence: [`repairAttempts=${count2 - 1}`, `strategiesTried=${(this.triedStrategies.get(taskId) ?? []).join(", ")}`],
        subjectId: taskId,
        data: { failureKind: "TOOL_FAILURE_LOOP", severity: "CRITICAL" }
      });
      this.transition("BLOCKED", `Repair budget exhausted for "${task.title}". A human must decide.`);
      return;
    }
    this.repairInFlight.add(taskId);
    try {
      await this.repairInner(task, count2);
    } finally {
      this.repairInFlight.delete(taskId);
    }
  }
  async repairInner(task, attemptNumber) {
    const taskId = task.taskId;
    this.checkpoint(`before repairing "${task.title}"`, `Repair attempt ${attemptNumber}: the pre-repair organization state.`);
    const failure = {
      id: uid("fail"),
      missionId: this.mission.missionId,
      kind: "REPEATED_FAILURE",
      severity: task.attempts >= task.maxAttempts ? "ERROR" : "WARN",
      subject: taskId,
      detail: task.error ?? `Task "${task.title}" failed.`,
      evidence: [task.error ?? ""],
      detectedAt: (/* @__PURE__ */ new Date()).toISOString(),
      resolvedBy: null
    };
    this.failures.push(failure);
    const agent = task.agentId ? this.org.agent(task.agentId) : null;
    const tried = this.triedStrategies.get(taskId) ?? [];
    const choice = this.supervisor.nextRepairStrategy(task, tried, agent);
    if (!choice) {
      this.transition("BLOCKED", `No repair strategy remains for "${task.title}".`);
      return;
    }
    this.triedStrategies.set(taskId, [...tried, choice.strategy]);
    const attempt = {
      attemptId: uid("rep"),
      missionId: this.mission.missionId,
      taskId,
      failureId: failure.id,
      strategy: choice.strategy,
      order: attemptNumber,
      rationale: choice.rationale,
      changes: [],
      expectedImprovement: "",
      result: "PENDING",
      detail: "",
      costUsd: 0,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      finishedAt: null
    };
    this.repairs.push(attempt);
    this.transition("REPAIRING", `Repair ${choice.strategy} for "${task.title}".`);
    this.recorder.record({
      kind: "REPAIR_STARTED",
      actor: "supervisor",
      authority: "supervisor",
      policy: `repair.${choice.strategy}`,
      reason: choice.rationale,
      evidence: failure.evidence,
      subjectId: attempt.attemptId,
      data: { strategy: choice.strategy, taskId, attempt: attempt.order, failure: failure.detail }
    });
    try {
      const result = await this.applyRepair(choice.strategy, task, agent, failure);
      attempt.result = result.ok ? "SUCCESS" : "FAILURE";
      attempt.detail = result.detail;
      attempt.changes = result.changes;
      attempt.expectedImprovement = result.expectedImprovement;
      attempt.costUsd = result.costUsd;
    } catch (e) {
      attempt.result = "FAILURE";
      attempt.detail = e instanceof Error ? e.message : String(e);
    }
    attempt.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.resources.spend({ costUsd: attempt.costUsd, retries: 1 });
    this.recorder.record({
      kind: "REPAIR_COMPLETED",
      actor: "supervisor",
      authority: "supervisor",
      policy: `repair.${choice.strategy}`,
      reason: attempt.detail,
      evidence: attempt.changes,
      subjectId: attempt.attemptId,
      data: { strategy: choice.strategy, result: attempt.result, costUsd: attempt.costUsd, expectedImprovement: attempt.expectedImprovement }
    });
    if (attempt.result === "SUCCESS") {
      this.services.memory.remember({
        scope: "FAILURE",
        scopeKey: choice.strategy,
        missionId: this.mission.missionId,
        kind: "repair_strategy",
        content: `${choice.strategy} repaired "${task.title}": ${attempt.detail}`,
        importance: 0.7,
        evidence: attempt.changes
      });
      this.transition("RUNNING", `Repair ${choice.strategy} succeeded; resuming.`);
      const after = this.org.task(taskId);
      if (after && after.state !== "DONE" && this.org.dependenciesMet(after)) await this.executeTask(taskId);
    } else {
      this.transition("RUNNING", `Repair ${choice.strategy} did not resolve it; the ladder continues.`);
    }
  }
  async applyRepair(strategy, task, agent, failure) {
    switch (strategy) {
      case "RETRY": {
        this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "supervisor" });
        return { ok: true, detail: "Task reset to PENDING for another attempt.", changes: ["state: FAILED -> PENDING"], expectedImprovement: "A transient failure will not repeat.", costUsd: 0 };
      }
      case "ENRICH_CONTEXT": {
        const prior = task.error ?? "";
        task.description = `${task.description}

## Previous failure (must be addressed)
${prior}

## Acceptance criteria
${this.mission.successCriteria.map((c) => `- ${c}`).join("\n")}`;
        this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "supervisor" });
        return { ok: true, detail: "Task description enriched with the failure output and the acceptance criteria.", changes: ["description += failure + criteria"], expectedImprovement: "The agent addresses the specific failure instead of repeating it.", costUsd: 0 };
      }
      case "SWITCH_HARNESS": {
        const tried = this.triedHarnesses.get(task.taskId) ?? [];
        if (agent?.harness) tried.push(agent.harness);
        this.triedHarnesses.set(task.taskId, tried);
        const step = this.taskToStep.get(task.taskId) ?? null;
        if (!step || !agent) return { ok: false, detail: "No plan step or agent to re-arbitrate.", changes: [], expectedImprovement: "", costUsd: 0 };
        const decision = selectReplacementHarness(
          { mission: this.mission, step, installed: this.options.installed ?? {}, allowSimulated: this.options.allowSimulated, repository: this.options.repository },
          this.services.ledger,
          tried
        );
        if (!decision) return { ok: false, detail: `No alternative harness after trying ${tried.join(", ") || "none"}.`, changes: [], expectedImprovement: "", costUsd: 0 };
        agent.harness = decision.chosen;
        this.org.setHarness(agent.agentId, agent.harness, `Switched runtime for "${task.title}" after failure.`, "supervisor", decision.rationale);
        this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "supervisor" });
        return { ok: true, detail: `Harness switched to ${decision.chosen}.`, changes: [`harness: ${tried[tried.length - 1] ?? "none"} -> ${decision.chosen}`], expectedImprovement: "A different runtime may handle this task shape better.", costUsd: 0 };
      }
      case "SPAWN_SPECIALIST": {
        const proposal = this.supervisor.proposeReplacement(failure);
        const defId = proposal?.definitionId ?? "agent.architect";
        const created = this.org.spawn({
          definitionId: defId,
          purpose: task.description,
          planStepId: task.planStepId,
          spawnedBy: "repair",
          spawnReason: `Repair: ${task.title} failed ${task.attempts}\xD7; escalating the role to ${defId}.`
        });
        this.org.reassign(task.taskId, created.agentId, `Specialist ${created.title} takes over.`, "supervisor");
        return { ok: true, detail: `Spawned ${created.title} (${defId}) and reassigned the task.`, changes: [`spawn ${defId}`, `reassign ${task.taskId}`], expectedImprovement: "A stronger role has the capability the previous agent lacked.", costUsd: 0 };
      }
      case "SPLIT_TASK": {
        const halves = [
          { title: `${task.title} \u2014 part 1`, description: task.description.split("\n").slice(0, Math.ceil(task.description.split("\n").length / 2)).join("\n") },
          { title: `${task.title} \u2014 part 2`, description: task.description.split("\n").slice(Math.ceil(task.description.split("\n").length / 2)).join("\n") }
        ];
        const children = this.org.split(task.taskId, halves, `Repair: "${task.title}" is large enough to split.`, "supervisor");
        return { ok: true, detail: `Split into ${children.length} subtasks.`, changes: children.map((c) => `+ ${c.title}`), expectedImprovement: "Smaller units are more likely to succeed and easier to diagnose.", costUsd: 0 };
      }
      case "REDUCE_SCOPE": {
        task.description = `${task.description}

## Reduced scope
Deliver the smallest increment that satisfies: ${this.mission.successCriteria[0] ?? this.mission.objective}. Mark the rest as not done.`;
        this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "supervisor" });
        return { ok: true, detail: "Scope reduced to the smallest verifiable increment.", changes: ["description += reduced scope"], expectedImprovement: "A smaller deliverable is verifiable now rather than never.", costUsd: 0 };
      }
      case "ROLLBACK_CHECKPOINT": {
        const cp = this.services.checkpoints.latest(this.mission.missionId);
        if (!cp) return { ok: false, detail: "No checkpoint exists to roll back to.", changes: [], expectedImprovement: "", costUsd: 0 };
        this.restoreCheckpoint(cp.checkpointId, `Repair: rolling back to "${cp.label}".`);
        return { ok: true, detail: `Rolled back to checkpoint "${cp.label}".`, changes: [`graph v${this.mission.graphVersion} -> v${cp.graphVersion}`], expectedImprovement: "Return to the last known-good state before retrying.", costUsd: 0 };
      }
      case "REORGANIZE": {
        const diagnosis = this.supervisor.diagnoseOrganization(this.failures, this.plan);
        await this.reorganize(diagnosis.reason || `Repair: reorganizing around "${task.title}".`, diagnosis.evidence);
        return { ok: true, detail: "Organization restructured.", changes: ["graph mutated"], expectedImprovement: "The missing role or dependency is now present.", costUsd: 0 };
      }
      case "ESCALATE_HUMAN": {
        const approved = await this.requestApproval(
          { ...task, risk: "CRITICAL" },
          this.taskToStep.get(task.taskId) ?? null,
          `Every automated repair strategy failed for "${task.title}".`
        );
        if (approved) {
          this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "human" });
          return { ok: true, detail: "A human approved continuing; task reset.", changes: ["human approval"], expectedImprovement: "Human judgement unblocks what automation could not.", costUsd: 0 };
        }
        return { ok: false, detail: "Human escalation was not approved.", changes: [], expectedImprovement: "", costUsd: 0 };
      }
    }
  }
  /* ------------------------------------------------------------------ §17 reorganize */
  async reorganize(reason, evidence) {
    if (!this.plan) return;
    const diagnosis = this.supervisor.diagnoseOrganization(this.failures, this.plan);
    const nextSteps = [...this.plan.steps];
    for (const kind of diagnosis.addSteps) {
      if (nextSteps.some((s) => s.kind === kind)) continue;
      const defId = kind === "architecture" ? "agent.architect" : kind === "test" ? "agent.tester" : "agent.reviewer";
      nextSteps.push({
        // Unique by construction, even across a rollback: reusing "step-N" after a restore
        // created a second task for a step id that already existed.
        id: `step-x${++this.addedStepSeq}`,
        kind,
        title: kind === "architecture" ? "Architecture (added by repair)" : kind === "test" ? "Verification (added by repair)" : "Review (added by repair)",
        agentDefId: defId,
        purpose: `Added after repeated failure: ${reason}`,
        requiredCapabilities: kind === "architecture" ? ["architecture"] : kind === "test" ? ["testing"] : ["review"],
        languages: [],
        preferredHarness: null,
        dependsOn: nextSteps.length ? [nextSteps[nextSteps.length - 1].id] : [],
        estimatedCostUsd: 0.5,
        estimatedMs: 9e4,
        risk: "LOW",
        requiresApproval: false,
        rationale: `Repair added this role because ${reason}`
      });
    }
    const nextPlan = { ...this.plan, version: this.plan.version + 1, steps: nextSteps };
    const nextGraph = graphFromSteps(this.mission, nextSteps);
    const outcome = proposeMutation(
      {
        mission: this.mission,
        graph: this.graph,
        nextGraph,
        reason,
        evidence,
        requestedBy: "supervisor",
        authority: "SUPERVISOR",
        completedWork: completedTitles(this.graph, this.completedNodeIds)
      },
      this.recorder
    );
    this.mutations.push(outcome.mutation);
    if (!outcome.applied) {
      this.recorder.record({
        kind: "POLICY_DENIED",
        actor: "supervisor",
        authority: "policy:graph-mutation",
        policy: "graph.mutation-gates",
        reason: `Proposed reorganization refused: ${outcome.blockedBy}`,
        evidence,
        subjectId: outcome.mutation.mutationId
      });
      this.transition("BLOCKED", `Reorganization refused: ${outcome.blockedBy}`);
      return;
    }
    this.graph = nextGraph;
    this.mission.graphVersion = outcome.mutation.toGraphVersion;
    this.plan = nextPlan;
    this.resources.spend({ graphMutations: 1 });
    for (const step of nextSteps) {
      if (this.taskToStep.has(step.id)) continue;
      if (this.org.tasks_().some((t) => t.planStepId === step.id)) continue;
      if (!DEFINITIONS_BY_ID.has(step.agentDefId) || step.agentDefId.startsWith("control.")) continue;
      if (!this.org.byDefinition(step.agentDefId)) {
        try {
          this.org.spawn({
            definitionId: step.agentDefId,
            purpose: step.purpose,
            planStepId: step.id,
            spawnedBy: "supervisor",
            spawnReason: `Reorganization: ${reason}`
          });
        } catch {
        }
      }
      const deps = step.dependsOn.map((d) => [...this.taskToStep.entries()].find(([, s]) => s.id === d)?.[0]).filter((x) => Boolean(x));
      const task = this.org.createTask({ title: step.title, description: step.purpose, planStepId: step.id, dependsOn: deps, risk: step.risk });
      this.taskToStep.set(task.taskId, step);
      const nodeId = this.nodeIdForStep(step.id);
      if (nodeId) this.taskToNode.set(task.taskId, nodeId);
    }
    this.checkpoint("after reorganization", reason);
  }
  /* ------------------------------------------------------------------ §11 approvals */
  async requestApproval(task, step, extraReason) {
    const agent = task.agentId ? this.org.agent(task.agentId) : null;
    const gate = this.services.approvals.open(
      {
        mission: this.mission,
        requestedBy: agent?.title ?? "runtime",
        agentId: agent?.agentId ?? null,
        action: extraReason ? `${extraReason} \u2014 ${task.title}` : `${task.title}: ${task.description.slice(0, 200)}`,
        changes: [`${task.title} will run as ${agent?.title ?? "an agent"} with harness ${agent?.harness ?? "TBD"}`],
        evidence: [task.error ?? "no prior failure", ...step ? [`plan rationale: ${step.rationale}`] : []],
        expectedOutcome: this.mission.successCriteria.join("; ") || "The mission objective is advanced.",
        reversible: task.risk !== "CRITICAL",
        // The gate classifies the *action string*, which would score a task called "Release gate"
        // as MEDIUM and wave it through. The plan's classification is authoritative, so it is
        // handed to the gate as an override — the gate may still raise it, never lower it.
        riskOverride: {
          risk: task.risk,
          reason: `Classified ${task.risk} by the mission plan${step ? ` (step "${step.title}")` : ""}; the approval threshold for this mission is ${this.mission.riskPolicy.approvalThreshold}.`
        }
      },
      this.recorder
    );
    if (gate.autonomous) return true;
    if (!gate.request) return false;
    this.options.onApprovalRequired?.(gate.request.id);
    const decision = await this.services.approvals.waitFor(gate.request.id, this.options.approvalTimeoutMs, () => this.cancelled);
    return decision === "APPROVED";
  }
  async drainApprovals() {
    const pending = this.services.approvals.pendingForMission(this.mission.missionId);
    for (const req of pending) {
      await this.services.approvals.waitFor(req.id, this.options.approvalTimeoutMs, () => this.cancelled);
    }
  }
  /* ------------------------------------------------------------------ §5 detection */
  detect() {
    const found = detectAll({
      missionId: this.mission.missionId,
      agents: this.org.agents(),
      tasks: this.org.tasks_(),
      artifacts: this.services.artifacts.forMission(this.mission.missionId),
      repairs: this.repairs,
      usage: this.resources.export(),
      budget: this.mission.budget,
      now: Date.now(),
      taskAgeMs: this.org.taskAges()
    });
    for (const f of found) {
      if (!this.failures.some((x) => x.kind === f.kind && x.subject === f.subject)) this.failures.push(f);
    }
    return found;
  }
  async executeRecommendation(recId) {
    const rec = this.supervisor.list().find((r) => r.id === recId);
    if (!rec || rec.executed) return;
    switch (rec.kind) {
      case "ROLLBACK_CHECKPOINT": {
        const cp = this.services.checkpoints.latest(this.mission.missionId);
        if (cp) this.restoreCheckpoint(cp.checkpointId, rec.reason);
        break;
      }
      case "PAUSE_MISSION": {
        this.transition("PAUSED", rec.reason, "supervisor");
        break;
      }
      case "RETRY": {
        const task = rec.subjectId ? this.org.task(rec.subjectId) : null;
        if (task && task.state !== "DONE") this.org.setState(task.taskId, "PENDING", { error: void 0, actor: "supervisor" });
        break;
      }
      case "SWITCH_HARNESS":
      case "SPAWN_SPECIALIST": {
        if (rec.subjectId) await this.repair(rec.subjectId);
        break;
      }
      default:
        break;
    }
    this.supervisor.markExecuted(recId, rec.reason);
  }
  /* ------------------------------------------------------------------ §26 checkpoints */
  checkpoint(label, reason) {
    this.services.checkpoints.take(
      {
        missionId: this.mission.missionId,
        label,
        reason,
        graphVersion: this.mission.graphVersion,
        graphSnapshot: this.graph,
        taskStates: Object.fromEntries(this.org.tasks_().map((t) => [t.taskId, t.state])),
        artifactVersions: Object.fromEntries(
          this.services.artifacts.forMission(this.mission.missionId).map((a) => [a.lineageRoot, a.version])
        ),
        roster: this.org.agents().map((a) => ({ agentId: a.agentId, definitionId: a.definitionId, state: a.state })),
        pendingApprovalIds: this.services.approvals.pendingForMission(this.mission.missionId).map((a) => a.id),
        spentUsd: this.resources.usage.costUsd
      },
      this.recorder
    );
    this.mission.checkpointId = this.services.checkpoints.latest(this.mission.missionId)?.checkpointId ?? null;
  }
  restoreCheckpoint(checkpointId, reason) {
    const cp = this.services.checkpoints.rollbackTo(checkpointId, this.recorder, "supervisor", reason);
    if (!cp) return false;
    this.graph = structuredClone(cp.graphSnapshot);
    this.mission.graphVersion = cp.graphVersion;
    for (const [taskId, state] of Object.entries(cp.taskStates)) {
      const t = this.org.task(taskId);
      if (t && (t.state === "FAILED" || t.state === "BLOCKED" || t.state === "RUNNING")) {
        this.org.setState(taskId, state === "DONE" ? "PENDING" : state, { actor: "supervisor", reason });
      }
    }
    this.completedNodeIds = new Set(this.graph.nodes.filter((n2) => cp.taskStates[taskForNode(this, n2.id)] === "DONE").map((n2) => n2.id));
    return true;
  }
  /* ------------------------------------------------------------------ §25 pause/resume */
  pause(reason, actor = "human") {
    this.paused = true;
    this.transition("PAUSED", reason, actor);
  }
  resume(reason, actor = "human") {
    this.paused = false;
    this.transition("RUNNING", reason, actor);
  }
  cancel(reason) {
    this.cancelled = true;
    this.recorder.record({ kind: "MISSION_FAILED", actor: "human", authority: "human", policy: "mission.cancel", reason, subjectId: this.mission.missionId });
  }
  /** §25 Persist everything needed to resume without repeating completed work. */
  persist() {
    return {
      version: 6,
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      missionId: this.mission.missionId,
      agents: this.org.exportState().agents,
      tasks: this.org.exportState().tasks,
      taskUpdatedAt: this.org.exportState().taskUpdatedAt,
      artifacts: this.services.artifacts.export(),
      checkpoints: this.services.checkpoints.export(),
      approvals: this.services.approvals.export(),
      negotiations: this.services.negotiations.export(),
      recommendations: this.supervisor.exportState(),
      flightEvents: this.recorder.all(),
      usage: this.resources.export(),
      startedAt: this.startedAt,
      graphVersion: this.mission.graphVersion,
      graph: structuredClone(this.graph),
      completedNodeIds: [...this.completedNodeIds],
      pendingTaskIds: this.org.tasksInState("PENDING", "ASSIGNED", "RUNNING").map((t) => t.taskId)
    };
  }
  /** §25 Restore. Fails loudly rather than resuming into a half-restored mission. */
  restore(state) {
    const valid = validateRestoredState(state);
    if (!valid.ok || state.missionId !== this.mission.missionId) {
      return { ok: false, errors: valid.ok ? [`state belongs to ${state.missionId}, not ${this.mission.missionId}`] : valid.errors };
    }
    this.org.hydrate({ agents: state.agents, tasks: state.tasks, taskUpdatedAt: state.taskUpdatedAt });
    this.services.artifacts.hydrate(state.artifacts);
    this.services.checkpoints.hydrate(state.checkpoints);
    this.services.approvals.hydrate(state.approvals);
    this.services.negotiations.hydrate(state.negotiations);
    this.supervisor.hydrate(state.recommendations);
    this.resources.hydrate(state.usage, state.startedAt);
    this.graph = state.graph ?? this.graph;
    this.mission.graphVersion = state.graphVersion;
    this.completedNodeIds = new Set(state.completedNodeIds);
    const restoredEvents = this.recorder.seedHistory(state.flightEvents);
    this.recorder.record({
      kind: "MISSION_STATUS",
      actor: "runtime",
      authority: "policy:resume",
      policy: "mission.resume",
      reason: `Restored from checkpoint. ${state.completedNodeIds.length} node(s) already complete; their work is not repeated.`,
      subjectId: this.mission.missionId,
      data: { restoredEvents, pendingTasks: state.pendingTaskIds.length }
    });
    return { ok: true, errors: [] };
  }
  /* ------------------------------------------------------------------ §19 finish */
  finish() {
    if (this.plan) {
      const diagnosis = this.supervisor.diagnoseOrganization(this.failures, this.plan);
      if (diagnosis.reorganize) {
        const allowed = this.mission.riskPolicy.allowReorganization && this.mission.riskPolicy.allowGraphMutation;
        this.recorder.record({
          kind: allowed ? "GRAPH_MUTATED" : "POLICY_DENIED",
          actor: "supervisor",
          authority: "supervisor",
          policy: `allowReorganization=${this.mission.riskPolicy.allowReorganization};allowGraphMutation=${this.mission.riskPolicy.allowGraphMutation}`,
          reason: allowed ? `Structural gap noted and resolved during the run: ${diagnosis.reason}` : `Structural gap noted but the organization was not changed: ${diagnosis.reason}. ${allowed ? "" : "Reorganization or graph mutation is disabled by mission policy."}`,
          evidence: diagnosis.evidence.length ? diagnosis.evidence : [diagnosis.reason],
          subjectId: this.mission.missionId,
          data: { addSteps: diagnosis.addSteps, applied: false, missionEnded: true }
        });
      }
    }
    const tasks = this.org.tasks_();
    const done = tasks.filter((t) => t.state === "DONE").length;
    const artifacts = this.services.artifacts.forMission(this.mission.missionId);
    const allChecks = artifacts.flatMap((a) => a.evaluation?.checks ?? []);
    const criteriaMet = this.mission.successCriteria.filter(
      (c) => artifacts.some((a) => a.evaluation?.passed && a.content.toLowerCase().includes(c.split(" ")[0]?.toLowerCase() ?? ""))
    );
    const score = scoreMission({
      successCriteria: this.mission.successCriteria,
      criteriaMet,
      checks: allChecks,
      testChecks: allChecks.filter((c) => c.source === "TEST_RUN"),
      securityChecks: allChecks.filter((c) => c.source === "SECURITY_CHECK"),
      spentUsd: this.resources.usage.costUsd,
      budgetUsd: this.mission.budget.maxCostUsd,
      elapsedMs: Date.now() - this.startedAt,
      deadlineMs: this.mission.deadline ? new Date(this.mission.deadline).getTime() - new Date(this.mission.startedAt ?? this.mission.createdAt).getTime() : null,
      humanInterventions: this.recorder.count("APPROVAL_GRANTED") + this.recorder.count("APPROVAL_REJECTED"),
      regressionCount: this.failures.filter((f) => f.kind === "REGRESSION").length
    });
    const everyTaskDone = tasks.length > 0 && tasks.every((t) => t.state === "DONE" || t.state === "CANCELLED");
    const anyUnverified = artifacts.some((a) => a.evaluation && (!a.evaluation.passed || !a.evaluation.fullyMeasured));
    if (everyTaskDone && !anyUnverified && !this.simulatedUsed) {
      this.transition("VERIFYING", "All tasks complete; verifying before completion.");
      this.transition("COMPLETED", `Mission verified: ${done}/${tasks.length} tasks, all artifacts independently evaluated.`);
    } else if (everyTaskDone) {
      this.transition("VERIFYING", "All tasks complete; verification is incomplete.");
      this.transition("BLOCKED", buildIncompleteReason(artifacts, this.simulatedUsed));
    } else if (this.mission.status !== "BLOCKED" && this.mission.status !== "PAUSED") {
      this.transition("BLOCKED", `${tasks.length - done} task(s) unfinished.`);
    }
    this.mission.endedAt = this.mission.status === "COMPLETED" ? (/* @__PURE__ */ new Date()).toISOString() : this.mission.endedAt;
    this.services.memory.distil(this.mission.missionId, this.recorder);
    this.recorder.record({
      kind: this.mission.status === "COMPLETED" ? "MISSION_COMPLETED" : "MISSION_FAILED",
      actor: "runtime",
      authority: "policy:verification",
      policy: "mission.no-fake-success",
      reason: this.mission.status === "COMPLETED" ? `Verified completion: ${done}/${tasks.length} tasks, $${this.resources.usage.costUsd.toFixed(4)} spent.` : buildIncompleteReason(artifacts, this.simulatedUsed),
      evidence: score.unmeasured.map((u) => `unmeasured: ${u}`),
      subjectId: this.mission.missionId,
      data: { score, simulatedUsed: this.simulatedUsed }
    });
    return {
      missionId: this.mission.missionId,
      status: this.mission.status,
      score,
      finalArtifactIds: this.finalArtifactIds,
      failures: this.failures,
      repairs: this.repairs,
      mutations: this.mutations,
      approvals: this.services.approvals.forMission(this.mission.missionId),
      spentUsd: this.resources.usage.costUsd,
      durationMs: Date.now() - this.startedAt
    };
  }
  /* ------------------------------------------------------------------ helpers */
  pickAgentFor(task, step) {
    if (task.agentId) {
      const existing = this.org.agent(task.agentId);
      if (existing && existing.state !== "REMOVED" && existing.state !== "REPLACED") return existing;
    }
    if (step) {
      const byStep = this.org.agents().find((a) => a.state !== "REMOVED" && a.state !== "REPLACED" && this.plan?.steps.find((s) => s.id === a.taskIds[0])?.id === step.id);
      if (byStep) return byStep;
      const byDef = this.org.byDefinition(step.agentDefId);
      if (byDef) return byDef;
    }
    return this.org.agentsInState("IDLE", "ACTIVE")[0] ?? null;
  }
  provenanceFor(agent, task, outcome) {
    return {
      missionId: this.mission.missionId,
      taskId: task.taskId,
      agentId: agent.agentId,
      agentTitle: agent.title,
      harness: agent.harness ?? null,
      model: outcome.simulated ? "local-test (simulated)" : null,
      toolsUsed: outcome.simulated ? ["local-test"] : [String(agent.harness ?? "in-process")],
      mcpServersUsed: [],
      costUsd: outcome.costUsd,
      latencyMs: outcome.latencyMs,
      startedAt: new Date(Date.now() - outcome.latencyMs).toISOString(),
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  buildGraphFromPlan(plan) {
    this.graph = graphFromSteps(this.mission, plan.steps);
    this.mission.graphVersion = 1;
  }
  nodeIdForStep(stepId) {
    const step = this.plan?.steps.find((s) => s.id === stepId);
    if (!step) return null;
    return this.graph.nodes.find((n2) => n2.templateKey === stepId)?.id ?? null;
  }
  getFailures() {
    return [...this.failures];
  }
  getRepairs() {
    return [...this.repairs];
  }
  getMutations() {
    return [...this.mutations];
  }
  getEvents() {
    return this.recorder.all();
  }
  usage() {
    return this.resources.export();
  }
};
function emptyGraph(mission) {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    id: mission.missionId,
    name: mission.name,
    nodes: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    groups: [],
    notes: []
  };
}
function graphFromSteps(mission, steps) {
  const graph = emptyGraph(mission);
  const byStep = /* @__PURE__ */ new Map();
  steps.forEach((step, i) => {
    const def = DEFINITIONS_BY_ID.get(step.agentDefId);
    if (!def) return;
    const node = createNodeFromDef(def, `${step.id}-${uid("n").slice(-5)}`, 120 + i % 5 * 300, 120 + Math.floor(i / 5) * 220);
    node.templateKey = step.id;
    node.title = step.title;
    node.purpose = step.purpose;
    graph.nodes.push(node);
    byStep.set(step.id, node);
  });
  const startDef = DEFINITIONS_BY_ID.get("control.start");
  let startNode = null;
  if (startDef) {
    startNode = createNodeFromDef(startDef, `start-${uid("n").slice(-5)}`, 20, 120);
    startNode.title = "Mission objective";
    startNode.purpose = `Mission "${mission.name}" \u2014 ${mission.objective}`;
    graph.nodes.push(startNode);
  }
  const wire = (src, tgt, srcPortId, tgtPortId, dataType) => {
    graph.connections.push({
      id: uid("c"),
      sourceNodeId: src.id,
      sourcePortId: srcPortId,
      targetNodeId: tgt.id,
      targetPortId: tgtPortId,
      dataType,
      status: "idle"
    });
  };
  for (const step of steps) {
    const target = byStep.get(step.id);
    if (!target) continue;
    const upstream = step.dependsOn.map((d) => byStep.get(d)).filter((n2) => Boolean(n2));
    for (const port of target.inputs) {
      if (!port.required || graph.connections.some((c) => c.targetNodeId === target.id && c.targetPortId === port.id)) continue;
      let done = false;
      for (const src of upstream) {
        const out = src.outputs.find((o) => portsCompatible(o.dataType, port.dataType));
        if (!out) continue;
        wire(src, target, out.id, port.id, out.dataType);
        done = true;
        break;
      }
      if (!done && startNode) {
        const out = startNode.outputs.find((o) => portsCompatible(o.dataType, port.dataType));
        if (out) {
          wire(startNode, target, out.id, port.id, out.dataType);
          done = true;
        }
      }
      if (!done) {
        recorderFor(mission.missionId).record({
          kind: "POLICY_DENIED",
          actor: "planner",
          authority: "policy:graph-structure",
          policy: "validation.required-inputs",
          reason: `Plan step "${step.title}" requires "${port.label}" (${port.dataType}) but nothing upstream emits a compatible value. The graph keeps the port unwired and validation will report it.`,
          evidence: [`step=${step.id}`, `port=${port.id}`, `dataType=${port.dataType}`, `upstream=${step.dependsOn.join(",") || "none"}`],
          subjectId: step.id,
          data: { portId: port.id, dataType: port.dataType }
        });
      }
    }
    for (const src of upstream) {
      for (const out of src.outputs) {
        if (graph.connections.some((c) => c.sourceNodeId === src.id && c.sourcePortId === out.id && c.targetNodeId === target.id)) continue;
        const port = target.inputs.find((i) => !graph.connections.some((c) => c.targetNodeId === target.id && c.targetPortId === i.id) && portsCompatible(out.dataType, i.dataType));
        if (!port) continue;
        wire(src, target, out.id, port.id, out.dataType);
      }
    }
  }
  return graph;
}
function taskForNode(rt2, nodeId) {
  const found = rt2.taskToNode;
  for (const [taskId, nId] of found) if (nId === nodeId) return taskId;
  return "";
}
function buildIncompleteReason(artifacts, simulatedUsed) {
  const parts = [];
  if (simulatedUsed) parts.push("execution used MJ's labelled simulation, so nothing was really built");
  const unverified = artifacts.filter((a) => a.evaluation && (!a.evaluation.passed || !a.evaluation.fullyMeasured));
  if (unverified.length) {
    parts.push(
      `${unverified.length} artifact(s) are not independently verified: ${unverified.slice(0, 3).map((a) => `${a.name} (${a.evaluation?.unmeasured.join(", ") || "failed checks"})`).join("; ")}`
    );
  }
  return parts.length ? `Not verified \u2014 ${parts.join("; ")}.` : "Work unfinished.";
}
function sleep2(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// src/mission/templates.ts
init_id();
var role = (definitionId, title, kind, purpose) => ({
  definitionId,
  title,
  kind,
  purpose
});
var MISSION_TEMPLATES = [
  {
    id: "tpl.software-development",
    name: "Software Development",
    category: "Engineering",
    description: "Plan \u2192 architect \u2192 implement \u2192 test \u2192 review \u2192 release gate. The default shape for building something that has to work.",
    roles: [
      role("agent.planner", "Planner", "research", "Decompose the objective into testable units and name the unknowns."),
      role("agent.architect", "Architect", "architecture", "Design the system: components, data model, interfaces, failure modes."),
      role("agent.coder", "Implementer", "implementation", "Implement the design. Produce runnable code and the commands that build it."),
      role("agent.tester", "Tester", "test", "Run the tests. Record actual output. Report failures verbatim."),
      role("agent.reviewer", "Reviewer", "review", "Review against the success criteria. Say what is missing; do not rewrite."),
      role("control.approval", "Release gate", "release", "Human decision on release.")
    ],
    defaultSuccessCriteria: ["Builds without errors", "Tests pass", "Review has no unresolved blockers"],
    defaultConstraints: ["No production deployment without approval"],
    budget: { maxCostUsd: 15, maxConcurrentAgents: 3 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "HIGH" },
    boundary: { shell: true, filesystemWrite: true, credentials: false },
    preferredFramework: "fw.specdriven",
    origin: "built-in"
  },
  {
    id: "tpl.security-review",
    name: "Security Review",
    category: "Security",
    description: "Threat model \u2192 secure review \u2192 judge \u2192 human gate. Findings ranked by exploitability; no exploit payloads.",
    roles: [
      role("agent.security", "Threat modeller", "security", "Model trust boundaries and rank findings by exploitability."),
      role("agent.reviewer", "Secure reviewer", "review", "Review the diff for injection, authorisation gaps, secret handling."),
      role("agent.judge", "Judge", "review", "Adjudicate disagreements between the reviewer and the implementer."),
      role("control.approval", "Human gate", "approval", "Human decision on whether findings are acceptable.")
    ],
    defaultSuccessCriteria: ["Every finding has a severity and a remediation", "No untriaged high-severity finding remains"],
    defaultConstraints: ["No exploit payloads", "No live exploitation"],
    budget: { maxCostUsd: 8 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "MEDIUM" },
    boundary: { filesystemRead: true, filesystemWrite: false, shell: true },
    preferredFramework: "fw.security-gate",
    origin: "built-in"
  },
  {
    id: "tpl.research",
    name: "Research",
    category: "Knowledge",
    description: "Three independent angles \u2192 synthesis \u2192 judge. Conflicts are preserved, not smoothed.",
    roles: [
      role("agent.researcher", "Researcher A", "research", "Investigate from the technical angle. Cite sources."),
      role("agent.researcher", "Researcher B", "research", "Investigate from the cost/operational angle. Cite sources."),
      role("agent.researcher", "Researcher C", "research", "Investigate from the risk angle. Cite sources."),
      role("agent.synthesizer", "Synthesizer", "synthesis", "Merge the three. Keep the disagreements visible."),
      role("agent.judge", "Judge", "review", "State which conclusion the evidence actually supports.")
    ],
    defaultSuccessCriteria: ["Every claim is sourced", "Conflicting findings are named explicitly"],
    defaultConstraints: ["Mark unknowns rather than filling them"],
    budget: { maxCostUsd: 6, maxConcurrentAgents: 3 },
    policy: { autonomy: "AUTONOMOUS", approvalThreshold: "HIGH" },
    boundary: { network: true, browser: true, filesystemWrite: false, shell: false },
    preferredFramework: "fw.triangulation",
    origin: "built-in"
  },
  {
    id: "tpl.due-diligence",
    name: "Due Diligence",
    category: "Enterprise",
    description: "Research \u2192 finance \u2192 legal \u2192 security \u2192 synthesis \u2192 judge.",
    roles: [
      role("agent.researcher", "Researcher", "research", "Establish the factual record with sources."),
      role("agent.preset.data-analyst", "Financial analyst", "research", "Assess the financial picture. State assumptions."),
      role("agent.preset.legal", "Legal reviewer", "review", "Flag contractual and compliance risk. Not legal advice."),
      role("agent.security", "Security reviewer", "security", "Assess technical and security risk."),
      role("agent.synthesizer", "Synthesizer", "synthesis", "Produce one memorandum. Conflicts stay visible."),
      role("agent.judge", "Judge", "review", "Recommend, with the reasoning stated.")
    ],
    defaultSuccessCriteria: ["Every material risk is named", "Recommendation follows from the evidence"],
    defaultConstraints: ["Not legal or financial advice"],
    budget: { maxCostUsd: 12 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "HIGH" },
    boundary: { network: true, filesystemWrite: true },
    preferredFramework: "fw.due-diligence",
    origin: "built-in"
  },
  {
    id: "tpl.market-analysis",
    name: "Market Analysis",
    category: "Knowledge",
    description: "Map-reduce over sources, then a synthesis with the numbers shown.",
    roles: [
      role("agent.researcher", "Market researcher", "research", "Size the market and name the sources."),
      role("agent.preset.data-analyst", "Analyst", "research", "Build the numbers. Show the arithmetic."),
      role("agent.critic", "Critic", "review", "Attack the assumptions."),
      role("agent.synthesizer", "Synthesizer", "synthesis", "Produce the analysis.")
    ],
    defaultSuccessCriteria: ["Numbers are reproducible from stated sources"],
    defaultConstraints: ["No invented market figures"],
    budget: { maxCostUsd: 6 },
    policy: { autonomy: "AUTONOMOUS" },
    boundary: { network: true, filesystemWrite: false },
    preferredFramework: "fw.mapreduce",
    origin: "built-in"
  },
  {
    id: "tpl.data-pipeline",
    name: "Data Pipeline",
    category: "Data",
    description: "Design \u2192 implement \u2192 test on real data \u2192 review.",
    roles: [
      role("agent.architect", "Pipeline architect", "architecture", "Design the pipeline: sources, contracts, failure handling, backfill."),
      role("agent.coder", "Pipeline engineer", "implementation", "Implement it. Handle late-arriving and bad data explicitly."),
      role("agent.tester", "Data tester", "test", "Run it against real data. Show row counts and diffs."),
      role("agent.reviewer", "Reviewer", "review", "Review for correctness and idempotency.")
    ],
    defaultSuccessCriteria: ["Pipeline is idempotent", "Row counts reconcile"],
    defaultConstraints: ["Never drop source data"],
    budget: { maxCostUsd: 10 },
    policy: { autonomy: "SUPERVISED" },
    boundary: { shell: true, filesystemWrite: true },
    preferredFramework: "fw.pipeline",
    origin: "built-in"
  },
  {
    id: "tpl.content-production",
    name: "Content Production",
    category: "Content",
    description: "Research \u2192 draft \u2192 critique \u2192 edit. Facts sourced, claims checked.",
    roles: [
      role("agent.researcher", "Researcher", "research", "Gather sourced material."),
      role("agent.docs", "Writer", "synthesis", "Draft from the research. No invented facts."),
      role("agent.critic", "Critic", "review", "Attack the claims and the structure."),
      role("agent.reviewer", "Editor", "review", "Edit for accuracy and clarity.")
    ],
    defaultSuccessCriteria: ["Every factual claim is sourced"],
    defaultConstraints: ["No fabricated quotes or statistics"],
    budget: { maxCostUsd: 5 },
    policy: { autonomy: "AUTONOMOUS" },
    boundary: { network: true, shell: false, filesystemWrite: true },
    preferredFramework: "fw.handoff-chain",
    origin: "built-in"
  },
  {
    id: "tpl.qa",
    name: "QA",
    category: "Quality",
    description: "Producer \u2192 reviewer \u2192 QA gate. QA may not rewrite the work.",
    roles: [
      role("agent.coder", "Producer", "implementation", "Produce the work."),
      role("agent.reviewer", "Reviewer", "review", "Review it."),
      role("agent.qa", "QA", "test", "Gate it against the acceptance criteria."),
      role("control.approval", "Human gate", "approval", "Human sign-off.")
    ],
    defaultSuccessCriteria: ["Acceptance criteria are each explicitly met or explicitly not"],
    defaultConstraints: ["QA does not rewrite the work"],
    budget: { maxCostUsd: 8 },
    policy: { autonomy: "SUPERVISED" },
    boundary: { shell: true },
    preferredFramework: "fw.producer-gate",
    origin: "built-in"
  },
  {
    id: "tpl.incident-response",
    name: "Incident Response",
    category: "Ops",
    description: "War room: supervisor, security, SRE, debugger, human approval. Time-boxed; no silent changes.",
    roles: [
      role("agent.supervisor", "Incident commander", "review", "Own impact, comms and the next action."),
      role("agent.debugger", "Debugger", "research", "Find the root cause with evidence."),
      role("agent.preset.sre", "SRE", "research", "Assess blast radius and recovery options."),
      role("agent.security", "Security", "security", "Rule in or out a security cause."),
      role("control.approval", "Human gate", "approval", "Human approves any change to a live system.")
    ],
    defaultSuccessCriteria: ["Root cause is evidenced", "Blast radius is stated", "Next action is explicit"],
    defaultConstraints: ["No change to production without human approval"],
    budget: { maxCostUsd: 6, maxWallClockMs: 30 * 60 * 1e3 },
    policy: { autonomy: "HUMAN_ONLY", approvalThreshold: "MEDIUM" },
    boundary: { shell: true, filesystemRead: true, filesystemWrite: false },
    preferredFramework: "fw.war-room",
    origin: "built-in"
  },
  {
    id: "tpl.migration",
    name: "Migration",
    category: "Engineering",
    description: "Canary \u2192 verify \u2192 full \u2192 QA. The second pass sees the canary evidence.",
    roles: [
      role("agent.architect", "Migration architect", "architecture", "Plan the migration and the rollback path."),
      role("agent.coder", "Canary", "implementation", "Migrate one representative slice."),
      role("agent.tester", "Canary tester", "test", "Verify the slice end to end."),
      role("agent.coder", "Full migration", "implementation", "Migrate the rest, using the canary evidence."),
      role("agent.qa", "QA", "test", "Gate the result.")
    ],
    defaultSuccessCriteria: ["Rollback path exists and is tested", "No data loss"],
    defaultConstraints: ["Reversible at every step"],
    budget: { maxCostUsd: 15 },
    policy: { autonomy: "SUPERVISED", approvalThreshold: "HIGH" },
    boundary: { shell: true, filesystemWrite: true, credentials: false },
    preferredFramework: "fw.canary",
    origin: "built-in"
  },
  {
    id: "tpl.release-engineering",
    name: "Release Engineering",
    category: "Release",
    description: "Cut \u2192 changelog \u2192 gates \u2192 human release decision.",
    roles: [
      role("agent.tester", "Release verifier", "test", "Run the full suite. Record output."),
      role("agent.docs", "Changelog author", "synthesis", "Write the changelog from what actually changed."),
      role("agent.security", "Release security", "security", "Confirm no new high-severity finding ships."),
      role("control.approval", "Release decision", "release", "Human decides whether to ship.")
    ],
    defaultSuccessCriteria: ["Suite passes", "Changelog matches the diff"],
    defaultConstraints: ["No release without human approval"],
    budget: { maxCostUsd: 6 },
    policy: { autonomy: "HUMAN_ONLY" },
    boundary: { shell: true, filesystemWrite: true },
    preferredFramework: "fw.staged-approval",
    origin: "built-in"
  }
];
var TEMPLATE_BY_ID = new Map(MISSION_TEMPLATES.map((t) => [t.id, t]));
function getTemplate(id) {
  return TEMPLATE_BY_ID.get(id) ?? null;
}
function instantiateTemplate(templateId, input) {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`unknown mission template ${templateId}`);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    missionId: uid("msn"),
    name: input.name || `${t.name}: ${truncate(input.objective, 48)}`,
    objective: input.objective,
    description: input.description ?? t.description,
    constraints: [...t.defaultConstraints],
    successCriteria: [...t.defaultSuccessCriteria],
    deadline: input.deadline ?? null,
    budget: { ...DEFAULT_BUDGET, ...t.budget },
    riskPolicy: { ...DEFAULT_POLICY, ...t.policy },
    boundary: { ...DEFAULT_BOUNDARY, ...t.boundary },
    allowedHarnesses: [],
    allowedTools: [],
    allowedMcpServers: [],
    allowedAgents: t.roles.map((r) => r.definitionId),
    preferredFramework: t.preferredFramework,
    workspace: input.workspace ?? ".",
    templateId: t.id,
    priority: "NORMAL",
    status: "DRAFT",
    workflowId: null,
    graphVersion: 0,
    checkpointId: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    endedAt: null
  };
}
function truncate(s, n2) {
  return s.length <= n2 ? s : `${s.slice(0, n2 - 1)}\u2026`;
}

// probe/diag.test.ts
var m = instantiateTemplate("tpl.software-development", { objective: "Build a production-ready SaaS billing feature in TypeScript", name: "d", workspace: "." });
m.successCriteria = ["Builds without errors", "Tests pass"];
m.budget = { ...DEFAULT_BUDGET, maxCostUsd: 5, maxRetriesPerTask: 3, maxConcurrentAgents: 6, maxGraphMutations: 4 };
m.riskPolicy = { ...DEFAULT_POLICY, autonomy: "SUPERVISED", approvalThreshold: "HIGH", allowReorganization: true, allowHarnessSwitch: true };
m.boundary = { ...DEFAULT_BOUNDARY, shell: true, filesystemWrite: true, credentials: false, browser: false };
var services = createServices();
var approvals = 0;
var rt = new MissionRuntime(m, services, {
  allowSimulated: true,
  installed: { "local-test": true },
  approvalTimeoutMs: 4e3,
  onApprovalRequired: (id) => {
    approvals += 1;
    console.log("APPROVAL REQUESTED", id);
    setTimeout(() => services.approvals.decide(id, "APPROVED", "human", "ok"), 20);
  }
});
rt.prepare();
rt.buildOrganization();
var res = await rt.run();
var ev = rt.getEvents();
var count = (k) => ev.filter((e) => e.kind === k).length;
console.log("status", m.status, res.status ?? "");
console.log("approvalsSeen", approvals, "pending", services.approvals.forMission(m.missionId).length);
console.log("REPAIR_STARTED", count("REPAIR_STARTED"), "REPAIR_COMPLETED", count("REPAIR_COMPLETED"));
console.log("tasks:");
for (const t of rt.org.tasks_()) console.log("  ", t.title, t.state, "attempts", t.attempts, "/", t.maxAttempts, "risk", t.risk, "cls", t.cls, "|", (t.error ?? "").slice(0, 80));
console.log("distinct event kinds", new Set(ev.map((e) => e.kind)).size, "total", ev.length);
console.log("checkpoints", rt.getCheckpoints ? "?" : "?");
console.log("last 5 events:", ev.slice(-5).map((e) => e.kind + " :: " + e.reason.slice(0, 90)).join("\n  "));
