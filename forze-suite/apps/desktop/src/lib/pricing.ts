/**
 * Turn recorded token usage into an estimated dollar cost for the Burn Meter.
 *
 * The usage store records every provider call (see `usageLimitsStore`); this
 * module prices those events. It deliberately does NOT import the store at
 * runtime (only its types), so there's no import cycle — the store stays unaware
 * of pricing and the UI composes the two.
 *
 * Prices are $ per 1,000,000 tokens and are ESTIMATES — provider list prices
 * shift, and per-request discounts (caching, batch) aren't modelled. They live
 * here so they're trivial to update in one place.
 */
import type { UsageEvent, UsageModule } from '../workbench/usageLimitsStore';

export interface ModelPrice {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

/** Per-model list-price estimates (USD / 1M tokens). Edit here when they move. */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
};

/** Used when a call's model isn't in the table — a sane per-provider default. */
const PROVIDER_FALLBACK: Record<string, ModelPrice> = {
  gemini: { input: 2, output: 12 },
  anthropic: { input: 3, output: 15 },
};

/** Flat per-image estimate — Gemini's image endpoint reports no token usage. */
const IMAGE_UNIT_COST = 0.039;

export function priceFor(model?: string, provider?: string): ModelPrice {
  if (model && MODEL_PRICES[model]) return MODEL_PRICES[model]!;
  if (provider && PROVIDER_FALLBACK[provider]) return PROVIDER_FALLBACK[provider]!;
  return { input: 2, output: 10 };
}

/** Minimal shape the cost math needs — a subset of UsageEvent. */
type CostableEvent = Pick<
  UsageEvent,
  'module' | 'provider' | 'tokens' | 'model' | 'inputTokens' | 'outputTokens'
>;

/** Estimated USD cost of a single recorded call. */
export function costOfEvent(e: CostableEvent): number {
  if (e.module === 'image') return IMAGE_UNIT_COST;
  const p = priceFor(e.model, e.provider);
  const inTok = e.inputTokens ?? 0;
  const outTok = e.outputTokens ?? 0;
  if (inTok > 0 || outTok > 0) {
    return (inTok * p.input + outTok * p.output) / 1_000_000;
  }
  // Only a total is known — blend at the mean of the input/output rates.
  return (e.tokens * ((p.input + p.output) / 2)) / 1_000_000;
}

/** Local midnight at or before `now` (matches the store's daily boundary). */
function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface CostSummary {
  /** Total estimated USD since local midnight. */
  costToday: number;
  /** Per-module estimated cost today, most-expensive first. */
  byModule: Array<{ module: UsageModule; cost: number; tokens: number }>;
  /** Per-provider estimated cost today. */
  byProvider: Array<{ provider: string; cost: number }>;
}

/** Roll today's events into the numbers the Burn Meter renders. */
export function costSummary(events: UsageEvent[], now: number): CostSummary {
  const dayStart = startOfToday(now);
  const modules = new Map<UsageModule, { cost: number; tokens: number }>();
  const providers = new Map<string, number>();
  let costToday = 0;

  for (const e of events) {
    if (e.at < dayStart) continue;
    const c = costOfEvent(e);
    costToday += c;
    const m = modules.get(e.module) ?? { cost: 0, tokens: 0 };
    m.cost += c;
    m.tokens += e.tokens;
    modules.set(e.module, m);
    providers.set(e.provider, (providers.get(e.provider) ?? 0) + c);
  }

  return {
    costToday,
    byModule: [...modules.entries()]
      .map(([module, v]) => ({ module, ...v }))
      .sort((a, b) => b.cost - a.cost),
    byProvider: [...providers.entries()]
      .map(([provider, cost]) => ({ provider, cost }))
      .sort((a, b) => b.cost - a.cost),
  };
}

/** Compact USD formatting: cents by default, more precision for sub-cent sums. */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
