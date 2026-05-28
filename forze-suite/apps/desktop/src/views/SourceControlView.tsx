import { Check, GitBranch, Minus, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  commit as gitCommit,
  describeStatus,
  stage as gitStage,
  stageAll as gitStageAll,
  status as gitStatus,
  unstage as gitUnstage,
  type GitStatusEntry,
  type GitStatusReport,
} from '../lib/git';
import { useProject } from '../workbench/projectStore';

export default function SourceControlView(): JSX.Element {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const isGitRepo = useProject((s) => s.isGitRepo);
  const [report, setReport] = useState<GitStatusReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!workspaceRoot || !isGitRepo) return;
    try {
      setReport(await gitStatus(workspaceRoot));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [workspaceRoot, isGitRepo]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!workspaceRoot) {
    return (
      <div className="placeholder-view">
        <GitBranch size={28} strokeWidth={1.4} />
        <h3>No workspace</h3>
        <p>Open a folder to view source control.</p>
      </div>
    );
  }

  if (!isGitRepo) {
    return (
      <div className="placeholder-view">
        <GitBranch size={28} strokeWidth={1.4} />
        <h3>Not a git repository</h3>
        <p>
          Run <code>git init</code> in the workspace, then refresh from the
          command palette.
        </p>
      </div>
    );
  }

  const staged = report?.entries.filter((e) => e.staged && !e.untracked) ?? [];
  const unstaged = report?.entries.filter((e) => e.unstaged && !e.untracked) ?? [];
  const untracked = report?.entries.filter((e) => e.untracked) ?? [];
  const hasStaged = staged.length > 0;

  const handleCommit = async () => {
    if (!workspaceRoot || !message.trim() || !hasStaged) return;
    setBusy(true);
    try {
      await gitCommit(workspaceRoot, message.trim());
      setMessage('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-dim)',
        }}
      >
        <GitBranch size={12} strokeWidth={2} />
        <span style={{ color: 'var(--color-text)' }}>{report?.branch ?? 'detached'}</span>
        {report && (report.ahead > 0 || report.behind > 0) && (
          <span style={{ fontSize: 11 }}>
            {report.ahead > 0 && `↑${report.ahead}`} {report.behind > 0 && `↓${report.behind}`}
          </span>
        )}
        <button
          type="button"
          onClick={refresh}
          title="Refresh"
          aria-label="Refresh"
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

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message (Ctrl+Enter to commit)"
        rows={3}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            void handleCommit();
          }
        }}
        style={{ width: '100%', fontFamily: 'inherit', fontSize: 12 }}
      />

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={handleCommit}
          disabled={!hasStaged || busy || message.trim().length === 0}
          title="Commit staged changes"
        >
          <Check size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
          Commit
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!workspaceRoot) return;
            await gitStageAll(workspaceRoot);
            await refresh();
          }}
          title="Stage all changes"
        >
          Stage All
        </button>
      </div>

      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 11 }}>{error}</p>
      )}

      <ChangeGroup
        title={`Staged Changes (${staged.length})`}
        entries={staged}
        onAction={async (paths) => {
          if (!workspaceRoot) return;
          await gitUnstage(workspaceRoot, paths);
          await refresh();
        }}
        actionLabel="Unstage"
        actionIcon={<Minus size={12} />}
        tone="ok"
      />

      <ChangeGroup
        title={`Changes (${unstaged.length})`}
        entries={unstaged}
        onAction={async (paths) => {
          if (!workspaceRoot) return;
          await gitStage(workspaceRoot, paths);
          await refresh();
        }}
        actionLabel="Stage"
        actionIcon={<Plus size={12} />}
        tone="warn"
      />

      {untracked.length > 0 && (
        <ChangeGroup
          title={`Untracked (${untracked.length})`}
          entries={untracked}
          onAction={async (paths) => {
            if (!workspaceRoot) return;
            await gitStage(workspaceRoot, paths);
            await refresh();
          }}
          actionLabel="Stage"
          actionIcon={<Plus size={12} />}
          tone="info"
        />
      )}
    </div>
  );
}

interface ChangeGroupProps {
  title: string;
  entries: GitStatusEntry[];
  onAction: (paths: string[]) => Promise<void>;
  actionLabel: string;
  actionIcon: JSX.Element;
  tone: 'ok' | 'warn' | 'info';
}

function ChangeGroup({
  title,
  entries,
  onAction,
  actionLabel,
  actionIcon,
  tone,
}: ChangeGroupProps): JSX.Element | null {
  if (entries.length === 0) return null;

  const toneColor = {
    ok: 'var(--color-ok)',
    warn: 'var(--color-warn)',
    info: 'var(--color-info)',
  }[tone];

  return (
    <section>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'var(--color-text-dim)',
          marginBottom: 4,
        }}
      >
        <span>{title}</span>
        <button
          type="button"
          onClick={() => onAction(entries.map((e) => e.path))}
          title={`${actionLabel} all`}
          style={{
            marginLeft: 'auto',
            padding: 2,
            border: 'none',
            background: 'transparent',
            color: 'inherit',
          }}
        >
          {actionIcon}
        </button>
      </header>

      {entries.map((entry) => (
        <div
          key={`${entry.path}-${entry.code}`}
          className="finding"
          style={{
            gridTemplateColumns: 'auto 1fr auto auto',
            borderBottom: '1px solid var(--color-border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
          }}
        >
          <span style={{ color: toneColor, width: 24 }}>{entry.code}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {entry.path}
          </span>
          <span style={{ color: 'var(--color-text-dim)', fontSize: 10 }}>
            {describeStatus(entry)}
          </span>
          <button
            type="button"
            onClick={() => onAction([entry.path])}
            style={{ padding: '2px 6px', fontSize: 10 }}
            title={actionLabel}
          >
            {actionIcon}
          </button>
        </div>
      ))}
    </section>
  );
}
