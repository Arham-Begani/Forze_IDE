use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
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

/// One file in a local-folder deployment: relative path (forward slashes),
/// SHA1 hex digest (what Vercel keys uploads by), byte size, and the raw bytes
/// base64-encoded so binary assets (images, fonts) survive the IPC hop intact.
#[derive(Serialize)]
pub struct DeployFile {
    pub file: String,
    pub sha: String,
    pub size: u64,
    pub data: String,
}

/// Directories never worth uploading — build output, deps, VCS, caches. Same
/// spirit as a `.vercelignore`: Vercel rebuilds from source, so we ship source.
const DEPLOY_IGNORE_DIRS: &[&str] = &[
    "node_modules", ".git", ".vercel", ".next", "dist", "build", "out",
    ".turbo", ".cache", ".svelte-kit", "target", "coverage", ".idea",
    ".parcel-cache", ".output", ".nuxt", ".vite", ".vscode", "__pycache__",
];

/// Files we refuse to upload — OS cruft, logs, and (critically) secrets. We
/// never want to push a `.env` to a remote service.
fn deploy_ignore_file(name: &str) -> bool {
    name == ".DS_Store"
        || name == "Thumbs.db"
        || name == ".env"
        || name.starts_with(".env.")
        || name.ends_with(".log")
}

/// Skip any single file larger than this (25 MiB). Keeps the base64 payload and
/// peak memory bounded; oversized assets belong in blob storage anyway.
const DEPLOY_MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;

fn collect_deploy(root: &Path, dir: &Path, out: &mut Vec<DeployFile>) -> Result<(), String> {
    let read = fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    for raw in read {
        let raw = raw.map_err(|e| e.to_string())?;
        let file_type = raw.file_type().map_err(|e| e.to_string())?;
        let name = raw.file_name().to_string_lossy().into_owned();
        let path = raw.path();
        if file_type.is_dir() {
            if DEPLOY_IGNORE_DIRS.contains(&name.as_str()) {
                continue;
            }
            collect_deploy(root, &path, out)?;
        } else if file_type.is_file() {
            if deploy_ignore_file(&name) {
                continue;
            }
            let meta = raw.metadata().map_err(|e| e.to_string())?;
            if meta.len() > DEPLOY_MAX_FILE_BYTES {
                continue;
            }
            let bytes = fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            let mut hasher = Sha1::new();
            hasher.update(&bytes);
            let sha = hasher
                .finalize()
                .iter()
                .map(|b| format!("{:02x}", b))
                .collect::<String>();
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            let data = BASE64.encode(&bytes);
            out.push(DeployFile {
                file: rel,
                sha,
                size: meta.len(),
                data,
            });
        }
    }
    Ok(())
}

/// Walk a workspace folder and return every deployable file (content + SHA1),
/// ready to upload to Vercel as a CLI-style file deployment.
#[command]
pub fn fs_collect_deploy_files(root: String) -> Result<Vec<DeployFile>, String> {
    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("{root} is not a folder"));
    }
    let mut out = Vec::new();
    collect_deploy(root_path, root_path, &mut out)?;
    Ok(out)
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

/// Directory names whose churn must never reach the frontend. A recursive
/// watch on the workspace root also sees `node_modules`, `.git`, build output,
/// etc.; while a dev server runs or `npm install` fires, those dirs emit
/// hundreds–thousands of events/sec. Forwarding them floods the IPC bridge and
/// triggers a re-render storm in the Explorer that hangs/crashes the webview.
/// We drop any event whose every path lives under one of these.
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "out",
    "target",
    ".turbo",
    ".cache",
    "coverage",
    ".svelte-kit",
    "vendor",
    ".venv",
    "__pycache__",
];

/// True when any path component is an ignored directory.
fn is_ignored(path: &Path) -> bool {
    path.components().any(|c| {
        c.as_os_str()
            .to_str()
            .map(|s| IGNORED_DIRS.contains(&s))
            .unwrap_or(false)
    })
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
            // Keep only paths outside ignored dirs; drop the event entirely if
            // nothing relevant remains. This is what stops the node_modules/
            // dist/.git event floods from ever reaching the renderer.
            let paths = event
                .paths
                .iter()
                .filter(|p| !is_ignored(p))
                .map(|p| p.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            if paths.is_empty() {
                return;
            }
            let kind = format!("{:?}", event.kind);
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
