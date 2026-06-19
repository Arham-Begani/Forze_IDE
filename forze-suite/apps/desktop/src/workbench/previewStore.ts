import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Remembers the dev-server URL the Live Preview pane points at, so reopening the
 * app (or the tab) lands back on the same localhost address. A plain URL string
 * changes rarely, so the default localStorage persister is fine here — no need
 * for the debounced storage the streaming stores use.
 */
interface PreviewState {
  /** The committed address the iframe loads (e.g. http://localhost:3000). */
  url: string;
  setUrl: (url: string) => void;
}

export const DEFAULT_PREVIEW_URL = 'http://localhost:3000';

export const usePreview = create<PreviewState>()(
  persist(
    (set) => ({
      url: DEFAULT_PREVIEW_URL,
      setUrl: (url) => set({ url }),
    }),
    { name: 'forze.preview.v1' },
  ),
);
