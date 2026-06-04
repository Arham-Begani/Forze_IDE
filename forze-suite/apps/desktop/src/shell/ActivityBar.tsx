import { LayoutGrid } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWorkbench } from '../workbench/store';
import { CORE_PANELS, SKILL_PANELS } from '../workbench/panels';
import { changeCount, useGitStatus, useGitStatusPolling } from '../workbench/gitStatusStore';

export default function ActivityBar(): JSX.Element {
  const activeActivity = useWorkbench((s) => s.activeActivity);
  const sidebarVisible = useWorkbench((s) => s.sidebarVisible);
  const rightPanel = useWorkbench((s) => s.rightPanel);
  const rightSidebarVisible = useWorkbench((s) => s.rightSidebarVisible);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);
  const openPage = useWorkbench((s) => s.openPage);
  const editorTabs = useWorkbench((s) => s.editorTabs);
  const activeTabId = useWorkbench((s) => s.activeTabId);

  const [launcherOpen, setLauncherOpen] = useState(false);

  // Live git change count for the Source Control badge (polled centrally so it
  // shows even when the panel is closed, VS Code-style).
  useGitStatusPolling();
  const scmCount = changeCount(useGitStatus((s) => s.report));

  const activePageId =
    editorTabs.find((t) => t.id === activeTabId)?.pageId ?? null;
  const skillActive = SKILL_PANELS.some((p) => p.id === activePageId);

  const renderItem = (panel: { id: typeof activeActivity; title: string; icon: typeof CORE_PANELS[number]['icon'] }) => {
    const Icon = panel.icon;
    const dockedRight = rightPanel === panel.id && rightSidebarVisible;
    const isActive = (activeActivity === panel.id && sidebarVisible) || dockedRight;
    const badge = panel.id === 'source-control' && scmCount > 0 ? scmCount : null;
    return (
      <button
        key={panel.id}
        type="button"
        className={`rail__item ${isActive ? 'is-active' : ''}`}
        onClick={() => setActiveActivity(panel.id)}
        aria-label={badge ? `${panel.title} (${badge} changes)` : panel.title}
        aria-current={isActive ? 'page' : undefined}
        tabIndex={0}
      >
        <Icon size={17} strokeWidth={1.6} />
        {badge !== null && (
          <span className="rail__badge">{badge > 99 ? '99+' : badge}</span>
        )}
        <span className="rail__tooltip">{panel.title}</span>
      </button>
    );
  };

  const core = CORE_PANELS.filter((p) => p.id !== 'settings');
  const settings = CORE_PANELS.find((p) => p.id === 'settings');

  return (
    <nav className="rail" aria-label="Activity">
      <div className="rail__logo" title="Forze IDE">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-accent)' }}>
          <path d="M5 3h13a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5m0-5v17m0-12h10" />
        </svg>
      </div>
      <div className="rail__divider" style={{ marginTop: 2, marginBottom: 6 }} />
      {core.map((p) => renderItem(p))}
      <div className="rail__divider" />

      <AppsLauncher
        open={launcherOpen}
        active={skillActive}
        activePageId={activePageId}
        onToggle={() => setLauncherOpen((v) => !v)}
        onClose={() => setLauncherOpen(false)}
        onPick={(id) => {
          openPage(id);
          setLauncherOpen(false);
        }}
      />

      <div className="rail__spacer" />
      {settings && renderItem(settings)}
    </nav>
  );
}

function AppsLauncher({
  open,
  active,
  activePageId,
  onToggle,
  onClose,
  onPick,
}: {
  open: boolean;
  active: boolean;
  activePageId: string | null;
  onToggle: () => void;
  onClose: () => void;
  onPick: (id: typeof SKILL_PANELS[number]['id']) => void;
}): JSX.Element {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Anchor the popover to the launcher button (fixed, so it escapes the rail).
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.top, left: r.right + 10 });
  }, [open]);

  // Dismiss on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !popRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`rail__item ${active || open ? 'is-active' : ''}`}
        onClick={onToggle}
        aria-label="Apps"
        aria-haspopup="menu"
        aria-expanded={open}
        tabIndex={0}
      >
        <LayoutGrid size={17} strokeWidth={1.6} />
        <span className="rail__tooltip">Apps</span>
      </button>

      {open && (
        <div
          ref={popRef}
          className="applauncher"
          role="menu"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="applauncher__title">Apps</div>
          <div className="applauncher__grid">
            {SKILL_PANELS.map((panel) => {
              const Icon = panel.icon;
              const isActive = activePageId === panel.id;
              return (
                <button
                  key={panel.id}
                  type="button"
                  role="menuitem"
                  className={`applauncher__item ${isActive ? 'is-active' : ''}`}
                  onClick={() => onPick(panel.id)}
                >
                  <span className="applauncher__icon">
                    <Icon size={18} strokeWidth={1.7} />
                  </span>
                  <span className="applauncher__label">{panel.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
