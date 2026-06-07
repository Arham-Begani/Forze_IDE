import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TeamMatch } from './appData';

/**
 * The team roster + collaboration state. The task board that used to live here
 * has moved to its own shared Kanban (see kanbanStore) — this store now owns the
 * people: who's on the team, who's online, and which voice rooms are joined.
 * Everything persists so the workspace remembers its team across reloads.
 */

export interface Member {
  id: string;
  name: string;
  role: string;
  online: boolean;
}

export interface VoiceRoom {
  id: string;
  name: string;
  participants: number;
  live: boolean;
  joined: boolean;
}

function seedMembers(): Member[] {
  return [
    { id: 'me', name: 'You', role: 'Founder', online: true },
    { id: 'm-t1', name: 'Naomi Larsson', role: 'Co-founder', online: true },
    { id: 'm-t3', name: 'Asha Patel', role: 'Developer', online: false },
  ];
}

function seedRooms(): VoiceRoom[] {
  return [
    { id: 'r1', name: 'Daily standup', participants: 3, live: true, joined: false },
    { id: 'r2', name: 'Design review', participants: 1, live: false, joined: false },
    { id: 'r3', name: 'Pair on Stripe webhook', participants: 2, live: true, joined: false },
  ];
}

interface TeamState {
  members: Member[];
  rooms: VoiceRoom[];
  /** Add a co-founder match to the team. No-op if already present. */
  addFromMatch: (match: TeamMatch) => void;
  removeMember: (id: string) => void;
  toggleOnline: (id: string) => void;
  /** Join/leave a voice room, adjusting its participant count. */
  toggleRoom: (id: string) => void;
}

/** Stable member id for a given match, so re-adding is idempotent. */
export const matchMemberId = (matchId: string): string => `m-${matchId}`;

export const useTeam = create<TeamState>()(
  persist(
    (set) => ({
      members: seedMembers(),
      rooms: seedRooms(),

      addFromMatch: (match) =>
        set((state) => {
          const id = matchMemberId(match.id);
          if (state.members.some((m) => m.id === id)) return state;
          const member: Member = { id, name: match.name, role: match.role, online: true };
          return { members: [...state.members, member] };
        }),

      removeMember: (id) =>
        set((state) =>
          id === 'me'
            ? state
            : { members: state.members.filter((m) => m.id !== id) },
        ),

      toggleOnline: (id) =>
        set((state) => ({
          members: state.members.map((m) =>
            m.id === id ? { ...m, online: !m.online } : m,
          ),
        })),

      toggleRoom: (id) =>
        set((state) => ({
          rooms: state.rooms.map((r) =>
            r.id === id
              ? {
                  ...r,
                  joined: !r.joined,
                  participants: r.joined
                    ? Math.max(0, r.participants - 1)
                    : r.participants + 1,
                  live: r.joined ? r.live : true,
                }
              : r,
          ),
        })),
    }),
    { name: 'forze.team.v2' },
  ),
);
