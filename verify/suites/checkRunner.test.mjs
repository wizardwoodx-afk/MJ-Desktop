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
      static async fromPath(path) {
        return invoke("plugin:image|from_path", { path }).then((rid) => new _Image(rid));
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
  detectPlatform: () => detectPlatform,
  downloadText: () => downloadText,
  getWindowApi: () => getWindowApi,
  notifyNative: () => notifyNative,
  pickJsonFile: () => pickJsonFile
});
function detectHost() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__) ? "tauri" : "web";
}
function detectPlatform() {
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
  const { invoke: invoke2 } = await Promise.resolve().then(() => (init_core(), core_exports));
  return invoke2(cmd, args ?? {});
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
      fsRead: async (path) => {
        if (useTauri()) return tauriInvoke("fs_read", { path });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsWrite: async (path, content) => {
        if (useTauri()) return tauriInvoke("fs_write", { path, content });
        throw new Error("Filesystem is available in the native desktop build.");
      },
      fsList: async (path) => {
        if (useTauri()) return tauriInvoke("fs_list", { path });
        return [];
      },
      fsMkdir: async (path) => {
        if (useTauri()) return tauriInvoke("fs_mkdir", { path });
      },
      fsRemove: async (path, recursive) => {
        if (useTauri()) return tauriInvoke("fs_remove", { path, recursive });
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
      packageImport: async (pkg2) => {
        if (useTauri()) return tauriInvoke("package_import", { pkg: pkg2 });
        const p = pkg2;
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

// src/mission/checkRunner.ts
var join = (dir, name) => dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}/${name}`;
async function discoverChecks(repoDir, read, exists = (p) => existsViaRead(p, read)) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (spec) => {
    const key = `${spec.command} ${spec.args.join(" ")}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(spec);
  };
  const pkgRaw = await tryRead(join(repoDir, "package.json"), read);
  if (pkgRaw) {
    try {
      const pkg2 = JSON.parse(pkgRaw);
      const scripts = pkg2.scripts ?? {};
      const allDeps = { ...pkg2.dependencies ?? {}, ...pkg2.devDependencies ?? {} };
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
  if (await exists(join(repoDir, "Cargo.toml"))) {
    add({ id: "cargo-check", label: "cargo check", source: "STATIC_CHECK", command: "cargo", args: ["check", "--all-targets"], timeoutSecs: 900, discoveredFrom: "Cargo.toml" });
    add({ id: "cargo-test", label: "cargo test", source: "TEST_RUN", command: "cargo", args: ["test"], timeoutSecs: 900, discoveredFrom: "Cargo.toml" });
  }
  if (await exists(join(repoDir, "pyproject.toml")) || await exists(join(repoDir, "pytest.ini"))) {
    add({ id: "pytest", label: "pytest", source: "TEST_RUN", command: "python3", args: ["-m", "pytest", "-q"], timeoutSecs: 600, discoveredFrom: "pyproject.toml / pytest.ini" });
  }
  return out;
}
function pickScript(scripts, names) {
  for (const n2 of names) if (scripts[n2]) return { name: n2 };
  return null;
}
async function tryRead(path, read) {
  try {
    return await read(path);
  } catch {
    return null;
  }
}
async function existsViaRead(path, read) {
  return await tryRead(path, read) !== null;
}
async function runCheck(spec, repoDir, run, canRun2, exists = existsNative) {
  const started = Date.now();
  const finish = (r) => ({ spec, durationMs: Date.now() - started, ...r });
  if (!await canRun2()) {
    return finish({ didRun: false, exitCode: null, output: "", reason: "no executor available \u2014 this needs the native desktop build, not the browser preview" });
  }
  if (/^(npm|npx|yarn|pnpm)$/.test(spec.command)) {
    if (!await exists(join(repoDir, "node_modules"))) {
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
async function readNative(path) {
  if (isBrowser()) {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    return ipc2.fsRead(path);
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}
async function existsNative(path) {
  if (isBrowser()) {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    try {
      await ipc2.fsList(path);
      return true;
    } catch {
      return false;
    }
  }
  const { stat } = await import("node:fs/promises");
  try {
    await stat(path);
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
  const canRun2 = opts.canRun ?? canRunNative;
  const exists = opts.exists ?? ((p) => existsViaRead(p, read));
  let specs = await discoverChecks(repoDir, read);
  if (opts.only?.length) specs = specs.filter((s) => opts.only.includes(s.source));
  const out = [];
  for (const spec of specs) out.push(await runCheck(spec, repoDir, run, canRun2, exists));
  return out;
}

// src/mission/evaluation.ts
init_id();
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
function testRunCheck(command, output, exitCode) {
  if (!output.trim()) {
    return unmeasuredCheck(`Test run: ${command}`, "TEST_RUN", "the command produced no output, so nothing was verified");
  }
  const failedCounts = [...output.matchAll(/(\d+)[ ,]+fail(?:ed|ing|ures?)?\b/gi)].map((m) => Number(m[1]));
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

// probe/checkRunner.test.ts
var pass = 0;
var fail = 0;
var ok = (c, m) => {
  if (c) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${m}`);
  }
};
var eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} \u2014 expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
function repo(files) {
  return async (path) => {
    for (const [name, content] of Object.entries(files)) {
      if (path.endsWith(name)) return content;
    }
    throw new Error(`ENOENT ${path}`);
  };
}
var pkg = (scripts, dev = {}) => JSON.stringify({ name: "target", scripts, devDependencies: dev });
function existsFor(files) {
  return async (path) => {
    const clean = path.replace(/\/$/, "");
    const base = clean.split("/").filter(Boolean).pop() ?? clean;
    return Object.keys(files).some((f) => f === clean || f.split("/")[0] === base);
  };
}
var runOk = async () => ({ stdout: "all good\n", stderr: "", code: 0 });
var runFail = async () => ({ stdout: "", stderr: "2 tests failed\n", code: 1 });
var canRun = async () => true;
console.log("\n== discovery: derived from the manifest, never invented ==\n");
{
  const specs = await discoverChecks("/repo", repo({ "package.json": pkg({ typecheck: "tsc --noEmit", lint: "eslint .", test: "vitest run" }) }));
  const ids = specs.map((s) => s.id);
  eq(ids, ["typecheck", "lint", "test"], "a node repo with all three scripts must yield exactly three checks");
  ok(specs.every((s) => s.discoveredFrom.startsWith("package.json scripts.")), "every check must name the script it came from");
  eq(specs.find((s) => s.id === "test")?.source, "TEST_RUN", "the test script must be a TEST_RUN check");
  eq(specs.find((s) => s.id === "lint")?.source, "STATIC_CHECK", "lint must be a STATIC_CHECK");
}
{
  const specs = await discoverChecks("/repo", repo({ "package.json": pkg({ build: "vite build" }, { typescript: "^5.6.0" }) }));
  eq(specs.map((s) => s.id), ["typecheck"], "typescript as a dep must imply a typecheck even with no script");
  eq(specs[0].args, ["exec", "--", "tsc", "--noEmit"], "the fallback must be tsc --noEmit");
  eq(specs[0].discoveredFrom, "package.json dependency: typescript", "the fallback must say where it came from");
}
{
  const specs = await discoverChecks("/repo", repo({ "README.md": "hello" }));
  eq(specs.length, 0, "an unrecognisable repo must yield zero checks");
}
{
  const specs = await discoverChecks("/repo", repo({ "Cargo.toml": "[package]\nname='x'\n" }));
  eq(specs.map((s) => s.id), ["cargo-check", "cargo-test"], "a Rust repo must yield cargo check + cargo test");
  eq(specs[0].source, "STATIC_CHECK", "cargo check is static analysis");
  eq(specs[1].source, "TEST_RUN", "cargo test is the test run");
}
{
  const specs = await discoverChecks("/repo", repo({ "pyproject.toml": "[project]\nname='x'\n" }));
  eq(specs.map((s) => s.id), ["pytest"], "a python repo must yield pytest");
}
{
  const specs = await discoverChecks("/repo", repo({ "package.json": "{ this is not json" }));
  eq(specs.length, 0, "a malformed package.json must yield zero checks, not an exception");
}
console.log("\n== execution: exit code becomes a measured result ==\n");
{
  const spec = { id: "test", label: "Test suite", source: "TEST_RUN", command: "npm", args: ["run", "test"], timeoutSecs: 60, discoveredFrom: "package.json scripts.test" };
  const r = await runCheck(spec, "/repo", runOk, canRun, existsFor({ "node_modules/x": "" }));
  ok(r.didRun, "with node_modules present the check must run");
  eq(r.exitCode, 0, "exit code must be captured");
  eq(r.reason, null, "a passing run has no reason");
  ok(r.durationMs >= 0, "duration must be recorded");
}
{
  const spec = { id: "test", label: "Test suite", source: "TEST_RUN", command: "npm", args: ["run", "test"], timeoutSecs: 60, discoveredFrom: "package.json scripts.test" };
  const r = await runCheck(spec, "/repo", runFail, canRun, existsFor({ "node_modules/x": "" }));
  ok(r.didRun, "a failing test still ran");
  eq(r.exitCode, 1, "the failing exit code must be captured");
  ok(/exited 1/.test(r.reason ?? ""), `the reason must state the exit code, got ${r.reason}`);
  ok(r.output.includes("2 tests failed"), "stderr must be captured as output");
}
console.log("\n== the two rules that stop it lying ==\n");
{
  const spec = { id: "test", label: "Test suite", source: "TEST_RUN", command: "npm", args: ["run", "test"], timeoutSecs: 60, discoveredFrom: "package.json scripts.test" };
  let executed = false;
  const spy = async () => {
    executed = true;
    return { stdout: "", stderr: "", code: 0 };
  };
  const r = await runCheck(spec, "/repo", spy, canRun, existsFor({ "package.json": "{}" }));
  ok(!executed, "npm must NOT be executed when node_modules is absent");
  ok(!r.didRun, "the check must report that it did not run");
  eq(r.exitCode, null, "no exit code when nothing ran");
  ok(/node_modules is absent/.test(r.reason ?? ""), `the reason must explain, got ${r.reason}`);
}
{
  const spec = { id: "test", label: "Test suite", source: "TEST_RUN", command: "cargo", args: ["test"], timeoutSecs: 60, discoveredFrom: "Cargo.toml" };
  const r = await runCheck(spec, "/repo", runFail, async () => false, existsFor({}));
  ok(!r.didRun, "with no executor nothing may run");
  ok(/native desktop build/.test(r.reason ?? ""), `the reason must name the missing executor, got ${r.reason}`);
}
{
  const spec = { id: "test", label: "Test suite", source: "TEST_RUN", command: "cargo", args: ["test"], timeoutSecs: 60, discoveredFrom: "Cargo.toml" };
  const boom = async () => {
    throw new Error("spawn cargo ENOENT");
  };
  const r = await runCheck(spec, "/repo", boom, canRun, existsFor({}));
  ok(!r.didRun, "a spawn failure means it did not run");
  ok(/ENOENT/.test(r.reason ?? ""), "the spawn error must be surfaced verbatim");
}
console.log("\n== a whole pass ==\n");
{
  const files = { "package.json": pkg({ typecheck: "tsc --noEmit", test: "vitest run" }), "node_modules/x": "" };
  const read = repo(files);
  const results = await runAllChecks("/repo", { read, run: runOk, canRun, exists: existsFor(files) });
  eq(results.length, 2, "both discovered checks must run");
  ok(results.every((r) => r.didRun && r.exitCode === 0), "all must run and pass");
  const onlyTests = await runAllChecks("/repo", { read, run: runOk, canRun, exists: existsFor(files), only: ["TEST_RUN"] });
  eq(onlyTests.map((r) => r.spec.id), ["test"], "`only` must filter by evidence source");
}
{
  const results = await runAllChecks("/repo", { read: repo({ "package.json": pkg({ test: "vitest run" }) }), run: runOk, canRun, exists: existsFor({ "package.json": "x" }) });
  eq(results.length, 1, "one check discovered");
  ok(!results[0].didRun, "and it must not have run, because node_modules is absent");
}
console.log("\n== testRunCheck verdicts: exit code first, runner summary second, ambient noise never (V11.8.1) ==\n");
{
  const green = testRunCheck(
    "pytest -q",
    [
      "Traceback (most recent call last):",
      '  File "/opt/artifact_tool/__main__.py", line 2, in <module>',
      "    import watcher",
      "ModuleNotFoundError: No module named 'watcher'",
      "",
      "============================= test session starts ==============================",
      "collected 1 item",
      "",
      "test_green.py .                                                          [100%]",
      "",
      "========================= 1 passed, 0 warnings in 0.01s ========================="
    ].join("\n"),
    0
  );
  ok(green.passed, "exit 0 + '1 passed' + an ambient Traceback must still PASS (the reviewer's exact case)");
  ok(green.measured, "and it is a MEASURED pass, not a hedged one");
  ok(/no failure summary/.test(green.detail), `the detail states the classification basis, got ${green.detail}`);
}
{
  const counted = testRunCheck("pytest -q", "test_a .\ntest_b F\n\n======== 3 passed, 1 failed in 0.05s ========\n", 0);
  ok(!counted.passed, "exit 0 but the runner's own summary says '1 failed' \u2192 FAIL");
}
{
  const mocha = testRunCheck("mocha", "  2 passing (5ms)\n  1 failing\n", 0);
  ok(!mocha.passed, "'1 failing' (mocha's wording) counts as a failure summary at exit 0");
}
{
  const zero = testRunCheck("go test ./...", "=== RUN   TestGreen\n--- PASS: TestGreen\nPASS\nok  pkg 0.004s\n0 failed; 5 passed\n", 0);
  ok(zero.passed, "'0 failed' is a count, not a verdict \u2014 the word 'failed' with a zero count must PASS");
}
{
  const cheerful = testRunCheck("pytest -q", "all good, nice work\n", 1);
  ok(!cheerful.passed, "a non-zero exit fails regardless of cheerful text (unchanged rule)");
}
{
  const tap = testRunCheck("node --test", "TAP version 13\nok 1 - works\nnot ok 2 - breaks\n", 0);
  ok(!tap.passed, "a TAP 'not ok' line fails even at exit 0");
}
{
  const goPanic = testRunCheck("go test ./...", "--- FAIL: TestX\npanic: runtime error: index out of range\n", 0);
  ok(!goPanic.passed, "a Go panic in the output fails even at exit 0");
}
{
  const noise = testRunCheck("vitest run", "stderr: error: artifact_tool deprecation warning\nstderr: \u2717 marker in a log line\n\n Test Files  1 passed (1)\n", 0);
  ok(noise.passed, "bare noise words ('error', '\u2717') with no failure summary cannot veto a measured pass");
}
{
  const empty2 = testRunCheck("pytest -q", "   \n", 0);
  ok(!empty2.passed && empty2.measured === false, "no output \u2192 unmeasured, never passed (unchanged rule)");
}
console.log(`
${pass} passed, ${fail} failed
`);
process.exit(fail ? 1 : 0);
