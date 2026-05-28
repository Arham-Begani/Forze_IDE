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
