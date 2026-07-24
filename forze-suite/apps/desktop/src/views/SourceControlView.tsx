import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  GitBranch,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  branches as gitBranches,
  checkout as gitCheckout,
  describeStatus,
  fetch as gitFetch,
  pull as gitPull,
  push as gitPush,
  restoreFile as gitRestoreFile,
  stage as gitStage,
  stageAll as gitStageAll,
  unstage as gitUnstage,
  type GitBranches,
  type GitStatusEntry,
} from '../lib/git';
import { partitionFindings } from '../lib/diffScan';
import { basename, dirname, joinPath } from '../lib/fs';
import { deleteEntry, openDiff, openFile } from '../workbench/actions';
import { guardedCommit, reviewStaged } from '../workbench/commitGuard';
import { useCommitGuard, type ReviewResult } from '../workbench/commitGuardStore';
import { useGitStatus } from '../workbench/gitStatusStore';
import { useProject } from '../workbench/projectStore';
import { confirmModal, promptModal } from '../shell/modal';
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

  // Which remote/branch op is running, for spinner + disabled state.
  const [remoteBusy, setRemoteBusy] = useState<string | null>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchList, setBranchList] = useState<GitBranches | null>(null);

  // entry.path is repo-relative with `/`; split into segments so joinPath
  // produces a fully native path that matches how editor tabs are keyed.
  const absOf = useCallback(
    (entry: GitStatusEntry) =>
      workspaceRoot ? joinPath(workspaceRoot, ...entry.path.split('/')) : '',
    [workspaceRoot],
  );

  // VS Code-style: clicking a tracked change opens its diff; untracked files
  // have no diff to show, so open the file itself.
  const openStaged = useCallback(
    (entry: GitStatusEntry) => openDiff(entry.path, true),
    [],
  );
  const openWorking = useCallback(
    (entry: GitStatusEntry) => {
      if (entry.untracked) void openFile(absOf(entry));
      else openDiff(entry.path, false);
    },
    [absOf],
  );

  const discardTracked = useCallback(
    async (entry: GitStatusEntry) => {
      if (!workspaceRoot) return;
      const ok = await confirmModal({
        title: 'Discard changes',
        message: `Discard all changes to "${entry.path}"? This reverts it to the last commit and cannot be undone.`,
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!ok) return;
      try {
        await gitRestoreFile(workspaceRoot, entry.path);
        await refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
      }
    },
    [workspaceRoot, refresh],
  );

  const discardUntracked = useCallback(
    async (entry: GitStatusEntry) => {
      if (!workspaceRoot) return;
      const ok = await confirmModal({
        title: 'Delete untracked file',
        message: `Delete "${entry.path}"? It isn't tracked by git, so this permanently removes it.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteEntry(absOf(entry));
        await refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
      }
    },
    [workspaceRoot, absOf, refresh],
  );

  const runRemote = useCallback(
    async (label: string, fn: () => Promise<unknown>, done: string) => {
      if (!workspaceRoot) return;
      setRemoteBusy(label);
      setActionError(null);
      try {
        await fn();
        toast(done, 'success');
        await refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setActionError(msg);
        toast(msg, 'error');
      } finally {
        setRemoteBusy(null);
      }
    },
    [workspaceRoot, refresh],
  );

  const openBranchMenu = useCallback(async () => {
    if (!workspaceRoot) return;
    setBranchMenuOpen((v) => !v);
    try {
      setBranchList(await gitBranches(workspaceRoot));
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  }, [workspaceRoot]);

  const switchBranch = useCallback(
    async (name: string, create: boolean) => {
      if (!workspaceRoot) return;
      setBranchMenuOpen(false);
      await runRemote(
        'checkout',
        () => gitCheckout(workspaceRoot, name, create),
        create ? `Created ${name}` : `Switched to ${name}`,
      );
    },
    [workspaceRoot, runRemote],
  );

  const createBranch = useCallback(async () => {
    const name = await promptModal({
      title: 'New branch',
      message: 'Name the new branch (created from the current HEAD):',
      placeholder: 'feature/my-change',
      confirmLabel: 'Create',
    });
    if (name && name.trim()) await switchBranch(name.trim(), true);
  }, [switchBranch]);

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
      // Always routes through the security review gate.
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
        <div style={{ position: 'relative', display: 'flex', minWidth: 0 }}>
          <button
            type="button"
            className="scm__branch-btn"
            onClick={openBranchMenu}
            title="Switch branch"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: 0,
              color: 'inherit',
              cursor: 'pointer',
              font: 'inherit',
              padding: '2px 4px',
              borderRadius: 5,
              minWidth: 0,
            }}
          >
            <GitBranch size={12} strokeWidth={2} />
            <span
              className="scm__branch"
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {report?.branch ?? 'detached'}
            </span>
            <ChevronDown size={11} style={{ opacity: 0.6, flex: '0 0 auto' }} />
          </button>
          {branchMenuOpen && (
            <BranchMenu
              list={branchList}
              current={report?.branch ?? null}
              onPick={(name) => switchBranch(name, false)}
              onCreate={createBranch}
              onClose={() => setBranchMenuOpen(false)}
            />
          )}
        </div>

        {report && (report.ahead > 0 || report.behind > 0) && (
          <span className="scm__sync">
            {report.ahead > 0 && `↑${report.ahead}`}
            {report.behind > 0 && ` ↓${report.behind}`}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
          <button
            type="button"
            className="scm__icon-btn"
            onClick={() =>
              runRemote(
                'pull',
                () => gitPull(workspaceRoot),
                report && report.behind > 0 ? 'Pulled' : 'Already up to date',
              )
            }
            disabled={remoteBusy !== null}
            title={report && report.behind > 0 ? `Pull ${report.behind}` : 'Pull'}
            aria-label="Pull"
          >
            {remoteBusy === 'pull' ? (
              <Loader2 size={12} className="spin" />
            ) : (
              <ArrowDownToLine size={12} />
            )}
          </button>
          <button
            type="button"
            className="scm__icon-btn"
            onClick={() =>
              runRemote(
                'push',
                async () => {
                  try {
                    await gitPush(workspaceRoot, false);
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    // A brand-new branch has no upstream yet — set it and retry.
                    if (/upstream|set-upstream/i.test(msg)) {
                      await gitPush(workspaceRoot, true);
                    } else {
                      throw err;
                    }
                  }
                },
                'Pushed',
              )
            }
            disabled={remoteBusy !== null}
            title={report && report.ahead > 0 ? `Push ${report.ahead}` : 'Push'}
            aria-label="Push"
          >
            {remoteBusy === 'push' ? (
              <Loader2 size={12} className="spin" />
            ) : (
              <ArrowUpFromLine size={12} />
            )}
          </button>
          <button
            type="button"
            className="scm__icon-btn"
            onClick={() => runRemote('fetch', () => gitFetch(workspaceRoot), 'Fetched')}
            disabled={remoteBusy !== null}
            title="Fetch"
            aria-label="Fetch"
          >
            {remoteBusy === 'fetch' ? (
              <Loader2 size={12} className="spin" />
            ) : (
              <RefreshCw size={12} />
            )}
          </button>
          <span className="scm__count">{totalChanges}</span>
        </div>
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
        onOpen={openStaged}
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
        onOpen={openWorking}
        onDiscard={discardTracked}
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
        onOpen={openWorking}
        onDiscard={discardUntracked}
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
  /** When set, each row gets a "discard changes" affordance. */
  onDiscard?: (entry: GitStatusEntry) => void;
  actionLabel: string;
  actionIcon: JSX.Element;
}

/**
 * Branch switcher popover: local + remote-tracking branches, plus "New branch".
 * Absolutely positioned under the branch button; closes on outside click.
 */
function BranchMenu({
  list,
  current,
  onPick,
  onCreate,
  onClose,
}: {
  list: GitBranches | null;
  current: string | null;
  onPick: (name: string) => void;
  onCreate: () => void;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const el = e.target as HTMLElement;
      if (!el.closest('.scm__branch-menu') && !el.closest('.scm__branch-btn')) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      className="scm__branch-menu"
      role="menu"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 4,
        minWidth: 220,
        maxHeight: 320,
        overflow: 'auto',
        zIndex: 40,
        background: 'var(--panel, #1b1b1f)',
        border: '1px solid var(--border, rgba(128,128,128,0.3))',
        borderRadius: 8,
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        padding: 4,
        fontSize: 12,
      }}
    >
      <button type="button" className="scm__branch-item" role="menuitem" onClick={onCreate} style={BRANCH_ITEM}>
        <Plus size={12} /> New branch…
      </button>
      {list === null ? (
        <div style={{ padding: '8px 10px', opacity: 0.6 }}>
          <Loader2 size={12} className="spin" /> Loading branches…
        </div>
      ) : (
        <>
          {list.local.length > 0 && <div style={BRANCH_HEADING}>Local</div>}
          {list.local.map((name) => (
            <button
              key={`l:${name}`}
              type="button"
              className="scm__branch-item"
              role="menuitem"
              onClick={() => onPick(name)}
              disabled={name === current}
              style={{ ...BRANCH_ITEM, opacity: name === current ? 0.5 : 1 }}
            >
              <GitBranch size={12} /> {name}
              {name === current && <Check size={12} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
          {list.remote.length > 0 && <div style={BRANCH_HEADING}>Remote</div>}
          {list.remote.map((name) => (
            <button
              key={`r:${name}`}
              type="button"
              className="scm__branch-item"
              role="menuitem"
              onClick={() => onPick(name)}
              style={BRANCH_ITEM}
            >
              <GitBranch size={12} style={{ opacity: 0.6 }} /> {name}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

const BRANCH_ITEM: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  padding: '6px 10px',
  background: 'transparent',
  border: 0,
  borderRadius: 6,
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
};

const BRANCH_HEADING: CSSProperties = {
  padding: '6px 10px 2px',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  opacity: 0.5,
};

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
  onDiscard,
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
            {onDiscard && (
              <button
                type="button"
                className="scm__row-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscard(entry);
                }}
                title="Discard changes"
                aria-label={`Discard ${entry.path}`}
              >
                <RotateCcw size={12} />
              </button>
            )}
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
 * Commit Guard controls: the Auto-commit toggle and the progress toward the
 * next auto-commit, plus the always-on security review (last-review summary and
 * an on-demand "Review staged" action).
 */
function CommitGuardPanel({
  workspaceRoot,
  hasStaged,
}: {
  workspaceRoot: string;
  hasStaged: boolean;
}): JSX.Element {
  const autoCommit = useCommitGuard((s) => s.autoCommitEnabled);
  const threshold = useCommitGuard((s) => s.threshold);
  const pending = useCommitGuard((s) => s.pending);
  const busy = useCommitGuard((s) => s.busy);
  const lastReview = useCommitGuard((s) => s.lastReview);
  const setAutoCommit = useCommitGuard((s) => s.setAutoCommit);
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
          <span className="scm__guard-always" title="The staged diff is scanned for leaked secrets before every commit. This can't be turned off.">
            always on
          </span>
        </span>
      </div>
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
