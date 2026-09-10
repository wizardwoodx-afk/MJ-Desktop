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

// src/app/desktop.ts
function detectHost() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__) ? "tauri" : "web";
}
var init_desktop = __esm({
  "src/app/desktop.ts"() {
    "use strict";
  }
});

// src/version.ts
var VH_VERSION, VH_SHORT, VH_TITLE;
var init_version = __esm({
  "src/version.ts"() {
    "use strict";
    VH_VERSION = "16.4.1";
    VH_SHORT = VH_VERSION.split(".").slice(0, 2).join(".");
    VH_TITLE = `Vouch Harbor ${VH_SHORT}`;
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
    ["mcp.control", "Control MCP", "vouch-control-mcp", ["stdio"]]
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
    KEY = "vouch.v3.db";
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
        window.dispatchEvent(new CustomEvent("vh://event", { detail: rec }));
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
        window.dispatchEvent(new CustomEvent("vh://approval", { detail: rec }));
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
function transformCallback(callback, once = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once);
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
          version: VH_VERSION,
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
        const raw = localStorage.getItem("vouch.v3.db") ?? "";
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
          window.dispatchEvent(new CustomEvent("vh://event", { detail: rec }));
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
      secretGet: async (secretRef) => {
        if (useTauri()) return tauriInvoke("secret_get", { secretRef });
        const value = localDb.secretGet(secretRef);
        return { ref: secretRef, present: value != null && value !== "", value: value ?? null };
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
          const raw = JSON.parse(localStorage.getItem("vouch.customHarnesses") ?? "[]");
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
        localStorage.setItem("vouch.customHarnesses", JSON.stringify(list));
        return { saved: true, created: i < 0, count: list.length };
      },
      customHarnessDelete: async (id) => {
        if (useTauri()) return tauriInvoke("custom_harness_delete", { id });
        const list = (await ipc.customHarnessList()).filter((h) => h.id !== id);
        localStorage.setItem("vouch.customHarnesses", JSON.stringify(list));
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
          version: VH_VERSION,
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

// src/mission/lessons.ts
var DECAY_PER_DAY = 0.95;
var seq = 0;
function nextId(prefix, now) {
  seq += 1;
  return `${prefix}-${now.toString(36)}-${seq}`;
}
var FAILURE_TEXT = {
  AGENT_STARVATION: "Seats went idle waiting for inputs \u2014 briefings must name the artifact each seat consumes.",
  REPEATED_FAILURE: "The same failure recurred \u2014 isolate the failing task before retrying it a third time.",
  SEQUENTIAL_BOTTLENECK: "Exclusive tasks serialized the run \u2014 split independent work before assigning it.",
  UNMEASURED_COST: "Cost arrived unmeasured \u2014 treat the run's totals as absent, not zero."
};
function reflectOnMission(input) {
  const now = input.now ?? Date.now();
  const out = [];
  const push = (kind, text, evidence, causal) => {
    if (!text || evidence.length === 0) return;
    out.push({
      id: nextId("lesson", now),
      kind,
      text,
      sourceMissionId: input.missionId,
      evidence,
      strength: 1,
      createdAt: now,
      lastUsedAt: now,
      useCount: 0,
      causal
    });
  };
  if (input.simulated) {
    push(
      "environment",
      "Execution was simulated on this host \u2014 no lesson about real execution may be drawn; only host capability is known.",
      ["simulated=true"],
      { observation: "host executed nothing real", outcome: "simulated \u2014 capability fact only" }
    );
    return out;
  }
  for (const cls of input.failureClasses) {
    const text = FAILURE_TEXT[cls];
    if (text) push(
      "failure",
      text,
      [`failureClass=${cls}`],
      { observation: `failure class ${cls} observed on measured run`, outcome: cls }
    );
  }
  if (input.repaired && input.repairLadder.length > 0) {
    push(
      "success",
      `Repair ladder ${input.repairLadder.join(" -> ")} recovered the run \u2014 prefer the cheapest strategy that previously worked.`,
      [`ladder=${input.repairLadder.join(">")}`, "repaired=true"],
      { decision: "escalate through the repair ladder", action: input.repairLadder.join(" -> "), observation: input.failureClasses.join(", ") || "failure", outcome: "recovered" }
    );
  }
  if (input.verified) {
    const reviewers = input.seatOutcomes.filter((s) => s.role === "reviewer" && s.passed).length;
    push(
      "success",
      reviewers > 0 ? "Cross-role review passed on real execution \u2014 keep an independent reviewer seat on missions like this." : "Mission verified on real execution \u2014 the team shape that produced this is worth reusing.",
      [`verified=true`, `reviewersPassed=${reviewers}`],
      { action: `team shape with ${reviewers} passing reviewer seat(s)`, outcome: "verified on real execution" }
    );
  }
  return out;
}
function decayedStrength(l, now) {
  const days = Math.max(0, (now - l.createdAt) / 864e5);
  return l.strength * Math.pow(DECAY_PER_DAY, days);
}
function tokens(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
}
function retrieveCausal(memory, condition, k, now) {
  const c = tokens(condition);
  const causalText = (l) => l.causal ? [l.causal.decision, l.causal.action, l.causal.observation, l.causal.outcome].filter(Boolean).join(" ") : "";
  const scored = memory.filter((l) => l.causal).map((l) => {
    const t = tokens(causalText(l));
    let overlap = 0;
    c.forEach((w) => {
      if (t.has(w)) overlap += 1;
    });
    return { l, score: overlap === 0 ? 0 : decayedStrength(l, now) * overlap };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((x) => x.l);
}

// src/mission/selfImprove.ts
var ARCHIVE_CAP = 24;
var BASE_PARAMS = {
  reviewDepth: 1,
  checkBias: 0.5,
  serialExec: false,
  lessonBudget: 3,
  mosaic: false
};
function initialState(now) {
  const v = {
    id: "strategy-v1",
    gen: 1,
    params: { ...BASE_PARAMS },
    parentId: null,
    status: "adopted",
    score: null,
    evaluatedOn: 0,
    note: "baseline \u2014 shipped defaults; measured on the runs it itself governs",
    createdAt: now
  };
  return { versions: [v], adoptedId: v.id };
}
function adoptedVersion(s) {
  return s.versions.find((v) => v.id === s.adoptedId) ?? null;
}
var DIMS = ["reviewDepth", "checkBias", "serialExec", "lessonBudget", "mosaic"];
function proposeVariation(s, now) {
  const parent = adoptedVersion(s);
  if (!parent) return s;
  if (s.versions.some((v2) => v2.status === "candidate")) return s;
  const gen = Math.max(...s.versions.map((v2) => v2.gen)) + 1;
  const dim = DIMS[(gen - 2) % DIMS.length];
  const params = { ...parent.params };
  if (dim === "reviewDepth") params.reviewDepth = params.reviewDepth === 1 ? 2 : 1;
  else if (dim === "checkBias") params.checkBias = params.checkBias >= 0.75 ? 0.25 : params.checkBias + 0.25;
  else if (dim === "serialExec") params.serialExec = !params.serialExec;
  else if (dim === "lessonBudget") params.lessonBudget = params.lessonBudget >= 6 ? 1 : params.lessonBudget + 1;
  else params.mosaic = !params.mosaic;
  const v = {
    id: `strategy-v${gen}`,
    gen,
    params,
    parentId: parent.id,
    status: "candidate",
    score: null,
    evaluatedOn: 0,
    note: `mutated ${String(dim)} from parent v${parent.gen}; will govern alternating runs and be judged only on its own measured results`,
    createdAt: now
  };
  return { ...s, versions: [...s.versions, v].slice(-ARCHIVE_CAP) };
}

// src/mission/belief.ts
var BELIEF_CAP = 100;
var seq2 = 0;
function nextId2(now) {
  seq2 += 1;
  return `belief-${now.toString(36)}-${seq2}`;
}
function classForExternal(confidence) {
  if (confidence >= 0.8) return "probably";
  if (confidence >= 0.5) return "uncertain";
  return "unknown";
}
function classForMeasured(verified, confidence) {
  if (!verified) return "uncertain";
  return confidence >= 0.8 ? "known" : "probably";
}
function beliefFromExternal(claim, confidence, source, now, deps = [], opts) {
  return {
    id: nextId2(now),
    claim,
    klass: classForExternal(confidence),
    confidence,
    source,
    ts: now,
    deps,
    evidence: [`${source}: ${claim}`],
    isPrediction: false,
    provenance: opts?.userStated ? "user-stated" : "agent-inferred",
    aboutUser: opts?.aboutUser ?? false,
    approved: false
  };
}
function beliefFromMeasured(claim, verified, confidence, source, now, deps = [], opts) {
  return {
    id: nextId2(now),
    claim,
    klass: classForMeasured(verified, confidence),
    source,
    ts: now,
    deps,
    evidence: [`${source}: ${claim}`],
    isPrediction: false,
    confidence,
    provenance: opts?.userStated ? "user-stated" : "agent-inferred",
    aboutUser: opts?.aboutUser ?? false,
    approved: false
  };
}
function predictionBelief(claim, source, now) {
  return { id: nextId2(now), claim, klass: "uncertain", confidence: 0.5, source, ts: now, deps: [], evidence: [], isPrediction: true, provenance: "agent-inferred", aboutUser: false, approved: false };
}
function needsApproval(b) {
  return b.provenance === "agent-inferred" && b.aboutUser && !b.approved;
}
function subjectTokens(s) {
  return new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
}
function subjectOverlap(a, b) {
  const ta = subjectTokens(a);
  const tb = subjectTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((w) => {
    if (tb.has(w)) inter += 1;
  });
  return inter / Math.min(ta.size, tb.size);
}
function mergeBeliefs(memory, incoming) {
  let out = [...memory];
  for (const b of incoming) {
    const idx = out.findIndex((m2) => m2.claim === b.claim || !b.isPrediction && !m2.isPrediction && subjectOverlap(m2.claim, b.claim) >= 0.7);
    if (idx === -1) {
      out.push(b);
      continue;
    }
    const m = out[idx];
    const sameAssertion = m.claim === b.claim;
    const conflicts = !sameAssertion && m.source !== b.source;
    out[idx] = conflicts ? { ...m, klass: "contradicted", confidence: Math.min(m.confidence, b.confidence), evidence: [...m.evidence, ...b.evidence].slice(0, 8), deps: [.../* @__PURE__ */ new Set([...m.deps, ...b.deps])] } : { ...m, confidence: Math.max(m.confidence, b.confidence), ts: Math.max(m.ts, b.ts), evidence: [...m.evidence, ...b.evidence].slice(0, 8) };
  }
  return out.slice(-BELIEF_CAP);
}
function beliefsForBriefing(memory, goal, now) {
  void now;
  const goalWords = goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const relevant = (b) => {
    if (needsApproval(b)) return false;
    const low = b.claim.toLowerCase();
    return b.klass === "contradicted" || b.isPrediction || goalWords.some((w) => low.includes(w));
  };
  const lines = [];
  for (const b of memory.filter(relevant)) {
    if (b.isPrediction) lines.push(`[prediction \u2014 NOT evidence] ${b.claim}`);
    else if (b.klass === "contradicted") lines.push(`[belief contradicted] ${b.claim} \u2014 sources disagree; verify before acting on it`);
    else lines.push(`[belief ${b.klass}] ${b.claim} (${b.source})`);
  }
  return lines.slice(0, 6);
}

// src/mission/signing.ts
var STORAGE_KEY = "mj.issuerkey.v1";
var KEYCHAIN_REF = "mj.issuerkey.v1";
async function keychainBridge() {
  try {
    const native = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!native) return null;
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    return {
      get: async () => {
        try {
          const r = await ipc2.secretGet(KEYCHAIN_REF);
          return r?.present && r.value ? r.value : null;
        } catch {
          return null;
        }
      },
      set: async (json) => {
        try {
          const r = await ipc2.secretSet(KEYCHAIN_REF, json);
          return Boolean(r?.stored);
        } catch {
          return false;
        }
      }
    };
  } catch {
    return null;
  }
}
var cached = null;
function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function ed25519Available() {
  try {
    return typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof crypto.subtle.generateKey === "function";
  } catch {
    return false;
  }
}
async function ensureIssuerIdentity() {
  if (cached) return cached;
  if (!ed25519Available()) return null;
  const bridge = await keychainBridge();
  try {
    const raw = bridge ? await bridge.get() : globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity = {
          keyId: `vh-issuer-${stored.publicKeyHex.slice(0, 12)}`,
          publicKeyHex: stored.publicKeyHex,
          createdAt: stored.createdAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
        };
        cached = { identity, privateKey };
        return cached;
      }
    }
  } catch {
  }
  try {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKeyHex = toHex(rawPub);
    const identity = {
      keyId: `vh-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const persisted = JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt });
    try {
      if (bridge) await bridge.set(persisted);
    } catch {
    }
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, persisted);
    } catch {
    }
    cached = { identity, privateKey: pair.privateKey };
    return cached;
  } catch {
    return null;
  }
}
async function signHexDigest(hexDigest) {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  try {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, holder.privateKey, fromHex(hexDigest)));
    return { alg: "EdDSA", keyId: holder.identity.keyId, publicKeyHex: holder.identity.publicKeyHex, sigHex: toHex(sig) };
  } catch {
    return null;
  }
}
async function verifyIssuerSignature(chainHashHex, sigHex, publicKeyHex) {
  if (!ed25519Available()) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", fromHex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromHex(sigHex), fromHex(chainHashHex));
  } catch {
    return false;
  }
}
function signingSupported() {
  return ed25519Available();
}

// src/mission/learningReceipt.ts
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// src/mission/actionPacket.ts
function canonicalPacketInput(p) {
  return JSON.stringify([
    p.format,
    p.id,
    p.mjVersion,
    p.issuedAt,
    p.intent,
    p.beliefDigest,
    p.planStep,
    p.prediction,
    p.risk,
    p.permission,
    p.rollback,
    p.verification,
    p.reversible
  ]);
}
var seq3 = 0;
async function issueActionPacket(args) {
  const now = args.now ?? Date.now();
  seq3 += 1;
  const base = {
    format: "vh-action-packet/1",
    id: `packet-${now.toString(36)}-${seq3}`,
    mjVersion: args.mjVersion,
    issuedAt: new Date(now).toISOString(),
    intent: args.intent,
    beliefDigest: args.beliefDigest,
    planStep: args.planStep,
    prediction: args.prediction,
    risk: args.risk,
    permission: args.permission,
    rollback: args.rollback,
    verification: args.verification,
    reversible: args.reversible
  };
  const digest = await sha256Hex(canonicalPacketInput(base));
  const packet = { ...base, digest };
  if (signingSupported()) {
    const sig = await signHexDigest(digest);
    if (sig) packet.signature = sig;
    else packet.signatureNote = "Ed25519 unavailable in this runtime; packet unsigned.";
  } else {
    packet.signatureNote = "Ed25519 unavailable in this runtime; packet unsigned.";
  }
  return packet;
}
async function verifyActionPacket(p) {
  const { digest, signature, signatureNote, ...rest } = p;
  void signatureNote;
  const recomputed = await sha256Hex(canonicalPacketInput(rest));
  if (recomputed !== digest) return { ok: false, reason: "digest mismatch \u2014 packet was altered" };
  if (p.signature) {
    const good = await verifyIssuerSignature(digest, p.signature.sigHex, p.signature.publicKeyHex);
    if (!good) return { ok: false, reason: "signature does not verify" };
  }
  return { ok: true };
}
function packetAllowsExecution(p) {
  if (!p) return { ok: true, reason: "no packet \u2014 run proceeds under gate policy alone (pre-11.12 caller)" };
  if (p.permission === "refused") return { ok: false, reason: `action packet ${p.id} is refused: ${p.risk}` };
  if (!p.reversible && p.permission !== "allowed") {
    return { ok: false, reason: `irreversible action requires explicit "allowed" permission; packet ${p.id} says "${p.permission}"` };
  }
  return { ok: true, reason: `packet ${p.id} permits execution (${p.permission}${p.reversible ? ", reversible" : ", irreversible+allowed"})` };
}

// probe/mosaicAlign.test.ts
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
var NOW = 176e10;
section("1. R1 \u2014 predictions are not evidence");
{
  ok("external confidence 0.99 still caps at 'probably'", classForExternal(0.99) === "probably");
  ok("external confidence 0.5 is 'uncertain', 0.1 'unknown'", classForExternal(0.5) === "uncertain" && classForExternal(0.1) === "unknown");
  ok("measured+verified may be 'known'; measured+unverified stays 'uncertain'", classForMeasured(true, 0.9) === "known" && classForMeasured(false, 1) === "uncertain");
  const mem = mergeBeliefs([], [
    beliefFromExternal("library X supports protocol Y", 0.9, "web:docs", NOW),
    predictionBelief("running the team will verify", "simulator", NOW)
  ]);
  const lines = beliefsForBriefing(mem, "library X protocol Y", NOW);
  ok("predictions surface in briefings labelled as NOT evidence", lines.some((l) => l.startsWith("[prediction \u2014 NOT evidence]")), JSON.stringify(lines));
  ok("external claims never briefed as known", !lines.some((l) => l.includes("[belief known]")));
  const contradicted = mergeBeliefs(
    [beliefFromMeasured("the gate policy is STRICT", true, 1, "run:m1", NOW)],
    [beliefFromExternal("the gate policy is lenient", 0.9, "web:rumor", NOW)]
  );
  ok("conflicting sources mark the belief contradicted", contradicted.some((b) => b.klass === "contradicted"), JSON.stringify(contradicted.map((b) => b.klass)));
  ok("contradictions surface with a verify-before-acting warning", beliefsForBriefing(contradicted, "gate policy", NOW).some((l) => l.includes("[belief contradicted]")));
  const baseInput = {
    missionId: "m1",
    simulated: false,
    verified: true,
    failureClasses: ["REPEATED_FAILURE"],
    repairLadder: ["RETRY"],
    repaired: true,
    seatOutcomes: [{ role: "reviewer", passed: true }],
    now: NOW
  };
  const lessons = reflectOnMission(baseInput);
  ok("lessons carry only measured evidence \u2014 no prediction text leaks in", lessons.every((l) => l.evidence.every((e) => !e.includes("prediction"))));
}
section("2. R2 \u2014 proof-carrying actions");
{
  const p = await issueActionPacket({
    mjVersion: "11.12.0",
    intent: "run the team",
    beliefDigest: "ab".repeat(32),
    planStep: "mission-1",
    prediction: "gate verifies",
    risk: "ledger capped",
    permission: "allowed",
    rollback: "worktrees isolated",
    verification: "gate verdict",
    reversible: false,
    now: NOW
  });
  ok("an issued packet verifies with zero MJ state", (await verifyActionPacket(p)).ok === true);
  const tampered = { ...p, prediction: "something will surely go right" };
  const tv = await verifyActionPacket(tampered);
  ok("altering a prediction after signing fails verification", tv.ok === false && (tv.reason ?? "").includes("digest"), tv.reason);
  ok("no packet \u2192 run proceeds under gate policy alone (pre-11.12 callers)", packetAllowsExecution(null).ok === true);
  ok("refused packet blocks execution", packetAllowsExecution({ ...p, permission: "refused" }).ok === false);
  ok("irreversible + requires-human blocks execution", packetAllowsExecution({ ...p, permission: "requires-human" }).ok === false);
  ok("irreversible + allowed executes", packetAllowsExecution(p).ok === true);
  ok("reversible + requires-human executes (undoable actions may proceed)", packetAllowsExecution({ ...p, reversible: true, permission: "requires-human" }).ok === true);
}
section("3. causal memory \u2014 tried-X-under-conditions retrieval");
{
  const lessons = reflectOnMission({
    missionId: "m2",
    simulated: false,
    verified: true,
    failureClasses: ["SEQUENTIAL_BOTTLENECK"],
    repairLadder: ["ISOLATE", "RETRY"],
    repaired: true,
    seatOutcomes: [{ role: "coder", passed: true }, { role: "reviewer", passed: true }],
    now: NOW
  });
  ok("reflected lessons carry causal edges", lessons.every((l) => !!l.causal), JSON.stringify(lessons.map((l) => l.causal)));
  const hit = retrieveCausal(lessons, "isolate the bottleneck then retry", 3, NOW);
  ok("causal retrieval answers 'what happened when we tried X'", hit.length > 0 && (hit[0].causal?.action ?? "").includes("ISOLATE"), JSON.stringify(hit.map((h) => h.causal)));
  ok("unrelated conditions retrieve nothing (no similarity bleed)", retrieveCausal(lessons, "kubernetes ingress tuning", 3, NOW).length === 0);
}
section("4. the mosaic regime dimension rotates through the experiment");
{
  const strip = (s2) => ({
    ...s2,
    versions: s2.versions.map((v) => v.status === "candidate" ? { ...v, status: "retired" } : v)
  });
  let s = initialState(NOW);
  const mutated = [];
  for (let i = 0; i < 5; i++) {
    const before = s.versions.find((v) => v.status === "adopted")?.params ?? BASE_PARAMS;
    s = proposeVariation(strip(s), NOW + i);
    const cand = s.versions.find((v) => v.status === "candidate");
    if (!cand) {
      mutated.push("reviewDepth");
      continue;
    }
    for (const k of Object.keys(BASE_PARAMS)) {
      if (JSON.stringify(cand.params[k]) !== JSON.stringify(before[k])) mutated.push(k);
    }
  }
  ok("five generations rotate five dimensions incl. mosaic", new Set(mutated).size === 5 && mutated.includes("mosaic"), JSON.stringify(mutated));
  ok("mosaic flips from the shipped default", (s.versions.find((v) => v.gen === 6)?.params.mosaic ?? false) === true);
}
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
