import '@xterm/xterm/css/xterm.css';
import { Plus, X } from 'lucide-react';
import { useEffect } from 'react';
import { useProject } from '../workbench/projectStore';
import { useTerminals } from '../workbench/terminalStore';
import XtermView from './XtermView';

export default function TerminalPanel(): JSX.Element {
  const sessions = useTerminals((s) => s.sessions);
  const activeId = useTerminals((s) => s.activeId);
  const createTerminal = useTerminals((s) => s.createTerminal);
  const closeTerminal = useTerminals((s) => s.closeTerminal);
  const setActiveTerminal = useTerminals((s) => s.setActiveTerminal);
  const workspaceRoot = useProject((s) => s.workspaceRoot);

  // Open one terminal automatically the first time the panel mounts.
  useEffect(() => {
    if (sessions.length === 0) {
      createTerminal(workspaceRoot ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {sessions.length > 1 && (
        <div className="term-strip" role="tablist" aria-label="Terminals">
          {sessions.map((session) => (
            <div
              key={session.id}
              role="tab"
              aria-selected={session.id === activeId}
              tabIndex={0}
              className={`term-strip__tab ${
                session.id === activeId ? 'is-active' : ''
              }`}
              onClick={() => setActiveTerminal(session.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTerminal(session.id);
                }
              }}
            >
              <span className="term-strip__dot" aria-hidden />
              {session.title}
              <button
                type="button"
                className="term-strip__close"
                aria-label={`Close ${session.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(session.id);
                }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="bottom-panel__icon-btn term-strip__new"
            title="New terminal"
            onClick={() => createTerminal(workspaceRoot ?? null)}
          >
            <Plus size={14} />
          </button>
        </div>
      )}

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {sessions.map((session) => (
          <XtermView
            key={session.id}
            session={session}
            visible={session.id === activeId}
          />
        ))}
        {sessions.length === 1 && (
          <button
            type="button"
            className="bottom-panel__icon-btn"
            title="New terminal"
            onClick={() => createTerminal(workspaceRoot ?? null)}
            style={{ position: 'absolute', top: 6, right: 10, zIndex: 2 }}
          >
            <Plus size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
