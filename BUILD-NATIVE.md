# BUILD MJ NATIVE — the exact steps (Windows 11)

MJ is a **Tauri v2 desktop application for Windows 11**. It is not a website and it does not need a server.
macOS/Linux bundles were removed — nobody validates them, so this tree no longer pretends to ship them
(see `.github/workflows/release.yml`: windows-only; `tauri.conf.json` targets: nsis only).

If you have seen it at `http://localhost:5173`, that was the **development preview**, which is the
only way anyone can show you the UI from inside a sandbox. The artifact you ship is produced by
`npm run tauri:build` and is a real installer:

| Platform | Output |
|---|---|
| Windows | `src-tauri/target/release/bundle/nsis/MJ_14.1.1_x64-setup.exe` |

Double-click the installer. There is no port, no `npm run dev`, no browser.

---

## 0. Why this file exists

An older revision of this file said the Tauri crate had never been compiled against real
dependencies. That is no longer true: the full crate compiles and the whole Rust suite passes
on Windows 11 (`cargo test`: 29 unit + 11 integration, 0 failed). The updater plugin init that
killed every desktop launch (exit 101 before setup — no window, no log) has been removed;
updates are "download the new zip and reinstall". This file is the whole job.

---

## 1. Install the toolchain (Windows 11)

```powershell
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools   # select "Desktop development with C++"
winget install Microsoft.EdgeWebView2.Runtime           # preinstalled on Windows 11
```

Then restart the terminal so `rustc` is on `PATH`.

Verify:

```powershell
rustc --version    # 1.80 or newer (Cargo.toml pins rust-version = "1.80")
node --version     # 20 or newer
```

---

## 2. Build

```powershell
cd mj
npm ci                 # NOT npm install — the lockfile is the tested set
npm run tauri:build    # = tauri build; runs `tsc --noEmit && vite build` first
```

First run downloads and compiles ~450 crates and takes 5–15 minutes. After that it is incremental.

---

## 3. What was verified before packaging, and what was not

Verified on Windows 11, with the command that verified it:

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `vite build` (the exact `beforeBuildCommand`) | ok — this is what gets bundled into the app |
| `cargo test` (full Tauri crate, real deps) | **40 passed, 0 failed** (29 unit + 11 store-integration) |
| `tauri build` → NSIS installer | ok — `MJ_14.1.1_x64-setup.exe`, installs per-user |
| Launch smoke | exe stays alive, main window titled "MJ", SQLite store created |
| Bundle icons | `32x32.png`, `128x128.png`, `128x128@2x.png`, `512x512.png`, `icon.png`, `icon.ico` |
| `tauri.conf.json` | valid JSON, `frontendDist: ../dist`, `identifier: com.mj.desktop`, bundle target nsis |
| Mission/verification suites | 81/81 live, 80/80 offline |

**Not** verified, because it needs your machine and keys:

- Anything that spawns a real process: `cli_invoke`, `cli_env`, `shell_exec`, the MCP stdio servers,
  Hermes, the OS keychain (falls back to in-memory map and says so).
- Signed installers (no signing key configured — local output is unsigned).

`devUrl: http://localhost:5173` appears in the config because that is how `tauri dev` works — it is
**not** used by `tauri build`, and it is not in the shipped app.

---

## 4. First launch, once installed

1. MJ opens on a real workflow (Code → Test → Review, 5 nodes, 5 wires) rather than an empty grid.
2. Open **Settings → Agent harnesses** and add provider keys. They go to the OS keychain. If the
   keychain is unavailable the UI now says **"in memory only"** instead of implying it was saved.
3. Install a coding CLI if you want real execution: `npm i -g @anthropic-ai/claude-code`, or
   `codex`, or `opencode`. **Without one, agent nodes fail rather than reporting fabricated results.**
4. A mission only reaches `COMPLETED` when the target repository's own test suite actually ran and
   passed. Simulated execution can never produce a completion.

---

## 5. If you want `tauri dev` instead

```bash
npm run tauri dev
```

This does use `localhost:5173`, because Vite serves the frontend and Tauri loads it into a native
window with full IPC. It is still a native window, not a browser tab. For anything you intend to
keep, use `tauri:build`.
