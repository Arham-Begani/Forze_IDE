import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActivityId =
  | 'explorer'
  | 'search'
  | 'source-control'
  | 'agents'
  | 'social'
  | 'vibe'
  | 'security'
  | 'settings';

export type BottomPanelTab = 'terminal' | 'problems' | 'output' | 'agent';

export interface EditorTab {
  id: string;
  title: string;
  filePath: string | null;
  language: string;
  isDirty: boolean;
}

interface WorkbenchState {
  /** Currently selected activity (controls sidebar contents). */
  activeActivity: ActivityId;
  /** Whether the sidebar is visible. */
  sidebarVisible: boolean;
  /** Sidebar width in pixels. */
  sidebarWidth: number;

  /** Whether the bottom panel is visible. */
  bottomPanelVisible: boolean;
  /** Bottom panel height in pixels. */
  bottomPanelHeight: number;
  /** Currently selected tab in the bottom panel. */
  bottomPanelTab: BottomPanelTab;

  /** Editor tabs (ordered). */
  editorTabs: EditorTab[];
  /** ID of the currently active editor tab. */
  activeTabId: string | null;

  /** Is the command palette open? */
  commandPaletteOpen: boolean;

  setActiveActivity: (id: ActivityId) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;

  toggleBottomPanel: () => void;
  setBottomPanelHeight: (height: number) => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;

  openTab: (tab: Omit<EditorTab, 'isDirty'> & Partial<Pick<EditorTab, 'isDirty'>>) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  markTabDirty: (id: string, isDirty: boolean) => void;

  setCommandPaletteOpen: (open: boolean) => void;
}

const DEFAULT_TAB: EditorTab = {
  id: 'welcome',
  title: 'Welcome',
  filePath: null,
  language: 'markdown',
  isDirty: false,
};

export const useWorkbench = create<WorkbenchState>()(
  persist(
    (set) => ({
      activeActivity: 'explorer',
      sidebarVisible: true,
      sidebarWidth: 280,

      bottomPanelVisible: true,
      bottomPanelHeight: 240,
      bottomPanelTab: 'terminal',

      editorTabs: [DEFAULT_TAB],
      activeTabId: 'welcome',

      commandPaletteOpen: false,

      setActiveActivity: (id) =>
        set((state) => ({
          activeActivity: id,
          sidebarVisible: state.activeActivity === id ? !state.sidebarVisible : true,
        })),

      toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),

      toggleBottomPanel: () =>
        set((state) => ({ bottomPanelVisible: !state.bottomPanelVisible })),
      setBottomPanelHeight: (bottomPanelHeight) => set({ bottomPanelHeight }),
      setBottomPanelTab: (bottomPanelTab) =>
        set({ bottomPanelTab, bottomPanelVisible: true }),

      openTab: (tab) =>
        set((state) => {
          const existing = state.editorTabs.find((t) => t.id === tab.id);
          if (existing) return { activeTabId: existing.id };
          const next: EditorTab = { isDirty: false, ...tab };
          return {
            editorTabs: [...state.editorTabs, next],
            activeTabId: next.id,
          };
        }),

      closeTab: (id) =>
        set((state) => {
          const idx = state.editorTabs.findIndex((t) => t.id === id);
          if (idx === -1) return state;
          const nextTabs = state.editorTabs.filter((t) => t.id !== id);
          let nextActive = state.activeTabId;
          if (state.activeTabId === id) {
            const fallback = nextTabs[idx] ?? nextTabs[idx - 1] ?? null;
            nextActive = fallback?.id ?? null;
          }
          return { editorTabs: nextTabs, activeTabId: nextActive };
        }),

      setActiveTab: (id) => set({ activeTabId: id }),

      markTabDirty: (id, isDirty) =>
        set((state) => ({
          editorTabs: state.editorTabs.map((t) =>
            t.id === id ? { ...t, isDirty } : t,
          ),
        })),

      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    }),
    {
      name: 'forze.workbench.v1',
      partialize: (state) => ({
        activeActivity: state.activeActivity,
        sidebarVisible: state.sidebarVisible,
        sidebarWidth: state.sidebarWidth,
        bottomPanelVisible: state.bottomPanelVisible,
        bottomPanelHeight: state.bottomPanelHeight,
        bottomPanelTab: state.bottomPanelTab,
        editorTabs: state.editorTabs,
        activeTabId: state.activeTabId,
      }),
    },
  ),
);
