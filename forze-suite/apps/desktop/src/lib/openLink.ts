/**
 * Where a clicked link goes. Local dev-server URLs (localhost / 127.0.0.1 /
 * 0.0.0.0, http *or* https) open inside the IDE's Live Preview pane so the
 * running app shows up without leaving the window; everything else hands off to
 * the OS default browser. Used by the terminal link handler (terminalKit) and
 * anywhere else a URL might be activated.
 */
import { usePreview } from '../workbench/previewStore';
import { useWorkbench } from '../workbench/store';

/** Hostnames we treat as "the local dev server". */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  '[::]',
]);

/** True for an http(s) URL whose host is the local machine. */
export function isLocalhostUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
}

/**
 * Rewrite a bind-all address (0.0.0.0 / [::]) to a host the webview can actually
 * load — dev servers commonly *print* 0.0.0.0, but a browser can't navigate to
 * it. Protocol (http/https), port and path are preserved untouched.
 */
export function toLoadableLocalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === '0.0.0.0' || host === '[::]') {
      u.hostname = 'localhost';
      return u.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}

const isTauri = (): boolean =>
  typeof window !== 'undefined' &&
  Reflect.has(window as object, '__TAURI_INTERNALS__');

/** Open a URL in the OS default browser (shell:allow-open). Falls back to
 *  window.open outside the Tauri shell (plain `vite dev`, tests). */
export async function openExternal(raw: string): Promise<void> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(raw);
      return;
    } catch {
      /* fall through to window.open */
    }
  }
  window.open(raw, '_blank', 'noopener');
}

/**
 * Route a clicked link: localhost dev URLs land in the embedded Live Preview
 * (opening/focusing the tab), everything else goes to the external browser.
 */
export async function openLink(raw: string): Promise<void> {
  if (isLocalhostUrl(raw)) {
    // Point the preview first so it reads the right URL the moment it mounts,
    // then open/focus the tab.
    usePreview.getState().setUrl(toLoadableLocalUrl(raw));
    useWorkbench.getState().openPage('preview');
    return;
  }
  await openExternal(raw);
}
