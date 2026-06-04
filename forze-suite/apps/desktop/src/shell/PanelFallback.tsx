/**
 * Suspense fallback shown while a lazily-loaded view or skill page is being
 * fetched. Deliberately minimal and theme-matched so a code-split panel swaps
 * in without a jarring flash.
 */
export default function PanelFallback(): JSX.Element {
  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-dim)',
        fontSize: 'var(--font-size-sm)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      Loading…
    </div>
  );
}
