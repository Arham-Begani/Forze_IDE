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
  /**
   * Optional CLI to boot the shell into (e.g. `claude`, `codex`, `agy`,
   * `opencode`). Run as a shell startup argument by the backend so it launches
   * deterministically; the shell stays interactive afterwards.
   */
  launchCommand?: string;
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

// `pty-output`/`pty-exit` are global broadcasts: Tauri delivers each emitted
// event to *every* registered listener. If each terminal registered its own
// pair, then with N terminals open every output chunk would be delivered N
// times (N-1 of them discarded by the session-id filter) — O(N²) IPC + GC
// churn that drags down (and can crash) a grid of busy terminals. Instead we
// keep a SINGLE pair of underlying listeners and fan out to per-terminal
// handlers in JS, so the cost stays O(N) regardless of terminal count.
type OutputHandler = (payload: PtyOutputPayload) => void;
type ExitHandler = (payload: PtyExitPayload) => void;

const outputHandlers = new Set<OutputHandler>();
const exitHandlers = new Set<ExitHandler>();
let unlistenOut: (() => void) | null = null;
let unlistenExit: (() => void) | null = null;
let wiring: Promise<void> | null = null;

async function ensureWired(): Promise<void> {
  if (unlistenOut) return;
  if (!wiring) {
    wiring = (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlistenOut = await listen<PtyOutputPayload>('pty-output', (event) => {
        for (const handler of outputHandlers) handler(event.payload);
      });
      unlistenExit = await listen<PtyExitPayload>('pty-exit', (event) => {
        for (const handler of exitHandlers) handler(event.payload);
      });
    })();
  }
  await wiring;
}

export async function subscribeToPtyOutput(
  onOutput: (payload: PtyOutputPayload) => void,
  onExit?: (payload: PtyExitPayload) => void,
): Promise<() => void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return () => undefined;
  }
  outputHandlers.add(onOutput);
  if (onExit) exitHandlers.add(onExit);
  await ensureWired();
  return () => {
    outputHandlers.delete(onOutput);
    if (onExit) exitHandlers.delete(onExit);
    // Tear the underlying listeners down once the last terminal is gone, so an
    // idle app holds no pty plumbing.
    if (outputHandlers.size === 0 && exitHandlers.size === 0) {
      unlistenOut?.();
      unlistenExit?.();
      unlistenOut = null;
      unlistenExit = null;
      wiring = null;
    }
  };
}
