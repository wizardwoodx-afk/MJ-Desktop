import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectHost, detectPlatform, downloadText, getWindowApi, pickJsonFile, type WindowApi } from "./app/desktop";
import { fmtRemaining, shortId } from "./app/id";
import { resolveShortcut } from "./app/shortcuts";
import { downloadDataUrl, snapshotCanvasToPng } from "./app/snapshot";
import { AssistantPanel } from "./assistant/AssistantPanel";
import { Canvas, iconFor } from "./canvas/Canvas";
import { WORKFLOW_TEMPLATES, loadTemplate } from "./domain/templates";
import type { ExecutionEventRecord, PageKind, WorkflowRecord } from "./domain/types";
import { controlExecution, runWorkflow } from "./engine/scheduler";
import { clipboardHasNodes, copyNodesToClipboard, getEditorPrefs, useGraphStore } from "./graph/store";
import { validateWorkflow } from "./graph/validation";
import { ipc } from "./ipc/client";
import { CommandPalette, type PaletteAction } from "./panels/CommandPalette";
import { ErrorBoundary } from "./panels/ErrorBoundary";
import { Inspector } from "./panels/Inspector";
import { LibraryDrawer } from "./panels/LibraryDrawer";
import { ShortcutsOverlay } from "./panels/ShortcutsOverlay";
import { ToastHost, toast } from "./panels/Toast";
// Routes are lazy-loaded. 11 pages × the mission layer made the app chunk exceed the 500 kB
// Rollup advisory in 11.2; V10.1 already split the framework for the same reason. Splitting at
// the route keeps the shell + canvas (the app's always-open core) fast while every tab's code
// loads only when the tab opens — and the build stays warning-free.
const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const MissionPage = lazy(() => import("./pages/MissionPage").then((m) => ({ default: m.MissionPage })));
const TeamsPage = lazy(() => import("./pages/TeamsPage").then((m) => ({ default: m.TeamsPage })));
const V10Page = lazy(() => import("./pages/V10Page").then((m) => ({ default: m.V10Page })));
const McpHubPage = lazy(() => import("./pages/McpPage").then((m) => ({ default: m.McpHubPage })));
const BrowserPage = lazy(() => import("./pages/BrowserPage").then((m) => ({ default: m.BrowserPage })));
const ProvidersPage = lazy(() => import("./pages/ProvidersPage").then((m) => ({ default: m.ProvidersPage })));
const ExecutionsPage = lazy(() => import("./pages/ExecutionsPage").then((m) => ({ default: m.ExecutionsPage })));
const ObservabilityPage = lazy(() => import("./pages/ObservabilityPage").then((m) => ({ default: m.ObservabilityPage })));
const EvolutionPage = lazy(() => import("./pages/EvolutionPage").then((m) => ({ default: m.EvolutionPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
import { ROLE_PACK_COUNT } from "./domain/rolePacks";
import { FRAMEWORK_COUNT } from "./domain/frameworks";
import { MJ_VERSION_SHORT } from "./version";

interface EventLine {
  ts: string;
  seq?: number;
  kind: string;
  level: string;
  nodeId: string | null;
  executionId?: string;
  data: unknown;
}

let eventSeq = 0;

/**
 * Module-level in-flight guard for the first-run bootstrap.
 *
 * React StrictMode deliberately mounts→unmounts→remounts every component once in dev, so this
 * effect used to run twice and both runs saw an empty workflow list — creating "First workflow"
 * twice (bug 11, V10.1). One shared promise makes the second run a passenger on the first.
 */
let bootstrapOnce: Promise<WorkflowRecord[]> | null = null;

const NAV: Array<{ key: PageKind; icon: string; label: string }> = [
  { key: "home", icon: "home", label: "Home" },
  { key: "workflow", icon: "gitbranch", label: "Canvas" },
  { key: "missions", icon: "crown", label: "Missions" },
  { key: "teams", icon: "users", label: "Teams" },
  { key: "mcp", icon: "plug", label: "MCP" },
  { key: "browser", icon: "globe", label: "Browser" },
  { key: "providers", icon: "terminal", label: "Providers" },
  { key: "executions", icon: "history", label: "Runs" },
  { key: "observability", icon: "activity", label: "Observe" },
  { key: "evolution", icon: "dna", label: "Evolve" },
  { key: "proof", icon: "shield", label: "Proof" },
  { key: "settings", icon: "tool", label: "Settings" },
];

export function App() {
  const store = useGraphStore();
  const [page, setPage] = useState<PageKind>("home");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [events, setEvents] = useState<EventLine[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [runningExecId, setRunningExecId] = useState<string | null>(null);
  const [validationMsg, setValidationMsg] = useState("");
  const [win, setWin] = useState<WindowApi | null>(null);
  const etaRef = useRef({ startedAt: 0, total: 0, done: 0, expectedMs: 0 });
  const [eta, setEta] = useState<{ progress: number; remainingMs: number } | null>(null);
  const consoleBodyRef = useRef<HTMLDivElement>(null);
  const host = detectHost();
  const platform = detectPlatform();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getEditorPrefs().theme);
    void getWindowApi().then(setWin);
  }, []);

  useEffect(() => {
    if (!bootstrapOnce) {
      bootstrapOnce = (async () => {
        try {
          let list = await ipc.workflowList();
          if (list.length === 0) {
            await ipc.workflowCreate("First workflow", "");
            list = await ipc.workflowList();
          }
          return list;
        } catch (e) {
          console.error("bootstrap failed", e);
          return [] as WorkflowRecord[];
        }
      })();
    }
    void bootstrapOnce.then((list) => {
      if (list.length === 0) return;
      setWorkflows(list);
      store.loadWorkflow(list[0]);
      window.__mjActiveWorkflowId = list[0].id;
      setOpenTabs([list[0].id]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshWorkflows = useCallback(async () => {
    try { setWorkflows(await ipc.workflowList()); } catch { /* */ }
  }, []);

  useEffect(() => {
    const onEv = (e: Event) => {
      const payload = (e as CustomEvent<ExecutionEventRecord>).detail;
      const line: EventLine = { ...payload, seq: ++eventSeq, nodeId: payload.nodeId ?? null };
      setEvents((prev) => [...prev.slice(-400), line]);
      useGraphStore.getState().setNodeStatus(line.nodeId ?? "", statusForEventKind(line.kind));
      if (line.nodeId) {
        const m = (window.__mjLastNodeExec ??= {});
        if (!m[line.nodeId] || line.kind === "NODE_SUCCEEDED" || line.kind === "NODE_FAILED") m[line.nodeId] = String(line.executionId ?? "");
      }
      const etaState = etaRef.current;
      if (line.kind === "WORKFLOW_STARTED") {
        const g = useGraphStore.getState().graph;
        etaState.startedAt = Date.now();
        etaState.total = Math.max(1, g.nodes.length);
        etaState.done = 0;
        etaState.expectedMs = etaState.total * 1400 + 800;
        setEta({ progress: 0, remainingMs: etaState.expectedMs });
      } else if (line.kind === "NODE_SUCCEEDED" || line.kind === "NODE_FAILED") {
        etaState.done += 1;
        const elapsed = Date.now() - etaState.startedAt;
        const perNode = etaState.done > 0 ? elapsed / etaState.done : 0;
        const remainingMs = Math.max(etaState.done >= etaState.total ? 0 : 400, Math.round(perNode * (etaState.total - etaState.done)));
        setEta({ progress: Math.min(0.999, etaState.done / etaState.total), remainingMs });
      } else if (line.kind.startsWith("WORKFLOW_")) {
        etaRef.current.startedAt = 0;
        setTimeout(() => {
          for (const n of useGraphStore.getState().graph.nodes) useGraphStore.getState().setNodeStatus(n.id, "idle");
        }, 2200);
      }
    };
    window.addEventListener("mj://event", onEv);
    return () => window.removeEventListener("mj://event", onEv);
  }, []);

  useEffect(() => {
    consoleBodyRef.current?.scrollTo({ top: consoleBodyRef.current.scrollHeight });
  }, [events]);

  useEffect(() => {
    const onAdd = (e: Event) => {
      const defId = (e as CustomEvent).detail as string;
      const cx = -store.graph.viewport.x + 420 + Math.random() * 60;
      const cy = -store.graph.viewport.y + 260 + Math.random() * 80;
      const snap = getEditorPrefs().snap;
      store.addNode(defId, snap > 0 ? Math.round(cx / snap) * snap : Math.round(cx), snap > 0 ? Math.round(cy / snap) * snap : Math.round(cy));
      setPage("workflow");
    };
    window.addEventListener("mj:add-node", onAdd);
    return () => window.removeEventListener("mj:add-node", onAdd);
  }, [store]);

  useEffect(() => {
    if (store.selectedNodeId) setInspectorOpen(true);
  }, [store.selectedNodeId]);

  const openWorkflow = useCallback(async (id: string) => {
    await useGraphStore.getState().save();
    const wf = workflows.find((w) => w.id === id) ?? await ipc.workflowGet(id);
    store.loadWorkflow(wf as never);
    window.__mjActiveWorkflowId = id;
    setOpenTabs((t) => t.includes(id) ? t : [...t, id]);
    setPage("workflow");
  }, [store, workflows]);

  const createWorkflow = useCallback(async (name?: string) => {
    await useGraphStore.getState().save();
    const res = await ipc.workflowCreate(name ?? `Workflow ${workflows.length + 1}`, "");
    await refreshWorkflows();
    const created = await ipc.workflowGet(res.id);
    store.loadWorkflow(created as never);
    window.__mjActiveWorkflowId = res.id;
    setOpenTabs((t) => [...t, res.id]);
    setPage("workflow");
    toast("New workflow");
  }, [refreshWorkflows, store, workflows.length]);

  const handleRun = async () => {
    setPage("workflow");
    const g = useGraphStore.getState().graph;
    const issues = validateWorkflow(g);
    const errors = issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      setValidationMsg(errors[0].message);
      setEvents((prev) => [...prev.slice(-400), { ts: new Date().toISOString(), kind: "VALIDATION_BLOCKED", level: "ERROR", nodeId: errors[0].nodeId ?? null, data: { message: errors[0].message } }]);
      toast(errors[0].message, "err");
      return;
    }
    setValidationMsg("");
    await store.save();
    const execId = await runWorkflow(g);
    setRunningExecId(execId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      const action = resolveShortcut(e, {
        typing,
        hasSelection: store.selectedIds.length > 0 || Boolean(store.selectedNodeId),
        workflowCount: workflows.length,
        clipboardEmpty: !clipboardHasNodes(),
      });
      if (!action) return;
      e.preventDefault();
      switch (action) {
        case "palette": setPaletteOpen(true); break;
        case "save": void store.save().then(() => toast("Saved")); break;
        case "undo": store.undo(); break;
        case "redo": store.redo(); break;
        case "duplicate": {
          const ids = store.selectedIds.length > 0 ? store.selectedIds : store.selectedNodeId ? [store.selectedNodeId] : [];
          const created: string[] = [];
          for (const id of ids) { const nid = store.duplicateNode(id); if (nid) created.push(nid); }
          if (created.length > 0) store.selectMany(created);
          break;
        }
        case "deleteSelection": {
          const ids = store.selectedIds.length > 0 ? store.selectedIds : store.selectedNodeId ? [store.selectedNodeId] : [];
          if (ids.length > 0) store.deleteNodes(ids);
          break;
        }
        case "run": void handleRun(); break;
        case "fitView": window.__mjCanvas?.fitView(); break;
        case "autoLayout": window.__mjCanvas?.autoLayout(); break;
        case "closeOverlays": setPaletteOpen(false); setInspectorOpen(false); setLibraryOpen(false); setShortcutsOpen(false); setMenuOpen(null); break;
        case "showShortcuts": setShortcutsOpen(true); break;
        case "screenshot": {
          const el = document.querySelector<HTMLElement>(".canvas-wrap");
          if (!el) return;
          void snapshotCanvasToPng(el).then((png) => { downloadDataUrl(png, "mj-canvas"); toast("Screenshot saved"); });
          break;
        }
        case "fullscreen": void win?.isFullscreen().then((fs) => win.setFullscreen(!fs)); break;
        case "newWorkflow": void createWorkflow(); break;
        case "openSettings": setPage("settings"); break;
        case "openHome": setPage("home"); break;
        case "toggleSidebar": setRailCollapsed((v) => !v); break;
        case "toggleConsole": setConsoleOpen((v) => !v); break;
        case "zoomIn": window.__mjCanvas?.zoomIn(); break;
        case "zoomOut": window.__mjCanvas?.zoomOut(); break;
        case "nextWorkflow":
        case "prevWorkflow": {
          if (openTabs.length < 2) return;
          const idx = openTabs.indexOf(store.workflowId);
          const next = action === "prevWorkflow"
            ? openTabs[(idx - 1 + openTabs.length) % openTabs.length]
            : openTabs[(idx + 1) % openTabs.length];
          void openWorkflow(next);
          break;
        }
        case "copySelection": copyNodesToClipboard(store.selectedIds.length > 0 ? store.selectedIds : store.selectedNodeId ? [store.selectedNodeId] : []); break;
        case "paste": {
          const created = store.pasteNodes();
          if (created.length > 0) toast(`Pasted ${created.length}`);
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, workflows, win, openTabs, createWorkflow, openWorkflow]);

  const exportActive = async () => {
    if (!store.workflowId) return;
    const pkg = await ipc.packageExport(store.workflowId, true);
    downloadText(`${store.workflowName || "workflow"}.mj.json`, JSON.stringify(pkg, null, 2));
    toast("Exported");
  };

  const importPkg = async () => {
    const pkg = await pickJsonFile();
    if (!pkg) return;
    const res = (await ipc.packageImport(pkg)) as { id: string };
    await refreshWorkflows();
    await openWorkflow(res.id);
    toast("Imported");
  };

  const paletteActions: PaletteAction[] = useMemo(() => [
    { id: "run", label: "Run workflow", hint: "R", run: () => void handleRun() },
    { id: "save", label: "Save workflow", hint: "Ctrl+S", run: () => void store.save() },
    { id: "home", label: "Go home", run: () => setPage("home") },
    { id: "new", label: "New workflow", hint: "Ctrl+N", run: () => void createWorkflow() },
    { id: "undo", label: "Undo", hint: "Ctrl+Z", run: store.undo },
    { id: "redo", label: "Redo", hint: "Ctrl+Shift+Z", run: store.redo },
    { id: "fit", label: "Fit view", hint: "F", run: () => window.__mjCanvas?.fitView() },
    { id: "layout", label: "Auto layout", hint: "Ctrl+Shift+L", run: () => window.__mjCanvas?.autoLayout() },
    { id: "console", label: "Toggle console", run: () => setConsoleOpen((v) => !v) },
    { id: "library", label: "Open node library", run: () => { setPage("workflow"); setLibraryOpen(true); } },
    { id: "assistant", label: "Open assistant", run: () => setAssistantOpen(true) },
    { id: "export", label: "Export package", run: () => void exportActive() },
    { id: "import", label: "Import package", run: () => void importPkg() },
    { id: "settings", label: "Open settings", hint: "Ctrl+,", run: () => setPage("settings") },
    ...WORKFLOW_TEMPLATES.map((t) => ({
      id: `tpl:${t.id}`,
      label: `Template: ${t.name}`,
      hint: t.category,
      run: () => {
        const { instances, wires } = loadTemplate(t.id);
        useGraphStore.getState().insertTemplate(instances, wires);
        setPage("workflow");
        toast(`Loaded ${t.name}`);
      },
    })),
  ], [store, createWorkflow]);

  const menus: Array<{ id: string; label: string; items: Array<{ label: string; hint?: string; run: () => void } | "sep"> }> = [
    {
      id: "file", label: "File", items: [
        { label: "New workflow", hint: "Ctrl+N", run: () => void createWorkflow() },
        { label: "Save", hint: "Ctrl+S", run: () => void store.save() },
        "sep",
        { label: "Export package…", run: () => void exportActive() },
        { label: "Import package…", run: () => void importPkg() },
        "sep",
        { label: "Settings", hint: "Ctrl+,", run: () => setPage("settings") },
      ],
    },
    {
      id: "edit", label: "Edit", items: [
        { label: "Undo", hint: "Ctrl+Z", run: store.undo },
        { label: "Redo", hint: "Ctrl+Shift+Z", run: store.redo },
        "sep",
        { label: "Duplicate", hint: "Ctrl+D", run: () => store.selectedNodeId && store.duplicateNode(store.selectedNodeId) },
        { label: "Delete", hint: "Del", run: () => store.selectedIds.length && store.deleteNodes(store.selectedIds) },
        { label: "Auto layout", hint: "Ctrl+Shift+L", run: () => window.__mjCanvas?.autoLayout() },
      ],
    },
    {
      id: "view", label: "View", items: [
        { label: "Home", run: () => setPage("home") },
        { label: "Canvas", run: () => setPage("workflow") },
        { label: "Toggle sidebar", hint: "Ctrl+B", run: () => setRailCollapsed((v) => !v) },
        { label: "Toggle console", hint: "Ctrl+`", run: () => setConsoleOpen((v) => !v) },
        { label: "Command palette", hint: "Ctrl+K", run: () => setPaletteOpen(true) },
        { label: "Fullscreen", hint: "F11", run: () => void win?.isFullscreen().then((fs) => win.setFullscreen(!fs)) },
      ],
    },
    {
      id: "run", label: "Run", items: [
        { label: "Run workflow", hint: "R", run: () => void handleRun() },
        { label: "Pause", run: () => runningExecId && controlExecution(runningExecId, "pause") },
        { label: "Resume", run: () => runningExecId && controlExecution(runningExecId, "resume") },
        { label: "Cancel", run: () => runningExecId && controlExecution(runningExecId, "cancel") },
      ],
    },
    {
      id: "help", label: "Help", items: [
        { label: "Keyboard shortcuts", hint: "?", run: () => setShortcutsOpen(true) },
        { label: "Open assistant", run: () => setAssistantOpen(true) },
      ],
    },
  ];

  return (
    <div className={`app ${railCollapsed ? "rail-collapsed" : ""}`}>
      <header className="titlebar">
        {platform === "mac" && (
          <div className="traffic">
            <span className="c" onClick={() => void win?.close()} />
            <span className="m" onClick={() => void win?.minimize()} />
            <span className="x" onClick={() => void win?.toggleMaximize()} />
          </div>
        )}
        <span className="logo">MJ<i>.</i></span>
        <span className="host-pill">{host === "tauri" ? "native tauri" : "webview host"} · v{MJ_VERSION_SHORT} · {ROLE_PACK_COUNT} agents · {FRAMEWORK_COUNT} frameworks</span>
        {runningExecId && eta && (
          <div className="eta-module">
            <div className="eta-segments">
              {Array.from({ length: 18 }, (_, i) => (
                <span key={i} className={`eta-seg ${i / 18 < eta.progress ? "on" : ""} ${i / 18 < eta.progress + 0.08 && i / 18 >= eta.progress ? "hot" : ""}`} />
              ))}
            </div>
            <span className="eta-readout">{fmtRemaining(eta.remainingMs)}</span>
          </div>
        )}
        <div className="drag" onDoubleClick={() => void win?.toggleMaximize()} />
        {runningExecId && (
          <>
            <button onClick={() => controlExecution(runningExecId, "pause")}>Pause</button>
            <button onClick={() => controlExecution(runningExecId, "resume")}>Resume</button>
            <button className="danger" onClick={() => controlExecution(runningExecId, "cancel")}>Cancel</button>
          </>
        )}
        <button className="primary" onClick={() => void handleRun()}>▶ Run</button>
        {platform !== "mac" && (
          <div className="win-btns">
            <button onClick={() => void win?.minimize()}>—</button>
            <button onClick={() => void win?.toggleMaximize()}>□</button>
            <button className="close" onClick={() => void win?.close()}>✕</button>
          </div>
        )}
      </header>

      <nav className="menubar">
        {menus.map((m) => (
          <div key={m.id} style={{ position: "relative" }}>
            <button className={`menu-item ${menuOpen === m.id ? "open" : ""}`} onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)} onMouseEnter={() => menuOpen && setMenuOpen(m.id)}>
              {m.label}
            </button>
            {menuOpen === m.id && (
              <div className="menu-fly" onMouseLeave={() => setMenuOpen(null)}>
                {m.items.map((it, i) => it === "sep" ? <div key={i} className="sep" /> : (
                  <button key={it.label} onClick={() => { it.run(); setMenuOpen(null); }}>
                    {it.label}{it.hint && <span className="hint">{it.hint}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="tabstrip">
        <button className={`tab ${page === "home" ? "active" : ""}`} onClick={() => setPage("home")}>Home</button>
        {openTabs.map((id) => {
          const w = workflows.find((x) => x.id === id);
          const active = page === "workflow" && store.workflowId === id;
          return (
            <button key={id} className={`tab ${active ? "active" : ""}`} onClick={() => void openWorkflow(id)}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{w?.name ?? store.workflowName ?? "Workflow"}</span>
              {store.workflowId === id && store.dirty && <span style={{ color: "var(--red)" }}>●</span>}
              <span className="x" onClick={(e) => { e.stopPropagation(); setOpenTabs((t) => t.filter((x) => x !== id)); }}>✕</span>
            </button>
          );
        })}
        <button className="add ghost" onClick={() => void createWorkflow()}>+</button>
      </div>

      <aside className="rail">
        {NAV.map((n) => (
          <button key={n.key} className={page === n.key ? "active" : ""} title={n.label} onClick={() => setPage(n.key)}>
            {iconFor(n.icon)}
          </button>
        ))}
        <div className="spacer" />
        <button title="Assistant" onClick={() => setAssistantOpen(true)}>{iconFor("spark")}</button>
      </aside>

      <main className="main">
        {/* V11.4 — keying the stage on the page re-mounts it on every view switch, which
            replays the 180ms mj-view-in fade (see mj.css). Pages already mount lazily, so
            this adds the transition without changing what loads. */}
        <div className="stage" key={page}>
          <Suspense fallback={<div className="stage-fallback" style={{ color: "var(--text-mute, #6b6b6b)", fontFamily: "var(--font-mono, monospace)", fontSize: 12, letterSpacing: "0.08em", padding: 48 }}>LOADING — MJ</div>}>
          {page === "home" && (
            <HomePage workflows={workflows} onOpen={(id) => void openWorkflow(id)} onCreated={() => { void refreshWorkflows(); setPage("workflow"); }} />
          )}
          {page === "workflow" && (
            <>
              <ErrorBoundary label="canvas">
                <Canvas onOpenLibrary={() => setLibraryOpen(true)} />
              </ErrorBoundary>
              <LibraryDrawer open={libraryOpen} onClose={() => setLibraryOpen(false)} />
              <div className={`event-console ${consoleOpen ? "" : "collapsed"}`}>
                <div className="console-head" onClick={() => setConsoleOpen(!consoleOpen)}>
                  <span>{consoleOpen ? "▾" : "▸"} LIVE EVENTS</span>
                  <span className="muted">{events.length > 0 ? `${events.length} events` : "quiet"}{validationMsg ? ` · ${validationMsg}` : ""}</span>
                  <span style={{ flex: 1 }} />
                  {!assistantOpen && <button style={{ fontSize: 11, padding: "2px 9px" }} onClick={(e) => { e.stopPropagation(); setAssistantOpen(true); }}>Assistant</button>}
                </div>
                {consoleOpen && (
                  <div className="console-body" ref={consoleBodyRef}>
                    {events.map((e, i) => (
                      <div className="ev-line" key={e.seq ?? i}>
                        <span className="ev-ts">{new Date(e.ts).toLocaleTimeString()}</span>
                        <span className={`ev-kind ${e.level}`}>{e.kind}</span>
                        <span className="ev-node">{e.nodeId ? shortId(e.nodeId) : ""}</span>
                        <span className="ev-data">{compactData(e.data)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {inspectorOpen && store.selectedNodeId && <Inspector onClose={() => setInspectorOpen(false)} />}
              <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
            </>
          )}
          {page === "missions" && <ErrorBoundary label="missions"><MissionPage /></ErrorBoundary>}
          {page === "teams" && <ErrorBoundary label="teams"><TeamsPage onOpened={() => setPage("workflow")} /></ErrorBoundary>}
          {page === "proof" && <ErrorBoundary label="proof"><V10Page /></ErrorBoundary>}
          {page === "mcp" && <ErrorBoundary label="MCP"><McpHubPage /></ErrorBoundary>}
          {page === "browser" && <ErrorBoundary label="browser"><BrowserPage /></ErrorBoundary>}
          {page === "providers" && <ErrorBoundary label="providers"><ProvidersPage /></ErrorBoundary>}
          {page === "executions" && <ErrorBoundary label="executions"><ExecutionsPage /></ErrorBoundary>}
          {page === "observability" && <ErrorBoundary label="observability"><ObservabilityPage /></ErrorBoundary>}
          {page === "evolution" && <ErrorBoundary label="evolution"><EvolutionPage /></ErrorBoundary>}
          {page === "settings" && <ErrorBoundary label="settings"><SettingsPage /></ErrorBoundary>}
          </Suspense>
        </div>
      </main>

      <footer className="statusbar">
        <span>{store.dirty ? "unsaved" : store.lastSavedAt ? `saved ${new Date(store.lastSavedAt).toLocaleTimeString()}` : "ready"}</span>
        <span>{store.graph.nodes.length} nodes · {store.graph.connections.length} wires</span>
        <span className="live">{host === "tauri" ? "native · stdio" : "webview host"}</span>
        {validationMsg && <span className="err">{validationMsg}</span>}
        <span className="push">Ctrl+K palette{store.selectedNodeId ? " · del removes" : ""}</span>
      </footer>

      {paletteOpen && <CommandPalette actions={paletteActions} onClose={() => setPaletteOpen(false)} />}
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
      <ToastHost />
    </div>
  );
}

function statusForEventKind(kind: string): string {
  switch (kind) {
    case "NODE_QUEUED": return "queued";
    case "NODE_STARTED": return "running";
    case "NODE_WAITING": return "waiting";
    case "NODE_STREAMING": return "streaming";
    case "NODE_SUCCEEDED": return "succeeded";
    case "NODE_FAILED": return "failed";
    default: return "";
  }
}

function compactData(data: unknown): string {
  if (data == null || typeof data !== "object") return String(data ?? "");
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return "";
  return entries.slice(0, 3).map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60)}`).join(" ");
}
