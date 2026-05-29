import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bot,
  Files,
  GitBranch,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ActivityId } from './store';

import ExplorerView from '../views/ExplorerView';
import SearchView from '../views/SearchView';
import SourceControlView from '../views/SourceControlView';
import AgentView from '../views/AgentView';
import SocialView from '../views/SocialView';
import VibeCanvas from '../views/VibeCanvas';
import SecurityAuditor from '../views/SecurityAuditor';
import SettingsView from '../views/SettingsView';

import DashboardPage from '../views/pages/DashboardPage';
import AnalyticsPage from '../views/pages/AnalyticsPage';
import DeploymentsPage from '../views/pages/DeploymentsPage';
import AdStudioPage from '../views/pages/AdStudioPage';
import MarketplacePage from '../views/pages/MarketplacePage';
import CommunityPage from '../views/pages/CommunityPage';
import TeamPage from '../views/pages/TeamPage';

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
  agents: { id: 'agents', title: 'Agents', icon: Bot, group: 'core', render: () => <AgentView /> },
  social: { id: 'social', title: 'Social', icon: Megaphone, group: 'core', render: () => <SocialView /> },
  vibe: { id: 'vibe', title: 'Vibe Canvas', icon: Sparkles, group: 'core', render: (ctx) => <VibeCanvas onInsertCode={ctx.onInsertCode} /> },
  security: { id: 'security', title: 'Security', icon: ShieldCheck, group: 'core', render: () => <SecurityAuditor /> },
  settings: { id: 'settings', title: 'Settings', icon: Settings, group: 'core', render: () => <SettingsView /> },

  dashboard: { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, group: 'skill', render: () => <DashboardPage /> },
  analytics: { id: 'analytics', title: 'Analytics', icon: Activity, group: 'skill', render: () => <AnalyticsPage /> },
  deployments: { id: 'deployments', title: 'Deployments', icon: Rocket, group: 'skill', render: () => <DeploymentsPage /> },
  'ad-studio': { id: 'ad-studio', title: 'Ad Studio', icon: Megaphone, group: 'skill', render: () => <AdStudioPage /> },
  marketplace: { id: 'marketplace', title: 'Marketplace', icon: ShoppingBag, group: 'skill', render: () => <MarketplacePage /> },
  community: { id: 'community', title: 'Community', icon: MessagesSquare, group: 'skill', render: () => <CommunityPage /> },
  team: { id: 'team', title: 'Team', icon: Users, group: 'skill', render: () => <TeamPage /> },
};

export const CORE_PANELS = Object.values(PANELS).filter((p) => p.group === 'core');
export const SKILL_PANELS = Object.values(PANELS).filter((p) => p.group === 'skill');
