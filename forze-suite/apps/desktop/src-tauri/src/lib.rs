mod fs;
mod git;
mod pty;

use keyring::Entry;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::thread;
use tauri::{command, AppHandle, Emitter, Manager};

use crate::fs::WatcherState;
use crate::pty::PtyState;

/// Store a secret (e.g. Supabase session token) in the OS keychain.
#[command]
fn store_credential(service: &str, username: &str, token: &str) -> Result<(), String> {
    let entry = Entry::new(service, username).map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
fn get_credential(service: &str, username: &str) -> Result<String, String> {
    let entry = Entry::new(service, username).map_err(|e| e.to_string())?;
    let password = entry.get_password().map_err(|e| e.to_string())?;
    Ok(password)
}

#[command]
fn delete_credential(service: &str, username: &str) -> Result<(), String> {
    let entry = Entry::new(service, username).map_err(|e| e.to_string())?;
    entry.delete_password().map_err(|e| e.to_string())?;
    Ok(())
}

/// Capture `git diff HEAD` for the active workspace root.
#[command]
fn get_git_diff(cwd: Option<String>) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(["diff", "HEAD"]);
    if let Some(path) = cwd {
        cmd.current_dir(path);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[derive(Serialize, Clone)]
struct DevServerLog {
    stream: &'static str,
    line: String,
}

/// Spawn `npm run dev` in the founder's project directory and stream stdout /
/// stderr lines back to the React frontend as `dev-server-log` events.
#[command]
fn run_dev_server(app: AppHandle, project_path: String) -> Result<(), String> {
    let stdout_app = app.clone();
    let stderr_app = app.clone();

    thread::spawn(move || {
        let spawn_result = Command::new(npm_executable())
            .current_dir(&project_path)
            .args(["run", "dev"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let mut child = match spawn_result {
            Ok(child) => child,
            Err(err) => {
                let _ = stdout_app.emit("dev-server-error", err.to_string());
                return;
            }
        };

        if let Some(stdout) = child.stdout.take() {
            thread::spawn(move || {
                for line in BufReader::new(stdout).lines().flatten() {
                    let _ = stdout_app.emit(
                        "dev-server-log",
                        DevServerLog { stream: "stdout", line },
                    );
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            thread::spawn(move || {
                for line in BufReader::new(stderr).lines().flatten() {
                    let _ = stderr_app.emit(
                        "dev-server-log",
                        DevServerLog { stream: "stderr", line },
                    );
                }
            });
        }

        let _ = child.wait();
    });

    Ok(())
}

#[cfg(windows)]
fn npm_executable() -> &'static str {
    "npm.cmd"
}

#[cfg(not(windows))]
fn npm_executable() -> &'static str {
    "npm"
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState::default())
        .manage(PtyState::default())
        .setup(|app| {
            let _ = app.get_webview_window("main");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // credentials
            store_credential,
            get_credential,
            delete_credential,
            // dev server / diff (legacy)
            get_git_diff,
            run_dev_server,
            // fs
            fs::fs_read_dir,
            fs::fs_read_file,
            fs::fs_write_file,
            fs::fs_create_file,
            fs::fs_create_dir,
            fs::fs_delete,
            fs::fs_rename,
            fs::fs_watch,
            fs::fs_unwatch,
            // git
            git::git_repo_root,
            git::git_status,
            git::git_current_branch,
            git::git_stage,
            git::git_unstage,
            git::git_stage_all,
            git::git_commit,
            git::git_diff_file,
            // pty
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
