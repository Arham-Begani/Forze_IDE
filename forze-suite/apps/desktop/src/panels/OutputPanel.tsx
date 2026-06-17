import { Terminal } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface OutputPanelProps {
  logs: string[];
}

export default function OutputPanel({ logs }: OutputPanelProps): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="placeholder-view" style={{ height: '100%' }}>
        <Terminal size={28} strokeWidth={1.4} aria-hidden />
        <h3>No output</h3>
        <p>
          Dev-server logs streamed from the Tauri sidecar will appear here.
          Run <code>pnpm dev</code> from the terminal.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '12px 16px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-sm)',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        color: 'var(--color-text)',
        background: 'var(--color-bg)',
      }}
    >
      {logs.map((line, index) => (
        <div key={`${index}-${line.slice(0, 32)}`}>{line}</div>
      ))}
    </div>
  );
}
