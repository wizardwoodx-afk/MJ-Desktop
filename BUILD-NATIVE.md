# BUILD MJ NATIVE — the exact steps

MJ is a **Tauri v2 desktop application**. It is not a website and it does not need a server.

If you have seen it at `http://localhost:5173`, that was the **development preview**, which is the
only way anyone can show you the UI from inside a sandbox. The artifact you ship is produced by
`npm run tauri:build` and is a real installer:

| Platform | Output |
|---|---|
| Windows | `src-tauri/target/release/bundle/nsis/MJ_8.0.0_x64-setup.exe` |
| macOS | `src-tauri/target/release/bundle/macos/MJ.app` + `.dmg` |
| Linux | `src-tauri/target/release/bundle/appimage/MJ_8.0.0_amd64.AppImage` + `.deb` |

Double-click the installer. There is no port, no `npm run dev`, no browser.

---

## 0. Why this file exists

**The Linux Tauri binary cannot be compiled in the sandbox this package was built in, and it would
be the wrong artifact anyway.** Measured, not assumed:

```
$ pkg-config --exists webkit2gtk-4.1   -> MISSING
$ pkg-config --exists gtk+-3.0         -> MISSING
$ pkg-config --exists libsoup-3.0      -> MISSING
$ pkg-config --exists glib-2.0         -> PRESENT 2.84.4
$ apt-get install libwebkit2gtk-4.1-dev
E: Could not open lock file /var/lib/dpkg/lock-frontend - Permission denied
E: ... are you root?          (uid 1000)
```

So `cargo check` on the full crate has **never been run against real dependencies**. Everything in
`src-tauri/src/` is parse-checked only, except `control_mcp.rs` and `mcp.rs`, which were compiled and
unit-tested against real `serde_json` (6 tests passing).

The second reason matters more: **Tauri does not cross-compile.** A Linux binary is useless on
Windows or macOS. The build has to happen on the machine you want to run it on. This file is the
whole job.

---

## 1. Install the toolchain

### Windows

```powershell
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools   # select "Desktop development with C++"
winget install Microsoft.EdgeWebView2.Runtime           # preinstalled on Windows 11
```

Then restart the terminal so `rustc` is on `PATH`.

### macOS

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Linux (Debian / Ubuntu)

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Verify on any platform:

```bash
rustc --version    # 1.80 or newer (Cargo.toml pins rust-version = "1.80")
node --version     # 18 or newer
```

---

## 2. Build

```bash
cd mj6
npm ci                 # NOT npm install — the lockfile is the tested set
npm run tauri:build    # = tauri build; runs `tsc --noEmit && vite build` first
```

First run downloads and compiles ~450 crates and takes 5–15 minutes. After that it is incremental.

**Run `cargo check` first if you want the fast failure:**

```bash
cd src-tauri
cargo check 2>&1 | tee /tmp/cargo-check.log
```

If it fails, fix it in place. The changes waiting on this check are listed in `LOCAL-WORKLIST.md`
§1 and §1b — do not revert them, because the V5 behaviour each one replaces is broken.

---

## 3. What was verified before packaging, and what was not

Verified in the sandbox, with the command that verified it:

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `vite build` (the exact `beforeBuildCommand`) | ok — this is what gets bundled into the app |
| Bundle icons | **all 7 generated and validated**: `32x32.png`, `128x128.png`, `128x128@2x.png`, `512x512.png`, `icon.png` (1024² RGBA), `icon.ico` (16–256 multi-res), `icon.icns` (7 sizes). The macOS and Linux bundles would previously have **failed** — `icon.icns` did not exist. |
| `tauri.conf.json` | valid JSON, `frontendDist: ../dist`, `identifier: com.mj.desktop`, all 4 bundle targets |
| Frontend has no dev-server dependency | `grep -rn "localhost\|5173\|import.meta.env.DEV" src/` → **only a comment**; the app branches on `detectHost()` and routes to IPC under Tauri |
| `control_mcp.rs` + `mcp.rs` | `cargo test` → all passing against real `serde_json` |
| Mission/verification suites | all passing |

**Not** verified, because it needs your machine:

- `cargo check` / `cargo build` on the full Tauri crate (needs webkit2gtk + friends).
- `tauri build` producing an actual installer.
- Anything that spawns a real process: `cli_invoke`, `cli_env`, `shell_exec`, the MCP stdio servers,
  Hermes, the OS keychain.
- Window decorations, tray icon, autostart.

`devUrl: http://localhost:5173` appears in the config because that is how `tauri dev` works — it is
**not** used by `tauri build`, and it is not in the shipped app.

---

## 4. First launch, once installed

1. MJ opens on a real workflow (Code → Test → Review, 5 nodes, 5 wires) rather than an empty grid.
2. Open **Settings → Agent harnesses** and add provider keys. They go to the OS keychain. If the
   keychain is unavailable the UI now says **"in memory only"** instead of implying it was saved.
3. Install a coding CLI if you want real execution: `npm i -g @anthropic-ai/claude-code`, or
   `codex`, or `opencode`. **Without one, agent nodes fail. They do not fake a result.**
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
