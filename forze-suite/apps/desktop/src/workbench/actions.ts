import {
  basename,
  languageFromPath,
  readFile,
  startWatching,
  stopWatching,
  writeFile,
} from '../lib/fs';
import {
  currentBranch as gitCurrentBranch,
  repoRoot as gitRepoRoot,
  status as gitStatus,
} from '../lib/git';
import { useProject } from './projectStore';
import { useWorkbench } from './store';

/**
 * Higher-level workspace actions that coordinate the two stores plus the
 * Tauri Rust backend. Importing the stores' `getState()` directly here keeps
 * these functions usable from anywhere (commands, keybindings, components).
 */

export async function openWorkspace(root: string): Promise<void> {
  const project = useProject.getState();
  project.setWorkspace(root);

  try {
    await startWatching(root);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[forze] fs_watch failed:', err);
  }

  try {
    const repo = await gitRepoRoot(root);
    project.setIsGitRepo(repo.length > 0);
    const branch = await gitCurrentBranch(root);
    project.setBranch(branch);
    // Warm the status cache so the Source Control panel paints fast.
    void gitStatus(root).catch(() => undefined);
  } catch {
    project.setIsGitRepo(false);
    project.setBranch(null);
  }
}

export async function closeWorkspace(): Promise<void> {
  try {
    await stopWatching();
  } catch {
    /* noop */
  }
  useProject.getState().setWorkspace(null);
}

/** Open a file in a new editor tab. Idempotent — re-clicking activates it. */
export async function openFile(filePath: string): Promise<void> {
  const workbench = useWorkbench.getState();
  const project = useProject.getState();

  // If the tab is already open, just activate it.
  const existing = workbench.editorTabs.find((t) => t.filePath === filePath);
  if (existing) {
    workbench.setActiveTab(existing.id);
    return;
  }

  let contents = '';
  try {
    contents = await readFile(filePath);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[forze] read failed', filePath, err);
    return;
  }

  project.setBuffer(filePath, contents);
  workbench.openTab({
    id: filePath,
    title: basename(filePath),
    filePath,
    language: languageFromPath(filePath),
    isDirty: false,
  });
}

/** Save the active editor tab to disk. */
export async function saveActiveTab(currentValue: string | null): Promise<void> {
  const workbench = useWorkbench.getState();
  const project = useProject.getState();

  const activeId = workbench.activeTabId;
  if (!activeId) return;
  const tab = workbench.editorTabs.find((t) => t.id === activeId);
  if (!tab || !tab.filePath || currentValue === null) return;

  await writeFile(tab.filePath, currentValue);
  project.setBuffer(tab.filePath, currentValue);
  workbench.markTabDirty(tab.id, false);
}

export function isPathInsideWorkspace(filePath: string): boolean {
  const root = useProject.getState().workspaceRoot;
  if (!root) return false;
  return filePath === root || filePath.startsWith(root);
}
