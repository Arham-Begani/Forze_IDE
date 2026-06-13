'use client';

import { ActivityBar } from '@/components/shell/ActivityBar';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { StatusBar } from '@/components/shell/StatusBar';
import { TopBar } from '@/components/shell/TopBar';
import { AgentView } from '@/components/views/AgentView';
import { AnalyticsView } from '@/components/views/AnalyticsView';
import { CodeView } from '@/components/views/CodeView';
import { CommunityView } from '@/components/views/CommunityView';
import { DatabaseView } from '@/components/views/DatabaseView';
import { DeploymentsView } from '@/components/views/DeploymentsView';
import { MarketplaceView } from '@/components/views/MarketplaceView';
import { PreviewView } from '@/components/views/PreviewView';
import { SettingsView } from '@/components/views/SettingsView';
import { TeamView } from '@/components/views/TeamView';
import { useStore } from '@/lib/store';

export default function HomePage() {
  const active = useStore((s) => s.activeActivity);

  return (
    <main className="h-screen w-screen flex flex-col overflow-hidden bg-bg-base">
      <TopBar />
      <div className="flex-1 min-h-0 flex">
        <ActivityBar />
        {active === 'code' && <CodeView />}
        {active === 'agent' && <AgentView />}
        {active === 'preview' && <PreviewView />}
        {active === 'deployments' && <DeploymentsView />}
        {active === 'analytics' && <AnalyticsView />}
        {active === 'database' && <DatabaseView />}
        {active === 'team' && <TeamView />}
        {active === 'marketplace' && <MarketplaceView />}
        {active === 'community' && <CommunityView />}
        {active === 'settings' && <SettingsView />}
      </div>
      <StatusBar />
      <CommandPalette />
    </main>
  );
}
