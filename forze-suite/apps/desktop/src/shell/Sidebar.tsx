import { useWorkbench, type ActivityId } from '../workbench/store';
import ExplorerView from '../views/ExplorerView';
import SourceControlView from '../views/SourceControlView';
import AgentView from '../views/AgentView';
import SocialView from '../views/SocialView';
import VibeCanvas from '../views/VibeCanvas';
import SecurityAuditor from '../views/SecurityAuditor';
import SettingsView from '../views/SettingsView';
import SearchView from '../views/SearchView';

const TITLES: Record<ActivityId, string> = {
  explorer: 'Explorer',
  search: 'Search',
  'source-control': 'Source Control',
  agents: 'Agents',
  social: 'Social',
  vibe: 'Vibe Canvas',
  security: 'Security',
  settings: 'Settings',
};

interface SidebarProps {
  onInsertCode?: (snippet: string) => void;
}

export default function Sidebar({ onInsertCode }: SidebarProps): JSX.Element {
  const activeActivity = useWorkbench((s) => s.activeActivity);

  return (
    <div className="sidebar">
      <div className="sidebar__header">
        <span>{TITLES[activeActivity]}</span>
      </div>
      <div className="sidebar__body">
        {activeActivity === 'explorer' && <ExplorerView />}
        {activeActivity === 'search' && <SearchView />}
        {activeActivity === 'source-control' && <SourceControlView />}
        {activeActivity === 'agents' && <AgentView />}
        {activeActivity === 'social' && <SocialView />}
        {activeActivity === 'vibe' && (
          <VibeCanvas onInsertCode={onInsertCode ?? (() => undefined)} />
        )}
        {activeActivity === 'security' && <SecurityAuditor />}
        {activeActivity === 'settings' && <SettingsView />}
      </div>
    </div>
  );
}
