import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PostTag = 'build-log' | 'showcase' | 'launch' | 'milestone';

export interface Comment {
  id: string;
  author: string;
  handle: string;
  body: string;
  createdAt: number;
}

export interface FeedPost {
  id: string;
  author: string;
  handle: string;
  body: string;
  tag: PostTag;
  reactions: number;
  /** Whether the current builder has reacted (drives the heart toggle). */
  liked: boolean;
  comments: Comment[];
  createdAt: number;
}

export interface Launch {
  id: string;
  name: string;
  tagline: string;
  votes: number;
  /** Whether the current builder has upvoted this launch. */
  voted: boolean;
  createdAt: number;
}

export interface BuilderProfile {
  name: string;
  handle: string;
  bio: string;
}

export interface ReputationBreakdown {
  posts: number;
  reactions: number;
  comments: number;
  launches: number;
  votes: number;
  total: number;
}

const DEFAULT_PROFILE: BuilderProfile = {
  name: 'You',
  handle: '@you',
  bio: 'Indie builder shipping in public.',
};

interface CommunityState {
  profile: BuilderProfile;
  posts: FeedPost[];
  launches: Launch[];

  setProfile: (patch: Partial<BuilderProfile>) => void;

  addPost: (body: string, tag: PostTag) => void;
  deletePost: (id: string) => void;
  toggleLike: (id: string) => void;
  addComment: (postId: string, body: string) => void;

  submitLaunch: (name: string, tagline: string) => void;
  deleteLaunch: (id: string) => void;
  toggleVote: (launchId: string) => void;
}

/** Normalize a user-typed handle to a single leading `@`, no spaces. */
function normalizeHandle(raw: string): string {
  const stripped = raw.trim().replace(/^@+/, '').replace(/\s+/g, '');
  return stripped ? `@${stripped}` : DEFAULT_PROFILE.handle;
}

export const useCommunity = create<CommunityState>()(
  persist(
    (set) => ({
      profile: { ...DEFAULT_PROFILE },
      posts: [],
      launches: [],

      setProfile: (patch) =>
        set((state) => {
          const next: BuilderProfile = { ...state.profile };
          if (patch.name !== undefined) next.name = patch.name.trim() || DEFAULT_PROFILE.name;
          if (patch.handle !== undefined) next.handle = normalizeHandle(patch.handle);
          if (patch.bio !== undefined) next.bio = patch.bio;
          return { profile: next };
        }),

      addPost: (body, tag) =>
        set((state) => {
          const trimmed = body.trim();
          if (!trimmed) return state;
          const post: FeedPost = {
            id: `post-${crypto.randomUUID()}`,
            author: state.profile.name,
            handle: state.profile.handle,
            body: trimmed,
            tag,
            reactions: 0,
            liked: false,
            comments: [],
            createdAt: Date.now(),
          };
          return { posts: [post, ...state.posts] };
        }),

      deletePost: (id) =>
        set((state) => ({ posts: state.posts.filter((p) => p.id !== id) })),

      toggleLike: (id) =>
        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === id
              ? {
                  ...p,
                  liked: !p.liked,
                  reactions: Math.max(0, p.reactions + (p.liked ? -1 : 1)),
                }
              : p,
          ),
        })),

      addComment: (postId, body) =>
        set((state) => {
          const trimmed = body.trim();
          if (!trimmed) return state;
          const comment: Comment = {
            id: `c-${crypto.randomUUID()}`,
            author: state.profile.name,
            handle: state.profile.handle,
            body: trimmed,
            createdAt: Date.now(),
          };
          return {
            posts: state.posts.map((p) =>
              p.id === postId ? { ...p, comments: [...p.comments, comment] } : p,
            ),
          };
        }),

      submitLaunch: (name, tagline) =>
        set((state) => {
          const trimmedName = name.trim();
          if (!trimmedName) return state;
          const launch: Launch = {
            id: `launch-${crypto.randomUUID()}`,
            name: trimmedName,
            tagline: tagline.trim(),
            votes: 0,
            voted: false,
            createdAt: Date.now(),
          };
          return { launches: [launch, ...state.launches] };
        }),

      deleteLaunch: (id) =>
        set((state) => ({ launches: state.launches.filter((l) => l.id !== id) })),

      toggleVote: (launchId) =>
        set((state) => ({
          launches: state.launches.map((l) =>
            l.id === launchId
              ? {
                  ...l,
                  voted: !l.voted,
                  votes: Math.max(0, l.votes + (l.voted ? -1 : 1)),
                }
              : l,
          ),
        })),
    }),
    { name: 'forze.community.v2' },
  ),
);

/** Reputation earned purely from the builder's real activity in this workspace. */
export function computeReputation(
  posts: FeedPost[],
  launches: Launch[],
): ReputationBreakdown {
  const reactions = posts.reduce((sum, p) => sum + p.reactions, 0);
  const comments = posts.reduce((sum, p) => sum + p.comments.length, 0);
  const votes = launches.reduce((sum, l) => sum + l.votes, 0);
  // Weighted so that engagement (reactions/votes) counts more than raw volume.
  const total =
    posts.length * 5 +
    reactions * 3 +
    comments * 2 +
    launches.length * 10 +
    votes * 4;
  return {
    posts: posts.length,
    reactions,
    comments,
    launches: launches.length,
    votes,
    total,
  };
}

/** Human-friendly relative time, e.g. "just now", "6m ago", "3h ago", "2d ago". */
export function timeAgo(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 45_000) return 'just now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The date of the upcoming Friday (today if it is Friday), for Demo Day. */
export function nextFriday(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 5 Fri
  const delta = (5 - day + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d;
}
