import { Activity, Award, Code2, Flame, GitCommitHorizontal, Lock, TrendingUp } from 'lucide-react';
import { AreaSpark, BarMini } from './charts';
import { useBuilderAnalytics } from '../../workbench/builderAnalytics';
import { formatBytes, formatCount } from '../../lib/projectMetrics';

export default function AnalyticsPage(): JSX.Element {
  const a = useBuilderAnalytics();
  const metrics = a.metrics;
  const loading = a.metricsLoading;
  const maxLoc = metrics?.languages.reduce((m, l) => Math.max(m, l.loc), 0) ?? 0;

  const commitsLabel = a.commitsCapped ? `${a.totalCommits}+` : String(a.totalCommits);
  const avgWeekly = Math.round(
    a.commitsPerWeek.reduce((s, w) => s + w.value, 0) / Math.max(1, a.commitsPerWeek.length),
  );
  const lastWeek = a.commitsPerWeek[a.commitsPerWeek.length - 1]?.value ?? 0;
  const priorWeek = a.commitsPerWeek[a.commitsPerWeek.length - 2]?.value ?? 0;
  const trend = lastWeek - priorWeek;

  const kpis = [
    { label: 'Commits', value: a.hasRepo ? commitsLabel : '—', delta: `${a.commitsThisWeek} this week` },
    { label: 'Build streak', value: a.hasRepo ? `${a.streakDays}d` : '—', delta: a.streakDays > 0 ? 'active' : 'start one' },
    { label: 'Tasks done', value: `${a.tasks.done}`, delta: `${a.tasks.doing + a.tasks.todo} open` },
    { label: 'Reputation', value: formatCount(a.reputation), delta: `${a.posts} posts` },
  ];

  const builderMetrics: [string, string][] = [
    ['Total commits', a.hasRepo ? commitsLabel : '—'],
    ['Commits this week', String(a.commitsThisWeek)],
    ['Build streak', `${a.streakDays} day${a.streakDays === 1 ? '' : 's'}`],
    ['Tasks done', `${a.tasks.done} / ${a.tasks.total}`],
    ['In progress', String(a.tasks.doing)],
    ['Reputation', formatCount(a.reputation)],
    ['Scheduled posts', String(a.scheduledPosts)],
    ['Open problems', String(a.problems)],
  ];

  const earnedCount = a.achievements.filter((x) => x.earned).length;

  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <Activity size={20} strokeWidth={1.8} /> Analytics
          </h1>
          <p className="apppage__subtitle">Real build activity, codebase, and momentum.</p>
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
            <h3 className="appcard__title">Build Momentum · commits / week</h3>
            {a.hasRepo && a.hasMomentum ? (
              <AreaSpark
                data={a.commitsPerWeek}
                seriesLabel="Commits / week"
                format={(v) => `${v} commit${v === 1 ? '' : 's'}`}
              />
            ) : (
              <p className="muted" style={{ padding: '24px 4px' }}>
                {a.hasRepo
                  ? 'No commits in the last 8 weeks yet.'
                  : 'Open a Git repo to chart commit momentum.'}
              </p>
            )}
          </div>
          <div className="appcard">
            <h3 className="appcard__title">Commits this week</h3>
            {a.hasRepo ? (
              <BarMini data={a.commitsPerDay} />
            ) : (
              <p className="muted" style={{ padding: '24px 4px' }}>No repository open.</p>
            )}
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
            <h3 className="appcard__title">
              <Award size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />
              Achievements <span className="dim" style={{ fontSize: 11 }}>· {earnedCount}/{a.achievements.length}</span>
            </h3>
            <div className="grid grid-3">
              {a.achievements.map((ach) => (
                <div
                  key={ach.id}
                  title={ach.earned ? 'Unlocked' : ach.hint}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${ach.earned ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
                    background: 'var(--color-bg-elevated)',
                    opacity: ach.earned ? 1 : 0.55,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  {ach.earned
                    ? <Award size={14} color="var(--color-accent)" />
                    : <Lock size={13} color="var(--color-text-dim)" />}
                  {ach.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="appcard">
          <h3 className="appcard__title"><TrendingUp size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-ok)' }} />Momentum Insight</h3>
          {a.hasRepo ? (
            <p className="muted">
              You're averaging <strong style={{ color: 'var(--color-text)' }}>{avgWeekly} commit{avgWeekly === 1 ? '' : 's'}/week</strong> over the last 8 weeks
              {a.streakDays > 0 && <> on a <strong style={{ color: 'var(--color-warn)' }}>{a.streakDays}-day streak</strong></>}.{' '}
              {trend > 0 ? (
                <>This week is <strong style={{ color: 'var(--color-ok)' }}>up {trend}</strong> vs last — momentum building.</>
              ) : trend < 0 ? (
                <>This week is <strong style={{ color: 'var(--color-text)' }}>{Math.abs(trend)} behind</strong> last week — a couple commits closes the gap.</>
              ) : (
                <>Hold the line with a commit today to keep the trend up.</>
              )}
              {a.tasks.doing > 0 && <> {a.tasks.doing} task{a.tasks.doing === 1 ? '' : 's'} in progress on the board.</>}
            </p>
          ) : (
            <p className="muted">
              <GitCommitHorizontal size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
              Open a Git repository to see your real build momentum and forecast.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
