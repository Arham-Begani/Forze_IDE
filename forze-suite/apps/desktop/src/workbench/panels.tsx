import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Boxes,
  Files,
  GitBranch,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
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
const SocialView = lazy(() => import('../views/SocialView'));
const VibeCanvas = lazy(() => import('../views/VibeCanvas'));
const SecurityAuditor = lazy(() => import('../views/SecurityAuditor'));
const SettingsView = lazy(() => import('../views/SettingsView'));

const AgentManagerPage = lazy(() => import('../views/pages/AgentManagerPage'));
const DashboardPage = lazy(() => import('../views/pages/DashboardPage'));
const AnalyticsPage = lazy(() => import('../views/pages/AnalyticsPage'));
const DeploymentsPage = lazy(() => import('../views/pages/DeploymentsPage'));
const AdStudioPage = lazy(() => import('../views/pages/AdStudioPage'));
const VibeStationsPage = lazy(() => import('../views/pages/VibeStationsPage'));
const CommunityPage = lazy(() => import('../views/pages/CommunityPage'));
const TeamPage = lazy(() => import('../views/pages/TeamPage'));

export interface PanelContext {
  onInsertCode: (snippet: string) => void;
}

export interface PanelDef {
  id: ActivityId;
  title: string;
  icon: LucideIcon;
  group: 'core' | 'skill';
  render: (ctx: PanelContext) => ReactNode;
}

export const PANELS: Record<ActivityId, PanelDef> = {
  explorer: { id: 'explorer', title: 'Explorer', icon: Files, group: 'core', render: () => <ExplorerView /> },
  search: { id: 'search', title: 'Search', icon: Search, group: 'core', render: () => <SearchView /> },
  'source-control': { id: 'source-control', title: 'Source Control', icon: GitBranch, group: 'core', render: () => <SourceControlView /> },
  social: { id: 'social', title: 'Social', icon: Megaphone, group: 'core', render: () => <SocialView /> },
  vibe: { id: 'vibe', title: 'Vibe Canvas', icon: Sparkles, group: 'core', render: (ctx) => <VibeCanvas onInsertCode={ctx.onInsertCode} /> },
  security: { id: 'security', title: 'Security', icon: ShieldCheck, group: 'core', render: () => <SecurityAuditor /> },
  settings: { id: 'settings', title: 'Settings', icon: Settings, group: 'core', render: () => <SettingsView /> },

  'agent-manager': { id: 'agent-manager', title: 'Agent Manager', icon: Boxes, group: 'skill', render: () => <AgentManagerPage /> },
  dashboard: { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, group: 'skill', render: () => <DashboardPage /> },
  analytics: { id: 'analytics', title: 'Analytics', icon: Activity, group: 'skill', render: () => <AnalyticsPage /> },
  deployments: { id: 'deployments', title: 'Deployments', icon: Rocket, group: 'skill', render: () => <DeploymentsPage /> },
  'ad-studio': { id: 'ad-studio', title: 'Ad Studio', icon: Megaphone, group: 'skill', render: () => <AdStudioPage /> },
  'vibe-stations': { id: 'vibe-stations', title: 'Vibe Stations', icon: SquareTerminal, group: 'skill', render: () => <VibeStationsPage /> },
  community: { id: 'community', title: 'Community', icon: MessagesSquare, group: 'skill', render: () => <CommunityPage /> },
  team: { id: 'team', title: 'Team', icon: Users, group: 'skill', render: () => <TeamPage /> },
};

export const CORE_PANELS = Object.values(PANELS).filter((p) => p.group === 'core');
export const SKILL_PANELS = Object.values(PANELS).filter((p) => p.group === 'skill');
