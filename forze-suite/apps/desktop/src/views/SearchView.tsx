import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Regex,
  Search,
  WholeWord,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  searchWorkspace,
  type FileResult,
  type SearchMatch,
  type SearchOptions,
  type SearchToken,
} from '../lib/search';
import { basename } from '../lib/fs';
import { openFile } from '../workbench/actions';
import { useProject } from '../workbench/projectStore';
import { useReveal } from '../workbench/reveal';

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
        </div>
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
