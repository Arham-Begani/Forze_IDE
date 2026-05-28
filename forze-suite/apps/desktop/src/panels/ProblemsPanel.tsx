import { AlertCircle, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { useDiagnostics, type DiagnosticEntry } from '../workbench/diagnosticsStore';
import { openFile } from '../workbench/actions';
import { useProject } from '../workbench/projectStore';
import { joinPath } from '../lib/fs';

export default function ProblemsPanel(): JSX.Element {
  const entries = useDiagnostics((s) => s.entries);
  const clear = useDiagnostics((s) => s.clear);
  const workspaceRoot = useProject((s) => s.workspaceRoot);

  const grouped = useMemo(() => groupByFile(entries), [entries]);

  if (entries.length === 0) {
    return (
      <div className="placeholder-view" style={{ height: '100%' }}>
        <AlertTriangle size={28} strokeWidth={1.4} />
        <h3>No problems detected</h3>
        <p>
          Runtime errors from the dev-server log stream show up here. Run your
          app from the terminal to start collecting diagnostics.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        background: 'var(--color-bg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          borderBottom: '1px solid var(--color-border)',
          fontSize: 11,
          color: 'var(--color-text-dim)',
        }}
      >
        <span>{entries.length} entries</span>
        <button
          type="button"
          onClick={clear}
          title="Clear problems"
          style={{
            marginLeft: 'auto',
            padding: 2,
            border: 'none',
            background: 'transparent',
            color: 'inherit',
          }}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {Object.entries(grouped).map(([file, list]) => (
        <FileGroup
          key={file}
          file={file}
          entries={list}
          onJump={async (entry) => {
            const candidate = resolvePath(workspaceRoot, entry.filePath);
            if (candidate) await openFile(candidate);
            // Phase 4 wires the actual cursor-jump via the editor handle.
          }}
        />
      ))}
    </div>
  );
}

function FileGroup({
  file,
  entries,
  onJump,
}: {
  file: string;
  entries: DiagnosticEntry[];
  onJump: (entry: DiagnosticEntry) => void | Promise<void>;
}): JSX.Element {
  return (
    <section>
      <header
        style={{
          padding: '6px 12px',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-dim)',
          background: 'var(--color-bg-elevated)',
        }}
      >
        {file}
      </header>
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onJump(entry)}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '6px 12px',
            border: 'none',
            borderBottom: '1px solid var(--color-border-subtle)',
            background: 'transparent',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            textAlign: 'left',
            cursor: 'pointer',
            borderRadius: 0,
          }}
        >
          <SeverityIcon severity={entry.severity} />
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {entry.message}
          </span>
          <span style={{ color: 'var(--color-text-dim)' }}>
            [{entry.line},{entry.column}]
          </span>
        </button>
      ))}
    </section>
  );
}

function SeverityIcon({ severity }: { severity: DiagnosticEntry['severity'] }): JSX.Element {
  const color =
    severity === 'error'
      ? 'var(--color-danger)'
      : severity === 'warning'
        ? 'var(--color-warn)'
        : 'var(--color-info)';
  const Icon = severity === 'error' ? AlertCircle : severity === 'warning' ? AlertTriangle : Info;
  return <Icon size={12} strokeWidth={2} style={{ color }} />;
}

function groupByFile(entries: DiagnosticEntry[]): Record<string, DiagnosticEntry[]> {
  return entries.reduce<Record<string, DiagnosticEntry[]>>((acc, entry) => {
    const existing = acc[entry.filePath];
    if (existing) {
      existing.push(entry);
    } else {
      acc[entry.filePath] = [entry];
    }
    return acc;
  }, {});
}

function resolvePath(workspaceRoot: string | null, filePath: string): string | null {
  if (!workspaceRoot) return null;
  if (/^([A-Za-z]:)?[/\\]/.test(filePath)) return filePath;
  return joinPath(workspaceRoot, filePath);
}
