# Building FLAMO as a native desktop app

Tauri v2. The frontend has **no build step and no npm dependency** — the shell
loads it directly (`frontendDist: "../"`), and `withGlobalTauri: true` exposes
`window.__TAURI__` so `flamo-ipc.js` can call commands without a bundler.

## 1. Prerequisites

**Rust** (1.80+):

```
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

**Linux system libraries** (Debian/Ubuntu):

```
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

macOS: `xcode-select --install`. Windows: VS Build Tools + WebView2 (preinstalled
on Windows 11).

## 2. Icons (required before the first build)

`src-tauri/icons/` is empty in this archive. Generate them from any 1024×1024 PNG:

```
cd src-tauri
cargo install tauri-cli --version "^2"
cargo tauri icon /path/to/flamo-1024.png
```

That writes `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns` and
`icon.ico` — exactly the five paths `tauri.conf.json` lists.

## 3. Run and build

```
cd src-tauri
cargo tauri dev        # native window, live reload from http://localhost:5174
cargo tauri build      # installers: .deb/.AppImage (Linux), .dmg (macOS), .msi/.exe (Windows)
```

Artifacts land in `src-tauri/target/release/bundle/`.

## 4. What the shell provides in v0.1

| Command | Does |
|---|---|
| `app_info` | name, version, `native: true`, cycle name |
| `ledger_load` | reads `vouch-ledger.json` from the app data dir |
| `ledger_save` | writes it, pretty-printed |
| `secret_status` | **reports that no credential store is wired** — MJ's OS-keychain secrets arrive at merge step 4 |

Plus: tray icon with Show/Quit, window-state persistence, autostart
(`LaunchAgent` on macOS), and single-instance focus.

## 5. Verified and not verified

**Verified in the build sandbox:** every JS file passes `node --check`; both
JSON configs parse; all seven frontend assets serve; all eight `@keyframes`
names are defined *and* referenced; no non-ASCII lookalike characters in any
identifier; `lib.rs` braces and parens balanced.

**Not verified — stated plainly:** `cargo check` / `cargo tauri build` could not
run in the sandbox. Its package mirror (`deb.debian.org`) and `sh.rustup.rs` are
both unreachable from it, so there is no Rust toolchain and no `webkit2gtk`. The
Rust here was written against MJ 14.1.3's shipping shell — the same plugin
versions, the same `TrayIconBuilder` / `menu::MenuItem` / `generate_handler!`
APIs, the same `app.path().app_data_dir()` pattern — which is strong evidence,
but it is **not** a compile. Run `cargo tauri dev` and treat that as the gate.

## 6. Known v0.1 limits

- No credential store (see `secret_status`).
- No scheduler — the Routines screen shows declarations and says so.
- Receipts are digests, **unsigned**. Signing comes from MJ's `signing.ts`.
- Native window uses OS decorations; borderless + custom controls is a later pass.
