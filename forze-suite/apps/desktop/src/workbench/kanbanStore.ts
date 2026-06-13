import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useProject } from './projectStore';

/**
 * The shared Kanban board. It lives in its own store (separate from the Team
 * roster in teamStore) because it has a different lifecycle: every teammate
 * sees and moves the same cards. State is persisted so the board survives
 * reloads — the local-first stand-in for a shared backend.
 *
 * Lanes (columns) are fully user-defined. A new board seeds three generic
 * starter columns (To do / In progress / Done) purely as a starting point —
 * every one can be renamed, recolored, reordered, or deleted, and the user can
 * add their own. There are no seeded cards.
 * Cards are a single flat, ordered array; a lane is just a filter over it keyed
 * by `laneId`, and the array order *is* the visual order — so dragging a card to
 * a new position (within a lane or across lanes) is one splice. See `moveCard`.
 */

export type Priority = 'low' | 'medium' | 'high';

/** A user-created column. `id` is opaque; `label`/`color` are user-editable. */
export interface LaneDef {
  id: string;
  label: string;
  color: string;
}

export interface Card {
  id: string;
  title: string;
  /** Id of the lane (column) this card sits in. */
  laneId: string;
  priority: Priority;
  /** Free-text label rendered as a colored chip (color derived from the text). */
  label?: string;
  /** Id of a teamStore member, or undefined when unassigned. */
  assigneeId?: string;
  /** Id of the Agent Manager agent this card mirrors, if the card was created by
   *  the AI manager. Lets the mission→Kanban bridge move the card live as the
   *  agent's status changes. Undefined for hand-created cards. */
  agentId?: string;
  /** Id of the mission that spawned this card (for grouping / cleanup). */
  missionId?: string;
}

/** A coarse column role the AI mirror maps an agent's status onto. Lanes are
 *  user-defined, so we resolve a concrete laneId from one of these at runtime. */
export type LaneBucket = 'todo' | 'doing' | 'done';

export const PRIORITIES: { id: Priority; label: string; color: string }[] = [
  { id: 'low', label: 'Low', color: '#22c55e' },
  { id: 'medium', label: 'Medium', color: '#f59e0b' },
  { id: 'high', label: 'High', color: '#ef4444' },
];

/** Palette new lanes draw from (and the lane dot cycles through). */
export const LANE_PALETTE = [
  '#38bdf8', '#a855f7', '#f59e0b', '#22c55e', '#ef4444',
  '#ec4899', '#14b8a6', '#6366f1', '#94a3b8',
];

let counter = 0;
const newCardId = (): string => `card-${Date.now()}-${counter++}`;
const newLaneId = (): string => `lane-${Date.now()}-${counter++}`;

/** Generic starter columns for a fresh board — fully editable/deletable, no cards. */
const defaultLanes = (): LaneDef[] => [
  { id: 'lane-todo', label: 'To do', color: '#38bdf8' },
  { id: 'lane-doing', label: 'In progress', color: '#f59e0b' },
  { id: 'lane-done', label: 'Done', color: '#22c55e' },
];

/**
 * Each workspace folder gets its *own* board (VS Code-style workspace state):
 * the persisted storage key is derived from the workspace root, so switching
 * folders switches boards. With no folder open, a separate scratch board is
 * used. Slashes are normalized so the same folder always maps to one board.
 */
const KANBAN_KEY = 'forze.kanban.v4';
const boardKey = (root: string | null): string =>
  root ? `${KANBAN_KEY}::${root.replace(/\\/g, '/')}` : `${KANBAN_KEY}::__no-workspace__`;

const storageOrNull = (): Storage | null =>
  typeof localStorage === 'undefined' ? null : localStorage;

/** One-time adoption: boards created before per-workspace scoping lived under
 *  the bare legacy key. The first *workspace* board to load takes it over —
 *  that's the folder the user was looking at when the board was built. */
function adoptLegacyBoard(key: string): void {
  const ls = storageOrNull();
  if (!ls) return;
  try {
    const legacy = ls.getItem(KANBAN_KEY);
    if (!legacy) return;
    if (!ls.getItem(key)) ls.setItem(key, legacy);
    ls.removeItem(KANBAN_KEY);
  } catch {
    /* storage unavailable — nothing to migrate */
  }
}

let activeBoardKey = boardKey(useProject.getState().workspaceRoot);
if (useProject.getState().workspaceRoot) adoptLegacyBoard(activeBoardKey);

interface KanbanState {
  lanes: LaneDef[];
  cards: Card[];

  // --- lanes (user-defined columns) ---
  addLane: (label: string) => void;
  renameLane: (id: string, label: string) => void;
  setLaneColor: (id: string, color: string) => void;
  /** Delete a lane and every card in it. */
  deleteLane: (id: string) => void;
  /** Reorder a lane by one slot left (-1) or right (+1). */
  moveLane: (id: string, dir: -1 | 1) => void;

  // --- cards ---
  addCard: (laneId: string, title: string) => void;
  /** Like addCard but accepts extra fields (priority/label/agent link) and
   *  returns the new card's id so callers can track it (used by the AI mirror). */
  addLinkedCard: (input: {
    title: string;
    laneId: string;
    agentId?: string;
    missionId?: string;
    priority?: Priority;
    label?: string;
  }) => string;
  /** Move/reorder a card. Drops it before `beforeId`, or appends to `toLaneId`
   *  when `beforeId` is null. Works within a lane and across lanes. */
  moveCard: (id: string, toLaneId: string, beforeId: string | null) => void;
  patchCard: (id: string, patch: Partial<Omit<Card, 'id'>>) => void;
  deleteCard: (id: string) => void;
  /** Drop cards assigned to a member that has left the team (keeps avatars sane). */
  unassignMissing: (validIds: Set<string>) => void;
}

export const useKanban = create<KanbanState>()(
  persist(
    (set) => ({
      lanes: defaultLanes(),
      cards: [],

      addLane: (label) =>
        set((state) => {
          const trimmed = label.trim();
          if (!trimmed) return state;
          const color = LANE_PALETTE[state.lanes.length % LANE_PALETTE.length]!;
          return { lanes: [...state.lanes, { id: newLaneId(), label: trimmed, color }] };
        }),

      renameLane: (id, label) =>
        set((state) => {
          const trimmed = label.trim();
          if (!trimmed) return state;
          return {
            lanes: state.lanes.map((l) => (l.id === id ? { ...l, label: trimmed } : l)),
          };
        }),

      setLaneColor: (id, color) =>
        set((state) => ({
          lanes: state.lanes.map((l) => (l.id === id ? { ...l, color } : l)),
        })),

      deleteLane: (id) =>
        set((state) => ({
          lanes: state.lanes.filter((l) => l.id !== id),
          cards: state.cards.filter((c) => c.laneId !== id),
        })),

      moveLane: (id, dir) =>
        set((state) => {
          const idx = state.lanes.findIndex((l) => l.id === id);
          const swap = idx + dir;
          if (idx === -1 || swap < 0 || swap >= state.lanes.length) return state;
          const lanes = [...state.lanes];
          [lanes[idx], lanes[swap]] = [lanes[swap]!, lanes[idx]!];
          return { lanes };
        }),

      addCard: (laneId, title) =>
        set((state) => {
          const trimmed = title.trim();
          if (!trimmed) return state;
          const card: Card = { id: newCardId(), title: trimmed, laneId, priority: 'medium' };
          // Append after the last card already in this lane so it lands at the
          // bottom of the column.
          const cards = [...state.cards];
          let insertAt = cards.length;
          for (let i = cards.length - 1; i >= 0; i--) {
            if (cards[i]!.laneId === laneId) {
              insertAt = i + 1;
              break;
            }
          }
          cards.splice(insertAt, 0, card);
          return { cards };
        }),

      addLinkedCard: (input) => {
        const id = newCardId();
        const title = input.title.trim();
        if (!title || !input.laneId) return id;
        set((state) => {
          const card: Card = {
            id,
            title,
            laneId: input.laneId,
            priority: input.priority ?? 'medium',
            label: input.label,
            agentId: input.agentId,
            missionId: input.missionId,
          };
          // Same bottom-of-lane insertion as addCard.
          const cards = [...state.cards];
          let insertAt = cards.length;
          for (let i = cards.length - 1; i >= 0; i--) {
            if (cards[i]!.laneId === input.laneId) {
              insertAt = i + 1;
              break;
            }
          }
          cards.splice(insertAt, 0, card);
          return { cards };
        });
        return id;
      },

      moveCard: (id, toLaneId, beforeId) =>
        set((state) => {
          if (id === beforeId) return state;
          const cards = [...state.cards];
          const fromIdx = cards.findIndex((c) => c.id === id);
          if (fromIdx === -1) return state;
          const [card] = cards.splice(fromIdx, 1);
          const moved: Card = { ...card!, laneId: toLaneId };
          if (beforeId == null) {
            let insertAt = cards.length;
            for (let i = cards.length - 1; i >= 0; i--) {
              if (cards[i]!.laneId === toLaneId) {
                insertAt = i + 1;
                break;
              }
            }
            cards.splice(insertAt, 0, moved);
          } else {
            const beforeIdx = cards.findIndex((c) => c.id === beforeId);
            cards.splice(beforeIdx === -1 ? cards.length : beforeIdx, 0, moved);
          }
          return { cards };
        }),

      patchCard: (id, patch) =>
        set((state) => ({
          cards: state.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      deleteCard: (id) =>
        set((state) => ({ cards: state.cards.filter((c) => c.id !== id) })),

      unassignMissing: (validIds) =>
        set((state) => {
          let changed = false;
          const cards = state.cards.map((c) => {
            if (c.assigneeId && !validIds.has(c.assigneeId)) {
              changed = true;
              return { ...c, assigneeId: undefined };
            }
            return c;
          });
          return changed ? { cards } : state;
        }),
    }),
    // v4: cards gained optional agentId/missionId links so the AI manager can
    // mirror an Architect plan onto the board and move cards live. Older cards
    // simply have those fields undefined — no migration needed; the key bump is
    // only to be explicit about the shape change.
    { name: activeBoardKey },
  ),
);

// Re-key the board when the workspace root changes *without* a window reload
// (first folder opened from empty, or the workspace being closed — switching
// between two folders reloads the window, so boot handles that case). Order
// matters: point persistence at the new key BEFORE touching state, so neither
// the old board nor the new one gets clobbered by a write to the wrong key.
useProject.subscribe((state) => {
  const key = boardKey(state.workspaceRoot);
  if (key === activeBoardKey) return;
  activeBoardKey = key;
  if (state.workspaceRoot) adoptLegacyBoard(key);
  useKanban.persist.setOptions({ name: key });
  if (storageOrNull()?.getItem(key)) {
    void useKanban.persist.rehydrate();
  } else {
    // Nothing saved for this workspace yet — start it on a fresh board (the
    // write this triggers lands under the new key).
    useKanban.setState({ lanes: defaultLanes(), cards: [] });
  }
});

/**
 * Resolve a concrete laneId for a coarse bucket, robust to the fact that lanes
 * are fully user-editable (renamed, recolored, reordered, deleted). Tries, in
 * order: the original seeded ids, a label keyword match, then an ordinal slot.
 * Returns '' only when the board has no lanes at all (caller should skip).
 */
export function resolveLane(bucket: LaneBucket): string {
  const lanes = useKanban.getState().lanes;
  if (lanes.length === 0) return '';

  const seededId = { todo: 'lane-todo', doing: 'lane-doing', done: 'lane-done' }[bucket];
  if (lanes.some((l) => l.id === seededId)) return seededId;

  const matches = (label: string): boolean => {
    const t = label.toLowerCase();
    if (bucket === 'todo') return /to ?do|backlog|new|queue/.test(t);
    if (bucket === 'doing') return /progress|doing|wip|active|building/.test(t);
    return /done|complete|ship|review|finish/.test(t);
  };
  const labelHit = lanes.find((l) => matches(l.label));
  if (labelHit) return labelHit.id;

  const ordinal = bucket === 'todo' ? 0 : bucket === 'doing' ? 1 : lanes.length - 1;
  return lanes[Math.min(ordinal, lanes.length - 1)]!.id;
}

/** Stable color for a label chip, derived from its text. */
const LABEL_COLORS = ['#38bdf8', '#a855f7', '#f59e0b', '#22c55e', '#ef4444', '#ec4899', '#14b8a6', '#6366f1'];
export function labelColor(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return LABEL_COLORS[h % LABEL_COLORS.length]!;
}
