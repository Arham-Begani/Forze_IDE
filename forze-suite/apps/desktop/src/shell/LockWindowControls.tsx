import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Minimal minimize / maximize / close for the locked auth screen. The full
 * TitleBar lives inside the unlocked app, so before sign-in this borderless
 * window would otherwise have no way to be moved or closed. Reuses the
 * title bar's `titlebar__win-btn` styling.
 */
export default function LockWindowControls(): JSX.Element {
  const call = (fn: 'minimize' | 'toggleMaximize' | 'close') => () => {
    try {
      void getCurrentWindow()[fn]();
    } catch {
      /* not running under Tauri (e.g. plain browser preview) */
    }
  };

  return (
    <div className="auth__winctl">
      <button
        type="button"
        className="titlebar__win-btn"
        title="Minimize"
        onClick={call('minimize')}
      >
        <Minus size={15} />
      </button>
      <button
        type="button"
        className="titlebar__win-btn"
        title="Maximize"
        onClick={call('toggleMaximize')}
      >
        <Square size={12} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className="titlebar__win-btn titlebar__win-btn--close"
        title="Close"
        onClick={call('close')}
      >
        <X size={16} />
      </button>
    </div>
  );
}
