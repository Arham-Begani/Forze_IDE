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
import { useTheme } from '../theme/themeStore';
import { useVibeStations } from '../workbench/vibeStationsStore';
import { xtermThemeFor } from './XtermView';

/** xterm always reports ≥1 after a successful fit; guard against a stray 0. */
function dims(term: Terminal): { cols: number; rows: number } {
  return { cols: Math.max(1, term.cols), rows: Math.max(1, term.rows) };
}

/**
 * Gap between agent-CLI launches when several stations boot at once.
 * Each agent (Claude Code, codex, opencode's Bun runtime, …) does a big memory
 * allocation during startup. Firing all of them in the same instant spikes RAM
 * hard enough to OOM a constrained box — codex panics with "memory allocation
 * failed", Bun dies with an illegal instruction. Staggering lets each agent get
 * past its heavy init before the next one starts.
 */
const AGENT_LAUNCH_GAP_MS = 2500;

/**
 * One global queue that serialises the *actual* CLI launch keystrokes across
 * every mounted station, so agents boot one-at-a-time with a breathing gap
 * instead of stampeding system memory all at once.
 */
let agentLaunchQueue: Promise<unknown> = Promise.resolve();
function enqueueAgentLaunch(run: () => void): void {
  agentLaunchQueue = agentLaunchQueue
    .catch(() => undefined)
    .then(() => {
      run();
      return new Promise((resolve) =>
        window.setTimeout(resolve, AGENT_LAUNCH_GAP_MS),
      );
    });
}

/**
 * A self-contained xterm.js terminal bound to its own PTY, used by the Vibe
 * Stations grid. Unlike the bottom-panel `XtermView` this isn't tied to the
 * terminal store and is always mounted visible — so it spawns immediately once
 * its container is measured. Once the shell's prompt has settled it types
 * `launchCommand` (e.g. `claude`) so the chosen coding agent boots in place.
 *
 * Remounting (a new React `key`) gives a clean restart: the old PTY is killed
 * on unmount and a fresh shell + agent spins up.
 */
export default function VibeTerminal({
  stationId,
  cwd,
  launchCommand,
}: {
  /** Owning station id — used to mirror this terminal's pty session into the
   *  store so the prompt scheduler can write to it from outside the component. */
  stationId: string;
  cwd: string | null;
  launchCommand?: string;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const disposedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme((s) => s.theme);

  // Recolor an already-mounted terminal when the IDE theme changes; xterm
  // can't read the CSS tokens itself, so we hand it the matching palette.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = xtermThemeFor();
  }, [theme]);

  // Spawn once the container has real dimensions. Spawning into a 0×0 box makes
  // the PTY start with cols=0/rows=0 and deadlocks the read thread — the same
  // class of bug XtermView guards against.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Reset the disposed flag on (re)mount. React 18 StrictMode mounts, unmounts
    // (which flips disposedRef to true via the teardown effect below), then
    // remounts in dev — without this reset the second, real mount would spawn a
    // PTY and immediately kill it as if already disposed, leaving a dead box you
    // can't type into and that prints nothing.
    disposedRef.current = false;
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
          stationId,
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
      // Drop the store's pty binding so the scheduler never writes to a dead pty.
      useVibeStations.getState().setStationSession(stationId, null);
      const ptyId = ptyIdRef.current;
      if (ptyId) void killPty(ptyId).catch(() => undefined);
      termRef.current?.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        padding: '10px 8px 8px 13px',
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
  stationId: string,
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
    fontSize: 12,
    lineHeight: 1.35,
    letterSpacing: 0,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true,
    // A grid of these at 8000-line scrollback each was a real memory sink on a
    // RAM-constrained box; 1500 lines is still ample history per terminal.
    scrollback: 1500,
    theme: xtermThemeFor(),
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

  // Auto-launch the agent CLI by *typing* it into the live shell — but only
  // once the shell is actually at its prompt. We can't trust a fixed delay:
  // cold-starting several PowerShell instances at once leaves the prompt not
  // ready, so a timed keystroke lands in a half-initialised shell and is lost.
  // Instead we wait for the shell's startup output to go quiet (it prints its
  // banner/prompt, then stops), and send the command on that trailing edge. A
  // hard fallback fires if output never settles, so the launch can't stall.
  let launched = false;
  let promptTimer: ReturnType<typeof setTimeout> | undefined;
  const launchAgent = () => {
    if (launched || disposedRef.current) return;
    const id = ptyIdRef.current;
    if (!id || !launchCommand) return;
    launched = true;
    if (promptTimer) clearTimeout(promptTimer);
    // Serialise the launch so agents don't all spike memory at once. Re-check
    // liveness when our turn comes up — the station may have closed while we
    // waited in the queue.
    enqueueAgentLaunch(() => {
      if (disposedRef.current) return;
      const liveId = ptyIdRef.current;
      if (!liveId) return;
      void writePty(liveId, `${launchCommand}\r`).catch(() => undefined);
      // The agent CLI is now booting — mark the station ready-able (the
      // scheduler waits READY_GRACE_MS past this before typing a prompt).
      useVibeStations.getState().markStationLaunched(stationId);
    });
  };

  // Subscribe before spawn so the first chunk isn't missed.
  const unsubscribe = await subscribeToPtyOutput(
    (payload) => {
      if (payload.session_id !== ptyIdRef.current) return;
      term.write(payload.data);
      // Debounce on the prompt: each chunk pushes the launch back, so we only
      // fire after the shell has been quiet (settled at its prompt) for 350ms.
      if (launchCommand && !launched) {
        if (promptTimer) clearTimeout(promptTimer);
        promptTimer = setTimeout(launchAgent, 350);
      }
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

  // Spawn a plain interactive shell — exactly what the (working) bottom-panel
  // terminal does. The agent CLI is then typed in once the prompt settles.
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
  // Mirror the live session into the store so the prompt scheduler can address
  // this station's terminal. `launchedAt` stays null until the CLI launch fires.
  useVibeStations.getState().setStationSession(stationId, ptyId);

  // Re-assert the exact size (the backend floors spawn dimensions).
  const { cols, rows } = dims(term);
  void resizePty(ptyId, cols, rows).catch(() => undefined);

  term.focus();

  // Hard fallback: if the shell never produces settling output (so the
  // debounce above never fires), launch anyway after a generous delay.
  if (launchCommand) {
    window.setTimeout(launchAgent, 4000);
  }
}
