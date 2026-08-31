use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::path::Path;
use uuid::Uuid;

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    init(&conn)?;
    ensure_skill_usage_columns(&conn)?;
    Ok(conn)
}

/// V11: the shipped schema, extracted so tests can build exactly this in memory
/// (the code that ships is the code that was tested).
pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            graph_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS versions (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            label TEXT NOT NULL,
            graph_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS executions (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            workflow_version INTEGER NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            error TEXT,
            stats_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            execution_id TEXT NOT NULL,
            ts TEXT NOT NULL,
            kind TEXT NOT NULL,
            level TEXT NOT NULL,
            node_id TEXT,
            data_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            node_key TEXT NOT NULL,
            kind TEXT NOT NULL,
            content TEXT NOT NULL,
            tags_json TEXT NOT NULL,
            importance REAL NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            node_key TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            procedure TEXT NOT NULL,
            origin TEXT NOT NULL,
            version INTEGER NOT NULL,
            score REAL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feedback (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            node_key TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS evolution (
            id TEXT PRIMARY KEY,
            node_key TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            decision TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            decided_at TEXT
        );
        CREATE TABLE IF NOT EXISTS mcp (
            id TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS approvals (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            node_key TEXT NOT NULL,
            summary TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dlq (
            id TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS node_state (
            node_key TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS run_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS evaluations (
            id TEXT PRIMARY KEY,
            node_key TEXT NOT NULL,
            execution_id TEXT,
            suite_json TEXT NOT NULL,
            score REAL NOT NULL,
            details_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_evaluations_node ON evaluations(node_key, created_at);
        CREATE TABLE IF NOT EXISTS suites (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            cases_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "
    )?;
    Ok(())
}

/// V11 (W6): skill usage columns. ALTER TABLE cannot say "add if missing" in SQLite, so probe
/// pragma_table_info first. An older database file upgrades in place, silently, once.
fn ensure_skill_usage_columns(conn: &Connection) -> rusqlite::Result<()> {
    let has: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM pragma_table_info('skills') WHERE name='use_count'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    if has.is_none() {
        conn.execute_batch(
            "ALTER TABLE skills ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0;
             ALTER TABLE skills ADD COLUMN last_used_at TEXT;",
        )?;
    }
    Ok(())
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn nid(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4().simple())
}

pub fn workflow_list(conn: &Connection) -> rusqlite::Result<Value> {
    let mut stmt = conn.prepare("SELECT id, name, description, graph_json, created_at, updated_at FROM workflows ORDER BY updated_at DESC")?;
    let rows = stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, String>(0)?,
            "name": r.get::<_, String>(1)?,
            "description": r.get::<_, String>(2)?,
            "graph": serde_json::from_str::<Value>(&r.get::<_, String>(3)?).unwrap_or(json!({})),
            "createdAt": r.get::<_, String>(4)?,
            "updatedAt": r.get::<_, String>(5)?,
        }))
    })?;
    Ok(Value::Array(rows.filter_map(|r| r.ok()).collect()))
}

pub fn workflow_get(conn: &Connection, id: &str) -> rusqlite::Result<Value> {
    conn.query_row(
        "SELECT id, name, description, graph_json, created_at, updated_at FROM workflows WHERE id=?1",
        [id],
        |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "description": r.get::<_, String>(2)?,
                "graph": serde_json::from_str::<Value>(&r.get::<_, String>(3)?).unwrap_or(json!({})),
                "createdAt": r.get::<_, String>(4)?,
                "updatedAt": r.get::<_, String>(5)?,
            }))
        },
    )
}

pub fn workflow_create(conn: &Connection, name: &str, description: &str) -> rusqlite::Result<Value> {
    let id = nid("wf");
    let ts = now();
    let graph = json!({
        "schemaVersion": 2,
        "id": id,
        "name": name,
        "nodes": [],
        "connections": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
        "groups": [],
        "notes": []
    });
    conn.execute(
        "INSERT INTO workflows (id,name,description,graph_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
        params![id, name, description, graph.to_string(), ts, ts],
    )?;
    Ok(json!({ "id": id }))
}

pub fn workflow_save(conn: &Connection, id: &str, name: &str, description: &str, graph: &Value) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE workflows SET name=?2, description=?3, graph_json=?4, updated_at=?5 WHERE id=?1",
        params![id, name, description, graph.to_string(), now()],
    )?;
    Ok(())
}

pub fn workflow_delete(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM workflows WHERE id=?1", [id])?;
    Ok(())
}

pub fn execution_create(conn: &Connection, workflow_id: &str, workflow_version: i64) -> rusqlite::Result<Value> {
    let id = nid("exec");
    let stats = json!({"nodesRun":0,"nodesFailed":0,"retries":0,"inputTokens":0,"outputTokens":0,"durationMs":0,"costUsd":0,"evaluationScores":[]});
    conn.execute(
        "INSERT INTO executions (id,workflow_id,workflow_version,status,started_at,ended_at,error,stats_json) VALUES (?1,?2,?3,'RUNNING',?4,NULL,NULL,?5)",
        params![id, workflow_id, workflow_version, now(), stats.to_string()],
    )?;
    Ok(json!({ "id": id }))
}

pub fn execution_finish(conn: &Connection, id: &str, status: &str, error: Option<&str>, stats: &Value) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE executions SET status=?2, error=?3, stats_json=?4, ended_at=?5 WHERE id=?1",
        params![id, status, error, stats.to_string(), now()],
    )?;
    Ok(())
}

pub fn execution_list(conn: &Connection) -> rusqlite::Result<Value> {
    let mut stmt = conn.prepare("SELECT id, workflow_id, workflow_version, status, started_at, ended_at, error, stats_json FROM executions ORDER BY started_at DESC LIMIT 200")?;
    let rows = stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, String>(0)?,
            "workflowId": r.get::<_, String>(1)?,
            "workflowVersion": r.get::<_, i64>(2)?,
            "status": r.get::<_, String>(3)?,
            "startedAt": r.get::<_, String>(4)?,
            "endedAt": r.get::<_, Option<String>>(5)?,
            "error": r.get::<_, Option<String>>(6)?,
            "stats": serde_json::from_str::<Value>(&r.get::<_, String>(7)?).unwrap_or(json!({})),
        }))
    })?;
    Ok(Value::Array(rows.filter_map(|r| r.ok()).collect()))
}

pub fn event_emit(conn: &Connection, execution_id: &str, kind: &str, level: &str, node_id: Option<&str>, data: &Value) -> rusqlite::Result<Value> {
    conn.execute(
        "INSERT INTO events (execution_id, ts, kind, level, node_id, data_json) VALUES (?1,?2,?3,?4,?5,?6)",
        params![execution_id, now(), kind, level, node_id, data.to_string()],
    )?;
    let seq = conn.last_insert_rowid();
    Ok(json!({
        "seq": seq,
        "ts": now(),
        "kind": kind,
        "level": level,
        "nodeId": node_id,
        "executionId": execution_id,
        "data": data,
    }))
}

pub fn execution_events(conn: &Connection, execution_id: &str) -> rusqlite::Result<Value> {
    let mut stmt = conn.prepare("SELECT seq, ts, kind, level, node_id, data_json FROM events WHERE execution_id=?1 ORDER BY seq")?;
    let rows = stmt.query_map([execution_id], |r| {
        Ok(json!({
            "seq": r.get::<_, i64>(0)?,
            "ts": r.get::<_, String>(1)?,
            "kind": r.get::<_, String>(2)?,
            "level": r.get::<_, String>(3)?,
            "nodeId": r.get::<_, Option<String>>(4)?,
            "executionId": execution_id,
            "data": serde_json::from_str::<Value>(&r.get::<_, String>(5)?).unwrap_or(json!({})),
        }))
    })?;
    Ok(Value::Array(rows.filter_map(|r| r.ok()).collect()))
}

pub fn memory_add(conn: &Connection, node_key: &str, kind: &str, content: &str, tags: &Value, importance: f64) -> rusqlite::Result<Value> {
    let id = nid("mem");
    conn.execute(
        "INSERT INTO memories (id,node_key,kind,content,tags_json,importance,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![id, node_key, kind, content, tags.to_string(), importance, now()],
    )?;
    Ok(json!({ "id": id }))
}

pub fn memory_search(conn: &Connection, node_key: &str, query: &str, limit: i64) -> rusqlite::Result<Value> {
    let q = format!("%{query}%");
    let mut stmt = conn.prepare("SELECT id, node_key, kind, content, tags_json, importance, created_at FROM memories WHERE node_key=?1 AND content LIKE ?2 ORDER BY importance DESC LIMIT ?3")?;
    let rows = stmt.query_map(params![node_key, q, limit], |r| {
        Ok(json!({
            "id": r.get::<_, String>(0)?,
            "nodeKey": r.get::<_, String>(1)?,
            "kind": r.get::<_, String>(2)?,
            "content": r.get::<_, String>(3)?,
            "tags": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(json!([])),
            "importance": r.get::<_, f64>(5)?,
            "createdAt": r.get::<_, String>(6)?,
        }))
    })?;
    Ok(Value::Array(rows.filter_map(|r| r.ok()).collect()))
}

pub fn skill_upsert(conn: &Connection, node_key: &str, name: &str, description: &str, procedure: &str, origin: &str) -> rusqlite::Result<Value> {
    let id = nid("skill");
    let ts = now();
    conn.execute(
        "INSERT INTO skills (id,node_key,name,description,procedure,origin,version,score,active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,1,NULL,1,?7,?7)",
        params![id, node_key, name, description, procedure, origin, ts],
    )?;
    Ok(json!({ "id": id, "version": 1 }))
}

pub fn skills_list(conn: &Connection, node_key: &str) -> rusqlite::Result<Value> {
    let mut stmt = conn.prepare("SELECT id,node_key,name,description,procedure,origin,version,score,active,created_at,updated_at FROM skills WHERE node_key=?1")?;
    let rows: Vec<Value> = stmt
        .query_map([node_key], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "nodeKey": r.get::<_, String>(1)?,
                "name": r.get::<_, String>(2)?,
                "description": r.get::<_, String>(3)?,
                "procedure": r.get::<_, String>(4)?,
                "origin": r.get::<_, String>(5)?,
                "version": r.get::<_, i64>(6)?,
                "score": r.get::<_, Option<f64>>(7)?,
                "active": r.get::<_, i64>(8)? == 1,
                "createdAt": r.get::<_, String>(9)?,
                "updatedAt": r.get::<_, String>(10)?,
                "preconditions": "",
                "toolStrategy": "",
                "verificationStrategy": "",
                "knownFailureModes": "",
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
    let active: Vec<Value> = rows.iter().filter(|s| s["active"].as_bool().unwrap_or(false)).cloned().collect();
    Ok(json!({ "skills": active, "all": rows }))
}

pub fn evolution_propose(conn: &Connection, cand: &Value) -> rusqlite::Result<Value> {
    let id = nid("evo");
    let mut payload = cand.clone();
    payload["id"] = json!(id);
    payload["decision"] = json!("PENDING");
    payload["status"] = json!("PROPOSED");
    payload["createdAt"] = json!(now());
    payload["decidedAt"] = Value::Null;
    conn.execute(
        "INSERT INTO evolution (id,node_key,payload_json,decision,status,created_at,decided_at) VALUES (?1,?2,?3,'PENDING','PROPOSED',?4,NULL)",
        params![id, cand["nodeKey"].as_str().unwrap_or(""), payload.to_string(), now()],
    )?;
    Ok(json!({ "id": id }))
}

pub fn evolution_list(conn: &Connection, node_key: Option<&str>) -> rusqlite::Result<Value> {
    let sql = if node_key.is_some() {
        "SELECT payload_json FROM evolution WHERE node_key=?1 ORDER BY created_at DESC"
    } else {
        "SELECT payload_json FROM evolution ORDER BY created_at DESC"
    };
    let mut stmt = conn.prepare(sql)?;
    let mut rows = if let Some(k) = node_key {
        stmt.query([k])?
    } else {
        stmt.query([])?
    };
    let mut out = Vec::new();
    while let Some(r) = rows.next()? {
        let s: String = r.get(0)?;
        if let Ok(v) = serde_json::from_str::<Value>(&s) {
            out.push(v);
        }
    }
    Ok(Value::Array(out))
}

pub fn evolution_decide(conn: &Connection, id: &str, decision: &str) -> rusqlite::Result<Value> {
    let ts = now();
    conn.execute(
        "UPDATE evolution SET decision=?2, status='DECIDED', decided_at=?3 WHERE id=?1",
        params![id, decision, ts],
    )?;
    let payload: Option<String> = conn
        .query_row("SELECT payload_json FROM evolution WHERE id=?1", [id], |r| r.get(0))
        .optional()?;
    if let Some(p) = payload {
        if let Ok(mut v) = serde_json::from_str::<Value>(&p) {
            v["decision"] = json!(decision);
            v["status"] = json!("DECIDED");
            v["decidedAt"] = json!(ts);
            conn.execute("UPDATE evolution SET payload_json=?2 WHERE id=?1", params![id, v.to_string()])?;
        }
    }
    Ok(json!({ "ok": true }))
}

pub fn mcp_list(conn: &Connection) -> rusqlite::Result<Value> {
    let mut stmt = conn.prepare("SELECT payload_json FROM mcp")?;
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(r) = rows.next()? {
        let s: String = r.get(0)?;
        if let Ok(v) = serde_json::from_str::<Value>(&s) {
            out.push(v);
        }
    }
    Ok(Value::Array(out))
}

pub fn mcp_save(conn: &Connection, cfg: &Value) -> rusqlite::Result<Value> {
    let id = cfg["id"].as_str().map(|s| s.to_string()).unwrap_or_else(|| nid("mcp"));
    let mut payload = cfg.clone();
    payload["id"] = json!(id);
    payload["transport"] = json!(cfg["transport"].as_str().unwrap_or("stdio"));
    payload["state"] = json!("AVAILABLE");
    payload["updatedAt"] = json!(now());
    if payload.get("createdAt").is_none() {
        payload["createdAt"] = json!(now());
    }
    if payload.get("config").is_none() {
        payload["config"] = json!({
            "transport": "stdio",
            "command": cfg["command"],
            "args": cfg["args"],
            "enabled": cfg["enabled"],
            "pinned": cfg["pinned"]
        });
    }
    conn.execute(
        "INSERT INTO mcp (id, payload_json) VALUES (?1,?2) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json",
        params![id, payload.to_string()],
    )?;
    Ok(json!({ "id": id }))
}

pub fn mcp_remove(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM mcp WHERE id=?1", [id])?;
    Ok(())
}

pub fn approval_request(conn: &Connection, execution_id: &str, node_key: &str, summary: &str, payload: &Value) -> rusqlite::Result<Value> {
    let id = nid("appr");
    conn.execute(
        "INSERT INTO approvals (id,execution_id,node_key,summary,payload_json,status,created_at) VALUES (?1,?2,?3,?4,?5,'OPEN',?6)",
        params![id, execution_id, node_key, summary, payload.to_string(), now()],
    )?;
    Ok(json!({ "id": id }))
}

pub fn approval_get(conn: &Connection, execution_id: &str, node_key: &str) -> rusqlite::Result<Value> {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT status, id FROM approvals WHERE execution_id=?1 AND node_key=?2 AND status!='OPEN' ORDER BY created_at DESC LIMIT 1",
            params![execution_id, node_key],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    match row {
        Some((status, _)) => Ok(json!({ "decided": true, "status": status })),
        None => Ok(json!({ "decided": false })),
    }
}

pub fn approval_list(conn: &Connection) -> rusqlite::Result<Value> {
    let mut stmt = conn.prepare("SELECT id,execution_id,node_key,summary,payload_json,status,created_at FROM approvals WHERE status='OPEN'")?;
    let rows = stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, String>(0)?,
            "executionId": r.get::<_, String>(1)?,
            "nodeKey": r.get::<_, String>(2)?,
            "summary": r.get::<_, String>(3)?,
            "payload": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(json!({})),
            "status": r.get::<_, String>(5)?,
            "createdAt": r.get::<_, String>(6)?,
        }))
    })?;
    Ok(Value::Array(rows.filter_map(|r| r.ok()).collect()))
}

pub fn approval_decide(conn: &Connection, id: &str, decision: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE approvals SET status=?2 WHERE id=?1", params![id, decision])?;
    Ok(())
}

pub fn feedback_add(conn: &Connection, execution_id: &str, node_key: &str, rating: i64, comment: &str) -> rusqlite::Result<Value> {
    let id = nid("fb");
    conn.execute(
        "INSERT INTO feedback (id,execution_id,node_key,rating,comment,created_at) VALUES (?1,?2,?3,?4,?5,?6)",
        params![id, execution_id, node_key, rating, comment, now()],
    )?;
    Ok(json!({ "id": id }))
}

pub fn feedback_list(conn: &Connection) -> rusqlite::Result<Value> {
    let mut stmt = conn.prepare("SELECT id,execution_id,node_key,rating,comment,created_at FROM feedback ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], |r| {
        Ok(json!({
            "id": r.get::<_, String>(0)?,
            "executionId": r.get::<_, String>(1)?,
            "nodeKey": r.get::<_, String>(2)?,
            "rating": r.get::<_, i64>(3)?,
            "comment": r.get::<_, String>(4)?,
            "createdAt": r.get::<_, String>(5)?,
        }))
    })?;
    Ok(Value::Array(rows.filter_map(|r| r.ok()).collect()))
}

pub fn dlq_add(conn: &Connection, payload: &Value) -> rusqlite::Result<Value> {
    let id = nid("dlq");
    let mut p = payload.clone();
    p["id"] = json!(id);
    p["status"] = json!("OPEN");
    p["createdAt"] = json!(now());
    conn.execute("INSERT INTO dlq (id, payload_json) VALUES (?1,?2)", params![id, p.to_string()])?;
    Ok(json!({ "id": id }))
}

pub fn dlq_list(conn: &Connection) -> rusqlite::Result<Value> {
    let mut stmt = conn.prepare("SELECT payload_json FROM dlq")?;
    let mut rows = stmt.query([])?;
    let mut out = Vec::new();
    while let Some(r) = rows.next()? {
        let s: String = r.get(0)?;
        if let Ok(v) = serde_json::from_str::<Value>(&s) {
            if v["status"] == "OPEN" {
                out.push(v);
            }
        }
    }
    Ok(Value::Array(out))
}

pub fn dlq_resolve(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let payload: Option<String> = conn.query_row("SELECT payload_json FROM dlq WHERE id=?1", [id], |r| r.get(0)).optional()?;
    if let Some(p) = payload {
        if let Ok(mut v) = serde_json::from_str::<Value>(&p) {
            v["status"] = json!("RESOLVED");
            conn.execute("UPDATE dlq SET payload_json=?2 WHERE id=?1", params![id, v.to_string()])?;
        }
    }
    Ok(())
}

pub fn db_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

pub fn seed_mcp_if_empty(conn: &Connection) -> rusqlite::Result<()> {
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM mcp", [], |r| r.get(0))?;
    if n > 0 {
        return Ok(());
    }
    let catalog = [
        ("mcp.filesystem", "Filesystem", "npx", json!(["-y", "tsx", "vendor/mcp-servers-reference/src/filesystem/index.ts"])),
        ("mcp.git", "Git", "python", json!(["-m", "mcp_server_git"])),
        ("mcp.memory", "Memory", "npx", json!(["-y", "tsx", "vendor/mcp-servers-reference/src/memory/index.ts"])),
        ("mcp.sequential-thinking", "Sequential Thinking", "npx", json!(["-y", "tsx", "vendor/mcp-servers-reference/src/sequentialthinking/index.ts"])),
        ("mcp.time", "Time", "python", json!(["-m", "mcp_server_time"])),
        ("mcp.github", "GitHub", "github-mcp-server", json!(["stdio"])),
        ("mcp.control", "Control MCP", "mj-control-mcp", json!(["stdio"])),
    ];
    let ts = now();
    for (id, name, command, args) in catalog {
        let payload = json!({
            "id": id,
            "name": name,
            "transport": "stdio",
            "config": { "transport": "stdio", "command": command, "args": args, "enabled": id == "mcp.control", "pinned": true },
            "state": "AVAILABLE",
            "createdAt": ts,
            "updatedAt": ts,
        });
        conn.execute("INSERT INTO mcp (id, payload_json) VALUES (?1,?2)", params![id, payload.to_string()])?;
    }
    Ok(())
}

// ------------------------------------------------------------------ V11 (W6): the stub ledger, closed

/// Record a real usage touch for skills. Returns how many rows actually updated, so a caller
/// can distinguish "counted" from "counted nothing because the ids were stale".
pub fn skill_touch(conn: &Connection, skill_ids: &[String]) -> rusqlite::Result<Value> {
    let ts = now();
    let mut touched = 0i64;
    for id in skill_ids {
        touched += conn
            .execute(
                "UPDATE skills SET use_count = use_count + 1, last_used_at = ?2 WHERE id = ?1",
                params![id, ts],
            )
            .unwrap_or(0) as i64;
    }
    Ok(json!({ "touched": touched, "requested": skill_ids.len(), "at": ts }))
}

/// Persist one evaluation result with a real id, or replace nothing — the id is what the UI
/// links history entries by, so it must be the stored one.
pub fn evaluation_save(
    conn: &Connection,
    node_key: &str,
    execution_id: Option<&str>,
    suite: &Value,
    score: f64,
    details: &Value,
) -> rusqlite::Result<Value> {
    let id = nid("eval");
    let ts = now();
    conn.execute(
        "INSERT INTO evaluations (id, node_key, execution_id, suite_json, score, details_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, node_key, execution_id, suite.to_string(), score, details.to_string(), ts],
    )?;
    Ok(json!({ "id": id, "nodeKey": node_key, "score": score, "createdAt": ts }))
}

/// The real history for a node, newest first. An empty array now genuinely means "never evaluated".
pub fn evaluation_history(conn: &Connection, node_key: &str) -> rusqlite::Result<Value> {
    let mut st = conn
        .prepare("SELECT id, execution_id, suite_json, score, details_json, created_at FROM evaluations WHERE node_key = ?1 ORDER BY created_at DESC LIMIT 100")
        .map_err(rusqlite::Error::from)?;
    let rows = st
        .query_map([node_key], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "executionId": r.get::<_, Option<String>>(1)?,
                "suite": serde_json::from_str::<Value>(&r.get::<_, String>(2)?).unwrap_or(Value::Null),
                "score": r.get::<_, f64>(3)?,
                "details": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(Value::Null),
                "createdAt": r.get::<_, String>(5)?,
            }))
        })
        .map_err(rusqlite::Error::from)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(rusqlite::Error::from)?);
    }
    Ok(Value::Array(out))
}

/// Upsert a suite by id (a new id is minted when the caller does not supply one).
pub fn suite_save(conn: &Connection, suite_id: Option<&str>, name: &str, cases: &Value) -> rusqlite::Result<Value> {
    let id = suite_id.map(str::to_string).unwrap_or_else(|| nid("suite"));
    let ts = now();
    conn.execute(
        "INSERT INTO suites (id, name, cases_json, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, cases_json = excluded.cases_json, updated_at = excluded.updated_at",
        params![id, name, cases.to_string(), ts],
    )?;
    Ok(json!({ "id": id, "name": name, "updatedAt": ts }))
}

/// Every stored suite, newest update first.
pub fn suite_list(conn: &Connection) -> rusqlite::Result<Value> {
    let mut st = conn
        .prepare("SELECT id, name, cases_json, updated_at FROM suites ORDER BY updated_at DESC")
        .map_err(rusqlite::Error::from)?;
    let rows = st
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "cases": serde_json::from_str::<Value>(&r.get::<_, String>(2)?).unwrap_or(Value::Null),
                "updatedAt": r.get::<_, String>(3)?,
            }))
        })
        .map_err(rusqlite::Error::from)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(rusqlite::Error::from)?);
    }
    Ok(Value::Array(out))
}
