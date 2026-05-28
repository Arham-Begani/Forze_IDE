/**
 * Thin TS wrappers around the Rust filesystem commands. All calls go through
 * the Tauri IPC bridge; outside the Tauri shell (e.g. `vite dev` in browser)
 * each call rejects with a clear error so we surface the missing host rather
 * than silently swallowing.
 */
import { invokeCommand } from './tauri';

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface FsEventPayload {
  kind: string;
  paths: string[];
}

export function readDir(path: string): Promise<DirEntry[]> {
  return invokeCommand<DirEntry[]>('fs_read_dir', { path });
}

export function readFile(path: string): Promise<string> {
  return invokeCommand<string>('fs_read_file', { path });
}

export function writeFile(path: string, contents: string): Promise<void> {
  return invokeCommand<void>('fs_write_file', { payload: { path, contents } });
}

export function createFile(path: string): Promise<void> {
  return invokeCommand<void>('fs_create_file', { path });
}

export function createDir(path: string): Promise<void> {
  return invokeCommand<void>('fs_create_dir', { path });
}

export function deletePath(path: string): Promise<void> {
  return invokeCommand<void>('fs_delete', { path });
}

export function renamePath(from: string, to: string): Promise<void> {
  return invokeCommand<void>('fs_rename', { from, to });
}

export function startWatching(path: string): Promise<void> {
  return invokeCommand<void>('fs_watch', { path });
}

export function stopWatching(): Promise<void> {
  return invokeCommand<void>('fs_unwatch');
}

export async function subscribeToFsEvents(
  onEvent: (payload: FsEventPayload) => void,
): Promise<() => void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return () => undefined;
  }
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<FsEventPayload>('fs-event', (event) => {
    onEvent(event.payload);
  });
  return () => {
    unlisten();
  };
}

/** OS-aware path join. Uses `/` on web preview, native separator under Tauri. */
export function joinPath(...parts: string[]): string {
  const sep = detectSeparator(parts[0]);
  return parts
    .filter(Boolean)
    .map((p) => p.replace(/[/\\]+$/, ''))
    .join(sep);
}

export function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

export function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx >= 0 ? path.slice(0, idx) : '';
}

export function relativePath(root: string, path: string): string {
  if (!path.startsWith(root)) return path;
  return path.slice(root.length).replace(/^[\\/]+/, '');
}

function detectSeparator(sample?: string): string {
  if (!sample) return '/';
  return sample.includes('\\') ? '\\' : '/';
}

export function languageFromPath(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  const table: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    mdx: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    rs: 'rust',
    py: 'python',
    go: 'go',
    sh: 'shell',
    sql: 'sql',
    txt: 'plaintext',
  };
  return table[ext] ?? 'plaintext';
}
