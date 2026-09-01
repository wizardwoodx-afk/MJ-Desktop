mod acp;
mod commands;
pub mod db;
mod control_mcp;
mod git;
mod hermes;
mod mcp;
mod secrets;

use commands::AppState;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // V11 (W5): opt-in signed auto-update. Off in behavior until the frontend asks; the
        // endpoint and the minisign pubkey are release configuration, not code.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("mj"));
            let _ = std::fs::create_dir_all(data.join("artifacts"));
            let _ = std::fs::create_dir_all(data.join("skills"));
            let db_path = data.join("mj.sqlite");
            let conn = db::open(&db_path).expect("open sqlite");
            db::seed_mcp_if_empty(&conn).ok();
            let cwd = std::env::current_dir().unwrap_or_default();
            let resource = app.path().resource_dir().unwrap_or(cwd.clone());
            let vendor = hermes::vendor_dir(&resource, &cwd);
            app.manage(Arc::new(AppState {
                db: Mutex::new(conn),
                db_path,
                data_dir: data,
                vendor_dir: vendor,
                secrets: secrets::SecretStore::new(),
            }));

            let quit = tauri::menu::MenuItem::with_id(app, "quit", "Quit MJ", true, None::<&str>)?;
            let show = tauri::menu::MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
            let run = tauri::menu::MenuItem::with_id(app, "run", "Run active workflow", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &run, &quit])?;
            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("MJ — agent workstation")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::db_maintenance,
            commands::workflow_list,
            commands::workflow_get,
            commands::workflow_create,
            commands::workflow_delete,
            commands::workflow_save,
            commands::workflow_version_create,
            commands::workflow_versions,
            commands::workflow_version_restore,
            commands::node_state_load,
            commands::node_state_save,
            commands::memory_add,
            commands::memory_search,
            commands::memory_delete,
            commands::skills_list,
            commands::skill_touch,
            commands::skill_deactivate,
            commands::skill_upsert,
            commands::feedback_add,
            commands::feedback_list,
            commands::evaluation_save,
            commands::evaluation_history,
            commands::suite_list,
            commands::suite_save,
            commands::evolution_propose_save,
            commands::evolution_list,
            commands::evolution_decide,
            commands::evolution_rollback,
            commands::approval_request,
            commands::approval_get,
            commands::approval_list,
            commands::approval_decide,
            commands::execution_create,
            commands::execution_finish,
            commands::event_emit,
            commands::execution_events,
            commands::execution_trace,
            commands::execution_list,
            commands::dlq_add,
            commands::dlq_list,
            commands::dlq_resolve,
            commands::run_request_take,
            commands::evolution_service_health,
            commands::evolution_service_propose,
            commands::hermes_bridge,
            commands::secret_set,
            commands::secret_delete,
            commands::secret_exists,
            commands::llm_chat,
            commands::fs_read,
            commands::fs_write,
            commands::fs_list,
            commands::fs_mkdir,
            commands::fs_remove,
            commands::shell_exec,
            commands::mcp_server_list,
            commands::mcp_server_save,
            commands::mcp_server_remove,
            commands::mcp_connect_test,
            commands::mcp_call,
            commands::browser_session_create,
            commands::browser_session_close,
            commands::browser_sessions,
            commands::browser_navigate,
            commands::browser_act,
            commands::browser_screenshot,
            commands::browser_console,
            commands::cli_providers_detect,
            commands::cli_invoke,
            commands::cli_env,
            commands::acp_open,
            commands::acp_send,
            commands::acp_recv,
            commands::acp_close,
            commands::package_export,
            commands::package_import,
            commands::control_validate_graph,
            commands::control_connect_ports,
            commands::control_disconnect_ports,
            commands::control_list_nodes,
            commands::control_run_workflow,
            git::git_is_repo,
            git::git_status,
            git::git_diff,
            git::git_head,
            git::git_branch,
            git::git_read_only_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MJ");
}
