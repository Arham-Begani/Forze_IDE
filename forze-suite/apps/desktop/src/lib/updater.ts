// Tauri auto-updater glue. Checks the configured updater endpoint on startup,
// downloads + installs any newer signed release, then relaunches the app.
//
// Safe to call from the browser dev build: the Tauri plugin APIs only exist in
// the native shell, so outside it this is a no-op. The plugins are imported
// dynamically so the web bundle never tries to resolve native-only code paths.

const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Check for an update and, if one is available, install it and relaunch.
 * Errors are swallowed (logged only) — a failed update check must never block
 * app startup or surface a scary dialog to the user.
 */
export async function checkForUpdates(): Promise<void> {
  if (!isTauri) return;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update) {
      console.info(
        `[forze] update available: ${update.version} (current ${update.currentVersion})`,
      );
      await update.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    }
  } catch (e) {
    console.error('[forze] update check failed', e);
  }
}
