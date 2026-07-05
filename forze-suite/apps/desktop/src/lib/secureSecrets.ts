/**
 * Keychain-backed storage for secrets the renderer must remember: BYOK AI
 * provider keys, the Vercel token, LinkedIn OAuth tokens. Values go through
 * the Rust `secure_get|set|remove` commands into the OS keychain (Keychain /
 * Credential Manager / libsecret) — the same store that already holds the
 * Supabase session (see lib/supabase.ts) — so no secret sits in localStorage
 * where any XSS or a copied browser profile could read it.
 *
 * Outside the Tauri shell (plain-browser `vite dev`, vitest) there is no
 * keychain, so we fall back to localStorage under the same key. That path
 * only ever runs in development.
 */

const isTauri =
  typeof window !== 'undefined' &&
  Reflect.has(window as object, '__TAURI_INTERNALS__');

function localFallback(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export async function secureGet(key: string): Promise<string | null> {
  if (!isTauri) return localFallback()?.getItem(key) ?? null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<string | null>('secure_get', { key })) ?? null;
  } catch {
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (!isTauri) {
    localFallback()?.setItem(key, value);
    return;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secure_set', { key, value });
  } catch {
    /* keychain unavailable — the value stays in memory for this session */
  }
}

export async function secureRemove(key: string): Promise<void> {
  if (!isTauri) {
    localFallback()?.removeItem(key);
    return;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secure_remove', { key });
  } catch {
    /* nothing to remove */
  }
}

/** Read a JSON record stored under `key`; {} when absent or unparsable. */
export async function secureGetJSON<T extends Record<string, unknown>>(
  key: string,
): Promise<Partial<T>> {
  try {
    const raw = await secureGet(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

/** Fire-and-forget JSON write; callers don't need to await keychain latency. */
export function secureSetJSON(key: string, value: Record<string, unknown>): void {
  void secureSet(key, JSON.stringify(value));
}
