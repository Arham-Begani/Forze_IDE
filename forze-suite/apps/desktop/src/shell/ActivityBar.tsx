import { useWorkbench } from '../workbench/store';
import { CORE_PANELS, SKILL_PANELS } from '../workbench/panels';

export default function ActivityBar(): JSX.Element {
  const activeActivity = useWorkbench((s) => s.activeActivity);
  const sidebarVisible = useWorkbench((s) => s.sidebarVisible);
  const rightPanel = useWorkbench((s) => s.rightPanel);
  const rightSidebarVisible = useWorkbench((s) => s.rightSidebarVisible);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);
  const openPage = useWorkbench((s) => s.openPage);
  const editorTabs = useWorkbench((s) => s.editorTabs);
  const activeTabId = useWorkbench((s) => s.activeTabId);

  const activePageId =
    editorTabs.find((t) => t.id === activeTabId)?.pageId ?? null;

  const renderItem = (
    panel: { id: typeof activeActivity; title: string; icon: typeof CORE_PANELS[number]['icon'] },
    isSkill = false,
  ) => {
    const Icon = panel.icon;
    let isActive: boolean;
    let onClick: () => void;
    if (isSkill) {
      // Skills open as full-area workspace tabs, not in the side dock.
      isActive = activePageId === panel.id;
      onClick = () => openPage(panel.id);
    } else {
      const dockedRight = rightPanel === panel.id && rightSidebarVisible;
      isActive = (activeActivity === panel.id && sidebarVisible) || dockedRight;
      onClick = () => setActiveActivity(panel.id);
    }
    return (
      <button
        key={panel.id}
        type="button"
        className={`rail__item ${isActive ? 'is-active' : ''}`}
        onClick={onClick}
        aria-label={panel.title}
      >
        <Icon size={17} strokeWidth={1.6} />
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
      {SKILL_PANELS.map((p) => renderItem(p, true))}
      <div className="rail__spacer" />
      {settings && renderItem(settings)}
    </nav>
  );
}
