import { useEffect } from 'react';
import { create } from 'zustand';
import { status as gitStatus, type GitStatusReport } from '../lib/git';
import { useProject } from './projectStore';

/**
 * Shared git working-tree status. A single poll feeds both the activity-rail
 * change badge (visible even when the Source Control panel is closed, like
 * VS Code) and the panel itself, so they never disagree and the badge updates
 * the instant a stage/commit calls `refresh()`.
 */
interface GitStatusState {
  report: GitStatusReport | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useGitStatus = create<GitStatusState>((set) => ({
  report: null,
  error: null,
  refresh: async () => {
    const { workspaceRoot, isGitRepo } = useProject.getState();
    if (!workspaceRoot || !isGitRepo) {
      set({ report: null, error: null });
      return;
    }
    try {
      set({ report: await gitStatus(workspaceRoot), error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },
}));

/** Number of changed files (porcelain lists each file once). */
export function changeCount(report: GitStatusReport | null): number {
  return report?.entries.length ?? 0;
}

/**
 * Poll the working tree while a git repo is open. Mount this once from a
 * component that's always alive (the activity rail) so the badge stays live
 * regardless of which panel is visible.
 */
export function useGitStatusPolling(intervalMs = 4000): void {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const isGitRepo = useProject((s) => s.isGitRepo);
  const refresh = useGitStatus((s) => s.refresh);
  useEffect(() => {
    if (!workspaceRoot || !isGitRepo) return;
    void refresh();
    // Skip polls while the window is hidden (minimized/backgrounded) — no one
    // can see the badge, and each poll spawns a git subprocess. Catch up the
    // moment the window is visible again.
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, intervalMs);
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [workspaceRoot, isGitRepo, refresh, intervalMs]);
}
