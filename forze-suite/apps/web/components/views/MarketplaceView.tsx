'use client';

import { Filter, Search, ShoppingBag, Star, Tag } from 'lucide-react';
import { marketplaceItems } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const CATEGORIES = ['All', 'UI Kit', 'Component', 'Template', 'AI Workflow', 'Backend', 'Animation', 'Plugin'] as const;

export function MarketplaceView() {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('All');
  const items = cat === 'All' ? marketplaceItems : marketplaceItems.filter((i) => i.category === cat);

  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-bg-base">
      <header className="px-8 py-6 border-b border-line flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-accent" /> Marketplace
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Buy and sell components, kits, AI workflows, and plugins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-3 rounded-lg border border-line bg-bg-raised hover:bg-bg-hover text-ink text-sm flex items-center gap-2">
            <Tag className="w-4 h-4" /> Sell on Marketplace
          </button>
        </div>
      </header>

      <div className="px-8 py-5 border-b border-line flex items-center gap-3 flex-wrap">
        <div className="flex items-center h-9 px-3 rounded-lg border border-line bg-bg-surface focus-within:border-accent-border min-w-[320px]">
          <Search className="w-4 h-4 text-ink-dim" />
          <input
            placeholder="Search the marketplace…"
            className="ml-2 bg-transparent outline-none text-sm text-ink placeholder:text-ink-dim w-full"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                'h-7 px-3 text-xs rounded-full border transition-colors',
                cat === c
                  ? 'bg-accent-soft text-accent border-accent-border'
                  : 'border-line text-ink-muted hover:text-ink hover:bg-bg-hover',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <button className="ml-auto h-9 px-3 rounded-lg border border-line text-xs text-ink-muted hover:bg-bg-hover flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5" /> Filters
        </button>
      </div>

      <div className="px-8 py-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-line bg-bg-surface overflow-hidden hover:border-line-strong transition-colors"
          >
            <div className="aspect-[4/3] bg-bg-base border-b border-line flex items-center justify-center text-ink-dim text-2xs uppercase tracking-wider">
              {item.category}
            </div>
            <div className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-ink truncate">{item.name}</div>
                  <div className="text-2xs text-ink-dim">{item.author}</div>
                </div>
                <div className="text-sm text-ink font-medium">
                  {item.price === 'Free' ? (
                    <span className="text-ok">Free</span>
                  ) : (
                    `$${item.price}`
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-2xs text-ink-dim">
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-warn" />
                  {item.rating}
                </span>
                <span>{item.downloads} downloads</span>
              </div>
              <button className="mt-3 w-full h-8 rounded-lg bg-accent text-bg-base text-xs font-medium hover:bg-accent-bright">
                {item.price === 'Free' ? 'Install' : 'Buy & install'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="px-8 pb-8 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border border-line bg-bg-surface">
          <h3 className="text-sm font-medium text-ink mb-2">Plugin Marketplace</h3>
          <p className="text-xs text-ink-muted">
            Install third-party plugins to extend the IDE: AI providers, deployment targets, design tools, and analytics integrations.
          </p>
        </div>
        <div className="p-4 rounded-xl border border-line bg-bg-surface">
          <h3 className="text-sm font-medium text-ink mb-2">Prompt Marketplace</h3>
          <p className="text-xs text-ink-muted">
            Share, sell, and rate prompt packs and agent templates. Creators earn 70% revenue share.
          </p>
        </div>
      </div>
    </div>
  );
}
