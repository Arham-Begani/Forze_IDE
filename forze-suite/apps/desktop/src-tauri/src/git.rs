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
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd).args(args);
    // Suppress the console window Windows would otherwise pop for every git
    // invocation — git_status polls every 4s, so without this the IDE strobes
    // conhost windows and bogs down on a large repo. No-op off Windows.
    crate::no_window(&mut cmd);
    let output = cmd
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

#[derive(Serialize)]
pub struct GitCommit {
    /// Full 40-char SHA.
    pub hash: String,
    /// Abbreviated SHA.
    pub short: String,
    pub author: String,
    /// ISO-8601 author date.
    pub date: String,
    /// First line of the message.
    pub subject: String,
    /// Remaining message body (may be empty).
    pub body: String,
}

/// The most recent commits on HEAD, newest first. Used by the "Build in Public"
/// generator to draft a post from what was just shipped. Fields are separated by
/// the unit separator (0x1f) and records by the record separator (0x1e) so commit
/// messages containing newlines, pipes, etc. parse unambiguously.
#[command]
pub fn git_log(cwd: String, limit: u32) -> Result<Vec<GitCommit>, String> {
    let n = limit.clamp(1, 100).to_string();
    let format = "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1f%b%x1e";
    let raw = run_git(&cwd, &["log", "-n", &n, format])?;

    let mut commits = Vec::new();
    for record in raw.split('\u{1e}') {
        let record = record.trim_start_matches('\n');
        if record.trim().is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.split('\u{1f}').collect();
        if fields.len() < 6 {
            continue;
        }
        commits.push(GitCommit {
            hash: fields[0].trim().to_string(),
            short: fields[1].trim().to_string(),
            author: fields[2].trim().to_string(),
            date: fields[3].trim().to_string(),
            subject: fields[4].trim().to_string(),
            body: fields[5].trim().to_string(),
        });
    }
    Ok(commits)
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

/// The full staged diff (`git diff --cached`) — what a commit is about to record.
/// This is the input to the pre-commit security review (Commit Guard): we scan
/// the newly-added lines for leaked secrets before letting the commit through.
#[command]
pub fn git_diff_staged(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["diff", "--cached", "--no-color"])
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

// ---------------------------------------------------------------------------
// Remote sync + branch operations (Milestone 1 — "Actually Ship").
//
// The SCM panel could stage + commit but had no way to actually push work
// anywhere, switch branches, or discard a bad edit — a commit with no push is a
// dead end. These commands close that gap. All go through `run_git`, so they
// inherit `no_window` (no console flash) and the "stderr becomes the Err string"
// contract the frontend surfaces as a toast.
// ---------------------------------------------------------------------------

/// Push the current branch to its remote. When `set_upstream` is true (the
/// branch has no tracking remote yet), push with `-u origin <branch>` so future
/// pushes/pulls "just work". Git writes progress to stderr even on success, so a
/// clean push returns an empty string; a rejected push surfaces git's message.
#[command]
pub fn git_push(cwd: String, set_upstream: bool) -> Result<String, String> {
    if set_upstream {
        let branch = git_current_branch(cwd.clone())?;
        run_git(&cwd, &["push", "--set-upstream", "origin", branch.trim()])
    } else {
        run_git(&cwd, &["push"])
    }
}

/// Pull with the user's configured strategy (merge unless `pull.rebase` is set),
/// matching what `git pull` does at the CLI. A conflict or diverged history exits
/// non-zero, surfacing git's message to the user rather than silently merging.
#[command]
pub fn git_pull(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["pull"])
}

/// Fetch all remotes and prune deleted remote branches. Read-only — never
/// touches the working tree — so it's safe to offer as a one-click refresh.
#[command]
pub fn git_fetch(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["fetch", "--all", "--prune"])
}

#[derive(Serialize)]
pub struct GitBranches {
    /// The checked-out branch (or a detached-HEAD sha).
    pub current: String,
    /// Local branch names, alphabetical.
    pub local: Vec<String>,
    /// Remote-tracking branch names (e.g. "origin/main"), minus the symbolic
    /// "origin/HEAD" pointer which isn't a real branch to check out.
    pub remote: Vec<String>,
}

/// List local + remote-tracking branches and mark the current one, for the SCM
/// branch switcher. Uses `for-each-ref` (stable, script-friendly output) rather
/// than parsing `git branch`'s human formatting.
#[command]
pub fn git_branches(cwd: String) -> Result<GitBranches, String> {
    let current = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    let local_raw = run_git(
        &cwd,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )?;
    let remote_raw = run_git(
        &cwd,
        &["for-each-ref", "--format=%(refname:short)", "refs/remotes"],
    )?;
    let local: Vec<String> = local_raw
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let remote: Vec<String> = remote_raw
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty() && !l.ends_with("/HEAD"))
        .collect();
    Ok(GitBranches {
        current,
        local,
        remote,
    })
}

/// Switch branches, or create a new one from HEAD when `create` is true. Git
/// refuses to switch when uncommitted changes would be overwritten and returns
/// that as an error, so the user's work is never silently clobbered.
#[command]
pub fn git_checkout(cwd: String, branch: String, create: bool) -> Result<(), String> {
    let b = branch.trim();
    if b.is_empty() {
        return Err("Branch name is empty.".into());
    }
    let args: Vec<&str> = if create {
        vec!["checkout", "-b", b]
    } else {
        vec!["checkout", b]
    };
    run_git(&cwd, &args).map(|_| ())
}

/// Discard all uncommitted changes to one tracked file, reverting both the index
/// and the working tree to the HEAD version (`git checkout HEAD -- <path>`).
/// Untracked files aren't in HEAD and are deleted through `fs_delete` instead, so
/// this is only offered for tracked, modified files.
#[command]
pub fn git_restore_file(cwd: String, path: String) -> Result<(), String> {
    let p = path.trim();
    if p.is_empty() {
        return Err("Path is empty.".into());
    }
    run_git(&cwd, &["checkout", "HEAD", "--", p]).map(|_| ())
}
