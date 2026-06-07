import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BipPostStatus = 'queued' | 'publishing' | 'published' | 'failed';

/**
 * A Build-in-Public post queued for LinkedIn. Generated in Ad Studio, then
 * either published immediately or scheduled for later. The scheduler
 * (`bipScheduler.ts`) walks this list and posts due items through the real
 * LinkedIn OAuth path in `lib/publish.ts`.
 */
export interface BipScheduledPost {
  id: string;
  /** The post body, already trimmed to LinkedIn's limit. */
  text: string;
  /** Epoch ms the post should go out. */
  scheduledFor: number;
  status: BipPostStatus;
  attempts: number;
  createdAt: number;
  /** Last failure (or a transient "waiting on connection" note). */
  lastError?: string;
  /** Public URL once published. */
  url?: string;
}

interface BipScheduleState {
  posts: BipScheduledPost[];

  /** Queue a post. Returns its id. */
  schedule: (text: string, scheduledFor: number) => string;
  /** Remove a post from the queue (cancel or clear). */
  cancel: (id: string) => void;
  markStatus: (
    id: string,
    next: BipPostStatus,
    extra?: Partial<Pick<BipScheduledPost, 'lastError' | 'url' | 'attempts'>>,
  ) => void;
}

export const useBipSchedule = create<BipScheduleState>()(
  persist(
    (set) => ({
      posts: [],

      schedule: (text, scheduledFor) => {
        const id = crypto.randomUUID();
        set((state) => ({
          posts: [
            ...state.posts,
            {
              id,
              text,
              scheduledFor,
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
                  // `lastError: undefined` in extra explicitly clears it.
                  ...(extra && 'lastError' in extra ? { lastError: extra.lastError } : {}),
                  ...(extra?.url !== undefined ? { url: extra.url } : {}),
                  ...(extra?.attempts !== undefined ? { attempts: extra.attempts } : {}),
                }
              : p,
          ),
        })),
    }),
    {
      name: 'forze.bipschedule.v1',
      partialize: (state) => ({ posts: state.posts }),
    },
  ),
);
