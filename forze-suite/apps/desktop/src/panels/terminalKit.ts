import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { CanvasAddon } from '@xterm/addon-canvas';

/**
 * Shared xterm wiring for every terminal in the app (the bottom-panel
 * `XtermView` and the Vibe-Stations `VibeTerminal`). Centralising it means the
 * premium feel — GPU rendering, smooth scroll, crisp cursor, accent selection —
 * is defined once and can never drift between the two surfaces.
 */

/** ANSI palette for the dark themes (the matte-black canvas). */
const DARK_XTERM_THEME: ITheme = {
  background: '#050505',
  foreground: '#e4e4e7',
  cursor: '#eaf9ff',
  cursorAccent: '#050505',
  // Selection picks up the brand accent so highlighting feels part of the IDE,
  // and dims when the terminal loses focus — the native, expensive-feeling cue.
  selectionBackground: 'rgba(0, 212, 255, 0.26)',
  selectionInactiveBackground: 'rgba(228, 228, 231, 0.10)',
  selectionForeground: undefined,
  black: '#050505',
  red: '#ff7170',
  green: '#7ee787',
  yellow: '#d7d7d7',
  blue: '#00d4ff',
  magenta: '#74ecff',
  cyan: '#9cdcfe',
  white: '#dcdde6',
  brightBlack: '#5a5d68',
  brightRed: '#ff9090',
  brightGreen: '#9ae6a4',
  brightYellow: '#e5e5e5',
  brightBlue: '#74ecff',
  brightMagenta: '#a9f4ff',
  brightCyan: '#c9efff',
  brightWhite: '#f4f4f7',
};

/** ANSI palette for the Daylight (light) theme — white canvas, dark ink. */
const LIGHT_XTERM_THEME: ITheme = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#0e7490',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(14, 116, 144, 0.20)',
  selectionInactiveBackground: 'rgba(15, 23, 42, 0.08)',
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
  term.loadAddon(new WebLinksAddon());

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
