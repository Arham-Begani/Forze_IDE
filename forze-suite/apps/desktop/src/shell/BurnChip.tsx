import { useMemo, useState } from 'react';
import { Coins } from 'lucide-react';
import {
  MODULE_LABELS,
  useUsageLimits,
  type UsageModule,
} from '../workbench/usageLimitsStore';
import { costSummary, formatUsd } from '../lib/pricing';

/**
 * Status-bar Burn Meter: the estimated AI $ spent today across EVERY source —
 * the built-in Gemini key, BYOK Claude/Gemini, and image gen. (BYOK spend used
 * to be completely invisible.) Self-subscribes to the usage store so it needs no
 * props from the shell. Click for a per-provider / per-module breakdown.
 */
export default function BurnChip(): JSX.Element {
  const events = useUsageLimits((s) => s.events);
  const [open, setOpen] = useState(false);

  // Date.now() in render is fine here (not a hook); recompute only on new events.
  const summary = useMemo(() => costSummary(events, Date.now()), [events]);

  const providerLabel = (id: string): string =>
    id === 'anthropic' ? 'Claude' : id === 'gemini' ? 'Gemini' : id;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="status-bar__chip"
        onClick={() => setOpen((v) => !v)}
        title="AI spend today (estimated, all keys) — click for a breakdown"
      >
        <Coins size={11} strokeWidth={1.8} />
        {formatUsd(summary.costToday)}
      </button>

      {open && (
        <>
          <div
            role="presentation"
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 60 }}
          />
          <div
            role="dialog"
            aria-label="AI spend breakdown"
            style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 8,
              width: 268,
              zIndex: 61,
              background: 'var(--panel, #1c1c22)',
              border: '1px solid var(--border, rgba(128,128,128,0.3))',
              borderRadius: 10,
              boxShadow: '0 14px 40px rgba(0,0,0,0.4)',
              padding: 12,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ opacity: 0.7 }}>Estimated spend today</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{formatUsd(summary.costToday)}</span>
            </div>

            {summary.byProvider.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {summary.byProvider.map((p) => (
                  <span
                    key={p.provider}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'rgba(128,128,128,0.16)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {providerLabel(p.provider)} {formatUsd(p.cost)}
                  </span>
                ))}
              </div>
            )}

            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {summary.byModule.length === 0 ? (
                <span style={{ opacity: 0.55 }}>No AI calls yet today.</span>
              ) : (
                summary.byModule.map((m) => (
                  <div
                    key={m.module}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                  >
                    <span style={{ opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {MODULE_LABELS[m.module as UsageModule] ?? m.module}
                    </span>
                    <span style={{ display: 'inline-flex', gap: 8, flex: '0 0 auto' }}>
                      <span style={{ opacity: 0.45, fontVariantNumeric: 'tabular-nums' }}>
                        {m.tokens > 0 ? `${(m.tokens / 1000).toFixed(1)}k tok` : ''}
                      </span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'right' }}>
                        {formatUsd(m.cost)}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>

            <p style={{ marginTop: 10, opacity: 0.5, fontSize: 10.5, lineHeight: 1.4 }}>
              Estimates from token counts × list prices; resets at local midnight.
              BYOK is unlimited — this only shows spend, never blocks it.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
