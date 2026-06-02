import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { communityPosts, type CommunityPost } from './appData';

export interface FeedPost extends CommunityPost {
  /** Whether the current user has reacted (drives the heart toggle). */
  liked?: boolean;
  /** Epoch ms for ordering posts the user created this session. */
  createdAt?: number;
}

interface CommunityState {
  posts: FeedPost[];
  addPost: (body: string, tag: CommunityPost['tag']) => void;
  toggleLike: (id: string) => void;
}

export const useCommunity = create<CommunityState>()(
  persist(
    (set) => ({
      // Seed with the sample feed so the page is populated on first run.
      posts: communityPosts.map((p) => ({ ...p })),

      addPost: (body, tag) =>
        set((state) => {
          const trimmed = body.trim();
          if (!trimmed) return state;
          const post: FeedPost = {
            id: `local-${Date.now()}`,
            author: 'You',
            handle: '@you',
            time: 'just now',
            body: trimmed,
            reactions: 0,
            comments: 0,
            tag,
            createdAt: Date.now(),
          };
          return { posts: [post, ...state.posts] };
        }),

      toggleLike: (id) =>
        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === id
              ? {
                  ...p,
                  liked: !p.liked,
                  reactions: p.reactions + (p.liked ? -1 : 1),
                }
              : p,
          ),
        })),
    }),
    { name: 'forze.community.v1' },
  ),
);
