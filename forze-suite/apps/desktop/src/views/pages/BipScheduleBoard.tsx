import { CalendarDays, ExternalLink, ListChecks, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useBipSchedule,
  type BipPostStatus,
  type BipScheduledPost,
} from '../../workbench/bipScheduleStore';

type BoardTab = 'queue' | 'calendar';

const STATUS_LABEL: Record<BipPostStatus, string> = {
  queued: 'Queued',
  publishing: 'Publishing…',
  published: 'Published',
  failed: 'Failed',
};

/**
 * Queue + month-grid calendar for scheduled Build-in-Public LinkedIn posts.
 * Renders nothing when the queue is empty so it stays out of the way until the
 * founder actually schedules something. Reads the schedule store directly.
 */
export default function BipScheduleBoard(): JSX.Element | null {
  const posts = useBipSchedule((s) => s.posts);
  const cancel = useBipSchedule((s) => s.cancel);
  const [tab, setTab] = useState<BoardTab>('queue');

  if (posts.length === 0) return null;

  return (
    <div className="appcard">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h3 className="appcard__title" style={{ margin: 0 }}>
          <CalendarDays
            size={14}
            style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }}
          />
          Scheduled posts
        </h3>
        <div style={{ display: 'flex', gap: 4 }}>
          <TabButton id="queue" tab={tab} setTab={setTab} icon={<ListChecks size={13} />}>
            Queue
          </TabButton>
          <TabButton id="calendar" tab={tab} setTab={setTab} icon={<CalendarDays size={13} />}>
            Calendar
          </TabButton>
        </div>
      </div>

      {tab === 'queue' ? (
        <QueueList posts={posts} onCancel={cancel} />
      ) : (
        <CalendarGrid posts={posts} />
      )}
    </div>
  );
}

function TabButton({
  id,
  tab,
  setTab,
  icon,
  children,
}: {
  id: BoardTab;
  tab: BoardTab;
  setTab: (t: BoardTab) => void;
  icon: JSX.Element;
  children: string;
}): JSX.Element {
  const active = tab === id;
  return (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={active ? 'btn-accent' : 'btn-outline'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}
    >
      {icon}
      {children}
    </button>
  );
}

function statusColor(status: BipPostStatus): string {
  switch (status) {
    case 'published':
      return 'var(--color-accent)';
    case 'failed':
      return 'var(--color-danger)';
    case 'publishing':
      return 'var(--color-text)';
    default:
      return 'var(--color-text-dim)';
  }
}

function QueueList({
  posts,
  onCancel,
}: {
  posts: BipScheduledPost[];
  onCancel: (id: string) => void;
}): JSX.Element {
  const ordered = useMemo(
    () => [...posts].sort((a, b) => a.scheduledFor - b.scheduledFor),
    [posts],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {ordered.map((post) => (
        <div
          key={post.id}
          className="appcard"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 8,
            background: 'var(--color-bg-elevated)',
            padding: '8px 10px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {post.text}
            </div>
            <div
              className="dim"
              style={{ fontSize: 'var(--font-size-xs)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <span>{new Date(post.scheduledFor).toLocaleString()}</span>
              <span>·</span>
              <span style={{ color: statusColor(post.status) }}>{STATUS_LABEL[post.status]}</span>
              {post.url && (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--color-accent)' }}
                >
                  <ExternalLink size={11} /> view
                </a>
              )}
              {post.lastError && (
                <span style={{ color: 'var(--color-danger)' }}>· {post.lastError}</span>
              )}
            </div>
          </div>
          <button
            className="btn-outline"
            type="button"
            onClick={() => onCancel(post.id)}
            title={post.status === 'published' ? 'Remove from list' : 'Cancel'}
            style={{ alignSelf: 'start', padding: 6 }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

interface CalendarCell {
  day: number;
  inMonth: boolean;
  posts: BipScheduledPost[];
}

function CalendarGrid({ posts }: { posts: BipScheduledPost[] }): JSX.Element {
  const grid = useMemo(() => buildMonthGrid(new Date(), posts), [posts]);
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 3,
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-dim)',
          marginBottom: 4,
        }}
      >
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} style={{ padding: '2px 4px' }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {grid.map((cell, idx) => (
          <div
            key={idx}
            style={{
              minHeight: 62,
              padding: 4,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--glass-border)',
              background: cell.inMonth ? 'var(--color-bg)' : 'var(--color-bg-elevated)',
              opacity: cell.inMonth ? 1 : 0.45,
            }}
          >
            <div className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>{cell.day}</div>
            {cell.posts.slice(0, 3).map((p) => (
              <div
                key={p.id}
                title={p.text}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  background: 'rgba(var(--color-accent-rgb), 0.14)',
                  border: '1px solid rgba(var(--color-accent-rgb), 0.4)',
                  borderRadius: 4,
                  padding: '1px 4px',
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--color-text)',
                }}
              >
                {new Date(p.scheduledFor).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </div>
            ))}
            {cell.posts.length > 3 && (
              <div className="dim" style={{ fontSize: 'var(--font-size-xs)' }}>
                +{cell.posts.length - 3} more
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildMonthGrid(now: Date, posts: BipScheduledPost[]): CalendarCell[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, inMonth: false, posts: [] });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(year, month, day).getTime();
    const dayEnd = new Date(year, month, day + 1).getTime();
    cells.push({
      day,
      inMonth: true,
      posts: posts.filter((p) => p.scheduledFor >= dayStart && p.scheduledFor < dayEnd),
    });
  }

  let trailingDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: trailingDay++, inMonth: false, posts: [] });
  }

  return cells;
}
