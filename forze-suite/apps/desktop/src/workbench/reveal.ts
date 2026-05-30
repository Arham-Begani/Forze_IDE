import { create } from 'zustand';

/**
 * A one-shot "jump to this line" request, used by Search (and anything else)
 * to scroll the editor to a specific line after opening a file. The `nonce`
 * lets the same file+line be requested twice in a row and still fire.
 */
interface RevealState {
  filePath: string | null;
  line: number;
  nonce: number;
  reveal: (filePath: string, line: number) => void;
  clear: () => void;
}

export const useReveal = create<RevealState>((set) => ({
  filePath: null,
  line: 1,
  nonce: 0,
  reveal: (filePath, line) =>
    set((s) => ({ filePath, line, nonce: s.nonce + 1 })),
  clear: () => set({ filePath: null }),
}));
