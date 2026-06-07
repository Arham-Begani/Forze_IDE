import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { highlight } from '../lib/highlight';
import { formatCode } from '../lib/format';
import { computeLineDiff } from '../lib/lineDiff';
import { toast } from '../shell/toast';
import type { StackTraceLine } from '@forze/shared/diagnostics';

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

    // Re-seed when the file changes. EditorArea remounts via key={tabId}, but
    // this keeps us correct if that ever changes.
    useEffect(() => {
      setValue(initialValue);
      setErrorLines(new Set());
    }, [initialValue]);

    const lineCount = useMemo(() => value.split('\n').length, [value]);
    const highlighted = useMemo(() => highlight(value, language), [value, language]);
    const diff = useMemo(
      () => (diffBaseline == null ? null : computeLineDiff(diffBaseline, value)),
      [diffBaseline, value],
    );

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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      // Tab inserts two spaces instead of moving focus.
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = value.slice(0, start) + '  ' + value.slice(end);
        update(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
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
          <pre className="codeedit__pre" ref={preRef} aria-hidden>
            {highlighted}
          </pre>
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
          />
        </div>
      </div>
    );
  },
);

export default EditorCanvas;
