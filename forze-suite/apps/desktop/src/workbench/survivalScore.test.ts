import { describe, it, expect } from 'vitest';
import { computeSurvivalScore, type SurvivalSignals } from './survivalScore';

const NONE: SurvivalSignals = {
  workspaceOpen: false,
  isGitRepo: false,
  problemsCount: 0,
  dirtyTabsCount: 0,
  hasAgentApiKey: false,
  scheduledPosts: 0,
};

describe('computeSurvivalScore', () => {
  it('returns the baseline of 50 when no signals are present', () => {
    const { score, band, breakdown } = computeSurvivalScore(NONE);
    expect(score).toBe(50);
    expect(band).toBe('shaky');
    expect(breakdown).toEqual([{ label: 'Baseline', delta: 50 }]);
  });

  it('adds positive signals cumulatively', () => {
    const { score } = computeSurvivalScore({
      ...NONE,
      workspaceOpen: true, // +18
      isGitRepo: true, // +12
      hasAgentApiKey: true, // +6
    });
    expect(score).toBe(50 + 18 + 12 + 6);
  });

  it('caps the distribution bonus at 6 regardless of post count', () => {
    const many = computeSurvivalScore({ ...NONE, scheduledPosts: 50 });
    expect(many.score).toBe(56);
    const row = many.breakdown.find((b) => b.label === 'Distribution queued');
    expect(row?.delta).toBe(6);
  });

  it('caps the open-problems penalty at 28', () => {
    const { score, breakdown } = computeSurvivalScore({ ...NONE, problemsCount: 100 });
    expect(score).toBe(50 - 28);
    expect(breakdown).toContainEqual({ label: 'Open problems', delta: -28 });
  });

  it('caps the unsaved-buffer penalty at 12', () => {
    const { score } = computeSurvivalScore({ ...NONE, dirtyTabsCount: 100 });
    expect(score).toBe(50 - 12);
  });

  it('clamps the final score between 0 and 100', () => {
    const floor = computeSurvivalScore({
      ...NONE,
      problemsCount: 100,
      dirtyTabsCount: 100,
    });
    expect(floor.score).toBeGreaterThanOrEqual(0);

    const ceil = computeSurvivalScore({
      workspaceOpen: true,
      isGitRepo: true,
      hasAgentApiKey: true,
      scheduledPosts: 10,
      problemsCount: 0,
      dirtyTabsCount: 0,
    });
    expect(ceil.score).toBeLessThanOrEqual(100);
  });

  it('maps scores to the right bands', () => {
    expect(computeSurvivalScore({ ...NONE, problemsCount: 100 }).band).toBe('critical'); // 22
    expect(computeSurvivalScore(NONE).band).toBe('shaky'); // 50
    const steady = computeSurvivalScore({ ...NONE, workspaceOpen: true }); // 68
    expect(steady.score).toBe(68);
    expect(steady.band).toBe('steady');
  });

  it('treats 80 as strong (inclusive boundary)', () => {
    const r = computeSurvivalScore({ ...NONE, workspaceOpen: true, isGitRepo: true });
    expect(r.score).toBe(80);
    expect(r.band).toBe('strong');
  });
});
