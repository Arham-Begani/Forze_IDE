import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Build-time defaults from `.env` (gitignored). Lets a token ship with the
 * build so Deployments works the moment the app opens — no pasting into
 * Settings. A token typed in the UI still wins (see `merge` below). Only
 * VITE_-prefixed vars reach the client bundle.
 */
const ENV_VERCEL_TOKEN =
  ((import.meta.env.VITE_FORZE_VERCEL_TOKEN as string | undefined) ?? '').trim();
const ENV_VERCEL_TEAM_ID =
  ((import.meta.env.VITE_FORZE_VERCEL_TEAM_ID as string | undefined) ?? '').trim();

/**
 * Tokens + selections for external integrations (Vercel today; more later).
 * Persisted to localStorage so the connection survives reloads. A future
 * hardening pass can move the tokens into the OS keyring via the existing
 * `store_credential` command.
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

export const useIntegrations = create<IntegrationsState>()(
  persist(
    (set) => ({
      vercelToken: ENV_VERCEL_TOKEN,
      vercelTeamId: ENV_VERCEL_TEAM_ID,
      vercelProjectId: '',
      setVercelToken: (vercelToken) => set({ vercelToken: vercelToken.trim() }),
      setVercelTeamId: (vercelTeamId) => set({ vercelTeamId: vercelTeamId.trim() }),
      setVercelProjectId: (vercelProjectId) => set({ vercelProjectId }),

      linkedinToken: '',
      linkedinUrn: '',
      linkedinExpiresAt: 0,
      linkedinRefreshToken: '',
      // A new session belongs to whoever just authenticated, so the cached URN
      // is invalidated and re-resolved on the next post.
      setLinkedinSession: ({ token, refreshToken, expiresAt }) =>
        set({
          linkedinToken: token.trim(),
          linkedinRefreshToken: (refreshToken ?? '').trim(),
          linkedinExpiresAt: expiresAt,
          linkedinUrn: '',
        }),
      setLinkedinUrn: (linkedinUrn) => set({ linkedinUrn: linkedinUrn.trim() }),
      clearLinkedin: () =>
        set({ linkedinToken: '', linkedinUrn: '', linkedinExpiresAt: 0, linkedinRefreshToken: '' }),
    }),
    {
      name: 'forze.integrations.v1',
      // A token the user explicitly typed (persisted, non-empty) wins. When the
      // persisted token is blank — first run, or never set in the UI — fall
      // back to the `.env` default so a shipped token "just works" and isn't
      // clobbered by an empty stored value.
      merge: (persisted, current) => {
        const p = (persisted as Partial<IntegrationsState>) ?? {};
        return {
          ...current,
          ...p,
          vercelToken: p.vercelToken?.trim() ? p.vercelToken : ENV_VERCEL_TOKEN,
          vercelTeamId: p.vercelTeamId?.trim() ? p.vercelTeamId : ENV_VERCEL_TEAM_ID,
        };
      },
    },
  ),
);
