import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { secureGetJSON, secureSetJSON } from '../lib/secureSecrets';

/**
 * Build-time defaults from `.env` (gitignored). Lets a token ship with the
 * build so Deployments works the moment the app opens — no pasting into
 * Settings. A token typed in the UI still wins (see hydration below). Only
 * VITE_-prefixed vars reach the client bundle.
 */
const ENV_VERCEL_TOKEN =
  ((import.meta.env.VITE_FORZE_VERCEL_TOKEN as string | undefined) ?? '').trim();
const ENV_VERCEL_TEAM_ID =
  ((import.meta.env.VITE_FORZE_VERCEL_TEAM_ID as string | undefined) ?? '').trim();

/** Keychain entry holding every integration secret as one JSON record. */
const INTEGRATIONS_SECRET = 'forze.secrets.integrations';

interface IntegrationSecrets extends Record<string, unknown> {
  vercelToken: string;
  linkedinToken: string;
  linkedinRefreshToken: string;
}

/**
 * Tokens + selections for external integrations (Vercel today; more later).
 * Non-secret selections persist to localStorage; the tokens themselves live
 * only in memory + the OS keychain (see `partialize` and `hydrateSecrets`),
 * so no credential ever sits in plaintext on disk.
 */
interface IntegrationsState {
  vercelToken: string;
  /** Optional Vercel team id; blank means personal scope. */
  vercelTeamId: string;
  /** Currently selected Vercel project id (for the Deployments page). */
  vercelProjectId: string;

  setVercelToken: (token: string) => void;
  setVercelTeamId: (teamId: string) => void;
  setVercelProjectId: (projectId: string) => void;

  // ---- LinkedIn publishing (Build in Public) ----
  /** OAuth2 access token from the "Log in with LinkedIn" flow. */
  linkedinToken: string;
  /** Cached author URN (`urn:li:person:…`) resolved from the token. */
  linkedinUrn: string;
  /** Access-token expiry, ms epoch (0 = unknown). */
  linkedinExpiresAt: number;
  /** Refresh token, when the LinkedIn app is approved to issue them. */
  linkedinRefreshToken: string;

  setLinkedinSession: (session: {
    token: string;
    refreshToken?: string;
    expiresAt: number;
  }) => void;
  setLinkedinUrn: (urn: string) => void;
  clearLinkedin: () => void;
}

/** Mirror the current secret fields into the keychain (fire-and-forget). */
function persistSecrets(s: Pick<IntegrationsState, 'vercelToken' | 'linkedinToken' | 'linkedinRefreshToken'>) {
  secureSetJSON(INTEGRATIONS_SECRET, {
    // Never write the baked-in env token to the keychain — it isn't the
    // user's; a blank stored value means "fall back to the env default".
    vercelToken: s.vercelToken === ENV_VERCEL_TOKEN ? '' : s.vercelToken,
    linkedinToken: s.linkedinToken,
    linkedinRefreshToken: s.linkedinRefreshToken,
  });
}

export const useIntegrations = create<IntegrationsState>()(
  persist(
    (set, get) => ({
      vercelToken: ENV_VERCEL_TOKEN,
      vercelTeamId: ENV_VERCEL_TEAM_ID,
      vercelProjectId: '',
      setVercelToken: (vercelToken) => {
        set({ vercelToken: vercelToken.trim() });
        persistSecrets(get());
      },
      setVercelTeamId: (vercelTeamId) => set({ vercelTeamId: vercelTeamId.trim() }),
      setVercelProjectId: (vercelProjectId) => set({ vercelProjectId }),

      linkedinToken: '',
      linkedinUrn: '',
      linkedinExpiresAt: 0,
      linkedinRefreshToken: '',
      // A new session belongs to whoever just authenticated, so the cached URN
      // is invalidated and re-resolved on the next post.
      setLinkedinSession: ({ token, refreshToken, expiresAt }) => {
        set({
          linkedinToken: token.trim(),
          linkedinRefreshToken: (refreshToken ?? '').trim(),
          linkedinExpiresAt: expiresAt,
          linkedinUrn: '',
        });
        persistSecrets(get());
      },
      setLinkedinUrn: (linkedinUrn) => set({ linkedinUrn: linkedinUrn.trim() }),
      clearLinkedin: () => {
        set({ linkedinToken: '', linkedinUrn: '', linkedinExpiresAt: 0, linkedinRefreshToken: '' });
        persistSecrets(get());
      },
    }),
    {
      name: 'forze.integrations.v1',
      // Tokens deliberately excluded — secrets live in the OS keychain only.
      partialize: (state) => ({
        vercelTeamId: state.vercelTeamId,
        vercelProjectId: state.vercelProjectId,
        linkedinUrn: state.linkedinUrn,
        linkedinExpiresAt: state.linkedinExpiresAt,
      }),
      // Blank persisted team id — first run, or never set in the UI — falls
      // back to the `.env` default so a shipped value "just works".
      merge: (persisted, current) => {
        const p = (persisted as Partial<IntegrationsState>) ?? {};
        return {
          ...current,
          ...p,
          vercelTeamId: p.vercelTeamId?.trim() ? p.vercelTeamId : ENV_VERCEL_TEAM_ID,
        };
      },
    },
  ),
);

/**
 * Load integration secrets from the OS keychain, migrating any tokens a
 * previous build persisted in plain localStorage: lift them into the keychain,
 * then scrub them from the localStorage blob so no plaintext copy remains.
 */
async function hydrateSecrets(): Promise<void> {
  const migrated: IntegrationSecrets = {
    vercelToken: '',
    linkedinToken: '',
    linkedinRefreshToken: '',
  };
  try {
    const raw = localStorage.getItem('forze.integrations.v1');
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
      const st = parsed.state ?? {};
      const oldVercel = typeof st.vercelToken === 'string' ? st.vercelToken.trim() : '';
      const oldLinkedin = typeof st.linkedinToken === 'string' ? st.linkedinToken.trim() : '';
      const oldRefresh =
        typeof st.linkedinRefreshToken === 'string' ? st.linkedinRefreshToken.trim() : '';
      if (oldVercel || oldLinkedin || oldRefresh) {
        // The env-baked token isn't a user secret; don't treat it as one.
        migrated.vercelToken = oldVercel === ENV_VERCEL_TOKEN ? '' : oldVercel;
        migrated.linkedinToken = oldLinkedin;
        migrated.linkedinRefreshToken = oldRefresh;
        delete st.vercelToken;
        delete st.linkedinToken;
        delete st.linkedinRefreshToken;
        localStorage.setItem('forze.integrations.v1', JSON.stringify(parsed));
      }
    }
  } catch {
    /* no localStorage (tests) or corrupt blob — nothing to migrate */
  }

  const stored = await secureGetJSON<IntegrationSecrets>(INTEGRATIONS_SECRET);
  const next: IntegrationSecrets = {
    vercelToken: (stored.vercelToken ?? '') || migrated.vercelToken,
    linkedinToken: (stored.linkedinToken ?? '') || migrated.linkedinToken,
    linkedinRefreshToken:
      (stored.linkedinRefreshToken ?? '') || migrated.linkedinRefreshToken,
  };
  if (migrated.vercelToken || migrated.linkedinToken || migrated.linkedinRefreshToken) {
    secureSetJSON(INTEGRATIONS_SECRET, next);
  }

  useIntegrations.setState((s) => ({
    // A blank keychain value keeps whatever is already in memory (the env
    // default, or a token typed since boot).
    vercelToken: next.vercelToken || s.vercelToken,
    linkedinToken: next.linkedinToken || s.linkedinToken,
    linkedinRefreshToken: next.linkedinRefreshToken || s.linkedinRefreshToken,
  }));
}

void hydrateSecrets();
