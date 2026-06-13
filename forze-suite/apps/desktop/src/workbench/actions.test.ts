import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The workspace actions coordinate several stores + the Tauri backend. Mock the
// backend-facing modules so the test exercises only the store-orchestration
// logic (the part that decides what happens when you open a *different* folder).
vi.mock('../lib/fs', () => ({
  basename: (p: string) => p.split(/[\\/]/).pop() ?? p,
  languageFromPath: () => 'plaintext',
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue(undefined),
  createFile: vi.fn().mockResolvedValue(undefined),
  createDir: vi.fn().mockResolvedValue(undefined),
  deletePath: vi.fn().mockResolvedValue(undefined),
  renamePath: vi.fn().mockResolvedValue(undefined),
  startWatching: vi.fn().mockResolvedValue(undefined),
  stopWatching: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/git', () => ({
  repoRoot: vi.fn().mockResolvedValue(''),
  currentBranch: vi.fn().mockResolvedValue(null),
  status: vi.fn().mockResolvedValue([]),
}));
vi.mock('../lib/dialog', () => ({ confirmDialog: vi.fn().mockResolvedValue(true) }));
vi.mock('./commitGuard', () => ({ noteChange: vi.fn() }));

import { openWorkspace } from './actions';
import { startWatching } from '../lib/fs';
import { confirmDialog } from '../lib/dialog';
import { useProject } from './projectStore';
import { useWorkbench } from './store';
import { useVibeStations } from './vibeStationsStore';

/** Stub a minimal `window` whose location.reload() we can assert on (the suite
 *  runs under node, so there's no DOM window otherwise). */
function stubReload(): ReturnType<typeof vi.fn> {
  const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  return reload;
}

describe('openWorkspace folder switching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Fresh stores: workspace on /old with one file tab open and one vibe
    // station spawned in /old — i.e. a project that's actively in use.
    useProject.getState().setWorkspace('/old');
    useWorkbench.setState({
      editorTabs: [
        { id: 'welcome', title: 'Welcome', filePath: null, language: 'markdown', isDirty: false },
        { id: '/old/a.ts', title: 'a.ts', filePath: '/old/a.ts', language: 'typescript', isDirty: false },
      ],
      activeTabId: '/old/a.ts',
    });
    useVibeStations.setState({ stations: [], sessions: {} });
    useVibeStations.getState().addStation('claude', '/old');
  });

  it('switching to a different folder reloads the window onto the new root', async () => {
    const reload = stubReload();
    await openWorkspace('/new');

    expect(useProject.getState().workspaceRoot).toBe('/new');
    // Old project's editor tabs collapse back to a single Welcome tab.
    expect(useWorkbench.getState().editorTabs).toHaveLength(1);
    expect(useWorkbench.getState().editorTabs[0]?.id).toBe('welcome');
    // Vibe stations are re-pointed at the new folder so they re-spawn there.
    expect(useVibeStations.getState().stations[0]?.cwd).toBe('/new');
    // Everything re-initializes via a window reload.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('re-opening the same folder stays in place (no reload, tabs preserved)', async () => {
    const reload = stubReload();
    await openWorkspace('/old');

    expect(reload).not.toHaveBeenCalled();
    expect(useWorkbench.getState().editorTabs).toHaveLength(2);
    expect(startWatching).toHaveBeenCalledWith('/old');
  });

  it('opening the first folder from empty stays in place', async () => {
    useProject.getState().setWorkspace(null);
    const reload = stubReload();
    await openWorkspace('/first');

    expect(reload).not.toHaveBeenCalled();
    expect(useProject.getState().workspaceRoot).toBe('/first');
    expect(startWatching).toHaveBeenCalledWith('/first');
  });

  it('warns before discarding unsaved work, and aborts if declined', async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    useWorkbench.getState().markTabDirty('/old/a.ts', true);
    const reload = stubReload();

    await openWorkspace('/new');

    // Declined → nothing changes.
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(useProject.getState().workspaceRoot).toBe('/old');
  });
});
