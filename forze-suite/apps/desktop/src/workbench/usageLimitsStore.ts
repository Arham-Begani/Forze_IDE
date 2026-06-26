import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedJSONStorage } from './debouncedStorage';

/**
 * Operator-set guardrails on AI spend.
 *
 * Every text/image call in the app funnels through `lib/ai.ts`, which asks this
 * store for permission *before* hitting a provider and reports the real token
 * cost *after*. That makes this the single brake on how much the Forze
 * Assistant — or any other module (Agent Manager, Commit Guard, deploy heal,
 * Build-in-Public, image generation…) — can burn against the user's API keys.
 *
 * Two kinds of limit:
 *  - a rolling-60s request rate (catches runaway tool loops before they snowball)
 *  - per-calendar-day request and token budgets (caps daily cost; resets at the
 *    local midnight, or on demand from Settings).
 *
 * A limit of 0 means "unlimited" for that dimension. The whole feature can be
 * switched off with `enabled: false`, in which case nothing is ever blocked
 * (usage is still recorded so the meters keep working).
 */

/** A module that consumes the AI providers, for per-source attribution. */
export type UsageModule =
  | 'assistant'
  | 'agent-manager'
  | 'commit-guard'
  | 'deploy-heal'
  | 'build-in-public'
  | 'image'
  | 'other';

/** Human labels for the usage breakdown in Settings. */
export const MODULE_LABELS: Record<UsageModule, string> = {
  assistant: 'Assistant',
  'agent-manager': 'Agent Manager',
  'commit-guard': 'Commit Guard',
  'deploy-heal': 'Deploy heal',
  'build-in-public': 'Build in Public',
  image: 'Image generation',
  other: 'Other',
};

/** One completed provider call, kept for rate/budget accounting. */
export interface UsageEvent {
  /** epoch ms when the call completed. */
  at: number;
  /** provider id, e.g. "gemini" / "anthropic". */
  provider: string;
  module: UsageModule;
  /** total tokens billed (input + output); 0 when the provider reports none. */
  tokens: number;
}

export interface UsageLimits {
  /** Master switch. When false, calls are never blocked. */
  enabled: boolean;
  /** Max provider requests in any rolling 60s window. 0 = unlimited. */
  requestsPerMinute: number;
  /** Max provider requests since local midnight. 0 = unlimited. */
  requestsPerDay: number;
  /** Max total tokens (input + output) since local midnight. 0 = unlimited. */
  tokensPerDay: number;
}

export const DEFAULT_LIMITS: UsageLimits = {
  enabled: true,
  // Generous enough for normal use (incl. a parallel Agent Manager mission) yet
  // low enough that a genuine runaway loop trips the brake within seconds.
  requestsPerMinute: 60,
  requestsPerDay: 2_000,
  tokensPerDay: 5_000_000,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
/** Hard cap on retained events so localStorage can never blow up. */
const MAX_EVENTS = 5_000;

/** Local midnight at or before `now`. */
function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface LimitVerdict {
  ok: boolean;
  /** A user-facing explanation when `ok` is false. */
  reason?: string;
}

export interface UsageSnapshot {
  requestsLastMinute: number;
  requestsToday: number;
  tokensToday: number;
  /** Per-module totals for today, busiest first; only modules with usage. */
  byModule: Array<{ module: UsageModule; requests: number; tokens: number }>;
}

/** Roll up the event log into the numbers the Settings meters render. */
export function summarize(events: UsageEvent[], now: number): UsageSnapshot {
  const minuteAgo = now - MINUTE_MS;
  const dayStart = startOfToday(now);
  let requestsLastMinute = 0;
  let requestsToday = 0;
  let tokensToday = 0;
  const byModule = new Map<UsageModule, { requests: number; tokens: number }>();

  for (const e of events) {
    if (e.at >= minuteAgo) requestsLastMinute++;
    if (e.at >= dayStart) {
      requestsToday++;
      tokensToday += e.tokens;
      const m = byModule.get(e.module) ?? { requests: 0, tokens: 0 };
      m.requests++;
      m.tokens += e.tokens;
      byModule.set(e.module, m);
    }
  }

  return {
    requestsLastMinute,
    requestsToday,
    tokensToday,
    byModule: [...byModule.entries()]
      .map(([module, v]) => ({ module, ...v }))
      .sort((a, b) => b.requests - a.requests),
  };
}

/** Decide whether a new request is allowed under the current limits. */
export function evaluate(
  limits: UsageLimits,
  events: UsageEvent[],
  now: number,
): LimitVerdict {
  if (!limits.enabled) return { ok: true };
  const snap = summarize(events, now);

  if (
    limits.requestsPerMinute > 0 &&
    snap.requestsLastMinute >= limits.requestsPerMinute
  ) {
    return {
      ok: false,
      reason:
        `AI rate limit reached (${limits.requestsPerMinute} requests/minute). ` +
        'Wait a moment, or raise it in Settings → API usage limits.',
    };
  }
  if (limits.requestsPerDay > 0 && snap.requestsToday >= limits.requestsPerDay) {
    return {
      ok: false,
      reason:
        `Daily AI request limit reached (${limits.requestsPerDay}). ` +
        'Raise it or reset today in Settings → API usage limits.',
    };
  }
  if (limits.tokensPerDay > 0 && snap.tokensToday >= limits.tokensPerDay) {
    return {
      ok: false,
      reason:
        `Daily AI token budget reached (${limits.tokensPerDay.toLocaleString()} tokens). ` +
        'Raise it or reset today in Settings → API usage limits.',
    };
  }
  return { ok: true };
}

interface UsageState {
  limits: UsageLimits;
  events: UsageEvent[];
  setLimits: (patch: Partial<UsageLimits>) => void;
  /** Drop today's usage so the daily meters start fresh. */
  resetToday: () => void;
  /** Non-reactive guard called before a provider request fires. */
  checkUsage: () => LimitVerdict;
  /** Non-reactive: record a completed request's real cost. */
  recordUsage: (provider: string, module: UsageModule, tokens: number) => void;
}

export const useUsageLimits = create<UsageState>()(
  persist(
    (set, get) => ({
      limits: DEFAULT_LIMITS,
      events: [],

      setLimits: (patch) =>
        set((state) => ({ limits: { ...state.limits, ...patch } })),

      resetToday: () => {
        const dayStart = startOfToday(Date.now());
        set((state) => ({ events: state.events.filter((e) => e.at < dayStart) }));
      },

      checkUsage: () => evaluate(get().limits, get().events, Date.now()),

      recordUsage: (provider, module, tokens) => {
        const now = Date.now();
        const event: UsageEvent = {
          at: now,
          provider,
          module,
          tokens: Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0,
        };
        // Keep the log bounded: drop anything older than a day, then cap length.
        const cutoff = now - DAY_MS;
        const kept = get().events.filter((e) => e.at >= cutoff);
        kept.push(event);
        set({
          events: kept.length > MAX_EVENTS ? kept.slice(-MAX_EVENTS) : kept,
        });
      },
    }),
    {
      name: 'forze.usageLimits.v1',
      storage: debouncedJSONStorage(),
      // Self-heal older/partial persisted shapes so a missing field can't crash
      // the limit check.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UsageState>;
        return {
          ...current,
          ...p,
          limits: { ...DEFAULT_LIMITS, ...(p.limits ?? {}) },
          events: Array.isArray(p.events) ? p.events : [],
        };
      },
    },
  ),
);
