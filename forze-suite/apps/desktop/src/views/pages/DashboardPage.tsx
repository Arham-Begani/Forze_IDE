import {
  BarChart3,
  ChevronRight,
  CreditCard,
  DollarSign,
  LayoutDashboard,
  MessageCircle,
  Rocket,
  Send,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  kpis,
  recentActivity,
  revenueSeries,
  topReferrers,
} from '../../workbench/appData';
import { AreaSpark, DonutChart } from './charts';
import { useWorkbench } from '../../workbench/store';
import { useWorkspaceMetrics } from '../../workbench/useWorkspaceMetrics';
import { formatBytes, formatCount } from '../../lib/projectMetrics';

const KPI_ICONS = [Users, DollarSign, BarChart3, TrendingUp];

const REFERRER_COLORS = {
  Twitter: '#00d4ff',
  Direct: '#e5e5e5',
  Google: '#8f9499',
  Other: '#474747',
};

interface QuickAction {
  label: string;
  run: () => void;
}

export default function DashboardPage(): JSX.Element {
  const setAssistantOpen = useWorkbench((s) => s.setAssistantOpen);
  const openPage = useWorkbench((s) => s.openPage);
  const setBottomPanelTab = useWorkbench((s) => s.setBottomPanelTab);
  const { metrics, loading } = useWorkspaceMetrics();

  const styledReferrers = topReferrers.map((r) => ({
    ...r,
    color: REFERRER_COLORS[r.name as keyof typeof REFERRER_COLORS] ?? r.color,
  }));

  // Real workspace metrics when a folder is open; demo KPIs otherwise.
  const displayKpis = metrics
    ? [
        { label: 'Files', value: formatCount(metrics.totalFiles), delta: formatBytes(metrics.totalBytes) },
        { label: 'Lines of Code', value: formatCount(metrics.totalLoc), delta: metrics.truncated ? 'sampled' : 'counted' },
        { label: 'Languages', value: String(metrics.languages.length), delta: metrics.languages[0]?.language ?? '—' },
        { label: 'Repo Size', value: formatBytes(metrics.totalBytes), delta: loading ? 'updating…' : 'on disk' },
      ]
    : kpis;

  const quickActions: QuickAction[] = [
    { label: 'Ask Forze', run: () => setAssistantOpen(true) },
    { label: 'Run Terminal', run: () => setBottomPanelTab('terminal') },
    { label: 'Launch Campaign', run: () => openPage('ad-studio') },
    { label: 'View Analytics', run: () => openPage('analytics') },
  ];

  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <LayoutDashboard size={20} strokeWidth={2} /> Dashboard
          </h1>
          <p className="apppage__subtitle">
            Overview of your product&apos;s performance
          </p>
        </div>
        <button
          className="btn-accent"
          type="button"
          onClick={() => openPage('deployments')}
        >
          <Rocket size={15} /> Deploy
        </button>
      </div>

      <div className="apppage__body">
        <div className="grid grid-4">
          {displayKpis.map((k, i) => {
            const Icon = KPI_ICONS[i] ?? Users;
            return (
              <div className="kpi" key={k.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="kpi__label">{k.label}</span>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(0, 212, 255, 0.08)',
                    border: '1px solid rgba(0, 212, 255, 0.18)',
                    color: 'var(--color-accent-bright)',
                  }}>
                    <Icon size={16} strokeWidth={2} />
                  </div>
                </div>
                <div className="kpi__value">{k.value}</div>
                <div className="kpi__delta">{k.delta}</div>
              </div>
            );
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div className="appcard">
            <h3 className="appcard__title">Revenue Overview</h3>
            <AreaSpark data={revenueSeries} />
          </div>
          <div className="appcard">
            <h3 className="appcard__title">Top Referrers</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 10 }}>
              <DonutChart data={styledReferrers} />
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {styledReferrers.map((r) => (
                  <li key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-sm)' }}>
                    <span className="swatch" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{r.name}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--color-text-dim)' }}>{r.value}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="appcard">
            <h3 className="appcard__title">Recent Activity</h3>
            {recentActivity.map((a) => (
              <div className="list-row" key={a.id}>
                <span className="avatar" style={{ width: 28, height: 28 }}>
                  {a.title.includes('user') ? <UserPlus size={14} /> :
                   a.title.includes('Subscription') ? <Send size={14} /> :
                   a.title.includes('Payment') ? <CreditCard size={14} color="var(--color-ok)" /> :
                   <MessageCircle size={14} />}
                </span>
                <span style={{ flex: 1, fontWeight: 500 }}>{a.title}</span>
                {a.amount && <span style={{ color: 'var(--color-ok)', fontSize: 'var(--font-size-xs)', fontWeight: 'bold', marginRight: 8 }}>{a.amount}</span>}
                <span style={{ color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)' }}>{a.meta}</span>
              </div>
            ))}
          </div>
          <div className="appcard">
            <h3 className="appcard__title">Quick Actions</h3>
            {quickActions.map((q) => (
              <button
                key={q.label}
                type="button"
                className="list-row"
                style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', padding: '12px 0' }}
                onClick={q.run}
              >
                <span style={{ flex: 1, color: 'var(--color-text-muted)', fontWeight: 500 }}>{q.label}</span>
                <ChevronRight size={15} color="var(--color-text-dim)" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
