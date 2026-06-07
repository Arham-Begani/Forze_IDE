interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible label (also used as the title tooltip). */
  label: string;
  disabled?: boolean;
  id?: string;
}

/**
 * A small, theme-aware on/off switch. Renders as a real `role="switch"` button
 * so it's keyboard- and screen-reader-friendly. Styles live under `.toggle`
 * in index.css.
 */
export default function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  id,
}: ToggleSwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__thumb" />
    </button>
  );
}
