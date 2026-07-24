import { useEffect, useMemo, useState } from 'react';
import { FileDiff, Loader2 } from 'lucide-react';
import { diffFile } from '../lib/git';
import { diffStat, parseDiffRows, type DiffRow } from '../lib/diffView';

/**
 * Read-only unified diff editor tab (VS Code "dirty diff" style). Revives the
 * long-dead `git_diff_file` command — it existed in the Rust backend but had no
 * caller and no viewer. Renders the working-tree or staged diff for one file with
 * a two-column line gutter, added/removed colouring, and a staged/working toggle.
 *
 * Styling is inline + a single scoped <style> block rather than a CSS partial so
 * the component is self-contained (no touch to the ordered styles/*.css build)
 * and reads correctly in both the dark and Daylight themes via low-alpha tints.
 */

interface DiffViewProps {
  cwd: string;
  /** Repo-relative path (forward slashes). */
  relPath: string;
  /** Start on the staged diff (true) or the working-tree diff (false). */
  staged: boolean;
}

export default function DiffView({ cwd, relPath, staged }: DiffViewProps): JSX.Element {
  const [showStaged, setShowStaged] = useState(staged);
  const [diff, setDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    diffFile(cwd, relPath, showStaged)
      .then((text) => {
        if (!cancelled) setDiff(text);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, relPath, showStaged]);

  const rows = useMemo(() => (diff ? parseDiffRows(diff) : []), [diff]);
  const stat = useMemo(() => diffStat(rows), [rows]);

  return (
    <div className="dv">
      <style>{DV_CSS}</style>
      <header className="dv__bar">
        <FileDiff size={13} strokeWidth={2} />
        <span className="dv__path">{relPath}</span>
        {(stat.added > 0 || stat.removed > 0) && (
          <span className="dv__stat">
            <span className="dv__stat-add">+{stat.added}</span>
            <span className="dv__stat-del">−{stat.removed}</span>
          </span>
        )}
        <div className="dv__toggle" role="tablist" aria-label="Diff source">
          <button
            type="button"
            role="tab"
            aria-selected={!showStaged}
            className={!showStaged ? 'is-active' : ''}
            onClick={() => setShowStaged(false)}
          >
            Working
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={showStaged}
            className={showStaged ? 'is-active' : ''}
            onClick={() => setShowStaged(true)}
          >
            Staged
          </button>
        </div>
      </header>

      <div className="dv__body">
        {loading ? (
          <div className="dv__msg">
            <Loader2 size={16} className="spin" /> Loading diff…
          </div>
        ) : error ? (
          <div className="dv__msg dv__msg--error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="dv__msg">
            No {showStaged ? 'staged' : 'working-tree'} changes for this file.
          </div>
        ) : (
          <div className="dv__rows" role="table">
            {rows.map((row, i) => (
              <DiffLine key={i} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffLine({ row }: { row: DiffRow }): JSX.Element {
  if (row.type === 'hunk') {
    return (
      <div className="dv__row dv__row--hunk" role="row">
        <span className="dv__gutter" aria-hidden />
        <span className="dv__gutter" aria-hidden />
        <span className="dv__sign" aria-hidden />
        <span className="dv__text">{row.text}</span>
      </div>
    );
  }
  const sign = row.type === 'add' ? '+' : row.type === 'del' ? '−' : '';
  return (
    <div className={`dv__row dv__row--${row.type}`} role="row">
      <span className="dv__gutter">{row.oldLine ?? ''}</span>
      <span className="dv__gutter">{row.newLine ?? ''}</span>
      <span className="dv__sign" aria-hidden>
        {sign}
      </span>
      <span className="dv__text">{row.text === '' ? ' ' : row.text}</span>
    </div>
  );
}

const DV_CSS = `
.dv { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.dv__bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; border-bottom: 1px solid var(--border, rgba(128,128,128,0.22));
  font-size: 12px; flex: 0 0 auto;
}
.dv__path { font-weight: 600; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dv__stat { display: inline-flex; gap: 6px; font-variant-numeric: tabular-nums; }
.dv__stat-add { color: #2ea043; }
.dv__stat-del { color: #f85149; }
.dv__toggle { margin-left: auto; display: inline-flex; border: 1px solid var(--border, rgba(128,128,128,0.3)); border-radius: 6px; overflow: hidden; }
.dv__toggle button {
  padding: 2px 10px; font-size: 11px; background: transparent; color: inherit;
  border: 0; cursor: pointer; opacity: 0.6;
}
.dv__toggle button.is-active { background: rgba(128,128,128,0.18); opacity: 1; font-weight: 600; }
.dv__body { flex: 1 1 auto; overflow: auto; }
.dv__msg { padding: 24px; opacity: 0.7; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.dv__msg--error { color: #f85149; white-space: pre-wrap; }
.dv__rows {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px; line-height: 1.55;
}
.dv__row { display: flex; align-items: baseline; white-space: pre; }
.dv__gutter {
  flex: 0 0 auto; width: 46px; text-align: right; padding: 0 8px;
  opacity: 0.4; user-select: none; font-variant-numeric: tabular-nums;
}
.dv__sign { flex: 0 0 auto; width: 16px; text-align: center; user-select: none; }
.dv__text { flex: 1 1 auto; padding-right: 16px; overflow-wrap: anywhere; white-space: pre-wrap; }
.dv__row--add { background: rgba(46,160,67,0.14); }
.dv__row--add .dv__sign { color: #2ea043; }
.dv__row--del { background: rgba(248,81,73,0.14); }
.dv__row--del .dv__sign { color: #f85149; }
.dv__row--hunk { background: rgba(128,128,128,0.10); opacity: 0.75; font-size: 11.5px; }
.dv__row--hunk .dv__text { opacity: 0.8; }
`;
