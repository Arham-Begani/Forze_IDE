use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter, State};

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize, Clone)]
pub struct FsEventPayload {
    pub kind: String,
    pub paths: Vec<String>,
}

#[derive(Deserialize)]
pub struct WriteFilePayload {
    pub path: String,
    pub contents: String,
}

/// Active filesystem watcher. Only one active watcher at a time — when the
/// founder opens a new workspace, the previous watcher is dropped.
#[derive(Default)]
pub struct WatcherState {
    inner: Mutex<Option<RecommendedWatcher>>,
}

#[command]
pub fn fs_read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();
    let read = fs::read_dir(&path).map_err(|e| format!("{}: {e}", path))?;
    for raw in read {
        let raw = raw.map_err(|e| e.to_string())?;
        let file_type = raw.file_type().map_err(|e| e.to_string())?;
        let entry_path: PathBuf = raw.path();
        let metadata = raw.metadata().ok();
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        entries.push(DirEntry {
            name: raw.file_name().to_string_lossy().into_owned(),
            path: entry_path.to_string_lossy().into_owned(),
            is_dir: file_type.is_dir(),
            size,
        });
    }
    // Directories first, then files; both alphabetised case-insensitively.
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

#[command]
pub fn fs_read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path))
}

#[command]
pub fn fs_write_file(payload: WriteFilePayload) -> Result<(), String> {
    if let Some(parent) = Path::new(&payload.path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&payload.path, payload.contents).map_err(|e| format!("{}: {e}", payload.path))
}

#[command]
pub fn fs_create_file(path: String) -> Result<(), String> {
    fs::write(&path, "").map_err(|e| format!("{}: {e}", path))
}

#[command]
pub fn fs_create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("{}: {e}", path))
}

#[command]
pub fn fs_delete(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[command]
pub fn fs_rename(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[command]
pub fn fs_watch(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let app_clone = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            let kind = format!("{:?}", event.kind);
            let paths = event
                .paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            let _ = app_clone.emit("fs-event", FsEventPayload { kind, paths });
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let mut slot = state.inner.lock().map_err(|e| e.to_string())?;
    *slot = Some(watcher);
    Ok(())
}

#[command]
pub fn fs_unwatch(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut slot = state.inner.lock().map_err(|e| e.to_string())?;
    *slot = None;
    Ok(())
}
