import { writeFile } from '../lib/fs';

/**
 * IPC bridge: the IDE periodically writes the active editor state to
 * ~/.forze/active-buffer.json so the @forze/mcp-server daemon (whether
 * launched by the IDE or by an external CLI like Claude Code) can resolve
 * the `forze.editor.active_buffer` tool against a single source of truth.
 */

export interface ActiveBufferPayload {
  filePath: string;
  contents: string;
  isDirty: boolean;
  updatedAt: number;
}

let lastSerialised: string | null = null;
let queueTimer: number | null = null;

export async function homeDir(): Promise<string> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return '~';
  }
  try {
    // Tauri v2's path API lives in @tauri-apps/api/path. We import lazily so
    // browser previews don't break.
    const path = await import('@tauri-apps/api/path');
    return await path.homeDir();
  } catch {
    // Fall back to an env-derived path. This may be unavailable in some
    // hardened Tauri builds — callers degrade gracefully.
    return '~';
  }
}

export async function activeBufferFilePath(): Promise<string> {
  const home = await homeDir();
  const sep = home.includes('\\') ? '\\' : '/';
  return `${home}${sep}.forze${sep}active-buffer.json`;
}

export function publishActiveBuffer(payload: ActiveBufferPayload): void {
  // Debounce so rapid keystrokes don't hammer disk. 250ms feels live without
  // saturating IO.
  if (queueTimer !== null) window.clearTimeout(queueTimer);
  queueTimer = window.setTimeout(() => {
    queueTimer = null;
    void persist(payload);
  }, 250);
}

async function persist(payload: ActiveBufferPayload): Promise<void> {
  const serialised = JSON.stringify(payload, null, 2);
  if (serialised === lastSerialised) return;
  lastSerialised = serialised;
  try {
    const target = await activeBufferFilePath();
    await writeFile(target, serialised);
  } catch (err) {
    // The fs_write_file command creates intermediate directories; if it
    // still fails (e.g., no Tauri shell) we silently drop — the IDE remains
    // functional, only the cross-process bridge degrades.
    // eslint-disable-next-line no-console
    console.warn('[forze] mcp bridge write failed', err);
  }
}

