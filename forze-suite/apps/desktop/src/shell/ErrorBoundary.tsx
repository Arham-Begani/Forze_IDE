import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional label for which region failed (e.g. "Editor", "Dashboard"). */
  scope?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/runtime errors in its subtree so a single broken view never
 * blanks the whole window. Shows the error + a Reset button instead of a dark
 * screen, and logs to the console for diagnosis.
 */
export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(`[forze] render error${this.props.scope ? ` in ${this.props.scope}` : ''}:`, error, info);
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 32,
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          background: 'var(--color-bg)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: '1px solid var(--color-danger)',
            color: 'var(--color-danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
          }}
        >
          !
        </div>
        <h3 style={{ margin: 0, color: 'var(--color-text)', fontSize: 'var(--font-size-lg)' }}>
          {this.props.scope ? `${this.props.scope} hit an error` : 'Something went wrong'}
        </h3>
        <p
          style={{
            margin: 0,
            maxWidth: 520,
            fontSize: 'var(--font-size-sm)',
            lineHeight: 1.5,
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-dim)',
            wordBreak: 'break-word',
          }}
        >
          {error.message || String(error)}
        </p>
        <button type="button" className="btn-primary" onClick={this.reset}>
          Reset view
        </button>
      </div>
    );
  }
}
