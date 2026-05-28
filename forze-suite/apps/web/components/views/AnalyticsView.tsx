'use client';

import {
  Activity,
  Award,
  Flame,
  Hash,
  Rocket,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  achievements,
  builderMetrics,
  kpis,
  revenueSeries,
  topReferrers,
} from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const userSeries = [
  { day: 'Mon', value: 412 },
  { day: 'Tue', value: 528 },
  { day: 'Wed', value: 491 },
  { day: 'Thu', value: 612 },
  { day: 'Fri', value: 720 },
  { day: 'Sat', value: 380 },
  { day: 'Sun', value: 442 },
];

export function AnalyticsView() {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto bg-bg-base">
      <header className="px-8 py-6 border-b border-line">
        <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" /> Analytics
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Product, revenue, growth, and builder metrics.
        </p>
      </header>

      <div className="px-8 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="p-4 rounded-xl border border-line bg-bg-surface"
            >
              <div className="text-2xs text-ink-dim">{k.label}</div>
              <div className="text-2xl font-semibold text-ink mt-1 tabular-nums">
                {k.value}
              </div>
              <div className="text-xs text-ok mt-1">{k.delta}</div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3">Revenue (MRR)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries}>
                  <XAxis dataKey="month" stroke="#4a505a" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#4a505a" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ background: '#111317', border: '1px solid #1f232b', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#a4a9b4' }} />
                  <Area type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={2} fill="#22d3ee" fillOpacity={0.14} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3">Traffic Sources</h3>
            <div className="h-64 flex items-center">
              <div className="w-40 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topReferrers}
                      dataKey="value"
                      innerRadius={48}
                      outerRadius={70}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {topReferrers.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 text-xs space-y-1.5">
                {topReferrers.map((r) => (
                  <li key={r.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                    <span className="text-ink-muted">{r.name}</span>
                    <span className="ml-auto tabular-nums text-ink-dim">{r.value}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3">New users this week</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userSeries}>
                  <XAxis dataKey="day" stroke="#4a505a" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#4a505a" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(34,211,238,0.05)' }} contentStyle={{ background: '#111317', border: '1px solid #1f232b', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#a4a9b4' }} />
                  <Bar dataKey="value" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Hash className="w-4 h-4 text-accent" /> Engagement
            </h3>
            <ul className="text-xs text-ink-muted space-y-2">
              <li className="flex items-center justify-between">
                <span>DAU / MAU</span><span className="text-ink tabular-nums">0.42</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Avg session</span><span className="text-ink tabular-nums">8m 12s</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Bounce rate</span><span className="text-ink tabular-nums">21%</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Activation</span><span className="text-ink tabular-nums">57%</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Stickiness</span><span className="text-ink tabular-nums">68%</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Flame className="w-4 h-4 text-warn" /> Builder Metrics
            </h3>
            <ul className="text-xs text-ink-muted space-y-2">
              <li className="flex items-center justify-between"><span>Build streak</span><span className="text-ink tabular-nums">{builderMetrics.buildStreak} days</span></li>
              <li className="flex items-center justify-between"><span>Deploys</span><span className="text-ink tabular-nums">{builderMetrics.deployCount}</span></li>
              <li className="flex items-center justify-between"><span>Revenue</span><span className="text-ink tabular-nums">{builderMetrics.revenue}</span></li>
              <li className="flex items-center justify-between"><span>Users</span><span className="text-ink tabular-nums">{builderMetrics.users}</span></li>
              <li className="flex items-center justify-between"><span>Launches</span><span className="text-ink tabular-nums">{builderMetrics.launches}</span></li>
              <li className="flex items-center justify-between"><span>Coding hours</span><span className="text-ink tabular-nums">{builderMetrics.codingHours}</span></li>
              <li className="flex items-center justify-between"><span>Reputation</span><span className="text-ink tabular-nums">{builderMetrics.reputation.toLocaleString()}</span></li>
            </ul>
          </div>
          <div className="lg:col-span-2 p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-accent" /> Achievements
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {achievements.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    'p-3 rounded-lg border bg-bg-base',
                    a.earned ? 'border-accent-border' : 'border-line opacity-60',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm text-ink">
                    {a.earned ? (
                      <Award className="w-3.5 h-3.5 text-accent" />
                    ) : (
                      <Award className="w-3.5 h-3.5 text-ink-dim" />
                    )}
                    {a.label}
                  </div>
                  <div className="text-2xs text-ink-dim mt-1">{a.description}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-ok" /> Growth Forecast
            </h3>
            <p className="text-xs text-ink-muted">
              At current activation × MRR/cohort, you reach <span className="text-ink">$50K MRR</span> in
              ~14 weeks.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" /> Top cohort
            </h3>
            <p className="text-xs text-ink-muted">
              Founders who signed up via Twitter convert <span className="text-ink">2.4×</span> better than baseline.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
              <Rocket className="w-4 h-4 text-accent" /> Launch lift
            </h3>
            <p className="text-xs text-ink-muted">
              Last Product Hunt push added <span className="text-ink">+612</span> users and{' '}
              <span className="text-ok">+$1,840 MRR</span>.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
