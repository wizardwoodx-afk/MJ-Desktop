/**
 * MJ 6.0 — persistence-layer integration test.
 *
 * Compiling is not the same as working. This exercises the V6 SQLite layer for
 * real: the migration, a mission round-trip, and the append-only hash-chained
 * audit ledger — including the property that actually matters, which is that
 * tampering with a record is detectable.
 *
 *   cargo test --manifest-path src-tauri/Cargo.toml
 */
use rusqlite::Connection;
use serde_json::json;

const TABLES: [&str; 12] = [
    "missions",
    "orgs",
    "org_events",
    "artifacts",
    "checkpoints",
    "negotiations",
    "reputation",
    "scorecards",
    "audit_ledger",
    "teams",
    "charters",
    "agent_cards",
];

fn fresh() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    mj_desktop_lib::organization::migrate(&conn).expect("v6 migration");
    conn
}

#[test]
fn migration_creates_every_v6_table() {
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
fn migration_is_idempotent() {
    let conn = Connection::open_in_memory().unwrap();
    mj_desktop_lib::organization::migrate(&conn).expect("first migrate");
    mj_desktop_lib::organization::migrate(&conn).expect("second migrate");
}

#[test]
fn migration_is_additive_and_preserves_existing_data() {
    // The V6 migration runs on a database that already holds V5 data (db::open
    // creates the V5 schema first). It must add tables without touching what is
    // already there.
    let conn = Connection::open_in_memory().unwrap();
    conn.execute(
        "CREATE TABLE workflows (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO workflows (id, name) VALUES ('wf-1', 'Do not lose me')",
        [],
    )
    .unwrap();

    mj_desktop_lib::organization::migrate(&conn).expect("v6 migration on a v5 database");

    let name: String = conn
        .query_row("SELECT name FROM workflows WHERE id='wf-1'", [], |r| r.get(0))
        .expect("v5 row survives");
    assert_eq!(name, "Do not lose me");

    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='missions'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(n, 1, "v6 table should now exist");
}

#[test]
fn mission_round_trips() {
    let conn = fresh();
    let mission = json!({
        "id": "mis-test",
        "name": "Test mission",
        "objective": "Prove the persistence layer works.",
        "status": "DRAFT",
        "budget": { "maxCostUsd": 5 },
        "tags": ["test"],
        "createdAt": "2026-08-28T00:00:00Z",
        "updatedAt": "2026-08-28T00:00:00Z",
    });

    mj_desktop_lib::organization::mission_save(&conn, &mission).expect("save");
    let back = mj_desktop_lib::organization::mission_get(&conn, "mis-test").expect("get");

    assert_eq!(back["name"], "Test mission");
    assert_eq!(back["objective"], "Prove the persistence layer works.");
    assert_eq!(back["status"], "DRAFT");
    assert_eq!(back["tags"][0], "test");
}

#[test]
fn audit_chain_verifies_and_detects_tampering() {
    let conn = fresh();
    let o = mj_desktop_lib::organization::audit_append(
        &conn,
        &json!({
            "kind": "MISSION_STARTED",
            "missionId": "mis-audit",
            "actor": "supervisor",
            "reason": "test",
            "evidence": [],
            "data": { "n": 1 },
        }),
    )
    .expect("append 1");
    assert!(o.get("seq").is_some(), "append should return a seq");

    for n in 2..=5 {
        mj_desktop_lib::organization::audit_append(
            &conn,
            &json!({
                "kind": "POLICY_CHECKED",
                "missionId": "mis-audit",
                "actor": "supervisor",
                "data": { "n": n },
            }),
        )
        .expect("append n");
    }

    // 1. An untouched chain verifies.
    let v = mj_desktop_lib::organization::audit_verify(&conn, "mis-audit");
    assert_eq!(v["ok"], true, "clean chain must verify: {v}");
    assert_eq!(v["entries"], 5);

    // 2. Editing a record in place breaks every hash after it.
    conn.execute(
        "UPDATE audit_ledger SET reason = 'silently rewritten' WHERE mission_id='mis-audit' AND seq=3",
        [],
    )
    .expect("tamper");
    let v = mj_desktop_lib::organization::audit_verify(&conn, "mis-audit");
    assert_eq!(v["ok"], false, "tampered chain must NOT verify");
    assert!(
        v["brokenAt"].is_number() || v.get("reason").is_some(),
        "the verifier should say where it broke: {v}"
    );
}

#[test]
fn audit_genesis_is_well_formed() {
    let g = mj_desktop_lib::organization::genesis_hash();
    assert_eq!(g.len(), 64, "genesis hash should be 64 hex-ish chars");
    assert!(g.chars().all(|c| c == '0'), "genesis should be all zeros");
}

#[test]
fn artifact_versions_are_append_only() {
    let conn = fresh();
    for v in 1..=3 {
        mj_desktop_lib::organization::artifact_save(
            &conn,
            &json!({
                "id": format!("art-v{v}"),
                "missionId": "mis-test",
                "lineageId": "lineage-1",
                "version": v,
                "name": "spec.md",
                "content": format!("version {v} body"),
                "createdBy": "slot-1",
                "createdAt": "2026-08-28T00:00:00Z",
            }),
        )
        .expect("save artifact");
    }
    let lineage =
        mj_desktop_lib::organization::artifact_lineage(&conn, "lineage-1").expect("lineage");
    let arr = lineage.as_array().expect("lineage is an array");
    assert_eq!(arr.len(), 3, "all three versions must be preserved");
}

/// The audit chain is written by Rust (SQLite) and verified from TypeScript
/// (browser fallback), so both implementations must produce identical hashes.
/// These expected values are computed by `hashString` in `src/domain/artifact.ts`.
#[test]
fn hash_matches_the_typescript_implementation() {
    use mj_desktop_lib::organization::hash_string;
    let cases: [(&str, &str); 5] = [
        ("", "811c9dc5"),
        ("abc", "1a47e90b"),
        ("hello world", "d58b3fa7"),
        ("genesis|{seq:1}", "054da6b1"),
        // Non-ASCII: hashing UTF-16 code units instead of UTF-8 bytes would
        // diverge here, and the chain would verify in one language and not the other.
        ("caf\u{e9} \u{2014} na\u{ef}ve \u{2713} \u{65e5}\u{672c}\u{8a9e}", "0f93cefc"),
    ];
    for (input, expected) in cases {
        assert_eq!(hash_string(input), expected, "hash mismatch for {input:?}");
    }
}
