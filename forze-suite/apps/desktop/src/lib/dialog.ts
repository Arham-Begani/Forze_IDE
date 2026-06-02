/**
 * Folder picker. Resolves to null when the user cancels the dialog or the
 * Tauri host is not present (e.g. running in a plain browser preview).
 */
export async function pickFolder(): Promise<string | null> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    // Browser preview fallback: ask via prompt() so vite dev still works.
    // eslint-disable-next-line no-alert
    const path = window.prompt('Enter folder path');
    return path && path.length > 0 ? path : null;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({ directory: true, multiple: false });
  if (typeof result === 'string') return result;
  return null;
}

/**
 * Native confirm dialog. Uses the Tauri dialog plugin under the shell and falls
 * back to `window.confirm` in a plain browser preview.
 */
export async function confirmDialog(
  message: string,
  title = 'Forze',
): Promise<boolean> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    // eslint-disable-next-line no-alert
    return window.confirm(message);
  }
  const { confirm } = await import('@tauri-apps/plugin-dialog');
  return confirm(message, { title, kind: 'warning' });
}
