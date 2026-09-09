# Install MJ 13.5.1 on your laptop (Windows 11) — the only supported install

This zip is **native desktop source**, not a website. MJ is a **Tauri v2** app: the UI is React,
the engine is Rust, and everything real (SQLite, the keyring, agent processes, sandboxes) happens
in the native shell. There is no hosted version and no `localhost` install — you compile it once
on this laptop and run the installer it produces.

---

## 1. Install the tools (one time, ~15 minutes)

| Tool | How | Check |
|---|---|---|
| **Node.js 20+** | https://nodejs.org → LTS installer | `node --version` → v20 or newer |
| **Rust** | https://rustup.rs → run `rustup-init.exe` (accept defaults) | `rustc --version` → 1.80+ |
| **MSVC Build Tools** | Visual Studio Installer → "Desktop development with C++" workload (rustup will prompt for this) | `cl` exists in a VS dev prompt |
| **WebView2** | Preinstalled on Windows 11 — nothing to do | — |

Windows 11 is the only supported OS for this tree (CI builds and smoke-tests
Windows only; the bundle target is nsis).

## 2. Unzip and verify

```bat
cd mj
npm ci
.\node_modules\.bin\tsc --noEmit
```

Both must exit silently. Then run the proof suite (250+ executable assertions — this is how you
know the source you received is the source that was tested):

```bat
for %f in (versionDrift acceptance harnessPolicy checkRunner engine replayEvals theme assist acp agentsMd otelExport controlPlane stubLedger sandbox a2a) do (
  .\node_modules\.bin\esbuild probe\%f.test.ts --bundle --platform=node --format=esm --define:MJ_ROOT="%cd%" --outfile=probe\.run.mjs --log-level=error && node probe\.run.mjs || exit /b 1
)
```

## 3. Compile the Rust engine

```bat
cd src-tauri
cargo test
cd ..
```

`cargo test` runs the full Rust suite (29 unit + 11 store-integration) against real
dependencies. If anything fails here, that failure is real
and specific — fix or report it; do not skip this step.

## 4. Build the installer

```bat
npm run tauri build
```

When it finishes, the installer is at:

```
src-tauri\target\release\bundle\nsis\MJ_13.5.1_x64-setup.exe
```

Run it — MJ installs per-user, gets a Start-menu entry, and launches as a desktop
app. First launch creates its SQLite store under `%APPDATA%\com.mj.desktop`; nothing is
written outside that.

## 5. First run — sanity checklist

1. The header says **MJ 13.5.1** (Help → About must agree — `probe/versionDrift` enforces this).
2. Settings → **Themes**: try `ink` (true-black flagship), `pitch`, `slag`, `fern`, `ivory`, `travertine`.
3. Settings → MCP: the control server advertises **5 tools** and implements **5 tools** — the
   counts must match; that equality is the whole W2 story.
4. Any agent node: attach a provider (cloud ref or local Ollama) — the assist panel tells you
   which it resolved and never guesses silently.

## 6. Updates (release maintainers only)

Auto-update is **removed**, not merely unconfigured: `src-tauri/src/lib.rs` no longer
initializes the updater plugin (it was fatal at launch with an empty updater config —
exit 101 before setup — so it had to go, not just stay unwired).

Until auto-update is rebuilt with a real config, updates are simply "download the new
zip and reinstall" — nothing phones home.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `error: Microsoft Visual C++ 14.0 or greater is required` | Install the VS Build Tools C++ workload (§1), reopen the terminal |
| `link.exe not found` | Run the build from a "x64 Native Tools Command Prompt for VS" |
| Build is slow the first time | Normal — the Rust release profile does LTO; later builds are incremental |
| Antivirus flags the fresh installer | It is unsigned local output — expected until a signing key is configured |

**That's the whole install.** No accounts, no cloud, no localhost server — a desktop app you
built and can verify.
