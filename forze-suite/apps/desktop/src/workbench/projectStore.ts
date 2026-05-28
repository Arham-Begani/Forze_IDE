import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectState {
  /** Absolute path to the active workspace root. */
  workspaceRoot: string | null;
  /** Active branch name (from `git rev-parse --abbrev-ref HEAD`). */
  branch: string | null;
  /** Whether the workspace is a git repo. */
  isGitRepo: boolean;

  /**
   * In-memory file buffer cache: filePath -> last known on-disk contents.
   * Used to compute the dirty state for each editor tab. Never persisted,
   * so contents don't leak into localStorage.
   */
  buffers: Map<string, string>;

  setWorkspace: (root: string | null) => void;
  setBranch: (branch: string | null) => void;
  setIsGitRepo: (isRepo: boolean) => void;

  setBuffer: (path: string, contents: string) => void;
  getBuffer: (path: string) => string | undefined;
  clearBuffer: (path: string) => void;
}

export const useProject = create<ProjectState>()(
  persist(
    (set, get) => ({
      workspaceRoot: null,
      branch: null,
      isGitRepo: false,
      buffers: new Map(),

      setWorkspace: (workspaceRoot) =>
        set({ workspaceRoot, buffers: new Map(), branch: null, isGitRepo: false }),
      setBranch: (branch) => set({ branch }),
      setIsGitRepo: (isGitRepo) => set({ isGitRepo }),

      setBuffer: (path, contents) =>
        set((state) => {
          const next = new Map(state.buffers);
          next.set(path, contents);
          return { buffers: next };
        }),
      getBuffer: (path) => get().buffers.get(path),
      clearBuffer: (path) =>
        set((state) => {
          const next = new Map(state.buffers);
          next.delete(path);
          return { buffers: next };
        }),
    }),
    {
      name: 'forze.project.v1',
      // Only persist workspaceRoot — branch is re-derived on boot, and we
      // never want file contents in localStorage.
      partialize: (state) => ({ workspaceRoot: state.workspaceRoot }),
    },
  ),
);
