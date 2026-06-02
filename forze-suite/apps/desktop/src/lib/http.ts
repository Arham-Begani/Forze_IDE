/**
 * Cross-origin HTTP for external APIs (Vercel, etc.).
 *
 * Inside the Tauri shell we route through `@tauri-apps/plugin-http`, whose
 * requests are made from Rust and therefore are NOT subject to the webview's
 * CORS policy — the right way to call third-party REST APIs from a desktop app.
 * In a plain browser preview we fall back to the global `fetch` (which works
 * for CORS-enabled hosts and fails clearly otherwise).
 */

const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function httpFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (isTauri) {
    try {
      const mod = await import('@tauri-apps/plugin-http');
      return mod.fetch(url, init);
    } catch {
      // Plugin missing (older shell) — fall through to the global fetch.
    }
  }
  return fetch(url, init);
}
