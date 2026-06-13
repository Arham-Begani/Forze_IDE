/**
 * Commit Guard — the logic behind Source Control's auto-commit and the
 * always-on pre-commit security review:
 *
 *  1. Auto-commit (opt-in toggle): `noteChange()` is called on every saved
 *     change. Once the pending counter reaches the threshold it stages
 *     everything, runs the security review, writes a commit message (AI when a
 *     provider is ready, deterministic otherwise) and commits.
 *
 *  2. Security review (always on): `guardedCommit()` wraps *every* commit
 *     (manual ones from the SCM panel and auto ones alike). It scans the
 *     newly-added lines of the staged diff and refuses to commit when a
 *     high-confidence secret is found. It's a local, instant safety gate with
 *     no toggle — you can't accidentally turn off secret protection.
 *
 * These are plain functions (not hooks) driven off `getState()` so they can run
 * from anywhere — the save action, the SCM panel, a command.
 */
import { aiReady, generateText } from '../lib/ai';
import {
  commit as gitCommit,
  diffStaged,
  stageAll,
  status as gitStatus,
  type GitStatusReport,
} from '../lib/git';
import { scanDiff, partitionFindings } from '../lib/diffScan';
import type { SecretFinding } from '../lib/secretRules';
import { toast } from '../shell/toast';
import { useCommitGuard, type ReviewResult } from './commitGuardStore';
import { useGitStatus } from './gitStatusStore';
import { useProject } from './projectStore';
import { useWorkbench } from './store';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Whether we've already surfaced the *current* secret block. An auto-commit
 * that's paused by a secret keeps its `pending` counter so the very next save
 * retries — but without this latch every one of those retries would re-toast
 * and yank the user back to the Security panel. We notify once on the leading
 * edge and clear the latch the moment a review comes back clean or a commit
 * lands (both happen inside `review()` / the success paths below).
 */
let blockNoticeShown = false;

/** Run the security review over a staged diff, store it, and return the result. */
function review(diff: string): ReviewResult {
  const findings = scanDiff(diff);
  const { blockers } = partitionFindings(findings);
  const result: ReviewResult = {
    ranAt: Date.now(),
    findings,
    blocked: blockers.length > 0,
  };
  // A clean (non-blocking) review means whatever secret previously paused an
  // auto-commit is gone — reset the latch so the next block notifies again.
  if (!result.blocked) blockNoticeShown = false;
  // Always record it (even when clean) so the SCM/Security panels can show a
  // "last review: clean" state, not just failures.
  useCommitGuard.getState().setLastReview(result);
  return result;
}

/** Fetch the staged diff and run the security review, returning its findings.
 *  Used by the "Review staged" buttons in the SCM and Security panels. */
export async function reviewStaged(cwd: string): Promise<SecretFinding[]> {
  const diff = await diffStaged(cwd);
  return review(diff).findings;
}

export interface GuardOutcome {
  committed: boolean;
  /** True when the security review stopped the commit. */
  blocked: boolean;
  hash?: string;
  findings: SecretFinding[];
  message?: string;
}

/**
 * Commit `cwd` with `message` through the always-on security review. The caller
 * is responsible for having staged what should be committed. Pass
 * `prefetchedDiff` to avoid re-running `git diff --cached`.
 */
export async function guardedCommit(
  cwd: string,
  message: string,
  prefetchedDiff?: string,
): Promise<GuardOutcome> {
  const guard = useCommitGuard.getState();

  const diff = prefetchedDiff ?? (await diffStaged(cwd));
  const result = review(diff);
  if (result.blocked) {
    const { blockers } = partitionFindings(result.findings);
    return {
      committed: false,
      blocked: true,
      findings: result.findings,
      message: `${blockers.length} secret${blockers.length > 1 ? 's' : ''} detected — commit blocked.`,
    };
  }
  const hash = await gitCommit(cwd, message);
  guard.resetPending(); // a commit happened — restart the auto-commit countdown
  return { committed: true, blocked: false, hash, findings: result.findings };
}

/**
 * Record one saved change. When auto-commit is on and the counter reaches the
 * threshold, fire an auto-commit. A no-op outside a git repo.
 */
export async function noteChange(): Promise<void> {
  if (!useProject.getState().isGitRepo) return;
  const guard = useCommitGuard.getState();
  const next = guard.incrementPending();
  if (guard.autoCommitEnabled && !guard.busy && next >= guard.threshold) {
    await autoCommit();
  }
}

/** A single auto-commit guard so overlapping saves can't double-fire. */
let autoCommitInFlight = false;

/**
 * Stage everything, review it, and commit. Used by `noteChange` and reachable
 * from a command. Leaves the pending counter untouched on a security block so a
 * later save retries once the secret is removed.
 */
export async function autoCommit(): Promise<void> {
  if (autoCommitInFlight) return;
  const { workspaceRoot, isGitRepo } = useProject.getState();
  if (!workspaceRoot || !isGitRepo) return;

  autoCommitInFlight = true;
  const guard = useCommitGuard.getState();
  guard.setBusy(true);
  try {
    await stageAll(workspaceRoot);
    const diff = await diffStaged(workspaceRoot);
    if (!diff.trim()) {
      // Saves that didn't change anything git can see — nothing to commit.
      guard.resetPending();
      return;
    }

    // Review first (local + instant) so we never spend an AI call on a diff
    // we're about to reject. The secret gate is always on.
    const result = review(diff);
    if (result.blocked) {
      const { blockers } = partitionFindings(result.findings);
      // Notify once on the leading edge — keep `pending` so the next save
      // retries automatically the moment the secret is removed, but don't
      // re-toast / re-navigate on every save while it's still there.
      if (!blockNoticeShown) {
        blockNoticeShown = true;
        toast(
          `Auto-commit paused — ${blockers.length} secret${blockers.length > 1 ? 's' : ''} detected. See Security.`,
          'error',
        );
        useWorkbench.getState().setActiveActivity('security');
      }
      return; // keep `pending` so the next save retries
    }

    const report = await gitStatus(workspaceRoot).catch(() => null);
    const message = await buildMessage(diff, report);
    const hash = await gitCommit(workspaceRoot, message);
    guard.resetPending();
    toast(`Auto-committed · ${shortHash(hash)} · ${message}`, 'success');
  } catch (err) {
    toast(`Auto-commit failed: ${errMessage(err)}`, 'error');
  } finally {
    guard.setBusy(false);
    autoCommitInFlight = false;
    void useGitStatus.getState().refresh();
  }
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

/** A deterministic, always-available checkpoint message. */
function fallbackMessage(report: GitStatusReport | null): string {
  const n = report?.entries.length ?? 0;
  return `chore: checkpoint ${n || 'pending'} file${n === 1 ? '' : 's'}`;
}

/**
 * Draft a one-line commit subject. Prefers an AI summary of the diff (the
 * keyless Gemini provider makes this work out of the box); falls back to a
 * deterministic checkpoint line if no provider is ready or the call fails.
 * Best-effort by design — a flaky model must never block an auto-commit.
 */
async function buildMessage(
  diff: string,
  report: GitStatusReport | null,
): Promise<string> {
  const fallback = fallbackMessage(report);
  if (!aiReady()) return fallback;
  try {
    const subject = await generateText(
      `Summarise this staged git diff as a single Conventional Commits subject ` +
        `line (e.g. "feat: ...", "fix: ...", "chore: ..."). Max 70 characters, ` +
        `imperative mood, no body, no quotes, no trailing period.\n\n` +
        diff.slice(0, 6000),
      {
        system: 'You output only the commit subject line and nothing else.',
        maxTokens: 40,
      },
    );
    const line = subject.split('\n')[0]?.replace(/^["'`]+|["'`]+$/g, '').trim() ?? '';
    return line.length >= 6 ? line.slice(0, 100) : fallback;
  } catch {
    return fallback;
  }
}
