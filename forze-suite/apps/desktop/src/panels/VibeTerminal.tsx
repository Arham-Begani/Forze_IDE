import '@xterm/xterm/css/xterm.css';
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

/** xterm always reports ≥1 after a successful fit; guard against a stray 0. */
function dims(term: Terminal): { cols: number; rows: number } {
  return { cols: Math.max(1, term.cols), rows: Math.max(1, term.rows) };
}

/**
 * A self-contained xterm.js terminal bound to its own PTY, used by the Vibe
 * Stations grid. Unlike the bottom-panel `XtermView` this isn't tied to the
 * terminal store and is always mounted visible — so it spawns immediately once
 * its container is measured. After the shell starts it auto-types
 * `launchCommand` (e.g. `claude`) so the chosen coding agent boots in place.
 *
 * Remounting (a new React `key`) gives a clean restart: the old PTY is killed
 * on unmount and a fresh shell + agent spins up.
 */
export default function VibeTerminal({
  cwd,
  launchCommand,
}: {
  cwd: string | null;
  launchCommand?: string;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const disposedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Spawn once the container has real dimensions. Spawning into a 0×0 box makes
  // the PTY start with cols=0/rows=0 and deadlocks the read thread — the same
  // class of bug XtermView guards against.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const rafId = window.requestAnimationFrame(async () => {
      if (cancelled) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        await new Promise((r) => window.requestAnimationFrame(r));
        if (container.clientWidth === 0 || container.clientHeight === 0) {
          setError('Terminal could not measure its container.');
          return;
        }
      }
      try {
        await initialiseTerminal(
          container,
          cwd,
          launchCommand,
          termRef,
          fitRef,
          ptyIdRef,
          disposedRef,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error('[forze vibe terminal] init failed', err);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the PTY sized to the container. Debounced so a layout drag doesn't
  // hammer pty_resize and race the redraw.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term || !fit) return;
      try {
        fit.fit();
        const ptyId = ptyIdRef.current;
        if (ptyId) {
          const { cols, rows } = dims(term);
          void resizePty(ptyId, cols, rows);
        }
      } catch {
        /* not ready */
      }
    };
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch {
          /* not ready */
        }
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(apply, 80);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Tear down on unmount (also covers restart-via-remount).
  useEffect(() => {
    return () => {
      disposedRef.current = true;
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
        padding: '8px 6px 4px 10px',
        background: 'var(--color-terminal-bg, #050505)',
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
  container: HTMLDivElement,
  cwd: string | null,
  launchCommand: string | undefined,
  termRef: React.MutableRefObject<Terminal | null>,
  fitRef: React.MutableRefObject<FitAddon | null>,
  ptyIdRef: React.MutableRefObject<string | null>,
  disposedRef: React.MutableRefObject<boolean>,
): Promise<void> {
  const term = new Terminal({
    fontFamily:
      "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'SF Mono', Consolas, monospace",
    fontSize: 11.5,
    lineHeight: 1.3,
    letterSpacing: 0,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true,
    scrollback: 8000,
    theme: {
      background: '#050505',
      foreground: '#e4e4e7',
      cursor: '#ffffff',
      cursorAccent: '#050505',
      selectionBackground: 'rgba(255, 255, 255, 0.18)',
      black: '#050505',
      red: '#ff7170',
      green: '#7ee787',
      yellow: '#ffd866',
      blue: '#79c0ff',
      magenta: '#f472b6',
      cyan: '#9cdcfe',
      white: '#dcdde6',
      brightBlack: '#5a5d68',
      brightRed: '#ff9090',
      brightGreen: '#9ae6a4',
      brightYellow: '#fcd34d',
      brightBlue: '#93c5fd',
      brightMagenta: '#f9a8d4',
      brightCyan: '#c9efff',
      brightWhite: '#f4f4f7',
    },
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());

  // Ctrl+L / Cmd+K: clear the screen, shell-agnostic.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const isClear =
      (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) ||
      (e.metaKey && (e.key === 'k' || e.key === 'K'));
    if (isClear) {
      term.clear();
      return false;
    }
    return true;
  });

  term.open(container);
  fit.fit();
  const { cols: safeCols, rows: safeRows } = dims(term);

  termRef.current = term;
  fitRef.current = fit;

  // Subscribe before spawn so the first chunk isn't missed.
  const unsubscribe = await subscribeToPtyOutput(
    (payload) => {
      if (payload.session_id !== ptyIdRef.current) return;
      term.write(payload.data);
    },
    (payload) => {
      if (payload.session_id !== ptyIdRef.current) return;
      const code = payload.code ?? 0;
      term.write(`\r\n\x1b[2m[process exited with code ${code}]\x1b[0m\r\n`);
    },
  );

  // Clean the listener up on disposal.
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
      console.error('[forze vibe terminal] write failed', err);
    });
  });

  const ptyId = await spawnPty({
    cwd: cwd ?? undefined,
    cols: safeCols,
    rows: safeRows,
  });
  if (disposedRef.current) {
    // Unmounted while spawning — kill the orphan so we don't leak a PTY.
    void killPty(ptyId).catch(() => undefined);
    return;
  }
  ptyIdRef.current = ptyId;

  // Re-assert the exact size (the backend floors spawn dimensions).
  const { cols, rows } = dims(term);
  void resizePty(ptyId, cols, rows).catch(() => undefined);

  term.focus();

  // Let the shell print its first prompt, then launch the agent CLI.
  if (launchCommand) {
    window.setTimeout(() => {
      if (disposedRef.current || ptyIdRef.current !== ptyId) return;
      void writePty(ptyId, `${launchCommand}\r`).catch(() => undefined);
    }, 600);
  }
}
