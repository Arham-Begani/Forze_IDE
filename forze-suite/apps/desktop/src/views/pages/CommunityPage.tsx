import {
  Award,
  Calendar,
  Heart,
  MessageCircle,
  MessagesSquare,
  Rocket,
  Trophy,
} from 'lucide-react';
import {
  communityPosts,
  demoDay,
  leaderboard,
  type CommunityPost,
} from '../../workbench/appData';
import { toast } from '../../shell/toast';

function tagPill(tag: CommunityPost['tag']): JSX.Element {
  const cls =
    tag === 'showcase' ? 'pill pill--accent'
    : tag === 'launch' ? 'pill pill--ok'
    : tag === 'milestone' ? 'pill pill--warn'
    : 'pill';
  return <span className={cls}>{tag}</span>;
}

export default function CommunityPage(): JSX.Element {
  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <MessagesSquare size={20} strokeWidth={1.8} /> Community
          </h1>
          <p className="apppage__subtitle">
            Build logs, showcases, launches — and Demo Day every Friday.
          </p>
        </div>
        <button className="btn-accent" type="button" onClick={() => toast('Draft a new post')}>
          New post
        </button>
      </div>

      <div className="apppage__body">
        <div className="grid" style={{ gridTemplateColumns: '1fr 320px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {communityPosts.map((p) => (
              <div className="appcard" key={p.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="avatar" style={{ borderRadius: '50%' }}>
                    {p.author.split(' ').map((n) => n[0]).join('')}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-sm)' }}>
                      {p.author} <span style={{ color: 'var(--color-text-dim)' }}>{p.handle}</span>
                    </div>
                    <div className="dim">{p.time}</div>
                  </div>
                  {tagPill(p.tag)}
                </div>
                <p style={{ margin: '12px 0 0', color: 'var(--color-text-muted)', lineHeight: 1.55, fontSize: 'var(--font-size-sm)' }}>
                  {p.body}
                </p>
                <div style={{ display: 'flex', gap: 16, marginTop: 12, color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Heart size={13} /> {p.reactions}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MessageCircle size={13} /> {p.comments}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="appcard">
              <h3 className="appcard__title"><Rocket size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Demo Day</h3>
              <div className="dim" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Calendar size={12} /> {demoDay.date}
              </div>
              <p className="muted" style={{ margin: '0 0 10px' }}>{demoDay.submissions} products submitted this week.</p>
              {demoDay.spotlight.map((s) => (
                <div className="list-row" key={s.rank} style={{ padding: '6px 0' }}>
                  <span className="avatar" style={{ width: 22, height: 22, borderRadius: '50%', fontSize: 11, background: s.rank === 1 ? 'var(--color-warn-soft)' : undefined, color: s.rank === 1 ? 'var(--color-warn)' : undefined }}>{s.rank}</span>
                  <span style={{ flex: 1, color: 'var(--color-text)' }}>{s.name}</span>
                  <span className="dim">{s.votes}</span>
                </div>
              ))}
              <button
                className="btn-accent"
                type="button"
                style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
                onClick={() => toast('Submitted to Demo Day 🚀', 'success')}
              >
                Submit your launch
              </button>
            </div>

            <div className="appcard">
              <h3 className="appcard__title"><Trophy size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-warn)' }} />Leaderboard</h3>
              {leaderboard.map((u) => (
                <div
                  className="list-row"
                  key={u.rank}
                  style={{
                    padding: '6px 8px',
                    borderBottom: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: u.name === 'You' ? 'var(--color-accent-soft)' : 'transparent',
                  }}
                >
                  <span className="dim" style={{ width: 18 }}>{u.rank}</span>
                  <span style={{ flex: 1, color: 'var(--color-text)' }}>{u.name}</span>
                  <span className="dim">{u.rep.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="appcard">
              <h3 className="appcard__title"><Award size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Builder Profile</h3>
              <p className="muted">
                Showcase products, milestones, stack, and revenue history at{' '}
                <span style={{ color: 'var(--color-accent)' }}>vibecode.io/u/arjun</span>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
