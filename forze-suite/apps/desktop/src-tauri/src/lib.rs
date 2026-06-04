mod fs;
mod git;
mod pty;

use keyring::Entry;
use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
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

/// Result of a one-shot command run, handed back to the Agent Manager's tools.
#[derive(Serialize)]
struct CommandOutput {
    stdout: String,
    stderr: String,
    exit_code: i32,
    timed_out: bool,
}

/// Build a shell that runs `command` as a single line, the way a human would
/// type it in a terminal. We go through the platform shell so agents can use
/// pipes, globs and `&&` without us re-implementing a parser. On Windows we set
/// CREATE_NO_WINDOW so running a command never flashes a console window over
/// the IDE.
#[cfg(windows)]
fn shell_command(command: &str) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", command]);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(not(windows))]
fn shell_command(command: &str) -> Command {
    use std::os::unix::process::CommandExt;
    let mut cmd = Command::new("sh");
    cmd.args(["-lc", command]);
    // New process group so a timeout can signal the whole tree, not just `sh`.
    cmd.process_group(0);
    cmd
}

/// Kill a spawned command *and its descendants*. Killing only the shell leaves
/// grandchildren (the actual `npm`/`tsc`/`ping` process) alive, holding the
/// inherited output pipes open — which would hang the reader threads until the
/// runaway finally exits. We tear down the whole tree so a timeout returns at
/// once.
#[cfg(windows)]
fn kill_process_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let _ = Command::new("taskkill")
        .args(["/T", "/F", "/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg(not(windows))]
fn kill_process_tree(pid: u32) {
    // The child is its own group leader (see shell_command), so the negative
    // pid signals the whole group.
    let _ = Command::new("kill")
        .args(["-KILL", &format!("-{pid}")])
        .output();
}

/// Run a shell command to completion in `cwd`, capturing stdout/stderr and the
/// exit code. This is what gives Agent Manager workers the ability to actually
/// *do* things — install deps, run tests, type-check — rather than only emit
/// advice. Output pipes are drained on threads so a chatty command can never
/// deadlock by filling a pipe, and a timeout kills runaway processes.
#[command]
fn run_command(
    command: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<CommandOutput, String> {
    if command.trim().is_empty() {
        return Err("Empty command.".into());
    }

    let mut cmd = shell_command(&command);
    if let Some(dir) = cwd.as_ref() {
        cmd.current_dir(dir);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let stdout_buf = Arc::new(Mutex::new(String::new()));
    let stderr_buf = Arc::new(Mutex::new(String::new()));
    let mut readers = Vec::new();

    if let Some(mut out) = child.stdout.take() {
        let buf = stdout_buf.clone();
        readers.push(thread::spawn(move || {
            let mut s = String::new();
            let _ = out.read_to_string(&mut s);
            if let Ok(mut g) = buf.lock() {
                g.push_str(&s);
            }
        }));
    }
    if let Some(mut err) = child.stderr.take() {
        let buf = stderr_buf.clone();
        readers.push(thread::spawn(move || {
            let mut s = String::new();
            let _ = err.read_to_string(&mut s);
            if let Ok(mut g) = buf.lock() {
                g.push_str(&s);
            }
        }));
    }

    let timeout = Duration::from_millis(timeout_ms.unwrap_or(120_000));
    let start = Instant::now();
    let mut timed_out = false;
    let exit_code = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.code().unwrap_or(-1),
            Ok(None) => {
                if start.elapsed() >= timeout {
                    kill_process_tree(child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                    timed_out = true;
                    break -1;
                }
                thread::sleep(Duration::from_millis(40));
            }
            Err(e) => return Err(e.to_string()),
        }
    };

    for handle in readers {
        let _ = handle.join();
    }

    let stdout = stdout_buf.lock().map(|g| g.clone()).unwrap_or_default();
    let stderr = stderr_buf.lock().map(|g| g.clone()).unwrap_or_default();

    Ok(CommandOutput {
        stdout,
        stderr,
        exit_code,
        timed_out,
    })
}

/// Record panics to a log file and stderr instead of letting them disappear.
/// A packaged Windows GUI app has no attached console, so without this a panic
/// (now that we unwind rather than abort) would be invisible. The previous build
/// shipped `panic = "abort"` + `strip`, so a crash left nothing to look at —
/// this makes the next one diagnosable: `%TEMP%\forze-ide-panic.log`.
fn install_panic_logger() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let when = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let line = format!("[forze] PANIC @unix:{when}: {info}\n");
        eprintln!("{line}");
        let path = std::env::temp_dir().join("forze-ide-panic.log");
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
        default_hook(info);
    }));
}

#[cfg(test)]
mod run_command_tests {
    use super::run_command;

    #[cfg(windows)]
    const SLEEP_CMD: &str = "ping -n 10 127.0.0.1 > nul";
    #[cfg(not(windows))]
    const SLEEP_CMD: &str = "sleep 10";

    #[test]
    fn captures_stdout_and_zero_exit() {
        let out = run_command("echo forze-hello".into(), None, Some(10_000)).unwrap();
        assert_eq!(out.exit_code, 0, "stderr: {}", out.stderr);
        assert!(out.stdout.contains("forze-hello"), "stdout was: {:?}", out.stdout);
        assert!(!out.timed_out);
    }

    #[test]
    fn reports_nonzero_exit() {
        #[cfg(windows)]
        let cmd = "exit 3";
        #[cfg(not(windows))]
        let cmd = "exit 3";
        let out = run_command(cmd.into(), None, Some(10_000)).unwrap();
        assert_eq!(out.exit_code, 3);
        assert!(!out.timed_out);
    }

    #[test]
    fn runs_in_given_cwd_and_can_write_a_file() {
        let dir = std::env::temp_dir().join(format!("forze-runcmd-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let cwd = dir.to_string_lossy().into_owned();

        // The agent's core power: create a file via a command, then read it back.
        #[cfg(windows)]
        let write = "echo content> made.txt";
        #[cfg(not(windows))]
        let write = "echo content > made.txt";
        let out = run_command(write.into(), Some(cwd.clone()), Some(10_000)).unwrap();
        assert_eq!(out.exit_code, 0, "stderr: {}", out.stderr);

        let written = std::fs::read_to_string(dir.join("made.txt")).unwrap();
        assert!(written.contains("content"), "file held: {:?}", written);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn kills_a_runaway_process_on_timeout() {
        let start = std::time::Instant::now();
        let out = run_command(SLEEP_CMD.into(), None, Some(500)).unwrap();
        assert!(out.timed_out, "expected a timeout");
        assert!(
            start.elapsed() < std::time::Duration::from_secs(5),
            "timeout did not fire promptly: {:?}",
            start.elapsed()
        );
    }
}

pub fn run() {
    install_panic_logger();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
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
            // agent tools
            run_command,
            // fs
            fs::fs_read_dir,
            fs::fs_read_file,
            fs::fs_collect_deploy_files,
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
            git::git_file_head,
            // pty
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
