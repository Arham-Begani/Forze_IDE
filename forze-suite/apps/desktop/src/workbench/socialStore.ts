import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IdealPublishPayload, PublishResponse } from '@forze/shared/publishing';

export type ScheduledPostStatus =
  | 'queued'
  | 'publishing'
  | 'published'
  | 'failed';

export interface ScheduledPost {
  id: string;
  payload: IdealPublishPayload;
  status: ScheduledPostStatus;
  scheduledFor: number;
  attempts: number;
  lastError?: string;
  result?: PublishResponse;
  createdAt: number;
}

interface SocialState {
  posts: ScheduledPost[];
  ventureId: string;
  sessionToken: string;

  setVentureId: (id: string) => void;
  setSessionToken: (token: string) => void;

  schedule: (post: Omit<ScheduledPost, 'id' | 'status' | 'attempts' | 'createdAt'>) => string;
  cancel: (id: string) => void;
  markStatus: (
    id: string,
    next: ScheduledPostStatus,
    extra?: Partial<Pick<ScheduledPost, 'lastError' | 'result' | 'attempts'>>,
  ) => void;
  reschedule: (id: string, when: number) => void;
}

export const useSocial = create<SocialState>()(
  persist(
    (set) => ({
      posts: [],
      ventureId: '00000000-0000-0000-0000-000000000000',
      sessionToken: '',

      setVentureId: (ventureId) => set({ ventureId }),
      setSessionToken: (sessionToken) => set({ sessionToken }),

      schedule: (post) => {
        const id = crypto.randomUUID();
        set((state) => ({
          posts: [
            ...state.posts,
            {
              ...post,
              id,
              status: 'queued',
              attempts: 0,
              createdAt: Date.now(),
            },
          ],
        }));
        return id;
      },

      cancel: (id) =>
        set((state) => ({ posts: state.posts.filter((p) => p.id !== id) })),

      markStatus: (id, next, extra) =>
        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === id
              ? {
                  ...p,
                  status: next,
                  ...(extra?.lastError !== undefined ? { lastError: extra.lastError } : {}),
                  ...(extra?.result !== undefined ? { result: extra.result } : {}),
                  ...(extra?.attempts !== undefined ? { attempts: extra.attempts } : {}),
                }
              : p,
          ),
        })),

      reschedule: (id, when) =>
        set((state) => ({
          posts: state.posts.map((p) =>
            p.id === id ? { ...p, scheduledFor: when, status: 'queued' } : p,
          ),
        })),
    }),
    {
      name: 'forze.social.v1',
      partialize: (state) => ({
        posts: state.posts,
        ventureId: state.ventureId,
        // sessionToken is intentionally not persisted (rotates via Supabase).
      }),
    },
  ),
);
