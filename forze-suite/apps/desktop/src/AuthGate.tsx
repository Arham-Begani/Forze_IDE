import { useEffect, useRef, type ReactNode } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase';
import { pullMessages, pullWorkspace } from './lib/sync';
import { useApplyTheme } from './theme/themeStore';
import { useAuth } from './workbench/authStore';
import { useCloud } from './workbench/cloudStore';
import { useAssistant } from './workbench/assistantStore';
import SignIn from './shell/SignIn';
import LockWindowControls from './shell/LockWindowControls';

/**
 * Gates the entire IDE behind a Forze account. Nothing below renders until a
 * session is restored from the OS keychain; with no session the app is fully
 * locked to the sign-in screen. On sign-in we pull the user's cloud workspace
 * (project list + conversation threads) and rehydrate the most recent chat —
 * files never come down, only metadata + conversation text.
 */
export function AuthGate({ children }: { children: ReactNode }): JSX.Element {
  // Keep the lock screen on the user's chosen theme even before App mounts.
  useApplyTheme();

  const status = useAuth((s) => s.status);
  const userId = useAuth((s) => s.userId);
  const setSession = useAuth((s) => s.setSession);
  const bootstrappedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      // No project configured — leave status at its initial value and let the
      // sign-in screen explain what's missing (it reads `supabaseConfigured`).
      setSession(null);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [setSession]);

  // Once per signed-in user, pull cloud state and rehydrate the latest chat.
  useEffect(() => {
    if (!userId || bootstrappedFor.current === userId) return;
    bootstrappedFor.current = userId;

    let cancelled = false;
    void (async () => {
      try {
        const { projects, conversations } = await pullWorkspace();
        if (cancelled) return;
        useCloud.getState().setWorkspace({ projects, conversations });

        const latest = conversations[0];
        if (latest) {
          const messages = await pullMessages(latest.id);
          if (cancelled) return;
          const chat = messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }));
          if (chat.length) {
            useAssistant.getState().hydrateFromCloud(latest.id, chat);
          }
        }
      } catch (err) {
        console.warn('[forze] cloud bootstrap failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (supabaseConfigured && status === 'loading') {
    // Splash while restoring the keychain session — keep it on-brand and quiet.
    return (
      <div className="auth-splash" role="status" aria-label="Loading Forze" data-tauri-drag-region>
        <LockWindowControls />
        <span className="auth-splash__brand">
          <span className="auth-splash__dot" />
          FORZE
        </span>
      </div>
    );
  }

  // Dev-only UI preview: `vite dev` + `?preview` skips the sign-in gate so the
  // workbench can be inspected/screenshotted in a plain browser. import.meta
  // .env.DEV is compile-time false in `vite build`, so this branch (and the
  // bypass) cannot exist in a packaged app.
  const devPreview =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('preview');

  if (status !== 'authed' && !devPreview) return <SignIn />;
  return <>{children}</>;
}

export default AuthGate;
