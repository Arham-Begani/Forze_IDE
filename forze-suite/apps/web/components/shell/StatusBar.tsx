'use client';

import { Check, GitBranch, Sparkles, Wifi } from 'lucide-react';
import { useStore } from '@/lib/store';
import { problems } from '@/lib/mock-data';

export function StatusBar() {
  const activeTab = useStore((s) => {
    const path = s.activeTabPath;
    return s.editorTabs.find((t) => t.path === path) ?? null;
  });

  return (
    <footer className="h-7 border-t border-line bg-bg-base flex items-center px-3 gap-3 text-2xs text-ink-muted">
      <span className="flex items-center gap-1.5">
        <GitBranch className="w-3 h-3 text-ink-dim" />
        main
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-ok" />
        Synced
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-danger" />
        {problems.filter((p) => p.severity === 'error').length} errors
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-warn" />
        {problems.filter((p) => p.severity === 'warn').length} warnings
      </span>
      <span className="ml-auto flex items-center gap-3">
        {activeTab && (
          <span className="uppercase tracking-wider text-ink-dim">{activeTab.language}</span>
        )}
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-accent" />
          Opus 4.7
        </span>
        <span className="flex items-center gap-1.5">
          <Wifi className="w-3 h-3 text-ok" />
          Online
        </span>
        <span className="flex items-center gap-1.5">
          <Check className="w-3 h-3 text-ok" />
          Auto-save
        </span>
      </span>
    </footer>
  );
}
