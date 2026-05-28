'use client';

import {
  Activity,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  CreditCard,
  Database,
  DollarSign,
  Eye,
  FileText,
  MessageCircle,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  apiEndpoints,
  databaseTables,
  kpis,
  logEntries,
  quickActions,
  recentActivity,
  revenueSeries,
  topReferrers,
} from '@/lib/mock-data';
import { useStore, type RightPanelTab } from '@/lib/store';
import { cn } from '@/lib/utils';

const TABS: { id: RightPanelTab; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'database', label: 'Database' },
  { id: 'api', label: 'API' },
  { id: 'logs', label: 'Logs' },
];

export function RightPanel() {
  const tab = useStore((s) => s.rightPanelTab);
  const setTab = useStore((s) => s.setRightPanelTab);

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-bg-base border-l border-line">
      <div className="h-10 px-3 flex items-center gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'h-9 px-3 text-sm relative transition-colors',
              tab === t.id
                ? 'text-ink'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute -bottom-px left-2 right-2 h-px bg-accent" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'preview' && <PreviewPane />}
        {tab === 'analytics' && <AnalyticsPane />}
        {tab === 'database' && <DatabasePane />}
        {tab === 'api' && <ApiPane />}
        {tab === 'logs' && <LogsPane />}
      </div>
    </section>
  );
}

function PreviewPane() {
  return (
    <div className="h-full flex flex-col">
      <div className="h-10 px-3 flex items-center gap-2 border-b border-line bg-bg-surface">
        <span className="text-2xs text-ink-dim">https://saas-starter.vibecode.app</span>
        <span className="ml-auto text-2xs text-ok flex items-center gap-1.5">
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full bg-ok opacity-60 animate-pulse-dot" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-ok" />
          </span>
          Live
        </span>
        <button className="w-6 h-6 rounded-md flex items-center justify-center text-ink-dim hover:text-ink hover:bg-bg-hover">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button className="w-6 h-6 rounded-md flex items-center justify-center text-ink-dim hover:text-ink hover:bg-bg-hover">
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            Welcome back, Arjun{' '}
            <span role="img" aria-label="wave">👋</span>
          </h1>
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-muted mt-1">
              Here&apos;s what&apos;s happening with your product today.
            </p>
            <button className="h-8 px-3 text-2xs text-ink-muted border border-line rounded-lg bg-bg-raised hover:bg-bg-hover flex items-center gap-1.5">
              Custom range <ChevronRight className="w-3 h-3 -rotate-90" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map((k) => {
            const Icon =
              k.icon === 'users'
                ? Users
                : k.icon === 'dollar'
                ? DollarSign
                : k.icon === 'bar'
                ? BarChart3
                : TrendingUp;
            return (
              <div
                key={k.label}
                className="p-4 rounded-xl border border-line bg-bg-surface relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <span className="text-2xs text-ink-dim">{k.label}</span>
                  <Icon className="w-4 h-4 text-ink-dim" />
                </div>
                <div className="text-2xl font-semibold text-ink mt-2 tabular-nums">
                  {k.value}
                </div>
                <div className="text-xs text-ok mt-1">{k.delta}</div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 p-4 rounded-xl border border-line bg-bg-surface">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-ink">Revenue Overview</h3>
              <button className="h-7 px-2 text-2xs text-ink-muted border border-line rounded-lg bg-bg-raised hover:bg-bg-hover flex items-center gap-1.5">
                Last 6 months <ChevronRight className="w-3 h-3 -rotate-90" />
              </button>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries}>
                  <XAxis
                    dataKey="month"
                    stroke="#4a505a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#4a505a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#111317',
                      border: '1px solid #1f232b',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#a4a9b4' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    fill="#22d3ee"
                    fillOpacity={0.14}
                    dot={{ fill: '#22d3ee', r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-2">Top Referrers</h3>
            <div className="flex items-center">
              <div className="w-32 h-32 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topReferrers}
                      dataKey="value"
                      innerRadius={36}
                      outerRadius={56}
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
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: r.color }}
                    />
                    <span className="text-ink-muted">{r.name}</span>
                    <span className="ml-auto text-ink-dim tabular-nums">{r.value}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3">Recent Activity</h3>
            <ul className="divide-y divide-line-subtle">
              {recentActivity.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 py-2.5 text-sm"
                >
                  <span className="w-7 h-7 rounded-lg bg-bg-raised border border-line flex items-center justify-center text-ink-dim">
                    {a.kind === 'user' && <UserPlus className="w-3.5 h-3.5" />}
                    {a.kind === 'sub' && <Send className="w-3.5 h-3.5" />}
                    {a.kind === 'payment' && (
                      <CreditCard className="w-3.5 h-3.5 text-ok" />
                    )}
                    {a.kind === 'feedback' && (
                      <MessageCircle className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <span className="flex-1 text-ink">{a.title}</span>
                  {a.amount && (
                    <span className="text-xs text-ok tabular-nums">{a.amount}</span>
                  )}
                  <span className="text-2xs text-ink-dim">{a.meta}</span>
                </li>
              ))}
            </ul>
            <button className="mt-2 w-full text-2xs text-ink-muted hover:text-ink py-2 border-t border-line-subtle">
              View all
            </button>
          </div>

          <div className="p-4 rounded-xl border border-line bg-bg-surface">
            <h3 className="text-sm font-medium text-ink mb-3">Quick Actions</h3>
            <ul className="space-y-1.5">
              {quickActions.map((q) => {
                const Icon =
                  q.icon === 'page'
                    ? FileText
                    : q.icon === 'plus'
                    ? Plus
                    : q.icon === 'rocket'
                    ? Rocket
                    : BarChart3;
                return (
                  <li key={q.label}>
                    <button className="w-full flex items-center gap-3 h-9 px-2.5 rounded-lg text-sm text-ink hover:bg-bg-hover transition-colors">
                      <Icon className="w-4 h-4 text-ink-dim" />
                      <span>{q.label}</span>
                      <ChevronRight className="w-3.5 h-3.5 ml-auto text-ink-dim" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl border border-line bg-bg-surface">
          <div className="w-9 h-9 rounded-lg bg-accent-soft border border-accent-border flex items-center justify-center text-accent">
            <Rocket className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-ink">Quick Deploy</div>
            <div className="text-2xs text-ink-dim">Push to deploy your changes</div>
          </div>
          <button className="h-8 px-3 rounded-lg bg-accent text-bg-base text-xs font-medium hover:bg-accent-bright flex items-center gap-1.5">
            <Rocket className="w-3.5 h-3.5" />
            Deploy to Production
          </button>
          <div className="flex items-center gap-3 text-2xs text-ink-dim">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-ok" /> All systems operational
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> Build 2m ago
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPane() {
  return (
    <div className="p-5 space-y-5">
      <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
        <Activity className="w-4 h-4 text-accent" />
        Product Analytics
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="p-4 rounded-xl border border-line bg-bg-surface"
          >
            <div className="text-2xs text-ink-dim">{k.label}</div>
            <div className="text-xl font-semibold text-ink mt-1 tabular-nums">
              {k.value}
            </div>
            <div className="text-xs text-ok mt-1">{k.delta}</div>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-xl border border-line bg-bg-surface">
        <h3 className="text-sm font-medium text-ink mb-3">MRR over time</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueSeries}>
              <XAxis dataKey="month" stroke="#4a505a" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#4a505a" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip
                contentStyle={{ background: '#111317', border: '1px solid #1f232b', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#a4a9b4' }}
              />
              <Area type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={2} fill="#22d3ee" fillOpacity={0.14} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border border-line bg-bg-surface">
          <h3 className="text-sm font-medium text-ink mb-3">Funnel</h3>
          <div className="space-y-2">
            {[
              { label: 'Visited landing', value: 84210 },
              { label: 'Signed up', value: 12_400 },
              { label: 'Activated', value: 7_120 },
              { label: 'Paying', value: 1_204 },
            ].map((s, i) => {
              const pct = (s.value / 84210) * 100;
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                    <span>{s.label}</span>
                    <span className="tabular-nums text-ink">
                      {s.value.toLocaleString()}{' '}
                      <span className="text-ink-dim">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="h-2 rounded bg-bg-active overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${Math.max(pct, 4)}%`, opacity: 1 - i * 0.15 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-line bg-bg-surface">
          <h3 className="text-sm font-medium text-ink mb-3">Churn this month</h3>
          <div className="text-3xl font-semibold text-ink">2.4%</div>
          <p className="text-xs text-ok mt-1">-0.6% vs last month</p>
          <ul className="text-xs text-ink-muted mt-3 space-y-1.5">
            <li>14 voluntary cancels</li>
            <li>3 involuntary (failed payment)</li>
            <li>2 downgrades</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function DatabasePane() {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Database className="w-4 h-4 text-accent" />
          Postgres — saas_starter
        </h2>
        <button className="h-8 px-3 text-xs rounded-lg bg-accent text-bg-base hover:bg-accent-bright">
          Run Query
        </button>
      </div>
      {databaseTables.map((t) => (
        <div key={t.name} className="rounded-xl border border-line bg-bg-surface overflow-hidden">
          <div className="px-4 h-10 flex items-center justify-between border-b border-line bg-bg-base/60">
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink font-mono">{t.name}</span>
              <span className="text-2xs text-ink-dim">
                {t.rows.toLocaleString()} rows
              </span>
            </div>
            <span className="text-2xs text-ink-dim">{t.columns.length} columns</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-2xs text-ink-dim border-b border-line-subtle">
                  {t.columns.map((c) => (
                    <th key={c.name} className="px-3 py-2 font-normal">
                      {c.name}{' '}
                      <span className="text-ink-faint">{c.type}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.recent.map((r, i) => (
                  <tr
                    key={i}
                    className="border-b border-line-subtle last:border-0 hover:bg-bg-hover"
                  >
                    {t.columns.map((c) => (
                      <td
                        key={c.name}
                        className="px-3 py-2 text-ink-muted font-mono"
                      >
                        {String(r[c.name] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function ApiPane() {
  return (
    <div className="p-5 space-y-4">
      <h2 className="text-lg font-semibold text-ink">API Explorer</h2>
      <div className="rounded-xl border border-line bg-bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-2xs text-ink-dim border-b border-line">
              <th className="px-4 py-2 font-normal">Method</th>
              <th className="px-4 py-2 font-normal">Endpoint</th>
              <th className="px-4 py-2 font-normal">Calls</th>
              <th className="px-4 py-2 font-normal">p50</th>
              <th className="px-4 py-2 font-normal">p95</th>
            </tr>
          </thead>
          <tbody>
            {apiEndpoints.map((e) => (
              <tr
                key={e.path}
                className="border-b border-line-subtle last:border-0 hover:bg-bg-hover cursor-pointer"
              >
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'text-2xs font-mono px-1.5 py-0.5 rounded',
                      e.method === 'GET' && 'bg-ok/10 text-ok',
                      e.method === 'POST' && 'bg-accent-soft text-accent',
                      e.method === 'PUT' && 'bg-warn/10 text-warn',
                      e.method === 'DELETE' && 'bg-danger/10 text-danger',
                    )}
                  >
                    {e.method}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-ink">{e.path}</td>
                <td className="px-4 py-3 text-ink-muted tabular-nums">{e.calls}</td>
                <td className="px-4 py-3 text-ink-muted tabular-nums">{e.p50}</td>
                <td className="px-4 py-3 text-ink-muted tabular-nums">{e.p95}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 rounded-xl border border-line bg-bg-surface">
        <h3 className="text-sm font-medium text-ink mb-2">
          Webhook & Rate-limit Configuration
        </h3>
        <p className="text-xs text-ink-muted">
          Inbound webhooks are signed and rotated automatically. Rate limits applied per token (default 60 rpm).
        </p>
      </div>
    </div>
  );
}

function LogsPane() {
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Eye className="w-4 h-4 text-accent" />
          Application Logs
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-2xs text-ink-dim">Streaming</span>
          <span className="relative w-1.5 h-1.5 rounded-full bg-ok">
            <span className="absolute inset-0 rounded-full bg-ok opacity-50 animate-pulse-dot" />
          </span>
        </div>
      </div>
      <div className="rounded-xl border border-line bg-bg-surface font-mono text-xs overflow-hidden">
        {logEntries.map((l, i) => (
          <div
            key={i}
            className="px-3 py-1.5 border-b border-line-subtle last:border-0 flex items-start gap-2"
          >
            <span className="text-ink-faint w-16 flex-shrink-0">{l.ts}</span>
            <span
              className={cn(
                'w-12 flex-shrink-0 uppercase',
                l.level === 'info' && 'text-accent',
                l.level === 'warn' && 'text-warn',
                l.level === 'error' && 'text-danger',
              )}
            >
              {l.level}
            </span>
            <span className="text-ink-muted">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
