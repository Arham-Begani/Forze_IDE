import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useEffect, useRef, useState } from 'react';
import {
  killPty,
  resizePty,
  spawnPty,
  subscribeToPtyOutput,
  writePty,
} from '../lib/pty';
import { useTerminals, type TerminalSession } from '../workbench/terminalStore';

const MIN_COLS = 80;
const MIN_ROWS = 24;

/**
 * One xterm.js instance bound to one PTY session. The mount is *deferred*
 * until the container actually has non-zero dimensions — this is the bug
 * that wrecked the first cut: fit.fit() inside a hidden panel reports 0×0,
 * the PTY then spawns with cols=0 rows=0, and every write deadlocks the
 * read thread on the Rust side.
 */
export default function XtermView({
  session,
  visible,
}: {
  session: TerminalSession;
  visible: boolean;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setPtySessionId = useTerminals((s) => s.setPtySessionId);

  // Defer the heavy mount until the container is both visible and sized.
  useEffect(() => {
    if (!visible) return;
    if (termRef.current) {
      // Already mounted — just refit on visibility change.
      try {
        fitRef.current?.fit();
        if (ptyIdRef.current && termRef.current) {
          void resizePty(
            ptyIdRef.current,
            Math.max(MIN_COLS, termRef.current.cols),
            Math.max(MIN_ROWS, termRef.current.rows),
          );
        }
      } catch {
        /* ignore */
      }
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    let mountedAt = 0;
    let cancelled = false;

    // Wait one frame so the parent layout pass settles before we measure.
    const rafId = window.requestAnimationFrame(async () => {
      mountedAt = Date.now();
      if (cancelled) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) {
        // Try once more on the next frame; if still zero, give up gracefully.
        await new Promise((r) => window.requestAnimationFrame(r));
        if (container.clientWidth === 0 || container.clientHeight === 0) {
          setError(
            'Terminal could not measure its container. Open the bottom panel to start it.',
          );
          return;
        }
      }
      try {
        await initialiseTerminal(
          session,
          container,
          termRef,
          fitRef,
          ptyIdRef,
          setPtySessionId,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error('[forze terminal] init failed', err, '(t+', Date.now() - mountedAt, 'ms)');
        setError(message);
        termRef.current?.write(
          `\r\n\x1b[31m[forze] terminal failed to start: ${message}\x1b[0m\r\n`,
        );
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [visible, session, setPtySessionId]);

  // Resize whenever the container resizes (split drag, window resize, etc.).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onResize = () => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term || !fit) return;
      try {
        fit.fit();
        const ptyId = ptyIdRef.current;
        if (ptyId) {
          void resizePty(
            ptyId,
            Math.max(MIN_COLS, term.cols),
            Math.max(MIN_ROWS, term.rows),
          );
        }
      } catch {
        /* terminal not yet ready */
      }
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      const ptyId = ptyIdRef.current;
      if (ptyId) void killPty(ptyId).catch(() => undefined);
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        padding: '10px 8px 6px 12px',
        background: 'var(--color-terminal-bg)',
        display: visible ? 'block' : 'none',
      }}
      onMouseDown={() => termRef.current?.focus()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {error && !termRef.current && (
        <div
          style={{
            color: 'var(--color-danger)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: 10,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

async function initialiseTerminal(
  session: TerminalSession,
  container: HTMLDivElement,
  termRef: React.MutableRefObject<Terminal | null>,
  fitRef: React.MutableRefObject<FitAddon | null>,
  ptyIdRef: React.MutableRefObject<string | null>,
  setPtySessionId: (id: string, ptySessionId: string) => void,
): Promise<void> {
  const term = new Terminal({
    fontFamily:
      "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'SF Mono', Consolas, monospace",
    fontSize: 12.5,
    lineHeight: 1.35,
    letterSpacing: 0.1,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true,
    scrollback: 8000,
    theme: {
      background: '#0a0a0c',
      foreground: '#e6e6ec',
      cursor: '#a78bfa',
      cursorAccent: '#0a0a0c',
      selectionBackground: 'rgba(167, 139, 250, 0.28)',
      black: '#0a0a0c',
      red: '#ff7170',
      green: '#7ee787',
      yellow: '#ffd866',
      blue: '#79c0ff',
      magenta: '#d2a8ff',
      cyan: '#9cdcfe',
      white: '#dcdde6',
      brightBlack: '#5a5d68',
      brightRed: '#ff9090',
      brightGreen: '#9ae6a4',
      brightYellow: '#fcd34d',
      brightBlue: '#93c5fd',
      brightMagenta: '#e2b6ff',
      brightCyan: '#c9efff',
      brightWhite: '#f4f4f7',
    },
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  term.open(container);
  fit.fit();
  const safeCols = Math.max(MIN_COLS, term.cols);
  const safeRows = Math.max(MIN_ROWS, term.rows);

  termRef.current = term;
  fitRef.current = fit;

  // Subscribe before spawn so we don't miss the first chunk.
  const unsubscribe = await subscribeToPtyOutput(
    (payload) => {
      if (payload.session_id !== ptyIdRef.current) return;
      term.write(payload.data);
    },
    (payload) => {
      if (payload.session_id !== ptyIdRef.current) return;
      const code = payload.code ?? 0;
      term.write(
        `\r\n\x1b[2m[process exited with code ${code}]\x1b[0m\r\n`,
      );
    },
  );

  // Stash the unsubscribe on the term so disposal cleans it up.
  (term as unknown as { __forzeUnsub?: () => void }).__forzeUnsub = unsubscribe;
  const origDispose = term.dispose.bind(term);
  term.dispose = () => {
    try {
      unsubscribe();
    } catch {
      /* noop */
    }
    origDispose();
  };

  term.onData((data) => {
    const ptyId = ptyIdRef.current;
    if (!ptyId) return;
    void writePty(ptyId, data).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[forze terminal] write failed', err);
    });
  });

  const ptyId = await spawnPty({
    cwd: session.cwd ?? undefined,
    cols: safeCols,
    rows: safeRows,
  });
  ptyIdRef.current = ptyId;
  setPtySessionId(session.id, ptyId);

  term.focus();
}
