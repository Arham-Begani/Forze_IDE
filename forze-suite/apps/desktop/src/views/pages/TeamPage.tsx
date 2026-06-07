import {
  CalendarClock,
  Check,
  Headphones,
  LogOut,
  MessageSquare,
  Mic2,
  SquareKanban,
  Sparkles,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { teamMatches } from '../../workbench/appData';
import { matchMemberId, useTeam } from '../../workbench/teamStore';
import { useWorkbench } from '../../workbench/store';
import { toast } from '../../shell/toast';

const initials = (name: string): string =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function TeamPage(): JSX.Element {
  const members = useTeam((s) => s.members);
  const rooms = useTeam((s) => s.rooms);
  const addFromMatch = useTeam((s) => s.addFromMatch);
  const removeMember = useTeam((s) => s.removeMember);
  const toggleOnline = useTeam((s) => s.toggleOnline);
  const toggleRoom = useTeam((s) => s.toggleRoom);
  const openPage = useWorkbench((s) => s.openPage);

  const onTeam = new Set(members.map((m) => m.id));
  const onlineCount = members.filter((m) => m.online).length;

  const invite = () => {
    const link = `https://forze.app/invite/${Math.random().toString(36).slice(2, 10)}`;
    void navigator.clipboard
      .writeText(link)
      .then(() => toast('Invite link copied to clipboard', 'success'))
      .catch(() => toast('Could not copy invite link', 'error'));
  };

  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <Users size={20} strokeWidth={1.8} /> Team
          </h1>
          <p className="apppage__subtitle">
            Your roster, voice rooms, and co-founder matching — {members.length} members · {onlineCount} online.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-outline" type="button" onClick={() => openPage('kanban')}>
            <SquareKanban size={14} /> Open board
          </button>
          <button className="btn-accent" type="button" onClick={invite}>
            <UserPlus size={14} /> Invite member
          </button>
        </div>
      </div>

      <div className="apppage__body">
        <div className="grid grid-3">
          <div className="appcard">
            <h3 className="appcard__title"><Mic2 size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Voice Rooms</h3>
            {rooms.map((r) => (
              <div className="list-row" key={r.id} style={{ padding: '8px 0' }}>
                <span className="swatch" style={{ background: r.live ? 'var(--color-ok)' : 'var(--color-text-dim)' }} />
                <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ color: 'var(--color-text)' }}>{r.name}</span>
                  <span className="dim">{r.participants} participants{r.joined ? ' · you' : ''}</span>
                </span>
                <button
                  className={r.joined ? 'btn-accent' : 'btn-outline'}
                  type="button"
                  style={{ padding: '4px 10px' }}
                  onClick={() => {
                    toggleRoom(r.id);
                    toast(r.joined ? `Left “${r.name}”` : `Joined “${r.name}”`, r.joined ? undefined : 'success');
                  }}
                >
                  {r.joined ? <><LogOut size={12} /> Leave</> : <><Headphones size={12} /> Join</>}
                </button>
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
          <h3 className="appcard__title" style={{ marginBottom: 14 }}>
            <Users size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />
            Team Members · {members.length}
          </h3>
          <div className="grid grid-3">
            {members.map((m) => (
              <div className="list-row" key={m.id} style={{ padding: '8px 0' }}>
                <span className="avatar" style={{ position: 'relative' }}>
                  {initials(m.name)}
                  <span
                    className="swatch"
                    title={m.online ? 'Online' : 'Offline'}
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      right: -1,
                      width: 9,
                      height: 9,
                      border: '2px solid var(--color-card)',
                      background: m.online ? 'var(--color-ok)' : 'var(--color-text-dim)',
                    }}
                  />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <span style={{ color: 'var(--color-text)' }}>{m.name}{m.id === 'me' ? ' (you)' : ''}</span>
                  <span className="dim">{m.role}</span>
                </span>
                <button
                  type="button"
                  className="board-card__btn"
                  title={m.online ? 'Set offline' : 'Set online'}
                  onClick={() => toggleOnline(m.id)}
                >
                  <span className="swatch" style={{ width: 9, height: 9, background: m.online ? 'var(--color-ok)' : 'var(--color-text-dim)' }} />
                </button>
                {m.id !== 'me' && (
                  <button
                    type="button"
                    className="board-card__btn"
                    title="Remove from team"
                    onClick={() => {
                      removeMember(m.id);
                      toast(`Removed ${m.name} from the team`);
                    }}
                  >
                    <UserMinus size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="appcard__title" style={{ marginBottom: 12 }}><Users size={14} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--color-accent)' }} />Team Matching</h3>
          <div className="grid grid-4">
            {teamMatches.map((m) => {
              const added = onTeam.has(matchMemberId(m.id));
              return (
                <div className="appcard" key={m.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="avatar">{initials(m.name)}</span>
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
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      className={added ? 'btn-outline' : 'btn-accent'}
                      type="button"
                      style={{ flex: 1, justifyContent: 'center' }}
                      disabled={added}
                      onClick={() => {
                        addFromMatch(m);
                        toast(`${m.name} added to the team`, 'success');
                      }}
                    >
                      {added ? <><Check size={12} /> On team</> : <><UserPlus size={12} /> Add</>}
                    </button>
                    <button
                      className="btn-outline"
                      type="button"
                      style={{ justifyContent: 'center' }}
                      title={`Message ${m.name}`}
                      onClick={() => toast(`Message sent to ${m.name}`, 'success')}
                    >
                      <MessageSquare size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
