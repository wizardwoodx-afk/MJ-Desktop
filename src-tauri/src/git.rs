/*
 * git.rs — MJ's git integration: the real repository state behind a mission.
 *
 * MJ assigns coding agents to work in isolated worktrees and then has to answer three questions the
 * agents themselves cannot be trusted to answer: *what actually changed*, *is this repository clean*,
 * and *did a seat that claimed to be read-only actually refrain from writing*. All three come from git,
 * not from an agent's report.
 *
 * The parsing lives in `git_core.rs` and is `include!`d here verbatim. That file is plain `std`, so it
 * compiles and is `cargo test`-ed in a standalone crate — which matters because `cargo check` cannot run
 * on the full Tauri crate anywhere but a developer's machine. The code that ships is the code that was
 * tested, not a copy of it.
 *
 * This file's own commands are deliberately thin: spawn git, hand the bytes to a tested parser, return
 * the result. Nothing here decides what the bytes mean.
 */

use serde_json::{json, Value};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

include!("./git_core.rs");

/// Default ceiling for a git invocation. Long enough for a large `git diff`, short enough that a hung
/// git cannot stall a mission wave indefinitely.
const GIT_TIMEOUT_SECS: u64 = 60;

///
/// Outcome of a git invocation.
///
/// A timeout is carried in the value, not returned as `Err`. `run_timeout` in `commands.rs` returns
/// `Err` for both "the binary could not be started" and "the deadline was reached", which makes those
/// two indistinguishable to the caller — and it discards whatever the child managed to print before it
/// was killed. For git that partial output is often the useful part, so this module keeps both.
struct GitOutcome {
    stdout: String,
    stderr: String,
    code: Option<i32>,
    timed_out: bool,
    elapsed_ms: u128,
}

impl GitOutcome {
    fn ok(&self) -> bool {
        !self.timed_out && self.code == Some(0)
    }
}

///
/// Run git and drain both pipes concurrently.
///
/// Reading stdout only after the child exits is a classic deadlock: the OS pipe buffer fills, the child
/// blocks on write, and MJ waits for a child that is waiting for MJ. `git diff` on a large repository
/// produces far more than 64 KiB, so this is not theoretical.
fn run_git(args: &[&str], cwd: Option<&str>, timeout_secs: u64) -> Result<GitOutcome, String> {
    use std::io::Read;

    let mut cmd = Command::new("git");
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let mut child = cmd.spawn().map_err(|e| format!("could not start git: {e}"))?;

    let drain_out = {
        let pipe = child.stdout.take();
        std::thread::spawn(move || {
            let mut buf = String::new();
            if let Some(mut p) = pipe {
                let _ = p.read_to_string(&mut buf);
            }
            buf
        })
    };
    let drain_err = {
        let pipe = child.stderr.take();
        std::thread::spawn(move || {
            let mut buf = String::new();
            if let Some(mut p) = pipe {
                let _ = p.read_to_string(&mut buf);
            }
            buf
        })
    };

    let start = Instant::now();
    let limit = Duration::from_secs(timeout_secs.max(1));
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = drain_out.join().unwrap_or_default();
                let stderr = drain_err.join().unwrap_or_default();
                return Ok(GitOutcome {
                    stdout,
                    stderr,
                    code: status.code(),
                    timed_out: false,
                    elapsed_ms: start.elapsed().as_millis(),
                });
            }
            Ok(None) => {
                if start.elapsed() > limit {
                    let _ = child.kill();
                    let _ = child.wait();
                    // Killing closes the pipes so the readers finish rather than leaking.
                    let stdout = drain_out.join().unwrap_or_default();
                    let stderr = drain_err.join().unwrap_or_default();
                    return Ok(GitOutcome {
                        stdout,
                        stderr,
                        code: None,
                        timed_out: true,
                        elapsed_ms: start.elapsed().as_millis(),
                    });
                }
                std::thread::sleep(Duration::from_millis(40));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Turn any git outcome into a JSON body, including the failure case.
///
/// Errors are returned *in the value* with `ok: false` rather than as `Err(String)`. A repository that
/// is not a git repository, or a diff that timed out, is a normal thing for the UI to have to display —
/// and an `Err` in Tauri surfaces as a rejected promise, which every caller would otherwise have to
/// special-case or silently swallow.
fn outcome_json(r: &GitOutcome, extra: impl FnOnce() -> Value) -> Value {
    if r.ok() {
        let mut v = extra();
        if let Some(obj) = v.as_object_mut() {
            obj.insert("ok".to_string(), json!(true));
            obj.insert("reason".to_string(), Value::Null);
            obj.insert("timedOut".to_string(), json!(false));
            obj.insert("elapsedMs".to_string(), json!(r.elapsed_ms));
        }
        v
    } else {
        let reason = if r.timed_out {
            format!(
                "git timed out after {}ms. The output below is partial: whatever git printed before MJ killed it.",
                r.elapsed_ms
            )
        } else if r.code.is_none() {
            "git was killed by a signal and reported no exit code.".to_string()
        } else {
            let msg = if r.stderr.trim().is_empty() { &r.stdout } else { &r.stderr };
            format!("git exited {}: {}", r.code.unwrap_or(-1), msg.trim())
        };
        json!({
            "ok": false,
            "reason": reason,
            "timedOut": r.timed_out,
            "elapsedMs": r.elapsed_ms,
            "stdout": r.stdout,
            "stderr": r.stderr,
            "exitCode": r.code,
        })
    }
}

fn status_entries_json(entries: &[StatusEntry]) -> Value {
    Value::Array(
        entries
            .iter()
            .map(|e| {
                json!({
                    "xy": e.xy,
                    "path": e.path,
                    "from": e.from,
                    "untracked": is_untracked(e),
                    "staged": is_staged(e),
                    "worktree": is_worktree(e),
                })
            })
            .collect(),
    )
}

/* ------------------------------------------------------------------ commands */

#[tauri::command]
pub fn git_is_repo(cwd: String) -> Result<Value, String> {
    match run_git(&["rev-parse", "--is-inside-work-tree"], Some(&cwd), GIT_TIMEOUT_SECS) {
        Ok(r) => Ok(outcome_json(&r, || {
            json!({ "isRepo": r.stdout.trim() == "true", "toplevel": r.stdout.trim() })
        })),
        Err(e) => Ok(json!({
            "ok": false,
            "isRepo": false,
            "reason": e,
            "timedOut": false,
        })),
    }
}

///
/// `git status --porcelain -z`, parsed.
///
/// The `-z` form is not optional here: it is the only format in which a filename containing a newline
/// survives, and it is the only one where a rename's two path fields are unambiguous.
#[tauri::command]
pub fn git_status(cwd: String) -> Result<Value, String> {
    match run_git(&["status", "--porcelain", "-z"], Some(&cwd), GIT_TIMEOUT_SECS) {
        Ok(r) => Ok(outcome_json(&r, || {
            let entries = parse_status_porcelain_z(&r.stdout);
            let summary = format!(
                "{} entr{}",
                entries.len(),
                if entries.len() == 1 { "y" } else { "ies" }
            );
            json!({
                "entries": status_entries_json(&entries),
                "count": entries.len(),
                "clean": entries.is_empty(),
                "untracked": entries.iter().filter(|e| is_untracked(e)).count(),
                "summary": summary,
            })
        })),
        Err(e) => Ok(json!({ "ok": false, "entries": [], "count": 0, "clean": false, "reason": e, "timedOut": false })),
    }
}

///
/// The working-tree diff, summarised and (optionally) truncated for a prompt.
///
/// `--unified=0` is used for counting because context lines would otherwise be indistinguishable from
/// content when a file legitimately contains lines beginning with '+' or '-'. The raw diff is still
/// returned so the UI can show a real patch.
#[tauri::command]
pub fn git_diff(cwd: String, staged: Option<bool>, budget: Option<usize>) -> Result<Value, String> {
    let mut args: Vec<&str> = vec!["diff", "--unified=0", "--no-color"];
    if staged.unwrap_or(false) {
        args.push("--cached");
    }
    match run_git(&args, Some(&cwd), GIT_TIMEOUT_SECS) {
        Ok(r) => Ok(outcome_json(&r, || {
            let files = parse_unified_diff(&r.stdout);
            let summary = summarize_diff(&files);
            let budget = budget.unwrap_or(24_000);
            json!({
                "files": files.iter().map(|f| json!({
                    "path": f.path,
                    "added": f.added,
                    "removed": f.removed,
                    "isNew": f.is_new,
                    "isDeleted": f.is_deleted,
                    "isBinary": f.is_binary,
                    "renamedFrom": f.renamed_from,
                })).collect::<Vec<_>>(),
                "summary": render_diff_summary(&summary),
                "totals": json!({
                    "files": summary.files,
                    "added": summary.added,
                    "removed": summary.removed,
                    "newFiles": summary.new_files,
                    "deletedFiles": summary.deleted_files,
                    "renames": summary.renames,
                    "binaryFiles": summary.binary_files,
                }),
                "raw": truncate_diff_for_prompt(&r.stdout, budget),
                "rawBytes": r.stdout.len(),
                "truncated": r.stdout.len() > budget,
            })
        })),
        Err(e) => Ok(json!({ "ok": false, "files": [], "summary": "git could not be run.", "reason": e, "timedOut": false })),
    }
}

#[tauri::command]
pub fn git_head(cwd: String) -> Result<Value, String> {
    match run_git(
        &["log", "-1", "--format=%H%n%h%n%s%n%an%n%aI"],
        Some(&cwd),
        GIT_TIMEOUT_SECS,
    ) {
        Ok(r) => Ok(outcome_json(&r, || {
            let lines: Vec<&str> = r.stdout.lines().collect();
            json!({
                // A repository with no commits yet has no HEAD. That is a real state, not an error,
                // so it is reported as such rather than as a failure.
                "sha": lines.first().copied().unwrap_or(""),
                "shortSha": lines.get(1).copied().unwrap_or(""),
                "subject": lines.get(2).copied().unwrap_or(""),
                "author": lines.get(3).copied().unwrap_or(""),
                "committedAt": lines.get(4).copied().unwrap_or(""),
                "hasCommits": !lines.is_empty() && !r.stdout.trim().is_empty(),
            })
        })),
        Err(e) => Ok(json!({ "ok": false, "sha": null, "hasCommits": false, "reason": e, "timedOut": false })),
    }
}

#[tauri::command]
pub fn git_branch(cwd: String) -> Result<Value, String> {
    match run_git(&["rev-parse", "--abbrev-ref", "HEAD"], Some(&cwd), GIT_TIMEOUT_SECS) {
        Ok(r) => Ok(outcome_json(&r, || {
            let name = r.stdout.trim().to_string();
            json!({
                "branch": name,
                // A detached worktree reports "HEAD". MJ creates detached review worktrees on purpose,
                // so this is a normal state and the caller needs to be able to see it.
                "detached": name == "HEAD",
            })
        })),
        Err(e) => Ok(json!({ "ok": false, "branch": null, "detached": false, "reason": e, "timedOut": false })),
    }
}

///
/// Did a seat that was told to be read-only actually refrain from writing?
///
/// A harness flag is a promise, not a guarantee: of MJ's nine harnesses only two have a read-only mode
/// that has been verified against the real binary. So the claim is checked against what git reports.
///
/// The three-way answer matters. `clean` means git saw no changes. `violated` lists what changed. And
/// `unknown` means git could not be read at all — which must never be reported as clean, because that is
/// precisely how a write goes unnoticed.
#[tauri::command]
pub fn git_read_only_check(cwd: String) -> Result<Value, String> {
    let status = match run_git(&["status", "--porcelain", "-z"], Some(&cwd), GIT_TIMEOUT_SECS) {
        Ok(r) if r.ok() => Some(parse_status_porcelain_z(&r.stdout)),
        Ok(r) => {
            return Ok(json!({
                "ok": true,
                "verdict": "unknown",
                "paths": [],
                "reason": if r.timed_out {
                    format!("git status timed out after {}ms, so the tree could not be verified.", r.elapsed_ms)
                } else {
                    format!("git status exited {:?}: {}", r.code, if r.stderr.trim().is_empty() { r.stdout.trim() } else { r.stderr.trim() })
                },
            }))
        }
        Err(e) => {
            return Ok(json!({
                "ok": true,
                "verdict": "unknown",
                "paths": [],
                "reason": e,
            }))
        }
    };

    match verdict_from_status(status.as_deref(), None) {
        ReadOnlyVerdict::Clean => Ok(json!({
            "ok": true,
            "verdict": "clean",
            "paths": [],
            "reason": "git reports no changes in this tree.",
        })),
        ReadOnlyVerdict::Violated { paths } => Ok(json!({
            "ok": true,
            "verdict": "violated",
            "paths": paths,
            "reason": format!(
                "This seat was told to be read-only, but git reports {} changed path(s).",
                paths.len()
            ),
        })),
        ReadOnlyVerdict::Unknown { reason } => Ok(json!({
            "ok": true,
            "verdict": "unknown",
            "paths": [],
            "reason": reason,
        })),
    }
}
