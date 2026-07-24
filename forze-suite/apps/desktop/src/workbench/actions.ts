import {
  basename,
  createDir,
  createFile,
  deletePath,
  languageFromPath,
  readFile,
  renamePath,
  startWatching,
  stopWatching,
  writeFile,
} from '../lib/fs';
import {
  currentBranch as gitCurrentBranch,
  remoteOriginUrl,
  repoRoot as gitRepoRoot,
  status as gitStatus,
} from '../lib/git';
import { confirmDialog } from '../lib/dialog';
import { syncProject } from '../lib/sync';
import { noteChange } from './commitGuard';
import { useProject } from './projectStore';
import { useVibeStations } from './vibeStationsStore';
import { useWorkbench } from './store';

/**
 * Higher-level workspace actions that coordinate the two stores plus the
 * Tauri Rust backend. Importing the stores' `getState()` directly here keeps
 * these functions usable from anywhere (commands, keybindings, components).
 */

export async function openWorkspace(root: string): Promise<void> {
  const project = useProject.getState();
  const previousRoot = project.workspaceRoot;

  // Switching to a *different* folder behaves like VS Code's "Open Folder":
  // the whole window re-initializes against the new root so every view, editor,
  // terminal, and skill page reopens fresh for the new project. Guarded on a
  // real change so the boot-time re-open of the persisted root
  // (previousRoot === root) and the first open from empty (previousRoot === null)
  // take the normal in-place path below.
  if (previousRoot && previousRoot !== root) {
    await switchWorkspace(root);
    return;
  }

  project.setWorkspace(root);

  try {
    await startWatching(root);
  } catch (err) {
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

  // Mirror this project's METADATA to the cloud (never file contents). No-op
  // when there's no Forze account signed in or Supabase isn't configured.
  void mirrorProjectToCloud(root);
}

/** Upsert the opened folder's metadata to `ide_projects` (path + git remote). */
async function mirrorProjectToCloud(root: string): Promise<void> {
  try {
    const gitRemote = await remoteOriginUrl(root);
    await syncProject({
      name: basename(root),
      localPath: root,
      gitRemote,
    });
  } catch (err) {
    console.warn('[forze] cloud project sync failed', err);
  }
}

/**
 * Switch the IDE to a different workspace folder, VS Code "Open Folder"-style:
 * persist the new root, reset the workspace-scoped state that's keyed to the old
 * project (open editor tabs + cached buffers, the Vibe Stations' working dirs),
 * then reload the window so everything re-initializes against the new folder.
 *
 * A hard reload (rather than an in-place re-render) is what makes "everything
 * opens again": the explorer, git status, terminals, and skill pages all boot
 * fresh from `App`'s mount path against the new root, exactly as on first launch.
 */
async function switchWorkspace(root: string): Promise<void> {
  // Guard unsaved work, just like reloading the window in VS Code — the reload
  // discards in-memory editor buffers.
  const dirty = useWorkbench.getState().editorTabs.filter((t) => t.isDirty);
  if (dirty.length > 0) {
    const ok = await confirmDialog(
      `You have ${dirty.length} unsaved file${dirty.length > 1 ? 's' : ''}. ` +
        'Opening a different folder reloads the window and discards unsaved changes. Continue?',
      'Open Folder',
    );
    if (!ok) return;
  }

  // Persist the new root and reset the old project's workspace-scoped state.
  // These stores write to localStorage synchronously, so the values are durable
  // before the reload below tears the page down.
  useProject.getState().setWorkspace(root); // also clears the buffer cache
  useWorkbench.getState().resetWorkspaceTabs();
  // Re-point the (persisted) Vibe Stations at the new root so they re-spawn
  // there after the reload instead of in the old folder.
  useVibeStations.getState().rescope(root);

  // Stop watching the old root before the reload pulls everything down.
  try {
    await stopWatching();
  } catch {
    /* noop */
  }

  window.location.reload();
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

/**
 * Open a read-only unified diff for a repo-relative path as an editor tab. Used
 * by the Source Control panel — clicking a tracked change shows what changed
 * (VS Code opens a diff editor on click) rather than the plain file. `relPath`
 * is forward-slashed and relative to the workspace root.
 */
export function openDiff(relPath: string, staged: boolean): void {
  const workbench = useWorkbench.getState();
  const id = `diff:${staged ? 'staged:' : ''}${relPath}`;
  const name = relPath.split('/').pop() ?? relPath;
  workbench.openTab({
    id,
    title: `${name} (diff)`,
    filePath: null,
    language: 'diff',
    isDirty: false,
    diff: { relPath, staged },
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

  // Only count a save toward auto-commit when the contents actually changed —
  // a reflexive Ctrl+S on an unchanged buffer shouldn't burn a "change".
  const changed = project.getBuffer(tab.filePath) !== currentValue;

  await writeFile(tab.filePath, currentValue);
  project.setBuffer(tab.filePath, currentValue);
  workbench.markTabDirty(tab.id, false);

  if (changed) void noteChange();
}

/** True when `child` is the same path as, or nested under, `parent`. */
function isUnder(child: string, parent: string): boolean {
  return (
    child === parent ||
    child.startsWith(`${parent}/`) ||
    child.startsWith(`${parent}\\`)
  );
}

/** Create a new empty file at `path`, then open it in a tab. */
export async function createNewFile(path: string): Promise<void> {
  await createFile(path);
  await openFile(path);
}

/** Create a new (possibly nested) folder at `path`. */
export async function createNewFolder(path: string): Promise<void> {
  await createDir(path);
}

/**
 * Delete a file or directory, then close any editor tabs (and drop buffers)
 * for the path or anything nested beneath it.
 */
export async function deleteEntry(path: string): Promise<void> {
  await deletePath(path);
  const workbench = useWorkbench.getState();
  const project = useProject.getState();
  for (const tab of workbench.editorTabs) {
    if (tab.filePath && isUnder(tab.filePath, path)) {
      workbench.closeTab(tab.id);
      project.clearBuffer(tab.filePath);
    }
  }
}

/**
 * Rename/move `from` → `to`. If a tab for `from` is open it is re-opened at the
 * new path (carrying its cached buffer) so the editor follows the rename.
 */
export async function renameEntry(from: string, to: string): Promise<void> {
  await renamePath(from, to);
  const workbench = useWorkbench.getState();
  const project = useProject.getState();
  const openTab = workbench.editorTabs.find((t) => t.filePath === from);
  if (openTab) {
    const buffer = project.getBuffer(from);
    workbench.closeTab(openTab.id);
    project.clearBuffer(from);
    if (buffer !== undefined) project.setBuffer(to, buffer);
    await openFile(to);
  }
}

export function isPathInsideWorkspace(filePath: string): boolean {
  const root = useProject.getState().workspaceRoot;
  if (!root) return false;
  return filePath === root || filePath.startsWith(root);
}
