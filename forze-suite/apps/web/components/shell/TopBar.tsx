'use client';

import {
  Bell,
  ChevronDown,
  Megaphone,
  Rocket,
  Search,
  Sun,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { Logo } from './Logo';

export function TopBar() {
  const setPaletteOpen = useStore((s) => s.setCommandPaletteOpen);
  const setActivity = useStore((s) => s.setActiveActivity);

  return (
    <header className="h-14 flex items-center px-4 gap-3 border-b border-line bg-bg-base">
      <div className="flex items-center gap-2 pr-2">
        <Logo size={28} />
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          VIBECODE
        </span>
      </div>

      <button
        type="button"
        className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-bg-raised hover:bg-bg-hover transition-colors text-sm"
      >
        <span className="w-2 h-2 rounded-full bg-accent" />
        <span className="text-ink">SaaS Starter</span>
        <span className="text-2xs uppercase tracking-wider text-accent bg-accent-soft border border-accent-border rounded px-1.5 py-0.5">
          Pro
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-ink-dim" />
      </button>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex-1 max-w-[640px] mx-auto flex items-center h-9 px-3 rounded-lg border border-line bg-bg-raised hover:border-line-strong hover:bg-bg-hover transition-colors group"
      >
        <Search className="w-4 h-4 text-ink-dim group-hover:text-ink-muted" />
        <span className="ml-2 text-sm text-ink-dim">
          Search files, prompts, commands…
        </span>
        <span className="ml-auto text-2xs text-ink-faint border border-line rounded px-1.5 py-0.5 font-mono">
          ⌘ K
        </span>
      </button>

      <div className="flex items-center gap-2">
        <button className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-hover hover:text-ink transition-colors">
          <Sun className="w-4 h-4" />
        </button>
        <button className="h-9 px-3 rounded-lg bg-accent text-bg-base hover:bg-accent-bright transition-colors flex items-center gap-2 text-sm font-medium">
          <Rocket className="w-4 h-4" />
          Deploy
        </button>
        <button
          onClick={() => setActivity('ad-studio')}
          className="h-9 px-3 rounded-lg border border-line bg-bg-raised hover:bg-bg-hover transition-colors flex items-center gap-2 text-sm text-ink"
        >
          <Megaphone className="w-4 h-4" />
          Ad Studio
        </button>
        <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-hover hover:text-ink transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2.5 w-1.5 h-1.5 rounded-full bg-accent" />
        </button>
        <div className="w-9 h-9 rounded-lg overflow-hidden border border-line-strong bg-bg-raised flex items-center justify-center text-ink-muted text-sm font-medium relative">
          A
          <span className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-ok border border-bg-base" />
        </div>
      </div>
    </header>
  );
}
