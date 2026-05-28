'use client';

import {
  Award,
  Calendar,
  Eye,
  Heart,
  MessageCircle,
  MessagesSquare,
  Pin,
  Plus,
  Rocket,
  Share2,
  Trophy,
} from 'lucide-react';
import { communityPosts } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const DEMO_DAY = {
  date: 'Friday, May 30',
  submissions: 42,
  spotlight: [
    { rank: 1, name: 'Foxtrot — AI sales coach', votes: 412 },
    { rank: 2, name: 'Northstar — founder OS', votes: 384 },
    { rank: 3, name: 'Quill — writer notebook', votes: 312 },
  ],
};

const LEADERBOARD = [
  { rank: 1, name: 'Ava Chen', rep: 4_124 },
  { rank: 2, name: 'Marco Reyes', rep: 3_882 },
  { rank: 3, name: 'Priya Nair', rep: 3_240 },
  { rank: 4, name: 'Diego Park', rep: 2_910 },
  { rank: 5, name: 'You', rep: 1_847 },
];

const TAG_STYLES: Record<string, string> = {
  'build-log': 'bg-bg-active text-ink-muted',
  showcase: 'bg-accent-soft text-accent border border-accent-border',
  launch: 'bg-ok/10 text-ok',
  milestone: 'bg-warn/10 text-warn',
};

export function CommunityView() {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-bg-base">
      <header className="px-8 py-6 border-b border-line flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <MessagesSquare className="w-5 h-5 text-accent" /> Community
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Build logs, showcases, launches — and Demo Day every Friday.
          </p>
        </div>
        <button className="h-9 px-3 rounded-lg bg-accent text-bg-base hover:bg-accent-bright text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> New post
        </button>
      </header>

      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <section className="space-y-3">
          {communityPosts.map((p) => (
            <article
              key={p.id}
              className="p-4 rounded-xl border border-line bg-bg-surface hover:border-line-strong transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-bg-raised border border-line flex items-center justify-center text-ink-muted text-sm font-medium">
                  {p.author.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink">
                    {p.author}{' '}
                    <span className="text-ink-dim">{p.handle}</span>
                  </div>
                  <div className="text-2xs text-ink-dim">{p.time}</div>
                </div>
                <span
                  className={cn(
                    'text-2xs uppercase tracking-wider px-2 py-0.5 rounded',
                    TAG_STYLES[p.tag] ?? '',
                  )}
                >
                  {p.tag}
                </span>
              </div>
              <p className="mt-3 text-sm text-ink-muted leading-relaxed">
                {p.body}
              </p>
              <div className="mt-3 flex items-center gap-4 text-2xs text-ink-dim">
                <button className="flex items-center gap-1.5 hover:text-accent">
                  <Heart className="w-3.5 h-3.5" /> {p.reactions}
                </button>
                <button className="flex items-center gap-1.5 hover:text-accent">
                  <MessageCircle className="w-3.5 h-3.5" /> {p.comments}
                </button>
                <button className="flex items-center gap-1.5 hover:text-accent ml-auto">
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </article>
          ))}
        </section>

        <aside className="space-y-4">
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Rocket className="w-4 h-4 text-accent" /> Demo Day
            </h3>
            <div className="text-2xs text-ink-dim flex items-center gap-1.5 mb-3">
              <Calendar className="w-3 h-3" /> {DEMO_DAY.date}
            </div>
            <p className="text-xs text-ink-muted mb-3">
              {DEMO_DAY.submissions} products submitted this week.
            </p>
            <ul className="space-y-2">
              {DEMO_DAY.spotlight.map((s) => (
                <li
                  key={s.rank}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-2xs', s.rank === 1 ? 'bg-warn/15 text-warn' : 'bg-bg-active text-ink-muted')}>
                    {s.rank}
                  </span>
                  <span className="text-ink flex-1 truncate">{s.name}</span>
                  <span className="text-ink-dim tabular-nums">{s.votes}</span>
                </li>
              ))}
            </ul>
            <button className="mt-3 w-full h-8 rounded-lg bg-accent text-bg-base text-xs font-medium hover:bg-accent-bright">
              Submit your launch
            </button>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-warn" /> Leaderboard
            </h3>
            <ul className="space-y-1.5">
              {LEADERBOARD.map((u) => (
                <li
                  key={u.rank}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs',
                    u.name === 'You' && 'bg-accent-soft border border-accent-border',
                  )}
                >
                  <span className="w-5 text-ink-dim tabular-nums">{u.rank}</span>
                  <span className="text-ink flex-1">{u.name}</span>
                  <span className="text-ink-dim tabular-nums">{u.rep.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-accent" /> Builder Profile
            </h3>
            <p className="text-xs text-ink-muted">
              Showcase products, milestones, stack, and revenue history. Public profile at{' '}
              <span className="text-accent">vibecode.io/u/arjun</span>.
            </p>
            <button className="mt-3 w-full h-8 rounded-lg border border-line text-xs text-ink-muted hover:bg-bg-hover hover:text-ink flex items-center justify-center gap-1.5">
              <Eye className="w-3 h-3" /> View profile
            </button>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Pin className="w-4 h-4 text-accent" /> Pinned topics
            </h3>
            <ul className="text-xs text-ink-muted space-y-1.5">
              <li className="hover:text-ink cursor-pointer">
                Show HN: VIBECODE for indie hackers
              </li>
              <li className="hover:text-ink cursor-pointer">
                What&apos;s your launch checklist?
              </li>
              <li className="hover:text-ink cursor-pointer">
                Best AI agent recipes for SaaS
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
