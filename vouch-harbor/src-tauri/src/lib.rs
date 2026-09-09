// FLAMO - native shell (Tauri v2).
//
// v0.1 scope, stated plainly: a native window, a tray, autostart, single
// instance, and a JSON vouch ledger on disk. No credential store is wired yet,
// and `secret_status` says so rather than implying one exists.
//
// Structure mirrors MJ 14.1.3's proven shell (src-tauri/src/lib.rs) so the
// plugin and tray APIs are the ones already known to compile at Tauri v2.

use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub data_dir: PathBuf,
    pub ledger: Mutex<Vec<Value>>,
}

fn ledger_path(dir: &PathBuf) -> PathBuf {
    dir.join("vouch-ledger.json")
}

#[tauri::command]
fn app_info() -> Value {
    json!({
        "name": "FLAMO",
        "version": env!("CARGO_PKG_VERSION"),
        "native": true,
        "cycle": "Vouch Cycle 2.0",
    })
}

#[tauri::command]
fn ledger_load(state: tauri::State<AppState>) -> Value {
    let path = ledger_path(&state.data_dir);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str::<Vec<Value>>(&text).unwrap_or_default().into(),
        // A missing file is an empty ledger, not an error: nothing has been vouched yet.
        Err(_) => Vec::<Value>::new().into(),
    }
}

#[tauri::command]
fn ledger_save(state: tauri::State<AppState>, rows: Vec<Value>) -> Result<Value, String> {
    let path = ledger_path(&state.data_dir);
    let text = serde_json::to_string_pretty(&rows).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    *state.ledger.lock().map_err(|e| e.to_string())? = rows.clone();
    Ok(json!({ "saved": rows.len(), "path": path.to_string_lossy() }))
}

/// Honest capability probe. v0.1 has no credential store, so this says so
/// instead of returning a shape that implies secrets can be kept.
#[tauri::command]
fn secret_status() -> Value {
    json!({
        "store": "none",
        "reason": "FLAMO v0.1 wires no credential store. MJ's OS-keychain secrets arrive at merge step 4.",
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let data = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("flamo"));
            let _ = std::fs::create_dir_all(&data);

            let rows: Vec<Value> = std::fs::read_to_string(ledger_path(&data))
                .ok()
                .and_then(|t| serde_json::from_str(&t).ok())
                .unwrap_or_default();

            app.manage(AppState {
                data_dir: data,
                ledger: Mutex::new(rows),
            });

            let show = tauri::menu::MenuItem::with_id(app, "show", "Show FLAMO", true, None::<&str>)?;
            let quit = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("FLAMO - Vouch Cycle agent")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    _ => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            ledger_load,
            ledger_save,
            secret_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running FLAMO");
}
