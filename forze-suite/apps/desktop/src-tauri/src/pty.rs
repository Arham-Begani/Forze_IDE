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

fn default_shell() -> String {
    if cfg!(windows) {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
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

    // Reader thread: stream raw bytes back to the frontend in chunks.
    let reader_app = app.clone();
    let reader_id = session_id.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut reader = reader;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = reader_app.emit(
                        "pty-output",
                        PtyOutputPayload {
                            session_id: reader_id.clone(),
                            data,
                        },
                    );
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
