import { GripVertical, PanelRight, X } from 'lucide-react';
import { Suspense } from 'react';
import ErrorBoundary from './ErrorBoundary';
import PanelFallback from './PanelFallback';
import { PANELS } from '../workbench/panels';
import { isDockable, useWorkbench, type ActivityId } from '../workbench/store';

interface SidebarProps {
  /** Which dock this is. */
  side: 'left' | 'right';
  /** Panel to render. */
  panelId: ActivityId;
  onInsertCode?: (snippet: string) => void;
}

/**
 * Generic dock host. Renders any panel (core view or skill) with a slim bar
 * that doubles as a drag handle. Skills can be dragged — or one-click docked —
 * into the right sidebar; the right dock can be closed or sent back left.
 */
export default function Sidebar({ side, panelId, onInsertCode }: SidebarProps): JSX.Element {
  // Fall back to Explorer if asked for a panel that no longer exists (e.g. a
  // stale id from older persisted state). The store sanitizes on load, so this
  // is a belt-and-suspenders guard against ever dereferencing `undefined`.
  const panel = PANELS[panelId] ?? PANELS.explorer;
  const dockRight = useWorkbench((s) => s.dockRight);
  const undockRight = useWorkbench((s) => s.undockRight);
  const setActiveActivity = useWorkbench((s) => s.setActiveActivity);
  const setDraggingPanel = useWorkbench((s) => s.setDraggingPanel);

  const dockable = isDockable(panelId);
  const showTitle = side === 'right' || panel.group === 'skill';

  return (
    <div className="sidebar dockhost">
      <div
        className="dockhost__bar"
        draggable={dockable && side === 'left'}
        onDragStart={(e) => {
          if (!(dockable && side === 'left')) return;
          e.dataTransfer.setData('text/forze-panel', panelId);
          e.dataTransfer.effectAllowed = 'move';
          setDraggingPanel(panelId);
        }}
        onDragEnd={() => setDraggingPanel(null)}
        title={dockable && side === 'left' ? 'Drag to the right edge to dock' : undefined}
      >
        {dockable && side === 'left' && (
          <span className="dockhost__grip" aria-hidden>
            <GripVertical size={13} strokeWidth={1.8} />
          </span>
        )}
        <span className="dockhost__title">{showTitle ? panel.title : ''}</span>
        <span className="dockhost__spacer" />
        {dockable && side === 'left' && (
          <button
            type="button"
            className="dockhost__btn"
            title="Dock to right sidebar"
            onClick={() => dockRight(panelId)}
          >
            <PanelRight size={14} strokeWidth={1.8} />
          </button>
        )}
        {side === 'right' && (
          <>
            <button
              type="button"
              className="dockhost__btn"
              title="Move back to left sidebar"
              onClick={() => {
                undockRight();
                setActiveActivity(panelId);
              }}
            >
              <PanelRight size={14} strokeWidth={1.8} style={{ transform: 'scaleX(-1)' }} />
            </button>
            <button
              type="button"
              className="dockhost__btn"
              title="Close right sidebar"
              onClick={() => undockRight()}
            >
              <X size={14} strokeWidth={1.8} />
            </button>
          </>
        )}
      </div>
      <div className="dockhost__body">
        <ErrorBoundary scope={panel.title}>
          <Suspense fallback={<PanelFallback />}>
            {panel.group === 'skill' ? (
              panel.render({ onInsertCode: onInsertCode ?? (() => undefined) })
            ) : (
              <div className="dockhost__scroll">
                {panel.render({ onInsertCode: onInsertCode ?? (() => undefined) })}
              </div>
            )}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
