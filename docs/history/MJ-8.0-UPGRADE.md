# MJ 8.0 — THE DESKTOP RELEASE

**Two asks drove this release:** make it a real Tauri desktop app rather than something you view in a
browser, and fix the nodes.

Both are addressed below, with the measurement behind each claim and an explicit statement of what
could not be verified from inside the sandbox.

---

## 1. The nodes were there. The canvas was empty.

The library holds **311 node definitions** — measured at runtime by importing the module, not by
counting source lines:

```
256  agent.pack.*      role packs
 12  agent.preset.*    presets
 21  agent.*           planner, researcher, coder, tester, reviewer, security, …
 13  control.*         start, end, condition, switch, loop, parallel, approval, …
  9  cap.*             transform, http, filesystem, terminal, json, webhook, cron, vector, browser
---
311  TOTAL  (map size 311)
```

Across 23 industry groups: core 33, engineering 20, common 20, security 15, finance 15, legal 12,
healthcare 12, data 12, then product, sales, marketing, hr, ops, manufacturing, energy, gov,
education, media, logistics, insurance, realestate, research, climate at 10 each.

**A correction to something I said earlier:** I reported "43 base nodes" in the previous turn. That
number came from a regex that only matched `[a-z0-9.]`, so it silently dropped every hyphenated id —
which is all 256 role packs and all 12 presets. The real figure is 311, and it always was.

So why did it look empty? Measured on a fresh store:

```
nodes on boot: 0
connections:   0
```

The app launched onto a blank grid. Every node was one click away behind a button labelled LIBRARY,
but nothing was on screen, so it read as broken. **V8 fix (bug Z):** the first launch now loads a
real, fully-wired workflow — Code → Test → Review, 5 nodes, 5 wires — and fits it to view. It fires
only when the canvas is genuinely empty and only once, so deleting everything on purpose still gives
you an empty canvas.

`probe/firstrun.test.ts` covers it, 23 assertions: that a fresh app really does boot empty, that all
5 nodes land, that **all 5 wires resolve to nodes and ports that exist**, that no wire points at
itself, and that nothing was skipped.

Two things that looked like bugs and were not, recorded so they are not "fixed" later:

- Template wires carry **template keys** (`"s"`, `"c"`, `"t"`), not node ids. `insertTemplate` maps
  keys → instances and matches ports case-insensitively by id *or* label. My first probe read them as
  node ids and reported "5 broken wires". The code was right; the probe was wrong.
- `insertTemplate` is additive by design. Calling it twice gives 10 nodes. Duplicate avoidance is the
  caller's responsibility.

---

## 2. Tauri native: what is true, and the one thing I cannot do here

**MJ is already a Tauri v2 desktop app.** `tauri.conf.json` has `identifier: com.mj.desktop`, all four
bundle targets (`nsis`, `dmg`, `appimage`, `deb`), and `frontendDist: ../dist`. The frontend has **no
dev-server dependency** — `grep -rn "localhost\|5173\|import.meta.env.DEV" src/` returns a single
comment. Under Tauri it branches on `detectHost()` and routes every call through IPC.

Seeing it at `localhost:5173` was the **development preview**, which is the only way to show a UI from
inside a sandbox. `devUrl` exists because `tauri dev` works that way. It is not in the shipped app.

### The build genuinely cannot happen in this sandbox

Measured, not assumed:

```
pkg-config --exists webkit2gtk-4.1   -> MISSING
pkg-config --exists gtk+-3.0         -> MISSING
pkg-config --exists libsoup-3.0      -> MISSING
pkg-config --exists glib-2.0         -> PRESENT 2.84.4
apt-get install libwebkit2gtk-4.1-dev
  E: Could not open lock file /var/lib/dpkg/lock-frontend - Permission denied
  E: ... are you root?     (id -u -> 1000)
```

And even with those libraries, **Tauri does not cross-compile** — a Linux binary is useless on Windows
or macOS. The build has to run on the machine that will run the app. **`BUILD-NATIVE.md` is the whole
job**: per-OS toolchain installs, the exact commands, what each output file is called, and what to do
if `cargo check` complains.

### A real bug this uncovered: the macOS and Linux builds would have failed

```
icons/icon.png   ok          (but 1254×1254 RGB — Tauri wants square RGBA)
icons/icon.ico   ok
icons/icon.icns  MISSING     <- required by the "dmg" target
icons/32x32.png  MISSING     <- conventional for appimage/deb
icons/128x128.png MISSING
```

`bundle.targets` lists `dmg`, `appimage` and `deb`, and none of the icons those targets need existed.
All seven are now generated and validated: `32x32.png`, `128x128.png`, `128x128@2x.png`,
`512x512.png`, `icon.png` (1024² RGBA), `icon.ico` (16–256 multi-resolution), `icon.icns` (7 sizes,
535,852 bytes, `file` reports `Mac OS X icon`). `bundle.icon` lists all seven.

Versions bumped to 8.0.0 in `package.json`, `src-tauri/Cargo.toml` and `tauri.conf.json`.

---

## 3. Carried forward from earlier in V8

**Bug X — wires did not connect to the port.** A hard-coded model of the card
(`top = 86 + i*19 + 10`) assumed a fixed header and no optional content. In reality `purpose-preview`
grows from 15px to 36px when the text wraps, and `stream-preview` (up to ~50px) appears only while the
node runs — both above the port grid. Wires drifted ~10px at rest, ~31px on a wrapped description,
~81px while streaming. Replaced with real DOM measurement (`src/canvas/ports.ts`) using the
`offsetLeft/offsetTop` chain, which is transform-independent so zoom is not applied twice, plus a
`ResizeObserver` so the wire follows the port when a card changes height mid-run.

**Bug Y — the wheel panned instead of zooming.** `if (ctrlKey || metaKey) zoom else pan` — inverted
from every node editor. Plain wheel now zooms, anchored at the cursor, with `deltaMode` normalised
(Firefox reports lines, Chrome pixels; without this Firefox zooms 16× faster). Shift+wheel pans
horizontally. Also registered a non-passive `wheel` listener, because React attaches `onWheel`
passively and `preventDefault()` inside it is ignored.

**Nothing OS theme.** Monochrome, typographic, industrial — Space Grotesk for content, Space Mono ALL
CAPS for labels, Doto for the single hero moment. Red `#D71921` is a signal, never decoration. No
shadows, no blur, no gradients, no radius above 8px, no spring easing. Both `nothing` (OLED) and
`nothing-light` (printed manual) ship, with the ROX skins retained. Fonts are **self-hosted** — the
CSP sets `font-src 'self' data:`, so a Google Fonts link would have been blocked in the packaged app
and you would have seen fallbacks forever. A one-time `mj.theme.v8` migration handles anyone whose
localStorage already said `void`.

---

## 4. Verification

```
tsc --noEmit                0 errors
vite build                  ok  (this is the exact beforeBuildCommand)

probe/acceptance.test.ts     26 passed, 0 failed
probe/harnessPolicy.test.ts  62 passed, 0 failed
probe/checkRunner.test.ts    34 passed, 0 failed
probe/realExecution.test.ts  16 passed, 0 failed   (real pytest, real cargo, no fakes injected)
probe/engine.test.ts         41 passed, 0 failed
probe/canvasGeometry.test.ts 49 passed, 0 failed
probe/firstrun.test.ts       23 passed, 0 failed
probe/wiring.test.ts         all template and framework wires kept, 0 dropped
cargo test (control_mcp)      6 passed, 0 failed
```

Nine suites, no scratch files left in `probe/`.

---

## 5. What is still not true

- **`cargo check` has never run on the full Tauri crate.** Parse-checked only, except `control_mcp.rs`
  and `mcp.rs` which compile and pass 6 tests against real `serde_json`. Run it — `BUILD-NATIVE.md` §2.
- **No installer has ever been produced.** The bundle config and icons are now correct as far as can be
  determined without building, but nothing has come out the other end.
- **No mission has ever run against a real coding CLI.** The worker side of all 26 acceptance criteria
  uses the `local-test` double. The verification half is genuinely real — pytest and cargo really ran.
- **The port-anchor fix is verified by unit-testing the measurement math**, not in a real browser.
  jsdom has no layout engine, so it cannot confirm it. Look at the canvas and say whether any wire
  still sits off its dot.
- **The 62 harnessPolicy fixtures are shaped from documentation**, not captured runs.
- Process-spawning paths are untested here: `cli_invoke`, `cli_env`, `shell_exec`, MCP stdio servers,
  Hermes, the OS keychain, tray icon, autostart, window decorations.
