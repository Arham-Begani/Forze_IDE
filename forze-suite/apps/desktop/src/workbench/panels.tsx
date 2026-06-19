import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AppWindow,
  Boxes,
  Files,
  GitBranch,
  Hammer,
  LayoutDashboard,
  MessagesSquare,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareKanban,
  SquareTerminal,
  Users,
} from 'lucide-react';
import { lazy, type ReactNode } from 'react';
import type { ActivityId } from './store';

// Explorer is the default boot panel, so keep it eager — everything else is
// code-split via React.lazy. This keeps the heavy modules (xterm terminals in
// Vibe Stations, the AI/orchestrator stack behind Agent Manager, the charts in
// Dashboard/Analytics, highlight.js) out of the startup bundle, so the app
// paints the workspace immediately instead of evaluating all 16 views first.
// The render sites (Sidebar, EditorArea) wrap output in <Suspense>.
import ExplorerView from '../views/ExplorerView';
const SearchView = lazy(() => import('../views/SearchView'));
const SourceControlView = lazy(() => import('../views/SourceControlView'));
const VibeCanvas = lazy(() => import('../views/VibeCanvas'));
const SecurityAuditor = lazy(() => import('../views/SecurityAuditor'));
const SettingsView = lazy(() => import('../views/SettingsView'));

const AgentManagerPage = lazy(() => import('../views/pages/AgentManagerPage'));
const DashboardPage = lazy(() => import('../views/pages/DashboardPage'));
const AnalyticsPage = lazy(() => import('../views/pages/AnalyticsPage'));
const DeploymentsPage = lazy(() => import('../views/pages/DeploymentsPage'));
const BuildInPublicPage = lazy(() => import('../views/pages/BuildInPublicPage'));
const VibeStationsPage = lazy(() => import('../views/pages/VibeStationsPage'));
const CommunityPage = lazy(() => import('../views/pages/CommunityPage'));
const TeamPage = lazy(() => import('../views/pages/TeamPage'));
const KanbanPage = lazy(() => import('../views/pages/KanbanPage'));
const PreviewPage = lazy(() => import('../views/pages/PreviewPage'));

export interface PanelContext {
  onInsertCode: (snippet: string) => void;
}

export interface PanelDef {
  id: ActivityId;
  title: string;
  icon: LucideIcon;
  /** 'core' → activity rail + sidebar; 'skill' → Apps launcher grid;
   *  'board' → its own dedicated rail entry (the shared Kanban). */
  group: 'core' | 'skill' | 'board';
  render: (ctx: PanelContext) => ReactNode;
}

export const PANELS: Record<ActivityId, PanelDef> = {
  explorer: { id: 'explorer', title: 'Explorer', icon: Files, group: 'core', render: () => <ExplorerView /> },
  search: { id: 'search', title: 'Search', icon: Search, group: 'core', render: () => <SearchView /> },
  'source-control': { id: 'source-control', title: 'Source Control', icon: GitBranch, group: 'core', render: () => <SourceControlView /> },
  vibe: { id: 'vibe', title: 'Vibe Canvas', icon: Sparkles, group: 'core', render: (ctx) => <VibeCanvas onInsertCode={ctx.onInsertCode} /> },
  security: { id: 'security', title: 'Security', icon: ShieldCheck, group: 'core', render: () => <SecurityAuditor /> },
  settings: { id: 'settings', title: 'Settings', icon: Settings, group: 'core', render: () => <SettingsView /> },

  'agent-manager': { id: 'agent-manager', title: 'Agent Manager', icon: Boxes, group: 'skill', render: () => <AgentManagerPage /> },
  dashboard: { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, group: 'skill', render: () => <DashboardPage /> },
  analytics: { id: 'analytics', title: 'Analytics', icon: Activity, group: 'skill', render: () => <AnalyticsPage /> },
  deployments: { id: 'deployments', title: 'Deployments', icon: Rocket, group: 'skill', render: () => <DeploymentsPage /> },
  'build-in-public': { id: 'build-in-public', title: 'Build in Public', icon: Hammer, group: 'skill', render: () => <BuildInPublicPage /> },
  'vibe-stations': { id: 'vibe-stations', title: 'Vibe Stations', icon: SquareTerminal, group: 'skill', render: () => <VibeStationsPage /> },
  community: { id: 'community', title: 'Community', icon: MessagesSquare, group: 'skill', render: () => <CommunityPage /> },
  team: { id: 'team', title: 'Team', icon: Users, group: 'skill', render: () => <TeamPage /> },
  preview: { id: 'preview', title: 'Live Preview', icon: AppWindow, group: 'skill', render: () => <PreviewPage /> },

  // The shared team board gets its own home in the rail, just below Apps.
  kanban: { id: 'kanban', title: 'Kanban', icon: SquareKanban, group: 'board', render: () => <KanbanPage /> },
};

export const CORE_PANELS = Object.values(PANELS).filter((p) => p.group === 'core');
export const SKILL_PANELS = Object.values(PANELS).filter((p) => p.group === 'skill');
/** The shared board — surfaced as its own rail entry below the Apps launcher. */
export const BOARD_PANEL = PANELS.kanban;
/** Live Preview — also gets a dedicated rail entry for one-click access, since
 *  it's a high-frequency dev tool (it still appears in the Apps launcher too). */
export const PREVIEW_PANEL = PANELS.preview;
