import { describe, it, expect } from 'vitest';
import {
  summarize,
  evaluate,
  type UsageEvent,
  type UsageLimits,
} from './usageLimitsStore';

// Fixed local noon so "today" (local midnight → now) deterministically contains
// the sub-hour events below, regardless of the wall clock when tests run.
const NOW = new Date('2026-06-26T12:00:00').getTime();

function ev(
  secondsAgo: number,
  tokens = 100,
  module: UsageEvent['module'] = 'assistant',
): UsageEvent {
  return { at: NOW - secondsAgo * 1000, provider: 'gemini', module, tokens };
}

const limits = (over: Partial<UsageLimits> = {}): UsageLimits => ({
  enabled: true,
  requestsPerMinute: 0,
  requestsPerDay: 0,
  tokensPerDay: 0,
  ...over,
});

describe('summarize', () => {
  it('splits last-minute vs today and rolls up per module', () => {
    const events: UsageEvent[] = [
      ev(10, 100, 'assistant'), // last minute + today
      ev(30, 200, 'assistant'), // last minute + today
      ev(120, 50, 'agent-manager'), // today, older than a minute
      { at: NOW - 13 * 3600 * 1000, provider: 'gemini', module: 'assistant', tokens: 999 }, // yesterday
    ];
    const snap = summarize(events, NOW);

    expect(snap.requestsLastMinute).toBe(2);
    expect(snap.requestsToday).toBe(3);
    expect(snap.tokensToday).toBe(350);
    // Busiest module first.
    expect(snap.byModule[0]).toEqual({ module: 'assistant', requests: 2, tokens: 300 });
    expect(snap.byModule[1]).toEqual({ module: 'agent-manager', requests: 1, tokens: 50 });
  });
});

describe('evaluate', () => {
  it('allows everything when disabled, even far over budget', () => {
    const events = Array.from({ length: 50 }, () => ev(5, 10_000));
    expect(evaluate(limits({ enabled: false, requestsPerMinute: 1 }), events, NOW).ok).toBe(true);
  });

  it('blocks once the per-minute request rate is hit', () => {
    const events = [ev(5), ev(10)];
    const v = evaluate(limits({ requestsPerMinute: 2 }), events, NOW);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/requests\/minute/);
  });

  it('blocks once the daily token budget is reached', () => {
    const events = [ev(5, 200), ev(30, 200)]; // 400 tokens today
    const v = evaluate(limits({ tokensPerDay: 300 }), events, NOW);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/token budget/);
  });

  it('treats 0 as unlimited for that dimension', () => {
    const events = Array.from({ length: 100 }, () => ev(5));
    // requestsPerMinute 0 → unlimited; only the daily cap (high) applies.
    expect(evaluate(limits({ requestsPerMinute: 0, requestsPerDay: 1000 }), events, NOW).ok).toBe(
      true,
    );
  });

  it('passes when comfortably under every limit', () => {
    const events = [ev(5, 100), ev(30, 100)];
    expect(
      evaluate(limits({ requestsPerMinute: 60, requestsPerDay: 2000, tokensPerDay: 5_000_000 }), events, NOW).ok,
    ).toBe(true);
  });
});
