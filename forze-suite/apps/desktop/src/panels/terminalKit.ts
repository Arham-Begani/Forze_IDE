import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { CanvasAddon } from '@xterm/addon-canvas';
import { openLink } from '../lib/openLink';

/**
 * Shared xterm wiring for every terminal in the app (the bottom-panel
 * `XtermView` and the Vibe-Stations `VibeTerminal`). Centralising it means the
 * premium feel — GPU rendering, smooth scroll, crisp cursor, accent selection —
 * is defined once and can never drift between the two surfaces.
 */

/** ANSI palette for the dark themes (the graphite matte-black canvas). */
const DARK_XTERM_THEME: ITheme = {
  background: '#0b0b0b',
  foreground: '#e5e5e5',
  cursor: '#ffffff',
  cursorAccent: '#0b0b0b',
  // Monochrome selection — a lifted silver plate, dimming when the terminal
  // loses focus (the native, expensive-feeling cue).
  selectionBackground: 'rgba(229, 229, 229, 0.24)',
  selectionInactiveBackground: 'rgba(229, 229, 229, 0.10)',
  selectionForeground: undefined,
  black: '#0b0b0b',
  red: '#f07a72',
  green: '#a8c08a',
  yellow: '#cbb88a',
  blue: '#93accb',
  magenta: '#c69ac6',
  cyan: '#8fc6c4',
  white: '#d6d6d6',
  brightBlack: '#6a6a6a',
  brightRed: '#ff9c94',
  brightGreen: '#c0d6a4',
  brightYellow: '#e3d2a4',
  brightBlue: '#b3c8e2',
  brightMagenta: '#dcb6dc',
  brightCyan: '#aedcda',
  brightWhite: '#f5f5f5',
};

/** ANSI palette for the Daylight (light) theme — white canvas, dark ink. */
const LIGHT_XTERM_THEME: ITheme = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#171717',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(23, 23, 23, 0.18)',
  selectionInactiveBackground: 'rgba(23, 23, 23, 0.08)',
  selectionForeground: undefined,
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#7d4e00',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#633c01',
  brightBlue: '#218bff',
  brightMagenta: '#a475f9',
  brightCyan: '#3192aa',
  brightWhite: '#8c959f',
};

/** xterm paints to a canvas, so it can't read CSS tokens — pick the palette
 *  off the active theme id on the root element instead. */
export function xtermThemeFor(): ITheme {
  return document.documentElement.dataset.theme === 'forze-daylight'
    ? LIGHT_XTERM_THEME
    : DARK_XTERM_THEME;
}

/** Options shared by every Forze terminal. `fontSize` is the only per-surface
 *  knob (the dense Vibe-Stations grid runs a hair smaller). */
function baseOptions(fontSize: number) {
  // xterm drives the cursor blink and smooth-scroll glide in JS, so a CSS
  // `prefers-reduced-motion` rule can't reach them — honor the OS setting here.
  const reduce =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    fontFamily:
      "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'SF Mono', Consolas, monospace",
    fontSize,
    fontWeight: 400 as const,
    fontWeightBold: 600 as const,
    lineHeight: 1.4,
    letterSpacing: 0,
    cursorBlink: !reduce,
    cursorStyle: 'bar' as const,
    cursorWidth: 2,
    // Hollow cursor when the terminal isn't focused — the small native touch
    // that makes a terminal read as a first-class surface, not a textarea.
    cursorInactiveStyle: 'outline' as const,
    // The single biggest perceived-smoothness win after the canvas renderer:
    // wheel and keyboard scrolling glide instead of snapping line-by-line.
    smoothScrollDuration: reduce ? 0 : 90,
    // Coarser wheel granularity feels sluggish over long agent output; bump it,
    // and let Alt engage a fast-scroll multiplier through history.
    scrollSensitivity: 3,
    fastScrollModifier: 'alt' as const,
    fastScrollSensitivity: 5,
    scrollback: 1500,
    drawBoldTextInBrightColors: true,
    allowProposedApi: true,
    theme: xtermThemeFor(),
  };
}

/**
 * Build a terminal, mount it into `container`, and wire the full premium
 * stack: fit + web-links, then the GPU canvas renderer (loaded *after* open,
 * as xterm requires), with a graceful fall back to the default DOM renderer if
 * the webview can't give us a 2D context. Canvas — not WebGL — is deliberate:
 * Forze keeps many terminals alive at once (the Vibe-Stations grid) and toggles
 * them with display:none, which trips WebGL's ~16-context cap and its
 * context-loss-on-hide. Canvas has neither limit and is still far smoother than
 * the per-cell DOM renderer that ships by default.
 *
 * Also installs the shell-agnostic Ctrl+L / Cmd+K "clear screen" binding both
 * surfaces share. Caller still owns PTY spawn/IO and disposal.
 */
export function createForzeTerminal(
  container: HTMLElement,
  opts?: { fontSize?: number },
): { term: Terminal; fit: FitAddon } {
  const term = new Terminal(baseOptions(opts?.fontSize ?? 12.5));

  const fit = new FitAddon();
  term.loadAddon(fit);
  // The web-links addon already linkifies http(s) URLs in the output (so a dev
  // server printing "Local: http://localhost:5173/" is clickable). Override the
  // default window.open handler so localhost URLs open in the in-IDE Live
  // Preview pane and everything else goes to the OS browser.
  term.loadAddon(
    new WebLinksAddon((_event, uri) => {
      void openLink(uri);
    }),
  );

  // Ctrl+L / Cmd+K: clear the screen, shell-agnostic. xterm's own clear wipes
  // the scrollback and keeps the current prompt line, so it works the same
  // whether the shell understands `clear`, `cls`, or neither.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const isClear =
      (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) ||
      (e.metaKey && (e.key === 'k' || e.key === 'K'));
    if (isClear) {
      term.clear();
      return false; // don't forward the keystroke to the PTY
    }
    return true;
  });

  term.open(container);

  // Renderer must load after open() — it attaches to the live DOM/canvas.
  try {
    term.loadAddon(new CanvasAddon());
  } catch (err) {
    console.warn(
      '[forze terminal] canvas renderer unavailable, using DOM renderer',
      err,
    );
  }

  fit.fit();
  return { term, fit };
}
