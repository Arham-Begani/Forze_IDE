'use client';

import {
  Bot,
  Code2,
  Database,
  Eye,
  MessagesSquare,
  Rocket,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
} from 'lucide-react';
import { useStore, type ActivityId } from '@/lib/store';
import { cn } from '@/lib/utils';
import { buildStreak } from '@/lib/mock-data';

const items: { id: ActivityId; icon: typeof Code2; label: string }[] = [
  { id: 'code', icon: Code2, label: 'Code' },
  { id: 'agent', icon: Bot, label: 'AI Agent' },
  { id: 'preview', icon: Eye, label: 'Preview' },
  { id: 'deployments', icon: Rocket, label: 'Deployments' },
  { id: 'analytics', icon: Sparkles, label: 'Analytics' },
  { id: 'database', icon: Database, label: 'Database' },
  { id: 'team', icon: Users, label: 'Team' },
  { id: 'marketplace', icon: ShoppingBag, label: 'Marketplace' },
  { id: 'community', icon: MessagesSquare, label: 'Community' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export function ActivityBar() {
  const active = useStore((s) => s.activeActivity);
  const setActive = useStore((s) => s.setActiveActivity);

  return (
    <aside className="w-52 flex flex-col bg-bg-surface border-r border-line">
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={cn(
                'w-full flex items-center gap-3 h-10 px-3 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-bg-raised text-ink border border-line'
                  : 'text-ink-muted hover:bg-bg-hover hover:text-ink border border-transparent',
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="m-3 p-3 rounded-xl border border-line bg-bg-raised">
        <div className="flex items-center gap-2 text-xs text-ink-muted mb-2">
          <span>Build Streak</span>
          <span className="text-warn">●</span>
        </div>
        <div className="flex items-baseline gap-1.5 mb-2">
          <span className="text-2xl font-semibold text-ink">{buildStreak.days}</span>
          <span className="text-2xs text-ink-dim">days</span>
        </div>
        <p className="text-2xs text-ink-dim mb-3">Keep building!</p>
        <div className="grid grid-cols-7 gap-1">
          {buildStreak.week.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-2xs',
                  d.done
                    ? i === buildStreak.todayDoneIndex
                      ? 'bg-accent text-bg-base'
                      : 'bg-ok/20 text-ok'
                    : 'border border-line text-ink-faint',
                )}
              >
                {d.done ? '✓' : ''}
              </div>
              <span className="text-2xs text-ink-faint">{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="m-3 mt-0 p-2 rounded-xl border border-line bg-bg-raised flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-bg-active text-ink-muted flex items-center justify-center text-sm font-medium">
          A
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink truncate flex items-center gap-1">
            Arjun <span className="text-accent text-2xs">⚡</span>
          </div>
          <div className="text-2xs text-ink-dim">Pro Plan</div>
        </div>
        <button className="text-ink-dim hover:text-ink p-1 rounded">
          <span className="block leading-none">···</span>
        </button>
      </div>
    </aside>
  );
}
