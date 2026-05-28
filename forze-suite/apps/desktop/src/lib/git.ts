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

export function diffFile(
  cwd: string,
  path: string,
  staged: boolean,
): Promise<string> {
  return invokeCommand<string>('git_diff_file', { cwd, path, staged });
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
