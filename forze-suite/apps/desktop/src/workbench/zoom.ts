/**
 * Window zoom — VS Code-style Ctrl+= / Ctrl+- / Ctrl+0. Applies CSS `zoom`
 * on the root element (supported by the Chromium engine under both WebView2
 * and plain-browser dev) and persists the level so it survives restarts.
 */

const KEY = 'forze.zoom.v1';
/** Discrete steps, matching the feel of VS Code's zoom levels. */
const LEVELS = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2];

let level = 1;

function apply(): void {
  document.documentElement.style.setProperty('zoom', String(level));
}

function save(): void {
  try {
    localStorage.setItem(KEY, String(level));
  } catch {
    /* storage unavailable — zoom still applies for this session */
  }
}

/** Restore the persisted zoom level. Call once at boot. */
export function initZoom(): void {
  try {
    const saved = Number(localStorage.getItem(KEY));
    if (LEVELS.includes(saved)) level = saved;
  } catch {
    /* first run */
  }
  if (level !== 1) apply();
}

export function zoomIn(): void {
  level = LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(level) + 1)] ?? 1;
  apply();
  save();
}

export function zoomOut(): void {
  level = LEVELS[Math.max(0, LEVELS.indexOf(level) - 1)] ?? 1;
  apply();
  save();
}

export function zoomReset(): void {
  level = 1;
  apply();
  save();
}
