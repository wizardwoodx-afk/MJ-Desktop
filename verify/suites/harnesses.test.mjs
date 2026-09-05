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
    MJ_VERSION = "11.9.4";
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
    const ran = await new Promise((resolve2) => {
      const timer = setTimeout(() => resolve2({ failed: true, absent: false, detail: "timeout (treated as blocked)" }), timeoutMs);
      execFile(canary.argv[0], canary.argv.slice(1), { timeout: timeoutMs }, (err) => {
        clearTimeout(timer);
        const code = err?.code;
        const absent = Boolean(err) && typeof code === "string" && WRAPPER_UNAVAILABLE.has(code);
        resolve2({
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
      static async fromPath(path4) {
        return invoke("plugin:image|from_path", { path: path4 }).then((rid) => new _Image(rid));
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
  return new Promise((resolve2) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.mj.json,.mjpack";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve2(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve2(JSON.parse(String(reader.result)));
        } catch {
          resolve2(null);
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
      fsRead: async (path4) => {
        if (useTauri()) return tauriInvoke("fs_read", { path: path4 });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsWrite: async (path4, content) => {
        if (useTauri()) return tauriInvoke("fs_write", { path: path4, content });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsList: async (path4) => {
        if (useTauri()) return tauriInvoke("fs_list", { path: path4 });
        return [];
      },
      fsMkdir: async (path4) => {
        if (useTauri()) return tauriInvoke("fs_mkdir", { path: path4 });
      },
      fsRemove: async (path4, recursive) => {
        if (useTauri()) return tauriInvoke("fs_remove", { path: path4, recursive });
      },
      shellExec: async (program, args, cwd, timeoutSecs) => {
        if (useTauri()) return tauriInvoke("shell_exec", { program, args, cwd, timeoutSecs });
        throw new Error("Terminal is available in the native desktop build.");
      },
      // QA fix (audit C2): the native filesystem is sandboxed to the app data dir plus these
      // user-registered workspace roots. Teams registers the runner repo when a run starts.
      workspaceRootAdd: async (root) => {
        if (!useTauri()) return { ok: false, path: root };
        return tauriInvoke("workspace_root_add", { root });
      },
      workspaceRootRemove: async (root) => {
        if (!useTauri()) return { ok: false, path: root };
        return tauriInvoke("workspace_root_remove", { root });
      },
      workspaceRootList: async () => {
        if (!useTauri()) return [];
        return tauriInvoke("workspace_root_list");
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

// probe/harnesses.test.ts
import * as fs from "node:fs";
import * as path3 from "node:path";

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
function customHarnessId(name) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return `custom:${slug || "harness"}`;
}
function validateCustomHarness(spec) {
  const errors = [];
  if (!spec.name.trim()) errors.push({ field: "name", message: "Give the harness a name." });
  if (spec.name.length > 64) errors.push({ field: "name", message: "Name is too long (64 chars max)." });
  const bin = spec.bin.trim();
  if (!bin) errors.push({ field: "bin", message: "The binary to run is required." });
  else {
    if (/[\r\n]/.test(bin)) errors.push({ field: "bin", message: "The binary cannot contain newlines." });
    if (/[;&|`$><]/.test(bin)) {
      errors.push({ field: "bin", message: "The binary cannot contain shell characters (; & | ` $ > <). MJ execs it directly \u2014 pass arguments in the argv field." });
    }
    if (/\s/.test(bin)) errors.push({ field: "bin", message: "The binary must be a single command or path (no spaces). Quote nothing; arguments go in the argv field." });
    if (bin.includes("..")) errors.push({ field: "bin", message: "The binary cannot contain '..'." });
  }
  const promptSlots = spec.argv.filter((a) => a === "$PROMPT").length;
  if (promptSlots === 0) errors.push({ field: "argv", message: "The arguments must include $PROMPT once \u2014 that is where the task goes." });
  if (promptSlots > 1) errors.push({ field: "argv", message: "$PROMPT appears more than once. It should mark exactly one position." });
  if (spec.argv.some((a) => /[\r\n]/.test(a))) errors.push({ field: "argv", message: "Arguments cannot contain newlines." });
  return errors;
}
function isCustomHarness(id) {
  return id.startsWith("custom:");
}
var customRegistry = /* @__PURE__ */ new Map();
function setCustomHarnesses(list) {
  customRegistry.clear();
  for (const h of list) customRegistry.set(h.id, h);
}
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
function unverifiedClaims(id) {
  const caps = AGENT_CAPABILITIES[id];
  if (!caps) {
    return ["Custom harness: every flag is the user's own \u2014 MJ verified none of it. Read-only is advisory."];
  }
  const out = [];
  const check = (name, cap) => {
    if (cap?.argv && cap.confidence === "community") {
      out.push(`${name}: ${cap.source}`);
    }
  };
  check("cwd", caps.cwd);
  check("model", caps.model);
  check("resume", caps.resume);
  check("json", caps.json);
  if (!caps.enforcedReadOnly && caps.readOnly?.argv) {
    out.push("read-only is advisory: no enforcement was verified, so this seat can still modify files.");
  }
  return out;
}
var EXECUTABLE_HARNESSES = Object.keys(AGENT_CAPABILITIES).filter(
  (id) => AGENT_CAPABILITIES[id].bins.length > 0
);

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
    return new Promise((resolve2, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`acp: ${method} timed out after ${this.opts.timeoutMs ?? 12e4}ms`));
      }, this.opts.timeoutMs ?? 12e4);
      this.pending.set(id, {
        resolve: (v) => resolve2(v),
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
for (const p of PROFILES) {
  const h = new CliHarness(p.id, p.name, p.installHint, p.languages, p.strengths, p.canEditFiles, p.canRunTests, p.capabilities);
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

// src/mission/sessions.ts
function sessionKeyString(k) {
  return `${k.seatId}|${k.harness}|${k.model ?? "default"}|${k.cwd}`;
}
function deriveSessionId(seed) {
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + i, 2246822519) >>> 0;
  }
  const hex = (n2, len) => n2.toString(16).padStart(len, "0").slice(-len);
  return `${hex(h1, 8)}-${hex(h2, 4)}-4${hex(h1 >>> 8, 3)}-a${hex(h2 >>> 12, 3)}-${hex(h1 ^ h2, 8)}${hex(h2 ^ h1, 4)}`;
}
var SessionStore = class {
  byKey = /* @__PURE__ */ new Map();
  all() {
    return [...this.byKey.values()];
  }
  get(key) {
    return this.byKey.get(sessionKeyString(key)) ?? null;
  }
  /**
   * Get the session for a seat, creating it on first use.
   *
   * `confirmed` starts false: MJ has asked for a session, but the CLI has not yet said it exists. That
   * distinction is what stops MJ resuming a conversation that never started.
   */
  obtain(key, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const k = sessionKeyString(key);
    const existing = this.byKey.get(k);
    if (existing) return existing;
    const fresh = {
      key,
      sessionId: deriveSessionId(k),
      confirmed: false,
      turns: 0,
      createdAt: now,
      updatedAt: now,
      lastPromptHash: null,
      resumeFailedAt: null
    };
    this.byKey.set(k, fresh);
    return fresh;
  }
  /**
   * Record that a turn happened, and confirm the session if the CLI reported an id.
   *
   * `reportedId` is what the CLI printed. When it differs from the id MJ asked for, the CLI's word
   * wins — it owns the conversation — and the session is re-keyed so the next resume works.
   */
  recordTurn(key, reportedId, prompt, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const s = this.obtain(key, now);
    if (reportedId && reportedId !== s.sessionId) {
      this.byKey.delete(sessionKeyString(key));
      s.sessionId = reportedId;
      this.byKey.set(sessionKeyString(key), s);
    }
    if (reportedId) s.confirmed = true;
    s.turns += 1;
    s.updatedAt = now;
    s.lastPromptHash = hashPrompt(prompt);
    s.resumeFailedAt = null;
    return s;
  }
  /** The CLI could not resume. Mark it so the next turn starts fresh instead of failing forever. */
  markResumeFailed(key, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const s = this.get(key);
    if (s) s.resumeFailedAt = now;
  }
  hydrate(sessions) {
    for (const s of sessions) this.byKey.set(sessionKeyString(s.key), s);
  }
  export() {
    return this.all();
  }
};
function hashPrompt(p) {
  let h = 2166136261;
  for (let i = 0; i < p.length; i += 1) h = Math.imul(h ^ p.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}
function sessionArgv(harness, opts) {
  const rc = resolveCaps(harness);
  if (rc.custom) {
    return { argv: [], continuity: "none", warning: "Custom harness: no session continuity \u2014 every turn is stateless." };
  }
  if (!rc.registered) {
    return { argv: [], continuity: "none", warning: `Harness "${harness}" is not registered (anymore); this turn is stateless.` };
  }
  const caps = rc.caps;
  if (opts.kind === "first" && opts.idKind === "cli-chosen") {
    return { argv: [], continuity: "session", warning: null };
  }
  if (opts.kind === "first") {
    const start = caps.sessionStart;
    if (!start?.argv) {
      return { argv: [], continuity: "none", warning: `${caps.name} has no documented way to start a session under a chosen id, so this turn is stateless.` };
    }
    return { argv: start.argv.map((a) => a === "$SESSION" ? opts.sessionId : a), continuity: "session", warning: null };
  }
  const resume = caps.resume;
  if (!resume?.argv) {
    return {
      argv: [],
      continuity: "none",
      warning: `${caps.name} has no documented way to resume a session, so this turn starts from scratch. The agent will not remember the previous turn \u2014 do not treat a second-pass approval as informed.`
    };
  }
  if (!resume.argv.includes("$SESSION")) {
    return {
      argv: [],
      continuity: "none",
      warning: `${caps.name}'s resume form takes no session id, so MJ cannot say which conversation to continue and will not guess. This turn starts from scratch and the prompt restates the context.`
    };
  }
  return { argv: resume.argv.map((a) => a === "$SESSION" ? opts.sessionId : a), continuity: "session", warning: null };
}
function sessionIdKind(harness) {
  const rc = resolveCaps(harness);
  if (rc.custom) return "cli-chosen";
  return rc.caps.sessionStart?.argv ? "mj-chosen" : "cli-chosen";
}
function parseSessionId(harness, raw) {
  if (!raw.trim()) return null;
  for (const line of [raw.trim(), ...raw.split(/\r?\n/).map((l) => l.trim())]) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      const id = obj.session_id ?? obj.sessionID ?? obj.sessionId ?? obj.session;
      if (typeof id === "string" && id.length > 0) return id;
    } catch {
    }
  }
  const m = /"session_?[iI][dD]"\s*:\s*"([^"]+)"/.exec(raw);
  if (m?.[1]) return m[1];
  if (harness === "codex") {
    const c = /(?:^|\s)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\s|$)/i.exec(raw);
    if (c?.[1]) return c[1];
  }
  return null;
}
function detectResumeFailure(raw) {
  const patterns = [
    [/Session not found/i, "the session id is not known to this CLI (it may belong to a different directory, or never existed)"],
    [/No conversation found with session ID/i, "the session id is not known in this directory (sessions are scoped to the cwd and its worktrees)"],
    [/Failed to resume the conversation/i, "the CLI found the session but could not load it"],
    [/Could not resume session/i, "the session's environment expired"]
  ];
  for (const [re, why] of patterns) if (re.test(raw)) return why;
  return null;
}
function followUpPrompt(opts) {
  const lines = [];
  if (opts.continuity === "none") {
    lines.push(
      `NOTE: ${opts.harnessName} cannot resume a session, so you have NO memory of the previous turn.`,
      `Everything you need is restated below. Do not assume you have already seen this work.`,
      ``,
      `## What happened so far`,
      opts.previousSummary,
      ``
    );
  }
  lines.push(`## Do this next`, opts.instruction);
  if (opts.evidence?.length) {
    lines.push(``, `## Evidence you must work from`);
    for (const e of opts.evidence) lines.push(`- ${e}`);
  }
  return lines.join("\n");
}

// src/mission/teamExecutor.ts
import * as path2 from "node:path";

// src/mission/agentTeam.ts
var SCHEMA_VERSION = 1;
var seat = (id, role, harness, over = {}) => ({
  id,
  role,
  harness,
  model: null,
  mayWrite: role === "coder" || role === "debugger",
  maxRisk: role === "coder" || role === "debugger" ? "MEDIUM" : "LOW",
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
function fill(cap, vars) {
  if (!cap || !cap.argv) return [];
  return cap.argv.map((a) => a.startsWith("$") ? vars[a] ?? "" : a);
}
function composeSeatArgv(teamSeat, ctx) {
  const resolved = resolveCaps(teamSeat.harness);
  const caps = resolved.registered ? resolved.caps : null;
  if (!caps) {
    return {
      bin: "",
      argv: [],
      env: {},
      files: [],
      claims: { readOnlyEnforced: false, costKind: "none" },
      warnings: [`Custom harness "${teamSeat.harness}" is not registered (anymore). Add it in Teams -> Connect, then recompile.`]
    };
  }
  const warnings = [];
  const vars = {
    $PROMPT: ctx.prompt,
    $MODEL: teamSeat.model ?? "",
    $N: String(teamSeat.maxTurns ?? 20),
    $CWD: ctx.cwd,
    $SECS: String(teamSeat.timeoutSecs),
    $SESSION: ctx.sessionId ?? "",
    $REVIEWER: "mj-readonly",
    $NAME: `mj-${teamSeat.id}`
  };
  const argv = [];
  const flags = [];
  const env = {};
  const files = [];
  const wantsReadOnly = ctx.readOnly || !teamSeat.mayWrite;
  argv.push(...fill(caps.prompt, vars));
  if (wantsReadOnly) {
    if (caps.readOnly?.argv?.length) flags.push(...fill(caps.readOnly, vars));
    else if (caps.readOnly?.implicit) {
    } else warnings.push(`${caps.name} has no enforced read-only mode, so this seat is ADVISORY only \u2014 it can still modify files.`);
  } else if (caps.write?.argv?.length) {
    flags.push(...fill(caps.write, vars));
  }
  if (caps.json?.argv) flags.push(...fill(caps.json, vars));
  if (teamSeat.maxTurns && caps.maxTurns?.argv) flags.push(...fill(caps.maxTurns, vars));
  if (caps.timeout?.argv) flags.push(...fill(caps.timeout, vars));
  if (caps.cwd?.argv) flags.push(...fill(caps.cwd, vars));
  if (teamSeat.model && caps.model?.argv) flags.push(...fill(caps.model, vars));
  if (caps.noAutoUpdate?.argv) flags.push(...fill(caps.noAutoUpdate, vars));
  if (ctx.sessionId) {
    const s = sessionArgv(teamSeat.harness, {
      kind: (ctx.turn ?? 1) <= 1 ? "first" : "follow-up",
      idKind: sessionIdKind(teamSeat.harness),
      sessionId: ctx.sessionId
    });
    flags.push(...s.argv);
    if (s.warning) warnings.push(s.warning);
  }
  if (teamSeat.harness === "cline") {
    env.CLINE_COMMAND_PERMISSIONS = wantsReadOnly ? JSON.stringify({ allow: ["git *", "ls *", "cat *"], deny: ["rm *", "git push *", "git commit *"] }) : JSON.stringify({ allow: ["npm *", "git *"], deny: ["rm -rf *", "git push --force *"] });
  }
  if (teamSeat.harness === "cursor") {
    files.push({
      path: ".cursor/cli-config.json",
      contents: JSON.stringify(
        {
          permissions: {
            allow: wantsReadOnly ? ["Read(*)", "Shell(git status)", "Shell(git diff)"] : ["Read(*)", "Shell(git)", "Shell(npm)"],
            deny: wantsReadOnly ? ["Write(*)", "Shell(rm)"] : ["Shell(rm -rf)", "Read(.env*)"]
          }
        },
        null,
        2
      )
    });
    warnings.push("Cursor's -p mode has a reported bug where the process does not exit after emitting the result. MJ applies a wall-clock timeout and parses the stream rather than waiting for exit.");
  }
  if (teamSeat.harness === "kilo" && wantsReadOnly) {
    files.push({
      path: ".kilo/agents/mj-readonly.md",
      contents: `---
description: MJ read-only reviewer
mode: subagent
permission:
  edit: deny
  bash: deny
---

${teamSeat.instructions || "Review only. Do not modify files."}
`
    });
    warnings.push("Kilo read-only depends on the generated .kilo/agents/mj-readonly.md being picked up; verify with kilo --help.");
  }
  if (teamSeat.harness === "opencode") {
    warnings.push("Note: opencode issue #13851 permission-preset verification notes apply.");
  }
  for (const claim of unverifiedClaims(teamSeat.harness)) warnings.push(`Unverified flag \u2014 ${claim}`);
  const cleanFlags = flags.filter((f) => f.length > 0);
  return {
    bin: caps.bins[0] ?? "",
    argv: [...argv, ...cleanFlags],
    env,
    files,
    claims: {
      readOnlyEnforced: wantsReadOnly && enforcedReadOnly(teamSeat.harness),
      costKind: caps.cost?.kind ?? "none"
    },
    warnings
  };
}

// src/mission/git.ts
function parseStatusPorcelainZ(raw) {
  if (!raw) return [];
  const fields = raw.split("\0");
  const out = [];
  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    if (!entry || entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path4 = entry.slice(3);
    let oldPath = null;
    if (code === "R " || code === "RM" || code === "C " || code === "CM") {
      oldPath = fields[i + 1] ?? null;
      i += 1;
    }
    const status = code === "??" ? "untracked" : code.startsWith("R") ? "renamed" : code.startsWith("C") ? "copied" : code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified";
    out.push({ status, path: path4, oldPath });
  }
  return out;
}
function parseUnifiedDiff(raw) {
  const files = [];
  let current = null;
  let currentHunk = null;
  const flush = () => {
    if (current) files.push(current);
    current = null;
    currentHunk = null;
  };
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      flush();
      const m = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      current = { path: m?.[2] ?? m?.[1] ?? "unknown", oldPath: null, status: "modified", additions: 0, deletions: 0, binary: false, hunks: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("rename from ")) current.oldPath = line.slice("rename from ".length);
    else if (line.startsWith("copy from ")) current.oldPath = line.slice("copy from ".length);
    else if (line.startsWith("new file mode")) current.status = "added";
    else if (line.startsWith("deleted file mode")) current.status = "deleted";
    else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) current.binary = true;
    else if (line.startsWith("@@")) {
      currentHunk = { header: line, added: [], removed: [], lines: [] };
      current.hunks.push(currentHunk);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions += 1;
      if (currentHunk) {
        currentHunk.added.push(line.slice(1));
        currentHunk.lines.push(line);
      }
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions += 1;
      if (currentHunk) {
        currentHunk.removed.push(line.slice(1));
        currentHunk.lines.push(line);
      }
    } else if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }
  flush();
  for (const f of files) if (f.oldPath && f.status === "modified") f.status = "renamed";
  return files;
}
function summariseDiff(files) {
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);
  let largest = null;
  let biggest = -1;
  for (const f of files) {
    const churn = f.additions + f.deletions;
    if (churn > biggest) {
      biggest = churn;
      largest = f.path;
    }
  }
  return {
    files,
    totalAdditions,
    totalDeletions,
    netLines: totalAdditions - totalDeletions,
    binaryFiles: files.filter((f) => f.binary).length,
    empty: files.length === 0,
    largest: files.length ? largest : null
  };
}
function gitApi(runner) {
  const run = async (args, cwd) => runner(args, cwd);
  return {
    async isRepo(cwd) {
      const r = await run(["rev-parse", "--is-inside-work-tree"], cwd);
      if (!r.ok) return { ok: false, reason: r.reason ?? (r.stderr || "git rev-parse failed.") };
      return { ok: r.stdout.trim() === "true", reason: r.stdout.trim() === "true" ? null : "This directory is not inside a git work tree." };
    },
    async status(cwd) {
      const r = await run(["status", "--porcelain=v1", "-z"], cwd);
      if (!r.ok) return { ok: false, entries: [], reason: r.reason ?? (r.stderr || "git status failed.") };
      return { ok: true, entries: parseStatusPorcelainZ(r.stdout), reason: null };
    },
    async diff(cwd, opts = {}) {
      const args = ["diff", "--no-color", "--no-ext-diff", "-M"];
      if (opts.staged) args.push("--staged");
      if (opts.ref) args.push(opts.ref);
      args.push("--");
      for (const p of opts.paths ?? []) args.push(p);
      const r = await run(args, cwd);
      if (!r.ok) return { ok: false, summary: null, raw: "", reason: r.reason ?? (r.stderr || "git diff failed.") };
      return { ok: true, summary: summariseDiff(parseUnifiedDiff(r.stdout)), raw: r.stdout, reason: null };
    },
    async head(cwd) {
      const r = await run(["log", "-1", "--format=%H%x00%s"], cwd);
      if (!r.ok) return { ok: false, sha: null, subject: null, reason: r.reason ?? (r.stderr || "git log failed \u2014 is there a commit yet?") };
      const [sha, subject] = r.stdout.replace(/\n+$/, "").split("\0");
      return { ok: true, sha: (sha ?? "").trim() || null, subject: subject ?? null, reason: null };
    },
    async branch(cwd) {
      const r = await run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      if (!r.ok) return { ok: false, name: null, reason: r.reason ?? (r.stderr || "git rev-parse failed.") };
      return { ok: true, name: r.stdout.trim() || null, reason: null };
    }
  };
}

// src/mission/caps.ts
var DEFAULT_CAPS = { timeoutMs: 10 * 60 * 1e3, maxTurns: 40, maxCostUsd: 5 };
var CapLedger = class {
  caps;
  state;
  constructor(caps, now = Date.now()) {
    this.caps = caps;
    this.state = { spentUsd: 0, spentTokens: 0, turnsUsed: 0, invocationsUsed: 0, startedAt: now, cappedInvocations: [] };
  }
  beginInvocation() {
    this.state.invocationsUsed += 1;
  }
  /** Can another invocation start at all? Checked BEFORE dispatch — refusing is control, charging after is bookkeeping. */
  admissionError(now = Date.now()) {
    const maxCost = this.caps.maxCostUsd ?? 0;
    if (maxCost > 0 && this.state.spentUsd >= maxCost) {
      return `the mission has already spent $${this.state.spentUsd.toFixed(4)} of its $${maxCost.toFixed(4)} ceiling`;
    }
    const maxTurns = this.caps.maxTurns ?? 0;
    if (maxTurns > 0 && this.state.turnsUsed >= maxTurns) {
      return `the mission has already used ${this.state.turnsUsed} of its ${maxTurns} turns`;
    }
    const maxInvocations = this.caps.maxInvocations ?? 0;
    if (maxInvocations > 0 && this.state.invocationsUsed >= maxInvocations) {
      return `the mission has used all ${maxInvocations} permitted invocations`;
    }
    const maxWall = this.caps.maxWallClockMs ?? this.caps.timeoutMs ?? 0;
    if (maxWall > 0 && now - this.state.startedAt >= maxWall) {
      return `the mission's ${Math.round(maxWall / 1e3)}s wall clock has elapsed`;
    }
    return null;
  }
  /** Record what a CLI actually consumed. Returns why, so the caller can show it. */
  charge(r) {
    if (r.tokens !== null && Number.isFinite(r.tokens)) {
      this.state.spentTokens += r.tokens;
    }
    if (r.costUsd !== null && Number.isFinite(r.costUsd)) {
      this.state.spentUsd += r.costUsd;
      const maxCost = this.caps.maxCostUsd ?? 0;
      const breach = maxCost > 0 && this.state.spentUsd > maxCost ? "mission_cap" : null;
      return {
        chargedUsd: r.costUsd,
        basis: "reported_usd",
        breach,
        reason: breach ? `Charged $${r.costUsd.toFixed(4)} from ${r.source}, taking the mission to $${this.state.spentUsd.toFixed(4)} over a $${maxCost.toFixed(4)} ceiling.` : `Charged $${r.costUsd.toFixed(4)} reported by ${r.source}. Mission total $${this.state.spentUsd.toFixed(4)}.`
      };
    }
    if (r.tokens !== null) {
      return {
        chargedUsd: 0,
        basis: "tokens_only",
        breach: null,
        reason: `${r.source} reported ${r.tokens} tokens and no price. Recorded as tokens; NOT converted to dollars, because a guessed price would be a fabricated cost.`
      };
    }
    return { chargedUsd: 0, basis: "unknown", breach: null, reason: `${r.source} reported neither cost nor tokens, so nothing was charged and the true spend is unknown.` };
  }
  /** Note that something was stopped by a cap. Kept separately from charges: a refusal is not a spend. */
  recordCapped(id, outcome, detail, at = (/* @__PURE__ */ new Date()).toISOString()) {
    this.state.cappedInvocations.push({ id, outcome, at, detail });
  }
  addTurns(n2) {
    this.state.turnsUsed += n2;
  }
  snapshot() {
    return { ...this.state, cappedInvocations: [...this.state.cappedInvocations] };
  }
};
async function withDeadline(work, timeoutMs, now = Date.now) {
  const t0 = now();
  const signal = { cancelled: false };
  if (timeoutMs <= 0) {
    const value = await work(signal);
    return { outcome: "ok", value, timedOut: false, elapsedMs: now() - t0, detail: "No deadline set." };
  }
  let timer = null;
  const deadline = new Promise((resolve2) => {
    timer = setTimeout(() => {
      signal.cancelled = true;
      resolve2("__timeout__");
    }, timeoutMs);
  });
  const winner = await Promise.race([work(signal).then((v) => ({ v })), deadline]);
  if (timer) clearTimeout(timer);
  if (winner === "__timeout__") {
    return {
      outcome: "timeout",
      value: null,
      timedOut: true,
      elapsedMs: now() - t0,
      detail: `Deadline of ${timeoutMs}ms reached. The caller must terminate the child process; MJ cannot assume it stopped.`
    };
  }
  return { outcome: "ok", value: winner.v, timedOut: false, elapsedMs: now() - t0, detail: `Finished in ${now() - t0}ms, inside the ${timeoutMs}ms deadline.` };
}
function parseReportedUsage(harness, raw) {
  const empty2 = { costUsd: null, tokens: null, turns: null, source: harness };
  if (!raw.trim()) return empty2;
  const candidates = jsonChunks(raw);
  let costUsd = null;
  let tokens = null;
  let turns = null;
  for (const obj of candidates) {
    const c = findNumber(obj, ["total_cost_usd", "cost_usd", "costUsd", "cost"], 0);
    if (c !== null) costUsd = c;
    const t = findNumber(obj, ["total_tokens"], 0) ?? sumTokens(obj);
    if (t === null) {
      const flat = findNumber(obj, ["tokens"], 0);
      if (flat !== null) tokens = flat;
    } else {
      tokens = t;
    }
    const n2 = findNumber(obj, ["num_turns", "turns", "total_turns"], 0);
    if (n2 !== null) turns = n2;
  }
  if (harness === "codex") costUsd = null;
  return { costUsd, tokens, turns, source: harness };
}
function jsonChunks(raw) {
  const out = [];
  const tryOne = (s) => {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === "object") out.push(v);
    } catch {
    }
  };
  tryOne(raw.trim());
  for (const line of raw.split(/\r?\n/)) if (line.trim()) tryOne(line.trim());
  return out;
}
function pickNumber(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
function findNumber(obj, keys, depth) {
  if (depth > 3 || !obj || typeof obj !== "object") return null;
  const o = obj;
  const direct = pickNumber(o, keys);
  if (direct !== null) return direct;
  for (const v of Object.values(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = findNumber(v, keys, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}
function sumTokens(obj) {
  const blocks = [];
  const collect = (o, depth) => {
    if (depth > 3 || !o || typeof o !== "object" || Array.isArray(o)) return;
    const rec = o;
    for (const k of ["usage", "tokens"]) {
      const v = rec[k];
      if (v && typeof v === "object" && !Array.isArray(v)) blocks.push(v);
    }
    for (const v of Object.values(rec)) collect(v, depth + 1);
  };
  collect(obj, 0);
  let best = null;
  for (const u of blocks) {
    const total = typeof u.total === "number" && Number.isFinite(u.total) ? u.total : null;
    const i = typeof u.input_tokens === "number" ? u.input_tokens : typeof u.input === "number" ? u.input : 0;
    const o = typeof u.output_tokens === "number" ? u.output_tokens : typeof u.output === "number" ? u.output : 0;
    const candidate = total !== null && total > 0 ? total : i + o > 0 ? i + o : null;
    if (candidate !== null) best = candidate;
  }
  return best;
}

// src/mission/collaboration.ts
function branchSafe(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "").replace(/^-+|-+$/g, "").slice(0, 40) || "seat";
}
function planWorktrees(team, opts) {
  const plans = [];
  const root = opts.repoRoot.replace(/\/+$/, "");
  const hasWriter = team.seats.some((s) => s.mayWrite);
  for (const seat2 of team.seats) {
    if (!seat2.mayWrite) {
      if (opts.deferReview && hasWriter) {
        const path5 = `${root}-mj-review-${branchSafe(seat2.id)}`;
        plans.push({
          seatId: seat2.id,
          branch: "",
          path: path5,
          createArgv: [],
          removeArgv: [["worktree", "remove", "--force", path5]],
          shared: false,
          deferred: true,
          reason: `${seat2.role} is read-only, so it gets its own worktree on the REVIEW SNAPSHOT \u2014 the base plus every writer branch merged. Pointing it at the base checkout would have it review the tree as it was before the work happened, which is the bug this replaces.`
        });
        continue;
      }
      plans.push({
        seatId: seat2.id,
        branch: opts.baseBranch,
        path: root,
        createArgv: [],
        removeArgv: [],
        shared: true,
        deferred: false,
        reason: `${seat2.role} is read-only \u2014 giving a reviewer its own worktree would mean it would review a tree nobody is writing to. Read-only seats share the base checkout.`
      });
      continue;
    }
    const branch2 = `mj/${opts.missionSlug}/${branchSafe(seat2.id)}`;
    const path4 = `${root}-mj-${branchSafe(seat2.id)}`;
    plans.push({
      seatId: seat2.id,
      branch: branch2,
      path: path4,
      createArgv: [["worktree", "add", "-b", branch2, path4, opts.baseBranch]],
      removeArgv: [["worktree", "remove", "--force", path4]],
      shared: false,
      deferred: false,
      reason: `${seat2.role} writes, so it gets its own worktree on ${branch2}. Two agents in one working tree overwrite each other.`
    });
  }
  return plans;
}
function reviewSnapshotBranch(missionSlug) {
  return `mj/${missionSlug}/review`;
}
function reviewSnapshotArgv(opts) {
  const snapshotBranch = reviewSnapshotBranch(opts.missionSlug);
  if (opts.writerBranches.length === 0) {
    return { argv: [], snapshotBranch, problem: "No writer produced a branch, so there is nothing to snapshot." };
  }
  const argv = [
    ["checkout", "-B", snapshotBranch, opts.baseBranch]
  ];
  for (const b of opts.writerBranches) argv.push(["merge", "--no-ff", "--no-edit", b]);
  return { argv, snapshotBranch, problem: null };
}
function reviewWorktreeArgv(snapshotBranch, path4) {
  return [["worktree", "add", "--detach", path4, snapshotBranch]];
}
function snapshotPreflightArgv(baseBranch, writerBranches) {
  const out = [];
  for (let i = 0; i < writerBranches.length; i += 1) {
    for (let j = i + 1; j < writerBranches.length; j += 1) {
      const a = writerBranches[i];
      const b = writerBranches[j];
      if (a && b) out.push(["merge-tree", "--write-tree", "--name-only", a, b]);
    }
  }
  void baseBranch;
  return out;
}
var CONTEXT_PATHS = [
  { harness: "claude", path: "CLAUDE.md" },
  { harness: "codex", path: "AGENTS.md" },
  { harness: "opencode", path: "AGENTS.md" },
  { harness: "grok", path: "AGENTS.md" },
  { harness: "cursor", path: ".cursor/rules/mj.mdc" },
  { harness: "cline", path: ".clinerules" },
  { harness: "kilo", path: ".kilo/rules.md" }
];
function briefingContents(opts) {
  const constraintsList = opts.constraints && opts.constraints.length ? opts.constraints.map((c) => `- ${c}`).join("\n") : "- (none declared)";
  const doNotTouchList = opts.doNotTouch && opts.doNotTouch.length ? opts.doNotTouch.map((p) => `- ${p}`).join("\n") : "- (none declared)";
  return [
    `# MISSION BRIEFING \u2014 Generated by MJ`,
    ``,
    `## Objective`,
    opts.objective,
    ``,
    `## Constraints`,
    constraintsList,
    ``,
    `## Off-limits files (Do not touch)`,
    doNotTouchList,
    ``,
    `## Collaboration Rules`,
    `- OTHER worktrees are active simultaneously. Work ONLY on files matching your task scope.`,
    `- Do not reformat unrelated code; clean diffs make peer reviews possible.`,
    opts.testCommand ? `- Verify command: \`${opts.testCommand.join(" ")}\`` : ""
  ].filter(Boolean).join("\n");
}
function writeContextFiles(team, opts) {
  const activeHarnesses = new Set(team.seats.map((s) => s.harness));
  const out = [];
  const seenPaths = /* @__PURE__ */ new Set();
  const body = briefingContents(opts);
  for (const entry of CONTEXT_PATHS) {
    if (activeHarnesses.has(entry.harness)) {
      if (seenPaths.has(entry.path)) continue;
      seenPaths.add(entry.path);
      out.push({
        path: entry.path,
        contents: body,
        forHarness: entry.harness
      });
    }
  }
  if (out.length === 0 && team.seats.length > 0) {
    out.push({
      path: "AGENTS.md",
      contents: body,
      forHarness: team.seats[0].harness
    });
  }
  return out;
}

// src/mission/mergePlan.ts
var ROLE_ORDER = {
  architect: 0,
  coder: 1,
  debugger: 2,
  tester: 3,
  security: 4,
  reviewer: 5,
  synthesizer: 6
};
function orderBranches(candidates) {
  const byBranch = new Map(candidates.map((c) => [c.branch, c]));
  const ordered = [];
  const placed = /* @__PURE__ */ new Set();
  const cycles = [];
  const visit = (c, stack) => {
    if (placed.has(c.branch)) return;
    if (stack.includes(c.branch)) {
      cycles.push([...stack.slice(stack.indexOf(c.branch)), c.branch].join(" -> "));
      return;
    }
    for (const dep of c.dependsOn) {
      const d = byBranch.get(dep);
      if (d) visit(d, [...stack, c.branch]);
    }
    placed.add(c.branch);
    ordered.push(c);
  };
  const sorted = [...candidates].sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 99;
    const rb = ROLE_ORDER[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    return b.additions + b.deletions - (a.additions + a.deletions);
  });
  for (const c of sorted) visit(c, []);
  return { ordered, cycles };
}
function planMerge(candidates, opts) {
  const problems = [];
  const excluded = [];
  const mergeable = [];
  for (const c of candidates) {
    if (!c.verified) {
      excluded.push({ branch: c.branch, seatId: c.seatId, reason: "Its own verification did not pass, so it does not merge. A branch that failed its checks would put a known-broken state on the base branch." });
      continue;
    }
    if (c.additions + c.deletions === 0) {
      excluded.push({ branch: c.branch, seatId: c.seatId, reason: "It changed nothing. Merging an empty branch adds a commit and a conflict surface for no benefit." });
      continue;
    }
    mergeable.push(c);
  }
  const { ordered, cycles } = orderBranches(mergeable);
  for (const cyc of cycles) problems.push(`Dependency cycle: ${cyc}. Two branches each claim to depend on the other, which is a decomposition bug \u2014 MJ will not guess an order.`);
  const steps = ordered.map((c, i) => ({
    order: i + 1,
    branch: c.branch,
    seatId: c.seatId,
    argv: [
      ["checkout", opts.baseBranch],
      ["merge", "--no-ff", "--no-edit", c.branch]
    ],
    requires: i === 0 ? [opts.baseBranch] : [ordered[i - 1]?.branch ?? opts.baseBranch],
    note: c.role === "tester" ? "Tests merge after the code they test, so the base branch is never in a state where tests reference code that is not there." : c.dependsOn.length ? `Depends on ${c.dependsOn.join(", ")}, so it merges after them.` : `${c.role} work; +${c.additions}/-${c.deletions}.`
  }));
  const preflight = [];
  for (let i = 0; i < mergeable.length; i += 1) {
    for (let j = i + 1; j < mergeable.length; j += 1) {
      const a = mergeable[i];
      const b = mergeable[j];
      if (!a || !b) continue;
      if (a.dependsOn.includes(b.branch) || b.dependsOn.includes(a.branch)) continue;
      preflight.push({
        a: a.branch,
        b: b.branch,
        // merge-tree does a three-way merge in memory. No working tree is touched, so this is safe to
        // run while agents are still working.
        //
        // It takes TWO branches, not three: the merge base is derived from their history. Passing the
        // base as a third argument makes git reject the command with a usage error (exit 129), which is
        // easy to mistake for "these branches conflict" — verified on git 2.47.3.
        argv: ["merge-tree", "--write-tree", "--name-only", a.branch, b.branch],
        why: `Neither declares a dependency on the other, so a conflict here would be a surprise. Check before merging, not after.`
      });
    }
  }
  if (mergeable.length > 4) {
    problems.push(`${mergeable.length} branches are queued to merge. Four is about where review stops keeping up; consider splitting the mission.`);
  }
  if (excluded.length === candidates.length && candidates.length > 0) {
    problems.push("Every branch was excluded, so nothing will be merged. The mission produced no verified change.");
  }
  const cleanup = [];
  for (const c of mergeable) {
    cleanup.push(["worktree", "remove", "--force", c.worktreePath]);
    cleanup.push(["branch", "-d", c.branch]);
  }
  cleanup.push(["worktree", "prune"]);
  return { steps, excluded, preflight, postMergeCheck: opts.testCommand ?? [], cleanup, problems };
}

// src/mission/interAgentChannel.ts
var InterAgentMessageBus = class {
  messages = [];
  blackboard = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  blackboardListeners = /* @__PURE__ */ new Set();
  seqCounter = 0;
  constructor(initialMessages = []) {
    this.messages = [...initialMessages];
    this.seqCounter = initialMessages.length;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  subscribeBlackboard(listener) {
    this.blackboardListeners.add(listener);
    return () => this.blackboardListeners.delete(listener);
  }
  publish(msg) {
    const nextSeq = ++this.seqCounter;
    const full = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sequence: nextSeq,
      seq: nextSeq,
      replyToId: msg.replyToId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      channel: msg.channel,
      sender: msg.sender,
      mentions: msg.mentions ?? [],
      intent: msg.intent,
      content: msg.content,
      data: msg.data
    };
    this.messages.push(full);
    for (const listener of this.listeners) {
      try {
        listener(full);
      } catch (err) {
        console.error("Inter-agent bus listener error:", err);
      }
    }
    return full;
  }
  getMessages(filter) {
    if (!filter) return [...this.messages];
    if (typeof filter === "string") {
      if (filter === "#all") return [...this.messages];
      return this.messages.filter((m) => m.channel === filter);
    }
    return this.messages.filter((m) => {
      if (filter.channel && filter.channel !== "#all" && m.channel !== filter.channel) return false;
      if (filter.sender && m.sender.seatId !== filter.sender) return false;
      if (filter.mention) {
        const target = filter.mention.startsWith("@") ? filter.mention : `@${filter.mention}`;
        const hasDirect = m.mentions.includes(target) || m.mentions.includes("@all");
        const mentionsInText = m.content.includes(target);
        if (!hasDirect && !mentionsInText) return false;
      }
      return true;
    });
  }
  getThread(messageId) {
    const root = this.messages.find((m) => m.id === messageId);
    if (!root) return [];
    const thread = [root];
    const queue = [root.id];
    while (queue.length > 0) {
      const currentId = queue.shift();
      const replies = this.messages.filter((m) => m.replyToId === currentId && !thread.some((t) => t.id === m.id));
      for (const reply of replies) {
        thread.push(reply);
        queue.push(reply.id);
      }
    }
    return thread.sort((a, b) => a.sequence - b.sequence);
  }
  writeBlackboard(key, value, author, category) {
    const existing = this.blackboard.get(key);
    const entry = {
      key,
      author,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      category,
      value,
      version: (existing?.version ?? 0) + 1
    };
    this.blackboard.set(key, entry);
    for (const listener of this.blackboardListeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error("Blackboard listener error:", err);
      }
    }
    return entry;
  }
  readBlackboard(key) {
    return this.blackboard.get(key) ?? null;
  }
  getBlackboard() {
    return Array.from(this.blackboard.values());
  }
  clear() {
    this.messages = [];
    this.blackboard.clear();
    this.seqCounter = 0;
  }
};
var globalAgentBus = new InterAgentMessageBus();

// src/mission/organizationalMemory.ts
var SEED_INVARIANTS = [
  {
    id: "inv-001-worktree-isolation",
    category: "sandbox",
    rule: "Writing agents must never write directly into the base repository checkout; all edits must be staged in private sibling worktrees.",
    originatingMissionId: "mission-init-01",
    failureObserved: "Base checkout dirty with untracked files before reviewer execution.",
    verifiedRepairAction: "Allocated dedicated git worktrees per writing seat under mj/<mission>/<seatId>.",
    timesApplied: 34,
    successRate: 1,
    active: true
  },
  {
    id: "inv-002-snapshot-peer-review",
    category: "testing",
    rule: "Reviewers must inspect a synthesized merge snapshot branch (--no-ff) containing all writer commits, not the untouched base checkout.",
    originatingMissionId: "mission-init-02",
    failureObserved: "Reviewer passed code without seeing newly written features.",
    verifiedRepairAction: "Built temporary review snapshot branch mj/<mission>/review before wave 3 review runs.",
    timesApplied: 28,
    successRate: 1,
    active: true
  },
  {
    id: "inv-003-async-token-bucket",
    category: "concurrency",
    rule: "Token bucket rate limiters must acquire an atomic reservation lock before consuming burst tokens in async handlers.",
    originatingMissionId: "mission-payment-04",
    failureObserved: "Parallel request burst drained bucket below zero.",
    verifiedRepairAction: "Wrapped token consumption in atomic reservation promise.",
    timesApplied: 12,
    successRate: 0.95,
    active: true
  }
];
var OrganizationalMemoryCortex = class {
  invariants = /* @__PURE__ */ new Map();
  constructor(initial = SEED_INVARIANTS) {
    for (const inv of initial) {
      this.invariants.set(inv.id, inv);
    }
  }
  recordRepairSuccess(category, failureObserved, verifiedRepairAction, missionId, rule) {
    const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const invariant = {
      id,
      category,
      rule,
      originatingMissionId: missionId,
      failureObserved,
      verifiedRepairAction,
      timesApplied: 1,
      successRate: 1,
      active: true
    };
    this.invariants.set(id, invariant);
    globalAgentBus.writeBlackboard(
      `cortex.invariants.${id}`,
      `Rule: ${rule}
Origin: ${missionId}
Action: ${verifiedRepairAction}`,
      "memory_cortex",
      "architecture"
    );
    return invariant;
  }
  compileBriefing() {
    const active = Array.from(this.invariants.values()).filter((i) => i.active);
    const cortexId = `cortex-${Date.now()}`;
    const lines = [
      "# ORGANIZATIONAL MEMORY & LEARNED INVARIANTS",
      `<!-- Auto-compiled by MJ Memory Cortex for Mission Execution (${(/* @__PURE__ */ new Date()).toISOString()}) -->`,
      "",
      "The following architectural invariants were derived from past empirical failures and proven repairs:",
      ""
    ];
    for (const inv of active) {
      lines.push(`### [${inv.category.toUpperCase()}] ${inv.rule}`);
      lines.push(`- **Failure Observed**: ${inv.failureObserved}`);
      lines.push(`- **Proven Repair**: ${inv.verifiedRepairAction}`);
      lines.push(`- **Historical Reliability**: ${(inv.successRate * 100).toFixed(0)}% across ${inv.timesApplied} runs`);
      lines.push("");
    }
    const generatedBriefingMarkdown = lines.join("\n");
    const agentsMdInjections = active.map((i) => `MUST OBEY: ${i.rule}`);
    return {
      cortexId,
      invariantsCompiled: active.length,
      activeRules: active,
      generatedBriefingMarkdown,
      agentsMdInjections
    };
  }
  getInvariants() {
    return Array.from(this.invariants.values());
  }
};
var globalMemoryCortex = new OrganizationalMemoryCortex();

// src/mission/consensusEngine.ts
var AgentReputationLedger = class {
  ledger = /* @__PURE__ */ new Map();
  constructor() {
    const harnesses = [
      "claude",
      "codex",
      "opencode",
      "cursor",
      "grok",
      "cline",
      "aider",
      "gemini",
      "goose",
      "qwen",
      "amazonq",
      "kilo",
      "hermes",
      "acp",
      "llm"
    ];
    for (const h of harnesses) {
      this.ledger.set(h, {
        seatId: h,
        harness: h,
        missionsParticipated: 0,
        verifiedCommits: 0,
        accurateReviews: 0,
        falseAlarms: 0,
        reputationWeight: 1
        // Neutral 1.0 baseline
      });
    }
  }
  getReputation(harnessOrSeatId) {
    return this.ledger.get(harnessOrSeatId) ?? {
      seatId: harnessOrSeatId,
      harness: "llm",
      missionsParticipated: 0,
      verifiedCommits: 0,
      accurateReviews: 0,
      falseAlarms: 0,
      reputationWeight: 1
    };
  }
  recordOutcome(harnessOrSeatId, result) {
    const rep = this.getReputation(harnessOrSeatId);
    rep.missionsParticipated++;
    if (result.verifiedCommit) rep.verifiedCommits++;
    if (result.accurateReview) rep.accurateReviews++;
    if (result.falseAlarm) rep.falseAlarms++;
    const delta = rep.accurateReviews * 0.05 + rep.verifiedCommits * 0.05 - rep.falseAlarms * 0.1;
    rep.reputationWeight = Math.min(2, Math.max(0.5, 1 + delta));
    this.ledger.set(harnessOrSeatId, rep);
    return rep;
  }
  getAll() {
    return Array.from(this.ledger.values());
  }
};
var globalReputationLedger = new AgentReputationLedger();
var INITIAL_REPUTATIONS = Object.fromEntries(
  globalReputationLedger.getAll().map((r) => [r.harness, r])
);

// src/mission/teamExecutor.ts
var OUTPUT_TAIL_CHARS = 4e3;
var BRIEF_DIR = ".mj-brief";
function waveGroups(assignments) {
  const byWave = /* @__PURE__ */ new Map();
  for (const a of assignments) {
    const list = byWave.get(a.wave) ?? [];
    list.push(a);
    byWave.set(a.wave, list);
  }
  return [...byWave.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
}
async function git(deps, args, cwd) {
  if (!deps.git) return { ok: false, stdout: "", stderr: "", exitCode: null };
  const r = await deps.git(args, cwd);
  return { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
}
async function executeTeam(req, deps, sessions = new SessionStore()) {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  const startedAt = new Date(t0).toISOString();
  const seats = [];
  const notRun = [];
  const setup = [];
  const emptySnapshot = { built: false, branch: "", sha: null, writerBranches: [], conflicts: [], detail: "Not attempted." };
  const finish = (status2, summary, spentUsd2, snapshot2, briefings2) => {
    if (status2 === "completed") {
      globalMemoryCortex.recordRepairSuccess(
        "architecture",
        `Mission ${req.missionSlug} task completed`,
        `Verified worktree commit and review passed on ${req.baseBranch}`,
        req.missionSlug,
        `Mission "${req.objective}" verified with 0 regressions.`
      );
    }
    globalAgentBus.publish({
      channel: "#general",
      sender: { seatId: "orchestrator", role: "planner", harness: "llm", name: "Team Orchestrator" },
      mentions: ["@all"],
      intent: "broadcast",
      content: `Team mission "${req.missionSlug}" finished with status ${status2.toUpperCase()} ($${(spentUsd2 || 0).toFixed(4)} spent). Summary: ${summary}`
    });
    globalAgentBus.writeBlackboard("mission.verdict", `Status: ${status2}
Summary: ${summary}
Spent: $${(spentUsd2 || 0).toFixed(4)}`, "orchestrator", "finding");
    return {
      seats,
      status: status2,
      summary,
      spentUsd: spentUsd2,
      notRun,
      setup,
      briefings: briefings2,
      snapshot: snapshot2,
      merge: { candidates: [], plan: planMerge([], { baseBranch: req.baseBranch, repoRoot: req.repoRoot, testCommand: req.testCommand }) },
      startedAt,
      finishedAt: new Date(now()).toISOString(),
      wallClockMs: now() - t0
    };
  };
  globalAgentBus.publish({
    channel: "#general",
    sender: { seatId: "orchestrator", role: "planner", harness: "llm", name: "Team Orchestrator" },
    mentions: ["@all"],
    intent: "broadcast",
    content: `Launching Team Mission "${req.missionSlug}": ${req.objective} with ${req.team.seats.length} seats.`
  });
  const worktrees = planWorktrees(req.team, { repoRoot: req.repoRoot, baseBranch: req.baseBranch, missionSlug: req.missionSlug, deferReview: true });
  const wtBySeat = new Map(worktrees.map((w) => [w.seatId, w]));
  const briefingsByHarness = writeContextFiles(req.team, {
    objective: req.objective,
    constraints: req.constraints ?? [],
    doNotTouch: req.doNotTouch ?? [],
    testCommand: req.testCommand
  });
  const learnedMarkdown = globalMemoryCortex.compileBriefing().generatedBriefingMarkdown;
  for (const seat2 of req.team.seats) {
    briefingsByHarness.push({
      path: ".mj-brief/LEARNED_INVARIANTS.md",
      contents: learnedMarkdown,
      forHarness: seat2.harness
    });
  }
  const setupFailed = /* @__PURE__ */ new Set();
  for (const w of worktrees) {
    if (w.deferred) {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: "Deferred: created on the review snapshot when this seat's wave runs." });
      continue;
    }
    if (w.shared) {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: "Runs in the base checkout \u2014 no writer exists on this team, so there is nothing to snapshot." });
      continue;
    }
    if (!deps.git) {
      setup.push({ seatId: w.seatId, path: w.path, ok: false, detail: "MJ has no git runner here, so the worktree was NOT created. This seat would have written into the base checkout, which defeats isolation, so it is blocked instead." });
      setupFailed.add(w.seatId);
      continue;
    }
    let failed = null;
    for (const argv of w.createArgv) {
      const r = await git(deps, argv, req.repoRoot);
      if (!r.ok) {
        failed = r.exitCode === null ? `git ${argv.join(" ")} could not run.` : `git ${argv.join(" ")} exited ${r.exitCode}: ${(r.stderr || r.stdout).trim().slice(0, 200)}`;
        break;
      }
    }
    if (failed) {
      setup.push({ seatId: w.seatId, path: w.path, ok: false, detail: failed });
      setupFailed.add(w.seatId);
    } else {
      setup.push({ seatId: w.seatId, path: w.path, ok: true, detail: `Created ${w.branch} at ${w.path}.` });
    }
  }
  const briefings = [];
  const writerWorktrees = worktrees.filter((w) => !w.shared && !w.deferred && !setupFailed.has(w.seatId));
  for (const f of briefingsByHarness) {
    const writtenTo = [];
    for (const w of writerWorktrees) {
      const target = `${w.path}/${BRIEF_DIR}/${f.path}`;
      if (deps.writeFile) {
        try {
          await deps.writeFile(target, f.contents);
          writtenTo.push(w.path);
        } catch {
        }
      }
    }
    briefings.push({
      path: `${BRIEF_DIR}/${f.path}`,
      writtenTo,
      excludedFromGit: false,
      detail: writtenTo.length ? `Written into ${writtenTo.length} worktree(s), under ${BRIEF_DIR}/, which MJ adds to .git/info/exclude so it can never be committed.` : deps.writeFile ? "No writable worktree existed for this briefing." : "MJ has no file writer here, so the briefing was composed but NOT written. The agents will not see it."
    });
  }
  let excludedEverywhere = true;
  for (const w of writerWorktrees) {
    const okExcl = await excludeBriefDir(deps, w.path);
    if (!okExcl) excludedEverywhere = false;
  }
  for (const b of briefings) {
    b.excludedFromGit = excludedEverywhere && b.writtenTo.length > 0;
    if (b.writtenTo.length > 0 && !excludedEverywhere) {
      b.detail = `Written into ${b.writtenTo.length} worktree(s), but MJ could NOT exclude ${BRIEF_DIR}/ from git. Those files will appear as untracked and WILL be picked up by a commit \u2014 treat this seat's diff as containing the briefing.`;
    }
  }
  const waves = waveGroups(req.assignments);
  const runnable = /* @__PURE__ */ new Map();
  const binPaths = /* @__PURE__ */ new Map();
  for (const w of waves) {
    for (const a of w) {
      if (runnable.has(a.seat.id)) continue;
      const rc = resolveCaps(a.seat.harness);
      const caps = rc.caps;
      if (rc.custom && !rc.registered) {
        runnable.set(a.seat.id, false);
        notRun.push({ seatId: a.seat.id, reason: `Custom harness "${a.seat.harness}" is not registered (anymore). Add it in Teams -> Connect, then recompile.` });
        continue;
      }
      let resolved = null;
      for (const b of caps.bins) {
        const r = await deps.resolveBin(b);
        if (r) {
          resolved = r;
          break;
        }
      }
      if (resolved) binPaths.set(a.seat.harness, resolved);
      const ok2 = resolved !== null;
      runnable.set(a.seat.id, ok2);
      if (!ok2) notRun.push({ seatId: a.seat.id, reason: `None of ${caps.name}'s binaries (${caps.bins.join(", ")}) are installed or executable. Install: ${caps.install}` });
    }
  }
  const minSeats = req.minimumRunnableSeats ?? 1;
  const runnableCount = [...runnable.values()].filter(Boolean).length;
  if (runnableCount < minSeats) {
    return finish(
      "aborted",
      `Aborted before any invocation: only ${runnableCount} of ${req.assignments.length} seats can run, and ${minSeats} is the minimum. Nothing was executed and nothing was charged.`,
      0,
      emptySnapshot,
      briefings
    );
  }
  let waveFailed = false;
  let snapshot = emptySnapshot;
  const committedBranches = [];
  for (const wave of waves) {
    if (waveFailed) {
      for (const a of wave) {
        notRun.push({ seatId: a.seat.id, reason: "An earlier wave did not complete, so this seat was skipped rather than asked to review work that does not exist." });
        seats.push(unrunRecord(a, wtBySeat.get(a.seat.id) ?? null, "skipped_wave_failed", "Skipped: an earlier wave did not complete."));
      }
      continue;
    }
    const hasReadOnly = wave.some((a) => a.readOnly || !a.seat.mayWrite);
    const skippedIds = /* @__PURE__ */ new Set();
    if (hasReadOnly && worktrees.some((w) => w.deferred)) {
      snapshot = await buildReviewSnapshot(req, deps, worktrees, committedBranches, setupFailed);
      if (!snapshot.built) {
        for (const a of wave.filter((x) => x.readOnly || !x.seat.mayWrite)) {
          const wt = wtBySeat.get(a.seat.id);
          if (!wt?.deferred) continue;
          skippedIds.add(a.seat.id);
          const outcome = committedBranches.length === 0 ? "skipped_nothing_to_review" : "review_snapshot_failed";
          seats.push(
            unrunRecord(
              a,
              wt,
              outcome,
              committedBranches.length === 0 ? "Nothing was committed by any writer, so there was no work to review. Reviewing the untouched base would have produced a verdict about code nobody wrote." : `The review snapshot could not be built: ${snapshot.detail}`
            )
          );
          notRun.push({ seatId: a.seat.id, reason: committedBranches.length === 0 ? "No writer committed anything, so there was nothing to review." : snapshot.detail });
        }
      }
    }
    const runnableWave = wave.filter((a) => !skippedIds.has(a.seat.id));
    const results = await Promise.all(
      runnableWave.map(
        (a) => runSeat(
          req,
          deps,
          a,
          sessions,
          wtBySeat.get(a.seat.id) ?? null,
          runnable.get(a.seat.id) ?? false,
          binPaths.get(a.seat.harness) ?? null,
          setupFailed,
          snapshot,
          briefingsByHarness,
          now
        )
      )
    );
    seats.push(...results);
    for (const r of results) {
      if (r.outcome === "completed" && r.branch && r.branch !== req.baseBranch && !committedBranches.includes(r.branch)) {
        if (/Committed on/.test(r.commit)) committedBranches.push(r.branch);
      }
    }
    if (results.every((r) => r.outcome !== "completed")) waveFailed = true;
  }
  const spentUsd = seats.reduce((s, r) => s + r.chargedUsd, 0);
  const candidates = seats.filter((r) => r.branch && r.branch !== req.baseBranch && !r.branch.startsWith(`mj/${req.missionSlug}/review`)).map((r) => ({
    seatId: r.seatId,
    branch: r.branch,
    worktreePath: r.worktreePath,
    role: r.role,
    dependsOn: req.assignments.find((a) => a.seat.id === r.seatId)?.dependsOn ?? [],
    verified: r.verified,
    additions: r.git.measured ? r.git.additions : 0,
    deletions: r.git.measured ? r.git.deletions : 0
  }));
  const plan = planMerge(candidates, { baseBranch: req.baseBranch, repoRoot: req.repoRoot, testCommand: req.testCommand });
  const completed = seats.filter((r) => r.outcome === "completed").length;
  const verifiedCount = seats.filter((r) => r.verified).length;
  const status = seats.length === 0 ? "blocked" : completed === seats.length && completed > 0 ? "completed" : completed > 0 ? "partial" : "blocked";
  return {
    seats,
    status,
    summary: buildSummary({ status, seats, verifiedCount, spentUsd, notRun, briefings, snapshot }),
    spentUsd,
    notRun,
    setup,
    briefings,
    snapshot,
    merge: { candidates, plan },
    startedAt,
    finishedAt: new Date(now()).toISOString(),
    wallClockMs: now() - t0
  };
}
async function buildReviewSnapshot(req, deps, worktrees, committedBranches, setupFailed) {
  const plan = reviewSnapshotArgv({ repoRoot: req.repoRoot, baseBranch: req.baseBranch, missionSlug: req.missionSlug, writerBranches: committedBranches });
  if (plan.problem || !deps.git) {
    return { built: false, branch: plan.snapshotBranch, sha: null, writerBranches: committedBranches, conflicts: [], detail: plan.problem ?? "MJ has no git runner, so the snapshot could not be built." };
  }
  const conflicts = [];
  for (const argv of snapshotPreflightArgv(req.baseBranch, committedBranches)) {
    const r = await git(deps, argv, req.repoRoot);
    if (r.exitCode === 1) {
      const paths = r.stdout.split(/\r?\n/).slice(1).filter((l) => l.trim()).join(", ");
      conflicts.push(`Writers disagree: ${paths || "conflicting changes"}`);
    }
  }
  let failed = null;
  for (const argv of plan.argv) {
    const r = await git(deps, argv, req.repoRoot);
    if (!r.ok) {
      failed = `git ${argv.join(" ")} exited ${r.exitCode ?? "null"}: ${(r.stderr || r.stdout).trim().slice(0, 240)}`;
      break;
    }
  }
  if (failed) {
    return { built: false, branch: plan.snapshotBranch, sha: null, writerBranches: committedBranches, conflicts, detail: failed };
  }
  const head = await git(deps, ["rev-parse", "HEAD"], req.repoRoot);
  const sha = head.ok ? head.stdout.trim() || null : null;
  for (const w of worktrees) {
    if (!w.deferred || setupFailed.has(w.seatId)) continue;
    for (const argv of reviewWorktreeArgv(plan.snapshotBranch, w.path)) {
      const r = await git(deps, argv, req.repoRoot);
      if (!r.ok) {
        setupFailed.add(w.seatId);
        await git(deps, ["checkout", "-q", req.baseBranch], req.repoRoot);
        return { built: false, branch: plan.snapshotBranch, sha, writerBranches: committedBranches, conflicts, detail: `git ${argv.join(" ")} exited ${r.exitCode ?? "null"}: ${(r.stderr || r.stdout).trim().slice(0, 240)}` };
      }
    }
    await excludeBriefDir(deps, w.path);
  }
  await git(deps, ["checkout", "-q", req.baseBranch], req.repoRoot);
  return {
    built: true,
    branch: plan.snapshotBranch,
    sha,
    writerBranches: committedBranches,
    conflicts,
    detail: `Built ${plan.snapshotBranch} from ${committedBranches.join(" + ")} on top of ${req.baseBranch}.`
  };
}
async function excludeBriefDir(deps, worktreePath) {
  if (!deps.git || !deps.writeFile) return false;
  const r = await git(deps, ["rev-parse", "--git-common-dir"], worktreePath);
  if (!r.ok) return false;
  let gitDir = r.stdout.trim();
  if (!gitDir) return false;
  const isAbs = gitDir.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(gitDir);
  if (!isAbs) gitDir = path2.resolve(worktreePath, gitDir);
  try {
    const excludePath = path2.join(gitDir, "info", "exclude");
    await deps.writeFile(excludePath, `${BRIEF_DIR}/
`);
    const check = await git(deps, ["status", "--porcelain"], worktreePath);
    return check.ok && !check.stdout.includes(BRIEF_DIR);
  } catch {
    return false;
  }
}
async function runSeat(req, deps, a, sessions, wt, binaryExists, resolvedBin, setupFailedSeats, snapshot, briefings, now) {
  const caps = resolveCaps(a.seat.harness).caps;
  const readOnly = a.readOnly || !a.seat.mayWrite;
  const cwd = wt?.path ?? req.repoRoot;
  const branch2 = wt?.deferred ? snapshot.branch : wt?.branch ?? req.baseBranch;
  const reviewedRef = wt?.deferred ? snapshot.sha ?? snapshot.branch : branch2;
  const base = {
    seatId: a.seat.id,
    role: a.seat.role,
    harness: a.seat.harness,
    harnessName: caps.name,
    bin: resolvedBin ?? caps.bins[0] ?? "",
    argv: [],
    cwd,
    branch: branch2,
    worktreePath: cwd,
    reviewedRef,
    reviewedSha: wt?.deferred ? snapshot.sha : null,
    wave: a.wave,
    turnsRun: 0,
    sessionId: null,
    continuity: "none",
    exitCode: null,
    durationMs: 0,
    usage: { costUsd: null, tokens: null, turns: null, source: a.seat.harness },
    chargedUsd: 0,
    verified: false,
    verificationDetail: "Not run.",
    git: { measured: false, detail: "Not measured.", additions: 0, deletions: 0, filesChanged: 0 },
    commit: "Never ran, so nothing was committed.",
    warnings: [],
    selfReport: null,
    outputTail: ""
  };
  if (!binaryExists) {
    return { ...base, outcome: "blocked_missing_binary", reason: `${caps.name} is not installed, so this seat never ran. Install: ${caps.install}` };
  }
  if (setupFailedSeats.has(a.seat.id)) {
    return {
      ...base,
      outcome: wt?.deferred ? "review_snapshot_failed" : "failed",
      reason: wt?.deferred ? "This seat's review worktree could not be created, so it never ran. Running it in the base checkout instead would have it review the tree from before the work happened \u2014 the exact mistake the review snapshot exists to prevent." : "This seat's worktree could not be created, so it never ran. Running it anyway would have pointed it at the base checkout and let it overwrite another seat's work."
    };
  }
  if (wt?.deferred && !snapshot.built) {
    return { ...base, outcome: "skipped_nothing_to_review", reason: "No review snapshot exists, so there was no work to review." };
  }
  if (deps.writeFile && cwd !== req.repoRoot) {
    for (const f of briefings) {
      try {
        await deps.writeFile(`${cwd}/${BRIEF_DIR}/${f.path}`, f.contents);
      } catch {
      }
    }
  }
  const sessionKey = { seatId: a.seat.id, harness: a.seat.harness, model: a.seat.model, cwd };
  const session = sessions.obtain(sessionKey);
  const channel = a.seat.role === "planner" || a.seat.role === "architect" ? "#architecture" : a.seat.role === "security" ? "#security-audit" : a.seat.mayWrite ? "#implementation-sync" : "#qa-review";
  globalAgentBus.publish({
    channel,
    sender: { seatId: a.seat.id, role: a.seat.role, harness: a.seat.harness, name: caps.name },
    mentions: ["@all"],
    intent: a.seat.role === "planner" || a.seat.role === "architect" ? "proposal" : a.seat.mayWrite ? "proposal" : "verification",
    content: `[Wave ${a.wave}] Commencing execution in ${cwd} (${branch2}).`
  });
  const turns = [{ prompt: a.prompt, turn: 1 }];
  if (a.followUp) turns.push({ prompt: a.followUp, turn: 2 });
  let last = null;
  let continuity = "none";
  let chargedTotal = 0;
  let usage = base.usage;
  const warnings = [];
  let lastArgv = [];
  let lastSummary = "";
  for (const t of turns) {
    const admission = req.ledger.admissionError(now());
    if (admission) {
      return { ...base, argv: lastArgv, sessionId: session.sessionId, continuity, turnsRun: t.turn - 1, chargedUsd: chargedTotal, usage, warnings, outcome: "blocked_budget", reason: `Turn ${t.turn} was never started: ${admission}` };
    }
    const composed = composeSeatArgv(a.seat, {
      prompt: t.turn === 1 ? t.prompt : followUpPrompt({ continuity, harnessName: caps.name, previousSummary: lastSummary, instruction: t.prompt }),
      cwd,
      readOnly,
      sessionId: session.sessionId,
      turn: t.turn
    });
    lastArgv = composed.argv;
    warnings.push(...composed.warnings.filter((w) => !warnings.includes(w)));
    const timeoutSecs = a.seat.timeoutSecs > 0 ? a.seat.timeoutSecs : 600;
    const enforced = await withDeadline(
      () => deps.cliInvoke({ bin: resolvedBin ?? composed.bin, argv: composed.argv, env: composed.env, cwd, timeoutSecs }),
      timeoutSecs * 1e3,
      now
    );
    const res = enforced.value;
    const durationMs = res ? res.durationMs : enforced.elapsedMs;
    if (enforced.outcome === "timeout" || res?.timedOut) {
      req.ledger.recordCapped(a.seat.id, "timeout", `${caps.name} exceeded its ${timeoutSecs}s deadline on turn ${t.turn}. The child had to be killed; MJ cannot assume it stopped cleanly.`);
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity,
        turnsRun: t.turn - 1,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        outputTail: tail(res?.stdout ?? ""),
        outcome: "timeout",
        reason: `Turn ${t.turn} ran past its ${timeoutSecs}s deadline and was killed. Partial work may be left in the worktree.`
      };
    }
    if (!res) {
      return { ...base, argv: composed.argv, sessionId: session.sessionId, continuity, turnsRun: t.turn - 1, chargedUsd: chargedTotal, usage, warnings, outcome: "failed", reason: `Turn ${t.turn} produced no result: ${enforced.detail}` };
    }
    last = res;
    const reportedId = parseSessionId(a.seat.harness, res.stdout);
    if (reportedId) continuity = "session";
    sessions.recordTurn(sessionKey, reportedId, t.prompt);
    const resumeProblem = detectResumeFailure(res.stdout + "\n" + res.stderr);
    if (resumeProblem && t.turn > 1) {
      sessions.markResumeFailed(sessionKey);
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity: "none",
        turnsRun: t.turn - 1,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        exitCode: res.exitCode,
        outputTail: tail(res.stdout || res.stderr),
        outcome: "resume_failed",
        reason: `Turn ${t.turn} could not resume the session: ${resumeProblem}. The follow-up never ran, so the repair was not applied.`
      };
    }
    const parsed = parseReportedUsage(a.seat.harness, res.stdout);
    usage = parsed;
    const charge = req.ledger.charge(parsed);
    chargedTotal += charge.chargedUsd;
    if (charge.reason && !charge.reason.startsWith("Charged $0.0000")) warnings.push(charge.reason);
    if (charge.breach) req.ledger.recordCapped(a.seat.id, charge.breach === "mission_cap" ? "mission_cap" : "cost_cap", charge.reason);
    lastSummary = summariseOutput(res.stdout);
    if (deps.onTurn) {
      deps.onTurn({ ...base, argv: composed.argv, turnsRun: t.turn, sessionId: session.sessionId, continuity, outcome: "completed", reason: "", exitCode: res.exitCode, durationMs, usage, chargedUsd: chargedTotal, outputTail: tail(res.stdout), commit: "", warnings, selfReport: lastSummary });
    }
    if (res.exitCode !== 0 || reportsError(res.stdout)) {
      return {
        ...base,
        argv: composed.argv,
        sessionId: session.sessionId,
        continuity,
        turnsRun: t.turn,
        chargedUsd: chargedTotal,
        usage,
        warnings,
        durationMs,
        exitCode: res.exitCode,
        selfReport: lastSummary,
        // stdout when there is any, stderr when that is all the CLI produced. Throwing stderr away is
        // what once hid `Error: Session not found`.
        outputTail: tail(res.stdout || res.stderr),
        outcome: "failed",
        reason: res.exitCode !== 0 ? `${caps.name} exited ${res.exitCode} on turn ${t.turn}. ${res.stderr.trim() ? `It said: ${tail(res.stderr, 500)}` : "It wrote nothing to stderr."}` : `${caps.name} exited 0 but reported an error in its own output, so MJ treats it as a failure rather than a success.`
      };
    }
  }
  let verified = false;
  let verificationDetail = "No verification command is configured for this mission, so nothing was checked. This seat's work is UNVERIFIED.";
  if (deps.verify) {
    const v = await deps.verify(cwd);
    if (v.exitCode === 0) {
      verified = true;
      verificationDetail = `The repository's own check ran in ${cwd} and exited 0.`;
    } else if (v.exitCode === null) {
      verificationDetail = "The verification command did not run at all, so this is NOT a failed check \u2014 it is an unmeasured one. The seat is unverified either way.";
    } else {
      verificationDetail = `The repository's own check ran and FAILED (exit ${v.exitCode}). ${tail(v.stdout || v.stderr, 600)}`;
    }
  }
  const gitEv = await collectGitEvidence(deps.git, cwd);
  let commitDetail = readOnly ? "Read-only seat; nothing to commit." : "No git runner, so the work could not be committed.";
  if (deps.git && !readOnly) {
    await git(deps, ["add", "-A"], cwd);
    const commit = await git(deps, ["-c", "user.email=mj@mj.desktop", "-c", "user.name=MJ", "commit", "-q", "-m", `mj(${a.seat.id}): ${req.missionSlug}`], cwd);
    commitDetail = commit.ok ? `Committed on ${branch2}.` : commit.exitCode === null ? "Could not run git commit." : /nothing to commit|no changes added/i.test(commit.stderr + commit.stdout) ? "Nothing to commit \u2014 this seat changed no files." : `git commit exited ${commit.exitCode}: ${(commit.stderr || commit.stdout).trim().slice(0, 200)}`;
  }
  const finalRecord = {
    ...base,
    argv: lastArgv,
    sessionId: session.sessionId,
    continuity,
    turnsRun: turns.length,
    chargedUsd: chargedTotal,
    usage,
    warnings,
    durationMs: last?.durationMs ?? 0,
    exitCode: last?.exitCode ?? null,
    verified,
    verificationDetail,
    git: gitEv,
    commit: commitDetail,
    selfReport: lastSummary,
    outputTail: tail(last?.stdout ?? ""),
    outcome: "completed",
    reason: verified ? "Completed and verified by the repository's own check." : "Completed, but not verified \u2014 see verificationDetail."
  };
  if (!readOnly && commitDetail.includes("Committed on")) {
    globalReputationLedger.recordOutcome(a.seat.harness, { verifiedCommit: true });
    globalAgentBus.publish({
      channel: "#implementation-sync",
      sender: { seatId: a.seat.id, role: a.seat.role, harness: a.seat.harness, name: caps.name },
      mentions: ["@reviewer", "@architect"],
      intent: "handoff",
      content: `[Wave ${a.wave}] Changes committed on ${branch2}: ${commitDetail}`
    });
    globalAgentBus.writeBlackboard(`commits.${a.seat.id}`, `Worktree: ${cwd}
Branch: ${branch2}
${commitDetail}`, a.seat.id, "contract");
  } else if (readOnly) {
    globalReputationLedger.recordOutcome(a.seat.harness, { accurateReview: true });
    globalAgentBus.publish({
      channel: "#qa-review",
      sender: { seatId: a.seat.id, role: a.seat.role, harness: a.seat.harness, name: caps.name },
      mentions: ["@all"],
      intent: "verification",
      content: `[Wave ${a.wave}] Review finished on ${reviewedRef}. Verdict: ${lastSummary || (verified ? "VERIFIED_PASS" : "DONE")}`
    });
    globalAgentBus.writeBlackboard(`qa.verdict.${a.seat.id}`, `Ref: ${reviewedRef}
Verdict: ${lastSummary || (verified ? "VERIFIED_PASS" : "DONE")}
Verified: ${verified}`, a.seat.id, "test_criteria");
  }
  return finalRecord;
}
async function collectGitEvidence(gitRunner, cwd) {
  if (!gitRunner) return { measured: false, detail: "No git runner is available, so MJ cannot say what changed. This is not a clean tree \u2014 it is an unmeasured one.", additions: 0, deletions: 0, filesChanged: 0 };
  const api = gitApi(gitRunner);
  const status = await api.status(cwd);
  if (!status.ok) return { measured: false, detail: `git status failed: ${status.reason ?? "unknown reason"}`, additions: 0, deletions: 0, filesChanged: 0 };
  const diff = await api.diff(cwd);
  if (!diff.ok || !diff.summary) return { measured: false, detail: `git diff failed: ${diff.reason ?? "unknown reason"}`, additions: 0, deletions: 0, filesChanged: 0 };
  const files = diff.summary.files;
  return {
    measured: true,
    detail: files.length === 0 ? "git reports no changes in this worktree." : `${files.length} file(s) changed: ${files.map((f) => f.path).slice(0, 8).join(", ")}${files.length > 8 ? ", \u2026" : ""}`,
    additions: diff.summary.totalAdditions,
    deletions: diff.summary.totalDeletions,
    filesChanged: files.length
  };
}
function reportsError(raw) {
  for (const line of raw.split(/\r?\n/).reverse()) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (typeof o.is_error === "boolean") return o.is_error;
    } catch {
    }
    break;
  }
  return /"is_error"\s*:\s*true/.test(raw);
}
function summariseOutput(raw) {
  const texts = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (typeof o.result === "string") texts.push(o.result);
      else if (o.part && typeof o.part === "object") {
        const p = o.part;
        if (p.type === "text" && typeof p.text === "string") texts.push(p.text);
      }
    } catch {
    }
  }
  if (texts.length === 0) return raw.trim().slice(-800);
  return texts.join("\n").trim().slice(-800);
}
function tail(s, n2 = OUTPUT_TAIL_CHARS) {
  const t = s.trimEnd();
  return t.length > n2 ? `\u2026(truncated ${t.length - n2} chars)\u2026
${t.slice(-n2)}` : t;
}
function unrunRecord(a, wt, outcome, reason) {
  const caps = resolveCaps(a.seat.harness).caps;
  return {
    seatId: a.seat.id,
    role: a.seat.role,
    harness: a.seat.harness,
    harnessName: caps.name,
    bin: caps.bins[0] ?? "",
    argv: [],
    cwd: wt?.path ?? "",
    branch: wt?.branch ?? "",
    worktreePath: wt?.path ?? "",
    reviewedRef: "",
    reviewedSha: null,
    wave: a.wave,
    turnsRun: 0,
    sessionId: null,
    continuity: "none",
    outcome,
    reason,
    exitCode: null,
    durationMs: 0,
    usage: { costUsd: null, tokens: null, turns: null, source: a.seat.harness },
    chargedUsd: 0,
    verified: false,
    verificationDetail: "Never ran, so nothing was verified.",
    git: { measured: false, detail: "Never ran, so nothing was measured.", additions: 0, deletions: 0, filesChanged: 0 },
    commit: "Never ran, so nothing was committed.",
    warnings: [],
    selfReport: null,
    outputTail: ""
  };
}
function buildSummary(o) {
  const ran = o.seats.filter((s) => s.turnsRun > 0).length;
  const parts = [];
  parts.push(`${ran} of ${o.seats.length} seats ran real CLI invocations; ${o.verifiedCount} were verified by the repository's own check.`);
  if (o.snapshot.built) parts.push(`Reviewers ran against snapshot ${o.snapshot.sha ? o.snapshot.sha.slice(0, 8) : o.snapshot.branch}.`);
  else if (o.snapshot.writerBranches.length === 0) parts.push("No review snapshot was built because no writer committed anything.");
  if (o.spentUsd > 0) parts.push(`Reported spend $${o.spentUsd.toFixed(4)}.`);
  else parts.push("No cost was reported by any CLI, so the true spend is unknown rather than zero.");
  if (o.notRun.length) parts.push(`${o.notRun.length} seat(s) never ran: ${o.notRun.map((n2) => n2.seatId).join(", ")}.`);
  if (o.briefings.some((f) => f.writtenTo.length === 0)) parts.push("At least one briefing could not be written, so some agents ran without the mission brief.");
  if (o.status === "blocked") parts.push("Nothing completed \u2014 this run produced no usable work.");
  return parts.join(" ");
}

// probe/harnesses.test.ts
import { execFileSync } from "node:child_process";
import * as os2 from "node:os";
var pass = 0;
var fail = 0;
var ok = (label, cond, detail = "") => {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (s) => console.log(`
== ${s}
`);
var read = (p) => {
  const direct = path3.join(process.cwd(), p);
  if (fs.existsSync(direct)) return fs.readFileSync(direct, "utf8");
  const history = path3.join(process.cwd(), "docs", "history", p);
  if (fs.existsSync(history)) return fs.readFileSync(history, "utf8");
  return fs.readFileSync(direct, "utf8");
};
var teams = read("src/pages/TeamsPage.tsx");
var ipcSrc = read("src/ipc/client.ts");
var runnerSrc = read("src/engine/harnessRunner.ts");
var rust = read("src-tauri/src/commands.rs");
var libRs = read("src-tauri/src/lib.rs");
var agentTeamSrc = read("src/mission/agentTeam.ts");
var ids = HARNESSES.map((h) => h.id);
section("1. the registry is well-formed");
ok(`unique ids (${ids.length} harnesses)`, new Set(ids).size === ids.length);
var noBins = HARNESSES.filter((h) => h.id !== "llm" && h.bins.length === 0);
ok("every harness except the direct-LLM names at least one binary", noBins.length === 0, noBins.map((h) => h.id).join(", "));
var promptCount = HARNESSES.filter((h) => h.id !== "llm" && h.id !== "acp" && h.argv.filter((a) => a === "$PROMPT").length !== 1);
ok(
  "every spawnable harness passes $PROMPT exactly once (acp is a protocol, llm has no argv)",
  promptCount.length === 0,
  promptCount.map((h) => `${h.id} (${h.argv.filter((a) => a === "$PROMPT").length})`).join(", ")
);
var noMeta = HARNESSES.filter((h) => !h.name || !h.install || !h.notes);
ok("every harness carries a name, an install line, and notes", noMeta.length === 0, noMeta.map((h) => h.id).join(", "));
ok("HARNESS_BY_ID resolves every id", ids.every((id) => HARNESS_BY_ID.has(id)));
var RESEARCHED = [
  "acp",
  "hermes",
  "claude",
  "codex",
  "opencode",
  "openclaude",
  "copilot",
  "cursor",
  "grok",
  "cline",
  "kilo",
  "aider",
  "gemini",
  "antigravity",
  "amp",
  "crush",
  "openhands",
  "goose",
  "qwen",
  "amazonq",
  "droid",
  "kimi",
  "auggie",
  "warp",
  "llm"
];
ok(
  `the researched 2026 landscape is complete (${RESEARCHED.length} ids)`,
  RESEARCHED.every((id) => HARNESS_BY_ID.has(id)),
  RESEARCHED.filter((id) => !HARNESS_BY_ID.has(id)).join(", ") || "all present"
);
ok("the registry adds nothing unresearched", ids.every((id) => RESEARCHED.includes(id)), ids.filter((id) => !RESEARCHED.includes(id)).join(", "));
ok("grok invokes the documented non-interactive mode (grok exec)", HARNESS_BY_ID.get("grok").argv[0] === "exec");
ok("kilo invokes the headless mode (kilo run)", HARNESS_BY_ID.get("kilo").argv[0] === "run");
ok("copilot passes -s (response-only) with -p", HARNESS_BY_ID.get("copilot").argv.includes("-s"));
ok("openclaude is wired to the Gitlawb binary", HARNESS_BY_ID.get("openclaude").bins[0] === "openclaude" && HARNESS_BY_ID.get("openclaude").install.includes("@gitlawb/openclaude"));
ok("grok install names the x.ai installer", HARNESS_BY_ID.get("grok").install.includes("x.ai/cli/install.sh"));
section("2. every id is fully wired \u2014 capabilities, policy, badges, Rust");
var capsKeys = Object.keys(AGENT_CAPABILITIES);
ok(
  `AGENT_CAPABILITIES covers every registry id (${capsKeys.length} entries)`,
  ids.every((id) => capsKeys.includes(id)),
  ids.filter((id) => !capsKeys.includes(id)).join(", ")
);
ok("AGENT_CAPABILITIES adds nothing the registry does not know", capsKeys.every((id) => ids.includes(id)), capsKeys.filter((id) => !ids.includes(id)).join(", "));
ok("ENFORCED_SANDBOX covers every id", ids.every((id) => id in ENFORCED_SANDBOX), ids.filter((id) => !(id in ENFORCED_SANDBOX)).join(", "));
var SPAWNABLE = ids.filter((id) => id !== "acp" && id !== "llm");
ok(
  "READ_ONLY policy covers every spawnable CLI id (acp is a protocol, llm is a direct call)",
  SPAWNABLE.every((id) => id in READ_ONLY),
  SPAWNABLE.filter((id) => !(id in READ_ONLY)).join(", ")
);
ok(
  "WRITE policy covers every spawnable CLI id (acp is a protocol, llm is a direct call)",
  SPAWNABLE.every((id) => id in WRITE),
  SPAWNABLE.filter((id) => !(id in WRITE)).join(", ")
);
ok(
  "every policy shape still passes the prompt exactly once",
  Object.values(READ_ONLY).every((argv) => (argv ?? []).filter((a) => a === "$PROMPT").length <= 1) && Object.values(WRITE).every((argv) => (argv ?? []).filter((a) => a === "$PROMPT").length <= 1)
);
var v116 = ["openclaude", "copilot", "antigravity", "amp", "crush", "openhands"];
ok(
  "the six V11.6 agents have capability entries with a prompt shape and a named source",
  v116.every((id) => {
    const caps = AGENT_CAPABILITIES[id];
    return Boolean(caps) && Array.isArray(caps.prompt.argv) && caps.prompt.source.length > 0;
  }),
  v116.filter((id) => !AGENT_CAPABILITIES[id]).join(", ") || "entry without prompt shape"
);
var v1171 = ["droid", "kimi", "auggie", "warp"];
ok(
  "the four V11.7.1 agents have capability entries with a DOCS-graded prompt shape and a named source",
  v1171.every((id) => {
    const caps = AGENT_CAPABILITIES[id];
    return Boolean(caps) && Array.isArray(caps.prompt.argv) && caps.prompt.confidence === "docs" && caps.prompt.source.length > 0;
  }),
  v1171.filter((id) => !AGENT_CAPABILITIES[id] || AGENT_CAPABILITIES[id].prompt.confidence !== "docs").join(", ") || "entry without a docs-graded prompt shape"
);
ok(
  "HARNESS_BADGES in TeamsPage covers every id",
  ids.every((id) => teams.includes(`${id}: { label:`)),
  ids.filter((id) => !teams.includes(`${id}: { label:`)).join(", ")
);
var rustDetectIds = ["hermes", "claude", "codex", "opencode", "openclaude", "copilot", "cursor", "grok", "cline", "kilo", "aider", "gemini", "antigravity", "amp", "crush", "openhands", "qwen", "goose", "amazonq", "droid", "kimi", "auggie", "warp"];
ok("the Rust detect list covers every executable harness", rustDetectIds.every((id) => rust.includes(`("${id}",`)), rustDetectIds.filter((id) => !rust.includes(`("${id}",`)).join(", "));
var rustBins = ["hermes", "claude", "codex", "opencode", "openclaude", "copilot", "cursor-agent", "grok", "cline", "kilo", "qwen", "gemini", "aider", "goose", "agy", "amp", "crush", "openhands", "amazonq", "kiro-cli", "q", "agent", "droid", "kimi", "auggie", "oz"];
var allowMatch = rust.match(/const ALLOWED_CLI_BINS[^;]+;/)?.[0] ?? "";
ok(
  "every registry bin is on the Rust invoke allowlist",
  rustBins.every((b) => allowMatch.includes(`"${b}"`)),
  rustBins.filter((b) => !allowMatch.includes(`"${b}"`)).join(", ")
);
ok("the Rust argv table knows grok exec", rust.includes('"grok" => ("grok".into(), vec!["exec".into()'));
ok("the Rust argv table knows kilo run", rust.includes('"kilo" => ("kilo".into(), vec!["run".into()'));
var argvFn = rust.match(/fn harness_argv[\s\S]*?\n\}/)?.[0] ?? "";
ok(
  "the Rust argv table has the six V11.6 agents",
  ['"openclaude"', '"copilot"', '"antigravity"', '"amp"', '"crush"', '"openhands"'].every((k) => argvFn.includes(k)),
  "harness_argv is missing a V11.6 entry"
);
ok(
  "the Rust argv table has the four V11.7.1 agents",
  ['"droid"', '"kimi"', '"auggie"', '"warp"'].every((k) => argvFn.includes(k)),
  "harness_argv is missing a V11.7.1 entry"
);
section("3. custom harnesses \u2014 validated in TS, re-validated in Rust");
var good = validateCustomHarness({ name: "My Agent", bin: "my-agent", argv: ["--headless", "$PROMPT"] });
ok("a well-formed custom harness passes validation", good.length === 0, good.map((e) => e.message).join("; "));
var cases = [
  ["no $PROMPT", validateCustomHarness({ name: "x", bin: "agent", argv: ["--go"] }), "argv"],
  ["two $PROMPTs", validateCustomHarness({ name: "x", bin: "agent", argv: ["$PROMPT", "$PROMPT"] }), "argv"],
  ["empty bin", validateCustomHarness({ name: "x", bin: "  ", argv: ["$PROMPT"] }), "bin"],
  ["shell chars in bin", validateCustomHarness({ name: "x", bin: "agent;rm", argv: ["$PROMPT"] }), "bin"],
  ["spaces in bin", validateCustomHarness({ name: "x", bin: "my agent", argv: ["$PROMPT"] }), "bin"],
  ["path traversal in bin", validateCustomHarness({ name: "x", bin: "../agent", argv: ["$PROMPT"] }), "bin"],
  ["empty name", validateCustomHarness({ name: "", bin: "agent", argv: ["$PROMPT"] }), "name"]
];
for (const [label, errors, field] of cases) {
  ok(`rejected: ${label}`, errors.length > 0 && errors.some((e) => e.field === field), "slipped through");
}
ok("newline arguments are rejected", validateCustomHarness({ name: "x", bin: "agent", argv: ["$PROMPT", "a\nb"] }).length > 0);
ok("custom ids are slugged namespaced", customHarnessId("My Internal Agent!") === "custom:my-internal-agent");
ok("custom id slug has a floor for empty names", customHarnessId("!!!").startsWith("custom:"));
ok(
  "the Rust side re-validates before saving (custom_harness_validate)",
  rust.includes("fn custom_harness_validate") && rust.includes("$PROMPT exactly once".replace("$PROMPT", "argv must contain $PROMPT")),
  "the server-side guard is missing"
);
ok(
  "cli_invoke resolves custom:<slug> against the saved registry only",
  rust.includes('provider_id.starts_with("custom:")') && rust.includes("unknown custom harness"),
  "the custom execution path is missing"
);
ok(
  "the three custom-harness commands are registered in lib.rs",
  libRs.includes("commands::custom_harness_list") && libRs.includes("commands::custom_harness_save") && libRs.includes("commands::custom_harness_delete")
);
ok(
  "custom harnesses persist next to the database (custom-harnesses.json)",
  rust.includes("custom-harnesses.json")
);
ok(
  "ipc exposes the custom-harness trio with a web-preview fallback",
  ipcSrc.includes("customHarnessList") && ipcSrc.includes("customHarnessSave") && ipcSrc.includes("customHarnessDelete") && ipcSrc.includes("mj.customHarnesses")
);
section("4. the Connect tab and the runtime path");
ok('"connect" is a Teams tab', teams.includes('type ActiveTab = "connect" |'));
ok("the Connect tab button is first in the row", teams.includes('activeTab === "connect" ? "primary" : ""'));
ok("the panel smoke-tests harnesses via cliInvoke", teams.includes("Reply with exactly one word: CONNECTED"));
ok("the panel shows the web-preview limitation honestly", teams.includes("You are in the web preview."));
ok("the add-custom form validates before saving", teams.includes("validateCustomHarness(spec)"));
ok("the seat picker offers custom harnesses", teams.includes("(custom)</option>"));
ok("the custom registry hydrates the sync mirror for composeSeatArgv", teams.includes("mirrorCustomHarnesses(entries)"));
ok(
  "the harness runner executes custom ids through the Rust registry",
  runnerSrc.includes("isCustomHarness(hid)") && runnerSrc.includes("customHarnessList"),
  "the runner cannot execute a custom harness"
);
ok(
  "composeSeatArgv compiles custom seats from the registered spec",
  agentTeamSrc.includes("resolveCaps(teamSeat.harness)") && agentTeamSrc.includes("not registered (anymore)"),
  "a custom seat would not compile"
);
ok(
  "session continuity degrades honestly for custom harnesses (stateless, warned)",
  read("src/mission/sessions.ts").includes("Custom harness: no session continuity"),
  "the session layer would crash or lie on a custom id"
);
section("5. the V11.6.1 corrections: agy / amp -x / openhands --headless -t");
ok(
  "Antigravity's binary is agy (the shipped Go executable), not 'antigravity'",
  (HARNESS_BY_ID.get("antigravity")?.bins ?? []).includes("agy") && !JSON.stringify(HARNESS_BY_ID.get("antigravity")?.bins).includes('"antigravity"'),
  JSON.stringify(HARNESS_BY_ID.get("antigravity")?.bins)
);
ok(
  "the Rust allowlist admits agy, not the nonexistent antigravity binary",
  rust.includes('"agy"') && !/ALLOWED_CLI_BINS[^;]*"antigravity"/s.test(rust),
  "allowlist stale"
);
ok(
  "Amp's one-shot is execute mode: amp -x $PROMPT (docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.amp.prompt.argv) === JSON.stringify(["-x", "$PROMPT"]) && AGENT_CAPABILITIES.amp.prompt.confidence === "docs",
  JSON.stringify(AGENT_CAPABILITIES.amp.prompt)
);
ok(
  "the Rust argv table agrees on amp -x",
  rust.includes('"amp" => ("amp".into(), vec!["-x".into(), prompt.into()])'),
  "rust amp argv stale"
);
ok(
  "OpenHands headless is --headless -t $PROMPT (docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.openhands.prompt.argv) === JSON.stringify(["--headless", "-t", "$PROMPT"]) && AGENT_CAPABILITIES.openhands.prompt.confidence === "docs",
  JSON.stringify(AGENT_CAPABILITIES.openhands.prompt)
);
ok(
  "OpenHands documents its JSONL mode (--json, ndjson)",
  AGENT_CAPABILITIES.openhands.json?.kind === "ndjson",
  "json capability stale"
);
ok(
  "the Rust argv table agrees on openhands --headless -t",
  rust.includes('"openhands" => ("openhands".into(), vec!["--headless".into(), "-t".into(), prompt.into()])'),
  "rust openhands argv stale"
);
section("6. custom harnesses actually execute (V11.6.1: the executor hole, closed)");
var PROBE_SPEC = { id: "custom:probe-agent", name: "Probe Agent", bin: "probe-agent", argv: ["run", "$PROMPT"], notes: "probe fixture", createdAt: (/* @__PURE__ */ new Date()).toISOString() };
setCustomHarnesses([PROBE_SPEC]);
var rcReg = resolveCaps("custom:probe-agent");
ok("resolveCaps resolves a REGISTERED custom to its synthetic entry", rcReg.custom && rcReg.registered && rcReg.caps.bins[0] === "probe-agent" && rcReg.caps.name === "Probe Agent (custom)", JSON.stringify(rcReg.caps.bins));
ok("the synthetic entry carries the user's argv template", JSON.stringify(rcReg.caps.prompt.argv) === JSON.stringify(["run", "$PROMPT"]), JSON.stringify(rcReg.caps.prompt.argv));
setCustomHarnesses([]);
var rcGone = resolveCaps("custom:gone");
ok("resolveCaps is TOTAL: an unregistered custom yields an honest entry, never undefined", !rcGone.registered && rcGone.custom && rcGone.caps.bins.length === 0 && rcGone.caps.name.includes("custom:gone"), rcGone.caps.name);
var rcBuiltin = resolveCaps("claude");
ok("resolveCaps passes builtins through unchanged", !rcBuiltin.custom && rcBuiltin.registered && rcBuiltin.caps === AGENT_CAPABILITIES.claude, "passthrough broken");
setCustomHarnesses([PROBE_SPEC]);
var te = read("src/mission/teamExecutor.ts");
ok("the executor no longer dereferences AGENT_CAPABILITIES[seat.harness] (the 11.6.0 hole)", !te.includes("AGENT_CAPABILITIES[a.seat.harness]"), "bare lookup survives");
ok("the executor resolves every seat through resolveCaps()", (te.match(/resolveCaps\(/g) ?? []).length >= 3, `${(te.match(/resolveCaps\(/g) ?? []).length} uses`);
ok("an unregistered custom is refused BEFORE any spawn, with the re-add message", te.includes('Custom harness "${a.seat.harness}" is not registered (anymore)'), "preflight message missing");
function sh(args, cwd) {
  try {
    const out = execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e;
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}
function makeRepo() {
  const repo2 = fs.mkdtempSync(path3.join(os2.tmpdir(), "mjcustom-"));
  fs.writeFileSync(path3.join(repo2, "calc.js"), "function add(a, b) { return a + b; }\nmodule.exports = { add };\n");
  fs.writeFileSync(path3.join(repo2, "test.js"), "const { add } = require('./calc');\nif (add(2, 3) !== 5) process.exit(1);\nconsole.log('ok');\n");
  fs.writeFileSync(path3.join(repo2, "package.json"), JSON.stringify({ name: "calc", version: "1.0.0" }, null, 2));
  sh(["git", "init", "-q", "."], repo2);
  sh(["git", "config", "user.email", "mj@mj.desktop"], repo2);
  sh(["git", "config", "user.name", "MJ"], repo2);
  sh(["git", "add", "-A"], repo2);
  sh(["git", "commit", "-qm", "initial"], repo2);
  const branch2 = sh(["git", "symbolic-ref", "--short", "HEAD"], repo2).out.trim() || "master";
  return { repo: repo2, branch: branch2 };
}
var invocations = [];
var { repo, branch } = makeRepo();
var customSeat = {
  id: "probe-seat",
  role: "coder",
  harness: "custom:probe-agent",
  model: null,
  mayWrite: true,
  timeoutSecs: 60,
  maxTurns: 2,
  instructions: "Say CONNECTED."
};
var customTeam = {
  id: "t.custom-probe",
  name: "Custom probe team",
  description: "one registered custom seat",
  schemaVersion: 1,
  seats: [customSeat]
};
var customReq = {
  team: customTeam,
  assignments: [{ seat: customSeat, wave: 1, readOnly: false, prompt: "Say CONNECTED." }],
  repoRoot: repo,
  baseBranch: branch,
  missionSlug: "custom-probe",
  objective: "Prove a custom harness runs through the executor.",
  constraints: [],
  doNotTouch: [],
  testCommand: ["node", "test.js"],
  ledger: new CapLedger({ maxCostUsd: 1, maxTurns: 10, timeoutMs: 6e4 }, Date.now())
};
var customDeps = {
  cliInvoke: async (req) => {
    invocations.push({ bin: req.bin, argv: req.argv });
    return { exitCode: 0, stdout: "CONNECTED", stderr: "", durationMs: 4, timedOut: false };
  },
  resolveBin: async (bin) => bin === "probe-agent" ? "/usr/bin/probe-agent" : null,
  git: async (args, cwd) => {
    const r = sh(["git", ...args], cwd);
    return { ok: r.code === 0, stdout: r.out, stderr: "", exitCode: r.code, reason: null };
  },
  writeFile: async (p, contents) => {
    fs.mkdirSync(path3.dirname(p), { recursive: true });
    fs.writeFileSync(p, contents);
  },
  verify: async (cwd) => {
    const r = sh(["node", "test.js"], cwd);
    return { exitCode: r.code, stdout: r.out, stderr: "", durationMs: 5, timedOut: false };
  }
};
var report = await executeTeam(customReq, customDeps);
var seatRec = report.seats.find((s) => s.seatId === "probe-seat");
ok("a REGISTERED custom seat RUNS (preflight passes, no undefined deref)", Boolean(seatRec) && seatRec.outcome === "completed", `${seatRec?.outcome ?? "no record"} \u2014 ${seatRec?.reason?.slice(0, 120) ?? report.notRun.map((n2) => n2.reason).join(" | ").slice(0, 160)}`);
ok("the seat record names the custom harness honestly", seatRec?.harnessName === "Probe Agent (custom)", seatRec?.harnessName ?? "");
ok("the seat ran the user's binary", Boolean(invocations[0]) && invocations[0].bin.includes("probe-agent"), invocations[0]?.bin ?? "never invoked");
ok("the seat ran the user's argv template (run $PROMPT)", Boolean(invocations[0]) && invocations[0].argv.includes("run") && invocations[0].argv.includes("Say CONNECTED."), JSON.stringify(invocations[0]?.argv ?? []));
setCustomHarnesses([]);
var goneReq = { ...customReq, missionSlug: "custom-gone", repoRoot: makeRepo().repo };
var goneReport = await executeTeam(goneReq, customDeps);
var goneRec = goneReport.seats.find((s) => s.seatId === "probe-seat");
var goneNotRun = goneReport.notRun.find((n2) => n2.seatId === "probe-seat");
ok(
  "an UNREGISTERED custom seat is refused with the re-add message (not a crash)",
  Boolean(goneRec || goneNotRun) && (goneRec?.reason ?? goneNotRun?.reason ?? "").includes("not registered (anymore)") && !goneReport.seats.some((s) => s.seatId === "probe-seat" && s.outcome === "completed"),
  `${goneRec?.outcome ?? "no seat record"} \u2014 ${(goneRec?.reason ?? goneNotRun?.reason ?? "no refusal reason").slice(0, 160)}`
);
setCustomHarnesses([]);
section("7. one harness truth \u2014 policy derives, adapters cover everything");
var derived = (id, kind) => {
  const caps = AGENT_CAPABILITIES[id];
  const base = caps?.prompt?.argv?.length ? [...caps.prompt.argv] : ["$PROMPT"];
  const extra = kind === "readOnly" ? caps?.readOnly?.argv : caps?.write?.argv;
  return extra && extra.length > 0 ? [...base, ...extra] : base;
};
{
  const polSrc = read("src/mission/harnessPolicy.ts");
  ok("the policy layer derives from the capability registry (registryArgv)", polSrc.includes("function registryArgv("), "no derivation");
  const derivedIds = [...polSrc.matchAll(/(\w+): registryArgv\("(\w+)", "(readOnly|write)"\)/g)];
  ok(`every non-legacy policy entry is DERIVED, not hand-copied (${derivedIds.length} entries = 12 legacy ids x 2 + kimi/auggie/warp x 2 + droid readOnly; droid's WRITE is the one DOCUMENTED hand-tune: --auto low, because exec defaults to spec-mode read-only)`, derivedIds.length === 31, `${derivedIds.length}`);
  const policyIds = /* @__PURE__ */ new Set([...Object.keys(READ_ONLY), ...Object.keys(WRITE)]);
  for (const id of policyIds) {
    const capsPrompt = AGENT_CAPABILITIES[id]?.prompt?.argv;
    if (id === "hermes") continue;
    for (const [mapName, map] of [["READ_ONLY", READ_ONLY], ["WRITE", WRITE]]) {
      const entry = map[id];
      if (!entry) continue;
      ok(
        `${mapName}[${id}]: base invocation agrees with the registry (first token)`,
        Boolean(capsPrompt?.[0]) && entry[0] === capsPrompt?.[0],
        `${entry[0]} vs ${capsPrompt?.[0] ?? "none"}`
      );
      ok(`${mapName}[${id}]: $PROMPT appears exactly once`, entry.filter((t) => t === "$PROMPT").length === 1, JSON.stringify(entry));
    }
  }
  for (const id of ["openclaude", "copilot", "antigravity", "amp", "crush", "openhands", "gemini", "goose", "qwen", "amazonq", "cursor", "grok", "kimi", "auggie", "warp"]) {
    ok(`READ_ONLY[${id}] IS the registry shape (derived, not drifted)`, JSON.stringify(READ_ONLY[id]) === JSON.stringify(derived(id, "readOnly")), `${JSON.stringify(READ_ONLY[id])} vs ${JSON.stringify(derived(id, "readOnly"))}`);
    ok(`WRITE[${id}] IS the registry shape (derived, not drifted)`, JSON.stringify(WRITE[id]) === JSON.stringify(derived(id, "write")), `${JSON.stringify(WRITE[id])} vs ${JSON.stringify(derived(id, "write"))}`);
  }
  ok("the stale Amp shape is gone from the policy layer (no --headless under amp)", !(READ_ONLY.amp ?? []).includes("--headless") && !(WRITE.amp ?? []).includes("--headless"), "stale --headless survives");
  ok("the stale OpenHands shape is gone from the policy layer (no solve)", !(READ_ONLY.openhands ?? []).includes("solve") && !(WRITE.openhands ?? []).includes("solve"), "stale solve survives");
  ok("Amp's policy shape is execute mode", JSON.stringify(READ_ONLY.amp) === JSON.stringify(["-x", "$PROMPT"]) && JSON.stringify(WRITE.amp) === JSON.stringify(["-x", "$PROMPT"]), JSON.stringify(READ_ONLY.amp));
  ok("OpenHands' policy shape is the documented headless mode", JSON.stringify(READ_ONLY.openhands) === JSON.stringify(["--headless", "-t", "$PROMPT"]), JSON.stringify(READ_ONLY.openhands));
  ok("Grok's write shape carries its permission flags (registry-derived fix)", (WRITE.grok ?? []).includes("--permission-mode") && (WRITE.grok ?? []).includes("acceptEdits"), JSON.stringify(WRITE.grok));
}
{
  const cliIds = HARNESSES.map((h) => h.id).filter((id) => id !== "llm");
  ok(
    `every CLI in the domain registry has a mission adapter (${cliIds.length} ids)`,
    cliIds.every((id) => getHarness(id) !== null),
    cliIds.filter((id) => getHarness(id) === null).join(", ") || "all covered"
  );
  ok("llm is deliberately NOT a spawnable CLI adapter (direct-LLM has its own path)", getHarness("llm") === null, "llm got an adapter");
  ok(`the adapter pool is whole-registry sized (${allHarnesses().length} adapters: 23 CLIs + acp + local-test)`, allHarnesses().length >= 25, String(allHarnesses().length));
  const ampAdapter = getHarness("amp");
  const ampPrep = ampAdapter?.prepare({ taskId: "t", title: "t", prompt: "do it", kind: "implement", languages: [], timeoutMs: 6e4, requiredCapabilities: [], cwd: "/tmp" });
  ok("a graph-mission agent pinned to amp now prepares a REAL invocation (-x)", Boolean(ampPrep) && ampPrep.args.includes("-x") && ampPrep.program === "amp", JSON.stringify(ampPrep));
  setCustomHarnesses([{ id: "custom:probe-2", name: "Probe Two", bin: "probe-two", argv: ["go", "$PROMPT"], notes: "", createdAt: (/* @__PURE__ */ new Date()).toISOString() }]);
  const customAdapter = getHarness("custom:probe-2");
  const customPrep = customAdapter?.prepare({ taskId: "t", title: "t", prompt: "say hi", kind: "implement", languages: [], timeoutMs: 6e4, requiredCapabilities: [], cwd: "/tmp" });
  ok("a custom harness resolves to a REAL mission adapter (simulated=false)", Boolean(customAdapter) && customAdapter.simulated === false && customAdapter.name.includes("Probe Two"), customAdapter?.name ?? "null");
  ok("the custom adapter prepares the USER's bin and argv", Boolean(customPrep) && customPrep.program === "probe-two" && customPrep.args.includes("go") && customPrep.args.includes("say hi"), JSON.stringify(customPrep));
  setCustomHarnesses([]);
  ok("an unregistered custom harness yields NO adapter (honest null)", getHarness("custom:probe-2") === null, "stale adapter survives");
}
section("8. doc truth (25 ids) and the resolver in the session layer");
ok(
  `the registry is 25 ids (23 CLIs + hermes + llm) \u2014 21 until V11.7.1 grew it, 22 was the 11.6.0 miscount`,
  HARNESSES.length === 25,
  String(HARNESSES.length)
);
{
  const doc = read("MJ-11.6-UPGRADE.md");
  const stale22 = doc.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => l.includes("22 ids") || l.includes("22 registry"));
  ok(
    `every '22' mention in the V11.6 record is a MARKED historical miscount (${stale22.length} line(s))`,
    stale22.length > 0 && stale22.every(([, l]) => l.includes("miscount")),
    stale22.map(([n2, l]) => `line ${n2}: ${l.slice(0, 70)}`).join(" | ")
  );
  for (const name of ["MJ-11.6-UPGRADE.md", "MJ-11.7-UPGRADE.md"]) {
    const rec = read(name);
    const lines21 = rec.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => l.includes("21 ids") || l.includes("all 21 registry") || l.includes("**21**") || l.includes("21 harnesses"));
    ok(
      `every '21' mention in ${name} is MARKED as superseded history (${lines21.length} line(s))`,
      lines21.length > 0 && lines21.every(([, l]) => l.includes("V11.7.1")),
      lines21.filter(([, l]) => !l.includes("V11.7.1")).map(([n2, l]) => `line ${n2}: ${l.slice(0, 70)}`).join(" | ") || "all marked"
    );
  }
  const readme = read("README.md");
  ok(
    "the README's CURRENT registry claims say 25",
    readme.includes("**25** ids") && readme.includes("23 spawnable") || readme.includes("25 harnesses") && readme.includes("23 CLIs"),
    "a README current claim does not say 25"
  );
  const rec71 = read("MJ-11.7.1-UPGRADE.md");
  ok(
    "the V11.7.1 record claims 25 (growth line, seat dropdowns, probe description)",
    rec71.includes("grew from 21 to **25** ids") && rec71.includes("all 25 registry harnesses") && rec71.includes("well-formedness (25 ids,"),
    "a V11.7.1 current claim does not say 25"
  );
}
{
  const sessionsSrc = read("src/mission/sessions.ts");
  ok("session resolution consumes the SAME resolver (no direct AGENT_CAPABILITIES lookups)", !sessionsSrc.includes("AGENT_CAPABILITIES[") && sessionsSrc.includes("resolveCaps("), "a second path survives");
  setCustomHarnesses([{ id: "custom:probe-3", name: "Probe Three", bin: "probe-three", argv: ["run", "$PROMPT"], notes: "", createdAt: (/* @__PURE__ */ new Date()).toISOString() }]);
  const reg = sessionArgv("custom:probe-3", { kind: "resume", idKind: "mj-chosen", sessionId: "ses_1" });
  ok("a REGISTERED custom is still stateless in the session layer (same warning)", reg.continuity === "none" && reg.warning === "Custom harness: no session continuity \u2014 every turn is stateless.", JSON.stringify(reg));
  ok("a custom harness never claims to name its own session id", sessionIdKind("custom:probe-3") === "cli-chosen", sessionIdKind("custom:probe-3"));
  setCustomHarnesses([]);
  const unreg = sessionArgv("custom:gone-3", { kind: "first", idKind: "mj-chosen", sessionId: "ses_2" });
  ok("an UNREGISTERED custom degrades identically (stateless, warned)", unreg.continuity === "none" && (unreg.warning ?? "").includes("no session continuity"), JSON.stringify(unreg));
  const claude = sessionArgv("claude", { kind: "resume", idKind: "mj-chosen", sessionId: "ses_3" });
  ok("builtin session behaviour is unchanged through the resolver (claude resumes by id)", claude.continuity === "session" && claude.argv.includes("ses_3"), JSON.stringify(claude));
  ok("builtin id-kind detection is unchanged (claude is mj-chosen)", sessionIdKind("claude") === "mj-chosen", sessionIdKind("claude"));
}
section("9. the V11.7.1 additions: droid / kimi / auggie / warp (vendor-documented)");
ok(
  "droid's one-shot is exec mode: droid exec $PROMPT (docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.droid.prompt.argv) === JSON.stringify(["exec", "$PROMPT"]) && AGENT_CAPABILITIES.droid.prompt.confidence === "docs",
  JSON.stringify(AGENT_CAPABILITIES.droid.prompt.argv)
);
ok(
  "droid's spec-mode default is modelled as the read-only shape (no flag needed \u2014 the rare CLI whose headless default IS read-only)",
  JSON.stringify(READ_ONLY.droid) === JSON.stringify(["exec", "$PROMPT"]) && AGENT_CAPABILITIES.droid.readOnly?.argv?.length === 0,
  `${JSON.stringify(READ_ONLY.droid)} / caps readOnly ${JSON.stringify(AGENT_CAPABILITIES.droid.readOnly?.argv)}`
);
ok(
  "droid's WRITE composes the documented --auto tier (the one hand-tuned V11.7.1 shape)",
  JSON.stringify(WRITE.droid) === JSON.stringify(["exec", "--auto", "low", "$PROMPT"]) && JSON.stringify(AGENT_CAPABILITIES.droid.write?.argv) === JSON.stringify(["--auto", "low"]),
  JSON.stringify(WRITE.droid)
);
ok(
  "the Rust argv table agrees on droid exec",
  rust.includes('"droid" => ("droid".into(), vec!["exec".into(), prompt.into()])'),
  "rust droid argv stale"
);
ok(
  "kimi's one-shot is prompt mode: kimi -p $PROMPT (docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.kimi.prompt.argv) === JSON.stringify(["-p", "$PROMPT"]) && AGENT_CAPABILITIES.kimi.prompt.confidence === "docs",
  JSON.stringify(AGENT_CAPABILITIES.kimi.prompt.argv)
);
ok(
  "the Rust argv table agrees on kimi -p",
  rust.includes('"kimi" => ("kimi".into(), vec!["-p".into(), prompt.into()])'),
  "rust kimi argv stale"
);
ok(
  "kimi documents its JSONL mode (--output-format stream-json, ndjson)",
  AGENT_CAPABILITIES.kimi.json?.kind === "ndjson" && JSON.stringify(AGENT_CAPABILITIES.kimi.json?.argv) === JSON.stringify(["--output-format", "stream-json"]),
  JSON.stringify(AGENT_CAPABILITIES.kimi.json)
);
ok(
  "kimi resumes by session id through the SAME session layer (--session $SESSION, docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.kimi.resume?.argv) === JSON.stringify(["--session", "$SESSION"]) && sessionArgv("kimi", { kind: "resume", idKind: sessionIdKind("kimi"), sessionId: "ses_kimi" }).argv.includes("ses_kimi"),
  JSON.stringify(sessionArgv("kimi", { kind: "resume", idKind: sessionIdKind("kimi"), sessionId: "ses_kimi" }))
);
ok(
  "all four V11.7.1 harnesses are honest about WHO assigns session ids (cli-chosen, no documented sessionStart)",
  sessionIdKind("droid") === "cli-chosen" && sessionIdKind("kimi") === "cli-chosen" && sessionIdKind("auggie") === "cli-chosen" && sessionIdKind("warp") === "cli-chosen",
  "a V11.7.1 harness claims mj-chosen ids without a documented sessionStart"
);
ok(
  "auggie's one-shot is print mode: auggie --print $PROMPT (docs-graded)",
  JSON.stringify(AGENT_CAPABILITIES.auggie.prompt.argv) === JSON.stringify(["--print", "$PROMPT"]) && AGENT_CAPABILITIES.auggie.prompt.confidence === "docs",
  JSON.stringify(AGENT_CAPABILITIES.auggie.prompt.argv)
);
ok(
  "the Rust argv table agrees on auggie --print",
  rust.includes('"auggie" => ("auggie".into(), vec!["--print".into(), prompt.into()])'),
  "rust auggie argv stale"
);
ok(
  "auggie documents its JSON output (--print --output-format json)",
  AGENT_CAPABILITIES.auggie.json?.kind === "json" && JSON.stringify(AGENT_CAPABILITIES.auggie.json?.argv) === JSON.stringify(["--output-format", "json"]),
  JSON.stringify(AGENT_CAPABILITIES.auggie.json)
);
ok(
  "auggie's enterprise gotcha is recorded (headless can be disabled by agreement)",
  (AGENT_CAPABILITIES.auggie.gotchas ?? []).some((g) => g.includes("enterprise")),
  "the licensing gotcha is missing"
);
ok(
  "auggie does NOT claim an unverified --print --ask composition (ask mode stays a noted mode, not a composed shape)",
  AGENT_CAPABILITIES.auggie.readOnly?.argv === null && (HARNESS_BY_ID.get("auggie")?.notes ?? "").includes("--ask"),
  "readOnly overclaims or the ask-mode note is gone"
);
ok(
  "warp's agent runs through the oz binary (like agy, the id is not the bin)",
  JSON.stringify(HARNESS_BY_ID.get("warp")?.bins) === JSON.stringify(["oz"]),
  JSON.stringify(HARNESS_BY_ID.get("warp")?.bins)
);
ok(
  "the Rust detect table maps warp -> oz and the allowlist admits oz (no warp-terminal confusion)",
  rust.includes('("warp", "Warp Oz Agent CLI", "oz")') && !rust.includes('"warp-terminal"'),
  "warp bin wiring stale"
);
ok(
  "warp's local agent run is the composed shape; run-cloud is explicitly NOT composed (honesty pin)",
  JSON.stringify(READ_ONLY.warp) === JSON.stringify(["agent", "run", "--prompt", "$PROMPT"]) && (HARNESS_BY_ID.get("warp")?.notes ?? "").includes("run-cloud"),
  JSON.stringify(READ_ONLY.warp)
);
ok(
  "the Rust argv table agrees on oz agent run --prompt",
  rust.includes('"warp" => ("oz".into(), vec!["agent".into(), "run".into(), "--prompt".into(), prompt.into()])'),
  "rust warp argv stale"
);
{
  const expect = [
    ["droid", "droid", ["exec"]],
    ["kimi", "kimi", ["-p"]],
    ["auggie", "auggie", ["--print"]],
    ["warp", "oz", ["agent", "run", "--prompt"]]
  ];
  for (const [id, bin, head] of expect) {
    const adapter = getHarness(id);
    const prep = adapter?.prepare({ taskId: "t", title: "t", prompt: "do it", kind: "implement", languages: [], timeoutMs: 6e4, requiredCapabilities: [], cwd: "/tmp" });
    ok(
      `a graph-mission agent pinned to ${id} prepares a REAL invocation (${bin})`,
      Boolean(prep) && prep.program === bin && head.every((t) => prep.args.includes(t)),
      JSON.stringify(prep)
    );
  }
}
ok(
  "the four installs name their documented installers",
  HARNESS_BY_ID.get("droid").install.includes("app.factory.ai/cli") && HARNESS_BY_ID.get("kimi").install.includes("code.kimi.com") && HARNESS_BY_ID.get("auggie").install.includes("@augmentcode/auggie") && HARNESS_BY_ID.get("warp").install.includes("warp-cli"),
  "an install line drifted from the vendor installer"
);
ok(
  "all four V11.7.1 harnesses are honest in the sandbox table (no enforced read-only claims)",
  ENFORCED_SANDBOX.droid === false && ENFORCED_SANDBOX.kimi === false && ENFORCED_SANDBOX.auggie === false && ENFORCED_SANDBOX.warp === false,
  "a V11.7.1 harness claims an enforced sandbox it does not have"
);
section("10. the turn-limit truth \u2014 the policy composes what the registry says, for every harness");
{
  const writeReq = { risk: "MEDIUM", mayWriteFiles: true, mayRunShell: true, mayUseBrowser: false, maxTurns: 7, kind: "implement" };
  for (const id of SPAWNABLE) {
    const hasCap = Boolean((AGENT_CAPABILITIES[id]?.maxTurns?.argv ?? []).length);
    const pol = policyFor(id, writeReq);
    const emits = pol.argv.includes("--max-turns");
    ok(
      `${id}: the write policy emits a turn flag IFF the registry documents one`,
      hasCap === emits,
      `registry ${hasCap ? "documents" : "has no"} turn flag; policy ${emits ? "emits" : "emits no"} --max-turns`
    );
  }
  ok(
    "claude's turn cap is RESTORED at docs grade with the honest history (print-mode-only, supersedes the 2.1.197 --help scan)",
    JSON.stringify(AGENT_CAPABILITIES.claude.maxTurns?.argv) === JSON.stringify(["--max-turns", "$N"]) && AGENT_CAPABILITIES.claude.maxTurns?.confidence === "docs" && (AGENT_CAPABILITIES.claude.maxTurns?.source ?? "").includes("2.1.197"),
    JSON.stringify(AGENT_CAPABILITIES.claude.maxTurns)
  );
  ok(
    "the registry no longer claims VERIFIED ABSENT for a flag the vendor documents",
    !(AGENT_CAPABILITIES.claude.maxTurns?.source ?? "").includes("ABSENT"),
    "the stale absence claim survives"
  );
  const pol5 = policyFor("claude", { ...writeReq, maxTurns: 5 });
  ok(
    "claude's write shape carries --max-turns 5 BEFORE the prompt (print-mode composition)",
    pol5.argv.includes("--max-turns") && pol5.argv.includes("5") && pol5.argv.indexOf("--max-turns") < pol5.argv.indexOf("$PROMPT"),
    JSON.stringify(pol5.argv)
  );
  const grok9 = policyFor("grok", { ...writeReq, maxTurns: 9 });
  ok(
    "grok's DOCUMENTED turn cap now flows through the policy path too (the second latent gap, closed)",
    grok9.argv.includes("--max-turns") && grok9.argv.includes("9") && grok9.argv.indexOf("--max-turns") < grok9.argv.indexOf("$PROMPT"),
    JSON.stringify(grok9.argv)
  );
  const codex7 = policyFor("codex", writeReq);
  ok(
    "codex (no documented turn flag) still gets none \u2014 the ledger is its only ceiling",
    !codex7.argv.includes("--max-turns"),
    JSON.stringify(codex7.argv)
  );
  ok(
    "the hardcoded claude special-case is GONE from withTurnLimit (capability-driven now)",
    !read("src/mission/harnessPolicy.ts").includes('id === "claude" ? ["--max-turns"'),
    "the special case survives"
  );
  ok(
    "claude's gotchas record the --max-budget-usd decision (documented, deliberately not composed \u2014 the CapLedger is the spend authority)",
    (AGENT_CAPABILITIES.claude.gotchas ?? []).some((g) => g.includes("--max-budget-usd") && g.includes("CapLedger")),
    "the budget-cap note is missing"
  );
}
console.log(`
${pass} passed, ${fail} failed
`);
process.exit(fail ? 1 : 0);
