import {
  CalendarDays,
  ChartLine,
  ListChecks,
  Megaphone,
  PencilLine,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  IdealPublishPayloadSchema,
  captionLimitFor,
  platformLabel,
  type Platform,
} from '@forze/shared/publishing';
import { useSocial, type ScheduledPost } from '../workbench/socialStore';

type SocialTab = 'composer' | 'queue' | 'calendar' | 'analytics';

const PLATFORMS: Platform[] = [
  'linkedin',
  'x',
  'threads',
  'instagram',
  'youtube',
  'tiktok',
  'reddit',
];

export default function SocialView(): JSX.Element {
  const [tab, setTab] = useState<SocialTab>('composer');

  return (
    <section
      className="panel"
      style={{ padding: 12, gap: 10, height: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Megaphone size={18} strokeWidth={1.6} />
        <h2 style={{ margin: 0 }}>Social</h2>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 2,
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <TabButton id="composer" tab={tab} setTab={setTab} icon={<PencilLine size={12} />}>
          Composer
        </TabButton>
        <TabButton id="queue" tab={tab} setTab={setTab} icon={<ListChecks size={12} />}>
          Queue
        </TabButton>
        <TabButton id="calendar" tab={tab} setTab={setTab} icon={<CalendarDays size={12} />}>
          Calendar
        </TabButton>
        <TabButton id="analytics" tab={tab} setTab={setTab} icon={<ChartLine size={12} />}>
          Analytics
        </TabButton>
      </div>

      {tab === 'composer' && <ComposerTab />}
      {tab === 'queue' && <QueueTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </section>
  );
}

function TabButton({
  id,
  tab,
  setTab,
  icon,
  children,
}: {
  id: SocialTab;
  tab: SocialTab;
  setTab: (t: SocialTab) => void;
  icon: JSX.Element;
  children: string;
}): JSX.Element {
  const active = tab === id;
  return (
    <button
      type="button"
      onClick={() => setTab(id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 10px',
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
        color: active ? 'var(--color-text)' : 'var(--color-text-dim)',
        fontSize: 11,
        borderRadius: 0,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function ComposerTab(): JSX.Element {
  const ventureId = useSocial((s) => s.ventureId);
  const sessionToken = useSocial((s) => s.sessionToken);
  const setVentureId = useSocial((s) => s.setVentureId);
  const setSessionToken = useSocial((s) => s.setSessionToken);
  const schedule = useSocial((s) => s.schedule);

  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [caption, setCaption] = useState(
    'Shipping a new artifact today. Thoughts?',
  );
  const [subreddit, setSubreddit] = useState('');
  const [mediaUrls, setMediaUrls] = useState('');
  const [scheduledFor, setScheduledFor] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const limit = captionLimitFor(platform);

  const handleSchedule = (publishNow: boolean) => {
    setError(null);
    const urls = mediaUrls
      .split(/\s+/)
      .map((u) => u.trim())
      .filter(Boolean);

    const when = publishNow ? Date.now() : Date.parse(scheduledFor);
    if (!publishNow && Number.isNaN(when)) {
      setError('Pick a valid schedule time.');
      return;
    }

    const parsed = IdealPublishPayloadSchema.safeParse({
      ventureId,
      platform,
      caption,
      subreddit: subreddit || undefined,
      mediaUrls: urls.length > 0 ? urls : undefined,
      scheduledFor: when,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid payload');
      return;
    }
    schedule({ payload: parsed.data, scheduledFor: when });
    setCaption('');
    setMediaUrls('');
    if (!publishNow) setScheduledFor('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <label>
          <div className="muted">Venture ID</div>
          <input
            value={ventureId}
            onChange={(e) => setVentureId(e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
        <label>
          <div className="muted">Supabase session token</div>
          <input
            type="password"
            value={sessionToken}
            onChange={(e) => setSessionToken(e.target.value)}
            placeholder="paste JWT (not persisted to disk)"
            style={{ width: '100%' }}
          />
        </label>
      </div>

      <label>
        <div className="muted">Platform</div>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform)}
          style={{ width: '100%' }}
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {platformLabel(p)}
            </option>
          ))}
        </select>
      </label>

      <label>
        <div className="muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Caption</span>
          <span
            style={{
              color:
                caption.length > limit
                  ? 'var(--color-danger)'
                  : 'var(--color-text-dim)',
            }}
          >
            {caption.length}/{limit}
          </span>
        </div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={5}
          style={{ width: '100%' }}
        />
      </label>

      {platform === 'reddit' && (
        <label>
          <div className="muted">Subreddit</div>
          <input
            value={subreddit}
            onChange={(e) => setSubreddit(e.target.value)}
            placeholder="r/founders"
            style={{ width: '100%' }}
          />
        </label>
      )}

      <label>
        <div className="muted">Media URLs (whitespace-separated)</div>
        <textarea
          value={mediaUrls}
          onChange={(e) => setMediaUrls(e.target.value)}
          rows={2}
          style={{ width: '100%' }}
          placeholder="https://…"
        />
      </label>

      <label>
        <div className="muted">Schedule for (local time)</div>
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          style={{ width: '100%' }}
        />
      </label>

      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => handleSchedule(true)}
          disabled={!sessionToken}
        >
          <Send size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
          Publish now
        </button>
        <button
          type="button"
          onClick={() => handleSchedule(false)}
          disabled={!scheduledFor || !sessionToken}
        >
          <CalendarDays size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
          Schedule
        </button>
        <button
          type="button"
          title="Hand off to @marketing agent"
          onClick={() => {
            // The marketing agent reads via MCP; for now we just point the
            // founder at it. A future polish wires this directly into the
            // active agent thread.
            // eslint-disable-next-line no-alert
            window.alert(
              'Open the Agents activity and pick the @marketing preset to draft a post grounded in your latest git diff.',
            );
          }}
          style={{ marginLeft: 'auto' }}
        >
          <Sparkles size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
          Draft via agent
        </button>
      </div>
    </div>
  );
}

function QueueTab(): JSX.Element {
  const posts = useSocial((s) => s.posts);
  const cancel = useSocial((s) => s.cancel);

  const ordered = useMemo(
    () => [...posts].sort((a, b) => a.scheduledFor - b.scheduledFor),
    [posts],
  );

  if (ordered.length === 0) {
    return (
      <div className="placeholder-view">
        <ListChecks size={28} strokeWidth={1.4} />
        <h3>Queue is empty</h3>
        <p>Compose or schedule a post to see it here.</p>
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {ordered.map((post) => (
        <QueueRow key={post.id} post={post} onCancel={cancel} />
      ))}
    </div>
  );
}

function QueueRow({
  post,
  onCancel,
}: {
  post: ScheduledPost;
  onCancel: (id: string) => void;
}): JSX.Element {
  return (
    <div
      className="card"
      style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 8 }}
    >
      <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
        {platformLabel(post.payload.platform)}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {post.payload.caption}
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 2 }}>
          {new Date(post.scheduledFor).toLocaleString()} · {post.status}
          {post.result?.postId ? ` · ${post.result.postId}` : ''}
          {post.lastError ? ` · ${post.lastError}` : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onCancel(post.id)}
        title="Cancel / remove"
        style={{ alignSelf: 'start', padding: 4 }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function CalendarTab(): JSX.Element {
  const posts = useSocial((s) => s.posts);
  const grid = useMemo(() => buildMonthGrid(new Date(), posts), [posts]);

  return (
    <div style={{ overflow: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
          fontSize: 10,
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
          fontSize: 11,
        }}
      >
        {grid.map((cell, idx) => (
          <div
            key={idx}
            style={{
              minHeight: 60,
              padding: 4,
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              background: cell.inMonth
                ? 'var(--color-bg)'
                : 'var(--color-bg-elevated)',
              opacity: cell.inMonth ? 1 : 0.45,
            }}
          >
            <div style={{ color: 'var(--color-text-dim)' }}>{cell.day}</div>
            {cell.posts.slice(0, 3).map((p) => (
              <div
                key={p.id}
                title={p.payload.caption}
                style={{
                  fontSize: 9,
                  background: 'var(--color-accent-soft)',
                  border: '1px solid var(--color-accent-border)',
                  borderRadius: 3,
                  padding: '1px 4px',
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {platformLabel(p.payload.platform)}
              </div>
            ))}
            {cell.posts.length > 3 && (
              <div style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>
                +{cell.posts.length - 3} more
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsTab(): JSX.Element {
  const posts = useSocial((s) => s.posts);
  const published = posts.filter((p) => p.status === 'published').length;
  const failed = posts.filter((p) => p.status === 'failed').length;
  const queued = posts.filter((p) => p.status === 'queued').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="card">
        <strong>Lifetime totals</strong>
        <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 12 }}>
          <li>Published: {published}</li>
          <li>Queued: {queued}</li>
          <li>Failed: {failed}</li>
        </ul>
      </div>
      <p className="muted">
        Phase 7 wires platform-side analytics (impressions, clicks,
        conversion) via the broker.
      </p>
    </div>
  );
}

interface CalendarCell {
  day: number;
  inMonth: boolean;
  posts: ScheduledPost[];
}

function buildMonthGrid(now: Date, posts: ScheduledPost[]): CalendarCell[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  // Leading days from previous month.
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({
      day: prevMonthDays - i,
      inMonth: false,
      posts: [],
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(year, month, day).getTime();
    const dayEnd = new Date(year, month, day + 1).getTime();
    cells.push({
      day,
      inMonth: true,
      posts: posts.filter(
        (p) => p.scheduledFor >= dayStart && p.scheduledFor < dayEnd,
      ),
    });
  }

  // Trailing days to complete the grid.
  while (cells.length % 7 !== 0) {
    cells.push({
      day: cells.length - daysInMonth - startOffset + 1,
      inMonth: false,
      posts: [],
    });
  }

  return cells;
}
