'use client';

import {
  BarChart3,
  Film,
  Image as ImageIcon,
  Layers,
  Megaphone,
  PenSquare,
  Play,
  Plus,
  Send,
  Sparkles,
  Target,
} from 'lucide-react';
import { useState } from 'react';
import { ads, type Ad } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<Ad['status'], string> = {
  live: 'text-ok',
  paused: 'text-warn',
  draft: 'text-ink-dim',
};

const FORMAT_ICONS: Record<Ad['format'], typeof ImageIcon> = {
  banner: ImageIcon,
  social: Megaphone,
  video: Film,
  native: Layers,
};

const CHANNELS = [
  { id: 'twitter', label: 'Twitter / X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'ih', label: 'Indie Hackers' },
];

export function AdStudioView() {
  const [prompt, setPrompt] = useState('Launch announcement for our AI dashboard');

  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-bg-base">
      <header className="px-8 py-6 border-b border-line flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-accent" />
            Ad Studio
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Generate, launch, and measure ads directly inside the IDE.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-3 rounded-lg border border-line bg-bg-raised hover:bg-bg-hover text-ink text-sm flex items-center gap-2">
            <Target className="w-4 h-4" /> Targeting
          </button>
          <button className="h-9 px-3 rounded-lg bg-accent text-bg-base hover:bg-accent-bright text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        </div>
      </header>

      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          <section className="p-4 rounded-xl border border-line bg-bg-surface">
            <h2 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" /> AI Ad Generator
            </h2>
            <div className="flex items-center gap-2 h-11 px-3 rounded-xl border border-line bg-bg-base focus-within:border-accent-border">
              <PenSquare className="w-4 h-4 text-ink-dim" />
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the ad you want…"
                className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-dim"
              />
              <button className="h-7 px-3 rounded-md bg-accent text-bg-base text-xs font-medium hover:bg-accent-bright flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" /> Generate
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              {[
                'Banner — Twitter Header',
                'Social — Carousel × 4',
                'Video — 15s vertical',
              ].map((variant, i) => (
                <div
                  key={i}
                  className="aspect-[4/3] rounded-xl border border-line bg-bg-base flex flex-col"
                >
                  <div className="flex-1 m-2 rounded-lg border border-line-subtle bg-bg-surface flex items-center justify-center text-ink-dim text-2xs">
                    {variant}
                  </div>
                  <div className="px-3 py-2 flex items-center justify-between border-t border-line-subtle">
                    <span className="text-2xs text-ink-muted">{variant}</span>
                    <button className="text-2xs text-accent">Use</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" /> Live Campaigns
            </h2>
            <div className="rounded-xl border border-line bg-bg-surface overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-2xs text-ink-dim border-b border-line">
                    <th className="px-4 py-2 font-normal">Name</th>
                    <th className="px-4 py-2 font-normal">Format</th>
                    <th className="px-4 py-2 font-normal">Status</th>
                    <th className="px-4 py-2 font-normal">Impressions</th>
                    <th className="px-4 py-2 font-normal">Clicks</th>
                    <th className="px-4 py-2 font-normal">CTR</th>
                    <th className="px-4 py-2 font-normal">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((a) => {
                    const Icon = FORMAT_ICONS[a.format];
                    const ctr =
                      a.impressions === 0
                        ? '—'
                        : `${((a.clicks / a.impressions) * 100).toFixed(2)}%`;
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-line-subtle last:border-0 hover:bg-bg-hover"
                      >
                        <td className="px-4 py-3 text-ink">{a.name}</td>
                        <td className="px-4 py-3 text-xs text-ink-muted flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-ink-dim" />
                          {a.format}
                        </td>
                        <td className={cn('px-4 py-3 text-xs', STATUS_STYLES[a.status])}>
                          {a.status}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-muted tabular-nums">
                          {a.impressions.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-muted tabular-nums">
                          {a.clicks.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-muted tabular-nums">{ctr}</td>
                        <td className="px-4 py-3 text-xs text-ink tabular-nums">${a.spend}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-line bg-bg-surface">
              <h3 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" /> Builder Promotion Marketplace
              </h3>
              <p className="text-xs text-ink-muted mb-3">
                Sponsor placements directly in the builder community.
              </p>
              <ul className="text-xs text-ink-muted space-y-1.5">
                <li>· Featured project on homepage — $99/day</li>
                <li>· Community feed pin — $49/day</li>
                <li>· Demo Day boost — $199</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl border border-line bg-bg-surface">
              <h3 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
                <PenSquare className="w-4 h-4 text-accent" /> Social Content Generator
              </h3>
              <ul className="text-xs text-ink-muted space-y-1.5">
                <li>· Twitter / X threads</li>
                <li>· LinkedIn posts</li>
                <li>· Product launch posts</li>
                <li>· Reddit launch drafts</li>
                <li>· YouTube scripts</li>
                <li>· Blog posts</li>
              </ul>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3">Spend This Month</h3>
            <div className="text-3xl font-semibold text-ink tabular-nums">$442</div>
            <p className="text-2xs text-ink-dim mt-1">Budget $1,000 · 44% used</p>
            <div className="mt-3 h-2 rounded-full bg-bg-active overflow-hidden">
              <div className="h-full bg-accent" style={{ width: '44%' }} />
            </div>
            <ul className="mt-3 text-xs text-ink-muted space-y-1.5">
              <li className="flex items-center justify-between">
                <span>Twitter</span><span className="tabular-nums">$312</span>
              </li>
              <li className="flex items-center justify-between">
                <span>IH Banner</span><span className="tabular-nums">$89</span>
              </li>
              <li className="flex items-center justify-between">
                <span>YouTube</span><span className="tabular-nums">$41</span>
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3">Channels</h3>
            <ul className="space-y-1.5">
              {CHANNELS.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover text-xs text-ink-muted"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  {c.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
              <Play className="w-4 h-4 text-accent" /> A/B Test
            </h3>
            <p className="text-xs text-ink-muted">
              &quot;Launch v3&quot; vs &quot;Launch v3 + social proof.&quot; Significance reached at p &lt; 0.04.
            </p>
            <button className="mt-3 h-8 px-3 rounded-lg bg-accent text-bg-base text-xs font-medium hover:bg-accent-bright">
              Promote winner
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
