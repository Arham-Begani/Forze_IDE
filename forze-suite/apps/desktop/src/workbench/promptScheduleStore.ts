import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StationTarget } from './vibeStationsStore';

/**
 * Queue of prompts scheduled to run on a Vibe Station later. Created from the
 * Forze Assistant ("run X on Claude Code #1 at 9pm") or the manual form on the
 * Vibe Stations page. The background `promptScheduler` walks this queue and, at
 * each item's time, types the prompt into the target station's coding-agent CLI
 * (auto-opening/starting the station if needed).
 *
 * Mirrors the build-in-public scheduler (`bipScheduleStore`): a flat persisted
 * list + status transitions driven by a single global tick.
 */

export type ScheduledPromptStatus =
  | 'queued' // waiting for its time
  | 'preparing' // due; ensuring the target station is open & ready
  | 'delivering' // writing to the pty
  | 'done'
  | 'failed';

export interface ScheduledPrompt {
  id: string;
  /** Logical station address ("Claude Code #1"), resolved at delivery time. */
  target: StationTarget;
  /** The prompt text typed into the agent CLI (a trailing Enter is added on send). */
  prompt: string;
  /** Epoch ms the prompt should fire. */
  scheduledFor: number;
  status: ScheduledPromptStatus;
  createdAt: number;
  /** When the item first entered `preparing` — used to time out auto-spawn. */
  preparingSince?: number;
  lastError?: string;
}

interface PromptScheduleState {
  prompts: ScheduledPrompt[];

  /** Queue a prompt. Returns its id. */
  schedule: (target: StationTarget, prompt: string, scheduledFor: number) => string;
  /** Remove a prompt from the queue (cancel or clear). */
  cancel: (id: string) => void;
  markStatus: (
    id: string,
    next: ScheduledPromptStatus,
    extra?: Partial<Pick<ScheduledPrompt, 'lastError' | 'preparingSince'>>,
  ) => void;
}

export const usePromptSchedule = create<PromptScheduleState>()(
  persist(
    (set) => ({
      prompts: [],

      schedule: (target, prompt, scheduledFor) => {
        const id = crypto.randomUUID();
        set((state) => ({
          prompts: [
            ...state.prompts,
            {
              id,
              target,
              prompt,
              scheduledFor,
              status: 'queued',
              createdAt: Date.now(),
            },
          ],
        }));
        return id;
      },

      cancel: (id) =>
        set((state) => ({ prompts: state.prompts.filter((p) => p.id !== id) })),

      markStatus: (id, next, extra) =>
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id
              ? {
                  ...p,
                  status: next,
                  // `lastError: undefined` in extra explicitly clears it.
                  ...(extra && 'lastError' in extra ? { lastError: extra.lastError } : {}),
                  ...(extra && 'preparingSince' in extra
                    ? { preparingSince: extra.preparingSince }
                    : {}),
                }
              : p,
          ),
        })),
    }),
    { name: 'forze.promptschedule.v1' },
  ),
);
