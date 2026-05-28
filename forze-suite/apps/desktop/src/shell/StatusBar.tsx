import {
  AlertCircle,
  ChevronRight,
  GitBranch,
  House,
  Megaphone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { basename } from '../lib/fs';

interface StatusBarProps {
  workspaceRoot: string | null;
  branch: string | null;
  survivalScore: number | null;
  survivalBand: 'critical' | 'shaky' | 'steady' | 'strong';
  problemsCount: number;
  scheduledPostsCount: number;
  onOpenFolder: () => void;
  onShowProblems: () => void;
  onShowScore: () => void;
  onShowSocial: () => void;
}

export default function StatusBar({
  workspaceRoot,
  branch,
  survivalScore,
  survivalBand,
  problemsCount,
  scheduledPostsCount,
  onOpenFolder,
  onShowProblems,
  onShowScore,
  onShowSocial,
}: StatusBarProps): JSX.Element {
  const folderName = workspaceRoot ? basename(workspaceRoot) : null;
  const scoreChipClass =
    survivalBand === 'strong'
      ? 'is-ok'
      : survivalBand === 'critical'
        ? 'is-danger'
        : survivalBand === 'shaky'
          ? 'is-warn'
          : '';

  return (
    <footer className="status-bar" role="contentinfo">
      <button type="button" className="status-bar__crumb" onClick={onOpenFolder}>
        <House size={11} strokeWidth={1.8} />
        Home
      </button>
      <span className="status-bar__sep">
        <ChevronRight size={10} strokeWidth={1.8} />
      </span>
      <button type="button" className="status-bar__crumb" onClick={onOpenFolder}>
        Dev
      </button>
      {folderName && (
        <>
          <span className="status-bar__sep">
            <ChevronRight size={10} strokeWidth={1.8} />
          </span>
          <button
            type="button"
            className="status-bar__crumb"
            onClick={onOpenFolder}
            title={workspaceRoot ?? ''}
          >
            {folderName}
          </button>
        </>
      )}

      <div className="status-bar__spacer" />

      {branch && (
        <button type="button" className="status-bar__chip" title="Current branch">
          <GitBranch size={11} strokeWidth={1.8} />
          {branch}
        </button>
      )}

      <button
        type="button"
        className={`status-bar__chip ${problemsCount > 0 ? 'is-danger' : ''}`}
        onClick={onShowProblems}
        title="Problems"
      >
        <AlertCircle size={11} strokeWidth={1.8} />
        {problemsCount}
      </button>

      <button
        type="button"
        className="status-bar__chip"
        onClick={onShowSocial}
        title="Scheduled posts"
      >
        <Megaphone size={11} strokeWidth={1.8} />
        {scheduledPostsCount}
      </button>

      <button
        type="button"
        className={`status-bar__chip ${scoreChipClass}`}
        onClick={onShowScore}
        title="Venture Survival Score — click for breakdown"
      >
        <Sparkles size={11} strokeWidth={1.8} />
        Score {survivalScore ?? '—'}
      </button>

      <button type="button" className="status-bar__chip" title="Security">
        <ShieldCheck size={11} strokeWidth={1.8} />
        0
      </button>
    </footer>
  );
}
