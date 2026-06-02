import { Activity, Award, Code2, Flame, TrendingUp } from 'lucide-react';
import { achievements, kpis, revenueSeries } from '../../workbench/appData';
import { AreaSpark, BarMini } from './charts';
import { useWorkspaceMetrics } from '../../workbench/useWorkspaceMetrics';
import { formatBytes, formatCount } from '../../lib/projectMetrics';

const userSeries = [
  { label: 'Mon', value: 412 },
  { label: 'Tue', value: 528 },
  { label: 'Wed', value: 491 },
  { label: 'Thu', value: 612 },
  { label: 'Fri', value: 720 },
  { label: 'Sat', value: 380 },
  { label: 'Sun', value: 442 },
];

const builderMetrics = [
  ['Build streak', '12 days'],
  ['Deploys', '142'],
  ['Revenue', '$24.5K'],
  ['Users', '12.4K'],
  ['Launches', '3'],
  ['Coding hours', '482'],
  ['Reputation', '1,847'],
];

export default function AnalyticsPage(): JSX.Element {
  const { metrics, loading } = useWorkspaceMetrics();
  const maxLoc = metrics?.languages.reduce((m, l) => Math.max(m, l.loc), 0) ?? 0;

  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <Activity size={20} strokeWidth={1.8} /> Analytics
          </h1>
          <p className="apppage__subtitle">Product, revenue, growth, and builder metrics.</p>
        </div>
      </div>

      <div className="apppage__body">
        {(metrics || loading) && (
          <div className="appcard">
            <h3 className="appcard__title">
              <Code2 size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />
              Codebase {loading && <span className="dim" style={{ fontSize: 11 }}>· analyzing…</span>}
            </h3>
            {metrics && (
              <>
                <div className="grid grid-4" style={{ marginBottom: 12 }}>
                  <div className="kpi"><span className="kpi__label">Files</span><div className="kpi__value">{formatCount(metrics.totalFiles)}</div></div>
                  <div className="kpi"><span className="kpi__label">Lines of Code{metrics.truncated ? ' (sampled)' : ''}</span><div className="kpi__value">{formatCount(metrics.totalLoc)}</div></div>
                  <div className="kpi"><span className="kpi__label">Languages</span><div className="kpi__value">{metrics.languages.length}</div></div>
                  <div className="kpi"><span className="kpi__label">Size on disk</span><div className="kpi__value">{formatBytes(metrics.totalBytes)}</div></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {metrics.languages.slice(0, 8).map((l) => (
                    <div key={l.language} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--font-size-sm)' }}>
                      <span style={{ width: 90, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{l.language}</span>
                      <div style={{ flex: 1, height: 8, background: 'var(--color-bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${maxLoc ? Math.max(3, (l.loc / maxLoc) * 100) : 0}%`, height: '100%', background: 'var(--color-accent)' }} />
                      </div>
                      <span className="dim" style={{ width: 130, textAlign: 'right' }}>
                        {formatCount(l.loc)} loc · {l.files} {l.files === 1 ? 'file' : 'files'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <div className="grid grid-4">
          {kpis.map((k) => (
            <div className="kpi" key={k.label}>
              <span className="kpi__label">{k.label}</span>
              <div className="kpi__value">{k.value}</div>
              <div className="kpi__delta">{k.delta}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-2">
          <div className="appcard">
            <h3 className="appcard__title">Revenue (MRR)</h3>
            <AreaSpark data={revenueSeries} />
          </div>
          <div className="appcard">
            <h3 className="appcard__title">New users this week</h3>
            <BarMini data={userSeries} />
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
          <div className="appcard">
            <h3 className="appcard__title"><Flame size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-warn)' }} />Builder Metrics</h3>
            {builderMetrics.map(([k, v]) => (
              <div className="list-row" key={k} style={{ padding: '6px 0', fontSize: 'var(--font-size-sm)' }}>
                <span style={{ flex: 1, color: 'var(--color-text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--color-text)' }}>{v}</span>
              </div>
            ))}
          </div>
          <div className="appcard">
            <h3 className="appcard__title"><Award size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Achievements</h3>
            <div className="grid grid-3">
              {achievements.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${a.earned ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
                    background: 'var(--color-bg-elevated)',
                    opacity: a.earned ? 1 : 0.55,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  <Award size={14} color={a.earned ? 'var(--color-accent)' : 'var(--color-text-dim)'} />
                  {a.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="appcard">
          <h3 className="appcard__title"><TrendingUp size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-ok)' }} />Growth Forecast</h3>
          <p className="muted">
            At current activation × MRR/cohort, you reach <strong style={{ color: 'var(--color-text)' }}>$50K MRR</strong> in ~14 weeks.
            Last Product Hunt push added <strong style={{ color: 'var(--color-text)' }}>+612</strong> users and{' '}
            <strong style={{ color: 'var(--color-ok)' }}>+$1,840 MRR</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
