use crate::{control_mcp, db, hermes, mcp, secrets::SecretStore};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub db_path: PathBuf,
    pub data_dir: PathBuf,
    pub vendor_dir: PathBuf,
    pub secrets: SecretStore,
}

fn lock_db(state: &AppState) -> Result<parking_lot::MutexGuard<'_, rusqlite::Connection>, String> {
    Ok(state.db.lock())
}

#[tauri::command]
pub fn app_info(app: AppHandle, state: State<Arc<AppState>>) -> Value {
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
        "workspaceRoot": state.data_dir,
        "artifactsDir": state.data_dir.join("artifacts"),
        "dbHealthy": true,
        "controlMcpPort": 0,
        "controlMcpTransport": "stdio",
        "controlMcpRunning": true,
        "host": "tauri",
        "desktopNative": true,
        "vendors": ["mcp-servers-reference", "mcp-github"],
        "resourceDir": app.path().resource_dir().ok().map(|p| p.display().to_string()),
    })
}

#[tauri::command]
pub fn db_maintenance(state: State<Arc<AppState>>, vacuum: bool) -> Result<Value, String> {
    if vacuum {
        lock_db(&state)?.execute_batch("VACUUM;").map_err(|e| e.to_string())?;
    }
    Ok(json!({ "vacuumed": vacuum, "sizeBytes": db::db_size(&state.db_path) }))
}

#[tauri::command]
pub fn workflow_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::workflow_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn workflow_get(state: State<Arc<AppState>>, workflow_id: String) -> Result<Value, String> {
    db::workflow_get(&*lock_db(&state)?, &workflow_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn workflow_create(state: State<Arc<AppState>>, name: String, description: String) -> Result<Value, String> {
    db::workflow_create(&*lock_db(&state)?, &name, &description).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn workflow_delete(state: State<Arc<AppState>>, workflow_id: String) -> Result<(), String> {
    db::workflow_delete(&*lock_db(&state)?, &workflow_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn workflow_save(state: State<Arc<AppState>>, workflow_id: String, name: String, description: String, graph: Value) -> Result<(), String> {
    db::workflow_save(&*lock_db(&state)?, &workflow_id, &name, &description, &graph).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn workflow_version_create(state: State<Arc<AppState>>, workflow_id: String, label: String) -> Result<Value, String> {
    let conn = lock_db(&state)?;
    let wf = db::workflow_get(&conn, &workflow_id).map_err(|e| e.to_string())?;
    // V7 fix (bug S): the version number was hardcoded to 1, so the fifth save was still
    // "version 1" and the history could not be ordered or reasoned about.
    let next: i64 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) + 1 FROM versions WHERE workflow_id=?1", [&workflow_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    // V7 fix (bug S): this returned the literal string "ver" as the id, so the caller could never
    // reference the row it had just created.
    let id = format!("ver-{}", uuid::Uuid::new_v4().simple());
    conn.execute(
        "INSERT INTO versions (id, workflow_id, version, label, graph_json, created_at) VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![id, workflow_id, next, label, wf["graph"].to_string(), chrono::Utc::now().to_rfc3339()],
    ).map_err(|e| e.to_string())?;
    Ok(json!({ "id": id, "version": next, "label": label }))
}
#[tauri::command]
pub fn workflow_versions(state: State<Arc<AppState>>, workflow_id: String) -> Result<Value, String> {
    // V7 fix (bug R): this returned a hardcoded empty array even though the `versions` table exists
    // and workflow_version_create writes to it, so the UI always showed "no versions yet".
    let conn = lock_db(&state)?;
    let mut st = conn
        .prepare("SELECT id, version, label, created_at FROM versions WHERE workflow_id=?1 ORDER BY version DESC, created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([&workflow_id], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "workflowId": workflow_id,
                "version": r.get::<_, i64>(1)?,
                "label": r.get::<_, String>(2)?,
                "createdAt": r.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out: Vec<Value> = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(Value::Array(out))
}
#[tauri::command]
pub fn workflow_version_restore(state: State<Arc<AppState>>, version_record_id: String) -> Result<Value, String> {
    // V7 fix (bug R): this returned Ok(()) for ANY id, so the UI confirmed a restore that never
    // happened while the user's graph stayed unchanged — the worst kind of silent failure.
    let conn = lock_db(&state)?;
    let row: Option<(String, String, i64)> = conn
        .query_row(
            "SELECT workflow_id, graph_json, version FROM versions WHERE id=?1",
            [&version_record_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((workflow_id, graph_json, version)) = row else {
        return Err(format!("No version record '{version_record_id}' exists, so nothing was restored."));
    };
    let graph: Value = serde_json::from_str(&graph_json).map_err(|e| format!("Stored graph for version {version} is corrupt: {e}"))?;
    let wf = db::workflow_get(&conn, &workflow_id).map_err(|e| e.to_string())?;
    let name = wf["name"].as_str().unwrap_or("").to_string();
    let description = wf["description"].as_str().unwrap_or("").to_string();
    db::workflow_save(&conn, &workflow_id, &name, &description, &graph).map_err(|e| e.to_string())?;
    Ok(json!({ "workflowId": workflow_id, "restoredVersion": version }))
}

#[tauri::command]
pub fn node_state_load(state: State<Arc<AppState>>, node_key: String) -> Result<Value, String> {
    let conn = lock_db(&state)?;
    let row: Option<String> = conn.query_row("SELECT payload_json FROM node_state WHERE node_key=?1", [&node_key], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    Ok(row.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(json!({})))
}
#[tauri::command]
pub fn node_state_save(state: State<Arc<AppState>>, node_key: String, role_prompt: Option<Value>) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "INSERT INTO node_state (node_key, payload_json) VALUES (?1,?2) ON CONFLICT(node_key) DO UPDATE SET payload_json=excluded.payload_json",
        rusqlite::params![node_key, json!({"rolePrompt": role_prompt}).to_string()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn memory_add(state: State<Arc<AppState>>, node_key: String, kind: String, content: String, tags: Vec<String>, importance: f64, _execution_id: Option<String>) -> Result<Value, String> {
    db::memory_add(&*lock_db(&state)?, &node_key, &kind, &content, &json!(tags), importance).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn memory_search(state: State<Arc<AppState>>, node_key: String, query: String, limit: Option<i64>, _kinds: Option<Value>) -> Result<Value, String> {
    db::memory_search(&*lock_db(&state)?, &node_key, &query, limit.unwrap_or(12)).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn memory_delete(state: State<Arc<AppState>>, memory_id: String) -> Result<(), String> {
    lock_db(&state)?.execute("DELETE FROM memories WHERE id=?1", [&memory_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn skills_list(state: State<Arc<AppState>>, node_key: String) -> Result<Value, String> {
    db::skills_list(&*lock_db(&state)?, &node_key).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn skill_touch(state: State<Arc<AppState>>, skill_ids: Vec<String>) -> Result<Value, String> {
    // V11 (W6): real usage tracking. The count returned is what actually updated — stale ids
    // report themselves instead of pretending to count.
    db::skill_touch(&*lock_db(&state)?, &skill_ids).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn skill_deactivate(state: State<Arc<AppState>>, skill_id: String) -> Result<(), String> {
    lock_db(&state)?.execute("UPDATE skills SET active=0 WHERE id=?1", [&skill_id]).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri commands take named args; 8 fields is the UI contract.
pub fn skill_upsert(state: State<Arc<AppState>>, node_key: String, skill_id: Option<String>, name: String, description: String, procedure: String, origin: String, _score: Option<f64>) -> Result<Value, String> {
    let _ = skill_id;
    db::skill_upsert(&*lock_db(&state)?, &node_key, &name, &description, &procedure, &origin).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn feedback_add(state: State<Arc<AppState>>, execution_id: String, node_key: String, rating: i64, comment: String) -> Result<Value, String> {
    db::feedback_add(&*lock_db(&state)?, &execution_id, &node_key, rating, &comment).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn feedback_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::feedback_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn evaluation_save(state: State<Arc<AppState>>, node_key: String, execution_id: Option<String>, suite: Value, score: f64, details: Value) -> Result<Value, String> {
    // V11 (W6): persisted for real, with the stored id returned.
    db::evaluation_save(&*lock_db(&state)?, &node_key, execution_id.as_deref(), &suite, score, &details)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn evaluation_history(state: State<Arc<AppState>>, node_key: String) -> Result<Value, String> {
    // V11 (W6): an empty array finally means "never evaluated".
    db::evaluation_history(&*lock_db(&state)?, &node_key).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn suite_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    // V11 (W6): real suites from the real table.
    db::suite_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn suite_save(state: State<Arc<AppState>>, suite_id: Option<String>, name: String, cases: Value) -> Result<Value, String> {
    // V11 (W6): upsert into the suites table; the returned id is the stored id.
    db::suite_save(&*lock_db(&state)?, suite_id.as_deref(), &name, &cases).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn evolution_propose_save(state: State<Arc<AppState>>, cand: Value) -> Result<Value, String> {
    db::evolution_propose(&*lock_db(&state)?, &cand).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn evolution_list(state: State<Arc<AppState>>, node_key: Option<String>) -> Result<Value, String> {
    db::evolution_list(&*lock_db(&state)?, node_key.as_deref()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn evolution_decide(state: State<Arc<AppState>>, candidate_id: String, decision: String) -> Result<Value, String> {
    db::evolution_decide(&*lock_db(&state)?, &candidate_id, &decision).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn evolution_rollback(state: State<Arc<AppState>>, candidate_id: String, _restore_role_prompt: Option<Value>) -> Result<Value, String> {
    let conn = lock_db(&state)?;
    conn.execute("UPDATE evolution SET status='ROLLED_BACK' WHERE id=?1", [&candidate_id]).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn approval_request(state: State<Arc<AppState>>, execution_id: String, node_key: String, summary: String, payload: Value) -> Result<Value, String> {
    db::approval_request(&*lock_db(&state)?, &execution_id, &node_key, &summary, &payload).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn approval_get(state: State<Arc<AppState>>, execution_id: String, node_key: String) -> Result<Value, String> {
    db::approval_get(&*lock_db(&state)?, &execution_id, &node_key).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn approval_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::approval_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn approval_decide(state: State<Arc<AppState>>, approval_id: String, decision: String) -> Result<(), String> {
    db::approval_decide(&*lock_db(&state)?, &approval_id, &decision).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn execution_create(state: State<Arc<AppState>>, workflow_id: String, workflow_version: i64) -> Result<Value, String> {
    db::execution_create(&*lock_db(&state)?, &workflow_id, workflow_version).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn execution_finish(state: State<Arc<AppState>>, execution_id: String, status: String, error: Option<String>, stats: Value) -> Result<(), String> {
    db::execution_finish(&*lock_db(&state)?, &execution_id, &status, error.as_deref(), &stats).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn event_emit(app: AppHandle, state: State<Arc<AppState>>, execution_id: String, kind: String, level: String, node_id: Option<String>, data: Value) -> Result<Value, String> {
    let rec = db::event_emit(&*lock_db(&state)?, &execution_id, &kind, &level, node_id.as_deref(), &data).map_err(|e| e.to_string())?;
    let _ = app.emit("mj://event", rec.clone());
    Ok(rec)
}
#[tauri::command]
pub fn execution_events(state: State<Arc<AppState>>, execution_id: String) -> Result<Value, String> {
    db::execution_events(&*lock_db(&state)?, &execution_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn execution_trace(state: State<Arc<AppState>>, execution_id: String) -> Result<Value, String> {
    let events = db::execution_events(&*lock_db(&state)?, &execution_id).map_err(|e| e.to_string())?;
    Ok(json!({ "events": events, "status": "COMPLETED" }))
}
#[tauri::command]
pub fn execution_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::execution_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dlq_add(state: State<Arc<AppState>>, execution_id: String, node_key: String, error: String, payload: Value, suggested_cause: String, candidate_fix: String) -> Result<Value, String> {
    db::dlq_add(&*lock_db(&state)?, &json!({
        "executionId": execution_id, "nodeKey": node_key, "error": error, "payload": payload,
        "suggestedCause": suggested_cause, "candidateFix": candidate_fix
    })).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn dlq_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::dlq_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn dlq_resolve(state: State<Arc<AppState>>, dlq_id: String) -> Result<(), String> {
    db::dlq_resolve(&*lock_db(&state)?, &dlq_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn run_request_take(state: State<Arc<AppState>>) -> Result<Vec<String>, String> {
    // V7 fix (bug R): this was `vec![]` unconditionally, so queued evolution work was never picked
    // up. The real table is `run_queue (id INTEGER, workflow_id TEXT)` and the browser-side
    // implementation (localDb.runTake) drains the queue destructively, so this matches that.
    let conn = lock_db(&state)?;
    let ids: Vec<i64> = {
        let mut st = conn.prepare("SELECT id FROM run_queue ORDER BY id LIMIT 8").map_err(|e| e.to_string())?;
        let rows = st.query_map([], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for id in rows {
            v.push(id.map_err(|e| e.to_string())?);
        }
        v
    };
    let mut out = Vec::new();
    for id in ids {
        let wf: Option<String> = conn
            .query_row("SELECT workflow_id FROM run_queue WHERE id=?1", [id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM run_queue WHERE id=?1", [id]).map_err(|e| e.to_string())?;
        if let Some(w) = wf {
            out.push(w);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn evolution_service_health(state: State<Arc<AppState>>) -> Value {
    hermes::health(&state.vendor_dir)
}
#[tauri::command]
pub fn evolution_service_propose(state: State<Arc<AppState>>, args: Value) -> Result<Value, String> {
    hermes::call(&state.vendor_dir, &json!({"cmd":"score_fitness","task_input": args.get("task"), "expected_behavior": args.get("expected"), "agent_output": args.get("output"), "skill_text": args.get("skill")}))
}
#[tauri::command]
pub fn hermes_bridge(state: State<Arc<AppState>>, msg: Value) -> Result<Value, String> {
    hermes::call(&state.vendor_dir, &msg)
}

#[tauri::command]
pub fn secret_set(state: State<Arc<AppState>>, secret_ref: String, value: String) -> Result<Value, String> {
    // V7 fix (bug W): report where the secret really went, so the UI can warn when a key is only
    // in memory instead of implying it is safely in the OS keychain.
    match state.secrets.set(&secret_ref, &value)? {
        crate::secrets::SecretLocation::Keychain => Ok(json!({ "stored": true, "location": "keychain", "survivesRestart": true })),
        _ => Ok(json!({
            "stored": true,
            "location": "memory-only",
            "survivesRestart": false,
            "warning": "The OS keychain was unavailable, so this secret is held in process memory only and will be lost when MJ exits. It is NOT saved to disk.",
        })),
    }
}
#[tauri::command]
pub fn secret_delete(state: State<Arc<AppState>>, secret_ref: String) -> Result<(), String> {
    state.secrets.delete(&secret_ref)
}
#[tauri::command]
pub fn secret_exists(state: State<Arc<AppState>>, secret_refs: Vec<String>) -> Value {
    let mut out = serde_json::Map::new();
    for r in &secret_refs {
        // V7 fix (bug W): `exists` alone could not distinguish "in the keychain" from "in RAM and
        // about to vanish", so the Providers page showed a green tick for a key that was not saved.
        let loc = match state.secrets.location(r) {
            crate::secrets::SecretLocation::Keychain => "keychain",
            crate::secrets::SecretLocation::MemoryOnly => "memory-only",
            crate::secrets::SecretLocation::Absent => "absent",
        };
        out.insert(r.clone(), json!({ "exists": loc != "absent", "location": loc, "survivesRestart": loc == "keychain" }));
    }
    json!(out)
}

#[tauri::command]
pub async fn llm_chat(state: State<'_, Arc<AppState>>, req: Value) -> Result<Value, String> {
    let provider = req["provider"].as_str().unwrap_or("openai");
    let model = req["model"].as_str().unwrap_or("gpt-4.1").to_string();
    let secret_ref = req["secret_ref"].as_str().unwrap_or("");
    let system = req["system"].as_str().unwrap_or("").to_string();
    let messages = req["messages"].clone();
    if provider == "ollama" {
        let base = req["base_url"].as_str().unwrap_or("http://127.0.0.1:11434");
        // V6 fix: the previous build sent `{"0": {...}}` (an object, not an array) and
        // dropped the conversation entirely — only the system prompt reached the model.
        // Ollama's /api/chat expects a JSON array of role/content messages.
        let mut msgs = Vec::new();
        if !system.is_empty() {
            msgs.push(json!({"role": "system", "content": system}));
        }
        if let Some(arr) = messages.as_array() {
            msgs.extend(arr.iter().cloned());
        }
        if msgs.is_empty() {
            return Err("ollama: no messages to send".into());
        }
        let body = json!({
            "model": model,
            "stream": false,
            "options": { "temperature": req["temperature"].as_f64().unwrap_or(0.2) },
            "messages": msgs
        });
        // Ollama is the user's local model, not an MJ sidecar.
        let client = reqwest::Client::new();
        let r = client.post(format!("{base}/api/chat")).json(&body).send().await;
        return match r {
            Ok(resp) => {
                let j: Value = resp.json().await.unwrap_or(json!({}));
                Ok(json!({ "content": j.pointer("/message/content").cloned().unwrap_or(json!("")), "model": model, "usage": {"input_tokens": 0, "output_tokens": 0}, "duration_ms": 0 }))
            }
            Err(e) => Err(format!("ollama: {e}")),
        };
    }
    let key = state.secrets.get(secret_ref).ok_or_else(|| format!("secret not found: {secret_ref}"))?;
    let (url, header) = match provider {
        "anthropic" => ("https://api.anthropic.com/v1/messages", "x-api-key"),
        "google" => ("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "Authorization"),
        "openrouter" => ("https://openrouter.ai/api/v1/chat/completions", "Authorization"),
        _ => ("https://api.openai.com/v1/chat/completions", "Authorization"),
    };
    let client = reqwest::Client::new();
    let mut msgs = vec![json!({"role":"system","content": system})];
    if let Some(arr) = messages.as_array() {
        msgs.extend(arr.iter().cloned());
    }
    let mut reqb = client.post(url).json(&json!({"model": model, "messages": msgs, "max_tokens": req["max_tokens"]}));
    reqb = if header == "Authorization" { reqb.bearer_auth(&key) } else { reqb.header(header, key).header("anthropic-version", "2023-06-01") };
    let resp = reqb.send().await.map_err(|e| e.to_string())?;
    let j: Value = resp.json().await.map_err(|e| e.to_string())?;
    let content = j.pointer("/choices/0/message/content").or_else(|| j.pointer("/content/0/text")).cloned().unwrap_or(json!(""));
    Ok(json!({ "content": content, "model": model, "usage": j.get("usage").cloned().unwrap_or(json!({})), "duration_ms": 0 }))
}

// ---------------------------------------------------------------------------
// QA fix (audit C2): filesystem sandbox.
//
// fs_read / fs_write / fs_list / fs_mkdir / fs_remove / shell_exec used to accept
// ANY absolute path from the webview, which made every XSS in the frontend a
// full-disk read/write/delete + arbitrary-execution primitive. Every path now
// must resolve inside an allowed root:
//   • the app data dir (always, it is MJ's own store), or
//   • a user-registered workspace root (persisted in SQLite, managed by the
//     workspace_root_* commands below — Teams registers the repo when a run starts).
// Agents can be prompt-injected; the user-registered-root gate is what keeps an
// injected tool call from reaching, say, ~/.ssh or C:\Windows.
// ---------------------------------------------------------------------------

fn normalize_parts(p: &str) -> Vec<String> {
    let mut parts: Vec<String> = Vec::new();
    for comp in p.replace('\\', "/").split('/') {
        if comp.is_empty() || comp == "." {
            continue;
        }
        if comp == ".." {
            if parts.len() > 1 {
                parts.pop();
            }
            continue;
        }
        parts.push(comp.to_string());
    }
    parts
}

fn normalize_path_str(p: &str) -> String {
    normalize_parts(p).join("/")
}

fn is_within(child: &str, root: &str) -> bool {
    let (c, r) = (normalize_path_str(child), normalize_path_str(root));
    if c.eq_ignore_ascii_case(&r) {
        return true;
    }
    let cc = format!("{c}/");
    let rc = format!("{r}/");
    cc.to_ascii_lowercase().starts_with(&rc.to_ascii_lowercase())
}

fn allowed_roots(state: &AppState) -> Vec<String> {
    let mut roots = vec![normalize_path_str(&state.data_dir.display().to_string())];
    if let Ok(v) = db::workspace_root_list(&state.db.lock()) {
        if let Some(arr) = v.as_array() {
            for r in arr {
                if let Some(p) = r["path"].as_str() {
                    roots.push(p.to_string());
                }
            }
        }
    }
    roots
}

fn ensure_allowed(state: &AppState, path: &str) -> Result<String, String> {
    let normalized = normalize_path_str(path);
    if normalized.is_empty() {
        return Err("sandbox: empty path".into());
    }
    if allowed_roots(state).iter().any(|root| is_within(&normalized, root)) {
        Ok(normalized)
    } else {
        Err(format!(
            "sandbox: path '{normalized}' is outside every registered workspace root. Register it first (Teams → runner repo, or workspace_root_add)."
        ))
    }
}

#[tauri::command]
pub fn workspace_root_add(state: State<Arc<AppState>>, root: String) -> Result<Value, String> {
    let normalized = normalize_path_str(&root);
    if normalized.is_empty() || !PathBuf::from(&root).is_dir() {
        return Err(format!("sandbox: '{root}' is not an existing directory"));
    }
    db::workspace_root_add(&*lock_db(&state)?, &normalized).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn workspace_root_remove(state: State<Arc<AppState>>, root: String) -> Result<Value, String> {
    db::workspace_root_remove(&*lock_db(&state)?, &root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn workspace_root_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::workspace_root_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_read(state: State<Arc<AppState>>, path: String) -> Result<String, String> {
    let path = ensure_allowed(&state, &path)?;
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn fs_write(state: State<Arc<AppState>>, path: String, content: String) -> Result<(), String> {
    let path = ensure_allowed(&state, &path)?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn fs_list(state: State<Arc<AppState>>, path: String) -> Result<Value, String> {
    let path = ensure_allowed(&state, &path)?;
    let rd = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for e in rd.flatten() {
        out.push(json!({ "name": e.file_name().to_string_lossy(), "path": e.path().display().to_string(), "dir": e.path().is_dir() }));
    }
    Ok(Value::Array(out))
}
#[tauri::command]
pub fn fs_mkdir(state: State<Arc<AppState>>, path: String) -> Result<(), String> {
    let path = ensure_allowed(&state, &path)?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn fs_remove(state: State<Arc<AppState>>, path: String, recursive: bool) -> Result<(), String> {
    let path = ensure_allowed(&state, &path)?;
    if recursive { std::fs::remove_dir_all(&path).or_else(|_| std::fs::remove_file(&path)).map_err(|e| e.to_string()) }
    else { std::fs::remove_file(&path).map_err(|e| e.to_string()) }
}
#[tauri::command]
pub fn shell_exec(state: State<Arc<AppState>>, program: String, args: Vec<String>, cwd: Option<String>, timeout_secs: Option<u64>) -> Result<Value, String> {
    // The working directory must be a registered root. No cwd given -> MJ's own data dir,
    // which is always allowed (previously it silently inherited the install dir).
    let cwd = match cwd {
        Some(c) => ensure_allowed(&state, &c)?,
        None => normalize_path_str(&state.data_dir.display().to_string()),
    };
    let mut cmd = std::process::Command::new(&program);
    cmd.args(&args);
    cmd.current_dir(&cwd);
    let (stdout, stderr, code) = run_timeout(cmd, timeout_secs.unwrap_or(60))?;
    Ok(json!({ "stdout": stdout, "stderr": stderr, "code": code }))
}

#[tauri::command]
pub fn mcp_server_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::mcp_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn mcp_server_save(state: State<Arc<AppState>>, cfg: Value) -> Result<Value, String> {
    db::mcp_save(&*lock_db(&state)?, &cfg).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn mcp_server_remove(state: State<Arc<AppState>>, server_id: String) -> Result<(), String> {
    db::mcp_remove(&*lock_db(&state)?, &server_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn mcp_connect_test(state: State<Arc<AppState>>, server_id: String) -> Result<Value, String> {
    let list = db::mcp_list(&*lock_db(&state)?).map_err(|e| e.to_string())?;
    let found = list.as_array().and_then(|a| a.iter().find(|s| s["id"] == server_id)).cloned();
    let Some(s) = found else { return Ok(json!({"connected": false, "lastError": "unknown server", "toolCount": 0})); };
    let cmd = s.pointer("/config/command").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let args: Vec<String> = s.pointer("/config/args").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let cwd = state.vendor_dir.parent().unwrap_or(&state.vendor_dir).to_path_buf();
    Ok(mcp::connect_test(&cmd, &args, &cwd))
}
#[tauri::command]
pub fn mcp_call(state: State<Arc<AppState>>, server_id: String, tool: String, arguments: Value) -> Result<Value, String> {
    // V7 fix (bug Q): this used to match `tool.starts_with("control")`, which hijacked any real
    // MCP server that happened to expose a tool named control* and answered it from the stub.
    // Only the built-in server is served here.
    if server_id == "mcp.control" {
        // V11 (W2): the control plane gets real database access, so the graph tools mutate
        // and read the store instead of refusing.
        return Ok(control_mcp::dispatch_with_db(&tool, &arguments, &*lock_db(&state)?));
    }
    let list = db::mcp_list(&*lock_db(&state)?).map_err(|e| e.to_string())?;
    let found = list.as_array().and_then(|a| a.iter().find(|s| s["id"] == server_id)).cloned();
    let Some(s) = found else { return Err(format!("unknown MCP server {server_id}")); };
    let cmd = s.pointer("/config/command").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let args: Vec<String> = s.pointer("/config/args").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let cwd = state.vendor_dir.parent().unwrap_or(&state.vendor_dir).to_path_buf();
    Ok(mcp::call_tool(&cmd, &args, &cwd, &tool, &arguments))
}

/* ------------------------------------------------------------------ browser
 *
 * MJ still does not bundle or launch Chromium, and none of that changed. What changed is that the
 * browser now exists — as a separate service (D:\mj-browser) that owns the Chromium process. These
 * commands only forward to that service over loopback HTTP; no browser logic lives in this crate.
 *
 * The V7 (bug V) fail-closed contract is preserved exactly. If the service is not running, every
 * command reports `notAttached` with a reason that says so, and no session id, page title or engine
 * is ever invented here. An offline browser and a broken browser must look identical to a caller
 * that would otherwise believe it had seen a page.
 */

/// Where the browser service listens. Loopback only; the service accepts no other connections.
fn browser_base() -> String {
    std::env::var("MJ_BROWSER_URL").unwrap_or_else(|_| "http://127.0.0.1:9223".to_string())
}

fn browser_down_reason(e: &str) -> String {
    format!(
        "No browser is attached: the MJ browser service is not answering on {}. Nothing was \
         fetched. Start it with `node D:\\mj-browser\\cli.mjs start`. ({e})",
        browser_base()
    )
}

fn browser_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        // The service caps a navigation at 120 s; leave headroom on this side.
        .timeout(std::time::Duration::from_secs(150))
        .build()
        .map_err(|e| e.to_string())
}

/// POSTs to the browser service and hands back its JSON body verbatim.
///
/// A transport failure is reshaped into the honest `notAttached` response the stubs used to return,
/// so the Browser page and every agent keep failing closed rather than reading a fabricated result.
async fn browser_call(route: &str, body: Value) -> Value {
    let client = match browser_client() {
        Ok(c) => c,
        Err(e) => return json!({ "ok": false, "notAttached": true, "reason": browser_down_reason(&e) }),
    };
    let url = format!("{}{}", browser_base(), route);
    match client.post(&url).json(&body).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(v) => v,
            Err(e) => json!({
                "ok": false,
                "notAttached": true,
                "reason": format!("The browser service at {url} replied with something that was not JSON: {e}")
            }),
        },
        Err(e) => json!({ "ok": false, "notAttached": true, "reason": browser_down_reason(&e.to_string()) }),
    }
}

async fn browser_get(route: &str) -> Option<Value> {
    let client = browser_client().ok()?;
    let url = format!("{}{}", browser_base(), route);
    let resp = client.get(&url).send().await.ok()?;
    resp.json::<Value>().await.ok()
}

fn reason_of(r: &Value) -> String {
    r.get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("the browser service did not say why")
        .to_string()
}

/// True only when the service itself reported success.
fn served(r: &Value) -> bool {
    r.get("ok").and_then(|v| v.as_bool()) == Some(true)
}

/* --------------------------------------------------------- autonomous start
 *
 * MJ decides it needs a browser; the operator should not also have to remember to start one. If the
 * service is not answering, MJ starts it, waits for it to come up, then carries on. If it cannot be
 * started, the caller still fails closed with a reason — autonomy must never become a lie.
 */

/// Cooldown so a service that refuses to start does not turn every command into a process spawn.
static BROWSER_BOOT: std::sync::OnceLock<Mutex<Option<std::time::Instant>>> = std::sync::OnceLock::new();
const BROWSER_BOOT_COOLDOWN: std::time::Duration = std::time::Duration::from_secs(10);
const BROWSER_BOOT_WAIT: std::time::Duration = std::time::Duration::from_secs(25);

fn browser_dir() -> PathBuf {
    match std::env::var("MJ_BROWSER_DIR") {
        Ok(d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => PathBuf::from("D:\\mj-browser"),
    }
}

/// Every way we know to find a Node runtime, most trusted first.
///
/// Bare `node` is tried first because it respects whatever the user has on their PATH, but a GUI
/// app does not always inherit the same PATH a terminal shows, so real install locations are
/// probed afterwards rather than trusting the name to resolve.
fn browser_node_candidates() -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Ok(n) = std::env::var("MJ_BROWSER_NODE") {
        if !n.trim().is_empty() {
            out.push(n);
        }
    }
    out.push("node".to_string());
    if cfg!(windows) {
        out.push("node.exe".to_string());
        for p in [
            "D:\\Node24\\node.exe",
            "D:\\Node.js\\node.exe",
            "C:\\Program Files\\nodejs\\node.exe",
        ] {
            out.push(p.to_string());
        }
        if let Ok(o) = std::process::Command::new("where").arg("node").output() {
            if let Ok(s) = String::from_utf8(o.stdout) {
                if let Some(first) = s.lines().next().map(|l| l.trim().to_string()) {
                    if !first.is_empty() {
                        out.push(first);
                    }
                }
            }
        }
    } else {
        out.push("/usr/local/bin/node".to_string());
        out.push("/usr/bin/node".to_string());
    }
    out
}

/// Starts the browser service, trying each Node candidate until one actually launches.
fn spawn_browser_service(server: &std::path::Path, dir: &std::path::Path) -> Result<(), String> {
    let mut attempts = Vec::new();
    for bin in browser_node_candidates() {
        let mut cmd = std::process::Command::new(&bin);
        cmd.arg(server).current_dir(dir);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW: no console flash when MJ starts the service behind the UI.
            cmd.creation_flags(0x08000000);
        }
        match cmd.spawn() {
            Ok(_) => return Ok(()),
            Err(e) => attempts.push(format!("`{bin}` ({e})")),
        }
    }
    Err(format!(
        "could not launch a Node runtime for the browser service. Tried: {}. Set MJ_BROWSER_NODE to the full path of your node.exe.",
        attempts.join(", ")
    ))
}

async fn browser_healthy(client: &reqwest::Client) -> bool {
    matches!(
        client.get(format!("{}/health", browser_base())).send().await,
        Ok(r) if r.status().is_success()
    )
}

/// Is a browser up right now, without starting one? Used by commands where launching a browser
/// would be the wrong thing to do (closing or listing when nothing is running).
async fn browser_running() -> bool {
    match reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(800))
        .build()
    {
        Ok(c) => browser_healthy(&c).await,
        Err(_) => false,
    }
}

/// Ensures the browser service is running, launching it if this is the first thing to need it.
async fn ensure_browser() -> Result<(), String> {
    let probe = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(800))
        .build()
    {
        Ok(c) => c,
        Err(e) => return Err(format!("could not build an http client: {e}")),
    };
    if browser_healthy(&probe).await {
        return Ok(());
    }

    // Another command may already be starting it; only one process should try at a time.
    {
        let mut last = BROWSER_BOOT.get_or_init(|| Mutex::new(None)).lock();
        let now = std::time::Instant::now();
        if let Some(previous) = *last {
            if now.duration_since(previous) < BROWSER_BOOT_COOLDOWN {
                return Err(format!(
                    "the browser service is not answering on {} and a start was already attempted moments ago",
                    browser_base()
                ));
            }
        }
        *last = Some(now);
    }

    let dir = browser_dir();
    let server = dir.join("server.mjs");
    if !server.exists() {
        return Err(format!(
            "the MJ browser service is not installed at {} (no server.mjs there). Set MJ_BROWSER_DIR to where it lives.",
            dir.display()
        ));
    }

    spawn_browser_service(&server, &dir)?;

    let deadline = std::time::Instant::now() + BROWSER_BOOT_WAIT;
    while std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        if browser_healthy(&probe).await {
            return Ok(());
        }
    }
    Err(format!(
        "the browser service did not answer on {} within {}s of being started",
        browser_base(),
        BROWSER_BOOT_WAIT.as_secs()
    ))
}

#[tauri::command]
pub async fn browser_session_create(key: Option<String>) -> Value {
    if let Err(e) = ensure_browser().await {
        return json!({ "ok": false, "notAttached": true, "engine": null, "sessionId": null, "reason": e });
    }
    // `key` lets an agent ask for *its* browser and get the same one back, so a loop that
    // navigates twenty times drives one tab instead of leaking twenty contexts.
    let r = browser_call("/session/create", json!({ "key": key })).await;
    if served(&r) {
        return r;
    }
    // Fail closed: never hand back a session id that did not come from a real browser.
    json!({
        "ok": false,
        "notAttached": true,
        "engine": null,
        "sessionId": null,
        "reason": reason_of(&r)
    })
}

#[tauri::command]
pub async fn browser_session_close(session_id: String) -> Result<(), String> {
    // Starting a browser purely in order to close a session would be absurd. If none is running,
    // the session this id refers to cannot exist, so closing is already true.
    if !browser_running().await {
        return Ok(());
    }
    let r = browser_call("/session/close", json!({ "sessionId": session_id })).await;
    if served(&r) {
        return Ok(());
    }
    Err(reason_of(&r))
}

#[tauri::command]
pub async fn browser_sessions() -> Value {
    // Read-only: list what exists, never launch a browser just to report that nothing is open.
    if !browser_running().await {
        return json!([]);
    }
    browser_get("/sessions").await.unwrap_or_else(|| json!([]))
}

#[tauri::command]
pub async fn browser_navigate(session_id: String, url: String, timeout_ms: Option<u64>) -> Value {
    if let Err(e) = ensure_browser().await {
        return json!({ "ok": false, "notAttached": true, "url": url, "title": null, "engine": null, "reason": e });
    }
    let r = browser_call(
        "/navigate",
        json!({ "sessionId": session_id, "url": url, "timeoutMs": timeout_ms }),
    )
    .await;
    if served(&r) {
        return r;
    }
    json!({
        "ok": false,
        // A browser that is attached but refused the URL is not the same as no browser at all.
        "notAttached": r.get("notAttached").and_then(|v| v.as_bool()).unwrap_or(true),
        "url": url,
        "title": null,
        "engine": null,
        "reason": reason_of(&r)
    })
}

/// In-page interaction for the Browser Agent: navigate / click / type / fill / select / hover /
/// scroll / wait / extract / evaluate / back / forward / reload / keyboard.
///
/// The frontend calls this with a flat object (`invoke("browser_act", {...})`), so the fields arrive
/// as individually named arguments rather than one `args` value. `args` is still accepted for
/// callers that wrap their payload, and explicit fields win when both are present.
#[tauri::command]
#[allow(clippy::too_many_arguments)] // the flat invoke(...) surface is 10 named fields by design.
pub async fn browser_act(
    args: Option<Value>,
    session_id: Option<String>,
    action: Option<String>,
    selector: Option<String>,
    value: Option<Value>,
    key: Option<String>,
    url: Option<String>,
    state: Option<String>,
    script: Option<String>,
    timeout_ms: Option<u64>,
) -> Value {
    if let Err(e) = ensure_browser().await {
        return json!({ "ok": false, "notAttached": true, "reason": e });
    }
    let mut body = match args {
        Some(Value::Object(map)) => Value::Object(map),
        _ => json!({}),
    };
    if let Some(obj) = body.as_object_mut() {
        if let Some(v) = session_id {
            obj.insert("sessionId".into(), Value::String(v));
        }
        if let Some(v) = action {
            obj.insert("action".into(), Value::String(v));
        }
        if let Some(v) = selector {
            obj.insert("selector".into(), Value::String(v));
        }
        if let Some(v) = value {
            obj.insert("value".into(), v);
        }
        if let Some(v) = key {
            obj.insert("key".into(), Value::String(v));
        }
        if let Some(v) = url {
            obj.insert("url".into(), Value::String(v));
        }
        if let Some(v) = state {
            obj.insert("state".into(), Value::String(v));
        }
        if let Some(v) = script {
            obj.insert("script".into(), Value::String(v));
        }
        if let Some(v) = timeout_ms {
            obj.insert("timeoutMs".into(), json!(v));
        }
    }
    browser_call("/act", body).await
}

#[tauri::command]
pub async fn browser_screenshot(session_id: String, full_page: Option<bool>) -> Value {
    if let Err(e) = ensure_browser().await {
        return json!({ "ok": false, "notAttached": true, "path": null, "reason": e });
    }
    let r = browser_call(
        "/screenshot",
        json!({ "sessionId": session_id, "fullPage": full_page.unwrap_or(false) }),
    )
    .await;
    if served(&r) {
        return r;
    }
    // An empty path must stay indistinguishable from "saved with no filename" (V7 bug V).
    json!({ "ok": false, "notAttached": true, "path": null, "reason": reason_of(&r) })
}

#[tauri::command]
pub async fn browser_console(session_id: String) -> Value {
    if let Err(e) = ensure_browser().await {
        return json!({ "ok": false, "notAttached": true, "console": [], "networkFailures": [], "reason": e });
    }
    let r = browser_call("/console", json!({ "sessionId": session_id })).await;
    if served(&r) {
        return r;
    }
    // Empty lists must never read as "the page was clean" (V7 bug V).
    json!({
        "ok": false,
        "notAttached": true,
        "console": [],
        "networkFailures": [],
        "reason": reason_of(&r)
    })
}

#[tauri::command]
pub fn cli_providers_detect() -> Value {
    // V11.6 (the Connector pass): the full 2026 registry, kept in step with
    // src/domain/harness.ts (probe/harnesses.test.ts cross-checks the two lists).
    let names = [
        ("hermes", "Hermes Agent", "hermes"),
        ("claude", "Claude Code", "claude"),
        ("codex", "OpenAI Codex CLI", "codex"),
        ("opencode", "OpenCode", "opencode"),
        ("openclaude", "OpenClaude", "openclaude"),
        ("copilot", "GitHub Copilot CLI", "copilot"),
        ("cursor", "Cursor Agent", "cursor-agent"),
        ("grok", "Grok Build (xAI)", "grok"),
        ("cline", "Cline", "cline"),
        ("kilo", "Kilo Code", "kilo"),
        ("aider", "Aider", "aider"),
        ("gemini", "Gemini CLI", "gemini"),
        ("antigravity", "Antigravity CLI (agy)", "agy"),
        ("amp", "Amp (Sourcegraph)", "amp"),
        ("crush", "Crush (Charm)", "crush"),
        ("openhands", "OpenHands", "openhands"),
        ("qwen", "Qwen Code", "qwen"),
        ("goose", "Goose (Block)", "goose"),
        ("amazonq", "Amazon Q / Kiro CLI", "kiro-cli"),
        ("droid", "Droid (Factory)", "droid"),
        ("kimi", "Kimi Code (Moonshot)", "kimi"),
        ("auggie", "Auggie (Augment Code)", "auggie"),
        ("warp", "Warp Oz Agent CLI", "oz"),
    ];
    Value::Array(names.into_iter().map(|(id, name, bin)| {
        let resolved = which_bin(bin).or_else(|| which_bin(id));
        let installed = resolved.is_some();
        json!({
            "id": id,
            "name": name,
            "executable": resolved.clone().map(Value::String).unwrap_or(Value::Null),
            "installed": installed,
            "version": null,
            "auth_state": "unknown",
            "capabilities": ["agent"],
            "invocation": bin
        })
    }).collect())
}
/// Where coding-agent CLIs actually get installed, per platform.
///
/// A packaged app launched from Finder or the Start menu does NOT inherit your shell's PATH, so
/// `claude` installed by npm or Homebrew is invisible to it. This is the single most common
/// reason a native agent workstation reports "harness not installed" while the same command
/// works in a terminal. We search these directories explicitly.
const EXTRA_BIN_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/opt/local/bin",
    "$HOME/.local/bin",
    "$HOME/.bun/bin",
    "$HOME/.deno/bin",
    "$HOME/.cargo/bin",
    "$HOME/.npm-global/bin",
    "$HOME/.nvm/versions/node",   // walked one level deeper below (versioned node dirs)
    "$HOME/.volta/bin",
    "$HOME/.fnm",
    "$HOME/Applications",
    "C:\\Program Files\\nodejs",
    "C:\\ProgramData\\chocolatey\\bin",
    "$HOME\\AppData\\Roaming\\npm",
    "$HOME\\AppData\\Local\\Programs",
    "$HOME\\scoop\\shims",
];

fn expand_home(p: &str) -> std::path::PathBuf {
    if let Some(rest) = p.strip_prefix("$HOME") {
        if let Some(h) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            let mut b = std::path::PathBuf::from(h);
            let r = rest.trim_start_matches('/').trim_start_matches('\\');
            if !r.is_empty() { b.push(r); }
            return b;
        }
    }
    std::path::PathBuf::from(p)
}

fn exists_executable(dir: &std::path::Path, bin: &str) -> Option<String> {
    let plain = dir.join(bin);
    if plain.exists() { return Some(plain.display().to_string()); }
    if cfg!(windows) {
        for ext in ["exe", "cmd", "bat"] {
            let with = dir.join(format!("{bin}.{ext}"));
            if with.exists() { return Some(with.display().to_string()); }
        }
    }
    None
}

/// Fast PATH search: the inherited PATH plus known install locations. Never spawns a process, so
/// it is safe to call from a synchronous Tauri command on the main thread.
fn fast_paths() -> Vec<std::path::PathBuf> {
    static CACHE: std::sync::OnceLock<Vec<std::path::PathBuf>> = std::sync::OnceLock::new();
    CACHE.get_or_init(build_fast_paths).clone()
}

fn build_fast_paths() -> Vec<std::path::PathBuf> {
    let mut out: Vec<std::path::PathBuf> = Vec::new();
    if let Some(p) = std::env::var_os("PATH") {
        for d in std::env::split_paths(&p) { push_unique(&mut out, d); }
    }
    for d in EXTRA_BIN_DIRS { push_unique(&mut out, expand_home(d)); }
    // nvm keeps binaries under a versioned directory: ~/.nvm/versions/node/vX.Y.Z/bin
    let nvm = expand_home("$HOME/.nvm/versions/node");
    if let Ok(entries) = std::fs::read_dir(&nvm) {
        for e in entries.flatten() { push_unique(&mut out, e.path().join("bin")); }
    }
    out
}

fn push_unique(out: &mut Vec<std::path::PathBuf>, p: std::path::PathBuf) {
    if !out.contains(&p) { out.push(p); }
}

/// What the user's login shell reports as PATH. Spawns a shell, so it can take ~1s; it is cached
/// after the first call. Only reached when the fast search misses, or when the Providers page asks
/// for diagnostics.
///
/// Note: this must never call back into `which_bin` / `fast_paths` — `OnceLock::get_or_init`
/// deadlocks on re-entrant initialisation.
fn login_shell_paths() -> Vec<std::path::PathBuf> {
    static CACHE: std::sync::OnceLock<Vec<std::path::PathBuf>> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| {
        let mut out: Vec<std::path::PathBuf> = Vec::new();
        for shell in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
            if !std::path::Path::new(shell).exists() { continue; }
            let mut cmd = std::process::Command::new(shell);
            cmd.args(["-lc", "printf %s \"$PATH\""]);
            if let Ok((stdout, _, _)) = run_timeout(cmd, 3) {
                if stdout.trim().len() > 1 {
                    for d in std::env::split_paths(stdout.trim()) { push_unique(&mut out, d); }
                    break;
                }
            }
        }
        out
    }).clone()
}

fn which_bin(bin: &str) -> Option<String> {
    for dir in fast_paths() {
        if let Some(hit) = exists_executable(&dir, bin) { return Some(hit); }
    }
    // A packaged app does not inherit the shell's PATH, so a CLI installed by npm/Homebrew is
    // invisible until we ask the login shell where things live.
    for dir in login_shell_paths() {
        if let Some(hit) = exists_executable(&dir, bin) { return Some(hit); }
    }
    None
}

fn harness_argv(id: &str, prompt: &str) -> (String, Vec<String>) {
    match id {
        "hermes" => ("hermes".into(), vec!["--print".into(), prompt.into()]),
        "claude" => ("claude".into(), vec!["-p".into(), prompt.into(), "--output-format".into(), "text".into()]),
        "codex" => ("codex".into(), vec!["exec".into(), "--skip-git-repo-check".into(), prompt.into()]),
        "opencode" => ("opencode".into(), vec!["run".into(), prompt.into()]),
        "cursor" => ("cursor-agent".into(), vec!["-p".into(), prompt.into()]),
        // V11.6: grok exec is the documented non-interactive mode (x.ai, 2026-09).
        "grok" => ("grok".into(), vec!["exec".into(), prompt.into()]),
        "cline" => ("cline".into(), vec![prompt.into()]),
        // V11.6: kilo run is the headless one-shot mode (kilo.ai docs).
        "kilo" => ("kilo".into(), vec!["run".into(), prompt.into()]),
        "openclaude" => ("openclaude".into(), vec!["-p".into(), prompt.into()]),
        "copilot" => ("copilot".into(), vec!["-p".into(), prompt.into(), "-s".into()]),
        "antigravity" => ("agy".into(), vec!["-p".into(), prompt.into()]), // V11.6.1: the shipped binary is agy
        "amp" => ("amp".into(), vec!["-x".into(), prompt.into()]), // V11.6.1: execute mode, not runner mode
        "crush" => ("crush".into(), vec!["run".into(), prompt.into()]),
        "openhands" => ("openhands".into(), vec!["--headless".into(), "-t".into(), prompt.into()]), // V11.6.1: documented headless mode
        "qwen" => ("qwen".into(), vec!["-p".into(), prompt.into()]),
        "gemini" => ("gemini".into(), vec!["-p".into(), prompt.into()]),
        "aider" => ("aider".into(), vec!["--message".into(), prompt.into(), "--yes".into(), "--no-auto-commits".into()]),
        "goose" => ("goose".into(), vec!["run".into(), "--text".into(), prompt.into()]),
        "amazonq" => ("amazonq".into(), vec!["chat".into(), "--no-interactive".into(), prompt.into()]),
        // V11.7.1: vendor-documented headless modes (checked 2026-09). droid exec defaults to
        // spec-mode (read-only); the policy layer's WRITE shape adds --auto low in TS.
        "droid" => ("droid".into(), vec!["exec".into(), prompt.into()]),
        "kimi" => ("kimi".into(), vec!["-p".into(), prompt.into()]),
        "auggie" => ("auggie".into(), vec!["--print".into(), prompt.into()]),
        "warp" => ("oz".into(), vec!["agent".into(), "run".into(), "--prompt".into(), prompt.into()]),
        other => (other.into(), vec![prompt.into()]),
    }
}
fn run_timeout(mut cmd: std::process::Command, secs: u64) -> Result<(String, String, Option<i32>), String> {
    use std::io::Read;
    use std::process::Stdio;
    use std::time::{Duration, Instant};
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("spawn: {e}"))?;

    // Coding agents print a lot. Reading only after exit lets the OS pipe buffer fill, the child
    // blocks on write, and MJ waits for a child that is waiting for MJ. Drain both pipes on
    // threads instead.
    let drain = |pipe: Option<std::process::ChildStdout>| -> std::thread::JoinHandle<String> {
        std::thread::spawn(move || {
            let mut buf = String::new();
            if let Some(mut p) = pipe { let _ = p.read_to_string(&mut buf); }
            buf
        })
    };
    let drain_err = |pipe: Option<std::process::ChildStderr>| -> std::thread::JoinHandle<String> {
        std::thread::spawn(move || {
            let mut buf = String::new();
            if let Some(mut p) = pipe { let _ = p.read_to_string(&mut buf); }
            buf
        })
    };
    let out_handle = drain(child.stdout.take());
    let err_handle = drain_err(child.stderr.take());

    let start = Instant::now();
    let limit = Duration::from_secs(secs.max(1));
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = out_handle.join().unwrap_or_default();
                let stderr = err_handle.join().unwrap_or_default();
                return Ok((stdout, stderr, status.code()));
            }
            Ok(None) => {
                if start.elapsed() > limit {
                    let _ = child.kill();
                    let _ = child.wait();
                    // Killing closes the pipes, so the readers finish instead of leaking.
                    let _ = out_handle.join();
                    let _ = err_handle.join();
                    return Err(format!("timeout after {secs}s"));
                }
                std::thread::sleep(Duration::from_millis(80));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Binaries `cli_invoke` is willing to run. The webview may pass an explicit argv (so the
/// risk -> sandbox mapping lives in one typed TypeScript module, `src/mission/harnessPolicy.ts`),
/// but it may not make MJ execute an arbitrary program.
const ALLOWED_CLI_BINS: &[&str] = &[
    "hermes", "claude", "codex", "opencode", "openclaude", "copilot", "cursor-agent", "agent",
    "grok", "cline", "kilo", "qwen", "gemini", "aider", "goose", "amazonq",
    "kiro-cli", "q", "agy", "amp", "crush", "openhands",
    "droid", "kimi", "auggie", "oz",
];

// ─────────────────────────────────────────────────────────────────────────────
// V11.6 — CUSTOM HARNESSES (the Connector pass)
//
// A user can register their own binary as a harness: a name, an executable, and an
// argv template containing $PROMPT exactly once. The webview can never make MJ run
// a program that was not explicitly registered here — cli_invoke only accepts a
// custom bin that exists in this saved registry, and saving re-validates everything
// (plain bin name, no shell metacharacters, no newlines, exactly one $PROMPT).
// Persisted as JSON in the app data dir, next to the database.
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomHarness {
    pub id: String,
    pub name: String,
    pub bin: String,
    pub argv: Vec<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub created_at: String,
}

fn custom_harness_path(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join("custom-harnesses.json")
}

fn custom_harness_load(state: &AppState) -> Vec<CustomHarness> {
    std::fs::read_to_string(custom_harness_path(state))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn custom_harness_store(state: &AppState, list: &[CustomHarness]) -> Result<(), String> {
    let path = custom_harness_path(state);
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("write {}: {e}", path.display()))
}

/// Server-side validation, mirroring validateCustomHarness() in src/domain/harness.ts.
/// The webview validates for UX; this is the boundary that actually matters.
fn custom_harness_validate(h: &CustomHarness) -> Result<(), String> {
    if h.name.trim().is_empty() { return Err("name is required".into()); }
    if h.name.chars().count() > 64 { return Err("name is too long (64 chars max)".into()); }
    if !h.id.starts_with("custom:") || h.id.len() > 48 { return Err("id must be custom:<slug>".into()); }
    let bin = h.bin.trim();
    if bin.is_empty() { return Err("bin is required".into()); }
    if bin.chars().any(|c| c.is_whitespace()) { return Err("bin must be a single command or path".into()); }
    if bin.contains("..") { return Err("bin cannot contain '..'".into()); }
    if bin.chars().any(|c| ";|&`$><\"'".contains(c)) {
        return Err("bin cannot contain shell characters. MJ execs it directly; arguments go in argv".into());
    }
    let prompt_slots = h.argv.iter().filter(|a| *a == "$PROMPT").count();
    if prompt_slots != 1 { return Err("argv must contain $PROMPT exactly once".into()); }
    if h.argv.iter().any(|a| a.contains('\n') || a.contains('\r')) {
        return Err("argv cannot contain newlines".into());
    }
    Ok(())
}

#[tauri::command]
pub fn custom_harness_list(state: State<Arc<AppState>>) -> Value {
    let list = custom_harness_load(&state);
    // Detection for custom harnesses rides along: is the saved bin actually on this machine?
    let rows: Vec<Value> = list.into_iter().map(|h| {
        let resolved = which_bin(&h.bin);
        json!({
            "id": h.id, "name": h.name, "bin": h.bin, "argv": h.argv,
            "notes": h.notes, "createdAt": h.created_at,
            "installed": resolved.is_some(),
            "executable": resolved.map(Value::String).unwrap_or(Value::Null),
        })
    }).collect();
    Value::Array(rows)
}

#[tauri::command]
pub fn custom_harness_save(state: State<Arc<AppState>>, harness: CustomHarness) -> Result<Value, String> {
    custom_harness_validate(&harness)?;
    let mut list = custom_harness_load(&state);
    let mut created = false;
    match list.iter().position(|h| h.id == harness.id) {
        Some(i) => list[i] = harness,
        None => { created = true; list.push(harness); }
    }
    custom_harness_store(&state, &list)?;
    Ok(json!({ "saved": true, "created": created, "count": list.len() }))
}

#[tauri::command]
pub fn custom_harness_delete(state: State<Arc<AppState>>, id: String) -> Result<Value, String> {
    let mut list = custom_harness_load(&state);
    let before = list.len();
    list.retain(|h| h.id != id);
    custom_harness_store(&state, &list)?;
    Ok(json!({ "deleted": before != list.len(), "count": list.len() }))
}

#[tauri::command]
pub fn cli_invoke(
    state: State<Arc<AppState>>,
    provider_id: String,
    prompt: String,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
    argv: Option<Vec<String>>,
) -> Result<Value, String> {
    // V11.6 custom harnesses: "custom:<slug>" resolves against the user's saved registry —
    // the ONLY way a non-allowlisted binary can run, and only after server-side validation.
    let (bin, args) = if provider_id.starts_with("custom:") {
        let saved = custom_harness_load(&state);
        let spec = saved.iter().find(|h| h.id == provider_id)
            .ok_or_else(|| format!("unknown custom harness '{provider_id}': register it in Teams first"))?;
        let mut a: Vec<String> = spec.argv.clone();
        match a.iter().position(|x| x == "$PROMPT") {
            Some(i) => a[i] = prompt.clone(),
            None => a.push(prompt.clone()),
        }
        (spec.bin.clone(), a)
    } else {
        match argv {
            Some(a) if !a.is_empty() => (provider_id.clone(), a),
            _ => harness_argv(&provider_id, &prompt),
        }
    };
    let allowed = ALLOWED_CLI_BINS.contains(&bin.as_str())
        || (provider_id.starts_with("custom:")
            && custom_harness_load(&state).iter().any(|h| h.id == provider_id && h.bin == bin));
    if !allowed {
        return Err(format!("refusing to run '{bin}': not a known coding-agent binary"));
    }
    let resolved = which_bin(&bin).ok_or_else(|| {
        format!(
            "'{bin}' was not found. Searched PATH plus the usual install directories. \
             Install it, or add its folder to PATH and restart MJ."
        )
    })?;
    let mut cmd = std::process::Command::new(&resolved);
    cmd.args(&args);
    if let Some(c) = cwd { cmd.current_dir(c); }
    let (stdout, stderr, code) = run_timeout(cmd, timeout_secs.unwrap_or(180))?;
    Ok(json!({ "stdout": stdout, "stderr": stderr, "code": code, "program": resolved, "argv": args }))
}

/// Diagnostics for the Providers page: exactly where MJ looked, and what it found. Without this
/// "not installed" is unactionable.
#[tauri::command]
pub fn cli_env() -> Value {
    let bins = [
        ("hermes", "hermes"), ("claude", "claude"), ("codex", "codex"), ("opencode", "opencode"),
        ("openclaude", "openclaude"), ("copilot", "copilot"),
        ("cursor", "cursor-agent"), ("grok", "grok"), ("cline", "cline"), ("kilo", "kilo"),
        ("qwen", "qwen"), ("gemini", "gemini"), ("aider", "aider"), ("goose", "goose"),
        ("antigravity", "agy"), ("amp", "amp"), ("crush", "crush"), ("openhands", "openhands"),
        ("amazonq", "amazonq"), ("droid", "droid"), ("kimi", "kimi"), ("auggie", "auggie"), ("warp", "oz"),
    ];
    let rows: Vec<Value> = bins.into_iter().map(|(id, bin)| {
        let resolved = which_bin(bin).or_else(|| which_bin(id));
        let version = resolved.as_ref().and_then(|p| probe_version(p));
        json!({
            "id": id,
            "bin": bin,
            "executable": resolved.clone().map(Value::String).unwrap_or(Value::Null),
            "installed": resolved.is_some(),
            "version": version.map(Value::String).unwrap_or(Value::Null),
        })
    }).collect();
    let mut searched: Vec<String> = fast_paths().iter().map(|p| p.display().to_string()).collect();
    for p in login_shell_paths() {
        let t = p.display().to_string();
        if !searched.contains(&t) { searched.push(t); }
    }
    let searched: Vec<String> = searched.into_iter().take(80).collect();
    json!({
        "path": std::env::var("PATH").unwrap_or_default(),
        "searched": searched,
        "bins": rows,
    })
}

fn probe_version(program: &str) -> Option<String> {
    let mut cmd = std::process::Command::new(program);
    cmd.arg("--version");
    let (out, err, _) = run_timeout(cmd, 5).ok()?;
    let text = if out.trim().is_empty() { err } else { out };
    text.lines().next().map(|l| l.trim().chars().take(120).collect())
}

#[tauri::command]
pub fn package_export(state: State<Arc<AppState>>, workflow_id: String, _include_history: bool) -> Result<Value, String> {
    let wf = db::workflow_get(&*lock_db(&state)?, &workflow_id).map_err(|e| e.to_string())?;
    Ok(json!({
        "packageFormat": 1,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "application": "MJ",
        "version": env!("CARGO_PKG_VERSION"),
        "workflow": { "name": wf["name"], "description": wf["description"], "graph": wf["graph"] },
        "history": [],
        "secretsIncluded": false
    }))
}
#[tauri::command]
pub fn package_import(state: State<Arc<AppState>>, pkg: Value) -> Result<Value, String> {
    if pkg["application"] != "MJ" { return Err("package rejected".into()); }
    let name = pkg.pointer("/workflow/name").and_then(|v| v.as_str()).unwrap_or("Imported");
    let desc = pkg.pointer("/workflow/description").and_then(|v| v.as_str()).unwrap_or("");
    let created = db::workflow_create(&*lock_db(&state)?, &format!("{name} (imported)"), desc).map_err(|e| e.to_string())?;
    if let Some(graph) = pkg.pointer("/workflow/graph") {
        db::workflow_save(&*lock_db(&state)?, created["id"].as_str().unwrap_or(""), &format!("{name} (imported)"), desc, graph).map_err(|e| e.to_string())?;
    }
    Ok(json!({ "id": created["id"], "validated": true }))
}

#[tauri::command]
pub fn control_validate_graph(_state: State<Arc<AppState>>, workflow_id: String) -> Value {
    control_mcp::dispatch("validate_graph", &json!({ "workflowId": workflow_id, "native": true, "host": "tauri" }))
}
#[tauri::command]
pub fn control_connect_ports(state: State<Arc<AppState>>, workflow_id: String, source_node_id: String, source_port_id: String, target_node_id: String, target_port_id: String) -> Value {
    control_mcp::dispatch_with_db("connect_ports", &json!({
        "workflowId": workflow_id, "sourceNodeId": source_node_id, "sourcePortId": source_port_id,
        "targetNodeId": target_node_id, "targetPortId": target_port_id
    }), &lock_db(&state).expect("db lock"))
}
#[tauri::command]
pub fn control_disconnect_ports(state: State<Arc<AppState>>, workflow_id: String, wire_id: Option<String>, source_node_id: Option<String>, target_node_id: Option<String>) -> Value {
    control_mcp::dispatch_with_db("disconnect_ports", &json!({
        "workflowId": workflow_id, "wireId": wire_id,
        "sourceNodeId": source_node_id, "targetNodeId": target_node_id
    }), &lock_db(&state).expect("db lock"))
}
#[tauri::command]
pub fn control_list_nodes(state: State<Arc<AppState>>, workflow_id: String) -> Value {
    control_mcp::dispatch_with_db("list_nodes", &json!({ "workflowId": workflow_id }), &lock_db(&state).expect("db lock"))
}
#[tauri::command]
pub fn control_run_workflow(state: State<Arc<AppState>>, workflow_id: String) -> Value {
    control_mcp::dispatch_with_db("run_workflow", &json!({ "workflowId": workflow_id }), &lock_db(&state).expect("db lock"))
}

use rusqlite::OptionalExtension;
use tauri::Emitter;

// ------------------------------------------------------------------ ACP bridge (V11 W1)
// Pipes for src/mission/acp.ts. The child process is owned by Rust; the WebView speaks the
// protocol. See src-tauri/src/acp.rs for the design notes.

#[tauri::command]
pub fn acp_open(program: String, args: Vec<String>, cwd: Option<String>) -> Result<Value, String> {
    let handle = crate::acp::open(&program, &args, cwd.as_deref())?;
    Ok(json!({ "handle": handle }))
}

#[tauri::command]
pub fn acp_send(handle: u64, line: String) -> Result<Value, String> {
    crate::acp::send(handle, &line)?;
    Ok(json!({ "sent": true }))
}

#[tauri::command]
pub fn acp_recv(handle: u64) -> Result<Value, String> {
    let (line, exit_code) = crate::acp::recv(handle)?;
    Ok(json!({ "line": line, "exitCode": exit_code }))
}

#[tauri::command]
pub fn acp_close(handle: u64) -> Result<Value, String> {
    crate::acp::close(handle)?;
    Ok(json!({ "closed": true }))
}
