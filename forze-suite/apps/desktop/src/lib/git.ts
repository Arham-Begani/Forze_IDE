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
