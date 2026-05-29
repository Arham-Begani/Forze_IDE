import {
  CalendarClock,
  Headphones,
  ListTodo,
  MessageSquare,
  Mic2,
  Sparkles,
  Users,
} from 'lucide-react';
import { tasks, teamMatches, voiceRooms } from '../../workbench/appData';
import { toast } from '../../shell/toast';

export default function TeamPage(): JSX.Element {
  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <Users size={20} strokeWidth={1.8} /> Team
          </h1>
          <p className="apppage__subtitle">
            Multiplayer editing, voice rooms, tasks, and co-founder matching.
          </p>
        </div>
        <button
          className="btn-accent"
          type="button"
          onClick={() => toast('Invite link copied to clipboard', 'success')}
        >
          Invite member
        </button>
      </div>

      <div className="apppage__body">
        <div className="grid grid-3">
          <div className="appcard">
            <h3 className="appcard__title"><Mic2 size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Voice Rooms</h3>
            {voiceRooms.map((r) => (
              <div className="list-row" key={r.id} style={{ padding: '8px 0' }}>
                <span className="swatch" style={{ background: r.live ? 'var(--color-ok)' : 'var(--color-text-dim)' }} />
                <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ color: 'var(--color-text)' }}>{r.name}</span>
                  <span className="dim">{r.participants} participants</span>
                </span>
                <button className="btn-outline" type="button" style={{ padding: '4px 10px' }} onClick={() => toast(`Joining “${r.name}”…`)}><Headphones size={12} /> Join</button>
              </div>
            ))}
          </div>

          <div className="appcard">
            <h3 className="appcard__title"><Sparkles size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Shared AI Context</h3>
            <p className="muted" style={{ margin: '0 0 10px' }}>
              The whole team shares one AI memory: brand voice, design system, stack, and product brief.
            </p>
            {['Brand voice', 'Design system', 'Product brief', 'Prior decisions'].map((k, i) => (
              <div className="list-row" key={k} style={{ padding: '5px 0', fontSize: 'var(--font-size-sm)' }}>
                <span style={{ flex: 1, color: 'var(--color-text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--color-text)' }}>{i === 3 ? '12 notes' : 'Synced'}</span>
              </div>
            ))}
          </div>

          <div className="appcard">
            <h3 className="appcard__title"><CalendarClock size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Sprint 14 — Launch week</h3>
            <p className="dim" style={{ margin: '0 0 8px' }}>3 days remaining · 64% complete</p>
            <div className="progress"><div className="progress__fill" style={{ width: '64%' }} /></div>
          </div>
        </div>

        <div className="appcard">
          <h3 className="appcard__title"><ListTodo size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Task Board</h3>
          <div className="grid grid-3">
            {([['Todo', tasks.todo], ['In progress', tasks.doing], ['Done', tasks.done]] as const).map(([label, items]) => (
              <div key={label}>
                <div className="dim" style={{ textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label} · {items.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((t) => (
                    <div key={t} style={{ padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="appcard__title" style={{ marginBottom: 12 }}><Users size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Team Matching</h3>
          <div className="grid grid-4">
            {teamMatches.map((m) => (
              <div className="appcard" key={m.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="avatar">{m.name.split(' ').map((n) => n[0]).join('')}</span>
                  <div>
                    <div style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-sm)' }}>{m.name}</div>
                    <div className="dim">{m.role}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: 'var(--color-accent)', fontSize: 'var(--font-size-xs)' }}>{m.matchScore}%</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                  {m.skills.map((s) => <span className="tag-chip" key={s}>{s}</span>)}
                </div>
                <div className="dim" style={{ marginTop: 10 }}>{m.availability}</div>
                <button
                  className="btn-outline"
                  type="button"
                  style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
                  onClick={() => toast(`Message sent to ${m.name}`, 'success')}
                >
                  <MessageSquare size={12} /> Message
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
