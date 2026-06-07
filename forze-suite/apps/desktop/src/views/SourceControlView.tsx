import {
  AlertTriangle,
  Check,
  GitBranch,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  describeStatus,
  stage as gitStage,
  stageAll as gitStageAll,
  unstage as gitUnstage,
  type GitStatusEntry,
} from '../lib/git';
import { partitionFindings } from '../lib/diffScan';
import type { SecretFinding } from '../lib/secretRules';
import { basename, dirname, joinPath } from '../lib/fs';
import { openFile } from '../workbench/actions';
import { guardedCommit, reviewStaged } from '../workbench/commitGuard';
import { useCommitGuard, type ReviewResult } from '../workbench/commitGuardStore';
import { useGitStatus } from '../workbench/gitStatusStore';
import { useProject } from '../workbench/projectStore';
import ToggleSwitch from '../shell/ToggleSwitch';
import { toast } from '../shell/toast';

export default function SourceControlView(): JSX.Element {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const isGitRepo = useProject((s) => s.isGitRepo);
  // Shared with the activity-rail badge so both reflect one poll and the badge
  // updates the instant an action here calls refresh().
  const report = useGitStatus((s) => s.report);
  const storeError = useGitStatus((s) => s.error);
  const refresh = useGitStatus((s) => s.refresh);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const error = actionError ?? storeError;

  // Refresh immediately when the panel opens; the rail's poller keeps it fresh.
  useEffect(() => {
    void refresh();
  }, [refresh, workspaceRoot, isGitRepo]);

  const openEntry = useCallback(
    (entry: GitStatusEntry) => {
      if (!workspaceRoot) return;
      // entry.path is repo-relative with `/`; split into segments so joinPath
      // produces a fully native path that matches how editor tabs are keyed.
      void openFile(joinPath(workspaceRoot, ...entry.path.split('/')));
    },
    [workspaceRoot],
  );

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
  const totalChanges = unstaged.length + untracked.length + staged.length;

  const handleCommit = async () => {
    if (!workspaceRoot || !message.trim() || !hasStaged) return;
    setBusy(true);
    try {
      // Routes through the Security Review gate when the toggle is on.
      const outcome = await guardedCommit(workspaceRoot, message.trim());
      if (outcome.blocked) {
        const why = outcome.message ?? 'Commit blocked by security review.';
        setActionError(why);
        toast(why, 'error');
      } else {
        setMessage('');
        setActionError(null);
        toast(`Committed ${outcome.hash?.slice(0, 7) ?? ''}`.trim(), 'success');
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scm">
      <header className="scm__bar">
        <GitBranch size={12} strokeWidth={2} />
        <span className="scm__branch">{report?.branch ?? 'detached'}</span>
        {report && (report.ahead > 0 || report.behind > 0) && (
          <span className="scm__sync">
            {report.ahead > 0 && `↑${report.ahead}`}
            {report.behind > 0 && ` ↓${report.behind}`}
          </span>
        )}
        <span className="scm__count">{totalChanges}</span>
        <button
          type="button"
          className="scm__icon-btn"
          onClick={refresh}
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </header>

      <CommitGuardPanel workspaceRoot={workspaceRoot} hasStaged={hasStaged} />

      <textarea
        className="scm__message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`Message (Ctrl+Enter to commit on "${report?.branch ?? 'HEAD'}")`}
        rows={2}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            void handleCommit();
          }
        }}
      />

      <div className="scm__actions">
        <button
          type="button"
          className="scm__commit"
          onClick={handleCommit}
          disabled={!hasStaged || busy || message.trim().length === 0}
          title="Commit staged changes"
        >
          <Check size={12} />
          Commit
        </button>
        <button
          type="button"
          className="scm__stage-all"
          onClick={async () => {
            if (!workspaceRoot) return;
            await gitStageAll(workspaceRoot);
            await refresh();
          }}
          disabled={totalChanges === 0}
          title="Stage all changes"
        >
          Stage All
        </button>
      </div>

      {error && <p className="scm__error">{error}</p>}

      {totalChanges === 0 && !error && (
        <p className="scm__empty">No changes — working tree clean.</p>
      )}

      <ChangeGroup
        title="Staged Changes"
        entries={staged}
        onOpen={openEntry}
        onAction={async (paths) => {
          if (!workspaceRoot) return;
          await gitUnstage(workspaceRoot, paths);
          await refresh();
        }}
        actionLabel="Unstage"
        actionIcon={<Minus size={12} />}
      />

      <ChangeGroup
        title="Changes"
        entries={unstaged}
        onOpen={openEntry}
        onAction={async (paths) => {
          if (!workspaceRoot) return;
          await gitStage(workspaceRoot, paths);
          await refresh();
        }}
        actionLabel="Stage"
        actionIcon={<Plus size={12} />}
      />

      <ChangeGroup
        title="Untracked"
        entries={untracked}
        onOpen={openEntry}
        onAction={async (paths) => {
          if (!workspaceRoot) return;
          await gitStage(workspaceRoot, paths);
          await refresh();
        }}
        actionLabel="Stage"
        actionIcon={<Plus size={12} />}
      />
    </div>
  );
}

interface ChangeGroupProps {
  title: string;
  entries: GitStatusEntry[];
  onOpen: (entry: GitStatusEntry) => void;
  onAction: (paths: string[]) => Promise<void>;
  actionLabel: string;
  actionIcon: JSX.Element;
}

/** Map a porcelain code to the diff tone that colours its status badge. */
function toneFor(entry: GitStatusEntry): 'added' | 'modified' | 'deleted' {
  if (entry.untracked) return 'added';
  const c = entry.code.trim();
  if (c.includes('D')) return 'deleted';
  if (c.includes('A')) return 'added';
  return 'modified';
}

/** The single status letter shown in the badge (VS Code-style). */
function statusLetter(entry: GitStatusEntry): string {
  if (entry.untracked) return 'U';
  return entry.code.trim()[0] ?? 'M';
}

function ChangeGroup({
  title,
  entries,
  onOpen,
  onAction,
  actionLabel,
  actionIcon,
}: ChangeGroupProps): JSX.Element | null {
  if (entries.length === 0) return null;

  return (
    <section className="scm__group">
      <header className="scm__group-head">
        <span>{title}</span>
        <span className="scm__group-count">{entries.length}</span>
        <button
          type="button"
          className="scm__icon-btn"
          onClick={() => onAction(entries.map((e) => e.path))}
          title={`${actionLabel} all`}
          aria-label={`${actionLabel} all`}
        >
          {actionIcon}
        </button>
      </header>

      {entries.map((entry) => {
        const tone = toneFor(entry);
        const dir = dirname(entry.path);
        return (
          <div
            key={`${entry.path}-${entry.code}`}
            className="scm__row"
            role="button"
            tabIndex={0}
            title={`${entry.path} · ${describeStatus(entry)}`}
            onClick={() => onOpen(entry)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(entry);
              }
            }}
          >
            <span className="scm__name">{basename(entry.path)}</span>
            {dir && <span className="scm__dir">{dir}</span>}
            <button
              type="button"
              className="scm__row-action"
              onClick={(e) => {
                e.stopPropagation();
                void onAction([entry.path]);
              }}
              title={actionLabel}
              aria-label={`${actionLabel} ${entry.path}`}
            >
              {actionIcon}
            </button>
            <span className={`scm__badge scm__badge--${tone}`}>{statusLetter(entry)}</span>
          </div>
        );
      })}
    </section>
  );
}

/**
 * Commit Guard controls: the Auto-commit and Security review toggles, the
 * progress toward the next auto-commit, and a summary of the last review.
 */
function CommitGuardPanel({
  workspaceRoot,
  hasStaged,
}: {
  workspaceRoot: string;
  hasStaged: boolean;
}): JSX.Element {
  const autoCommit = useCommitGuard((s) => s.autoCommitEnabled);
  const securityReview = useCommitGuard((s) => s.securityReviewEnabled);
  const threshold = useCommitGuard((s) => s.threshold);
  const pending = useCommitGuard((s) => s.pending);
  const busy = useCommitGuard((s) => s.busy);
  const lastReview = useCommitGuard((s) => s.lastReview);
  const setAutoCommit = useCommitGuard((s) => s.setAutoCommit);
  const setSecurityReview = useCommitGuard((s) => s.setSecurityReview);
  const setThreshold = useCommitGuard((s) => s.setThreshold);

  const [reviewing, setReviewing] = useState(false);
  const pct = Math.min(100, Math.round((pending / Math.max(1, threshold)) * 100));

  const runReview = async () => {
    setReviewing(true);
    try {
      await reviewStaged(workspaceRoot);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <section className="scm__guard">
      <div className="scm__guard-row">
        <span className="scm__guard-label">
          <Zap size={12} strokeWidth={2} />
          Auto-commit
          {busy && <Loader2 size={11} className="spin" />}
        </span>
        <ToggleSwitch
          checked={autoCommit}
          onChange={setAutoCommit}
          label="Auto-commit every N saved changes"
        />
      </div>
      {autoCommit && (
        <div className="scm__guard-detail">
          <div className="scm__guard-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="scm__guard-meta">
            <span>
              {pending} / {threshold} saved change{threshold === 1 ? '' : 's'}
            </span>
            <span className="scm__guard-step">
              <button
                type="button"
                onClick={() => setThreshold(threshold - 1)}
                disabled={threshold <= 1}
                aria-label="Lower threshold"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setThreshold(threshold + 1)}
                disabled={threshold >= 100}
                aria-label="Raise threshold"
              >
                +
              </button>
            </span>
          </div>
        </div>
      )}

      <div className="scm__guard-row">
        <span className="scm__guard-label">
          <ShieldCheck size={12} strokeWidth={2} />
          Security review
        </span>
        <ToggleSwitch
          checked={securityReview}
          onChange={setSecurityReview}
          label="Scan the staged diff for leaked secrets before committing"
        />
      </div>
      {securityReview && (
        <div className="scm__guard-detail">
          <ReviewSummary lastReview={lastReview} />
          <button
            type="button"
            className="scm__guard-review"
            onClick={runReview}
            disabled={!hasStaged || reviewing}
            title={hasStaged ? 'Scan the staged diff now' : 'Stage changes to review'}
          >
            {reviewing ? <Loader2 size={11} className="spin" /> : <ShieldCheck size={11} />}
            {reviewing ? 'Reviewing…' : 'Review staged'}
          </button>
        </div>
      )}
    </section>
  );
}

function ReviewSummary({ lastReview }: { lastReview: ReviewResult | null }): JSX.Element {
  if (!lastReview) {
    return (
      <p className="scm__guard-hint">
        Blocks a commit if an API key or secret appears in the staged diff.
      </p>
    );
  }
  const { blockers, warnings } = partitionFindings(lastReview.findings);
  if (lastReview.findings.length === 0) {
    return (
      <p className="scm__guard-clean">
        <Check size={11} /> Last review clean — nothing leaked.
      </p>
    );
  }
  return (
    <div className="scm__guard-findings">
      <p className={blockers.length > 0 ? 'scm__guard-bad' : 'scm__guard-warn'}>
        {blockers.length > 0 ? <ShieldAlert size={11} /> : <AlertTriangle size={11} />}
        {blockers.length > 0
          ? `${blockers.length} secret${blockers.length > 1 ? 's' : ''} block this commit`
          : `${warnings.length} warning${warnings.length > 1 ? 's' : ''} to review`}
      </p>
      {lastReview.findings.slice(0, 8).map((f, i) => (
        <div
          key={`${f.file}-${f.line}-${i}`}
          className={`scm__guard-finding is-${f.severity}`}
          title={f.excerpt}
        >
          <span className="scm__guard-rule">{f.rule}</span>
          <span className="scm__guard-loc">
            {f.file ? `${basename(f.file)}:${f.line}` : `L${f.line}`}
          </span>
        </div>
      ))}
    </div>
  );
}
