import { Search, Settings, SquareSplitHorizontal, X, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWorkbench } from '../workbench/store';
import { commands } from '../workbench/commands';
import { PANELS } from '../workbench/panels';
import { iconForLanguage } from '../lib/fileIcons';

interface TopBarProps {
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
}

export default function TopBar({ onOpenSettings, onToggleSidebar }: TopBarProps): JSX.Element {
  const editorTabs = useWorkbench((s) => s.editorTabs);
  const activeTabId = useWorkbench((s) => s.activeTabId);
  const setActiveTab = useWorkbench((s) => s.setActiveTab);
  const closeTab = useWorkbench((s) => s.closeTab);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);
  const setQuickOpen = useWorkbench((s) => s.setQuickOpen);

  const [query, setQuery] = useState('');

  // A leading `>` switches the box into command mode (VS Code parity): it
  // opens the command palette. Anything else is treated as a file query.
  useEffect(() => {
    if (query.startsWith('>')) {
      commands.run('workbench.action.showCommands');
      setQuery('');
    }
  }, [query]);

  return (
    <div className="topbar">
      <div className="topbar__tabs" role="tablist">
        {editorTabs.map((tab) => {
          // Guard against a tab pinned to a page that no longer ships — fall
          // back to a file icon rather than dereferencing an undefined panel.
          const pagePanel = tab.pageId ? PANELS[tab.pageId] : undefined;
          const Icon = pagePanel ? pagePanel.icon : iconForLanguage(tab.language);
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`topbar__tab ${isActive ? 'is-active' : ''} ${
                tab.isDirty ? 'is-modified' : ''
              }`}
              onClick={() => setActiveTab(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  closeTab(tab.id);
                }
              }}
              title={tab.filePath ?? tab.title}
            >
              <span className="tab__icon">
                <Icon size={12} strokeWidth={1.7} />
              </span>
              <span>{tab.title}</span>
              <span
                className="tab__close"
                role="button"
                aria-label={`Close ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                {!tab.isDirty && <X size={11} />}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="topbar__newtab"
          title="Open file"
          onClick={() => setActiveActivity('explorer')}
        >
          <Plus size={14} strokeWidth={1.6} />
        </button>
      </div>

      <div className="topbar__search">
        <Search size={12} strokeWidth={1.8} className="topbar__search-icon" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setQuickOpen(true, query.trim());
              setQuery('');
            }
            if (e.key === 'Escape') setQuery('');
          }}
          placeholder="Go to file…"
          aria-label="Go to file"
        />
      </div>

      <button
        type="button"
        className="topbar__icon-btn"
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
      >
        <SquareSplitHorizontal size={14} strokeWidth={1.7} />
      </button>

      <button
        type="button"
        className="topbar__icon-btn"
        title="Settings"
        aria-label="Settings"
        onClick={onOpenSettings}
      >
        <Settings size={14} strokeWidth={1.7} />
      </button>
    </div>
  );
}

