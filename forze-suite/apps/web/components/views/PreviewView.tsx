'use client';

import {
  AlertOctagon,
  ExternalLink,
  Eye,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type Device = 'desktop' | 'tablet' | 'mobile';

const SIZES: Record<Device, { w: string; h: string; label: string }> = {
  desktop: { w: '100%', h: '720px', label: '1440 × 900' },
  tablet: { w: '820px', h: '720px', label: '820 × 1180' },
  mobile: { w: '390px', h: '720px', label: '390 × 844' },
};

export function PreviewView() {
  const [device, setDevice] = useState<Device>('desktop');

  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-bg-base">
      <header className="px-8 py-6 border-b border-line flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <Eye className="w-5 h-5 text-accent" /> Live Preview
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Instant refresh, responsive breakpoints, component isolation, error overlay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 px-1 rounded-lg border border-line bg-bg-surface flex items-center gap-0.5">
            {([
              { id: 'desktop', icon: Monitor },
              { id: 'tablet', icon: Tablet },
              { id: 'mobile', icon: Smartphone },
            ] as const).map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setDevice(id)}
                className={cn(
                  'w-9 h-7 rounded-md flex items-center justify-center transition-colors',
                  device === id ? 'bg-bg-active text-accent' : 'text-ink-dim hover:text-ink',
                )}
                title={id}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
          <button className="h-9 px-3 rounded-lg border border-line bg-bg-surface text-ink text-sm flex items-center gap-2 hover:bg-bg-hover">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button className="h-9 px-3 rounded-lg border border-line bg-bg-surface text-ink text-sm flex items-center gap-2 hover:bg-bg-hover">
            <ExternalLink className="w-3.5 h-3.5" />
            Open in new tab
          </button>
        </div>
      </header>

      <div className="px-8 py-6 space-y-4">
        <div className="rounded-xl border border-line bg-bg-surface overflow-hidden">
          <div className="h-10 px-3 border-b border-line flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ok" />
            <span className="text-2xs text-ink-muted font-mono">
              https://saas-starter.vibecode.app
            </span>
            <span className="ml-auto text-2xs text-ink-dim">{SIZES[device].label}</span>
          </div>
          <div className="p-8 flex justify-center bg-bg-base">
            <div
              className="rounded-xl border border-line overflow-hidden bg-bg-surface shadow-card"
              style={{ width: SIZES[device].w, maxWidth: '100%', height: SIZES[device].h }}
            >
              <iframe
                title="Live preview"
                src="about:blank"
                className="w-full h-full bg-bg-surface"
                style={{ background: '#0d0e11' }}
              />
              <div className="-mt-[720px] h-[720px] flex items-center justify-center text-ink-muted p-8 text-center">
                <div>
                  <div className="text-sm text-ink-muted">
                    Your app renders here in real time.
                  </div>
                  <div className="text-2xs text-ink-dim mt-1">
                    Connect a dev server to stream HMR updates.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" /> Performance
            </h3>
            <ul className="text-xs text-ink-muted space-y-1.5">
              <li className="flex items-center justify-between"><span>LCP</span><span className="text-ok tabular-nums">1.2s</span></li>
              <li className="flex items-center justify-between"><span>CLS</span><span className="text-ok tabular-nums">0.02</span></li>
              <li className="flex items-center justify-between"><span>INP</span><span className="text-ok tabular-nums">112ms</span></li>
              <li className="flex items-center justify-between"><span>Bundle</span><span className="text-ink tabular-nums">181 KB</span></li>
            </ul>
          </div>
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-warn" /> Error overlay
            </h3>
            <p className="text-xs text-ink-muted">
              Runtime errors are caught and shown inline with stack traces — click a frame to jump to the source.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-accent" /> Browser emulation
            </h3>
            <p className="text-xs text-ink-muted">
              Chrome 126, Safari 17, Firefox 128 — switch UA from the device toolbar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
