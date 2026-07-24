import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Loader2,
  Regex,
  Replace,
  Search,
  WholeWord,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildMatcher,
  searchWorkspace,
  type FileResult,
  type SearchMatch,
  type SearchOptions,
  type SearchToken,
} from '../lib/search';
import { basename, readFile, writeFile } from '../lib/fs';
import { openFile } from '../workbench/actions';
import { useProject } from '../workbench/projectStore';
import { useReveal } from '../workbench/reveal';
import { confirmModal } from '../shell/modal';
import { toast } from '../shell/toast';

const DEBOUNCE_MS = 250;
const MAX_MATCHES = 5000;

type Status = 'idle' | 'searching' | 'done';

export default function SearchView(): JSX.Element {
  const workspaceRoot = useProject((s) => s.workspaceRoot);
  const [query, setQuery] = useState('');
  const [opts, setOpts] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const [results, setResults] = useState<FileResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceValue, setReplaceValue] = useState('');
  const [replacing, setReplacing] = useState(false);

  const tokenRef = useRef<SearchToken>({ cancelled: false });

  const run = useCallback(
    async (q: string, options: SearchOptions, root: string | null) => {
      // Cancel any in-flight search.
      tokenRef.current.cancelled = true;
      const token: SearchToken = { cancelled: false };
      tokenRef.current = token;

      setResults([]);
      setMatchCount(0);
      setError(null);
      setCollapsed(new Set());

      if (!q) {
        setStatus('idle');
        return;
      }
      if (!root) {
        setStatus('done');
        setError('Open a folder to search.');
        return;
      }

      setStatus('searching');
      const acc: FileResult[] = [];
      let total = 0;
      const { error: err } = await searchWorkspace(root, q, options, {
        token,
        maxMatches: MAX_MATCHES,
        onFile: (file) => {
          if (token.cancelled) return;
          acc.push(file);
          total += file.matches.reduce((n, m) => n + m.ranges.length, 0);
          // Cheap progressive render; result counts stay modest after caps.
          setResults([...acc]);
          setMatchCount(total);
        },
      });

      if (token.cancelled) return;
      if (err) setError(err);
      setStatus('done');
    },
    [],
  );

  // Debounced trigger.
  useEffect(() => {
    const id = window.setTimeout(() => {
      void run(query.trim(), opts, workspaceRoot);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query, opts, workspaceRoot, run]);

  // Cancel on unmount.
  useEffect(() => () => void (tokenRef.current.cancelled = true), []);

  const openMatch = useCallback(async (path: string, line: number) => {
    await openFile(path);
    useReveal.getState().reveal(path, line);
  }, []);

  const toggleFile = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const toggleOpt = (key: keyof SearchOptions) =>
    setOpts((o) => ({ ...o, [key]: !o[key] }));

  /**
   * Replace every match across the workspace. Re-reads each file fresh and runs
   * the same matcher (not the possibly-stale preview ranges), so the write is
   * always correct. Literal replacements escape `$` so it isn't read as a
   * capture-group reference; regex mode leaves `$1` etc. intact.
   */
  const replaceAll = useCallback(async () => {
    const q = query.trim();
    if (!q || !workspaceRoot || results.length === 0) return;
    const built = buildMatcher(q, opts);
    if ('error' in built) {
      toast(built.error, 'error');
      return;
    }
    const ok = await confirmModal({
      title: 'Replace in files',
      message: `Replace ${matchCount} occurrence${matchCount === 1 ? '' : 's'} across ${
        results.length
      } file${results.length === 1 ? '' : 's'} with "${replaceValue}"? This writes to disk and can't be undone.`,
      confirmLabel: 'Replace All',
      danger: true,
    });
    if (!ok) return;

    setReplacing(true);
    const project = useProject.getState();
    const replacement = opts.regex ? replaceValue : replaceValue.replace(/\$/g, '$$$$');
    let filesChanged = 0;
    try {
      for (const file of results) {
        let content: string;
        try {
          content = await readFile(file.path);
        } catch {
          continue;
        }
        // Fresh regex per file so `lastIndex` state never leaks between files.
        const re = new RegExp(built.regex.source, built.regex.flags);
        const next = content.replace(re, replacement);
        if (next !== content) {
          await writeFile(file.path, next);
          if (project.buffers.has(file.path)) project.setBuffer(file.path, next);
          filesChanged += 1;
        }
      }
      toast(`Replaced in ${filesChanged} file${filesChanged === 1 ? '' : 's'}`, 'success');
      void run(q, opts, workspaceRoot); // re-search so the panel reflects reality
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setReplacing(false);
    }
  }, [query, workspaceRoot, results, opts, matchCount, replaceValue, run]);

  return (
    <div className="search-view">
      <div className="search-view__head">
        <div className="search-view__field">
          <Search size={13} strokeWidth={1.8} className="search-view__icon" />
          <input
            className="search-view__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspace…"
            spellCheck={false}
            autoFocus
            aria-label="Search workspace"
          />
          {query && (
            <button
              type="button"
              className="search-view__clear"
              title="Clear"
              onClick={() => setQuery('')}
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="search-view__opts">
          <OptToggle
            active={opts.caseSensitive}
            title="Match case"
            onClick={() => toggleOpt('caseSensitive')}
          >
            <CaseSensitive size={14} />
          </OptToggle>
          <OptToggle
            active={opts.wholeWord}
            title="Match whole word"
            onClick={() => toggleOpt('wholeWord')}
          >
            <WholeWord size={14} />
          </OptToggle>
          <OptToggle
            active={opts.regex}
            title="Use regular expression"
            onClick={() => toggleOpt('regex')}
          >
            <Regex size={14} />
          </OptToggle>
          <OptToggle
            active={replaceOpen}
            title="Toggle Replace"
            onClick={() => setReplaceOpen((v) => !v)}
          >
            <Replace size={14} />
          </OptToggle>
        </div>

        {replaceOpen && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              padding: '2px 8px 8px',
            }}
          >
            <input
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              placeholder="Replace"
              spellCheck={false}
              aria-label="Replace with"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '5px 8px',
                fontSize: 12,
                color: 'inherit',
                background: 'rgba(128,128,128,0.14)',
                border: '1px solid var(--border, rgba(128,128,128,0.25))',
                borderRadius: 5,
                outline: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void replaceAll();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void replaceAll()}
              disabled={replacing || matchCount === 0 || status === 'searching'}
              title="Replace all across the workspace"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: 'inherit',
                background: 'rgba(128,128,128,0.16)',
                border: '1px solid var(--border, rgba(128,128,128,0.25))',
                borderRadius: 5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {replacing ? <Loader2 size={12} className="spin" /> : <Replace size={12} />}
              Replace All
            </button>
          </div>
        )}
      </div>

      <div className="search-view__status">
        {error ? (
          <span style={{ color: 'var(--color-danger)' }}>{error}</span>
        ) : status === 'searching' ? (
          <span>Searching…{matchCount > 0 ? ` ${matchCount} so far` : ''}</span>
        ) : status === 'done' && query ? (
          <span>
            {matchCount === 0
              ? 'No results'
              : `${matchCount} result${matchCount === 1 ? '' : 's'} in ${results.length} file${
                  results.length === 1 ? '' : 's'
                }${matchCount >= MAX_MATCHES ? ' (capped)' : ''}`}
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-dim)' }}>
            Find text across the open folder.
          </span>
        )}
      </div>

      <div className="search-view__results">
        {results.map((file) => {
          const isCollapsed = collapsed.has(file.path);
          return (
            <div key={file.path} className="search-file">
              <button
                type="button"
                className="search-file__head"
                onClick={() => toggleFile(file.path)}
              >
                {isCollapsed ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
                <span className="search-file__name">{basename(file.path)}</span>
                <span className="search-file__dir">
                  {dirPart(file.relativePath)}
                </span>
                <span className="search-file__count">{file.matches.length}</span>
              </button>
              {!isCollapsed &&
                file.matches.map((m, i) => (
                  <button
                    key={`${m.line}:${i}`}
                    type="button"
                    className="search-match"
                    onClick={() => void openMatch(file.path, m.line)}
                    title={`Line ${m.line}`}
                  >
                    <span className="search-match__line">{m.line}</span>
                    <span className="search-match__preview">
                      {renderPreview(m)}
                    </span>
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OptToggle({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`search-view__opt ${active ? 'is-active' : ''}`}
    >
      {children}
    </button>
  );
}

/** Render the line preview with matched ranges highlighted, left-trimmed. */
function renderPreview(m: SearchMatch): React.ReactNode {
  const trimAmount = m.preview.length - m.preview.trimStart().length;
  const text = m.preview.slice(trimAmount);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  m.ranges.forEach(([start, end], idx) => {
    const s = Math.max(0, start - trimAmount);
    const e = Math.max(0, end - trimAmount);
    if (s > cursor) parts.push(<span key={`t${idx}`}>{text.slice(cursor, s)}</span>);
    parts.push(
      <mark key={`m${idx}`} className="search-match__hit">
        {text.slice(s, e)}
      </mark>,
    );
    cursor = e;
  });
  if (cursor < text.length) parts.push(<span key="rest">{text.slice(cursor)}</span>);
  return parts;
}

function dirPart(relativePath: string): string {
  const idx = Math.max(relativePath.lastIndexOf('/'), relativePath.lastIndexOf('\\'));
  return idx > 0 ? relativePath.slice(0, idx) : '';
}
