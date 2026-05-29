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
  quickActions,
  recentActivity,
  revenueSeries,
  topReferrers,
} from '../../workbench/appData';
import { AreaSpark, DonutChart } from './charts';
import { toast } from '../../shell/toast';

const KPI_ICONS = [Users, DollarSign, BarChart3, TrendingUp];

const REFERRER_COLORS = {
  Twitter: '#818cf8', // Indigo (the single accent)
  Direct: '#cbd5e1', // Light slate
  Google: '#64748b', // Mid slate
  Other: '#334155', // Dark slate
};

export default function DashboardPage(): JSX.Element {
  const styledReferrers = topReferrers.map((r) => ({
    ...r,
    color: REFERRER_COLORS[r.name as keyof typeof REFERRER_COLORS] ?? r.color,
  }));

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
          onClick={() => toast('Deploying to production…', 'success')}
        >
          <Rocket size={15} /> Deploy
        </button>
      </div>

      <div className="apppage__body">
        <div className="grid grid-4">
          {kpis.map((k, i) => {
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
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.15)',
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
                key={q}
                type="button"
                className="list-row"
                style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', padding: '12px 0' }}
                onClick={() => toast(`${q}…`)}
              >
                <span style={{ flex: 1, color: 'var(--color-text-muted)', fontWeight: 500 }}>{q}</span>
                <ChevronRight size={15} color="var(--color-text-dim)" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

