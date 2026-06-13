import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActivityId =
  // Core IDE views
  | 'explorer'
  | 'search'
  | 'source-control'
  | 'vibe'
  | 'security'
  | 'settings'
  // Startup-OS skills (dockable to the right)
  | 'agent-manager'
  | 'dashboard'
  | 'analytics'
  | 'deployments'
  | 'build-in-public'
  | 'vibe-stations'
  | 'community'
  | 'team'
  | 'kanban';

/** Every activity id the app currently ships. The single source of truth used
 *  to sanitize persisted state — a removed or renamed panel (e.g. the retired
 *  Marketplace) left behind in localStorage must never reach a `PANELS[id]`
 *  lookup, or it dereferences `undefined` and blanks the whole window. */
export const ALL_ACTIVITY_IDS: readonly ActivityId[] = [
  'explorer',
  'search',
  'source-control',
  'vibe',
  'security',
  'settings',
  'agent-manager',
  'dashboard',
  'analytics',
  'deployments',
  'build-in-public',
  'vibe-stations',
  'community',
  'team',
  'kanban',
];

const KNOWN_ACTIVITY = new Set<string>(ALL_ACTIVITY_IDS);

/** Narrow an arbitrary persisted value to a currently-shipping activity id. */
export function isKnownActivity(id: unknown): id is ActivityId {
  return typeof id === 'string' && KNOWN_ACTIVITY.has(id);
}

/** Skills can be dragged into the right sidebar. The Vibe Stations grid is
 *  intentionally excluded — its terminals need full-area width to be usable. */
export const DOCKABLE_PANELS: ActivityId[] = [
  'agent-manager',
  'dashboard',
  'analytics',
  'deployments',
  'build-in-public',
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
  'agent-manager': 'Agent Manager',
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  deployments: 'Deployments',
  'build-in-public': 'Build in Public',
  'vibe-stations': 'Vibe Stations',
  community: 'Community',
  team: 'Team',
  kanban: 'Kanban',
};

export type BottomPanelTab = 'terminal' | 'problems' | 'output';

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

  /** Is Quick Open (Go to File) open? */
  quickOpenOpen: boolean;
  /** Seed text for Quick Open (e.g. text typed in the top-bar search box). */
  quickOpenSeed: string;

  /** Is the floating Forze Assistant chat bubble expanded? */
  assistantOpen: boolean;

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
  /** Close every editor tab back to a single Welcome tab. Used when switching
   *  to a different workspace folder, so the old project's open files don't
   *  bleed into the new one (VS Code's "Open Folder" resets the editor). */
  resetWorkspaceTabs: () => void;

  setCommandPaletteOpen: (open: boolean) => void;
  setQuickOpen: (open: boolean, seed?: string) => void;

  setAssistantOpen: (open: boolean) => void;
  toggleAssistant: () => void;
}

const DEFAULT_TAB: EditorTab = {
  id: 'welcome',
  title: 'Welcome',
  filePath: null,
  language: 'markdown',
  isDirty: false,
};

const KNOWN_BOTTOM_TABS = new Set<BottomPanelTab>([
  'terminal',
  'problems',
  'output',
]);

/**
 * Scrub a persisted snapshot so state saved by an older build can never crash
 * the shell. Anything that points at a panel/tab the app no longer ships (the
 * classic "removed a page, old localStorage still references it" upgrade bug)
 * is reset to a safe default. Runs on every rehydrate via the persist `merge`,
 * so existing broken state self-heals on the next load.
 */
export function sanitizePersisted(
  persisted: Partial<WorkbenchState>,
): Partial<WorkbenchState> {
  const next: Partial<WorkbenchState> = { ...persisted };

  if (!isKnownActivity(next.activeActivity)) next.activeActivity = 'explorer';

  if (next.rightPanel != null && !isKnownActivity(next.rightPanel)) {
    next.rightPanel = null;
    next.rightSidebarVisible = false;
  }

  if (next.bottomPanelTab && !KNOWN_BOTTOM_TABS.has(next.bottomPanelTab)) {
    next.bottomPanelTab = 'terminal';
  }

  if (Array.isArray(next.editorTabs)) {
    const tabs = next.editorTabs.filter(
      (t): t is EditorTab =>
        !!t &&
        typeof t.id === 'string' &&
        (t.pageId == null || isKnownActivity(t.pageId)),
    );
    next.editorTabs = tabs.length > 0 ? tabs : [DEFAULT_TAB];
    if (!next.editorTabs.some((t) => t.id === next.activeTabId)) {
      next.activeTabId = next.editorTabs[0]?.id ?? 'welcome';
    }
  }

  return next;
}

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
      bottomPanelTab: 'terminal',

      editorTabs: [DEFAULT_TAB],
      activeTabId: 'welcome',

      commandPaletteOpen: false,
      quickOpenOpen: false,
      quickOpenSeed: '',
      assistantOpen: false,

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

      resetWorkspaceTabs: () =>
        set({ editorTabs: [DEFAULT_TAB], activeTabId: DEFAULT_TAB.id }),

      markTabDirty: (id, isDirty) =>
        set((state) => ({
          editorTabs: state.editorTabs.map((t) =>
            t.id === id ? { ...t, isDirty } : t,
          ),
        })),

      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setQuickOpen: (quickOpenOpen, seed) =>
        set({ quickOpenOpen, quickOpenSeed: seed ?? '' }),

      setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
      toggleAssistant: () => set((state) => ({ assistantOpen: !state.assistantOpen })),
    }),
    {
      name: 'forze.workbench.v1',
      // Always sanitize persisted state on rehydrate so a snapshot from an
      // older build (referencing a since-removed panel) can't crash the shell.
      // Done via `merge` (runs every load) rather than a version bump, so the
      // user keeps their good layout/tabs while only the stale bits are reset.
      merge: (persisted, current) => ({
        ...current,
        ...sanitizePersisted((persisted ?? {}) as Partial<WorkbenchState>),
      }),
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
