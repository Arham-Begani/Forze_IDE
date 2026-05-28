import { create } from 'zustand';

export interface TerminalSession {
  /** Stable client-side identifier (uuid). */
  id: string;
  /** PTY session id assigned by Rust once `pty_spawn` resolves. */
  ptySessionId: string | null;
  title: string;
  cwd: string | null;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeId: string | null;

  createTerminal: (cwd: string | null) => string;
  setPtySessionId: (id: string, ptySessionId: string) => void;
  closeTerminal: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  renameTerminal: (id: string, title: string) => void;
}

let counter = 1;

export const useTerminals = create<TerminalState>((set) => ({
  sessions: [],
  activeId: null,

  createTerminal: (cwd) => {
    const id = crypto.randomUUID();
    const title = `Terminal ${counter++}`;
    set((state) => ({
      sessions: [...state.sessions, { id, ptySessionId: null, title, cwd }],
      activeId: id,
    }));
    return id;
  },

  setPtySessionId: (id, ptySessionId) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ptySessionId } : s,
      ),
    })),

  closeTerminal: (id) =>
    set((state) => {
      const nextSessions = state.sessions.filter((s) => s.id !== id);
      let nextActive = state.activeId;
      if (state.activeId === id) {
        nextActive = nextSessions[nextSessions.length - 1]?.id ?? null;
      }
      return { sessions: nextSessions, activeId: nextActive };
    }),

  setActiveTerminal: (id) => set({ activeId: id }),

  renameTerminal: (id, title) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, title } : s,
      ),
    })),
}));
