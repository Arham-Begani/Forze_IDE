/**
 * Venture Survival Score — derived from observable founder-project signals
 * rather than a fixed RNG. The score is best understood as a vibe-check, not
 * a precise valuation. Phase 7+ can layer in real lighthouse/a11y/security
 * scan results to make it stronger.
 */

export interface SurvivalSignals {
  workspaceOpen: boolean;
  isGitRepo: boolean;
  problemsCount: number;
  dirtyTabsCount: number;
  hasAgentApiKey: boolean;
  scheduledPosts: number;
}

export interface SurvivalScore {
  score: number;
  band: 'critical' | 'shaky' | 'steady' | 'strong';
  breakdown: { label: string; delta: number }[];
}

export function computeSurvivalScore(signals: SurvivalSignals): SurvivalScore {
  const breakdown: { label: string; delta: number }[] = [];
  let score = 50;
  breakdown.push({ label: 'Baseline', delta: 50 });

  if (signals.workspaceOpen) {
    breakdown.push({ label: 'Workspace open', delta: 18 });
    score += 18;
  }
  if (signals.isGitRepo) {
    breakdown.push({ label: 'Under version control', delta: 12 });
    score += 12;
  }
  if (signals.hasAgentApiKey) {
    breakdown.push({ label: 'Agent wired up', delta: 6 });
    score += 6;
  }
  if (signals.scheduledPosts > 0) {
    breakdown.push({
      label: 'Distribution queued',
      delta: Math.min(6, signals.scheduledPosts * 2),
    });
    score += Math.min(6, signals.scheduledPosts * 2);
  }

  const problemPenalty = Math.min(28, signals.problemsCount * 2);
  if (problemPenalty > 0) {
    breakdown.push({ label: 'Open problems', delta: -problemPenalty });
    score -= problemPenalty;
  }

  const dirtyPenalty = Math.min(12, signals.dirtyTabsCount * 3);
  if (dirtyPenalty > 0) {
    breakdown.push({ label: 'Unsaved buffers', delta: -dirtyPenalty });
    score -= dirtyPenalty;
  }

  score = Math.max(0, Math.min(100, score));
  const band =
    score >= 80 ? 'strong' : score >= 60 ? 'steady' : score >= 40 ? 'shaky' : 'critical';

  return { score, band, breakdown };
}
