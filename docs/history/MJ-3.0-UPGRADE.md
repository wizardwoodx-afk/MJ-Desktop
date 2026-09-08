# MJ 2.1 → 3.0 major upgrade

## Desktop native

v2.1 already used Tauri 2, but the window was a stock decorated frame with no tray, no menus, no multi-document tabs, and a Windows-only NSIS target.

3.0 ships a **frameless native shell**:

- Custom titlebar with macOS traffic lights / Windows caption buttons
- `data-tauri-drag-region` + `core:window:allow-start-dragging`
- Native-style File / Edit / View / Run / Help menu bar
- Document tabs (VS Code-style multi-workflow)
- Icon activity rail
- System tray with hide-on-close (native)
- Single-instance plugin — second launch focuses the existing window
- Window-state plugin — size and position persist
- Autostart-ready, notifications, dialogs, opener, process plugins
- Bundles: NSIS + DMG + AppImage + Deb
- Cross-platform keyring (Apple / Windows / Secret Service), not Windows-only

Build with `npm run tauri build`. The installer is typically 5–10 MB because Tauri uses the OS webview instead of shipping Chromium.

## Product upgrades

| Area | 2.1 | 3.0 |
| --- | --- | --- |
| Entry | Blank canvas | Home / Launchpad + NL builder |
| Graph schema | v1 | v2 (notes, groups, cost) |
| Providers | OpenAI / Anthropic / CLI | + Google, OpenRouter, **Ollama** |
| Observability | Event console | Spend, approvals, DLQ, Gantt |
| Themes | Void only | Void / Graphite / Paper |
| Layout | Manual | Auto-layout + alignment |
| Host | Tauri-only | Dual: Tauri IPC **or** local-first preview |

## Compatibility

Workflow JSON from 2.1 loads through `sanitizeGraph`. Secrets are not imported. Package format stays `packageFormat: 1` with `application: "MJ"`.
