import { invokeCommand } from './tauri';

export interface PtyOutputPayload {
  session_id: string;
  data: string;
}

export interface PtyExitPayload {
  session_id: string;
  code: number | null;
}

export interface PtySpawnOptions {
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

export function spawnPty(options: PtySpawnOptions = {}): Promise<string> {
  return invokeCommand<string>('pty_spawn', { ...options } as Record<string, unknown>);
}

export function writePty(sessionId: string, data: string): Promise<void> {
  return invokeCommand<void>('pty_write', { sessionId, data });
}

export function resizePty(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invokeCommand<void>('pty_resize', { sessionId, cols, rows });
}

export function killPty(sessionId: string): Promise<void> {
  return invokeCommand<void>('pty_kill', { sessionId });
}

export async function subscribeToPtyOutput(
  onOutput: (payload: PtyOutputPayload) => void,
  onExit?: (payload: PtyExitPayload) => void,
): Promise<() => void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return () => undefined;
  }
  const { listen } = await import('@tauri-apps/api/event');
  const unlistenOut = await listen<PtyOutputPayload>('pty-output', (event) => {
    onOutput(event.payload);
  });
  const unlistenExit = await listen<PtyExitPayload>('pty-exit', (event) => {
    onExit?.(event.payload);
  });
  return () => {
    unlistenOut();
    unlistenExit();
  };
}
