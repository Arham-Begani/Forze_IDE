import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The Kanban board is workspace-scoped: each folder persists its own board
 * under `forze.kanban.v4::<root>`. These tests exercise the scoping machinery
 * (key selection at boot, re-keying on root changes, legacy board adoption),
 * so they need a working localStorage and fresh module state per test.
 */

function memoryStorage(): Storage {
  let data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data = new Map();
    },
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => {
      data.delete(k);
    },
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

const storage = memoryStorage();
vi.stubGlobal('localStorage', storage);

/** Boot the stores fresh (as a window reload would) against current storage. */
async function boot() {
  vi.resetModules();
  const { useProject } = await import('./projectStore');
  const { useKanban } = await import('./kanbanStore');
  return { useProject, useKanban };
}

const seedRoot = (root: string | null) =>
  storage.setItem(
    'forze.project.v1',
    JSON.stringify({ state: { workspaceRoot: root }, version: 0 }),
  );

const storedBoard = (key: string) => {
  const raw = storage.getItem(key);
  return raw ? (JSON.parse(raw).state as { cards: { title: string }[] }) : null;
};

describe('workspace-scoped kanban board', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('persists each workspace board under its own key', async () => {
    seedRoot('C:/proj/alpha');
    const { useKanban } = await boot();

    useKanban.getState().addCard('lane-todo', 'alpha task');

    expect(storedBoard('forze.kanban.v4::C:/proj/alpha')?.cards).toHaveLength(1);
    expect(storage.getItem('forze.kanban.v4')).toBeNull();
  });

  it('re-keys to a fresh board when a different root becomes active without a reload', async () => {
    seedRoot('C:/proj/alpha');
    const { useProject, useKanban } = await boot();
    useKanban.getState().addCard('lane-todo', 'alpha task');

    useProject.getState().setWorkspace('C:/proj/beta');

    // New folder starts on an empty default board…
    expect(useKanban.getState().cards).toHaveLength(0);
    expect(useKanban.getState().lanes).toHaveLength(3);
    // …and alpha's board is untouched in storage.
    expect(storedBoard('forze.kanban.v4::C:/proj/alpha')?.cards).toHaveLength(1);

    // Writes now land under beta's key, not alpha's.
    useKanban.getState().addCard('lane-todo', 'beta task');
    expect(storedBoard('forze.kanban.v4::C:/proj/beta')?.cards[0]?.title).toBe('beta task');
    expect(storedBoard('forze.kanban.v4::C:/proj/alpha')?.cards[0]?.title).toBe('alpha task');
  });

  it('rehydrates a previously saved board when its root becomes active again', async () => {
    seedRoot('C:/proj/alpha');
    const { useProject, useKanban } = await boot();
    useKanban.getState().addCard('lane-todo', 'alpha task');

    useProject.getState().setWorkspace('C:/proj/beta');
    useProject.getState().setWorkspace('C:/proj/alpha');

    expect(useKanban.getState().cards.map((c) => c.title)).toEqual(['alpha task']);
  });

  it('a reload onto a different root boots that root’s own board', async () => {
    seedRoot('C:/proj/alpha');
    const first = await boot();
    first.useKanban.getState().addCard('lane-todo', 'alpha task');

    // Simulate the folder-switch reload: new persisted root, fresh modules.
    seedRoot('C:/proj/beta');
    const second = await boot();

    expect(second.useKanban.getState().cards).toHaveLength(0);
    expect(storedBoard('forze.kanban.v4::C:/proj/alpha')?.cards).toHaveLength(1);
  });

  it('adopts a pre-scoping legacy board into the active workspace once', async () => {
    storage.setItem(
      'forze.kanban.v4',
      JSON.stringify({
        state: {
          lanes: [{ id: 'lane-todo', label: 'To do', color: '#38bdf8' }],
          cards: [{ id: 'c1', title: 'legacy card', laneId: 'lane-todo', priority: 'medium' }],
        },
        version: 0,
      }),
    );
    seedRoot('C:/proj/alpha');
    const { useKanban } = await boot();

    expect(useKanban.getState().cards.map((c) => c.title)).toEqual(['legacy card']);
    expect(storage.getItem('forze.kanban.v4')).toBeNull();
  });

  it('normalizes backslash roots onto the same board key', async () => {
    seedRoot('C:\\proj\\alpha');
    const { useKanban } = await boot();
    useKanban.getState().addCard('lane-todo', 'task');

    expect(storedBoard('forze.kanban.v4::C:/proj/alpha')?.cards).toHaveLength(1);
  });
});
