use serde_json::{json, Value};

/// MJ-authored Control MCP. In-process, stdio-shaped. Mutations are Plan → Apply → Verify.
///
/// V7 rewrite (bug U). This module used to answer `ok: true` to every tool it advertised —
/// `connect_ports`, `run_workflow`, `cancel_execution` and the rest all echoed their arguments
/// back and claimed success while doing nothing at all, and `validate_graph` returned a canned
/// pass without looking at the graph. A caller (an agent, or the editor) had no way to tell the
/// difference between "your graph is valid" and "this server never checked".
///
/// Now: `validate_graph` performs real structural validation, and every tool that is not actually
/// implemented returns `ok: false` with an explicit `notImplemented` marker. `mcp.rs` advertises
/// the honest count.
///
/// V11 (W2, advertisement == behavior): the graph tools are real. `list_nodes` reads the stored
/// graph; `connect_ports` / `disconnect_ports` are Plan → Apply → Verify mutations of the stored
/// graph through the SQLite store; `run_workflow` durably enqueues into `run_queue`, which the
/// frontend scheduler drains (`run_request_take`). `pause_execution` / `resume_execution` /
/// `cancel_execution` are DELISTED rather than faked: execution state is owned by the frontend
/// runtime, and a tool that cannot reach it has no business being advertised. What remains
/// advertised is exactly what is implemented — every call either does the thing or says why not.
///
/// A single validation finding. `nodeId`/`wireId` are null when the finding is graph-wide.
fn issue(severity: &str, code: &str, message: String, node_id: Option<String>, wire_id: Option<String>) -> Value {
    json!({
        "severity": severity,
        "code": code,
        "message": message,
        "nodeId": node_id,
        "wireId": wire_id,
    })
}

fn str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}

/// Detect a cycle by depth-first colouring. Returns the first cycle found, as node ids.
fn find_cycle(nodes: &[String], adj: &std::collections::HashMap<String, Vec<String>>) -> Option<Vec<String>> {
    use std::collections::HashMap;
    let mut colour: HashMap<String, u8> = HashMap::new(); // 0 unvisited, 1 in progress, 2 done
    let mut stack: Vec<String> = Vec::new();

    fn visit(
        n: &str,
        adj: &std::collections::HashMap<String, Vec<String>>,
        colour: &mut std::collections::HashMap<String, u8>,
        stack: &mut Vec<String>,
    ) -> Option<Vec<String>> {
        colour.insert(n.to_string(), 1);
        stack.push(n.to_string());
        if let Some(next) = adj.get(n) {
            for m in next {
                match colour.get(m).copied().unwrap_or(0) {
                    1 => {
                        // Found a back edge: the cycle is everything from m onwards on the stack.
                        let start = stack.iter().position(|x| x == m).unwrap_or(0);
                        return Some(stack[start..].to_vec());
                    }
                    0 => {
                        if let Some(c) = visit(m, adj, colour, stack) {
                            return Some(c);
                        }
                    }
                    _ => {}
                }
            }
        }
        colour.insert(n.to_string(), 2);
        stack.pop();
        None
    }

    for n in nodes {
        if colour.get(n).copied().unwrap_or(0) == 0 {
            if let Some(c) = visit(n, adj, &mut colour, &mut stack) {
                return Some(c);
            }
        }
    }
    None
}

/// Real structural validation of a workflow graph.
///
/// Checks, in order: the graph is an object; it has nodes; node ids are present, non-empty and
/// unique; every node has a type; every wire references nodes that exist; no wire connects a node
/// to itself; and the graph is acyclic. Anything it reports is something it actually found.
pub fn validate_graph(args: &Value) -> Value {
    let graph = match args.get("graph") {
        Some(Value::Object(g)) => Value::Object(g.clone()),
        Some(Value::Null) | None => {
            return json!({
                "ok": false,
                "tool": "validate_graph",
                "phase": "verify",
                "checked": false,
                "issues": [issue("error", "no_graph", "No graph was supplied, so nothing could be validated. Pass the workflow graph under `graph`.".to_string(), None, None)],
            })
        }
        Some(other) => {
            return json!({
                "ok": false,
                "tool": "validate_graph",
                "phase": "verify",
                "checked": false,
                "issues": [issue("error", "bad_graph", format!("`graph` must be an object, got {}", kind_name(other)), None, None)],
            })
        }
    };

    let mut issues: Vec<Value> = Vec::new();

    // -- nodes -------------------------------------------------------------------
    let nodes_val = graph.get("nodes").cloned().unwrap_or(Value::Null);
    let node_objs: Vec<Value> = match &nodes_val {
        Value::Array(a) => a.to_vec(),
        Value::Null => Vec::new(),
        other => {
            issues.push(issue("error", "bad_nodes", format!("`nodes` must be an array, got {}", kind_name(other)), None, None));
            Vec::new()
        }
    };
    if node_objs.is_empty() {
        // Not a warning: a graph with nothing to run is not runnable, and `run_workflow`
        // must refuse to queue it rather than queue a promise that cannot deliver.
        issues.push(issue("error", "empty_graph", "The graph has no nodes, so it cannot run; no run request for it may be queued.".to_string(), None, None));
    }

    let mut ids: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for n in &node_objs {
        let id = str_field(n, "id");
        match &id {
            None => issues.push(issue("error", "missing_node_id", "A node has no `id`; wires cannot reference it.".to_string(), None, None)),
            Some(i) if i.trim().is_empty() => {
                issues.push(issue("error", "empty_node_id", "A node has an empty `id`.".to_string(), None, None))
            }
            Some(i) => {
                if !seen.insert(i.clone()) {
                    issues.push(issue("error", "duplicate_node_id", format!("Duplicate node id '{i}'; wires to it are ambiguous."), Some(i.clone()), None));
                }
                ids.push(i.clone());
            }
        }
        let has_type = str_field(n, "type")
            .or_else(|| str_field(n, "definitionId"))
            .map(|t| !t.trim().is_empty())
            .unwrap_or(false);
        if !has_type {
            issues.push(issue("error", "missing_node_type", "A node has no `type`, so nothing knows how to execute it.".to_string(), id.clone(), None));
        }
    }

    // -- wires -------------------------------------------------------------------
    // MJ graphs store wires under `connections` (and node types under `definitionId`);
    // accept both shapes so an external MCP caller can send either.
    let wires_val = graph.get("wires").or_else(|| graph.get("connections")).cloned().unwrap_or(Value::Null);
    let wire_objs: Vec<Value> = match &wires_val {
        Value::Array(a) => a.to_vec(),
        Value::Null => Vec::new(),
        other => {
            issues.push(issue("error", "bad_wires", format!("`wires` must be an array, got {}", kind_name(other)), None, None));
            Vec::new()
        }
    };

    let id_set: std::collections::HashSet<String> = ids.iter().cloned().collect();
    let mut adj: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for (idx, w) in wire_objs.iter().enumerate() {
        let wid = str_field(w, "id").unwrap_or_else(|| format!("wires[{idx}]"));
        // MJ's own tools write `sourceNodeId` / `targetNodeId`; the legacy shape used
        // `from` / `to`. Accept both, exactly as the module comment promises — a wire is
        // only "incomplete" when BOTH shapes are missing an endpoint.
        let from = str_field(w, "from").or_else(|| str_field(w, "sourceNodeId"));
        let to = str_field(w, "to").or_else(|| str_field(w, "targetNodeId"));
        let (Some(from), Some(to)) = (from, to) else {
            issues.push(issue("error", "incomplete_wire", format!("Wire '{wid}' is missing `from`/`to` (or `sourceNodeId`/`targetNodeId`)."), None, Some(wid)));
            continue;
        };
        if !id_set.contains(&from) {
            issues.push(issue("error", "wire_from_unknown_node", format!("Wire '{wid}' starts at node '{from}', which does not exist."), None, Some(wid.clone())));
        }
        if !id_set.contains(&to) {
            issues.push(issue("error", "wire_to_unknown_node", format!("Wire '{wid}' ends at node '{to}', which does not exist."), None, Some(wid.clone())));
        }
        if from == to {
            // `from` is borrowed for the message and moved into the issue, so clone for the edge map.
            issues.push(issue("error", "self_loop", format!("Node '{from}' is wired to itself, so it can never settle."), Some(from.clone()), Some(wid.clone())));
        }
        adj.entry(from).or_default().push(to);
    }

    // -- cycles -------------------------------------------------------------------
    if let Some(cycle) = find_cycle(&ids, &adj) {
        issues.push(issue(
            "error",
            "cycle",
            format!("The graph contains a cycle: {}. A cyclic workflow cannot be scheduled.", cycle.join(" → ")),
            cycle.first().cloned(),
            None,
        ));
    }

    let errors = issues.iter().filter(|i| i["severity"] == "error").count();
    json!({
        "ok": errors == 0,
        "tool": "validate_graph",
        "phase": "verify",
        "checked": true,
        "workflowId": args.get("workflowId"),
        "nodesChecked": node_objs.len(),
        "wiresChecked": wire_objs.len(),
        "errorCount": errors,
        "warningCount": issues.len() - errors,
        "issues": issues,
    })
}


/* ------------------------------------------------------------------ V11 (W2): the real tools */

use rusqlite::OptionalExtension;

fn load_graph(conn: &rusqlite::Connection, workflow_id: &str) -> Result<Value, String> {
    let row: Option<String> = conn
        .query_row("SELECT graph_json FROM workflows WHERE id = ?1", [workflow_id], |r| r.get(0))
        .optional()
        .map_err(|e| format!("acp/db: {e}"))?;
    match row {
        None => Err(format!("unknown workflow '{workflow_id}': nothing was read, nothing was changed")),
        Some(raw) => serde_json::from_str::<Value>(&raw).map_err(|e| format!("stored graph for '{workflow_id}' is not valid JSON: {e}")),
    }
}

fn save_graph(conn: &rusqlite::Connection, workflow_id: &str, graph: &Value) -> Result<(), String> {
    let payload = graph.to_string();
    let updated = conn
        .execute("UPDATE workflows SET graph_json = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1", rusqlite::params![workflow_id, payload])
        .map_err(|e| format!("graph save failed: {e}"))?;
    if updated == 0 {
        return Err(format!("unknown workflow '{workflow_id}': nothing was written"));
    }
    Ok(())
}

fn graph_node_ports(node: &Value, dir: &str) -> Vec<String> {
    node.get(dir)
        .and_then(|p| p.as_array())
        .map(|a| a.iter().filter_map(|p| str_field(p, "id")).collect())
        .unwrap_or_default()
}

/// Find a cycle among `nodes` after adding `extra_edge`. Reuses the existing colouring walk.
fn would_cycle(all_ids: &[String], adj: &std::collections::HashMap<String, Vec<String>>) -> bool {
    find_cycle(all_ids, adj).is_some()
}

/// `list_nodes` — read the stored graph and describe its nodes and wires.
pub fn list_nodes(conn: &rusqlite::Connection, args: &Value) -> Value {
    let Some(workflow_id) = str_field(args, "workflowId") else {
        return json!({ "ok": false, "tool": "list_nodes", "error": "pass `workflowId`" });
    };
    let graph = match load_graph(conn, &workflow_id) {
        Ok(g) => g,
        Err(e) => return json!({ "ok": false, "tool": "list_nodes", "error": e }),
    };
    let nodes: Vec<Value> = graph
        .get("nodes")
        .and_then(|n| n.as_array())
        .map(|a| {
            a.iter()
                .map(|n| {
                    json!({
                        "id": n.get("id"),
                        "type": n.get("definitionId").or_else(|| n.get("type")),
                        "title": n.get("title"),
                        "inputs": graph_node_ports(n, "inputs").len(),
                        "outputs": graph_node_ports(n, "outputs").len(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let wires = graph.get("connections").or_else(|| graph.get("wires")).and_then(|w| w.as_array()).map(|a| a.len()).unwrap_or(0);
    json!({
        "ok": true,
        "tool": "list_nodes",
        "checked": true,
        "workflowId": workflow_id,
        "nodes": nodes,
        "wireCount": wires,
    })
}

/// `connect_ports` — Plan (look everything up) → Apply (mutate the stored graph) → Verify
/// (re-validate the stored result). Every refusal names what it checked.
pub fn connect_ports(conn: &rusqlite::Connection, args: &Value) -> Value {
    let (Some(workflow_id), Some(source_node), Some(source_port), Some(target_node), Some(target_port)) = (
        str_field(args, "workflowId"),
        str_field(args, "sourceNodeId").or_else(|| str_field(args, "fromNode")),
        str_field(args, "sourcePortId").or_else(|| str_field(args, "fromPort")),
        str_field(args, "targetNodeId").or_else(|| str_field(args, "toNode")),
        str_field(args, "targetPortId").or_else(|| str_field(args, "toPort")),
    ) else {
        return json!({ "ok": false, "tool": "connect_ports", "error": "pass `workflowId`, `sourceNodeId`, `sourcePortId`, `targetNodeId`, `targetPortId`" });
    };

    // ---- Plan
    let mut graph = match load_graph(conn, &workflow_id) {
        Ok(g) => g,
        Err(e) => return json!({ "ok": false, "tool": "connect_ports", "phase": "plan", "error": e }),
    };
    let empty = Vec::new();
    let nodes = graph.get("nodes").and_then(|n| n.as_array()).unwrap_or(&empty);
    let src = nodes.iter().find(|n| str_field(n, "id").as_deref() == Some(source_node.as_str()));
    let tgt = nodes.iter().find(|n| str_field(n, "id").as_deref() == Some(target_node.as_str()));
    let (Some(src), Some(tgt)) = (src, tgt) else {
        return json!({ "ok": false, "tool": "connect_ports", "phase": "plan", "error": format!("source or target node not found in '{workflow_id}' — nothing was changed") });
    };
    if source_node == target_node {
        return json!({ "ok": false, "tool": "connect_ports", "phase": "plan", "error": "a node cannot feed itself" });
    }
    if !graph_node_ports(src, "outputs").contains(&source_port) {
        return json!({ "ok": false, "tool": "connect_ports", "phase": "plan", "error": format!("node '{source_node}' has no output port '{source_port}'") });
    }
    if !graph_node_ports(tgt, "inputs").contains(&target_port) {
        return json!({ "ok": false, "tool": "connect_ports", "phase": "plan", "error": format!("node '{target_node}' has no input port '{target_port}'") });
    }
    let wires = graph.get("connections").and_then(|w| w.as_array()).unwrap_or(&empty).clone();
    let duplicate = wires.iter().any(|w| {
        str_field(w, "targetNodeId").as_deref() == Some(target_node.as_str())
            && str_field(w, "targetPortId").as_deref() == Some(target_port.as_str())
            && w.get("multiple").and_then(|m| m.as_bool()) != Some(true)
    });
    if duplicate {
        return json!({ "ok": false, "tool": "connect_ports", "phase": "plan", "error": format!("'{target_node}.{target_port}' already has a connection and does not accept multiple inputs") });
    }
    // Cycle check on the graph AS IT WOULD BE.
    let mut ids: Vec<String> = nodes.iter().filter_map(|n| str_field(n, "id")).collect();
    ids.push(source_node.clone());
    ids.push(target_node.clone());
    let mut adj: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for w in &wires {
        if let (Some(f), Some(t)) = (str_field(w, "sourceNodeId"), str_field(w, "targetNodeId")) {
            adj.entry(f).or_default().push(t);
        }
    }
    adj.entry(source_node.clone()).or_default().push(target_node.clone());
    if would_cycle(&ids, &adj) {
        return json!({ "ok": false, "tool": "connect_ports", "phase": "plan", "error": "that wire would create a cycle, which no scheduler can run" });
    }
    let data_type = src
        .get("outputs")
        .and_then(|p| p.as_array())
        .and_then(|a| a.iter().find(|p| str_field(p, "id").as_deref() == Some(source_port.as_str())))
        .and_then(|p| str_field(p, "dataType"))
        .unwrap_or_else(|| "any".to_string());

    // ---- Apply
    let wire_id = format!("c-{}", uuid::Uuid::new_v4().simple());
    let mut new_wires = wires.clone();
    new_wires.push(json!({
        "id": wire_id,
        "sourceNodeId": source_node,
        "sourcePortId": source_port,
        "targetNodeId": target_node,
        "targetPortId": target_port,
        "dataType": data_type,
        "status": "idle",
    }));
    if let Some(obj) = graph.as_object_mut() {
        obj.insert("connections".to_string(), Value::Array(new_wires));
    }
    if let Err(e) = save_graph(conn, &workflow_id, &graph) {
        return json!({ "ok": false, "tool": "connect_ports", "phase": "apply", "error": e });
    }

    // ---- Verify: re-read and re-validate what is actually stored now.
    let stored = match load_graph(conn, &workflow_id) {
        Ok(g) => g,
        Err(e) => return json!({ "ok": false, "tool": "connect_ports", "phase": "verify", "error": e }),
    };
    let verdict = validate_graph(&json!({ "graph": stored }));
    let verified = verdict["ok"] == json!(true);
    json!({
        "ok": verified,
        "tool": "connect_ports",
        "phase": "verify",
        "checked": true,
        "wireId": wire_id,
        "verification": verdict,
        "error": if verified { Value::Null } else { json!("the mutation was stored, but the stored graph fails validation — see `verification`") },
    })
}

/// `disconnect_ports` — remove one wire by id, or every wire between two nodes.
pub fn disconnect_ports(conn: &rusqlite::Connection, args: &Value) -> Value {
    let Some(workflow_id) = str_field(args, "workflowId") else {
        return json!({ "ok": false, "tool": "disconnect_ports", "error": "pass `workflowId` and either `wireId` or `sourceNodeId`+`targetNodeId`" });
    };
    let wire_id = str_field(args, "wireId");
    let source_node = str_field(args, "sourceNodeId");
    let target_node = str_field(args, "targetNodeId");
    if wire_id.is_none() && (source_node.is_none() || target_node.is_none()) {
        return json!({ "ok": false, "tool": "disconnect_ports", "error": "pass `wireId`, or both `sourceNodeId` and `targetNodeId`" });
    }
    let mut graph = match load_graph(conn, &workflow_id) {
        Ok(g) => g,
        Err(e) => return json!({ "ok": false, "tool": "disconnect_ports", "phase": "plan", "error": e }),
    };
    let empty = Vec::new();
    let wires = graph.get("connections").and_then(|w| w.as_array()).unwrap_or(&empty);
    let keep: Vec<Value> = wires
        .iter()
        .filter(|w| {
            let id_hit = wire_id.as_deref().map(|id| str_field(w, "id").as_deref() != Some(id)).unwrap_or(true);
            let pair_hit = match (&source_node, &target_node) {
                (Some(s), Some(t)) => {
                    str_field(w, "sourceNodeId").as_deref() != Some(s.as_str())
                        || str_field(w, "targetNodeId").as_deref() != Some(t.as_str())
                }
                _ => true,
            };
            id_hit && pair_hit
        })
        .cloned()
        .collect();
    let removed = wires.len() - keep.len();
    if removed == 0 {
        return json!({ "ok": false, "tool": "disconnect_ports", "phase": "plan", "error": "no matching wire was found — nothing was changed" });
    }
    if let Some(obj) = graph.as_object_mut() {
        obj.insert("connections".to_string(), Value::Array(keep));
    }
    if let Err(e) = save_graph(conn, &workflow_id, &graph) {
        return json!({ "ok": false, "tool": "disconnect_ports", "phase": "apply", "error": e });
    }
    let stored = load_graph(conn, &workflow_id).ok();
    let verified = stored.as_ref().map(|g| validate_graph(&json!({ "graph": g.clone() }))["ok"] == json!(true));
    json!({
        "ok": verified.unwrap_or(false),
        "tool": "disconnect_ports",
        "phase": "verify",
        "checked": true,
        "removed": removed,
    })
}

/// `run_workflow` — durably enqueue the workflow for the frontend scheduler.
///
/// This is real state, not a promise: the row exists in `run_queue` after this call returns,
/// and `run_request_take` drains it. What this server cannot do is drive the in-WebView
/// scheduler, and it says so in the response instead of claiming a running execution.
pub fn run_workflow(conn: &rusqlite::Connection, args: &Value) -> Value {
    let Some(workflow_id) = str_field(args, "workflowId") else {
        return json!({ "ok": false, "tool": "run_workflow", "error": "pass `workflowId`" });
    };
    let exists: Option<String> = conn
        .query_row("SELECT id FROM workflows WHERE id = ?1", [&workflow_id], |r| r.get(0))
        .optional()
        .map_err(|e| format!("db: {e}"))
        .unwrap_or(None);
    if exists.is_none() {
        return json!({ "ok": false, "tool": "run_workflow", "error": format!("unknown workflow '{workflow_id}' — nothing was queued") });
    }
    let graph = match load_graph(conn, &workflow_id) {
        Ok(g) => g,
        Err(e) => return json!({ "ok": false, "tool": "run_workflow", "error": e }),
    };
    let verdict = validate_graph(&json!({ "graph": graph }));
    if verdict["ok"] != json!(true) {
        return json!({
            "ok": false,
            "tool": "run_workflow",
            "phase": "plan",
            "error": "the stored graph fails validation — fix it before queuing a run",
            "verification": verdict,
        });
    }
    let queued = conn
        .execute("INSERT INTO run_queue (workflow_id) VALUES (?1)", [&workflow_id])
        .map_err(|e| format!("queue insert failed: {e}"));
    match queued {
        Ok(_) => json!({
            "ok": true,
            "tool": "run_workflow",
            "checked": true,
            "workflowId": workflow_id,
            "status": "queued",
            "note": "the run is queued in the SQLite run_queue; the MJ frontend scheduler drains it via run_request_take. This server does not execute graphs itself.",
        }),
        Err(e) => json!({ "ok": false, "tool": "run_workflow", "error": e }),
    }
}

fn kind_name(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "a boolean",
        Value::Number(_) => "a number",
        Value::String(_) => "a string",
        Value::Array(_) => "an array",
        Value::Object(_) => "an object",
    }
}

fn not_implemented(tool: &str) -> Value {
    json!({
        "ok": false,
        "tool": tool,
        "notImplemented": true,
        "error": format!(
            "`{tool}` is advertised by this server but is not implemented in this build, so it did nothing. \
             No graph was mutated and no execution was started."
        ),
    })
}

pub fn dispatch(tool: &str, args: &Value) -> Value {
    match tool {
        "validate_graph" => validate_graph(args),
        // Database-backed tools need a connection; without one they refuse rather than pretend.
        "connect_ports" | "disconnect_ports" | "run_workflow" | "list_nodes" => not_implemented(tool),
        // V11 (W2): execution-state tools are DELISTED, not stubbed — see the module notes.
        "pause_execution" | "resume_execution" | "cancel_execution" => json!({
            "ok": false,
            "tool": tool,
            "delisted": true,
            "error": format!("`{tool}` is no longer advertised: execution state belongs to the frontend runtime, so this server refuses instead of pretending to reach it."),
        }),
        _ => json!({ "ok": false, "error": format!("unknown control tool {tool}") }),
    }
}

/// Same surface, with database access — the production entry point (`mcp_call`).
pub fn dispatch_with_db(tool: &str, args: &Value, conn: &rusqlite::Connection) -> Value {
    match tool {
        "list_nodes" => list_nodes(conn, args),
        "connect_ports" => connect_ports(conn, args),
        "disconnect_ports" => disconnect_ports(conn, args),
        "run_workflow" => run_workflow(conn, args),
        _ => dispatch(tool, args),
    }
}

/// The tools this server implements, for honest capability reporting.
pub const IMPLEMENTED_TOOLS: &[&str] = &[
    "validate_graph",
    "connect_ports",
    "disconnect_ports",
    "run_workflow",
    "list_nodes",
];

/// Every tool this server advertises. V11 invariant: advertised == implemented.
pub const ADVERTISED_TOOLS: &[&str] = &[
    "validate_graph",
    "connect_ports",
    "disconnect_ports",
    "run_workflow",
    "list_nodes",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_valid_graph_passes_and_reports_that_it_was_checked() {
        let g = json!({
            "graph": {
                "nodes": [{"id": "a", "type": "agent.coder"}, {"id": "b", "type": "agent.reviewer"}],
                "wires": [{"id": "w1", "from": "a", "to": "b"}]
            }
        });
        let r = validate_graph(&g);
        assert_eq!(r["ok"], json!(true), "issues: {:?}", r["issues"]);
        assert_eq!(r["checked"], json!(true));
        assert_eq!(r["nodesChecked"], json!(2));
        assert_eq!(r["wiresChecked"], json!(1));
    }

    #[test]
    fn a_cycle_is_found_and_named() {
        let g = json!({
            "graph": {
                "nodes": [{"id": "a", "type": "t"}, {"id": "b", "type": "t"}, {"id": "c", "type": "t"}],
                "wires": [
                    {"id": "w1", "from": "a", "to": "b"},
                    {"id": "w2", "from": "b", "to": "c"},
                    {"id": "w3", "from": "c", "to": "a"}
                ]
            }
        });
        let r = validate_graph(&g);
        assert_eq!(r["ok"], json!(false));
        let codes: Vec<String> = r["issues"].as_array().unwrap().iter().map(|i| i["code"].as_str().unwrap().to_string()).collect();
        assert!(codes.contains(&"cycle".to_string()), "expected a cycle, got {:?}", codes);
    }

    #[test]
    fn duplicates_self_loops_and_dangling_wires_are_all_reported() {
        let g = json!({
            "graph": {
                "nodes": [{"id": "a", "type": "t"}, {"id": "a", "type": "t"}, {"id": "b"}],
                "wires": [
                    {"id": "w1", "from": "a", "to": "a"},
                    {"id": "w2", "from": "a", "to": "ghost"},
                    {"id": "w3", "from": "a"}
                ]
            }
        });
        let r = validate_graph(&g);
        assert_eq!(r["ok"], json!(false));
        let codes: Vec<String> = r["issues"].as_array().unwrap().iter().map(|i| i["code"].as_str().unwrap().to_string()).collect();
        for expected in ["duplicate_node_id", "missing_node_type", "self_loop", "wire_to_unknown_node", "incomplete_wire"] {
            assert!(codes.contains(&expected.to_string()), "missing {expected} in {:?}", codes);
        }
    }

    #[test]
    fn a_missing_graph_is_not_a_pass() {
        let r = validate_graph(&json!({}));
        assert_eq!(r["ok"], json!(false));
        assert_eq!(r["checked"], json!(false), "it must not claim to have validated nothing");
    }

    #[test]
    fn advertised_equals_implemented_v11() {
        // The V11 invariant: what the server lists is what it serves.
        for tool in ADVERTISED_TOOLS {
            assert!(
                IMPLEMENTED_TOOLS.contains(tool),
                "{tool} is advertised but not implemented — advertisement must equal behavior"
            );
        }
        assert_eq!(ADVERTISED_TOOLS.len(), IMPLEMENTED_TOOLS.len());
    }

    #[test]
    fn db_backed_tools_refuse_without_a_connection_rather_than_pretend() {
        for tool in ["connect_ports", "run_workflow", "list_nodes", "disconnect_ports"] {
            let r = dispatch(tool, &json!({}));
            assert_eq!(r["ok"], json!(false), "{tool} must not report success without a db");
            assert_eq!(r["notImplemented"], json!(true));
        }
    }

    #[test]
    fn delisted_execution_tools_name_themselves() {
        for tool in ["pause_execution", "resume_execution", "cancel_execution"] {
            let r = dispatch(tool, &json!({}));
            assert_eq!(r["ok"], json!(false));
            assert_eq!(r["delisted"], json!(true), "{tool} was delisted in V11 and must say so");
        }
    }

    #[test]
    fn a_ts_shaped_graph_validates_through_the_aliases() {
        // MJ graphs say `connections` + `definitionId`; the aliases must accept them.
        let g = json!({
            "graph": {
                "nodes": [
                    {"id": "a", "definitionId": "agent.coder", "inputs": [{"id": "in"}], "outputs": [{"id": "out"}]},
                    {"id": "b", "definitionId": "agent.reviewer", "inputs": [{"id": "in"}], "outputs": [{"id": "out"}]}
                ],
                "connections": [{"id": "w1", "sourceNodeId": "a", "targetNodeId": "b"}]
            }
        });
        let r = validate_graph(&g);
        assert_eq!(r["ok"], json!(true), "issues: {:?}", r["issues"]);
    }

    /* ---- the real tools, against the shipped schema in memory ---- */

    fn mem_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("in-memory sqlite");
        crate::db::init(&conn).expect("schema");
        conn
    }

    fn seeded_db() -> rusqlite::Connection {
        let conn = mem_db();
        let graph = json!({
            "schemaVersion": 2,
            "nodes": [
                {"id": "a", "definitionId": "agent.coder", "title": "Coder",
                 "inputs": [{"id": "in", "label": "In", "dataType": "Text"}],
                 "outputs": [{"id": "out", "label": "Out", "dataType": "Text"}]},
                {"id": "b", "definitionId": "agent.reviewer", "title": "Reviewer",
                 "inputs": [{"id": "in", "label": "In", "dataType": "Text"}],
                 "outputs": [{"id": "out", "label": "Out", "dataType": "Text"}]},
                {"id": "c", "definitionId": "agent.tester", "title": "Tester",
                 "inputs": [{"id": "in", "label": "In", "dataType": "Text"}],
                 "outputs": [{"id": "out", "label": "Out", "dataType": "Text"}]}
            ],
            "connections": []
        });
        conn.execute(
            "INSERT INTO workflows (id, name, description, graph_json, created_at, updated_at) VALUES ('wf-1', 'probe', '', ?1, '2026-01-01', '2026-01-01')",
            rusqlite::params![graph.to_string()],
        )
        .expect("seed");
        conn
    }

    #[test]
    fn connect_ports_plans_applies_and_verifies_for_real() {
        let conn = seeded_db();
        let r = dispatch_with_db("connect_ports", &json!({
            "workflowId": "wf-1",
            "sourceNodeId": "a", "sourcePortId": "out",
            "targetNodeId": "b", "targetPortId": "in"
        }), &conn);
        assert_eq!(r["ok"], json!(true), "result: {:?}", r);
        assert_eq!(r["phase"], json!("verify"));
        // The wire is really in the store, not just in the response.
        let stored: String = conn.query_row("SELECT graph_json FROM workflows WHERE id='wf-1'", [], |x| x.get(0)).unwrap();
        assert!(stored.contains("\"targetNodeId\":\"b\""), "stored graph: {stored}");
    }

    #[test]
    fn connect_ports_refuses_bogus_ports_nodes_and_cycles() {
        let conn = seeded_db();
        let _ = dispatch_with_db("connect_ports", &json!({
            "workflowId": "wf-1", "sourceNodeId": "a", "sourcePortId": "out", "targetNodeId": "b", "targetPortId": "in"
        }), &conn);
        // Bad port
        let r = dispatch_with_db("connect_ports", &json!({
            "workflowId": "wf-1", "sourceNodeId": "a", "sourcePortId": "ghost", "targetNodeId": "c", "targetPortId": "in"
        }), &conn);
        assert_eq!(r["ok"], json!(false));
        assert!(r["error"].as_str().unwrap().contains("no output port"));
        // Unknown node
        let r = dispatch_with_db("connect_ports", &json!({
            "workflowId": "wf-1", "sourceNodeId": "a", "sourcePortId": "out", "targetNodeId": "ghost", "targetPortId": "in"
        }), &conn);
        assert_eq!(r["ok"], json!(false));
        // A cycle a → b → c → a must be refused at plan time, before anything is written.
        let _ = dispatch_with_db("connect_ports", &json!({
            "workflowId": "wf-1", "sourceNodeId": "b", "sourcePortId": "out", "targetNodeId": "c", "targetPortId": "in"
        }), &conn);
        let before: String = conn.query_row("SELECT graph_json FROM workflows WHERE id='wf-1'", [], |x| x.get(0)).unwrap();
        let r = dispatch_with_db("connect_ports", &json!({
            "workflowId": "wf-1", "sourceNodeId": "c", "sourcePortId": "out", "targetNodeId": "a", "targetPortId": "in"
        }), &conn);
        assert_eq!(r["ok"], json!(false), "cycle must be refused: {:?}", r);
        let after: String = conn.query_row("SELECT graph_json FROM workflows WHERE id='wf-1'", [], |x| x.get(0)).unwrap();
        assert_eq!(before, after, "a refused mutation must not touch the store");
    }

    #[test]
    fn disconnect_ports_removes_exactly_the_matching_wire() {
        let conn = seeded_db();
        let made = dispatch_with_db("connect_ports", &json!({
            "workflowId": "wf-1", "sourceNodeId": "a", "sourcePortId": "out", "targetNodeId": "b", "targetPortId": "in"
        }), &conn);
        let wire_id = made["wireId"].as_str().unwrap().to_string();
        let r = dispatch_with_db("disconnect_ports", &json!({ "workflowId": "wf-1", "wireId": wire_id }), &conn);
        assert_eq!(r["ok"], json!(true), "{:?}", r);
        assert_eq!(r["removed"], json!(1));
        let stored: String = conn.query_row("SELECT graph_json FROM workflows WHERE id='wf-1'", [], |x| x.get(0)).unwrap();
        assert!(!stored.contains(&wire_id));
        // Disconnecting something that is not there refuses and changes nothing.
        let r = dispatch_with_db("disconnect_ports", &json!({ "workflowId": "wf-1", "wireId": "no-such-wire" }), &conn);
        assert_eq!(r["ok"], json!(false));
    }

    #[test]
    fn list_nodes_reads_the_stored_graph() {
        let conn = seeded_db();
        let r = dispatch_with_db("list_nodes", &json!({ "workflowId": "wf-1" }), &conn);
        assert_eq!(r["ok"], json!(true));
        assert_eq!(r["nodes"].as_array().unwrap().len(), 3);
        assert_eq!(r["wireCount"], json!(0));
        let r = dispatch_with_db("list_nodes", &json!({ "workflowId": "ghost" }), &conn);
        assert_eq!(r["ok"], json!(false));
        assert!(r["error"].as_str().unwrap().contains("unknown workflow"));
    }

    #[test]
    fn run_workflow_queues_a_real_row_and_refuses_an_invalid_graph() {
        let conn = seeded_db();
        let r = dispatch_with_db("run_workflow", &json!({ "workflowId": "wf-1" }), &conn);
        assert_eq!(r["ok"], json!(true), "{:?}", r);
        assert_eq!(r["status"], json!("queued"));
        let queued: i64 = conn.query_row("SELECT COUNT(*) FROM run_queue WHERE workflow_id='wf-1'", [], |x| x.get(0)).unwrap();
        assert_eq!(queued, 1, "the queue row must exist after the call");
        // An empty graph is not runnable; a run request for it must not be queued.
        let empty = json!({"schemaVersion": 2, "nodes": [], "connections": []});
        conn.execute("INSERT INTO workflows (id, name, description, graph_json, created_at, updated_at) VALUES ('wf-empty', 'e', '', ?1, '2026-01-01', '2026-01-01')", rusqlite::params![empty.to_string()]).unwrap();
        let r = dispatch_with_db("run_workflow", &json!({ "workflowId": "wf-empty" }), &conn);
        assert_eq!(r["ok"], json!(false));
        let queued: i64 = conn.query_row("SELECT COUNT(*) FROM run_queue WHERE workflow_id='wf-empty'", [], |x| x.get(0)).unwrap();
        assert_eq!(queued, 0, "nothing may be queued for an invalid graph");
    }

    #[test]
    fn an_unknown_tool_is_still_an_error() {
        let r = dispatch("drop_database", &json!({}));
        assert_eq!(r["ok"], json!(false));
    }
}
