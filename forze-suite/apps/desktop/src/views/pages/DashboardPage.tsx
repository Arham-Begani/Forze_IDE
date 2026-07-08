import {
  ChevronRight,
  Flame,
  FolderGit2,
  GitCommitHorizontal,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Code2,
  Rocket,
  Sparkles,
  SquareKanban,
} from 'lucide-react';
import { AreaSpark, DonutChart } from './charts';
import { useWorkbench } from '../../workbench/store';
import { useBuilderAnalytics, type ActivityKind } from '../../workbench/builderAnalytics';
import { formatCount } from '../../lib/projectMetrics';

interface QuickAction {
  label: string;
  run: () => void;
}

const ACTIVITY_ICON: Record<ActivityKind, JSX.Element> = {
  commit: <GitCommitHorizontal size={14} />,
  post: <Megaphone size={14} />,
  launch: <Rocket size={14} color="var(--color-ok)" />,
  task: <ListChecks size={14} />,
};

export default function DashboardPage(): JSX.Element {
  const setAssistantOpen = useWorkbench((s) => s.setAssistantOpen);
  const openPage = useWorkbench((s) => s.openPage);
  const setBottomPanelTab = useWorkbench((s) => s.setBottomPanelTab);
  const a = useBuilderAnalytics();

  const commitsLabel = a.commitsCapped ? `${a.totalCommits}+` : String(a.totalCommits);

  const kpis = [
    {
      icon: GitCommitHorizontal,
      label: 'Commits',
      value: a.hasRepo ? commitsLabel : '—',
      delta: a.hasRepo ? `${a.commitsThisWeek} this week` : 'no git repo',
    },
    {
      icon: Flame,
      label: 'Build streak',
      value: a.hasRepo ? `${a.streakDays}d` : '—',
      delta: a.streakDays > 0 ? 'keep it going' : 'commit today',
    },
    {
      icon: ListChecks,
      label: 'Tasks done',
      value: `${a.tasks.done}/${a.tasks.total}`,
      delta: `${a.tasks.doing} in progress`,
    },
    {
      icon: Code2,
      label: 'Lines of code',
      value: a.metrics ? formatCount(a.metrics.totalLoc) : '—',
      delta: a.metrics ? `${a.metrics.languages.length} languages` : 'open a folder',
    },
  ];

  const quickActions: QuickAction[] = [
    { label: 'Ask Forze', run: () => setAssistantOpen(true) },
    { label: 'Open Terminal', run: () => setBottomPanelTab('terminal') },
    { label: 'Open Board', run: () => openPage('kanban') },
    { label: 'Build in Public', run: () => openPage('build-in-public') },
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
            Your real build activity{a.branch ? ` · ${a.branch}` : ''}
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
        {!a.hasRepo && (
          <div className="appcard" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FolderGit2 size={18} color="var(--color-accent)" />
            <span style={{ flex: 1, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              Open a Git repository to see commit momentum, streaks, and recent activity.
            </span>
          </div>
        )}

        <div className="grid grid-4">
          {kpis.map((k) => {
            const Icon = k.icon;
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
                    background: 'rgba(var(--color-accent-rgb), 0.08)',
                    border: '1px solid rgba(var(--color-accent-rgb), 0.18)',
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
                  ? 'No commits in the last 8 weeks — commit to start charting momentum.'
                  : 'Open a Git repository to chart commit momentum.'}
              </p>
            )}
          </div>
          <div className="appcard">
            <h3 className="appcard__title">Task Breakdown</h3>
            {a.tasks.total > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 10 }}>
                <DonutChart data={a.taskDonut} ariaLabel="Task breakdown" />
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {a.taskDonut.map((r) => (
                    <li key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-sm)' }}>
                      <span className="swatch" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
                      <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{r.name}</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--color-text-dim)' }}>{r.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <button
                type="button"
                className="muted"
                style={{ padding: '24px 4px', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}
                onClick={() => openPage('kanban')}
              >
                No tasks yet — open the board to add some.
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-2">
          <div className="appcard">
            <h3 className="appcard__title">Recent Activity</h3>
            {a.recentActivity.length > 0 ? (
              a.recentActivity.map((item) => (
                <div className="list-row" key={item.id}>
                  <span className="avatar" style={{ width: 28, height: 28 }}>
                    {ACTIVITY_ICON[item.kind]}
                  </span>
                  <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </span>
                  <span style={{ color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)', marginLeft: 8, whiteSpace: 'nowrap' }}>
                    {item.meta}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted" style={{ padding: '12px 4px' }}>
                Commit code, post a build log, or move a task — your activity shows up here.
              </p>
            )}
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
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, color: 'var(--color-text-muted)', fontWeight: 500 }}>
                  {q.label === 'Ask Forze' ? <Sparkles size={14} /> : q.label === 'Open Board' ? <SquareKanban size={14} /> : null}
                  {q.label}
                </span>
                <ChevronRight size={15} color="var(--color-text-dim)" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
