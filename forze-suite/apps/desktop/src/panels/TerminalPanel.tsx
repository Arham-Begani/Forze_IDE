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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-elevated)',
          }}
        >
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`bottom-panel__tab ${
                session.id === activeId ? 'is-active' : ''
              }`}
              style={{ height: 22, padding: '0 8px' }}
              onClick={() => setActiveTerminal(session.id)}
            >
              {session.title}
              <span
                style={{
                  marginLeft: 6,
                  opacity: 0.6,
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(session.id);
                }}
              >
                <X size={10} />
              </span>
            </button>
          ))}
          <button
            type="button"
            className="bottom-panel__icon-btn"
            title="New terminal"
            onClick={() => createTerminal(workspaceRoot ?? null)}
            style={{ marginLeft: 'auto' }}
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
