/**
 * Supabase client for the Forze account (auth + cloud persistence).
 *
 * Talks to the SAME Supabase project as the Forze web app. The anon key ships
 * in the binary on purpose — Row Level Security (auth.uid() = user_id) is the
 * security boundary, not key secrecy.
 *
 * The session is stored in the OS keychain via the Rust `secure_*` commands —
 * NEVER localStorage/sessionStorage. supabase-js supports an async storage
 * adapter, so `getItem` can resolve from the keychain over the Tauri IPC.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** True only when both env values are present — the auth gate keys off this. */
export const supabaseConfigured = !!(url && anonKey);

const isTauri =
  typeof window !== 'undefined' &&
  Reflect.has(window as object, '__TAURI_INTERNALS__');

/**
 * Session storage backed by the OS keychain (Keychain / Credential Manager /
 * libsecret) through the Rust `secure_get|set|remove` commands. Outside the
 * Tauri shell (e.g. `vite dev` in a plain browser, tests) we fall back to an
 * in-memory map so nothing ever touches localStorage.
 */
const memory = new Map<string, string>();

const keychain = {
  getItem: async (key: string): Promise<string | null> => {
    if (!isTauri) return memory.get(key) ?? null;
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke<string | null>('secure_get', { key })) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (!isTauri) {
      memory.set(key, value);
      return;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secure_set', { key, value });
  },
  removeItem: async (key: string): Promise<void> => {
    if (!isTauri) {
      memory.delete(key);
      return;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('secure_remove', { key });
  },
};

// createClient validates the URL/key shape, so when unconfigured we hand it a
// syntactically-valid placeholder. The app never reaches an authed call in that
// state — AuthGate renders a "not configured" notice off `supabaseConfigured`.
export const supabase: SupabaseClient = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'public-anon-key',
  {
    auth: {
      storage: keychain, // keychain, never localStorage
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // desktop app — no URL session
      flowType: 'pkce',
    },
  },
);
