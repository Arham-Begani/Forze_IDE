import { invokeCommand } from './tauri';

export interface GitStatusEntry {
  path: string;
  /** 2-char porcelain code, e.g. " M", "M ", "??", "A ", "AM". */
  code: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitStatusReport {
  repo_root: string;
  branch: string | null;
  ahead: number;
  behind: number;
  entries: GitStatusEntry[];
}

export function repoRoot(cwd: string): Promise<string> {
  return invokeCommand<string>('git_repo_root', { cwd });
}

export function status(cwd: string): Promise<GitStatusReport> {
  return invokeCommand<GitStatusReport>('git_status', { cwd });
}

export function currentBranch(cwd: string): Promise<string> {
  return invokeCommand<string>('git_current_branch', { cwd });
}

export function stage(cwd: string, paths: string[]): Promise<void> {
  return invokeCommand<void>('git_stage', { cwd, paths });
}

export function unstage(cwd: string, paths: string[]): Promise<void> {
  return invokeCommand<void>('git_unstage', { cwd, paths });
}

export function stageAll(cwd: string): Promise<void> {
  return invokeCommand<void>('git_stage_all', { cwd });
}

export function commit(cwd: string, message: string): Promise<string> {
  return invokeCommand<string>('git_commit', { cwd, message });
}

export interface GitCommit {
  hash: string;
  short: string;
  author: string;
  /** ISO-8601 author date. */
  date: string;
  subject: string;
  body: string;
}

/** The most recent commits on HEAD, newest first (clamped to 1–100). */
export function log(cwd: string, limit = 10): Promise<GitCommit[]> {
  return invokeCommand<GitCommit[]>('git_log', { cwd, limit });
}

export function diffFile(
  cwd: string,
  path: string,
  staged: boolean,
): Promise<string> {
  return invokeCommand<string>('git_diff_file', { cwd, path, staged });
}

/**
 * The full staged diff (`git diff --cached`) — the exact set of changes a commit
 * will record. Backs the pre-commit security review (Commit Guard).
 */
export function diffStaged(cwd: string): Promise<string> {
  return invokeCommand<string>('git_diff_staged', { cwd });
}

/**
 * The committed (HEAD) contents of a repo-relative file — the baseline for the
 * editor's live change gutter. Resolves to '' for files not in HEAD (new files)
 * so the whole buffer shows as added.
 */
export function fileHead(cwd: string, path: string): Promise<string> {
  return invokeCommand<string>('git_file_head', { cwd, path });
}

/**
 * The repo's `origin` remote URL, or null when there isn't one (or the folder
 * isn't a git repo). Used as a cross-device dedupe key when mirroring the
 * project list to the cloud. Runs through the generic `run_command` since it's
 * a one-shot read, not part of the hot status path.
 */
export async function remoteOriginUrl(cwd: string): Promise<string | null> {
  try {
    const out = await invokeCommand<{ stdout: string; exit_code: number }>(
      'run_command',
      { command: 'git config --get remote.origin.url', cwd, timeout_ms: 8000 },
    );
    const url = out.stdout.trim();
    return url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

/**
 * Push the current branch to its remote. Pass `setUpstream: true` for a branch
 * that has no tracking remote yet (`git push -u origin <branch>`). Resolves to
 * git's stderr text (empty on a clean push); rejects with git's message when the
 * push is rejected, so callers can toast it.
 */
export function push(cwd: string, setUpstream = false): Promise<string> {
  return invokeCommand<string>('git_push', { cwd, setUpstream });
}

/** Pull the current branch (merge/rebase per the user's config). */
export function pull(cwd: string): Promise<string> {
  return invokeCommand<string>('git_pull', { cwd });
}

/** Fetch all remotes and prune deleted remote branches (read-only). */
export function fetch(cwd: string): Promise<string> {
  return invokeCommand<string>('git_fetch', { cwd });
}

export interface GitBranches {
  /** The checked-out branch (or a detached-HEAD sha). */
  current: string;
  /** Local branch names, alphabetical. */
  local: string[];
  /** Remote-tracking branch names, e.g. "origin/main". */
  remote: string[];
}

/** List local + remote-tracking branches and mark the current one. */
export function branches(cwd: string): Promise<GitBranches> {
  return invokeCommand<GitBranches>('git_branches', { cwd });
}

/**
 * Switch to `branch`, or create it from HEAD when `create` is true. Rejects when
 * uncommitted changes would be overwritten (git refuses), so work is never lost.
 */
export function checkout(cwd: string, branch: string, create = false): Promise<void> {
  return invokeCommand<void>('git_checkout', { cwd, branch, create });
}

/**
 * Discard all uncommitted changes to one tracked file, reverting index + working
 * tree to HEAD. Untracked files aren't in HEAD — delete those via fs instead.
 */
export function restoreFile(cwd: string, path: string): Promise<void> {
  return invokeCommand<void>('git_restore_file', { cwd, path });
}

/**
 * The most recent tag reachable from HEAD (`git describe --tags --abbrev=0`), or
 * null when the repo has no tags yet. Runs through the generic `run_command` (no
 * new Rust command needed) since it's a one-shot read off the hot status path.
 */
export async function lastTag(cwd: string): Promise<string | null> {
  try {
    const out = await invokeCommand<{ stdout: string; exit_code: number }>('run_command', {
      command: 'git describe --tags --abbrev=0',
      cwd,
      timeout_ms: 8000,
    });
    const t = out.stdout.trim();
    return out.exit_code === 0 && t ? t : null;
  } catch {
    return null;
  }
}

/** The commit sha a ref points at (`git rev-list -n 1 <ref>`), or null. */
async function shaOf(cwd: string, ref: string): Promise<string | null> {
  try {
    const out = await invokeCommand<{ stdout: string; exit_code: number }>('run_command', {
      command: `git rev-list -n 1 ${ref}`,
      cwd,
      timeout_ms: 8000,
    });
    const s = out.stdout.trim();
    return out.exit_code === 0 && s ? s : null;
  } catch {
    return null;
  }
}

/**
 * Commits on HEAD since the last tag — the input to the Release Composer. Built
 * from the existing `git_log` (which spawns git directly, so no shell-quoting
 * pitfalls) sliced at the tag's commit, rather than a custom pretty-format over
 * the shell. When there's no tag, returns the recent history as the "first
 * release" set.
 */
export async function commitsSinceTag(
  cwd: string,
  max = 100,
): Promise<{ tag: string | null; commits: GitCommit[] }> {
  const tag = await lastTag(cwd);
  const recent = await log(cwd, max);
  if (!tag) return { tag: null, commits: recent };
  const tagSha = await shaOf(cwd, tag);
  if (!tagSha) return { tag, commits: recent };
  const idx = recent.findIndex((c) => c.hash === tagSha);
  return { tag, commits: idx === -1 ? recent : recent.slice(0, idx) };
}

export function describeStatus(entry: GitStatusEntry): string {
  if (entry.untracked) return 'Untracked';
  const labels: Record<string, string> = {
    'M ': 'Modified · staged',
    ' M': 'Modified',
    MM: 'Modified · partially staged',
    'A ': 'Added · staged',
    AM: 'Added · modified',
    'D ': 'Deleted · staged',
    ' D': 'Deleted',
    'R ': 'Renamed · staged',
    'C ': 'Copied · staged',
    'U ': 'Conflicted',
    '??': 'Untracked',
  };
  return labels[entry.code] ?? entry.code.trim();
}
