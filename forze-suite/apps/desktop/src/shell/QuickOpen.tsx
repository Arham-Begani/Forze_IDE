import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkbench } from '../workbench/store';
import { useProject } from '../workbench/projectStore';
import { openFile } from '../workbench/actions';
import {
  fuzzyFilter,
  listWorkspaceFiles,
  type IndexedFile,
} from '../lib/fileIndex';
import { iconForLanguage } from '../lib/fileIcons';
import { languageFromPath } from '../lib/fs';

/** Module-level cache so reopening Quick Open is instant within a session. */
let cache: { root: string; files: IndexedFile[]; at: number } | null = null;
const CACHE_TTL = 15_000;

export default function QuickOpen(): JSX.Element | null {
  const open = useWorkbench((s) => s.quickOpenOpen);
  const seed = useWorkbench((s) => s.quickOpenSeed);
  const setQuickOpen = useWorkbench((s) => s.setQuickOpen);
  const workspaceRoot = useProject((s) => s.workspaceRoot);

  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<IndexedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Load (and cache) the workspace file list whenever Quick Open opens.
  useEffect(() => {
    if (!open) return;
    setQuery(seed);
    setActive(0);

    if (!workspaceRoot) {
      setFiles([]);
      return;
    }
    const fresh =
      cache && cache.root === workspaceRoot && Date.now() - cache.at < CACHE_TTL;
    if (fresh) {
      setFiles(cache!.files);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listWorkspaceFiles(workspaceRoot)
      .then((list) => {
        if (cancelled) return;
        cache = { root: workspaceRoot, files: list, at: Date.now() };
        setFiles(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, seed, workspaceRoot]);

  const results = useMemo(
    () => fuzzyFilter(files, query, 200),
    [files, query],
  );

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results.length, active]);

  // Keep the active row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const close = () => setQuickOpen(false);

  const choose = (path: string) => {
    close();
    void openFile(path);
  };

  return (
    <div
      className="cmd-palette__overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="cmd-palette" role="dialog" aria-label="Go to file">
        <input
          className="cmd-palette__input-native"
          autoFocus
          value={query}
          placeholder={
            workspaceRoot ? 'Go to file by name…' : 'Open a folder first'
          }
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const pick = results[active];
              if (pick) choose(pick.path);
            }
          }}
        />
        <div ref={listRef} className="cmd-palette__list">
          {loading && results.length === 0 && (
            <div className="cmd-palette__empty">Indexing workspace…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="cmd-palette__empty">
              {workspaceRoot ? 'No matching files.' : 'No folder open.'}
            </div>
          )}
          {results.map((file, idx) => {
            const Icon = iconForLanguage(languageFromPath(file.path));
            const dir = file.rel.includes('/')
              ? file.rel.slice(0, file.rel.lastIndexOf('/'))
              : '';
            const isActive = idx === active;
            return (
              <div
                key={file.path}
                data-active={isActive}
                data-selected={isActive}
                className="cmd-palette__item"
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(file.path);
                }}
              >
                <Icon size={13} strokeWidth={1.7} style={{ flexShrink: 0 }} />
                <span style={{ color: 'var(--color-text)' }}>{file.name}</span>
                {dir && (
                  <span
                    style={{
                      marginLeft: 8,
                      color: 'var(--color-text-dim)',
                      fontSize: 11,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dir}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
