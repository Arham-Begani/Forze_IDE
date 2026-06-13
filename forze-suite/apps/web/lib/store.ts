'use client';

import { create } from 'zustand';
import {
  initialTree,
  findFile,
  type FileNode,
  type FolderNode,
} from './mock-fs';

export type ActivityId =
  | 'code'
  | 'agent'
  | 'preview'
  | 'deployments'
  | 'analytics'
  | 'database'
  | 'team'
  | 'marketplace'
  | 'community'
  | 'settings';

export type RightPanelTab = 'preview' | 'analytics' | 'database' | 'api' | 'logs';
export type BottomPanelTab = 'chat' | 'terminal' | 'problems' | 'git';

export type EditorTab = {
  path: string;
  name: string;
  language: string;
  isDirty: boolean;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
};

type State = {
  // Navigation
  activeActivity: ActivityId;
  setActiveActivity: (id: ActivityId) => void;

  // File tree
  tree: FolderNode;
  expandedFolders: Record<string, boolean>;
  toggleFolder: (path: string) => void;

  // Editor tabs
  editorTabs: EditorTab[];
  activeTabPath: string | null;
  openFile: (path: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;

  // Right panel
  rightPanelTab: RightPanelTab;
  setRightPanelTab: (tab: RightPanelTab) => void;
  rightPanelVisible: boolean;
  toggleRightPanel: () => void;

  // Bottom panel
  bottomPanelTab: BottomPanelTab;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  bottomPanelVisible: boolean;
  toggleBottomPanel: () => void;

  // Sidebar
  sidebarVisible: boolean;
  toggleSidebar: () => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // AI chat
  chatMessages: ChatMessage[];
  sendChatMessage: (content: string) => void;

  // Helpers
  getFileContent: (path: string) => string | null;
};

const seedTabs: EditorTab[] = [
  { path: '/app/dashboard/page.tsx', name: 'page.tsx', language: 'tsx', isDirty: false },
  { path: '/app/dashboard/layout.tsx', name: 'layout.tsx', language: 'tsx', isDirty: false },
  { path: '/app/api/route.ts', name: 'route.ts', language: 'ts', isDirty: false },
  { path: '/schema.prisma', name: 'schema.prisma', language: 'prisma', isDirty: true },
];

const seedChat: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'assistant',
    content:
      "I've analyzed your dashboard component. Would you like me to:",
    ts: Date.now() - 60_000,
  },
];

export const useStore = create<State>((set, get) => ({
  activeActivity: 'code',
  setActiveActivity: (id) => set({ activeActivity: id }),

  tree: initialTree,
  expandedFolders: {
    '/': true,
    '/app': true,
    '/app/dashboard': true,
    '/components': true,
    '/components/ui': true,
  },
  toggleFolder: (path) =>
    set((s) => ({
      expandedFolders: { ...s.expandedFolders, [path]: !s.expandedFolders[path] },
    })),

  editorTabs: seedTabs,
  activeTabPath: '/app/dashboard/page.tsx',
  openFile: (path) => {
    const file = findFile(get().tree, path);
    if (!file) return;
    set((s) => {
      const existing = s.editorTabs.find((t) => t.path === path);
      if (existing) {
        return { activeTabPath: path };
      }
      const newTab: EditorTab = {
        path: file.path,
        name: file.name,
        language: file.language,
        isDirty: false,
      };
      return {
        editorTabs: [...s.editorTabs, newTab],
        activeTabPath: file.path,
      };
    });
  },
  closeTab: (path) =>
    set((s) => {
      const next = s.editorTabs.filter((t) => t.path !== path);
      let nextActive = s.activeTabPath;
      if (s.activeTabPath === path) {
        nextActive = next[next.length - 1]?.path ?? null;
      }
      return { editorTabs: next, activeTabPath: nextActive };
    }),
  setActiveTab: (path) => set({ activeTabPath: path }),

  rightPanelTab: 'preview',
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  rightPanelVisible: true,
  toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),

  bottomPanelTab: 'chat',
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
  bottomPanelVisible: true,
  toggleBottomPanel: () => set((s) => ({ bottomPanelVisible: !s.bottomPanelVisible })),

  sidebarVisible: true,
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  chatMessages: seedChat,
  sendChatMessage: (content) =>
    set((s) => {
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content,
        ts: Date.now(),
      };
      const reply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: synthesizeReply(content),
        ts: Date.now() + 500,
      };
      return { chatMessages: [...s.chatMessages, userMsg, reply] };
    }),

  getFileContent: (path) => {
    const file = findFile(get().tree, path);
    return file ? file.content : null;
  },
}));

function synthesizeReply(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes('chart')) return 'On it — adding a Recharts-based area chart to the dashboard, wired to your MRR series.';
  if (p.includes('deploy')) return 'Building the project, then triggering a Vercel preview deployment. ETA ~38s.';
  if (p.includes('ui') || p.includes('design')) return 'Polishing the UI: tightening spacing, adding empty states, and aligning the type scale.';
  if (p.includes('data') || p.includes('fetch')) return "Wiring a server-side fetch with revalidation and a typed response schema. I'll add an error boundary.";
  if (p.includes('optimize') || p.includes('performance'))
    return 'Profiling the page — I see a re-render on every keystroke. Memoizing the stats grid and lifting the form state.';
  return "Got it. I'll plan the change, touch the files we need, run the type-check, and report back.";
}
