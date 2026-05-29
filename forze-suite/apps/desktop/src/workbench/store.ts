import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActivityId =
  // Core IDE views
  | 'explorer'
  | 'search'
  | 'source-control'
  | 'agents'
  | 'social'
  | 'vibe'
  | 'security'
  | 'settings'
  // Startup-OS skills (dockable to the right)
  | 'dashboard'
  | 'analytics'
  | 'deployments'
  | 'ad-studio'
  | 'marketplace'
  | 'community'
  | 'team';

/** Skills can be dragged into the right sidebar. */
export const DOCKABLE_PANELS: ActivityId[] = [
  'dashboard',
  'analytics',
  'deployments',
  'ad-studio',
  'marketplace',
  'community',
  'team',
];

export function isDockable(id: ActivityId): boolean {
  return DOCKABLE_PANELS.includes(id);
}

/** Titles for skill pages opened as full-area workspace tabs. Kept here (as
 *  plain strings) so the store needn't import the panel registry, which would
 *  pull every view component into this module and risk an import cycle. */
export const PAGE_TITLES: Partial<Record<ActivityId, string>> = {
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  deployments: 'Deployments',
  'ad-studio': 'Ad Studio',
  marketplace: 'Marketplace',
  community: 'Community',
  team: 'Team',
};

export type BottomPanelTab = 'terminal' | 'problems' | 'output' | 'agent';

export interface EditorTab {
  id: string;
  title: string;
  filePath: string | null;
  language: string;
  isDirty: boolean;
  /** When set, this tab renders a full-area skill page (Dashboard, Analytics,
   *  …) in the main workspace instead of a code editor. */
  pageId?: ActivityId;
}

interface WorkbenchState {
  /** Currently selected activity (controls sidebar contents). */
  activeActivity: ActivityId;
  /** Whether the (left) sidebar is visible. */
  sidebarVisible: boolean;
  /** Sidebar width in pixels. */
  sidebarWidth: number;

  /** Skill currently docked into the right sidebar (null = none). */
  rightPanel: ActivityId | null;
  /** Whether the right sidebar is visible. */
  rightSidebarVisible: boolean;
  /** Panel currently being dragged (for the right dock drop zone). */
  draggingPanel: ActivityId | null;

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

  /** Dock a skill panel into the right sidebar. */
  dockRight: (id: ActivityId) => void;
  /** Remove the right sidebar. */
  undockRight: () => void;
  toggleRightSidebar: () => void;
  setDraggingPanel: (id: ActivityId | null) => void;

  toggleBottomPanel: () => void;
  setBottomPanelHeight: (height: number) => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;

  openTab: (tab: Omit<EditorTab, 'isDirty'> & Partial<Pick<EditorTab, 'isDirty'>>) => void;
  /** Open (or focus) a skill page as a full-area workspace tab. */
  openPage: (id: ActivityId) => void;
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

      rightPanel: null,
      rightSidebarVisible: false,
      draggingPanel: null,

      bottomPanelVisible: false,
      bottomPanelHeight: 260,
      bottomPanelTab: 'agent',

      editorTabs: [DEFAULT_TAB],
      activeTabId: 'welcome',

      commandPaletteOpen: false,

      setActiveActivity: (id) =>
        set((state) => {
          // If the clicked skill is already docked on the right, just focus it
          // (toggle the right sidebar) instead of duplicating it on the left.
          if (state.rightPanel === id) {
            return { rightSidebarVisible: !state.rightSidebarVisible };
          }
          return {
            activeActivity: id,
            sidebarVisible: state.activeActivity === id ? !state.sidebarVisible : true,
          };
        }),

      toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),

      dockRight: (id) =>
        set((state) => ({
          rightPanel: id,
          rightSidebarVisible: true,
          draggingPanel: null,
          // Avoid showing the same panel on both sides.
          activeActivity:
            state.activeActivity === id ? 'explorer' : state.activeActivity,
        })),

      undockRight: () =>
        set({ rightPanel: null, rightSidebarVisible: false }),

      toggleRightSidebar: () =>
        set((state) => ({
          rightSidebarVisible: state.rightPanel ? !state.rightSidebarVisible : false,
        })),

      setDraggingPanel: (draggingPanel) => set({ draggingPanel }),

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

      openPage: (id) =>
        set((state) => {
          const tabId = `page:${id}`;
          const existing = state.editorTabs.find((t) => t.id === tabId);
          if (existing) return { activeTabId: tabId };
          const next: EditorTab = {
            id: tabId,
            title: PAGE_TITLES[id] ?? id,
            filePath: null,
            language: 'page',
            isDirty: false,
            pageId: id,
          };
          return { editorTabs: [...state.editorTabs, next], activeTabId: tabId };
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
        rightPanel: state.rightPanel,
        rightSidebarVisible: state.rightSidebarVisible,
        bottomPanelVisible: state.bottomPanelVisible,
        bottomPanelHeight: state.bottomPanelHeight,
        bottomPanelTab: state.bottomPanelTab,
        editorTabs: state.editorTabs,
        activeTabId: state.activeTabId,
      }),
    },
  ),
);
