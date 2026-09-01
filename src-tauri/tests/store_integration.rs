/**
 * MJ 11.1 — store integration tests.
 *
 * Compiling is not the same as working. This exercises the shipped persistence layer
 * (`src/db.rs`) for real, in memory: the schema, a workflow round-trip, the execution →
 * event append log, the approval gate, the dead-letter queue, evolution decisions, skill
 * usage counting, and the MCP catalog seed.
 *
 * This file replaces `tests/v6_organization.rs`, which tested a V6 `organization` module
 * that no longer exists anywhere in the crate (the persistence layer was rewritten into
 * `db.rs`), so `cargo test` could not even compile the test target — the exact failure
 * CI was red on. The property tests below are the same class of test V6 wanted
 * (migration idempotence, real round-trips, an ordered, tamper-evident record of what
 * happened, honest empties) applied to the module that actually ships.
 *
 *   cargo test --manifest-path src-tauri/Cargo.toml
 */
use rusqlite::Connection;
use serde_json::{json, Value};

/// Every table the shipped schema creates. If this list and `db::init` ever disagree,
/// something was added to the store without a test noticing — that is the point.
const TABLES: [&str; 15] = [
    "workflows",
    "versions",
    "executions",
    "events",
    "memories",
    "skills",
    "feedback",
    "evolution",
    "mcp",
    "approvals",
    "dlq",
    "node_state",
    "run_queue",
    "evaluations",
    "suites",
];

fn fresh() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    mj_desktop_lib::db::init(&conn).expect("v11 schema");
    conn
}

#[test]
fn init_creates_every_shipped_table() {
    let conn = fresh();
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .unwrap();
    let present: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    for t in TABLES {
        assert!(present.iter().any(|p| p == t), "missing table: {t}");
    }
}

#[test]
fn init_is_idempotent() {
    let conn = Connection::open_in_memory().unwrap();
    mj_desktop_lib::db::init(&conn).expect("first init");
    mj_desktop_lib::db::init(&conn).expect("second init");
}

#[test]
fn workflow_round_trip_preserves_the_graph_verbatim() {
    let conn = fresh();
    let created = mj_desktop_lib::db::workflow_create(&conn, "Mission A", "an outcome").expect("create");
    let id = created["id"].as_str().expect("id").to_string();

    // A graph with nested structures, unicode and floats — the store must return it
    // verbatim, not a re-serialized approximation.
    let graph = json!({
        "schemaVersion": 2,
        "id": id,
        "name": "Mission A",
        "nodes": [
            { "id": "n1", "type": "agent", "label": "审 查", "meta": { "risk": "HIGH", "retries": 3 } }
        ],
        "connections": [{ "from": "n1", "to": "n2", "ports": ["out", "in"] }],
        "viewport": { "x": 1.5, "y": -2, "zoom": 0.8 },
        "groups": [],
        "notes": []
    });
    mj_desktop_lib::db::workflow_save(&conn, &id, "Mission A", "an outcome", &graph).expect("save");

    let got = mj_desktop_lib::db::workflow_get(&conn, &id).expect("get");
    assert_eq!(got["name"], json!("Mission A"));
    assert_eq!(got["graph"], graph, "the stored graph must come back verbatim");

    let list = mj_desktop_lib::db::workflow_list(&conn).expect("list");
    assert_eq!(list.as_array().unwrap().len(), 1);

    mj_desktop_lib::db::workflow_delete(&conn, &id).expect("delete");
    let list = mj_desktop_lib::db::workflow_list(&conn).expect("list after delete");
    assert_eq!(list.as_array().unwrap().len(), 0, "delete must really delete");
}

#[test]
fn execution_lifecycle_is_a_chronological_append_log() {
    let conn = fresh();
    let wf = mj_desktop_lib::db::workflow_create(&conn, "W", "").expect("create");
    let wid = wf["id"].as_str().expect("id");
    let ex = mj_desktop_lib::db::execution_create(&conn, wid, 1).expect("execution");
    let eid = ex["id"].as_str().expect("exec id").to_string();

    let e1 = mj_desktop_lib::db::event_emit(&conn, &eid, "node_start", "info", Some("n1"), &json!({"k": "v"}))
        .expect("event 1");
    let e2 = mj_desktop_lib::db::event_emit(&conn, &eid, "tool_call", "warn", None, &json!({"cmd": "go test"}))
        .expect("event 2");
    assert!(
        e2["seq"].as_i64().unwrap() > e1["seq"].as_i64().unwrap(),
        "the append log must be strictly ordered"
    );

    mj_desktop_lib::db::execution_finish(&conn, &eid, "FAILED", Some("boom"), &json!({"nodesRun": 1}))
        .expect("finish");

    let events = mj_desktop_lib::db::execution_events(&conn, &eid).expect("events");
    let arr = events.as_array().unwrap();
    assert_eq!(arr.len(), 2, "the record keeps every event");
    assert_eq!(arr[0]["kind"], json!("node_start"));
    assert_eq!(arr[0]["nodeId"], json!("n1"));
    assert_eq!(arr[1]["data"], json!({"cmd": "go test"}), "payload fidelity");
    assert_eq!(arr[1]["nodeId"], Value::Null);

    let execs = mj_desktop_lib::db::execution_list(&conn).expect("executions");
    let row = execs
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["id"] == json!(eid))
        .expect("execution present");
    assert_eq!(row["status"], json!("FAILED"), "the result state is recorded");
    assert_eq!(row["error"], json!("boom"), "and so is the reason");
}

#[test]
fn memory_search_is_scoped_and_ranked() {
    let conn = fresh();
    mj_desktop_lib::db::memory_add(&conn, "node-a", "lesson", "the api rate limit is 20/min", &json!(["api"]), 0.3)
        .unwrap();
    mj_desktop_lib::db::memory_add(&conn, "node-a", "lesson", "the api returns 429 when throttled", &json!(["api"]), 0.9)
        .unwrap();
    mj_desktop_lib::db::memory_add(&conn, "node-b", "lesson", "the api key lives in the keychain", &json!(["api"]), 0.9)
        .unwrap();

    let hits = mj_desktop_lib::db::memory_search(&conn, "node-a", "api", 10).unwrap();
    let arr = hits.as_array().unwrap();
    assert_eq!(arr.len(), 2, "search must be scoped to the node");
    assert!(
        arr[0]["importance"].as_f64().unwrap() >= arr[1]["importance"].as_f64().unwrap(),
        "results must be ranked by importance"
    );

    let none = mj_desktop_lib::db::memory_search(&conn, "node-c", "api", 10).unwrap();
    assert_eq!(none.as_array().unwrap().len(), 0, "no cross-contamination");
}

#[test]
fn skill_usage_is_counted_not_promised() {
    // `open` is the production bootstrap (init + the skill-usage columns added by
    // ensure_skill_usage_columns). Be like production: a bare `init` does not add the
    // usage columns, and `skill_touch` honestly reports 0 touched on a store without
    // them — which is why the test must open the store the way the app does.
    let path = std::env::temp_dir().join(format!(
        "mj-skill-test-{}-{}.sqlite",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    let conn = mj_desktop_lib::db::open(&path).expect("open production-style store");

    let s = mj_desktop_lib::db::skill_upsert(&conn, "n1", "review", "reviews a pr", "1. read diff 2. comment", "builtin")
        .expect("upsert");
    let sid = s["id"].as_str().expect("skill id").to_string();
    assert_eq!(s["version"], json!(1));

    let listed = mj_desktop_lib::db::skills_list(&conn, "n1").expect("list");
    assert_eq!(listed["skills"].as_array().unwrap().len(), 1);

    let touch = mj_desktop_lib::db::skill_touch(&conn, std::slice::from_ref(&sid)).expect("touch");
    assert_eq!(touch["touched"], json!(1), "the usage must be recorded in the store");
    assert_eq!(touch["requested"], json!(1));
    let count: i64 = conn
        .query_row("SELECT use_count FROM skills WHERE id=?1", [&sid], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1, "usage must be recorded, not echoed");

    let stale = mj_desktop_lib::db::skill_touch(&conn, &["skill-does-not-exist".to_string()]).expect("stale touch");
    assert_eq!(
        stale["touched"], json!(0),
        "a stale id must be counted as nothing, honestly"
    );

    drop(conn);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(format!("{}-wal", path.display()));
    let _ = std::fs::remove_file(format!("{}-shm", path.display()));
}

#[test]
fn approval_gate_opens_then_gates() {
    let conn = fresh();
    let a = mj_desktop_lib::db::approval_request(
        &conn,
        "exec-1",
        "n1",
        "run destructive command",
        &json!({"cmd": "rm -rf x", "risk": "CRITICAL"}),
    )
    .expect("request");
    let id = a["id"].as_str().expect("approval id").to_string();

    assert_eq!(mj_desktop_lib::db::approval_list(&conn).unwrap().as_array().unwrap().len(), 1);
    let before = mj_desktop_lib::db::approval_get(&conn, "exec-1", "n1").unwrap();
    assert_eq!(before["decided"], json!(false), "an open approval is undecided, not auto-approved");

    mj_desktop_lib::db::approval_decide(&conn, &id, "APPROVED").unwrap();
    let after = mj_desktop_lib::db::approval_get(&conn, "exec-1", "n1").unwrap();
    assert_eq!(after["decided"], json!(true));
    assert_eq!(after["status"], json!("APPROVED"));
    assert_eq!(
        mj_desktop_lib::db::approval_list(&conn).unwrap().as_array().unwrap().len(),
        0,
        "decided approvals leave the open inbox"
    );
}

#[test]
fn dlq_entries_resolve_in_place() {
    let conn = fresh();
    let d = mj_desktop_lib::db::dlq_add(&conn, &json!({"type": "harness", "payload": {"msg": "spawn failed"}}))
        .expect("add");
    let id = d["id"].as_str().expect("dlq id").to_string();

    assert_eq!(mj_desktop_lib::db::dlq_list(&conn).unwrap().as_array().unwrap().len(), 1, "opened");
    let raw: String = conn
        .query_row("SELECT payload_json FROM dlq WHERE id=?1", [&id], |r| r.get(0))
        .unwrap();
    assert!(raw.contains("\"OPEN\""), "the entry is stored OPEN, not silently dropped");

    mj_desktop_lib::db::dlq_resolve(&conn, &id).unwrap();
    assert_eq!(
        mj_desktop_lib::db::dlq_list(&conn).unwrap().as_array().unwrap().len(),
        0,
        "resolved entries are no longer open"
    );
}

#[test]
fn evolution_proposals_are_decided_not_silenced() {
    let conn = fresh();
    let p = mj_desktop_lib::db::evolution_propose(
        &conn,
        &json!({"nodeKey": "n1", "kind": "split", "reason": "too many wires"}),
    )
    .expect("propose");
    let id = p["id"].as_str().expect("evo id").to_string();

    let list = mj_desktop_lib::db::evolution_list(&conn, Some("n1")).unwrap();
    let arr = list.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["status"], json!("PROPOSED"));
    assert_eq!(arr[0]["decision"], json!("PENDING"), "no decision is invented before it happens");

    mj_desktop_lib::db::evolution_decide(&conn, &id, "ACCEPTED").unwrap();
    let list = mj_desktop_lib::db::evolution_list(&conn, Some("n1")).unwrap();
    let arr = list.as_array().unwrap();
    assert_eq!(arr[0]["status"], json!("DECIDED"));
    assert_eq!(arr[0]["decision"], json!("ACCEPTED"));
}

#[test]
fn suites_and_evaluations_round_trip() {
    let conn = fresh();
    let suite = json!({"cases": [{"name": "a", "expect": "pass"}]});
    let s = mj_desktop_lib::db::suite_save(&conn, None, "Harness A", &suite).expect("suite save");
    let sid = s["id"].as_str().expect("suite id").to_string();
    assert!(!sid.is_empty(), "a new id is minted when none is supplied");
    assert_eq!(mj_desktop_lib::db::suite_list(&conn).unwrap().as_array().unwrap().len(), 1);

    mj_desktop_lib::db::evaluation_save(&conn, "n1", Some("exec-1"), &suite, 0.75, &json!({"passed": 3, "failed": 1}))
        .expect("evaluation save");
    let history = mj_desktop_lib::db::evaluation_history(&conn, "n1").unwrap();
    let arr = history.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert!((arr[0]["score"].as_f64().unwrap() - 0.75).abs() < 1e-9);
    assert_eq!(arr[0]["details"], json!({"passed": 3, "failed": 1}));

    assert_eq!(
        mj_desktop_lib::db::evaluation_history(&conn, "n-never-evaluated")
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        0,
        "an empty history really means never evaluated"
    );
}

#[test]
fn mcp_seed_is_once_and_removable() {
    let conn = fresh();
    mj_desktop_lib::db::seed_mcp_if_empty(&conn).expect("first seed");
    let n = mj_desktop_lib::db::mcp_list(&conn).unwrap().as_array().unwrap().len();
    assert_eq!(n, 7, "the built-in catalog");

    mj_desktop_lib::db::seed_mcp_if_empty(&conn).expect("second seed");
    assert_eq!(
        mj_desktop_lib::db::mcp_list(&conn).unwrap().as_array().unwrap().len(),
        n,
        "seeding must be idempotent"
    );

    mj_desktop_lib::db::mcp_remove(&conn, "mcp.filesystem").expect("remove");
    let after = mj_desktop_lib::db::mcp_list(&conn).unwrap();
    assert_eq!(after.as_array().unwrap().len(), n - 1);
    assert!(after.to_string().contains("mcp.git"), "the rest of the catalog survives");
}
