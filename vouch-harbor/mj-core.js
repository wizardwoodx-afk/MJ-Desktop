"use strict";
var MJ = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ../MJ-Desktop/src/app/desktop.ts
  function detectHost() {
    return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__) ? "tauri" : "web";
  }
  var init_desktop = __esm({
    "../MJ-Desktop/src/app/desktop.ts"() {
      "use strict";
    }
  });

  // ../MJ-Desktop/src/version.ts
  var MJ_VERSION, MJ_VERSION_SHORT, MJ_TITLE;
  var init_version = __esm({
    "../MJ-Desktop/src/version.ts"() {
      "use strict";
      MJ_VERSION = "14.1.3";
      MJ_VERSION_SHORT = MJ_VERSION.split(".").slice(0, 2).join(".");
      MJ_TITLE = `MJ ${MJ_VERSION_SHORT}`;
    }
  });

  // ../MJ-Desktop/src/app/id.ts
  function uid(prefix) {
    n += 1;
    return `${prefix}-${Date.now().toString(36)}-${n.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
  function nowIso() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  var n;
  var init_id = __esm({
    "../MJ-Desktop/src/app/id.ts"() {
      "use strict";
      n = 0;
    }
  });

  // ../MJ-Desktop/src/domain/types.ts
  var GRAPH_SCHEMA_VERSION;
  var init_types = __esm({
    "../MJ-Desktop/src/domain/types.ts"() {
      "use strict";
      GRAPH_SCHEMA_VERSION = 2;
    }
  });

  // ../MJ-Desktop/src/ipc/localDb.ts
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
    "../MJ-Desktop/src/ipc/localDb.ts"() {
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

  // ../MJ-Desktop/node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
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
    "../MJ-Desktop/node_modules/@tauri-apps/api/external/tslib/tslib.es6.js"() {
    }
  });

  // ../MJ-Desktop/node_modules/@tauri-apps/api/core.js
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
    "../MJ-Desktop/node_modules/@tauri-apps/api/core.js"() {
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

  // ../MJ-Desktop/src/ipc/client.ts
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
    "../MJ-Desktop/src/ipc/client.ts"() {
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

  // ../MJ-Desktop/mjcore-entry.ts
  var mjcore_entry_exports = {};
  __export(mjcore_entry_exports, {
    BudgetGate: () => BudgetGate,
    HUMAN_PRINCIPAL_RE: () => HUMAN_PRINCIPAL_RE,
    RISK_RULES: () => RISK_RULES,
    attenuate: () => attenuate,
    budgetCheck: () => budgetCheck,
    buildProofReceipt: () => buildProofReceipt,
    canonicalEnvelopeInput: () => canonicalEnvelopeInput,
    checkEnvelope: () => checkEnvelope,
    classifyRisk: () => classifyRisk,
    egressCanonical: () => egressCanonical,
    ensureIssuerIdentity: () => ensureIssuerIdentity,
    exportIssuerPublicKeyDocument: () => exportIssuerPublicKeyDocument,
    isHumanPrincipal: () => isHumanPrincipal,
    issueRootEnvelope: () => issueRootEnvelope,
    loadEgressLedger: () => loadEgressLedger,
    policyTable: () => policyTable,
    receiptFromJsonl: () => receiptFromJsonl,
    receiptToJsonl: () => receiptToJsonl,
    requestEgress: () => requestEgress,
    requiresHuman: () => requiresHuman,
    revoke: () => revoke,
    saveEgressLedger: () => saveEgressLedger,
    signChainHash: () => signChainHash,
    signHexDigest: () => signHexDigest,
    signingSupported: () => signingSupported,
    verifyEgressLedger: () => verifyEgressLedger,
    verifyEnvelope: () => verifyEnvelope,
    verifyIssuerSignature: () => verifyIssuerSignature,
    verifyProofReceipt: () => verifyProofReceipt
  });

  // ../MJ-Desktop/src/mission/signing.ts
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
            keyId: `mj-issuer-${stored.publicKeyHex.slice(0, 12)}`,
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
        keyId: `mj-issuer-${publicKeyHex.slice(0, 12)}`,
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
  async function signChainHash(chainHashHex) {
    return signHexDigest(chainHashHex);
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
  async function exportIssuerPublicKeyDocument(mjVersion) {
    const holder = await ensureIssuerIdentity();
    if (!holder) return null;
    return [
      "MJ \u2014 Issuer Public Key (Ed25519)",
      "================================",
      "",
      `MJ version : ${mjVersion}`,
      `Key id     : ${holder.identity.keyId}`,
      `Public key : ${holder.identity.publicKeyHex}`,
      `Created    : ${holder.identity.createdAt}`,
      "",
      "What this key verifies",
      "----------------------",
      "Every mj-proof-receipt/2 issued by this MJ install carries `issuer` + `signature`:",
      "an Ed25519 signature over the receipt's FINAL CHAIN HASH (the `hash` of the last",
      "chained event). To verify a receipt without MJ:",
      "",
      "  1. Re-canonicalize each event body (recursive key sort) and re-hash the chain",
      "     from the 64-zero genesis to recover the final chain hash.",
      "  2. Verify the Ed25519 signature over that hash with the public key above.",
      "  3. Re-check the HMAC seal as before (it still applies).",
      "",
      "The private key never leaves the machine that issued the receipts; MJ has no server",
      "it could leave through. Treat this document like a code-signing certificate: anyone",
      "holding it can verify MJ's receipts; nobody holding it can forge them.",
      ""
    ].join("\n");
  }
  function signingSupported() {
    return ed25519Available();
  }

  // ../MJ-Desktop/src/mission/learningReceipt.ts
  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // ../MJ-Desktop/src/mission/custody.ts
  var HUMAN_PRINCIPAL_RE = /^human:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  function isHumanPrincipal(p) {
    return HUMAN_PRINCIPAL_RE.test(p);
  }
  function canonicalEnvelopeInput(e) {
    return JSON.stringify([e.format, e.id, e.principal, e.delegationChain, e.scope, e.issuedAt, e.expiresAt, e.budgetUsd, e.revoked, e.parentId]);
  }
  var seq = 0;
  async function seal(base) {
    const digest = await sha256Hex(canonicalEnvelopeInput(base));
    const env = { ...base, digest };
    if (signingSupported()) {
      const sig = await signHexDigest(digest);
      if (sig) env.signature = sig;
      else env.signatureNote = "Ed25519 unavailable in this runtime; envelope unsigned.";
    } else {
      env.signatureNote = "Ed25519 unavailable in this runtime; envelope unsigned.";
    }
    return env;
  }
  async function issueRootEnvelope(args) {
    if (!isHumanPrincipal(args.principal)) {
      throw new Error(`custody: root principal "${args.principal}" is not a human principal \u2014 the root of every delegation chain must match human:<id>. Refused; nothing was signed.`);
    }
    const now = args.now ?? Date.now();
    const budget = args.budgetUsd ?? null;
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      throw new Error(`custody: budget cap must be a finite non-negative USD amount \u2014 refused ${String(budget)}`);
    }
    seq += 1;
    return seal({
      format: "mj-envelope/1",
      id: `env-${now.toString(36)}-${seq}`,
      principal: args.principal,
      delegationChain: [args.principal],
      scope: args.scope,
      issuedAt: now,
      expiresAt: args.expiresAt,
      budgetUsd: budget,
      revoked: null,
      parentId: null
    });
  }
  async function attenuate(parent, agentId, subScope, opts) {
    if (!isHumanPrincipal(parent.principal)) {
      return { envelope: null, reason: `custody: parent envelope principal "${parent.principal}" is not human-format \u2014 attenuation is refused rather than delegated from an illegitimate root` };
    }
    const now = opts?.now ?? Date.now();
    const notInParent = subScope.filter((s) => !parent.scope.includes(s));
    if (notInParent.length > 0) {
      return { envelope: null, reason: `attenuation refused: scope would GROW by [${notInParent.join(", ")}] \u2014 a sub-agent never exceeds its parent` };
    }
    const expiry = opts?.expiresAt ?? parent.expiresAt;
    if (parent.expiresAt !== null && (expiry === null || expiry > parent.expiresAt)) {
      return { envelope: null, reason: "attenuation refused: child expiry outlives the parent envelope" };
    }
    const requestedBudget = opts?.budgetUsd ?? null;
    const budget = requestedBudget === null ? parent.budgetUsd : parent.budgetUsd !== null && requestedBudget > parent.budgetUsd ? null : requestedBudget;
    if (requestedBudget !== null && parent.budgetUsd !== null && requestedBudget > parent.budgetUsd) {
      return { envelope: null, reason: `attenuation refused: child budget $${requestedBudget} exceeds the parent's $${parent.budgetUsd} cap \u2014 spend authority never grows` };
    }
    seq += 1;
    const envelope = await seal({
      budgetUsd: budget,
      format: "mj-envelope/1",
      id: `env-${now.toString(36)}-${seq}`,
      principal: parent.principal,
      delegationChain: [...parent.delegationChain, agentId],
      scope: subScope,
      issuedAt: now,
      expiresAt: expiry,
      revoked: null,
      parentId: parent.id
    });
    return { envelope, reason: `attenuated from ${parent.id}; chain ${envelope.delegationChain.join(" -> ")}` };
  }
  function revoke(e, reason) {
    return { ...e, revoked: reason };
  }
  function budgetCheck(e, spentUsd) {
    if (e.budgetUsd === null) return { ok: true, reason: "uncapped", remainingUsd: null };
    const remaining = e.budgetUsd - spentUsd;
    if (spentUsd >= e.budgetUsd) {
      return { ok: false, reason: `spend authority exhausted \u2014 $${spentUsd.toFixed(4)} spent against a $${e.budgetUsd.toFixed(2)} cap`, remainingUsd: Math.max(0, remaining) };
    }
    return { ok: true, reason: "within budget", remainingUsd: remaining };
  }
  var BudgetGate = class {
    constructor(capUsd) {
      this.capUsd = capUsd;
    }
    committed = 0;
    /** Budget not yet committed to running seats. */
    get remaining() {
      return Math.max(0, this.capUsd - this.committed);
    }
    get committedUsd() {
      return this.committed;
    }
    /** ATOMIC: check-and-commit with no await in between. Null when the cap cannot admit this seat. */
    reserve(seatId, amount) {
      if (!Number.isFinite(amount) || amount <= 0) return null;
      if (this.committed + amount > this.capUsd + 1e-9) return null;
      this.committed += amount;
      return { seatId, reservedUsd: amount, settled: false };
    }
    /** Swap the reservation for the REAL charge; reports any per-seat overrun honestly. */
    settle(ticket, actualUsd) {
      if (ticket.settled) return { overrunUsd: 0 };
      this.committed -= ticket.reservedUsd;
      const actual = Math.max(0, Number.isFinite(actualUsd) ? actualUsd : 0);
      this.committed += actual;
      ticket.settled = true;
      return { overrunUsd: Math.max(0, actual - ticket.reservedUsd) };
    }
    /** Give the reservation back (a seat skipped or aborted before charging). */
    release(ticket) {
      if (!ticket.settled) {
        this.committed -= ticket.reservedUsd;
        ticket.settled = true;
      }
    }
  };
  function checkEnvelope(e, action, now) {
    if (!e) return { ok: false, reason: "no authority envelope \u2014 nothing executes without traced authority" };
    if (e.revoked) return { ok: false, reason: `envelope ${e.id} revoked: ${e.revoked}` };
    if (e.expiresAt !== null && now > e.expiresAt) return { ok: false, reason: `envelope ${e.id} expired \u2014 authority is void` };
    if (!e.scope.includes(action)) return { ok: false, reason: `action "${action}" outside envelope scope [${e.scope.join(", ")}]` };
    return { ok: true, reason: `envelope ${e.id} permits "${action}" (principal ${e.principal})` };
  }
  async function verifyEnvelope(e) {
    if (!isHumanPrincipal(e.principal)) {
      return { ok: false, reason: `principal "${e.principal}" is not human-format \u2014 every chain must root in a human` };
    }
    const { digest, signature, signatureNote, ...rest } = e;
    void signatureNote;
    const recomputed = await sha256Hex(canonicalEnvelopeInput(rest));
    if (recomputed !== digest) return { ok: false, reason: "digest mismatch \u2014 envelope was altered" };
    if (e.signature) {
      const good = await verifyIssuerSignature(digest, e.signature.sigHex, e.signature.publicKeyHex);
      if (!good) return { ok: false, reason: "signature does not verify" };
    }
    return { ok: true };
  }

  // ../MJ-Desktop/src/mission/licensing.ts
  var VERIFY_SECRET = "mj-commercial-v1-offline";

  // ../MJ-Desktop/src/mission/receipts.ts
  var enc = new TextEncoder();
  function sortDeep(v) {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
      return out;
    }
    return v;
  }
  var canon = (o) => JSON.stringify(sortDeep(o));
  async function sha256hex(s) {
    const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function hmacHex(s, secret) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(s));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function buildProofReceipt(args) {
    const { report } = args;
    const seatEvents = [];
    for (const s of report.seats) {
      const data = { role: s.role, outcome: s.outcome, verified: s.verified };
      if (s.harness) {
        data.harness = s.harness;
        data.identity = await sha256hex(`${s.seatId}|${s.role}|${s.harness}`);
      }
      seatEvents.push({ kind: "seat.outcome", seatId: s.seatId, data });
    }
    const raw = [
      { kind: "mission.status", seatId: null, data: { status: report.status, reviewedBySnapshot: report.reviewedBySnapshot === true } },
      ...seatEvents,
      { kind: "mission.verdict", seatId: null, data: { verified: report.seats.some((s) => s.verified), arms: report.autonomyArms ?? [] } }
    ];
    if (report.gateStatus !== void 0) {
      raw.push({
        kind: "gate.verdict",
        seatId: null,
        data: {
          status: report.gateStatus,
          tier: report.gateTier ?? "n/a",
          // 11.10 — the writer→snapshot→verifier evidence link, in the chain itself.
          snapshotSha: report.gateSnapshotSha ?? null
        }
      });
    }
    if (report.arenaGate) {
      raw.push({
        kind: "arena.gate",
        seatId: null,
        data: {
          gate: report.arenaGate.gate,
          digest: report.arenaGate.digest,
          defended: report.arenaGate.defended,
          total: report.arenaGate.total,
          summary: report.arenaGate.summary
        }
      });
    }
    const events = [];
    let prev = "0".repeat(64);
    let seq2 = 0;
    for (const r of raw) {
      const ts = (/* @__PURE__ */ new Date()).toISOString();
      const body = { seq: seq2, ts, kind: r.kind, seatId: r.seatId, data: r.data, prev };
      const hash = await sha256hex(canon(body));
      events.push({ ...body, hash });
      prev = hash;
      seq2 += 1;
    }
    const header = {
      mission: args.mission,
      teamId: args.teamId,
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      mjVersion: args.mjVersion,
      edition: args.edition,
      autonomyArms: report.autonomyArms ?? []
    };
    const seal2 = await hmacHex(prev, VERIFY_SECRET);
    const sig = await signChainHash(prev);
    if (sig) {
      return {
        format: "mj-proof-receipt/2",
        header,
        events,
        seal: seal2,
        issuer: { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex },
        signature: sig.sigHex
      };
    }
    return {
      format: "mj-proof-receipt/2",
      header,
      events,
      seal: seal2,
      issuer: null,
      signature: null,
      signatureNote: "This runtime has no Ed25519 (WebCrypto refused or is absent). The receipt is tamper-evident via its HMAC seal but NOT issuer-signed."
    };
  }
  async function verifyProofReceipt(rc) {
    if (rc.format !== "mj-proof-receipt/1" && rc.format !== "mj-proof-receipt/2") return { ok: false, reason: "unknown format" };
    let prev = "0".repeat(64);
    for (const e of rc.events) {
      if (e.prev !== prev) return { ok: false, reason: `chain broken at seq ${e.seq}` };
      const { hash, ...body } = e;
      const expect = await sha256hex(canon(body));
      if (expect !== hash) return { ok: false, reason: `hash mismatch at seq ${e.seq}` };
      prev = hash;
    }
    const seal2 = await hmacHex(prev, VERIFY_SECRET);
    if (seal2 !== rc.seal) return { ok: false, reason: "seal mismatch" };
    if (rc.format === "mj-proof-receipt/2" && rc.signature) {
      if (!rc.issuer?.publicKeyHex) return { ok: false, reason: "receipt is signed but carries no issuer public key" };
      const ok = await verifyIssuerSignature(prev, rc.signature, rc.issuer.publicKeyHex);
      if (!ok) return { ok: false, reason: `issuer signature verification FAILED for chain head ${prev}` };
    }
    return { ok: true, events: rc.events.length };
  }
  function receiptToJsonl(rc) {
    const head = { receipt: rc.header, format: rc.format, seal: rc.seal };
    if (rc.issuer !== void 0) head.issuer = rc.issuer;
    if (rc.signature !== void 0) head.signature = rc.signature;
    if (rc.signatureNote !== void 0) head.signatureNote = rc.signatureNote;
    const lines = [JSON.stringify(head), ...rc.events.map((e) => JSON.stringify(e))];
    return `${lines.join("\n")}
`;
  }
  function receiptFromJsonl(text) {
    try {
      const lines = text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      if (lines.length < 1) return null;
      const head = lines[0];
      if (!head.receipt || !head.seal) return null;
      const out = {
        format: head.format ?? "mj-proof-receipt/1",
        header: head.receipt,
        events: lines.slice(1),
        seal: head.seal
      };
      if (head.issuer !== void 0) out.issuer = head.issuer;
      if (head.signature !== void 0) out.signature = head.signature;
      if (head.signatureNote !== void 0) out.signatureNote = head.signatureNote;
      return out;
    } catch {
      return null;
    }
  }

  // ../MJ-Desktop/src/mission/egress.ts
  var LS_KEY = "mj.egress.ledger";
  function egressCanonical(r) {
    return JSON.stringify([r.id, r.at, r.principal, r.item.kind, r.item.name, r.item.sha256, r.recipient, r.envelopeId]);
  }
  function loadEgressLedger() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) return p;
      }
    } catch {
    }
    return [];
  }
  function saveEgressLedger(records) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(records));
    } catch {
    }
  }
  async function requestEgress(args) {
    const { envelope, item, recipient, now } = args;
    if (!envelope) return { record: null, reason: "refused \u2014 no authority envelope; nothing leaves this machine without a human's signed authority" };
    if (!isHumanPrincipal(envelope.principal)) return { record: null, reason: `refused \u2014 principal "${envelope.principal}" is not human; only a human may authorize data to leave` };
    const scopeCheck = checkEnvelope(envelope, "egress:share", now);
    if (!scopeCheck.ok) return { record: null, reason: `refused \u2014 ${scopeCheck.reason}` };
    if (!envelope.scope.includes("egress:share")) return { record: null, reason: "refused \u2014 the envelope's scope does not permit egress:share" };
    const id = `egress-${now.toString(36)}-${loadEgressLedger().length + 1}`;
    const base = {
      id,
      at: new Date(now).toISOString(),
      principal: envelope.principal,
      item,
      recipient,
      envelopeId: envelope.id
    };
    const digest = await sha256Hex(egressCanonical(base));
    const record = { ...base, digest };
    saveEgressLedger([...loadEgressLedger(), record]);
    return { record, reason: "authorized \u2014 receipt recorded" };
  }
  async function verifyEgressLedger(records) {
    const bad = [];
    for (const r of records) {
      const { digest, ...rest } = r;
      const recomputed = await sha256Hex(egressCanonical(rest));
      if (recomputed !== digest) bad.push(r.id);
    }
    return { ok: bad.length === 0, bad };
  }

  // ../MJ-Desktop/src/mission/riskPolicy.ts
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
  function policyTable(autonomy, approvalThreshold) {
    const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    return order.map((risk) => ({
      risk,
      behaviour: requiresHuman(risk, approvalThreshold, autonomy) ? "Human approval required" : risk === "LOW" ? "Autonomous" : "Policy validation, then autonomous",
      examples: RISK_RULES.filter((r) => r.risk === risk).slice(0, 3).map((r) => r.why)
    }));
  }
  return __toCommonJS(mjcore_entry_exports);
})();
