import { describe, expect, it } from 'vitest';
import { costOfEvent, costSummary, formatUsd, priceFor } from './pricing';
import type { UsageEvent } from '../workbench/usageLimitsStore';

const NOW = new Date('2026-07-22T12:00:00').getTime();

function ev(over: Partial<UsageEvent>): UsageEvent {
  return { at: NOW, provider: 'anthropic', module: 'assistant', tokens: 0, ...over };
}

describe('costOfEvent', () => {
  it('prices an input/output split at the exact per-model rates', () => {
    // Opus: $15/M in, $75/M out. 1M in + 1M out = 15 + 75 = $90.
    const c = costOfEvent(
      ev({ model: 'claude-opus-4-7', inputTokens: 1_000_000, outputTokens: 1_000_000, tokens: 2_000_000 }),
    );
    expect(c).toBeCloseTo(90, 6);
  });

  it('blends input/output rates when only a total is known', () => {
    // Haiku: (0.8 + 4)/2 = 2.4 /M. 1M total → $2.40.
    const c = costOfEvent(ev({ model: 'claude-haiku-4-5-20251001', tokens: 1_000_000 }));
    expect(c).toBeCloseTo(2.4, 6);
  });

  it('charges image generation a flat per-image estimate', () => {
    expect(costOfEvent(ev({ module: 'image', tokens: 0 }))).toBeCloseTo(0.039, 6);
  });

  it('falls back to a provider default for an unknown model', () => {
    expect(priceFor(undefined, 'gemini')).toEqual({ input: 2, output: 12 });
  });
});

describe('costSummary', () => {
  it('sums today, groups by module + provider, and skips older days', () => {
    const events: UsageEvent[] = [
      ev({ module: 'assistant', model: 'claude-opus-4-7', inputTokens: 1_000_000, outputTokens: 0, tokens: 1_000_000 }), // $15
      ev({ module: 'agent-manager', model: 'claude-haiku-4-5-20251001', tokens: 1_000_000 }), // $2.40
      ev({ at: NOW - 26 * 3600 * 1000, module: 'assistant', tokens: 1_000_000 }), // yesterday — excluded
    ];
    const s = costSummary(events, NOW);
    expect(s.costToday).toBeCloseTo(17.4, 5);
    expect(s.byModule[0]).toEqual({ module: 'assistant', cost: 15, tokens: 1_000_000 });
    expect(s.byProvider[0]).toEqual({ provider: 'anthropic', cost: 17.4 });
  });
});

describe('formatUsd', () => {
  it('formats zero, sub-cent, sub-dollar, and dollar amounts', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.0012)).toBe('$0.0012');
    expect(formatUsd(0.234)).toBe('$0.234');
    expect(formatUsd(12.5)).toBe('$12.50');
  });
});
