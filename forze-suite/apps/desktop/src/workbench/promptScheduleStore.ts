import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StationTarget } from './vibeStationsStore';

/**
 * Queue of prompts scheduled to run on a Vibe Station later. Created from the
 * Forze Assistant ("run X on Claude Code #1 at 9pm") or the Scheduler dock on
 * the Vibe Stations page. The background `promptScheduler` walks this queue
 * and, at each item's time, types the prompt into the target station's
 * coding-agent CLI (auto-opening/starting the station if needed).
 *
 * Two kinds of item share the store:
 *  - one-shot prompts: exactly the text the user wrote, sent once at a time.
 *  - autopilot missions: the user describes a VISION; at every interval the AI
 *    writes the next prompt itself (seeing the vision, what it already sent,
 *    and the station's recent terminal output) until the vision is done or the
 *    run budget is spent. Fully optional — one-shots are untouched.
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

// ---- Autopilot (AI-driven recurring prompts) ------------------------------

export type AutopilotStatus = 'active' | 'paused' | 'done' | 'failed';

/** One prompt the autopilot already sent, kept (bounded) for model context. */
export interface AutopilotStep {
  prompt: string;
  sentAt: number;
}

export interface AutopilotMission {
  id: string;
  target: StationTarget;
  /** The user's vision, in their own words — what the session should achieve. */
  vision: string;
  /** Minutes between AI-written prompts. */
  intervalMin: number;
  /** Safety budget: the mission ends after this many prompts. */
  maxRuns: number;
  runsDone: number;
  status: AutopilotStatus;
  /** Epoch ms the next prompt should be written + sent. */
  nextRunAt: number;
  /** Prompts already sent, newest last (bounded — see HISTORY_LIMIT). */
  history: AutopilotStep[];
  /** Consecutive engine failures; the mission auto-pauses at the cap. */
  consecutiveFailures: number;
  lastError?: string;
  createdAt: number;
  /** When the mission first entered station-prepare — times out auto-spawn. */
  preparingSince?: number;
}

/** How many sent prompts a mission retains (context for the next generation). */
export const HISTORY_LIMIT = 12;
/** Consecutive failures before a mission pauses itself. */
export const FAILURE_PAUSE_THRESHOLD = 3;

export const MIN_INTERVAL_MIN = 1;
export const MAX_INTERVAL_MIN = 720;
export const MIN_MAX_RUNS = 1;
export const MAX_MAX_RUNS = 50;

const clampInterval = (n: number): number =>
  Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, Math.round(n) || MIN_INTERVAL_MIN));
const clampRuns = (n: number): number =>
  Math.min(MAX_MAX_RUNS, Math.max(MIN_MAX_RUNS, Math.round(n) || MIN_MAX_RUNS));

interface PromptScheduleState {
  prompts: ScheduledPrompt[];
  autopilots: AutopilotMission[];

  /** Queue a one-shot prompt. Returns its id. */
  schedule: (target: StationTarget, prompt: string, scheduledFor: number) => string;
  /** Remove a one-shot prompt from the queue (cancel or clear). */
  cancel: (id: string) => void;
  markStatus: (
    id: string,
    next: ScheduledPromptStatus,
    extra?: Partial<Pick<ScheduledPrompt, 'lastError' | 'preparingSince'>>,
  ) => void;

  /** Start an autopilot mission. `startAt` defaults to now. Returns its id. */
  addAutopilot: (
    target: StationTarget,
    vision: string,
    opts?: { intervalMin?: number; maxRuns?: number; startAt?: number },
  ) => string;
  removeAutopilot: (id: string) => void;
  pauseAutopilot: (id: string) => void;
  /** Resume a paused mission; the next prompt fires on the next tick. */
  resumeAutopilot: (id: string) => void;
  /** Engine-internal field patch (preparingSince etc.). */
  patchAutopilot: (id: string, patch: Partial<AutopilotMission>) => void;
  /** Record a successfully sent step: bumps counters, schedules the next run,
   *  completes the mission when the budget is spent. */
  recordAutopilotSent: (id: string, prompt: string, now?: number) => void;
  /** Record an engine failure: retries next interval, pauses at the cap. */
  recordAutopilotFailure: (id: string, error: string, now?: number) => void;
  /** The model judged the vision complete — finish early. */
  markAutopilotDone: (id: string, reason?: string) => void;
}

export const usePromptSchedule = create<PromptScheduleState>()(
  persist(
    (set) => ({
      prompts: [],
      autopilots: [],

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

      addAutopilot: (target, vision, opts = {}) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        set((state) => ({
          autopilots: [
            ...state.autopilots,
            {
              id,
              target,
              vision: vision.trim(),
              intervalMin: clampInterval(opts.intervalMin ?? 10),
              maxRuns: clampRuns(opts.maxRuns ?? 10),
              runsDone: 0,
              status: 'active',
              nextRunAt: Math.max(opts.startAt ?? now, now),
              history: [],
              consecutiveFailures: 0,
              createdAt: now,
            },
          ],
        }));
        return id;
      },

      removeAutopilot: (id) =>
        set((state) => ({ autopilots: state.autopilots.filter((a) => a.id !== id) })),

      pauseAutopilot: (id) =>
        set((state) => ({
          autopilots: state.autopilots.map((a) =>
            a.id === id && a.status === 'active'
              ? { ...a, status: 'paused', preparingSince: undefined }
              : a,
          ),
        })),

      resumeAutopilot: (id) =>
        set((state) => ({
          autopilots: state.autopilots.map((a) =>
            a.id === id && (a.status === 'paused' || a.status === 'failed')
              ? {
                  ...a,
                  status: 'active',
                  nextRunAt: Date.now(),
                  consecutiveFailures: 0,
                  lastError: undefined,
                  preparingSince: undefined,
                }
              : a,
          ),
        })),

      patchAutopilot: (id, patch) =>
        set((state) => ({
          autopilots: state.autopilots.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      recordAutopilotSent: (id, prompt, now = Date.now()) =>
        set((state) => ({
          autopilots: state.autopilots.map((a) => {
            if (a.id !== id) return a;
            const runsDone = a.runsDone + 1;
            const finished = runsDone >= a.maxRuns;
            return {
              ...a,
              runsDone,
              status: finished ? ('done' as AutopilotStatus) : a.status,
              nextRunAt: now + a.intervalMin * 60_000,
              history: [...a.history, { prompt, sentAt: now }].slice(-HISTORY_LIMIT),
              consecutiveFailures: 0,
              lastError: undefined,
              preparingSince: undefined,
            };
          }),
        })),

      recordAutopilotFailure: (id, error, now = Date.now()) =>
        set((state) => ({
          autopilots: state.autopilots.map((a) => {
            if (a.id !== id) return a;
            const consecutiveFailures = a.consecutiveFailures + 1;
            const paused = consecutiveFailures >= FAILURE_PAUSE_THRESHOLD;
            return {
              ...a,
              status: paused ? ('paused' as AutopilotStatus) : a.status,
              consecutiveFailures,
              lastError: error,
              nextRunAt: now + a.intervalMin * 60_000,
              preparingSince: undefined,
            };
          }),
        })),

      markAutopilotDone: (id, reason) =>
        set((state) => ({
          autopilots: state.autopilots.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: 'done',
                  lastError: reason,
                  preparingSince: undefined,
                }
              : a,
          ),
        })),
    }),
    {
      name: 'forze.promptschedule.v1',
      // Older payloads predate `autopilots` — zustand's default shallow merge
      // keeps the current [] when the persisted blob lacks the key, but guard
      // against a corrupted/foreign value explicitly.
      merge: (persisted, current) => {
        const p = (persisted as Partial<PromptScheduleState>) ?? {};
        return {
          ...current,
          ...p,
          prompts: Array.isArray(p.prompts) ? p.prompts : current.prompts,
          autopilots: Array.isArray(p.autopilots) ? p.autopilots : current.autopilots,
        };
      },
    },
  ),
);
