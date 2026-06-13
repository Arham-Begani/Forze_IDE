import { confirmModal, promptModal } from '../shell/modal';

/**
 * Folder picker. Resolves to null when the user cancels the dialog or the
 * Tauri host is not present (e.g. running in a plain browser preview).
 */
export async function pickFolder(): Promise<string | null> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    // Browser preview fallback: ask via the in-app modal so vite dev still
    // works without falling back to native browser chrome.
    const path = await promptModal({
      title: 'Open Folder',
      message: 'Enter a folder path',
      placeholder: '/path/to/project',
    });
    return path && path.length > 0 ? path : null;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({ directory: true, multiple: false });
  if (typeof result === 'string') return result;
  return null;
}

/**
 * Native confirm dialog. Uses the Tauri dialog plugin under the shell and falls
 * back to the in-app modal in a plain browser preview.
 */
export async function confirmDialog(
  message: string,
  title = 'Forze',
): Promise<boolean> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return confirmModal({ title, message });
  }
  const { confirm } = await import('@tauri-apps/plugin-dialog');
  return confirm(message, { title, kind: 'warning' });
}
