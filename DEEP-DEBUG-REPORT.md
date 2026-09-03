# Deep debug pass — MJ 11.8.4

Method: cloned fresh, booted the app for real (jsdom + `react-dom/client`, not SSR — so effects,
the async bootstrap and the lazy pages all execute), walked every page, then audited the type
surface by **removing casts and letting `tsc` report what they were hiding**.

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

## Fixed 2 — my own 11.8.4 fix was incomplete

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

## Reported, not fixed

### 3. 72 of 85 `tauriInvoke` calls pass no type parameter → `unknown`

```
tauriInvoke(  72   // T inferred as unknown
tauriInvoke<  13   // explicitly typed
```

The Rust↔TypeScript contract is therefore mostly unchecked. A Rust command changing its return shape
would compile clean and fail at runtime. Combined with the `as never` habit, this is the largest
remaining hole in the tree.

### 4. `ipc.workflowGet` returns `unknown`

```ts
workflowGet: async (workflowId: string) => {
  if (useTauri()) return tauriInvoke("workflow_get", { workflowId });  // Promise<unknown>
```

So `store.loadWorkflow(wf as never)` in `App.tsx:193,204` is hiding an `unknown`, not a
near-miss. `sanitizeGraph` is defensive enough that runtime survives, but the graph shape reaching
the store is never checked. One-line fix: `tauriInvoke<WorkflowRecord>(...)`.

### 5. `mcpServerSave` doesn't require the `name` its storage layer requires

```ts
mcpServerSave(cfg: Record<string, unknown>)      // public
mcpSave(cfg: Partial<McpServerEntry> & { name: string })  // storage — name REQUIRED
```

`as never` bridges them. Current callers (`McpPage.tsx:41`) do pass `name`, and the Tauri path
doesn't validate either — so **no live bug today**, but a future caller can persist a nameless MCP
server and TypeScript will not object.

---

## Verified, not assumed

| Claim | How | Result |
|---|---|---|
| The app boots and every page renders | jsdom mount + page walk | 12/12, 0 errors |
| "No fake success" is enforced, not just documented | read `acceptance.test.ts:297` | **pinned** — the probe throws if a simulated run claims verified completion |
| The 23 `as never` hid nothing real | removed them, ran `tsc` | genuine type error, now fixed |
| Nothing regressed after the fixes | `tsc` 0 · `npm test` 40/40 · `vite build` 0 · `verify/run.mjs` 39/39 | all green |

## Suggested next steps, in order

1. Type the remaining 72 `tauriInvoke` calls (`workflowGet` first) and delete the three surviving
   `as never` in `App.tsx` and `client.ts`.
2. Add a lint rule banning `as never` — it is a stronger `any`, and it is what let #1 hide.
3. Add a probe that mounts the app in jsdom and asserts every page renders error-free. The 11.8.1
   regression would have been caught by exactly this, and nothing currently covers it.
