import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

export const useIntegrations = create<IntegrationsState>()(
  persist(
    (set) => ({
      vercelToken: '',
      vercelTeamId: '',
      vercelProjectId: '',
      setVercelToken: (vercelToken) => set({ vercelToken: vercelToken.trim() }),
      setVercelTeamId: (vercelTeamId) => set({ vercelTeamId: vercelTeamId.trim() }),
      setVercelProjectId: (vercelProjectId) => set({ vercelProjectId }),
    }),
    { name: 'forze.integrations.v1' },
  ),
);
