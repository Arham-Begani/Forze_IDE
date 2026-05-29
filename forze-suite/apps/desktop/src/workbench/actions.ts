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

/** Paths whose contents are currently being read, to dedupe concurrent loads. */
const inFlightReads = new Set<string>();

/**
 * Ensure a file's contents are in the buffer cache, reading from disk if not.
 * Safe to call repeatedly: a no-op when the buffer is already present or a read
 * is already in flight. This is what makes restored tabs (whose buffers are
 * never persisted) show their content again after a reload.
 */
export async function ensureFileLoaded(filePath: string): Promise<void> {
  const project = useProject.getState();
  if (project.buffers.has(filePath)) return;
  if (inFlightReads.has(filePath)) return;
  inFlightReads.add(filePath);
  try {
    const contents = await readFile(filePath);
    useProject.getState().setBuffer(filePath, contents);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[forze] read failed', filePath, err);
    useProject.getState().setBuffer(
      filePath,
      `// Forze could not read this file.\n// ${filePath}\n//\n// ${String(err)}`,
    );
  } finally {
    inFlightReads.delete(filePath);
  }
}

/** Open a file in an editor tab. Idempotent — re-clicking activates it. */
export async function openFile(filePath: string): Promise<void> {
  const workbench = useWorkbench.getState();

  // Activate the existing tab, or open a new one immediately so the click
  // always produces visible feedback.
  const existing = workbench.editorTabs.find((t) => t.filePath === filePath);
  if (existing) {
    workbench.setActiveTab(existing.id);
  } else {
    workbench.openTab({
      id: filePath,
      title: basename(filePath),
      filePath,
      language: languageFromPath(filePath),
      isDirty: false,
    });
  }

  // Always make sure the contents are loaded. A tab can exist with an empty
  // buffer after a reload (tabs persist; buffers don't), so we must read even
  // when the tab was already open.
  await ensureFileLoaded(filePath);
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
