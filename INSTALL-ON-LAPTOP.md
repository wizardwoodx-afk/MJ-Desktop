# Install MJ 11.9 on your laptop (Windows 11) — the only supported install

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

macOS / Linux instead? `DESKTOP-NATIVE.md` §1 has the exact per-OS package lists (Linux needs
the WebKitGTK dev packages; also `sudo apt install bubblewrap` so HIGH-risk agent seats get a
measured sandbox).

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

## 3. Compile the Rust engine (retires the one honest gap)

Everything in `src-tauri/` was written for V11 but compiled only on machines with the toolchain.
Your `cargo check` is the moment the ledger closes:

```bat
cd src-tauri
cargo check --all-targets
cargo test
cd ..
```

`cargo test` runs the control-plane units (in-memory SQLite through the shipped schema), the
graph parsers, and the Rust-side sandbox shapes. If anything fails here, that failure is real
and specific — fix or report it; do not skip this step.

## 4. Build the installer

```bat
npm run tauri build
```

When it finishes, the signed-pending installer is at:

```
src-tauri\target\release\bundle\
  ├─ msi\MJ_11.0.0_x64_en-US.msi
  └─ nsis\MJ_11.0.0_x64-setup.exe
```

Run either one — MJ installs to Programs, gets a Start-menu entry, and launches as a desktop
app. First launch creates its SQLite store and keyring entries in your user profile; nothing is
written outside that.

## 5. First run — sanity checklist

1. The header says **MJ 11.0** (Help → About must agree — `probe/versionDrift` enforces this).
2. Settings → **Themes**: try `nothing` (true-black), `hermes`, `nord`, `solar`, `terminal`.
3. Settings → MCP: the control server advertises **5 tools** and implements **5 tools** — the
   counts must match; that equality is the whole W2 story.
4. Any agent node: attach a provider (cloud ref or local Ollama) — the assist panel tells you
   which it resolved and never guesses silently.

## 6. Optional: signed auto-updates (release maintainers only)

MJ ships with the Tauri updater wired but inert until configured:

```bat
npm run tauri signer generate -w %USERPROFILE%\.tauri\mj.key
```

- Private key → GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` (+ password), used by
  `.github/workflows/release.yml` on a `v*` tag.
- Public key → `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
- Endpoint → your repo's `latest.json` URL (same file).

Until then, updates are simply "download the new zip and reinstall" — nothing phones home.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `error: Microsoft Visual C++ 14.0 or greater is required` | Install the VS Build Tools C++ workload (§1), reopen the terminal |
| `link.exe not found` | Run the build from a "x64 Native Tools Command Prompt for VS" |
| Build is slow the first time | Normal — the Rust release profile does LTO; later builds are incremental |
| Antivirus flags the fresh MSI | It is unsigned local output; sign it (§6) or build the NSIS installer instead |

**That's the whole install.** No accounts, no cloud, no localhost server — a desktop app you
built and can verify.
