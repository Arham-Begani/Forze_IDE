import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

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
    // v3: dropped the seeded demo cards and hardcoded stages. Lanes are now
    // user-defined; a fresh board gets generic editable starter columns. The
    // key bump clears the earlier dummy/empty state on first load.
    { name: 'forze.kanban.v3' },
  ),
);

/** Stable color for a label chip, derived from its text. */
const LABEL_COLORS = ['#38bdf8', '#a855f7', '#f59e0b', '#22c55e', '#ef4444', '#ec4899', '#14b8a6', '#6366f1'];
export function labelColor(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return LABEL_COLORS[h % LABEL_COLORS.length]!;
}
