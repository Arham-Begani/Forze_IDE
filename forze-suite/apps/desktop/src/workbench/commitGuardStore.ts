import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SecretFinding } from '../lib/secretRules';

/** Outcome of the most recent pre-commit security review, surfaced in the SCM
 *  and Security panels. */
export interface ReviewResult {
  /** Epoch ms the review ran. */
  ranAt: number;
  findings: SecretFinding[];
  /** True when at least one `block`-severity finding was present. */
  blocked: boolean;
}

interface CommitGuardState {
  /** Auto-commit: stage + commit automatically once `pending` hits `threshold`. */
  autoCommitEnabled: boolean;
  /** How many saved changes trigger an auto-commit. */
  threshold: number;
  /** Saved changes accumulated since the last commit. */
  pending: number;
  /** Result of the last review (null = none run / nothing to show). */
  lastReview: ReviewResult | null;
  /** An auto-commit is currently in flight. */
  busy: boolean;

  setAutoCommit: (on: boolean) => void;
  setThreshold: (n: number) => void;
  /** Increment the pending counter and return the new value. */
  incrementPending: () => number;
  resetPending: () => void;
  setLastReview: (r: ReviewResult | null) => void;
  setBusy: (b: boolean) => void;
}

export const useCommitGuard = create<CommitGuardState>()(
  persist(
    (set, get) => ({
      autoCommitEnabled: false,
      threshold: 10,
      pending: 0,
      lastReview: null,
      busy: false,

      setAutoCommit: (autoCommitEnabled) => set({ autoCommitEnabled }),
      setThreshold: (n) =>
        set({ threshold: Math.min(100, Math.max(1, Math.round(n) || 1)) }),
      incrementPending: () => {
        const next = get().pending + 1;
        set({ pending: next });
        return next;
      },
      resetPending: () => set({ pending: 0 }),
      setLastReview: (lastReview) => set({ lastReview }),
      setBusy: (busy) => set({ busy }),
    }),
    {
      name: 'forze.commitGuard.v1',
      // Persist the auto-commit toggle, threshold and the running counter (so a
      // reload doesn't silently reset progress toward the next auto-commit).
      // Never persist the transient `busy` flag or the last review payload. The
      // pre-commit security review is always on, so there's no toggle to persist.
      partialize: (s) => ({
        autoCommitEnabled: s.autoCommitEnabled,
        threshold: s.threshold,
        pending: s.pending,
      }),
    },
  ),
);
