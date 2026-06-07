import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Invisible drag strips along the window edges/corners. With native decorations
 * off (custom title bar), Windows no longer draws resize borders, so we provide
 * our own: each strip starts an OS-level resize-drag in its direction. Rendered
 * once at the app root, above everything, but only the thin edges capture input.
 */

// ResizeDirection is a non-exported string union in @tauri-apps/api; the literals
// below are assignable to it.
type Dir =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'NorthEast'
  | 'NorthWest'
  | 'SouthEast'
  | 'SouthWest';

function startResize(dir: Dir): void {
  try {
    void getCurrentWindow().startResizeDragging(dir);
  } catch {
    /* not running under Tauri */
  }
}

const EDGES: { dir: Dir; className: string }[] = [
  { dir: 'North', className: 'wr wr--n' },
  { dir: 'South', className: 'wr wr--s' },
  { dir: 'East', className: 'wr wr--e' },
  { dir: 'West', className: 'wr wr--w' },
  { dir: 'NorthWest', className: 'wr wr--nw' },
  { dir: 'NorthEast', className: 'wr wr--ne' },
  { dir: 'SouthWest', className: 'wr wr--sw' },
  { dir: 'SouthEast', className: 'wr wr--se' },
];

export default function WindowResizers(): JSX.Element {
  return (
    <>
      {EDGES.map((e) => (
        <div
          key={e.dir}
          className={e.className}
          onMouseDown={(ev) => {
            // Only a primary-button press should initiate a resize.
            if (ev.button !== 0) return;
            startResize(e.dir);
          }}
        />
      ))}
    </>
  );
}
