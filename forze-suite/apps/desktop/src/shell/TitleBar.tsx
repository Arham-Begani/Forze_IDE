import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Search, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useWorkbench } from '../workbench/store';
import { useProject } from '../workbench/projectStore';
import { commands } from '../workbench/commands';
import { showModal } from './modal';
import { basename } from '../lib/fs';

interface TitleBarProps {
  /** Select all text in the active editor (for the Selection menu). */
  onSelectAll: () => void;
}

type MenuItem = { label: string; hint?: string; run: () => void } | 'sep';
interface Menu {
  label: string;
  items: MenuItem[];
}

const wb = () => useWorkbench.getState();
const run = (id: string) => () => void commands.run(id);

/** Move to the previous/next open editor tab (the title-bar back/forward arrows). */
function stepTab(dir: -1 | 1): void {
  const s = useWorkbench.getState();
  const idx = s.editorTabs.findIndex((t) => t.id === s.activeTabId);
  const next = s.editorTabs[idx + dir];
  if (next) s.setActiveTab(next.id);
}

function buildMenus(onSelectAll: () => void): Menu[] {
  return [
    {
      label: 'File',
      items: [
        { label: 'Open Folder…', run: run('workbench.action.files.openFolder') },
        { label: 'Save', hint: 'Ctrl+S', run: run('workbench.action.files.save') },
        'sep',
        { label: 'Close Editor', run: run('workbench.action.closeActiveEditor') },
        { label: 'Close Folder', run: run('workbench.action.files.closeFolder') },
        'sep',
        { label: 'Settings', run: () => wb().setActiveActivity('settings') },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Format Document', hint: 'Shift+Alt+F', run: run('editor.action.formatDocument') },
        { label: 'Find in Files', run: () => wb().setActiveActivity('search') },
        'sep',
        { label: 'Command Palette…', hint: 'Ctrl+Shift+P', run: run('workbench.action.showCommands') },
      ],
    },
    {
      label: 'Selection',
      items: [
        { label: 'Select All', hint: 'Ctrl+A', run: onSelectAll },
        'sep',
        { label: 'Go to File…', run: run('workbench.action.quickOpen') },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Command Palette…', run: run('workbench.action.showCommands') },
        'sep',
        { label: 'Explorer', run: () => wb().setActiveActivity('explorer') },
        { label: 'Search', run: () => wb().setActiveActivity('search') },
        { label: 'Source Control', run: () => wb().setActiveActivity('source-control') },
        'sep',
        { label: 'Toggle Sidebar', hint: 'Ctrl+B', run: run('workbench.action.toggleSidebar') },
        { label: 'Toggle Panel', run: run('workbench.action.toggleBottomPanel') },
      ],
    },
    {
      label: 'Go',
      items: [
        { label: 'Go to File…', hint: 'Ctrl+P', run: run('workbench.action.quickOpen') },
        'sep',
        { label: 'Back', run: () => stepTab(-1) },
        { label: 'Forward', run: () => stepTab(1) },
      ],
    },
    {
      label: 'Run',
      items: [
        { label: 'Toggle Terminal', run: run('workbench.action.terminal.toggle') },
        'sep',
        { label: 'Open Agent Manager', run: run('workbench.action.openAgentManager') },
      ],
    },
    {
      label: 'Terminal',
      items: [
        { label: 'New Terminal', run: () => wb().setBottomPanelTab('terminal') },
        'sep',
        { label: 'Vibe Stations', run: () => wb().openPage('vibe-stations') },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Welcome / Onboarding', run: run('workbench.action.onboarding.show') },
        { label: 'Toggle Forze Assistant', run: run('workbench.assistant.toggle') },
        'sep',
        {
          label: 'About Forze IDE',
          run: () =>
            showModal({
              title: 'About Forze IDE',
              body: (
                <div className="about-modal">
                  <div className="about-modal__name">Forze IDE</div>
                  <div className="about-modal__version">Version 0.1.0</div>
                  <p className="about-modal__tagline">
                    The Sovereign OS for Startup Founders.
                  </p>
                </div>
              ),
            }),
        },
      ],
    },
  ];
}

export default function TitleBar({ onSelectAll }: TitleBarProps): JSX.Element {
  const editorTabs = useWorkbench((s) => s.editorTabs);
  const activeTabId = useWorkbench((s) => s.activeTabId);
  const setQuickOpen = useWorkbench((s) => s.setQuickOpen);
  const workspaceRoot = useProject((s) => s.workspaceRoot);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);

  // Dismiss an open menu on any click outside the menu bar.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.titlebar__menu')) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenu]);

  const menus = buildMenus(onSelectAll);
  const tabIdx = editorTabs.findIndex((t) => t.id === activeTabId);
  const folderName = workspaceRoot ? basename(workspaceRoot) : 'Forze IDE';

  // Track maximize state so the chrome stays in sync (e.g. after a snap/drag).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      const win = getCurrentWindow();
      void win.isMaximized().then(setMaximized).catch(() => undefined);
      void win.onResized(() => {
        void win.isMaximized().then(setMaximized).catch(() => undefined);
      }).then((u) => {
        unlisten = u;
      });
    } catch {
      /* not running under Tauri (e.g. plain browser preview) */
    }
    return () => unlisten?.();
  }, []);

  const winCall = (fn: 'minimize' | 'toggleMaximize' | 'close') => () => {
    try {
      void getCurrentWindow()[fn]();
    } catch {
      /* not under Tauri */
    }
  };

  const select = (item: MenuItem) => {
    if (item === 'sep') return;
    setOpenMenu(null);
    item.run();
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      {/* Brand + menu bar */}
      <div className="titlebar__left">
        <span className="titlebar__logo" aria-hidden>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 3h13a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5m0-5v17m0-12h10" />
          </svg>
        </span>
        <nav className="titlebar__menubar" aria-label="Application menu">
          {menus.map((menu) => (
            <div className="titlebar__menu" key={menu.label}>
              <button
                type="button"
                className={`titlebar__menu-btn ${openMenu === menu.label ? 'is-open' : ''}`}
                onClick={() => setOpenMenu((m) => (m === menu.label ? null : menu.label))}
                onMouseEnter={() => setOpenMenu((m) => (m !== null ? menu.label : m))}
              >
                {menu.label}
              </button>
              {openMenu === menu.label && (
                <div className="titlebar__dropdown" role="menu">
                  {menu.items.map((item, i) =>
                    item === 'sep' ? (
                      <div key={`sep-${i}`} className="titlebar__menu-sep" />
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        className="titlebar__menu-item"
                        onClick={() => select(item)}
                      >
                        <span>{item.label}</span>
                        {item.hint && <span className="titlebar__menu-hint">{item.hint}</span>}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Center: nav arrows + command center */}
      <div
        className="titlebar__center"
        data-tauri-drag-region
        onDoubleClick={(e) => {
          // Double-clicking empty title-bar space maximizes/restores (VS Code).
          if (e.target === e.currentTarget) winCall('toggleMaximize')();
        }}
      >
        <button
          type="button"
          className="titlebar__nav"
          title="Back (previous tab)"
          disabled={tabIdx <= 0}
          onClick={() => stepTab(-1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="titlebar__nav"
          title="Forward (next tab)"
          disabled={tabIdx < 0 || tabIdx >= editorTabs.length - 1}
          onClick={() => stepTab(1)}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className="titlebar__command-center"
          onClick={() => setQuickOpen(true)}
          title="Search files (Ctrl+P)"
        >
          <Search size={12} strokeWidth={1.8} />
          <span>{folderName}</span>
        </button>
      </div>

      {/* Window controls */}
      <div className="titlebar__right">
        <button type="button" className="titlebar__win-btn" title="Minimize" onClick={winCall('minimize')}>
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="titlebar__win-btn"
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={winCall('toggleMaximize')}
        >
          <Square size={maximized ? 11 : 12} strokeWidth={maximized ? 2 : 1.7} />
        </button>
        <button
          type="button"
          className="titlebar__win-btn titlebar__win-btn--close"
          title="Close"
          onClick={winCall('close')}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
