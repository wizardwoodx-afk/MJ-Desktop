use crate::control_mcp;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

/// Spawn a vendored MCP server over stdio and issue initialize + tools/list.
/// No HTTP. No 127.0.0.1 bind.
pub fn connect_test(command: &str, args: &[String], cwd: &Path) -> Value {
    if command == "mj-control-mcp" {
        return json!({
            "connected": true,
            "transport": "stdio",
            "name": "Control MCP",
            // V7 fix (bug U): toolCount claimed 8 and listed 8 tool names, but only validate_graph
            // was implemented — the other seven answered ok:true without doing anything. The count
            // and the list now say what is true, and the unimplemented ones are named as such so a
            // caller can decide rather than discover it after a mutation silently did nothing.
            "toolCount": control_mcp::IMPLEMENTED_TOOLS.len(),
            "tools": control_mcp::IMPLEMENTED_TOOLS,
            "advertisedToolCount": control_mcp::ADVERTISED_TOOLS.len(),
            "notImplementedTools": control_mcp::ADVERTISED_TOOLS.iter().filter(|t| !control_mcp::IMPLEMENTED_TOOLS.contains(t)).collect::<Vec<_>>(),
            "authoredByMj": true,
            "mutationProtocol": "Plan→Apply→Verify",
        });
    }
    let mut child = match Command::new(command)
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return json!({
                "connected": false,
                "transport": "stdio",
                "lastError": format!("spawn {command}: {e}"),
                "toolCount": 0,
            });
        }
    };
    let init = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "mj", "version": "5.0.0"}
        }
    });
    let result = (|| -> Result<Value, String> {
        let stdin = child.stdin.as_mut().ok_or("stdin")?;
        writeln!(stdin, "{init}").map_err(|e| e.to_string())?;
        let tools = json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}});
        writeln!(stdin, "{tools}").map_err(|e| e.to_string())?;
        let _ = stdin.flush();
        let stdout = child.stdout.take().ok_or("stdout")?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        let mut replies = Vec::new();
        for _ in 0..4 {
            line.clear();
            let n = reader.read_line(&mut line).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            if let Ok(v) = serde_json::from_str::<Value>(line.trim()) {
                replies.push(v);
            }
        }
        Ok(json!({ "replies": replies }))
    })();
    let _ = child.kill();
    let _ = child.wait();
    match result {
        Ok(v) => {
            let replies = v["replies"].as_array().cloned().unwrap_or_default();
            let tools = replies.iter().find_map(|r| r.pointer("/result/tools")).cloned();
            let count = tools.as_ref().and_then(|t| t.as_array()).map(|a| a.len()).unwrap_or(0);
            json!({
                "connected": !replies.is_empty(),
                "transport": "stdio",
                "toolCount": count,
                "tools": tools,
                "lastError": if replies.is_empty() { Value::String("no JSON-RPC reply".into()) } else { Value::Null },
            })
        }
        Err(e) => json!({
            "connected": false,
            "transport": "stdio",
            "lastError": e,
            "toolCount": 0,
            "timeoutHint": Duration::from_secs(8).as_secs(),
        }),
    }
}

/// initialize + tools/call over stdio. Kills the child afterwards.
pub fn call_tool(command: &str, args: &[String], cwd: &Path, tool: &str, arguments: &Value) -> Value {
    if command == "mj-control-mcp" {
        return json!({ "ok": false, "error": "use control_* commands for Control MCP" });
    }
    let mut child = match Command::new(command)
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return json!({ "ok": false, "error": format!("spawn {command}: {e}") }),
    };
    let result = (|| -> Result<Value, String> {
        let stdin = child.stdin.as_mut().ok_or("stdin")?;
        let init = json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"mj","version":"5.0.0"}}});
        writeln!(stdin, "{init}").map_err(|e| e.to_string())?;
        let _ = writeln!(stdin, "{}", json!({"jsonrpc":"2.0","method":"notifications/initialized"}));
        let call = json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name": tool, "arguments": arguments}});
        writeln!(stdin, "{call}").map_err(|e| e.to_string())?;
        let _ = stdin.flush();
        let stdout = child.stdout.take().ok_or("stdout")?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        for _ in 0..8 {
            line.clear();
            let n = reader.read_line(&mut line).map_err(|e| e.to_string())?;
            if n == 0 { break; }
            if let Ok(v) = serde_json::from_str::<Value>(line.trim()) {
                if v.get("id") == Some(&json!(2)) {
                    return Ok(json!({"ok": true, "result": v.get("result").cloned().unwrap_or(v)}));
                }
            }
        }
        Err("no tools/call reply".into())
    })();
    let _ = child.kill();
    let _ = child.wait();
    match result {
        Ok(v) => v,
        Err(e) => json!({ "ok": false, "error": e }),
    }
}
