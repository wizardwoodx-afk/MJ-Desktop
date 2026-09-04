use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

pub fn vendor_dir(resource: &Path, cwd: &Path) -> PathBuf {
    let candidates = [
        resource.join("vendor"),
        cwd.join("vendor"),
        cwd.join("../vendor"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../vendor"),
    ];
    for c in candidates {
        if c.exists() {
            return c;
        }
    }
    cwd.join("vendor")
}

pub fn call(vendor: &Path, msg: &Value) -> Result<Value, String> {
    // Canonical entry point is the JSON-lines stdio server shipped in evolution-service/.
    // No HTTP. No 127.0.0.1 bind.
    let service = vendor.join("evolution-service");
    let module_entry = service.join("mj_evolution/stdio_server.py");
    let legacy_bridge = vendor.join("mj-bridge/bridge.py");

    let (program, args, cwd): (String, Vec<String>, std::path::PathBuf) = if module_entry.exists() {
        (
            "python3".into(),
            vec!["-m".into(), "mj_evolution.stdio_server".into()],
            service.clone(),
        )
    } else if legacy_bridge.exists() {
        (
            "python3".into(),
            vec![legacy_bridge.display().to_string()],
            vendor.parent().unwrap_or(vendor).to_path_buf(),
        )
    } else {
        return Err(format!(
            "missing evolution service: looked for {} and {}",
            module_entry.display(),
            legacy_bridge.display()
        ));
    };

    let mut child = Command::new(&program)
        .args(&args)
        .current_dir(&cwd)
        .env("PYTHONPATH", &service)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn {program}: {e}"))?;
    {
        let stdin = child.stdin.as_mut().ok_or("stdin")?;
        let mut line = msg.to_string();
        line.push('\n');
        stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        let _ = stdin.flush();
    }
    // Close stdin so the bridge can exit after one command.
    drop(child.stdin.take());
    let stdout = child.stdout.take().ok_or("stdout")?;
    let mut reader = BufReader::new(stdout);
    let mut out = String::new();
    let _ = reader.read_line(&mut out);
    let _ = child.wait();
    if out.trim().is_empty() {
        return Err("empty bridge response".into());
    }
    serde_json::from_str(out.trim()).map_err(|e| format!("bridge json: {e} :: {out}"))
}

pub fn ping(vendor: &Path) -> Value {
    match call(vendor, &json!({"cmd": "ping"})) {
        Ok(v) => v,
        Err(e) => json!({"ok": false, "error": e, "transport": "stdio"}),
    }
}

pub fn health(vendor: &Path) -> Value {
    let p = ping(vendor);
    json!({
        "available": p.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
        "transport": "stdio",
        "service": vendor.join("evolution-service").display().to_string(),
        "bridge": p,
        "hooks": ["on_session_start", "pre_llm_call", "post_llm_call", "on_session_end"],
        "timeoutHintMs": Duration::from_secs(30).as_millis(),
    })
}
