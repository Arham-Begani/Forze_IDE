import { create } from 'zustand';
import type { StackTraceLine } from '@forze/shared/diagnostics';

export interface DiagnosticEntry extends StackTraceLine {
  id: string;
  receivedAt: number;
}

interface DiagnosticsState {
  entries: DiagnosticEntry[];
  push: (trace: StackTraceLine) => void;
  clear: () => void;
}

export const useDiagnostics = create<DiagnosticsState>((set) => ({
  entries: [],
  push: (trace) =>
    set((state) => {
      const id = crypto.randomUUID();
      // De-dupe consecutive identical traces (Vite spams the same line).
      const last = state.entries[state.entries.length - 1];
      if (
        last &&
        last.filePath === trace.filePath &&
        last.line === trace.line &&
        last.column === trace.column &&
        last.message === trace.message
      ) {
        return state;
      }
      return {
        entries: [...state.entries.slice(-199), { ...trace, id, receivedAt: Date.now() }],
      };
    }),
  clear: () => set({ entries: [] }),
}));
