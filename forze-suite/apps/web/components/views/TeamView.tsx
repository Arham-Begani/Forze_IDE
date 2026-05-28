'use client';

import {
  CalendarClock,
  CheckSquare,
  Headphones,
  ListTodo,
  MessageSquare,
  Mic2,
  Plus,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';
import { teamMatches } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const VOICE_ROOMS = [
  { id: 'r1', name: 'Daily standup', participants: 3, live: true },
  { id: 'r2', name: 'Design review', participants: 1, live: false },
  { id: 'r3', name: 'Pair on Stripe webhook', participants: 2, live: true },
];

const TASKS = {
  todo: [
    { id: 't1', label: 'Wire Stripe webhook signature verification' },
    { id: 't2', label: 'Add empty state to Settings' },
    { id: 't3', label: 'Migrate auth to passkeys' },
  ],
  doing: [
    { id: 't4', label: 'Refactor dashboard stats grid' },
    { id: 't5', label: 'Launch tweet thread' },
  ],
  done: [
    { id: 't6', label: 'Onboarding tooltip pass' },
    { id: 't7', label: 'OG image generator' },
  ],
};

const SPRINT = { name: 'Sprint 14 — Launch week', progress: 64, days: 3 };

export function TeamView() {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-bg-base">
      <header className="px-8 py-6 border-b border-line flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <Users className="w-5 h-5 text-accent" /> Team
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Multiplayer editing, voice rooms, tasks, and co-founder matching.
          </p>
        </div>
        <button className="h-9 px-3 rounded-lg bg-accent text-bg-base hover:bg-accent-bright text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> Invite member
        </button>
      </header>

      <div className="px-8 py-6 space-y-6">
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Mic2 className="w-4 h-4 text-accent" /> Voice Rooms
            </h3>
            <ul className="space-y-2">
              {VOICE_ROOMS.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 p-2 rounded-lg border border-line hover:border-line-strong"
                >
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      r.live ? 'bg-ok animate-pulse-dot' : 'bg-ink-faint',
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">{r.name}</div>
                    <div className="text-2xs text-ink-dim">{r.participants} participants</div>
                  </div>
                  <button className="h-7 px-2 text-2xs rounded-md border border-line text-ink-muted hover:bg-bg-hover flex items-center gap-1">
                    <Headphones className="w-3 h-3" /> Join
                  </button>
                </li>
              ))}
            </ul>
            <button className="mt-3 w-full h-8 rounded-lg border border-dashed border-line text-2xs text-ink-muted hover:border-accent-border hover:text-accent flex items-center justify-center gap-1.5">
              <Video className="w-3 h-3" /> Start screen share
            </button>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" /> Shared AI Context
            </h3>
            <p className="text-xs text-ink-muted">
              Everyone on the team sees the same AI memory: brand voice, design
              system, stack choices, and product brief.
            </p>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-ink-muted"><span>Brand voice</span><span className="text-ink">Synced</span></div>
              <div className="flex justify-between text-ink-muted"><span>Design system</span><span className="text-ink">Synced</span></div>
              <div className="flex justify-between text-ink-muted"><span>Product brief</span><span className="text-ink">Synced</span></div>
              <div className="flex justify-between text-ink-muted"><span>Prior decisions</span><span className="text-ink">12 notes</span></div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-accent" /> Sprint
            </h3>
            <div className="text-sm text-ink">{SPRINT.name}</div>
            <div className="text-2xs text-ink-dim mb-2">{SPRINT.days} days remaining</div>
            <div className="h-2 rounded-full bg-bg-active overflow-hidden">
              <div className="h-full bg-accent" style={{ width: `${SPRINT.progress}%` }} />
            </div>
            <p className="text-2xs text-ink-dim mt-2">{SPRINT.progress}% complete</p>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-accent" /> Task Board
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: 'Todo', items: TASKS.todo, tint: 'border-line' },
              { label: 'In progress', items: TASKS.doing, tint: 'border-accent-border' },
              { label: 'Done', items: TASKS.done, tint: 'border-line' },
            ].map((col) => (
              <div
                key={col.label}
                className={cn('p-3 rounded-xl border bg-bg-surface', col.tint)}
              >
                <div className="flex items-center justify-between text-2xs uppercase tracking-wider text-ink-dim mb-2">
                  <span>{col.label}</span>
                  <span>{col.items.length}</span>
                </div>
                <ul className="space-y-1.5">
                  {col.items.map((i) => (
                    <li
                      key={i.id}
                      className="p-2.5 rounded-lg border border-line bg-bg-base text-xs text-ink-muted hover:border-line-strong flex items-start gap-2"
                    >
                      <CheckSquare className="w-3 h-3 text-ink-dim mt-0.5" />
                      {i.label}
                    </li>
                  ))}
                  <li>
                    <button className="w-full h-8 rounded-lg border border-dashed border-line text-2xs text-ink-dim hover:border-accent-border hover:text-accent flex items-center justify-center gap-1.5">
                      <Plus className="w-3 h-3" /> Add task
                    </button>
                  </li>
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" /> Team Matching
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {teamMatches.map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-xl border border-line bg-bg-surface"
              >
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-bg-raised border border-line flex items-center justify-center text-ink-muted text-sm font-medium">
                    {m.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <div className="text-sm text-ink">{m.name}</div>
                    <div className="text-2xs text-ink-dim">{m.role}</div>
                  </div>
                  <div className="ml-auto text-2xs text-accent">{m.matchScore}%</div>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {m.skills.map((s) => (
                    <span
                      key={s}
                      className="text-2xs px-1.5 py-0.5 rounded bg-bg-active text-ink-muted"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <div className="text-2xs text-ink-dim mt-3">{m.availability}</div>
                <button className="mt-3 w-full h-8 rounded-lg border border-line text-2xs text-ink-muted hover:bg-bg-hover hover:text-ink flex items-center justify-center gap-1.5">
                  <MessageSquare className="w-3 h-3" /> Message
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
