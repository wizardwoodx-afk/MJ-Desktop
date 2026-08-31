/*
 * git_core.rs — the pure half of MJ's git integration.
 *
 * Everything here is plain `std`: no `tauri::command`, no `Value`, no process spawning. That split is
 * deliberate and load-bearing. `cargo check` cannot run on the full Tauri crate in a container without
 * webkit2gtk/gtk/libsoup, so a parser that lives inside `git.rs` can never be compiled, let alone
 * tested, before it reaches a user's machine. Parsers are also exactly where git integration goes
 * wrong — `git status -z` uses NUL separators precisely because filenames may contain newlines, and a
 * parser that splits on '\n' silently corrupts such a path.
 *
 * So the parsing lives here, is `include!`d verbatim into `git.rs`, and is exercised by `cargo test` in
 * a standalone crate. The code that ships is the code that was tested, not a copy of it.
 *
 * NOTE: this file must not begin with an inner doc comment (`//!`) — `include!` rejects that (E0753).
 */

/// One entry from `git status --porcelain -z`.
#[derive(Debug, Clone, PartialEq)]
pub struct StatusEntry {
    /// Two-character XY code, e.g. " M", "??", "R ".
    pub xy: String,
    pub path: String,
    /// Present for renames/copies: the path the entry was renamed from.
    pub from: Option<String>,
}

/// True when the entry means "this file is not in git at all".
pub fn is_untracked(e: &StatusEntry) -> bool {
    e.xy == "??"
}

/// True when the entry represents a modification to tracked content.
#[allow(dead_code)]
pub fn is_modification(e: &StatusEntry) -> bool {
    !is_untracked(e) && (e.xy.contains('M') || e.xy.contains('D') || e.xy.contains('R') || e.xy.contains('C'))
}

/// True when the change is staged (index side), i.e. X is not a space or '?'.
pub fn is_staged(e: &StatusEntry) -> bool {
    let x = e.xy.chars().next().unwrap_or(' ');
    x != ' ' && x != '?'
}

/// True when the change is in the working tree only (Y side).
pub fn is_worktree(e: &StatusEntry) -> bool {
    let y = e.xy.chars().nth(1).unwrap_or(' ');
    y != ' ' && y != '?'
}

///
/// Parse `git status --porcelain -z`.
///
/// The `-z` format is NUL-separated, and that is not a stylistic choice by git: it is the only form in
/// which a filename containing a newline, a quote or a leading space survives intact. The non-`-z`
/// format quotes such paths and prefixes them, so parsing it means unquoting — and getting that wrong
/// produces a path that does not exist on disk.
///
/// Rename and copy entries carry a *second* NUL-terminated field. Verified against real git
/// (`git mv old.txt new.txt` then `git status --porcelain -z | od -c`):
///
/// ```text
/// A   e x t r a . t x t \0 R     n e w . t x t \0 o l d . t x t \0
/// ```
///
/// so for a rename the FIRST path field is the destination and the SECOND is the origin — the reverse of
/// what one assumes from reading `rename from old` / `rename to new` in a diff. Getting this the wrong
/// way round reports the deleted path as the live one. Skipping the second field entirely is worse: it
/// shifts every subsequent entry by one and the rest of the output parses as garbage.
pub fn parse_status_porcelain_z(raw: &str) -> Vec<StatusEntry> {
    let mut out = Vec::new();
    // `split` on '\0' yields a trailing empty field for output that ends with a NUL; drop empties.
    let fields: Vec<&str> = raw.split('\0').filter(|f| !f.is_empty()).collect();
    let mut i = 0;
    while i < fields.len() {
        let f = fields[i];
        // A record is "XY <path>", so the code is the first two bytes.
        if f.len() < 4 {
            i += 1;
            continue;
        }
        let xy = f[..2].to_string();
        // Field layout for R/C is "XY <destination>\0<origin>", so the first path field is the live
        // path and the second is where it came from. Verified against real git rather than inferred:
        //   $ git mv old.txt new.txt && git status --porcelain -z | od -c
        //   R     n e w . t x t \0 o l d . t x t \0
        let path = f[3..].to_string();
        let mut from = None;
        if xy.starts_with('R') || xy.starts_with('C') {
            // The origin is the NEXT field. It must be consumed here: leaving it in the stream would
            // shift every subsequent entry by one and the rest of the output would parse as garbage.
            if i + 1 < fields.len() {
                from = Some(fields[i + 1].to_string());
                i += 1;
            }
        }
        out.push(StatusEntry { xy, path, from });
        i += 1;
    }
    out
}

/// One file's worth of change, read out of a unified diff.
#[derive(Debug, Clone, PartialEq)]
pub struct DiffFile {
    pub path: String,
    pub added: usize,
    pub removed: usize,
    pub is_new: bool,
    pub is_deleted: bool,
    pub is_binary: bool,
    /// Set when the diff records a rename rather than an add/delete pair.
    pub renamed_from: Option<String>,
}

///
/// Count changed files, additions and deletions from `git diff --unified=0` output.
///
/// Unified diff has several ways to say the same thing, and counting only one of them is how a summary
/// ends up reporting "0 files changed" for a diff that clearly changed files:
///
///   - `+++ b/path` and `--- a/path` for ordinary changes,
///   - `new file mode` / `deleted file mode` for adds and deletes, where one side is `/dev/null`,
///   - `rename from` / `rename to` for renames, which may carry **no** `+++`/`---` lines at all,
///   - `Binary files ... differ`, which has no hunk lines to count.
///
/// Lines inside a hunk body that begin with `+++` (a diff of a diff, or a patch file being edited) must
/// not be mistaken for a file header — so a header is only recognised outside a hunk, and hunk bodies
/// are detected by the `@@` marker.
pub fn parse_unified_diff(raw: &str) -> Vec<DiffFile> {
    let mut files: Vec<DiffFile> = Vec::new();
    let mut in_hunk = false;

    for line in raw.lines() {
        if line.starts_with("@@") {
            in_hunk = true;
            continue;
        }
        // A new file section always begins with "diff --git", which also ends the previous hunk.
        if line.starts_with("diff --git ") {
            in_hunk = false;
            // Fall back to the header itself when no +++/--- line ever arrives.
            let path = line
                .strip_prefix("diff --git a/")
                .and_then(|rest| rest.rsplit_once(" b/"))
                .map(|(_, b)| b.to_string())
                .unwrap_or_else(|| "<unknown>".to_string());
            files.push(DiffFile {
                path,
                added: 0,
                removed: 0,
                is_new: false,
                is_deleted: false,
                is_binary: false,
                renamed_from: None,
            });
            continue;
        }

        if let Some(rest) = line.strip_prefix("Binary files ") {
            if let Some(cur) = files.last_mut() {
                cur.is_binary = true;
                if cur.path == "<unknown>" {
                    // "Binary files a/x and b/x differ"
                    if let Some(after_a) = rest.strip_prefix("a/") {
                        if let Some((_, b)) = after_a.split_once(" and b/") {
                            cur.path = b.trim_end_matches(" differ").to_string();
                        }
                    }
                }
            }
            continue;
        }

        if let Some(old) = line.strip_prefix("rename from ") {
            if let Some(cur) = files.last_mut() {
                cur.renamed_from = Some(old.to_string());
            }
            continue;
        }
        if let Some(new) = line.strip_prefix("rename to ") {
            if let Some(cur) = files.last_mut() {
                cur.path = new.to_string();
            }
            continue;
        }
        if line.starts_with("new file mode") {
            if let Some(cur) = files.last_mut() {
                cur.is_new = true;
            }
            continue;
        }
        if line.starts_with("deleted file mode") {
            if let Some(cur) = files.last_mut() {
                cur.is_deleted = true;
            }
            continue;
        }

        // Only outside a hunk body: inside one, "+++"/"---" are content, not headers.
        if !in_hunk {
            if let Some(p) = line.strip_prefix("+++ ") {
                if let Some(cur) = files.last_mut() {
                    if p != "/dev/null" {
                        cur.path = strip_diff_prefix(p);
                    } else {
                        cur.is_deleted = true;
                    }
                }
                continue;
            }
            if let Some(p) = line.strip_prefix("--- ") {
                if p == "/dev/null" {
                    if let Some(cur) = files.last_mut() {
                        cur.is_new = true;
                    }
                }
                continue;
            }
        }

        // Hunk body. Count only real +/- lines, never the +++/--- headers.
        if let Some(cur) = files.last_mut() {
            if let Some(rest) = line.strip_prefix('+') {
                if !rest.starts_with("++") {
                    cur.added += 1;
                }
            } else if let Some(rest) = line.strip_prefix('-') {
                if !rest.starts_with("--") {
                    cur.removed += 1;
                }
            }
        }
    }

    // A `git diff` with no "diff --git" header (a single hand-made patch) still deserves an entry.
    if files.is_empty() && raw.lines().any(|l| l.starts_with("@@")) {
        files.push(DiffFile {
            path: "<unknown>".to_string(),
            added: raw.lines().filter(|l| l.starts_with('+') && !l.starts_with("+++")).count(),
            removed: raw.lines().filter(|l| l.starts_with('-') && !l.starts_with("---")).count(),
            is_new: false,
            is_deleted: false,
            is_binary: false,
            renamed_from: None,
        });
    }

    files
}

/// Strip the `a/` or `b/` prefix git puts on diff paths, and any trailing timestamp.
fn strip_diff_prefix(p: &str) -> String {
    let mut s = p;
    if let Some(rest) = s.strip_prefix("b/") {
        s = rest;
    } else if let Some(rest) = s.strip_prefix("a/") {
        s = rest;
    }
    // `+++ b/file\t2026-01-01 00:00:00.000000000 +0000`
    if let Some((path, _ts)) = s.split_once('\t') {
        return path.to_string();
    }
    s.to_string()
}

/// Totals across a diff, plus a one-line human summary.
#[derive(Debug, Clone, PartialEq)]
pub struct DiffSummary {
    pub files: usize,
    pub added: usize,
    pub removed: usize,
    pub new_files: usize,
    pub deleted_files: usize,
    pub renames: usize,
    pub binary_files: usize,
}

pub fn summarize_diff(files: &[DiffFile]) -> DiffSummary {
    DiffSummary {
        files: files.len(),
        added: files.iter().map(|f| f.added).sum(),
        removed: files.iter().map(|f| f.removed).sum(),
        new_files: files.iter().filter(|f| f.is_new).count(),
        deleted_files: files.iter().filter(|f| f.is_deleted).count(),
        renames: files.iter().filter(|f| f.renamed_from.is_some()).count(),
        binary_files: files.iter().filter(|f| f.is_binary).count(),
    }
}

///
/// One line describing a diff.
///
/// An empty diff must read as "no changes", never as "0 files changed" — the second invites a reader to
/// wonder whether the command failed.
pub fn render_diff_summary(s: &DiffSummary) -> String {
    if s.files == 0 {
        return "No changes.".to_string();
    }
    let mut parts = vec![format!(
        "{} file{}",
        s.files,
        if s.files == 1 { "" } else { "s" }
    )];
    parts.push(format!("+{} -{}", s.added, s.removed));
    if s.new_files > 0 {
        parts.push(format!("{} new", s.new_files));
    }
    if s.deleted_files > 0 {
        parts.push(format!("{} deleted", s.deleted_files));
    }
    if s.renames > 0 {
        parts.push(format!("{} renamed", s.renames));
    }
    if s.binary_files > 0 {
        parts.push(format!("{} binary", s.binary_files));
    }
    parts.join(", ")
}

///
/// Trim a diff to fit in a prompt.
///
/// Truncating mid-hunk is worse than useless — an agent shown half a hunk will "fix" code that is
/// already correct. So whole files are kept until the budget is spent, and the remainder is named
/// rather than shown, so the reader knows the diff was cut and which files were cut from it.
pub fn truncate_diff_for_prompt(raw: &str, budget: usize) -> String {
    if raw.len() <= budget {
        return raw.to_string();
    }
    // Split into per-file sections on the "diff --git" boundaries.
    let mut sections: Vec<String> = Vec::new();
    let mut cur = String::new();
    for line in raw.lines() {
        if line.starts_with("diff --git ") && !cur.is_empty() {
            sections.push(std::mem::take(&mut cur));
        }
        cur.push_str(line);
        cur.push('\n');
    }
    if !cur.is_empty() {
        sections.push(cur);
    }

    let mut kept: Vec<String> = Vec::new();
    let mut used = 0usize;
    let mut dropped: Vec<String> = Vec::new();
    for sec in sections {
        let path = sec
            .lines()
            .next()
            .and_then(|l| l.strip_prefix("diff --git a/"))
            .and_then(|r| r.rsplit_once(" b/"))
            .map(|(_, b)| b.to_string())
            .unwrap_or_else(|| "<section>".to_string());
        if used + sec.len() <= budget {
            used += sec.len();
            kept.push(sec);
        } else {
            dropped.push(path);
        }
    }

    let mut out = kept.concat();
    if !dropped.is_empty() {
        out.push_str(&format!(
            "\n[MJ truncated this diff to fit the prompt: {} more file(s) were changed but are not shown: {}]\n",
            dropped.len(),
            dropped.join(", ")
        ));
    }
    out
}

///
/// Decide whether a claimed read-only seat actually left the tree alone.
///
/// A harness flag is a promise, not a guarantee — only two of MJ's nine harnesses have a read-only mode
/// that has been verified against the real binary. So the claim is checked against what git reports,
/// and the answer distinguishes "clean" from "could not tell", because treating an unreadable status as
/// clean is how a write goes unnoticed.
#[derive(Debug, Clone, PartialEq)]
pub enum ReadOnlyVerdict {
    Clean,
    Violated { paths: Vec<String> },
    Unknown { reason: String },
}

pub fn verdict_from_status(entries: Option<&[StatusEntry]>, reason: Option<&str>) -> ReadOnlyVerdict {
    match entries {
        None => ReadOnlyVerdict::Unknown {
            reason: reason.unwrap_or("git status could not be read").to_string(),
        },
        Some(list) => {
            let changed: Vec<String> = list.iter().map(|e| e.path.clone()).collect();
            if changed.is_empty() {
                ReadOnlyVerdict::Clean
            } else {
                ReadOnlyVerdict::Violated { paths: changed }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_status() {
        let raw = " M src/a.ts\0?? new.txt\0";
        let e = parse_status_porcelain_z(raw);
        assert_eq!(e.len(), 2);
        assert_eq!(e[0].xy, " M");
        assert_eq!(e[0].path, "src/a.ts");
        assert!(is_untracked(&e[1]));
        assert!(!is_staged(&e[0]));
        assert!(is_worktree(&e[0]));
    }

    #[test]
    fn rename_consumes_the_second_field() {
        // These are the real bytes, captured with:
        //   git mv old.txt new.txt && printf 'x\n' > extra.txt && git add -A
        //   git status --porcelain -z | od -c
        // -> A   e x t r a . t x t \0 R     n e w . t x t \0 o l d . t x t \0
        //
        // So for a rename the FIRST path field is the destination and the SECOND is the origin — the
        // opposite of what "rename from old / rename to new" in a diff suggests.
        let raw = "A  extra.txt\0R  new.txt\0old.txt\0";
        let e = parse_status_porcelain_z(raw);
        // Consuming the origin field matters: if "old.txt" were left in the stream it would be parsed
        // as a record of its own and everything after it would misalign.
        assert_eq!(e.len(), 2, "got {:?}", e);
        assert_eq!(e[0].xy, "A ");
        assert_eq!(e[0].path, "extra.txt");
        assert_eq!(e[1].xy, "R ");
        assert_eq!(e[1].path, "new.txt", "the destination must be reported as the live path");
        assert_eq!(e[1].from.as_deref(), Some("old.txt"), "the origin must be reported as `from`");
        assert!(is_modification(&e[1]));
    }

    #[test]
    fn filename_with_newline_survives_z_format() {
        let raw = "?? weird\nname.txt\0";
        let e = parse_status_porcelain_z(raw);
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].path, "weird\nname.txt");
    }

    #[test]
    fn empty_status_is_empty_not_error() {
        assert!(parse_status_porcelain_z("").is_empty());
        assert!(parse_status_porcelain_z("\0").is_empty());
    }

    #[test]
    fn counts_additions_and_deletions() {
        let raw = "diff --git a/f.js b/f.js\n--- a/f.js\n+++ b/f.js\n@@ -1,2 +1,2 @@\n-old\n+new\n ctx\n";
        let f = parse_unified_diff(raw);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].path, "f.js");
        assert_eq!(f[0].added, 1);
        assert_eq!(f[0].removed, 1);
        assert!(!f[0].is_new);
    }

    #[test]
    fn detects_new_and_deleted_files() {
        let raw = "diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+hi\n\
                   diff --git a/gone.txt b/gone.txt\ndeleted file mode 100644\n--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-bye\n";
        let f = parse_unified_diff(raw);
        assert_eq!(f.len(), 2);
        assert!(f[0].is_new);
        assert!(f[1].is_deleted);
    }

    #[test]
    fn rename_without_hunk_is_still_a_changed_file() {
        let raw = "diff --git a/old.txt b/new.txt\nsimilarity index 100%\nrename from old.txt\nrename to new.txt\n";
        let f = parse_unified_diff(raw);
        assert_eq!(f.len(), 1, "a pure rename must not report zero files");
        assert_eq!(f[0].path, "new.txt");
        assert_eq!(f[0].renamed_from.as_deref(), Some("old.txt"));
        assert_eq!(summarize_diff(&f).renames, 1);
    }

    #[test]
    fn binary_file_is_reported_not_zero() {
        let raw = "diff --git a/img.png b/img.png\nBinary files a/img.png and b/img.png differ\n";
        let f = parse_unified_diff(raw);
        assert_eq!(f.len(), 1);
        assert!(f[0].is_binary);
        assert_eq!(summarize_diff(&f).binary_files, 1);
    }

    #[test]
    fn plus_plus_inside_a_hunk_is_content_not_a_header() {
        // A patch file being edited contains "+++ b/x" as *content*. Counting it as a header would
        // invent a second changed file.
        let raw = "diff --git a/patch.diff b/patch.diff\n--- a/patch.diff\n+++ b/patch.diff\n@@ -1 +1,2 @@\n +++ b/inner.txt\n+added line\n";
        let f = parse_unified_diff(raw);
        assert_eq!(f.len(), 1, "got {:?}", f);
        assert_eq!(f[0].path, "patch.diff");
    }

    #[test]
    fn empty_diff_says_no_changes() {
        assert_eq!(render_diff_summary(&summarize_diff(&[])), "No changes.");
    }

    #[test]
    fn summary_reads_naturally() {
        let f = parse_unified_diff("diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n-x\n+y\n");
        let s = render_diff_summary(&summarize_diff(&f));
        assert_eq!(s, "1 file, +1 -1");
    }

    #[test]
    fn truncation_names_what_it_dropped() {
        let mut raw = String::new();
        for i in 0..6 {
            raw.push_str(&format!(
                "diff --git a/f{i}.js b/f{i}.js\n--- a/f{i}.js\n+++ b/f{i}.js\n@@ -1 +1 @@\n-old{i}\n+new{i}\n"
            ));
        }
        let cut = truncate_diff_for_prompt(&raw, 200);
        assert!(cut.len() < raw.len());
        assert!(cut.contains("MJ truncated this diff"), "no truncation notice");
        assert!(cut.contains("f5.js"), "the dropped file was not named");
    }

    #[test]
    fn truncation_keeps_whole_files() {
        let raw = "diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/b.js b/b.js\n--- a/b.js\n+++ b/b.js\n@@ -1 +1 @@\n-p\n+q\n";
        let cut = truncate_diff_for_prompt(&raw, 90);
        // Whatever survived must contain a complete file section, never half of one.
        assert!(cut.contains("diff --git a/a.js") || cut.contains("diff --git a/b.js"));
        assert!(!cut.contains("-x\n+y\ndiff --git a/b.js b/b.js\n--- a/b.js\n+++ b/b.js\n@@ -1 +1 @@\n-p"), "a file was cut in half");
    }

    #[test]
    fn short_diff_is_returned_untouched() {
        let raw = "diff --git a/a.js b/a.js\n";
        assert_eq!(truncate_diff_for_prompt(raw, 10_000), raw);
    }

    #[test]
    fn read_only_verdict_distinguishes_clean_from_unknown() {
        assert_eq!(verdict_from_status(Some(&[]), None), ReadOnlyVerdict::Clean);
        let e = parse_status_porcelain_z(" M secret.txt\0");
        match verdict_from_status(Some(&e), None) {
            ReadOnlyVerdict::Violated { paths } => assert_eq!(paths, vec!["secret.txt".to_string()]),
            other => panic!("expected Violated, got {other:?}"),
        }
        // The important one: an unreadable status is NOT clean.
        match verdict_from_status(None, Some("not a git repository")) {
            ReadOnlyVerdict::Unknown { reason } => assert_eq!(reason, "not a git repository"),
            other => panic!("expected Unknown, got {other:?}"),
        }
    }
}
