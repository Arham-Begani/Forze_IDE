import {
  forwardRef,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { highlight } from '../lib/highlight';
import { formatCode } from '../lib/format';
import { computeLineDiff } from '../lib/lineDiff';
import { buildMatcher, type SearchOptions } from '../lib/search';
import { toast } from '../shell/toast';
import type { StackTraceLine } from '@forze/shared/diagnostics';

/** All match ranges [start, end) of `query` in `text` under the given options.
 *  Reuses the workspace-search matcher so in-editor find behaves identically to
 *  the Search panel (case / whole-word / regex). Returns [] for empty or invalid
 *  patterns so the caller can just render "0 results". */
function computeMatches(
  text: string,
  query: string,
  opts: SearchOptions,
): Array<[number, number]> {
  if (!query) return [];
  const built = buildMatcher(query, opts);
  if ('error' in built) return [];
  const re = built.regex; // global
  const out: Array<[number, number]> = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(text)) !== null) {
    out.push([m.index, m.index + m[0].length]);
    if (m.index === re.lastIndex) re.lastIndex += 1; // zero-width guard
    if (++guard > 100_000) break;
  }
  return out;
}

/** Auto-closing pairs: typing the opener inserts the closer and keeps the caret
 *  between them. Quotes are symmetric (the opener equals the closer). */
const PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);
const QUOTES = new Set(['"', "'", '`']);

/** True when `open`/`close` form a matching bracket or quote pair. */
function isPair(open: string | undefined, close: string | undefined): boolean {
  if (!open || !close) return false;
  return PAIRS[open] === close || (QUOTES.has(open) && open === close);
}

/** Leading whitespace of the line that contains offset `pos` in `text`. */
function lineIndent(text: string, pos: number): string {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const match = /^[ \t]*/.exec(text.slice(lineStart, pos));
  return match ? match[0] : '';
}

export interface EditorHandle {
  insertAtCursor: (snippet: string) => void;
  /** Focus the editor and select its entire contents (Edit ▸ Select All). */
  selectAll: () => void;
  markDiagnostic: (trace: StackTraceLine) => void;
  clearDiagnostics: () => void;
  getValue: () => string;
  /** Scroll to and select a 1-based line (used by Search results). */
  revealLine: (line: number) => void;
  /** Reformat the whole buffer (Format Document). Resolves when done. */
  format: () => Promise<void>;
}

interface EditorCanvasProps {
  initialValue?: string;
  language?: string;
  onChange?: (value: string) => void;
  /**
   * Committed (HEAD) contents of this file. When provided, the gutter shows
   * VS Code-style change bars (added / modified / deleted) computed live against
   * the current buffer. Omit (or pass null) for files with no git baseline.
   */
  diffBaseline?: string | null;
}

/**
 * Dependency-free code editor: a transparent <textarea> layered over a
 * syntax-highlighted <pre>, with a synced line-number gutter. Chosen over
 * Monaco because Monaco's CDN/worker loader and 4MB payload were unreliable
 * inside the Tauri webview (blank editor + crashes). This always renders the
 * file contents, works offline, and keeps the editor lightweight.
 */
const EditorCanvas = forwardRef<EditorHandle, EditorCanvasProps>(
  function EditorCanvas(
    { initialValue = '', language = 'typescript', onChange, diffBaseline = null },
    ref,
  ) {
    const [value, setValue] = useState(initialValue);
    const [errorLines, setErrorLines] = useState<Set<number>>(() => new Set());
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    const preRef = useRef<HTMLPreElement | null>(null);
    const gutterRef = useRef<HTMLDivElement | null>(null);
    const activeLineRef = useRef<HTMLDivElement | null>(null);

    // --- Find & Replace (Ctrl+F / Ctrl+H) ---
    const [findOpen, setFindOpen] = useState(false);
    const [replaceShown, setReplaceShown] = useState(false);
    const [findQuery, setFindQuery] = useState('');
    const [replaceWith, setReplaceWith] = useState('');
    const [findOpts, setFindOpts] = useState<SearchOptions>({
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    });
    const [activeMatch, setActiveMatch] = useState(0);
    const findInputRef = useRef<HTMLInputElement | null>(null);

    // Re-seed when the file changes. EditorArea remounts via key={tabId}, but
    // this keeps us correct if that ever changes.
    useEffect(() => {
      setValue(initialValue);
      setErrorLines(new Set());
    }, [initialValue]);

    // Re-align the active-line band after the buffer (re)renders — typing,
    // formatting, or a fresh file all move the caret's row.
    useEffect(() => {
      // updateActiveLine reads live refs; re-run whenever the text changes.
      const id = requestAnimationFrame(updateActiveLine);
      return () => cancelAnimationFrame(id);
    }, [value]);

    const lineCount = useMemo(() => value.split('\n').length, [value]);
    // Re-tokenizing the whole buffer with highlight.js is the editor's most
    // expensive work. Defer it off the keystroke path: the textarea (caret +
    // selection) commits immediately, while the coloured <pre> underneath
    // repaints at lower priority. On small files the deferred value tracks
    // `value` in the same frame; on large files React skips intermediate
    // highlights during a fast burst instead of blocking every keystroke.
    const deferredValue = useDeferredValue(value);
    const highlighted = useMemo(
      () => highlight(deferredValue, language),
      [deferredValue, language],
    );
    const diff = useMemo(
      () => (diffBaseline == null ? null : computeLineDiff(diffBaseline, value)),
      [diffBaseline, value],
    );

    // Height of one editor row — kept in sync with the 20px line-height in
    // editor.css (.codeedit, .codeedit__pre/.codeedit__ta, .codeedit__activeline).
    const LINE_HEIGHT = 20;

    /** Slide the active-line band to the caret's row. Imperative on purpose:
     *  it runs on every caret move and scroll, and a React state update there
     *  would re-render the whole gutter for nothing. */
    const updateActiveLine = (): void => {
      const ta = taRef.current;
      const band = activeLineRef.current;
      if (!ta || !band) return;
      const caretLine = ta.value.slice(0, ta.selectionStart).split('\n').length;
      band.style.transform = `translateY(${(caretLine - 1) * LINE_HEIGHT - ta.scrollTop}px)`;
    };

    const syncScroll = (): void => {
      const ta = taRef.current;
      if (!ta) return;
      if (preRef.current) {
        preRef.current.scrollTop = ta.scrollTop;
        preRef.current.scrollLeft = ta.scrollLeft;
      }
      if (gutterRef.current) {
        gutterRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
      }
      updateActiveLine();
    };

    const update = (next: string): void => {
      setValue(next);
      onChange?.(next);
    };

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => taRef.current?.value ?? value,
        insertAtCursor: (snippet: string) => {
          const ta = taRef.current;
          if (!ta) {
            update(value + snippet);
            return;
          }
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const next = value.slice(0, start) + snippet + value.slice(end);
          update(next);
          requestAnimationFrame(() => {
            ta.focus();
            const caret = start + snippet.length;
            ta.setSelectionRange(caret, caret);
          });
        },
        selectAll: () => {
          const ta = taRef.current;
          if (!ta) return;
          ta.focus();
          ta.select();
        },
        markDiagnostic: (trace: StackTraceLine) => {
          setErrorLines((prev) => {
            const next = new Set(prev);
            next.add(trace.line);
            return next;
          });
        },
        clearDiagnostics: () => setErrorLines(new Set()),
        format: async () => {
          const ta = taRef.current;
          const source = ta?.value ?? value;
          // Remember which line the caret sits on so we can restore the caret
          // near it after the buffer is rewritten (offsets shift wholesale).
          const caretLine = ta
            ? source.slice(0, ta.selectionStart).split('\n').length
            : 1;
          let result;
          try {
            result = await formatCode(source, language);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // Prettier's first message line is the human-readable syntax error.
            toast(`Can't format: ${message.split('\n')[0]}`, 'error');
            return;
          }
          if (!result.changed) {
            toast('Already formatted', 'info');
            return;
          }
          update(result.code);
          requestAnimationFrame(() => {
            if (!ta) return;
            ta.focus();
            const lines = result.code.split('\n');
            const target = Math.max(1, Math.min(caretLine, lines.length));
            let offset = 0;
            for (let i = 0; i < target - 1; i++) offset += lines[i]!.length + 1;
            ta.setSelectionRange(offset, offset);
          });
          toast(
            result.engine === 'prettier' ? 'Formatted with Prettier' : 'Tidied whitespace',
            'success',
          );
        },
        revealLine: (line: number) => {
          const ta = taRef.current;
          if (!ta) return;
          // Read the live textarea value (it reflects the latest content even
          // if this handle closed over an older `value`).
          const text = ta.value;
          const allLines = text.split('\n');
          const target = Math.max(1, Math.min(line, allLines.length));
          let start = 0;
          for (let i = 0; i < target - 1; i++) start += allLines[i]!.length + 1;
          const end = start + (allLines[target - 1]?.length ?? 0);
          requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(start, end);
            // Centre the line. 20px matches the .codeedit line-height.
            const lineHeight = 20;
            ta.scrollTop = Math.max(
              0,
              (target - 1) * lineHeight - ta.clientHeight / 2 + lineHeight,
            );
            syncScroll();
          });
        },
      }),
      [value],
    );

    /** Replace the buffer and restore a selection once React has committed the
     *  new controlled value (the textarea reflects `value` only after re-render,
     *  so the caret must be set on the next frame). */
    const commit = (next: string, selStart: number, selEnd = selStart): void => {
      update(next);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(selStart, selEnd);
      });
    };

    // Recompute match ranges whenever the query, options, or buffer change (only
    // while the bar is open — this walks the whole buffer).
    const matches = useMemo(
      () => (findOpen ? computeMatches(value, findQuery, findOpts) : []),
      [findOpen, value, findQuery, findOpts],
    );

    // Keep the active-match index in range as the match set shrinks/grows.
    useEffect(() => {
      if (matches.length === 0) {
        if (activeMatch !== 0) setActiveMatch(0);
      } else if (activeMatch >= matches.length) {
        setActiveMatch(matches.length - 1);
      }
    }, [matches, activeMatch]);

    /** Select the i-th match in the textarea and centre it. */
    const goToMatch = (i: number): void => {
      const ta = taRef.current;
      const hit = matches[i];
      if (!ta || !hit) return;
      const [s, e] = hit;
      ta.focus();
      ta.setSelectionRange(s, e);
      const lineOfStart = value.slice(0, s).split('\n').length;
      ta.scrollTop = Math.max(
        0,
        (lineOfStart - 1) * LINE_HEIGHT - ta.clientHeight / 2 + LINE_HEIGHT,
      );
      syncScroll();
      setActiveMatch(i);
    };

    const nextMatch = (): void => {
      if (matches.length > 0) goToMatch((activeMatch + 1) % matches.length);
    };
    const prevMatch = (): void => {
      if (matches.length > 0)
        goToMatch((activeMatch - 1 + matches.length) % matches.length);
    };

    /** Open the find bar (optionally in replace mode), seeding a one-line
     *  selection as the query the way VS Code does. */
    const openFind = (replace: boolean): void => {
      setFindOpen(true);
      setReplaceShown(replace);
      const ta = taRef.current;
      if (ta && ta.selectionStart !== ta.selectionEnd) {
        const sel = value.slice(ta.selectionStart, ta.selectionEnd);
        if (!sel.includes('\n')) setFindQuery(sel);
      }
      requestAnimationFrame(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      });
    };

    const closeFind = (): void => {
      setFindOpen(false);
      requestAnimationFrame(() => taRef.current?.focus());
    };

    const replaceOne = (): void => {
      const hit = matches[activeMatch];
      if (!hit) return;
      const [s, e] = hit;
      commit(value.slice(0, s) + replaceWith + value.slice(e), s + replaceWith.length);
    };

    const replaceAll = (): void => {
      if (matches.length === 0) return;
      let result = '';
      let last = 0;
      for (const [s, e] of matches) {
        result += value.slice(last, s) + replaceWith;
        last = e;
      }
      result += value.slice(last);
      const count = matches.length;
      const ta = taRef.current;
      const caret = ta ? Math.min(ta.selectionStart, result.length) : 0;
      commit(result, caret);
      toast(`Replaced ${count} occurrence${count === 1 ? '' : 's'}`, 'success');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      // --- Find / Replace shortcuts (work whenever the editor has focus). ---
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        openFind(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        openFind(true);
        return;
      }

      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const hasSelection = start !== end;
      const key = e.key;
      const before = value[start - 1];
      const after = value[end];

      // --- Tab: indent. Multi-line selection indents/outdents the block;
      //     otherwise insert two spaces. Shift+Tab outdents the current line. ---
      if (key === 'Tab') {
        e.preventDefault();
        const selText = value.slice(start, end);
        const multiline = hasSelection && selText.includes('\n');
        if (multiline || e.shiftKey) {
          const lineStart = value.lastIndexOf('\n', start - 1) + 1;
          const block = value.slice(lineStart, end);
          if (e.shiftKey) {
            const outdented = block.replace(/^( {1,2}|\t)/gm, '');
            const removed = block.length - outdented.length;
            commit(
              value.slice(0, lineStart) + outdented + value.slice(end),
              Math.max(lineStart, start - Math.min(2, removed)),
              end - removed,
            );
          } else {
            const indented = block.replace(/^/gm, '  ');
            const addedFirst = 2;
            const addedTotal = indented.length - block.length;
            commit(
              value.slice(0, lineStart) + indented + value.slice(end),
              start + addedFirst,
              end + addedTotal,
            );
          }
          return;
        }
        commit(value.slice(0, start) + '  ' + value.slice(end), start + 2);
        return;
      }

      // --- Enter: keep the current line's indentation; add a level after an
      //     opener, and split a {} / [] / () pair onto its own closing line. ---
      if (key === 'Enter') {
        e.preventDefault();
        const indent = lineIndent(value, start);
        const opensBlock = before != null && '([{'.includes(before);
        if (opensBlock && isPair(before, after)) {
          const inner = '\n' + indent + '  ';
          const outer = '\n' + indent;
          commit(
            value.slice(0, start) + inner + outer + value.slice(end),
            start + inner.length,
          );
        } else if (opensBlock) {
          const ins = '\n' + indent + '  ';
          commit(value.slice(0, start) + ins + value.slice(end), start + ins.length);
        } else {
          const ins = '\n' + indent;
          commit(value.slice(0, start) + ins + value.slice(end), start + ins.length);
        }
        return;
      }

      // --- Opening bracket: auto-close, wrapping any selection. ---
      if (PAIRS[key]) {
        e.preventDefault();
        const close = PAIRS[key];
        if (hasSelection) {
          commit(
            value.slice(0, start) + key + value.slice(start, end) + close + value.slice(end),
            start + 1,
            end + 1,
          );
        } else {
          commit(value.slice(0, start) + key + close + value.slice(end), start + 1);
        }
        return;
      }

      // --- Closing bracket: type over an auto-inserted closer instead of
      //     stacking a duplicate. Pure caret move, no buffer change. ---
      if (CLOSERS.has(key) && !hasSelection && after === key) {
        e.preventDefault();
        ta.setSelectionRange(start + 1, start + 1);
        return;
      }

      // --- Quotes: wrap a selection, type over a matching closer, or auto-pair.
      //     Don't auto-pair right after a word character (e.g. an apostrophe in
      //     don't) — that would insert a stray closing quote. ---
      if (QUOTES.has(key)) {
        if (hasSelection) {
          e.preventDefault();
          commit(
            value.slice(0, start) + key + value.slice(start, end) + key + value.slice(end),
            start + 1,
            end + 1,
          );
          return;
        }
        if (after === key) {
          e.preventDefault();
          ta.setSelectionRange(start + 1, start + 1);
          return;
        }
        if (before == null || !/[\w]/.test(before)) {
          e.preventDefault();
          commit(value.slice(0, start) + key + key + value.slice(end), start + 1);
          return;
        }
        return;
      }

      // --- Backspace between an empty pair removes both halves. ---
      if (key === 'Backspace' && !hasSelection && start > 0 && isPair(before, after)) {
        e.preventDefault();
        commit(value.slice(0, start - 1) + value.slice(start + 1), start - 1);
        return;
      }
    };

    return (
      <div className="codeedit">
        <div className="codeedit__gutter" aria-hidden>
          <div className="codeedit__gutter-inner" ref={gutterRef}>
            {Array.from({ length: lineCount }, (_, i) => {
              const change = diff
                ? diff.added.has(i)
                  ? ' is-added'
                  : diff.modified.has(i)
                    ? ' is-modified'
                    : ''
                : '';
              const delMark = diff?.deleted.has(i) ? ' is-deleted' : '';
              return (
                <div
                  key={i}
                  className={`codeedit__num${errorLines.has(i + 1) ? ' is-error' : ''}${change}${delMark}`}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
        </div>
        <div className="codeedit__main">
          {findOpen && (
            <FindReplaceBar
              query={findQuery}
              setQuery={setFindQuery}
              replaceWith={replaceWith}
              setReplaceWith={setReplaceWith}
              opts={findOpts}
              setOpts={setFindOpts}
              replaceShown={replaceShown}
              toggleReplace={() => setReplaceShown((v) => !v)}
              matchCount={matches.length}
              activeIndex={activeMatch}
              inputRef={findInputRef}
              onNext={nextMatch}
              onPrev={prevMatch}
              onReplaceOne={replaceOne}
              onReplaceAll={replaceAll}
              onClose={closeFind}
            />
          )}
          <pre className="codeedit__pre" ref={preRef} aria-hidden>
            {highlighted}
          </pre>
          <div className="codeedit__activeline" ref={activeLineRef} aria-hidden />
          <textarea
            ref={taRef}
            className="codeedit__ta"
            value={value}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            onChange={(e) => update(e.target.value)}
            onScroll={syncScroll}
            onKeyDown={handleKeyDown}
            onKeyUp={updateActiveLine}
            onClick={updateActiveLine}
            onFocus={updateActiveLine}
            onSelect={updateActiveLine}
          />
        </div>
      </div>
    );
  },
);

export default EditorCanvas;

interface FindReplaceBarProps {
  query: string;
  setQuery: (v: string) => void;
  replaceWith: string;
  setReplaceWith: (v: string) => void;
  opts: SearchOptions;
  setOpts: (updater: (prev: SearchOptions) => SearchOptions) => void;
  replaceShown: boolean;
  toggleReplace: () => void;
  matchCount: number;
  activeIndex: number;
  inputRef: React.RefObject<HTMLInputElement>;
  onNext: () => void;
  onPrev: () => void;
  onReplaceOne: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

/**
 * The in-editor Find & Replace overlay (Ctrl+F / Ctrl+H). Anchored top-right of
 * the editor pane, self-styled so it needs no CSS partial. Enter finds next,
 * Shift+Enter finds previous, Escape closes.
 */
function FindReplaceBar(props: FindReplaceBarProps): JSX.Element {
  const {
    query,
    setQuery,
    replaceWith,
    setReplaceWith,
    opts,
    setOpts,
    replaceShown,
    toggleReplace,
    matchCount,
    activeIndex,
    inputRef,
    onNext,
    onPrev,
    onReplaceOne,
    onReplaceAll,
    onClose,
  } = props;

  const onFindKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const count =
    matchCount === 0 ? (query ? 'No results' : '') : `${activeIndex + 1} of ${matchCount}`;

  return (
    <div style={FRB.wrap} role="search">
      <button type="button" style={FRB.expand} onClick={toggleReplace} title="Toggle Replace">
        {replaceShown ? <ChevronDown size={14} /> : <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={FRB.row}>
          <input
            ref={inputRef}
            style={FRB.input}
            value={query}
            placeholder="Find"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFindKey}
          />
          <span style={FRB.count}>{count}</span>
          <ToggleBtn active={opts.caseSensitive} label="Aa" title="Match case"
            onClick={() => setOpts((p) => ({ ...p, caseSensitive: !p.caseSensitive }))} />
          <ToggleBtn active={opts.wholeWord} label="W" title="Whole word"
            onClick={() => setOpts((p) => ({ ...p, wholeWord: !p.wholeWord }))} />
          <ToggleBtn active={opts.regex} label=".*" title="Use regular expression"
            onClick={() => setOpts((p) => ({ ...p, regex: !p.regex }))} />
          <button type="button" style={FRB.icon} onClick={onPrev} title="Previous (Shift+Enter)" disabled={matchCount === 0}>
            <ChevronUp size={14} />
          </button>
          <button type="button" style={FRB.icon} onClick={onNext} title="Next (Enter)" disabled={matchCount === 0}>
            <ChevronDown size={14} />
          </button>
          <button type="button" style={FRB.icon} onClick={onClose} title="Close (Esc)">
            <X size={14} />
          </button>
        </div>

        {replaceShown && (
          <div style={FRB.row}>
            <input
              style={FRB.input}
              value={replaceWith}
              placeholder="Replace"
              spellCheck={false}
              onChange={(e) => setReplaceWith(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onReplaceOne();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
            />
            <button type="button" style={FRB.textBtn} onClick={onReplaceOne} disabled={matchCount === 0} title="Replace">
              Replace
            </button>
            <button type="button" style={FRB.textBtn} onClick={onReplaceAll} disabled={matchCount === 0} title="Replace all">
              All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      style={{
        ...FRB.icon,
        width: 24,
        fontSize: 11,
        fontWeight: 700,
        background: active ? 'rgba(120,150,255,0.28)' : 'transparent',
      }}
    >
      {label}
    </button>
  );
}

const FRB: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'absolute',
    top: 8,
    right: 18,
    zIndex: 20,
    display: 'flex',
    gap: 4,
    padding: 6,
    background: 'var(--panel, #24242a)',
    border: '1px solid var(--border, rgba(128,128,128,0.35))',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  expand: {
    display: 'flex',
    alignItems: 'center',
    background: 'transparent',
    border: 0,
    color: 'inherit',
    cursor: 'pointer',
    padding: '0 2px',
    opacity: 0.7,
  },
  row: { display: 'flex', alignItems: 'center', gap: 2 },
  input: {
    width: 200,
    padding: '4px 8px',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    color: 'inherit',
    background: 'rgba(128,128,128,0.14)',
    border: '1px solid var(--border, rgba(128,128,128,0.25))',
    borderRadius: 5,
    outline: 'none',
  },
  count: {
    minWidth: 62,
    fontSize: 11,
    opacity: 0.6,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    padding: '0 4px',
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    background: 'transparent',
    border: 0,
    borderRadius: 5,
    color: 'inherit',
    cursor: 'pointer',
    opacity: 0.85,
  },
  textBtn: {
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 600,
    background: 'rgba(128,128,128,0.16)',
    border: '1px solid var(--border, rgba(128,128,128,0.25))',
    borderRadius: 5,
    color: 'inherit',
    cursor: 'pointer',
  },
};
