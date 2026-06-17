import { useState, type FormEvent } from 'react';
import { ArrowRight, Loader2, Lock, Mail } from 'lucide-react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { pendoTrack } from '../lib/pendoTrack';
import LockWindowControls from './LockWindowControls';

type Mode = 'signin' | 'signup';

/** Pull the `?code=` (or an OAuth error) out of the captured loopback redirect. */
function readRedirect(redirectUrl: string): string {
  const u = new URL(redirectUrl);
  const err = u.searchParams.get('error_description') ?? u.searchParams.get('error');
  if (err) throw new Error(err);
  const code = u.searchParams.get('code');
  if (!code) throw new Error('Google did not return an authorization code.');
  return code;
}

/**
 * The locked sign-in screen. Native email/password (plus a "Continue with
 * Google" round-trip through the system browser). Matches the Builder OS
 * matte-black theme by reusing the app's tokens — no new fonts or gradients.
 */
export default function SignIn(): JSX.Element {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        pendoTrack('user_signed_in', {
          auth_method: 'email',
          email_domain: email.trim().split('@')[1] ?? '',
        });
        // AuthGate's onAuthStateChange unlocks the app.
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        pendoTrack('user_signed_up', {
          auth_method: 'email',
          email_domain: email.trim().split('@')[1] ?? '',
        });
        // When email confirmation is on, no session is returned yet.
        if (!data.session) {
          setNotice('Check your inbox to confirm your email, then sign in.');
          setMode('signin');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          redirectTo: 'http://localhost:8912',
        },
      });
      if (err) throw err;
      if (!data?.url) throw new Error('Could not start Google sign-in.');

      // Open the consent page in the system browser and capture the redirect on
      // the Rust loopback (see src-tauri/src/oauth.rs).
      const { invoke } = await import('@tauri-apps/api/core');
      const redirectUrl = await invoke<string>('google_oauth_login', {
        authUrl: data.url,
      });
      const code = readRedirect(redirectUrl);
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) throw exErr;
      pendoTrack('google_oauth_completed', {
        auth_method: 'google',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth" data-tauri-drag-region>
      <LockWindowControls />
      <div className="auth__card">
        <header className="auth__head">
          <span className="auth__brand">
            <span className="auth__brand-dot" />
            FORZE · BUILDER OS
          </span>
          <h1 className="auth__title">
            {mode === 'signin' ? 'Sign in to Forze' : 'Create your Forze account'}
          </h1>
          <p className="auth__subtitle">
            The Sovereign OS for Startup Founders. Your code stays on this
            machine — your account just syncs projects and chats.
          </p>
        </header>

        {!supabaseConfigured ? (
          <div className="auth__error" role="alert">
            Forze account isn&apos;t configured for this build. Set{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
            in <code>.env</code>, then rebuild.
          </div>
        ) : (
          <>
            <form className="auth__form" onSubmit={submit}>
              <label className="auth__field">
                <Mail size={15} strokeWidth={1.8} className="auth__field-icon" />
                <input
                  type="email"
                  className="auth__input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@startup.com"
                  autoComplete="email"
                  required
                  disabled={busy}
                  aria-label="Email"
                />
              </label>
              <label className="auth__field">
                <Lock size={15} strokeWidth={1.8} className="auth__field-icon" />
                <input
                  type="password"
                  className="auth__input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete={
                    mode === 'signin' ? 'current-password' : 'new-password'
                  }
                  required
                  minLength={6}
                  disabled={busy}
                  aria-label="Password"
                />
              </label>

              {error && (
                <div className="auth__error" role="alert">
                  {error}
                </div>
              )}
              {notice && <div className="auth__notice">{notice}</div>}

              <button
                type="submit"
                className="btn-primary auth__submit"
                disabled={busy}
              >
                {busy ? (
                  <Loader2 size={15} strokeWidth={2} className="auth__spin" />
                ) : (
                  <>
                    {mode === 'signin' ? 'Sign in' : 'Create account'}
                    <ArrowRight size={15} strokeWidth={2} />
                  </>
                )}
              </button>
            </form>

            <div className="auth__divider">
              <span>or</span>
            </div>

            <button
              type="button"
              className="btn-ghost auth__google"
              onClick={signInWithGoogle}
              disabled={busy}
            >
              <GoogleMark />
              Continue with Google
            </button>

            <p className="auth__switch">
              {mode === 'signin' ? (
                <>
                  New to Forze?{' '}
                  <button
                    type="button"
                    className="auth__link"
                    onClick={() => {
                      setMode('signup');
                      setError(null);
                      setNotice(null);
                    }}
                    disabled={busy}
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    className="auth__link"
                    onClick={() => {
                      setMode('signin');
                      setError(null);
                      setNotice(null);
                    }}
                    disabled={busy}
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Inline Google "G" so the button needs no network asset. */
function GoogleMark(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
