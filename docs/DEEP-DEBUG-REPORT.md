# Deep debug pass — MJ 11.9.4

Method: cloned fresh, booted the app for real (jsdom + `react-dom/client`, not SSR — so effects,
the async bootstrap and the lazy pages all execute), walked every page, then audited the type
surface by **removing casts and letting `tsc` report what they were hiding**.

> Historical note: this report was originally written against **11.8.5**. The version is updated
> here because the doc describes the *current* tree, not a past release, and the type-safety
> holes it reported have since been closed (see "Reported — all three now fixed" below) — so the
> earlier heading (11.8.5) mis-stated which code the findings describe.

Result: **the app is healthy.** Two defects found and fixed; three type-safety holes reported.

---

## What "running it" actually shows

Mounted `App.tsx` with the Vite browser aliases applied, then clicked through the rail:

| Page | Rendered | Console errors |
|---|---|---|
| Home | 10,256 B | 0 |
| Canvas | 183,785 B | 0 |
| Missions | 8,846 B | 0 |
| Teams | 30,033 B | 0 |
| MCP | 12,857 B | 0 |
| Browser | 6,924 B | 0 |
| Providers | 19,780 B | 0 |
| Runs | 6,599 B | 0 |
| Observe | 7,071 B | 0 |
| Evolve | 7,473 B | 0 |
| Proof | 27,950 B | 0 |
| Settings | 10,466 B | 0 |

**Zero errors on any page.** The smaller numbers are legitimate empty states (no data in a fresh
localStorage), not failures. Reproduce with a jsdom mount — bundle `src/App.tsx` with the same
aliases, `createRoot`, then dispatch clicks on `button[title="<label>"]` (the rail is icon-only, so
it matches on `title`, not text).

Also clean: **zero** `TODO`/`FIXME`/`HACK`, **zero** empty `catch {}` blocks, **zero** non-null
assertions (`!.`) in `src/`. That is genuinely unusual and worth saying.

---

## Fixed 1 — 23 `as never` casts disabled type checking on the adapter registry

`src/mission/harnessAdapters.ts` declared:

```ts
const PROFILES: Array<Omit<CliHarness, "simulated" | "supports" | "prepare" | "invoke">> = [
  { id: "claude", ... } as never,   // ×23
```

`as never` is assignable to everything, so it silences **all** checking of those entries. Removing
them surfaced 23 errors: *"Property 'policy' is missing."*

The catch: `policy` is a **method** on `CliHarness` (`policy(task) { … }`), not per-profile data. So
the `Omit` list was wrong — it should have excluded `policy` along with the other methods. The
profiles were always correct; the type was lying, and the cast hid the lie.

**Fix:** added `"policy"` to the `Omit` list and deleted all 23 casts. `tsc --noEmit` is clean, so
the compiler now genuinely verifies every profile.

Not a live crash — but it is precisely the 11.7.0 failure shape: a check that looks like it is
checking and isn't. With the casts in place, adding a required field to `CliHarness` would have
compiled with all 23 profiles silently wrong.

## Fixed 2 — my own 11.8.4-era fix was incomplete

The first pass aliased `node:fs`, `fs/promises`, `os` and `path`. It missed two builtins:

- `node:child_process` — `sandbox.ts:202`, `checkRunner.ts:210`, `acp.ts:46`
- `node:readline` — `acp.ts:47`

Both were still being externalised, so the browser build would throw Vite's
*"Module has been externalized for browser compatibility"* — accurate, but it names a bundler detail
instead of the missing capability. Added `child_process.ts` (every spawn/exec throws with a reason;
**never** a fake `{ code: 0 }`, which is how an unrun check becomes a passing check) and
`readline.ts` (an empty stream rather than a throw, because `acp_open` consumes it as a stream and
`acp.ts` already treats a stream that ends without output as a failed session).

---

## Reported — all three now fixed

These were open when this report was written. They are closed in the current 11.9.4 tree
(the typed `MjCommands` registry + `McpServerSaveInput` + typed `workflowGet`):

- **72 of 85 `tauriInvoke` calls inferring `unknown`** — replaced by a single typed command
  registry (`MjCommands` in `src/ipc/client.ts`). The command *name* is now part of the type, so a
  typo, a renamed Rust command or a changed payload is a compile error. 91 registered commands:
  38 precise shapes, 53 typed `Json` (`serde_json::Value` — opaque, and honest about being opaque
  rather than wearing a shape it has not earned).
- **`ipc.workflowGet` returning `unknown`** — now `WorkflowRecord`, which is what the localDb
  branch already returned. Removed the six `store.loadWorkflow(x as never)` casts that depended on it.
- **`mcpServerSave` not requiring `name`** — now `McpServerSaveInput`, which documents the real
  write contract (Rust lifts top-level `command`/`args`/`enabled`/`pinned` into `config`, so the
  flat shape `McpPage` sends is correct and the old type was modelling only the read shape).

**Every `as never` in `src/` is gone.** Removing them surfaced three real defects that the casts
had been hiding:

1. `PersistedMissionState` declared seven collections as `unknown[]`; they are now
   `OrgAgent[]`, `OrgTask[]`, `Artifact[]`, `ApprovalRequest[]`, `NegotiationThread[]`,
   `SupervisorRecommendation[]` and `FlightEvent[]`.
2. `methodFor` was handed a fallback object with no `id` — so `NODE_METHODS[def.id]` could never
   resolve a method for it. The fallback now carries the real `node.definitionId`.
3. `composeAssignment` was handed a `category` it never reads; the parameter is narrowed to
   `Pick<NodeDefinition, "id" | "title" | "description" | "configSchema">`, which is what it uses.

## Was reported, now closed

Items 3–5 below were open when this report was written. They were closed in the same pass that
removed the `as never` casts — see "Reported — all three now fixed" above for the detail. They are
kept here only so the report tells the full story and doesn't look like it lost the trail.

### 3. 72 of 85 `tauriInvoke` calls pass no type parameter → `unknown`

Now closed. `src/ipc/client.ts` declares a typed command registry:

```ts
interface MjCommands { /* ... */ }
async function tauriInvoke<K extends keyof MjCommands>(cmd: K, args?: ...): Promise<MjCommands[K]> {
  return invoke<MjCommands[K]>(cmd, args ?? {});
}
```

The command *name* is part of the type, so a typo, a renamed Rust command or a changed payload is a
compile error — a rename no longer compiles clean and fails at runtime.

### 4. `ipc.workflowGet` returns `unknown`

Now closed. `workflowGet` dispatches through the typed registry (`tauriInvoke("workflow_get", ...)`)
and falls back to the typed `localDb.workflowGet`, so the fetched `WorkflowRecord` shape is checked
rather than carried as `unknown`. The `store.loadWorkflow(wf as never)` casts that depended on the
old return are gone.

### 5. `mcpServerSave` doesn't require the `name` its storage layer requires

Now closed. `mcpServerSave` takes a `McpServerSaveInput` whose shape documents the real write
contract (Rust lifts top-level `command`/`args`/`enabled`/`pinned` into `config`), so a nameless
persist no longer type-checks.

> `as never` audit (11.9.4): the only remaining `as never`-like strings in `src/` are ordinary
> English comments (e.g. "was never executed", "never independently evaluated"); there are **no**
> `as never` type casts left. `tsc --noEmit` confirms the compiler genuinely checks the surface.

---

## Verified, not assumed

| Claim | How | Result |
|---|---|---|
| The app boots and every page renders | jsdom mount + page walk | 12/12, 0 errors |
| "No fake success" is enforced, not just documented | read `acceptance.test.ts:297` | **pinned** — the probe throws if a simulated run claims verified completion |
| The 23 `as never` hid nothing real | removed them, ran `tsc` | genuine type error, now fixed |
| Nothing regressed after the fixes | `tsc` 0 · `npm test` 40/40 · `vite build` 0 · `verify/run.mjs` 39/39 | all green |

## Suggested next steps, in order

1. ~~Type the remaining 72 `tauriInvoke` calls and delete the surviving `as never`~~ — **closed** in
11.9.4 via the typed `MjCommands` registry. Kept here only to acknowledge the follow-up was done.
2. Add a lint rule banning `as never` — it is a stronger `any`, and it was what let #1 hide. Still
   open; a lint enforcement is the belt-and-braces layer over a registry that already makes it a
   compile error to use a bad command name.
3. Add a probe that boots the **full** app in jsdom and asserts every page renders error-free, in
   addition to the single-page `v10Page` render probe. The 11.8.1 regression would have been
   caught by exactly this, and nothing currently walks all twelve pages in one process.
