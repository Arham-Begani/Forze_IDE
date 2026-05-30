use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{command, AppHandle, Emitter, State};

/// One running PTY session. The master is wrapped in a Mutex so writes /
/// resizes are serialised. Reads happen on a dedicated thread that emits
/// output events to the frontend.
struct Session {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<String, Session>>,
}

#[derive(Serialize, Clone)]
struct PtyOutputPayload {
    session_id: String,
    /// UTF-8 lossy decode of the raw PTY bytes. ANSI escape sequences pass
    /// through unchanged because they live in the ASCII range.
    data: String,
}

#[derive(Serialize, Clone)]
struct PtyExitPayload {
    session_id: String,
    code: Option<i32>,
}

/// Default shell. On Windows we match VS Code and use PowerShell rather than
/// cmd.exe (COMSPEC) — cmd only has `cls`, while PowerShell supports `clear`,
/// `cls`, and `Clear-Host`, which is what users expect. Prefer PowerShell 7
/// (`pwsh`) when it's on PATH, otherwise fall back to Windows PowerShell.
#[cfg(windows)]
fn default_shell() -> String {
    which_on_path("pwsh.exe")
        .or_else(|| which_on_path("powershell.exe"))
        .unwrap_or_else(|| "powershell.exe".to_string())
}

#[cfg(not(windows))]
fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

/// Resolve an executable against PATH (Windows only).
#[cfg(windows)]
fn which_on_path(exe: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(exe);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

#[command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    shell: Option<String>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    // Clamp to a sane minimum — xterm-fit can briefly report 0 on the very
    // first measure, and portable-pty with cols=0/rows=0 is undefined.
    let safe_cols = cols.unwrap_or(120).max(40);
    let safe_rows = rows.unwrap_or(30).max(10);
    let size = PtySize {
        rows: safe_rows,
        cols: safe_cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let shell_cmd = shell.unwrap_or_else(default_shell);
    let mut cmd = CommandBuilder::new(&shell_cmd);
    // Resolve a usable cwd: prefer the explicit one, fall back to the user's
    // home dir, then to the Tauri process cwd. Non-existent paths quietly
    // get demoted so spawn() doesn't fail with a cryptic OS error.
    let resolved_cwd = cwd
        .as_deref()
        .filter(|p| std::path::Path::new(p).is_dir())
        .map(|s| s.to_string())
        .or_else(|| {
            std::env::var("USERPROFILE")
                .ok()
                .or_else(|| std::env::var("HOME").ok())
        });
    if let Some(dir) = resolved_cwd.as_ref() {
        cmd.cwd(dir);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn '{}' failed: {e}", shell_cmd))?;
    // Drop the slave handle so the PTY closes when the child exits.
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let session_id = uuid::Uuid::new_v4().to_string();

    let session = Session {
        master: Arc::new(Mutex::new(pair.master)),
        writer: Arc::new(Mutex::new(writer)),
        child: Arc::new(Mutex::new(child)),
    };

    state.sessions.lock().insert(session_id.clone(), session);

    // Reader thread: stream bytes back to the frontend. We must not split a
    // multi-byte UTF-8 sequence across two reads — doing so makes
    // `from_utf8_lossy` emit replacement chars (�) and corrupts box-drawing,
    // spinners, and progress bars (exactly what npm/pnpm/git print). So we
    // keep a `pending` buffer, emit only the longest valid UTF-8 prefix, and
    // carry the incomplete tail (≤3 bytes) into the next read.
    let reader_app = app.clone();
    let reader_id = session_id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut reader = reader;
        let mut pending: Vec<u8> = Vec::new();

        let emit = |data: String, app: &AppHandle, id: &str| {
            if data.is_empty() {
                return;
            }
            let _ = app.emit(
                "pty-output",
                PtyOutputPayload {
                    session_id: id.to_string(),
                    data,
                },
            );
        };

        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF: flush whatever is left (lossily — the stream is done).
                    if !pending.is_empty() {
                        emit(
                            String::from_utf8_lossy(&pending).into_owned(),
                            &reader_app,
                            &reader_id,
                        );
                    }
                    break;
                }
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let valid_up_to = match std::str::from_utf8(&pending) {
                        Ok(_) => pending.len(),
                        Err(e) => e.valid_up_to(),
                    };
                    if valid_up_to > 0 {
                        // SAFETY: bytes [..valid_up_to] are valid UTF-8 by the check above.
                        let chunk = unsafe {
                            std::str::from_utf8_unchecked(&pending[..valid_up_to]).to_owned()
                        };
                        emit(chunk, &reader_app, &reader_id);
                        pending.drain(..valid_up_to);
                    }
                    // A legitimate incomplete UTF-8 char is at most 3 trailing
                    // bytes. Anything longer is genuine garbage that will never
                    // resolve — flush it lossily so the stream can't stall.
                    if pending.len() >= 4 {
                        emit(
                            String::from_utf8_lossy(&pending).into_owned(),
                            &reader_app,
                            &reader_id,
                        );
                        pending.clear();
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Child-watcher thread: emit when the shell exits so the frontend can
    // mark the terminal closed.
    let watcher_app = app.clone();
    let watcher_id = session_id.clone();
    let session_handle = state
        .sessions
        .lock()
        .get(&session_id)
        .map(|s| s.child.clone())
        .ok_or_else(|| "session disappeared before watcher started".to_string())?;

    thread::spawn(move || {
        let exit_code = {
            let mut child = session_handle.lock();
            child.wait().ok().map(|status| status.exit_code() as i32)
        };
        let _ = watcher_app.emit(
            "pty-exit",
            PtyExitPayload {
                session_id: watcher_id,
                code: exit_code,
            },
        );
    });

    Ok(session_id)
}

#[command]
pub fn pty_write(
    state: State<'_, PtyState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock();
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("unknown pty session: {session_id}"))?;
    let mut writer = session.writer.lock();
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn pty_resize(
    state: State<'_, PtyState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock();
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("unknown pty session: {session_id}"))?;
    let master = session.master.lock();
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn pty_kill(state: State<'_, PtyState>, session_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock();
    if let Some(session) = sessions.remove(&session_id) {
        let _ = session.child.lock().kill();
    }
    Ok(())
}
