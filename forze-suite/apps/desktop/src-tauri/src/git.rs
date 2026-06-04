use serde::Serialize;
use std::process::Command;
use tauri::command;

#[derive(Serialize)]
pub struct GitStatusEntry {
    /// Repository-relative path.
    pub path: String,
    /// Git porcelain status code, e.g. "M ", " M", "??", "A ", "AM".
    pub code: String,
    /// True when the file has staged changes.
    pub staged: bool,
    /// True when the file has unstaged changes.
    pub unstaged: bool,
    /// True for new untracked files.
    pub untracked: bool,
}

#[derive(Serialize)]
pub struct GitStatusReport {
    pub repo_root: String,
    pub branch: Option<String>,
    pub ahead: i32,
    pub behind: i32,
    pub entries: Vec<GitStatusEntry>,
}

fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(cwd)
        .args(args)
        .output()
        .map_err(|e| format!("failed to spawn git: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[command]
pub fn git_repo_root(cwd: String) -> Result<String, String> {
    let raw = run_git(&cwd, &["rev-parse", "--show-toplevel"])?;
    Ok(raw.trim().to_string())
}

#[command]
pub fn git_status(cwd: String) -> Result<GitStatusReport, String> {
    let repo_root = git_repo_root(cwd.clone())?;
    let raw = run_git(&cwd, &["status", "--porcelain=v1", "--branch"])?;

    let mut entries = Vec::new();
    let mut branch: Option<String> = None;
    let mut ahead: i32 = 0;
    let mut behind: i32 = 0;

    for line in raw.lines() {
        if line.starts_with("##") {
            let header = line.trim_start_matches("##").trim();
            // Examples: "main...origin/main [ahead 1, behind 2]" or "main" or
            // "HEAD (no branch)".
            let (branch_part, tail) = match header.split_once(' ') {
                Some((b, t)) => (b, t),
                None => (header, ""),
            };
            let local = branch_part
                .split("...")
                .next()
                .unwrap_or(branch_part)
                .to_string();
            branch = Some(local);

            if let Some(rest) = tail.split('[').nth(1) {
                let inside = rest.trim_end_matches(']');
                for chunk in inside.split(',') {
                    let chunk = chunk.trim();
                    if let Some(num) = chunk.strip_prefix("ahead ") {
                        ahead = num.parse::<i32>().unwrap_or(0);
                    } else if let Some(num) = chunk.strip_prefix("behind ") {
                        behind = num.parse::<i32>().unwrap_or(0);
                    }
                }
            }
            continue;
        }

        if line.len() < 3 {
            continue;
        }
        let code = line[..2].to_string();
        let path = line[3..].to_string();
        let staged_char = code.chars().next().unwrap_or(' ');
        let unstaged_char = code.chars().nth(1).unwrap_or(' ');
        let untracked = code == "??";
        let staged = staged_char != ' ' && staged_char != '?';
        let unstaged = unstaged_char != ' ' && unstaged_char != '?';

        entries.push(GitStatusEntry {
            path,
            code,
            staged,
            unstaged,
            untracked,
        });
    }

    Ok(GitStatusReport {
        repo_root,
        branch,
        ahead,
        behind,
        entries,
    })
}

#[command]
pub fn git_current_branch(cwd: String) -> Result<String, String> {
    let raw = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok(raw.trim().to_string())
}

#[command]
pub fn git_stage(cwd: String, paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["add", "--"];
    for p in &paths {
        args.push(p.as_str());
    }
    run_git(&cwd, &args).map(|_| ())
}

#[command]
pub fn git_unstage(cwd: String, paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["reset", "HEAD", "--"];
    for p in &paths {
        args.push(p.as_str());
    }
    run_git(&cwd, &args).map(|_| ())
}

#[command]
pub fn git_stage_all(cwd: String) -> Result<(), String> {
    run_git(&cwd, &["add", "-A"]).map(|_| ())
}

#[command]
pub fn git_commit(cwd: String, message: String) -> Result<String, String> {
    run_git(&cwd, &["commit", "-m", &message])?;
    let head = run_git(&cwd, &["rev-parse", "HEAD"])?;
    Ok(head.trim().to_string())
}

#[command]
pub fn git_diff_file(cwd: String, path: String, staged: bool) -> Result<String, String> {
    let mut args = vec!["diff", "--no-color"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(path.as_str());
    run_git(&cwd, &args)
}

/// The committed (HEAD) contents of a file, used as the baseline for the
/// editor's live change gutter (VS Code-style dirty diff). Returns an empty
/// string when the file isn't tracked in HEAD (a new file) so the whole buffer
/// reads as added rather than erroring. `path` is repo-relative with forward
/// slashes.
#[command]
pub fn git_file_head(cwd: String, path: String) -> Result<String, String> {
    let spec = format!("HEAD:{path}");
    match run_git(&cwd, &["show", &spec]) {
        Ok(contents) => Ok(contents),
        // `git show` fails for paths absent from HEAD (untracked/new files) and
        // when there's no HEAD yet (fresh repo). Treat both as "no baseline".
        Err(_) => Ok(String::new()),
    }
}
