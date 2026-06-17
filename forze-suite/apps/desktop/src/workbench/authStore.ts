import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

/**
 * The signed-in Forze account, in memory only. The durable session lives in the
 * OS keychain (via supabase-js's keychain storage adapter) — this store is just
 * the derived, render-friendly view of it. Deliberately NOT persisted: nothing
 * about the session may touch localStorage.
 */
type AuthStatus = 'loading' | 'authed' | 'anon';

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  /** Apply a session from supabase (null = signed out). */
  setSession: (session: Session | null) => void;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  userId: null,
  email: null,
  setSession: (session) =>
    set({
      status: session ? 'authed' : 'anon',
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
    }),
}));

/** Read the current user id outside React (for sync helpers). */
export function currentUserId(): string | null {
  return useAuth.getState().userId;
}
