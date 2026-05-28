/**
 * Thin wrapper around the Tauri JS API so the rest of the UI never imports it
 * directly. This also gives us a deterministic browser fallback when running
 * `vite dev` outside of the Tauri shell.
 */
import type { StackTraceLine } from '@forze/shared/diagnostics';

type Unsubscribe = () => void;

const isTauri =
  typeof window !== 'undefined' &&
  Reflect.has(window as object, '__TAURI_INTERNALS__');

export async function invokeCommand<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!isTauri) {
    throw new Error(
      `[forze] invokeCommand('${command}') called outside the Tauri shell.`,
    );
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export async function subscribeToDevServerLogs(
  onLine: (line: string) => void,
): Promise<Unsubscribe> {
  if (!isTauri) return () => undefined;

  const { listen } = await import('@tauri-apps/api/event');

  const unlistenLog = await listen<{ stream: string; line: string }>(
    'dev-server-log',
    (event) => {
      const { line } = event.payload;
      if (typeof line === 'string') onLine(line);
    },
  );
  const unlistenErr = await listen<string>('dev-server-error', (event) => {
    if (typeof event.payload === 'string') onLine(event.payload);
  });

  return () => {
    unlistenLog();
    unlistenErr();
  };
}

export async function storeCredential(
  service: string,
  username: string,
  token: string,
): Promise<void> {
  await invokeCommand<void>('store_credential', { service, username, token });
}

export async function getCredential(
  service: string,
  username: string,
): Promise<string> {
  return invokeCommand<string>('get_credential', { service, username });
}

export async function getGitDiff(cwd?: string): Promise<string> {
  return invokeCommand<string>('get_git_diff', { cwd });
}

export async function runDevServer(projectPath: string): Promise<void> {
  await invokeCommand<void>('run_dev_server', { projectPath });
}

export type { StackTraceLine };
