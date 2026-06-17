import { create } from 'zustand';
import type { CloudConversation, CloudProject } from '../lib/sync';

/**
 * In-memory mirror of the user's cloud workspace (project list + conversation
 * threads) pulled from Supabase on sign-in. Deliberately NOT persisted to
 * localStorage — Supabase (RLS, per user) is the source of truth for this
 * metadata, and the local copy is just what the UI renders this session.
 */
interface CloudState {
  loaded: boolean;
  projects: CloudProject[];
  conversations: CloudConversation[];
  setWorkspace: (data: {
    projects: CloudProject[];
    conversations: CloudConversation[];
  }) => void;
  /** Insert or replace a single project row (after an upsert round-trips). */
  upsertProject: (project: CloudProject) => void;
  reset: () => void;
}

export const useCloud = create<CloudState>((set) => ({
  loaded: false,
  projects: [],
  conversations: [],
  setWorkspace: ({ projects, conversations }) =>
    set({ loaded: true, projects, conversations }),
  upsertProject: (project) =>
    set((state) => {
      const rest = state.projects.filter((p) => p.id !== project.id);
      return {
        projects: [project, ...rest].sort((a, b) =>
          (b.last_opened_at ?? '').localeCompare(a.last_opened_at ?? ''),
        ),
      };
    }),
  reset: () => set({ loaded: false, projects: [], conversations: [] }),
}));
