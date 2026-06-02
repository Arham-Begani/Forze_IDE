import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { tasks as seedTasks } from './appData';

export type Lane = 'todo' | 'doing' | 'done';

export interface BoardTask {
  id: string;
  title: string;
  lane: Lane;
}

export const LANES: { id: Lane; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

interface TeamState {
  tasks: BoardTask[];
  addTask: (title: string, lane?: Lane) => void;
  moveTask: (id: string, lane: Lane) => void;
  deleteTask: (id: string) => void;
}

function seed(): BoardTask[] {
  const out: BoardTask[] = [];
  let n = 0;
  for (const lane of ['todo', 'doing', 'done'] as Lane[]) {
    for (const title of seedTasks[lane]) {
      out.push({ id: `seed-${n++}`, title, lane });
    }
  }
  return out;
}

export const useTeam = create<TeamState>()(
  persist(
    (set) => ({
      tasks: seed(),
      addTask: (title, lane = 'todo') =>
        set((state) => {
          const trimmed = title.trim();
          if (!trimmed) return state;
          return {
            tasks: [...state.tasks, { id: `task-${Date.now()}`, title: trimmed, lane }],
          };
        }),
      moveTask: (id, lane) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, lane } : t)),
        })),
      deleteTask: (id) =>
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
    }),
    { name: 'forze.team.v1' },
  ),
);
